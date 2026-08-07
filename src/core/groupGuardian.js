import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { WAMessageStubType, jidNormalizedUser } from '@whiskeysockets/baileys';
import { getGroupSettings } from './groupSettings.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { logger } from '../utils/logger.js';

/**
 * Guardian : protège un groupe en restaurant automatiquement le nom, la
 * description, la photo, le lien d'invitation et les réglages "qui peut
 * écrire / qui peut modifier les infos" à l'état sauvegardé via !guardian on.
 *
 * Deux sources d'événements Baileys sont utilisées :
 * - 'groups.update' : fiable pour subject/desc/announce/restrict, mais ne
 *   fournit pas l'auteur de la modification.
 * - 'messages.upsert' : WhatsApp envoie aussi un message système
 *   (messageStubType) pour chaque changement, qui lui contient l'auteur
 *   (participant). On s'en sert uniquement pour a) enrichir la notification
 *   avec "qui a fait ça" (best-effort — voir rememberActor/consumeActor),
 *   et b) détecter/restaurer la photo et le lien d'invitation, qui ne sont
 *   pas inclus dans 'groups.update'.
 *
 * Note : les noms exacts des constantes WAMessageStubType peuvent varier
 * selon la version de Baileys. Si une constante n'existe pas, elle vaut
 * `undefined` et est filtrée ci-dessous : la détection correspondante est
 * simplement désactivée (aucun faux positif possible), voir README/section
 * "Limites connues" fournie avec cette fonctionnalité.
 */

const MEDIA_DIR = path.join(process.cwd(), 'saved_media', 'guardian');

const ICON_STUB_TYPES = [WAMessageStubType?.GROUP_CHANGE_ICON].filter((v) => v != null);
const INVITE_STUB_TYPES = [WAMessageStubType?.GROUP_CHANGE_INVITE_LINK].filter((v) => v != null);

// Auteur probable de la dernière modification "métadonnées" par groupe,
// mémorisé quelques secondes le temps que 'groups.update' arrive.
const recentActors = new Map(); // chatId -> jid
// Anti-boucle : évite que notre propre révocation du lien d'invitation ne
// se re-déclenche elle-même (elle génère aussi un message système).
const recentSelfInviteRevoke = new Map(); // chatId -> timestamp
// Anti-boucle : idem pour la photo — si la comparaison de hash échoue (CDN
// pas encore à jour, fetch bloqué...), ce cooldown est le dernier rempart
// qui empêche une restauration en boucle continue.
const recentSelfIconRestore = new Map(); // chatId -> timestamp

function rememberActor(chatId, jid) {
  if (!jid) return;
  recentActors.set(chatId, jid);
  setTimeout(() => {
    if (recentActors.get(chatId) === jid) recentActors.delete(chatId);
  }, 5000);
}

function consumeActor(chatId) {
  const jid = recentActors.get(chatId) || null;
  recentActors.delete(chatId);
  return jid;
}

function sanitizeChatId(chatId) {
  return chatId.replace(/[^a-zA-Z0-9]/g, '_');
}

async function fetchBuffer(url) {
  // WhatsApp bloque/renvoie une réponse inexploitable sur un fetch() nu sans
  // en-têtes — même technique que utils/... voir commands/reveal.js.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WhatsApp/2.24.15.21', Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Variante de normalizeJid qui ne plante pas si le JID est absent/mal formé. */
function safeJidNormalizedUser(jid) {
  if (!jid) return null;
  try {
    return jidNormalizedUser(jid);
  } catch {
    return null;
  }
}

/**
 * Est-ce que le bot est lui-même admin de ce groupe ? (requis pour restaurer
 * quoi que ce soit).
 *
 * Selon les comptes/versions de Baileys, WhatsApp peut identifier le même
 * compte sous deux formes différentes (JID "PN" classique @s.whatsapp.net,
 * ou JID "LID" @lid) — `sock.user.id` et l'entrée du bot dans
 * `groupMetadata().participants` ne sont pas toujours écrits sous la même
 * forme. On compare donc toutes les identités connues du bot (id, lid, à la
 * fois via notre normalizeJid maison et via jidNormalizedUser de Baileys)
 * à tous les champs d'identité de chaque participant, plutôt qu'une seule
 * comparaison stricte qui peut donner un faux négatif.
 */
export async function isBotGroupAdmin(sock, chatId) {
  try {
    const metadata = await sock.groupMetadata(chatId);

    const rawSelfIds = [
      sock.user?.id,
      sock.user?.lid,
      sock.authState?.creds?.me?.id,
      sock.authState?.creds?.me?.lid,
    ].filter(Boolean);

    const selfIds = new Set(
      rawSelfIds.flatMap((jid) => [normalizeJid(jid), safeJidNormalizedUser(jid)]).filter(Boolean)
    );

    const me = metadata.participants.find((p) => {
      const candidates = [p.id, p.jid, p.lid]
        .filter(Boolean)
        .flatMap((jid) => [normalizeJid(jid), safeJidNormalizedUser(jid)])
        .filter(Boolean);
      return candidates.some((c) => selfIds.has(c));
    });

    if (!me) {
      logger.warn(
        {
          chatId,
          selfIds: [...selfIds],
          participantIds: metadata.participants.map((p) => p.id),
        },
        "Guardian: le bot n'a pas été retrouvé dans la liste des participants du groupe — " +
          'vérification du statut admin impossible (voir les IDs ci-dessus pour diagnostiquer)'
      );
      return false;
    }

    return Boolean(me.admin);
  } catch (err) {
    logger.warn({ err, chatId }, 'Guardian: impossible de vérifier le statut admin du bot');
    return false;
  }
}

/** Capture l'état courant du groupe (appelé par !guardian on). */
export async function captureGroupSnapshot(sock, chatId) {
  const metadata = await sock.groupMetadata(chatId);

  let pictureFile = null;
  let pictureHash = null;
  try {
    const url = await sock.profilePictureUrl(chatId, 'image');
    const buffer = await fetchBuffer(url);
    pictureHash = hashBuffer(buffer);
    if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });
    const fileName = `${sanitizeChatId(chatId)}.jpg`;
    writeFileSync(path.join(MEDIA_DIR, fileName), buffer);
    pictureFile = path.join('saved_media', 'guardian', fileName);
  } catch (err) {
    // Pas de photo de groupe actuellement, ou récupération impossible : on
    // ne pourra pas restaurer la photo, mais le reste fonctionne quand même.
    logger.debug({ err, chatId }, 'Guardian: pas de photo de groupe à sauvegarder');
  }

  return {
    subject: metadata.subject || '',
    desc: metadata.desc || '',
    announce: Boolean(metadata.announce),
    restrict: Boolean(metadata.restrict),
    pictureFile,
    pictureHash,
    capturedAt: new Date().toISOString(),
  };
}

async function notify(sock, chatId, message, actor) {
  const mentions = actor ? [normalizeJid(actor)] : undefined;
  const actorLine = actor ? `\n👤 Auteur : @${normalizeJid(actor).split('@')[0]}` : '';
  try {
    await sock.sendMessage(chatId, { text: `🛡 ${message}${actorLine}`, mentions });
  } catch (err) {
    logger.warn({ err, chatId }, "Guardian: échec de l'envoi de la notification");
  }
}

const FIELD_LABELS = {
  subject: 'le nom du groupe',
  desc: 'la description',
  announce: 'qui peut envoyer des messages',
  restrict: 'qui peut modifier les infos du groupe',
};

async function restoreMetadata(sock, chatId, snapshot, changedFields) {
  const applied = [];
  try {
    if (changedFields.includes('subject')) {
      await sock.groupUpdateSubject(chatId, snapshot.subject || '');
      applied.push('subject');
    }
    if (changedFields.includes('desc')) {
      await sock.groupUpdateDescription(chatId, snapshot.desc || '');
      applied.push('desc');
    }
    if (changedFields.includes('announce')) {
      await sock.groupSettingUpdate(chatId, snapshot.announce ? 'announcement' : 'not_announcement');
      applied.push('announce');
    }
    if (changedFields.includes('restrict')) {
      await sock.groupSettingUpdate(chatId, snapshot.restrict ? 'locked' : 'unlocked');
      applied.push('restrict');
    }
  } catch (err) {
    logger.warn({ err, chatId }, 'Guardian: échec de la restauration des métadonnées');
  }

  if (!applied.length) return;

  const labels = applied.map((f) => FIELD_LABELS[f]).join(', ');
  const actor = consumeActor(chatId);
  await notify(sock, chatId, `Guardian a détecté une modification non autorisée (${labels}) et a restauré les paramètres du groupe.`, actor);
}

async function checkAndRestoreIcon(sock, chatId, snapshot) {
  if (!snapshot.pictureFile) return;

  // Garde-fou anti-boucle : si on vient de restaurer il y a moins de 10s, on
  // ignore — que ce soit un véritable écho de notre restauration, ou un
  // faux mismatch dû à la propagation du CDN WhatsApp.
  const last = recentSelfIconRestore.get(chatId) || 0;
  if (Date.now() - last < 10000) return;

  let currentHash = null;
  try {
    const url = await sock.profilePictureUrl(chatId, 'image');
    const buffer = await fetchBuffer(url);
    currentHash = hashBuffer(buffer);
  } catch (err) {
    logger.debug({ err, chatId }, 'Guardian: photo actuelle introuvable/illisible, restauration tentée quand même');
    currentHash = null; // pas de photo, ou fetch impossible — on considère que ça diffère
  }

  if (currentHash && currentHash === snapshot.pictureHash) return; // déjà la bonne photo

  const fullPath = path.join(process.cwd(), snapshot.pictureFile);
  if (!existsSync(fullPath)) return;

  recentSelfIconRestore.set(chatId, Date.now());
  try {
    const savedBuffer = readFileSync(fullPath);
    await sock.updateProfilePicture(chatId, savedBuffer);
    const actor = consumeActor(chatId);
    await notify(sock, chatId, 'Guardian a détecté une modification non autorisée (photo du groupe) et a restauré les paramètres du groupe.', actor);
  } catch (err) {
    logger.warn({ err, chatId }, 'Guardian: échec de la restauration de la photo');
  }
}

async function handleInviteChange(sock, chatId) {
  const last = recentSelfInviteRevoke.get(chatId) || 0;
  if (Date.now() - last < 8000) return; // écho de notre propre révocation

  recentSelfInviteRevoke.set(chatId, Date.now());
  try {
    // WhatsApp ne permet pas de choisir/restaurer un code d'invitation
    // précis : la seule protection possible est d'invalider immédiatement
    // le nouveau lien généré par l'auteur non autorisé.
    await sock.groupRevokeInvite(chatId);
    const actor = consumeActor(chatId);
    await notify(
      sock,
      chatId,
      "Guardian a détecté un changement du lien d'invitation et l'a immédiatement invalidé " +
        '(un ancien lien exact ne peut pas être restauré côté WhatsApp — un nouveau lien vient d\'être généré).',
      actor
    );
  } catch (err) {
    logger.warn({ err, chatId }, "Guardian: échec de la révocation du lien d'invitation");
  }
}

export function initGroupGuardian(sock) {
  // --- Nom, description, réglages (qui peut écrire / modifier les infos) ---
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      const chatId = update.id;
      if (!chatId) continue;

      const settings = getGroupSettings(chatId);
      if (!settings.guardian.enabled || !settings.guardian.snapshot) continue;

      const snapshot = settings.guardian.snapshot;
      const changed = [];

      if ('subject' in update && update.subject !== snapshot.subject) changed.push('subject');
      if ('desc' in update && (update.desc || '') !== (snapshot.desc || '')) changed.push('desc');
      if ('announce' in update && Boolean(update.announce) !== snapshot.announce) changed.push('announce');
      if ('restrict' in update && Boolean(update.restrict) !== snapshot.restrict) changed.push('restrict');

      if (changed.length) await restoreMetadata(sock, chatId, snapshot, changed);
    }
  });

  // --- Photo + lien d'invitation (pas dans 'groups.update') + auteur ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      const chatId = msg.key?.remoteJid;
      if (!chatId?.endsWith('@g.us')) continue;
      if (msg.messageStubType == null) continue; // pas un message système

      const actor = msg.participant || msg.key.participant || null;
      if (actor) rememberActor(chatId, actor);

      const settings = getGroupSettings(chatId);
      if (!settings.guardian.enabled || !settings.guardian.snapshot) continue;

      if (ICON_STUB_TYPES.includes(msg.messageStubType)) {
        await checkAndRestoreIcon(sock, chatId, settings.guardian.snapshot);
      } else if (INVITE_STUB_TYPES.includes(msg.messageStubType)) {
        await handleInviteChange(sock, chatId);
      }
    }
  });

  logger.info('[Guardian] Initialisé.');
}