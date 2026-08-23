import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePollDuration,
  looksLikePollDuration,
  validatePollDuration,
  formatPollDuration,
  MIN_POLL_DURATION_MS,
  MAX_POLL_DURATION_MS,
} from '../src/core/poll/pollDuration.js';

test('parsePollDuration délègue s/min/h à utils/duration.js (réutilisation, pas de duplication)', () => {
  assert.equal(parsePollDuration('30s'), 30_000);
  assert.equal(parsePollDuration('30min'), 30 * 60_000);
  assert.equal(parsePollDuration('1h'), 3_600_000);
  assert.equal(parsePollDuration('3 heures'), 3 * 3_600_000);
});

test('parsePollDuration ajoute les jours (pas géré par utils/duration.js)', () => {
  assert.equal(parsePollDuration('1j'), 24 * 60 * 60 * 1000);
  assert.equal(parsePollDuration('2j'), 2 * 24 * 60 * 60 * 1000);
  assert.equal(parsePollDuration('7jours'), 7 * 24 * 60 * 60 * 1000);
  assert.equal(parsePollDuration('1day'), 24 * 60 * 60 * 1000);
});

test('parsePollDuration rejette les entrées invalides (même contrat que parseDuration)', () => {
  for (const input of [null, undefined, '', '  ', 'abc', '10', 'h', '-5j', '0j', '1.5j']) {
    assert.equal(parsePollDuration(input), null, `attendu null pour ${JSON.stringify(input)}`);
  }
});

test('parsePollDuration accepte "10 jours" (contrairement à parseDuration) — c\'est le but même de ce module dédié', () => {
  // utils/duration.js rejette explicitement "10 jours" (voir tests/duration.test.js
  // et le commentaire en tête de pollDuration.js). pollDuration.js gère les jours
  // lui-même sans toucher au fichier partagé : "10 jours" doit donc fonctionner ICI,
  // précisément parce que ça ne fonctionne pas dans utils/duration.js.
  assert.equal(parsePollDuration('10 jours'), 10 * 24 * 60 * 60 * 1000);
});

test('looksLikePollDuration distingue une durée d\'un texte quelconque', () => {
  assert.equal(looksLikePollDuration('1h'), true);
  assert.equal(looksLikePollDuration('2j'), true);
  assert.equal(looksLikePollDuration('Python'), false);
  assert.equal(looksLikePollDuration('JavaScript'), false);
});

test('validatePollDuration applique les bornes min/max', () => {
  assert.deepEqual(validatePollDuration(MIN_POLL_DURATION_MS), { ok: true });
  assert.deepEqual(validatePollDuration(MAX_POLL_DURATION_MS), { ok: true });
  assert.equal(validatePollDuration(MIN_POLL_DURATION_MS - 1).ok, false);
  assert.equal(validatePollDuration(MIN_POLL_DURATION_MS - 1).reason, 'TOO_SHORT');
  assert.equal(validatePollDuration(MAX_POLL_DURATION_MS + 1).ok, false);
  assert.equal(validatePollDuration(MAX_POLL_DURATION_MS + 1).reason, 'TOO_LONG');
});

test('formatPollDuration affiche les jours entiers, sinon délègue à formatDuration', () => {
  assert.equal(formatPollDuration(24 * 60 * 60 * 1000), '1 j');
  assert.equal(formatPollDuration(2 * 24 * 60 * 60 * 1000), '2 j');
  assert.equal(formatPollDuration(3_600_000), '1 h');
  assert.equal(formatPollDuration(300_000), '5 min');
});
