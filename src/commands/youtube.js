import { extractYoutubeUrl, fetchYoutubeData } from '../utils/youtube.js';
import { setPendingChoice } from '../core/downloadSessions.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

export default {
  name: 'youtube',
  aliases: ['yt'],
  description: 'Télécharge une vidéo YouTube en audio ou vidéo. Usage: !youtube <lien>',
  category: 'Téléchargement',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const url = extractYoutubeUrl(ctx.args.join(' '));
    if (!url) {
      await ctx.error('Indique un lien YouTube valide. Usage: !youtube <lien>');
      return;
    }

    await ctx.processing();

    let title;
    try {
      const result = await fetchYoutubeData(url);
      title = result.title;
    } catch (err) {
      await ctx.error(`Impossible de récupérer cette vidéo : ${err.message}`);
      return;
    }

    setPendingChoice(ctx.chatId, ctx.sender, { type: 'youtube', title, url }, CHOICE_TIMEOUT_MS, async () => {
      try {
        await ctx.sock.sendMessage(ctx.chatId, { text: '> ⌛ Délai expiré, demande annulée.' }, { quoted: ctx.msg });
      } catch {
        // le chat n'existe peut-être plus, on ignore
      }
    });

    await ctx.reply({
      text:
        `🎬 *${title}*\n\n` +
        'Quel format voulez-vous télécharger ?\n\n' +
        '1️⃣ Audio (MP3)\n' +
        '2️⃣ Vidéo (MP4)\n\n' +
        'Répondez avec 1 ou 2 (délai: 30 secondes)',
    });
  },
};