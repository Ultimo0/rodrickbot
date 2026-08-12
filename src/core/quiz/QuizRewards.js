/**
 * QuizRewards
 * -----------
 * Pure logique de calcul (aucun accès disque, aucun état) : facile à
 * tester unitairement et à retoucher (équilibrage) sans risquer de casser
 * la persistance ou le rendu.
 */

const BASE_XP = { facile: 10, moyen: 20, difficile: 35 };
const BASE_COINS = { facile: 5, moyen: 10, difficile: 15 };
const STREAK_BONUS_XP_PER_STEP = 2; // +2 XP par bonne réponse consécutive au-delà de la 1ère
const STREAK_BONUS_CAP = 10; // plafonne le bonus de série (évite une inflation infinie)

export function computeReward({ correct, difficulty = 'moyen', streakBeforeAnswer = 0 }) {
  if (!correct) {
    return { xp: 0, coins: 0, streakBonus: 0 };
  }

  const baseXp = BASE_XP[difficulty] ?? BASE_XP.moyen;
  const baseCoins = BASE_COINS[difficulty] ?? BASE_COINS.moyen;
  const streakBonus = Math.min(streakBeforeAnswer, STREAK_BONUS_CAP) * STREAK_BONUS_XP_PER_STEP;

  return {
    xp: baseXp + streakBonus,
    coins: baseCoins,
    streakBonus,
  };
}

/** Bonus de fin de quiz si toutes les questions sont correctes ("sans-faute"). */
export function computePerfectRunBonus({ totalQuestions, correctCount, difficulty = 'moyen' }) {
  if (totalQuestions === 0 || correctCount !== totalQuestions) {
    return { xp: 0, coins: 0 };
  }
  const baseCoins = BASE_COINS[difficulty] ?? BASE_COINS.moyen;
  return { xp: totalQuestions * 5, coins: Math.ceil(baseCoins / 2) };
}
