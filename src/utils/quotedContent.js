import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from './logger.js';

/**
 * Répondre à un statut ou à un message classique produit la même
 * structure côté Baileys : un extendedTextMessage avec un contextInfo
 * contenant le message cité. Ces helpers sont donc utilisés à l'identique
 * par !save et !statut.
 */

function unwrapMessage(message) {
  let m = message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  // Un document envoyé avec une légende est parfois enveloppé dans ce
  // conteneur plutôt que d'avoir sa légende directement sur documentMessage.
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m;
}

export function getMediaType(message) {
  const m = unwrapMessage(message);
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.stickerMessage) return 'sticker';
  if (m.documentMessage) return 'document';
  return null;
}

export function getMediaObject(message, mediaType) {
  const m = unwrapMessage(message);
  return m[`${mediaType}Message`] || null;
}

/**
 * Extrait le texte brut d'un message, quel que soit son type.
 */
export function getTextContent(message) {
  if (!message) return null;

  // Déballage des messages enveloppés
  function unwrapMessage(m) {
    if (!m) return null;

    // Messages viewOnce (disparaissent après lecture)
    if (m.viewOnceMessage?.message) return unwrapMessage(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2?.message) return unwrapMessage(m.viewOnceMessageV2.message);

    // Documents avec légende
    if (m.documentWithCaptionMessage?.message) return unwrapMessage(m.documentWithCaptionMessage.message);

    return m;
  }

  const m = unwrapMessage(message);

  // Extraire le texte selon le type de message
  // Ajout du support pour les messages cités dans les réponses
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.audioMessage?.caption) return m.audioMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.stickerMessage?.caption) return m.stickerMessage.caption;
  if (m.contactMessage?.displayName) return m.contactMessage.displayName;
  if (m.contactsArrayMessage?.contacts) return m.contactsArrayMessage.contacts.map(c => c.displayName).join(', ');
  if (m.listMessage?.title) return m.listMessage.title;
  if (m.buttonsMessage?.contentText) return m.buttonsMessage.contentText;
  if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;

  // Support spécifique pour les messages cités dans les réponses
  if (m.extendedTextMessage?.contextInfo?.quotedMessage) {
    return getTextContent(m.extendedTextMessage.contextInfo.quotedMessage);
  }

  if (m.contextInfo?.quotedMessage) {
    return getTextContent(m.contextInfo.quotedMessage);
  }
  return null;
}
/** Extrait le message cité (celui auquel on répond), ou null s'il n'y en a pas. */
export function getQuotedInfo(msg) {
  if (!msg || !msg.message) {
  return null;
}

  // Structure standard: extendedTextMessage avec contextInfo
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (contextInfo?.quotedMessage) {
    return {
      quotedMessage: contextInfo.quotedMessage,
      stanzaId: contextInfo.stanzaId,
      participant: contextInfo.participant,
    };
  }

  // Structure alternative: message direct avec contextInfo
  if (msg.message?.contextInfo?.quotedMessage) {
    return {
      quotedMessage: msg.message.contextInfo.quotedMessage,
      stanzaId: msg.message.contextInfo.stanzaId,
      participant: msg.message.contextInfo.participant,
    };
  }

  // Structure pour les messages avec légende
  if (msg.message?.imageMessage?.contextInfo?.quotedMessage) {
    return {
      quotedMessage: msg.message.imageMessage.contextInfo.quotedMessage,
      stanzaId: msg.message.imageMessage.contextInfo.stanzaId,
      participant: msg.message.imageMessage.contextInfo.participant,
    };
  }

  // Structure pour les réponses aux statuts ou messages spéciaux
  if (msg.message?.viewOnceMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    return {
      quotedMessage: msg.message.viewOnceMessage.message.extendedTextMessage.contextInfo.quotedMessage,
      stanzaId: msg.message.viewOnceMessage.message.extendedTextMessage.contextInfo.stanzaId,
      participant: msg.message.viewOnceMessage.message.extendedTextMessage.contextInfo.participant,
    };
  }

  // Structure pour les messages avec document
  if (msg.message?.documentMessage?.contextInfo?.quotedMessage) {
    return {
      quotedMessage: msg.message.documentMessage.contextInfo.quotedMessage,
      stanzaId: msg.message.documentMessage.contextInfo.stanzaId,
      participant: msg.message.documentMessage.contextInfo.participant,
    };
}

  return null;
}

/**
 * Télécharge le média d'un message cité, avec deux stratégies de repli
 * (même esprit que la commande reveal, en plus simple).
 */
export async function downloadQuotedMedia(sock, quotedInfo, chatId) {
  const { quotedMessage, stanzaId, participant } = quotedInfo;
  const inner = unwrapMessage(quotedMessage);

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

