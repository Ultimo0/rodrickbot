import { resolveTargetJids } from '../utils/groupTarget.js';
import { parseDuration, formatDuration } from '../utils/duration.js';
import { logger } from '../utils/logger.js';

function extractDuration(args) {
  for (const arg of args) {
    const ms = parseDuration(arg);
    if (ms !== null) return ms;
  }
  return null;
}

export default {
  name: 'demote',
  description:
    "Retire le statut admin du groupe, temporairement ou non. Usage: !demote en répondant à leur message, en les mentionnant, ou !demote <numero>, avec en plus une durée optionnelle (ex: !demote 10min, !demote 30s, !demote 2h).",
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
      await ctx.error('Indique qui rétrograder : réponds à son message, mentionne-le, ou donne son numéro (!demote <numero> [durée]).');
      return;
    }

    const ms = extractDuration(ctx.args);

    try {
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'demote');

      if (ms === null) {
        await ctx.success(`✅ ${targets.length} membre(s) rétrogradé(s).`);
        return;
      }

      await ctx.success(`✅ ${targets.length} membre(s) rétrogradé(s) pour ${formatDuration(ms)}.`);

      setTimeout(async () => {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chatId, targets, 'promote');
          await ctx.sock.sendMessage(ctx.chatId, {
            text: '> ⏳ Rétrogradation temporaire terminée, statut admin restauré automatiquement.',
            mentions: targets,
          });
        } catch (err) {
          // Le membre a peut-être déjà été promu manuellement ou a quitté le groupe.
          logger.warn({ err, chatId: ctx.chatId, targets }, 'Restauration automatique du statut admin impossible');
        }
      }, ms);
    } catch (err) {
      await ctx.error(`❌ Impossible de rétrograder : ${err.message}`);
    }
  },
};