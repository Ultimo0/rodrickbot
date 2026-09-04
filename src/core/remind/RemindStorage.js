import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../utils/atomicWrite.js';
import { dataFilePath } from '../../utils/dataFile.js';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

const DATA_FILE = dataFilePath('reminders.json');

/**
 * RemindStorage
 * -------------
 * Source de vérité unique pour les rappels. Même convention que
 * PollStorage.js / warnStore.js / groupSettings.js : objet en mémoire,
 * rechargé au démarrage, réécrit intégralement sur disque à CHAQUE
 * mutation (persistance immédiate, comme demandé dans le brief section 9).
 * RemindManager est le seul module censé appeler celui-ci.
 *
 * Un rappel :
 * {
 *   id,                  // court, lisible (6 caractères)
 *   seq,                 // compteur strictement monotone — départage deux
 *                         // rappels créés dans la même milliseconde (voir
 *                         // le même correctif appliqué à PollStorage.js
 *                         // après un bug réel trouvé pendant le développement
 *                         // du module Poll ; appliqué ici dès la conception)
 *   userId,               // JID du propriétaire — un rappel est TOUJOURS personnel
 *   chatId,                // JID où envoyer le rappel (chat privé avec l'utilisateur)
 *   message,
 *   createdAt,
 *   scheduledAt,           // epoch ms UTC, absolu — déjà résolu depuis le fuseau
 *                          // au moment de la création (voir remindDate.js) :
 *                          // aucune conversion à refaire au moment de l'envoi
 *   status,                // 'pending' | 'sent' | 'cancelled' | 'expired'
 *   timezone,               // fuseau IANA utilisé pour l'affichage et, pour un
 *                           // rappel récurrent, pour calculer la PROCHAINE occurrence
 *   recurrence,              // null, ou { type: 'daily' } / { type: 'weekly', weekday: 0-6 }
 *   lastSentAt,               // null tant que jamais envoyé ; utile pour /reminders et le débogage
 * }
 */

let reminders = {}; // { [id]: Reminder }
let sequenceCounter = 0;

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    reminders = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    sequenceCounter = Object.values(reminders).reduce((max, r) => Math.max(max, r.seq || 0), 0);
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire reminders.json, aucun rappel repris');
    reminders = {};
  }
}

function persist() {
  atomicWriteFileSync(DATA_FILE, JSON.stringify(reminders, null, 2));
}

function generateReminderId() {
  let id;
  do {
    id = randomUUID().slice(0, 6);
  } while (reminders[id]);
  return id;
}

load();

export function createReminder({ userId, chatId, message, scheduledAt, timezone, recurrence = null }) {
  const id = generateReminderId();
  const now = Date.now();
  sequenceCounter += 1;

  const reminder = {
    id,
    seq: sequenceCounter,
    userId,
    chatId,
    message,
    createdAt: now,
    scheduledAt,
    status: 'pending',
    timezone,
    recurrence,
    lastSentAt: null,
  };

  reminders[id] = reminder;
  persist();
  return reminder;
}

export function getReminder(id) {
  return reminders[id] || null;
}

/** Tous les rappels d'un utilisateur, tout statut confondu. */
export function getRemindersForUser(userId) {
  return Object.values(reminders)
    .filter((r) => r.userId === userId)
    .sort((a, b) => a.seq - b.seq);
}

/** Rappels "pending" d'un utilisateur uniquement (ce qu'affiche /reminders). */
export function getActiveRemindersForUser(userId) {
  return getRemindersForUser(userId).filter((r) => r.status === 'pending');
}

export function countActiveRemindersForUser(userId) {
  return getActiveRemindersForUser(userId).length;
}

/** Tous les rappels "pending" dont l'échéance est déjà atteinte, tout utilisateur confondu — utilisé par le planificateur. */
export function getDueReminders(now = Date.now()) {
  return Object.values(reminders).filter((r) => r.status === 'pending' && r.scheduledAt <= now);
}

/**
 * Marque un rappel comme envoyé. Pour un rappel récurrent, calcule et
 * applique directement la prochaine échéance (le rappel RESTE "pending" —
 * c'est ce qui permet la récurrence sans jamais recréer d'entrée), sinon
 * passe définitivement à "sent".
 */
export function markSent(id, nextScheduledAt = null) {
  const reminder = reminders[id];
  if (!reminder) return null;

  reminder.lastSentAt = Date.now();
  if (nextScheduledAt) {
    reminder.scheduledAt = nextScheduledAt;
    reminder.status = 'pending';
  } else {
    reminder.status = 'sent';
  }
  persist();
  return reminder;
}

export function markExpired(id) {
  const reminder = reminders[id];
  if (!reminder) return null;
  reminder.status = 'expired';
  persist();
  return reminder;
}

export function cancelReminder(id) {
  const reminder = reminders[id];
  if (!reminder) return null;
  reminder.status = 'cancelled';
  persist();
  return reminder;
}

/** Annule tous les rappels "pending" d'un utilisateur. Retourne le nombre annulé. */
export function cancelAllForUser(userId) {
  let count = 0;
  for (const reminder of Object.values(reminders)) {
    if (reminder.userId === userId && reminder.status === 'pending') {
      reminder.status = 'cancelled';
      count += 1;
    }
  }
  if (count > 0) persist();
  return count;
}
