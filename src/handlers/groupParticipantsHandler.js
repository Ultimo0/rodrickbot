import { getGroupSettings } from '../core/groupSettings.js';
import { logger } from '../utils/logger.js';

function applyPlaceholders(template, { number, groupName }) {
  return template.replace(/\{user\}/g, `@${number}`).replace(/\{group\}/g, groupName);
}

export function createGroupParticipantsHandler(sock) {
  return async ({ id: chatId, participants, action }) => {
    try {
      if (action !== 'add' && action !== 'remove') return;

      const settings = getGroupSettings(chatId);
      const config = action === 'add' ? settings.welcome : settings.bye;
      if (!config.enabled) return;

      const metadata = await sock.groupMetadata(chatId);
      const defaultTemplate =
        action === 'add'
          ? '╔══════════════════════╗\n' +
            '🌟  WELCOME  🌟\n' +
            '╚══════════════════════╝\n\n' +
            '👤 Utilisateur : *{user}*\n' +
            '🏡 Groupe : *{group}*\n\n' +
            '🎊 Toute la communauté te souhaite la bienvenue !\n\n' +
            '📜 Règles\n' +
            '✅ Respect\n' +
            '✅ Bonne humeur\n' +
            '✅ Entraide\n\n' +
            '🚀 Profite de ton séjour parmi nous !'
          : '╔════════════════════╗\n' +
            '🚪 DÉPART D\'UN MEMBRE\n' +
            '╚════════════════════╝\n\n' +
            '👤 *{user}* a quitté *{group}*.\n\n' +
            '🙏 Merci pour le temps passé avec nous.\n' +
            '🍀 Bonne chance pour la suite !';
      const template = config.message || defaultTemplate;

      for (const jid of participants) {
        const number = jid.split('@')[0].split(':')[0];
        const text = applyPlaceholders(template, { number, groupName: metadata.subject });
        await sock.sendMessage(chatId, { text, mentions: [jid] });
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du traitement welcome/bye');
    }
  };
}