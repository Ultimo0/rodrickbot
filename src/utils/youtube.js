import youtubedl from 'youtube-dl-exec';
import ffmpegPath from 'ffmpeg-static';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const YOUTUBE_URL_REGEX = /https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)\S+/i;

// Au-delà, le téléchargement devient trop lourd pour un bot WhatsApp.
const MAX_DURATION_SECONDS = 20 * 60;

// YouTube bloque de plus en plus souvent le client "web" par défaut de
// yt-dlp (ERROR: unable to download video data: HTTP Error 403: Forbidden),
// alors que les infos (titre/durée) passent car elles n'empruntent pas le
// même chemin que le téléchargement du flux réel. Forcer plusieurs clients
// en cascade (android, tv, puis web en dernier recours) est le
// contournement le plus fiable actuellement — voir yt-dlp/yt-dlp#14680,
// #15712, et la doc EJS : https://github.com/yt-dlp/yt-dlp/wiki/EJS
// ⚠️ YouTube fait évoluer ce blocage en continu, parfois en quelques jours :
// si l'erreur revient (403, ou "Requested format is not available"), la
// première chose à essayer est TOUJOURS de mettre à jour le binaire yt-dlp
// (relancer fix-ytdlp.cjs), avant de retoucher ces réglages.
const EXTRACTOR_ARGS = 'youtube:player_client=default,android,tv';

// Depuis 2026, une partie des flux YouTube (client "web" notamment) exige
// la résolution d'un défi JavaScript ("n challenge" / PO token) pour
// obtenir une URL de flux valide. yt-dlp peut le faire lui-même s'il
// trouve un runtime JS installé — hors le bot tourne déjà sous Node.js,
// donc ce runtime est disponible gratuitement. --remote-components
// télécharge le script solveur nécessaire au premier lancement (source :
// https://github.com/yt-dlp/yt-dlp/wiki/EJS).
const REMOTE_COMPONENTS = 'ejs:github';

// YouTube demande de plus en plus souvent une confirmation "Sign in to
// confirm you're not a bot" sur les IP de datacenter (comme celles des
// hébergeurs). Fournir de vrais cookies de session contourne ça. Le
// fichier n'est jamais commit (voir .gitignore) : on le lit depuis le
// disque du serveur, et si absent, on continue sans cookies (au pire on
// retombe sur l'erreur "Sign in to confirm...", pas un crash).
const COOKIES_PATH = process.env.YT_COOKIES_PATH || join(process.cwd(), 'data', 'cookies.txt');
let cookiesWarningShown = false;
const cookiesOption = () => {
  if (existsSync(COOKIES_PATH)) return { cookies: COOKIES_PATH };
  if (!cookiesWarningShown) {
    cookiesWarningShown = true; // n'affiche l'avertissement qu'une fois, pas à chaque requête
    console.warn(`[youtube] ⚠️  cookies.txt introuvable à ${COOKIES_PATH} — requêtes envoyées SANS cookies.`);
  }
  return {};
};

/**
 * Runtime JS utilisé par yt-dlp pour résoudre les défis anti-bot de
 * YouTube (signature, n-challenge). Deux options :
 *
 * - Node.js : fonctionne, mais lance un processus Node COMPLET (V8 + tout
 *   le runtime) à chaque défi à résoudre. Sur un hébergement à la RAM
 *   limitée (ex: Katabump), ce processus se fait tuer par l'OOM killer du
 *   système (code de sortie -9 dans les logs), ce qui fait échouer le
 *   téléchargement avec "Requested format is not available" — pas une
 *   erreur réseau, une erreur mémoire.
 * - QuickJS : un moteur JS minimaliste (quelques centaines de Ko, pas de
 *   VM complète) que yt-dlp supporte aussi nativement. Largement suffisant
 *   pour ces petits scripts de défi, et beaucoup moins gourmand en RAM.
 *   Binaire statique installé par fix-ytdlp.cjs (voir ce fichier).
 *   Source : https://github.com/yt-dlp/yt-dlp/wiki/EJS
 *
 * On utilise QuickJS s'il est présent (déployé par fix-ytdlp.cjs), sinon
 * on retombe sur Node pour ne rien casser sur un environnement où le
 * binaire n'aurait pas encore été installé.
 */
const QJS_PATH = join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'qjs');
const JS_RUNTIMES = existsSync(QJS_PATH) ? `quickjs:${QJS_PATH}` : 'node';

/**
 * Enveloppe tous les appels à yt-dlp : ajoute -v (verbose) et, en cas
 * d'échec, imprime un diagnostic complet dans les logs du serveur
 * (visible dans le panneau Katabump, sans avoir besoin d'une console).
 * On ne change rien au comportement pour l'appelant : l'erreur d'origine
 * est toujours relancée telle quelle.
 */
export async function runYoutubeDl(url, opts) {
  try {
    return await youtubedl(url, { verbose: true, jsRuntimes: JS_RUNTIMES, ...opts });
  } catch (err) {
    console.error('──── [yt-dlp DIAGNOSTIC] ────────────────────────');
    console.error('URL demandée      :', url);
    console.error('cookies.txt trouvé:', existsSync(COOKIES_PATH), `(${COOKIES_PATH})`);
    console.error('extractorArgs     :', opts.extractorArgs);
    console.error('jsRuntimes        :', JS_RUNTIMES);
    console.error('message           :', err?.message);
    if (err?.stderr) console.error('stderr            :', err.stderr);
    if (err?.stdout) console.error('stdout            :', err.stdout);
    if (err?.exitCode !== undefined) console.error('exitCode          :', err.exitCode);
    console.error('──────────────────────────────────────────────────');
    throw err;
  }
}

/** Extrait le premier lien YouTube trouvé dans un texte, ou null. */
export function extractYoutubeUrl(text) {
  const match = text?.match(YOUTUBE_URL_REGEX);
  return match ? match[0] : null;
}

/** Récupère les infos de la vidéo (titre, durée) via yt-dlp, sans la télécharger. */
export async function fetchYoutubeData(url) {
  const info = await runYoutubeDl(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    noPlaylist: true,
    extractorArgs: EXTRACTOR_ARGS,
    remoteComponents: REMOTE_COMPONENTS,
    ...cookiesOption(),
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
  const info = await runYoutubeDl(`ytsearch1:${query}`, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    noPlaylist: true,
    extractorArgs: EXTRACTOR_ARGS,
    remoteComponents: REMOTE_COMPONENTS,
    ...cookiesOption(),
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

/**
 * Le message d'erreur brut de yt-dlp ("HTTP Error 403: Forbidden") ne veut
 * rien dire pour un utilisateur WhatsApp. On l'explique sans le cacher, et
 * on distingue ce cas précis du reste (durée trop longue, lien invalide...).
 */
export function explainYoutubeError(err) {
  const raw = err?.message || String(err);
  if (/403/.test(raw) || /forbidden/i.test(raw)) {
    return (
      "YouTube a temporairement bloqué le téléchargement (erreur 403). " +
      "Ce n'est pas lié à cette vidéo en particulier : YouTube durcit régulièrement ses protections contre les outils de téléchargement. " +
      "Réessaie dans quelques minutes ; si ça persiste, le binaire yt-dlp du bot a probablement besoin d'être mis à jour."
    );
  }
  if (/requested format is not available/i.test(raw)) {
    return (
      "Aucun format compatible n'a été trouvé pour cette vidéo. " +
      "Réessaie — si ça persiste sur cette vidéo précise, elle est peut-être restreinte (live, contenu premium, région)."
    );
  }
  return raw;
}

export async function runDownload(url, extraArgs, extension) {
  const id = randomUUID();
  const outputPath = join(tmpdir(), `${id}.${extension}`);

  try {
    await runYoutubeDl(url, {
      output: outputPath,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      ffmpegLocation: ffmpegPath,
      extractorArgs: EXTRACTOR_ARGS,
      remoteComponents: REMOTE_COMPONENTS,
      ...cookiesOption(),
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
  // Sélecteur volontairement large ("bv*+ba/b", recommandé par yt-dlp
  // lui-même) plutôt que restreint à [ext=mp4] : avec le client Android
  // forcé plus haut (EXTRACTOR_ARGS), les formats disponibles varient
  // selon les vidéos, et un filtre d'extension trop strict provoque
  // "Requested format is not available". mergeOutputFormat: 'mp4' +
  // ffmpegLocation se chargent de toujours ressortir un .mp4 au final,
  // quel que soit le format source réellement récupéré.
  return runDownload(
    url,
    { format: 'bv*+ba/b', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}