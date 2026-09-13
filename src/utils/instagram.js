import youtubedl from 'youtube-dl-exec';
import { runDownload } from './youtube.js';

const INSTAGRAM_URL_REGEX = /https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

/** Extrait le premier lien Instagram (reel/post/IGTV) trouvé dans un texte, ou null. */
export function extractInstagramUrl(text) {
  const match = text?.match(INSTAGRAM_URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Récupère les infos du média (titre, durée) via yt-dlp, sans le
 * télécharger. Instagram exige une session connectée pour la plupart des
 * contenus (même publics) : réutilise le même fichier de cookies que
 * YouTube s'il existe (voir utils/youtube.js), sinon tente sans — un
 * contenu public "simple" passe parfois sans cookies, le reste échouera
 * avec un message clair (voir explainInstagramError).
 */
export async function fetchInstagramData(url) {
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

  return { title: info.title || info.description?.slice(0, 60) || 'instagram', url };
}

/** Le message d'erreur brut de yt-dlp ne veut rien dire pour un utilisateur WhatsApp. */
export function explainInstagramError(err) {
  const raw = err?.message || String(err);
  if (/login required|rate-limit reached|restricted video/i.test(raw)) {
    return "Ce contenu Instagram nécessite une connexion (compte privé, ou limite anti-bot atteinte). Réessaie plus tard.";
  }
  if (/private|removed|not available|unavailable/i.test(raw)) {
    return "Ce contenu est privé, supprimé, ou indisponible.";
  }
  return raw.split('\n')[0]; // yt-dlp peut renvoyer un message très long, on garde la première ligne
}

/** Télécharge la piste audio, convertie en mp3. Réutilise runDownload de utils/youtube.js. */
export async function downloadInstagramAudio(url) {
  return runDownload(url, { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 }, 'mp3');
}

/** Télécharge une vidéo mp4 (vidéo + audio combinés). */
export async function downloadInstagramVideo(url) {
  return runDownload(
    url,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}
