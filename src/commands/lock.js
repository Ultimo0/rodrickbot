import { parseDuration, formatDuration } from '../utils/duration.js';
import { scheduleAutoAction } from '../core/lockScheduler.js';

export default {
  name: 'lock',
  description: 'Verrouille le groupe : seuls les admins du groupe peuvent écrire. Usage: {prefix}lock [durée] (ex: {prefix}lock 10min)',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    let ms = null;
    if (ctx.args.length) {
      ms = parseDuration(ctx.args[0]);
      if (ms === null) {
        await ctx.error('❌ Durée invalide. Exemples: !lock 10s, !lock 5min, !lock 2h');
        return;
      }
    }

    try {
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');

      if (ms === null) {
        await ctx.success('🔒 Groupe verrouillé : seuls les admins peuvent écrire.');
        return;
      }

      await ctx.success(
        `🔒 Groupe verrouillé pour ${formatDuration(ms)} : seuls les admins peuvent écrire.`
      );

      scheduleAutoAction(ctx.sock, ctx.chatId, 'unlock', ms);
    } catch (err) {
      await ctx.error(`❌ Impossible de verrouiller le groupe : ${err.message}`);
    }
  },
};