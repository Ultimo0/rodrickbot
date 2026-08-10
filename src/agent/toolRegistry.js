/**
 * Registre des outils réutilisables par l'agent.
 *
 * L’objectif est d’exposer les capacités existantes du bot sous forme
 * d’outils cohérents, sans dupliquer la logique métier déjà présente
 * dans les commandes et les utilitaires.
 */

import { askGroq, correctText, summarizeText, translateText } from '../utils/groq.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { playTool } from './tools/playTool.js';
import { stickerTool } from './tools/stickerTool.js';
import { ocrTool } from './tools/ocrTool.js';
import { translateTool } from './tools/translateTool.js';
import { downloadTool } from './tools/downloadTool.js';
import { weatherTool } from './tools/weatherTool.js';
import { searchTool } from './tools/searchTool.js';
import { ttsTool } from './tools/ttsTool.js';
import { summarizeTool } from './tools/summarizeTool.js';
import { correctTool } from './tools/correctTool.js';
import { debugTool } from './tools/debugTool.js';
import { proRewriteTool } from './tools/proRewriteTool.js';

const tools = new Map();

function registerTool(tool) {
  tools.set(tool.name, tool);
}

registerTool(playTool);
registerTool(stickerTool);
registerTool(ocrTool);
// Suppression des doublons - les outils sont maintenant définis dans leurs modules
// avec la résolution automatique de la source de texte
registerTool(translateTool);
registerTool(downloadTool);
registerTool(weatherTool);
registerTool(searchTool);
registerTool(ttsTool);
registerTool(summarizeTool);
registerTool(correctTool);
registerTool(debugTool);
registerTool(proRewriteTool);
registerTool({
  name: 'ask_general',
  description: 'Pose une question générale à l’IA Groq.',
  params: [{ name: 'question', type: 'string', required: true }],
  execute: async ({ question, text }) => {
    const payload = (question || text || '').trim();
    if (!payload) throw new Error('Question vide.');
    return askGroq(payload);
  },
});



export function getToolRegistry() {
  return [...tools.values()];
}

/**
 * Noms des outils exposables au classifieur d'intention IA (agentService.js).
 *
 * Générée dynamiquement à partir du registre réel plutôt que recopiée à la
 * main : élimine la classe d'erreur documentée dans agentService.js (un nom
 * présent côté classifieur mais absent ici, ou l'inverse, comme cela s'est
 * déjà produit avec `rewrite_professional`/`translate`/`ocr_image`). Les
 * outils marqués `internal: true` (ex: debug_message) sont exclus : ils ne
 * doivent jamais être proposés à l'IA conversationnelle.
 */
export function getIntentToolNames() {
  return getToolRegistry()
    .filter((tool) => !tool.internal)
    .map((tool) => tool.name);
}

/**
 * @param {object} options
 * @param {boolean} [options.allowInternal] — réservé aux appelants internes
 *   de confiance (jamais l'agent conversationnel) ; permet d'exécuter un
 *   outil marqué `internal: true` (ex: debug_message).
 */
export async function executeTool(name, args = {}, context = {}, { allowInternal = false } = {}) {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Outil inconnu: ${name}`);
  }

  if (tool.internal && !allowInternal) {
    throw new Error(`Outil interne non exécutable via l'agent: ${name}`);
  }

  return tool.execute({ ...args, ...context });
}

