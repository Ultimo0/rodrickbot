import {
  isAntibugEnabled,
  isAutoBlockEnabled,
  setAntibugEnabled,
  setAutoBlockEnabled,
} from '../core/antibugGuard.js';

export default {
  name: 'antibug',
  description:
    "Protection contre les messages anormalement volumineux/mal formés reçus en privé (harcèlement type \"bug bot\"). " +
    "Détection uniquement par défaut (juste un avertissement) ; le blocage automatique de l'expéditeur est une option séparée. " +
    'Usage: {prefix}antibug on|off|autoblock on|off|status',
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const [sub, arg] = ctx.args.map((a) => a.toLowerCase());

    if (sub === 'autoblock') {
      if (arg !== 'on' && arg !== 'off') {
        await ctx.error('Usage: {prefix}antibug autoblock on|off');
        return;
      }
      setAutoBlockEnabled(arg === 'on');
      await ctx.success(`✅ Blocage automatique ${arg === 'on' ? 'activé' : 'désactivé'}.`);
      return;
    }

    if (sub === 'on' || sub === 'off') {
      setAntibugEnabled(sub === 'on');
      await ctx.success(`✅ Protection antibug ${sub === 'on' ? 'activée' : 'désactivée'}.`);
      return;
    }

    // status (par défaut, ou usage invalide)
    const lines = [
      `🛡 Protection antibug : ${isAntibugEnabled() ? 'activée ✅' : 'désactivée ❌'}`,
      `🚫 Blocage automatique : ${isAutoBlockEnabled() ? 'activé ✅' : 'désactivé ❌'}`,
      '',
      'Usage: {prefix}antibug on|off|autoblock on|off',
    ];
    await ctx.reply({ text: lines.join('\n') });
  },
};
