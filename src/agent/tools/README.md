# Outils Agent IA

## Standard de contrat

Chaque outil exporte un objet standard :

- `name` : identifiant unique de l'outil ;
- `params` : paramètres attendus par l'outil ;
## Règles de conception

- on ne duplique pas la logique métier ;
- on réutilise les fonctions et utilitaires déjà présents dans le projet ;
- on ajoute seulement des adaptateurs légers autour de services existants ou d'API externes sûres.

## Fonctionnalité commune : Résolution automatique de la source de texte

Tous les outils de traitement de texte (rewrite, translate, summarize, correct) utilisent désormais une logique commune de résolution de la source de texte, dans cet ordre de priorité :

1. **Message cité (reply)** : Si l'utilisateur répond à un message, le texte de ce message cité est utilisé en priorité.
2. **Texte du message actuel** : Si aucun message n'est cité, le texte du message actuel est utilisé.
3. **Mémoire de session** : Si aucun texte n'est trouvé dans le message, l'outil recherche dans la mémoire de session le dernier texte enregistré par l'utilisateur.

Cette fonctionnalité est implémentée dans `src/agent/utils/textSourceResolver.js` et est réutilisée par tous les outils concernés.

## Outils présents

- `play` : Lecture de médias
- `sticker` : Création de stickers
- `ocr` : Reconnaissance optique de caractères
- `translate` : Traduction de texte (avec résolution automatique de la source)
- `download` : Téléchargement de médias
- `weather` : Météo
- `search` : Recherche web
- `tts` : Synthèse vocale
- `rewrite` : Réécriture de texte (avec résolution automatique de la source et prompts spécifiques par style)
- `correct` : Correction de texte (avec résolution automatique de la source)

## Utilisation des outils avec résolution automatique

Les outils `rewrite`, `translate`, `summarize` et `correct` peuvent être utilisés de plusieurs manières :

1. **En répondant à un message** :

## Styles de réécriture disponibles

L'outil `rewrite` prend en charge les styles suivants :

- **professionnel** : Réécriture formelle et professionnelle
- **court** : Version plus concise
- **long** : Version développée et enrichie
- **poli** : Version plus respectueuse avec formules de politesse
- **convaincant** : Version persuasive et engageante
- **corriger** : Correction orthographique et grammaticale

Chaque style utilise un prompt spécifique optimisé pour le résultat souhaité.