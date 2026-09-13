import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getQuotedInfo, downloadQuotedMedia } from './quotedContent.js';
import { changeVideoSpeed } from './mediaConvert.js';
import { logger } from './logger.js';

/**
 * Récupère le buffer d'une vidéo (directe en légende, ou citée) et
 * applique un facteur de vitesse — code commun à commands/ralenti.js et
 * commands/accelere.js (même logique, seul le facteur par défaut change).
 */
export async function runVideoSpeedCommand(ctx, { defaultFactor, minFactor, maxFactor, label }) {
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
      await ctx.error(`Réponds à une vidéo avec !${label}, ou envoie-la directement avec !${label} en légende.`);
      return;
    }

    buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
    if (!buffer) {
      await ctx.error('Téléchargement de la vidéo impossible.');
      return;
    }
  }

  let factor = defaultFactor;
  const rawArg = ctx.args[0]?.replace(',', '.');
  if (rawArg) {
    const parsed = Number(rawArg);
    if (!Number.isFinite(parsed) || parsed < minFactor || parsed > maxFactor) {
      await ctx.error(`Facteur invalide. Utilise une valeur entre ${minFactor} et ${maxFactor} (ex: !${label} ${defaultFactor}).`);
      return;
    }
    factor = parsed;
  }

  await ctx.processing();

  try {
    const outputBuffer = await changeVideoSpeed(buffer, factor);
    await ctx.sock.sendMessage(
      ctx.chatId,
      { video: outputBuffer, mimetype: 'video/mp4', caption: `🎞️ Vitesse x${factor}` },
      { quoted: ctx.msg }
    );
  } catch (err) {
    logger.warn({ err }, `Erreur lors du changement de vitesse (!${label})`);
    await ctx.error(`Impossible de modifier la vitesse de cette vidéo : ${err.message}`);
  }
}
