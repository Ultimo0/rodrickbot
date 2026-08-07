## [1.10.0]
### Added
- Commande `!guardian` (`.guardian` avec le préfixe configuré) `on|off|status` : protection avancée du groupe. Une fois activée, sauvegarde le nom, la description, la photo et les réglages (qui peut écrire / qui peut modifier les infos) comme référence, puis restaure automatiquement tout changement non initié par le bot et avertit le groupe (en mentionnant l'auteur si l'information est disponible).
- `src/core/groupGuardian.js` : logique de détection/restauration, branchée sur `groups.update` (nom, description, réglages) et sur les messages système `messageStubType` (`messages.upsert`) pour la photo, le lien d'invitation et l'attribution de l'auteur.
- `setGuardian` / `setGuardianSnapshot` dans `src/core/groupSettings.js`.
- Les photos de référence sont sauvegardées dans `saved_media/guardian/` (déjà ignoré par git via la règle existante `saved_media/`).

**Limites connues :** l'attribution de l'auteur et la détection photo/lien d'invitation reposent sur des constantes `WAMessageStubType` de Baileys non vérifiables sans test en conditions réelles — à valider après déploiement. Le lien d'invitation ne peut pas être restauré à l'identique (limitation de l'API WhatsApp) : il est immédiatement invalidé à la place.

## [Unreleased]

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