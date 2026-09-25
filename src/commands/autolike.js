import { config } from '../config/index.js';
import {
  isAutoLikeEnabled,
  setAutoLikeEnabled,
  getAutoLikeEmoji,
  setAutoLikeEmoji,
} from '../core/autoLikeStatus.js';

// Préfixe interpolé directement (config.prefix), pas un placeholder
// {prefix} laissé tel quel dans le texte envoyé — contrairement à
// antibug.js existant, qui affiche "{prefix}antibug..." littéralement dans
// ses messages ctx.error() au lieu du vrai préfixe configuré (".").
function usage() {
  return (
    'Usage :\n' +
    `${config.prefix}autolike on|off — active/désactive la réaction automatique aux statuts\n` +
    `${config.prefix}autolike emoji <emoji> — change l'emoji utilisé (ex: ${config.prefix}autolike emoji 🔥)\n` +
    `${config.prefix}autolike — affiche l'état actuel`
  );
}

export default {
  name: 'autolike',
  aliases: ['autostatus', 'vustatus'],
  description:
    "Réagit automatiquement (comme un \"like\") à chaque statut WhatsApp vu par le bot, avec l'emoji de ton choix. " +
    'Usage: {prefix}autolike on|off, {prefix}autolike emoji <emoji>.',
  category: 'Administration',
  adminOnly: true,
  execute: async (ctx) => {
    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'on' || sub === 'off') {
      setAutoLikeEnabled(sub === 'on');
      await ctx.success(
        sub === 'on'
          ? `✅ Autolike activé (emoji actuel : ${getAutoLikeEmoji()}).`
          : '❌ Autolike désactivé.'
      );
      return;
    }

    if (sub === 'emoji') {
      const emoji = ctx.args[1];
      if (!emoji) {
        await ctx.error(`Indique un emoji.\n\n${usage()}`);
        return;
      }
      setAutoLikeEmoji(emoji);
      await ctx.success(`✅ Emoji autolike réglé sur : ${emoji}`);
      return;
    }

    await ctx.reply({
      text:
        `Autolike : ${isAutoLikeEnabled() ? 'activé ✅' : 'désactivé ❌'} (emoji : ${getAutoLikeEmoji()})\n\n${usage()}`,
    });
  },
};
