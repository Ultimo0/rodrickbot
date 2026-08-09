/**
 * Outil de résumé de texte pour l'Agent IA.
 * Utilise l'API Groq pour résumer un texte.
 */

import { summarizeText } from '../../utils/groq.js';
import { resolveTextSource } from '../utils/textSourceResolver.js';

export const summarizeTool = {
  name: 'summarize_text',
  description: 'Résumé un texte en fonction d\'une taille cible. L\'outil utilise automatiquement le texte du message cité, du message actuel ou de la mémoire de session.',
  params: [
    { name: 'text', type: 'string', required: false, description: 'Le texte à résumer (optionnel si message cité ou mémoire disponible)' },
    { name: 'size', type: 'string', required: false, description: 'Taille du résumé (court, moyen, détaillé)' },
    { name: 'msg', type: 'object', required: false, description: 'Message Baileys pour la résolution automatique' },
    { name: 'chatId', type: 'string', required: false, description: 'ID du chat pour la résolution automatique' },
    { name: 'sender', type: 'string', required: false, description: 'Expéditeur pour la résolution automatique' },
  ],
  execute: async (ctx) => {
    const { size = 'moyen' } = ctx;
    // resolveTextSource() prend le contexte entier : elle applique déjà
    // l'ordre de priorité texte direct → args → message cité → message
    // actuel → mémoire de session.
    const textToSummarize = resolveTextSource(ctx);
    
    if (!textToSummarize?.trim()) {
      throw new Error('Aucun texte à résumer. Réponds à un message, fournis un texte ou assure-toi que la mémoire de session contient du texte.');
    }
    return summarizeText(textToSummarize, size);
  },
};