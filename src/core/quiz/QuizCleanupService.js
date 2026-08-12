import { logger } from '../../utils/logger.js';
import { getExpiredActiveSessions } from './QuizSessionManager.js';
import { expireSession, resumeActiveSessions } from './QuizEngine.js';

/**
 * QuizCleanupService
 * -------------------
 * Filet de sécurité derrière QuizTimer : QuizTimer est en mémoire et perd
 * tous ses timers au redémarrage du process, donc ce service balaye
 * périodiquement les sessions marquées "active" mais dont la dernière
 * activité dépasse la fenêtre d'inactivité (voir QuizSessionManager) —
 * qu'elles aient ou non un timer en cours. Sans lui, une session active au
 * moment d'un crash resterait "active" indéfiniment dans quiz_sessions.json.
 */

const SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute
let intervalHandle = null;

async function sweepOnce(sock) {
  const expired = getExpiredActiveSessions();
  for (const session of expired) {
    try {
      await expireSession(sock, session.sessionId);
    } catch (err) {
      logger.error({ err, sessionId: session.sessionId }, "Échec du nettoyage d'une session quiz expirée");
    }
  }
}

export function initQuizCleanupService(sock) {
  resumeActiveSessions(sock);
  sweepOnce(sock); // rattrape immédiatement ce qui a déjà expiré pendant l'arrêt du bot

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => sweepOnce(sock), SWEEP_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  logger.info('Quiz: service de nettoyage des sessions démarré');
}
