/**
 * Outil `play`.
 *
 * Adaptateur minimal de la logique de lecture/chargement média existante.
 * Pour l’instant, l’outil réutilise les utilitaires de téléchargement YouTube
 * et TikTok déjà présents, sans réécrire ces fonctions.
 */

import { extractYoutubeUrl, fetchYoutubeData, downloadYoutubeAudio, downloadYoutubeVideo } from '../../utils/youtube.js';
import { extractTikTokUrl, fetchTikTokData, downloadTikTokAudio, downloadTikTokVideo } from '../../utils/tiktok.js';

export const playTool = {
  name: 'play',
  description: 'Télécharge et renvoie un média audio ou vidéo à partir d’un lien YouTube ou TikTok.',
  params: [
    { name: 'url', type: 'string', required: true, description: 'Lien YouTube ou TikTok à traiter.' },
    { name: 'mode', type: 'string', required: false, description: 'audio|video ; par défaut audio.' },
  ],
  execute: async ({ url, mode = 'audio' }) => {
    if (!url) throw new Error('URL manquante pour l’outil play.');

    const youtubeUrl = extractYoutubeUrl(url);
    if (youtubeUrl) {
      const info = await fetchYoutubeData(youtubeUrl);
      if (mode === 'video') {
        const buffer = await downloadYoutubeVideo(info.url);
        return { type: 'video', buffer, title: info.title, mimeType: 'video/mp4' };
      }
      const buffer = await downloadYoutubeAudio(info.url);
      return { type: 'audio', buffer, title: info.title, mimeType: 'audio/mpeg' };
    }

    const tiktokUrl = extractTikTokUrl(url);
    if (tiktokUrl) {
      const data = await fetchTikTokData(tiktokUrl);
      if (mode === 'video') {
        const buffer = await downloadTikTokVideo(data);
        return { type: 'video', buffer, title: data.title, mimeType: 'video/mp4' };
      }
      const buffer = await downloadTikTokAudio(data);
      return { type: 'audio', buffer, title: data.title, mimeType: 'audio/mpeg' };
    }

    throw new Error('Lien non supporté par l’outil play.');
  },
};
