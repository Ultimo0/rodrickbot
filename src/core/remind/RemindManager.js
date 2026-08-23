import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import {
  createReminder,
  getReminder,
  getActiveRemindersForUser,
  countActiveRemindersForUser,
  cancelReminder,
  cancelAllForUser,
  markSent,
  markExpired,
} from './RemindStorage.js';
import {
  startDraft,
  getDraft,
  hasDraft,
  touchDraft,
  clearDraft,
  startCancelAllConfirmation,
  hasCancelAllConfirmation,
  clearCancelAllConfirmation,
} from './RemindSessionManager.js';
import {
  parseFlexibleDuration,
  looksLikeDuration,
  validateReminderDuration,
} from './remindDuration.js';
import {
  parseAbsoluteDateTime,
  parseWeekdayName,
  nextDailyOccurrence,
  nextWeekdayOccurrence,
  getUserTimezone,
} from './remindDate.js';
import { parseControlDigit } from '../quiz/QuizInteractionGuard.js';
import * as R from './RemindRenderer.js';

// Limites (voir brief section 12) — constantes nommées, même convention
// que WARN_LIMIT (warnStore.js) / MIN_POLL_DURATION_MS (pollDuration.js).
export const MAX_ACTIVE_REMINDERS_PER_USER = 25;
export const MAX_MESSAGE_LENGTH = 300;

const WEEKDAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function validateMessage(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) return { ok: false, reason: 'EMPTY_MESSAGE' };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'MESSAGE_TOO_LONG' };
  return { ok: true, message: trimmed };
}

function relativeLabelFromMs(ms, recurrence) {
  if (recurrence) return `Prochaine fois : ${R.renderRelativeDelay(ms)}`;
  return `Dans : ${R.renderRelativeDelay(ms)}`;
}

// --- Parsing unifié de la commande principale --------------------------

const CLOCK = '\\d{1,2}[:h]\\d{0,2}';
const ABSOLUTE_PATTERNS = [
  new RegExp(`^(demain\\s+${CLOCK})\\s+([\\s\\S]+)$`, 'i'),
  new RegExp(`^(aujourd'?hui\\s+${CLOCK})\\s+([\\s\\S]+)$`, 'i'),
  new RegExp(`^(\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+${CLOCK})\\s+([\\s\\S]+)$`),
];
const EVERY_DAY_PATTERN = new RegExp(`^every\\s+day\\s+(${CLOCK})\\s+([\\s\\S]+)$`, 'i');
const EVERY_WEEK_PATTERN = new RegExp(`^every\\s+week\\s+(\\S+)\\s+(${CLOCK})\\s+([\\s\\S]+)$`, 'iu');

function parseClock(raw) {
  const match = raw.trim().match(/^(\d{1,2})[:h](\d{2})?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Parse la syntaxe complète de `/remind <...> <message>` (hors assistant).
 * Retourne toujours { ok, ... } — jamais d'exception, même sur une entrée
 * absurde (brief section 8 : "ne jamais faire planter le bot à cause d'un
 * rappel mal formé").
 */
export function parseReminderCommand(rawText, timezone) {
  const text = (rawText || '').trim();
  if (!text) return { ok: false, reason: 'EMPTY' };

  // --- Récurrence quotidienne : "every day HH:MM message" ---
  let m = text.match(EVERY_DAY_PATTERN);
  if (m) {
    const clock = parseClock(m[1]);
    if (!clock) return { ok: false, reason: 'INVALID_TIME' };
    const messageCheck = validateMessage(m[2]);
    if (!messageCheck.ok) return messageCheck;
    const ms = nextDailyOccurrence(clock.hour, clock.minute, timezone);
    return {
      ok: true,
      message: messageCheck.message,
      scheduledAt: ms,
      recurrence: { type: 'daily', time: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}` },
    };
  }

  // --- Récurrence hebdomadaire : "every week lundi HH:MM message" ---
  m = text.match(EVERY_WEEK_PATTERN);
  if (m) {
    const weekday = parseWeekdayName(m[1]);
    if (weekday === null) return { ok: false, reason: 'INVALID_WEEKDAY' };
    const clock = parseClock(m[2]);
    if (!clock) return { ok: false, reason: 'INVALID_TIME' };
    const messageCheck = validateMessage(m[3]);
    if (!messageCheck.ok) return messageCheck;
    const ms = nextWeekdayOccurrence(weekday, clock.hour, clock.minute, timezone);
    return {
      ok: true,
      message: messageCheck.message,
      scheduledAt: ms,
      recurrence: {
        type: 'weekly',
        weekday,
        weekdayLabel: WEEKDAY_LABELS[weekday],
        time: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
      },
    };
  }

  // --- Date/heure absolue : "demain 08:00 message" / "20/08/2026 18:30 message" ---
  for (const pattern of ABSOLUTE_PATTERNS) {
    m = text.match(pattern);
    if (m) {
      const parsed = parseAbsoluteDateTime(m[1], timezone);
      if (!parsed) return { ok: false, reason: 'INVALID_DATE' };
      const messageCheck = validateMessage(m[2]);
      if (!messageCheck.ok) return messageCheck;
      return { ok: true, message: messageCheck.message, scheduledAt: parsed.ms, recurrence: null, label: parsed.label };
    }
  }

  // --- Durée relative : "10min message" ---
  const spaceIndex = text.search(/\s/);
  if (spaceIndex > 0) {
    const first = text.slice(0, spaceIndex);
    const rest = text.slice(spaceIndex + 1);
    if (looksLikeDuration(first)) {
      const durationMs = parseFlexibleDuration(first);
      if (durationMs === null) return { ok: false, reason: 'INVALID_DURATION' };
      const durationCheck = validateReminderDuration(durationMs);
      if (!durationCheck.ok) return durationCheck;
      const messageCheck = validateMessage(rest);
      if (!messageCheck.ok) return messageCheck;
      return { ok: true, message: messageCheck.message, scheduledAt: Date.now() + durationMs, recurrence: null };
    }
  } else if (looksLikeDuration(text)) {
    // Cas particulier : "/remind 10min" sans rien après — une durée valide
    // mais AUCUN message. Un simple INVALID_SYNTAX générique serait trompeur
    // ici (la durée est bien reconnue) : on distingue explicitement ce cas
    // pour renvoyer EMPTY_MESSAGE ("tu as oublié le message"), plus utile.
    return { ok: false, reason: 'EMPTY_MESSAGE' };
  }

  return { ok: false, reason: 'INVALID_SYNTAX' };
}

function errorMessageFor(reason) {
  switch (reason) {
    case 'EMPTY':
    case 'INVALID_SYNTAX':
      return R.renderInvalidSyntax();
    case 'EMPTY_MESSAGE':
      return { text: '❌ Le message du rappel ne peut pas être vide.' };
    case 'MESSAGE_TOO_LONG':
      return R.renderWizardMessageTooLong(MAX_MESSAGE_LENGTH);
    case 'TOO_SHORT':
      return { text: '❌ Durée trop courte (minimum 10 secondes).' };
    case 'TOO_LONG':
      return { text: '❌ Durée trop longue (maximum 1 an).' };
    case 'INVALID_DURATION':
      return R.renderWizardInvalidDuration();
    case 'INVALID_DATE':
      return { text: '❌ Date invalide, déjà passée, ou format non reconnu (ex: `demain 08:00`, `20/08/2026 18:30`).' };
    case 'INVALID_TIME':
      return { text: '❌ Heure invalide (format attendu : HH:MM, ex: 08:00).' };
    case 'INVALID_WEEKDAY':
      return { text: '❌ Jour de la semaine non reconnu (ex: lundi, mardi, ..., dimanche).' };
    default:
      return R.renderInvalidSyntax();
  }
}

// --- Création directe (syntaxe rapide + récurrence) ---------------------

export async function createFromText(sock, { chatId, sender, rawText }) {
  const timezone = getUserTimezone(sender);
  const parsed = parseReminderCommand(rawText, timezone);

  if (!parsed.ok) {
    await sock.sendMessage(chatId, errorMessageFor(parsed.reason), { quoted: undefined });
    return { ok: false, reason: parsed.reason };
  }

  if (countActiveRemindersForUser(sender) >= MAX_ACTIVE_REMINDERS_PER_USER) {
    await sock.sendMessage(chatId, R.renderLimitReached(MAX_ACTIVE_REMINDERS_PER_USER));
    return { ok: false, reason: 'LIMIT_REACHED' };
  }

  // Un rappel est TOUJOURS personnel : notifié dans le chat privé du
  // créateur, qu'il ait tapé /remind en groupe ou en privé (voir brief
  // section 6, l'exemple ne montre qu'un message privé) — chatId de
  // destination = sender lui-même, jamais le groupe où la commande a été
  // tapée (contrairement à /poll, où le sondage reste dans son groupe).
  const reminder = createReminder({
    userId: sender,
    chatId: sender,
    message: parsed.message,
    scheduledAt: parsed.scheduledAt,
    timezone,
    recurrence: parsed.recurrence,
  });

  const label = parsed.label || relativeLabelFromMs(parsed.scheduledAt, parsed.recurrence);
  await sock.sendMessage(chatId, R.renderReminderCreated(reminder, { relativeLabel: label }));
  return { ok: true, reminder };
}

// --- Assistant interactif -------------------------------------------------

const WIZARD_PRESETS = {
  1: { ms: 10 * 60 * 1000, label: 'Dans : 10 minutes' },
  2: { ms: 60 * 60 * 1000, label: 'Dans : 1 heure' },
  3: { ms: 24 * 60 * 60 * 1000, label: 'Dans : 1 jour (demain, même heure)' },
};

export async function startWizard(sock, { chatId, sender }) {
  if (hasDraft(chatId, sender)) {
    await sock.sendMessage(chatId, { text: 'Un assistant de rappel est déjà en cours. Réponds, ou tape `/remind cancel` pour recommencer.' });
    return { ok: false, reason: 'DRAFT_IN_PROGRESS' };
  }
  startDraft(chatId, sender, () => {
    sock.sendMessage(chatId, { text: '⏰ Assistant de rappel abandonné (inactivité).' }).catch(() => {});
  });
  await sock.sendMessage(chatId, R.renderWizardMenu());
  return { ok: true };
}

export async function cancelWizard(sock, { chatId, sender }) {
  if (!hasDraft(chatId, sender)) return { ok: false, reason: 'NO_DRAFT' };
  clearDraft(chatId, sender);
  await sock.sendMessage(chatId, R.renderWizardCancelled());
  return { ok: true };
}

/**
 * Traite un message texte pendant que l'assistant est actif. Retourne
 * false si le texte n'était pas pertinent pour l'assistant (même contrat
 * que PollManager.handleWizardText) — en particulier, un texte préfixé
 * n'est JAMAIS avalé comme réponse d'étape (permet `/remind cancel` en
 * pleine saisie).
 */
export async function handleWizardText(sock, { sender, chatId, text }) {
  const draft = getDraft(chatId, sender);
  if (!draft) return false;

  const trimmed = (text || '').trim();
  if (trimmed.startsWith(config.prefix)) return false;

  if (draft.step === 'menu') {
    const choice = parseControlDigitExtended(trimmed);
    if (choice === null) {
      await sock.sendMessage(chatId, R.renderWizardInvalidMenuChoice());
      return true;
    }

    if (choice === 4) {
      draft.step = 'duration';
      touchDraft(chatId, sender, () => sock.sendMessage(chatId, { text: '⏰ Assistant de rappel abandonné (inactivité).' }).catch(() => {}));
      await sock.sendMessage(chatId, R.renderWizardAskDuration());
      return true;
    }

    const preset = WIZARD_PRESETS[choice];
    draft.scheduledAt = Date.now() + preset.ms;
    draft.label = preset.label;
    draft.step = 'message';
    touchDraft(chatId, sender, () => sock.sendMessage(chatId, { text: '⏰ Assistant de rappel abandonné (inactivité).' }).catch(() => {}));
    await sock.sendMessage(chatId, R.renderWizardAskMessage());
    return true;
  }

  if (draft.step === 'duration') {
    if (!looksLikeDuration(trimmed)) {
      await sock.sendMessage(chatId, R.renderWizardInvalidDuration());
      return true;
    }
    const ms = parseFlexibleDuration(trimmed);
    const check = ms === null ? { ok: false, reason: 'INVALID_DURATION' } : validateReminderDuration(ms);
    if (!check.ok) {
      await sock.sendMessage(chatId, errorMessageFor(ms === null ? 'INVALID_DURATION' : check.reason));
      return true;
    }
    draft.scheduledAt = Date.now() + ms;
    draft.label = `Dans : ${R.renderRelativeDelay(draft.scheduledAt)}`;
    draft.step = 'message';
    touchDraft(chatId, sender, () => sock.sendMessage(chatId, { text: '⏰ Assistant de rappel abandonné (inactivité).' }).catch(() => {}));
    await sock.sendMessage(chatId, R.renderWizardAskMessage());
    return true;
  }

  if (draft.step === 'message') {
    const check = validateMessage(trimmed);
    if (!check.ok) {
      await sock.sendMessage(chatId, check.reason === 'EMPTY_MESSAGE' ? R.renderWizardEmptyMessage() : R.renderWizardMessageTooLong(MAX_MESSAGE_LENGTH));
      return true;
    }

    if (countActiveRemindersForUser(sender) >= MAX_ACTIVE_REMINDERS_PER_USER) {
      clearDraft(chatId, sender);
      await sock.sendMessage(chatId, R.renderLimitReached(MAX_ACTIVE_REMINDERS_PER_USER));
      return true;
    }

    const timezone = getUserTimezone(sender);
    const reminder = createReminder({
      userId: sender,
      chatId: sender,
      message: check.message,
      scheduledAt: draft.scheduledAt,
      timezone,
      recurrence: null,
    });
    clearDraft(chatId, sender);
    await sock.sendMessage(chatId, R.renderReminderCreated(reminder, { relativeLabel: draft.label }));
    return true;
  }

  return false;
}

/** Comme parseControlDigit (QuizInteractionGuard) mais accepte 1 à 4 (menu de l'assistant, pas juste 1/2). */
function parseControlDigitExtended(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 && value <= 4 ? value : null;
}

// --- Gestion (annulation, liste, info) ------------------------------------

export async function cancelById(sock, { chatId, sender, id }) {
  const reminder = getReminder(id);
  if (!reminder || reminder.userId !== sender) {
    await sock.sendMessage(chatId, R.renderNotFound());
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (reminder.status !== 'pending') {
    await sock.sendMessage(chatId, { text: `❌ Ce rappel n'est plus actif (statut : ${reminder.status}).` });
    return { ok: false, reason: 'NOT_PENDING' };
  }
  const cancelled = cancelReminder(id);
  await sock.sendMessage(chatId, R.renderReminderCancelled(cancelled));
  return { ok: true, reminder: cancelled };
}

export async function requestCancelAll(sock, { chatId, sender }) {
  const count = countActiveRemindersForUser(sender);
  if (count === 0) {
    await sock.sendMessage(chatId, { text: "Tu n'as aucun rappel actif à annuler." });
    return { ok: false, reason: 'NONE_ACTIVE' };
  }
  startCancelAllConfirmation(chatId, sender, () => {
    sock.sendMessage(chatId, { text: '⏰ Confirmation expirée, tes rappels sont conservés.' }).catch(() => {});
  });
  await sock.sendMessage(chatId, R.renderCancelAllPrompt(count));
  return { ok: true };
}

export async function handleCancelAllConfirmText(sock, { sender, chatId, text }) {
  if (!hasCancelAllConfirmation(chatId, sender)) return false;
  const digit = parseControlDigit(text);
  if (digit === null) {
    await sock.sendMessage(chatId, { text: 'Réponds *1* pour confirmer, *2* pour annuler.' });
    return true;
  }

  clearCancelAllConfirmation(chatId, sender);
  if (digit === 1) {
    const count = cancelAllForUser(sender);
    await sock.sendMessage(chatId, R.renderCancelAllDone(count));
  } else {
    await sock.sendMessage(chatId, R.renderCancelAllAborted());
  }
  return true;
}

export function getListMessage(sender) {
  const reminders = getActiveRemindersForUser(sender);
  return R.renderRemindersList(reminders, getUserTimezone(sender));
}

export function getInfoMessage(sender, id) {
  const reminder = getReminder(id);
  if (!reminder || reminder.userId !== sender) return R.renderNotFound();
  return R.renderReminderInfo(reminder, reminder.timezone);
}

// --- Récurrence : prochaine occurrence après envoi -----------------------

/** Calcule la prochaine échéance d'un rappel récurrent après son déclenchement. Exporté pour RemindScheduler.js. */
export function computeNextOccurrence(reminder, now = Date.now()) {
  if (!reminder.recurrence) return null;
  const { recurrence, timezone } = reminder;
  if (recurrence.type === 'daily') {
    const [h, m] = recurrence.time.split(':').map(Number);
    return nextDailyOccurrence(h, m, timezone, now);
  }
  if (recurrence.type === 'weekly') {
    const [h, m] = recurrence.time.split(':').map(Number);
    return nextWeekdayOccurrence(recurrence.weekday, h, m, timezone, now);
  }
  return null;
}

// --- Livraison (appelé par RemindScheduler.js) ----------------------------
//
// Même principe d'encapsulation que Poll : le planificateur ne doit jamais
// muter RemindStorage directement, seulement passer par ici. Il PEUT en
// revanche lire directement RemindStorage.getDueReminders (requête pure,
// sans effet de bord) — même précédent que PollCleanupService.js qui
// importe getExpiredActivePolls directement depuis PollStorage.js.

/**
 * Envoie un rappel arrivé à échéance. En cas d'échec d'envoi (téléphone
 * hors ligne, socket déconnecté...), NE marque PAS le rappel comme envoyé
 * : il reste "pending" et sera retenté au prochain balayage — c'est
 * RemindScheduler qui borne ces tentatives via EXPIRY_GRACE_MS (voir
 * là-bas), pas ce module.
 */
export async function deliverDueReminder(sock, reminder, now = Date.now()) {
  try {
    await sock.sendMessage(reminder.chatId, R.renderReminderFiring(reminder));
  } catch (err) {
    logger.warn({ err, reminderId: reminder.id }, "Échec d'envoi d'un rappel, nouvelle tentative au prochain balayage");
    return 'retry';
  }

  const nextMs = computeNextOccurrence(reminder, now);
  markSent(reminder.id, nextMs);
  return nextMs ? 'recurred' : 'sent';
}

/** Rappel arrivé à échéance depuis trop longtemps (voir RemindScheduler.EXPIRY_GRACE_MS) : abandonné sans envoi. */
export function expireDueReminder(reminder) {
  markExpired(reminder.id);
}
