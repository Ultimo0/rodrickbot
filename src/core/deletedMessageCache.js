import { getMediaType } from '../utils/quotedContent.js';
import { logger } from '../utils/logger.js';

/**
 * Cache anti-suppression : mémorise chaque message entrant (privé ET
 * groupe) pendant 45 minutes, pour pouvoir le retrouver si l'auteur le
 * supprime ("supprimer pour tout le monde") — WhatsApp n'envoie jamais le
 * contenu du message supprimé dans son événement de suppression, seulement
 * une référence (protocolMessage.key.id) vers le message original : sans
 * ce cache, impossible de savoir ce qui a été supprimé.
 *
 * Deux structures séparées :
 * - messageCache : TOUS les messages récents (texte/média), nécessaire
 *   uniquement pour retrouver le contenu au moment d'une suppression.
 * - deletedLog : les suppressions déjà détectées, par chat, prêtes à être
 *   consultées par !remove (les 3 dernières, 45 minutes de rétention).
 *
 * Suivi purement en mémoire (pas de persistance) : ni le contenu des
 * messages ni l'historique de suppression n'ont de sens à restaurer après
 * un redémarrage.
 */

/**
 * Cache anti-suppression ET anti-édition : mémorise chaque message entrant
 * (privé ET groupe) pendant 45 minutes, pour pouvoir le retrouver si
 * l'auteur le supprime ("supprimer pour tout le monde") OU le modifie —
 * WhatsApp n'envoie JAMAIS le contenu d'origine dans ces deux évènements,
 * seulement une référence (protocolMessage.key.id) vers le message
 * original : sans ce cache, impossible de savoir ce qui a été
 * supprimé/édité. Les deux fonctionnalités partagent le même cache brut
 * (messageCache) plutôt que d'avoir chacune leur propre abonnement à
 * messages.upsert qui recopierait deux fois les mêmes messages en mémoire.
 *
 * Trois structures séparées :
 * - messageCache : TOUS les messages récents (texte/média), nécessaire
 *   uniquement pour retrouver le contenu au moment d'une suppression/édition.
 * - deletedLog : les suppressions déjà détectées, par chat, prêtes à être
 *   consultées par !remove (les 3 dernières, 45 minutes de rétention).
 * - editLog : les éditions déjà détectées, par chat, prêtes à être
 *   consultées par !antiedit (les 3 dernières, 45 minutes de rétention).
 *
 * Suivi purement en mémoire (pas de persistance) : ni le contenu des
 * messages ni ces deux historiques n'ont de sens à restaurer après un
 * redémarrage.
 */

const CACHE_DURATION_MS = 45 * 60 * 1000; // 45 minutes
const MAX_DELETED_PER_CHAT = 3;
const MAX_EDITED_PER_CHAT = 3;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// "chatId:msgId" -> { msg, cachedAt }
const messageCache = new Map();
// chatId -> [{ msg, author, deletedAt }, ...] — plus récent en premier
const deletedLog = new Map();
// chatId -> [{ before, after, author, editedAt }, ...] — plus récent en premier
const editLog = new Map();

function cacheKey(chatId, msgId) {
  return `${chatId}:${msgId}`;
}

/**
 * type REVOKE = 0, type MESSAGE_EDIT = 14 dans le protocole WhatsApp
 * (proto.Message.ProtocolMessage.Type — valeurs confirmées directement
 * depuis le paquet @whiskeysockets/baileys, pas devinées). REVOKE est le
 * mécanisme standard de "supprimer pour tout le monde", MESSAGE_EDIT celui
 * de l'édition d'un message envoyé (WhatsApp limite l'édition à ~15 min
 * après l'envoi, côté client — rien à gérer de notre côté pour ça).
 */
function isRevoke(message) {
  return message?.protocolMessage?.type === 0 && Boolean(message.protocolMessage.key?.id);
}

function isEdit(message) {
  return message?.protocolMessage?.type === 14 && Boolean(message.protocolMessage.key?.id);
}

/** Extrait un texte lisible d'un message caché (texte simple ou légende média). */
function extractText(msg) {
  const m = msg?.message;
  if (!m) return '(média sans texte)';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    '(média sans texte)'
  );
}

export function initDeletedMessageCache(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        const chatId = msg.key.remoteJid;
        if (!chatId) continue;

        if (isRevoke(msg.message)) {
          const deletedId = msg.message.protocolMessage.key.id;
          const cached = messageCache.get(cacheKey(chatId, deletedId));
          if (!cached) continue; // pas dans le cache (trop ancien, ou jamais capté) : rien à récupérer

          const author = msg.participant || msg.key.participant || msg.key.remoteJid;

          const log = deletedLog.get(chatId) || [];
          log.unshift({ msg: cached.msg, author, deletedAt: Date.now() });
          if (log.length > MAX_DELETED_PER_CHAT) log.length = MAX_DELETED_PER_CHAT;
          deletedLog.set(chatId, log);

          logger.debug(`[DeletedMessageCache] Suppression détectée et récupérée (${chatId})`);
          continue; // un protocolMessage n'a lui-même rien à mettre en cache
        }

        if (isEdit(msg.message)) {
          const editedId = msg.message.protocolMessage.key.id;
          const cached = messageCache.get(cacheKey(chatId, editedId));
          if (!cached) continue; // original pas en cache : rien à comparer

          const author = msg.participant || msg.key.participant || msg.key.remoteJid;
          const before = extractText(cached.msg);
          const after = extractText({ message: msg.message.protocolMessage.editedMessage });

          const log = editLog.get(chatId) || [];
          log.unshift({ before, after, author, editedAt: Date.now() });
          if (log.length > MAX_EDITED_PER_CHAT) log.length = MAX_EDITED_PER_CHAT;
          editLog.set(chatId, log);

          // Le cache garde la version ÉDITÉE, pas l'originale : si le
          // message est édité une seconde fois (ou supprimé après coup),
          // la comparaison suivante doit partir de son contenu le plus
          // récent, pas du tout premier envoyé.
          messageCache.set(cacheKey(chatId, editedId), {
            msg: { ...cached.msg, message: msg.message.protocolMessage.editedMessage },
            cachedAt: Date.now(),
          });

          logger.debug(`[DeletedMessageCache] Édition détectée (${chatId})`);
          continue;
        }

        // Seuls texte et médias (image/vidéo/audio) sont utiles à récupérer
        // pour !remove/!antiedit — les autres types (sticker, document,
        // système...) ne sont pas mis en cache pour limiter la mémoire
        // utilisée.
        const isText = Boolean(msg.message.conversation || msg.message.extendedTextMessage?.text);
        const mediaType = getMediaType(msg.message);
        const isRelevantMedia = ['image', 'video', 'audio'].includes(mediaType);
        if (!isText && !isRelevantMedia) continue;

        const key = cacheKey(chatId, msg.key.id);
        messageCache.set(key, { msg, cachedAt: Date.now() });
        setTimeout(() => messageCache.delete(key), CACHE_DURATION_MS).unref();
      } catch (err) {
        logger.warn({ err }, '[DeletedMessageCache] Erreur de traitement');
      }
    }
  });

  // Purge périodique des journaux (suppressions ET éditions), indépendante
  // du cache brut, pour que leur rétention respecte elle aussi les 45 min.
  setInterval(() => {
    const cutoff = Date.now() - CACHE_DURATION_MS;
    for (const [chatId, log] of deletedLog) {
      const filtered = log.filter((e) => e.deletedAt >= cutoff);
      if (filtered.length) deletedLog.set(chatId, filtered);
      else deletedLog.delete(chatId);
    }
    for (const [chatId, log] of editLog) {
      const filtered = log.filter((e) => e.editedAt >= cutoff);
      if (filtered.length) editLog.set(chatId, filtered);
      else editLog.delete(chatId);
    }
  }, CLEANUP_INTERVAL_MS).unref();

  logger.info('[DeletedMessageCache] Initialisé.');
}

/** Les suppressions récentes (≤ 45 min) d'un chat, plus récentes en premier. */
export function getDeletedMessages(chatId) {
  const cutoff = Date.now() - CACHE_DURATION_MS;
  return (deletedLog.get(chatId) || []).filter((e) => e.deletedAt >= cutoff);
}

/** Les éditions récentes (≤ 45 min) d'un chat, plus récentes en premier. */
export function getEditedMessages(chatId) {
  const cutoff = Date.now() - CACHE_DURATION_MS;
  return (editLog.get(chatId) || []).filter((e) => e.editedAt >= cutoff);
}
