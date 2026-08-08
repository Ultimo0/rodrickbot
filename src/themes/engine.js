import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = __dirname;
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

// Seul fichier du dossier qui n'est pas un thème. Tout le reste de
// src/themes/ est considéré comme un thème et chargé automatiquement —
// voir loadThemes() ci-dessous et src/themes/README.md.
const ENGINE_FILE = 'engine.js';

const DEFAULT_THEME = 'royal';

/**
 * Chaque thème (fichier de src/themes/, ex: royal.js) doit faire un
 * "export default" d'un objet respectant ce contrat :
 * {
 *   name: 'royal',            // identifiant interne (utilisé par !theme <nom>)
 *   label: 'Royal',           // nom affiché à l'utilisateur
 *
 *   // Chaque render* reçoit un objet de DONNÉES BRUTES (jamais de HTML/
 *   // markdown pré-formaté par l'appelant) et retourne le texte final,
 *   // entièrement mis en forme à la façon du thème (structure, bordures,
 *   // polices, séparateurs, icônes...). Le contenu (noms de commandes,
 *   // statistiques, catégories...) est toujours le même quel que soit le
 *   // thème ; seule la présentation change.
 *   renderMainMenu(data)      -> string
 *   renderCategoryMenu(data)  -> string
 *   renderCommandDetail(data) -> string
 *   renderStartup(data)       -> string
 *   renderWelcome(data)       -> string
 *   renderBye(data)           -> string
 * }
 *
 * Pour ajouter un thème : créer un fichier dans src/themes/ qui exporte cet
 * objet. Aucune autre modification n'est nécessaire (chargement 100%
 * automatique, comme core/pluginLoader.js pour les commandes).
 */

const registry = new Map(); // name -> thème (default export)
let loaded = false;

export async function loadThemes() {
  if (loaded) return;

  const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith('.js') && f !== ENGINE_FILE);

  for (const file of files) {
    const fileUrl = pathToFileURL(path.join(THEMES_DIR, file)).href;
    const module = await import(fileUrl);
    const theme = module.default;

    if (!theme?.name || typeof theme.renderMainMenu !== 'function') {
      logger.warn(`Thème ignoré (format invalide) : ${file}`);
      continue;
    }

    registry.set(theme.name, theme);
    logger.info(`Thème chargé : ${theme.name}`);
  }

  loaded = true;
}

export function listThemeNames() {
  return [...registry.keys()];
}

/** Le thème actif — retombe sur le thème par défaut si le nom stocké est invalide/absent. */
export function getCurrentTheme() {
  return registry.get(config.theme) || registry.get(DEFAULT_THEME);
}

export function getThemeName() {
  return registry.has(config.theme) ? config.theme : DEFAULT_THEME;
}

/** Change le thème global, avec effet immédiat + persistance dans settings.json. */
export function setTheme(name) {
  if (!registry.has(name)) {
    throw new Error(`Thème inconnu : "${name}". Disponibles : ${listThemeNames().join(', ')}`);
  }

  const oldTheme = config.theme;
  config.theme = name; // effet immédiat, même principe que config.prefix (voir commands/prefix.js)

  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    raw.theme = name;
    writeFileSync(SETTINGS_FILE, JSON.stringify(raw, null, 2));
  } catch (err) {
    config.theme = oldTheme;
    throw err;
  }
}
