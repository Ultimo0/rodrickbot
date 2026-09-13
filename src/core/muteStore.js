import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';

/**
 * WhatsApp n'offre aucun moyen natif de faire taire UN membre précis d'un
 * groupe (seul le mode "annonces uniquement", qui s'applique à tous les
 * non-admins, existe côté API). Le "mute" ici est donc appliqué par le bot
 * lui-même : tout message envoyé par un membre muet dans ce groupe est
 * immédiatement supprimé (voir utils/muteGuard.js), jusqu'à {prefix}unmute.
 */

const DATA_FILE = dataFilePath('muted.json');

let muted = {}; // { [chatId]: [jid, ...] }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    muted = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire muted.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(muted, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire muted.json");
  }
}

load();

export function muteUser(chatId, jid) {
  const list = new Set(muted[chatId] || []);
  list.add(jid);
  muted[chatId] = [...list];
  persist();
}

export function unmuteUser(chatId, jid) {
  if (!muted[chatId]) return false;
  const before = muted[chatId].length;
  muted[chatId] = muted[chatId].filter((j) => j !== jid);
  persist();
  return muted[chatId].length !== before;
}

export function isMuted(chatId, jid) {
  return (muted[chatId] || []).includes(jid);
}

export function getMutedList(chatId) {
  return muted[chatId] || [];
}
