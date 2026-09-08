import { getGroupSettings, setAntiflood, setAntifloodConfig } from '../core/groupSettings.js';

export default {
  name: 'antiflood',
  description:
    'Supprime automatiquement les messages qui mentionnent trop de monde d\'un coup (raid classique) et avertit leur auteur. ' +
    'Usage: {prefix}antiflood on|off, {prefix}antiflood max <nombre>',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'max') {
      const value = parseInt(ctx.args[1], 10);
      if (!Number.isInteger(value) || value < 1) {
        await ctx.error('Usage: !antiflood max <nombre> (ex: !antiflood max 8)');
        return;
      }
      setAntifloodConfig(ctx.chatId, value);
      await ctx.success(`✅ Seuil antiflood réglé à ${value} mentions max par message.`);
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      const current = getGroupSettings(ctx.chatId).antiflood;
      await ctx.reply({
        text:
          `Antiflood: ${current.enabled ? 'activé ✅' : 'désactivé ❌'} (seuil: ${current.maxMentions} mentions)\n\n` +
          'Usage: !antiflood on|off, !antiflood max <nombre>',
      });
      return;
    }

    setAntiflood(ctx.chatId, sub === 'on');
    const current = getGroupSettings(ctx.chatId).antiflood;
    await ctx.success(
      sub === 'on'
        ? `✅ Antiflood activé (seuil : ${current.maxMentions} mentions max).`
        : '❌ Antiflood désactivé.'
    );
  },
};
