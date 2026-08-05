/**
 * Service principal de l'agent IA.
 *
 * Ce module orchestre les intentions proposées par Mistral, la mémoire par
 * utilisateur, et les outils existants pour produire une réponse utile sans
 * casser le moteur historique de commandes du bot.
 */

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { askMistral } from '../utils/mistral.js';
import { appendSessionMessage, getSession, isAgentEnabled, setAgentEnabled } from './sessionMemory.js';
import { buildConversationContext } from './contextBuilder.js';
import { executeTool } from './toolRegistry.js';
import { invokeExistingCommand } from './commandBridge.js';
import { getMediaType, getQuotedInfo } from '../utils/quotedContent.js';
import { extractYoutubeUrl } from '../utils/youtube.js';
import { extractTikTokUrl } from '../utils/tiktok.js';

const INTENT_MODEL = config.mistralModel || 'mistral-small-latest';

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

  if (!config.mistralApiKey) {
    throw new Error('Clé API Mistral manquante dans .env.');
  }

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.mistralApiKey}`,
      },
      body: JSON.stringify({
        model: INTENT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'Tu classifies les demandes d’un assistant WhatsApp. Réponds uniquement avec un JSON strict: {"intent":"chat|summary|translation|correction|ocr|general","tool":"play|sticker|ocr|translate|download|weather|search|tts|ask_general|summarize_text|correct_text|translate_text|ocr_image|null","language":"...","size":"court|moyen|détaillé"}.',
          },
          {
            role: 'user',
            content: `${contextPrompt}\n\nDemande utilisateur: ${text}`,
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Erreur détection d’intention (${res.status}) ${errText}`.trim());
    }

    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) {
      throw new Error('Aucune intention renvoyée par Mistral.');
    }

    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Réponse JSON invalide pour l’intention: ${err.message}`);
    }
  } catch (err) {
    if (/429|rate limit|rate_limited|1300/i.test(err.message)) {
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

  const context = buildConversationContext(chatId, sender, text);
  const intent = await detectIntent(text, context.prompt, msg).catch((err) => {
    logger.warn({ err }, 'Erreur détection d’intention IA');
    return { intent: 'general', tool: 'ask_general' };
  });

  try {
    let result = '';
    if (intent.tool && intent.tool !== 'null') {
      const toolArgs = {
        text,
        question: text,
        targetLanguage: intent.language,
        size: intent.size,
        query: text,
        city: text,
        mode: 'audio',
        format: intent.tool === 'download' ? inferDownloadFormat(text) : 'audio',
        url: intent.tool === 'download' ? extractDownloadUrl(text) : text,
      };

      const commandCandidate = intent.tool;
      if (['help', 'ping', 'status', 'statut', 'whoami', 'menu', 'agent', 'setup'].includes(commandCandidate)) {
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

      result = await executeTool(intent.tool, toolArgs, { sock, msg, chatId, sender });
    } else {
      result = await askMistral(text);
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
