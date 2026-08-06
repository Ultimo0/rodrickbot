import { resolveTargetJids } from '../utils/groupTarget.js';
import { extractDuration, formatDuration } from '../utils/duration.js';

export default {
  name: 'promote',
  description:
    "Donne le statut admin du groupe, temporairement ou non. Usage: !promote en répondant à leur message, en les mentionnant, ou !promote <numero>, avec en plus une durée optionnelle (ex: !promote 10min, !promote 30s, !promote 2h).",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    const targets = resolveTargetJids(ctx);
    if (!targets.length) {
      await ctx.error('Indique qui promouvoir : réponds à son message, mentionne-le, ou donne son numéro (!promote <numero> [durée]).');
      return;
    }

    const ms = extractDuration(ctx.args);

    try {
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'promote');

      if (ms === null) {
        await ctx.success(`✅ ${targets.length} membre(s) promu(s) admin.`);
        return;
      }

      await ctx.success(`✅ ${targets.length} membre(s) promu(s) admin pour ${formatDuration(ms)}.`);

      setTimeout(async () => {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'demote');
          await ctx.sock.sendMessage(ctx.chatId, {
            text: '> ⏳ Statut admin temporaire expiré, rétrogradation automatique.',
            mentions: targets,
          });
        } catch (err) {
          // Le membre a peut-être déjà été rétrogradé ou a quitté le groupe.
        }
      }, ms);
    } catch (err) {
      await ctx.error(`❌ Impossible de promouvoir : ${err.message}`);
    }
  },
};