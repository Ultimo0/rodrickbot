import { setAfk } from '../core/afkStore.js';

export default {
  name: 'afk',
  description:
    "Te déclare absent avec une raison optionnelle. Quiconque te mentionne ou répond à l'un de tes messages " +
    "en sera informé automatiquement. Retape n'importe quel message pour redevenir actif. Usage: {prefix}afk [raison]",
  category: 'Utilitaires',
  privateOnly: false,
  execute: async (ctx) => {
    const reason = ctx.args.join(' ') || 'Absent';
    setAfk(ctx.sender, reason);
    await ctx.success(`💤 Tu es maintenant marqué absent : "${reason}"`);
  },
};
