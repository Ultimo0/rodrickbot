import { getGroupSettings } from '../core/groupSettings.js';
import { handlePromoteGuard } from '../utils/antipromote.js';
import { handleDemoteGuard } from '../utils/antidemote.js';
import { handlePurgeGuard } from '../utils/antipurge.js';
import { handleJoinRaidGuard } from '../core/joinRaidGuard.js';
import { getCurrentTheme } from '../themes/engine.js';
import { sendChannelMessage } from '../utils/channelCard.js';
import { pickRandom } from '../utils/pickRandom.js';
import { logger } from '../utils/logger.js';

function applyPlaceholders(template, { number, groupName }) {
  return template.replace(/\{user\}/g, `@${number}`).replace(/\{group\}/g, groupName);
}

// Un message personnalisé peut désormais contenir plusieurs variantes
// séparées par "|" (ex: {prefix}welcome on A | B | C) — une choisie au
// hasard à chaque arrivée/départ, plutôt qu'une formulation figée à
// chaque fois. Rétrocompatible : sans "|", une seule variante = comportement inchangé.
function pickMessageVariant(message) {
  const variants = message.split('|').map((v) => v.trim()).filter(Boolean);
  return pickRandom(variants.length ? variants : [message]);
}

// Photo de profil du membre concerné, en best-effort : peut échouer sans
// que ce soit une erreur (pas de photo, ou vie privée qui en restreint
// l'accès aux non-contacts) — dans ce cas on retombe simplement sur un
// message texte, sans rien signaler à personne.
async function fetchProfilePicture(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Baileys peut transmettre les entrées de `participants` sous forme de
 * simple chaîne OU d'objet contenant l'identifiant dans un champ `id`/`jid`
 * selon la version et le type d'identifiant (lid vs jid classique) —
 * confirmé en prod sur Baileys 7.0.0-rc14 : `TypeError: jid.split is not
 * a function` sur un `action: 'add'`, welcome cassé en silence jusqu'à ce
 * que le correctif précédent (try/catch isolés) permette de voir l'erreur
 * précise. On normalise donc chaque entrée en chaîne UNE SEULE FOIS ici,
 * avant de la transmettre à un guard (antipromote/antidemote/antipurge/
 * antiraid utilisent tous normalizeJid()/jid.split() en interne — même
 * bug potentiel) ou au message de bienvenue/départ — plutôt que corriger
 * chaque consommateur séparément et risquer d'en oublier un.
 */
function toJidString(participant) {
  if (typeof participant === 'string') return participant;
  if (participant && typeof participant === 'object') {
    return participant.id || participant.jid || null;
  }
  return null;
}

function normalizeParticipants(raw, chatId) {
  const result = [];
  let droppedCount = 0;
  for (const participant of raw || []) {
    const jid = toJidString(participant);
    if (jid) {
      result.push(jid);
    } else {
      droppedCount += 1;
    }
  }
  if (droppedCount > 0) {
    logger.warn(
      { chatId, droppedCount, sample: raw?.[0] },
      'Certaines entrées de participants (group-participants.update) sont dans un format inattendu et ont été ignorées'
    );
  }
  return result;
}

export function createGroupParticipantsHandler(sock) {
  return async ({ id: chatId, participants: rawParticipants, action, author }) => {
    const participants = normalizeParticipants(rawParticipants, chatId);

    // Chaque étape est isolée dans son propre try/catch : avant le
    // correctif précédent, tout (antipromote/antidemote/antipurge/antiraid
    // ET welcome/bye) partageait un seul try/catch englobant — une
    // exception dans n'importe laquelle des étapes précédentes empêchait
    // silencieusement l'envoi du message de bienvenue/départ, avec pour
    // seule trace un warn générique impossible à rattacher à sa cause.
    // Ici, un échec sur une étape est logué avec un label précis et
    // n'affecte jamais les étapes suivantes.

    if (action === 'promote') {
      try {
        await handlePromoteGuard(sock, chatId, author, participants);
      } catch (err) {
        logger.warn({ err, chatId }, 'Erreur dans handlePromoteGuard (antipromote)');
      }
      return;
    }

    if (action === 'demote') {
      try {
        await handleDemoteGuard(sock, chatId, author, participants);
      } catch (err) {
        logger.warn({ err, chatId }, 'Erreur dans handleDemoteGuard (antidemote)');
      }
      return;
    }

    if (action === 'remove') {
      try {
        await handlePurgeGuard(sock, chatId, author, participants);
      } catch (err) {
        logger.warn({ err, chatId }, 'Erreur dans handlePurgeGuard (antipurge)');
      }
    }

    if (action === 'add') {
      try {
        await handleJoinRaidGuard(sock, chatId, participants);
      } catch (err) {
        logger.warn({ err, chatId }, 'Erreur dans handleJoinRaidGuard (antiraid)');
      }
    }

    if (action !== 'add' && action !== 'remove') return;

    try {
      const settings = getGroupSettings(chatId);
      const groupConfig = action === 'add' ? settings.welcome : settings.bye;
      if (!groupConfig.enabled) return;

      const metadata = await sock.groupMetadata(chatId);
      const theme = getCurrentTheme();

      if (!theme) {
        logger.warn({ chatId }, 'Aucun thème chargé (getCurrentTheme() a renvoyé undefined) — message welcome/bye annulé');
        return;
      }

      for (const jid of participants) {
        const number = jid.split('@')[0].split(':')[0];

        const text = groupConfig.message
          ? applyPlaceholders(pickMessageVariant(groupConfig.message), { number, groupName: metadata.subject })
          : action === 'add'
            ? theme.renderWelcome({ number, groupName: metadata.subject })
            : theme.renderBye({ number, groupName: metadata.subject });

        const profilePic = action === 'add' ? await fetchProfilePicture(sock, jid) : null;

        if (profilePic) {
          await sendChannelMessage(sock, chatId, { image: profilePic, caption: text, mentions: [jid] });
        } else {
          await sendChannelMessage(sock, chatId, { text, mentions: [jid] });
        }
      }
    } catch (err) {
      logger.warn({ err, chatId, action }, 'Erreur lors de l\'envoi du message de bienvenue/départ');
    }
  };
}