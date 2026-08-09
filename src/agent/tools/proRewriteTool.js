/**
 * Outil de réécriture professionnelle pour l'Agent IA.
 * Utilise des instructions spécifiques pour la réécriture sans les restrictions de correction.
 */

import { askGroq } from '../../utils/groq.js';
import { resolveTextSource } from '../utils/textSourceResolver.js';
import { logger } from '../../utils/logger.js';

export const proRewriteTool = {
  name: 'rewrite_professional',
  description: 'Outil DIRECT de réécriture professionnelle qui contourne les restrictions de l\'Agent IA général. Réécrit un texte de manière professionnelle en améliorant la structure, le vocabulaire et la présentation.',
  params: [
    { name: 'text', type: 'string', required: false, description: 'Le texte à réécrire (optionnel si message cité ou mémoire disponible)' },
    { name: 'msg', type: 'object', required: false, description: 'Message Baileys pour la résolution automatique' },
    { name: 'chatId', type: 'string', required: false, description: 'ID du chat pour la résolution automatique' },
    { name: 'sender', type: 'string', required: false, description: 'Expéditeur pour la résolution automatique' },
  ],
  execute: async (ctx) => {
    // La nouvelle fonction resolveTextSource prend le contexte entier
    const textToRewrite = resolveTextSource(ctx);
    
    if (!textToRewrite) {
      const errorMsg = 'Aucun texte à réécrire. Fournissez un texte, répondez à un message ou assurez-vous que la session contient du texte.';
      if (ctx.msg) {
        logger.debug({ msg: ctx.msg }, 'rewrite_professional: aucun texte résolu, structure du message reçu');
      }
      throw new Error(errorMsg);
    }

    // Instructions spécifiques pour la réécriture professionnelle
    const systemPrompt = `
Tu es un assistant EXCLUSIVEMENT dédié à la réécriture professionnelle.
Ta mission PRIORITAIRE est de transformer le texte fourni en une version professionnelle.

DIRECTIVES OBLIGATOIRES :
1. TU DOIS TOUJOURS réécrire le texte - aucune exception
2. Améliore LA STRUCTURE pour plus de clarté et de professionnalisme
3. Enrichis LE VOCABULAIRE avec des termes professionnels adaptés
4. Adopte UN TON FORMEL et respectueux
5. Conserve LE SENS ORIGINAL mais améliore la qualité
6. Modifie LA LONGUEUR si cela améliore le résultat
7. Ne refuse JAMAIS une demande de réécriture

EXEMPLES DE TRANSFORMATION :
- "Salut" → "Bonjour" ou "Cher/Cher client"
- "C'est cool" → "Cela présente un intérêt certain"
- "Fais-le" → "Veuillez procéder à"

Réponds UNIQUEMENT avec la version réécrite, sans commentaires.
`;

    const userPrompt = `TRANSFORME CE TEXTE EN VERSION PROFESSIONNELLE (obligatoire) :\n\n"${textToRewrite}"`;

    try {
      const response = await askGroq(`${systemPrompt}\n\n${userPrompt}`);
      return response;
    } catch (error) {
      logger.warn({ err: error }, 'rewrite_professional: erreur Groq');
      // Fallback pour ne pas échouer silencieusement si Groq est indisponible
      return `(Version professionnelle non disponible)\n\n${textToRewrite}`;
    }
  },
};