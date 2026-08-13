# MonBot — Bot WhatsApp

Bot WhatsApp modulaire basé sur [Baileys](https://github.com/WhiskeySockets/Baileys), avec système de commandes à chargement automatique, mode privé strict, et branding personnalisé.

## Fonctionnalités

- **Commandes à chargement automatique** — ajoute un fichier dans `src/commands/`, aucune autre modification nécessaire.
- **Réactions de confirmation** (✅ succès / ❌ erreur) sur les messages, plutôt que du texte verbeux.
- **Réponses en bloc citation** WhatsApp, pour une identité visuelle cohérente.
- **Menu extensible** (`!menu` / `!help` / `!aide`) — groupé par catégorie, généré automatiquement à partir des commandes disponibles.
- **Mode privé par commande** — une commande ne répond qu'en message privé par défaut (`privateOnly: false` pour l'autoriser en groupe).
- **Mode privé strict** (`!private on|off|status`) — verrouille entièrement le bot pour qu'il ne réponde qu'à l'admin.
- **Reconnexion automatique** avec backoff exponentiel en cas de coupure.
- **Carte de branding** (logo + lien vers la chaîne WhatsApp) sur certaines réponses.
- **Anti-spam** basique par utilisateur (middleware).
- **Quiz interactif** (`!quiz`) — XP, pièces, niveaux, classement, succès. Voir [`src/core/quiz/README.md`](src/core/quiz/README.md) pour l'architecture détaillée.
- **Calcul mental rapide** (`!calcul`) — opérations chronométrées, points, classement. Voir [`src/core/calc/README.md`](src/core/calc/README.md).

## Prérequis

- Node.js ≥ 18
- Un numéro WhatsApp dédié au bot (recommandé — voir [Sécurité](#sécurité))

## Installation

```bash
git clone <url-du-repo>
cd whatsapp-bot-37
npm install
cp .env.example .env
```

Renseigne ensuite les variables dans `.env` (voir ci-dessous), puis lance :

```bash
node src/index.js
```

Au premier démarrage, scanne le QR code affiché dans le terminal (ou utilise le pairing code si `AUTH_METHOD=code`).

## Configuration (`.env`)

| Variable | Description | Défaut |
|---|---|---|
| `BOT_PREFIX` | Préfixe des commandes | `!` |
| `BOT_NAME` | Nom affiché du bot | `MonBot` |
| `LOG_LEVEL` | Niveau de log pino (`info`, `debug`, ...) | `info` |
| `AUTH_METHOD` | `qr` ou `code` | `qr` |
| `PHONE_NUMBER` | Requis si `AUTH_METHOD=code` | — |
| `ADMIN_JIDS` | JID complets des administrateurs, séparés par des virgules (voir `!whoami`) | — |
| `ALLOW_SELF_TEST` | Autorise à tester les commandes en s'écrivant à soi-même | `false` |

⚠️ `ADMIN_JIDS` doit contenir le JID **complet**, suffixe compris (`@lid` ou `@s.whatsapp.net`) — pas juste le numéro. Utilise la commande `!whoami` pour récupérer le bon format.

## Structure du projet

src/
├── commands/ # une commande = un fichier, chargement automatique
├── config/ # lecture centralisée des variables d'environnement
├── core/ # client Baileys, pairing, chargement des plugins
├── handlers/ # traitement des messages entrants
├── middlewares/ # anti-spam, etc.
└── utils/ # helpers (extraction de texte, formatage, logo...)
assets/
└── logo.png # logo utilisé dans les cartes de branding
tests/ # tests unitaires (node:test), un fichier par module

## Tests

Les tests unitaires utilisent le lanceur intégré de Node (`node:test`), sans dépendance supplémentaire :

```bash
npm test              # lance tous les tests
npm run test:coverage # idem, avec rapport de couverture
```

Un fichier de test par module, nommé `tests/<module>.test.js`. Les modules qui persistent
des données dans `process.cwd()` (`core/groupSettings.js`, `core/warnStore.js`) sont importés
dynamiquement après un `process.chdir()` vers un dossier temporaire, afin de ne jamais toucher
aux fichiers de données réels.

## Créer une nouvelle commande

Crée un fichier dans `src/commands/`, par exemple `src/commands/exemple.js` :

```javascript
export default {
  name: 'exemple',
  aliases: ['ex'],
  description: 'Description affichée dans le menu.',
  category: 'Utilitaires',   // regroupement dans !menu
  adminOnly: false,          // true = réservé aux admins
  privateOnly: true,         // true (défaut) = message privé uniquement
  execute: async (ctx) => {
    await ctx.success('Réponse ici.');
  },
};
```

Aucune inscription manuelle nécessaire — la commande apparaît automatiquement dans `!menu` et devient utilisable.

## Commandes disponibles

| Commande | Description | Accès |
|---|---|---|
| `!ping` | Latence du bot | Public |
| `!echo <texte>` | Répète le texte | Public |
| `!help` / `!menu` / `!aide` | Affiche le menu | Public |
| `!status` | Uptime, latence, mémoire, compteur de messages | Admin |
| `!whoami` | Affiche ton JID exact | Public |
| `!broadcast <texte>` | Diffuse une annonce | Admin |
| `!private on\|off\|status` | Verrouille/déverrouille le bot | Admin |

## Sécurité

- Utilise un **numéro dédié** pour le bot en production, pas ton numéro personnel — `ALLOW_SELF_TEST` devient alors inutile et doit rester à `false`.
- Ne committe jamais `.env`, `auth_info/` ou `state.json` (déjà exclus via `.gitignore`).
- Le mode `!private on` est la dernière ligne de défense si le bot est exposé publiquement par erreur.

## Licence

Projet personnel — usage privé.