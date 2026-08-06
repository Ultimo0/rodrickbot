import test from 'node:test';
import assert from 'node:assert/strict';

import { toScriptFont } from '../src/utils/fancyFont.js';

test('toScriptFont convertit les lettres latines', () => {
  assert.equal(toScriptFont('Az'), '\u{1D4D0}\u{1D503}');
  assert.equal(toScriptFont('abc'), '\u{1D4EA}\u{1D4EB}\u{1D4EC}');
  assert.equal(toScriptFont('ABC'), '\u{1D4D0}\u{1D4D1}\u{1D4D2}');
});

test('toScriptFont laisse inchangés chiffres, espaces et ponctuation', () => {
  assert.equal(toScriptFont('123 - _!'), '123 - _!');
});

test('toScriptFont préserve les caractères non ASCII', () => {
  assert.equal(toScriptFont('éà'), 'éà');
});

test('toScriptFont accepte les valeurs non chaînes', () => {
  assert.equal(toScriptFont(''), '');
  assert.equal(toScriptFont(42), '42');
  assert.equal(toScriptFont(null), toScriptFont('null'));
});

test('toScriptFont conserve la structure du texte mixte', () => {
  const out = toScriptFont('Bot 2');
  assert.equal([...out].length, 5);
  assert.equal(out.endsWith(' 2'), true);
});
