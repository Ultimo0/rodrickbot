/**
 * PollSessionManager
 * -------------------
 * État TRANSITOIRE (en mémoire uniquement, jamais sur disque) de deux
 * choses distinctes des sondages déjà créés (ceux-là sont dans
 * PollStorage.js, persistés) :
 *
 *  1. Le brouillon en cours de saisie via l'assistant interactif
 *     (/poll sans argument) : titre puis options, tant que l'utilisateur
 *     n'a pas envoyé "fin".
 *  2. Une confirmation en attente avant suppression définitive
 *     (/poll delete), même esprit que QuizResetService (1 = confirmer,
 *     2 = annuler), en attente d'une réponse texte.
 *
 * Ne pas persister ces deux états est un choix assumé : perdre un
 * brouillon non terminé ou une confirmation en attente lors d'un
 * redémarrage est sans conséquence (rien n'a encore été créé/supprimé) —
 * contrairement aux sondages eux-mêmes (PollStorage), dont la persistance
 * immédiate est, elle, requise par le brief ("si RodrickBOT redémarre :
 * les sondages actifs doivent être restaurés").
 *
 * Clé = `${chatId}:${sender}` (identique à core/downloadSessions.js) : un
 * brouillon ou une confirmation est toujours scopé à UN utilisateur dans
 * UN chat précis, jamais partagé entre plusieurs utilisateurs d'un groupe.
 */

const DRAFT_TTL_MS = 5 * 60 * 1000; // 5 minutes d'inactivité avant abandon automatique du brouillon
const CONFIRM_TTL_MS = 5 * 60 * 1000; // même fenêtre que /quiz reset (cohérence UX)

const drafts = new Map(); // key -> { chatId, sender, step: 'title'|'options', title, options: string[], timer }
const pendingConfirmations = new Map(); // key -> { chatId, sender, action: 'delete', pollId, timer }

function key(chatId, sender) {
  return `${chatId}:${sender}`;
}

// --- Brouillon de création ---------------------------------------------

export function startDraft(chatId, sender, onExpire) {
  const k = key(chatId, sender);
  clearDraft(chatId, sender);

  const timer = setTimeout(() => {
    drafts.delete(k);
    onExpire?.();
  }, DRAFT_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const draft = { chatId, sender, step: 'title', title: null, options: [], timer };
  drafts.set(k, draft);
  return draft;
}

export function getDraft(chatId, sender) {
  return drafts.get(key(chatId, sender)) || null;
}

export function hasDraft(chatId, sender) {
  return drafts.has(key(chatId, sender));
}

/** Repousse l'expiration du brouillon (appelé à chaque étape franchie). */
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

// --- Confirmation avant suppression --------------------------------------

export function startDeleteConfirmation(chatId, sender, pollId, onExpire) {
  const k = key(chatId, sender);
  clearDeleteConfirmation(chatId, sender);

  const timer = setTimeout(() => {
    pendingConfirmations.delete(k);
    onExpire?.();
  }, CONFIRM_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const confirmation = { chatId, sender, action: 'delete', pollId, timer };
  pendingConfirmations.set(k, confirmation);
  return confirmation;
}

export function getDeleteConfirmation(chatId, sender) {
  return pendingConfirmations.get(key(chatId, sender)) || null;
}

export function hasDeleteConfirmation(chatId, sender) {
  return pendingConfirmations.has(key(chatId, sender));
}

export function clearDeleteConfirmation(chatId, sender) {
  const k = key(chatId, sender);
  const existing = pendingConfirmations.get(k);
  if (existing) clearTimeout(existing.timer);
  pendingConfirmations.delete(k);
}
