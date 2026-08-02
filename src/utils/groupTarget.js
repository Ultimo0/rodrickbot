/**
 * Résout les participants ciblés par une commande de groupe, dans cet
 * ordre de priorité : mentions WhatsApp (@xxx), réponse à un message,
 * puis numéros passés en argument.
 */

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