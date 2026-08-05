import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getMediaType, getTextContent, getQuotedInfo, downloadQuotedMedia } from './quotedContent.js';
import { classifyDocument, extractDocumentText } from './documentText.js';
import { logger } from './logger.js';

const UNSUPPORTED_DOC_MESSAGE =
  'Format de document non supporté. Formats acceptés : .txt, .md, .csv, .json, .pdf, .docx.';

async function readDirectDocument(ctx, doc) {
  const type = classifyDocument(doc);
  if (!type) return { errorMessage: UNSUPPORTED_DOC_MESSAGE };

  try {
    const buffer = await downloadMediaMessage(
      { key: ctx.msg.key, message: { documentMessage: doc } },
      'buffer',
      {},
      { logger, reuploadRequest: ctx.sock.updateMediaMessage }
    );
    return { text: await extractDocumentText(buffer, type) };
  } catch (err) {
    return { errorMessage: `Impossible de lire le document : ${err.message}` };
  }
}

/**
 * Récupère le texte sur lequel une commande doit travailler, dans cet
 * ordre de priorité (mutualisé entre !resume, !corriger, et toute future
 * commande de traitement de texte) :
 *   1) argsText (déjà extrait par l'appelant, ex: ctx.args.join(' '))
 *   2) un document envoyé directement en légende de la commande
 *   3) le message cité — texte simple, ou document (.txt/.md/.csv/.json/.pdf/.docx)
 *
 * @param {object} ctx
 * @param {string} argsText
 * @param {string} usageMessage message d'erreur si rien n'est trouvé nulle part
 * @returns {Promise<{text: string} | {errorMessage: string}>}
 */
export async function resolveInputText(ctx, argsText, usageMessage) {
  if (argsText?.trim()) return { text: argsText.trim() };

  const directDoc =
    ctx.msg.message.documentWithCaptionMessage?.message?.documentMessage || ctx.msg.message.documentMessage;
  if (directDoc) return readDirectDocument(ctx, directDoc);

  const quoted = getQuotedInfo(ctx.msg);
  if (!quoted) return { errorMessage: usageMessage };

  const quotedType = getMediaType(quoted.quotedMessage);

  if (quotedType === 'document') {
    const doc =
      quoted.quotedMessage.documentWithCaptionMessage?.message?.documentMessage ||
      quoted.quotedMessage.documentMessage;

    const docType = classifyDocument(doc);
    if (!docType) return { errorMessage: UNSUPPORTED_DOC_MESSAGE };

    const buffer = await downloadQuotedMedia(ctx.sock, quoted, ctx.chatId);
    if (!buffer) return { errorMessage: 'Téléchargement du document impossible.' };

    try {
      return { text: await extractDocumentText(buffer, docType) };
    } catch (err) {
      return { errorMessage: `Impossible de lire le document : ${err.message}` };
    }
  }

  const text = getTextContent(quoted.quotedMessage) || '';
  if (!text.trim()) return { errorMessage: 'Le message cité ne contient pas de texte exploitable.' };

  return { text: text.trim() };
}