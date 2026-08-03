# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/), versionnement selon [SemVer](https://semver.org/lang/fr/).

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