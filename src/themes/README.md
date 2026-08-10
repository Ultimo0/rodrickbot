# Moteur de thèmes

Chaque fichier de ce dossier (sauf `engine.js`) est un **thème** chargé
automatiquement au démarrage. Ajouter un thème = créer un fichier ici,
aucune autre modification n'est nécessaire.

## Thèmes disponibles

`classique`, `royal`, `neon`, `mono`, `galaxy`.

## Contrat

Un thème exporte par défaut un objet :

```js
export default {
  name: 'matrix',      // identifiant interne — utilisé par !theme matrix
  label: 'Matrix',      // nom affiché à l'utilisateur

  renderMainMenu(data)      { /* ... */ return 'texte final'; },
  renderCategoryMenu(data)  { /* ... */ return 'texte final'; },
  renderCommandDetail(data) { /* ... */ return 'texte final'; },
  renderStartup(data)       { /* ... */ return 'texte final'; },
  renderWelcome(data)       { /* ... */ return 'texte final'; },
  renderBye(data)           { /* ... */ return 'texte final'; },
  renderDeletedMessages(data) { /* ... */ return 'texte final'; },
};
```

Chaque `render*` reçoit uniquement des **données brutes** (jamais de
markdown/bordures déjà appliqués par l'appelant : `commands/help.js`,
`utils/startupMessage.js`, `handlers/groupParticipantsHandler.js`) et
retourne une chaîne de caractères, entièrement mise en forme à la façon du
thème : structure, bordures, police, séparateurs, icônes, pied de page...
Le **contenu** (noms de commandes, statistiques, catégories, etc.) est
toujours identique quel que soit le thème actif ; seule la présentation
change.

### Forme des données reçues

- `renderMainMenu({ botName, senderName, dateStr, timeStr, uptime, ping, ramMb, mode, commandCount, themeLabel, categories: [{ key, icon, label, count }], prefix, footer: { version, prefix, developerName } })`
- `renderCategoryMenu({ category: { icon, label }, commands: [{ name, description, tagsSuffix }], prefix, footer })`
- `renderCommandDetail({ prefix, cmd: { name, description, tagsSuffix, category, aliases }, footer })`
- `renderStartup({ botName, signature, configured, instanceId?, instanceOwner?, prefix, commandCount, mode })`
- `renderWelcome({ number, groupName })` / `renderBye({ number, groupName })`
  — `number` est déjà le numéro brut (sans `@`), à mentionner via `@${number}`.
- `renderDeletedMessages({ entries: [{ index, icon, typeLabel, authorLabel, whenLabel, textContent }], footer })`
  — `entries` peut être vide (aucune suppression récente) ; `textContent` vaut
  `null` pour les entrées média (le média lui-même est renvoyé séparément par
  `commands/remove.js`, jamais par le thème). `authorLabel` est déjà au
  format `@numero`.

### Conventions à respecter

- Le marqueur `> ` en tête de la signature dans `renderStartup` est une
  identité visuelle volontairement **fixe** (non thémée) — voir les
  commentaires dans chaque thème existant.
- Les messages `welcome`/`bye` **personnalisés** par un admin de groupe
  (`!welcome on <message>` avec `{user}`/`{group}`) ne passent jamais par
  le thème : `renderWelcome`/`renderBye` ne servent que pour le message
  par défaut.

### Outils disponibles (facultatifs)

- `src/utils/boxDrawing.js` — primitives génériques (`boxTop`, `boxBottom`,
  `hLine`, `padCenter`), sans connaissance des thèmes.
- `src/utils/fancyFont.js` — conversions vers des polices Unicode
  (`toBoldFont`, `toSansBoldFont`, `toScriptFont`, `toMonospaceFont`).

Un thème est libre de ne pas les utiliser du tout (voir `mono.js`, qui
n'utilise ni boîte ni police spéciale).
