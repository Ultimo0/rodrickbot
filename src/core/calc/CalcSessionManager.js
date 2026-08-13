import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

const DATA_FILE = path.join(process.cwd(), 'calc_sessions.json');

/**
 * CalcSessionManager
 * -------------------
 * Même rôle que QuizSessionManager (source de vérité de l'état "en cours",
 * persistée après chaque réponse), en plus simple : pas de banque de
 * questions à référencer, juste l'opération en cours générée à la volée.
 * Une seule partie active par utilisateur (comme le quiz) — voir aussi
 * commands/calcul.js et commands/quiz.js pour l'exclusion mutuelle entre
 * les deux jeux (un utilisateur ne joue jamais aux deux en même temps).
 */
let sessions = {}; // { [sessionId]: SessionState }

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    sessions = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire calc_sessions.json, aucune partie reprise');
    sessions = {};
  }
}

function persist() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire calc_sessions.json");
  }
}

load();

export function getActiveSessionForUser(userId) {
  return Object.values(sessions).find((s) => s.userId === userId && s.status === 'active') || null;
}

export function getSession(sessionId) {
  return sessions[sessionId] || null;
}

export function createSession({ userId, chatId, difficulty, totalQuestions }) {
  if (getActiveSessionForUser(userId)) {
    throw new Error('ACTIVE_SESSION_EXISTS');
  }

  const now = Date.now();
  const session = {
    sessionId: randomUUID(),
    userId,
    chatId,
    difficulty,
    totalQuestions,
    currentIndex: 0,
    currentQuestion: null, // { text, answer, askedAt } — posée par CalcEngine juste après création
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    bestStreak: 0,
    status: 'active',
    createdAt: now,
    lastActivityAt: now,
  };

  sessions[session.sessionId] = session;
  persist();
  return session;
}

export function updateSession(sessionId, patch) {
  const session = sessions[sessionId];
  if (!session) return null;
  Object.assign(session, patch, { lastActivityAt: Date.now() });
  persist();
  return session;
}

export function endSession(sessionId, finalStatus) {
  const session = sessions[sessionId];
  if (!session) return null;
  session.status = finalStatus; // 'completed' | 'abandoned' | 'stale' (nettoyée au redémarrage)
  session.endedAt = Date.now();
  persist();
  return session;
}

export function deleteSession(sessionId) {
  delete sessions[sessionId];
  persist();
}

export function getAllSessions() {
  return Object.values(sessions);
}

/**
 * Vide complètement calc_sessions.json (mémoire + disque) : sessions
 * actives, terminées, abandonnées, tout est supprimé. Usage admin
 * uniquement — voir la commande !calcul purge. Contrairement à
 * endSession/deleteSession (qui ciblent une session précise), ceci
 * réinitialise tout le fichier.
 * Retourne le nombre de sessions supprimées.
 */
export function purgeAllSessions() {
  const count = Object.keys(sessions).length;
  sessions = {};
  persist();
  return count;
}
