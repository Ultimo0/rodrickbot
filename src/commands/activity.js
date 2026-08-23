import { readFileSync } from 'fs';
import path from 'path';
import { getCurrentTheme } from '../themes/engine.js';
import { config } from '../config/index.js';
import { getCachedMetadata } from '../utils/groupMetadataCache.js';
import { extractMentionedJids, extractQuotedParticipant, normalizeJid, numberToJid } from '../utils/groupTarget.js';
import { formatLastActivity, periodLabel } from '../utils/activityFormat.js';
import { startResetConfirmation } from '../core/activityResetSession.js';
import {
  normalizePeriod,
  getGroupSummary,
  getUserSummary,
  getTopUsers,
} from '../core/activityStore.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

function footerData() {
  return { version: pkg.version, prefix: config.prefix, developerName: config.developerName };
}

function mentionLabel(jid) {
  return `@${jid.split('@')[0]}`;
}

/** Résout un utilisateur ciblé pour !activity @user : mention, réponse, ou numéro. Retourne null si aucun. */
function resolveSingleTargetJid(ctx) {
  const mentioned = extractMentionedJids(ctx.msg);
  if (mentioned.length) return normalizeJid(mentioned[0]);

  const quoted = extractQuotedParticipant(ctx.msg);
  if (quoted) return normalizeJid(quoted);

  const numberArg = ctx.args.find((a) => /\d{5,}/.test(a));
  if (numberArg) return normalizeJid(numberToJid(numberArg));

  return null;
}

async function handleReset(ctx) {
  if (!ctx.isAdmin) {
    await ctx.error('Commande réservée aux administrateurs.');
    return;
  }

  startResetConfirmation(ctx.chatId, ctx.sender, () => {
    // Expiration silencieuse : pas de message de relance, cohérent avec
    // le comportement des autres confirmations du bot (poll, remind).
  });

  await ctx.reply({
    text:
      '⚠️ Cette action va supprimer TOUTES les statistiques d\'activité de ce groupe ' +
      '(compteurs de messages, classement, dernière activité). Rien d\'autre ne sera touché.\n\n' +
      'Réponds *oui* pour confirmer, ou *non* pour annuler (60s).',
  });
}

async function handleTop(ctx, theme) {
  const rawPeriod = ctx.args[1];
  // Sans période précisée : classement "total" (tout l'historique conservé),
  // pas limité à une fenêtre — c'est le classement général attendu par
  // "Top 10 des membres les plus actifs" sans qualificatif dans la demande.
  const period = rawPeriod ? normalizePeriod(rawPeriod) : 'total';

  if (rawPeriod && !period) {
    await ctx.error(`Période inconnue : "${rawPeriod}". Utilise today, week, month, 7d, 30d, ou aucun argument.`);
    return;
  }

  const top = getTopUsers(ctx.chatId, period, 10);
  const mentions = top.map((u) => u.jid);

  const text = theme.renderActivityGroup({
    mode: 'top',
    memberCount: 0,
    today: 0,
    week: 0,
    month: 0,
    periodLabel: period === 'total' ? 'Historique complet' : periodLabel(period),
    periodCount: 0,
    top: top.map((u) => ({ label: mentionLabel(u.jid), count: u.count })),
    lastActivityLabel: null,
    footer: footerData(),
  });

  await ctx.sock.sendMessage(ctx.chatId, { text, mentions }, { quoted: ctx.msg });
}

async function handleUserStats(ctx, theme, targetJid) {
  const stats = getUserSummary(ctx.chatId, targetJid);

  const text = theme.renderActivityUser({
    userLabel: mentionLabel(targetJid),
    total: stats.total,
    today: stats.today,
    week: stats.week,
    month: stats.month,
    lastActivityLabel: formatLastActivity(stats.lastActivity),
    footer: footerData(),
  });

  await ctx.sock.sendMessage(ctx.chatId, { text, mentions: [targetJid] }, { quoted: ctx.msg });
}

async function handlePeriodSummary(ctx, theme, period) {
  const summary = getGroupSummary(ctx.chatId);
  const periodCount = { today: summary.today, week: summary.week, month: summary.month }[period];
  const count = periodCount !== undefined ? periodCount : null;

  // Pour une période non pré-agrégée (Nd), on recalcule proprement via le
  // classement (somme des scores individuels) plutôt que d'exposer une
  // nouvelle fonction dans le store pour un seul cas d'usage.
  const top = getTopUsers(ctx.chatId, period, 3);
  const resolvedCount = count !== null ? count : top.reduce((acc, u) => acc + u.count, 0);

  const text = theme.renderActivityGroup({
    mode: 'period',
    memberCount: 0,
    today: 0,
    week: 0,
    month: 0,
    periodLabel: periodLabel(period),
    periodCount: resolvedCount,
    top: top.map((u) => ({ label: mentionLabel(u.jid), count: u.count })),
    lastActivityLabel: formatLastActivity(summary.lastActivity),
    footer: footerData(),
  });

  const mentions = top.map((u) => u.jid);
  await ctx.sock.sendMessage(ctx.chatId, { text, mentions }, { quoted: ctx.msg });
}

async function handleSummary(ctx, theme) {
  const summary = getGroupSummary(ctx.chatId);
  const metadata = await getCachedMetadata(ctx.sock, ctx.chatId).catch(() => null);
  const memberCount = metadata?.participants?.length ?? '?';

  // Top 3 sur "cette semaine" pour le résumé par défaut : une fenêtre plus
  // représentative de l'activité récente qu'"aujourd'hui" (trop étroit,
  // souvent vide en début de journée) sans remonter à tout l'historique.
  const top = getTopUsers(ctx.chatId, 'week', 3);

  const text = theme.renderActivityGroup({
    mode: 'summary',
    memberCount,
    today: summary.today,
    week: summary.week,
    month: summary.month,
    periodLabel: null,
    periodCount: null,
    top: top.map((u) => ({ label: mentionLabel(u.jid), count: u.count })),
    lastActivityLabel: formatLastActivity(summary.lastActivity),
    footer: footerData(),
  });

  const mentions = top.map((u) => u.jid);
  await ctx.sock.sendMessage(ctx.chatId, { text, mentions }, { quoted: ctx.msg });
}

export default {
  name: 'activity',
  description:
    "Statistiques d'activité du groupe : {prefix}activity (résumé), {prefix}activity <today|week|month|7d|30d>, " +
    "{prefix}activity top [période], {prefix}activity @membre, {prefix}activity reset (admin). " +
    'Comptage basé sur les messages traités par le bot, aucun contenu de message conservé.',
  category: 'Diagnostic',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error("Cette commande fonctionne uniquement dans un groupe.");
      return;
    }

    const theme = getCurrentTheme();
    const first = ctx.args[0]?.toLowerCase();

    try {
      if (!first) {
        await handleSummary(ctx, theme);
        return;
      }

      if (first === 'reset') {
        await handleReset(ctx);
        return;
      }

      if (first === 'top') {
        await handleTop(ctx, theme);
        return;
      }

      const period = normalizePeriod(first);
      if (period) {
        await handlePeriodSummary(ctx, theme, period);
        return;
      }

      const targetJid = resolveSingleTargetJid(ctx);
      if (targetJid) {
        await handleUserStats(ctx, theme, targetJid);
        return;
      }

      await ctx.error(
        `Argument non reconnu : "${ctx.args[0]}". Utilise ${config.prefix}activity, ` +
        `${config.prefix}activity <today|week|month|7d|30d>, ${config.prefix}activity top, ` +
        `${config.prefix}activity @membre, ou ${config.prefix}activity reset (admin).`
      );
    } catch (err) {
      await ctx.error(`❌ Impossible d'afficher les statistiques d'activité : ${err.message}`);
    }
  },
};
