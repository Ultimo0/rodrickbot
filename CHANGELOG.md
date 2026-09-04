# Changelog

## 1.46.0

- **Nouvelle commande `{prefix}antibug`** (`on|off|autoblock on|off|status`, admin uniquement) : protection contre les messages anormalement volumineux/mal formés reçus en **message privé** (harcèlement type "bug bot" — vCard démesurée, texte saturé de caractères combinants type "zalgo", nombre anormal de mentions/contacts...). Détection uniquement par défaut ; le blocage automatique de l'expéditeur (`autoblock on`) est une option séparée, désactivée par défaut. Volontairement scopé au privé seulement — jamais en groupe, pour ne jamais bloquer un membre par erreur sur un simple partage volumineux légitime. Honnêteté sur la portée : RodrickBOT tourne via Baileys (pas l'app WhatsApp native), donc probablement déjà à l'abri des bugs de rendu qui ciblent l'app officielle — cette protection est une défense en profondeur générique (taille/structure anormale), pas une liste de bugs connus.
- **Filet de sécurité global** (`index.js`) : `process.on('uncaughtException'/'unhandledRejection')` pour qu'une erreur échappant au try/catch par message existant (ex: dans les internals de Baileys eux-mêmes) ne fasse plus jamais planter tout le process — journalisée, le bot continue.

## 1.45.0

- **Fichiers de données regroupés dans `data/`.** Les 19 fichiers JSON runtime (`admins.json`, `dedup.json`, `instance.json`, `state.json`, `afk.json`, `polls.json`, `saved_items.json`, `message_schedules.json`, `quiz_sessions.json`, `quiz_questions_cache.json`, `quiz_stats.json`, `calc_sessions.json`, `calc_stats.json`, `activity.json`, `promotion_guard_warnings.json`, `lock_schedules.json`, `reminders.json`, `group_settings.json`, `warnings.json`) vivent désormais dans `data/` au lieu de la racine du projet. Nouveau helper partagé `utils/dataFile.js` (`dataFilePath(filename)`), qui crée `data/` automatiquement si absent. `src/data/quizQuestions.json` (asset embarqué versionné, pas une donnée d'exécution) n'est pas concerné.
- **Journalisation fichier optionnelle avec rotation automatique.** Nouveau flag `LOG_TO_FILE=true` (`.env`) : en plus de la console habituelle, les logs sont aussi écrits dans `data/logs/bot.log`. Rotation par taille (10 Mo, jusqu'à 3 archives `bot.log.1`/`.2`/`.3`) via une stratégie "copytruncate" (vide le fichier en place plutôt que de le renommer, pour rester compatible avec le file descriptor déjà ouvert par pino). Désactivé par défaut — aucun changement de comportement sans ce flag.

## 1.44.0

- **Chromium/Playwright entièrement retiré.** Suppression de `core/chromiumInstaller.js` (téléchargement auto du binaire au démarrage) et `utils/tiktokBrowser.js` (repli navigateur headless pour `!tiktok`), de l'appel correspondant dans `index.js`, du flag `disableTiktokBrowserFallback`/`DISABLE_TIKTOK_BROWSER_FALLBACK` dans `config/index.js`, et de la dépendance `playwright` dans `package.json`.
- `utils/tiktok.js` simplifié en conséquence : `fetchTikTokData`/`downloadTikTokAudio`/`downloadTikTokVideo` ne connaissent plus qu'une seule source (yt-dlp), le champ `source` et le chemin `directVideoUrl` disparaissent.
- Conséquence assumée : si yt-dlp échoue avec l'erreur de structure de page TikTok ("rehydration"/"universal data") même après le retry automatique, il n'y a désormais plus de repli — l'utilisateur reçoit directement le message d'erreur explicatif. Objectif : alléger le bot sur les hébergements à RAM très contrainte (un Chromium headless dépassait à lui seul le budget mémoire de ces environnements).

## 1.43.0

- `{prefix}bots` n'est plus réservée aux admins (`adminOnly: false`). Avec `adminOnly: true`, une instance appartenant à un autre utilisateur ignorait la commande si l'expéditeur n'était pas admin sur CETTE instance précise — ce qui empêchait justement les bots des autres utilisateurs de répondre, le but recherché avec cette commande.

## 1.42.0

- Nouvelle commande `{prefix}bots` (alias `whoisonline`, `presence`) : chaque instance du bot présente dans le chat répond directement avec son propre statut (nom, propriétaire, instanceId, uptime) — aucune requête vers le dashboard-server, chaque bot répond pour lui-même en tant que participant normal du chat. Pensée pour un groupe partagé où plusieurs instances sont membres.

## 1.41.0

- `{prefix}tagadmin` exclut désormais le bot lui-même des mentions (il ne tague plus que les admins humains du groupe) — y compris s'il a le rôle admin dans ce groupe précis, ou si son entrée dans `groupMetadata` utilise un format de JID différent (`@lid` vs `@s.whatsapp.net`).

## 1.40.0

- **Fix : le bot réexécutait des commandes au redémarrage.** Deux causes, deux correctifs dans `handlers/messageHandler.js` :
  - Le cache anti-doublon (`processedMessageIds`) était uniquement en mémoire, donc vidé à chaque redémarrage complet — précisément le cas où un rejeu Baileys est le plus probable (crash juste après traitement, messages non-accusés redélivrés à la reconnexion). Il est désormais persisté dans `dedup.json` (écriture différée toutes les 10s).
  - Nouveau filtre anti-rattrapage : les messages envoyés pendant que le bot était hors ligne sont redélivrés par WhatsApp à la reconnexion, marqués comme des messages tout frais. Ils sont désormais ignorés s'ils datent de plus de 2 min avant l'heure de connexion (`core/state.js` : `markConnectedNow()`/`getConnectedAt()`, appelé depuis `client.js` à chaque `connection === 'open'`).
  - Marge de 2 min volontairement généreuse pour ne jamais risquer d'ignorer un message réellement récent (délai de livraison normal, léger décalage d'horloge) — seul le vrai rattrapage (coupure prolongée) est filtré.

## 1.39.0

- **ADMIN_JIDS retiré du .env.** Remplacé par `core/adminStore.js` :
  - Le **propriétaire** du bot n'est plus stocké nulle part : c'est le JID sur lequel le bot est connecté (`sock.user.id`), lu en direct à chaque connexion (`client.js`, événement `connection === 'open'`). Impossible de désynchroniser, même après un ré-appairage sur un autre numéro.
  - Les **admins supplémentaires** sont persistés dans `admins.json` (racine du projet, non versionné), modifiables directement dans WhatsApp via les nouvelles commandes `{prefix}addadmin` et `{prefix}removeadmin` (réservées aux admins existants — sinon n'importe qui pourrait s'auto-promouvoir). Nouvelle commande `{prefix}admins` pour lister qui est admin.
  - **Migration automatique et unique** : si `ADMIN_JIDS` existe encore dans `.env` au démarrage et qu'`admins.json` n'existe pas encore, son contenu est importé dans `admins.json` avec un avertissement invitant à retirer la ligne du `.env`.
  - `config.adminJids` reste disponible (getter dynamique délégué à `adminStore.getAdmins()`) pour ne rien casser côté `kickall.js` et autres usages existants.
  - Descriptions de `whoami`, `antipurge`, `ultimo` mises à jour (elles référençaient encore `ADMIN_JIDS`).
  - Point d'attention technique : `adminStore.js` n'importe volontairement PAS `utils/logger.js` (utilise `console` à la place), pour éviter une dépendance circulaire avec `config/index.js` qui importe désormais `adminStore.js`.

## 1.38.0

- Rétablissement de `core/outboundGateway.js` (file d'attente d'envoi + simulation de frappe), retiré en 1.37.0. Contenu identique à la version 1.35.0. Rebranché dans `client.js` juste après la création du socket.

## 1.37.0

- **Retrait de la file d'attente d'envoi et de la simulation de frappe** (`core/outboundGateway.js`, ajoutés en 1.35.0) : suppression du fichier et de son branchement dans `client.js`. Les commandes envoient de nouveau instantanément, sans délai (700-1800ms) ni pause "composing" avant les messages texte.
- ⚠️ Compromis assumé : ce retrait annule la mesure prise en 1.35.0 pour réduire le risque de restriction de compte WhatsApp (rythme d'envoi mécanique/instantané de nouveau présent). Choix délibéré en faveur de la rapidité d'exécution des commandes.

## 1.36.0

- **Stabilité sur mauvaise connexion.** `client.js` : `startBaileysClient()` ne rejette plus jamais — une erreur avant même l'ouverture du socket (lecture de session, résolution de version, échec du pairing) planifie désormais une reconnexion via le même backoff qu'une déconnexion en cours de route, au lieu de faire planter tout le process via `main().catch()` dans `index.js`. Avant ce correctif, une mauvaise connexion pile au démarrage tuait le bot au lieu de retenter.
- Résolution de version Baileys (`fetchLatestBaileysVersion`) désormais bornée dans le temps (10s) avec repli automatique sur la version embarquée par défaut de la librairie en cas d'échec/lenteur réseau, plutôt que de bloquer indéfiniment le démarrage.
- Tuning des options de socket Baileys pour tolérer une connexion lente : `connectTimeoutMs` 20s→60s, `keepAliveIntervalMs` 30s→25s (détection de coupure plus rapide), `defaultQueryTimeoutMs` 60s→90s, ajout de `retryRequestDelayMs` (5s) et `maxMsgRetryCount` (5) pour que Baileys retente en interne les requêtes/envois avant d'abandonner.

## 1.35.0

- Ajout de `src/core/outboundGateway.js` : tous les envois sortants (`sock.sendMessage`, toutes commandes confondues) passent désormais par une file d'attente séquentielle avec délai aléatoire (700-1800ms) entre deux envois, pour éviter un rythme d'envoi mécanique et régulier.
- Simulation de frappe humaine ("composing" puis "paused") avant l'envoi d'un vrai message texte, avec un délai proportionnel à la longueur du texte (borné entre 400ms et 2500ms). Les réactions et suppressions de messages ne sont pas concernées par la simulation de frappe (mais restent soumises à l'espacement de la file).
- Objectif : réduire le risque de restriction de compte WhatsApp en atténuant les signaux comportementaux de bot (réponses instantanées, rafales d'envoi). Ceci réduit le risque, ça ne l'élimine pas — voir discussion en amont sur les limites structurelles de Baileys.
- `client.js` : branchement de la file dès la création du socket (`wrapSocketWithOutboundGateway(sock)`), avant toute utilisation de `sock.sendMessage`, pour couvrir automatiquement toutes les commandes existantes sans les modifier une par une.
