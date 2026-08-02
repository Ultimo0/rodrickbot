import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { buildSticker } from '../utils/sticker.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description:
    'Transforme une image ou une courte vidéo en sticker. Réponds à un média avec !sticker, ou envoie le média directement avec !sticker en légende.',
  category: 'Média',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;
    let mediaType = null;

    if (ctx.msg.message.imageMessage) {
      mediaType = 'image';
    } else if (ctx.msg.message.videoMessage) {
      mediaType = 'video';
    }

    if (mediaType) {
      try {
        buffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement du média impossible : ${err.message}`);
        return;
      }
    } else {
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (!quoted || (quotedType !== 'image' && quotedType !== 'video')) {
        await ctx.error('Réponds à une image ou une courte vidéo avec !sticker, ou envoie le média directement avec !sticker en légende.');
        return;
      }

      mediaType = quotedType;
      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error('Téléchargement du média impossible.');
        return;
      }
    }

    await ctx.processing();

    try {
      const stickerBuffer = await buildSticker(buffer, mediaType);
      await ctx.sock.sendMessage(ctx.chatId, { sticker: stickerBuffer }, { quoted: ctx.msg });
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la création du sticker');
      await ctx.error(`Impossible de créer le sticker : ${err.message}`);
    }
  },
};