import { formatPollDuration } from './pollDuration.js';

/**
 * PollRenderer
 * ------------
 * Seul module qui sait à quoi ressemble un message Poll. PollManager lui
 * donne des données brutes, jamais l'inverse — même séparation que
 * QuizRenderer.js / src/themes/engine.js.
 *
 * Vote par chiffre en texte, PAS par bouton/liste natif WhatsApp : voir
 * src/core/quiz/QuizRenderer.js (en-tête) et src/core/quiz/README.md
 * ("Pourquoi pas de vrais boutons WhatsApp ?") — testé en conditions
 * réelles sur ce projet, WhatsApp affiche les messages liste/boutons en
 * texte brut sans aucune ligne cliquable pour les comptes personnels
 * (non-Business), restriction plateforme confirmée (CHANGELOG 1.19.1),
 * pas un choix arbitraire pour ce module. Le vote se fait donc en
 * RÉPONDANT (reply) à la carte de sondage avec un chiffre nu — répondre
 * (plutôt qu'un chiffre nu envoyé dans le vide comme pour /quiz) est ce
 * qui permet ici plusieurs sondages actifs simultanément sans ambiguïté
 * sur celui visé (voir messageHandler.js).
 */

/** Emoji "touche numérique" (1️⃣, 2️⃣...) pour 1-9, sinon "10." simple — identique à QuizRenderer.js. */
function keycap(n) {
  return n >= 1 && n <= 9 ? `${n}\uFE0F\u20E3` : `${n}.`;
}

/** Barre de progression en emoji, largeur fixe de 10 caractères. */
function progressBar(percent, width = 10) {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function countVotes(poll) {
    const counts = poll.options.map(() => 0);
  for (const optionId of Object.values(poll.votes)) {
    const index = Number(optionId);
    if (Number.isInteger(index) && counts[index] !== undefined) counts[index] += 1;
  }
  return counts;
}

function statusLabel(poll) {
  if (poll.status === 'closed') {
    return poll.closedReason === 'expired' ? '⏰ Fermé (expiré)' : '🔒 Fermé';
  }
  if (poll.closesAt) {
    const remaining = poll.closesAt - Date.now();
    if (remaining > 0) return `🟢 Actif — ferme dans ${formatPollDuration(remaining) || '< 1 min'}`;
    return '🟢 Actif';
  }
  return '🟢 Actif';
}

/** Carte de sondage envoyée dans le chat — c'est CE message que les utilisateurs citent (reply) pour voter. */
export function renderPollCard(poll) {
  const optionsBlock = poll.options.map((opt) => `${keycap(Number(opt.id) + 1)} ${opt.text}`).join('\n');
  const expiry = poll.closesAt ? `\n⏳ Ferme dans ${formatPollDuration(poll.closesAt - Date.now())}` : '';

  return {
    text:
      `📊 *SONDAGE* — \`#${poll.id}\`\n\n` +
      `*${poll.title}*\n\n` +
      `${optionsBlock}${expiry}\n\n` +
      `_Pour voter : réponds (reply) à ce message avec le numéro de ton choix (1 à ${poll.options.length}). Tu peux changer d'avis à tout moment en répondant à nouveau._`,
  };
}

export function renderVoteRecorded(poll, optionId) {
  const option = poll.options[Number(optionId)];
  return { text: `✅ Vote enregistré pour *${option.text}*. Réponds à nouveau à ce sondage pour changer d'avis.` };
}

export function renderVoteInvalidNumber(poll) {
  return { text: `❌ Réponds avec un chiffre entre 1 et ${poll.options.length}.` };
}

export function renderVoteOnClosedPoll() {
  return { text: '❌ Ce sondage est fermé, les votes ne sont plus acceptés.' };
}

/** /poll results */
export function renderResults(poll) {
  const counts = countVotes(poll);
  const total = counts.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(0, ...counts);

  const lines = [`📊 *Résultats* — \`#${poll.id}\``, '', `*${poll.title}*`, ''];

  poll.options.forEach((opt, index) => {
    const count = counts[index];
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    const isWinner = total > 0 && count === maxCount && maxCount > 0;
    lines.push(`${opt.text}${isWinner ? ' 🏆' : ''}`);
    lines.push(`${progressBar(percent)} ${percent}% (${count})`);
    lines.push('');
  });

  lines.push(`Total : ${total} vote(s) · ${statusLabel(poll)}`);
  return { text: lines.join('\n') };
}

/** /poll info */
export function renderInfo(poll) {
  const counts = countVotes(poll);
  const total = counts.reduce((a, b) => a + b, 0);
  const creatorName = poll.creatorId.split('@')[0];
  const created = new Date(poll.createdAt).toLocaleString('fr-FR');
  const lastActivity = new Date(poll.lastActivityAt).toLocaleString('fr-FR');

  const lines = [
    `ℹ️ *Informations sondage* — \`#${poll.id}\``,
    '',
    `*${poll.title}*`,
    '',
    `Créateur : ${creatorName}`,
    `Créé le : ${created}`,
    `Statut : ${statusLabel(poll)}`,
    `Votants : ${total}`,
    `Dernière activité : ${lastActivity}`,
  ];

  if (poll.closesAt) {
    lines.push(`Durée fixée : ${formatPollDuration(poll.closesAt - poll.createdAt)}`);
  }

  return { text: lines.join('\n') };
}

/** /poll list */
export function renderPollList(polls) {
  if (!polls.length) {
    return { text: "📭 Aucun sondage actif dans ce chat pour le moment. Tape /poll pour en créer un." };
  }

  const lines = ['🗂️ *Sondages actifs*', ''];
  polls.forEach((poll) => {
    const counts = countVotes(poll);
    const total = counts.reduce((a, b) => a + b, 0);
    lines.push(`\`#${poll.id}\` — ${poll.title} (${total} vote(s))`);
  });
  lines.push('', 'Détail : /poll info <id> — Résultats : /poll results <id>');

  return { text: lines.join('\n') };
}

export function renderPollClosed(poll) {
  return { text: `🔒 Sondage \`#${poll.id}\` fermé. Plus aucun vote ne sera accepté.\n\nTape /poll results ${poll.id} pour voir les résultats finaux.` };
}

export function renderPollExpired(poll) {
  return { text: `⏰ Le sondage \`#${poll.id}\` (*${poll.title}*) vient d'expirer et a été fermé automatiquement.\n\nTape /poll results ${poll.id} pour voir les résultats.` };
}

export function renderDeleteConfirmation(poll) {
  return {
    text:
      `⚠️ *Supprimer le sondage* \`#${poll.id}\` ?\n\n` +
      `*${poll.title}*\n\n` +
      'Cette action est irréversible : le sondage et tous ses votes seront définitivement perdus.\n\n' +
      `${keycap(1)} Confirmer la suppression\n` +
      `${keycap(2)} Annuler\n\n` +
      'Réponds avec 1 ou 2 (valable 5 minutes).',
  };
}

export function renderDeleteDone(pollId) {
  return { text: `🗑️ Sondage \`#${pollId}\` supprimé définitivement.` };
}

export function renderDeleteCancelled() {
  return { text: 'Suppression annulée. Le sondage est intact.' };
}

export function renderDurationUpdated(poll) {
  return { text: `⏳ Durée mise à jour : le sondage \`#${poll.id}\` fermera dans ${formatPollDuration(poll.closesAt - Date.now())}.` };
}

// --- Assistant interactif de création -----------------------------------

export function renderWizardAskTitle() {
  return {
    text:
      "📊 *Créer un sondage*\n\nQuel est le titre du sondage ?\n\n_(Tape /poll cancel à tout moment pour annuler.)_",
  };
}

export function renderWizardAskOptions() {
  return {
    text:
      'Ajoute les propositions, une par message.\n\n' +
      'Quand tu as fini, envoie simplement : *fin*\n\n' +
      '_(Minimum 2 propositions. /poll cancel pour annuler.)_',
  };
}

export function renderWizardOptionAdded(options) {
  return { text: `➕ Ajouté (${options.length}). Envoie une autre proposition, ou *fin* pour terminer.` };
}

export function renderWizardNeedMoreOptions() {
  return { text: '❌ Il faut au moins 2 propositions avant de pouvoir terminer. Ajoute-en une de plus.' };
}

export function renderWizardCancelled() {
  return { text: '🚫 Création du sondage annulée.' };
}

export function renderWizardExpired() {
  return { text: '⌛ Création de sondage abandonnée après 5 minutes d\'inactivité. Tape /poll pour recommencer.' };
}

export function renderWizardAlreadyInProgress() {
  return { text: '⚠️ Tu as déjà un sondage en cours de création dans ce chat. Termine-le (envoie *fin*) ou tape /poll cancel pour recommencer.' };
}

// --- Erreurs communes -----------------------------------------------------

export function renderPollNotFound(id) {
  return { text: id ? `❌ Aucun sondage trouvé avec l'identifiant \`#${id}\`.` : '❌ Aucun sondage trouvé dans ce chat. Crée-en un avec /poll.' };
}

export function renderInvalidQuickSyntax() {
  return {
    text:
      '❌ Syntaxe invalide.\n\n' +
      'Usage rapide : /poll "Titre" Option 1 | Option 2 | Option 3\n' +
      'Durée optionnelle en dernier élément : /poll "Titre" A | B | 1h\n\n' +
      'Ou tape /poll seul pour l\'assistant pas-à-pas.',
  };
}

export function renderInvalidDuration() {
  return { text: '❌ Durée invalide. Exemples valides : 30min, 1h, 2j (entre 1 minute et 30 jours).' };
}

export function renderNotCreator() {
  return { text: '❌ Seul le créateur du sondage (ou un administrateur) peut faire ça.' };
}
