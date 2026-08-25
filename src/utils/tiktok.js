import { runDownload, runYoutubeDl } from './youtube.js';

const TIKTOK_URL_REGEX = /https?:\/\/(www\.|vt\.|vm\.|m\.)?tiktok\.com\/\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

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
 * Récupère les infos de la vidéo (titre, durée) via yt-dlp, sans la
 * télécharger.
 *
 * Historique :
 * 1. Ce module interrogeait au départ l'API tierce tikwm.com, qui a fini
 *    par se refermer derrière une offre payante (tikwmapi.com) — 403
 *    permanente, quel que soit le User-Agent envoyé.
 * 2. Bascule sur yt-dlp (extracteur TikTok natif, déjà fiabilisé pour
 *    YouTube/Facebook dans utils/youtube.js) — mais TikTok casse
 *    régulièrement son extracteur côté yt-dlp lui-même en changeant la
 *    structure de sa page ("Unable to extract universal data for
 *    rehydration"). C'est un problème CONNU et récurrent (voir
 *    yt-dlp/yt-dlp#16199, #15418, #14859...), corrigé à chaque fois côté
 *    yt-dlp en quelques jours. La release 2026.08.19 par exemple contient
 *    justement "tiktok: Fix extractor (#17452)".
 *
 * ⚠️ Si cette erreur revient : la CAUSE LA PLUS PROBABLE est un binaire
 * yt-dlp local devenu trop vieux. `fix-ytdlp.cjs` télécharge la dernière
 * release GitHub au moment où il tourne (postinstall), pas à chaque
 * lancement du bot — il faut donc le relancer manuellement de temps en
 * temps : `node fix-ytdlp.cjs` à la racine du projet, puis redémarrer le
 * bot. Ce n'est pas un correctif de code, c'est une mise à jour de binaire.
 *
 * En complément, on retente une fois automatiquement : plusieurs issues
 * yt-dlp décrivent ce problème comme intermittent (fonctionne au 2e essai
 * même sans rien changer), probablement lié à du rate-limiting ponctuel
 * côté TikTok.
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
    if (!/rehydration|universal data|webpage video data/i.test(err?.message || '')) {
      throw new Error(explainTikTokError(err));
    }
    // Erreur connue comme intermittente : une seconde tentative après une
    // courte pause suffit souvent (voir commentaire ci-dessus).
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
  if (/rehydration|universal data|webpage video data/i.test(raw)) {
    return (
      "TikTok a changé la structure de ses pages et bloque momentanément l'extraction (erreur connue de yt-dlp). " +
      "Le correctif vient généralement de yt-dlp en quelques jours — si ça persiste, le binaire du bot a besoin d'une mise à jour (node fix-ytdlp.cjs)."
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

/** Télécharge la piste audio, convertie en mp3. Réutilise runDownload de utils/youtube.js. */
export async function downloadTikTokAudio(url) {
  return runDownload(url, { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 }, 'mp3');
}

/** Télécharge la vidéo (mp4, sans watermark : c'est le flux natif TikTok que récupère yt-dlp). */
export async function downloadTikTokVideo(url) {
  return runDownload(
    url,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}