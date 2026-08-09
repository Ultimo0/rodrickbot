# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/), versionnement selon [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

## [1.17.0]
### Changed
- **Agent IA réservé aux administrateurs (`ADMIN_JIDS`)** :
  - `src/handlers/messageHandler.js` : tout message hors commande (donc destiné à l'agent conversationnel) est désormais ignoré silencieusement s'il ne vient pas d'un admin (`ADMIN_JIDS`) ou du propriétaire en self-test — même si une session `!agent on` a été activée par ailleurs, pour ne pas laisser deviner à un non-admin que le mode existe.
  - `src/commands/ultimo.js` (`!agent`/`!ultimo`) passe à `adminOnly: true` : seuls les admins peuvent désormais activer/désactiver le mode, cohérent avec la restriction ci-dessus (éviter qu'un non-admin l'active sans jamais obtenir de réponse).

## [1.16.3]
### Fixed
- Agent IA : une commande pontée refusée (ex: `!ping`/`!status` en groupe, réservées au privé, ou une commande `adminOnly` demandée par un non-admin) envoyait le bon message de refus, **puis** un second message parasite "Outil inconnu: ping". Cause : `invokeExistingCommand` (`src/agent/commandBridge.js`) renvoyait `false` après avoir déjà envoyé le message de refus (ou après un blocage silencieux intentionnel — lockdown, bot désactivé à distance, antilink...), ce que `agentService.js` interprétait comme "non géré" et faisait retomber sur `executeTool('ping', ...)` — qui échoue toujours pour ces noms, puisque `ping`/`status`/etc. sont des commandes pontées et non des outils agent enregistrés. Tous les gardes-fous du bridge renvoient désormais `true` dès qu'ils ont pris en charge la requête (succès, refus explicite, ou silence intentionnel) ; `false` est réservé au seul cas où le bridge n'a rien géré (nom hors liste blanche).

## [1.16.2]
### Fixed
- Agent IA : répondre à un message (reply) puis demander « traduire/corriger/résume en anglais » ignorait le message cité et traitait à la place l'instruction elle-même (ex: traduisait littéralement "Traduire en anglais"). Deux causes :
  - `src/agent/agentService.js` transmettait toujours l'instruction tapée par l'utilisateur comme `text` (le contenu à traiter) aux outils `translate_text`/`correct_text`/`summarize_text`/`rewrite_professional` — cette valeur n'étant jamais vide, ces outils l'utilisaient directement sans jamais tenter de résoudre le message cité. Elle n'est désormais plus transmise pour ces outils, qui se reposent sur `resolveTextSource()` (texte direct → args → message cité → message actuel → mémoire de session).
  - `src/agent/tools/{translateTool,correctTool,summarizeTool}.js` appelaient encore `resolveTextSource(msg, chatId, sender)` (ancienne signature à arguments positionnels), alors que `textSourceResolver.js` attend désormais un seul objet de contexte (`resolveTextSource(ctx)`) — seul `proRewriteTool.js` avait été mis à jour. Les trois outils appellent maintenant `resolveTextSource(ctx)` correctement.

## [1.16.1]
### Fixed
- Agent IA : `INTENT_TOOL_NAMES` (`src/agent/agentService.js`) listait deux noms d'outils fantômes (`translate`, `ocr_image`) qui ne correspondaient à aucun outil réellement enregistré dans `toolRegistry.js` (les vrais noms sont `translate_text` et `ocr`). Comme cette liste est injectée telle quelle dans le prompt système envoyé au classifieur IA, celui-ci choisissait parfois ces noms invalides — notamment `translate` pour toute demande de traduction — ce qui faisait échouer `executeTool()` avec "Outil inconnu: translate". Liste corrigée pour correspondre exactement aux noms enregistrés.

## [1.16.0]
### Changed
- **Migration complète de Mistral vers Groq** pour toutes les fonctionnalités IA du bot (`!ia`, `!ocr`, `!resume`, `!corriger`, `!traduire`, Agent IA conversationnel, `!rewrite`) :
  - `src/utils/mistral.js` remplacé par `src/utils/groq.js` — endpoint `https://api.groq.com/openai/v1/chat/completions` (compatible OpenAI), fonctions renommées (`askMistral` → `askGroq`), messages d'erreur mis à jour. La résilience réseau ajoutée avec Mistral (timeout 20s via `AbortController`, retry/backoff sur 429, gestion dédiée du 402 "crédit épuisé", logs upstream jamais exposés à l'utilisateur) est conservée à l'identique côté Groq.
  - `MISTRAL_API_KEY` (`.env`) remplacé par `GROQ_API_KEY` — **à mettre à jour manuellement dans `.env`, non inclus dans les archives/zips livrés**. Clé obtenable sur https://console.groq.com/.
  - `mistralModel` (`settings.json`) remplacé par `groqModel` (`llama-3.3-70b-versatile` par défaut) et `groqVisionModel` (`qwen/qwen3.6-27b`, nouveau).
  - `!ocr` : Groq n'a pas d'endpoint OCR dédié comme Mistral (`/v1/ocr`) — remplacé par un modèle de vision (`groqVisionModel`) via le chat completions standard, avec un prompt de transcription dédié. Les modèles vision de Groq changent assez fréquemment (plusieurs dépréciations ces derniers mois) : si l'OCR cesse de fonctionner, ajuster `groqVisionModel` dans `settings.json` en vérifiant https://console.groq.com/docs/vision.
  - `src/agent/agentService.js` (détection d'intention) migré vers Groq (endpoint + modèle + clé), en conservant le client mutualisé (`requestGroqJson`, retry/timeout) ainsi que la liste blanche de commandes pontables et la limite de débit introduites après la migration Mistral.
  - `src/agent/toolRegistry.js`, `src/agent/tools/{ocrTool,correctTool,summarizeTool,translateTool,proRewriteTool}.js`, `src/commands/{ia,ocr,resume,corriger,traduire}.js` : imports et références mises à jour.
  - `src/agent/README.md` mis à jour.

## [1.15.0]
### Added
- Commande `!antipurge` (alias `!antiraid`) `on|off|status` : détecte un admin (autre que `ADMIN_JIDS`) qui expulse 3 membres ou plus en moins de 10 secondes ("purge"/raid). Une fois détecté : l'auteur est démis puis expulsé du groupe, et le bot tente de réintégrer automatiquement les membres expulsés (`groupParticipantsUpdate(..., 'add')`), avec un compte-rendu transparent des réintégrations qui échouent (souvent dû aux réglages de confidentialité empêchant un ajout direct — WhatsApp ne garantit pas la réintégration).
- `src/utils/antipurge.js` (`handlePurgeGuard`) : fenêtre glissante en mémoire par auteur (même principe que `antispamGuard.js`), branchée sur l'action `remove` de `group-participants.update` (déjà utilisée pour les messages bye — les deux fonctionnalités sont indépendantes, l'une n'empêche pas l'autre). Réutilise `isBotGroupAdmin` de `core/groupGuardian.js`.
- `setAntipurge` dans `src/core/groupSettings.js`.

## [1.14.3]
### Fixed
- `!guardian` n'exemptait jamais `ADMIN_JIDS` : un changement de nom/description/photo/lien d'invitation/réglages fait par un admin de confiance était annulé exactement comme pour n'importe qui d'autre — incohérent avec `!antipromote`/`!antispam`, qui exemptent déjà `ADMIN_JIDS`. `src/core/groupGuardian.js` vérifie maintenant l'auteur avant de restaurer :
  - Photo et lien d'invitation : l'auteur vient directement de l'événement déclencheur (fiable).
  - Nom/description/réglages (`groups.update` ne fournit pas d'auteur) : best-effort, basé sur le même mécanisme de détection d'auteur déjà utilisé pour la notification (`recentActors`) — si l'auteur n'a pas pu être identifié à temps, le changement est restauré quand même, même s'il venait d'un admin.

## [1.14.2]
### Added
- `scripts/save-release.js` (`npm run save-release`) : sauvegarde locale d'une version stable dans `releases/v<version>/` (lu depuis `package.json`). Copie `src/`, `assets/`, `scripts/`, `tests/`, `package.json`, `CHANGELOG.md`, `README.md`, `.gitignore` — exclut `node_modules`, `.git`, `.env`, `auth_info/`, et tous les fichiers de données runtime. Refuse d'écraser une version déjà sauvegardée sauf avec `--force`. Purement local : `releases/` est ajouté à `.gitignore`, ce n'est ni un mécanisme de publication ni un remplacement des tags Git.

## [1.14.1]
### Changed
- `royal` est maintenant le thème par défaut (au lieu de `classique`), aussi bien dans `src/config/settings.json` que dans `utils/theme.js` (`DEFAULT_THEME`).
- Le style du thème actif s'étend désormais aux libellés/sections dans le **corps** des messages (pas seulement le grand titre en tête) : `!menu` (labels de catégories, "Version", "CATÉGORIES"), le message de démarrage ("Statut", "Instance", "Propriétaire", "Commandes chargées", "Mode"), et les gabarits welcome/bye par défaut ("Règles"). Le séparateur de pied de page (`themedSeparator`) suit aussi le style de bordure du thème actif.
- `!menu` affiche maintenant le thème actif (`🎨 Thème : 👑 Royal`).

### Fixed
- Le marqueur de citation (`> `) est redevenu **fixe**, non thémé (retiré du champ `quote` de chaque thème, supprimé de `utils/theme.js`) — `toQuoteBlock` (`utils/helpers.js`) et le message de démarrage l'utilisent en dur, comme avant l'introduction des thèmes. Au passage, une référence résiduelle à `theme.quote` (supprimé) dans `utils/startupMessage.js` aurait fait planter la signature du message de démarrage ; corrigée avant d'être livrée.

## [1.14.0]
### Added
- Système de thèmes visuels : `!theme list` / `!theme <nom>` (admin, effet immédiat, persisté dans `settings.json` — même principe que `!prefix`). 4 thèmes livrés : `classique` (défaut, identique au rendu existant), `royal`, `neon`, `mono` — chacun définit une police Unicode de titre, un style de bordure, un marqueur de citation et un emoji d'accent.
- `src/utils/theme.js` : registre des thèmes + `getCurrentTheme`/`setTheme`/`listThemeNames`/`boxTop`/`boxBottom`/`themedTitle`.
- `src/utils/fancyFont.js` : 3 nouvelles polices Unicode (`toBoldFont`, `toSansBoldFont`, `toMonospaceFont`), toutes basées sur des plages continues du bloc Mathematical Alphanumeric Symbols (contrairement à double-struck/fraktur qui ont des exceptions) pour rester simples et sans bug.
- Application **partout**, sans dupliquer la logique dans chaque commande :
  - `utils/helpers.js` (`toQuoteBlock`) — le marqueur de citation du thème remplace le `"> "` en dur, donc toutes les réponses via `ctx.reply`/`ctx.success`/`ctx.error` en héritent automatiquement.
  - `commands/help.js` (menu principal, sous-menus, détail de commande).
  - `utils/startupMessage.js` (message de démarrage).
  - `handlers/groupParticipantsHandler.js` (gabarits par défaut welcome/bye — uniquement quand le groupe n'a pas défini son propre message personnalisé).
- `theme: "classique"` ajouté à `src/config/settings.json`.

## [1.13.1]
### Changed
- Toutes les descriptions de commandes (`!menu`) référençaient le préfixe en dur (`!nom`), ce qui devenait incohérent depuis l'ajout de `!prefix` (préfixe modifiable à la volée). Chaque référence a été remplacée par un placeholder `{prefix}`, substitué par le préfixe courant au moment de l'affichage (`withPrefix()` dans `commands/help.js`) — donc toujours exact, même après un changement de préfixe.
- Portée volontairement limitée aux champs `description:` (affichés par `!menu`) : les messages d'usage codés en dur à l'intérieur des `execute()` (ex: `ctx.error('Usage: !dell <nom>')`) n'ont pas été touchés, pour rester un changement ciblé et à faible risque.

## [1.13.0]
### Added
- Commande `!prefix` : affiche le préfixe actuel (`!prefix`), ou le change (`!prefix <nouveau>`), avec effet immédiat sur tous les chats (pas de redémarrage nécessaire) et persistance dans `src/config/settings.json`. Réservée aux admins (`ADMIN_JIDS`).

## [1.12.0]
### Added
- Commande `!facebook` (`.facebook` / `!fb`) : télécharge une vidéo Facebook en audio (MP3) ou vidéo (MP4), même flux que `!tiktok`/`!youtube` (choix 1/2 après envoi du lien). Réutilise `youtube-dl-exec` (déjà une dépendance du projet pour `!youtube`) plutôt qu'une API tierce non vérifiable — `yt-dlp` supporte nativement `facebook.com`/`fb.watch`.
- `src/utils/facebook.js` : détection de lien, récupération des infos, téléchargement audio/vidéo — réutilise `runDownload` (désormais exporté) de `src/utils/youtube.js` au lieu de dupliquer la logique de téléchargement.
- `src/utils/downloadReply.js` : gère le nouveau type `facebook` dans le flux de choix 1/2 existant (aucune duplication de la mécanique de session).

## [1.11.0]
### Added
- Commande `!antispam` (`.antispam` avec le préfixe configuré) `on|off|status|config <limite> <secondes>|reset @membre` : détecte les rafales de messages (5 en moins de 8s par défaut, configurable par groupe), supprime les messages concernés, avertit l'auteur, et l'expulse au 3e avertissement. Réutilise le compteur d'avertissements déjà partagé par `!warn`/`!warns`/l'antilink (`core/warnStore.js`) plutôt que d'en créer un nouveau, puisque la sanction est identique (expulsion à 3).
- `src/core/antispamGuard.js` : fenêtre glissante en mémoire par membre, branchée sur `messages.upsert`. Exempte le bot lui-même et `ADMIN_JIDS`, et nécessite que le bot soit administrateur du groupe (réutilise `isBotGroupAdmin` de `core/groupGuardian.js`).
- `setAntispam` / `setAntispamConfig` dans `src/core/groupSettings.js`.
- Alias `!warnings` ajouté à la commande `!warns` existante (demandé comme `.warnings @user` — même fonctionnalité, pas de doublon créé).

## [1.10.4]
### Fixed
- Le message de démarrage affichait "Commandes chargées : 43" alors que `!menu` en affiche 42 — `index.js` comptait toutes les commandes chargées (`help` incluse), alors que `commands/help.js` exclut volontairement `!help` de sa propre liste. Le comptage utilise maintenant le même filtre (`cmd.name !== 'help'`) aux deux endroits.

## [1.10.3]
### Fixed
- Les commandes envoyées par le propriétaire du bot depuis son propre compte (`fromMe`) n'étaient traitées qu'en message privé, jamais en groupe — `isSelfTest` (dans `handlers/messageHandler.js` **et** `agent/commandBridge.js`, deux implémentations identiques) excluait explicitement les groupes (`!isGroup(...)`). Comme le bot tourne sur le compte personnel du propriétaire, ça rendait `!private on` inutilisable par lui-même en groupe, alors que la doc de `core/state.js` décrivait déjà ce mode comme actif "peu importe le chat (privé ou groupe)". `fromMe` est désormais traité comme admin (via `isSelfTest`) dans les deux contextes ; `ADMIN_JIDS` continue de fonctionner à l'identique en plus de ça.

## [1.10.2]
### Fixed
- Guardian bouclait en rafale sur les changements de photo de groupe (restauration → nouvel écho → nouvelle restauration...). Deux causes corrigées dans `src/core/groupGuardian.js` :
  - `fetchBuffer` faisait un `fetch()` nu sur l'URL de la photo WhatsApp, qui échoue sans en-têtes appropriés ; la comparaison de hash retombait alors systématiquement sur "différent" → restauration à chaque fois. Ajout des mêmes en-têtes que `commands/reveal.js` (`User-Agent`, `Accept`).
  - Ajout d'un cooldown anti-boucle dédié à la photo (`recentSelfIconRestore`, 10s), sur le même principe que celui déjà en place pour le lien d'invitation — rempart supplémentaire indépendant de la comparaison de hash.

## [1.10.1]
### Fixed
- `!guardian on` répondait "je dois être administrateur" alors que le bot l'était réellement : `isBotGroupAdmin` (`src/core/groupGuardian.js`) ne comparait `sock.user.id` aux participants qu'après avoir retiré le suffixe `:device`, ce qui échoue quand WhatsApp identifie le bot sous une forme JID différente (LID `@lid` vs PN `@s.whatsapp.net`) selon le compte/la session. La comparaison utilise maintenant le normaliseur officiel `jidNormalizedUser` de Baileys en plus, sur tous les champs d'identité disponibles (`id`, `lid`) côté bot et côté participants, avec un log de diagnostic si le bot reste introuvable dans la liste.

## [1.10.0]
### Added
- Commande `!guardian` (`.guardian` avec le préfixe configuré) `on|off|status` : protection avancée du groupe. Une fois activée, sauvegarde le nom, la description, la photo et les réglages (qui peut écrire / qui peut modifier les infos) comme référence, puis restaure automatiquement tout changement non initié par le bot et avertit le groupe (en mentionnant l'auteur si l'information est disponible).
- `src/core/groupGuardian.js` : logique de détection/restauration, branchée sur `groups.update` (nom, description, réglages) et sur les messages système `messageStubType` (`messages.upsert`) pour la photo, le lien d'invitation et l'attribution de l'auteur.
- `setGuardian` / `setGuardianSnapshot` dans `src/core/groupSettings.js`.
- Les photos de référence sont sauvegardées dans `saved_media/guardian/` (déjà ignoré par git via la règle existante `saved_media/`).

**Limites connues (voir aussi le message livré avec cette fonctionnalité) :** l'attribution de l'auteur et la détection photo/lien d'invitation reposent sur des constantes `WAMessageStubType` de Baileys non vérifiables sans test en conditions réelles — à valider après déploiement. Le lien d'invitation ne peut pas être restauré à l'identique (limitation de l'API WhatsApp) : il est immédiatement invalidé à la place.

## [1.9.0]
### Added
- Commande `!antipromote` (alias `!noautopromote`, `!protegeradmin`) : une fois activée sur un groupe, empêche les administrateurs WhatsApp du groupe (autres que `ADMIN_JIDS`) de nommer quelqu'un administrateur. Chaque tentative est annulée immédiatement (la cible est rétrogradée) et l'auteur reçoit un avertissement dédié ; au 3e avertissement, l'auteur perd lui-même son statut admin. `ADMIN_JIDS` fait office de "propriétaire du bot" (aucun JID propriétaire séparé n'est stocké — voir `!setup`), ces membres ne sont jamais concernés.
- `src/core/promotionGuardStore.js` : compteur d'avertissements dédié à `!antipromote`, séparé de `core/warnStore.js` (utilisé par `!warn`/l'antilink) pour ne pas mélanger des sanctions sans rapport.
- `src/utils/antipromote.js` (`handlePromoteGuard`) : logique d'interception, branchée sur l'action `promote` de l'événement Baileys `group-participants.update` (déjà utilisé pour welcome/bye).
- `setAntipromote` dans `src/core/groupSettings.js`.

## [1.8.2]
### Added
- Tests unitaires (`tests/`) basés sur `node:test`, sans nouvelle dépendance : `helpers`, `duration`, `fancyFont`, `groupTarget`, `documentText`, `quotedContent`, `groupMetadataCache`, `antilink`, `antiSpam` (+ `middlewares/index`), `agent/sessionMemory`, `agent/contextBuilder`, `core/downloadSessions`, `core/groupSettings`, `core/warnStore`.
- Scripts `npm test` et `npm run test:coverage`.

### Changed
- Suppression de la catégorie `Archivage` : `!save`, `!get`, `!dell`, `!listsaved` rejoignent la nouvelle catégorie `Sauvegardes`.
- Recatégorisation de plusieurs commandes pour un classement plus cohérent dans `!menu` : `!ping` → `Diagnostic`, `!pp` et `!reveal` → `Média`, `!rewrite` → `Intelligence Artificielle`.
- `CATEGORY_MENU` (`src/commands/help.js`) mis à jour en conséquence (ordre des catégories, ajout de `Sauvegardes`).

### Fixed
- `getGroupSettings` (`src/core/groupSettings.js`) renvoyait une copie superficielle : les objets `welcome`/`bye`/`antilink` étaient partagés avec les valeurs par défaut, donc entre tous les groupes. La copie est désormais profonde.
- L'intervalle de purge de `src/agent/sessionMemory.js` est `unref()` : il n'empêche plus le process de s'arrêter proprement.

## [1.8.1] - reconstitué (commit `eb60b61`)
### Added
- **Agent IA conversationnel** (Mistral, function-calling) : comprend le langage naturel, choisit automatiquement les commandes à exécuter, garde le contexte de la conversation et une mémoire de session par utilisateur (historique récent, dernier outil utilisé, dernier média, préférences), avec expiration automatique.
- Nouveau module `src/agent/` : orchestrateur de conversation, registre d'outils, mémoire de session, résolveur de contexte, et un ensemble d'outils qui réutilisent les commandes/utilitaires existants (sticker, toimg, tomp3, ocr, traduction, résumé, réécriture, téléchargement TikTok/YouTube...).
- Commande `!ultimo` (alias `!assistant`, `!botia`, `!agent`) : active/désactive/affiche l'état de l'agent pour le chat courant, et permet de réinitialiser sa mémoire de session (`on|off|status|clear`).
- Commande `!rewrite` (alias `!pro`, `!professionnel`, `!réécris`) : réécriture professionnelle d'un texte, en contournant volontairement l'agent (utile quand on veut ce résultat précis sans passer par la compréhension du langage naturel).
- Fonctionnement hybride : les commandes classiques (`!play`, `!sticker`, `!ocr`, etc.) continuent de fonctionner normalement, en parallèle de l'agent.

## [1.7.0] - 2026-08-04
### Added
- Commande `!ocr` (alias `!textfromimage`, `!extraire`) : extrait le texte visible d'une image via l'API OCR dédiée de Mistral (`mistral-ocr-latest`).
- `ocrImage` dans `src/utils/mistral.js`, réutilise la clé `MISTRAL_API_KEY` déjà utilisée par `!ia`.

## [1.6.0] - 2026-08-04
### Added
- Commande `!toimg` (alias `!img`) : convertit un sticker en image PNG.
- Commande `!tomp3` (alias `!mp3`) : extrait l'audio d'une vidéo (ou convertit un audio) en MP3.
- `getMediaType` (`src/utils/quotedContent.js`) reconnaît désormais aussi les stickers.
- Nouvel utilitaire `src/utils/mediaConvert.js` (`stickerToImage`, `extractAudioMp3`).

## [1.5.2] - 2026-08-04
### Changed
- Carte de lien de la chaîne WhatsApp (`sendChannelLink` dans `src/utils/channelCard.js`) : plusieurs pistes testées pour masquer le titre/l'icône ou le lien brut affiché au-dessus du bouton natif "Voir la chaîne". Aucune n'a fonctionné sans casser la carte (texte sans lien réel → message vide et sans bouton), donc retour à la version d'origine avec titre et miniature du logo. Comportement final inchangé par rapport à 1.5.1.

## [1.5.1] - 2026-08-03
### Fixed
- Reconnexion Baileys revue pour éviter les restrictions de compte WhatsApp : arrêt net sur session invalide (`loggedOut`, `badSession`, `multideviceMismatch`, `connectionReplaced`) au lieu de boucler indéfiniment, plafond de 8 tentatives, délai max porté à 5 min, jitter aléatoire sur le backoff.

## [1.5.0] - 2026-08-03
### Added
- Suppression définitive d'une instance depuis le dashboard (`DELETE /api/instances/:instanceId`), disponible uniquement pour les copies hors ligne.
- Dashboard restructuré : `public/index.html`, `public/css/style.css` et `public/js/app.js` séparés au lieu de tout dans `index.html`.
- Nouveau thème visuel "blues sombre" pour le dashboard.

## [1.4.1] - reconstitué (commit `406d16c`)
### Changed
- Obfuscation du build (`javascript-obfuscator`, script `build.js`).

## [1.4.0] - reconstitué (commit `087645c`)
### Changed
- Configuration de l'instance via `INSTANCE_ID` / `INSTANCE_OWNER`.

## [1.3.0] - reconstitué (commit `4fc2a62`)
### Added
- Nouvelle commande `!ia`.

## [1.2.0] - reconstitué (commit `8bc0db9`)
### Added
- Interrupteur à distance pour activer/désactiver une instance depuis le dashboard.
- Statistiques d'usage par commande (`commandStats`).

## [1.1.1] - version initiale (commit `7d6b11e`)
### Added
- Version initiale de RodrickBOT.

---

**Note :** les entrées 1.2.0 à 1.4.1, ainsi que 1.8.1, sont reconstituées a posteriori à partir de l'historique git — le numéro de version dans `package.json` avait été mis à jour sans entrée correspondante ici. À partir de maintenant, chaque changement notable doit s'accompagner d'une mise à jour ici et du champ `version` dans `package.json`, dans le même commit.