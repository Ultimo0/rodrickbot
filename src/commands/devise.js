import { convertCurrency } from '../utils/currency.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'devise',
  aliases: ['convert-devise', 'exchange'],
  description:
    'Convertit un montant entre deux devises (~160 devises supportées, dont le FCFA/XAF). Usage: {prefix}devise <montant> <de> <vers> (ex: !devise 100 usd xaf)',
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 5000,
  privateOnly: false,
  execute: async (ctx) => {
    const [amountRaw, from, to] = ctx.args;
    const amount = Number(amountRaw?.replace(',', '.'));

    if (!amountRaw || !Number.isFinite(amount) || amount <= 0 || !from || !to) {
      await ctx.error('Usage : !devise <montant> <de> <vers>\nExemple : !devise 100 usd eur');
      return;
    }

    await ctx.processing();

    try {
      const result = await convertCurrency(amount, from, to);
      await ctx.reply({
        text:
          `💱 ${result.amount} ${result.from} = *${result.result.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${result.to}*\n` +
          `_Taux du ${result.date}_`,
      });
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la conversion de devise');
      await ctx.error(err.message);
    }
  },
};
