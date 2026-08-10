/**
 * Construit le contexte conversationnel envoyé à l'IA.
 *
 * Ce module réutilise la mémoire de session en mémoire pour reconstruire
 * une fenêtre de conversation récente. Il évite de faire dépendre le
 * runtime de l'IA d'un stockage persistant complexe.
 */

import { getRecentMessages } from './sessionMemory.js';

const MAX_HISTORY_MESSAGES = 8;
// Longueur max (en caractères) d'un message individuel repris dans
// l'historique envoyé à Groq. Sans ça, un utilisateur qui colle un pavé de
// texte (ex: pour résumé/correction) fait gonfler le prompt système à
// chaque tour suivant tant que ce message reste dans la fenêtre des 8
// derniers — coût Groq inutile, le contenu intégral n'apportant rien à la
// classification d'intention du tour courant.
const MAX_HISTORY_ENTRY_CHARS = 400;

function truncateForHistory(text = '') {
  const value = String(text);
  return value.length > MAX_HISTORY_ENTRY_CHARS
    ? `${value.slice(0, MAX_HISTORY_ENTRY_CHARS)}… [tronqué]`
    : value;
}

export function buildConversationContext(chatId, sender, latestUserText) {
  const recentMessages = getRecentMessages(chatId, sender, MAX_HISTORY_MESSAGES);

  const history = recentMessages
    .map((entry) => `${entry.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${truncateForHistory(entry.text)}`)
    .join('\n');

  return {
    history,
    latestUserText,
    prompt: [
      'Tu es RodrickBOT, un assistant conversationnel WhatsApp. ',
      'Tu dois rester utile, concis et fiable. ',
      'Utilise le contexte de conversation fourni pour répondre à l’utilisateur. ',
      'Si l’utilisateur demande une synthèse, une correction, une traduction ou un traitement d’image, ',
      'choisis l’outil adapté, puis réponds avec le résultat final. ',
      'Si tu n’as pas assez d’informations, demande une clarification courte. ',
      'Réponds en français par défaut, sauf si l’utilisateur demande une autre langue.',
      '',
      history ? `Historique récent:\n${history}` : 'Historique récent: aucun.',
      '',
      `Dernier message utilisateur:\n${latestUserText}`,
    ].join('\n'),
  };
}
