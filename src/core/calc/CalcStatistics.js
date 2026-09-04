import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../utils/atomicWrite.js';
import { dataFilePath } from '../../utils/dataFile.js';
import { logger } from '../../utils/logger.js';

const DATA_FILE = dataFilePath('calc_stats.json');
const MAX_HISTORY = 20;

/**
 * CalcStatistics
 * --------------
 * Même rôle que QuizStatistics, monnaie et progression séparées de celles
 * du quiz volontairement (deux jeux, deux économies indépendantes pour
 * l'instant — fusionner en un portefeuille commun serait un refactor à
 * part, pas fait ici pour ne pas toucher au code du quiz déjà en place).
 */

let stats = {}; // { [userId]: UserStats }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    stats = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire calc_stats.json, statistiques réinitialisées en mémoire');
    stats = {};
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(stats, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire calc_stats.json");
  }
}

load();

function emptyUserStats() {
  return {
    points: 0,
    level: 1,
    totalAnswered: 0,
    totalCorrect: 0,
    bestStreak: 0,
    gamesCompleted: 0,
    gamesAbandoned: 0,
    history: [],
  };
}

// Même formule que QuizStatistics.computeLevel, dupliquée volontairement
// (voir note en tête de fichier) pour garder le même "feel" de progression.
export function computeLevel(points) {
  return Math.floor(points / 100) + 1;
}

export function getStats(userId) {
  if (!stats[userId]) stats[userId] = emptyUserStats();
  return stats[userId];
}

export function recordAnswer(userId, { correct, pointsGained = 0 }) {
  const user = getStats(userId);
  user.totalAnswered += 1;
  if (correct) user.totalCorrect += 1;
  user.points += pointsGained;
  user.level = computeLevel(user.points);
  persist();
  return user;
}

export function recordGameEnd(userId, { sessionId, status, score, correctCount, totalQuestions, bestStreak }) {
  const user = getStats(userId);
  if (status === 'completed') user.gamesCompleted += 1;
  if (status === 'abandoned' || status === 'stale') user.gamesAbandoned += 1;
  user.bestStreak = Math.max(user.bestStreak, bestStreak);

  user.history.unshift({ sessionId, status, score, correctCount, totalQuestions, endedAt: Date.now() });
  user.history = user.history.slice(0, MAX_HISTORY);

  persist();
  return user;
}

export function getAllStats() {
  return stats;
}

export function deleteUserStats(userId) {
  if (!(userId in stats)) return false;
  delete stats[userId];
  persist();
  return true;
}

/**
 * Efface TOUTES les données de TOUS les utilisateurs (usage admin — voir
 * !calcul purge). Retourne le nombre de profils effacés.
 */
export function deleteAllStats() {
  const count = Object.keys(stats).length;
  stats = {};
  persist();
  return count;
}
