import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getMediaObject, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { ocrImage } from '../utils/mistral.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'ocr',
  aliases: ['textfromimage', 'extraire'],
  description:
    "Extrait le texte visible d'une image. Réponds à une image avec !ocr, ou envoie l'image directement avec !ocr en légende.",
  category: 'Média',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;
    let mimeType;

    if (ctx.msg.message.imageMessage) {
      mimeType = ctx.msg.message.imageMessage.mimetype;
      try {
        buffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement de l'image impossible : ${err.message}`);
        return;
      }
    } else {
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (!quoted || quotedType !== 'image') {
        await ctx.error("Réponds à une image avec !ocr, ou envoie l'image directement avec !ocr en légende.");
        return;
      }

      mimeType = getMediaObject(quoted.quotedMessage, 'image')?.mimetype;
      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error("Téléchargement de l'image impossible.");
        return;
      }
    }

    await ctx.processing();

    try {
      const text = await ocrImage(buffer, mimeType);
      if (!text) {
        await ctx.error('Aucun texte détecté sur cette image.');
        return;
      }
      await ctx.reply({ text });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, "Erreur lors de l'extraction du texte");
      await ctx.error(`Impossible d'extraire le texte : ${err.message}`);
    }
  },
};