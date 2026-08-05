import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const TEXT_EXTENSIONS = /\.(txt|md|csv|log|json)$/i;
const PDF_EXTENSIONS = /\.pdf$/i;
const DOCX_EXTENSIONS = /\.docx$/i;

const PDF_MIMETYPES = ['application/pdf'];
const DOCX_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * Détermine le type de document pris en charge par !resume à partir de
 * son mimetype et/ou de son nom de fichier.
 * @returns {'text'|'pdf'|'docx'|null} null si le format n'est pas supporté
 */
export function classifyDocument(doc) {
  const mimetype = doc?.mimetype || '';
  const filename = doc?.fileName || '';

  if (PDF_MIMETYPES.includes(mimetype) || PDF_EXTENSIONS.test(filename)) return 'pdf';
  if (DOCX_MIMETYPES.includes(mimetype) || DOCX_EXTENSIONS.test(filename)) return 'docx';
  if (mimetype.startsWith('text/') || mimetype === 'application/json' || TEXT_EXTENSIONS.test(filename)) {
    return 'text';
  }
  return null;
}

/**
 * Extrait le texte brut d'un buffer de document, selon son type déterminé
 * par classifyDocument().
 * @param {Buffer} buffer
 * @param {'text'|'pdf'|'docx'} type
 * @returns {Promise<string>}
 */
export async function extractDocumentText(buffer, type) {
  switch (type) {
    case 'text':
      return buffer.toString('utf-8');
    case 'pdf': {
      const data = await pdfParse(buffer);
      return data.text;
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    default:
      throw new Error(`Type de document non supporté: ${type}`);
  }
}