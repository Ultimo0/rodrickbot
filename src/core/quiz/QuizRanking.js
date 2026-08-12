import { getAllStats } from './QuizStatistics.js';

/**
 * QuizRanking
 * -----------
 * Dérive un classement à la demande depuis QuizStatistics — aucun état
 * propre, aucune persistance : le classement n'est jamais qu'une vue
 * triée des stats existantes, donc jamais désynchronisé.
 */
export function getLeaderboard({ limit = 10 } = {}) {
  const all = getAllStats();

  return Object.entries(all)
    .map(([userId, s]) => ({
      userId,
      xp: s.xp,
      level: s.level,
      coins: s.coins,
      quizzesCompleted: s.quizzesCompleted,
      bestStreak: s.bestStreak,
    }))
    .sort((a, b) => b.xp - a.xp || b.quizzesCompleted - a.quizzesCompleted)
    .slice(0, limit);
}

export function getUserRank(userId) {
  const all = getAllStats();
  const sorted = Object.entries(all).sort(([, a], [, b]) => b.xp - a.xp);
  const index = sorted.findIndex(([id]) => id === userId);
  return index === -1 ? null : { rank: index + 1, total: sorted.length };
}
