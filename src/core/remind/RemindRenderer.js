import { config } from '../../config/index.js';
import { formatFlexibleDuration } from './remindDuration.js';

/**
 * RemindRenderer
 * --------------
 * Seul module qui sait à quoi ressemble un message /remind. Même
 * séparation que PollRenderer.js/QuizRenderer.js : RemindManager lui donne
 * des données brutes, jamais l'inverse.
 *
 * Pas de branchement sur src/themes/engine.js : ce moteur ne couvre que
 * menu/catégorie/détail commande/startup/welcome/bye/messages supprimés
 * (voir src/themes/README.md, "Forme des données reçues") — aucune des
 * fonctions render*() disponibles ne correspond à une carte de rappel.
 * Ni QuizRenderer.js ni PollRenderer.js ne s'y branchent non plus pour
 * leurs propres cartes : ce fichier suit exactement le même précédent,
 * déjà établi dans ce projet, plutôt que d'inventer une troisième
 * approche. `utils/boxDrawing.js` reste disponible mais volontairement
 * inutilisé ici (comme le thème "mono") : les rappels sont de simples
 * confirmations courtes, une boîte encadrée ajouterait de la lourdeur
 * visuelle sans bénéfice pour ce cas d'usage.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Confirmation immédiate après création (méthode rapide ou syntaxe). */
export function renderReminderCreated(reminder, { relativeLabel }) {
  const recurrenceLine = reminder.recurrence
    ? `\n🔁 Répétition : ${describeRecurrence(reminder.recurrence)}`
    : '';
  return {
    text:
      `⏰ *Rappel programmé !*\n\n` +
      `📌 Message : ${reminder.message}\n` +
      `⏱ ${relativeLabel}${recurrenceLine}\n\n` +
      `_Identifiant : ${reminder.id} — ${'`'}${config.prefix}remind cancel ${reminder.id}${'`'} pour l'annuler._`,
  };
}

/** Message envoyé en privé au moment où le rappel arrive à échéance. */
export function renderReminderFiring(reminder) {
  return {
    text:
      `⏰ *RAPPEL*\n\n` +
      `📌 ${reminder.message}\n\n` +
      `_Tu avais demandé à RodrickBOT de te le rappeler maintenant._`,
  };
}

function describeRecurrence(recurrence) {
  if (recurrence.type === 'daily') return `tous les jours à ${recurrence.time}`;
  if (recurrence.type === 'weekly') return `chaque ${recurrence.weekdayLabel} à ${recurrence.time}`;
  return 'récurrent';
}

/** Délai lisible jusqu'à une échéance donnée (epoch ms), pour l'affichage dans /reminders. */
export function renderRelativeDelay(scheduledAt, now = Date.now()) {
  const diff = scheduledAt - now;
  if (diff <= 0) return "à l'instant";
  if (diff < 60_000) return `dans ${Math.round(diff / 1000)} s`;
  if (diff < 3_600_000) return `dans ${Math.round(diff / 60_000)} min`;
  if (diff < 24 * 3_600_000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.round((diff % 3_600_000) / 60_000);
    return m > 0 ? `dans ${h} h ${m} min` : `dans ${h} h`;
  }
  const days = Math.round(diff / (24 * 3_600_000));
  return `dans ${days} j`;
}

/** /reminders : liste des rappels actifs (pending) d'un utilisateur. */
export function renderRemindersList(reminders, timezone) {
  if (!reminders.length) {
    return { text: "⏰ *Mes rappels*\n\nAucun rappel actif pour l'instant.\n\n_Crée-en un avec /remind._" };
  }

  const lines = reminders.map((r, index) => {
    const delay = renderRelativeDelay(r.scheduledAt);
    const recurrenceTag = r.recurrence ? ' 🔁' : '';
    return `${index + 1}. 📌 ${r.message}${recurrenceTag}\n   ⏱ ${delay} (${formatAbsolute(r.scheduledAt, timezone)})\n   🆔 ${r.id}`;
  });

  return {
    text: `⏰ *Mes rappels*\n\n${lines.join('\n\n')}\n\n_Annuler : ${config.prefix}remind cancel <id>_`,
  };
}

function formatAbsolute(ms, timezone) {
  try {
    return new Date(ms).toLocaleString('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return new Date(ms).toLocaleString('fr-FR');
  }
}

export function renderReminderCancelled(reminder) {
  return { text: `✅ Rappel annulé : *${reminder.message}*` };
}

export function renderCancelAllPrompt(count) {
  return {
    text:
      `⚠️ Tu es sur le point d'annuler *${count} rappel(s)* actif(s).\n\n` +
      `Réponds *1* pour confirmer, *2* pour annuler.`,
  };
}

export function renderCancelAllDone(count) {
  return { text: `✅ ${count} rappel(s) annulé(s).` };
}

export function renderCancelAllAborted() {
  return { text: '❌ Suppression annulée, tes rappels sont conservés.' };
}

export function renderReminderInfo(reminder, timezone) {
  const statusLabels = { pending: 'actif ⏳', sent: 'envoyé ✅', cancelled: 'annulé ❌', expired: 'expiré ⌛' };
  return {
    text:
      `⏰ *Rappel #${reminder.id}*\n\n` +
      `📌 Message : ${reminder.message}\n` +
      `📅 Créé le : ${formatAbsolute(reminder.createdAt, timezone)}\n` +
      `⏱ Échéance : ${formatAbsolute(reminder.scheduledAt, timezone)}\n` +
      `📶 Statut : ${statusLabels[reminder.status] || reminder.status}\n` +
      (reminder.recurrence ? `🔁 Répétition : ${describeRecurrence(reminder.recurrence)}\n` : ''),
  };
}

// --- Assistant interactif --------------------------------------------------

export function renderWizardMenu() {
  return {
    text:
      `⏰ *Nouveau rappel*\n\n` +
      `Quand veux-tu être rappelé ?\n\n` +
      `1️⃣ Dans 10 minutes\n` +
      `2️⃣ Dans 1 heure\n` +
      `3️⃣ Demain (même heure +24h)\n` +
      `4️⃣ Choisir une durée (ex: 2h, 3j, 45min)`,
  };
}

export function renderWizardAskDuration() {
  return { text: 'Dans combien de temps ? (ex: `10min`, `2h`, `3j`)' };
}

export function renderWizardInvalidMenuChoice() {
  return { text: 'Réponds avec un chiffre entre 1 et 4.' };
}

export function renderWizardInvalidDuration() {
  return { text: "Durée non reconnue. Exemples valides : `10min`, `2h`, `3j`, `30s`." };
}

export function renderWizardAskMessage() {
  return { text: 'Quel est ton rappel ?' };
}

export function renderWizardEmptyMessage() {
  return { text: 'Le message ne peut pas être vide. Quel est ton rappel ?' };
}

export function renderWizardMessageTooLong(maxLength) {
  return { text: `Message trop long (max ${maxLength} caractères). Réessaie avec un texte plus court.` };
}

export function renderWizardCancelled() {
  return { text: '❌ Création de rappel annulée.' };
}

export function renderLimitReached(max) {
  return { text: `❌ Tu as déjà ${max} rappel(s) actif(s), c'est le maximum autorisé. Annule-en un avec /remind cancel <id> avant d'en créer un nouveau.` };
}

export function renderInvalidSyntax() {
  const p = config.prefix;
  return {
    text:
      "❌ Syntaxe non reconnue.\n\n" +
      "Usage :\n" +
      `• \`${p}remind <durée> <message>\` — ex: \`${p}remind 10min appeler maman\`\n` +
      `• \`${p}remind <date> <heure> <message>\` — ex: \`${p}remind demain 08:00 cours\`\n` +
      `• \`${p}remind\` seul — assistant guidé\n` +
      `• \`${p}remind help\` — aide complète`,
  };
}

export function renderNotFound() {
  return { text: '❌ Rappel introuvable (identifiant invalide, ou ce rappel ne t\'appartient pas).' };
}

export function renderHelp() {
  const p = config.prefix;
  return {
    text:
      `⏰ *Aide — /remind*\n\n` +
      `*Créer un rappel*\n` +
      `\`${p}remind <durée> <message>\`\n` +
      `  ex: \`${p}remind 10min appeler maman\`\n\n` +
      `\`${p}remind <date> <message>\`\n` +
      `  ex: \`${p}remind demain 08:00 cours\`\n` +
      `  ex: \`${p}remind 20/08/2026 18:30 réunion\`\n\n` +
      `\`${p}remind\` seul → assistant guidé pas-à-pas\n\n` +
      `*Récurrence*\n` +
      `\`${p}remind every day 08:00 <message>\`\n` +
      `\`${p}remind every week <jour> 09:00 <message>\`\n\n` +
      `*Gestion*\n` +
      `\`${p}reminders\` — liste tes rappels actifs\n` +
      `\`${p}remind cancel <id>\` — annule un rappel\n` +
      `\`${p}remind cancel all\` — annule tous tes rappels (confirmation demandée)\n` +
      `\`${p}remind info <id>\` — détails d'un rappel`,
  };
}
