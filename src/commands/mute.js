import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';
import { isAdmin } from '../config/index.js';
import { isGroupAdmin } from '../utils/groupMetadataCache.js';
import { muteUser } from '../core/muteStore.js';

export default {
  name: 'mute',
  description:
    "Rend muet un ou plusieurs membres (leurs messages seront automatiquement supprimés), sans les expulser du groupe. " +
    'Usage: {prefix}mute en répondant à leur message, en les mentionnant, ou {prefix}mute <numero>',
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
      await ctx.error('Indique qui rendre muet : réponds à son message, mentionne-le, ou donne son numéro (!mute <numero>).');
      return;
    }

    const muted = [];
    for (const jid of targets) {
      if (isAdmin(jid)) continue; // jamais rendre muet un admin du bot
      try {
        if (await isGroupAdmin(ctx.sock, ctx.chatId, jid)) continue; // ni un admin du groupe
      } catch {
        // en cas de doute (métadonnées indisponibles), on autorise le mute plutôt que de bloquer la commande
      }
      muteUser(ctx.chatId, jid);
      muted.push(jid);
    }

    if (!muted.length) {
      await ctx.error('Impossible de rendre muet : cible(s) invalide(s) ou administrateur(s).');
      return;
    }

    const numbers = muted.map((jid) => `@${jid.split('@')[0]}`).join(', ');
    await ctx.sock.sendMessage(ctx.chatId, {
      text: `🔇 ${numbers} rendu(s) muet(s). Ses/leurs messages seront supprimés jusqu'à !unmute.`,
      mentions: muted,
    });
  },
};
