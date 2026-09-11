import { sendWithChannelCard } from '../utils/channelCard.js';
import { toQuoteBlock } from '../utils/helpers.js';

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Vérifie la disponibilité du bot et affiche la latence.',
  category: 'Diagnostic',
  privateOnly: false,
  execute: async (ctx) => {
    const sentAt = Number(ctx.msg.messageTimestamp) * 1000;
    const latency = Date.now() - sentAt;

    await ctx.success(); // réaction ✅ seule, le texte part via la carte
    await sendWithChannelCard(ctx, toQuoteBlock(`Pong — ${latency} ms`));
  },
};