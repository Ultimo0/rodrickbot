import { computeLevel } from './QuizStatistics.js';

/**
 * QuizRenderer
 * ------------
 * Seul module qui sait à quoi ressemble un message Quiz. QuizEngine lui
 * donne des données brutes (question, session, stats...), jamais l'inverse
 * — même principe de séparation que src/themes/engine.js pour le menu.
 *
 * Historique technique : la première version utilisait le message liste
 * natif WhatsApp (`sections`/`rows`) pour un vrai "clic sur bouton". Testé
 * en conditions réelles, WhatsApp l'affiche en texte brut sans aucune ligne
 * cliquable pour les comptes personnels (non-Business) — restriction
 * plateforme, pas un bug Baileys. Le carrousel est donc désormais du texte
 * pur avec options numérotées ; la réponse n'est acceptée que sous forme
 * d'un chiffre nu envoyé pendant qu'une session est active (validé côté
 * serveur dans QuizEngine/QuizInteractionGuard), jamais de texte libre.
 */

const DIFFICULTY_LABELS = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
const DIFFICULTY_ICONS = { facile: '🟢', moyen: '🟡', difficile: '🔴' };

/** Emoji "touche numérique" (1️⃣, 2️⃣...) pour les chiffres 1-9, sinon "10." simple. */
function keycap(n) {
  return n >= 1 && n <= 9 ? `${n}\uFE0F\u20E3` : `${n}.`;
}

/** Carte "question" du carrousel : une par question, envoyée séquentiellement.
 * Réponse attendue : un simple chiffre en texte (voir QuizEngine.handleAnswerText) —
 * WhatsApp ne rend plus de façon fiable les messages liste/boutons pour les
 * comptes personnels (non-Business), donc pas de vrais boutons cliquables ici. */
export function renderQuestionCard({ session, question, questionNumber, totalQuestions }) {
  const diffIcon = DIFFICULTY_ICONS[question.difficulty] || '⚪';
  const diffLabel = DIFFICULTY_LABELS[question.difficulty] || question.difficulty;
  const optionsBlock = question.options.map((option, index) => `${keycap(index + 1)} ${option}`).join('\n');

  return {
    text:
      `❓ *Question ${questionNumber}/${totalQuestions}* — ${diffIcon} ${diffLabel} · 📚 ${question.category}\n\n` +
      `${question.question}\n\n` +
      `${optionsBlock}\n\n` +
      `Série en cours : ${session.streak} 🔥\n` +
      `_Réponds simplement avec le numéro (1 à ${question.options.length})._`,
  };
}

/** Feedback envoyé juste après un clic, avant la question suivante (ou le résumé). */
export function renderAnswerFeedback({ correct, question, reward, streak }) {
  if (correct) {
    const bonus = reward.streakBonus > 0 ? ` (dont +${reward.streakBonus} bonus série 🔥${streak})` : '';
    return {
      text:
        `✅ *Bonne réponse !*\n\n` +
        `+${reward.xp} XP${bonus}\n` +
        `+${reward.coins} 🪙`,
    };
  }

  const correctOption = question.options[question.correctIndex];
  return {
    text:
      `❌ *Mauvaise réponse.*\n\n` +
      `La bonne réponse était : *${correctOption}*\n` +
      (question.explanation ? `\n💡 ${question.explanation}` : ''),
  };
}

/** Résumé de fin de quiz (terminé normalement). */
export function renderQuizSummary({ session, totalQuestions, perfectBonus, newAchievements, userStats }) {
  const percent = totalQuestions > 0 ? Math.round((session.correctCount / totalQuestions) * 100) : 0;

  const lines = [
    '🏁 *Quiz terminé !*',
    '',
    `Score : ${session.correctCount}/${totalQuestions} (${percent}%)`,
    `Meilleure série : ${session.bestStreak} 🔥`,
    `XP gagné ce quiz : ${session.score} XP`,
  ];

  if (perfectBonus.xp > 0 || perfectBonus.coins > 0) {
    lines.push(`🌟 Sans-faute ! Bonus : +${perfectBonus.xp} XP, +${perfectBonus.coins} 🪙`);
  }

  lines.push('', `Niveau actuel : ${userStats.level} (${userStats.xp} XP total)`, `Pièces : ${userStats.coins} 🪙`);

  if (newAchievements.length) {
    lines.push('', '🏆 *Nouveaux succès débloqués :*', ...newAchievements.map((a) => `• ${a.label}`));
  }

  lines.push('', 'Tape /quiz pour rejouer, /quiz stats pour tes statistiques.');

  return { text: lines.join('\n') };
}

/** Message envoyé quand une session expire par inactivité (10 min). */
export function renderSessionExpired() {
  return {
    text:
      '⌛ Ton quiz a été interrompu après 10 minutes d\'inactivité.\n' +
      'Ta progression jusque-là a été sauvegardée dans tes statistiques.\n\n' +
      'Tape /quiz pour recommencer.',
  };
}

export function renderAbandonConfirmation() {
  return { text: '🚪 Quiz abandonné. Ta progression jusque-là a été sauvegardée.' };
}

export function renderStats(stats) {
  const level = computeLevel(stats.xp);
  const winRate = stats.totalAnswered > 0 ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;

  const lines = [
    '📊 *Tes statistiques Quiz*',
    '',
    `Niveau ${level} — ${stats.xp} XP`,
    `Pièces : ${stats.coins} 🪙`,
    `Bonnes réponses : ${stats.totalCorrect}/${stats.totalAnswered} (${winRate}%)`,
    `Meilleure série : ${stats.bestStreak} 🔥`,
    `Quiz terminés : ${stats.quizzesCompleted} · abandonnés : ${stats.quizzesAbandoned}`,
    `Succès débloqués : ${stats.achievements.length}`,
  ];

  return { text: lines.join('\n') };
}

export function renderLeaderboard(entries, { userRank } = {}) {
  if (!entries.length) {
    return { text: '📉 Aucun classement pour le moment — sois le premier avec /quiz !' };
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ['🏆 *Classement Quiz*', ''];

  entries.forEach((entry, index) => {
    const rankIcon = medals[index] || `${index + 1}.`;
    const name = entry.userId.split('@')[0];
    lines.push(`${rankIcon} ${name} — Niveau ${entry.level} · ${entry.xp} XP`);
  });

  if (userRank) {
    lines.push('', `Ton rang : #${userRank.rank} sur ${userRank.total}`);
  }

  return { text: lines.join('\n') };
}

/** Diagnostic admin : liste des sessions quiz actives (/quiz sessions). */
export function renderSessionsList(sessions) {
  if (!sessions.length) {
    return { text: '📭 Aucune session quiz active en ce moment.' };
  }

  const lines = ['🗂️ *Sessions quiz actives*', ''];
  sessions.forEach((session, index) => {
    const name = session.userId.split('@')[0];
    const minutesAgo = Math.max(0, Math.round((Date.now() - session.lastActivityAt) / 60000));
    const category = session.category ? ` · ${session.category}` : '';
    lines.push(
      `${index + 1}. ${name} — question ${session.currentIndex + 1}/${session.questionIds.length}${category} · inactif depuis ${minutesAgo} min`
    );
  });

  lines.push('', 'Usage : /quiz sessions clear [@mention|numero] — sans argument, supprime TOUTES les sessions actives.');
  return { text: lines.join('\n') };
}

export function renderCategoriesList(categories) {
  const lines = [
    '📚 *Catégories disponibles*',
    '',
    ...categories.map((c) => `• ${c}`),
    '',
    'Usage : /quiz <categorie> — ou /quiz random pour une catégorie aléatoire.',
  ];
  return { text: lines.join('\n') };
}

/** Message de confirmation avant réinitialisation. Réponse attendue : "1" (confirmer) ou "2" (annuler). */
export function renderResetConfirmation() {
  return {
    text:
      '⚠️ *Réinitialisation du quiz*\n\n' +
      'Ceci va supprimer DÉFINITIVEMENT : XP, niveau, pièces, historique, séries et succès.\n' +
      'Cette action est irréversible.\n\n' +
      `${keycap(1)} Confirmer la suppression\n` +
      `${keycap(2)} Annuler\n\n` +
      'Réponds avec 1 ou 2 (valable 5 minutes).',
  };
}

export function renderResetDone() {
  return { text: '🗑️ Statistiques Quiz réinitialisées : XP, pièces, niveau, historique et succès sont repartis à zéro.' };
}

export function renderResetCancelled() {
  return { text: 'Réinitialisation annulée. Tes données sont intactes.' };
}

/** Confirmation avant réinitialisation GLOBALE (admin — /quiz resetall). Réponse attendue : "1" ou "2". */
export function renderGlobalResetConfirmation(profileCount) {
  return {
    text:
      '🚨 *Réinitialisation GLOBALE du quiz*\n\n' +
      `Ceci va supprimer DÉFINITIVEMENT les données de ${profileCount} utilisateur(s) : XP, niveaux, pièces, ` +
      'historiques, séries et succès. Toute partie en cours sera interrompue.\n' +
      'Cette action est irréversible et concerne TOUT LE MONDE, pas seulement toi.\n\n' +
      `${keycap(1)} Confirmer pour tout le monde\n` +
      `${keycap(2)} Annuler\n\n` +
      'Réponds avec 1 ou 2 (valable 5 minutes).',
  };
}

export function renderGlobalResetDone({ sessionsCleared, profilesDeleted }) {
  return {
    text:
      `🗑️ Réinitialisation globale effectuée : ${profilesDeleted} profil(s) supprimé(s)` +
      (sessionsCleared > 0 ? `, ${sessionsCleared} partie(s) en cours interrompue(s).` : '.'),
  };
}

export function renderGlobalResetCancelled() {
  return { text: 'Réinitialisation globale annulée. Aucune donnée touchée.' };
}
