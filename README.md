# RodrickBOT

Bot WhatsApp extensible en Node.js, basé sur [Baileys](https://github.com/WhiskeySockets/Baileys) (bibliothèque non-officielle — voir l'avertissement en bas de page). Tourne sur un compte WhatsApp personnel (pas besoin de l'API Business officielle).

## Démarrage rapide

```bash
npm install
cp .env.example .env   # puis remplis les valeurs (voir tableau ci-dessous)
npm start
```

Au premier lancement, le bot affiche un QR code ou un code d'appairage (selon `authMethod` dans `src/config/settings.json`) à scanner/saisir depuis l'app WhatsApp du numéro que tu veux utiliser pour le bot.

## Configuration — variables d'environnement (`.env`)

Depuis la 1.67.0, **plus aucune clé API ni secret d'infrastructure ne vit dans `.env`** — ils sont tous dans `src/config/settings.json` (voir section suivante). Il ne reste dans `.env` que ce qui doit exister *avant* la première connexion WhatsApp (donc avant qu'aucune commande ne puisse le configurer) ou ce qui n'est pas un secret :

| Variable | Requis | Description |
|---|---|---|
| `PHONE_NUMBER` | Selon `authMethod` | Numéro au format international sans `+` (ex: `237638838029`) — requis seulement si `src/config/settings.json` a `"authMethod": "code"` (appairage par code plutôt que QR). |
| `LOG_TO_FILE` | Non | `true` pour écrire aussi les logs dans `data/logs/bot.log` (rotation automatique par taille). Par défaut, logs console uniquement. |
| `ADMIN_JIDS` | Non, **legacy** | Ancien mécanisme de désignation des admins. **Ne configure plus ça pour une nouvelle installation** — le propriétaire du bot est désormais détecté automatiquement (le numéro sur lequel il est connecté), et les admins supplémentaires s'ajoutent avec `{prefix}addadmin` directement dans WhatsApp. Si cette variable est encore présente au premier démarrage, son contenu est importé une seule fois dans `data/admins.json`, puis ignoré ensuite. |

## Configuration — `src/config/settings.json`

Le préfixe des commandes, le nom du bot, le niveau de log et les modèles Groq se règlent ici. **Ce fichier contient aussi désormais les clés API et secrets d'infrastructure** — il n'est donc plus versionné une fois configuré (voir `.gitignore`) ; le modèle versionné avec des valeurs vides est `src/config/settings.example.json`, recopié automatiquement en `settings.json` s'il est absent au démarrage.

### Clés API configurables depuis WhatsApp

Ces trois clés se définissent (ou se suppriment) directement en message privé avec le bot, sans toucher à un fichier :

| Commande | Clé configurée | Où l'obtenir |
|---|---|---|
| `{prefix}groqapi <clé>` | Groq — utilisée par `!ia`, `!corriger`, `!resume`, `!ocr`, `!debat`, `!define`, `!synonyme`, `!horoscope`, `!analyse-image`, `!vocal-en-texte`, l'agent conversationnel | [console.groq.com](https://console.groq.com/) |
| `{prefix}removeapi <clé>` | Remove.bg — utilisée par `!removebg` | [remove.bg/api](https://www.remove.bg/api) |
| `{prefix}meteoapi <clé>` | OpenWeatherMap — utilisée par `!meteo` | [openweathermap.org/api](https://openweathermap.org/api) |

Chacune accepte aussi `{prefix}groqapi off` (ou `removeapi off` / `meteoapi off`) pour supprimer la clé enregistrée, et `{prefix}groqapi` seul (sans argument) pour voir si elle est configurée. Ces trois commandes sont réservées aux admins **et fonctionnent uniquement en message privé** avec le bot — jamais dans un groupe, pour qu'une clé tapée en clair ne s'affiche jamais aux yeux de tout le monde. Le statut de chaque clé (configurée ou non) apparaît aussi dans le message de démarrage envoyé au propriétaire.

Si tu mets à jour une installation existante qui avait déjà `GROQ_API_KEY`/`REMOVE_BG_API_KEY`/`OPENWEATHER_API_KEY` (ou `CHANNEL_JID`/`TELEMETRY_URL`/`TELEMETRY_API_KEY`) dans son `.env`, la valeur est importée automatiquement dans `settings.json` au premier démarrage après la mise à jour — retire ensuite la ligne correspondante de ton `.env`.

### Secrets d'infrastructure (non configurables depuis WhatsApp)

`channelJid` (JID `xxxx@newsletter` de la chaîne WhatsApp officielle du bot, pour le badge "Transféré depuis"), `telemetryUrl` et `telemetryApiKey` (dashboard-server de suivi d'instance, projet séparé) s'éditent uniquement à la main dans `settings.json` — volontairement absents de toute commande WhatsApp.

## Premières commandes après connexion

1. **`{prefix}setup <identifiant> <propriétaire>`** — obligatoire avant toute autre commande. Verrouille la configuration de cette instance une fois fait.
2. **`{prefix}addadmin`** (en répondant à un message, ou avec un numéro) — ajoute un admin supplémentaire. Le propriétaire (toi, sur ce numéro) est admin automatiquement, sans rien à configurer.
3. **`{prefix}menu`** — liste toutes les commandes disponibles, groupées par catégorie.
4. **`{prefix}admins`** — voir qui est admin actuellement.

## Modération de groupe

`{prefix}antilink`, `{prefix}antilien-domaine`, `{prefix}antiflood`, `{prefix}antispam`, `{prefix}antipurge`, `{prefix}antiraid` — chacune s'active indépendamment par groupe avec `on`/`off`/`status`. `{prefix}mute`/`{prefix}unmute` et `{prefix}vote-kick` complètent la panoplie pour agir directement sur un membre. Voir `CHANGELOG.md` pour le détail de ce que chacune couvre.

## Protection du compte

`{prefix}antibug on` (+ `{prefix}antibug autoblock on` séparément) protège les messages privés contre les contenus anormalement volumineux/mal formés (harcèlement type "bug bot"). Réglage global, persistant, admins uniquement. Voir `CHANGELOG.md` (versions 1.46.0+) pour le détail.

## Structure du projet

```
src/
  commands/     — une commande = un fichier, chargement 100% automatique
  core/         — état, stores persistants, connexion Baileys, admins...
  handlers/     — routage des messages/événements entrants
  middlewares/  — vérifications transverses (antispam de bas niveau...)
  utils/        — fonctions partagées
data/           — fichiers de données runtime (créés automatiquement, non versionnés)
```

Pour ajouter une commande : un nouveau fichier dans `src/commands/`, aucune autre modification nécessaire (voir le format documenté en haut de `src/core/pluginLoader.js`).

## Build & distribution

```bash
npm run build   # obfuscation -> dist/
npm run start:dist
```

## ⚠️ Avertissement

Ce bot utilise Baileys, une bibliothèque non-officielle qui simule un client WhatsApp Web — ce n'est pas l'API Business officielle de Meta. L'usage automatisé d'un compte personnel WhatsApp comporte un risque de restriction/bannissement du compte, réduit mais jamais éliminé par les mesures déjà en place dans ce projet (délais d'envoi, simulation de frappe, backoff de reconnexion). Voir `CHANGELOG.md` pour le détail de ces protections.

## Licence / Auteur

Développé par **Rodrigue Njaka** (nom affiché stylisé configurable dans `src/config/settings.json`, champ `developerName`).
