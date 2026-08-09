/**
 * Outil `ocr`.
 *
 * Adaptateur de la commande `!ocr` déjà présente. Le code existant de
 * téléchargement média + OCR Groq (modèle vision) est réutilisé sans
 * duplication.
 */

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getMediaObject, getQuotedInfo, downloadQuotedMedia } from '../../utils/quotedContent.js';
import { ocrImage } from '../../utils/groq.js';
import { logger } from '../../utils/logger.js';

export const ocrTool = {
  name: 'ocr',
  description: 'Extrait le texte visible d’une image par OCR via Groq (modèle vision).',
  params: [
    { name: 'msg', type: 'object', required: true, description: 'Message WhatsApp source contenant une image.' },
    { name: 'sock', type: 'object', required: true, description: 'Socket Baileys actif.' },
    { name: 'chatId', type: 'string', required: true, description: 'Chat cible.' },
  ],
  execute: async ({ msg, sock, chatId }) => {
    let buffer;
    let mimeType;

    if (msg.message?.imageMessage) {
      mimeType = msg.message.imageMessage.mimetype;
      buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger,
        reuploadRequest: sock.updateMediaMessage,
      });
    } else {
      const quoted = getQuotedInfo(msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;
      if (!quoted || quotedType !== 'image') {
        throw new Error('Réponds à une image pour utiliser l’outil OCR.');
      }
      mimeType = getMediaObject(quoted.quotedMessage, 'image')?.mimetype;
      buffer = await downloadQuotedMedia(sock, quoted, chatId);
      if (!buffer) throw new Error('Téléchargement de l’image impossible.');
    }

    return ocrImage(buffer, mimeType);
  },
};
