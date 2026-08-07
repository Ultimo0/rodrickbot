import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { getWarns, resetWarns, WARN_LIMIT } from '../core/warnStore.js';

export default {
  name: 'warns',
  aliases: ['warnings'],
  description:
    "Affiche les avertissements d'un membre, ou les réinitialise avec !warns reset @membre.",
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const isReset = ctx.args[0]?.toLowerCase() === 'reset';
    const targets = resolveTargetJids(ctx);

    if (!targets.length) {
      await ctx.error('❌ Mentionne un membre, réponds à son message, ou donne son numéro.');
      return;
    }

    const target = normalizeJid(targets[0]);
    const number = target.split('@')[0];

    if (isReset) {
      resetWarns(ctx.chatId, target);
      await ctx.success(`✅ Avertissements de @${number} réinitialisés.`);
      return;
    }

    const count = getWarns(ctx.chatId, target);
    await ctx.sock.sendMessage(ctx.chatId, {
      text: `⚠️ @${number} a ${count}/${WARN_LIMIT} avertissement(s).`,
      mentions: [target],
    });
  },
};