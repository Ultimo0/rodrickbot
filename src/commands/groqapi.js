import { createApiKeyCommand } from '../utils/apiKeyCommand.js';

export default createApiKeyCommand({
  name: 'groqapi',
  aliases: ['groqkey'],
  field: 'groqApiKey',
  label: 'Groq (IA)',
  helpUrl: 'https://console.groq.com/',
});
