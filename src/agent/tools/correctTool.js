/**
 * Outil de correction de texte pour l'Agent IA.
 * Utilise l'API Groq pour corriger un texte.
 */

import { correctText } from '../../utils/groq.js';
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
  execute: async (ctx) => {
    // resolveTextSource() prend le contexte entier : elle applique déjà
    // l'ordre de priorité texte direct → args → message cité → message
    // actuel → mémoire de session.
    const textToCorrect = resolveTextSource(ctx);
    
    if (!textToCorrect?.trim()) {
      throw new Error('Aucun texte à corriger. Réponds à un message, fournis un texte ou assure-toi que la mémoire de session contient du texte.');
    }
    return correctText(textToCorrect);
  },
};