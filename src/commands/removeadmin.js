import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { removeAdmin, isOwner } from '../core/adminStore.js';

export default {
  name: 'removeadmin',
  aliases: ['deladmin'],
  description:
    "Retire un admin du bot ajouté via {prefix}addadmin. Réponds à son message, mentionne-le, ou " +
    'donne son numéro : {prefix}removeadmin <numero>. Le propriétaire du bot (numéro sur lequel il ' +
    'est connecté) ne peut pas être retiré ainsi.',
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const targets = resolveTargetJids(ctx);
    if (!targets.length) {
      await ctx.error(
        "Indique qui retirer : réponds à son message, mentionne-le, ou donne son numéro ({prefix}removeadmin <numero>)."
      );
      return;
    }

    const jid = normalizeJid(targets[0]);

    if (isOwner(jid)) {
      await ctx.error('❌ Impossible de retirer le propriétaire du bot (numéro sur lequel il est connecté).');
      return;
    }

    const removed = removeAdmin(jid);
    if (!removed) {
      await ctx.reply({ text: "ℹ️ Cette personne n'était pas admin du bot." });
      return;
    }

    await ctx.success(`✅ \`${jid}\` n'est plus admin du bot.`);
  },
};
