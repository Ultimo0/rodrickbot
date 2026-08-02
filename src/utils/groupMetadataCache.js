const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map(); // chatId -> { metadata, expiresAt }

export async function getCachedMetadata(sock, chatId) {
  const cached = cache.get(chatId);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const metadata = await sock.groupMetadata(chatId);
  cache.set(chatId, { metadata, expiresAt: Date.now() + TTL_MS });
  return metadata;
}

export async function isGroupAdmin(sock, chatId, jid) {
  const metadata = await getCachedMetadata(sock, chatId);
  const participant = metadata.participants.find((p) => p.id === jid);
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}