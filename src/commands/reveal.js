import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '../utils/logger.js';
import { getViewOnceMessage } from '../core/viewOnceCache.js';

// === Fonctions utilitaires ===
function getMediaType(message) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.viewOnceMessage?.message?.imageMessage) return 'image';
  if (message.viewOnceMessage?.message?.videoMessage) return 'video';
  if (message.viewOnceMessage?.message?.audioMessage) return 'audio';
  if (message.viewOnceMessageV2?.message?.imageMessage) return 'image';
  if (message.viewOnceMessageV2?.message?.videoMessage) return 'video';
  if (message.viewOnceMessageV2?.message?.audioMessage) return 'audio';
  return null;
}

function extractInnerMessage(message) {
  if (message.viewOnceMessage?.message) return message.viewOnceMessage.message;
  if (message.viewOnceMessageV2?.message) return message.viewOnceMessageV2.message;
  return message;
}

// === Commande ===
export default {
  name: 'reveal',
  aliases: ['rv', 'see', 'viewonce', 'vo'],
  description: 'Révèle un message "Vue unique" (photo, vidéo, audio) en répondant au message.',
  category: 'Média',
  adminOnly: false,
  privateOnly: false,

  async execute(ctx) {
    const { sock, msg, chatId } = ctx;

    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo || !contextInfo.quotedMessage) {
      await ctx.error('❌ Veuillez répondre à un message "Vue unique".');
      return;
    }

    const quoted = contextInfo.quotedMessage;
    const stanzaId = contextInfo.stanzaId;

    const mediaType = getMediaType(quoted);
    if (!mediaType) {
      await ctx.error('❌ Le message cité n\'est pas un média "Vue unique" supporté.');
      return;
    }

    try {
      // Réaction ⏳ pour indiquer le traitement
      await sock.sendMessage(chatId, {
        react: {
          key: msg.key,
          text: '⏳',
        },
      });

      let buffer = null;

      // --- Récupérer depuis le cache ---
      const cached = getViewOnceMessage(stanzaId);
      if (cached) {
        logger.info('[reveal] ✅ Message trouvé dans le cache');
      } else {
        logger.warn('[reveal] ⚠️ Message NON trouvé dans le cache, tentative directe...');
      }

      const msgToDownload = cached || quoted;

      // --- Tentative 1 : avec le socket ---
      try {
        buffer = await downloadMediaMessage(sock, msgToDownload, 'buffer', {
          reuploadRequest: sock.updateMediaMessage,
          logger: logger,
        });
        if (buffer && buffer.length > 0) {
          logger.info('[reveal] ✅ Téléchargé via downloadMediaMessage (avec sock)');
        } else {
          buffer = null;
        }
      } catch (e) {
        logger.warn(`[reveal] Tentative 1 échouée: ${e.message}`);
      }

      // --- Tentative 2 : sans sock ---
      if (!buffer) {
        try {
          buffer = await downloadMediaMessage({ message: quoted }, 'buffer', {}, {
            logger: logger,
            reuploadRequest: sock.updateMediaMessage,
          });
          if (buffer && buffer.length > 0) {
            logger.info('[reveal] ✅ Téléchargé via downloadMediaMessage (sans sock)');
          } else {
            buffer = null;
          }
        } catch (e) {
          logger.warn(`[reveal] Tentative 2 échouée: ${e.message}`);
        }
      }

      // --- Tentative 3 : avec key construit ---
      if (!buffer) {
        try {
          const inner = extractInnerMessage(quoted);
          const fullMsg = {
            key: {
              id: stanzaId,
              remoteJid: chatId,
              fromMe: false,
              participant: contextInfo.participant || undefined,
            },
            message: inner,
          };
          buffer = await downloadMediaMessage(sock, fullMsg, 'buffer', {
            reuploadRequest: sock.updateMediaMessage,
            logger: logger,
          });
          if (buffer && buffer.length > 0) {
            logger.info('[reveal] ✅ Téléchargé via key construit');
          } else {
            buffer = null;
          }
        } catch (e) {
          logger.warn(`[reveal] Tentative 3 échouée: ${e.message}`);
        }
      }

      // --- Tentative 4 : URL directe ---
      if (!buffer) {
        try {
          const inner = extractInnerMessage(quoted);
          const mediaObj = inner[`${mediaType}Message`];
          if (mediaObj?.url) {
            const response = await fetch(mediaObj.url, {
              headers: {
                'User-Agent': 'WhatsApp/2.24.15.21',
                'Accept': '*/*',
              },
            });
            if (response.ok) {
              buffer = Buffer.from(await response.arrayBuffer());
              if (buffer && buffer.length > 0) {
                logger.info('[reveal] ✅ Téléchargé via URL directe');
              } else {
                buffer = null;
              }
            } else {
              logger.warn(`[reveal] URL directe HTTP ${response.status}`);
            }
          }
        } catch (e) {
          logger.warn(`[reveal] Tentative 4 échouée: ${e.message}`);
        }
      }

      if (!buffer) {
        throw new Error('Aucun média récupéré');
      }

      // --- Envoi du média ---
      const innerMessage = extractInnerMessage(quoted);
      const mediaObj = innerMessage[`${mediaType}Message`];

      const caption = '👁️ *Message à vision unique révélé*';
      const sendOptions = {};

      if (mediaType === 'image') {
        sendOptions.image = buffer;
        sendOptions.caption = caption;
      } else if (mediaType === 'video') {
        sendOptions.video = buffer;
        sendOptions.caption = caption;
        sendOptions.gifPlayback = false;
      } else if (mediaType === 'audio') {
        sendOptions.audio = buffer;
        sendOptions.mimetype = mediaObj.mimetype || 'audio/ogg; codecs=opus';
        sendOptions.ptt = true;
      }

      await sock.sendMessage(chatId, sendOptions);

      if (mediaType === 'audio') {
        await sock.sendMessage(chatId, { text: '👁️ *Message vocal à vision unique révélé*' });
      }

      // Réaction 👁️ de succès
      await sock.sendMessage(chatId, {
        react: {
          key: msg.key,
          text: '👁️',
        },
      });

      // Pas de texte supplémentaire pour garder l'épure

    } catch (error) {
      logger.error(`[reveal] ❌ Erreur finale : ${error.message}`);
      // En cas d'erreur, on garde ❌ pour signaler le problème
      await sock.sendMessage(chatId, {
        react: {
          key: msg.key,
          text: '❌',
        },
      });
      await ctx.error('❌ Impossible de révéler ce média (expiré ou non disponible).');
    }
  },
};