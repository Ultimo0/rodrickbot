import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getMediaObject, getQuotedInfo, downloadQuotedMedia } from '../utils/quotedContent.js';
import { analyzeImage } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'analyse-image',
  aliases: ['analyseimage', 'decrire', 'vision'],
  description:
    "Décrit le contenu d'une image (objets, scène, contexte), ou répond à une question précise à son sujet. " +
    "Réponds à une image avec {prefix}analyse-image <question optionnelle>, ou envoie l'image directement avec {prefix}analyse-image en légende.",
  category: 'Intelligence Artificielle',
  adminOnly: false,
  cooldownMs: 15000, // appel API vision à chaque usage
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
        await ctx.error(
          "Réponds à une image avec !analyse-image, ou envoie l'image directement avec !analyse-image en légende."
        );
        return;
      }

      mimeType = getMediaObject(quoted.quotedMessage, 'image')?.mimetype;
      buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
      if (!buffer) {
        await ctx.error("Téléchargement de l'image impossible.");
        return;
      }
    }

    // La question peut venir des arguments de la commande, ou de la
    // légende d'origine de l'image citée si aucun argument n'est donné
    // (ex: quelqu'un poste une image légendée "c'est quoi cet animal ?"
    // et on répond juste !analyse-image dessus).
    const question = ctx.args.join(' ').trim() || null;

    await ctx.processing();

    try {
      const description = await analyzeImage(buffer, mimeType, question);
      await ctx.sock.sendMessage(ctx.chatId, { text: description }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, "Erreur lors de l'analyse de l'image");
      await ctx.error(`Impossible d'analyser cette image : ${err.message}`);
    }
  },
};
