import test from 'node:test';
import assert from 'node:assert/strict';

import {
  zonedTimeToUtcMs,
  parseAbsoluteDateTime,
  parseWeekdayName,
  nextDailyOccurrence,
  nextWeekdayOccurrence,
  getUserTimezone,
  DEFAULT_TIMEZONE,
} from '../src/core/remind/remindDate.js';

const DOUALA = 'Africa/Douala'; // UTC+1 fixe, sans DST
const PARIS = 'Europe/Paris'; // UTC+1/+2 avec DST

test('zonedTimeToUtcMs convertit correctement un fuseau fixe (Douala, UTC+1)', () => {
  const ms = zonedTimeToUtcMs(2026, 8, 20, 8, 0, DOUALA);
  assert.equal(new Date(ms).toISOString(), '2026-08-20T07:00:00.000Z');
});

test('zonedTimeToUtcMs gère correctement l\'heure d\'été (Paris, DST actif en août)', () => {
  const ms = zonedTimeToUtcMs(2026, 8, 20, 8, 0, PARIS);
  assert.equal(new Date(ms).toISOString(), '2026-08-20T06:00:00.000Z');
});

test('zonedTimeToUtcMs gère correctement l\'heure d\'hiver (Paris, DST inactif en décembre)', () => {
  const ms = zonedTimeToUtcMs(2026, 12, 20, 8, 0, PARIS);
  assert.equal(new Date(ms).toISOString(), '2026-12-20T07:00:00.000Z');
});

test('parseAbsoluteDateTime reconnaît "demain HH:MM"', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11h à Douala
  const result = parseAbsoluteDateTime('demain 08:00', DOUALA, now);
  assert.ok(result);
  assert.equal(new Date(result.ms).toISOString(), '2026-08-16T07:00:00.000Z');
  assert.match(result.label, /demain/);
});

test('parseAbsoluteDateTime reconnaît "aujourd\'hui HH:MM" si encore dans le futur', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11h à Douala
  const result = parseAbsoluteDateTime("aujourd'hui 21:30", DOUALA, now);
  assert.ok(result);
  assert.equal(new Date(result.ms).toISOString(), '2026-08-15T20:30:00.000Z');
});

test('parseAbsoluteDateTime retourne null pour "aujourd\'hui HH:MM" déjà passé (jamais un rappel dans le passé)', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11h à Douala
  assert.equal(parseAbsoluteDateTime("aujourd'hui 09:00", DOUALA, now), null);
});

test('parseAbsoluteDateTime reconnaît "JJ/MM/AAAA HH:MM"', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime();
  const result = parseAbsoluteDateTime('20/08/2026 18:30', DOUALA, now);
  assert.ok(result);
  assert.equal(new Date(result.ms).toISOString(), '2026-08-20T17:30:00.000Z');
});

test('parseAbsoluteDateTime rejette une date de calendrier invalide (31 février) sans planter', () => {
  const now = Date.now();
  assert.doesNotThrow(() => parseAbsoluteDateTime('31/02/2026 10:00', DOUALA, now));
  assert.equal(parseAbsoluteDateTime('31/02/2026 10:00', DOUALA, now), null);
});

test('parseAbsoluteDateTime rejette une heure invalide sans planter', () => {
  assert.doesNotThrow(() => parseAbsoluteDateTime('demain 25:99', DOUALA));
  assert.equal(parseAbsoluteDateTime('demain 25:99', DOUALA), null);
});

test('parseAbsoluteDateTime retourne null pour un texte quelconque, jamais d\'exception (brief: ne jamais planter)', () => {
  for (const input of ['', 'bonjour', 'la semaine prochaine peut-être', null, undefined]) {
    assert.doesNotThrow(() => parseAbsoluteDateTime(input ?? '', DOUALA));
  }
});

test('parseWeekdayName reconnaît les jours en français, insensible à la casse', () => {
  assert.equal(parseWeekdayName('lundi'), 1);
  assert.equal(parseWeekdayName('Lundi'), 1);
  assert.equal(parseWeekdayName('dimanche'), 0);
  assert.equal(parseWeekdayName('samedi'), 6);
});

test('parseWeekdayName retourne null pour un texte qui n\'est pas un jour', () => {
  assert.equal(parseWeekdayName('xyz'), null);
  assert.equal(parseWeekdayName(''), null);
});

test('nextDailyOccurrence retourne aujourd\'hui si l\'heure n\'est pas encore passée', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11h à Douala
  const ms = nextDailyOccurrence(14, 0, DOUALA, now); // 14h pas encore passé
  assert.equal(new Date(ms).toISOString(), '2026-08-15T13:00:00.000Z');
});

test('nextDailyOccurrence retourne demain si l\'heure est déjà passée aujourd\'hui', () => {
  const now = new Date('2026-08-15T10:00:00Z').getTime(); // 11h à Douala
  const ms = nextDailyOccurrence(8, 0, DOUALA, now); // 8h déjà passé
  assert.equal(new Date(ms).toISOString(), '2026-08-16T07:00:00.000Z');
});

test('nextWeekdayOccurrence trouve la bonne prochaine occurrence dans la semaine', () => {
  // 15/08/2026 est un samedi (weekday=6). "lundi" (1) suivant = 17/08.
  const now = new Date('2026-08-15T10:00:00Z').getTime();
  const ms = nextWeekdayOccurrence(1, 9, 0, DOUALA, now);
  assert.equal(new Date(ms).toISOString(), '2026-08-17T08:00:00.000Z');
});

test('nextWeekdayOccurrence saute à la semaine suivante si le jour ET l\'heure tombent aujourd\'hui mais sont déjà passés', () => {
  // 15/08/2026 = samedi (weekday=6), on demande "samedi 09:00" alors qu'il est 11h -> +7 jours
  const now = new Date('2026-08-15T10:00:00Z').getTime();
  const ms = nextWeekdayOccurrence(6, 9, 0, DOUALA, now);
  assert.equal(new Date(ms).toISOString(), '2026-08-22T08:00:00.000Z');
});

test('nextWeekdayOccurrence retourne aujourd\'hui si le jour correspond et l\'heure n\'est pas encore passée', () => {
  // samedi 15/08, on demande "samedi 14:00" alors qu'il est 11h -> aujourd'hui
  const now = new Date('2026-08-15T10:00:00Z').getTime();
  const ms = nextWeekdayOccurrence(6, 14, 0, DOUALA, now);
  assert.equal(new Date(ms).toISOString(), '2026-08-15T13:00:00.000Z');
});

test('getUserTimezone retourne le fuseau par défaut (aucun système de préférences par utilisateur dans RodrickBOT à ce jour)', () => {
  assert.equal(getUserTimezone('22500000000@s.whatsapp.net'), DEFAULT_TIMEZONE);
  assert.equal(getUserTimezone('un-autre-utilisateur'), DEFAULT_TIMEZONE);
});
