import { normalizeJid, resolveSparedJids } from '../utils/groupTarget.js';
import { config } from '../config/index.js';

const CHUNK_SIZE = 20; // limite raisonnable par appel groupParticipantsUpdate

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

export default {
  name: 'kickall',
  description:
    "Retire tous les membres du groupe (sauf le bot et les admins). Épargne d'autres membres en les mentionnant, en répondant à leur message, ou via !kickall <numero...>",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    try {
      const metadata = await ctx.sock.groupMetadata(ctx.chatId);
      const botJid = normalizeJid(ctx.sock.user?.id);

      const manuallySpared = resolveSparedJids(ctx);
      // Protection systématique : les admins déclarés dans .env, et la
      // personne qui exécute la commande, ne sont jamais retirés.
      const autoProtected = new Set();
      for (const adminJid of config.adminJids) autoProtected.add(normalizeJid(adminJid));
      autoProtected.add(normalizeJid(ctx.sender));

      const spared = new Set([...manuallySpared, ...autoProtected]);

      const targets = metadata.participants
        .map((p) => normalizeJid(p.id))
        .filter((jid) => jid !== botJid && !spared.has(jid));

      if (!targets.length) {
        await ctx.error('❌ Aucun membre à retirer (tout le monde est épargné, ou le groupe ne contient que le bot).');
        return;
      }

      let removed = 0;
      let failed = 0;

      for (const batch of chunk(targets, CHUNK_SIZE)) {
        try {
          const result = await ctx.sock.groupParticipantsUpdate(ctx.chatId, batch, 'remove');
          removed += result.filter((r) => r.status === '200').length;
          failed += result.filter((r) => r.status !== '200').length;
        } catch (err) {
          failed += batch.length;
        }
      }

      const noteParts = [];
      if (manuallySpared.size) noteParts.push(`${manuallySpared.size} épargné(s) manuellement`);
      noteParts.push(`${autoProtected.size} protégé(s) automatiquement (admins + vous)`);
      const sparedNote = ` (${noteParts.join(', ')})`;

      if (removed === 0) {
        await ctx.error(`❌ Aucun membre n'a pu être retiré.${sparedNote}`);
      } else if (failed) {
        await ctx.success(`⚠️ ${removed} membre(s) retiré(s), ${failed} échec(s).${sparedNote}`);
      } else {
        await ctx.success(`✅ ${removed} membre(s) retiré(s) du groupe.${sparedNote}`);
      }
    } catch (err) {
      await ctx.error(`❌ Impossible de retirer les membres : ${err.message}`);
    }
  },
};