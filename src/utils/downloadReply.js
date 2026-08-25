import { getPendingChoice, clearPendingChoice } from '../core/downloadSessions.js';
import { downloadTikTokAudio, downloadTikTokVideo, explainTikTokError } from './tiktok.js';
import { downloadYoutubeAudio, downloadYoutubeVideo, explainYoutubeError } from './youtube.js';
import { downloadFacebookAudio, downloadFacebookVideo } from './facebook.js';
import { logger } from './logger.js';

const AUDIO_PATTERN = /^(1|audio|mp3|musique)$/i;
const VIDEO_PATTERN = /^(2|video|vidéo|mp4)$/i;

function sanitizeFileName(name) {
  return (name || 'media').replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim() || 'media';
}

function resolveChoice(text) {
  const trimmed = text.trim();
  if (AUDIO_PATTERN.test(trimmed)) return 'audio';
  if (VIDEO_PATTERN.test(trimmed)) return 'video';
  return null;
}

async function handleTiktokChoice(sock, chatId, msg, choice, data) {
  const fileName = sanitizeFileName(data.title);

  if (choice === 'audio') {
    const buffer = await downloadTikTokAudio(data.url);
    await sock.sendMessage(
      chatId,
      { audio: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3` },
      { quoted: msg }
    );
  } else {
    const buffer = await downloadTikTokVideo(data.url);
    await sock.sendMessage(
      chatId,
      { video: buffer, mimetype: 'video/mp4', caption: data.title || '' },
      { quoted: msg }
    );
  }
}

async function handleYoutubeChoice(sock, chatId, msg, choice, data) {
  const fileName = sanitizeFileName(data.title);

  if (choice === 'audio') {
    const buffer = await downloadYoutubeAudio(data.url);
    await sock.sendMessage(
      chatId,
      { audio: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3` },
      { quoted: msg }
    );
  } else {
    const buffer = await downloadYoutubeVideo(data.url);
    await sock.sendMessage(
      chatId,
      { video: buffer, mimetype: 'video/mp4', caption: data.title || '' },
      { quoted: msg }
    );
  }
}

async function handleFacebookChoice(sock, chatId, msg, choice, data) {
  const fileName = sanitizeFileName(data.title);

  if (choice === 'audio') {
    const buffer = await downloadFacebookAudio(data.url);
    await sock.sendMessage(
      chatId,
      { audio: buffer, mimetype: 'audio/mpeg', fileName: `${fileName}.mp3` },
      { quoted: msg }
    );
  } else {
    const buffer = await downloadFacebookVideo(data.url);
    await sock.sendMessage(
      chatId,
      { video: buffer, mimetype: 'video/mp4', caption: data.title || '' },
      { quoted: msg }
    );
  }
}

/**
 * Traite la réponse de l'utilisateur ("1"/"2"/"audio"/"vidéo") à une
 * session de téléchargement en attente (TikTok ou YouTube). Retourne
 * true si le message a été consommé comme réponse à ce choix, false
 * si aucune session n'était en attente pour cet expéditeur.
 */
export async function handleDownloadReply(sock, chatId, sender, text, msg) {
  const pending = getPendingChoice(chatId, sender);
  if (!pending || !text) return false;

  const choice = resolveChoice(text);
  if (!choice) return false; // pas une réponse reconnue : on n'annule pas l'attente

  clearPendingChoice(chatId, sender);
  const { data } = pending;

  try {
    if (data.type === 'tiktok') {
      await handleTiktokChoice(sock, chatId, msg, choice, data);
    } else if (data.type === 'youtube') {
      await handleYoutubeChoice(sock, chatId, msg, choice, data);
    } else if (data.type === 'facebook') {
      await handleFacebookChoice(sock, chatId, msg, choice, data);
    }
  } catch (err) {
    logger.warn({ err }, `Erreur lors du téléchargement (${data.type})`);
    const message = data.type === 'youtube' ? explainYoutubeError(err) : data.type === 'tiktok' ? explainTikTokError(err) : err.message;
    await sock.sendMessage(chatId, { text: `> ❌ Échec du téléchargement : ${message}` }, { quoted: msg });
  }

  return true;
}