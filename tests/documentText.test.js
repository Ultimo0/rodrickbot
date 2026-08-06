import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyDocument, extractDocumentText } from '../src/utils/documentText.js';

test('classifyDocument reconnaît les PDF par mimetype ou extension', () => {
  assert.equal(classifyDocument({ mimetype: 'application/pdf' }), 'pdf');
  assert.equal(classifyDocument({ fileName: 'rapport.PDF' }), 'pdf');
});

test('classifyDocument reconnaît les DOCX par mimetype ou extension', () => {
  const mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  assert.equal(classifyDocument({ mimetype }), 'docx');
  assert.equal(classifyDocument({ fileName: 'note.docx' }), 'docx');
});

test('classifyDocument reconnaît les formats texte', () => {
  assert.equal(classifyDocument({ mimetype: 'text/plain' }), 'text');
  assert.equal(classifyDocument({ mimetype: 'application/json' }), 'text');
  for (const fileName of ['a.txt', 'a.md', 'a.csv', 'a.log', 'a.json']) {
    assert.equal(classifyDocument({ fileName }), 'text', fileName);
  }
});

test('classifyDocument privilégie le PDF sur un nom de fichier texte', () => {
  assert.equal(classifyDocument({ mimetype: 'application/pdf', fileName: 'faux.txt' }), 'pdf');
});

test('classifyDocument retourne null pour les formats non supportés', () => {
  assert.equal(classifyDocument(null), null);
  assert.equal(classifyDocument(undefined), null);
  assert.equal(classifyDocument({}), null);
  assert.equal(classifyDocument({ mimetype: 'application/zip', fileName: 'archive.zip' }), null);
  assert.equal(classifyDocument({ fileName: 'image.png' }), null);
  assert.equal(classifyDocument({ fileName: 'doc.doc' }), null);
});

test('extractDocumentText décode un buffer texte en UTF-8', async () => {
  const text = await extractDocumentText(Buffer.from('héllo\nmonde', 'utf-8'), 'text');
  assert.equal(text, 'héllo\nmonde');
});

test('extractDocumentText rejette un type inconnu', async () => {
  await assert.rejects(() => extractDocumentText(Buffer.alloc(0), 'xls'), /non supporté: xls/);
});
