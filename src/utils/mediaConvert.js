import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';

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
 * Convertit un sticker animé (webp) en vidéo MP4.
 *
 * ⚠️ On NE PEUT PAS donner le webp animé directement à ffmpeg : son
 * décodeur webp natif ne gère pas les chunks ANIM/ANMF (animation) —
 * seulement une image statique. Lui donner un webp animé produit 0 frame
 * décodée ("skipping unsupported chunk: ANIM/ANMF", puis "image data not
 * found") et ffmpeg quitte avec le code 69 (fichier de sortie vide). C'est
 * un problème connu et documenté de ffmpeg, pas un souci de nos filtres.
 *
 * Solution : extraire chaque frame individuellement via `sharp` (chaque
 * frame seule EST un webp statique valide, que ffmpeg décode sans
 * problème), les écrire en PNG sur disque, puis les rassembler en vidéo
 * via le démuxeur "concat" de ffmpeg — en conservant la durée réelle de
 * chaque frame (`meta.delay`, en ms) pour préserver la vitesse de lecture
 * d'origine de l'animation, plutôt qu'un fps fixe arbitraire.
 */
export async function stickerToVideo(buffer) {
  const meta = await sharp(buffer, { animated: true }).metadata();
  const pages = meta.pages || 1;
  if (pages <= 1) {
    throw new Error("ce sticker n'est pas animé — utilise !toimg pour le convertir en image à la place.");
  }

  const id = randomUUID();
  const framesDir = join(tmpdir(), `${id}-frames`);
  const listPath = join(tmpdir(), `${id}-list.txt`);
  const outputPath = join(tmpdir(), `${id}-out.mp4`);

  await mkdir(framesDir, { recursive: true });

  try {
    // Repli à 100ms/frame si l'entête webp n'expose pas les délais (cas
    // rare, mais `delay` peut être absent selon l'encodeur d'origine).
    const delays = meta.delay && meta.delay.length === pages ? meta.delay : new Array(pages).fill(100);

    const framePaths = [];
    for (let i = 0; i < pages; i++) {
      const framePath = join(framesDir, `f${String(i).padStart(5, '0')}.png`);
      const frameBuf = await sharp(buffer, { page: i, pages: 1 }).png().toBuffer();
      await writeFile(framePath, frameBuf);
      framePaths.push(framePath);
    }

    // Format concat demuxer : chaque frame + sa durée réelle. Quirk connu
    // du concat demuxer : la dernière ligne "duration" est ignorée par
    // ffmpeg, il faut donc répéter le dernier fichier une fois de plus
    // sans durée après.
    const listLines = framePaths.map((p, i) => `file '${p}'\nduration ${Math.max(delays[i], 10) / 1000}`);
    listLines.push(`file '${framePaths[framePaths.length - 1]}'`);
    await writeFile(listPath, listLines.join('\n'));

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .on('error', reject)
        .on('end', resolve)
        .addOutputOptions([
          // Largeur/hauteur paires obligatoires pour libx264 ; les
          // stickers WhatsApp sont déjà en 512x512 mais on reste
          // défensif si jamais un sticker "cassé" a des dimensions
          // impaires après trim.
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
          '-movflags', '+faststart',
          '-r', '30', // rééchantillonnage en framerate constant (attendu par la plupart des lecteurs), les durées par frame ci-dessus fixent déjà le bon tempo
        ])
        .videoCodec('libx264')
        .noAudio()
        .toFormat('mp4')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([
      rm(framesDir, { recursive: true, force: true }),
      unlink(listPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
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

/**
 * Normalise un audio en voice note WhatsApp compatible : OGG + Opus.
 * Le flux de `!save`/`!get` garde le stockage principal immuable ; on
 * convertit seulement le buffer ré-expédié pour satisfaire le contrat
 * `ptt = true` côté Baileys/WhatsApp.
 */
export async function audioToVoiceNote(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.ogg`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .noVideo()
        .audioCodec('libopus')
        .audioBitrate('64k')
        .toFormat('ogg')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}