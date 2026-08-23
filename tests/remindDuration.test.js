import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFlexibleDuration,
  looksLikeDuration,
  formatFlexibleDuration,
  validateReminderDuration,
  MIN_REMINDER_DURATION_MS,
  MAX_REMINDER_DURATION_MS,
} from '../src/core/remind/remindDuration.js';

test('parseFlexibleDuration reconnaît les exemples exacts du brief', () => {
  assert.equal(parseFlexibleDuration('10min'), 10 * 60 * 1000);
  assert.equal(parseFlexibleDuration('2h'), 2 * 60 * 60 * 1000);
  assert.equal(parseFlexibleDuration('1d'), 24 * 60 * 60 * 1000);
  assert.equal(parseFlexibleDuration('30s'), 30 * 1000);
});

test('looksLikeDuration distingue une durée d\'un mot quelconque', () => {
  assert.equal(looksLikeDuration('10min'), true);
  assert.equal(looksLikeDuration('appeler'), false);
});

test('validateReminderDuration applique les bornes MIN/MAX propres à /remind (distinctes de /poll)', () => {
  assert.deepEqual(validateReminderDuration(MIN_REMINDER_DURATION_MS), { ok: true });
  assert.deepEqual(validateReminderDuration(MAX_REMINDER_DURATION_MS), { ok: true });
  assert.equal(validateReminderDuration(MIN_REMINDER_DURATION_MS - 1).reason, 'TOO_SHORT');
  assert.equal(validateReminderDuration(MAX_REMINDER_DURATION_MS + 1).reason, 'TOO_LONG');
});

test('formatFlexibleDuration reste cohérent (délégation transparente à pollDuration.js)', () => {
  assert.equal(formatFlexibleDuration(3_600_000), '1 h');
  assert.equal(formatFlexibleDuration(24 * 60 * 60 * 1000), '1 j');
});
