import { config } from '../config/index.js';
import { isLockdownMode, getMessageCount } from '../core/state.js';

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default {
  name: 'status',
  description: "Affiche l'état du bot: uptime, latence, mémoire.",
  category: 'Diagnostic',
  adminOnly: true,
  execute: async (ctx) => {
    const sentAt = Number(ctx.msg.messageTimestamp) * 1000;
    const latency = Date.now() - sentAt;

    const mem = process.memoryUsage();
    const usedMb = (mem.rss / 1024 / 1024).toFixed(1);

    const lines = [
      `*${config.botName} — État*`,
      '',
      `Uptime: ${formatUptime(process.uptime())}`,
      `Latence: ${latency} ms`,
      `Mémoire utilisée: ${usedMb} Mo`,
      `Commandes chargées: ${new Set(ctx.commands.values()).size}`,
      `Messages traités depuis le démarrage: ${getMessageCount()}`,
      `Mode privé strict: ${isLockdownMode() ? 'activé' : 'désactivé'}`,
      `Node.js: ${process.version}`,
    ];

    await ctx.success(lines.join('\n'));
  },
};