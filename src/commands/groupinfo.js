export default {
  name: 'groupinfo',
  aliases: ['ginfo'],
  description: 'Affiche les informations et statistiques du groupe.',
  category: 'Gestion de groupe',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    try {
      const metadata = await ctx.sock.groupMetadata(ctx.chatId);
      const admins = metadata.participants.filter(
        (p) => p.admin === 'admin' || p.admin === 'superadmin'
      );
      const createdAt = metadata.creation
        ? new Date(metadata.creation * 1000).toLocaleDateString('fr-FR')
        : 'Inconnue';

      const lines = [
        `╭─「 *${metadata.subject}* 」`,
        '│',
        `│ 👥 Membres: ${metadata.participants.length}`,
        `│ 👑 Admins: ${admins.length}`,
        `│ 📅 Créé le: ${createdAt}`,
        `│ 🔒 Verrouillé: ${metadata.announce ? 'oui' : 'non'}`,
      ];
      if (metadata.desc) {
        lines.push('│', `│ 📝 Description: ${metadata.desc}`);
      }
      lines.push('╰─');

      await ctx.reply({ text: lines.join('\n') });
    } catch (err) {
      await ctx.error(`❌ Impossible de récupérer les infos du groupe : ${err.message}`);
    }
  },
};