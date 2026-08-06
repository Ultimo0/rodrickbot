import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { addWarn, getWarns, WARN_LIMIT } from '../core/warnStore.js';

export default {
  name: 'warn',
  description:
    'Avertit un membre (mention, réponse, ou numéro). 3 avertissements = expulsion automatique. Usage: !warn @membre [raison]',
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    const targets = resolveTargetJids(ctx);
    if (!targets.length) {
      await ctx.error('❌ Mentionne un membre, réponds à son message, ou donne son numéro.');
      return;
    }

    const target = normalizeJid(targets[0]);
    const reason = ctx.args.filter((a) => !/\d{5,}/.test(a) && !a.startsWith('@')).join(' ');

    const count = addWarn(ctx.chatId, target);
    const number = target.split('@')[0];

    if (count >= WARN_LIMIT) {
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.chatId, [target], 'remove');
        await ctx.sock.sendMessage(ctx.chatId, {
          text: `🚫 @${number} a atteint ${WARN_LIMIT} avertissements et a été expulsé.`,
          mentions: [target],
        });
      } catch (err) {
        await ctx.error(`⚠️ ${WARN_LIMIT} avertissements atteints mais expulsion impossible : ${err.message}`);
      }
      return;
    }

    await ctx.sock.sendMessage(ctx.chatId, {
      text:
        `⚠️ @${number} averti (${count}/${WARN_LIMIT})` +
        (reason ? `\nRaison: ${reason}` : ''),
      mentions: [target],
    });
  },
};