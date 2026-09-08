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

export function createGroupParticipantsHandler(sock) {
  return async ({ id: chatId, participants, action, author }) => {
    try {
      // Géré à part : ce n'est pas welcome/bye, et on veut réagir même si
      // welcome/bye sont désactivés pour ce groupe.
      if (action === 'promote') {
        await handlePromoteGuard(sock, chatId, author, participants);
        return;
      }

      if (action === 'demote') {
        await handleDemoteGuard(sock, chatId, author, participants);
        return;
      }

      // Antipurge : ne bloque pas le message bye ci-dessous (les deux
      // fonctionnalités sont indépendantes) — on ne "return" pas ici.
      if (action === 'remove') {
        await handlePurgeGuard(sock, chatId, author, participants);
      }

      // Antiraid (volet affluence) : indépendant de welcome/bye également —
      // doit se déclencher même si le message de bienvenue est désactivé.
      if (action === 'add') {
        await handleJoinRaidGuard(sock, chatId, participants);
      }

      if (action !== 'add' && action !== 'remove') return;

      const settings = getGroupSettings(chatId);
      const groupConfig = action === 'add' ? settings.welcome : settings.bye;
      if (!groupConfig.enabled) return;

      const metadata = await sock.groupMetadata(chatId);
      const theme = getCurrentTheme();

      for (const jid of participants) {
        const number = jid.split('@')[0].split(':')[0];

        // Message personnalisé par un admin (placeholders {user}/{group},
        // éventuellement plusieurs variantes séparées par "|") : ne passe
        // jamais par le thème, comportement inchangé. Sinon, le thème actif
        // construit lui-même le message par défaut (déjà varié lui aussi).
        const text = groupConfig.message
          ? applyPlaceholders(pickMessageVariant(groupConfig.message), { number, groupName: metadata.subject })
          : action === 'add'
            ? theme.renderWelcome({ number, groupName: metadata.subject })
            : theme.renderBye({ number, groupName: metadata.subject });

        // Photo de profil UNIQUEMENT pour l'arrivée (renvoyer la photo de
        // quelqu'un qui vient de partir n'a pas de sens) — best-effort,
        // retombe sur texte simple si indisponible.
        const profilePic = action === 'add' ? await fetchProfilePicture(sock, jid) : null;

        if (profilePic) {
          await sendChannelMessage(sock, chatId, { image: profilePic, caption: text, mentions: [jid] });
        } else {
          await sendChannelMessage(sock, chatId, { text, mentions: [jid] });
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du traitement de group-participants.update');
    }
  };
}