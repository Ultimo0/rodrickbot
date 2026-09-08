import { readFileSync } from 'fs';
import path from 'path';
import {
  getMediaType,
  getMediaObject,
  getTextContent,
  getQuotedInfo,
  downloadQuotedMedia,
} from '../utils/quotedContent.js';
import { getItem } from '../core/savedItems.js';
import { getContactJids } from '../core/contactsStore.js';
import { normalizeJid } from '../utils/groupTarget.js';

// Couleur de fond par défaut pour un statut texte : WhatsApp l'exige pour
// bien afficher un statut de type texte (sans ça, rendu blanc/invisible
// selon les versions du client).
const DEFAULT_STATUS_BACKGROUND = '#25D366';

export default {
  name: 'repost',
  aliases: ['republier'],
  description:
    'Republie un statut WhatsApp, avec une nouvelle description si tu en donnes une. ' +
    'Deux usages : en répondant directement à un statut ({prefix}repost [nouvelle description]), ' +
    'ou depuis un élément déjà sauvegardé via {prefix}statut ({prefix}repost <nom> [nouvelle description]).',
  category: 'Sauvegardes',
  adminOnly: true,
  privateOnly: false,
  cooldownMs: 15000, // publication réelle sur le compte à chaque usage — pas fait pour être spammé
  execute: async (ctx) => {
    const quotedInfo = getQuotedInfo(ctx.msg);

    let mediaType = null;
    let buffer = null;
    let mimetype = null;
    let originalCaption = '';
    let textContent = null;
    let newDescription;

    if (quotedInfo) {
      mediaType = getMediaType(quotedInfo.quotedMessage);

      if (mediaType && mediaType !== 'sticker' && mediaType !== 'document') {
        await ctx.processing();
        buffer = await downloadQuotedMedia(ctx.sock, quotedInfo, ctx.chatId);
        if (!buffer) {
          await ctx.error("❌ Impossible de télécharger le média de ce statut.");
          return;
        }
        const mediaObj = getMediaObject(quotedInfo.quotedMessage, mediaType);
        mimetype = mediaObj?.mimetype;
        originalCaption = mediaObj?.caption || '';
      } else if (!mediaType) {
        textContent = getTextContent(quotedInfo.quotedMessage);
      }

      newDescription = ctx.args.join(' ') || null;
    } else {
      // Pas de citation : on cherche un élément déjà sauvegardé par nom
      // (même magasin que {prefix}statut / {prefix}save).
      const name = ctx.args[0];
      const item = name ? getItem(name) : null;

      if (!item) {
        await ctx.error(
          "❌ Réponds à un statut pour le republier, ou donne le nom d'un élément déjà sauvegardé avec {prefix}statut."
        );
        return;
      }

      if (item.type === 'text') {
        textContent = item.text;
      } else if (item.type === 'sticker' || item.type === 'document') {
        await ctx.error('❌ Un sticker ou un document ne peut pas être republié en statut.');
        return;
      } else {
        mediaType = item.type;
        mimetype = item.mimetype;
        originalCaption = item.caption || '';
        try {
          buffer = readFileSync(path.join(process.cwd(), item.mediaPath));
        } catch {
          await ctx.error('❌ Le fichier média de cet élément sauvegardé est introuvable (supprimé du disque ?).');
          return;
        }
      }

      newDescription = ctx.args.slice(1).join(' ') || null;
      await ctx.processing();
    }

    if (!mediaType && !textContent) {
      await ctx.error("❌ Contenu non pris en charge pour republier en statut (ni texte, ni média compatible).");
      return;
    }

    const caption = newDescription ?? (originalCaption || textContent || '');

    // `statusJidList` est OBLIGATOIRE pour que WhatsApp chiffre réellement
    // le statut pour quelqu'un : sans elle, `sendMessage` réussit sans
    // erreur mais le statut n'apparaît nulle part (voir core/contactsStore.js
    // pour le détail). La liste vient des évènements `contacts.upsert` reçus
    // depuis la connexion — voir core/client.js.
    //
    // IMPORTANT : dans le code de Baileys (relayMessage), la branche statut
    // construit la liste des appareils UNIQUEMENT à partir de statusJidList
    // — contrairement à un message direct, il n'ajoute PAS automatiquement
    // le compte de l'expéditeur. Concrètement : si ton propre JID n'est pas
    // dans statusJidList, ton statut est chiffré pour tes contacts mais
    // JAMAIS pour ton propre téléphone → il "part" bien, mais toi-même tu
    // ne le vois pas dans ton onglet Statuts. D'où l'ajout explicite ici.
    const ownJid = normalizeJid(ctx.sock.user?.id);
    const statusJidList = [...new Set([ownJid, ...getContactJids()].filter(Boolean))];
    if (statusJidList.length === 0) {
      await ctx.error(
        '❌ Aucun contact connu pour le moment (le bot vient peut-être de redémarrer) : ' +
          'un statut envoyé maintenant ne serait visible par personne. Réessaie dans quelques instants.'
      );
      return;
    }
    const statusOptions = { statusJidList };

    try {
      if (mediaType === 'image') {
        await ctx.sock.sendMessage('status@broadcast', { image: buffer, mimetype, caption }, statusOptions);
      } else if (mediaType === 'video') {
        await ctx.sock.sendMessage('status@broadcast', { video: buffer, mimetype, caption }, statusOptions);
      } else if (mediaType === 'audio') {
        await ctx.sock.sendMessage('status@broadcast', { audio: buffer, mimetype, ptt: false }, statusOptions);
      } else {
        await ctx.sock.sendMessage(
          'status@broadcast',
          {
            text: caption || textContent,
            backgroundColor: DEFAULT_STATUS_BACKGROUND,
            font: 0,
          },
          statusOptions
        );
      }

      const contactsCount = statusJidList.length - (ownJid ? 1 : 0);
      await ctx.success(`✅ Statut republié (visible par toi et ${contactsCount} contact(s)).`);
    } catch (err) {
      await ctx.error(`❌ Impossible de republier ce statut : ${err.message}`);
    }
  },
};
