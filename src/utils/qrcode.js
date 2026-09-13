import QRCode from 'qrcode';

// Limite raisonnable : un QR code encodant un texte trop long devient
// illisible au scan (trop de modules), bien avant la limite technique de
// QRCode.js elle-même.
const MAX_CHARS = 1000;

/**
 * Génère un QR code PNG à partir d'un texte ou d'un lien.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function generateQrCode(text) {
  if (!text || !text.trim()) {
    throw new Error('Aucun texte fourni.');
  }
  if (text.length > MAX_CHARS) {
    throw new Error(`Texte trop long pour un QR code (max ${MAX_CHARS} caractères).`);
  }

  return QRCode.toBuffer(text, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
