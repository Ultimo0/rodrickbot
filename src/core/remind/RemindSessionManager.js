/**
 * RemindSessionManager
 * ---------------------
 * État TRANSITOIRE (en mémoire uniquement, jamais sur disque), même
 * principe que core/poll/PollSessionManager.js — mêmes garanties :
 * perdre un brouillon en cours ou une confirmation en attente lors d'un
 * redémarrage est sans conséquence (rien n'a encore été créé/annulé).
 *
 * Deux états distincts :
 *  1. Le brouillon de l'assistant interactif (/remind sans argument) :
 *     étape "menu" (choix 1-4) puis étape "message" (texte libre).
 *  2. Une confirmation en attente avant "/remind cancel all" (même esprit
 *     que la confirmation de suppression de /poll delete : 1 = confirmer,
 *     2 = annuler).
 *
 * Clé = `${chatId}:${sender}`, identique à PollSessionManager.js /
 * core/downloadSessions.js.
 */

const DRAFT_TTL_MS = 5 * 60 * 1000; // même fenêtre que /poll (cohérence UX)
const CONFIRM_TTL_MS = 5 * 60 * 1000;

const drafts = new Map(); // key -> { chatId, sender, step: 'menu'|'message', scheduledAt, timezone, recurrence, label, timer }
const pendingCancelAll = new Map(); // key -> { chatId, sender, timer }

function key(chatId, sender) {
  return `${chatId}:${sender}`;
}

// --- Brouillon de création (assistant) -----------------------------------

export function startDraft(chatId, sender, onExpire) {
  const k = key(chatId, sender);
  clearDraft(chatId, sender);

  const timer = setTimeout(() => {
    drafts.delete(k);
    onExpire?.();
  }, DRAFT_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const draft = {
    chatId,
    sender,
    step: 'menu',
    scheduledAt: null, // rempli une fois l'étape "menu" résolue (choix 1/2/3, ou durée saisie pour le choix 4)
    timezone: null,
    recurrence: null,
    label: null, // pour la confirmation finale ("dans 10 minutes", "demain à 08:00"...)
    timer,
  };
  drafts.set(k, draft);
  return draft;
}

export function getDraft(chatId, sender) {
  return drafts.get(key(chatId, sender)) || null;
}

export function hasDraft(chatId, sender) {
  return drafts.has(key(chatId, sender));
}

export function touchDraft(chatId, sender, onExpire) {
  const k = key(chatId, sender);
  const draft = drafts.get(k);
  if (!draft) return null;

  clearTimeout(draft.timer);
  const timer = setTimeout(() => {
    drafts.delete(k);
    onExpire?.();
  }, DRAFT_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  draft.timer = timer;
  return draft;
}

export function clearDraft(chatId, sender) {
  const k = key(chatId, sender);
  const existing = drafts.get(k);
  if (existing) clearTimeout(existing.timer);
  drafts.delete(k);
}

// --- Confirmation avant "cancel all" -------------------------------------

export function startCancelAllConfirmation(chatId, sender, onExpire) {
  const k = key(chatId, sender);
  clearCancelAllConfirmation(chatId, sender);

  const timer = setTimeout(() => {
    pendingCancelAll.delete(k);
    onExpire?.();
  }, CONFIRM_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const confirmation = { chatId, sender, timer };
  pendingCancelAll.set(k, confirmation);
  return confirmation;
}

export function hasCancelAllConfirmation(chatId, sender) {
  return pendingCancelAll.has(key(chatId, sender));
}

export function clearCancelAllConfirmation(chatId, sender) {
  const k = key(chatId, sender);
  const existing = pendingCancelAll.get(k);
  if (existing) clearTimeout(existing.timer);
  pendingCancelAll.delete(k);
}
