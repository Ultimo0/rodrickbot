import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDuration, formatDuration } from '../src/utils/duration.js';

test('parseDuration accepte les unités en anglais et en français', () => {
  assert.equal(parseDuration('30s'), 30_000);
  assert.equal(parseDuration('45 secondes'), 45_000);
  assert.equal(parseDuration('2m'), 120_000);
  assert.equal(parseDuration('10 minutes'), 600_000);
  assert.equal(parseDuration('1h'), 3_600_000);
  assert.equal(parseDuration('3 heures'), 3 * 3_600_000);
});

test('parseDuration est insensible à la casse et aux espaces', () => {
  assert.equal(parseDuration('  5 MIN '), 300_000);
  assert.equal(parseDuration('5Min'), 300_000);
});

test('parseDuration rejette les entrées invalides', () => {
  for (const input of [null, undefined, '', '  ', 'abc', '10', 'h', '10 jours', '-5m', '1.5h', '0s', '10 min extra']) {
    assert.equal(parseDuration(input), null, `attendu null pour ${JSON.stringify(input)}`);
  }
});

test('formatDuration choisit la plus grande unité exacte', () => {
  assert.equal(formatDuration(3_600_000), '1 h');
  assert.equal(formatDuration(7_200_000), '2 h');
  assert.equal(formatDuration(300_000), '5 min');
  assert.equal(formatDuration(90_000), '90 s');
  assert.equal(formatDuration(1_000), '1 s');
});

test('parseDuration et formatDuration font un aller-retour cohérent', () => {
  assert.equal(formatDuration(parseDuration('30s')), '30 s');
  assert.equal(formatDuration(parseDuration('5 min')), '5 min');
  assert.equal(formatDuration(parseDuration('2h')), '2 h');
});
