import { getAllStats, computeLevel } from './CalcStatistics.js';

/** Même logique que QuizRanking, sur les points du calcul mental. */
export function getLeaderboard({ limit = 10 } = {}) {
  const all = getAllStats();
  return Object.entries(all)
    .map(([userId, stats]) => ({ userId, points: stats.points, level: computeLevel(stats.points) }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

export function getUserRank(userId) {
  const all = getAllStats();
  const ranked = Object.entries(all)
    .map(([id, stats]) => ({ userId: id, points: stats.points }))
    .sort((a, b) => b.points - a.points);

  const index = ranked.findIndex((entry) => entry.userId === userId);
  if (index === -1) return null;
  return { rank: index + 1, total: ranked.length };
}
