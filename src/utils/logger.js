import pino from 'pino';
import { config } from '../config/index.js';

/**
 * Logger unique partagé par tout le projet.
 * Baileys a besoin d'un logger "pino-compatible" (avec .child()),
 * donc on lui passe directement cette instance.
 */
export const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
  },
});
