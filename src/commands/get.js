import { readFileSync } from 'fs';
import path from 'path';
import { getItem } from '../core/savedItems.js';
import { audioToM4a } from '../utils/mediaConvert.js';

export default {
  name: 'get',
  aliases: ['show'],
  description: 'Récupère un élément enregistré (via {prefix}save ou {prefix}statut). Usage: {prefix}get <nom> [note] — ajoute "note" pour envoyer une vidéo au format note vidéo (ronde).',
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
      // Converti en M4A et envoyé comme audio normal (pas ptt) : le
      // ré-encodage OGG/Opus + ptt=true (note vocale) s'est avéré encore
      // produire des fichiers illisibles côté destinataire sur certains
      // enregistrements — M4A en audio normal est plus fiable.
      sendOptions.audio = await audioToM4a(buffer);
      sendOptions.mimetype = 'audio/mp4';
      sendOptions.ptt = false;
    }

    await ctx.sock.sendMessage(ctx.chatId, sendOptions, { quoted: ctx.msg });
  },
};