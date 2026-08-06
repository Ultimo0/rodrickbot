import { readFileSync } from 'fs';
import path from 'path';
import { getItem } from '../core/savedItems.js';
import { audioToVoiceNote } from '../utils/mediaConvert.js';

export default {
  name: 'get',
  aliases: ['show'],
  description: 'Récupère un élément enregistré (via !save ou !statut). Usage: !get <nom> [note] — ajoute "note" pour envoyer une vidéo au format note vidéo (ronde).',
  category: 'Sauvegardes',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const name = ctx.args[0];
    if (!name) {
      await ctx.error('Usage: !get <nom> [note]');
      return;
    }

    const item = getItem(name);
    if (!item) {
      await ctx.error(`❌ Aucun élément trouvé sous "${name}".`);
      return;
    }

    if (item.type === 'text') {
      await ctx.reply({ text: item.text });
      return;
    }

    const buffer = readFileSync(path.join(process.cwd(), item.mediaPath));
    const sendOptions = {};
    const asNote = ['note', 'rond', 'ronde'].includes(ctx.args[1]?.toLowerCase());

    if (item.type === 'image') {
      sendOptions.image = buffer;
      if (item.caption) sendOptions.caption = item.caption;
    } else if (item.type === 'video') {
      sendOptions.video = buffer;
      if (asNote) {
        sendOptions.ptv = true; // note vidéo (ronde) — pas de légende possible sur ce format
      } else if (item.caption) {
        sendOptions.caption = item.caption;
      }
    } else if (item.type === 'audio') {
      let audioBuffer = buffer;
      let mimetype = item.mimetype || 'audio/ogg; codecs=opus';
      let ptt = Boolean(item.ptt);

      // Le comportement demandé ici est explicite : on veut relire le média
      // comme une voice note WhatsApp. Pour les audios transférés, on les
      // normalise donc en OGG/Opus au moment du `!get` puis on envoie avec
      // le bon drapeau `ptt = true`.
      if (!ptt) {
        audioBuffer = await audioToVoiceNote(buffer);
        mimetype = 'audio/ogg; codecs=opus';
        ptt = true;
      }

      sendOptions.audio = audioBuffer;
      sendOptions.mimetype = mimetype;
      sendOptions.ptt = ptt;
    }

    await ctx.sock.sendMessage(ctx.chatId, sendOptions, { quoted: ctx.msg });
  },
};