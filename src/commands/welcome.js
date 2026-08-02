import { getGroupSettings, setWelcome } from '../core/groupSettings.js';

export default {
  name: 'welcome',
  description:
    'Active/désactive le message de bienvenue. Usage: !welcome on|off [message]. Placeholders: {user} {group}',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub !== 'on' && sub !== 'off') {
      const current = getGroupSettings(ctx.chatId).welcome;
      await ctx.reply({
        text:
          `État actuel: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n` +
          `Message: ${current.message || '(par défaut)'}\n\n` +
          `Usage: !welcome on|off [message avec {user} et {group}]`,
      });
      return;
    }

    const customMessage = ctx.args.slice(1).join(' ') || null;
    setWelcome(ctx.chatId, sub === 'on', customMessage);
    await ctx.success(
      sub === 'on' ? '✅ Message de bienvenue activé.' : '❌ Message de bienvenue désactivé.'
    );
  },
};