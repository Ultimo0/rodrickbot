import { extractFacebookUrl, fetchFacebookData } from '../utils/facebook.js';
import { setPendingChoice } from '../core/downloadSessions.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

export default {
  name: 'facebook',
  aliases: ['fb'],
  description: 'Télécharge une vidéo Facebook en audio ou vidéo. Usage: {prefix}facebook <lien>',
  category: 'Téléchargement',
  adminOnly: false,
  cooldownMs: 20000, // téléchargement yt-dlp à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    const url = extractFacebookUrl(ctx.args.join(' '));
    if (!url) {
      await ctx.error('Indique un lien Facebook valide. Usage: !facebook <lien>');
      return;
    }

    await ctx.processing();

    let title;
    try {
      const result = await fetchFacebookData(url);
      title = result.title;
    } catch (err) {
      await ctx.error(`Impossible de récupérer cette vidéo : ${err.message}`);
      return;
    }

    setPendingChoice(ctx.chatId, ctx.sender, { type: 'facebook', title, url }, CHOICE_TIMEOUT_MS, async () => {
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
