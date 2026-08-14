import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';

const YOUTUBE_URL_REGEX = /https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

/** Extrait le premier lien YouTube trouvé dans un texte, ou null. */
export function extractYoutubeUrl(text) {
  const match = text?.match(YOUTUBE_URL_REGEX);
  return match ? match[0] : null;
}

/** Récupère les infos de la vidéo (titre, durée) via yt-dlp, sans la télécharger. */
export async function fetchYoutubeData(url) {
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

  return { title: info.title || 'youtube', url };
}

/**
 * Recherche une vidéo sur YouTube à partir d'un texte libre (titre de
 * chanson, artiste, etc.) et retourne ses métadonnées, sans la
 * télécharger. Utilise la syntaxe `ytsearch1:` de yt-dlp pour ne récupérer
 * que le premier résultat pertinent.
 */
export async function searchYoutubeData(query) {
  const info = await youtubedl(`ytsearch1:${query}`, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    noPlaylist: true,
  });

  // Selon la version de yt-dlp, un ytsearch peut renvoyer soit l'objet vidéo
  // directement, soit un objet "playlist" avec un tableau `entries`.
  const entry = Array.isArray(info.entries) ? info.entries[0] : info;
  if (!entry) {
    throw new Error('Aucun résultat trouvé pour cette recherche.');
  }

  const duration = Number(entry.duration || 0);
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(`Vidéo trop longue (max ${Math.round(MAX_DURATION_SECONDS / 60)} min).`);
  }

  const url = entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
  if (!url) {
    throw new Error('Impossible de récupérer le lien de cette vidéo.');
  }

  const thumbnail =
    entry.thumbnail ||
    (Array.isArray(entry.thumbnails) ? entry.thumbnails[entry.thumbnails.length - 1]?.url : null) ||
    null;

  return {
    title: entry.title || 'youtube',
    url,
    duration,
    channel: entry.uploader || entry.channel || 'Inconnu',
    views: Number(entry.view_count || 0),
    thumbnail,
  };
}

export async function runDownload(url, extraArgs, extension) {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}.${extension}`);

  try {
    await youtubedl(url, {
      output: outputPath,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      ffmpegLocation: ffmpegPath,
      ...extraArgs,
    });

    return await readFile(outputPath);
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

/** Télécharge la piste audio, convertie en mp3. */
export async function downloadYoutubeAudio(url) {
  return runDownload(url, { extractAudio: true, audioFormat: 'mp3', audioQuality: 0 }, 'mp3');
}

/** Télécharge une vidéo mp4 (vidéo + audio combinés). */
export async function downloadYoutubeVideo(url) {
  return runDownload(
    url,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}