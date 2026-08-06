/**
 * Utilitaire pour résoudre la source de texte pour les outils de traitement de texte.
 * Ordre de priorité :
 * 1. Texte direct (`ctx.text`)
 * 2. Arguments de la commande (`ctx.args`)
 * 3. Message cité (reply)
 * 4. Texte contenu dans le message actuel
 * 5. Dernier texte enregistré dans la mémoire de session
 */

import { getTextContent, getQuotedInfo } from '../../utils/quotedContent.js';
import { logger } from '../../utils/logger.js';
import { getSession } from '../sessionMemory.js';

/**
 * Résout la source de texte selon l'ordre de priorité à partir du contexte.
 * @param {object} ctx - Le contexte de la commande ou de l'outil, contenant potentiellement msg, text, args, chatId, sender.
 * @returns {string|null} - Texte résolu ou null si aucun texte trouvé.
 */
export function resolveTextSource(ctx) {
  const { msg, text, args, chatId, sender } = ctx;

  // 1. Texte direct
  if (text?.trim()) {
    return text;
  }

  // 2. Arguments de la commande
  if (args && Array.isArray(args) && args.length > 0) {
    const argsText = args.join(' ').trim();
    if (argsText) {
      return argsText;
    }
  }

  // Si pas de message, on ne peut pas aller plus loin avec la citation/message actuel
  if (!msg || !msg.message) {
    // On tente la mémoire de session comme dernier recours
    const session = getSession(chatId, sender);
    if (session && session.messages.length > 0) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const message = session.messages[i];
        if (message.role === 'user' && message.text && message.text.trim()) {
          return message.text;
        }
      }
    }
    return null;
  }


  // 3. Message cité (reply)
  const quotedInfo = getQuotedInfo(msg);
  if (quotedInfo) {
    const quotedText = getTextContent(quotedInfo.quotedMessage);
    if (quotedText?.trim()) {
      return quotedText;
    }
  }

  // 4. Texte contenu dans le message actuel
  try {
    const currentText = getTextContent(msg.message);
    if (currentText?.trim()) {
      return currentText;
    }
  } catch (err) {
    logger.warn({ err }, 'Impossible d\'extraire le texte du message actuel');
  }


  // 5. Dernier texte enregistré dans la mémoire de session
  const session = getSession(chatId, sender);
  if (session && session.messages.length > 0) {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const message = session.messages[i];
      if (message.role === 'user' && message.text && message.text.trim()) {
        return message.text;
      }
    }
  }

  return null;
}
