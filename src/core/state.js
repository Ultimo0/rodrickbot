import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const STATE_FILE = path.join(process.cwd(), 'state.json');

let state = {
  // Si true: seul l'admin (défini dans ADMIN_JIDS) peut utiliser le bot,
  // peu importe la commande ou le chat (privé ou groupe).
  lockdownMode: false,
};

function loadState() {
  if (!existsSync(STATE_FILE)) return;
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    state = { ...state, ...JSON.parse(raw) };
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire state.json, valeurs par défaut utilisées');
  }
}

function saveState() {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error({ err }, 'Impossible d\'écrire state.json');
  }
}

loadState();

export function isLockdownMode() {
  return state.lockdownMode;
}

export function setLockdownMode(value) {
  state.lockdownMode = value;
  saveState();
}

// Compteur de messages traités depuis le démarrage. Volontairement non
// persisté (pas dans state.json) car il n'a de sens que pour la session
// en cours — il repart naturellement à zéro à chaque redémarrage.
let processedMessageCount = 0;

export function incrementMessageCount() {
  processedMessageCount += 1;
}

export function getMessageCount() {
  return processedMessageCount;
}