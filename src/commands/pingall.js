import { getInstance } from '../core/instance.js';

/**
 * Contrairement à `!invoquer`/summonListener.js (qui relaie via le
 * dashboard pour toucher des copies sur d'autres comptes WhatsApp), cette
 * commande ne passe PAR AUCUN relais : elle répond simplement dans le chat
 * où elle a été tapée. Ça fonctionne parce que chaque copie active de
 * RodrickBOT présente dans ce même groupe/chat reçoit indépendamment le
 * même message entrant et y réagit de son côté — utile pour vérifier d'un
 * coup d'œil, dans un groupe de test où plusieurs copies sont ajoutées,
 * lesquelles sont bien en ligne.
 */
export default {
  name: 'pingall',
  aliases: ['testall', 'enligne'],
  description: "Fait répondre \"🟢 En ligne\" toutes les copies de RodrickBOT présentes dans ce chat.",
  adminOnly: true,
  privateOnly: false,
  category: 'Administration',
  execute: async (ctx) => {
    const { instanceId } = getInstance();
    const label = instanceId ? ` — ${instanceId}` : '';

    await ctx.sock.sendMessage(ctx.chatId, { react: { text: '🟢', key: ctx.msg.key } });
    await ctx.reply({ text: `🟢 En ligne${label}` });
  },
};