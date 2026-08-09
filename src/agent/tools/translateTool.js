/**
 * Outil de traduction pour l'Agent IA.
 * Utilise l'API Groq pour traduire un texte.
 */

import { translateText } from '../../utils/groq.js';
import { resolveTextSource } from '../utils/textSourceResolver.js';

export const translateTool = {
  name: 'translate_text',
  description: 'Traduit un texte vers une langue cible. L\'outil utilise automatiquement le texte du message cité, du message actuel ou de la mémoire de session.',
  params: [
    { name: 'text', type: 'string', required: false, description: 'Le texte à traduire (optionnel si message cité ou mémoire disponible)' },
    { name: 'targetLanguage', type: 'string', required: true, description: 'Langue cible (ex: anglais, espagnol)' },
    { name: 'msg', type: 'object', required: false, description: 'Message Baileys pour la résolution automatique' },
    { name: 'chatId', type: 'string', required: false, description: 'ID du chat pour la résolution automatique' },
    { name: 'sender', type: 'string', required: false, description: 'Expéditeur pour la résolution automatique' },
  ],
  execute: async (ctx) => {
    const { targetLanguage } = ctx;
    // resolveTextSource() prend le contexte entier : elle applique déjà
    // l'ordre de priorité texte direct → args → message cité → message
    // actuel → mémoire de session, donc pas besoin de vérifier `text`
    // séparément ici.
    const textToTranslate = resolveTextSource(ctx);
    
    if (!textToTranslate?.trim()) {
      throw new Error('Aucun texte à traduire. Réponds à un message, fournis un texte ou assure-toi que la mémoire de session contient du texte.');
    }
    
    if (!targetLanguage?.trim()) {
      throw new Error('Langue cible manquante.');
    }
    
    return translateText(textToTranslate, targetLanguage);
  },
};
