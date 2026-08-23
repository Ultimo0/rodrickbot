import { logger } from '../../utils/logger.js';
import { getDueReminders } from './RemindStorage.js';
import { deliverDueReminder, expireDueReminder } from './RemindManager.js';

/**
 * RemindScheduler
 * ---------------
 * DÉLIBÉRÉMENT pas de setTimeout() par rappel — deux raisons, pas une
 * seule :
 *
 *  1. Celle que le brief anticipe déjà (section 10) : de nombreux rappels
 *     actifs à la fois (contrairement aux sondages, potentiellement des
 *     dizaines par utilisateur, voir MAX_ACTIVE_REMINDERS_PER_USER) sans
 *     limite de mémoire réelle, et perdus au redémarrage.
 *
 *  2. Une raison plus grave, DÉCOUVERTE en écrivant ce module (pas dans le
 *     brief) : `setTimeout(fn, delay)` déborde silencieusement en JS/Node
 *     pour tout délai supérieur à ~24,8 jours (2^31-1 ms — dépassement
 *     d'entier 32 bits en interne) et se déclenche IMMÉDIATEMENT au lieu
 *     d'attendre. Un rappel à "30j" avec un timer direct partirait donc
 *     tout de suite, en silence, sans aucune erreur. Un balayage
 *     périodique n'a structurellement pas ce problème : il compare juste
 *     `scheduledAt <= now` à intervalles réguliers, quelle que soit la
 *     durée d'attente réelle.
 *
 * Bénéfice secondaire : la "reprise après redémarrage" (brief section 10,
 * "charger les rappels au démarrage") est gratuite avec cette conception —
 * contrairement à PollCleanupService.resumeActivePolls() qui doit
 * explicitement réarmer un timer par sondage actif au démarrage, il n'y a
 * ici tout simplement RIEN à réarmer : le premier balayage, qu'il ait lieu
 * juste après un redémarrage ou en fonctionnement normal, retrouve tout
 * seul les rappels en attente dans reminders.json.
 */

const SWEEP_INTERVAL_MS = 15 * 1000; // plus fréquent que Poll (60s) : un rappel doit arriver ponctuellement, pas avec plusieurs minutes de retard

// Au-delà de ce délai de retard, un rappel n'est plus envoyé (aurait perdu
// tout son sens, ex: "appeler maman dans 10 min" reçu 2 jours plus tard) —
// il passe "expired" à la place. Ce même mécanisme borne aussi
// naturellement les tentatives en cas d'échec d'envoi répété (téléphone
// hors ligne en continu, brief section 8) : deliverDueReminder laisse le
// rappel "pending" pour réessayer au balayage suivant, jusqu'à ce que ce
// délai soit dépassé et qu'il expire au lieu de réessayer indéfiniment.
const EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

let intervalHandle = null;
let sweeping = false; // garde anti-chevauchement : si un balayage n'est pas terminé (beaucoup de rappels, envoi lent), on n'en démarre jamais un second en parallèle — évite un double envoi du même rappel

async function sweepOnce(sock) {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Date.now();
    const due = getDueReminders(now);
    for (const reminder of due) {
      try {
        if (now - reminder.scheduledAt > EXPIRY_GRACE_MS) {
          expireDueReminder(reminder);
          logger.info(`Rappel ${reminder.id} expiré sans envoi (trop en retard)`);
          continue;
        }
        const result = await deliverDueReminder(sock, reminder, now);
        if (result === 'sent') logger.info(`Rappel ${reminder.id} envoyé à ${reminder.userId}`);
        else if (result === 'recurred') logger.info(`Rappel récurrent ${reminder.id} envoyé, reprogrammé`);
      } catch (err) {
        logger.error({ err, reminderId: reminder.id }, "Échec du traitement d'un rappel arrivé à échéance");
      }
    }
  } finally {
    sweeping = false;
  }
}

export function initRemindScheduler(sock) {
  sweepOnce(sock); // rattrape immédiatement ce qui devait déjà partir pendant l'arrêt du bot

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(() => sweepOnce(sock), SWEEP_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();

  logger.info('Remind: planificateur de rappels démarré');
}

/** Réservé aux tests : exécute un balayage unique de façon synchrone-attendable, sans dépendre de l'intervalle réel. */
export async function runSweepForTests(sock) {
  await sweepOnce(sock);
}
