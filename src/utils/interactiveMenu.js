import { proto, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { logger } from './logger.js';

/**
 * interactiveMenu.js — EXPÉRIMENTAL
 * ==================================
 * Envoie un `listMessage` WhatsApp natif (le vrai menu à onglets/lignes
 * cliquables), avec le nœud binaire additionnel que WhatsApp attend pour
 * le faire réellement apparaître comme une liste plutôt que du texte.
 *
 * Contexte technique (pourquoi ce fichier existe et pourquoi il est isolé) :
 * -----------------------------------------------------------------------
 * - `QuizRenderer.js` documente déjà un essai précédent : envoyer un
 *   `listMessage` via Baileys "brut" (juste `sections`/`rows` dans le
 *   payload `sendMessage`) s'affiche en texte plat, sans ligne cliquable,
 *   sur un compte WhatsApp personnel (non-Business). Ce n'est pas un bug
 *   Baileys : Baileys stock n'attache PAS le nœud XML `<biz><list .../></biz>`
 *   que le serveur WhatsApp utilise pour décider d'afficher la liste comme
 *   un composant natif plutôt que du texte de repli. Sans ce nœud, le
 *   serveur ne sait pas que ce message doit être rendu comme une liste.
 * - Ce module construit donc le `listMessage` à la main (proto Baileys)
 *   ET l'envoie via `sock.relayMessage(..., { additionalNodes })` en
 *   attachant explicitement ce nœud, plutôt que `sock.sendMessage()` qui
 *   ne l'ajoute pas pour ce type de contenu.
 * - Sciemment PAS de dépendance à un paquet npm tiers non audité
 *   (il en existe plusieurs, très peu maintenus/vérifiés) : le nœud à
 *   injecter est simple et documenté, autant le garder dans le code du
 *   bot plutôt que d'ajouter une dépendance externe à faible confiance
 *   qui tourne avec accès à un compte WhatsApp réel et à des clés API.
 *
 * Limites connues, à lire avant d'activer EXPERIMENTAL_INTERACTIVE_MENU :
 * -----------------------------------------------------------------------
 * - Reverse-engineered, non documenté officiellement par WhatsApp/Meta ni
 *   par Baileys : peut casser silencieusement à la prochaine mise à jour
 *   du protocole WhatsApp, sans erreur côté bot (le send() réussit, mais
 *   le rendu côté destinataire peut redevenir du texte plat).
 * - `sendInteractiveListMenu()` ne peut confirmer QUE l'envoi technique a
 *   réussi, jamais que WhatsApp a effectivement rendu une liste cliquable
 *   chez le destinataire — ça, seul un test réel sur le téléphone le dit.
 * - Teste d'abord sur un numéro secondaire/de test, pas sur le compte
 *   principal de production, avant de considérer ce flag fiable.
 *
 * Ce que fait la commande appelante en cas d'échec technique (throw) :
 * repli automatique sur le menu texte classique — voir commands/help.js.
 */

const MAX_ROW_TITLE_LENGTH = 24; // limite pratique WhatsApp pour ne pas tronquer moche
const MAX_ROW_DESCRIPTION_LENGTH = 72;

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Construit le contenu proto `listMessage` à partir de sections déjà
 * préparées par l'appelant (voir buildCategorySections/buildCommandSections
 * dans commands/help.js).
 *
 * @param {object} params
 * @param {string} params.title - Titre affiché en tête de la liste
 * @param {string} params.description - Corps du message au-dessus du bouton
 * @param {string} params.buttonText - Libellé du bouton qui ouvre la liste
 * @param {string} [params.footerText] - Pied de message
 * @param {Array<{title: string, rows: Array<{title: string, description?: string, rowId: string}>}>} params.sections
 * @param {object} [params.contextInfo] - Injecté tel quel dans listMessage.contextInfo
 *   (ex: badge "Voir la chaîne", voir utils/channelCard.js::getChannelForwardContext)
 */
function buildListMessageContent({ title, description, buttonText, footerText, sections, contextInfo }) {
  const protoSections = sections.map((section) => ({
    title: truncate(section.title, MAX_ROW_TITLE_LENGTH),
    rows: section.rows.map((row) => ({
      title: truncate(row.title, MAX_ROW_TITLE_LENGTH),
      description: row.description ? truncate(row.description, MAX_ROW_DESCRIPTION_LENGTH) : undefined,
      rowId: row.rowId,
    })),
  }));

  return {
    listMessage: {
      title,
      description,
      buttonText,
      footerText,
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: protoSections,
      contextInfo,
    },
  };
}

/**
 * Nœud binaire additionnel requis pour que WhatsApp rende un vrai
 * `listMessage` cliquable plutôt que du texte de repli.
 * Structure : <biz><list type="product_list" v="2"/></biz>
 */
function listBinaryNode() {
  return [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'list',
          attrs: { type: 'product_list', v: '2' },
        },
      ],
    },
  ];
}

/**
 * Envoie le menu comme vraie liste WhatsApp cliquable.
 * Lève une erreur si l'envoi technique échoue (à catcher par l'appelant
 * pour repli sur le menu texte — voir commands/help.js). Ne garantit PAS
 * le rendu visuel côté destinataire, voir limites en tête de fichier.
 *
 * @param {object} ctx - Le ctx habituel des commandes (ctx.sock, ctx.chatId, ctx.msg)
 * @param {object} params - Voir buildListMessageContent (inclut `contextInfo` optionnel)
 */
export async function sendInteractiveListMenu(ctx, params) {
  const content = buildListMessageContent(params);

  const fullMsg = generateWAMessageFromContent(ctx.chatId, content, {
    userJid: ctx.sock.user?.id,
  });

  await ctx.sock.relayMessage(ctx.chatId, fullMsg.message, {
    messageId: fullMsg.key.id,
    additionalNodes: listBinaryNode(),
  });

  logger.info(
    { chatId: ctx.chatId, rows: params.sections.reduce((n, s) => n + s.rows.length, 0) },
    '[interactiveMenu] Liste cliquable expérimentale envoyée (rendu réel non vérifiable côté serveur)'
  );

  return fullMsg;
}
