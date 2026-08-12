import { logger } from '../../utils/logger.js';
import {
  SESSION_TTL_MS,
  getActiveSessionForUser,
  createSession,
  getSession,
  updateSession,
  markAnswered,
  endSession,
  deleteSession,
  getAllSessions,
  purgeAllSessions,
} from './QuizSessionManager.js';
import { getQuestionById, pickRandomQuestions, listCategories, getQuestionCount, purgeCache } from './QuizLoader.js';
import {
  isDuplicateDelivery,
  markDelivered,
  parseAnswerDigit,
  validateAnswerAttempt,
} from './QuizInteractionGuard.js';
import { getStats, recordAnswer, addXpAndCoins, recordQuizEnd, deleteUserStats, deleteAllStats } from './QuizStatistics.js';
import { computeReward, computePerfectRunBonus } from './QuizRewards.js';
import { evaluateAchievements } from './QuizAchievements.js';
import { getLeaderboard, getUserRank } from './QuizRanking.js';
import { scheduleInactivityTimeout, clearInactivityTimeout } from './QuizTimer.js';
import * as Renderer from './QuizRenderer.js';

export const QUESTIONS_PER_QUIZ = 5;

// Anti-répétition : mémorise, par utilisateur, les ids des questions vues
// récemment (tous quiz confondus), pour ne pas les reproposer tant que le
// pool le permet. En mémoire uniquement (pas persisté) — remis à zéro à
// chaque redémarrage du bot, ce qui est acceptable pour ce rôle purement
// cosmétique (ça ne fait qu'améliorer la variété perçue, rien de critique).
const RECENT_MEMORY_SIZE = 30;
const recentlySeenByUser = new Map(); // userId -> string[] (ids), plus récent en dernier

function getRecentlySeen(userId) {
  return recentlySeenByUser.get(userId) || [];
}

function rememberSeen(userId, ids) {
  const updated = [...getRecentlySeen(userId), ...ids].slice(-RECENT_MEMORY_SIZE);
  recentlySeenByUser.set(userId, updated);
}

/**
 * QuizEngine
 * ----------
 * Point d'entrée unique utilisé par la commande /quiz et par le routeur de
 * clics dans messageHandler.js. N'accède jamais directement au disque :
 * délègue toujours à QuizSessionManager / QuizStatistics.
 */

function armTimer(sock, sessionId, ms = SESSION_TTL_MS) {
  scheduleInactivityTimeout(sessionId, ms, (id) => expireSession(sock, id));
}

async function sendQuestionCard(sock, session) {
  const questionId = session.questionIds[session.currentIndex];
  const question = getQuestionById(questionId);
  if (!question) {
    // Question supprimée de la banque entre temps : on saute plutôt que de planter.
    logger.warn({ questionId }, 'Question quiz introuvable en cours de session — session terminée par sécurité');
    return finishQuiz(sock, session.sessionId);
  }

  await sock.sendMessage(
    session.chatId,
    Renderer.renderQuestionCard({
      session,
      question,
      questionNumber: session.currentIndex + 1,
      totalQuestions: session.questionIds.length,
    })
  );
}

/** Démarre un nouveau quiz. Retourne { ok, reason? }. */
export async function startQuiz(sock, { chatId, sender, category, difficulty }) {
  if (getActiveSessionForUser(sender)) {
    return { ok: false, reason: 'ACTIVE_SESSION' };
  }

  if (getQuestionCount() === 0) {
    return { ok: false, reason: 'NO_QUESTIONS_AT_ALL' };
  }

  const questions = pickRandomQuestions(QUESTIONS_PER_QUIZ, { category, difficulty, excludeIds: getRecentlySeen(sender) });
  if (questions.length === 0) {
    return { ok: false, reason: 'NO_QUESTIONS_MATCH' };
  }
  rememberSeen(sender, questions.map((q) => q.id));

  const session = createSession({
    userId: sender,
    chatId,
    category: category || null,
    difficulty: difficulty || null,
    questionIds: questions.map((q) => q.id),
  });

  armTimer(sock, session.sessionId);
  await sendQuestionCard(sock, session);
  return { ok: true, session };
}

async function finishQuiz(sock, sessionId) {
  const session = getSession(sessionId);
  if (!session) return;

  clearInactivityTimeout(sessionId);
  endSession(sessionId, 'completed');
  const finalSession = getSession(sessionId);
  const totalQuestions = finalSession.questionIds.length;

  const perfectBonus = computePerfectRunBonus({
    totalQuestions,
    correctCount: finalSession.correctCount,
    difficulty: finalSession.difficulty || 'moyen',
  });
  if (perfectBonus.xp > 0 || perfectBonus.coins > 0) {
    addXpAndCoins(finalSession.userId, perfectBonus);
  }

  recordQuizEnd(finalSession.userId, {
    sessionId,
    status: 'completed',
    score: finalSession.score,
    correctCount: finalSession.correctCount,
    totalQuestions,
    category: finalSession.category,
  });

  const newAchievements = evaluateAchievements(finalSession.userId);
  const userStats = getStats(finalSession.userId);

  await sock.sendMessage(
    finalSession.chatId,
    Renderer.renderQuizSummary({ session: finalSession, totalQuestions, perfectBonus, newAchievements, userStats })
  );
}

// Verrou en mémoire par session : une réponse est en cours de traitement pour
// cette session -> toute autre réponse concurrente est ignorée. Nécessaire
// en plus de isDuplicateDelivery() car deux messages TEXTE distincts (ex:
// l'utilisateur retape "2" par réflexe) n'ont pas le même messageId, donc
// le dédoublonnage réseau seul ne suffit pas à empêcher une double comptée
// si les deux événements messages.upsert arrivent avant que le premier soit
// terminé de traiter (le event emitter Baileys n'attend pas le handler).
const sessionsBeingAnswered = new Set();

/**
 * Traite une tentative de réponse envoyée en texte (un chiffre nu, ex: "2").
 * Idempotent (redélivrance Baileys) et tolérant aux réponses invalides
 * (ignorées silencieusement plutôt qu'une erreur visible pour les cas de
 * course/désynchronisation — un chiffre hors plage reçoit, lui, un message
 * d'aide car c'est probablement une vraie erreur de saisie).
 */
export async function handleAnswerText(sock, { sender, chatId, messageId, text }) {
  const answerNumber = parseAnswerDigit(text);
  if (answerNumber === null) return false; // pas un chiffre nu : pas une réponse quiz, laisse passer le message

  if (isDuplicateDelivery(messageId)) return true;
  markDelivered(messageId);

  const session = getActiveSessionForUser(sender);
  if (!session) return false; // plus de session active (course avec expiration/abandon) : laisse passer
  if (sessionsBeingAnswered.has(session.sessionId)) return true; // anti-double-envoi concurrent

  sessionsBeingAnswered.add(session.sessionId);
  try {
    const currentQuestionId = session.questionIds[session.currentIndex];
    const validation = validateAnswerAttempt({ session, sender, currentQuestionId });
    if (!validation.ok) {
      logger.debug({ reason: validation.reason, sender }, 'Réponse quiz ignorée');
      return true;
    }

    const question = getQuestionById(currentQuestionId);
    if (!question) return true;

    const answerIndex = answerNumber - 1;
    if (answerIndex < 0 || answerIndex >= question.options.length) {
      await sock.sendMessage(chatId, {
        text: `❌ Réponds avec un chiffre entre 1 et ${question.options.length}.`,
      });
      return true;
    }

    const correct = answerIndex === question.correctIndex;
    const reward = computeReward({ correct, difficulty: question.difficulty, streakBeforeAnswer: session.streak });
    const newStreak = correct ? session.streak + 1 : 0;

    markAnswered(session.sessionId, currentQuestionId);
    const updated = updateSession(session.sessionId, {
      score: session.score + reward.xp,
      correctCount: session.correctCount + (correct ? 1 : 0),
      wrongCount: session.wrongCount + (correct ? 0 : 1),
      streak: newStreak,
      bestStreak: Math.max(session.bestStreak, newStreak),
      currentIndex: session.currentIndex + 1,
    });

    recordAnswer(sender, { correct, xpGained: reward.xp, coinsGained: reward.coins });

    await sock.sendMessage(
      updated.chatId,
      Renderer.renderAnswerFeedback({ correct, question, reward, streak: newStreak })
    );

    if (updated.currentIndex < updated.questionIds.length) {
      armTimer(sock, updated.sessionId); // repousse l'expiration (inactivité, pas par question)
      await sendQuestionCard(sock, updated);
    } else {
      await finishQuiz(sock, updated.sessionId);
    }
    return true;
  } finally {
    sessionsBeingAnswered.delete(session.sessionId);
  }
}

/** true si cet utilisateur a un quiz actif en cours (utilisé par messageHandler.js pour router). */
export function hasActiveSession(userId) {
  return Boolean(getActiveSessionForUser(userId));
}

/** Liste toutes les sessions actives, tous utilisateurs confondus (usage admin/diagnostic). */
export function listActiveSessions() {
  return getAllSessions().filter((s) => s.status === 'active');
}

/**
 * Termine de force la session active d'un utilisateur (usage admin) : ni
 * confirmation, ni suppression des stats — juste la session en cours.
 * Contrairement à `wipeUserData` (utilisé par /quiz reset), l'historique et
 * l'XP de l'utilisateur ne sont pas touchés.
 */
export async function forceEndSession(sock, userId) {
  const session = getActiveSessionForUser(userId);
  if (!session) return null;

  clearInactivityTimeout(session.sessionId);
  endSession(session.sessionId, 'force_cleared');
  recordQuizEnd(userId, {
    sessionId: session.sessionId,
    status: 'force_cleared',
    score: session.score,
    correctCount: session.correctCount,
    totalQuestions: session.questionIds.length,
    category: session.category,
  });

  try {
    await sock.sendMessage(session.chatId, { text: '⚠️ Ton quiz en cours a été interrompu par un administrateur.' });
  } catch (err) {
    logger.warn({ err, sessionId: session.sessionId }, "Impossible de notifier l'interruption forcée du quiz");
  }

  return session;
}

/** Termine de force TOUTES les sessions actives (usage admin). Retourne le nombre de sessions terminées. */
export async function forceEndAllSessions(sock) {
  const active = listActiveSessions();
  for (const session of active) {
    await forceEndSession(sock, session.userId);
  }
  return active.length;
}

/**
 * Vide complètement quiz_sessions.json (usage admin) : notifie et termine
 * d'abord les sessions actives (pour ne pas laisser un utilisateur en plein
 * quiz sans explication), puis supprime tout — actives comprises — du
 * fichier. Ne touche pas aux stats/XP (voir QuizStatistics.js).
 * Retourne le nombre de sessions supprimées.
 */
export async function purgeAllSessionData(sock) {
  await forceEndAllSessions(sock);
  return purgeAllSessions();
}

/** /quiz abandonner */
export async function abandonQuiz(sender) {
  const session = getActiveSessionForUser(sender);
  if (!session) return null;

  clearInactivityTimeout(session.sessionId);
  endSession(session.sessionId, 'abandoned');
  recordQuizEnd(sender, {
    sessionId: session.sessionId,
    status: 'abandoned',
    score: session.score,
    correctCount: session.correctCount,
    totalQuestions: session.questionIds.length,
    category: session.category,
  });
  return session;
}

/** Expire une session par inactivité (timer, ou balayage du QuizCleanupService). */
export async function expireSession(sock, sessionId) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'active') return;

  clearInactivityTimeout(sessionId);
  endSession(sessionId, 'expired');
  recordQuizEnd(session.userId, {
    sessionId,
    status: 'expired',
    score: session.score,
    correctCount: session.correctCount,
    totalQuestions: session.questionIds.length,
    category: session.category,
  });

  try {
    await sock.sendMessage(session.chatId, Renderer.renderSessionExpired());
  } catch (err) {
    logger.warn({ err, sessionId }, "Impossible de notifier l'expiration du quiz");
  }
}

/** Réarme les timers d'inactivité des sessions encore actives après un redémarrage du process. */
export function resumeActiveSessions(sock) {
  const now = Date.now();
  let resumed = 0;

  for (const session of getAllSessions()) {
    if (session.status !== 'active') continue;
    const remaining = SESSION_TTL_MS - (now - session.lastActivityAt);
    if (remaining <= 0) continue; // sera nettoyée par QuizCleanupService au premier balayage
    armTimer(sock, session.sessionId, remaining);
    resumed += 1;
  }

  if (resumed > 0) logger.info(`Quiz: ${resumed} session(s) reprise(s) après redémarrage`);
}

export function getStatsMessage(userId) {
  return Renderer.renderStats(getStats(userId));
}

export function getLeaderboardMessage(userId) {
  const entries = getLeaderboard({ limit: 10 });
  const userRank = getUserRank(userId);
  return Renderer.renderLeaderboard(entries, { userRank });
}

export function getCategoriesMessage() {
  return Renderer.renderCategoriesList(listCategories());
}

/** Supprime intégralement les données Quiz d'un utilisateur (stats + session active). Atomique. */
export function wipeUserData(userId) {
  const activeSession = getActiveSessionForUser(userId);
  if (activeSession) {
    clearInactivityTimeout(activeSession.sessionId);
    deleteSession(activeSession.sessionId);
  }
  return deleteUserStats(userId);
}

/**
 * Supprime intégralement les données Quiz de TOUS les utilisateurs (usage
 * admin — /quiz resetall). Interrompt d'abord toute session active (avec
 * notification à chaque utilisateur concerné) avant de purger les stats,
 * pour ne laisser aucune session orpheline référençant un profil supprimé.
 * Retourne { sessionsCleared, profilesDeleted }.
 */
export async function wipeAllUsersData(sock) {
  const sessionsCleared = await forceEndAllSessions(sock);
  const profilesDeleted = deleteAllStats();
  return { sessionsCleared, profilesDeleted };
}

/**
 * Réinitialisation complète du module Quiz (usage admin — /quiz purge) :
 * vide les 3 fichiers de données du module en une seule commande.
 *  1. Sessions actives : notifiées puis terminées (comme wipeAllUsersData).
 *  2. quiz_sessions.json : vidé intégralement (historique compris).
 *  3. quiz_stats.json : vidé intégralement (XP, pièces, succès de TOUS les utilisateurs).
 *  4. quiz_questions_cache.json : supprimé, retombe sur la banque de secours locale
 *     en attendant le prochain /quiz refresh ou redémarrage.
 * Irréversible — pas de fenêtre de confirmation, contrairement à /quiz resetall.
 */
export async function purgeEverything(sock) {
  const sessionsCleared = await forceEndAllSessions(sock);
  const sessionsPurged = purgeAllSessions();
  const profilesDeleted = deleteAllStats();
  const cachePurged = purgeCache();
  return { sessionsCleared, sessionsPurged, profilesDeleted, cachePurged };
}
