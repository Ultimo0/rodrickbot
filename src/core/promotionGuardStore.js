import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Compteur d'avertissements dédié à !antipromote — volontairement séparé de
 * core/warnStore.js (utilisé par !warn et l'antilink). La conséquence n'est
 * pas la même (rétrogradation de l'auteur, pas expulsion) : partager le même
 * compteur ferait qu'un avertissement !warn ordinaire, sans rapport avec une
 * promotion illégitime, compterait pour cette sanction-là.
 */

const DATA_FILE = path.join(process.cwd(), 'promotion_guard_warnings.json');
export const WARN_LIMIT = 3;

let warnings = {}; // { [chatId]: { [jid]: count } }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    warnings = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire promotion_guard_warnings.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(warnings, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire promotion_guard_warnings.json");
  }
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
