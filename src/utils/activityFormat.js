/**
 * Formate un timestamp d'activité en label lisible pour les rendus
 * !activity / !inactive. Volontairement simple (pas de dépendance) — même
 * esprit que core/remind/RemindRenderer.js, mais sans gestion de fuseau
 * horaire custom : la machine hôte définit l'heure affichée, ce qui est
 * suffisant ici (contrairement à /remind, aucune alarme n'en dépend).
 */
export function formatLastActivity(ts) {
  if (!ts) return 'Jamais';

  const now = new Date();
  const then = new Date(ts);
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const time = then.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(now, then)) return `Aujourd'hui à ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(yesterday, then)) return `Hier à ${time}`;

  const date = then.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date} à ${time}`;
}

export const PERIOD_LABELS = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
};

/** Label lisible d'une période ('today'|'week'|'month'|'Nd'). */
export function periodLabel(period) {
  if (PERIOD_LABELS[period]) return PERIOD_LABELS[period];
  const match = /^(\d+)d$/.exec(period);
  if (match) return `${match[1]} derniers jours`;
  return period;
}
