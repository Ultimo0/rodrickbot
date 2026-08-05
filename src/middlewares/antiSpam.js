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
  const hasHistory = history.has(ctx.sender);

  // Filtre les horodatages récents UNIQUEMENT si l'utilisateur a un historique.
  const recentTimestamps = hasHistory
    ? history.get(ctx.sender).filter((t) => now - t < WINDOW_MS)
    : [];

  // Si un utilisateur avait un historique mais que tous les horodatages ont expiré,
  // on le supprime de la Map pour libérer la mémoire.
  if (hasHistory && recentTimestamps.length === 0) {
    history.delete(ctx.sender);
  }

  // Contrôle anti-spam
  if (recentTimestamps.length >= MAX_REQUESTS) {
    // Met à jour l'historique avec la liste filtrée pour que l'utilisateur
    // soit débloqué après la fenêtre de temps, puis bloque.
    history.set(ctx.sender, recentTimestamps);
    return false;
  }

  // L'utilisateur est autorisé, on ajoute le nouvel horodatage.
  recentTimestamps.push(now);
  history.set(ctx.sender, recentTimestamps);
  return true;
}
