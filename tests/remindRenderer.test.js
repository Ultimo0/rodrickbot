import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderReminderCreated,
  renderReminderFiring,
  renderRelativeDelay,
  renderRemindersList,
  renderReminderCancelled,
  renderCancelAllPrompt,
  renderCancelAllDone,
  renderCancelAllAborted,
  renderReminderInfo,
  renderWizardMenu,
  renderWizardInvalidMenuChoice,
  renderWizardAskMessage,
  renderLimitReached,
  renderInvalidSyntax,
  renderNotFound,
  renderHelp,
} from '../src/core/remind/RemindRenderer.js';

function sampleReminder(overrides = {}) {
  return {
    id: 'a1b2c3',
    userId: '22500000000@s.whatsapp.net',
    chatId: '22500000000@s.whatsapp.net',
    message: 'Appeler maman',
    createdAt: Date.now() - 60_000,
    scheduledAt: Date.now() + 600_000,
    status: 'pending',
    timezone: 'Africa/Douala',
    recurrence: null,
    lastSentAt: null,
    ...overrides,
  };
}

test('renderReminderCreated confirme le message et n\'expose jamais un {prefix} littéral non substitué', () => {
  const { text } = renderReminderCreated(sampleReminder(), { relativeLabel: 'Dans : 10 minutes' });
  assert.match(text, /Appeler maman/);
  assert.match(text, /Rappel programmé/);
  assert.doesNotMatch(text, /\{prefix\}/); // bug corrigé pendant le développement : voir historique
});

test('renderReminderCreated mentionne la récurrence quand il y en a une', () => {
  const reminder = sampleReminder({ recurrence: { type: 'daily', time: '08:00' } });
  const { text } = renderReminderCreated(reminder, { relativeLabel: 'Prochaine fois : demain' });
  assert.match(text, /Répétition/);
  assert.match(text, /tous les jours à 08:00/);
});

test('renderReminderFiring reprend fidèlement le message du brief (exemple "RAPPEL")', () => {
  const { text } = renderReminderFiring(sampleReminder({ message: 'appeler maman' }));
  assert.match(text, /RAPPEL/);
  assert.match(text, /appeler maman/);
});

test('renderRelativeDelay formate correctement selon l\'ordre de grandeur', () => {
  const now = Date.now();
  assert.match(renderRelativeDelay(now + 30_000, now), /30 s/);
  assert.match(renderRelativeDelay(now + 25 * 60_000, now), /25 min/);
  assert.match(renderRelativeDelay(now + 2 * 3_600_000, now), /2 h/);
  assert.match(renderRelativeDelay(now + 25 * 3_600_000, now), /1 j/);
});

test('renderRelativeDelay gère une échéance déjà passée sans produire un délai négatif absurde', () => {
  const now = Date.now();
  assert.equal(renderRelativeDelay(now - 5000, now), "à l'instant");
});

test('renderRemindersList affiche un message dédié quand la liste est vide', () => {
  const { text } = renderRemindersList([], 'Africa/Douala');
  assert.match(text, /Aucun rappel actif/);
});

test('renderRemindersList numérote chaque rappel et affiche son id', () => {
  const list = [sampleReminder({ id: 'aaa111', message: 'Premier' }), sampleReminder({ id: 'bbb222', message: 'Deuxième' })];
  const { text } = renderRemindersList(list, 'Africa/Douala');
  assert.match(text, /1\..*Premier/s);
  assert.match(text, /2\..*Deuxième/s);
  assert.match(text, /aaa111/);
  assert.match(text, /bbb222/);
});

test('renderRemindersList marque visuellement les rappels récurrents', () => {
  const list = [sampleReminder({ recurrence: { type: 'daily', time: '08:00' } })];
  const { text } = renderRemindersList(list, 'Africa/Douala');
  assert.match(text, /🔁/);
});

test('renderReminderCancelled confirme l\'annulation avec le message du rappel', () => {
  const { text } = renderReminderCancelled(sampleReminder({ message: 'Boire de l\'eau' }));
  assert.match(text, /annulé/);
  assert.match(text, /Boire de l'eau/);
});

test('renderCancelAllPrompt inclut le nombre exact de rappels concernés', () => {
  const { text } = renderCancelAllPrompt(5);
  assert.match(text, /5/);
  assert.match(text, /1.*confirmer/is);
});

test('renderCancelAllDone et renderCancelAllAborted sont bien distincts', () => {
  assert.match(renderCancelAllDone(3).text, /3/);
  assert.match(renderCancelAllAborted().text, /conservés/);
});

test('renderReminderInfo affiche tous les champs demandés par le brief', () => {
  const { text } = renderReminderInfo(sampleReminder(), 'Africa/Douala');
  assert.match(text, /Message/);
  assert.match(text, /Créé le/);
  assert.match(text, /Échéance/);
  assert.match(text, /Statut/);
});

test('renderWizardMenu propose bien les 4 options du brief', () => {
  const { text } = renderWizardMenu();
  assert.match(text, /1️⃣.*10 minutes/);
  assert.match(text, /2️⃣.*1 heure/);
  assert.match(text, /3️⃣.*Demain/);
  assert.match(text, /4️⃣.*durée/);
});

test('renderWizardInvalidMenuChoice et renderWizardAskMessage sont non vides', () => {
  assert.ok(renderWizardInvalidMenuChoice().text.length > 0);
  assert.match(renderWizardAskMessage().text, /rappel/);
});

test('renderLimitReached mentionne la limite exacte fournie', () => {
  const { text } = renderLimitReached(25);
  assert.match(text, /25/);
});

test('renderInvalidSyntax et renderHelp ne contiennent jamais {prefix} littéral', () => {
  assert.doesNotMatch(renderInvalidSyntax().text, /\{prefix\}/);
  assert.doesNotMatch(renderHelp().text, /\{prefix\}/);
});

test('renderNotFound retourne un message non vide', () => {
  assert.ok(renderNotFound().text.length > 0);
});
