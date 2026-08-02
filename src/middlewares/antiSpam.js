/**
 * Middleware anti-spam simple: limite le nombre de commandes par utilisateur
 * sur une fenêtre de temps glissante.
 *
 * Un middleware reçoit le contexte du message et retourne:
 * - true  -> le traitement continue normalement
 * - false -> le traitement est bloqué (le message est ignoré)
 */
const WINDOW_MS = 10_000;
const MAX_REQUESTS = 5;
const history = new Map(); // jid -> timestamps[]

export function antiSpamMiddleware(ctx) {
  const now = Date.now();
  const timestamps = (history.get(ctx.sender) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return false;
  }

  timestamps.push(now);
  history.set(ctx.sender, timestamps);
  return true;
}
