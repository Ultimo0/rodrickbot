/**
 * Outil de correction de texte pour l'Agent IA.
 * Utilise l'API Mistral pour corriger un texte.
 */

import { correctText } from '../../utils/mistral.js';
import { resolveTextSource } from '../utils/textSourceResolver.js';

export const correctTool = {
  name: 'correct_text',
  description: 'Corrige un texte en gardant le sens initial. L\'outil utilise automatiquement le texte du message cité, du message actuel ou de la mémoire de session.',
  params: [
    { name: 'text', type: 'string', required: false, description: 'Le texte à corriger (optionnel si message cité ou mémoire disponible)' },
    { name: 'msg', type: 'object', required: false, description: 'Message Baileys pour la résolution automatique' },
    { name: 'chatId', type: 'string', required: false, description: 'ID du chat pour la résolution automatique' },
    { name: 'sender', type: 'string', required: false, description: 'Expéditeur pour la résolution automatique' },
  ],
  execute: async ({ text, msg, chatId, sender }) => {
    // Résolution automatique de la source de texte
    let textToCorrect = text;
    if (!textToCorrect && msg && chatId && sender) {
      textToCorrect = resolveTextSource(msg, chatId, sender);
    }
    
    if (!textToCorrect?.trim()) {
      throw new Error('Aucun texte à corriger. Réponds à un message, fournis un texte ou assure-toi que la mémoire de session contient du texte.');
    }
    return correctText(textToCorrect);
  },
};