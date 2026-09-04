import { addMessageSchedule, removeMessageSchedule, getMessageSchedules } from '../core/messageSchedules.js';
import { scheduleMessage, cancelMessageSchedule } from '../core/messageScheduler.js';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default {
  name: 'schedule',
  aliases: ['programmer'],
  description:
    'Programme un message récurrent quotidien dans ce groupe (heure du serveur). ' +
    'Usage: {prefix}schedule add HH:MM <message>, {prefix}schedule list, {prefix}schedule remove <id>',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'list') {
      const entries = getMessageSchedules(ctx.chatId);
      if (!entries.length) {
        await ctx.reply({ text: 'Aucun message programmé pour ce groupe.' });
        return;
      }
      const lines = entries.map((e) => `• \`${e.id}\` — ${e.time} : ${e.message}`);
      await ctx.reply({ text: `📅 *Messages programmés*\n\n${lines.join('\n')}` });
      return;
    }

    if (sub === 'remove') {
      const id = ctx.args[1];
      if (!id) {
        await ctx.error('Usage: !schedule remove <id> (voir !schedule list)');
        return;
      }
      const removed = removeMessageSchedule(ctx.chatId, id);
      if (!removed) {
        await ctx.error(`Aucun message programmé avec l'id "${id}".`);
        return;
      }
      cancelMessageSchedule(ctx.chatId, id);
      await ctx.success(`✅ Message programmé "${id}" supprimé.`);
      return;
    }

    if (sub === 'add') {
      const time = ctx.args[1];
      const message = ctx.args.slice(2).join(' ');

      if (!time || !TIME_REGEX.test(time) || !message) {
        await ctx.error('Usage: !schedule add HH:MM <message> (ex: !schedule add 08:00 Bon matin 🌞)');
        return;
      }

      const id = addMessageSchedule(ctx.chatId, time, message);
      scheduleMessage(ctx.sock, ctx.chatId, { id, time, message });
      await ctx.success(`✅ Message programmé chaque jour à ${time} (id: \`${id}\`).`);
      return;
    }

    await ctx.error('Usage: !schedule add HH:MM <message>, !schedule list, !schedule remove <id>');
  },
};
