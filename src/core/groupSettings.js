import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/** Paramètres persistants par groupe : welcome, bye, antilink. */

const DATA_FILE = path.join(process.cwd(), 'group_settings.json');

let settings = {};

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    settings = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire group_settings.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire group_settings.json");
  }
}

load();

const DEFAULTS = {
  welcome: { enabled: false, message: null },
  bye: { enabled: false, message: null },
  antilink: { enabled: false },
};

function ensure(chatId) {
  if (!settings[chatId]) {
    settings[chatId] = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return settings[chatId];
}

export function getGroupSettings(chatId) {
  // Copie profonde : une copie superficielle partagerait les objets imbriqués
  // (welcome/bye/antilink) avec DEFAULTS, donc entre tous les groupes.
  return structuredClone({ ...DEFAULTS, ...settings[chatId] });
}

export function setWelcome(chatId, enabled, message = null) {
  const g = ensure(chatId);
  g.welcome = { enabled, message: message ?? g.welcome.message };
  persist();
}

export function setBye(chatId, enabled, message = null) {
  const g = ensure(chatId);
  g.bye = { enabled, message: message ?? g.bye.message };
  persist();
}

export function setAntilink(chatId, enabled) {
  const g = ensure(chatId);
  g.antilink = { enabled };
  persist();
}