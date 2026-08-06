import { extractYoutubeUrl, fetchYoutubeData } from '../utils/youtube.js';
import { promptDownloadChoice } from '../utils/downloadChoice.js';

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

    await promptDownloadChoice(ctx, { type: 'youtube', title, url }, { title });
  },
};
