import { getGroupSettings, setAutotranslate } from '../core/groupSettings.js';

export default {
  name: 'traduireauto',
  aliases: ['autotranslate', 'tradauto'],
  description:
    "Traduit automatiquement tous les messages du groupe vers une langue cible (réponse citée sous chaque message). " +
    'Usage: {prefix}traduireauto <langue> pour activer, {prefix}traduireauto off pour désactiver.',
  category: 'Intelligence Artificielle',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const arg = ctx.args.join(' ').trim();

    if (!arg) {
      const current = getGroupSettings(ctx.chatId).autotranslate;
      const status = current.enabled
        ? `activée ✅ (vers ${current.targetLang})`
        : 'désactivée ❌';
      await ctx.reply({
        text: `Traduction automatique: ${status}\n\nUsage: !traduireauto <langue> (ex: anglais) — !traduireauto off pour désactiver.`,
      });
      return;
    }

    if (arg.toLowerCase() === 'off') {
      setAutotranslate(ctx.chatId, false);
      await ctx.success('❌ Traduction automatique désactivée.');
      return;
    }

    setAutotranslate(ctx.chatId, true, arg);
    await ctx.success(`✅ Traduction automatique activée : chaque message sera traduit en ${arg}.`);
  },
};
