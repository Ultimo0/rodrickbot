import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../utils/atomicWrite.js';
import { dataFilePath } from '../../utils/dataFile.js';
import { logger } from '../../utils/logger.js';

const DATA_FILE = dataFilePath('quiz_stats.json');
const MAX_HISTORY = 20;

/**
 * QuizStatistics
 * --------------
 * Stocke tout ce qui doit survivre à une session individuelle : XP,
 * pièces, niveau, séries, historique de parties, succès débloqués. Ignore
 * volontairement l'état "en cours" (géré par QuizSessionManager) — cette
 * séparation est ce qui permet à QuizResetService de tout effacer sans
 * jamais toucher aux sessions actives d'autres utilisateurs.
 */

let stats = {}; // { [userId]: UserStats }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    stats = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire quiz_stats.json, statistiques réinitialisées en mémoire');
    stats = {};
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(stats, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire quiz_stats.json");
  }
}

load();

function emptyUserStats() {
  return {
    xp: 0,
    coins: 0,
    level: 1,
    totalAnswered: 0,
    totalCorrect: 0,
    totalWrong: 0,
    currentStreak: 0,
    bestStreak: 0,
    quizzesCompleted: 0,
    quizzesAbandoned: 0,
    history: [],
    achievements: [],
  };
}

export function computeLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

export function getStats(userId) {
  if (!stats[userId]) {
    stats[userId] = emptyUserStats();
  }
  return stats[userId];
}

export function recordAnswer(userId, { correct, xpGained = 0, coinsGained = 0 }) {
  const user = getStats(userId);
  user.totalAnswered += 1;

  if (correct) {
    user.totalCorrect += 1;
    user.currentStreak += 1;
    user.bestStreak = Math.max(user.bestStreak, user.currentStreak);
  } else {
    user.totalWrong += 1;
    user.currentStreak = 0;
  }

  user.xp += xpGained;
  user.coins += coinsGained;
  user.level = computeLevel(user.xp);

  persist();
  return user;
}

/**
 * Crédite un bonus pur (XP/pièces) sans toucher aux compteurs de réponses
 * (totalAnswered, totalCorrect, streak...). Utilisé par le bonus "sans-faute"
 * de fin de quiz — recordAnswer() ferait gonfler artificiellement le taux de
 * réussite si on l'utilisait à sa place.
 */
export function addXpAndCoins(userId, { xp = 0, coins = 0 }) {
  const user = getStats(userId);
  user.xp += xp;
  user.coins += coins;
  user.level = computeLevel(user.xp);
  persist();
  return user;
}

export function recordQuizEnd(userId, { sessionId, status, score, correctCount, totalQuestions, category }) {
  const user = getStats(userId);

  if (status === 'completed') user.quizzesCompleted += 1;
  if (status === 'abandoned' || status === 'expired') user.quizzesAbandoned += 1;

  user.history.unshift({
    sessionId,
    status,
    score,
    correctCount,
    totalQuestions,
    category,
    endedAt: Date.now(),
  });
  user.history = user.history.slice(0, MAX_HISTORY);

  persist();
  return user;
}

export function unlockAchievement(userId, achievementId) {
  const user = getStats(userId);
  if (user.achievements.includes(achievementId)) return false;
  user.achievements.push(achievementId);
  persist();
  return true;
}

export function getAllStats() {
  return stats;
}

/**
 * Efface TOUTES les données d'un utilisateur (utilisé uniquement par
 * QuizResetService, après confirmation). Retourne true si un profil
 * existait effectivement.
 */
export function deleteUserStats(userId) {
  if (!(userId in stats)) return false;
  delete stats[userId];
  persist();
  return true;
}

/**
 * Efface TOUTES les données de TOUS les utilisateurs (utilisé uniquement par
 * QuizResetService, après confirmation admin — /quiz resetall). Retourne le
 * nombre de profils effacés.
 */
export function deleteAllStats() {
  const count = Object.keys(stats).length;
  stats = {};
  persist();
  return count;
}
