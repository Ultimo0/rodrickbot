import path from 'path';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

const DATA_FILE = path.join(process.cwd(), 'warnings.json');
export const WARN_LIMIT = 3;

let warnings = {}; // { [chatId]: { [jid]: count } }

function load() {
  warnings = readJsonFile(DATA_FILE, {}, 'warnings.json');
}

/** Lève une erreur si l'écriture échoue : l'appelant doit le signaler. */
function persist() {
  writeJsonFile(DATA_FILE, warnings, 'warnings.json');
}

load();

export function addWarn(chatId, jid) {
  if (!warnings[chatId]) warnings[chatId] = {};
  warnings[chatId][jid] = (warnings[chatId][jid] || 0) + 1;
  persist();
  return warnings[chatId][jid];
}

export function getWarns(chatId, jid) {
  return warnings[chatId]?.[jid] || 0;
}

export function resetWarns(chatId, jid) {
  if (warnings[chatId]?.[jid] !== undefined) {
    delete warnings[chatId][jid];
    persist();
  }
}