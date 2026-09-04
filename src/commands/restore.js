import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { restoreGroupSettings } from '../core/groupSettings.js';
import { getQuotedInfo, getMediaType } from '../utils/quotedContent.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'restore',
  aliases: ['importsettings'],
  description:
    "Réimporte les réglages d'un groupe depuis une sauvegarde JSON générée par {prefix}backup. " +
    "Réponds avec {prefix}restore au fichier envoyé dans CE groupe. Usage: {prefix}restore",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const quoted = getQuotedInfo(ctx.msg);
    if (!quoted || getMediaType(quoted.quotedMessage) !== 'document') {
      await ctx.error(
        "Réponds avec !restore directement au fichier de sauvegarde JSON (généré par !backup)."
      );
      return;
    }

    const doc = quoted.quotedMessage.documentMessage;

    let buffer;
    try {
      buffer = await downloadMediaMessage(
        { key: { ...ctx.msg.key, id: quoted.stanzaId, participant: quoted.participant }, message: { documentMessage: doc } },
        'buffer',
        {},
        { logger, reuploadRequest: ctx.sock.updateMediaMessage }
      );
    } catch (err) {
      await ctx.error(`Téléchargement du fichier impossible : ${err.message}`);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(buffer.toString('utf-8'));
    } catch {
      await ctx.error("Ce fichier n'est pas un JSON valide.");
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      await ctx.error("Contenu du fichier inattendu — ce n'est pas une sauvegarde RodrickBOT.");
      return;
    }

    // restoreGroupSettings() ne copie que les clés reconnues (voir
    // core/groupSettings.js) — un JSON sans rapport ne casse rien, il ne
    // change simplement aucun réglage.
    restoreGroupSettings(ctx.chatId, parsed);

    await ctx.success(
      "✅ Réglages restaurés pour ce groupe. Si Guardian était activé dans la sauvegarde, relance !guardian on ici pour qu'il capture un instantané frais de CE groupe."
    );
  },
};
