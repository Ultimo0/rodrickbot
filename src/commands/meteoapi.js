import { createApiKeyCommand } from '../utils/apiKeyCommand.js';

export default createApiKeyCommand({
  name: 'meteoapi',
  aliases: ['weatherapi', 'meteokey'],
  field: 'openWeatherApiKey',
  label: 'OpenWeather (météo)',
  helpUrl: 'https://openweathermap.org/api',
});
