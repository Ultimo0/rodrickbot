import youtubedl from 'youtube-dl-exec';
import { runDownload } from './youtube.js';

const PINTEREST_URL_REGEX = /https?:\/\/(www\.)?(pinterest\.[a-z.]+\/pin\/\S+|pin\.it\/\S+)/i;

/** Extrait le premier lien Pinterest (pin ou lien court pin.it) trouvé dans un texte, ou null. */
export function extractPinterestUrl(text) {
  const match = text?.match(PINTEREST_URL_REGEX);
  return match ? match[0] : null;
}

/**
 * Un "pin" Pinterest est soit une vidéo, soit une simple image — contrairement
 * à TikTok/Facebook/Instagram qui sont uniquement vidéo. On tente d'abord
 * yt-dlp (qui gère les pins vidéo), et seulement en cas d'échec on retombe
 * sur une extraction basique de la balise `og:image` de la page (pins
 * image, largement majoritaires sur Pinterest).
 * @returns {Promise<{type: 'video'|'image', url: string, title: string}>}
 */
export async function fetchPinterestMedia(pageUrl) {
  try {
    const info = await youtubedl(pageUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      noPlaylist: true,
    });
    if (info?.url || info?.formats?.length) {
      return { type: 'video', url: pageUrl, title: info.title || 'pinterest' };
    }
  } catch {
    // Pas une vidéo (ou yt-dlp ne gère pas ce pin) — on retombe sur l'image.
  }

  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RodrickBOT/1.0)' },
  });
  if (!res.ok) {
    throw new Error(`Page Pinterest inaccessible (${res.status}).`);
  }
  const html = await res.text();

  const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

  if (!imageMatch) {
    throw new Error('Aucun média trouvé sur ce pin (lien invalide, privé, ou supprimé).');
  }

  return { type: 'image', url: imageMatch[1], title: titleMatch?.[1] || 'pinterest' };
}

/** Télécharge la vidéo d'un pin vidéo (mp4). Réutilise runDownload de utils/youtube.js. */
export async function downloadPinterestVideo(pageUrl) {
  return runDownload(
    pageUrl,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}

/** Télécharge l'image d'un pin image (URL directe extraite de og:image). */
export async function downloadPinterestImage(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Téléchargement de l'image impossible (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
