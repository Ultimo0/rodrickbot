import { extractTikTokUrl, fetchTikTokData } from '../utils/tiktok.js';
import { setPendingChoice } from '../core/downloadSessions.js';
import { logger } from '../utils/logger.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

export default {
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Télécharge une vidéo TikTok en audio ou vidéo. Usage: !tiktok <lien>',
  category: 'Téléchargement',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const url = extractTikTokUrl(ctx.args.join(' '));
    if (!url) {
      await ctx.error('Indique un lien TikTok valide. Usage: !tiktok <lien>');
      return;
    }

    await ctx.processing();

    let data;
    try {
      data = await fetchTikTokData(url);
    } catch (err) {
      await ctx.error(`Impossible de récupérer cette vidéo : ${err.message}`);
      return;
    }

    if (!data.videoUrl && !data.musicUrl) {
      await ctx.error('Aucun média trouvé pour ce lien.');
      return;
    }

    setPendingChoice(ctx.chatId, ctx.sender, { type: 'tiktok', ...data }, CHOICE_TIMEOUT_MS, async () => {
      try {
        await ctx.sock.sendMessage(ctx.chatId, { text: '> ⌛ Délai expiré, demande annulée.' }, { quoted: ctx.msg });
      } catch (err) {
        // Le chat n'existe peut-être plus : rien à faire, mais on garde la trace.
        logger.debug({ err, chatId: ctx.chatId }, 'Notification d\'expiration !tiktok non envoyée');
      }
    });

    await ctx.reply({
      text:
        '🎬 Quel format voulez-vous télécharger ?\n\n' +
        '1️⃣ Audio (MP3)\n' +
        '2️⃣ Vidéo (MP4)\n\n' +
        'Répondez avec 1 ou 2 (délai: 30 secondes)',
    });
  },
};