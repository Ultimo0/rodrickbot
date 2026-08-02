/**
 * État "interrupteur à distance" — piloté par le dashboard de suivi
 * (voir dashboard-server/). Volontairement NON persisté sur disque :
 * à chaque démarrage le bot repart activé par défaut, puis se
 * resynchronise dès le premier heartbeat réussi (voir core/telemetry.js).
 * Si la télémétrie n'est pas configurée, cette valeur ne change jamais
 * et le bot fonctionne normalement.
 */

let remotelyDisabled = false;

export function isRemotelyDisabled() {
  return remotelyDisabled;
}

export function setRemotelyDisabled(value) {
  remotelyDisabled = Boolean(value);
}