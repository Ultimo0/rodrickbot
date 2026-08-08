/**
 * Sauvegarde locale d'une version stable du bot.
 *
 * Usage : npm run save-release
 *
 * Copie l'état actuel du projet (src/, package.json, CHANGELOG.md, README.md,
 * assets/, scripts/, tests/, .gitignore) dans releases/v<version>/, où
 * <version> vient de package.json. Purement local — releases/ est dans
 * .gitignore, ce n'est pas un mécanisme de publication ni de tags Git.
 *
 * Refuse d'écraser une version déjà sauvegardée (utiliser --force pour
 * remplacer volontairement).
 */

import {
  readdirSync,
  statSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const RELEASES_DIR = path.join(ROOT_DIR, 'releases');

// Copiés tels quels (dossiers) ou directement (fichiers).
const INCLUDE_DIRS = ['src', 'assets', 'scripts', 'tests'];
const INCLUDE_FILES = ['package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md', '.gitignore'];

// Jamais copiés, même à l'intérieur d'un dossier inclus (secrets, données
// runtime, ou dossiers qui n'ont rien à faire dans une sauvegarde de code).
const EXCLUDE_NAMES = new Set([
  'node_modules',
  '.git',
  '.env',
  'auth_info',
  'dist',
  'releases',
  'saved_items.json',
  'saved_media',
  'lock_schedules.json',
  'state.json',
  'group_settings.json',
  'warnings.json',
  'promotion_guard_warnings.json',
  'instance.json',
]);

function copyRecursive(src, dest) {
  for (const entry of readdirSync(src)) {
    if (EXCLUDE_NAMES.has(entry)) continue;

    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      mkdirSync(path.dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

const pkg = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
const version = pkg.version;
const targetDir = path.join(RELEASES_DIR, `v${version}`);
const force = process.argv.includes('--force');

if (existsSync(targetDir) && !force) {
  console.error(`❌ releases/v${version}/ existe déjà. Utilise --force pour l'écraser.`);
  process.exit(1);
}

// Juste un avertissement, pas bloquant : rappel de la discipline du projet
// (voir la note en bas de CHANGELOG.md) — chaque version stable devrait
// avoir sa propre entrée documentée.
const changelog = readFileSync(path.join(ROOT_DIR, 'CHANGELOG.md'), 'utf-8');
if (!changelog.includes(`## [${version}]`)) {
  console.warn(`⚠️  Aucune entrée "## [${version}]" trouvée dans CHANGELOG.md — sauvegarde quand même.`);
}

mkdirSync(targetDir, { recursive: true });

for (const dir of INCLUDE_DIRS) {
  const srcPath = path.join(ROOT_DIR, dir);
  if (!existsSync(srcPath)) continue;
  const destPath = path.join(targetDir, dir);
  mkdirSync(destPath, { recursive: true });
  copyRecursive(srcPath, destPath);
}

for (const file of INCLUDE_FILES) {
  const srcPath = path.join(ROOT_DIR, file);
  if (!existsSync(srcPath)) continue;
  copyFileSync(srcPath, path.join(targetDir, file));
}

console.log(`✅ Version ${version} sauvegardée dans releases/v${version}/`);
