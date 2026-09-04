import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Messages récurrents programmés par groupe (ex: "tous les jours à 8h").
 * Contrairement à lockSchedules.js (un seul créneau lock/unlock à la fois
 * par groupe, ponctuel), ici PLUSIEURS messages peuvent être programmés
 * pour un même groupe — donc un tableau par chatId plutôt qu'un objet
 * unique.
 */

const DATA_FILE = dataFilePath('message_schedules.json');

let schedules = {}; // chatId -> [{ id, time: "HH:MM", message }]

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    schedules = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire message_schedules.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(schedules, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire message_schedules.json");
  }
}

load();

export function addMessageSchedule(chatId, time, message) {
  const id = randomUUID().slice(0, 8);
  if (!schedules[chatId]) schedules[chatId] = [];
  schedules[chatId].push({ id, time, message });
  persist();
  return id;
}

export function removeMessageSchedule(chatId, id) {
  if (!schedules[chatId]) return false;
  const before = schedules[chatId].length;
  schedules[chatId] = schedules[chatId].filter((s) => s.id !== id);
  if (schedules[chatId].length === 0) delete schedules[chatId];
  persist();
  return schedules[chatId] === undefined ? before > 0 : before !== schedules[chatId].length;
}

export function getMessageSchedules(chatId) {
  return schedules[chatId] || [];
}

/** Toutes les programmations, tous groupes confondus — utilisé au démarrage pour tout replanifier. */
export function getAllMessageSchedules() {
  return { ...schedules };
}
