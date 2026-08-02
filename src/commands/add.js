import { numberToJid } from '../utils/groupTarget.js';

export default {
  name: 'add',
  description: 'Ajoute un ou plusieurs membres au groupe. Usage: !add <numero> [numero...]',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    if (!ctx.args.length) {
      await ctx.error('Usage: !add <numero> [numero...] (ex: !add 33612345678)');
      return;
    }

    const targets = ctx.args.filter((a) => /\d{5,}/.test(a)).map(numberToJid);
    if (!targets.length) {
      await ctx.error('Aucun numéro valide fourni.');
      return;
    }

    try {
      const result = await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'add');
      const failed = result.filter((r) => r.status !== '200');

      if (failed.length === targets.length) {
        await ctx.error("❌ Aucun ajout n'a réussi (numéro invalide, ou confidentialité du contact).");
      } else if (failed.length) {
        await ctx.success(`⚠️ Ajout partiel : ${targets.length - failed.length}/${targets.length} réussi(s).`);
      } else {
        await ctx.success(`✅ ${targets.length} membre(s) ajouté(s).`);
      }
    } catch (err) {
      await ctx.error(`❌ Impossible d'ajouter : ${err.message}`);
    }
  },
};
