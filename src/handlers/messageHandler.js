import { readFileSync, existsSync } from 'fs';
import { dataFilePath } from '../utils/dataFile.js';
import { config, isAdmin } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { extractText, isGroup, parseCommand, toQuoteBlock } from '../utils/helpers.js';
import { runMiddlewares } from '../middlewares/index.js';
import { attachReplyHelpers } from '../utils/reply.js';
import { isLockdownMode, incrementMessageCount, incrementCommandCount, getConnectedAt } from '../core/state.js';
import { isAntibugEnabled, isAutoBlockEnabled, analyzeSuspiciousPayload } from '../core/antibugGuard.js';
import { isRemotelyDisabled } from '../core/remoteControl.js';
import { handleAntilink } from '../utils/antilink.js';
import { handleAntiflood } from '../utils/antiflood.js';
import { handleAntistatut } from '../utils/antistatut.js';
import { handleDownloadReply } from '../utils/downloadReply.js';
import { isInstanceConfigured } from '../core/instance.js';
import { runAgentTurn } from '../agent/index.js';
import { handleAnswerText, hasActiveSession } from '../core/quiz/QuizEngine.js';
import { handleTextReply, hasPendingReset, handleGlobalTextReply, hasPendingGlobalReset } from '../core/quiz/QuizResetService.js';
import { handleAnswerText as handleCalcAnswerText, hasActiveSession as hasActiveCalcSession } from '../core/calc/CalcEngine.js';
import { handleWizardText as handlePollWizardText } from '../core/poll/PollManager.js';
import { handleDeleteConfirmText as handlePollDeleteConfirmText, handleVoteText as handlePollVoteText } from '../core/poll/PollManager.js';
import { hasDraft as hasPollDraft } from '../core/poll/PollSessionManager.js';
import { hasDeleteConfirmation as hasPollDeleteConfirmation } from '../core/poll/PollSessionManager.js';
import { handleWizardText as handleRemindWizardText, handleCancelAllConfirmText as handleRemindCancelAllConfirmText } from '../core/remind/RemindManager.js';
import { hasDraft as hasRemindDraft, hasCancelAllConfirmation as hasRemindCancelAllConfirmation } from '../core/remind/RemindSessionManager.js';
import { getQuotedInfo } from '../utils/quotedContent.js';
import { recordActivity } from '../core/activityStore.js';
import { getAfk, clearAfk } from '../core/afkStore.js';
import { extractMentionedJids, extractQuotedParticipant, normalizeJid } from '../utils/groupTarget.js';
import { hasResetConfirmation as hasActivityResetConfirmation, handleResetConfirmText as handleActivityResetConfirmText } from '../core/activityResetSession.js';

// Déduplication des messages : Baileys peut REJOUER des messages.upsert
// déjà traités après une reconnexion (comportement documenté, voir
// WhiskeySockets/Baileys#2415 — "Baileys queues message events during
// disconnect and replays them on reconnect"). Sans ça, un simple aléa
// réseau peut faire exécuter une commande deux fois (double téléchargement
// TikTok/YouTube, double kick, double comptage d'activité...) — le genre
// de bug qui ressemble à "le bot répond deux fois" sans cause évidente.
// Fenêtre volontairement courte : un rejeu après reconnexion arrive en
// général dans les secondes/minutes qui suivent, pas des heures après.
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const processedMessageIds = new Map(); // clé "chatId:messageId" -> timestamp d'expiration

// Persistance sur disque : une Map purement en mémoire est vidée à CHAQUE
// redémarrage complet du process (crash, redéploiement...) — précisément
// le cas où un rejeu est le plus probable (WhatsApp redélivre les messages
// non-accusés à la reconnexion). Sans persistance, le dédoublonnage
// ci-dessus ne protège que les reconnexions à chaud, pas les redémarrages.
// Écriture différée (toutes les 10s, pas à chaque message) : un crash
// exactement dans cette fenêtre de 10s reste possible mais rare, et le
// filtre anti-rattrapage plus bas couvre déjà l'essentiel des cas réels.
const DEDUP_FILE = dataFilePath('dedup.json');
let dedupDirty = false;

function loadProcessedMessageIds() {
  if (!existsSync(DEDUP_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DEDUP_FILE, 'utf-8'));
    const now = Date.now();
    for (const [key, expiresAt] of Object.entries(raw)) {
      if (typeof expiresAt === 'number' && expiresAt > now) processedMessageIds.set(key, expiresAt);
    }
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire dedup.json, cache anti-doublon vide au démarrage');
  }
}

setInterval(() => {
  if (!dedupDirty) return;
  try {
    atomicWriteFileSync(DEDUP_FILE, JSON.stringify(Object.fromEntries(processedMessageIds)));
    dedupDirty = false;
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire dedup.json");
  }
}, 10 * 1000).unref?.();

loadProcessedMessageIds();

function isDuplicateMessage(chatId, messageId) {
  if (!messageId) return false; // pas d'id exploitable : on ne peut pas dédupliquer, on laisse passer

  const key = `${chatId}:${messageId}`;
  const now = Date.now();

  // Purge paresseuse des entrées expirées à chaque appel plutôt qu'un
  // setInterval dédié — suffisant vu le faible volume, pas besoin d'un
  // minuteur de plus à gérer pour ce cache.
  for (const [k, expiresAt] of processedMessageIds) {
    if (expiresAt <= now) processedMessageIds.delete(k);
  }

  if (processedMessageIds.has(key)) return true;

  processedMessageIds.set(key, now + DEDUP_WINDOW_MS);
  dedupDirty = true;
  return false;
}

// Filtre anti-rattrapage : à la (re)connexion, WhatsApp redélivre les
// messages envoyés pendant que le bot était hors ligne, marqués
// `type: 'notify'` — indiscernables de messages tout frais sans regarder
// leur horodatage. Sans ce filtre, une commande tapée pendant que le bot
// était éteint (même des heures avant) s'exécute après coup au
// redémarrage, hors de tout contexte ("le bot réexécute les commandes au
// redémarrage"). Marge généreuse (2 min) pour ne jamais risquer d'ignorer
// un message réellement récent à cause d'un délai de livraison normal ou
// d'un léger décalage d'horloge — seul le VRAI rattrapage (accumulé
// pendant une coupure prolongée) doit être filtré.
const BACKLOG_GRACE_MS = 2 * 60 * 1000;

function isStaleBacklogMessage(msg) {
  const connectedAt = getConnectedAt();
  if (!connectedAt || !msg.messageTimestamp) return false; // pas d'info exploitable : on laisse passer

  const sentAt = Number(msg.messageTimestamp) * 1000;
  return sentAt < connectedAt - BACKLOG_GRACE_MS;
}

export function createMessageHandler(sock, commands) {
  return async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleSingleMessage(sock, commands, msg);
      } catch (err) {
        logger.error({ err }, 'Erreur lors du traitement d\'un message');
        // Avant ce correctif, une exception ici (ex: structure de statut
        // WhatsApp inattendue, échec Baileys) restait invisible pour
        // l'utilisateur : aucune réponse dans le chat, uniquement un log
        // serveur. Symptôme rapporté : "le bot ne répond rien du tout".
        // On tente désormais un message d'erreur best-effort dans le chat
        // d'origine, pour qu'un plantage inattendu ne se traduise plus
        // jamais par un silence total côté utilisateur.
        try {
          const chatId = msg?.key?.remoteJid;
          if (chatId) {
            await sock.sendMessage(chatId, {
              text: '❌ Une erreur inattendue est survenue lors du traitement de ce message. Réessaie, ou contacte le développeur si ça persiste.',
            }, { quoted: msg });
          }
        } catch (notifyErr) {
          logger.error({ notifyErr }, "Impossible d'envoyer le message d'erreur de secours");
        }
      }
    }
  };
}

async function handleSingleMessage(sock, commands, msg) {
  if (!msg.message) return;

  const chatId = msg.key.remoteJid;

  // Doit passer en tout premier, avant même le dédoublonnage : un message
  // de rattrapage n'a jamais été vu par ce process, donc isDuplicateMessage
  // ne l'aurait pas filtré — voir le commentaire au-dessus
  // d'isStaleBacklogMessage() plus haut dans ce fichier.
  if (isStaleBacklogMessage(msg)) {
    logger.debug(`Message de rattrapage ignoré (envoyé avant la connexion): ${msg.key.id}`);
    return;
  }

  // Voir le commentaire au-dessus de isDuplicateMessage() plus haut dans ce
  // fichier — doit passer AVANT tout le reste (y compris le comptage
  // d'activité) pour qu'un message rejoué soit un no-op complet, pas juste
  // une commande non ré-exécutée.
  if (isDuplicateMessage(chatId, msg.key.id)) {
    logger.debug(`Message dupliqué ignoré (rejeu Baileys probable): ${msg.key.id}`);
    return;
  }

  // Interrupteur à distance
  if (isRemotelyDisabled()) return;

  // fromMe = message envoyé depuis le compte du bot lui-même. Comme le bot
  // tourne sur le compte personnel du propriétaire, ça inclut aussi bien ses
  // messages de test en privé que ses propres commandes tapées en groupe —
  // les deux doivent être traités (contrairement aux messages fromMe qui
  // seraient de simples échos des propres envois du bot, filtrés plus loin
  // par le fait qu'ils ne matchent pas le préfixe de commande).
  const isSelfTest = msg.key.fromMe && config.allowSelfTest;
  if (msg.key.fromMe && !isSelfTest) return;

  const sender = isGroup(chatId) ? msg.key.participant : chatId;

  // Protection antibug : uniquement en message PRIVÉ (jamais en groupe — un
  // contenu volumineux dans un groupe peut être un partage/transfert tout à
  // fait légitime, et bloquer un membre de groupe par erreur serait plus
  // gênant qu'utile). Volontairement APRÈS le filtre fromMe : le bot ne
  // s'analyse jamais lui-même. Désactivé par défaut — voir {prefix}antibug.
  if (isAntibugEnabled() && !isGroup(chatId)) {
    const reason = analyzeSuspiciousPayload(msg);
    if (reason) {
      logger.warn(`Antibug: message suspect de ${sender} — ${reason}`);
      if (isAutoBlockEnabled()) {
        try {
          await sock.updateBlockStatus(sender, 'block');
          logger.warn(`Antibug: ${sender} bloqué automatiquement.`);
        } catch (err) {
          logger.error({ err }, 'Antibug: échec du blocage automatique');
        }
      }
      return; // jamais transmis au reste du pipeline (parsing de commande inclus)
    }
  }

  // Activité (!activity / !inactive) : comptage best-effort, un seul
  // point d'entrée pour tous les messages de groupe traités (commandes
  // incluses), AVANT tout le reste du pipeline pour ne dépendre d'aucun
  // early-return ultérieur. Isolé dans son propre try/catch : une panne
  // ici (disque plein, JSON corrompu, etc.) ne doit jamais empêcher le
  // traitement normal du message — voir core/activityStore.js.
  if (isGroup(chatId) && !isSelfTest) {
    try {
      recordActivity(chatId, sender);
    } catch (err) {
      logger.error({ err }, "Échec du comptage d'activité (non bloquant)");
    }
  }

  // AFK — deux effets indépendants, chacun isolé dans son propre try/catch
  // (une panne ici ne doit jamais bloquer le reste du traitement) :
  //
  // 1. Celui qui envoie CE message n'est plus absent, quel que soit le
  //    contenu — y compris si c'est !afk lui-même : la commande remettra
  //    le statut juste après si besoin, l'ordre n'a pas de conséquence.
  try {
    const previous = clearAfk(sender);
    if (previous) {
      const minutesAway = Math.max(1, Math.round((Date.now() - previous.since) / 60000));
      await sock.sendMessage(chatId, { text: `> 👋 Bon retour ! Tu étais absent depuis ${minutesAway} min.` });
    }
  } catch (err) {
    logger.warn({ err }, 'AFK: notification de retour impossible');
  }

  // 2. Ce message mentionne ou répond à quelqu'un actuellement absent.
  try {
    const afkTargets = new Set();
    for (const jid of extractMentionedJids(msg)) afkTargets.add(normalizeJid(jid));
    const quotedParticipant = extractQuotedParticipant(msg);
    if (quotedParticipant) afkTargets.add(normalizeJid(quotedParticipant));

    for (const targetJid of afkTargets) {
      const info = getAfk(targetJid);
      if (!info) continue;
      const minutesAway = Math.max(1, Math.round((Date.now() - info.since) / 60000));
      const number = targetJid.split('@')[0].split(':')[0];
      await sock.sendMessage(chatId, {
        text: `> 💤 @${number} est absent depuis ${minutesAway} min — raison : ${info.reason}`,
        mentions: [targetJid],
      });
    }
  } catch (err) {
    logger.warn({ err }, 'AFK: notification de mention impossible');
  }

  // Vérifié avant extractText() : une notification de mention de statut
  // n'est ni un `conversation` ni un `extendedTextMessage`, donc `text`
  // serait vide de toute façon — inutile d'attendre son extraction.
  if (await handleAntistatut(sock, msg, chatId)) return;

  const text = extractText(msg);

  // Quiz : un chiffre nu envoyé par un utilisateur qui a une confirmation
  // de reset (personnel ou global) ou un quiz en cours est traité ici,
  // AVANT parseCommand() — "2" ne commence jamais par le préfixe donc ne
  // matcherait aucune commande de toute façon, et tomberait sinon dans la
  // branche Agent IA. handle*Reply()/handleAnswerText() renvoient false si
  // le texte n'était PAS un chiffre pertinent (ex: l'utilisateur tape
  // "/quiz abandonner" en pleine partie) : dans ce cas on continue le
  // pipeline normalement, sans quoi une vraie commande serait avalée
  // silencieusement. Le reset global (admin) est vérifié en premier : c'est
  // le cas le plus rare et le plus destructeur, il ne doit jamais être
  // masqué par un reset personnel ou une session qui traînerait pour le
  // même utilisateur (impossible en pratique, /quiz les rend exclusifs,
  // mais l'ordre de vérification reste le plus sûr par défaut). Le calcul
  // mental (CalcEngine) suit exactement le même contrat renvoyant false —
  // /quiz et /calcul s'excluent mutuellement (voir commands/quiz.js et
  // commands/calcul.js), donc jamais les deux actifs en même temps pour un
  // même utilisateur : l'ordre entre les deux blocs ci-dessous ne crée pas
  // d'ambiguïté réelle, seulement une garde de sécurité par défaut.
  if (!(isLockdownMode() && !(isSelfTest || isAdmin(sender)))) {
    if (hasPendingGlobalReset(sender)) {
      const handled = await handleGlobalTextReply(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasPendingReset(sender)) {
      const handled = await handleTextReply(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasActiveSession(sender)) {
      const handled = await handleAnswerText(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasActiveCalcSession(sender)) {
      const handled = await handleCalcAnswerText(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    }
  }

  // Poll (/poll) : trois cas gérés ici, tous scopés par expéditeur+chat, avec
  // le même contrat "renvoie false si le texte n'était pas pertinent" que le
  // bloc quiz/calcul ci-dessus — donc jamais de commande normale avalée par
  // erreur (ex: "/poll cancel" pendant un brouillon en cours, voir
  // PollManager.handleWizardText qui ne capture jamais un texte préfixé).
  // Placé APRÈS le bloc quiz/calcul (jamais avant) pour ne rien changer à sa
  // priorité existante : si un même utilisateur avait improbablement une
  // session quiz/calcul ET un sondage en cours à la fois, quiz/calcul
  // resterait prioritaire, exactement comme avant ce changement.
  //  1. Brouillon de création en cours (titre, options, "fin").
  //  2. Confirmation "1"/"2" en attente avant suppression définitive.
  //  3. Réponse (reply) à une carte de sondage = vote, identifié par
  //     l'id du message cité (stanzaId), jamais par un simple chiffre nu
  //     envoyé dans le vide — c'est ce qui permet plusieurs sondages actifs
  //     en même temps dans le même chat sans ambiguïté sur celui visé.
  if (!(isLockdownMode() && !(isSelfTest || isAdmin(sender)))) {
    if (hasPollDraft(chatId, sender)) {
      const handled = await handlePollWizardText(sock, { sender, chatId, text });
      if (handled) return;
    } else if (hasPollDeleteConfirmation(chatId, sender)) {
      const handled = await handlePollDeleteConfirmText(sock, { sender, chatId, text });
      if (handled) return;
    } else {
      const stanzaId = getQuotedInfo(msg)?.stanzaId;
      if (stanzaId) {
        const handled = await handlePollVoteText(sock, { sender, chatId, messageId: msg.key.id, text, stanzaId });
        if (handled) return;
      }
    }
  }

  // Remind (/remind) : même contrat "renvoie false si le texte n'était pas
  // pertinent" que les blocs quiz/calcul/poll ci-dessus. Placé APRÈS le
  // bloc poll (jamais avant) pour ne rien changer à sa priorité existante
  // — en pratique les deux états sont mutuellement exclusifs par
  // utilisateur (personne n'a un brouillon de sondage ET un assistant de
  // rappel en même temps), donc l'ordre entre les deux blocs ne crée pas
  // d'ambiguïté réelle, seulement une garde de sécurité par défaut, comme
  // pour poll vis-à-vis de quiz/calcul.
  //  1. Brouillon de l'assistant en cours (menu 1-4, puis message).
  //  2. Confirmation "1"/"2" en attente avant "/remind cancel all".
  if (!(isLockdownMode() && !(isSelfTest || isAdmin(sender)))) {
    if (hasRemindDraft(chatId, sender)) {
      const handled = await handleRemindWizardText(sock, { sender, chatId, text });
      if (handled) return;
    } else if (hasRemindCancelAllConfirmation(chatId, sender)) {
      const handled = await handleRemindCancelAllConfirmText(sock, { sender, chatId, text });
      if (handled) return;
    }
  }

  // Activity (!activity reset) : même contrat "renvoie false si le texte
  // n'était pas une réponse oui/non reconnue" que les blocs précédents.
  // Placé après remind, avant antilink/downloadReply — pas de conflit
  // d'état possible (map dédiée, scopée chatId+sender comme les autres).
  if (!(isLockdownMode() && !(isSelfTest || isAdmin(sender)))) {
    if (hasActivityResetConfirmation(chatId, sender)) {
      const handled = await handleActivityResetConfirmText(sock, { sender, chatId, text });
      if (handled) return;
    }
  }

  if (await handleAntiflood(sock, msg, chatId, sender, text)) return;
  if (await handleAntilink(sock, msg, chatId, sender, text)) return;
  if (await handleDownloadReply(sock, chatId, sender, text, msg)) return;

  const parsed = parseCommand(text, config.prefix);
  if (!parsed) {
    // Agent IA réservé aux admins (ADMIN_JIDS) : ignoré silencieusement pour
    // les autres, même si la session a été activée via !agent on — même
    // logique de blocage silencieux que le lockdown mode (voir plus bas
    // pour les commandes classiques), pour ne pas laisser deviner à un
    // non-admin que le mode existe.
    if (!(isSelfTest || isAdmin(sender))) return;

    const agentHandled = await runAgentTurn(sock, msg, chatId, sender, text, commands);
    if (agentHandled) {
      incrementMessageCount();
      logger.info(`Agent IA exécuté pour ${sender}`);
    }
    return;
  }

  const command = commands.get(parsed.command);
  if (!command) return;

  const ctx = {
    sock,
    msg,
    chatId,
    sender,
    args: parsed.args,
    isGroup: isGroup(chatId),
    isAdmin: isSelfTest || isAdmin(sender),
    commands,
    reply: (content) => {
      const formatted =
        typeof content === 'object' && typeof content.text === 'string'
          ? { ...content, text: toQuoteBlock(content.text) }
          : content;
      return sock.sendMessage(chatId, formatted, { quoted: msg });
    },
  };
  attachReplyHelpers(ctx);

  if (!isInstanceConfigured() && command.name !== 'setup') {
    await ctx.error(
      "⚠️ Ce bot n'est pas encore configuré.\n\n" +
      "Exécute d'abord :\n!setup <identifiant> <propriétaire>\n\n" +
      "Exemple : !setup boutique-jean Jean Dupont"
    );
    return;
  }

  if (isLockdownMode() && !ctx.isAdmin) {
    logger.debug(`Commande ignorée (mode privé strict actif): ${sender}`);
    return;
  }

  if (!runMiddlewares(ctx)) {
    logger.debug(`Message bloqué par un middleware: ${sender}`);
    return;
  }

  const isPrivateOnly = command.privateOnly !== false;
  if (isPrivateOnly && ctx.isGroup) {
    await ctx.error('Cette commande fonctionne uniquement en message privé.');
    return;
  }

  if (command.adminOnly && !ctx.isAdmin) {
    await ctx.error('Commande réservée aux administrateurs.');
    return;
  }

  incrementMessageCount();
  incrementCommandCount(command.name);
  logger.info(`Commande exécutée: ${parsed.command} par ${sender}`);
  await command.execute(ctx);
}

