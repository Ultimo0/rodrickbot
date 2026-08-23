#!/usr/bin/env node
/**
 * fix-ytdlp.cjs (v3)
 * ------------------------------------------------------------------
 * Remplace le binaire téléchargé par `youtube-dl-exec` par le build
 * "onedir" officiel de yt-dlp (asset "yt-dlp_linux.zip") : un dossier
 * déjà extrait (exécutable + dépendances .so dans _internal/), plutôt
 * que le build "onefile" (asset "yt-dlp_linux") qui doit se
 * ré-extraire lui-même dans /tmp à CHAQUE lancement.
 *
 * Installe aussi un binaire QuickJS (qjs) à côté, pour servir de
 * runtime JS aux défis anti-bot YouTube — voir le commentaire sur
 * JS_RUNTIMES dans src/utils/youtube.js pour le pourquoi (Node.js
 * consomme trop de RAM sur un hébergement contraint et se fait tuer
 * par l'OOM killer, code de sortie -9).
 *
 * Corrige, dans l'ordre chronologique où ces problèmes sont apparus :
 *   1. ImportError: unsupported Python version           (v1 du script)
 *   2. [PYI-xx:ERROR] Failed to extract .../*.so:
 *      decompression resulted in return code -1          (v2)
 *   3. Error running node process (returncode: -9)
 *      → résolution des défis JS tuée par manque de RAM   (v3, ici)
 *
 * Le #2 vient du mécanisme d'auto-extraction du build "onefile" qui
 * échoue sur cet hébergement (quota /tmp, redémarrages en cours
 * d'extraction, etc.). Le build "onedir" n'a plus besoin de s'auto-
 * extraire : le correctif est donc définitif pour cette classe
 * d'erreur, quelle qu'en soit la cause exacte côté serveur.
 *
 * Dépendance : "adm-zip" (pure JS, aucune compilation native) doit
 * être dans package.json → dependencies. `npm install` s'en charge.
 *
 * Installation (inchangée) :
 *   "scripts": { "postinstall": "node fix-ytdlp.cjs" }
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const RELEASE_API_URL =
  'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const ASSET_NAME = 'yt-dlp_linux.zip';

// Binaire statique QuickJS-NG, ne nécessite aucun build ni dépendance
// système. Le nom du fichier doit être exactement "qjs" pour que yt-dlp
// le détecte automatiquement (sinon il faut passer le chemin complet, ce
// que fait déjà youtube.js).
const QJS_DOWNLOAD_URL =
  'https://github.com/quickjs-ng/quickjs/releases/latest/download/qjs-linux-x86_64';

function findYoutubeDlExecBinDir(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'node_modules', 'youtube-dl-exec', 'bin');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'fix-ytdlp-script' } }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API a répondu HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Trop de redirections HTTP.'));
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { 'User-Agent': 'fix-ytdlp-script' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          return resolve(downloadFile(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`Téléchargement du binaire : HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function removePath(p) {
  const stat = fs.lstatSync(p, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.rmSync(p, { recursive: true, force: true });
  } else {
    fs.unlinkSync(p); // fichier normal OU symlink (jamais suivi par unlink)
  }
}

async function main() {
  const binDir = findYoutubeDlExecBinDir(process.cwd());
  if (!binDir) {
    console.warn(
      '[fix-ytdlp] node_modules/youtube-dl-exec/bin introuvable — rien à corriger.'
    );
    return;
  }

  let AdmZip;
  try {
    AdmZip = require('adm-zip');
  } catch {
    throw new Error(
      "Le module 'adm-zip' n'est pas installé. Ajoute-le à package.json → dependencies, puis relance npm install."
    );
  }

  const linkPath = path.join(binDir, 'yt-dlp'); // ce que youtube-dl-exec exécute
  const extractedDir = path.join(binDir, 'yt-dlp_onedir'); // dossier réel du build
  const zipTmpPath = path.join(binDir, `yt-dlp_linux-${Date.now()}.zip`);

  console.log('[fix-ytdlp] Recherche de la dernière release yt-dlp...');
  const release = await httpGetJson(RELEASE_API_URL);
  const asset = (release.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset) {
    throw new Error(`Asset "${ASSET_NAME}" introuvable dans la dernière release GitHub.`);
  }

  console.log(`[fix-ytdlp] Téléchargement de ${ASSET_NAME} (build "onedir", pré-extrait)...`);
  await downloadFile(asset.browser_download_url, zipTmpPath);

  console.log('[fix-ytdlp] Extraction...');
  removePath(extractedDir);
  fs.mkdirSync(extractedDir, { recursive: true });
  const zip = new AdmZip(zipTmpPath);
  zip.extractAllTo(extractedDir, true);
  fs.unlinkSync(zipTmpPath);

  const realBinary = path.join(extractedDir, 'yt-dlp_linux');
  if (!fs.existsSync(realBinary)) {
    throw new Error(`Extraction terminée mais binaire introuvable : ${realBinary}`);
  }
  fs.chmodSync(realBinary, 0o755);

  // bin/yt-dlp doit être un lien symbolique vers le vrai exécutable, pour
  // qu'il retrouve son dossier _internal/ (chemins résolus relativement
  // au binaire réel, pas au lien).
  removePath(linkPath);
  fs.symlinkSync('yt-dlp_onedir/yt-dlp_linux', linkPath);

  console.log(`[fix-ytdlp] Terminé — build onedir installé : ${extractedDir}`);
  console.log(`[fix-ytdlp] ${linkPath} -> yt-dlp_onedir/yt-dlp_linux`);

  const qjsPath = path.join(binDir, 'qjs');
  try {
    console.log('[fix-ytdlp] Téléchargement du runtime QuickJS (qjs)...');
    await downloadFile(QJS_DOWNLOAD_URL, qjsPath);
    fs.chmodSync(qjsPath, 0o755);
    console.log(`[fix-ytdlp] Terminé — QuickJS installé : ${qjsPath}`);
  } catch (err) {
    // Non bloquant : youtube.js retombe automatiquement sur le runtime
    // Node si ce binaire est absent.
    console.warn(`[fix-ytdlp] ⚠️  Échec installation QuickJS (${err.message}) — le bot utilisera Node.js à la place.`);
  }
}

module.exports = { ensureYtDlpBinary: main };

if (require.main === module) {
  main().catch((err) => {
    console.error('[fix-ytdlp] Échec :', err.message);
    // On ne bloque pas le déploiement pour autant : sortie 0.
    process.exit(0);
  });
}
