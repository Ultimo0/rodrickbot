import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const INSTANCE_FILE = path.join(process.cwd(), 'instance.json');

let instance = {
  instanceId: '',
  instanceOwner: '',
};

function loadInstance() {
  if (!existsSync(INSTANCE_FILE)) return;
  try {
    const raw = readFileSync(INSTANCE_FILE, 'utf-8');
    instance = { ...instance, ...JSON.parse(raw) };
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire instance.json, le bot sera considéré comme non configuré');
  }
}

function saveInstance() {
  try {
    writeFileSync(INSTANCE_FILE, JSON.stringify(instance, null, 2));
  } catch (err) {
    logger.error({ err }, 'Impossible d\'écrire instance.json');
  }
}

loadInstance();

/** Le bot est utilisable seulement si un id et un propriétaire ont été renseignés via !setup. */
export function isInstanceConfigured() {
  return Boolean(instance.instanceId && instance.instanceOwner);
}

export function getInstance() {
  return { ...instance };
}

/**
 * Enregistre l'id et le propriétaire de cette instance. Ne peut être
 * appelé qu'une seule fois : une fois configurée, l'instance est
 * verrouillée et !setup refuse toute nouvelle tentative.
 */
export function setInstance(instanceId, instanceOwner) {
  if (isInstanceConfigured()) {
    throw new Error('Cette instance est déjà configurée et verrouillée.');
  }
  instance = { instanceId, instanceOwner };
  saveInstance();
}