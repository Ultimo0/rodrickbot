import path from 'path';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

const DATA_FILE = path.join(process.cwd(), 'lock_schedules.json');

let schedules = {};

function load() {
  schedules = readJsonFile(DATA_FILE, {}, 'lock_schedules.json');
}

/** Lève une erreur si l'écriture échoue : l'appelant doit le signaler. */
function persist() {
  writeJsonFile(DATA_FILE, schedules, 'lock_schedules.json');
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