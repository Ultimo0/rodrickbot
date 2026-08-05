/**
 * Outil `download`.
 *
 * Ce module expose une interface standardisée autour des utilitaires de
 * téléchargement TikTok/YouTube déjà existants dans le projet.
 */

import { extractTikTokUrl, fetchTikTokData, downloadBuffer } from '../../utils/tiktok.js';
import { extractYoutubeUrl, fetchYoutubeData, downloadYoutubeAudio, downloadYoutubeVideo } from '../../utils/youtube.js';

export const downloadTool = {
  name: 'download',
  description: 'Télécharge un média à partir d’un lien YouTube ou TikTok selon le format demandé.',
  params: [
    { name: 'url', type: 'string', required: true, description: 'Lien YouTube ou TikTok.' },
    { name: 'format', type: 'string', required: true, description: 'audio|video' },
  ],
  execute: async ({ url, format }) => {
    const youtubeUrl = extractYoutubeUrl(url);
    if (youtubeUrl) {
      const data = await fetchYoutubeData(youtubeUrl);
      if (format === 'video') {
        return {
          type: 'video',
          buffer: await downloadYoutubeVideo(data.url),
          title: data.title,
          mimeType: 'video/mp4',
        };
      }
      return {
        type: 'audio',
        buffer: await downloadYoutubeAudio(data.url),
        title: data.title,
        mimeType: 'audio/mpeg',
      };
    }

    const tiktokUrl = extractTikTokUrl(url);
    if (tiktokUrl) {
      const data = await fetchTikTokData(tiktokUrl);
      if (format === 'video') {
        if (!data.videoUrl) throw new Error('Aucune vidéo directe disponible.');
        return {
          type: 'video',
          buffer: await downloadBuffer(data.videoUrl),
          title: data.title,
          mimeType: 'video/mp4',
        };
      }
      if (!data.musicUrl) throw new Error('Aucun audio direct disponible.');
      return {
        type: 'audio',
        buffer: await downloadBuffer(data.musicUrl),
        title: data.title,
        mimeType: 'audio/mpeg',
      };
    }

    throw new Error('Lien non supporté par l’outil download.');
  },
};
