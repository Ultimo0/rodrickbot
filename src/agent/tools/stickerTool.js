/**
 * Outil `sticker`.
 *
 * Adaptateur de la commande existante `!sticker`.
 * La logique métier reste dans les utilitaires de conversion média et de
 * téléchargement de média cités, réutilisés ici sans duplication.
 */

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../../utils/quotedContent.js';
import { buildSticker } from '../../utils/sticker.js';
import { logger } from '../../utils/logger.js';

export const stickerTool = {
  name: 'sticker',
  description: 'Transforme une image ou une courte vidéo en sticker WhatsApp.',
  params: [
    { name: 'msg', type: 'object', required: true, description: 'Message WhatsApp source de type image ou vidéo.' },
    { name: 'sock', type: 'object', required: true, description: 'Socket Baileys actif.' },
    { name: 'chatId', type: 'string', required: true, description: 'Chat cible.' },
  ],
  execute: async ({ msg, sock, chatId }) => {
    let buffer;
    let mediaType = null;

    if (msg.message?.imageMessage) {
      mediaType = 'image';
    } else if (msg.message?.videoMessage) {
      mediaType = 'video';
    }

    if (mediaType) {
      buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger,
        reuploadRequest: sock.updateMediaMessage,
      });
    } else {
      const quoted = getQuotedInfo(msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;
      if (!quoted || (quotedType !== 'image' && quotedType !== 'video')) {
        throw new Error('Réponds à une image ou à une courte vidéo avec l’outil sticker.');
      }
      mediaType = quotedType;
      buffer = await downloadQuotedMedia(sock, quoted, chatId);
      if (!buffer) throw new Error('Téléchargement du média impossible.');
    }

    const stickerBuffer = await buildSticker(buffer, mediaType);
    return { buffer: stickerBuffer, type: 'sticker' };
  },
};
