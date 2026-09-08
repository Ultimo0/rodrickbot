import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { extractAudioMp3 } from '../utils/mediaConvert.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'tomp3',
  aliases: ['mp3'],
  description:
    "Extrait l'audio d'une vidéo (ou convertit un audio) en MP3. Réponds à un média avec {prefix}tomp3, ou envoie-le directement avec {prefix}tomp3 en légende.",
  category: 'Média',
  adminOnly: false,
  cooldownMs: 20000, // conversion ffmpeg à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;
    let mediaType = null;

    if (ctx.msg.message.videoMessage) {
      mediaType = 'video';
    } else if (ctx.msg.message.audioMessage) {
      mediaType = 'audio';
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

      if (!quoted || (quotedType !== 'video' && quotedType !== 'audio')) {
        await ctx.error('Réponds à une vidéo (ou un audio) avec !tomp3, ou envoie le média directement avec !tomp3 en légende.');
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
      const mp3Buffer = await extractAudioMp3(buffer);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { audio: mp3Buffer, mimetype: 'audio/mpeg', fileName: 'audio.mp3' },
        { quoted: ctx.msg }
      );
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la conversion en MP3');
      await ctx.error(`Impossible de convertir en MP3 : ${err.message}`);
    }
  },
};