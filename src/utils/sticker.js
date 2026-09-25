import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { ffmpegPath } from './ffmpegPath.js';
import webpmux from 'node-webpmux';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath);

const STICKER_PACK = 'RodrickBot';
const STICKER_AUTHOR = 'RodrickBot';
const MAX_VIDEO_SECONDS = 6;

/** Convertit une image (jpg/png/webp...) en webp 512x512, fond transparent. */
async function imageToWebp(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp()
    .toBuffer();
}

/** Convertit une vidéo (ou gif) en webp animé 512x512, limité à MAX_VIDEO_SECONDS. */
async function videoToWebp(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.webp`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .addOutputOptions([
          '-t', String(MAX_VIDEO_SECONDS),
          '-vf',
          "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=12,pad=512:512:-1:-1:color=0x00000000",
          '-loop', '0',
          '-an',
          '-vsync', '0',
        ])
        .toFormat('webp')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

/** Injecte les métadonnées "pack/auteur" dans le webp (format EXIF attendu par WhatsApp). */
async function addStickerMetadata(webpBuffer) {
  const img = new webpmux.Image();
  await img.load(webpBuffer);

  const json = {
    'sticker-pack-id': randomUUID(),
    'sticker-pack-name': STICKER_PACK,
    'sticker-pack-publisher': STICKER_AUTHOR,
    emojis: ['✨'],
  };

  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([exifHeader, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);

  img.exif = exif;
  return img.save(null);
}

/** Construit un sticker WhatsApp (buffer webp prêt à envoyer) depuis une image ou une vidéo. */
export async function buildSticker(buffer, mediaType) {
  const webp = mediaType === 'video' ? await videoToWebp(buffer) : await imageToWebp(buffer);
  return addStickerMetadata(webp);
}