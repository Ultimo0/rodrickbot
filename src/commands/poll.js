import * as PollManager from '../core/poll/PollManager.js';
import { looksLikePollDuration } from '../core/poll/pollDuration.js';
import * as Renderer from '../core/poll/PollRenderer.js';

const REASON_MESSAGES = {
  NOT_FOUND: null, // déjà un message dédié via renderPollNotFound, géré au cas par cas
  FORBIDDEN: '❌ Seul le créateur du sondage (ou un administrateur) peut faire ça.',
  ALREADY_CLOSED: '❌ Ce sondage est déjà fermé.',
  INVALID_SYNTAX: null, // idem, message dédié selon le contexte
  TOO_SHORT: '❌ Durée trop courte (minimum 1 minute).',
  TOO_LONG: '❌ Durée trop longue (maximum 30 jours).',
  DRAFT_IN_PROGRESS: null, // déjà notifié par PollManager.startWizard
  NO_DRAFT: '❌ Aucune création de sondage en cours à annuler.',
};

function helpText() {
  return (
    '📊 *Aide — /poll*\n\n' +
    '*Créer :*\n' +
    '• /poll — assistant pas-à-pas\n' +
    '• /poll "Titre" Option 1 | Option 2 | ... [| durée]\n\n' +
    '*Gérer :*\n' +
    '• /poll results [id] — résultats\n' +
    '• /poll info [id] — informations\n' +
    '• /poll list — sondages actifs du chat\n' +
    '• /poll close [id] — fermer\n' +
    '• /poll delete [id] — supprimer (confirmation demandée)\n' +
    '• /poll duration <1h|2j|30min> [id] — fixer/changer la durée\n' +
    '• /poll cancel — annuler une création en cours\n\n' +
    "_Sans [id], la commande cible le sondage le plus récent du chat._\n" +
    '_Pour voter : réponds à la carte du sondage avec le numéro de ton choix._'
  );
}

export default {
  name: 'poll',
  aliases: ['sondage'],
  description:
    'Crée et gère des sondages (assistant pas-à-pas ou syntaxe rapide). Usage: {prefix}poll, {prefix}poll "Titre" A | B | C, {prefix}poll results|close|delete|info|list|duration|cancel|help',
  category: 'Utilitaires',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const { sock, chatId, sender, isAdmin, args } = ctx;
    const sub = args[0]?.toLowerCase();

    // --- Aucun argument : assistant pas-à-pas -----------------------------
    if (args.length === 0) {
      await ctx.processing();
      const result = await PollManager.startWizard(sock, { chatId, sender });
      if (result.ok) await ctx.success();
      else if (result.reason !== 'DRAFT_IN_PROGRESS') await ctx.error(REASON_MESSAGES[result.reason]);
      else await ctx.error();
      return;
    }

    // --- Syntaxe rapide : /poll "Titre" A | B | C [| durée] ---------------
    if (args[0].startsWith('"')) {
      await ctx.processing();
      // ctx.args a déjà été découpé sur les espaces par parseCommand ; on
      // reconstruit une chaîne exploitable par parseQuickSyntax (regex sur
      // guillemets + pipes, insensible à la normalisation des espaces).
      const rawText = args.join(' ');
      const result = await PollManager.quickCreate(sock, { chatId, sender, rawText });
      if (result.ok) {
        await ctx.success();
      } else if (result.reason === 'TOO_SHORT' || result.reason === 'TOO_LONG') {
        await ctx.error(REASON_MESSAGES[result.reason]);
      } else {
        await ctx.reply(Renderer.renderInvalidQuickSyntax());
        await ctx.error();
      }
      return;
    }

    // --- Sous-commandes -----------------------------------------------------
    switch (sub) {
      case 'help': {
        await ctx.reply({ text: helpText() });
        return;
      }

      case 'fin': {
        // Filet de sécurité : "/poll fin" (avec préfixe) doit se comporter
        // exactement comme "fin" tapé nu pendant l'assistant (voir
        // messageHandler.js — la capture normale n'intercepte jamais un
        // texte préfixé par la commande, volontairement).
        const handled = await PollManager.handleWizardText(sock, { sender, chatId, text: 'fin' });
        if (!handled) await ctx.error('❌ Aucune création de sondage en cours. Tape /poll pour en démarrer une.');
        else await ctx.success();
        return;
      }

      case 'cancel': {
        await ctx.processing();
        const result = await PollManager.cancelWizard(sock, { chatId, sender });
        if (result.ok) await ctx.success();
        else await ctx.error(REASON_MESSAGES[result.reason]);
        return;
      }

      case 'results': {
        await ctx.reply(PollManager.getResultsMessage(chatId, args[1]));
        return;
      }

      case 'info': {
        await ctx.reply(PollManager.getInfoMessage(chatId, args[1]));
        return;
      }

      case 'list': {
        await ctx.reply(PollManager.getListMessage(chatId));
        return;
      }

      case 'close': {
        await ctx.processing();
        const result = await PollManager.closePollCommand(sock, { chatId, sender, isAdmin, id: args[1] });
        if (result.ok) await ctx.success();
        else if (result.reason === 'NOT_FOUND') {
          await ctx.reply(Renderer.renderPollNotFound(args[1]));
          await ctx.error();
        } else {
          await ctx.error(REASON_MESSAGES[result.reason]);
        }
        return;
      }

      case 'delete': {
        await ctx.processing();
        const result = await PollManager.requestDelete(sock, { chatId, sender, isAdmin, id: args[1] });
        if (result.ok) await ctx.success();
        else if (result.reason === 'NOT_FOUND') {
          await ctx.reply(Renderer.renderPollNotFound(args[1]));
          await ctx.error();
        } else {
          await ctx.error(REASON_MESSAGES[result.reason]);
        }
        return;
      }

      case 'duration': {
        await ctx.processing();
        const durationInput = args[1];
        const id = args[2];
        if (!durationInput) {
          await ctx.error('❌ Usage : /poll duration <1h|2j|30min> [id]');
          return;
        }
        const result = await PollManager.setDurationCommand(sock, { chatId, sender, isAdmin, id, durationInput });
        if (result.ok) await ctx.success();
        else if (result.reason === 'NOT_FOUND') {
          await ctx.reply(Renderer.renderPollNotFound(id));
          await ctx.error();
        } else if (result.reason === 'INVALID_SYNTAX') {
          await ctx.reply(Renderer.renderInvalidDuration());
          await ctx.error();
        } else {
          await ctx.error(REASON_MESSAGES[result.reason]);
        }
        return;
      }

      default: {
        // Sucre syntaxique explicitement demandé dans le brief : /poll 1h,
        // /poll 2j, /poll 30min — fixe la durée du sondage le plus récent
        // du chat, équivalent à "/poll duration <durée>".
        if (looksLikePollDuration(args[0]) && args.length === 1) {
          await ctx.processing();
          const result = await PollManager.setDurationCommand(sock, {
            chatId,
            sender,
            isAdmin,
            id: undefined,
            durationInput: args[0],
          });
          if (result.ok) await ctx.success();
          else if (result.reason === 'NOT_FOUND') {
            await ctx.reply(Renderer.renderPollNotFound());
            await ctx.error();
          } else {
            await ctx.error(REASON_MESSAGES[result.reason] || 'Impossible de fixer cette durée.');
          }
          return;
        }

        await ctx.reply({ text: helpText() });
      }
    }
  },
};
