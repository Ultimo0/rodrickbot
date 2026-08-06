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