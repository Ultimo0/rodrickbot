import { getGroupSettings, setAntiraid } from '../core/groupSettings.js';

export default {
  name: 'antiraid',
  description:
    "Protège le groupe contre les raids : supprime le contenu à risque (liens raccourcis, .apk, formulations " +
    "d'arnaque) et verrouille automatiquement le groupe si trop de membres rejoignent en peu de temps (8 en 1 min). " +
    'Usage: {prefix}antiraid on|off|status',
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
      const s = getGroupSettings(ctx.chatId).antiraid;
      await ctx.reply({
        text:
          `🚨 Antiraid : ${s.enabled ? 'activé ✅' : 'désactivé ❌'}\n` +
          'Contenu : liens raccourcis, .apk, formulations d\'arnaque → suppression + avertissement\n' +
          'Affluence : 8 nouveaux membres en moins de 1 min → verrouillage automatique (15 min)',
      });
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      await ctx.error('Usage: {prefix}antiraid on|off|status');
      return;
    }

    setAntiraid(ctx.chatId, sub === 'on');
    await ctx.success(
      sub === 'on'
        ? '✅ Antiraid activé (contenu à risque + verrouillage auto si 8 membres/1min).'
        : '❌ Antiraid désactivé.'
    );
  },
};
