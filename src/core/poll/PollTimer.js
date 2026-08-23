/**
 * PollTimer
 * ---------
 * Un timer d'expiration par sondage (uniquement pour les sondages avec une
 * durée fixée — closesAt non nul). Volontairement sans accès disque ni
 * connaissance du contenu du sondage : PollManager fournit le callback,
 * PollTimer se contente de le déclencher au bon moment. Même séparation
 * que src/core/quiz/QuizTimer.js.
 */

const handles = new Map(); // pollId -> Timeout

export function schedulePollExpiry(pollId, ms, onExpire) {
  clearPollExpiry(pollId);
  const handle = setTimeout(() => {
    handles.delete(pollId);
    onExpire(pollId);
  }, ms);
  // Ne bloque pas l'arrêt normal du process sur ce timer.
  if (typeof handle.unref === 'function') handle.unref();
  handles.set(pollId, handle);
}

export function clearPollExpiry(pollId) {
  const existing = handles.get(pollId);
  if (existing) {
    clearTimeout(existing);
    handles.delete(pollId);
  }
}

export function hasScheduledExpiry(pollId) {
  return handles.has(pollId);
}
