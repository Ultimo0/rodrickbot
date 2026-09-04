import { getGroupSettings } from '../core/groupSettings.js';

function sanitizeFileName(name) {
  return (name || 'groupe').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
}

export default {
  name: 'backup',
  aliases: ['exportsettings'],
  description:
    "Exporte tous les réglages de ce groupe (antilink, antispam, antipromote, antistatut, antiflood, " +
    "guardian, welcome, bye) dans un fichier JSON, envoyé en privé. Réimportable avec {prefix}restore. " +
    "Usage: {prefix}backup",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const settings = getGroupSettings(ctx.chatId);
    // guardian.snapshot n'a de sens que pour CE groupe précis (photo,
    // description, etc.) — le restaurer ailleurs ne ferait que semer la
    // confusion. La restauration réactivera guardian normalement, il lui
    // suffira de se recapturer un instantané frais au prochain !guardian on.
    const exportable = { ...settings, guardian: { enabled: settings.guardian.enabled, snapshot: null } };

    let metadata;
    try {
      metadata = await ctx.sock.groupMetadata(ctx.chatId);
    } catch {
      metadata = null;
    }
    const groupName = metadata?.subject || 'groupe';

    const buffer = Buffer.from(JSON.stringify(exportable, null, 2), 'utf-8');

    try {
      await ctx.sock.sendMessage(ctx.sender, {
        document: buffer,
        mimetype: 'application/json',
        fileName: `rodrickbot-backup-${sanitizeFileName(groupName)}.json`,
        caption:
          `💾 Sauvegarde des réglages de *${groupName}*.\n\n` +
          `Pour restaurer : renvoie ce fichier dans le groupe cible, puis réponds-y avec !restore.`,
      });
      await ctx.success('✅ Sauvegarde envoyée en privé.');
    } catch (err) {
      await ctx.error(`Impossible d'envoyer la sauvegarde en privé (${err.message}) — écris d'abord au bot en privé, puis réessaie.`);
    }
  },
};
