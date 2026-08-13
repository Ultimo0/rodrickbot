/**
 * CalcRewards
 * -----------
 * Barème volontairement simple : points de base selon la difficulté, bonus
 * de vitesse (répondre dans la première moitié du temps imparti), bonus de
 * série (à partir de 3 bonnes réponses d'affilée). Une mauvaise réponse ou
 * un dépassement du délai ne rapporte jamais rien et casse la série.
 */

const BASE_POINTS = { facile: 5, moyen: 10, difficile: 15 };

export function computeReward({ correct, difficulty, responseTimeMs, windowMs, streakBeforeAnswer }) {
  if (!correct) {
    return { points: 0, base: 0, speedBonus: 0, streakBonus: 0 };
  }

  const base = BASE_POINTS[difficulty] ?? BASE_POINTS.moyen;
  const speedBonus = responseTimeMs <= windowMs / 2 ? Math.round(base / 2) : 0;
  const streakBonus = streakBeforeAnswer >= 3 ? Math.min(streakBeforeAnswer, 10) : 0;

  return { points: base + speedBonus + streakBonus, base, speedBonus, streakBonus };
}
