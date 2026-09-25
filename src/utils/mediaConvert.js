import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { ffmpegPath } from './ffmpegPath.js';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Extrait la piste audio (mp3) d'un buffer vidéo quelconque — générique,
 * contrairement à extractAudioMp3/downloadTikTokAudio qui partent d'une
 * URL téléchargée par yt-dlp. Utile quand la vidéo a déjà été récupérée
 * autrement (ex: repli navigateur headless pour TikTok, voir
 * utils/tiktokBrowser.js) et qu'il ne reste plus qu'à en isoler le son.
 */
export async function extractAudioFromVideoBuffer(videoBuffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in.mp4`);
  const outputPath = join(tmpdir(), `${id}-out.mp3`);

  await writeFile(inputPath, videoBuffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioQuality(0)
        .toFormat('mp3')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);
  }
}

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
 * Convertit un audio quelconque en OGG/Opus + calcule sa durée exacte,
 * pour un envoi en véritable note vocale WhatsApp (`ptt: true`).
 *
 * Paramètres ffmpeg volontairement plus stricts que ceux essayés en
 * 1.62.0 (qui n'avaient pas suffi, voir CHANGELOG) — recette reprise de
 * cas similaires documentés dans l'écosystème Baileys :
 *  - `-err_detect ignore_err -fflags +discardcorrupt` : tolère un flux
 *    d'entrée légèrement abîmé (transfert WhatsApp, appareil source
 *    variable) plutôt que de produire une sortie corrompue en silence.
 *  - `-application voip` : profil Opus optimisé pour la voix (c'est ce
 *    que WhatsApp/Signal utilisent eux-mêmes pour les notes vocales),
 *    par opposition au profil générique par défaut.
 *  - `-avoid_negative_ts make_zero -map_metadata -1` : évite les
 *    métadonnées/timestamps hérités du fichier source qui peuvent rendre
 *    le conteneur OGG "non standard" pour le lecteur WhatsApp.
 *  - 16 kHz mono : la fréquence recommandée par la documentation Baileys
 *    elle-même pour l'audio, plutôt que les 48 kHz utilisés en 1.62.0.
 *
 * La durée (`seconds`) est calculée pendant la conversion elle-même
 * (`codecData` de fluent-ffmpeg, pas besoin d'un binaire ffprobe séparé)
 * et doit être transmise explicitement à `sock.sendMessage()` — ne pas
 * laisser Baileys la déduire lui-même du buffer, potentiellement une
 * source d'échec supplémentaire sur certains fichiers.
 *
 * @returns {Promise<{buffer: Buffer, seconds: number}>}
 */
export async function toVoiceNoteOgg(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.ogg`);

  await writeFile(inputPath, buffer);

  let seconds = 0;

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('codecData', (data) => {
          seconds = Math.round(parseDurationToSeconds(data.duration));
        })
        .on('error', reject)
        .on('end', resolve)
        .inputOptions(['-err_detect', 'ignore_err', '-fflags', '+discardcorrupt'])
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('libopus')
        .audioBitrate('32k')
        .outputOptions([
          '-compression_level', '10',
          '-frame_duration', '60',
          '-application', 'voip',
          '-avoid_negative_ts', 'make_zero',
          '-map_metadata', '-1',
        ])
        .toFormat('ogg')
        .save(outputPath);
    });

    const outBuffer = await readFile(outputPath);
    return { buffer: outBuffer, seconds: seconds || 1 };
  } finally {
    await Promise.allSettled([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);
  }
}

// Durée max d'un GIF — au-delà le fichier devient lourd pour un simple
// "GIF" WhatsApp (qui reste en réalité une vidéo mp4 en boucle, voir
// commentaire de videoToGifMp4 ci-dessous).
const GIF_MAX_SECONDS = 15;

/**
 * Convertit une vidéo (ou l'extrait de ses 15 premières secondes si plus
 * longue) en "GIF" WhatsApp — comme tous les bots de l'écosystème
 * Baileys, il ne s'agit PAS d'un vrai fichier .gif : WhatsApp affiche en
 * boucle silencieuse une vidéo mp4 classique envoyée avec le flag
 * `gifPlayback: true` (voir commands/gif.js). Un vrai .gif encodé via la
 * palette ffmpeg serait nettement plus lourd pour un résultat visuel
 * identique côté WhatsApp.
 *
 * `-an` retire la piste audio (un "GIF" est muet par définition), et le
 * redimensionnement à 480px de large maximum garde le fichier léger tout
 * en préservant les proportions (largeur/hauteur paires obligatoires pour
 * libx264, comme dans stickerToVideo ci-dessus).
 */
export async function videoToGifMp4(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.mp4`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .inputOptions(['-t', String(GIF_MAX_SECONDS)])
        .noAudio()
        .videoCodec('libx264')
        .addOutputOptions([
          '-vf', "scale='min(480,iw)':-2,format=yuv420p",
          '-movflags', '+faststart',
          // Mêmes garde-fous mémoire que changeVideoSpeed ci-dessous (voir
          // son commentaire pour le détail) — ultrafast/-threads 2 limitent
          // le pic de RAM de l'encodeur, quitte à perdre un peu de temps
          // d'encodage, ce qui est un bien meilleur compromis qu'un
          // ffmpeg tué par manque de mémoire (SIGKILL) sur un hébergement
          // à ressources limitées (Pterodactyl, VPS d'entrée de gamme...).
          '-preset', 'ultrafast',
          '-threads', '2',
        ])
        .toFormat('mp4')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } catch (err) {
    throw explainFfmpegError(err);
  } finally {
    await Promise.allSettled([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);
  }
}

// Au-delà, le couple decode+encode (setpts recalcule chaque frame, donc
// aucune passe "copy" possible ici) devient trop gourmand en RAM sur un
// hébergement à ressources limitées — voir explainFfmpegError ci-dessous
// et le commentaire de changeVideoSpeed.
const SPEED_MAX_INPUT_SECONDS = 5 * 60;

/**
 * Détecte un ffmpeg tué par manque de mémoire (SIGKILL envoyé par l'OOM
 * killer du système, PAS une erreur ffmpeg "normale" avec un message
 * explicite) et renvoie une erreur avec un message clair pour
 * l'utilisateur WhatsApp, plutôt que de laisser remonter
 * "ffmpeg was killed with signal SIGKILL" tel quel (incompréhensible).
 * Utilisée par toutes les fonctions de ce fichier qui encodent de la
 * vidéo (le poste de RAM le plus lourd, contrairement aux fonctions
 * audio-only ci-dessus qui n'ont jamais posé ce problème en pratique).
 */
function explainFfmpegError(err) {
  if (/SIGKILL/.test(err?.message || '')) {
    return new Error(
      "mémoire insuffisante sur le serveur pour traiter cette vidéo. Réessaie avec une vidéo plus courte, plus légère, ou en plus basse résolution."
    );
  }
  return err;
}

// atempo ne supporte qu'un facteur entre 0.5 et 2.0 par filtre — au-delà,
// il faut le chaîner plusieurs fois (ex: x4 = deux filtres atempo=2.0).
// setpts est l'inverse du facteur demandé (setpts=1/2*PTS accélère x2).
function buildAtempoChain(factor) {
  const filters = [];
  let remaining = factor;
  while (remaining > 2.0) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(3)}`);
  return filters.join(',');
}

/**
 * Change la vitesse de lecture d'une vidéo (image ET son, gardés
 * synchronisés) — utilisé par !ralenti (facteur < 1) et !accelere
 * (facteur > 1). Facteur 2 = deux fois plus rapide, 0.5 = deux fois plus
 * lent.
 *
 * Garde-fous mémoire (ajoutés après un crash SIGKILL constaté en
 * production sur un hébergement à RAM limitée) :
 *  - `-t SPEED_MAX_INPUT_SECONDS` en entrée : une vidéo source trop longue
 *    est tronquée plutôt que de faire exploser la mémoire (setpts doit
 *    retenir/réordonner des frames, il n'y a pas de mode "copy" possible
 *    ici — chaque frame est décodée puis ré-encodée).
 *  - `scale` défensif à 854px de large max (~480p) : la plupart des
 *    vidéos WhatsApp reçues sont déjà à cette résolution ou en dessous,
 *    mais une vidéo HD/4K transférée telle quelle ferait exploser le pic
 *    de RAM de l'encodeur.
 *  - `-preset ultrafast` : le preset x264 qui utilise le MOINS de RAM (au
 *    prix d'un fichier de sortie un peu plus gros à qualité égale) —
 *    les presets plus lents ("medium" par défaut) gardent plusieurs
 *    images de référence en mémoire pour mieux compresser, ce qui est
 *    justement ce qu'on veut éviter ici.
 *  - `-threads 2` : limite le nombre de frames encodées en parallèle
 *    (donc le nombre de buffers image simultanés en RAM), au prix d'un
 *    encodage un peu plus lent.
 */
export async function changeVideoSpeed(buffer, factor) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.mp4`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .inputOptions(['-t', String(SPEED_MAX_INPUT_SECONDS)])
        .videoFilters(`scale='min(854,iw)':-2,setpts=${(1 / factor).toFixed(6)}*PTS`)
        .audioFilters(buildAtempoChain(factor))
        .videoCodec('libx264')
        .audioCodec('aac')
        .addOutputOptions(['-movflags', '+faststart', '-preset', 'ultrafast', '-threads', '2'])
        .toFormat('mp4')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } catch (err) {
    throw explainFfmpegError(err);
  } finally {
    await Promise.allSettled([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);
  }
}

/** Convertit une durée "HH:MM:SS.ms" (format ffmpeg) en secondes. */
function parseDurationToSeconds(duration) {
  const parts = String(duration || '0:0:0').split(':').map(Number);
  const [h = 0, m = 0, s = 0] = parts;
  return (h * 3600) + (m * 60) + s;
}

/**
 * Normalise un audio en fichier M4A (AAC) pour un renvoi fiable via
 * `!get`/`!reveal`. Remplace une précédente version OGG/Opus + ptt=true
 * (note vocale WhatsApp) qui produisait encore des fichiers illisibles
 * côté destinataire sur certains enregistrements malgré le ré-encodage —
 * M4A/AAC envoyé en audio normal (pas en note vocale) s'est avéré plus
 * fiable. Le stockage principal de `!save` reste inchangé ; seul le
 * buffer ré-expédié est converti.
 */
export async function audioToM4a(buffer) {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}-in`);
  const outputPath = join(tmpdir(), `${id}-out.m4a`);

  await writeFile(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', reject)
        .on('end', resolve)
        .noVideo()
        .audioCodec('aac')
        .audioBitrate('128k')
        .toFormat('mp4')
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}