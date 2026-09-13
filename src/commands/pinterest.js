import {
  extractPinterestUrl,
  fetchPinterestMedia,
  downloadPinterestVideo,
  downloadPinterestImage,
} from '../utils/pinterest.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'pinterest',
  aliases: ['pin'],
  description: 'Télécharge un pin Pinterest (image ou vidéo). Usage: {prefix}pinterest <lien>',
  category: 'Téléchargement',
  adminOnly: false,
  cooldownMs: 15000,
  privateOnly: false,
  execute: async (ctx) => {
    const url = extractPinterestUrl(ctx.args.join(' '));
    if (!url) {
      await ctx.error('Indique un lien Pinterest valide (pinterest.com/pin/... ou pin.it/...). Usage: !pinterest <lien>');
      return;
    }

    await ctx.processing();

    try {
      const media = await fetchPinterestMedia(url);

      if (media.type === 'video') {
        const buffer = await downloadPinterestVideo(url);
        await ctx.sock.sendMessage(
          ctx.chatId,
          { video: buffer, mimetype: 'video/mp4', caption: media.title },
          { quoted: ctx.msg }
        );
      } else {
        const buffer = await downloadPinterestImage(media.url);
        await ctx.sock.sendMessage(
          ctx.chatId,
          { image: buffer, caption: media.title },
          { quoted: ctx.msg }
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du téléchargement Pinterest');
      await ctx.error(`Impossible de télécharger ce pin : ${err.message}`);
    }
  },
};
