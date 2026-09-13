import { runVideoSpeedCommand } from '../utils/videoSpeed.js';

export default {
  name: 'ralenti',
  aliases: ['slowmo', 'slow'],
  description:
    'Ralentit une vidéo (image + son synchronisés). Usage: {prefix}ralenti [facteur entre 0.1 et 1] en réponse à une vidéo (défaut: 0.5 = deux fois plus lent).',
  category: 'Média',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) =>
    runVideoSpeedCommand(ctx, { defaultFactor: 0.5, minFactor: 0.1, maxFactor: 1, label: 'ralenti' }),
};
