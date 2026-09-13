const CHOICES = {
  pierre: { emoji: '🪨', beats: 'ciseaux' },
  feuille: { emoji: '📄', beats: 'pierre' },
  ciseaux: { emoji: '✂️', beats: 'feuille' },
};

const ALIASES = {
  pierre: 'pierre', roche: 'pierre', rock: 'pierre',
  feuille: 'feuille', papier: 'feuille', paper: 'feuille',
  ciseaux: 'ciseaux', ciseau: 'ciseaux', scissors: 'ciseaux',
};

function randomChoice() {
  const keys = Object.keys(CHOICES);
  return keys[Math.floor(Math.random() * keys.length)];
}

export default {
  name: 'rps',
  aliases: ['pfc', 'shifumi'],
  description:
    'Pierre-feuille-ciseaux contre le bot. Usage: {prefix}rps pierre|feuille|ciseaux',
  category: 'Jeux',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const raw = ctx.args[0]?.toLowerCase();
    const userChoice = ALIASES[raw];

    if (!userChoice) {
      await ctx.error('Usage : !rps pierre|feuille|ciseaux\nExemple : !rps pierre');
      return;
    }

    const botChoice = randomChoice();
    const userEmoji = CHOICES[userChoice].emoji;
    const botEmoji = CHOICES[botChoice].emoji;

    let result;
    if (userChoice === botChoice) {
      result = '🤝 Égalité !';
    } else if (CHOICES[userChoice].beats === botChoice) {
      result = '🎉 Tu as gagné !';
    } else {
      result = '😅 Perdu, le bot gagne !';
    }

    await ctx.reply({
      text: `${userEmoji} vs ${botEmoji}\n\n${result}`,
    });
  },
};
