import path from 'path';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

/** Paramètres persistants par groupe : welcome, bye, antilink. */

const DATA_FILE = path.join(process.cwd(), 'group_settings.json');

let settings = {};

function load() {
  settings = readJsonFile(DATA_FILE, {}, 'group_settings.json');
}

/** Lève une erreur si l'écriture échoue : la commande appelante doit répondre par un échec. */
function persist() {
  writeJsonFile(DATA_FILE, settings, 'group_settings.json');
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
  return settings[chatId] ? { ...DEFAULTS, ...settings[chatId] } : { ...DEFAULTS };
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