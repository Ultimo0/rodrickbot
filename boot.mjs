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

// Filet de sécurité au niveau du process — À PLACER EN PREMIER, avant tout
// le reste. Sans ça, une seule exception non rattrapée N'IMPORTE OÙ dans le
// code (y compris dans un listener d'évènement Baileys tiers sans son
// propre try/catch) tue le process entier : depuis Node.js 15, une
// "unhandledRejection" provoque un crash par défaut (comportement qui a
// changé — avant c'était juste un warning). Concrètement, ça veut dire
// qu'un cas limite dans UN SEUL message (structure inattendue, timeout
// réseau pendant une restauration Guardian, etc.) peut faire tomber tout
// le bot pour tous les groupes, pas juste échouer sur ce message précis.
//
// On logge et on continue plutôt que de laisser planter : pour un bot
// WhatsApp de ce type (pas d'état partagé critique qui risquerait de
// devenir incohérent), rester en vie et dégrader localement est presque
// toujours préférable à un crash complet suivi d'un redémarrage (qui,
// avec Baileys, veut dire une reconnexion — donc une coupure visible et un
// motif de reconnexion répété, ce qui est justement ce que WhatsApp
// repère comme suspect).
process.on('unhandledRejection', (reason) => {
  console.error('[process] Promise rejetée non gérée (le bot continue) :', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] Exception non rattrapée (le bot continue) :', err);
});

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
