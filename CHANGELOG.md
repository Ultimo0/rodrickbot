# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/), versionnement selon [SemVer](https://semver.org/lang/fr/).

## [Unreleased]
### Added
- Tests unitaires (`tests/`) basés sur `node:test`, sans nouvelle dépendance : `helpers`, `duration`, `fancyFont`, `groupTarget`, `documentText`, `quotedContent`, `groupMetadataCache`, `antilink`, `antiSpam` (+ `middlewares/index`), `agent/sessionMemory`, `agent/contextBuilder`, `core/downloadSessions`, `core/groupSettings`, `core/warnStore`.
- Scripts `npm test` et `npm run test:coverage`.

### Fixed
- `getGroupSettings` (`src/core/groupSettings.js`) renvoyait une copie superficielle : les objets `welcome`/`bye`/`antilink` étaient partagés avec les valeurs par défaut, donc entre tous les groupes. La copie est désormais profonde.
- L'intervalle de purge de `src/agent/sessionMemory.js` est `unref()` : il n'empêche plus le process de s'arrêter proprement.

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

**Note :** les entrées 1.2.0 à 1.4.1 sont reconstituées a posteriori à partir de l'historique git — le numéro de version n'avait jamais été mis à jour dans `package.json` avant cette entrée. À partir de maintenant, chaque changement notable doit s'accompagner d'une mise à jour ici et du champ `version` dans `package.json`.