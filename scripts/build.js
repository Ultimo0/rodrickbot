import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'dist');

// Niveau "moyen" : illisible et pénible à analyser statiquement, sans
// exploser le temps de démarrage (contrairement à un niveau "fort" avec
// deadCodeInjection élevé + debugProtection, plus lourd et plus fragile).
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

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const relPath = path.relative(SRC_DIR, fullPath);
    const outPath = path.join(OUT_DIR, relPath);

    if (statSync(fullPath).isDirectory()) {
      mkdirSync(outPath, { recursive: true });
      walk(fullPath);
      continue;
    }

    mkdirSync(path.dirname(outPath), { recursive: true });

    if (entry.endsWith('.js')) {
      const code = readFileSync(fullPath, 'utf-8');
      const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS).getObfuscatedCode();
      writeFileSync(outPath, obfuscated);
      console.log(`Obfusqué: src/${relPath}`);
    } else {
      copyFileSync(fullPath, outPath);
      console.log(`Copié:    src/${relPath}`);
    }
  }
}

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}
mkdirSync(OUT_DIR, { recursive: true });

walk(SRC_DIR);

console.log(`\nBuild obfusqué généré dans ${OUT_DIR}`);
console.log('Pour distribuer: donne dist/, package.json, package-lock.json, assets/ et un .env vide.');
console.log('Ne distribue jamais src/, .env rempli, auth_info/ ou instance.json.');