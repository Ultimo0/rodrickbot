import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { videoToGifMp4 } from '../utils/mediaConvert.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'gif',
  aliases: ['togif'],
  description:
    'Convertit une courte vidéo en GIF (15 secondes max, sans le son). Réponds à une vidéo avec {prefix}gif, ou envoie-la directement avec {prefix}gif en légende.',
  category: 'Média',
  adminOnly: false,
  cooldownMs: 10000, // conversion ffmpeg à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;

    if (ctx.msg.message.videoMessage) {
      try {
        buffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement de la vidéo impossible : ${err.message}`);
        return;
      }
    } else {
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (!quoted || quotedType !== 'video') {
        await ctx.error('Réponds à une vidéo avec !gif, ou envoie-la directement avec !gif en légende.');
        return;
      }

      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error('Téléchargement de la vidéo impossible.');
        return;
      }
    }

    await ctx.processing();

    try {
      const gifBuffer = await videoToGifMp4(buffer);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { video: gifBuffer, gifPlayback: true, mimetype: 'video/mp4' },
        { quoted: ctx.msg }
      );
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la conversion en GIF');
      await ctx.error(`Impossible de convertir cette vidéo en GIF : ${err.message}`);
    }
  },
};
