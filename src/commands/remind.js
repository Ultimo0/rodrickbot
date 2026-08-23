import * as RemindManager from '../core/remind/RemindManager.js';
import * as Renderer from '../core/remind/RemindRenderer.js';

export default {
  name: 'remind',
  aliases: ['rappel'],
  description:
    'Programme un rappel personnel. Usage: {prefix}remind <durée> <message>, {prefix}remind <date> <message>, {prefix}remind (assistant), {prefix}remind cancel|help',
  category: 'Utilitaires',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const { sock, chatId, sender, args } = ctx;
    const sub = args[0]?.toLowerCase();

    // --- Aucun argument : assistant pas-à-pas -----------------------------
    if (args.length === 0) {
      await ctx.processing();
      const result = await RemindManager.startWizard(sock, { chatId, sender });
      if (result.ok) await ctx.success();
      else await ctx.error(); // message déjà envoyé par startWizard (brouillon déjà en cours)
      return;
    }

    // --- Sous-commandes de gestion -----------------------------------------
    if (sub === 'help') {
      await ctx.reply(Renderer.renderHelp());
      return;
    }

    if (sub === 'cancel') {
      await ctx.processing();

      if (args[1]?.toLowerCase() === 'all') {
        const result = await RemindManager.requestCancelAll(sock, { chatId, sender });
        if (result.ok) await ctx.success();
        else await ctx.error();
        return;
      }

      if (args[1]) {
        const result = await RemindManager.cancelById(sock, { chatId, sender, id: args[1] });
        if (result.ok) await ctx.success();
        else await ctx.error();
        return;
      }

      // "/remind cancel" seul, sans id : annule un brouillon d'assistant en
      // cours (même sémantique que "/poll cancel", voir commands/poll.js).
      const result = await RemindManager.cancelWizard(sock, { chatId, sender });
      if (result.ok) {
        await ctx.success();
      } else {
        await ctx.error('❌ Rien à annuler : aucune création en cours, et aucun identifiant fourni.\nUsage : /remind cancel <id>, ou /remind cancel all');
      }
      return;
    }

    if (sub === 'info') {
      if (!args[1]) {
        await ctx.error('❌ Usage : /remind info <id>');
        return;
      }
      await ctx.reply(RemindManager.getInfoMessage(sender, args[1]));
      return;
    }

    // --- Tout le reste : durée / date absolue / récurrence -----------------
    // (unifié dans RemindManager.parseReminderCommand — voir ce fichier pour
    // le détail des formats reconnus : "10min ...", "demain 08:00 ...",
    // "20/08/2026 18:30 ...", "every day HH:MM ...", "every week <jour> HH:MM ...")
    await ctx.processing();
    const rawText = args.join(' ');
    const result = await RemindManager.createFromText(sock, { chatId, sender, rawText });
    if (result.ok) await ctx.success();
    else await ctx.error(); // détail de l'erreur déjà envoyé par createFromText
  },
};
