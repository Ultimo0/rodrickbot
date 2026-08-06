/**
 * Outil de débogage pour analyser la structure des messages
 */

import { logger } from '../../utils/logger.js';

export const debugTool = {
  name: 'debug_message',
  description: 'Affiche la structure complète d\'un message pour le débogage. Utilisation: !debug',
  params: [
    { name: 'msg', type: 'object', required: true, description: 'Message Baileys à analyser' },
  ],
  execute: async ({ msg }) => {
    if (!msg) {
      return 'Aucun message fourni pour le débogage.';
    }

    try {
      const msgJson = JSON.stringify(msg, null, 2);
      return `=== STRUCTURE DU MESSAGE ===\n\`\`\`\n${msgJson}\n\`\`\`\n=== FIN ===`;
    } catch (err) {
      logger.warn({ err }, 'debug_message: sérialisation du message impossible');
      return `Erreur lors de l'analyse du message: ${err.message}`;
    }
  },
};