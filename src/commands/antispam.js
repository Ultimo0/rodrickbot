import { getGroupSettings, setAntispam, setAntispamConfig } from '../core/groupSettings.js';
import { resetWarns, WARN_LIMIT } from '../core/warnStore.js';
import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';

export default {
  name: 'antispam',
  description:
    'Supprime les messages en rafale (5 messages en moins de 8s par défaut), avertit, et expulse au ' +
    "3e avertissement (compteur partagé avec {prefix}warn/{prefix}warns/l'antilink). " +
    'Usage: {prefix}antispam on|off|status|config <limite> <secondes>|reset @membre',
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'status') {
      const s = getGroupSettings(ctx.chatId).antispam;
      await ctx.reply({
        text:
          `🛡️ Antispam : ${s.enabled ? 'activé ✅' : 'désactivé ❌'}\n` +
          `Limite : ${s.messageLimit} messages en ${s.windowSeconds}s\n` +
          `Sanction : suppression + avertissement (expulsion à ${WARN_LIMIT}/${WARN_LIMIT})`,
      });
      return;
    }

    if (sub === 'config') {
      const limit = parseInt(ctx.args[1], 10);
      const seconds = parseInt(ctx.args[2], 10);
      if (!Number.isInteger(limit) || limit < 2 || !Number.isInteger(seconds) || seconds < 1) {
        await ctx.error('Usage: !antispam config <limite> <secondes>  (ex: !antispam config 5 8)');
        return;
      }
      setAntispamConfig(ctx.chatId, limit, seconds);
      await ctx.success(`✅ Antispam configuré : ${limit} messages en ${seconds}s.`);
      return;
    }

    if (sub === 'reset') {
      const targets = resolveTargetJids(ctx);
      if (!targets.length) {
        await ctx.error('❌ Mentionne un membre, réponds à son message, ou donne son numéro.');
        return;
      }
      const target = normalizeJid(targets[0]);
      resetWarns(ctx.chatId, target);
      await ctx.success(`✅ Avertissements de @${target.split('@')[0]} réinitialisés.`);
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      await ctx.error('Usage: !antispam on|off|status|config <limite> <secondes>|reset @membre');
      return;
    }

    setAntispam(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antispam activé.' : '❌ Antispam désactivé.');
  },
};
