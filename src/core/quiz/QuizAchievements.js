import { getStats, unlockAchievement } from './QuizStatistics.js';

/**
 * QuizAchievements
 * ----------------
 * Chaque succès est une règle pure `(stats) => boolean`. Pour en ajouter
 * un : une entrée dans ACHIEVEMENTS, rien d'autre à modifier. Évalués
 * après chaque réponse et après chaque fin de quiz (voir QuizEngine),
 * jamais en cours de route ailleurs.
 */

const ACHIEVEMENTS = [
  {
    id: 'premiere_bonne_reponse',
    label: '🎯 Premier pas',
    check: (s) => s.totalCorrect >= 1,
  },
  {
    id: 'serie_5',
    label: '🔥 Série de 5',
    check: (s) => s.bestStreak >= 5,
  },
  {
    id: 'serie_10',
    label: '🔥🔥 Série de 10',
    check: (s) => s.bestStreak >= 10,
  },
  {
    id: 'niveau_5',
    label: '⭐ Niveau 5',
    check: (s) => s.level >= 5,
  },
  {
    id: 'dix_quiz',
    label: '🏆 10 quiz terminés',
    check: (s) => s.quizzesCompleted >= 10,
  },
  {
    id: 'cent_bonnes_reponses',
    label: '💯 100 bonnes réponses',
    check: (s) => s.totalCorrect >= 100,
  },
];

/**
 * Évalue tous les succès pour un utilisateur, débloque ceux qui manquent.
 * @returns {Array<{id: string, label: string}>} succès nouvellement débloqués
 */
export function evaluateAchievements(userId) {
  const stats = getStats(userId);
  const unlocked = [];

  for (const achievement of ACHIEVEMENTS) {
    if (stats.achievements.includes(achievement.id)) continue;
    if (achievement.check(stats)) {
      unlockAchievement(userId, achievement.id);
      unlocked.push({ id: achievement.id, label: achievement.label });
    }
  }

  return unlocked;
}

export function listAllAchievements() {
  return ACHIEVEMENTS.map(({ id, label }) => ({ id, label }));
}
