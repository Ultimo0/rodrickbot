import { logger } from '../../utils/logger.js';
import { getExpiredActivePolls } from './PollStorage.js';
import { expirePoll, resumeActivePolls } from './PollManager.js';

/**
 * PollCleanupService
 * -------------------
 * Filet de sécurité derrière PollTimer : PollTimer est en mémoire et perd
 * tous ses timers au redémarrage du process, donc ce service balaye
 * périodiquement les sondages marqués "active" dont closesAt est dépassé —
 * qu'ils aient ou non un timer en cours. Sans lui, un sondage dont
 * l'expiration tombait pendant que le bot était arrêté resterait "active"
 * indéfiniment dans polls.json. Même principe que QuizCleanupService.js.
 */

const SWEEP_INTERVAL_MS = 60 * 1000; // 1 minute
let intervalHandle = null;

async function sweepOnce(sock) {
  const expired = getExpiredActivePolls();
  for (const poll of expired) {
    try {
      await expirePoll(sock, poll.id);
    } catch (err) {
      logger.error({ err, pollId: poll.id }, "Échec du nettoyage d'un sondage expiré");
    }
  }
}

export function initPollCleanupService(sock) {
  resumeActivePolls(sock);
  sweepOnce(sock); // rattrape immédiatement ce qui a déjà expiré pendant l'arrêt du bot

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => sweepOnce(sock), SWEEP_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  logger.info('Poll: service de nettoyage des sondages démarré');
}
