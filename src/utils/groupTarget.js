/**
 * Résout les participants ciblés par une commande de groupe, dans cet
 * ordre de priorité : mentions WhatsApp (@xxx), réponse à un message,
 * puis numéros passés en argument.
 */

import { jidNormalizedUser } from '@whiskeysockets/baileys';

export function extractMentionedJids(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

export function extractQuotedParticipant(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.participant || null;
}

/** Transforme un numéro brut (ex: "+33 6 12 34 56 78") en JID WhatsApp. */
export function numberToJid(number) {
  const digits = number.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Normalise un JID en retirant le suffixe ":device" (ex: "123:9@s.whatsapp.net" -> "123@s.whatsapp.net"). */
export function normalizeJid(jid) {
  if (!jid) return jid;
  const [user, domain] = jid.split('@');
  return `${user.split(':')[0]}@${domain}`;
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
 * Renvoie l'ensemble de toutes les identités connues du bot, normalisées.
 *
 * Selon les comptes/versions de Baileys, WhatsApp peut identifier le même
 * compte sous deux formes différentes (JID "PN" classique @s.whatsapp.net,
 * ou JID "LID" @lid) — `sock.user.id` et l'entrée du bot dans
 * `groupMetadata().participants` ne sont pas toujours écrits sous la même
 * forme (typiquement quand le bot tourne sur le compte personnel du
 * propriétaire ET est admin du groupe testé). On compare donc toutes les
 * identités connues du bot (id, lid, à la fois via normalizeJid et via
 * jidNormalizedUser de Baileys) plutôt qu'une seule comparaison stricte qui
 * peut donner un faux négatif silencieux — voir aussi isBotGroupAdmin dans
 * core/groupGuardian.js, qui utilise ce même helper.
 */
export function getBotSelfIds(sock) {
  const rawSelfIds = [
    sock.user?.id,
    sock.user?.lid,
    sock.authState?.creds?.me?.id,
    sock.authState?.creds?.me?.lid,
  ].filter(Boolean);

  return new Set(
    rawSelfIds.flatMap((jid) => [normalizeJid(jid), safeJidNormalizedUser(jid)]).filter(Boolean)
  );
}

/** true si `jid` (sous n'importe laquelle de ses formes courantes) correspond au bot. */
export function isBotJid(sock, jid) {
  if (!jid) return false;
  const selfIds = getBotSelfIds(sock);
  return [normalizeJid(jid), safeJidNormalizedUser(jid)].filter(Boolean).some((c) => selfIds.has(c));
}

/**
 * Renvoie toutes les formes connues (normalisées) d'un participant de
 * groupe donné — celles présentes dans p.id/p.jid/p.lid pour l'entrée
 * correspondante de groupMetadata().participants. Même principe que
 * getBotSelfIds() (qui fait ça pour le bot lui-même), appliqué ici à un
 * participant tiers : sert notamment à ce que addAdmin() connaisse la
 * forme LID et la forme PN d'un même admin (voir core/adminStore.js et le
 * correctif équivalent pour le propriétaire en 1.76.0), pas seulement
 * celle utilisée au moment où il a été ajouté.
 *
 * Retombe sur [normalizeJid(jid)] si le participant n'est pas trouvé
 * (hors groupe, `chatId` absent, lookup impossible...) — jamais bloquant.
 */
export async function resolveParticipantForms(sock, chatId, jid) {
  const target = [normalizeJid(jid), safeJidNormalizedUser(jid)].filter(Boolean);
  if (!chatId?.endsWith?.('@g.us') || !sock) return [...new Set(target)];

  try {
    const metadata = await sock.groupMetadata(chatId);
    const participant = metadata.participants.find((p) => {
      const candidates = [p.id, p.jid, p.lid]
        .filter(Boolean)
        .flatMap((j) => [normalizeJid(j), safeJidNormalizedUser(j)])
        .filter(Boolean);
      return candidates.some((c) => target.includes(c));
    });

    if (!participant) return [...new Set(target)];

    const allForms = [participant.id, participant.jid, participant.lid]
      .filter(Boolean)
      .flatMap((j) => [normalizeJid(j), safeJidNormalizedUser(j)])
      .filter(Boolean);

    return [...new Set([...target, ...allForms])];
  } catch {
    return [...new Set(target)];
  }
}

export function resolveTargetJids(ctx) {
  const mentioned = extractMentionedJids(ctx.msg);
  if (mentioned.length) return mentioned;

  const quotedParticipant = extractQuotedParticipant(ctx.msg);
  if (quotedParticipant) return [quotedParticipant];

  if (ctx.args.length) {
    const fromArgs = ctx.args.filter((a) => /\d{5,}/.test(a)).map(numberToJid);
    if (fromArgs.length) return fromArgs;
  }

  return [];
}

/**
 * Résout TOUTES les personnes à épargner (contrairement à resolveTargetJids,
 * qui s'arrête à la première source trouvée) : mentions + réponse + numéros
 * en argument sont combinés, utile pour !kickall <numeros à épargner>.
 */
export function resolveSparedJids(ctx) {
  const spared = new Set();

  for (const jid of extractMentionedJids(ctx.msg)) spared.add(normalizeJid(jid));

  const quotedParticipant = extractQuotedParticipant(ctx.msg);
  if (quotedParticipant) spared.add(normalizeJid(quotedParticipant));

  for (const arg of ctx.args) {
    if (/\d{5,}/.test(arg)) spared.add(normalizeJid(numberToJid(arg)));
  }

  return spared;
}