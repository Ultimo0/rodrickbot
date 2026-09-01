import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../utils/atomicWrite.js';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

const DATA_FILE = path.join(process.cwd(), 'quiz_sessions.json');
export const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes d'inactivité (cahier des charges)

/**
 * QuizSessionManager
 * -------------------
 * Source de vérité unique pour l'état "en cours" d'un quiz. Persiste sur
 * disque après CHAQUE réponse (sauvegarde automatique demandée dans le
 * brief), au même format que warnStore.js / groupSettings.js : un objet
 * en mémoire, rechargé au démarrage, réécrit intégralement à chaque
 * mutation.
 *
 * Une seule session active par utilisateur : appliqué ici (clé = userId),
 * pas dans QuizEngine, pour que la règle reste vraie même si un futur
 * mode PvP/coopératif ajoute d'autres points d'entrée que !quiz.
 */

let sessions = {}; // { [sessionId]: SessionState }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    sessions = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire quiz_sessions.json, aucune session reprise');
    sessions = {};
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire quiz_sessions.json");
  }
}

load();

function isExpired(session, now = Date.now()) {
  return now - session.lastActivityAt > SESSION_TTL_MS;
}

/** Session active (non expirée) d'un utilisateur, toutes discussions confondues. */
export function getActiveSessionForUser(userId) {
  const now = Date.now();
  for (const session of Object.values(sessions)) {
    if (session.userId === userId && session.status === 'active') {
      if (isExpired(session, now)) continue; // nettoyée par QuizCleanupService, pas ici
      return session;
    }
  }
  return null;
}

export function getSession(sessionId) {
  return sessions[sessionId] || null;
}

export function createSession({ userId, chatId, category, difficulty, questionIds }) {
  const existing = getActiveSessionForUser(userId);
  if (existing) {
    throw new Error('ACTIVE_SESSION_EXISTS');
  }

  const now = Date.now();
  const session = {
    sessionId: randomUUID(),
    userId,
    chatId,
    category: category || null,
    difficulty: difficulty || null,
    questionIds,
    currentIndex: 0,
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    bestStreak: 0,
    status: 'active',
    createdAt: now,
    lastActivityAt: now,
    answeredQuestionIds: [], // idempotence : voir QuizInteractionGuard
  };

  sessions[session.sessionId] = session;
  persist();
  return session;
}

export function touchSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;
  session.lastActivityAt = Date.now();
  persist();
}

export function updateSession(sessionId, patch) {
  const session = sessions[sessionId];
  if (!session) return null;
  Object.assign(session, patch, { lastActivityAt: Date.now() });
  persist();
  return session;
}

export function markAnswered(sessionId, questionId) {
  const session = sessions[sessionId];
  if (!session) return;
  if (!session.answeredQuestionIds) session.answeredQuestionIds = []; // migration douce depuis l'ancien champ answeredButtonIds
  session.answeredQuestionIds.push(questionId);
  // borne la liste : seules les dernières questions comptent pour l'anti-double-envoi
  if (session.answeredQuestionIds.length > 50) {
    session.answeredQuestionIds = session.answeredQuestionIds.slice(-50);
  }
}

export function endSession(sessionId, finalStatus) {
  const session = sessions[sessionId];
  if (!session) return null;
  session.status = finalStatus; // 'completed' | 'abandoned' | 'expired'
  session.endedAt = Date.now();
  persist();
  return session;
}

/** Supprime définitivement une session (utilisé par le cleanup, pas par l'utilisateur). */
export function deleteSession(sessionId) {
  delete sessions[sessionId];
  persist();
}

export function getAllSessions() {
  return Object.values(sessions);
}

/**
 * Vide complètement quiz_sessions.json (mémoire + disque) : sessions actives,
 * terminées, abandonnées, tout est supprimé. Usage admin uniquement — voir
 * la commande !quiz sessions purge. Contrairement à endSession/deleteSession
 * (qui ciblent une session précise), ceci réinitialise tout le fichier.
 * Retourne le nombre de sessions supprimées.
 */
export function purgeAllSessions() {
  const count = Object.keys(sessions).length;
  sessions = {};
  persist();
  return count;
}

export function getExpiredActiveSessions(now = Date.now()) {
  return Object.values(sessions).filter((s) => s.status === 'active' && isExpired(s, now));
}
