import { generateQrCode } from '../utils/qrcode.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'qrcode',
  aliases: ['qr'],
  description: 'Génère un QR code à partir d\'un texte ou d\'un lien. Usage: {prefix}qrcode <texte ou lien>',
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 5000,
  privateOnly: false,
  execute: async (ctx) => {
    const text = ctx.args.join(' ').trim();

    if (!text) {
      await ctx.error('Usage : !qrcode <texte ou lien>\nExemple : !qrcode https://wa.me/237600000000');
      return;
    }

    await ctx.processing();

    try {
      const buffer = await generateQrCode(text);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { image: buffer, caption: `📎 QR code généré pour :\n${text}` },
        { quoted: ctx.msg }
      );
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la génération du QR code');
      await ctx.error(`Impossible de générer le QR code : ${err.message}`);
    }
  },
};
