import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'config', 'settings.json');

const MAX_PREFIX_LENGTH = 5;

export default {
  name: 'prefix',
  description: 'Affiche ou change le préfixe des commandes du bot. Usage: {prefix}prefix [nouveau préfixe]',
  category: 'Administration',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const newPrefix = ctx.args[0];

    if (!newPrefix) {
      await ctx.reply({ text: `Préfixe actuel : "${config.prefix}"\n\nUsage: !prefix <nouveau préfixe>` });
      return;
    }

    if (/\s/.test(newPrefix) || newPrefix.length > MAX_PREFIX_LENGTH) {
      await ctx.error(`❌ Préfixe invalide (pas d'espace, ${MAX_PREFIX_LENGTH} caractères max).`);
      return;
    }

    const oldPrefix = config.prefix;
    // `config` est un unique objet partagé par tous les modules : muter cette
    // propriété prend effet immédiatement partout (messageHandler.js relit
    // config.prefix à chaque message), sans redémarrage.
    config.prefix = newPrefix;

    try {
      const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
      raw.prefix = newPrefix;
      writeFileSync(SETTINGS_FILE, JSON.stringify(raw, null, 2));
    } catch (err) {
      config.prefix = oldPrefix; // on annule le changement en mémoire si la persistance échoue
      await ctx.error(`❌ Impossible d'enregistrer le nouveau préfixe : ${err.message}`);
      return;
    }

    await ctx.success(`✅ Préfixe changé : "${oldPrefix}" → "${newPrefix}"`);
  },
};
