import {
  getGroupSettings,
  setLinkWhitelist,
  addWhitelistedDomain,
  removeWhitelistedDomain,
} from '../core/groupSettings.js';
import { extractDomain } from '../utils/linkWhitelist.js';

const USAGE =
  'Usage :\n' +
  '!antilien-domaine on|off — active/désactive la protection\n' +
  '!antilien-domaine add <domaine> — autorise un domaine (ex: youtube.com)\n' +
  '!antilien-domaine remove <domaine> — retire un domaine autorisé\n' +
  '!antilien-domaine liste — affiche les domaines autorisés';

export default {
  name: 'antilien-domaine',
  aliases: ['antidomaine', 'linkwhitelist'],
  description:
    "Supprime tout lien dont le domaine n'est PAS dans une liste blanche (en plus de {prefix}antilink, qui bloque tous les liens sans distinction). " +
    'Usage: {prefix}antilien-domaine on|off, {prefix}antilien-domaine add|remove <domaine>, {prefix}antilien-domaine liste.',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();
    const settings = getGroupSettings(ctx.chatId).linkWhitelist;

    if (sub === 'on' || sub === 'off') {
      setLinkWhitelist(ctx.chatId, sub === 'on');
      await ctx.success(sub === 'on' ? '✅ Antilien-domaine activé.' : '❌ Antilien-domaine désactivé.');
      return;
    }

    if (sub === 'add') {
      const raw = ctx.args[1];
      if (!raw) {
        await ctx.error(`Indique un domaine à autoriser.\n\n${USAGE}`);
        return;
      }
      const domain = extractDomain(raw) || raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      addWhitelistedDomain(ctx.chatId, domain);
      await ctx.success(`✅ Domaine autorisé : ${domain}`);
      return;
    }

    if (sub === 'remove' || sub === 'retirer') {
      const raw = ctx.args[1];
      if (!raw) {
        await ctx.error(`Indique un domaine à retirer.\n\n${USAGE}`);
        return;
      }
      const domain = extractDomain(raw) || raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      removeWhitelistedDomain(ctx.chatId, domain);
      await ctx.success(`🗑️ Domaine retiré : ${domain}`);
      return;
    }

    if (sub === 'liste' || sub === 'list') {
      const domains = settings.domains || [];
      await ctx.reply({
        text: domains.length
          ? `📋 Domaines autorisés :\n${domains.map((d) => `• ${d}`).join('\n')}`
          : 'Aucun domaine autorisé pour le moment.',
      });
      return;
    }

    await ctx.reply({
      text: `Antilien-domaine: ${settings.enabled ? 'activé ✅' : 'désactivé ❌'} (${(settings.domains || []).length} domaine(s) autorisé(s))\n\n${USAGE}`,
    });
  },
};
