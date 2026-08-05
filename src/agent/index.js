/**
 * Point d’entrée du sous-système Agent IA.
 *
 * Ce module centralise les exports utiles au reste du bot et garde le
 * mécanisme d’agent de manière réutilisable et testable.
 */

export {
  runAgentTurn,
  enableAgentForSession,
  disableAgentForSession,
  isAgentSessionEnabled,
} from './agentService.js';

export {
  ensureSession,
  appendSessionMessage,
  getSession,
  getRecentMessages,
  setAgentEnabled,
  isAgentEnabled,
  clearSession,
  getSessionStats,
} from './sessionMemory.js';

export { buildConversationContext } from './contextBuilder.js';
export { executeTool, getToolRegistry } from './toolRegistry.js';
export { invokeExistingCommand } from './commandBridge.js';
