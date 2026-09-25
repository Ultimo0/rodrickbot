/**
 * Service principal de l'agent IA.
 *
 * Ce module orchestre les intentions proposées par Groq, la mémoire par
 * utilisateur, et les outils existants pour produire une réponse utile sans
 * casser le moteur historique de commandes du bot.
 */

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { askGroq, requestGroqJson, GROQ_CHAT_URL } from '../utils/groq.js';
import {
  appendSessionMessage,
  checkAndRecordAgentCall,
  getSession,
  isAgentEnabled,
  setAgentEnabled,
} from './sessionMemory.js';
import { buildConversationContext } from './contextBuilder.js';
import { executeTool, getIntentToolNames } from './toolRegistry.js';
import { invokeExistingCommand, BRIDGE_ALLOWED_COMMANDS } from './commandBridge.js';
import { getMediaType, getQuotedInfo } from '../utils/quotedContent.js';
import { extractYoutubeUrl } from '../utils/youtube.js';
import { extractTikTokUrl } from '../utils/tiktok.js';

const INTENT_MODEL = config.groqModel || 'openai/gpt-oss-120b';

// Liste des tools que le classifieur Groq est autorisé à choisir. Générée
// dynamiquement depuis le registre réel (toolRegistry.js::getIntentToolNames)
// au lieu d'être recopiée à la main : plus aucun risque de désynchronisation
// entre les noms proposés au classifieur IA et les noms réellement
// enregistrés (voir l'historique du bug avec 'rewrite_professional',
// 'translate'/'translate_text', 'ocr_image'/'ocr').
const INTENT_TOOL_NAMES = getIntentToolNames();

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function inferLocalIntent(msg, text) {
  const normalized = normalizeText(text);
  const quoted = getQuotedInfo(msg);
  const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;
  const directType = msg?.message?.imageMessage ? 'image' : msg?.message?.videoMessage ? 'video' : null;
  const hasMediaContext = Boolean(directType || quotedType);
  const wantsSticker = /(sticker|stiker)/.test(normalized) && /(transforme|converti|cr[eé]e|fais|met|donne)/.test(normalized);
  const wantsDownload = /(telecharge|t[eé]l[eé]charge|download)/.test(normalized) && /(video|mp4|vid[eé]o|audio|mp3|musique)/.test(normalized);
  const wantsProRewrite = /(r[eé][eé]cris|rewrite|reformule|professionnel)/.test(normalized);
  
  if (hasMediaContext && wantsSticker) {
    return { intent: 'general', tool: 'sticker' };
  }

  if (wantsDownload) {
    return { intent: 'general', tool: 'download' };
  }

  if (wantsProRewrite) {
    return { intent: 'general', tool: 'rewrite_professional' };
  }
  
  return null;
}

function inferDownloadFormat(text) {
  const normalized = normalizeText(text);
  if (/(video|mp4|vid[eé]o)/.test(normalized)) {
    return 'video';
  }
  if (/(audio|mp3|musique|song)/.test(normalized)) {
    return 'audio';
  }
  return 'audio';
}

function extractDownloadUrl(text) {
  return extractYoutubeUrl(text) || extractTikTokUrl(text) || text;
}

// Construit les arguments réellement attendus par chaque outil, plutôt
// qu'un seul objet fourre-tout (city/query/url/format identiques pour
// tous les tools) envoyé indistinctement à executeTool(). Chaque branche
// ne fournit que les champs pertinents pour l'outil ciblé, ce qui évite
// qu'un futur changement dans un outil (ex: un fallback interne sur un
// champ générique comme `text`) ne déclenche un comportement fantôme
// hérité d'un autre outil.
function buildToolArgs(toolName, text, intent) {
  const base = { text, question: text };

  switch (toolName) {
    case 'weather':
      return { ...base, city: text, lang: intent.language };
    case 'search':
      return { ...base, query: text };
    case 'download':
      return { ...base, url: extractDownloadUrl(text), format: inferDownloadFormat(text) };
    case 'play':
      return { ...base, url: extractDownloadUrl(text), mode: inferDownloadFormat(text) === 'video' ? 'video' : 'audio' };
    case 'tts':
      return { ...base, language: intent.language };
    case 'translate_text':
      // Outil de traitement de texte : `text` n'est PAS transmis (voir
      // commentaire dans runAgentTurn), seule la résolution automatique
      // (message cité/mémoire) doit fournir le texte à traduire.
      return { targetLanguage: intent.language };
    case 'summarize_text':
      return { size: intent.size };
    case 'correct_text':
    case 'rewrite_professional':
      return {};
    case 'sticker':
    case 'ocr':
      // sticker/ocr n'ont besoin que du contexte média (msg/sock/chatId),
      // injecté séparément par executeTool(name, args, context).
      return {};
    case 'bot_info':
      return { ...base, query: text };
    case 'ask_general':
    default:
      return base;
  }
}

function sendToolResult(sock, chatId, msg, result) {
  if (typeof result === 'string') {
    return sock.sendMessage(chatId, { text: result }, { quoted: msg });
  }

  if (Buffer.isBuffer(result)) {
    return sock.sendMessage(chatId, { audio: result, mimetype: 'audio/mpeg', fileName: 'tts.mp3' }, { quoted: msg });
  }

  if (result?.buffer && result?.type === 'audio') {
    return sock.sendMessage(
      chatId,
      { audio: result.buffer, mimetype: result.mimeType || 'audio/mpeg', fileName: `${(result.title || 'audio').replace(/\s+/g, '-')}.mp3` },
      { quoted: msg }
    );
  }

  if (result?.buffer && result?.type === 'video') {
    return sock.sendMessage(
      chatId,
      { video: result.buffer, mimetype: result.mimeType || 'video/mp4', caption: result.title || '' },
      { quoted: msg }
    );
  }

  if (result?.buffer && result?.type === 'sticker') {
    return sock.sendMessage(chatId, { sticker: result.buffer }, { quoted: msg });
  }

  if (Array.isArray(result)) {
    return sock.sendMessage(chatId, { text: result.join('\n') }, { quoted: msg });
  }

  if (result && typeof result === 'object') {
    const summary = [
      `Météo${result.city ? ` à ${result.city}` : ''}:`,
      `Condition: ${result.condition || 'inconnue'}`,
      `Température: ${result.tempC ?? 'n/a'}°C`,
      `Ressenti: ${result.feelsLikeC ?? 'n/a'}°C`,
      `Humidité: ${result.humidity ?? 'n/a'}%`,
      `Vent: ${result.windKph ?? 'n/a'} km/h`,
    ].join('\n');
    return sock.sendMessage(chatId, { text: summary }, { quoted: msg });
  }

  return sock.sendMessage(chatId, { text: String(result || 'Réponse vide.') }, { quoted: msg });
}

export async function detectIntent(text, contextPrompt, msg = null) {
  const localIntent = inferLocalIntent(msg, text);
  if (localIntent) {
    return localIntent;
  }

  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante dans .env.');
  }

  try {
    // Réutilise le même client Groq (retry/backoff sur 429 + timeout
    // réseau) que askGroq/correctText/etc. — auparavant ce fetch était
    // dupliqué ici, sans aucun retry ni timeout propre à la détection
    // d'intention.
    //
    // L'énumération inclut aussi BRIDGE_ALLOWED_COMMANDS : sans ça, le pont
    // vers les commandes historiques (menu/help/agent/setup...) documenté
    // dans README.md n'était en réalité jamais atteignable, ni via Groq
    // (qui ne les proposait pas), ni via inferLocalIntent() (qui ne les
    // détecte pas) — corrigé ici.
    const allIntentToolNames = [...INTENT_TOOL_NAMES, ...BRIDGE_ALLOWED_COMMANDS];
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: INTENT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            `Tu classifies les demandes d’un assistant WhatsApp. Réponds uniquement avec un JSON strict: {"intent":"chat|summary|translation|correction|ocr|general","tool":"${allIntentToolNames.join('|')}|null","language":"...","size":"court|moyen|détaillé"}.`,
        },
        {
          role: 'user',
          content: `${contextPrompt}\n\nDemande utilisateur: ${text}`,
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('Aucune intention renvoyée par Groq.');
    }

    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Réponse JSON invalide pour l’intention: ${err.message}`);
    }
  } catch (err) {
    if (/429|rate limit|rate_limited/i.test(err.message)) {
      logger.warn({ err }, 'Rate limit sur la détection d’intention : passage en fallback local');
      return { intent: 'general', tool: 'ask_general' };
    }
    throw err;
  }
}

export async function runAgentTurn(sock, msg, chatId, sender, text, commands = new Map()) {
  if (!text?.trim()) return false;

  const session = getSession(chatId, sender);
  if (!session?.enabled) {
    return false;
  }

  // Limite de débit des appels IA de l'agent : évite qu'un utilisateur ne
  // multiplie les appels Groq payants en spammant le chat en mode agent
  // (middlewares/antiSpam.js ne couvre pas ce chemin, réservé aux commandes
  // préfixées).
  if (!checkAndRecordAgentCall(chatId, sender)) {
    await sock.sendMessage(
      chatId,
      { text: '⏳ Trop de messages envoyés à l’agent en peu de temps. Réessaie dans une minute.' },
      { quoted: msg }
    );
    return true;
  }

  const context = buildConversationContext(chatId, sender, text);
  const intent = await detectIntent(text, context.prompt, msg).catch((err) => {
    logger.warn({ err }, 'Erreur détection d’intention IA');
    return { intent: 'general', tool: 'ask_general' };
  });

  try {
    let result = '';
    // Défense en profondeur : même si detectIntent() renvoie un nom de tool
    // qui n'est ni dans la liste que voit le classifieur IA (INTENT_TOOL_NAMES)
    // ni dans les commandes pontables, on l'ignore plutôt que de tenter de
    // l'exécuter — ça bloque net un tool interne comme `debug_message` (voir
    // toolRegistry.js) même en cas d'hallucination du modèle.
    const isKnownTool = intent.tool && (INTENT_TOOL_NAMES.includes(intent.tool) || BRIDGE_ALLOWED_COMMANDS.includes(intent.tool));

    if (intent.tool && intent.tool !== 'null' && !isKnownTool) {
      logger.warn(`Tool non autorisé ignoré (hors liste blanche) : ${intent.tool}`);
    }

    if (isKnownTool) {
      // Pour les outils de traitement de texte (traduction, correction,
      // résumé, réécriture), `text` est l'instruction tapée par
      // l'utilisateur (ex: "Traduire en anglais"), pas le contenu à
      // traiter — on ne la transmet PAS comme `text` de l'outil, sinon
      // celui-ci traduirait/corrigerait/résumerait littéralement
      // l'instruction au lieu d'aller chercher le message cité (reply)
      // via resolveTextSource(). Les autres outils (ask_general, search,
      // weather...) continuent de recevoir `text` normalement.
      const toolArgs = buildToolArgs(intent.tool, text, intent);

      const commandCandidate = intent.tool;
      if (BRIDGE_ALLOWED_COMMANDS.includes(commandCandidate)) {
        const handled = await invokeExistingCommand(commandCandidate, {
          sock,
          msg,
          chatId,
          sender,
          args: text.split(/\s+/).slice(1),
          commands,
        }).catch(() => false);
        if (handled) {
          appendSessionMessage(chatId, sender, 'user', text);
          appendSessionMessage(chatId, sender, 'assistant', '[commande historique exécutée via bridge Agent]');
          return true;
        }
      }

      // `commands` est ajouté au contexte (en plus de sock/msg/chatId/sender)
      // uniquement pour que bot_info puisse lire les métadonnées des
      // commandes déjà chargées — aucun autre outil n'en a besoin, et
      // aucun outil n'a par ailleurs accès aux fichiers sources eux-mêmes.
      result = await executeTool(intent.tool, toolArgs, { sock, msg, chatId, sender, commands });
    } else {
      result = await askGroq(text);
    }

    if (!result || !(typeof result === 'string' ? String(result).trim() : true)) {
      throw new Error('Réponse IA vide.');
    }

    await sendToolResult(sock, chatId, msg, result);
    appendSessionMessage(chatId, sender, 'user', text);
    appendSessionMessage(
      chatId,
      sender,
      'assistant',
      typeof result === 'string' ? result : JSON.stringify(result)
    );
    return true;
  } catch (err) {
    logger.warn({ err }, 'Erreur pendant l’exécution d’un tour Agent IA');
    await sock.sendMessage(chatId, {
      text: `> ❌ L’agent a rencontré une erreur : ${err.message}`,
    }, { quoted: msg });
    return true;
  }
}

export function enableAgentForSession(chatId, sender) {
  setAgentEnabled(chatId, sender, true);
}

export function disableAgentForSession(chatId, sender) {
  setAgentEnabled(chatId, sender, false);
}

export function isAgentSessionEnabled(chatId, sender) {
  return isAgentEnabled(chatId, sender);
}
