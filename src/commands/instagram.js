import { extractInstagramUrl, fetchInstagramData, explainInstagramError } from '../utils/instagram.js';
import { setPendingChoice } from '../core/downloadSessions.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

export default {
  name: 'instagram',
  aliases: ['ig', 'insta'],
  description: 'Télécharge un reel ou une vidéo Instagram en audio ou vidéo. Usage: {prefix}instagram <lien>',
  category: 'Téléchargement',
  adminOnly: false,
  cooldownMs: 20000, // téléchargement yt-dlp à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    const url = extractInstagramUrl(ctx.args.join(' '));
    if (!url) {
      await ctx.error('Indique un lien Instagram valide (reel, post ou IGTV). Usage: !instagram <lien>');
      return;
    }

    await ctx.processing();

    let title;
    try {
      const result = await fetchInstagramData(url);
      title = result.title;
    } catch (err) {
      await ctx.error(explainInstagramError(err));
      return;
    }

    setPendingChoice(ctx.chatId, ctx.sender, { type: 'instagram', title, url }, CHOICE_TIMEOUT_MS, async () => {
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
