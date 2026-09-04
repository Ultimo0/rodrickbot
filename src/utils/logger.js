import pino from 'pino';
import { existsSync, statSync, copyFileSync, truncateSync, unlinkSync, renameSync } from 'fs';
import { config } from '../config/index.js';
import { dataFilePath } from './dataFile.js';

const LOG_FILE = dataFilePath('logs/bot.log');
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo avant rotation
const MAX_ROTATED_FILES = 3; // bot.log.1 (le plus récent) à bot.log.3 (le plus ancien, supprimé ensuite)
const ROTATION_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

/**
 * Rotation par "copytruncate" plutôt que par renommage classique.
 * Pourquoi : pino/file garde un file descriptor ouvert en continu sur
 * LOG_FILE. Un rename() détache ce fd du chemin (il continuerait à écrire
 * dans le fichier renommé, invisible pour la suite), alors qu'un
 * truncate() sur le fichier ENCORE OUVERT reste valide : les écritures en
 * mode append suivantes repartent proprement de zéro dans le même fichier.
 * On copie donc l'ancien contenu vers .1 avant de vider l'original, sans
 * jamais fermer/rouvrir le fd que pino détient déjà.
 */
function rotateLogFileIfNeeded() {
  if (!existsSync(LOG_FILE)) return;

  let size;
  try {
    size = statSync(LOG_FILE).size;
  } catch {
    return;
  }
  if (size < MAX_LOG_SIZE_BYTES) return;

  for (let i = MAX_ROTATED_FILES; i >= 2; i--) {
    const from = `${LOG_FILE}.${i - 1}`;
    const to = `${LOG_FILE}.${i}`;
    if (existsSync(to)) {
      try {
        unlinkSync(to);
      } catch {
        // non bloquant : au pire une archive de trop traîne
      }
    }
    if (existsSync(from)) {
      try {
        renameSync(from, to);
      } catch {
        // non bloquant
      }
    }
  }

  try {
    copyFileSync(LOG_FILE, `${LOG_FILE}.1`);
    truncateSync(LOG_FILE, 0);
  } catch {
    // non bloquant : au pire le fichier grossit un peu plus avant la
    // prochaine vérification, pas une raison de faire planter le logger
  }
}

function buildTransportTargets() {
  const targets = [
    {
      target: 'pino-pretty',
      level: config.logLevel,
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  ];

  if (config.logToFile) {
    rotateLogFileIfNeeded(); // repart propre si le fichier était déjà trop gros au démarrage précédent
    targets.push({
      target: 'pino/file',
      level: config.logLevel,
      options: { destination: LOG_FILE, mkdir: true },
    });

    setInterval(rotateLogFileIfNeeded, ROTATION_CHECK_INTERVAL_MS).unref?.();
  }

  return targets;
}

/**
 * Logger unique partagé par tout le projet.
 * Baileys a besoin d'un logger "pino-compatible" (avec .child()),
 * donc on lui passe directement cette instance.
 */
export const logger = pino({
  level: config.logLevel,
  transport: { targets: buildTransportTargets() },
});
