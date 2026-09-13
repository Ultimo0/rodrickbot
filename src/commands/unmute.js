import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { unmuteUser } from '../core/muteStore.js';

export default {
  name: 'unmute',
  description:
    "Retire le mute d'un ou plusieurs membres (voir {prefix}mute). " +
    'Usage: {prefix}unmute en répondant à leur message, en les mentionnant, ou {prefix}unmute <numero>',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const targets = resolveTargetJids(ctx).map(normalizeJid);
    if (!targets.length) {
      await ctx.error("Indique qui démuter : réponds à son message, mentionne-le, ou donne son numéro (!unmute <numero>).");
      return;
    }

    const unmuted = targets.filter((jid) => unmuteUser(ctx.chatId, jid));

    if (!unmuted.length) {
      await ctx.error("Aucune de ces personnes n'était muette.");
      return;
    }

    const numbers = unmuted.map((jid) => `@${jid.split('@')[0]}`).join(', ');
    await ctx.sock.sendMessage(ctx.chatId, {
      text: `🔊 ${numbers} peut/peuvent de nouveau parler.`,
      mentions: unmuted,
    });
  },
};
