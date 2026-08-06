import { extractTikTokUrl, fetchTikTokData } from '../utils/tiktok.js';
import { promptDownloadChoice } from '../utils/downloadChoice.js';

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

    await promptDownloadChoice(ctx, { type: 'tiktok', ...data });
  },
};
