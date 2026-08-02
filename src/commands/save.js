import { handleSaveCommand } from '../utils/saveHandler.js';

export default {
  name: 'save',
  description: 'Enregistre un message (texte, audio ou vidéo) sous un nom. Usage: !save <nom> en répondant au message.',
  category: 'Archivage',
  adminOnly: true,
  privateOnly: false,
  execute: (ctx) => handleSaveCommand(ctx, 'save'),
};
