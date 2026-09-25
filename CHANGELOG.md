# Changelog

## 1.77.1

- **Correctif confirmé : Guardian attribuait parfois un changement de réglages à la mauvaise personne** dans sa notification — signalé par l'utilisateur avec capture d'écran (changement fait par "Yohan", notification affichant "Auteur : @Rodrigue Njaka").
  - Cause : race condition, pas un problème d'identifiant cette fois. `messages.upsert` mémorisait l'auteur (`rememberActor`) pour **n'importe quel** message système (`messageStubType != null`) — y compris les arrivées, départs et utilisations de lien d'invitation, bien plus fréquents qu'un changement de réglages. Si l'un de ces événements arrivait dans la fenêtre de 5 secondes juste avant qu'un vrai changement de métadonnées soit traité par `groups.update`, `consumeActor()` piochait le mauvais auteur.
  - `src/core/groupGuardian.js` : nouvelle whitelist `METADATA_ACTOR_STUB_TYPES` (subject/description/restrict/announce/icône/lien d'invitation). `rememberActor()` n'est désormais appelé que pour ces types-là — jamais pour un départ/une arrivée/une utilisation de lien pour rejoindre.
  - ⚠️ Limite résiduelle documentée : si deux vrais changements de métadonnées surviennent dans la même fenêtre de 5 secondes (par deux personnes différentes), l'attribution reste best-effort. Cas nettement plus rare que celui corrigé ici.

## 1.77.0

- **Extension du correctif 1.76.0 (double identité PN/LID) aux admins ajoutés via `{prefix}addadmin`**, pas seulement au propriétaire — même classe de bug potentiel : un admin supplémentaire pourrait être traité comme un tiers non autorisé par Guardian/isAdmin si WhatsApp rapporte son action sous une forme différente de celle utilisée au moment de l'ajout.
  - `src/utils/groupTarget.js` : nouvelle `resolveParticipantForms(sock, chatId, jid)`, qui va chercher dans `groupMetadata().participants` toutes les formes connues (`id`/`jid`/`lid`) d'un participant — même principe que `getBotSelfIds()`, appliqué à un tiers plutôt qu'au bot.
  - `src/core/adminStore.js` : `extraAdmins` stocke désormais `{ forms: string[] }` par admin (toutes ses formes connues) au lieu d'une seule chaîne. `isAdmin()` vérifie l'union de toutes les formes. `addAdmin(forms)` prend un tableau (au lieu d'un seul JID) et refuse le doublon si la personne est déjà admin sous n'importe laquelle de ses formes. `removeAdmin(jid)` retire l'admin entier (toutes ses formes) dès qu'une seule forme correspond. **Rétrocompatible** : un `admins.json` créé avant ce correctif (simple tableau de chaînes) continue de fonctionner tel quel, et est réécrit au nouveau format dès la prochaine modification (`addadmin`/`removeadmin`).
  - Nouveau `isOwner(jid)` exporté (vérifie contre l'ensemble complet des formes du propriétaire) — remplace les comparaisons strictes `jid === getOwnerJid()` dans `commands/addadmin.js` et `commands/removeadmin.js`, qui pouvaient elles aussi rater le propriétaire ciblé sous sa forme LID.
  - Testé localement (ajout/retrait/rétrocompatibilité ancien format) avant livraison.

## 1.76.0

- **Correctif confirmé : Guardian annulait les propres changements du propriétaire du bot**, le traitant comme un tiers non autorisé — signalé par l'utilisateur avec capture d'écran (`!lock` par le propriétaire, restauré aussitôt par Guardian avec "Auteur : @Rodrigue Njaka" alors qu'il s'agissait bien de lui).
  - Cause : `core/adminStore.js` fixait `ownerJid` sous une seule forme (`sock.user.id`, typiquement `@s.whatsapp.net`) à la connexion. Or WhatsApp peut rapporter l'auteur d'une action de groupe sous sa forme `@lid` (identifiant "LID", distinct de la forme classique pour le même compte) — `isAdmin()` comparait alors deux formes différentes du même propriétaire et renvoyait `false`. Même famille de bug que le correctif `participants` en 1.74.1, cette fois sur l'identité de l'auteur plutôt que sur la liste des arrivants.
  - `src/core/adminStore.js` : `setOwnerJid()` prend désormais `sock` entier (au lieu de `sock.user?.id`) et réutilise `getBotSelfIds()` — déjà éprouvé ailleurs dans le projet pour ce même problème — pour capturer toutes les formes connues du propriétaire (PN et LID). `isAdmin()` vérifie contre cet ensemble complet plutôt qu'une seule chaîne figée. `getOwnerJid()`/`getAdmins()` gardent leur forme canonique unique inchangée (affichage, `addadmin`/`removeadmin`).
  - `src/core/client.js` : appelle `setOwnerJid(sock)` au lieu de `setOwnerJid(sock.user?.id)`.
  - ⚠️ Limite connue restante : les admins ajoutés via `{prefix}addadmin` (pas le propriétaire) ne bénéficient pas encore de cette double reconnaissance PN/LID — s'ils rencontrent le même symptôme, il faudra étendre le même principe à `extraAdmins`.

## 1.75.0

- **Support Termux/Android : chemin ffmpeg centralisé et configurable via `FFMPEG_PATH`**, en vue d'héberger le bot directement sur téléphone (sans serveur externe). `ffmpeg-static` fournit un binaire précompilé pour Linux glibc classique, qui ne s'exécute pas dans l'environnement Bionic de Termux — sans correctif, stickers/conversions média/téléchargement YouTube auraient été cassés sur ce type d'installation.
  - Nouveau `src/utils/ffmpegPath.js` : résout le chemin ffmpeg une seule fois (`FFMPEG_PATH` si défini, sinon `ffmpeg-static` comme avant), au lieu des 3 imports dupliqués précédents.
  - `src/utils/sticker.js`, `src/utils/mediaConvert.js`, `src/utils/youtube.js` : utilisent désormais ce point central au lieu d'importer `ffmpeg-static` chacun de leur côté.
  - `.env` : variable `FFMPEG_PATH` documentée (vide par défaut = comportement inchangé sur Render/VPS).

## 1.74.1

- **Correctif confirmé : `!welcome` (et potentiellement `!bye`/antipromote/antidemote/antipurge/antiraid) cassés par un format inattendu de `participants` sur Baileys 7.0.0-rc14.** Cause identifiée grâce aux logs isolés du correctif 1.74.0 : `TypeError: jid.split is not a function` — certaines entrées de `participants` sur `group-participants.update` (`action: 'add'`) arrivent sous forme d'objet plutôt que de chaîne JID brute (probablement lié à la gestion `@lid`, cf. le correctif `!tagadmin` en 1.70.3).
  - `src/handlers/groupParticipantsHandler.js` : nouvelle `normalizeParticipants()`, appelée une seule fois à la réception de l'événement, qui convertit chaque entrée en chaîne (`participant.id`/`participant.jid` si c'est un objet) avant de la transmettre à quoi que ce soit. Les entrées non convertibles sont ignorées avec un `logger.warn` (compteur + échantillon brut, pour affiner si le format varie encore).
  - Corrigé à la source plutôt que dans chaque consommateur (`antipromote.js`, `antidemote.js`, `antipurge.js`, `joinRaidGuard.js` utilisent tous `normalizeJid()` en interne, qui fait le même `jid.split('@')` et aurait le même problème) — un seul point de normalisation pour toute donnée `participants` entrant dans le système.

## 1.74.0

- **Correctif (diagnostic) : `!welcome`/`!bye` pouvaient être bloqués silencieusement par une erreur survenue plus tôt dans le traitement d'un événement `group-participants.update`** — signalé par l'utilisateur : `!welcome on` confirme bien l'activation, mais rien ne s'affiche à l'arrivée d'un membre.
  - `src/handlers/groupParticipantsHandler.js` : le handler regroupait antipromote/antidemote/antipurge/antiraid ET l'envoi welcome/bye dans **un seul et même `try/catch`** — une exception dans n'importe laquelle des étapes précédentes (ex: `handleJoinRaidGuard`) empêchait silencieusement l'envoi du message de bienvenue, avec pour seule trace un warn générique impossible à rattacher à sa cause réelle. Chaque étape a désormais son propre `try/catch`, avec un log précis identifiant laquelle a échoué (`"Erreur dans handleJoinRaidGuard (antiraid)"`, `"Erreur lors de l'envoi du message de bienvenue/départ"`, etc.) — une erreur sur une étape n'affecte plus jamais les suivantes.
  - Garde ajoutée si `getCurrentTheme()` renvoie `undefined` (registre de thèmes pas encore chargé) : log explicite au lieu d'un plantage silencieux dans `theme.renderWelcome(...)`.
  - ⚠️ Correctif de robustesse structurel, pas encore confirmé comme LA cause exacte du signalement initial — en attente des logs serveur pour identifier précisément quelle étape échouait chez l'utilisateur.

## 1.73.0

- **Nouvel outil agent : `bot_info` — l'agent peut désormais répondre avec exactitude sur RodrickBOT lui-même** (identité, liste des commandes par catégorie, détail d'une commande précise), sans jamais exposer de code source.
  - Nouveau `src/agent/tools/botInfoTool.js` : construit ses réponses uniquement à partir des métadonnées déjà déclarées par chaque commande (`name`/`aliases`/`description`/`category`/`adminOnly`/`privateOnly`), jamais recopiées à la main — même principe que `getIntentToolNames()` dans `toolRegistry.js`. Garde-fou structurel : cet outil n'a accès à aucun fichier source ni à `command.execute`, donc rien à fuiter par ce chemin quelle que soit la question posée. Un filtre sur les formulations type "montre le code" reste une couche supplémentaire, pas la protection elle-même.
  - `src/agent/toolRegistry.js` : enregistrement de l'outil.
  - `src/agent/agentService.js` : `commands` ajouté au contexte transmis à `executeTool()` (nécessaire pour que `bot_info` lise le registre de commandes déjà chargé au démarrage), et cas `bot_info` ajouté dans `buildToolArgs()`.
- **Garde-fou anti-fuite de code dans `askGroq()`** — c'était le seul chemin de génération de réponse libre en mode agent (intention `ask_general`/repli général) qui ne passait par aucune notion d'identité ni de protection du code source. `contextBuilder.js` construit bien un prompt riche avec historique, mais il n'est utilisé que pour la classification d'intention (`detectIntent`), jamais pour générer la réponse finale envoyée à l'utilisateur.
  - `src/utils/groq.js` : le prompt système de `askGroq()` déclare maintenant l'identité de RodrickBOT et refuse explicitement de révéler, citer, reproduire, résumer ligne par ligne ou inventer son propre code source, même sur demande reformulée ou en plusieurs étapes.

## 1.72.0

- **Menu : photo + audio garantis quelle que soit la forme envoyée (texte ou liste interactive expérimentale)** — jusqu'ici, seul le menu texte (`sendWithChannelCard(ctx, text, { asImage: true })`) portait la bannière du bot ; la liste interactive introduite en 1.71.0 partait sans photo, le format `listMessage` natif n'ayant pas de champ image d'en-tête.
  - `src/utils/channelCard.js` : nouveaux exports `sendChannelBanner(ctx, caption?)` (envoie juste la bannière, badge "Voir la chaîne" inclus, sans rien faire si aucun logo n'est configuré) et `getChannelForwardContext()` (expose le contextInfo brut pour les modules qui construisent leur propre message, comme `interactiveMenu.js`).
  - `src/utils/interactiveMenu.js` : `sendInteractiveListMenu()` accepte désormais un `contextInfo` optionnel, injecté dans `listMessage.contextInfo` — la liste porte donc elle aussi le badge "Voir la chaîne", pas seulement la photo qui la précède.
  - `src/commands/help.js` : le menu principal envoie maintenant systématiquement **photo → menu → audio**, dans cet ordre, que `EXPERIMENTAL_INTERACTIVE_MENU` soit activé ou non. Repli sur le menu texte inchangé en cas d'échec technique de la liste interactive.
  - ⚠️ Cas limite non traité (volontairement, pour garder le repli simple) : si la photo part avec succès mais que l'envoi de la liste échoue juste après, le repli sur le menu texte (`asImage: true`) renvoie une seconde photo. Rare (suppose un échec réseau entre les deux envois), sans conséquence grave.

- **`!antilink` et `!antilien-domaine` : réponses transférées depuis la chaîne officielle (badge natif "Voir la chaîne")** — `!ping` l'avait déjà (vérifié dans `src/commands/ping.js`, aucun changement nécessaire dessus), mais `!antilink` et `!antilien-domaine` envoyaient encore leurs réponses via `ctx.reply`/`ctx.success` classiques, sans le badge.
  - `src/commands/antilink.js` et `src/commands/antilien-domaine.js` : toutes les réponses de contenu (statut, confirmation d'activation/désactivation, ajout/retrait de domaine, liste des domaines autorisés) passent maintenant par `sendWithChannelCard`, avec le même pattern que `ping.js`/`setup.js` — `ctx.success()` pour la réaction ✅ seule, puis le texte via la carte.
  - Les erreurs de validation (mauvais usage, domaine manquant, commande hors groupe) restent en `ctx.error()` classique, sans badge — même convention que `setup.js`.

## 1.71.0

- **Nouvelle fonctionnalité (expérimentale) : `!menu` en vraie liste WhatsApp cliquable** — `QuizRenderer.js` documentait déjà l'échec d'un essai précédent (liste `sections`/`rows` brute via `sendMessage()`, rendue en texte plat sur les comptes personnels). Cause confirmée en inspectant directement le paquet `@whiskeysockets/baileys@7.0.0-rc14` réel : `sendMessage()` n'attache jamais le nœud binaire `<biz><list type="product_list" v="2"/></biz>` que WhatsApp utilise pour décider d'afficher une liste native plutôt qu'un texte de repli.
  - Nouveau `src/utils/interactiveMenu.js` : construit le `listMessage` (proto Baileys) à la main et l'envoie via `sock.relayMessage(..., { additionalNodes })` en injectant ce nœud manuellement — volontairement sans dépendance à un paquet npm tiers pour ça (plusieurs existent mais peu maintenus/audités, et faire tourner du code non vérifié avec accès au compte WhatsApp et aux clés API est un risque en soi).
  - `src/commands/help.js` : `!menu` et `!menu <catégorie>` tentent la liste interactive en premier si le flag est activé, avec repli automatique et silencieux sur le menu texte habituel en cas d'échec technique d'envoi. Les clics renvoient leur `rowId` (ex: `!menu groupe`, `!ping`), lu par le mécanisme `listResponseMessage.singleSelectReply.selectedRowId` déjà existant dans `extractText()` — aucune modification du handler de messages nécessaire. Le détail d'une commande (`!menu <commande>`) reste en texte pour l'instant, pas encore couvert par ce flag.
  - Nouveau flag `EXPERIMENTAL_INTERACTIVE_MENU` (`.env`, défaut `false` — aucun changement de comportement tant qu'il n'est pas activé explicitement), voir `src/config/index.js`.
  - ⚠️ Reverse-engineered, non documenté officiellement par WhatsApp/Meta ni par Baileys : peut casser silencieusement à la prochaine mise à jour du protocole (l'envoi réussit techniquement, mais le rendu réel chez le destinataire n'est pas vérifiable côté serveur). À tester sur un numéro secondaire avant tout déploiement en prod.

## 1.70.3

- **Correctif : `!tagadmin` taguait le bot lui-même alors qu'il est admin du groupe** (le bot tournant sur le compte personnel du propriétaire). Cause : `normalizeJid(sock.user?.id)` compare le bot à une seule forme de JID, mais WhatsApp peut identifier le même compte sous deux formes différentes (`@s.whatsapp.net` classique, ou `@lid`) — l'entrée admin du bot dans `groupMetadata().participants` n'est pas toujours écrite sous la même forme que `sock.user.id`, ce qui faisait échouer silencieusement le filtre.
  - Nouveaux helpers partagés `getBotSelfIds(sock)` / `isBotJid(sock, jid)` dans `src/utils/groupTarget.js`, qui comparent contre **toutes** les identités connues du bot (id + lid, à la fois via `normalizeJid` et `jidNormalizedUser` de Baileys) plutôt qu'une seule forme.
  - Le même angle mort existait dans **7 autres fichiers** utilisant le même pattern fragile (`jid === botJid`) : `src/utils/antidemote.js`, `src/utils/antipromote.js`, `src/utils/antipurge.js` (protections anti-abus — un faux négatif ici pouvait déclencher une sanction contre le bot lui-même), `src/commands/inactive.js`, `src/commands/kickall.js` (le bot pouvait finir dans sa propre liste de membres à expulser), `src/commands/delgroup.js`, `src/commands/savecontacts.js`. Tous corrigés avec le même helper.
  - `src/core/groupGuardian.js` avait déjà la bonne logique (comparaison multi-identités) mais dupliquée en local dans `isBotGroupAdmin` — refactorisé pour utiliser le même helper partagé, afin d'éviter que les deux implémentations divergent à l'avenir.

## 1.70.2

- **Correctif : `!antilink` et `!antilien-domaine` ne détectaient pas les liens partagés sous forme de carte enrichie** (ex: bouton "Partager" d'un Reel/vidéo Facebook, avec miniature et lecture intégrée). Dans ce cas, WhatsApp envoie le lien dans `contextInfo.externalAdReply.sourceUrl` plutôt que dans le texte visible du message — `extractText()` ne regarde pas cet endroit, donc les deux protections laissaient passer ces liens.
  - Nouveau helper `extractLinkPreviewUrl()` dans `src/utils/helpers.js`, branché dans `antilink.js` et `linkWhitelist.js` uniquement (pas dans `extractText()` global, pour ne pas affecter le parsing des commandes/quiz).

## 1.70.1

- **Correctif : les premiers messages ne passaient pas après un appairage frais (nouveau QR/code)** — confirmé lié à la migration Baileys 7.x (1.70.0). Ni `syncFullHistory` ni `shouldSyncHistoryMessage` n'étaient précisés dans `makeWASocket`, et en 7.x, l'absence des deux fait que Baileys désactive silencieusement TOUT sync d'historique (`shouldSyncHistoryMessage = () => !!syncFullHistory`, donc `() => false` par défaut) — y compris le "bootstrap" initial nécessaire à WhatsApp pour envoyer les données de routage des groupes et les correspondances `@lid`. Plusieurs bugs documentés sur Baileys 7.x décrivent exactement ce symptôme.
  - `src/core/client.js` : `syncFullHistory: true` et `shouldSyncHistoryMessage: () => true` ajoutés explicitement.
  - ⚠️ Compromis à connaître : un appairage frais va maintenant télécharger un historique plus complet au premier lancement (payload plus lourd, un peu plus long à se stabiliser) — c'est le prix nécessaire pour que le routage des messages fonctionne dès le début. Rien ne change pour une reconnexion normale (session déjà existante).

## 1.70.0

- **Migration vers Baileys 7.0.0-rc14** (depuis 6.7.24) — tentative de correction de fond des erreurs de session (`SessionError: No sessions`, `not-acceptable`/406) rencontrées avec des contacts adressés en `@lid`, y compris avec une session déjà établie (cas confirmé sur `!autolike`). WhatsApp impose l'adressage `@lid` de façon croissante (obligatoire d'ici juin 2026) ; la 7.x contient des correctifs explicites de gestion des LID absents de la 6.7.x.
  - ⚠️ **Encore en release candidate côté Baileys** — pas une version stable. Validé ici : installation propre, tous les imports utilisés (`makeWASocket`, `useMultiFileAuthState`, `makeCacheableSignalKeyStore`, `fetchLatestBaileysVersion`, `DisconnectReason`) présents et correctement typés dans le paquet réel, et construction réelle du socket avec la configuration exacte du bot sans erreur. **Non testé en revanche : un appairage/connexion WhatsApp réel** (impossible à valider hors environnement de développement) — teste l'appairage AVANT de considérer cette version comme fiable en prod.
  - `src/core/client.js` : `getMessage` ajouté à `makeWASocket` (obligatoire en 7.0.0 pour des retries/déchiffrements de votes de sondage/messages cités fiables — non implémenté avant, silencieusement dégradé). Clés Signal enveloppées avec `makeCacheableSignalKeyStore` (recommandé par le guide de migration officiel).
  - Nouveau `src/core/sentMessageStore.js` : petit cache en mémoire (500 entrées max) du contenu des messages envoyés par le bot, indexé par `messageId`, alimenté depuis `outboundGateway.js` — nécessaire pour que `getMessage` fonctionne réellement.
  - `package.json` : retrait de l'`overrides` qui forçait `libsignal` vers le fork `libsignal-node@2.0.1` (ajouté pour la 6.7.24) — la 7.x dépend nativement de `libsignal@^6.0.0`, une implémentation différente maintenue par l'équipe Baileys ; l'ancien override aurait forcé une dépendance incompatible.
  - Aucun changement d'import ailleurs dans le code : le paquet reste `@whiskeysockets/baileys` (pas de renommage), donc les 112 commandes existantes ne sont pas concernées par ce changement de version en elles-mêmes.

## 1.69.1

- **Correctif : `!autolike` ne réagissait à aucun statut** — confirmé par les logs de prod (`SessionError: No sessions`, puis `not-acceptable`/406 côté serveur WhatsApp). Cause : `msg.key.participant` était utilisé sous sa forme `@lid` pour construire `statusJidList`, alors qu'établir une session Signal pour réagir via cette forme échoue quand aucune session n'existe déjà avec la personne qui a posté le statut.
  - `src/core/autoLikeStatus.js` utilise maintenant `msg.key.participantAlt` (la forme numéro `@s.whatsapp.net`) en priorité, avec repli sur `participant` si absent.
  - Ajout d'un marquage "vu" (`sock.readMessages`) sur le statut avant la réaction — comportement humain normal, et potentiellement requis côté serveur (best-effort, un échec n'empêche pas la tentative de réaction).

## 1.69.0

- **Nouvelle commande `!autolike`** — réagit automatiquement à chaque statut WhatsApp vu par le bot (comme un "like"), avec l'emoji de ton choix.
  - `!autolike on|off` — active/désactive.
  - `!autolike emoji <emoji>` — change l'emoji utilisé (💚 par défaut).
  - `!autolike` (sans argument) — affiche l'état actuel.
  - Désactivé par défaut. Réglage global au bot (pas par groupe), persisté dans `data/autolike.json`, réservé aux admins.
  - Implémenté comme module autonome (`src/core/autoLikeStatus.js`) sur son propre listener `messages.upsert`, même pattern que `viewOnceCache.js` — n'interfère pas avec le pipeline de commandes ni les autres filtres (rattrapage/doublons) puisque les statuts ne sont pas des commandes.

## 1.68.4

- Commentaire obsolète corrigé dans `src/handlers/messageHandler.js` (`processedMessageIds`) : indiquait encore la clé `"chatId:messageId"`, alors que 1.68.2 était déjà passé à `messageId` seul. Aucun changement de comportement.

## 1.68.3

- **Vrai correctif de la réexécution de commandes après reconnexion** (`ultimo`, et probablement `menu`/`play` observés précédemment) — confirmé par `bot.log` en prod. Un message bloqué par le filtre de rattrapage (`isStaleBacklogMessage`) au 1ᵉʳ passage n'était jamais enregistré dans le cache anti-doublon, puisque le code retournait avant même d'appeler `isDuplicateMessage()`. Quand Baileys redélivre ce même message une 2ᵉ fois après un échec de déchiffrement (`retryCount: 2`), le paquet arrive avec un `messageTimestamp` **rafraîchi** (proche de l'heure de cette redélivrance, pas l'horodatage d'origine) : il ne semble plus "vieux" du tout, passe le filtre de rattrapage comme s'il était neuf, et — n'ayant jamais été enregistré — n'est pas non plus reconnu comme doublon. La commande repartait.
  - Ordre des deux vérifications inversé dans `handleSingleMessage()` (`src/handlers/messageHandler.js`) : le dédoublonnage par `messageId` passe maintenant EN PREMIER, avant le filtre de rattrapage, pour que l'ID soit mémorisé dès la 1ère fois — vieux ou pas — et bloque toute redélivrance ultérieure du même message, même avec un timestamp trafiqué.

## 1.68.2

- **Correctif "les commandes se réexécutent" (`!menu`, `!play`, etc.) après un retry Baileys** — le dédoublonnage (`isDuplicateMessage`, `src/handlers/messageHandler.js`) utilisait la clé `chatId:messageId`. Logs confirmés : WhatsApp fait actuellement coexister deux formes de JID pour une même conversation (`@lid` et `@s.whatsapp.net`, voir `"addressing_mode": "lid"` dans les logs baileys), et un retry après échec de déchiffrement peut redélivrer un message déjà traité sous l'AUTRE forme de JID — même `messageId`, `chatId` différent, donc la clé combinée ne reconnaissait pas le doublon.
  - Clé de dédoublonnage changée pour `messageId` seul (sans le `chatId`). Les `messageId` WhatsApp sont uniques en pratique (chaîne aléatoire longue) : aucun risque réel de collision entre deux conversations différentes sur la fenêtre de 5 minutes du cache.
  - `dedup.json` existant sur les instances déjà en prod contient des entrées à l'ancien format (`chatId:messageId`) : elles sont simplement ignorées au chargement (pas d'erreur), le cache se reconstruit normalement avec le nouveau format dès le premier message traité.

## 1.68.1

- **Diagnostic : rendre visible le filtre anti-rejeu/anti-rattrapage introduit précédemment dans `messageHandler.js`** — les deux seuls logs qui indiquaient qu'un message avait été bloqué (rattrapage au redémarrage, doublon Baileys) étaient en `logger.debug(...)`, invisibles en production (`logLevel: "info"` par défaut). Impossible jusqu'ici de vérifier si le filtre fonctionnait ou ratait un cas.
  - Les deux logs de blocage passent en `logger.warn(...)` (visibles sans changer `logLevel`).
  - Nouveau log au moment où `connectedAt` est fixé à chaque (re)connexion (`src/core/client.js`), pour connaître l'heure exacte de référence utilisée par le filtre anti-rattrapage.
  - Durcissement de `isStaleBacklogMessage()` : les cas où `messageTimestamp` est absent ou non convertible en nombre étaient auparavant laissés passer silencieusement ("pas exploitable"). Ils le sont toujours (on ne peut pas bloquer sans donnée fiable), mais désormais avec un `logger.warn(...)` explicite au lieu de disparaître sans trace.
  - Même traitement pour `isDuplicateMessage()` quand `messageId` est absent.

## 1.68.0

- **Suppression de la commande `!pinterest`/`!pin`** : commande et logique associée entièrement retirées.
  - Suppression de `src/commands/pinterest.js` et `src/utils/pinterest.js`.
  - Aucun autre fichier ne référençait ces modules ; `runDownload`/`youtube-dl-exec` restent utilisés par les autres commandes de téléchargement (`instagram`, `facebook`, `tiktok`, `youtube`) et sont conservés.

## 1.67.9

- **Correctif `!pinterest`/`!pin` : "Aucun média trouvé" persistait même sur l'URL CANONIQUE d'un pin** (log confirmé : `finalUrl` déjà égale à `https://www.pinterest.com/pin/<id>/`, sans `/sent/` ni paramètres de tracking — donc le retry ajouté en 1.67.8 ne pouvait rien changer) — la vraie cause, plus large que le cas `/sent/` : Pinterest a visiblement changé le comportement de ses pages de pin pour les requêtes non authentifiées (sans cookie de session), qui ne reçoivent plus ni le bloc `__PWS_DATA__` ni les balises `og:image`/`twitter:image` du pin — seulement un shell HTML générique contenant des assets d'interface (logos, polyfills) sur `pinimg.com`, d'où le `containsPinimg: true` trompeur alors qu'aucune des 3 méthodes de scraping du HTML n'avait de données à trouver.
  - Nouveau dernier recours dans `utils/pinterest.js` : `fetchFromPidgetsApi()` interroge directement `widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=<id>`, un ancien endpoint JSON public de Pinterest (prévu à l'origine pour le widget d'intégration "Pin it"), qui renvoie les données du pin par ID sans nécessiter de session — donc insensible au changement de comportement des pages HTML décrit ci-dessus.
  - Résolution de la taille d'image : cet endpoint n'expose pas toujours `orig` (pleine résolution) contrairement au HTML de la page ; nouvelle constante `PIDGETS_IMAGE_SIZE_PRIORITY` qui retombe sur la plus grande taille fixe disponible (`736x`, puis `564x`, `474x`, etc.) si `orig` est absent.
  - Cet endpoint étant non officiel et non documenté (JSONP à l'origine), l'appel est enveloppé dans un `try/catch` qui échoue silencieusement (retourne `null`) sur toute erreur réseau/JSON, pour ne jamais faire planter la commande à cause d'un endroit connu pour être instable dans le temps — il ne fait donc que s'ajouter aux méthodes existantes, en tout dernier recours après elles.

## 1.67.8

- **Correctif `!pinterest`/`!pin` : "Aucun média trouvé" sur les liens Pinterest "envoyés à quelqu'un"** (`/pin/<id>/sent/?invite_code=...&sender=...&sfo=1`, générés quand un pin est partagé nommément — via WhatsApp, iMessage, etc. — plutôt que copié depuis la page du pin) — log confirmé : page réelle de 1 Mo reçue (status 200, `containsPinimg: true`), mais aucune des 3 méthodes d'extraction ne trouvait de résultat. La cause : Pinterest sert sur cette route `/sent/` un shell applicatif différent de la page de pin standard (orienté connexion/installation de l'app), sans le bloc `__PWS_DATA__` ni les balises `og:image`/`twitter:image` du pin réel — le `pinId` reste correctement extrait de l'URL, mais la page elle-même ne contient tout simplement pas les données du pin demandé.
  - `utils/pinterest.js` : la logique de fetch + extraction est factorisée dans `fetchAndExtract()`. Si la première tentative échoue mais qu'un `pinId` a bien été extrait, `fetchPinterestMedia()` retente une fois sur l'URL canonique reconstruite `https://www.pinterest.com/pin/{pinId}/` (sans le suffixe `/sent/` ni les paramètres de tracking), qui elle contient les données complètes du pin.
  - Aucun changement côté `commands/pinterest.js` ni `downloadPinterestImage()` : uniquement l'étape de récupération/extraction dans `utils/pinterest.js`.

## 1.67.7

- **Correctif `!pinterest`/`!pin` : mauvaise image renvoyée (une image "multicolore" sans rapport avec le pin demandé)** — le filet de sécurité introduit en 1.67.5 ("n'importe quelle URL `i.pinimg.com` trouvée sur la page, triée par résolution") n'était PAS ancré sur le pin demandé : une page de pin Pinterest contient presque toujours aussi les images de plusieurs pins "suggérés"/liés dans un carrousel, et ce filet pouvait très bien attraper l'image d'un de CES pins-là au lieu du pin réellement demandé.
  - Nouvelle méthode d'extraction PRIORITAIRE dans `utils/pinterest.js` : `extractFromPwsData()` parse pour de vrai (`JSON.parse`, plus de regex hasardeuse) le bloc `<script id="__PWS_DATA__" type="application/json">` que Pinterest embarque dans la page, retrouve l'ID du pin depuis l'URL RÉSOLUE (`res.url`, après le éventuel redirect d'un lien court `pin.it`), et va chercher précisément `pins[pinId].images.orig.url` — impossible de se tromper de pin avec cette méthode, contrairement à toute recherche de motif sur l'ensemble du texte de la page.
  - Le filet de sécurité "n'importe quelle URL pinimg.com" (non ancré, prouvé peu fiable) est retiré. Restent en repli, dans cet ordre : la regex `"orig":{...}` brute sur toute la page (non ancrée non plus, mais gardée car le premier objet "orig" rencontré correspond presque toujours au pin principal), puis `og:image`/`twitter:image`.
  - Log de diagnostic enrichi avec le `pinId` extrait, pour vérifier immédiatement si l'anti-fiabilité vient d'un ID non résolu plutôt que d'une structure `__PWS_DATA__` imprévue.

## 1.67.6

- **Correctif `!pinterest`/`!pin` : crash Baileys/sharp "Input file contains unsupported image format" après une extraction d'image réussie** — l'URL d'image était désormais correctement trouvée (voir 1.67.5), mais son téléchargement se faisait sans `Referer`, alors que le CDN d'images de Pinterest (`i.pinimg.com`) applique une protection anti-hotlink basée dessus : sans lui, il répond avec un statut 200 mais un corps qui n'est PAS l'image (page d'erreur/placeholder). Ce faux buffer remontait tel quel jusqu'à `sock.sendMessage`, où Baileys plante en interne dans sharp en tentant de générer la miniature du message — une erreur qui n'atteignait jamais le `catch` de `commands/pinterest.js` puisqu'elle survenait pendant l'ENVOI, pas pendant le téléchargement.
  - Nouveaux `IMAGE_HEADERS` dans `utils/pinterest.js`, distincts des en-têtes utilisés pour la page HTML : `Referer: https://www.pinterest.com/` en plus du user-agent navigateur.
  - `downloadPinterestImage()` vérifie maintenant le `content-type` de la réponse AVANT de la renvoyer — si ce n'est pas une image, l'erreur est levée à cet endroit précis (avec le statut, le content-type et un extrait du corps loggés côté serveur), donc rattrapée proprement par le `catch` existant de la commande au lieu de faire planter l'envoi du message plus loin.

## 1.67.5

- **Correctif `!pinterest`/`!pin` : "Aucun média trouvé" persistait même avec un vrai user-agent navigateur (log confirmé : page réelle de 1 Mo reçue, status 200)** — le vrai bug, identifié grâce au log de diagnostic ajouté en 1.67.3 : la regex cherchant l'objet `"orig":{"url":"..."}` exigeait que `url` soit la TOUTE PREMIÈRE clé de l'objet, alors que Pinterest envoie systématiquement `width`/`height` avant `url` en pratique — cette regex ne matchait donc jamais un seul vrai pin, quel que soit le user-agent utilisé.
  - `extractImageFromHtml()` (`utils/pinterest.js`) réécrite : la regex `"orig"` tolère maintenant n'importe quelles clés entre `{` et `"url":` ; le HTML est normalisé une fois en tête de fonction (`\"` → `"`, `\/` → `/`) pour gérer aussi bien le JSON échappé une fois qu'imbriqué deux fois, ce que Pinterest fait selon les pages.
  - **Nouveau filet de sécurité supplémentaire** : si la structure JSON n'est pas reconnue, recherche de n'importe quelle URL `i.pinimg.com` présente dans la page (peu importe la clé qui la contient), en choisissant automatiquement la plus haute résolution disponible (`originals` en priorité, puis les tailles décroissantes `736x`/`564x`/`474x`/`236x`...) — ne dépend d'aucune structure de données précise, seulement du nom de domaine du CDN Pinterest, donc bien plus robuste aux futurs changements internes de la page.
  - Log de diagnostic enrichi (`finalUrl` après redirection, `containsPinimg`) pour toute future régression.

## 1.67.4

- **Correctif `!vocal-en-texte` : `Erreur API Groq (400)` systématique sur certaines notes vocales** — la cause : `transcribeAudio()` (`utils/groq.js`) repliait tout mimetype qui n'était ni "ogg" ni "mp4" sur une extension de fichier `.audio`, qui n'existe dans AUCUNE liste d'extensions reconnues par l'API Whisper de Groq (elle reprend le même contrat strict que l'API OpenAI) — rejetée avec un 400 avant même de regarder le contenu du fichier. Se produisait sur toute note vocale WhatsApp envoyée avec un mimetype `audio/mpeg`, `audio/wav`, ou absent, selon le téléphone/la version de WhatsApp de l'expéditeur.
  - Nouvelle fonction `guessAudioExtension()` couvrant mp3/wav/webm/flac en plus d'ogg/m4a déjà gérés, avec un repli sur `.ogg` (format le plus courant d'une note vocale WhatsApp) plutôt que sur l'extension invalide `.audio`.
  - Le log serveur en cas d'échec upstream inclut maintenant le mimetype reçu et l'extension utilisée, pour diagnostiquer directement si un format encore non couvert (ex: `.amr`, rarissime sur WhatsApp aujourd'hui) redonne un 400.

## 1.67.3

- **Correctif `!pinterest`/`!pin` : "Aucun média trouvé sur ce pin" sur des pins pourtant valides et publics** — la cause : le user-agent générique utilisé pour récupérer la page (`"RodrickBOT/1.0"`) déclenchait la page "coquille" anti-bot de Pinterest, dépourvue de toute métadonnée exploitable (ni `og:image`, ni JSON embarqué).
  - `utils/pinterest.js` envoie désormais un vrai user-agent de navigateur (Chrome desktop) avec les en-têtes `Accept`/`Accept-Language` qui vont avec, pour la page HTML ET pour l'appel yt-dlp (pins vidéo).
  - Extraction de l'image rendue plus robuste avec 3 méthodes essayées dans l'ordre : le JSON de données embarqué par Pinterest lui-même (`"orig":{"url":"..."}`, pleine résolution, survit aux changements de structure des balises), puis `og:image`, puis `twitter:image` en dernier recours.
  - En cas d'échec malgré tout, le statut HTTP et un extrait du HTML reçu sont maintenant loggés côté serveur (jamais montrés à l'utilisateur WhatsApp) pour diagnostiquer sans avoir à reproduire le bug en aveugle.

## 1.67.2

- **Correctif : le raisonnement interne du modèle (balises `<think>...</think>`) s'affichait en clair dans les réponses IA** — repéré sur `!vision`/`!analyse-image`, dont le modèle de vision configuré (`groqVisionModel`) expose parfois son raisonnement complet en anglais directement dans le texte de réponse au lieu de le séparer proprement, avant même la vraie réponse en français.
  - Nouvelle fonction `stripThinkTags()` dans `utils/groq.js` : retire les balises `<think>...</think>` (cas normal), et se replie sur une chaîne vide si la balise n'est jamais refermée (réponse coupée en plein raisonnement) plutôt que d'afficher un raisonnement partiel.
  - Appliquée systématiquement à **toutes** les fonctions du fichier qui renvoient du texte à l'utilisateur — `askGroq`, `ocrImage`, `analyzeImage`, `summarizeText`, `correctText`, `translateText`, et `simplePrompt` (donc aussi `!debat`/`!define`/`!synonyme`/`!horoscope`) — pas seulement la vision : le même comportement peut en théorie survenir sur n'importe quel modèle à raisonnement, y compris `groqModel`. `transcribeAudio` (Whisper) n'est pas concernée, ce n'est pas un modèle de chat.

## 1.67.1

- **Correctif crash `!accelere`/`!ralenti` : `ffmpeg was killed with signal SIGKILL`** (rapporté en production sur un hébergement à RAM limitée) — un SIGKILL sur ffmpeg (par opposition à une vraie erreur ffmpeg avec message explicite) signifie presque toujours que l'OS a tué le processus par manque de mémoire (OOM killer), le couple decode+réencode complet requis par `setpts` (aucun mode "copy" possible pour changer la vitesse) étant le traitement vidéo le plus gourmand en RAM du bot.
  - `changeVideoSpeed()` (`utils/mediaConvert.js`) ajoute désormais trois garde-fous mémoire : plafond de 5 minutes sur la vidéo source (`-t`), redimensionnement défensif à 854px de large max (`scale`), et `-preset ultrafast -threads 2` (le preset x264 le plus économe en RAM, au prix d'un fichier de sortie légèrement plus gros). Mêmes réglages `-preset ultrafast -threads 2` ajoutés à `videoToGifMp4()` (`!gif`), exposée au même risque.
  - Nouvelle fonction `explainFfmpegError()` : détecte spécifiquement un SIGKILL et renvoie un message clair en français ("mémoire insuffisante sur le serveur...") au lieu de laisser remonter le message ffmpeg brut, incompréhensible pour un utilisateur WhatsApp. Les commandes `!accelere`/`!ralenti`/`!gif` n'ont pas eu besoin d'être modifiées : elles affichaient déjà `err.message` tel quel, qui est maintenant le message clair.
  - Compromis assumé : `-preset ultrafast` produit un fichier de sortie un peu plus lourd à qualité égale, et `-threads 2` encode un peu plus lentement — un choix largement préférable à un crash silencieux sur un hébergement à ressources limitées (Pterodactyl, VPS d'entrée de gamme...).

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
