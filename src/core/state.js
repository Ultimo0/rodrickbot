import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const STATE_FILE = path.join(process.cwd(), 'state.json');

let state = {
  // Si true: seul l'admin (défini dans ADMIN_JIDS) peut utiliser le bot,
  // peu importe la commande ou le chat (privé ou groupe).
  lockdownMode: false,
  // Nombre d'exécutions par commande, cumulatif et persisté (contrairement
  // à processedMessageCount ci-dessous) — sert aux statistiques envoyées
  // au dashboard de suivi (voir core/telemetry.js).
  commandStats: {},
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

// Écriture différée pour les changements fréquents (ex: commandStats à
// chaque commande) : on marque juste "à sauvegarder" et un intervalle
// écrit réellement sur le disque au plus une fois toutes les 30s, au
// lieu de réécrire le fichier à chaque exécution de commande.
let dirty = false;
let flushIntervalHandle = null;

function scheduleSave() {
  dirty = true;
  if (!flushIntervalHandle) {
    flushIntervalHandle = setInterval(() => {
      if (dirty) {
        saveState();
        dirty = false;
      }
    }, 30 * 1000);
    flushIntervalHandle.unref?.(); // ne doit pas empêcher le process de s'arrêter proprement
  }
}

function flushPendingSave() {
  if (dirty) {
    saveState();
    dirty = false;
  }
}

// Ne jamais perdre les derniers compteurs si le bot est arrêté/redémarré
// entre deux flushs automatiques (ex: redéploiement, `pm2 restart`, Ctrl+C).
process.on('SIGINT', () => {
  flushPendingSave();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushPendingSave();
  process.exit(0);
});

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

/** Incrémente le compteur d'usage d'une commande (par son nom canonique). */
export function incrementCommandCount(name) {
  state.commandStats[name] = (state.commandStats[name] || 0) + 1;
  scheduleSave();
}

/** Copie des statistiques d'usage par commande: { nomCommande: nombreDExecutions }. */
export function getCommandStats() {
  return { ...state.commandStats };
}