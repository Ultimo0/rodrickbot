import { logger } from '../utils/logger.js';

function getMediaType(message) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.viewOnceMessage?.message?.imageMessage) return 'image';
  if (message.viewOnceMessage?.message?.videoMessage) return 'video';
  if (message.viewOnceMessage?.message?.audioMessage) return 'audio';
  if (message.viewOnceMessageV2?.message?.imageMessage) return 'image';
  if (message.viewOnceMessageV2?.message?.videoMessage) return 'video';
  if (message.viewOnceMessageV2?.message?.audioMessage) return 'audio';
  return null;
}

const viewOnceMessages = new Map();
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export function initViewOnceCache(sock) {
  // Ce callback est appelé par Baileys sans await: une exception ici
  // deviendrait un rejet non géré, invisible dans les logs.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;
        const mediaType = getMediaType(msg.message);
        const id = msg.key?.id;
        if (!mediaType || !id) continue;

        viewOnceMessages.set(id, msg);
        logger.info(`[ViewOnceCache] ✅ Stocké (ID: ${id.slice(0, 10)}..., type: ${mediaType})`);
        setTimeout(() => {
          viewOnceMessages.delete(id);
          logger.debug(`[ViewOnceCache] ⏳ Expiré: ${id.slice(0, 10)}...`);
        }, CACHE_DURATION_MS).unref?.();
      }
    } catch (err) {
      logger.warn({ err }, '[ViewOnceCache] Erreur pendant la mise en cache d\'un message');
    }
  });
}

export function getViewOnceMessage(id) {
  return viewOnceMessages.get(id) || null;
}