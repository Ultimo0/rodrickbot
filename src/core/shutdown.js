import { logger } from '../utils/logger.js';

/**
 * shutdown.js
 * ------------------------------------------------------------------
 * Avant ce module, plusieurs fichiers (core/state.js, core/activityStore.js)
 * enregistraient chacun leur propre gestionnaire SIGINT/SIGTERM, et
 * certains appelaient process.exit(0) directement dans leur callback. Deux
 * problèmes réels :
 * - Node appelle les listeners d'un même signal dans l'ordre
 *   d'enregistrement, qui dépend de l'ordre d'import des modules — implicite
 *   et fragile.
 * - Si le premier listener appelle process.exit(0) de façon synchrone, les
 *   listeners suivants n'ont jamais la garantie de s'exécuter avant que le
 *   process ne se termine.
 *
 * Ici : un seul point d'entrée. Chaque module qui a besoin de sauvegarder
 * quelque chose avant l'arrêt appelle registerShutdownHandler() une fois,
 * et ce module se charge d'attendre chaque handler, dans l'ordre
 * d'enregistrement, avant de couper le process une seule fois à la fin.
 * ------------------------------------------------------------------
 */

const handlers = [];
let shuttingDown = false;

/**
 * Enregistre une fonction (sync ou async) à exécuter à l'arrêt du bot
 * (Ctrl+C, redéploiement, `pm2 restart`...), avant que le process ne se
 * termine. Ne PAS appeler process.exit() dans la fonction fournie — ce
 * module s'en charge une fois tous les handlers passés.
 */
export function registerShutdownHandler(fn) {
  handlers.push(fn);
}

async function shutdown(signal) {
  if (shuttingDown) return; // un second Ctrl+C pendant l'arrêt ne relance pas tout depuis le début
  shuttingDown = true;

  logger.info(`Signal ${signal} reçu, arrêt propre en cours (${handlers.length} tâche(s) à finaliser)...`);

  for (const fn of handlers) {
    try {
      await fn();
    } catch (err) {
      logger.error({ err }, "Erreur pendant l'arrêt propre (on continue avec les tâches suivantes)");
    }
  }

  logger.info('Arrêt propre terminé.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
