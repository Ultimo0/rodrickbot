import { getThemeName, listThemeNames, setTheme } from '../themes/engine.js';

export default {
  name: 'theme',
  description:
    'Affiche ou change le thème visuel du bot (menu, démarrage, welcome/bye, toutes les réponses). ' +
    'Usage: {prefix}theme [nom] — {prefix}theme list pour voir les thèmes disponibles.',
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const arg = ctx.args[0]?.toLowerCase();

    if (!arg || arg === 'list') {
      const names = listThemeNames();
      const current = getThemeName();
      const lines = [
        `Thème actuel : *${current}*`,
        '',
        'Disponibles :',
        ...names.map((n) => `${n === current ? '➜' : '•'} ${n}`),
        '',
        'Usage : theme <nom>',
      ];
      await ctx.reply({ text: lines.join('\n') });
      return;
    }

    try {
      setTheme(arg);
      await ctx.success(`✅ Thème changé : *${arg}*`);
    } catch (err) {
      await ctx.error(`❌ ${err.message}`);
    }
  },
};
