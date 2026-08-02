import { antiSpamMiddleware } from './antiSpam.js';

/**
 * Liste ordonnée des middlewares exécutés avant chaque commande.
 * Pour désactiver un middleware, commentez ou retirez sa ligne ici.
 * Pour en ajouter un: créez le fichier dans ce dossier, puis importez-le ici.
 */
export const middlewares = [antiSpamMiddleware];

/** Exécute tous les middlewares; s'arrête au premier qui bloque (retourne false) */
export function runMiddlewares(ctx) {
  return middlewares.every((middleware) => middleware(ctx) !== false);
}
