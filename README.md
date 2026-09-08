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

| Variable | Requis | Description |
|---|---|---|
| `GROQ_API_KEY` | Oui, pour les fonctionnalités IA | Clé [console.groq.com](https://console.groq.com/) — utilisée par `!ia`, `!corriger`, `!resume`, `!ocr`, l'agent conversationnel. |
| `PHONE_NUMBER` | Selon `authMethod` | Numéro au format international sans `+` (ex: `237638838029`) — requis seulement si `src/config/settings.json` a `"authMethod": "code"` (appairage par code plutôt que QR). |
| `OPENWEATHER_API_KEY` | Non | Clé [openweathermap.org](https://openweathermap.org/api) — pour `!meteo`. Sans elle, la commande répond juste que la clé n'est pas configurée. |
| `CHANNEL_JID` | Non | JID (format `xxxx@newsletter`) de la chaîne WhatsApp officielle du bot, pour le badge "Transféré depuis" sur certains messages. |
| `TELEMETRY_URL` / `TELEMETRY_API_KEY` | Non | URL et clé du dashboard-server (projet séparé) pour le heartbeat de suivi d'instance. Sans eux, le bot fonctionne normalement, juste sans remontée de télémétrie. |
| `LOG_TO_FILE` | Non | `true` pour écrire aussi les logs dans `data/logs/bot.log` (rotation automatique par taille). Par défaut, logs console uniquement. |
| `ADMIN_JIDS` | Non, **legacy** | Ancien mécanisme de désignation des admins. **Ne configure plus ça pour une nouvelle installation** — le propriétaire du bot est désormais détecté automatiquement (le numéro sur lequel il est connecté), et les admins supplémentaires s'ajoutent avec `{prefix}addadmin` directement dans WhatsApp. Si cette variable est encore présente au premier démarrage, son contenu est importé une seule fois dans `data/admins.json`, puis ignoré ensuite. |

Le préfixe des commandes (`/` par défaut), le nom du bot, le niveau de log et les modèles Groq se règlent dans `src/config/settings.json` (versionné, pas de secret dedans).

## Premières commandes après connexion

1. **`{prefix}setup <identifiant> <propriétaire>`** — obligatoire avant toute autre commande. Verrouille la configuration de cette instance une fois fait.
2. **`{prefix}addadmin`** (en répondant à un message, ou avec un numéro) — ajoute un admin supplémentaire. Le propriétaire (toi, sur ce numéro) est admin automatiquement, sans rien à configurer.
3. **`{prefix}menu`** — liste toutes les commandes disponibles, groupées par catégorie.
4. **`{prefix}admins`** — voir qui est admin actuellement.

## Modération de groupe

`{prefix}antilink`, `{prefix}antiflood`, `{prefix}antispam`, `{prefix}antipurge`, `{prefix}antiraid` — chacune s'active indépendamment par groupe avec `on`/`off`/`status`. Voir `CHANGELOG.md` pour le détail de ce que chacune couvre.

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
