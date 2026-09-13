const TINYURL_API = 'https://tinyurl.com/api-create.php';

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default {
  name: 'raccourcir',
  aliases: ['shorten', 'shorturl'],
  description: "Raccourcit un lien. Usage: {prefix}raccourcir <lien>",
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 5000,
  privateOnly: false,
  execute: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url)) {
      await ctx.error('Usage : !raccourcir <lien>\nExemple : !raccourcir https://example.com/une-longue-url');
      return;
    }

    await ctx.processing();

    try {
      const res = await fetch(`${TINYURL_API}?url=${encodeURIComponent(url)}`);
      const shortUrl = (await res.text()).trim();

      if (!res.ok || !shortUrl.startsWith('http')) {
        await ctx.error('Impossible de raccourcir ce lien pour le moment.');
        return;
      }

      await ctx.reply({ text: `🔗 ${shortUrl}` });
    } catch (err) {
      await ctx.error(`Impossible de raccourcir ce lien : ${err.message}`);
    }
  },
};
