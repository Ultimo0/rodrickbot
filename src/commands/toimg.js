import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { stickerToImage } from '../utils/mediaConvert.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'toimg',
  aliases: ['img'],
  description:
    'Convertit un sticker en image. Réponds à un sticker avec !toimg, ou envoie le sticker directement avec !toimg en légende.',
  category: 'Média',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;

    if (ctx.msg.message.stickerMessage) {
      try {
        buffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement du sticker impossible : ${err.message}`);
        return;
      }
    } else {
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (!quoted || quotedType !== 'sticker') {
        await ctx.error('Réponds à un sticker avec !toimg, ou envoie le sticker directement avec !toimg en légende.');
        return;
      }

      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error('Téléchargement du sticker impossible.');
        return;
      }
    }

    await ctx.processing();

    try {
      const imageBuffer = await stickerToImage(buffer);
      await ctx.sock.sendMessage(ctx.chatId, { image: imageBuffer }, { quoted: ctx.msg });
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la conversion du sticker en image');
      await ctx.error(`Impossible de convertir le sticker en image : ${err.message}`);
    }
  },
};