import { extractTikTokUrl, fetchTikTokData } from '../utils/tiktok.js';
import { setPendingChoice } from '../core/downloadSessions.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

export default {
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Télécharge une vidéo TikTok en audio ou vidéo. Usage: {prefix}tiktok <lien>',
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
      await ctx.error(err.message);
      return;
    }

    setPendingChoice(ctx.chatId, ctx.sender, { type: 'tiktok', ...data }, CHOICE_TIMEOUT_MS, async () => {
      try {
        await ctx.sock.sendMessage(ctx.chatId, { text: '> ⌛ Délai expiré, demande annulée.' }, { quoted: ctx.msg });
      } catch {
        // le chat n'existe peut-être plus, on ignore
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