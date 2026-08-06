/**
 * Commande dédiée pour la réécriture professionnelle
 * Contourne l'Agent IA et ses restrictions
 */

import { proRewriteTool } from '../agent/tools/proRewriteTool.js';
import { logger } from '../utils/logger.js';
import { resolveTextSource } from '../agent/utils/textSourceResolver.js';

export default {
  name: 'rewrite',
  aliases: ['pro', 'professionnel', 'réécris'],
  description: 'Réécrit un texte de manière professionnelle (contourne l\'Agent IA)',
  category: 'Utilitaires',
  privateOnly: false,
  execute: async (ctx) => {
    const textToRewrite = resolveTextSource(ctx);

    if (!textToRewrite) {
      return ctx.error('Format non reconnu. Utilisez: !rewrite Votre texte ici, ou répondez à un message.');
    }

    try {
      const result = await proRewriteTool.execute({
        ...ctx, // Passer le contexte complet
        text: textToRewrite, // S'assurer que le texte résolu est prioritaire
      });

      // Affichage propre sans citation
      await ctx.sock.sendMessage(ctx.chatId, { text: result }, { quoted: ctx.msg });
    } catch (err) {
      logger.error({ err, sender: ctx.sender }, 'Erreur pendant !rewrite');
      await ctx.error(`❌ Erreur: ${err.message}`);
    }
  }
};

