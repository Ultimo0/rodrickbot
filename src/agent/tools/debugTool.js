/**
 * Outil de débogage pour analyser la structure des messages
 */

export const debugTool = {
  name: 'debug_message',
  description: 'Affiche la structure complète d\'un message pour le débogage. Utilisation: !debug',
  // Outil interne : jamais exécutable via l'agent conversationnel (voir le
  // filtre dans toolRegistry.js). Il dump le JSON brut d'un message
  // WhatsApp — une fuite d'infos si jamais un chemin (hallucination du
  // modèle, futur changement de prompt...) parvenait à le déclencher.
  internal: true,
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
    } catch (error) {
      return `Erreur lors de l\'analyse du message: ${error.message}`;
    }
  },
};