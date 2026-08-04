import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convertit un sticker (webp) en image PNG. Pour un sticker animé, seule
 * la première image de l'animation est conservée (une image reste une
 * image, pas une vidéo).
 */
export async function stickerToImage(buffer) {
  return sharp(buffer, { animated: false }).png().toBuffer();
}

/**
 * Extrait la piste audio d'un fichier vidéo (ou ré-encode un audio déjà
 * existant) en MP3. Passe par des fichiers temporaires car fluent-ffmpeg
 * n'accepte pas un Buffer en entrée directe.
 */
export async function extractAudioMp3(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.mp3`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .toFormat('mp3')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}