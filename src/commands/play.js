import { searchYoutubeData, downloadYoutubeAudio } from '../utils/youtube.js';

/** Formate une durée en secondes au format mm:ss. */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Formate un nombre de vues avec séparateurs de milliers (ex: 213 433 371). */
function formatViews(count) {
  return Number(count || 0).toLocaleString('fr-FR');
}

function sanitizeFileName(name) {
  return (name || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim() || 'audio';
}

export default {
  name: 'play',
  aliases: ['music'],
  description: "Recherche une chanson sur YouTube et envoie directement l'audio. Usage: {prefix}play <titre>",
  category: 'Téléchargement',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const query = ctx.args.join(' ').trim();
    if (!query) {
      await ctx.error('Indique un titre à rechercher. Usage: !play <titre>');
      return;
    }

    await ctx.processing();

    let data;
    try {
      data = await searchYoutubeData(query);
    } catch (err) {
      await ctx.error(`Recherche impossible : ${err.message}`);
      return;
    }

    // Carte d'infos (façon "SONG"), envoyée avant le fichier audio lui-même,
    // pour donner un aperçu (titre/chaîne/durée/vues) avant le téléchargement.
    const caption =
      '🎵 *RODRICKBOT SONG*\n\n' +
      `*Titre:* ${data.title}\n` +
      `*Chaîne:* ${data.channel}\n` +
      `*Durée:* ${formatDuration(data.duration)}\n` +
      `*Vues:* ${formatViews(data.views)}\n` +
      '*Format:* mp3 (128kbps)\n\n' +
      '_powered by RodrickBOT_';

    try {
      if (data.thumbnail) {
        await ctx.sock.sendMessage(ctx.chatId, { image: { url: data.thumbnail }, caption }, { quoted: ctx.msg });
      } else {
        await ctx.reply({ text: caption });
      }

      const buffer = await downloadYoutubeAudio(data.url);
      const fileName = sanitizeFileName(data.title);
      await ctx.sock.sendMessage(
        ctx.chatId,
        { audio: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3` },
        { quoted: ctx.msg }
      );

      await ctx.success();
    } catch (err) {
      await ctx.error(`Échec du téléchargement : ${err.message}`);
    }
  },
};
