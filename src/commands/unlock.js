import { parseDuration, formatDuration } from '../utils/duration.js';
import { scheduleAutoAction } from '../core/lockScheduler.js';

export default {
  name: 'unlock',
  description: 'Déverrouille le groupe : tous les membres peuvent à nouveau écrire. Usage: !unlock [durée] (ex: !unlock 10min)',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    let ms = null;
    if (ctx.args.length) {
      ms = parseDuration(ctx.args[0]);
      if (ms === null) {
        await ctx.error('❌ Durée invalide. Exemples: !unlock 10s, !unlock 5min, !unlock 2h');
        return;
      }
    }

    try {
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');

      if (ms === null) {
        await ctx.success('🔓 Groupe déverrouillé : tout le monde peut écrire.');
        return;
      }

      await ctx.success(
        `🔓 Groupe déverrouillé pour ${formatDuration(ms)} : tout le monde peut écrire.`
      );

      scheduleAutoAction(ctx.sock, ctx.chatId, 'lock', ms);
    } catch (err) {
      await ctx.error(`❌ Impossible de déverrouiller le groupe : ${err.message}`);
    }
  },
};