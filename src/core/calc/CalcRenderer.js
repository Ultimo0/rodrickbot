import { computeLevel } from './CalcStatistics.js';

/**
 * CalcRenderer
 * ------------
 * Même séparation que QuizRenderer : seul module qui sait à quoi ressemble
 * un message du jeu de calcul mental. Texte pur (pas de liste WhatsApp —
 * voir quiz/README.md pour pourquoi), réponse par nombre libre en texte.
 */

const DIFFICULTY_LABELS = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
const DIFFICULTY_ICONS = { facile: '🟢', moyen: '🟡', difficile: '🔴' };

export function renderQuestion({ session, operation, questionNumber, windowMs }) {
  const diffIcon = DIFFICULTY_ICONS[session.difficulty] || '⚪';
  const diffLabel = DIFFICULTY_LABELS[session.difficulty] || session.difficulty;
  const seconds = Math.round(windowMs / 1000);

  return {
    text:
      `🧮 *Calcul ${questionNumber}/${session.totalQuestions}* — ${diffIcon} ${diffLabel}\n\n` +
      `*${operation.text} = ?*\n\n` +
      `⏱️ ${seconds}s pour répondre · Série : ${session.streak} 🔥`,
  };
}

export function renderFeedback({ correct, timedOut, operation, reward, streak }) {
  if (correct) {
    const bonusParts = [];
    if (reward.speedBonus > 0) bonusParts.push(`+${reward.speedBonus} vitesse ⚡`);
    if (reward.streakBonus > 0) bonusParts.push(`+${reward.streakBonus} série 🔥${streak}`);
    const bonusText = bonusParts.length ? ` (${bonusParts.join(', ')})` : '';
    return { text: `✅ Correct ! +${reward.points} points${bonusText}` };
  }

  const prefix = timedOut ? '⌛ Trop tard !' : '❌ Faux.';
  return { text: `${prefix} La réponse était *${operation.answer}*.` };
}

export function renderSummary({ session, userStats }) {
  const percent = session.totalQuestions > 0 ? Math.round((session.correctCount / session.totalQuestions) * 100) : 0;

  const lines = [
    '🏁 *Calcul mental terminé !*',
    '',
    `Score : ${session.correctCount}/${session.totalQuestions} (${percent}%)`,
    `Meilleure série : ${session.bestStreak} 🔥`,
    `Points gagnés : ${session.score}`,
    '',
    `Niveau actuel : ${userStats.level} (${userStats.points} points total)`,
    '',
    'Tape /calcul pour rejouer, /calcul stats pour tes statistiques.',
  ];

  return { text: lines.join('\n') };
}

export function renderStats(stats) {
  const level = computeLevel(stats.points);
  const winRate = stats.totalAnswered > 0 ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;

  const lines = [
    '📊 *Tes statistiques Calcul mental*',
    '',
    `Niveau ${level} — ${stats.points} points`,
    `Bonnes réponses : ${stats.totalCorrect}/${stats.totalAnswered} (${winRate}%)`,
    `Meilleure série : ${stats.bestStreak} 🔥`,
    `Parties terminées : ${stats.gamesCompleted} · abandonnées : ${stats.gamesAbandoned}`,
  ];

  return { text: lines.join('\n') };
}

export function renderLeaderboard(entries, { userRank } = {}) {
  if (!entries.length) {
    return { text: '📉 Aucun classement pour le moment — sois le premier avec /calcul !' };
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ['🏆 *Classement Calcul mental*', ''];

  entries.forEach((entry, index) => {
    const rankIcon = medals[index] || `${index + 1}.`;
    const name = entry.userId.split('@')[0];
    lines.push(`${rankIcon} ${name} — Niveau ${entry.level} · ${entry.points} points`);
  });

  if (userRank) {
    lines.push('', `Ton rang : #${userRank.rank} sur ${userRank.total}`);
  }

  return { text: lines.join('\n') };
}
