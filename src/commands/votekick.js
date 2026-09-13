import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { isAdmin, config } from '../config/index.js';
import { isGroupAdmin } from '../utils/groupMetadataCache.js';
import { getActiveVote, startVote, addVote, clearVote } from '../core/voteKickStore.js';

const THRESHOLD = config.voteKickThreshold || 3;
const TIMEOUT_MS = (config.voteKickTimeoutSeconds || 120) * 1000;

const VOTE_KEYWORDS = new Set(['oui', 'yes', '+1', 'vote']);

export default {
  name: 'vote-kick',
  aliases: ['votekick', 'voteexpulser'],
  description:
    `Lance un vote pour expulser un membre du groupe (${THRESHOLD} voix nécessaires, ${config.voteKickTimeoutSeconds || 120}s pour voter). ` +
    'Usage: {prefix}votekick en répondant à son message ou en le mentionnant pour démarrer, puis {prefix}votekick oui pour voter.',
  category: 'Modération',
  adminOnly: false,
  privateOnly: false,
  cooldownMs: 15000,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    // Cas 1 : voter "oui" sur un vote déjà en cours.
    if (sub && VOTE_KEYWORDS.has(sub)) {
      const active = getActiveVote(ctx.chatId);
      if (!active) {
        await ctx.error("Aucun vote d'expulsion en cours. Lance-en un avec !votekick <mention/réponse>.");
        return;
      }

      if (normalizeJid(ctx.sender) === active.targetJid) {
        await ctx.error('Tu ne peux pas voter dans ton propre vote d\'expulsion.');
        return;
      }

      const count = addVote(ctx.chatId, normalizeJid(ctx.sender));

      if (count >= active.threshold) {
        clearVote(ctx.chatId);
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chatId, [active.targetJid], 'remove');
          await ctx.sock.sendMessage(ctx.chatId, {
            text: `🚫 @${active.targetJid.split('@')[0]} a été expulsé (vote atteint : ${count}/${active.threshold}).`,
            mentions: [active.targetJid],
          });
        } catch (err) {
          await ctx.error(`Vote atteint, mais expulsion impossible : ${err.message}`);
        }
      } else {
        await ctx.success(`🗳️ Voix comptabilisée (${count}/${active.threshold}).`);
      }
      return;
    }

    // Cas 2 : démarrer un nouveau vote.
    if (getActiveVote(ctx.chatId)) {
      await ctx.error('Un vote est déjà en cours dans ce groupe. Utilise !votekick oui pour voter.');
      return;
    }

    const targets = resolveTargetJids(ctx).map(normalizeJid);
    if (!targets.length) {
      await ctx.error("Indique qui expulser : réponds à son message, mentionne-le, ou donne son numéro (!votekick <numero>).");
      return;
    }

    const targetJid = targets[0];

    if (normalizeJid(ctx.sender) === targetJid) {
      await ctx.error('Tu ne peux pas lancer un vote contre toi-même.');
      return;
    }

    if (isAdmin(targetJid)) {
      await ctx.error("Impossible de lancer un vote d'expulsion contre un administrateur du bot.");
      return;
    }

    try {
      if (await isGroupAdmin(ctx.sock, ctx.chatId, targetJid)) {
        await ctx.error("Impossible de lancer un vote d'expulsion contre un administrateur du groupe.");
        return;
      }
    } catch {
      // métadonnées indisponibles : on laisse le vote démarrer plutôt que de bloquer la commande
    }

    startVote(ctx.chatId, {
      targetJid,
      startedBy: normalizeJid(ctx.sender),
      threshold: THRESHOLD,
      timeoutMs: TIMEOUT_MS,
      onTimeout: async () => {
        try {
          await ctx.sock.sendMessage(ctx.chatId, { text: "> ⌛ Vote d'expulsion expiré, annulé." });
        } catch {
          // le chat n'existe peut-être plus, on ignore
        }
      },
    });

    await ctx.sock.sendMessage(ctx.chatId, {
      text:
        `🗳️ Vote d'expulsion lancé contre @${targetJid.split('@')[0]} (${THRESHOLD} voix nécessaires).\n` +
        `Tape !votekick oui pour voter. Délai : ${Math.round(TIMEOUT_MS / 1000)}s.`,
      mentions: [targetJid],
    });
  },
};
