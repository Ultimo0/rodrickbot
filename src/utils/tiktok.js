import { runDownload, runYoutubeDl } from './youtube.js';

const TIKTOK_URL_REGEX = /https?:\/\/(www\.|vt\.|vm\.|m\.)?tiktok\.com\/\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

const PAGE_STRUCTURE_ERROR_REGEX = /rehydration|universal data|webpage video data/i;

/** true si le texte contient un lien TikTok. */
export function isTikTokUrl(text) {
  return TIKTOK_URL_REGEX.test(text || '');
}

/** Extrait le premier lien TikTok trouvé dans un texte, ou null. */
export function extractTikTokUrl(text) {
  const match = text?.match(TIKTOK_URL_REGEX);
  return match ? match[0] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Récupère les infos de la vidéo (titre, durée) via yt-dlp.
 *
 * Historique :
 * 1. API tierce tikwm.com au départ — fermée derrière une offre payante,
 *    403 permanente quel que soit le User-Agent (voir CHANGELOG 1.32.0).
 * 2. Bascule sur yt-dlp — TikTok casse régulièrement son extracteur en
 *    changeant la structure de ses pages ("Unable to extract universal
 *    data for rehydration"), corrigé côté yt-dlp en quelques jours à
 *    chaque fois. Un rafraîchissement automatique du binaire toutes les
 *    24h (core/ytdlpAutoUpdater.js) et un essai supplémentaire après une
 *    courte pause couvrent la plupart des cas.
 * 3. Repli navigateur headless (Playwright/Chromium) — retiré en 1.44.0
 *    (trop lourd en RAM pour les hébergements contraints visés par ce
 *    bot). Si yt-dlp échoue avec l'erreur de structure de page ci-dessus
 *    après retry, il n'y a désormais plus de repli : voir
 *    explainTikTokError pour le message renvoyé à l'utilisateur.
 */
export async function fetchTikTokData(url) {
  const attempt = () =>
    runYoutubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      noPlaylist: true,
    });

  let info;
  try {
    info = await attempt();
  } catch (err) {
    if (!PAGE_STRUCTURE_ERROR_REGEX.test(err?.message || '')) {
      throw new Error(explainTikTokError(err));
    }
    // Erreur connue comme intermittente : une seconde tentative après une
    // courte pause suffit souvent.
    await sleep(2000);
    try {
      info = await attempt();
    } catch (err2) {
      throw new Error(explainTikTokError(err2));
    }
  }

  const duration = Number(info.duration || 0);
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(`Vidéo trop longue (max ${Math.round(MAX_DURATION_SECONDS / 60)} min).`);
  }

  return { title: info.title || 'tiktok', url };
}

/**
 * Le message d'erreur brut de yt-dlp ne veut rien dire pour un utilisateur
 * WhatsApp — même logique que explainYoutubeError dans utils/youtube.js.
 */
export function explainTikTokError(err) {
  const raw = err?.message || String(err);
  if (PAGE_STRUCTURE_ERROR_REGEX.test(raw)) {
    return (
      "TikTok a changé la structure de ses pages et bloque momentanément l'extraction. " +
      "Le correctif vient généralement de yt-dlp en quelques jours."
    );
  }
  if (/403/.test(raw) || /forbidden/i.test(raw)) {
    return "TikTok a temporairement bloqué le téléchargement (erreur 403). Réessaie dans quelques minutes.";
  }
  if (/private|removed|not available|unavailable/i.test(raw)) {
    return "Cette vidéo est privée, supprimée, ou indisponible dans cette région.";
  }
  return raw.split('\n')[0]; // yt-dlp peut renvoyer un message très long, on garde la première ligne
}

/** Télécharge la piste audio, convertie en mp3. */
export async function downloadTikTokAudio(data) {
  return runDownload(data.url, { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 }, 'mp3');
}

/** Télécharge la vidéo (mp4). */
export async function downloadTikTokVideo(data) {
  return runDownload(
    data.url,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}
