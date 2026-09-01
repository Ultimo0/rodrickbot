#!/usr/bin/env node
/**
 * scripts/export-obfuscated-copy.mjs
 * ------------------------------------------------------------------
 * Génère une COPIE COMPLÈTE et autonome du bot, prête à démarrer, avec
 * tout le code de `src/` obfusqué — sans jamais lire en écriture ni
 * modifier le projet d'origine (ROOT_DIR n'est ouvert qu'en LECTURE).
 *
 * Usage :
 *   node scripts/export-obfuscated-copy.mjs [dossier_destination] [options]
 *
 * Options :
 *   --no-modules   Ne copie pas node_modules/ (il faudra faire `npm ci`
 *                   dans la copie). Par défaut, node_modules/ EST copié
 *                   pour avoir une copie immédiatement fonctionnelle,
 *                   sans redéclencher le postinstall yt-dlp.
 *
 * Par défaut, la destination est un dossier voisin du projet :
 *   ../rodrickbot-obfusque
 *
 * Ce qui est copié TEL QUEL (nécessaire au fonctionnement, non sensible) :
 *   package.json, package-lock.json, .npmrc, boot.mjs, fix-ytdlp.cjs,
 *   assets/, node_modules/ (sauf --no-modules)
 *
 * Ce qui est OBFUSQUÉ (mêmes réglages que scripts/build.js — un seul
 * niveau d'obfuscation dans tout le projet, pas de divergence à
 * maintenir) :
 *   src/ → copie/src/
 *
 * Ce qui n'est JAMAIS copié (secrets, session WhatsApp, état propre à
 * CE déploiement précis — voir .gitignore, même liste) :
 *   .env (le vrai, avec les valeurs), .git/, .github/, auth_info/,
 *   data/* (état runtime), saved_media/, releases/, instance.json,
 *   warnings.json, group_settings.json, lock_schedules.json,
 *   saved_items.json, promotion_guard_warnings.json, *.log, tests/,
 *   scripts/ (dev uniquement), dist/ (rebuild obfusqué, pas la copie)
 *
 * Ce qui est GÉNÉRÉ dans la copie :
 *   .env       → un gabarit avec les MÊMES noms de variables que le vrai
 *                .env du projet, valeurs vidées. Les secrets réels ne
 *                sont jamais lus au-delà de leurs noms de clé.
 *   data/      → dossier vide (le bot régénère son état au premier
 *                démarrage — aucune donnée d'un déploiement précédent
 *                n'est réutilisée).
 * ------------------------------------------------------------------
 */

import {
  readdirSync, statSync, readFileSync, writeFileSync, mkdirSync,
  copyFileSync, existsSync, cpSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..'); // racine du projet — LECTURE SEULE dans tout ce script
const SRC_DIR = path.join(ROOT_DIR, 'src');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const COPY_NODE_MODULES = !process.argv.includes('--no-modules');
const DEST_DIR = path.resolve(args[0] || path.join(ROOT_DIR, '..', 'rodrickbot-obfusque'));

if (path.resolve(DEST_DIR) === path.resolve(ROOT_DIR)) {
  console.error('❌ Le dossier de destination ne peut pas être le projet original. Abandon.');
  process.exit(1);
}

// Mêmes réglages que scripts/build.js — volontairement "moyen" : illisible
// et pénible à analyser statiquement, sans exploser le temps de démarrage
// (contrairement à un niveau "fort" avec deadCodeInjection élevé +
// debugProtection, plus lourd et plus fragile en production).
const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  splitStrings: true,
  splitStringsChunkLength: 10,
  numbersToExpressions: true,
  simplify: true,
  target: 'node',
};

// --- Fichiers/dossiers copiés tels quels (racine du projet) ---------------
const PLAIN_COPY_ENTRIES = [
  'package.json',
  'package-lock.json',
  '.npmrc',
  'boot.mjs',
  'fix-ytdlp.cjs',
  'assets',
  ...(COPY_NODE_MODULES ? ['node_modules'] : []),
];

function log(msg) {
  console.log(msg);
}

function copyPlainEntries() {
  for (const entry of PLAIN_COPY_ENTRIES) {
    const srcPath = path.join(ROOT_DIR, entry);
    if (!existsSync(srcPath)) {
      log(`⏭️  ${entry} absent, ignoré.`);
      continue;
    }
    const destPath = path.join(DEST_DIR, entry);
    const isDir = statSync(srcPath).isDirectory();
    if (isDir) {
      log(`📁 Copie de ${entry}/ ${entry === 'node_modules' ? '(peut prendre un moment...)' : ''}`);
      cpSync(srcPath, destPath, { recursive: true });
    } else {
      mkdirSync(path.dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      log(`📄 Copié: ${entry}`);
    }
  }
}

// --- src/ : obfuscation (mêmes règles que scripts/build.js) ---------------
function walkAndObfuscate(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(SRC_DIR, fullPath);
    const outPath = path.join(DEST_DIR, 'src', relPath);

    if (statSync(fullPath).isDirectory()) {
      mkdirSync(outPath, { recursive: true });
      walkAndObfuscate(fullPath);
      continue;
    }

    mkdirSync(path.dirname(outPath), { recursive: true });

    if (entry.endsWith('.js')) {
      const code = readFileSync(fullPath, 'utf-8');
      const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS).getObfuscatedCode();
      writeFileSync(outPath, obfuscated);
    } else {
      // Fichiers non-JS de src/ (settings.json, data/quizQuestions.json,
      // README.md des sous-modules...) : copiés tels quels, rien à obfusquer.
      copyFileSync(fullPath, outPath);
    }
  }
}

// --- .env : gabarit sans valeurs (les secrets réels ne sont jamais lus
// au-delà du nom de la variable, et jamais écrits dans la copie) ----------
function generateEnvTemplate() {
  const realEnvPath = path.join(ROOT_DIR, '.env');
  const destEnvPath = path.join(DEST_DIR, '.env');

  if (!existsSync(realEnvPath)) {
    writeFileSync(destEnvPath, '# Aucun .env trouvé dans le projet original — à remplir manuellement.\n');
    return;
  }

  const lines = readFileSync(realEnvPath, 'utf-8').split('\n');
  const template = lines
    .map((line) => (/^[A-Z_][A-Z0-9_]*=/.test(line) ? line.replace(/=.*/, '=') : line))
    .join('\n');

  writeFileSync(destEnvPath, template);
}

// --- Exécution --------------------------------------------------------
log(`\n🔒 Génération d'une copie obfusquée dans : ${DEST_DIR}\n`);

mkdirSync(DEST_DIR, { recursive: true });

copyPlainEntries();

log('\n🔐 Obfuscation de src/ ...');
mkdirSync(path.join(DEST_DIR, 'src'), { recursive: true });
walkAndObfuscate(SRC_DIR);
log('✅ src/ obfusqué.');

log('\n📄 Génération du gabarit .env (valeurs vidées, jamais les vraies)...');
generateEnvTemplate();

log('📁 Création de data/ (vide — le bot régénère son état au premier démarrage)...');
mkdirSync(path.join(DEST_DIR, 'data'), { recursive: true });

log(`
✅ Copie complète générée dans : ${DEST_DIR}

⚠️  Avant de démarrer cette copie :
  1. Remplis le .env généré (gabarit vide, à côté des vraies clés).
  2. Ne copie JAMAIS auth_info/ depuis l'original — génère une nouvelle
     session (re-scanner le QR / re-pairer) : faire tourner DEUX process
     avec la MÊME session WhatsApp en même temps casse la connexion des
     deux côtés (voire fait bannir le numéro).
  3. Le projet original n'a été ouvert qu'en lecture — rien n'y a été
     modifié.
${COPY_NODE_MODULES ? '' : "  4. node_modules/ n'a pas été copié (--no-modules) : lance `npm ci` dans la copie avant de démarrer.\n"}`);
