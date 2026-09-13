import { getRecentSentKeys, removeSentKeys } from '../core/sentMessageLog.js';

const DEFAULT_COUNT = 10;
const MAX_COUNT = 100;

export default {
  name: 'clear',
  aliases: ['nettoyer'],
  description:
    'Supprime les N derniers messages envoyés par le bot dans ce chat (défaut: 10, max: 100). Usage: {prefix}clear [n]',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    let count = DEFAULT_COUNT;
    if (ctx.args[0]) {
      const parsed = parseInt(ctx.args[0], 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_COUNT) {
        await ctx.error(`Nombre invalide. Utilise une valeur entre 1 et ${MAX_COUNT}.`);
        return;
      }
      count = parsed;
    }

    const keys = getRecentSentKeys(ctx.chatId, count);
    if (!keys.length) {
      await ctx.error("Aucun message récent du bot à supprimer dans cette conversation (redémarrage du bot depuis, peut-être).");
      return;
    }

    let deleted = 0;
    for (const key of keys) {
      try {
        // eslint-disable-next-line no-await-in-loop -- suppressions séquentielles requises par WhatsApp (une par une, pas en lot)
        await ctx.sock.sendMessage(ctx.chatId, { delete: key });
        deleted += 1;
      } catch {
        // un message trop ancien ou déjà supprimé ne doit pas interrompre le nettoyage des suivants
      }
    }

    removeSentKeys(ctx.chatId, keys);
    await ctx.success(`🧹 ${deleted} message(s) du bot supprimé(s).`);
  },
};
