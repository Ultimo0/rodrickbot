import { isAdmin } from '../config/index.js';
import { getGroupSettings } from './groupSettings.js';
import { addWarn, resetWarns, WARN_LIMIT } from './warnStore.js';
import { isBotGroupAdmin } from './groupGuardian.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { logger } from '../utils/logger.js';

/**
 * Antispam : surveille le débit de messages de chaque membre d'un groupe.
 * Si un membre envoie `messageLimit` messages (ou plus) en moins de
 * `windowSeconds`, ses derniers messages sont supprimés et il reçoit un
 * avertissement — sur le même compteur partagé que !warn/!warns/l'antilink
 * (core/warnStore.js) : c'est la même sanction (expulsion à 3), donc pas de
 * raison d'avoir un compteur séparé, contrairement à !antipromote dont la
 * conséquence (rétrogradation) est différente.
 *
 * Suivi purement en mémoire (pas de persistance) : une fenêtre glissante
 * n'a pas de sens à restaurer après un redémarrage.
 */

// { [chatId:jid]: [{ key, ts }, ...] } — historique récent des messages
const recentMessages = new Map();

function trackerKey(chatId, jid) {
  return `${chatId}:${jid}`;
}

function pruneOld(entries, windowMs) {
  const cutoff = Date.now() - windowMs;
  while (entries.length && entries[0].ts < cutoff) entries.shift();
}

async function deleteMessages(sock, chatId, entries) {
  for (const entry of entries) {
    try {
      await sock.sendMessage(chatId, { delete: entry.key });
    } catch (err) {
      logger.warn({ err, chatId }, 'Antispam: échec de la suppression d\'un message');
    }
  }
}

async function handleSpamBurst(sock, chatId, jid, entries, messageLimit) {
  const number = jid.split('@')[0];

  await deleteMessages(sock, chatId, entries);

  const count = addWarn(chatId, jid);

  if (count >= WARN_LIMIT) {
    resetWarns(chatId, jid);
    try {
      await sock.groupParticipantsUpdate(chatId, [jid], 'remove');
      await sock.sendMessage(chatId, {
        text:
          `⚠️ @${number}, spam détecté ! Vos ${messageLimit} derniers messages ont été supprimés.\n` +
          `🚫 ${WARN_LIMIT}/${WARN_LIMIT} avertissements : expulsion automatique.\n` +
          '🧹 Ses avertissements ont été réinitialisés.',
        mentions: [jid],
      });
    } catch (err) {
      logger.warn({ err, chatId }, "Antispam: échec de l'expulsion");
      await sock.sendMessage(chatId, {
        text:
          `⚠️ @${number} a atteint ${WARN_LIMIT}/${WARN_LIMIT} avertissements, mais je n'ai pas pu ` +
          "l'expulser (suis-je bien administrateur du groupe ?).",
        mentions: [jid],
      });
    }
    return;
  }

  await sock.sendMessage(chatId, {
    text:
      `⚠️ @${number}, spam détecté ! Vos ${messageLimit} derniers messages ont été supprimés. ` +
      `Avertissement : ${count}/${WARN_LIMIT}.`,
    mentions: [jid],
  });
}

export function initAntispamGuard(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        const chatId = msg.key?.remoteJid;
        if (!chatId?.endsWith('@g.us')) continue;
        if (!msg.message) continue;
        if (msg.messageStubType != null) continue; // message système, pas un envoi d'utilisateur
        if (msg.key.fromMe) continue; // jamais le bot lui-même

        const jid = normalizeJid(msg.key.participant || '');
        if (!jid) continue;
        if (isAdmin(jid)) continue; // ADMIN_JIDS toujours exempté

        const settings = getGroupSettings(chatId);
        if (!settings.antispam.enabled) continue;

        const { messageLimit, windowSeconds } = settings.antispam;
        const windowMs = windowSeconds * 1000;

        const key = trackerKey(chatId, jid);
        const entries = recentMessages.get(key) || [];
        entries.push({ key: msg.key, ts: Date.now() });
        pruneOld(entries, windowMs);
        recentMessages.set(key, entries);

        if (entries.length < messageLimit) continue;

        // On prend les `messageLimit` derniers messages du burst, puis on
        // repart de zéro pour ce membre (évite de redéclencher sur chaque
        // message suivant tant qu'il reste dans la fenêtre).
        const burst = entries.slice(-messageLimit);
        recentMessages.delete(key);

        if (!(await isBotGroupAdmin(sock, chatId))) {
          logger.warn({ chatId }, "Antispam: le bot n'est pas admin, suppression/expulsion impossibles");
          continue;
        }

        await handleSpamBurst(sock, chatId, jid, burst, messageLimit);
      } catch (err) {
        logger.warn({ err }, 'Antispam: erreur de traitement');
      }
    }
  });

  logger.info('[Antispam] Initialisé.');
}

/** Nombre de messages suivis pour un membre dans la fenêtre courante (diagnostic / tests). */
export function getTrackedCount(chatId, jid) {
  const entries = recentMessages.get(trackerKey(chatId, normalizeJid(jid)));
  return entries?.length || 0;
}