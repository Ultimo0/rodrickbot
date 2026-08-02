import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from './logger.js';

/**
 * Répondre à un statut ou à un message classique produit la même
 * structure côté Baileys : un extendedTextMessage avec un contextInfo
 * contenant le message cité. Ces helpers sont donc utilisés à l'identique
 * par !save et !statut.
 */

function unwrapViewOnce(message) {
  if (message.viewOnceMessage?.message) return message.viewOnceMessage.message;
  if (message.viewOnceMessageV2?.message) return message.viewOnceMessageV2.message;
  return message;
}

export function getMediaType(message) {
  const m = unwrapViewOnce(message);
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  return null;
}

export function getMediaObject(message, mediaType) {
  const m = unwrapViewOnce(message);
  return m[`${mediaType}Message`] || null;
}

export function getTextContent(message) {
  const m = unwrapViewOnce(message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  );
}

/** Extrait le message cité (celui auquel on répond), ou null s'il n'y en a pas. */
export function getQuotedInfo(msg) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo?.quotedMessage) return null;
  return {
    quotedMessage: contextInfo.quotedMessage,
    stanzaId: contextInfo.stanzaId,
    participant: contextInfo.participant,
  };
}

/**
 * Télécharge le média d'un message cité, avec deux stratégies de repli
 * (même esprit que la commande reveal, en plus simple).
 */
export async function downloadQuotedMedia(sock, quotedInfo, chatId) {
  const { quotedMessage, stanzaId, participant } = quotedInfo;
  const inner = unwrapViewOnce(quotedMessage);

  try {
    const buffer = await downloadMediaMessage(
      { message: quotedMessage },
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );
    if (buffer?.length) return buffer;
  } catch (err) {
    logger.warn(`[quotedContent] Tentative 1 échouée: ${err.message}`);
  }

  try {
    const fullMsg = {
      key: {
        id: stanzaId,
        remoteJid: chatId,
        fromMe: false,
        participant: participant || undefined,
      },
      message: inner,
    };
    const buffer = await downloadMediaMessage(sock, fullMsg, 'buffer', {
      reuploadRequest: sock.updateMediaMessage,
      logger,
    });
    if (buffer?.length) return buffer;
  } catch (err) {
    logger.warn(`[quotedContent] Tentative 2 échouée: ${err.message}`);
  }

  return null;
}
