import youtubedl from 'youtube-dl-exec';
import { runDownload } from './youtube.js';

const FACEBOOK_URL_REGEX = /https?:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\/\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

/** Extrait le premier lien Facebook trouvé dans un texte, ou null. */
export function extractFacebookUrl(text) {
  const match = text?.match(FACEBOOK_URL_REGEX);
  return match ? match[0] : null;
}

/** Récupère les infos de la vidéo (titre, durée) via yt-dlp, sans la télécharger. */
export async function fetchFacebookData(url) {
  const info = await youtubedl(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    noPlaylist: true,
  });

  const duration = Number(info.duration || 0);
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(`Vidéo trop longue (max ${Math.round(MAX_DURATION_SECONDS / 60)} min).`);
  }

  return { title: info.title || 'facebook', url };
}

/** Télécharge la piste audio, convertie en mp3. Réutilise runDownload de utils/youtube.js. */
export async function downloadFacebookAudio(url) {
  return runDownload(url, { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 }, 'mp3');
}

/** Télécharge une vidéo mp4 (vidéo + audio combinés). */
export async function downloadFacebookVideo(url) {
  return runDownload(
    url,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}
