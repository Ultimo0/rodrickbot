// tests/convert.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Convertisseur d\'unités', () => {
  let tempDir;
  let converter;

  before(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'convert-test-'));
    process.chdir(tempDir);
    const module = await import('../src/utils/unitConverter.js');
    converter = module;
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('devrait convertir les températures', () => {
    const result = converter.parseAndConvert('25°C en °F');
    assert.ok(result.ok);
    assert.strictEqual(result.amount, 25);
    assert.strictEqual(result.converted, 77);
    assert.match(result.fromUnit, /°C/);
    assert.match(result.toUnit, /°F/);
  });

  it('devrait convertir les longueurs', () => {
    const result = converter.parseAndConvert('100 km en miles');
    assert.ok(result.ok);
    assert.strictEqual(result.amount, 100);
    assert.ok(Math.abs(result.converted - 62.1371) < 0.001);
  });

  it('devrait convertir les masses', () => {
    const result = converter.parseAndConvert('1 kg en lb');
    assert.ok(result.ok);
    assert.ok(Math.abs(result.converted - 2.2046) < 0.001);
  });

  it('devrait convertir les volumes', () => {
    const result = converter.parseAndConvert('5 l en ml');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 5000);
  });

  it('devrait convertir les surfaces', () => {
    const result = converter.parseAndConvert('30 m² en ft²');
    assert.ok(result.ok);
    assert.ok(Math.abs(result.converted - 322.917) < 0.001);
  });

  it('devrait convertir les vitesses', () => {
    const result = converter.parseAndConvert('100 km/h en mph');
    assert.ok(result.ok);
    assert.ok(Math.abs(result.converted - 62.1371) < 0.001);
  });

  it('devrait convertir les durées (heures -> minutes)', () => {
    const result = converter.parseAndConvert('2h en min');
    assert.ok(result.ok);
    assert.strictEqual(result.amount, 2);
    assert.strictEqual(result.converted, 120);
  });

  it('devrait convertir les durées (jours -> heures)', () => {
    const result = converter.parseAndConvert('1j en h');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 24);
  });

  it('devrait convertir les durées (semaines -> jours)', () => {
    const result = converter.parseAndConvert('1 semaine en jours');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 7);
  });

  it('devrait convertir les durées (mois approximatif -> jours)', () => {
    const result = converter.parseAndConvert('1 mois en jours');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 30);
  });

  it('devrait convertir les durées (années -> jours)', () => {
    const result = converter.parseAndConvert('1 an en jours');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 365);
  });

  it('devrait refuser une conversion incompatible', () => {
    const result = converter.parseAndConvert('10 m en kg');
    assert.ok(!result.ok);
    assert.match(result.message, /catégories différentes/);
  });

  it('devrait refuser une unité inconnue', () => {
    const result = converter.parseAndConvert('10 toto en kg');
    assert.ok(!result.ok);
    assert.match(result.message, /Unité source "toto" non reconnue/);
  });

  it('devrait accepter les synonymes', () => {
    const result = converter.parseAndConvert('100 kilomètres en miles');
    assert.ok(result.ok);
    assert.ok(Math.abs(result.converted - 62.1371) < 0.001);
  });

  it('devrait gérer les nombres décimaux', () => {
    const result = converter.parseAndConvert('1.5 m en cm');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 150);
  });

  it('devrait gérer le séparateur "vers"', () => {
    const result = converter.parseAndConvert('10 m vers cm');
    assert.ok(result.ok);
    assert.strictEqual(result.converted, 1000);
  });
});