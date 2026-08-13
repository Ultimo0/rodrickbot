/**
 * CalcTimer
 * ---------
 * Contrairement à QuizTimer (un timer d'INACTIVITÉ par session, repoussé à
 * chaque réponse), ici c'est un timer PAR QUESTION : chaque opération a sa
 * propre fenêtre de réponse courte (voir CalcEngine.QUESTION_WINDOW_MS), et
 * l'absence de réponse dans les temps compte comme une réponse manquée puis
 * enchaîne automatiquement sur la question suivante — c'est le rythme
 * "rapide" du jeu, pas un abandon de partie.
 */

const handles = new Map(); // sessionId -> Timeout

export function scheduleQuestionTimeout(sessionId, ms, onTimeout) {
  clearQuestionTimeout(sessionId);
  const handle = setTimeout(() => {
    handles.delete(sessionId);
    onTimeout(sessionId);
  }, ms);
  if (typeof handle.unref === 'function') handle.unref();
  handles.set(sessionId, handle);
}

export function clearQuestionTimeout(sessionId) {
  const existing = handles.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    handles.delete(sessionId);
  }
}
