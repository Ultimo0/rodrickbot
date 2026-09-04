/**
 * antibugGuard.js
 * ------------------------------------------------------------------
 * Protection défensive pour le propriétaire du bot (et lui uniquement —
 * uniquement en message PRIVÉ, jamais en groupe, voir plus bas) contre les
 * services de harcèlement du type "bug bot" : envoi de messages construits
 * pour être anormalement volumineux ou mal formés, dans le but de faire
 * planter ou geler l'application WhatsApp du destinataire.
 *
 * Ce module ne connaît AUCUN bug précis d'aucune plateforme — il ne
 * détecte que des anomalies génériques (taille, structure, densité de
 * caractères de contrôle) qu'un message WhatsApp légitime n'a normalement
 * aucune raison de présenter. C'est la même logique que n'importe quel
 * filtre anti-abus : on ne cherche pas à reconnaître une attaque connue,
 * on remarque qu'un message ne ressemble à rien de normal.
 *
 * Important, honnêtement : RodrickBOT tourne via Baileys, pas
 * l'application WhatsApp officielle — il ne fait aucun rendu graphique et
 * n'est donc probablement PAS vulnérable aux mêmes bugs de rendu que
 * l'app native iOS/Android. Ce filtre est une protection en profondeur
 * (défense contre l'inconnu + anti-harcèlement), pas une preuve que le
 * bot serait autrement à risque.
 */

import { existsSync, readFileSync } from 'fs';
import { dataFilePath } from '../utils/dataFile.js';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { logger } from '../utils/logger.js';

const SETTINGS_FILE = dataFilePath('antibug.json');

// Désactivé par défaut : fonctionnalité optionnelle, pas un comportement
// par défaut du bot (le blocage automatique est une action forte).
let enabled = false;
let autoBlock = false;

function load() {
  if (!existsSync(SETTINGS_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
    enabled = Boolean(raw.enabled);
    autoBlock = Boolean(raw.autoBlock);
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire antibug.json, protection désactivée pour cette session');
  }
}

function save() {
  try {
    atomicWriteFileSync(SETTINGS_FILE, JSON.stringify({ enabled, autoBlock }, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire antibug.json");
  }
}

load();

export function isAntibugEnabled() {
  return enabled;
}

export function isAutoBlockEnabled() {
  return autoBlock;
}

export function setAntibugEnabled(value) {
  enabled = Boolean(value);
  save();
}

export function setAutoBlockEnabled(value) {
  autoBlock = Boolean(value);
  save();
}

// Seuils génériques : un message WhatsApp légitime (texte, média référencé
// par clé, contact, citation) tient normalement en quelques Ko sérialisé.
// Ces limites sont volontairement larges pour ne jamais accrocher un usage
// normal (gros textes collés, longues légendes...), seulement les cas
// extrêmes.
const MAX_SERIALIZED_SIZE_BYTES = 30 * 1024; // 30 Ko
const MAX_TEXT_LENGTH = 15_000;
const MAX_VCARD_LENGTH = 3_000;
const MAX_CONTACTS_IN_ARRAY = 50;
const MAX_MENTIONS = 200;
const COMBINING_MARK_RATIO_THRESHOLD = 1.5; // + de caractères combinants que de caractères de base = anormal

// Catégories Unicode "Mark, Nonspacing" et "Mark, Enclosing" (accents/
// diacritiques empilés — la technique dite "zalgo") : \p{M} en JS moderne.
const COMBINING_MARKS_REGEX = /\p{M}/gu;
// Caractères de contrôle C0/C1 hors des sauts de ligne/tabulations usuels.
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;

/**
 * Analyse un message entrant et retourne une raison si son contenu paraît
 * anormal, ou null si rien de suspect. Ne DEVINE rien sur l'intention —
 * ne fait que mesurer des propriétés objectives (taille, structure).
 */
export function analyzeSuspiciousPayload(msg) {
  const content = msg?.message;
  if (!content) return null;

  let serializedSize = 0;
  try {
    serializedSize = Buffer.byteLength(JSON.stringify(content), 'utf-8');
  } catch {
    return 'Message dont la structure ne peut pas être sérialisée (déjà anormal en soi)';
  }
  if (serializedSize > MAX_SERIALIZED_SIZE_BYTES) {
    return `Message anormalement volumineux (${Math.round(serializedSize / 1024)} Ko)`;
  }

  const text = content.conversation || content.extendedTextMessage?.text || '';
  if (text) {
    if (text.length > MAX_TEXT_LENGTH) {
      return `Texte anormalement long (${text.length} caractères)`;
    }
    const combiningCount = (text.match(COMBINING_MARKS_REGEX) || []).length;
    const baseLength = text.length - combiningCount;
    if (baseLength > 0 && combiningCount / baseLength > COMBINING_MARK_RATIO_THRESHOLD) {
      return 'Texte saturé de caractères combinants (accents empilés type "zalgo")';
    }
    const controlCount = (text.match(CONTROL_CHARS_REGEX) || []).length;
    if (controlCount > 20) {
      return `Texte contenant un nombre anormal de caractères de contrôle (${controlCount})`;
    }
  }

  const vcard = content.contactMessage?.vcard;
  if (vcard && vcard.length > MAX_VCARD_LENGTH) {
    return `Fiche contact anormalement volumineuse (${vcard.length} caractères)`;
  }

  const contactsArray = content.contactsArrayMessage?.contacts;
  if (Array.isArray(contactsArray) && contactsArray.length > MAX_CONTACTS_IN_ARRAY) {
    return `Nombre anormal de contacts dans un même message (${contactsArray.length})`;
  }

  const mentions = content.extendedTextMessage?.contextInfo?.mentionedJid;
  if (Array.isArray(mentions) && mentions.length > MAX_MENTIONS) {
    return `Nombre anormal de mentions dans un même message (${mentions.length})`;
  }

  return null;
}
