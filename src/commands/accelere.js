import { runVideoSpeedCommand } from '../utils/videoSpeed.js';

export default {
  name: 'accelere',
  aliases: ['fast', 'speedup', 'accélère'],
  description:
    'Accélère une vidéo (image + son synchronisés). Usage: {prefix}accelere [facteur entre 1 et 4] en réponse à une vidéo (défaut: 2 = deux fois plus rapide).',
  category: 'Média',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) =>
    runVideoSpeedCommand(ctx, { defaultFactor: 2, minFactor: 1, maxFactor: 4, label: 'accelere' }),
};
