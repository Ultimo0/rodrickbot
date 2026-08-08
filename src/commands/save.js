import { handleSaveCommand } from '../utils/saveHandler.js';

export default {
  name: 'save',
  description: 'Enregistre un message (texte, audio ou vidéo) sous un nom. Usage: {prefix}save <nom> en répondant au message.',
  category: 'Sauvegardes',
  adminOnly: true,
  privateOnly: false,
  execute: (ctx) => handleSaveCommand(ctx, 'save'),
};
