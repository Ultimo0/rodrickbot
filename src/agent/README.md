# Agent IA — documentation

Le sous-système Agent IA est un module séparé qui s’appuie sur les commandes et utilitaires existants, sans les remplacer.

## Objectif

Ajouter un mode conversationnel compatible avec l’architecture actuelle du bot WhatsApp :

- détection d’intention via Groq ;
- mémoire de session par `chatId + sender` ;
- contexte conversationnel limité à une fenêtre récente ;
- exécution d’outils existants via un registre d’outils ;
- expiration automatique de la mémoire ;
- gestion des erreurs avec réponses WhatsApp sûres.

## Modules

### `sessionMemory.js`

- stocke la mémoire par utilisateur WhatsApp ;
- applique un TTL automatique ;
- permet d’activer/désactiver le mode agent pour un utilisateur.

### `contextBuilder.js`

- reconstruit la fenêtre de conversation récente ;
- prépare le prompt envoyé à l’IA.

### `toolRegistry.js`

- expose un registre d’outils utilisés par l’agent ;
- réutilise les services existants (`askGroq`, `correctText`, `translateText`, `summarizeText`, `ocrImage`).
- outils exposés par défaut : `play`, `sticker`, `ocr`, `translate`, `download`, `weather`, `search`, `tts`, `ask_general`, `summarize_text`, `correct_text`, `translate_text`, `ocr_image`.

### `agentService.js`

- détecte l’intention via Groq ;
- applique un fallback local par mots-clés ;
- décide quel outil appeler ;
- exécute le tour de conversation de l’agent.

### `index.js`

- point d’entrée du sous-système Agent pour le reste du projet.

## Formules de détection locale (fallback robuste)

Le moteur local de l’agent s’appuie sur des regex et sur la présence d’un contexte média.

### 1) Détection d’un vrai “sticker”

Formule utilisée dans le code :

- présence d’un message média directement cité ou envoyé (`imageMessage` / `videoMessage`) ;
- texte contenant un mot du type `sticker` ou `stiker` ;
- texte contenant un verbe d’action comme `transforme`, `converti`, `crée`, `fais`, `met`, `donne`.

Exemples :

- `fais un sticker` avec une image citée ;
- `converti ça en sticker` ;
- `crée un sticker depuis cette photo`.

Tool ciblé : `sticker`.

### 2) Détection d’un “download”

Formule utilisée dans le code :

- texte contenant `telecharge`, `télécharge` ou `download` ;
- texte contenant une cible explicite : `video`, `mp4`, `vidéo`, `audio`, `mp3`, `musique`.

Exemples :

- `télécharge cette vidéo` ;
- `download audio mp3` ;
- `telecharge la musique de cette url`.

Tool ciblé : `download`.

### 3) Détection du format de téléchargement

La logique locale utilise ensuite le texte pour choisir le bon format :

- si le texte contient `video`, `mp4`, `vidéo` → `video` ;
- si le texte contient `audio`, `mp3`, `musique`, `song` → `audio` ;
- sinon → `audio` par défaut.

### 4) Détection des commandes historiques via bridge

L’agent peut également réutiliser des commandes existantes déjà validées par le bot.

Commandes reconnues par la bridge :

- `help`
- `ping`
- `status`
- `statut`
- `whoami`
- `menu`
- `agent`
- `setup`

Pour ces cas, l’intention `tool` est remplacée par l’appel historique de commande existante, sans dupliquer la logique métier.

## Recommandations de prompt IA

Quand l’IA Groq est utilisée, le système attend un JSON strict du type :

```json
{"intent":"chat|summary|translation|correction|ocr|general","tool":"play|sticker|ocr|translate|download|weather|search|tts|ask_general|summarize_text|correct_text|translate_text|ocr_image|null","language":"...","size":"court|moyen|détaillé"}
```

### Règle simple pour le prompt utilisateur

- si la demande est une conversion de média → privilégier `sticker` ou `ocr` ;
- si la demande est une recherche / lecture / visite d’URL → `search`, `play`, `download` ;
- si la demande est un texte à corriger / traduire / résumer → `correct_text`, `translate_text`, `summarize_text` ;
- si la demande est une question libre → `ask_general`.

## Sécurité

- l’agent ne remplace pas les commandes ;
- les règles `adminOnly`, `privateOnly` et le lockdown restent applicables à l’architecture historique ;
- on n’ajoute pas de nouvelle commande “publique” qui contournerait les filtres existants ;
- la liste des commandes pontables (`BRIDGE_ALLOWED_COMMANDS`) est appliquée par `commandBridge.js` lui-même, pas seulement par l’appelant — même un futur appel non filtré ne peut pas invoquer une commande hors liste ;
- les outils marqués `internal: true` (ex: `debug_message`) sont bloqués par `toolRegistry.js` quel que soit le nom de tool renvoyé par la détection d’intention ;
- une limite de débit par chat/utilisateur (8 appels/minute) protège contre un usage abusif de l’API Groq en mode agent.

## Activation

La commande `!agent on` active le mode agent pour l’utilisateur courant sur ce chat (`!agent` est un alias de la commande `ultimo` — voir `commands/ultimo.js`).

La commande `!agent off` le désactive.

La commande `!agent status` affiche l’état actuel.

La commande `!agent clear` réinitialise sa mémoire pour ce chat/utilisateur.
