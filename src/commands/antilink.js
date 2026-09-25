import { getGroupSettings, setAntilink } from '../core/groupSettings.js';
import { sendWithChannelCard } from '../utils/channelCard.js';

export default {
  name: 'antilink',
  description:
    'Supprime automatiquement les liens postés par les non-admins et avertit leur auteur. Usage: {prefix}antilink on|off',
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
      const current = getGroupSettings(ctx.chatId).antilink;
      await sendWithChannelCard(ctx, `Antilink: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n\nUsage: !antilink on|off`);
      return;
    }

    setAntilink(ctx.chatId, sub === 'on');
    await ctx.success(); // réaction ✅ seule, le texte part via la carte (badge "Voir la chaîne")
    await sendWithChannelCard(ctx, sub === 'on' ? '✅ Antilink activé.' : '❌ Antilink désactivé.');
  },
};