import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getMediaObject, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { transcribeAudio } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'vocal-en-texte',
  aliases: ['voicetotext', 'transcrire', 'speechtotext'],
  description:
    'Transcrit une note vocale (ou un audio) en texte. Réponds à une note vocale avec {prefix}vocal-en-texte, ou envoie-la directement.',
  category: 'Intelligence Artificielle',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;
    let mimeType;

    if (ctx.msg.message.audioMessage) {
      mimeType = ctx.msg.message.audioMessage.mimetype;
      try {
        buffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement de l'audio impossible : ${err.message}`);
        return;
      }
    } else {
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (!quoted || quotedType !== 'audio') {
        await ctx.error(
          "Réponds à une note vocale (ou un audio) avec !vocal-en-texte, ou envoie-la directement en légende."
        );
        return;
      }

      mimeType = getMediaObject(quoted.quotedMessage, 'audio')?.mimetype;
      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error("Téléchargement de l'audio impossible.");
        return;
      }
    }

    await ctx.processing();

    try {
      const text = await transcribeAudio(buffer, mimeType);
      await ctx.sock.sendMessage(ctx.chatId, { text: `📝 *Transcription*\n\n${text}` }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la transcription audio');
      await ctx.error(`Impossible de transcrire cet audio : ${err.message}`);
    }
  },
};
