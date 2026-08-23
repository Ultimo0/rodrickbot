import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import {
  createPoll,
  getPoll,
  getPollByMessageId,
  getMostRecentPollForChat,
  attachMessageId,
  setVote,
  closePoll as storageClosePoll,
  updatePollClosesAt,
  deletePoll as storageDeletePoll,
  listActivePollsForChat,
  listAllActivePolls,
} from './PollStorage.js';
import {
  startDraft,
  getDraft,
  touchDraft,
  clearDraft,
  hasDraft,
  startDeleteConfirmation,
  getDeleteConfirmation,
  clearDeleteConfirmation,
  hasDeleteConfirmation,
} from './PollSessionManager.js';
import { schedulePollExpiry, clearPollExpiry } from './PollTimer.js';
import { parsePollDuration, validatePollDuration, looksLikePollDuration } from './pollDuration.js';
// Réutilisation directe : dédoublonnage réseau + parsing de chiffre nu, déjà
// écrits et éprouvés pour /quiz (voir consigne "réutilise le maximum de code
// existant"). Fonctions génériques, aucun couplage avec le contenu du quiz.
import { isDuplicateDelivery, markDelivered, parseAnswerDigit, parseControlDigit } from '../quiz/QuizInteractionGuard.js';
import * as Renderer from './PollRenderer.js';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 12; // plafond raisonnable : au-delà, un chiffre à 2 chiffres complique le vote par texte nu

// --- Syntaxe rapide -------------------------------------------------------

/**
 * Parse `"Titre" Option 1 | Option 2 | Option 3 [| durée]`.
 * Retourne { title, options, durationMs } ou null si la syntaxe ne
 * correspond pas (auquel cas l'appelant doit proposer l'assistant pas-à-pas).
 */
export function parseQuickSyntax(rawText) {
  const match = /^"([^"]+)"\s+(.+)$/s.exec(rawText.trim());
  if (!match) return null;

  const title = match[1].trim();
  const segments = match[2].split('|').map((s) => s.trim()).filter(Boolean);
  if (segments.length < MIN_OPTIONS) return null;

  let durationMs = null;
  const last = segments[segments.length - 1];
  if (looksLikePollDuration(last)) {
    durationMs = parsePollDuration(last);
    segments.pop();
  }

  if (segments.length < MIN_OPTIONS || segments.length > MAX_OPTIONS) return null;
  if (!title) return null;

  return { title, options: segments, durationMs };
}

// --- Création commune (wizard ET syntaxe rapide aboutissent ici) --------

async function finalizeCreation(sock, { chatId, creatorId, title, options, durationMs }) {
  const closesAt = durationMs ? Date.now() + durationMs : null;
  const poll = createPoll({ chatId, creatorId, title, options, closesAt });

  const sent = await sock.sendMessage(chatId, Renderer.renderPollCard(poll));
  const withMessageId = attachMessageId(poll.id, sent?.key?.id || null);

  if (closesAt) {
    schedulePollExpiry(poll.id, closesAt - Date.now(), (id) => expirePoll(sock, id));
  }

  return withMessageId || poll;
}

/** /poll "Titre" A | B | C [| durée] */
export async function quickCreate(sock, { chatId, sender, rawText }) {
  const parsed = parseQuickSyntax(rawText);
  if (!parsed) return { ok: false, reason: 'INVALID_SYNTAX' };

  if (parsed.durationMs !== null) {
    const validation = validatePollDuration(parsed.durationMs);
    if (!validation.ok) return { ok: false, reason: validation.reason };
  }

  const poll = await finalizeCreation(sock, {
    chatId,
    creatorId: sender,
    title: parsed.title,
    options: parsed.options,
    durationMs: parsed.durationMs,
  });

  return { ok: true, poll };
}

// --- Assistant interactif -------------------------------------------------

/** /poll (sans argument). Retourne { ok, reason? }. */
export async function startWizard(sock, { chatId, sender }) {
  if (hasDraft(chatId, sender)) {
    await sock.sendMessage(chatId, Renderer.renderWizardAlreadyInProgress());
    return { ok: false, reason: 'DRAFT_IN_PROGRESS' };
  }

  startDraft(chatId, sender, () => {
    sock.sendMessage(chatId, Renderer.renderWizardExpired()).catch((err) => {
      logger.warn({ err }, "Impossible de notifier l'expiration du brouillon de sondage");
    });
  });

  await sock.sendMessage(chatId, Renderer.renderWizardAskTitle());
  return { ok: true };
}

/** /poll cancel */
export async function cancelWizard(sock, { chatId, sender }) {
  if (!hasDraft(chatId, sender)) return { ok: false, reason: 'NO_DRAFT' };
  clearDraft(chatId, sender);
  await sock.sendMessage(chatId, Renderer.renderWizardCancelled());
  return { ok: true };
}

/**
 * Traite un message texte brut pendant qu'un brouillon est en cours pour cet
 * utilisateur dans ce chat. Retourne true si le message a été consommé par
 * l'assistant (donc à ne PAS faire suivre au reste du pipeline), false sinon
 * (aucun brouillon en cours pour cet expéditeur : laisse passer le message).
 *
 * IMPORTANT : le texte commençant par le préfixe de commande n'est jamais
 * capturé ici (voir messageHandler.js) — /poll cancel doit rester une vraie
 * commande même en pleine saisie d'un brouillon.
 */
export async function handleWizardText(sock, { sender, chatId, text }) {
  const draft = getDraft(chatId, sender);
  if (!draft) return false;

  const trimmed = (text || '').trim();
  if (!trimmed) return true; // message vide : ignoré silencieusement, brouillon intact

  // Un texte qui commence par le préfixe de commande n'est JAMAIS capturé
  // comme titre/option — "/poll cancel" (ou toute autre commande) doit
  // rester utilisable en pleine saisie d'un brouillon. Sans ce garde-fou,
  // "/poll cancel" serait avalé comme une proposition littérale, rendant la
  // commande cancel inaccessible tant que le brouillon est en cours — exact
  // inverse de ce que "cancel" est censé faire.
  if (trimmed.startsWith(config.prefix)) return false;

  touchDraft(chatId, sender, () => {
    sock.sendMessage(chatId, Renderer.renderWizardExpired()).catch(() => {});
  });

  if (draft.step === 'title') {
    draft.title = trimmed;
    draft.step = 'options';
    await sock.sendMessage(chatId, Renderer.renderWizardAskOptions());
    return true;
  }

  // step === 'options'
  if (/^fin$/i.test(trimmed)) {
    if (draft.options.length < MIN_OPTIONS) {
      await sock.sendMessage(chatId, Renderer.renderWizardNeedMoreOptions());
      return true;
    }
    clearDraft(chatId, sender);
    await finalizeCreation(sock, {
      chatId,
      creatorId: sender,
      title: draft.title,
      options: draft.options,
      durationMs: null,
    });
    return true;
  }

  if (draft.options.length >= MAX_OPTIONS) {
    await sock.sendMessage(chatId, { text: `❌ Maximum ${MAX_OPTIONS} propositions. Envoie *fin* pour terminer avec celles déjà ajoutées.` });
    return true;
  }

  draft.options.push(trimmed);
  await sock.sendMessage(chatId, Renderer.renderWizardOptionAdded(draft.options));
  return true;
}

// --- Vote -------------------------------------------------------------------

const pollsBeingVoted = new Set(); // anti-double-envoi concurrent, même principe que QuizEngine.sessionsBeingAnswered

/**
 * Traite une réponse (reply) à une carte de sondage. `stanzaId` est l'id du
 * message cité (voir utils/quotedContent.js) — c'est lui qui identifie SANS
 * AMBIGUÏTÉ quel sondage est visé, ce qui permet plusieurs sondages actifs
 * en même temps dans le même chat sans conflit (contrairement à /quiz, où
 * un seul quiz actif par utilisateur suffit à lever l'ambiguïté).
 * Retourne false si ce n'était pas un vote valide (pas un chiffre nu, ou pas
 * une réponse à une carte de sondage) : laisse alors passer le message.
 */
export async function handleVoteText(sock, { sender, chatId, messageId, text, stanzaId }) {
  if (!stanzaId) return false;

  const poll = getPollByMessageId(stanzaId);
  if (!poll) return false; // réponse à un tout autre message : pas concerné

  const answerNumber = parseAnswerDigit(text);
  if (answerNumber === null) return false; // pas un chiffre nu : pas un vote

  if (isDuplicateDelivery(messageId)) return true;
  markDelivered(messageId);

  if (pollsBeingVoted.has(poll.id)) return true; // anti-double-envoi concurrent
  pollsBeingVoted.add(poll.id);

  try {
    const current = getPoll(poll.id);
    if (!current) return true;

    if (current.status !== 'active') {
      await sock.sendMessage(chatId, Renderer.renderVoteOnClosedPoll());
      return true;
    }

    const optionIndex = answerNumber - 1;
    if (optionIndex < 0 || optionIndex >= current.options.length) {
      await sock.sendMessage(chatId, Renderer.renderVoteInvalidNumber(current));
      return true;
    }

    const updated = setVote(current.id, sender, String(optionIndex));
    await sock.sendMessage(chatId, Renderer.renderVoteRecorded(updated, String(optionIndex)));
    return true;
  } finally {
    pollsBeingVoted.delete(poll.id);
  }
}

// --- Résolution de cible (id explicite ou sondage le plus récent du chat) --

function resolvePoll(chatId, id) {
  if (id) return getPoll(id);
  return getMostRecentPollForChat(chatId);
}

function canManage(poll, sender, isAdmin) {
  return isAdmin || poll.creatorId === sender;
}

// --- Fermeture --------------------------------------------------------------

export async function closePollCommand(sock, { chatId, sender, isAdmin, id }) {
  const poll = resolvePoll(chatId, id);
  if (!poll) return { ok: false, reason: 'NOT_FOUND' };
  if (!canManage(poll, sender, isAdmin)) return { ok: false, reason: 'FORBIDDEN' };
  if (poll.status !== 'active') return { ok: false, reason: 'ALREADY_CLOSED' };

  clearPollExpiry(poll.id);
  const closed = storageClosePoll(poll.id, 'manual');
  await sock.sendMessage(chatId, Renderer.renderPollClosed(closed));
  return { ok: true, poll: closed };
}

/** Fermeture automatique par expiration (timer ou balayage PollCleanupService). */
export async function expirePoll(sock, pollId) {
  const poll = getPoll(pollId);
  if (!poll || poll.status !== 'active') return;

  clearPollExpiry(pollId);
  const closed = storageClosePoll(pollId, 'expired');

  try {
    await sock.sendMessage(poll.chatId, Renderer.renderPollExpired(closed));
  } catch (err) {
    logger.warn({ err, pollId }, "Impossible de notifier l'expiration du sondage");
  }
}

// --- Suppression (avec confirmation) ----------------------------------------

export async function requestDelete(sock, { chatId, sender, isAdmin, id }) {
  const poll = resolvePoll(chatId, id);
  if (!poll) return { ok: false, reason: 'NOT_FOUND' };
  if (!canManage(poll, sender, isAdmin)) return { ok: false, reason: 'FORBIDDEN' };

  startDeleteConfirmation(chatId, sender, poll.id, () => {
    sock.sendMessage(chatId, { text: '⌛ Confirmation de suppression expirée. Le sondage est intact.' }).catch(() => {});
  });

  await sock.sendMessage(chatId, Renderer.renderDeleteConfirmation(poll));
  return { ok: true };
}

/**
 * Traite un "1"/"2" alors qu'une confirmation de suppression est en attente
 * pour cet utilisateur. Retourne false si aucune confirmation n'est en
 * attente ou si le texte n'est pas un "1"/"2" (laisse passer le message).
 */
export async function handleDeleteConfirmText(sock, { sender, chatId, text }) {
  const pending = getDeleteConfirmation(chatId, sender);
  if (!pending) return false;

  const choice = parseControlDigit(text);
  if (choice === null) return false;

  clearDeleteConfirmation(chatId, sender);

  if (choice === 2) {
    await sock.sendMessage(chatId, Renderer.renderDeleteCancelled());
    return true;
  }

  const poll = getPoll(pending.pollId);
  if (!poll) {
    await sock.sendMessage(chatId, { text: '❌ Ce sondage a déjà été supprimé entre-temps.' });
    return true;
  }

  clearPollExpiry(poll.id);
  storageDeletePoll(poll.id);
  await sock.sendMessage(chatId, Renderer.renderDeleteDone(poll.id));
  return true;
}

// --- Lecture seule : info / résultats / liste -------------------------------

export function getResultsMessage(chatId, id) {
  const poll = resolvePoll(chatId, id);
  if (!poll) return Renderer.renderPollNotFound(id);
  return Renderer.renderResults(poll);
}

export function getInfoMessage(chatId, id) {
  const poll = resolvePoll(chatId, id);
  if (!poll) return Renderer.renderPollNotFound(id);
  return Renderer.renderInfo(poll);
}

export function getListMessage(chatId) {
  return Renderer.renderPollList(listActivePollsForChat(chatId));
}

// --- Changer la durée d'un sondage existant ---------------------------------

export async function setDurationCommand(sock, { chatId, sender, isAdmin, id, durationInput }) {
  const poll = resolvePoll(chatId, id);
  if (!poll) return { ok: false, reason: 'NOT_FOUND' };
  if (!canManage(poll, sender, isAdmin)) return { ok: false, reason: 'FORBIDDEN' };
  if (poll.status !== 'active') return { ok: false, reason: 'ALREADY_CLOSED' };

  const ms = parsePollDuration(durationInput);
  if (ms === null) return { ok: false, reason: 'INVALID_SYNTAX' };
  const validation = validatePollDuration(ms);
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const closesAt = Date.now() + ms;
  const updated = updatePollClosesAt(poll.id, closesAt);
  schedulePollExpiry(poll.id, ms, (pollId) => expirePoll(sock, pollId));

  await sock.sendMessage(chatId, Renderer.renderDurationUpdated(updated));
  return { ok: true, poll: updated };
}

// --- Redémarrage --------------------------------------------------------------

/** Réarme les timers d'expiration des sondages encore actifs après un redémarrage. */
export function resumeActivePolls(sock) {
  const now = Date.now();
  let resumed = 0;

  for (const poll of listAllActivePolls()) {
    if (!poll.closesAt) continue; // pas de durée fixée : rien à réarmer, reste actif indéfiniment
    const remaining = poll.closesAt - now;
    if (remaining <= 0) continue; // déjà expiré : traité par PollCleanupService au premier balayage, pas ici
    schedulePollExpiry(poll.id, remaining, (id) => expirePoll(sock, id));
    resumed += 1;
  }

  if (resumed > 0) logger.info(`Poll: ${resumed} sondage(s) avec expiration réarmé(s) après redémarrage`);
  return resumed;
}

