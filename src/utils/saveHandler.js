import { hasItem, saveTextItem, saveMediaItem } from '../core/savedItems.js';
import {
  getMediaType,
  getMediaObject,
  getTextContent,
  getQuotedInfo,
  downloadQuotedMedia,
} from './quotedContent.js';

/**
 * @param {object} ctx - contexte de commande
 * @param {'save'|'statut'} sourceType - juste pour les messages d'aide/erreur
 */
export async function handleSaveCommand(ctx, sourceType) {
  const label = sourceType === 'statut' ? 'statut' : 'message';
  const name = ctx.args[0];

  if (!name) {
    await ctx.error(`Usage: !${sourceType} <nom>\n(en répondant à un ${label})`);
    return;
  }

  const quotedInfo = getQuotedInfo(ctx.msg);
  if (!quotedInfo) {
    await ctx.error(`❌ Réponds à un ${label} pour l'enregistrer.`);
    return;
  }

  if (hasItem(name)) {
    await ctx.error(`❌ Le nom "${name}" est déjà utilisé. Choisis un autre nom, ou supprime-le d'abord avec !dell ${name}.`);
    return;
  }

  await ctx.processing();

  try {
    const mediaType = getMediaType(quotedInfo.quotedMessage);

    if (mediaType) {
      const buffer = await downloadQuotedMedia(ctx.sock, quotedInfo, ctx.chatId);
      if (!buffer) throw new Error('téléchargement du média impossible');

      const mediaObj = getMediaObject(quotedInfo.quotedMessage, mediaType);
      saveMediaItem(name, {
        mediaType,
        buffer,
        mimetype: mediaObj?.mimetype,
        caption: mediaObj?.caption,
        ptt: Boolean(mediaObj?.ptt),
        savedBy: ctx.sender,
        sourceType,
      });
    } else {
      const text = getTextContent(quotedInfo.quotedMessage);
      if (!text) throw new Error('contenu non pris en charge (ni texte, ni média)');
      saveTextItem(name, { text, savedBy: ctx.sender, sourceType });
    }

    await ctx.success(`✅ Enregistré sous "${name}".`);
  } catch (err) {
    await ctx.error(`❌ Impossible d'enregistrer : ${err.message}`);
  }
}
