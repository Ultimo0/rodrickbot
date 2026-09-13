import { fetchCryptoPrice } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'crypto',
  aliases: ['prix-crypto'],
  description: 'Affiche le cours actuel d\'une cryptomonnaie. Usage: {prefix}crypto <symbole ou nom> (ex: !crypto btc)',
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 5000,
  privateOnly: false,
  execute: async (ctx) => {
    const query = ctx.args.join(' ').trim();
    if (!query) {
      await ctx.error('Usage : !crypto <symbole ou nom>\nExemple : !crypto btc');
      return;
    }

    await ctx.processing();

    try {
      const data = await fetchCryptoPrice(query);
      const changeEmoji = data.change24hUsd >= 0 ? '📈' : '📉';
      const change = data.change24hUsd != null ? `${data.change24hUsd.toFixed(2)}%` : 'N/A';

      await ctx.reply({
        text:
          `💰 *${data.name} (${data.symbol})*\n\n` +
          `💵 $${data.usd.toLocaleString('en-US')}\n` +
          `💶 €${data.eur.toLocaleString('en-US')}\n` +
          `${changeEmoji} 24h : ${change}`,
      });
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la récupération du cours crypto');
      await ctx.error(err.message);
    }
  },
};
