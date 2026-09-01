import { getGroupSettings } from '../core/groupSettings.js';
import { handlePromoteGuard } from '../utils/antipromote.js';
import { handlePurgeGuard } from '../utils/antipurge.js';
import { getCurrentTheme } from '../themes/engine.js';
import { sendChannelMessage } from '../utils/channelCard.js';
import { logger } from '../utils/logger.js';

function applyPlaceholders(template, { number, groupName }) {
  return template.replace(/\{user\}/g, `@${number}`).replace(/\{group\}/g, groupName);
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

      // Antipurge : ne bloque pas le message bye ci-dessous (les deux
      // fonctionnalités sont indépendantes) — on ne "return" pas ici.
      if (action === 'remove') {
        await handlePurgeGuard(sock, chatId, author, participants);
      }

      if (action !== 'add' && action !== 'remove') return;

      const settings = getGroupSettings(chatId);
      const groupConfig = action === 'add' ? settings.welcome : settings.bye;
      if (!groupConfig.enabled) return;

      const metadata = await sock.groupMetadata(chatId);
      const theme = getCurrentTheme();

      for (const jid of participants) {
        const number = jid.split('@')[0].split(':')[0];

        // Message personnalisé par un admin (placeholders {user}/{group}) :
        // ne passe jamais par le thème, comportement inchangé. Sinon, le
        // thème actif construit lui-même le message par défaut.
        const text = groupConfig.message
          ? applyPlaceholders(groupConfig.message, { number, groupName: metadata.subject })
          : action === 'add'
            ? theme.renderWelcome({ number, groupName: metadata.subject })
            : theme.renderBye({ number, groupName: metadata.subject });

        await sendChannelMessage(sock, chatId, { text, mentions: [jid] });
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du traitement de group-participants.update');
    }
  };
}