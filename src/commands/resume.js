import { summarizeText } from '../utils/groq.js';
import { logger } from '../utils/logger.js';
import { resolveInputText } from '../utils/textInput.js';

const MAX_CHARS = 20000; // limite raisonnable pour rester dans la fenêtre de contexte du modèle
const MIN_CHARS = 20; // en dessous, il n'y a rien de sensé à résumer

// Alias de taille acceptés, indexés sans accents pour rester tolérant
// à la façon dont l'utilisateur tape "détaillé"/"detaille"/"détaillee".
const SIZE_ALIASES = {
  court: 'court',
  c: 'court',
  short: 'court',
  moyen: 'moyen',
  m: 'moyen',
  medium: 'moyen',
  detaille: 'détaillé',
  detaillee: 'détaillé',
  d: 'détaillé',
  long: 'détaillé',
  detailed: 'détaillé',
};

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeSize(word) {
  if (!word) return null;
  return SIZE_ALIASES[stripAccents(word.toLowerCase())] || null;
}

/**
 * Télécharge et extrait le texte d'un document (buffer -> texte), quel
 * que soit son type parmi ceux supportés par classifyDocument().
 * @returns {Promise<{text: string} | {error: string}>}
 */
async function downloadDirectDocumentText(ctx, doc) {
  const type = classifyDocument(doc);
  if (!type) return { error: 'unsupported' };

  try {
    const buffer = await downloadMediaMessage(
      { key: ctx.msg.key, message: { documentMessage: doc } },
      'buffer',
      {},
      { logger, reuploadRequest: ctx.sock.updateMediaMessage }
    );
    const text = await extractDocumentText(buffer, type);
    return { text };
  } catch (err) {
    return { error: err.message };
  }
}

export default {
  name: 'resume',
  aliases: ['summary', 'resumer'],
  description:
    'Résume un texte, un long message cité ou un document (.txt/.md/.csv/.json/.pdf/.docx). Usage: {prefix}resume [court|moyen|détaillé] <texte>, ou réponds à un message/document avec {prefix}resume [taille].',
  category: 'Intelligence Artificielle',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    // 1. Déterminer la taille du résumé et le texte passé en argument.
    let size = 'moyen';
    let args = ctx.args;
    const maybeSize = normalizeSize(args[0]);
    if (maybeSize) {
      size = maybeSize;
      args = args.slice(1);
    }
    const argsText = args.join(' ');

    // 2. Utiliser l'utilitaire centralisé pour obtenir le texte à traiter.
    const usageMessage =
      'Usage : !resume [court|moyen|détaillé] <texte>\n' +
      'Ou réponds à un long message (ou à un document .txt/.md/.csv/.json/.pdf/.docx) avec !resume [taille].';
    const result = await resolveInputText(ctx, argsText, usageMessage);

    if (result.errorMessage) {
      await ctx.error(result.errorMessage);
      return;
    }

    // 3. Le texte a été trouvé, on peut continuer le traitement.
    let inputText = result.text;

    inputText = inputText.trim();

    if (inputText.length < MIN_CHARS) {
      await ctx.error('Le texte fourni est trop court pour être résumé.');
      return;
    }

    let truncated = false;
    if (inputText.length > MAX_CHARS) {
      inputText = inputText.slice(0, MAX_CHARS);
      truncated = true;
    }

    await ctx.processing();

    try {
      const summary = await summarizeText(inputText, size);
      const prefix = `📝 *Résumé (${size})*${truncated ? ' — texte tronqué avant résumé' : ''}\n\n`;
      // Envoi direct (sans ctx.reply) : ctx.reply préfixe chaque ligne par
      // "> " (citation WhatsApp), ce qui rend un résumé long et structuré
      // illisible (bordure hachée). Ici on garde le texte brut.
      await ctx.sock.sendMessage(ctx.chatId, { text: prefix + summary }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors du résumé');
      await ctx.error(`Impossible de générer le résumé : ${err.message}`);
    }
  },
};