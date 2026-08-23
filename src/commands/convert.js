// src/commands/convert.js
import { parseAndConvert } from '../utils/unitConverter.js';

export default {
  name: 'convert',
  aliases: ['conv', 'unite'],
  description:
    'Convertit des unités (température, longueur, masse, volume, surface, vitesse, durée). ' +
    'Usage : {prefix}convert 25°C en °F  ou  {prefix}convert 2h en min',
  category: 'Utilitaires',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const input = ctx.args.join(' ');
    if (!input) {
      await ctx.error(
        '❌ Syntaxe : /convert <valeur> <unité> en <unité>\n' +
        'Exemples : /convert 25°C en °F\n' +
        '           /convert 100 km en miles\n' +
        '           /convert 2h en min\n' +
        '           /convert 7j en semaine'
      );
      return;
    }

    const result = parseAndConvert(input);

    if (!result.ok) {
      await ctx.error(result.message);
      return;
    }

    await ctx.reply({
      text: `🔄 *Conversion*\n\n${result.amount} ${result.fromUnit} =\n*${result.converted} ${result.toUnit}*`
    });
  }
};