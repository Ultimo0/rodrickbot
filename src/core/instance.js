import path from 'path';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

const INSTANCE_FILE = path.join(process.cwd(), 'instance.json');

let instance = {
  instanceId: '',
  instanceOwner: '',
};

function loadInstance() {
  instance = { ...instance, ...readJsonFile(INSTANCE_FILE, {}, 'instance.json') };
}

/** Lève une erreur si l'écriture échoue : !setup doit répondre par un échec. */
function saveInstance() {
  writeJsonFile(INSTANCE_FILE, instance, 'instance.json');
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
  const previous = instance;
  instance = { instanceId, instanceOwner };

  try {
    saveInstance();
  } catch (err) {
    // Sans persistance, l'instance serait "configurée" en mémoire mais
    // repartirait non configurée au redémarrage : on annule et on remonte.
    instance = previous;
    throw err;
  }
}