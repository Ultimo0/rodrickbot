import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { toScriptFont, toBoldFont, toSansBoldFont, toMonospaceFont } from './fancyFont.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

/**
 * Thèmes visuels du bot : appliqués partout (menu, message de démarrage,
 * welcome/bye, et tous les libellés/sections de chaque message — pas
 * seulement les grands titres). Chaque thème définit une police (Unicode,
 * voir fancyFont.js), un style de bordure pour les encadrés, et un emoji
 * d'accent.
 *
 * Le marqueur de citation ("> ") n'est PAS thémé : il reste fixe quel que
 * soit le thème (identité visuelle constante du bot, voir toQuoteBlock
 * dans utils/helpers.js).
 *
 * Thème global (comme le préfixe) : changé via !theme, persisté dans
 * settings.json, effet immédiat (pas de redémarrage).
 */
const THEMES = {
  classique: {
    label: 'Classique',
    font: toScriptFont,
    box: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    accent: '🤖',
  },
  royal: {
    label: 'Royal',
    font: toBoldFont,
    box: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
    accent: '👑',
  },
  neon: {
    label: 'Néon',
    font: toSansBoldFont,
    box: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
    accent: '⚡',
  },
  mono: {
    label: 'Mono',
    font: toMonospaceFont,
    box: { tl: '[', tr: ']', bl: '[', br: ']', h: '-', v: '|' },
    accent: '🖤',
  },
};

const DEFAULT_THEME = 'royal';

export function listThemeNames() {
  return Object.keys(THEMES);
}

/** Le thème actif — retombe sur "classique" si le nom stocké est invalide/absent. */
export function getCurrentTheme() {
  return THEMES[config.theme] || THEMES[DEFAULT_THEME];
}

export function getThemeName() {
  return THEMES[config.theme] ? config.theme : DEFAULT_THEME;
}

/** Change le thème global, avec effet immédiat + persistance dans settings.json. */
export function setTheme(name) {
  if (!THEMES[name]) {
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

/** Ligne de bordure haute/basse d'une largeur donnée, dans le style du thème actif. */
export function boxTop(width = 20, theme = getCurrentTheme()) {
  return theme.box.tl + theme.box.h.repeat(width) + theme.box.tr;
}

export function boxBottom(width = 20, theme = getCurrentTheme()) {
  return theme.box.bl + theme.box.h.repeat(width) + theme.box.br;
}

/** Ligne séparatrice (pied de message), dans le style du thème actif. */
export function themedSeparator(width = 19, theme = getCurrentTheme()) {
  return theme.box.h.repeat(width);
}

/** Applique la police du thème actif à un texte (titres ET libellés de section). */
export function themedTitle(text, theme = getCurrentTheme()) {
  return theme.font(text);
}
