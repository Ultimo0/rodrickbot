/**
 * QuizTimer
 * ---------
 * Un seul timer d'inactivité par session (pas un timer par question : le
 * brief demande une expiration après 10 minutes d'INACTIVITÉ, donc chaque
 * réponse doit repousser l'échéance plutôt que d'empiler des timers).
 *
 * Volontairement sans accès disque ni connaissance du contenu du quiz :
 * QuizEngine fournit le callback, QuizTimer se contente de le déclencher
 * au bon moment. Cette séparation est ce qui permettra plus tard un
 * chronomètre PAR QUESTION (mode "défi") sans toucher à ce fichier.
 */

const handles = new Map(); // sessionId -> Timeout

export function scheduleInactivityTimeout(sessionId, ms, onTimeout) {
  clearInactivityTimeout(sessionId);
  const handle = setTimeout(() => {
    handles.delete(sessionId);
    onTimeout(sessionId);
  }, ms);
  // Ne bloque pas l'arrêt normal du process sur ce timer.
  if (typeof handle.unref === 'function') handle.unref();
  handles.set(sessionId, handle);
}

export function clearInactivityTimeout(sessionId) {
  const existing = handles.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    handles.delete(sessionId);
  }
}

export function hasActiveTimeout(sessionId) {
  return handles.has(sessionId);
}
