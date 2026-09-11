import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getQuotedInfo, getMediaType, downloadQuotedMedia } from '../utils/quotedContent.js';
import { toVoiceNoteOgg } from '../utils/mediaConvert.js';
import { setMentionReplyText, setMentionReplyAudio, clearMentionReply } from '../core/mentionReplyStore.js';
import { logger } from '../utils/logger.js';

const OFF_KEYWORDS = new Set(['off', 'stop', 'delete', 'del', 'supprimer', 'suppr', 'annuler']);

export default {
  name: 'mention',
  aliases: ['onmention'],
  description:
    "Enregistre un message (texte ou audio) envoyé automatiquement chaque fois que tu es mentionné " +
    "ou cité dans un GROUPE (jamais en privé). Usage: {prefix}mention <texte> — ou réponds à un audio/une " +
    "note vocale avec {prefix}mention pour l'enregistrer (ré-encodée en note vocale, OGG/Opus). " +
    "{prefix}mention off pour supprimer.",
  category: 'Utilitaires',
  privateOnly: false,
  cooldownMs: 5000,
  execute: async (ctx) => {
    const sub = ctx.args[0]?.toLowerCase();

    if (sub && OFF_KEYWORDS.has(sub)) {
      const removed = clearMentionReply(ctx.sender);
      if (removed) await ctx.success('🗑️ Réponse automatique de mention supprimée.');
      else await ctx.error("Tu n'avais aucune réponse automatique enregistrée.");
      return;
    }

    // Cas 1 : audio envoyé directement avec !mention en légende — impossible
    // pour une vraie note vocale WhatsApp (pas de légende), mais possible
    // pour un fichier audio classique envoyé avec le texte "!mention".
    let audioBuffer = null;

    if (ctx.msg.message.audioMessage) {
      try {
        audioBuffer = await downloadMediaMessage(ctx.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
      } catch (err) {
        await ctx.error(`Téléchargement de l'audio impossible : ${err.message}`);
        return;
      }
    } else {
      // Cas 2 (le plus courant) : réponse à une note vocale / un audio.
      const quoted = getQuotedInfo(ctx.msg);
      const quotedType = quoted ? getMediaType(quoted.quotedMessage) : null;

      if (quotedType === 'audio') {
        audioBuffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
        if (!audioBuffer) {
          await ctx.error('Téléchargement du média impossible.');
          return;
        }
      } else if (quotedType) {
        await ctx.error(
          "Seuls le texte et les notes vocales/audios sont pris en charge pour !mention " +
          '(pas d\'image, vidéo, sticker ou document).'
        );
        return;
      }
    }

    if (audioBuffer) {
      await ctx.processing();
      try {
        // Toujours repasser par ffmpeg, MÊME si la source est déjà une
        // vraie note vocale (ptt: true) — jamais stocker les octets bruts
        // tels quels (voir CHANGELOG 1.62.0/1.64.1 : un conteneur "déjà
        // ptt" peut être non-standard selon l'appareil source).
        const { buffer: finalBuffer, seconds } = await toVoiceNoteOgg(audioBuffer);

        setMentionReplyAudio(ctx.sender, {
          buffer: finalBuffer,
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true,
          seconds,
        });
        await ctx.success('🔔 Note vocale enregistrée. Elle sera envoyée chaque fois que tu seras mentionné dans un groupe.');
      } catch (err) {
        logger.warn({ err }, "Erreur lors de l'enregistrement de la note vocale de mention");
        await ctx.error(`Impossible d'enregistrer cet audio : ${err.message}`);
      }
      return;
    }

    // Cas 3 : texte simple.
    const text = ctx.args.join(' ').trim();
    if (!text) {
      await ctx.error(
        `Usage: !mention <texte>\n` +
        `— ou réponds à une note vocale/un audio avec !mention pour l'enregistrer.\n` +
        `!mention off pour désactiver.`
      );
      return;
    }

    setMentionReplyText(ctx.sender, text);
    await ctx.success('🔔 Réponse enregistrée. Elle sera envoyée chaque fois que tu seras mentionné dans un groupe.');
  },
};
