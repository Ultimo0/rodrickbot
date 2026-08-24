// src/commands/stats.js
import { config } from '../config/index.js';
import { getCurrentTheme } from '../themes/engine.js';
import { getMessageCount, getCommandStats, isLockdownMode } from '../core/state.js';
import { isInstanceConfigured, getInstance } from '../core/instance.js';
import { formatUptime } from '../utils/helpers.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

function footerData() {
  return { version: pkg.version, prefix: config.prefix, developerName: config.developerName };
}

export default {
  name: 'stats',
  description:
    'Affiche les statistiques d\'utilisation du bot : messages traités, commandes populaires, uptime. ' +
    'Usage : {prefix}stats',
  category: 'Diagnostic',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const theme = getCurrentTheme();

    // Données
    const commandStats = getCommandStats();
    const totalMessages = getMessageCount();
    const totalCommands = Object.values(commandStats).reduce((a, b) => a + b, 0);
    const uniqueCommands = Object.keys(commandStats).length;

    // Top 5 commandes
    const sorted = Object.entries(commandStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const instance = isInstanceConfigured() ? getInstance() : null;

    const data = {
      uptime: formatUptime(process.uptime()),
      messages: totalMessages,
      totalCommands,
      uniqueCommands,
      topCommands: sorted,
      mode: isLockdownMode() ? 'Privé' : 'Public',
      instanceId: instance?.instanceId || 'Non configurée',
      instanceOwner: instance?.instanceOwner || 'Non configuré',
      footer: footerData(),
    };

    const text = theme.renderStats(data);
    await ctx.sock.sendMessage(ctx.chatId, { text }, { quoted: ctx.msg });
  },
};