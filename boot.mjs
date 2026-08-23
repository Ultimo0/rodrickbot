/**
 * boot.mjs
 * ------------------------------------------------------------------
 * Point d'entrée réel du bot. Corrige le binaire yt-dlp AVANT de
 * charger `src/index.js`, pour être certain qu'il est en place même
 * si `npm install` n'a pas relancé le `postinstall` (redémarrage du
 * conteneur sans réinstallation, cache Katabump, etc.).
 *
 * Remplace ta commande de démarrage actuelle (ex. "node src/index.js")
 * par : node boot.mjs
 * ------------------------------------------------------------------
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ensureYtDlpBinary } = require('./fix-ytdlp.cjs');

try {
  await ensureYtDlpBinary();
} catch (err) {
  // On ne bloque jamais le démarrage du bot pour ça : on log et on continue.
  console.error('[boot] Correctif yt-dlp échoué (le bot démarre quand même) :', err.message);
}

// Vérification visible du fichier cookies au démarrage : évite de
// deviner en cas d'erreur "Sign in to confirm you're not a bot" — le
// log dit explicitement si le fichier est trouvé, et où il le cherche.
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cookiesPath = process.env.YT_COOKIES_PATH || path.join(process.cwd(), 'data', 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    const { size, mtime } = fs.statSync(cookiesPath);
    console.log(`[boot] cookies.txt trouvé : ${cookiesPath} (${size} octets, modifié le ${mtime.toISOString()})`);
  } else {
    console.warn(`[boot] ⚠️  cookies.txt INTROUVABLE à : ${cookiesPath} — les téléchargements YouTube risquent l'erreur "Sign in to confirm you're not a bot".`);
  }
}

// Chargé seulement une fois la correction tentée : garantit l'ordre
// demandé (correctif avant tout require/import du reste du code).
await import('./src/index.js');
