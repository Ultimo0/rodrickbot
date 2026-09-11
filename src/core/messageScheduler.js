import { getAllMessageSchedules, getMessageSchedules } from './messageSchedules.js';
import { nextDailyOccurrence, DEFAULT_TIMEZONE } from './remind/remindDate.js';
import { logger } from '../utils/logger.js';

// "chatId:id" -> handle de setTimeout en cours, pour pouvoir annuler
// immédiatement un message programmé supprimé via !schedule remove
// (sans ça, le timer en cours irait quand même jusqu'au bout une dernière
// fois avant de se rendre compte, au moment de se replanifier, qu'il a été
// supprimé entre-temps).
const timers = new Map();

/**
 * Millisecondes jusqu'à la prochaine occurrence de "HH:MM", dans un fuseau
 * horaire FIXE (DEFAULT_TIMEZONE — Africa/Douala), quel que soit le fuseau
 * du serveur qui exécute le bot. Corrige un vrai bug vécu : un serveur dont
 * le fuseau système diffère de celui de l'utilisateur décalait tous les
 * messages programmés du même écart (~1h en pratique).
 *
 * Réutilise nextDailyOccurrence() de core/remind/remindDate.js — déjà
 * utilisée et éprouvée par !remind, plutôt que de dupliquer la même
 * logique de conversion de fuseau horaire ici.
 */
function msUntilNext(time) {
  const [h, m] = time.split(':').map(Number);
  const now = Date.now();
  const targetMs = nextDailyOccurrence(h, m, DEFAULT_TIMEZONE, now);
  return targetMs - now;
}

function scheduleOne(sock, chatId, entry) {
  const key = `${chatId}:${entry.id}`;
  const delay = msUntilNext(entry.time);

  const handle = setTimeout(async () => {
    try {
      await sock.sendMessage(chatId, { text: entry.message });
    } catch (err) {
      logger.warn({ err, chatId }, 'Message programmé: envoi impossible');
    }

    // Ne se replanifie que si l'entrée existe TOUJOURS dans le store — si
    // elle a été supprimée entre-temps (!schedule remove pendant que ce
    // timer était déjà en vol), on s'arrête là plutôt que de reprogrammer
    // un message qui vient d'être retiré.
    const current = getMessageSchedules(chatId).find((s) => s.id === entry.id);
    if (current) {
      scheduleOne(sock, chatId, current);
    } else {
      timers.delete(key);
    }
  }, delay);
  handle.unref?.(); // ne doit jamais empêcher le process de s'arrêter proprement

  timers.set(key, handle);
}

/** Arme (ou réarme) le minuteur d'un message programmé — appelé à la création ET au démarrage. */
export function scheduleMessage(sock, chatId, entry) {
  scheduleOne(sock, chatId, entry);
}

/** Annule immédiatement le minuteur d'un message programmé (appelé par !schedule remove). */
export function cancelMessageSchedule(chatId, id) {
  const key = `${chatId}:${id}`;
  const handle = timers.get(key);
  if (handle) {
    clearTimeout(handle);
    timers.delete(key);
  }
}

/** Recharge et replanifie tous les messages programmés existants — appelé une fois au démarrage. */
export function initMessageScheduler(sock) {
  const all = getAllMessageSchedules();
  let count = 0;

  for (const [chatId, entries] of Object.entries(all)) {
    for (const entry of entries) {
      scheduleOne(sock, chatId, entry);
      count += 1;
    }
  }

  logger.info(`[MessageScheduler] ${count} message(s) programmé(s) chargé(s).`);
}
