import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { addAdmin, getOwnerJid } from '../core/adminStore.js';

export default {
  name: 'addadmin',
  description:
    "Ajoute un admin du bot (accès aux commandes réservées, partout, pas seulement dans ce groupe). " +
    'Réponds au message de la personne, mentionne-la, ou donne son numéro : {prefix}addadmin <numero>. ' +
    "Réservé aux admins existants — c'est ce qui empêche n'importe qui de s'auto-promouvoir.",
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const targets = resolveTargetJids(ctx);
    if (!targets.length) {
      await ctx.error(
        "Indique qui ajouter : réponds à son message, mentionne-le, ou donne son numéro ({prefix}addadmin <numero>)."
      );
      return;
    }

    const jid = normalizeJid(targets[0]);

    if (jid === getOwnerJid()) {
      await ctx.reply({ text: 'ℹ️ Cette personne est déjà admin — elle est propriétaire du bot (numéro sur lequel il est connecté).' });
      return;
    }

    const added = addAdmin(jid);
    if (!added) {
      await ctx.reply({ text: 'ℹ️ Cette personne est déjà admin du bot.' });
      return;
    }

    await ctx.success(`✅ \`${jid}\` est maintenant admin du bot.`);
  },
};
