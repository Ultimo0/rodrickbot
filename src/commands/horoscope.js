import { generateHoroscope } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

const SIGNS = [
  'bélier', 'taureau', 'gémeaux', 'cancer', 'lion', 'vierge',
  'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons',
];

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default {
  name: 'horoscope',
  aliases: ['astro'],
  description:
    `Horoscope du jour fantaisiste (divertissement uniquement). Usage: {prefix}horoscope <signe> (${SIGNS.join(', ')})`,
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) => {
    const raw = ctx.args.join(' ').trim();
    const sign = SIGNS.find((s) => normalize(s) === normalize(raw));

    if (!sign) {
      await ctx.error(`Usage : !horoscope <signe>\nSignes disponibles : ${SIGNS.join(', ')}`);
      return;
    }

    await ctx.processing();

    try {
      const horoscope = await generateHoroscope(sign);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { text: `🔮 *Horoscope du jour — ${sign}*\n_Pour le divertissement uniquement_\n\n${horoscope}` },
        { quoted: ctx.msg }
      );
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, "Erreur lors de la génération de l'horoscope");
      await ctx.error(`Impossible de générer l'horoscope : ${err.message}`);
    }
  },
};
