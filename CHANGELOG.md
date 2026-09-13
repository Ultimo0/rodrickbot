# Changelog

## 1.67.0

- **Toutes les clés API et secrets d'infrastructure quittent `.env` pour `src/config/settings.json`** — changement demandé explicitement, avec des implications de sécurité détaillées ci-dessous.
  - **Clés configurables depuis WhatsApp** (nouvelles commandes, admins uniquement, **message privé uniquement** — voir pourquoi plus bas) :
    - `!groqapi <clé>` / `!groqapi off` / `!groqapi` (statut) — clé Groq (`groqApiKey`)
    - `!removeapi <clé>` / `!removeapi off` — clé remove.bg (`removeBgApiKey`)
    - `!meteoapi <clé>` / `!meteoapi off` — clé OpenWeatherMap (`openWeatherApiKey`)
    - Les trois partagent la même implémentation factorisée dans `utils/apiKeyCommand.js` (`createApiKeyCommand()`), et la même liste blanche `CONFIGURABLE_API_KEYS` dans `config/index.js` — nouvelles fonctions `setApiKey()`/`deleteApiKey()`, qui écrivent immédiatement dans `settings.json` (via `atomicWriteFileSync`, même mécanisme que les autres stores persistants du bot) ET mettent à jour l'objet `config` en mémoire, donc sans redémarrage du bot.
    - `commands/meteo.js` lisait auparavant `process.env.OPENWEATHER_API_KEY` dans une constante figée au chargement du module ; il lit maintenant `config.openWeatherApiKey` en direct à chaque exécution (même convention que `groq.js`/`removebg.js`), sinon `!meteoapi` n'aurait eu aucun effet sans redémarrer le bot.
  - **`telemetryUrl`, `telemetryApiKey` et `channelJid`** : déplacés eux aussi dans `settings.json`, mais **volontairement absents de `CONFIGURABLE_API_KEYS`** — `setApiKey()` lève une erreur si on tente de les modifier par ce biais. Ils ne se modifient qu'en éditant `settings.json` directement, comme demandé.
  - **Migration automatique** : au premier démarrage après cette mise à jour, toute valeur encore présente dans `.env` pour ces 6 variables (`GROQ_API_KEY`, `REMOVE_BG_API_KEY`, `OPENWEATHER_API_KEY`, `CHANNEL_JID`, `TELEMETRY_URL`, `TELEMETRY_API_KEY`) est importée une seule fois dans `settings.json` (voir `migrateEnvKeyIfNeeded()` dans `config/index.js`, même principe que la migration `ADMIN_JIDS` déjà existante) — aucune configuration existante n'est perdue.
  - **Statut de chaque clé dans le message de démarrage** (l'écran "Statut / Instance / Propriétaire / Commandes chargées / Mode" envoyé au propriétaire à la connexion) : nouvelle section "Clés API" ajoutée à `renderStartup()` dans les **5 thèmes** (`royal`, `mono`, `galaxy`, `neon`, `classique`), chacune dans son propre style visuel — ✅/❌ pour Groq, Remove.bg, OpenWeather, Télémétrie, Chaîne WhatsApp. Alimentée par la nouvelle fonction `getApiKeyStatuses()` dans `config/index.js`, câblée dans `utils/startupMessage.js`.
  - **Sécurité — implications importantes à connaître :**
    - `settings.json` n'est plus un fichier "sans secret" comme documenté jusqu'ici : une fois une clé configurée, il contient un vrai secret. **Il est retiré du suivi git dans `.gitignore`** (nouvelle entrée `src/config/settings.json`) — le modèle versionné avec des valeurs vides devient `src/config/settings.example.json` (nouveau fichier), recopié automatiquement en `settings.json` au démarrage s'il est absent (voir le nouveau bloc d'amorçage en tête de `config/index.js`), pour qu'un `git clone` frais reste fonctionnel malgré le `.gitignore`.
    - **Si `src/config/settings.json` était déjà suivi par git dans ton dépôt avant cette mise à jour**, ajouter la ligne au `.gitignore` ne le retire PAS de l'historique existant : pense à faire `git rm --cached src/config/settings.json` après avoir vérifié qu'aucun secret n'y était déjà committé, et à faire tourner (régénérer) toute clé qui aurait pu être exposée dans un commit précédent.
    - Les 3 commandes `!groqapi`/`!removeapi`/`!meteoapi` sont forcées en `privateOnly: true` : une clé tapée en clair dans un GROUPE serait visible de tous ses membres, admins ou non — ces commandes ne fonctionnent donc qu'en message privé avec le bot.
  - `.env.example` réduit aux seules variables qui doivent rester en `.env` : `PHONE_NUMBER` (nécessaire avant même la première connexion WhatsApp, donc avant qu'aucune commande ne puisse le configurer), `LOG_TO_FILE` (pas un secret) et `ADMIN_JIDS` (legacy). README.md entièrement réécrit sur la partie configuration pour refléter cette nouvelle architecture.

## 1.66.0

- **14 nouvelles commandes** (95 → 109 fichiers dans `src/commands/`, objectif 100 dépassé) :
  - `!ralenti` / `!accelere` (Média) — modifient la vitesse d'une vidéo (image + son synchronisés via `setpts`/`atempo`). Nouvelle fonction `changeVideoSpeed()` dans `utils/mediaConvert.js`, logique commune factorisée dans `utils/videoSpeed.js` (les deux commandes ne diffèrent que par leur facteur par défaut/bornes).
  - `!pinterest` (Téléchargement) — télécharge un pin Pinterest, vidéo (yt-dlp, même schéma que `!facebook`) ou image (repli sur l'extraction de la balise `og:image` de la page, la majorité des pins étant des images).
  - `!resume-doc` (Intelligence Artificielle) — **alias ajouté à `!resume` existant**, qui gérait déjà les documents .pdf/.docx cités ou envoyés (`utils/textInput.js`) : pas de nouveau code, juste le nom demandé rendu disponible.
  - `!debat <sujet>` (Intelligence Artificielle) — développe les meilleurs arguments POUR et CONTRE via Groq (nouvelle fonction `generateDebate()`).
  - `!vocal-en-texte` (Intelligence Artificielle) — transcrit une note vocale/audio en texte via l'API Whisper de Groq. Nouvelle fonction `transcribeAudio()` dans `utils/groq.js` (appel multipart dédié, contrairement aux autres fonctions Groq de ce fichier qui passent par `requestGroqJson`), nouveau réglage `groqWhisperModel` (`whisper-large-v3-turbo`) dans `settings.json`.
  - `!raccourcir <lien>` (Utilitaires) — raccourcisseur d'URL via l'API publique TinyURL (aucune clé requise).
  - `!define <mot>` / `!synonyme <mot>` (Utilitaires) — définitions et synonymes via Groq (nouvelles fonctions `defineWord()`/`findSynonyms()`) : aucune API dictionnaire française fiable et gratuite sans clé n'a été trouvée, l'IA déjà configurée est réutilisée à la place.
  - `!crypto <symbole>` (Utilitaires) — cours d'une cryptomonnaie via l'API publique CoinGecko (recherche par symbole/nom, aucune clé requise).
  - `!devise <montant> <de> <vers>` (Utilitaires) — conversion de devises via l'API publique open.er-api.com (~160 devises, **y compris le FCFA/XAF** — préférée à l'API de la BCE/Frankfurter qui ne couvre que les devises majeures).
  - `!horoscope <signe>` (Utilitaires) — horoscope du jour généré par Groq, explicitement étiqueté "divertissement uniquement" dans le prompt ET dans la réponse envoyée.
  - `!lien` / `!resetlien` (Gestion de groupe) — affichent/régénèrent le lien d'invitation du groupe (`sock.groupInviteCode`/`groupRevokeInvite`).
  - `!clear <n>` (Gestion de groupe) — supprime les N derniers messages envoyés par le bot dans la conversation courante (défaut 10, max 100). Nécessite un nouveau mécanisme de suivi : `core/sentMessageLog.js`, alimenté directement depuis `core/outboundGateway.js` (qui voit déjà passer tous les envois sortants du bot, toutes commandes confondues) — historique en mémoire uniquement (perdu au redémarrage, sans conséquence pour cet usage).
- Toutes les nouvelles fonctionnalités "API publique" (`!raccourcir`, `!crypto`, `!devise`, `!pinterest`) fonctionnent sans configuration ni clé. `!vocal-en-texte`/`!debat`/`!define`/`!synonyme`/`!horoscope` réutilisent la clé `GROQ_API_KEY` déjà configurée pour les autres fonctionnalités IA.

## 1.65.0

- **10 nouvelles commandes** (84 → 95 fichiers dans `src/commands/`, objectif 100) :
  - `!gif` (Média) — convertit une courte vidéo (15s max, sans son) en GIF WhatsApp. Nouvelle fonction `videoToGifMp4()` dans `utils/mediaConvert.js`.
  - `!qrcode` (Utilitaires) — génère un QR code PNG à partir d'un texte ou d'un lien. Nouvelle dépendance `qrcode`, nouveau `utils/qrcode.js`.
  - `!traduireauto` (Intelligence Artificielle) — traduit automatiquement chaque message d'un groupe vers une langue cible (réponse citée), réutilise `translateText()` de `utils/groq.js`. Réglage persistant `autotranslate` ajouté à `core/groupSettings.js`. Ne bloque jamais le reste du pipeline (jamais de `return` dans `handlers/messageHandler.js`).
  - `!removebg` (Média) — retire le fond d'une image via l'API remove.bg (`utils/removebg.js`, `fetch`/`FormData` natifs Node 20, aucune dépendance npm ajoutée). Nécessite `REMOVE_BG_API_KEY` dans `.env` (voir `.env.example`).
  - `!instagram` (Téléchargement) — télécharge un reel/post Instagram en audio ou vidéo, calqué exactement sur `!facebook` (`utils/instagram.js` + branche `instagram` dans `utils/downloadReply.js`).
  - `!antilien-domaine` (Gestion de groupe) — liste blanche de domaines autorisés, en complément de `!antilink` (qui bloque tous les liens sans distinction) : les deux protections sont indépendantes et cumulables sur un même groupe. Réglage `linkWhitelist` ajouté à `core/groupSettings.js`, nouveau `utils/linkWhitelist.js`.
  - `!mute` / `!unmute` (Gestion de groupe) — rend un membre muet (ses messages, tous types confondus, sont supprimés automatiquement) sans l'expulser du groupe. WhatsApp n'ayant pas de mute natif par membre, c'est le bot qui l'applique : nouveau `core/muteStore.js` (persistant, `data/muted.json`) + `utils/muteGuard.js`, branché tout en amont du pipeline dans `handlers/messageHandler.js` (avant même l'antibug).
  - `!vote-kick` (Modération) — expulsion par vote communautaire (3 voix par défaut, réglable via `voteKickThreshold`/`voteKickTimeoutSeconds` dans `settings.json`), sans nécessiter un admin. Session de vote en mémoire (`core/voteKickStore.js`, même principe que `core/downloadSessions.js`). Protège les admins (bot et groupe) contre un vote.
  - `!rps` (Jeux) — pierre-feuille-ciseaux contre le bot, un seul coup, sans état à conserver.
  - `!analyse-image` (Intelligence Artificielle) — décrit le contenu d'une image (ou répond à une question précise dessus) via le modèle de vision Groq. Nouvelle fonction générique `analyzeImage()` dans `utils/groq.js`, à côté de `ocrImage()` déjà existante (même modèle, prompt différent : description au lieu de transcription).
- Toutes les nouvelles commandes de groupe suivent la convention existante : ciblage via `utils/groupTarget.js` (mention, réponse citée, ou numéro), protections admin identiques à `!kick`/`!promote`.

## 1.64.6

- **L'audio du `{prefix}menu` est désormais envoyé en véritable note vocale (`ptt: true`)**, avec la même méthode que `{prefix}mention` (1.64.3) : le fichier trouvé dans `assets/` est systématiquement repassé par `toVoiceNoteOgg()` (`utils/mediaConvert.js` — réencodage OGG/Opus 16 kHz mono, profil `voip`, durée calculée explicitement) avant l'envoi, au lieu d'être expédié tel quel avec `ptt: false`. Seul `commands/help.js` a été modifié.

## 1.64.5

- **Le mode privé strict est désormais activé par défaut** sur une instance neuve (`core/state.js` : `lockdownMode: true` au lieu de `false`). Auparavant, une nouvelle instance répondait par défaut à tout le monde (mode public) tant que l'admin ne tapait pas `{prefix}private on` — c'est maintenant l'inverse : seul l'admin peut utiliser le bot tant qu'il n'ouvre pas explicitement l'accès via `{prefix}private off`. Sans effet sur une instance déjà en service : `state.json` garde la valeur qu'il contient déjà, seule une toute nouvelle instance (sans `state.json`) démarre désormais en privé.

## 1.64.4

- **Nouveau : message d'aide envoyé juste après la validation de l'instance (`{prefix}setup`)**, pour guider un nouvel utilisateur — liste des premières commandes utiles (`{prefix}menu`, `{prefix}ping`, `{prefix}mention`, `{prefix}afk`, `{prefix}save`) avec un mot d'explication pour chacune. Envoyé une seule fois, uniquement à la suite de `{prefix}setup` (donc une seule fois par instance). Seul `commands/setup.js` a été touché — aucun autre fichier modifié.

## 1.64.3

- **`{prefix}mention` repasse en véritable note vocale (`ptt: true`)**, à la demande explicite — malgré la limitation connue documentée en 1.62.0/1.64.2. Nouvelle fonction `toVoiceNoteOgg()` dans `utils/mediaConvert.js`, avec une recette ffmpeg nettement plus stricte que celle essayée en 1.62.0 :
  - `-err_detect ignore_err -fflags +discardcorrupt` en entrée : tolère un flux WhatsApp source légèrement abîmé plutôt que de produire une sortie corrompue en silence.
  - `-application voip` : profil Opus optimisé pour la voix (c'est le profil que WhatsApp/Signal utilisent eux-mêmes), au lieu du profil générique par défaut utilisé en 1.62.0.
  - `-avoid_negative_ts make_zero -map_metadata -1`, mono, **16 kHz** (recommandation officielle Baileys, contre 48 kHz en 1.62.0).
  - **Durée (`seconds`) calculée explicitement pendant la conversion** (via l'événement `codecData` de fluent-ffmpeg, pas besoin de binaire `ffprobe` séparé) et transmise telle quelle à `sock.sendMessage()`, plutôt que de laisser Baileys la déduire lui-même du buffer — une source d'échec supplémentaire déjà documentée dans l'écosystème Baileys pour ce type de problème.
  - Toujours ré-encodé systématiquement (jamais de passthrough des octets bruts), comme en 1.64.1.
- ⚠️ Si le problème persiste malgré cette recette plus robuste, la cause est probablement propre à un enregistrement source précis (durée très courte, silence total, codec exotique) plutôt qu'aux paramètres ffmpeg eux-mêmes — dans ce cas, `{prefix}mention` peut repasser sur M4A/`ptt:false` (1.64.2) qui reste éprouvé et fiable.

## 1.64.2

- **Fix (le vrai cette fois) : `{prefix}mention` — audio toujours illisible malgré le ré-encodage systématique de la 1.64.1.** Le ré-encodage OGG/Opus + `ptt: true` n'était pas le problème : même en repassant systématiquement par ffmpeg, ce format s'est avéré non fiable en usage réel — **exactement ce qui avait déjà été constaté sur `{prefix}get`/`{prefix}reveal` en 1.62.0 → 1.63.0** (voir plus bas), et que j'avais ignoré en proposant OGG/Opus comme "la" méthode correcte. `{prefix}mention` envoie désormais l'audio enregistré en **M4A/AAC, comme audio normal (`ptt: false`)**, via `audioToM4a()` — même fonction, même comportement que `{prefix}get`/`{prefix}reveal`. Contrepartie assumée : l'audio de `{prefix}mention` s'affiche comme un fichier audio classique, pas comme une bulle "note vocale" avec forme d'onde — mais il est réellement lisible, ce qui prime.
- `toVoiceNoteOgg()` (introduite en 1.64.0, devenue inutilisée) retirée de `utils/mediaConvert.js`.

## 1.64.1

- **Fix : `{prefix}mention` — "Cet audio n'est pas disponible, il y a eu un souci avec le fichier audio."** au renvoi d'une note vocale enregistrée. Cause : exactement le bug déjà corrigé sur `{prefix}get`/`{prefix}reveal` en 1.62.0, réintroduit par mégarde ici — quand l'audio enregistré était déjà une vraie note vocale (`ptt: true`), le code renvoyait ses octets bruts tels quels au lieu de les repasser par le ré-encodage ffmpeg, donc entièrement dépendant d'un conteneur OGG parfois non-standard selon l'appareil source. `{prefix}mention` ré-encode désormais systématiquement en OGG/Opus via `toVoiceNoteOgg()`, peu importe si la source était déjà `ptt` ou non — même politique que `{prefix}get`/`{prefix}reveal`.
  - ⚠️ Insuffisant en pratique — voir 1.64.2.

## 1.64.0

- **Fix : le bot pouvait réexécuter d'anciennes commandes au redémarrage.** Le filtre anti-rattrapage (`handlers/messageHandler.js` : `isStaleBacklogMessage`) existait déjà depuis l'audit de stabilité, mais sa marge de tolérance de 2 minutes laissait volontairement repasser les commandes envoyées juste avant l'arrêt du bot ("rattrapage" de messages reçus hors ligne). Marge réduite à 10 secondes — juste de quoi absorber un délai réseau ou un décalage d'horloge, plus une fenêtre pour "rattraper" des commandes.
- **Fix : `{prefix}ping` ne fonctionnait pas en groupe.** Il lui manquait `privateOnly: false` (bloqué en groupe par défaut comme la majorité des commandes, voir `core/pluginLoader.js`).
- **Nouvelle commande `{prefix}mention`** (alias `onmention`) : enregistre un message (texte ou note vocale) renvoyé automatiquement à chaque mention ou citation dans un GROUPE (jamais en privé). `{prefix}mention <texte>` pour du texte, réponse à un audio/une note vocale avec `{prefix}mention` pour de la voix, `{prefix}mention off` pour supprimer. Persisté sur disque (`data/mention_replies.json` + `saved_media/`), un seul message actif par utilisateur (le nouveau remplace l'ancien).
  - Si l'audio enregistré n'est pas déjà une vraie note vocale WhatsApp (`ptt`), il est reconverti via un nouveau `utils/mediaConvert.js` : `toVoiceNoteOgg()` — **OGG/Opus** (mono, 48kHz), pas M4A/AAC : c'est le seul format que WhatsApp affiche de façon fiable comme note vocale (icône micro + forme d'onde) sur tous les appareils, quel que soit `ptt: true`. `audioToM4a()` (utilisée par `{prefix}get`/`{prefix}reveal`, qui renvoient volontairement en audio normal et non en note vocale) reste inchangée — problématique différente.

## 1.63.0

- **Fix : audio toujours illisible via `{prefix}get`/`{prefix}reveal` après le ré-encodage OGG/Opus de la 1.62.0.** Remplacé par une conversion M4A/AAC (`utils/mediaConvert.js` : `audioToM4a`, remplace `audioToVoiceNote`), envoyée comme audio normal (`ptt: false`, `mimetype: audio/mp4`) plutôt qu'en note vocale — plus fiable sur les enregistrements qui posaient problème.
- **Audit complet du projet** (216 fichiers) : vérification de syntaxe exhaustive (aucune erreur), résolution des 525 imports relatifs (tous valides), recherche de `TODO`/`FIXME` et de `console.log` oubliés (aucun), et surtout détection systématique des collisions de nom/alias entre commandes.
- **Fix : collision trouvée entre `kick.js` et `remove.js`.** `remove` était déclaré comme alias de `{prefix}kick` (expulser un membre) ET comme nom propre de `{prefix}remove` (récupérer les messages supprimés) — deux fonctionnalités sans rapport qui se marchaient dessus silencieusement, exactement le même type de bug que la collision `antipromote`/`antiraid` corrigée en 1.48.0. Alias retiré de `kick.js` ; `{prefix}kick` reste utilisable par son nom seul.

## 1.62.0

- **Fix : audio illisible via `{prefix}get`** ("Cet audio n'est pas disponible, il y a eu un souci avec le fichier audio" côté WhatsApp). Cause : quand l'élément sauvegardé était déjà une vraie note vocale (`ptt: true`), le code renvoyait les octets bruts tels qu'enregistrés au lieu de les repasser par le ré-encodage ffmpeg — dépendant donc entièrement de la qualité de l'encodage d'origine (conteneur OGG parfois non-standard selon l'appareil source). `{prefix}get` ré-encode désormais systématiquement l'audio, peu importe si l'original était déjà `ptt` ou non.
- **Même correctif appliqué à `{prefix}reveal`** (messages vocaux à vision unique) : même schéma de renvoi brut, même risque, même fix.

## 1.61.0

- **Fix : `{prefix}schedule` envoyait les messages à la mauvaise heure** (ex: programmé pour 6h30, envoyé à 5h29). Cause : l'heure était calculée avec l'horloge LOCALE du serveur (`new Date(...).getFullYear()` etc.), qui ne correspond pas forcément au fuseau horaire réel de l'utilisateur selon l'hébergeur (AdKyNet/Katabump peuvent avoir des fuseaux système différents). `core/messageScheduler.js` calcule désormais l'heure cible dans un fuseau horaire **fixe** (Africa/Douala), indépendamment de la configuration du serveur.
- Réutilise `nextDailyOccurrence()`/`DEFAULT_TIMEZONE` de `core/remind/remindDate.js` — déjà utilisés et éprouvés par `{prefix}remind`, qui n'avait jamais eu ce bug puisqu'il gérait déjà correctement les fuseaux horaires. `{prefix}schedule` est le seul endroit du projet qui utilisait encore l'heure locale du serveur pour une programmation.

## 1.60.0

- **Commande `{prefix}repost` supprimée.** Suppression aussi de `core/contactsStore.js`, qui n'existait que pour elle (liste de contacts destinée au `statusJidList`) — au passage, son point de branchement `registerContactsStore()` n'était en fait jamais appelé nulle part dans le projet, donc la liste de contacts restait toujours vide en pratique : le fix était resté à moitié fait.

## 1.59.0

- **`{prefix}reveal` (alias `rv`/`see`/`viewonce`) réservé aux admins du bot.** Cette commande contourne la fonction "Vue unique" de WhatsApp (extrait et conserve une photo/vidéo censée disparaître après un visionnage) — n'importe quel membre de groupe pouvait l'utiliser jusqu'ici, un vrai problème de consentement pour l'expéditeur du média.
- **Cooldown ajouté sur 6 commandes qui n'en avaient pas** malgré un coût comparable à celles déjà protégées : `corriger`/`ia` (15s, appel API Groq — même classe que `resume`/`ocr`), `facebook` (20s, téléchargement yt-dlp — même classe que `tiktok`/`youtube`), `toimg`/`tovid`/`sticker` (10s, conversion sharp/ffmpeg).
- **`.env.example` recréé** — absent de cet export alors que `README.md` le référence dans les instructions de démarrage rapide.

## 1.58.0

- **Fix probable du bug `/tiktok`/`/play` sur AdKyNet** : ajout du champ `allowScripts` dans `package.json`. npm 12 bloque par défaut les scripts d'installation (`preinstall`/`install`/`postinstall`) des paquets non explicitement listés — ce qui empêchait `ffmpeg-static` (télécharge ffmpeg), `youtube-dl-exec` (télécharge yt-dlp) et `sharp` de s'installer correctement, sans qu'aucune erreur explicite ne le signale (juste un `npm warn`). Katabump n'était probablement pas encore sur npm 12, d'où la différence de comportement entre les deux hébergeurs avec le même code.
- Comme le démarrage relance `npm install` à chaque redémarrage (comportement standard des panels type Pterodactyl), ce fix s'applique tout seul au prochain redémarrage — aucune commande à taper dans une console.

## 1.57.0

- **Nouvelle commande `{prefix}leave`** (alias `quitter`, `quittergroupe`, admin) : fait quitter le bot du groupe, sans toucher aux membres. Pas de confirmation lourde comme `{prefix}delgroup` — rien d'irréversible ici, le bot peut être réajouté. Confirmation envoyée en privé à l'auteur, pour la même raison que `delgroup` (impossible d'écrire dans le groupe après l'avoir quitté).

## 1.56.0

- **Nouvelle commande `{prefix}delgroup`** (alias `supprimergroupe`, `deletegroup`, admin) : retire tous les membres du groupe (y compris les admins, contrairement à `{prefix}kickall`) puis fait quitter le bot. Confirmation explicite obligatoire (`{prefix}delgroup CONFIRMER`) vu le caractère irréversible.
- ⚠️ Limite honnête documentée dans la commande elle-même : WhatsApp ne permet à personne de supprimer un groupe pour tout le monde via l'API — le groupe reste techniquement vide/abandonné sur les serveurs WhatsApp, pas effacé.
- Si le bot n'est pas admin du groupe, il quitte quand même mais ne retire personne (prévenu en privé à l'auteur de la commande, puisque le bot ne peut plus écrire dans le groupe une fois parti).

## 1.55.0

- **Nouvelle commande `{prefix}antidemote`** (alias `protegemoiadmin`, admin, par groupe) — miroir exact d'`antipromote`, dans l'autre sens : empêche les admins du groupe (autres que les admins du bot) de retirer le statut administrateur d'un admin du bot. La rétrogradation est annulée immédiatement (repromotion), l'auteur est averti (compteur **partagé** avec `antipromote` — `core/promotionGuardStore.js`), jusqu'à être lui-même rétrogradé au 3e avertissement.
- Seuls les admins du bot (`isAdmin()` — propriétaire + `{prefix}addadmin`) sont protégés ; un admin de groupe classique sans lien avec le bot peut toujours être rétrogradé normalement.

## 1.54.0

- **Reconnaissance de commandes sans préfixe en mode agent** (`utils/helpers.js` : `tryParseNoPrefixCommand()`) : quand le mode agent est activé pour un chat, un admin peut taper `Menu`, `PING`, `antilink on`, `addadmin 237600000000`... sans le préfixe habituel, insensible à la casse. Réservé aux admins par construction (branché dans la même zone du code déjà admin-only pour l'agent IA).
- **Correspondance exacte exigée**, pour ne pas voler les mots-clés d'une conversation naturelle avec l'IA : le premier mot doit être un nom de commande/alias connu, et tout le reste du message doit être vide ou composé uniquement de `on`/`off`/`status`/chiffres. `menu du jour, un bon resto ?` ou `ping moi si tu vois ça` partent bien vers l'IA comme avant, sans être interceptés.

## 1.53.0

- **Message de bienvenue diversifié**, sur les deux fronts :
  - **Thèmes** (`royal`, `neon`, `galaxy`, `mono`, `classique`) : chaque `renderWelcome()` tire désormais au hasard parmi 3 formulations accueillantes et un peu drôles (nouveau `utils/pickRandom.js`), au lieu du même texte identique à chaque arrivée. Structure/style visuel de chaque thème inchangés — seul le ton varie.
  - **Messages personnalisés par groupe** (`{prefix}welcome on <message>`) : acceptent désormais plusieurs variantes séparées par `|` (ex: `A | B | C`), une choisie au hasard à chaque arrivée. Rétrocompatible : un message sans `|` se comporte exactement comme avant. S'applique aussi à `{prefix}bye` (même mécanisme, `groupConfig.message` partagé).
- **Photo de profil du nouveau membre** jointe au message de bienvenue (arrivée uniquement, jamais au départ) : best-effort via `sock.profilePictureUrl()` — silencieusement remplacé par un message texte simple si la personne n'a pas de photo ou si sa vie privée en restreint l'accès aux non-contacts.

## 1.52.0

- **Nouvelle commande `{prefix}repost`** (alias `republier`, admin, cooldown 15s) : republie un statut WhatsApp avec une description modifiable.
  - Usage direct : réponds à un statut avec `{prefix}repost [nouvelle description]`.
  - Depuis une sauvegarde existante : `{prefix}repost <nom sauvegardé via {prefix}statut> [nouvelle description]`.
  - Réutilise les mêmes utilitaires que `{prefix}save`/`{prefix}statut` (`utils/quotedContent.js`, `core/savedItems.js`) — aucune nouvelle logique de téléchargement/stockage.
  - ⚠️ Limite honnête, à tester : envoyé sans `statusJidList` (le projet ne maintient pas de synchronisation des contacts du compte). La portée réelle auprès des contacts peut varier selon la version de Baileys/WhatsApp — à vérifier en conditions réelles.
  - Stickers et documents explicitement refusés (pas des statuts valides).

## 1.51.0

Cinq améliorations indépendantes, demandées ensemble :

1. **Arrêt propre centralisé** (`core/shutdown.js`, nouveau) : `state.js` et `activityStore.js` enregistraient chacun leur propre gestionnaire `SIGINT`/`SIGTERM`, et l'un appelait `process.exit(0)` de façon synchrone — risque réel que l'autre n'ait jamais le temps de s'exécuter (l'ordre dépend de l'ordre d'import). Remplacé par un point central : `registerShutdownHandler(fn)`, qui attend chaque flush dans l'ordre avant de couper une seule fois. `dedup.json` (aucun flush à l'arrêt jusqu'ici, seulement toutes les 10s) en profite aussi désormais.
2. **Cooldown par utilisateur** (`core/cooldownStore.js`, nouveau, + champ `cooldownMs` sur une commande) : `!ocr`/`!resume` (15s), `!tomp3`/`!tiktok`/`!youtube`/`!play` (20s). Protège contre le spam d'une commande coûteuse (appel API, ffmpeg, téléchargement) qui ralentissait tout le monde d'autre dans le groupe. Admins exemptés.
3. **README.md + .env.example** (nouveaux) : setup, tableau des variables d'environnement (avec `ADMIN_JIDS` marqué legacy), premières commandes, structure du projet, avertissement Baileys.
4. **Remontée d'erreurs anonymisée** (`core/telemetry.js` : `reportError()`) : les deux gestionnaires globaux `uncaughtException`/`unhandledRejection` (ajoutés en 1.46.0) envoient désormais un rapport au dashboard-server si la télémétrie est déjà configurée (même interrupteur que le heartbeat, pas de nouvelle variable). JID et numéros redactés activement avant envoi (regex, pas juste une promesse en commentaire) — beaucoup de logs internes interpolent un JID dans leur message.
5. **`.gitignore`** (nouveau, absent du projet jusqu'ici) : `node_modules/`, `.env`, `auth_info/`, `data/`, `saved_media/`, `dist/`, `*.log`.

## 1.50.0

- **Fix de lenteur perçue : file d'attente d'envoi désormais par conversation, plus globale.** `core/outboundGateway.js` utilisait une seule file (`chain`) partagée par TOUT le bot — un groupe très actif retardait les réponses dans toutes les autres conversations, qui attendaient inutilement derrière des envois sans rapport. Remplacé par une `Map<chatId, file>` : chaque conversation a son propre espacement (700-1800ms), indépendant des autres. Le signal anti-restriction visé (rythme mécanique) n'a de sens qu'à l'intérieur d'une même conversation — le sérialiser entre conversations différentes n'apportait aucune protection, juste de la lenteur.
- Nettoyage automatique des entrées de la Map une fois leur file vidée (pas de fuite mémoire sur un bot qui tourne longtemps avec beaucoup de conversations différentes).

## 1.49.0

- **Confirmations on/off plus claires** sur 4 commandes ayant un paramètre configurable :
  - `{prefix}antiflood on` affiche désormais le seuil actif (ex: "activé (seuil : 5 mentions max)").
  - `{prefix}antispam on` affiche désormais la limite/fenêtre actives (ex: "activé (5 messages en 8s)").
  - `{prefix}antiraid on` rappelle les deux seuils fixes (contenu à risque + verrouillage sur 8 membres/1min).
  - `{prefix}antibug autoblock on` prévient désormais si la protection principale est désactivée (réglage sans effet tant que `{prefix}antibug on` n'est pas fait aussi) ; `{prefix}antibug on` précise si le blocage automatique est déjà actif.
  - Inchangé pour `antilink`/`antipromote`/`antipurge`/`antistatut` : pas de paramètre configurable, "activé/désactivé" tout court reste suffisant.

## 1.48.0

- **Nouvelle commande `{prefix}antiraid`** (`on|off|status`, admin, par groupe) — deux volets :
  - **Contenu à risque** (`utils/antiraidContent.js`, même schéma qu'`antilink.js`) : supprime et avertit sur les liens raccourcis (bit.ly, tinyurl...), les liens `.apk`, et les formulations d'arnaque courantes (fausses annonces de gains, prêts, offres d'emploi WhatsApp). Admins exemptés. Avertissements partagés avec le système existant (`warnStore`) : expulsion au seuil habituel.
  - **Affluence anormale** (`core/joinRaidGuard.js`, même schéma qu'`utils/antipurge.js`) : verrouille automatiquement le groupe (`{prefix}lock` déclenché par code) si 8 membres ou plus rejoignent en moins d'1 min — déverrouillage automatique après 15 min. Se déclenche même si `welcome` est désactivé pour ce groupe.
  - Retiré l'alias `antiraid` d'`{prefix}antipurge` (collision de nom — `antiraid` est désormais sa propre commande, sans lien avec `antipurge`).

## 1.47.0

- Commande `{prefix}pingall` supprimée. Nettoyage des deux commentaires dans `help.js` et `protectall.js` qui la citaient en exemple par analogie (reformulés, aucun changement fonctionnel).

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
