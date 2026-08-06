import path from 'path';
import { logger } from '../utils/logger.js';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

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
  state = { ...state, ...readJsonFile(STATE_FILE, {}, 'state.json') };
}

/** Lève une erreur si l'écriture échoue (l'appelant doit le signaler à l'utilisateur). */
function saveState() {
  writeJsonFile(STATE_FILE, state, 'state.json');
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
      // Flush de fond: rien à qui remonter l'erreur, on la trace et on
      // garde `dirty` à true pour retenter au prochain intervalle.
      if (dirty) {
        try {
          saveState();
          dirty = false;
        } catch (err) {
          logger.error({ err }, 'Flush périodique de state.json échoué, nouvelle tentative dans 30s');
        }
      }
    }, 30 * 1000);
    flushIntervalHandle.unref?.(); // ne doit pas empêcher le process de s'arrêter proprement
  }
}

function flushPendingSave() {
  if (!dirty) return;
  try {
    saveState();
    dirty = false;
  } catch (err) {
    logger.error({ err }, 'Flush final de state.json échoué, les derniers compteurs sont perdus');
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