/**
 * Statut "absent" (!afk) : persisté sur disque (afk.json) pour survivre à
 * un redémarrage du bot — un redémarrage/reconnexion ne doit pas effacer
 * le fait qu'une personne s'était mise absente juste avant.
 */

import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';

const DATA_FILE = dataFilePath('afk.json');

const afkUsers = new Map(); // jid normalisé -> { reason, since }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    for (const [jid, status] of Object.entries(raw)) {
      afkUsers.set(jid, status);
    }
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire afk.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(afkUsers), null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire afk.json");
  }
}

load();

export function setAfk(jid, reason) {
  afkUsers.set(jid, { reason: reason || 'Absent', since: Date.now() });
  persist();
}

/** Retire le statut absent et retourne l'ancien statut (ou null si la personne n'était pas absente). */
export function clearAfk(jid) {
  const previous = afkUsers.get(jid) || null;
  afkUsers.delete(jid);
  if (previous) persist();
  return previous;
}

export function getAfk(jid) {
  return afkUsers.get(jid) || null;
}
