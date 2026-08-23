/**
 * remindDate.js
 * -------------
 * Aucun utilitaire de date/heure/fuseau horaire n'existait dans RodrickBOT
 * avant ce module (vérifié : aucune lib comme dayjs/luxon/date-fns en
 * dépendance, seuls des `new Date(x).toLocaleString('fr-FR')` ponctuels
 * pour de l'AFFICHAGE, jamais du PARSING de date utilisateur). Ce fichier
 * est donc entièrement nouveau, pas une extraction d'un système existant.
 *
 * Aucune nouvelle dépendance ajoutée : `Intl.DateTimeFormat` (natif Node,
 * ICU complet vérifié disponible dans cet environnement) suffit à convertir
 * une heure "murale" (ex: 08:00 à Douala) en instant UTC exact, y compris à
 * travers les changements d'heure d'été — technique standard dite "double
 * passage" (on formate un instant UTC candidat dans le fuseau cible, on
 * mesure l'écart avec l'heure murale voulue, on corrige).
 */

// Fuseau horaire par défaut tant qu'aucune préférence par utilisateur
// n'existe dans RodrickBOT (voir getUserTimezone ci-dessous). Le public
// visé par ce bot (voir developerName dans settings.json) est
// francophone/Afrique centrale — UTC+1 fixe, sans heure d'été, choix
// nettement plus sûr par défaut qu'un fuseau à DST comme Europe/Paris.
export const DEFAULT_TIMEZONE = 'Africa/Douala';

/**
 * Point d'extension pour un futur système de préférences utilisateur.
 * RodrickBOT n'a aujourd'hui aucune notion de fuseau par utilisateur
 * (aucun fichier de préférences/profil trouvé dans le projet) — cette
 * fonction retourne donc toujours DEFAULT_TIMEZONE pour l'instant, mais
 * centralise le point d'appel : le jour où un tel système existe, seul CE
 * fichier a besoin d'être modifié (aucun appelant de remindDate.js/
 * RemindManager.js n'a à changer).
 */
export function getUserTimezone(_userId) {
  return DEFAULT_TIMEZONE;
}

const WEEKDAY_NAMES = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/** Convertit une heure murale (année/mois/jour/heure/minute) dans un fuseau donné en epoch ms UTC exact. */
export function zonedTimeToUtcMs(year, month, day, hour, minute, timeZone) {
  const asIfUTC = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(asIfUTC)).map((p) => [p.type, p.value]));
  const shownAsUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), // certains navigateurs/ICU rendent minuit "24:00"
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = shownAsUTC - asIfUTC;
  return asIfUTC - offset;
}

/** Date/heure "vues" dans un fuseau donné à l'instant `now` (epoch ms), sous forme de composants {year, month, day, hour, minute}. */
function nowInTimezone(timeZone, now = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function addDaysToYmd(year, month, day, deltaDays, timeZone) {
  // On passe par un instant UTC réel (midi, pour éviter tout souci de bord
  // de fuseau) plutôt que d'incrémenter "day" à la main : gère nativement
  // les fins de mois/années sans réimplémenter un calendrier.
  const noon = zonedTimeToUtcMs(year, month, day, 12, 0, timeZone);
  const shifted = new Date(noon + deltaDays * 24 * 60 * 60 * 1000);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(shifted).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * Parse une heure au format HH:MM (ou H:MM / HHhMM / HHh). Retourne
 * {hour, minute} ou null si invalide.
 */
function parseClockTime(raw) {
  const match = raw.trim().match(/^(\d{1,2})[:h](\d{2})?$/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Tente de parser une expression de date/heure ABSOLUE en langage
 * volontairement limité (pas de NLP générique, pour rester prévisible et
 * robuste — voir brief section 8, "dates invalides" doit être géré
 * proprement, jamais planter) :
 *
 *   "demain 08:00"
 *   "aujourd'hui 21:30"
 *   "20/08/2026 18:30"
 *
 * Retourne { ms, label } si reconnu et dans le futur, sinon null (jamais
 * d'exception — voir RemindManager pour le message d'erreur associé).
 */
export function parseAbsoluteDateTime(text, timeZone = DEFAULT_TIMEZONE, now = Date.now()) {
  const raw = text.trim().toLowerCase().replace(/\s+/g, ' ');

  // "demain HH:MM"
  let match = raw.match(/^demain\s+(.+)$/);
  if (match) {
    const time = parseClockTime(match[1]);
    if (!time) return null;
    const today = nowInTimezone(timeZone, now);
    const target = addDaysToYmd(today.year, today.month, today.day, 1, timeZone);
    const ms = zonedTimeToUtcMs(target.year, target.month, target.day, time.hour, time.minute, timeZone);
    return ms > now ? { ms, label: `demain à ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` } : null;
  }

  // "aujourd'hui HH:MM"
  match = raw.match(/^aujourd'?hui\s+(.+)$/);
  if (match) {
    const time = parseClockTime(match[1]);
    if (!time) return null;
    const today = nowInTimezone(timeZone, now);
    const ms = zonedTimeToUtcMs(today.year, today.month, today.day, time.hour, time.minute, timeZone);
    return ms > now ? { ms, label: `aujourd'hui à ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` } : null;
  }

  // "JJ/MM/AAAA HH:MM"
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+)$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const time = parseClockTime(match[4]);
    if (!time) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const ms = zonedTimeToUtcMs(year, month, day, time.hour, time.minute, timeZone);
    // Rejette les dates "invalides" que Date accepterait en silence en les
    // décalant (ex: 31/02) : on revérifie que la date reconstruite
    // correspond exactement à ce qui a été demandé.
    const check = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(ms));
    const parts = Object.fromEntries(check.map((p) => [p.type, p.value]));
    if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day) return null;
    return ms > now ? { ms, label: `le ${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${year} à ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` } : null;
  }

  return null;
}

/** Reconnaît un nom de jour de la semaine en français (pour "/remind every week lundi 09:00 ..."). Retourne 0-6 (dimanche=0) ou null. */
export function parseWeekdayName(text) {
  const key = text.trim().toLowerCase();
  return key in WEEKDAY_NAMES ? WEEKDAY_NAMES[key] : null;
}

/** Prochaine occurrence d'un jour de semaine + heure donnés, strictement dans le futur. */
export function nextWeekdayOccurrence(weekday, hour, minute, timeZone = DEFAULT_TIMEZONE, now = Date.now()) {
  const today = nowInTimezone(timeZone, now);
  const todayMs = zonedTimeToUtcMs(today.year, today.month, today.day, hour, minute, timeZone);
  const todayWeekday = new Date(zonedTimeToUtcMs(today.year, today.month, today.day, 12, 0, timeZone)).getUTCDay();
  let deltaDays = (weekday - todayWeekday + 7) % 7;
  if (deltaDays === 0 && todayMs <= now) deltaDays = 7; // aujourd'hui mais déjà passé -> semaine prochaine
  const target = addDaysToYmd(today.year, today.month, today.day, deltaDays, timeZone);
  return zonedTimeToUtcMs(target.year, target.month, target.day, hour, minute, timeZone);
}

/** Prochaine occurrence quotidienne d'une heure donnée, strictement dans le futur. */
export function nextDailyOccurrence(hour, minute, timeZone = DEFAULT_TIMEZONE, now = Date.now()) {
  const today = nowInTimezone(timeZone, now);
  const todayMs = zonedTimeToUtcMs(today.year, today.month, today.day, hour, minute, timeZone);
  if (todayMs > now) return todayMs;
  const tomorrow = addDaysToYmd(today.year, today.month, today.day, 1, timeZone);
  return zonedTimeToUtcMs(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute, timeZone);
}
