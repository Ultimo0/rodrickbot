import { handleSaveCommand } from '../utils/saveHandler.js';

export default {
  name: 'statut',
  description:
    "Enregistre un statut WhatsApp (texte, image, vidéo ou audio) sous un nom. Usage: {prefix}statut <nom de sauvegarde> en répondant au statut.",
  category: 'Sauvegardes',
  adminOnly: true,
  privateOnly: false,
  execute: (ctx) => handleSaveCommand(ctx, 'statut'),
};
