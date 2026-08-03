import { readdirSync } from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Charge dynamiquement toutes les commandes présentes dans commands/.
 * Chaque fichier doit faire un "export default" d'un objet de la forme:
 * {
 *   name: 'ping',            // nom de la commande (sans préfixe)
 *   aliases: ['p'],          // optionnel
 *   description: '...',      // affiché dans !help
 *   adminOnly: false,        // optionnel
 *   privateOnly: true,       // optionnel, true par défaut.
 *                            // Si true (ou absent), la commande est bloquée
 *                            // en groupe. Mettre "false" pour l'autoriser
 *                            // aussi en groupe.
 *   execute: async (ctx) => { ... }
 * }
 *
 * Pour ajouter une commande: créez un fichier dans commands/, aucune
 * autre modification n'est nécessaire (chargement 100% automatique).
 *
 * @returns {Map<string, object>} map nom-de-commande -> définition de commande
 */
export async function loadCommands() {
  const commands = new Map();
  const commandsDir = path.join(__dirname, '..', 'commands');
  const files = readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

  for (const file of files) {
    const fileUrl = pathToFileURL(path.join(commandsDir, file)).href;
    const module = await import(fileUrl);
    const command = module.default;

    if (!command?.name || typeof command.execute !== 'function') {
      logger.warn(`Commande ignorée (format invalide): ${file}`);
      continue;
    }

    commands.set(command.name, command);
    for (const alias of command.aliases || []) {
      commands.set(alias, command);
    }

    logger.info(`Commande chargée: ${command.name}`);
  }

  return commands;
}