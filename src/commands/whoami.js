export default {
  name: 'whoami',
  description: 'Affiche le JID exact de l\'expéditeur (utile pour configurer ADMIN_JIDS).',
  adminOnly: false,   // pas de restriction: c'est justement l'outil pour se configurer soi-même
  privateOnly: false, // doit marcher en groupe ET en privé, car le format de JID diffère selon le contexte
  category: 'Diagnostic',
  execute: async (ctx) => {
    await ctx.reply({
      text: `JID détecté: \`${ctx.sender}\`\n(chat: ${ctx.isGroup ? 'groupe' : 'privé'})`,
    });
  },
};