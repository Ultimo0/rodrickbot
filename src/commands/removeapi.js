import { createApiKeyCommand } from '../utils/apiKeyCommand.js';

export default createApiKeyCommand({
  name: 'removeapi',
  aliases: ['removebgapi', 'removebgkey'],
  field: 'removeBgApiKey',
  label: 'Remove.bg',
  helpUrl: 'https://www.remove.bg/api',
});
