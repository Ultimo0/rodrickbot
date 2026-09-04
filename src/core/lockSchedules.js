import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';

const DATA_FILE = dataFilePath('lock_schedules.json');

let schedules = {};

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    schedules = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire lock_schedules.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(schedules, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire lock_schedules.json");
  }
}

load();

export function setSchedule(chatId, action, at) {
  schedules[chatId] = { action, at };
  persist();
}

export function clearSchedule(chatId) {
  if (schedules[chatId]) {
    delete schedules[chatId];
    persist();
  }
}

export function getAllSchedules() {
  return { ...schedules };
}