import { resolveTargetJids } from '../utils/groupTarget.js';

export default {
  name: 'kick',
  aliases: ['remove'],
  description: "Retire un ou plusieurs membres du groupe. Usage: !kick en répondant à leur message, en les mentionnant, ou !kick <numero>",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const targets = resolveTargetJids(ctx);
    if (!targets.length) {
      await ctx.error('Indique qui retirer : réponds à son message, mentionne-le, ou donne son numéro (!kick <numero>).');
      return;
    }

    try {
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'remove');
      await ctx.success(`✅ ${targets.length} membre(s) retiré(s).`);
    } catch (err) {
      await ctx.error(`❌ Impossible de retirer : ${err.message}`);
    }
  },
};
