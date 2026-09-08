import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { logger } from '../utils/logger.js';

/**
 * Store minimal des contacts du compte, alimenté par les évènements
 * `contacts.upsert` / `contacts.set` / `contacts.update` de Baileys.
 *
 * Pourquoi ce fichier existe : WhatsApp exige la liste des destinataires
 * (`statusJidList`) pour qu'un statut envoyé via `status@broadcast` soit
 * réellement chiffré pour quelqu'un et donc visible. Sans cette liste,
 * `sock.sendMessage('status@broadcast', ...)` réussit (aucune exception,
 * aucun message d'erreur) mais le statut est chiffré pour zéro
 * destinataire : il n'apparaît nulle part, y compris pour l'utilisateur
 * lui-même dans certains cas. C'est exactement le symptôme "le bot dit
 * republié mais rien n'apparaît vraiment en statut" — voir {prefix}repost.
 *
 * Ce projet ne maintenait jusqu'ici aucun `contacts.upsert` écouté nulle
 * part (voir commentaire historique dans commands/repost.js), d'où
 * l'absence totale de statusJidList disponible.
 */

const CONTACTS_FILE = dataFilePath('contacts.json');
const contactJids = new Set();
let dirty = false;

function isRealContact(jid) {
  if (!jid) return false;
  // On exclut les groupes, les listes de diffusion et le pseudo-JID de
  // statut lui-même — seuls les contacts individuels sont utiles ici.
  return jid.endsWith('@s.whatsapp.net') && jid !== 'status@broadcast';
}

function load() {
  if (!existsSync(CONTACTS_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(CONTACTS_FILE, 'utf-8'));
    if (Array.isArray(raw)) {
      for (const jid of raw) {
        if (isRealContact(jid)) contactJids.add(jid);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire contacts.json, liste de contacts vide au démarrage');
  }
}

function persist() {
  try {
    atomicWriteFileSync(CONTACTS_FILE, JSON.stringify([...contactJids]));
    dirty = false;
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire contacts.json");
  }
}

function addMany(contacts) {
  let added = 0;
  for (const contact of contacts || []) {
    const jid = normalizeJid(contact?.id);
    if (isRealContact(jid) && !contactJids.has(jid)) {
      contactJids.add(jid);
      added += 1;
    }
  }
  if (added > 0) {
    dirty = true;
    persist();
    logger.info(`Contacts: +${added} contact(s) connu(s) (total: ${contactJids.size})`);
  }
}

load();

/**
 * Branche les listeners nécessaires sur le socket Baileys. À appeler une
 * fois, juste après la création du socket (même endroit que les autres
 * `sock.ev.on(...)` — voir core/client.js).
 */
export function registerContactsStore(sock) {
  // C'est la VRAIE source de la synchro initiale : à la connexion, le
  // téléphone envoie une notification d'historique (HISTORY_SYNC_NOTIFICATION)
  // que Baileys télécharge et transforme en un évènement unique contenant
  // notamment `contacts` (voir Utils/history.js). Sans écouter CET
  // évènement, la liste de contacts reste vide indéfiniment même après
  // plusieurs minutes/heures de connexion, car `contacts.upsert` ne se
  // déclenche que pour des mises à jour ponctuelles de l'app-state
  // (ajout/renommage d'un contact), pas pour le carnet d'adresses initial.
  sock.ev.on('messaging-history.set', ({ contacts }) => addMany(contacts));
  // Mises à jour ponctuelles ultérieures (nouveau contact ajouté, etc.).
  sock.ev.on('contacts.upsert', addMany);
  // Mises à jour ponctuelles (nom affiché, statut "à propos"...) — ne
  // contiennent pas forcément de nouveaux contacts, mais ne coûtent rien
  // à traiter avec la même logique de dédoublonnage.
  sock.ev.on('contacts.update', addMany);
  // Remplacement complet envoyé par certaines versions de Baileys lors
  // d'une resynchronisation d'historique.
  sock.ev.on('contacts.set', ({ contacts }) => addMany(contacts));
}

/**
 * Liste des JIDs de contacts connus, à passer en `statusJidList` lors de
 * l'envoi d'un statut. Peut être vide si le bot vient de démarrer et n'a
 * pas encore reçu de `contacts.upsert` — dans ce cas le statut envoyé sans
 * destinataire restera invisible (limite du protocole, pas un bug de ce
 * store).
 */
export function getContactJids() {
  return [...contactJids];
}
