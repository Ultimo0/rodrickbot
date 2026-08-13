import { logger } from '../../utils/logger.js';
import {
  getActiveSessionForUser,
  createSession,
  getSession,
  updateSession,
  endSession,
  deleteSession,
  getAllSessions,
  purgeAllSessions,
} from './CalcSessionManager.js';
import { generateOperation } from './CalcGenerator.js';
import { isDuplicateDelivery, markDelivered, parseAnswerNumber } from './CalcInteractionGuard.js';
import { getStats, recordAnswer, recordGameEnd, deleteUserStats, deleteAllStats } from './CalcStatistics.js';
import { computeReward } from './CalcRewards.js';
import { getLeaderboard, getUserRank } from './CalcRanking.js';
import { scheduleQuestionTimeout, clearQuestionTimeout } from './CalcTimer.js';
import * as Renderer from './CalcRenderer.js';

export const CALC_QUESTIONS_PER_GAME = 10;
const DEFAULT_DIFFICULTY = 'moyen';
const DIFFICULTY_WINDOWS_MS = { facile: 15_000, moyen: 10_000, difficile: 7_000 };

/**
 * CalcEngine
 * ----------
 * Même rôle d'orchestrateur unique que QuizEngine. Particularité propre à
 * ce jeu : une réponse texte et l'expiration du délai de la question
 * peuvent arriver quasi en même temps (fenêtre de quelques secondes
 * seulement) — `resolveAnswer` est le seul chemin qui fait avancer une
 * partie, et `sessionsBeingProcessed` + la comparaison de `currentIndex`
 * dans `handleTimeout` garantissent qu'une seule des deux issues (réponse
 * réelle ou timeout) est jamais appliquée pour une question donnée.
 */

const sessionsBeingProcessed = new Set();

function windowFor(difficulty) {
  return DIFFICULTY_WINDOWS_MS[difficulty] || DIFFICULTY_WINDOWS_MS[DEFAULT_DIFFICULTY];
}

async function askQuestion(sock, session) {
  const windowMs = windowFor(session.difficulty);
  const operation = generateOperation(session.difficulty);
  const updated = updateSession(session.sessionId, { currentQuestion: { ...operation, askedAt: Date.now() } });

  await sock.sendMessage(
    updated.chatId,
    Renderer.renderQuestion({ session: updated, operation, questionNumber: updated.currentIndex + 1, windowMs })
  );

  const questionIndexAtSchedule = updated.currentIndex;
  scheduleQuestionTimeout(updated.sessionId, windowMs, (sessionId) => {
    handleTimeout(sock, sessionId, questionIndexAtSchedule).catch((err) =>
      logger.error({ err }, "Erreur lors du traitement d'un timeout de calcul mental")
    );
  });
}

/** Démarre une nouvelle partie. Retourne { ok, reason? }. */
export async function startGame(sock, { chatId, sender, difficulty }) {
  if (getActiveSessionForUser(sender)) {
    return { ok: false, reason: 'ACTIVE_SESSION' };
  }

  const chosenDifficulty = ['facile', 'moyen', 'difficile'].includes(difficulty) ? difficulty : DEFAULT_DIFFICULTY;
  const session = createSession({
    userId: sender,
    chatId,
    difficulty: chosenDifficulty,
    totalQuestions: CALC_QUESTIONS_PER_GAME,
  });

  await askQuestion(sock, session);
  return { ok: true, session };
}

async function finishGame(sock, sessionId) {
  const session = getSession(sessionId);
  if (!session) return;

  clearQuestionTimeout(sessionId);
  endSession(sessionId, 'completed');
  const final = getSession(sessionId);

  recordGameEnd(final.userId, {
    sessionId,
    status: 'completed',
    score: final.score,
    correctCount: final.correctCount,
    totalQuestions: final.totalQuestions,
    bestStreak: final.bestStreak,
  });

  const userStats = getStats(final.userId);
  await sock.sendMessage(final.chatId, Renderer.renderSummary({ session: final, userStats }));
}

/** Chemin unique qui fait avancer une partie, que la question ait été répondue à temps ou pas. */
async function resolveAnswer(sock, session, { correct, timedOut, responseTimeMs }) {
  const operation = session.currentQuestion;
  const reward = computeReward({
    correct,
    difficulty: session.difficulty,
    responseTimeMs,
    windowMs: windowFor(session.difficulty),
    streakBeforeAnswer: session.streak,
  });
  const newStreak = correct ? session.streak + 1 : 0;

  const updated = updateSession(session.sessionId, {
    score: session.score + reward.points,
    correctCount: session.correctCount + (correct ? 1 : 0),
    wrongCount: session.wrongCount + (correct ? 0 : 1),
    streak: newStreak,
    bestStreak: Math.max(session.bestStreak, newStreak),
    currentIndex: session.currentIndex + 1,
    currentQuestion: null,
  });

  recordAnswer(session.userId, { correct, pointsGained: reward.points });

  await sock.sendMessage(
    updated.chatId,
    Renderer.renderFeedback({ correct, timedOut, operation, reward, streak: newStreak })
  );

  if (updated.currentIndex < updated.totalQuestions) {
    await askQuestion(sock, updated);
  } else {
    await finishGame(sock, updated.sessionId);
  }
}

/**
 * Traite une tentative de réponse envoyée en texte (un entier nu, signé ou non).
 * Idempotent (redélivrance Baileys) ; renvoie false si le texte n'est pas
 * un nombre ou si l'utilisateur n'a pas de partie active — dans ce cas le
 * message continue son chemin normal dans messageHandler.js.
 */
export async function handleAnswerText(sock, { sender, messageId, text }) {
  const guess = parseAnswerNumber(text);
  if (guess === null) return false;

  const session = getActiveSessionForUser(sender);
  if (!session || !session.currentQuestion) return false;

  if (isDuplicateDelivery(messageId)) return true;
  if (sessionsBeingProcessed.has(session.sessionId)) return true; // anti-double-envoi concurrent

  markDelivered(messageId);
  clearQuestionTimeout(session.sessionId); // la vraie réponse coupe court au timeout de cette question

  sessionsBeingProcessed.add(session.sessionId);
  try {
    const responseTimeMs = Date.now() - session.currentQuestion.askedAt;
    const correct = guess === session.currentQuestion.answer;
    await resolveAnswer(sock, session, { correct, timedOut: false, responseTimeMs });
    return true;
  } finally {
    sessionsBeingProcessed.delete(session.sessionId);
  }
}

/** Déclenché par CalcTimer quand le délai d'une question expire sans réponse. */
async function handleTimeout(sock, sessionId, questionIndexAtSchedule) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'active') return;
  if (session.currentIndex !== questionIndexAtSchedule) return; // déjà résolue par une vraie réponse entre-temps
  if (sessionsBeingProcessed.has(sessionId)) return;

  sessionsBeingProcessed.add(sessionId);
  try {
    await resolveAnswer(sock, session, { correct: false, timedOut: true, responseTimeMs: windowFor(session.difficulty) });
  } finally {
    sessionsBeingProcessed.delete(sessionId);
  }
}

/** /calcul abandonner */
export async function abandonGame(sender) {
  const session = getActiveSessionForUser(sender);
  if (!session) return null;

  clearQuestionTimeout(session.sessionId);
  endSession(session.sessionId, 'abandoned');
  recordGameEnd(sender, {
    sessionId: session.sessionId,
    status: 'abandoned',
    score: session.score,
    correctCount: session.correctCount,
    totalQuestions: session.totalQuestions,
    bestStreak: session.bestStreak,
  });
  return session;
}

/**
 * Les timers de question sont en mémoire et courts (7-15s) : plutôt que
 * d'essayer de les reconstruire après un redémarrage (la fenêtre serait de
 * toute façon déjà dépassée ou quasi), on clôture proprement toute partie
 * restée "active" au démarrage. Appelé une seule fois au boot.
 */
export function cleanupStaleSessionsOnBoot() {
  let count = 0;
  for (const session of getAllSessions()) {
    if (session.status !== 'active') continue;
    endSession(session.sessionId, 'stale');
    recordGameEnd(session.userId, {
      sessionId: session.sessionId,
      status: 'stale',
      score: session.score,
      correctCount: session.correctCount,
      totalQuestions: session.totalQuestions,
      bestStreak: session.bestStreak,
    });
    count += 1;
  }
  if (count > 0) logger.info(`Calcul mental: ${count} partie(s) restée(s) active(s) avant redémarrage, clôturée(s)`);
  return count;
}

/** true si cet utilisateur a une partie de calcul mental en cours (utilisé par messageHandler.js et /quiz pour l'exclusion mutuelle). */
export function hasActiveSession(userId) {
  return Boolean(getActiveSessionForUser(userId));
}

export function getStatsMessage(userId) {
  return Renderer.renderStats(getStats(userId));
}

export function getLeaderboardMessage(userId) {
  const entries = getLeaderboard({ limit: 10 });
  const userRank = getUserRank(userId);
  return Renderer.renderLeaderboard(entries, { userRank });
}

/** Supprime intégralement les données Calcul mental d'un utilisateur (stats + partie active). */
export function wipeUserData(userId) {
  const active = getActiveSessionForUser(userId);
  if (active) {
    clearQuestionTimeout(active.sessionId);
    deleteSession(active.sessionId);
  }
  return deleteUserStats(userId);
}

/** Termine de force TOUTES les parties actives (usage admin), en notifiant chaque joueur concerné. */
async function forceEndAllSessions(sock) {
  const active = getAllSessions().filter((s) => s.status === 'active');
  for (const session of active) {
    clearQuestionTimeout(session.sessionId);
    endSession(session.sessionId, 'stale');
    try {
      await sock.sendMessage(session.chatId, {
        text: '⚠️ Ta partie de calcul mental en cours a été interrompue par un administrateur.',
      });
    } catch (err) {
      logger.warn({ err, sessionId: session.sessionId }, "Impossible de notifier l'interruption forcée du calcul mental");
    }
  }
  return active.length;
}

/**
 * Réinitialisation complète du module Calcul mental (usage admin —
 * !calcul purge) : vide les 2 fichiers de données du module en une seule
 * commande.
 *  1. Sessions actives : notifiées puis terminées.
 *  2. calc_sessions.json : vidé intégralement (historique compris).
 *  3. calc_stats.json : vidé intégralement (points, niveaux, historique de TOUS les utilisateurs).
 * Irréversible — pas de fenêtre de confirmation, contrairement à un simple reset individuel.
 */
export async function purgeEverything(sock) {
  const sessionsCleared = await forceEndAllSessions(sock);
  const sessionsPurged = purgeAllSessions();
  const profilesDeleted = deleteAllStats();
  return { sessionsCleared, sessionsPurged, profilesDeleted };
}
