import { readFileSync } from 'fs';
import path from 'path';
import { getCurrentTheme } from '../themes/engine.js';
import { config } from '../config/index.js';
import { getCachedMetadata } from '../utils/groupMetadataCache.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { getInactiveMembers } from '../core/activityStore.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
const DEFAULT_MIN_DAYS = 30;

function mentionLabel(jid) {
  return `@${jid.split('@')[0]}`;
}

function parseMinDays(raw) {
  if (!raw) return DEFAULT_MIN_DAYS;
  const match = /^(\d+)d?$/.exec(raw.toLowerCase());
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

export default {
  name: 'inactive',
  description:
    "Liste les membres du groupe sans activité récente. Usage: {prefix}inactive (30 jours par défaut), " +
    '{prefix}inactive <7d|30d|60d|...>. Un membre jamais vu actif depuis que le suivi existe est signalé ' +
    "séparément (donnée insuffisante), jamais classé inactif à tort.",
  category: 'Diagnostic',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error("Cette commande fonctionne uniquement dans un groupe.");
      return;
    }

    const minDays = parseMinDays(ctx.args[0]);
    if (minDays === null) {
      await ctx.error(`Période invalide : "${ctx.args[0]}". Exemple : ${config.prefix}inactive 30d`);
      return;
    }

    try {
      const metadata = await getCachedMetadata(ctx.sock, ctx.chatId);
      const botJid = normalizeJid(ctx.sock.user?.id);
      const currentJids = metadata.participants.map((p) => normalizeJid(p.id)).filter((jid) => jid !== botJid);

      const { inactive, unknown } = getInactiveMembers(ctx.chatId, currentJids, minDays);

      const theme = getCurrentTheme();
      const text = theme.renderInactive({
        minDaysLabel: `${minDays} jour${minDays > 1 ? 's' : ''}`,
        inactive: inactive.map((m) => ({ label: mentionLabel(m.jid), lastActivityLabel: null })),
        unknownCount: unknown.length,
        footer: { version: pkg.version, prefix: config.prefix, developerName: config.developerName },
      });

      const mentions = inactive.map((m) => m.jid);
      await ctx.sock.sendMessage(ctx.chatId, { text, mentions }, { quoted: ctx.msg });
    } catch (err) {
      await ctx.error(`❌ Impossible de déterminer les membres inactifs : ${err.message}`);
    }
  },
};
