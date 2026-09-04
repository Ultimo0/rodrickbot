import { getOwnerJid, getAdmins } from '../core/adminStore.js';

export default {
  name: 'admins',
  description: 'Liste les admins actuels du bot (propriétaire + admins ajoutés via {prefix}addadmin).',
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const owner = getOwnerJid();
    const all = getAdmins();
    const extra = all.filter((jid) => jid !== owner);

    const lines = [`👑 Propriétaire : \`${owner || 'non détecté (bot pas encore connecté ?)'}\``];

    if (extra.length) {
      lines.push('', `🛡 Admin(s) supplémentaire(s) (${extra.length}) :`);
      for (const jid of extra) lines.push(`- \`${jid}\``);
    } else {
      lines.push('', "Aucun admin supplémentaire — ajoute-en un avec {prefix}addadmin.");
    }

    await ctx.reply({ text: lines.join('\n') });
  },
};
