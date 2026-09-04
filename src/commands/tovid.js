import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { stickerToVideo } from '../utils/mediaConvert.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'tovid',
  aliases: ['vid', 'tovideo'],
  description:
    'Convertit un sticker animé en vidéo. Réponds à un sticker avec {prefix}tovid, ou envoie le sticker directement avec {prefix}tovid en légende.',
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
        await ctx.error('Réponds à un sticker avec !tovid, ou envoie le sticker directement avec !tovid en légende.');
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
      const videoBuffer = await stickerToVideo(buffer);
      await ctx.sock.sendMessage(ctx.chatId, { video: videoBuffer }, { quoted: ctx.msg });
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la conversion du sticker en vidéo');
      await ctx.error(`Impossible de convertir le sticker en vidéo : ${err.message}`);
    }
  },
};
