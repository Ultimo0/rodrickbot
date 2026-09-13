import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { removeBackground } from '../utils/removebg.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'removebg',
  aliases: ['nobg', 'retirefond'],
  description:
    "Retire le fond d'une image (fond transparent). Réponds à une image avec {prefix}removebg, ou envoie-la directement avec {prefix}removebg en légende.",
  category: 'Média',
  adminOnly: false,
  cooldownMs: 15000, // appel API à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    let buffer;

    if (ctx.msg.message.imageMessage) {
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
        await ctx.error("Réponds à une image avec !removebg, ou envoie-la directement avec !removebg en légende.");
        return;
      }

      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error("Téléchargement de l'image impossible.");
        return;
      }
    }

    await ctx.processing();

    try {
      const resultBuffer = await removeBackground(buffer);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { document: resultBuffer, mimetype: 'image/png', fileName: 'sans-fond.png' },
        { quoted: ctx.msg }
      );
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du retrait de fond');
      await ctx.error(`Impossible de retirer le fond : ${err.message}`);
    }
  },
};
