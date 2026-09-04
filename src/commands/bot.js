import { isInstanceConfigured, getInstance } from '../core/instance.js';
import { config } from '../config/index.js';
import { toQuoteBlock } from '../utils/helpers.js';

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}min`;
}

export default {
  name: 'bots',
  aliases: ['whoisonline', 'presence'],
  description:
    "Chaque instance du bot présente dans ce chat répond directement avec son propre statut (pas de dashboard, pas de requête réseau — chaque bot répond pour lui-même). Usage: {prefix}bots",
  category: 'Diagnostic',
  adminOnly: false, // doit répondre pour N'IMPORTE QUI, y compris sur les instances d'autres utilisateurs dont l'expéditeur n'est pas admin
  privateOnly: false,
  execute: async (ctx) => {
    const instance = isInstanceConfigured() ? getInstance() : null;
    const uptime = formatUptime(Math.round(process.uptime()));

    const lines = [
      `🟢 *${config.botName}* en ligne`,
      instance?.instanceOwner ? `👤 ${instance.instanceOwner}` : null,
      instance?.instanceId ? `🆔 ${instance.instanceId}` : null,
      `⏱ ${uptime}`,
    ].filter(Boolean);

    await ctx.reply({ text: toQuoteBlock(lines.join('\n')) });
  },
};