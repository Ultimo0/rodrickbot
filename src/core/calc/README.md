# Module Calcul mental — RodrickBOT

Jeu rapide : une suite de 10 opérations arithmétiques, un délai court par question (7 à 15 secondes selon la difficulté), réponse par un simple nombre en texte. Deuxième jeu du bot après le Quiz, avec la même philosophie (session persistée, anti-triche, texte plutôt que boutons WhatsApp — voir `src/core/quiz/README.md` pour le pourquoi).

## Commandes

| Commande | Effet |
|---|---|
| `/calcul` | Démarre une partie en difficulté *moyen* |
| `/calcul facile` / `moyen` / `difficile` | Démarre une partie dans la difficulté choisie |
| `/calcul stats` | Points, niveau, taux de réussite, meilleure série |
| `/calcul classement` | Top 10 global + rang de l'utilisateur |
| `/calcul abandonner` | Quitte la partie en cours (progression sauvegardée) |

Pendant une partie, l'opération s'affiche (`12 + 7 = ?`) avec un compte à rebours annoncé (pas de minuteur visuel live, juste "⏱️ Xs pour répondre"). Réponse acceptée : un nombre entier nu, positif ou négatif (`-3` est valide). Passé le délai, la question est comptée comme ratée et la suivante arrive automatiquement — le jeu ne s'arrête jamais faute de réponse, contrairement au Quiz (qui expire après 10 minutes d'inactivité) : ici c'est le rythme normal du jeu.

**`/quiz` et `/calcul` s'excluent mutuellement** : impossible d'avoir les deux en cours pour un même utilisateur (chacun vérifie l'état de l'autre au démarrage). Ça évite toute ambiguïté sur ce qu'un nombre tapé est censé résoudre.

## Différences avec le Quiz

- **Pas de banque de questions** : les opérations sont générées à la volée (`CalcGenerator.js`), aucune dépendance réseau/Internet contrairement au Quiz.
- **Timer par question, pas par session** : le Quiz expire après 10 minutes d'inactivité globale ; ici chaque question a son propre délai court, qui fait avancer la partie automatiquement (`CalcTimer.js`).
- **Réponse = un nombre libre**, pas un choix parmi des options numérotées.
- **Monnaie séparée** : les points du calcul mental (`calc_stats.json`) sont indépendants des pièces/XP du Quiz (`quiz_stats.json`) — deux économies distinctes pour l'instant, pas de portefeuille unifié entre les jeux.
- **Pas de reprise après redémarrage** : les délais étant très courts (7-15s), une partie active au moment d'un redémarrage du bot est simplement clôturée au démarrage (`cleanupStaleSessionsOnBoot`) plutôt que d'essayer de la reprendre.

## Récompenses

- Points de base selon la difficulté : facile 5, moyen 10, difficile 15.
- Bonus de vitesse : +50% si la réponse arrive dans la première moitié du délai.
- Bonus de série : à partir de 3 bonnes réponses d'affilée, +1 point par question de série (plafonné à 10).
- Mauvaise réponse ou délai dépassé : 0 point, la série repart à 0.

## Architecture

Même découpage que le Quiz, en plus compact (pas de `Loader`/`Achievements`/`ResetService` — pas de banque externe, pas encore de succès pour ce jeu) :

| Fichier | Rôle |
|---|---|
| `CalcEngine.js` | Orchestration : démarrage, résolution d'une réponse (texte OU timeout — un seul chemin, `resolveAnswer`), fin de partie |
| `CalcSessionManager.js` | État "en cours" — persisté dans `calc_sessions.json` |
| `CalcGenerator.js` | Génère une opération selon la difficulté (division toujours construite pour un résultat entier exact) |
| `CalcInteractionGuard.js` | Parsing/dédoublonnage des réponses (entier signé nu) |
| `CalcRewards.js` | Calcul des points (base + vitesse + série) |
| `CalcStatistics.js` | Stats cumulées — persisté dans `calc_stats.json` |
| `CalcRanking.js` | Classement global |
| `CalcTimer.js` | Timer par question (pas par inactivité) |
| `CalcRenderer.js` | Tous les messages WhatsApp du jeu |

### Sécurité anti-course réponse/timeout

Une vraie réponse et l'expiration du délai peuvent arriver à quelques millisecondes d'écart. `CalcEngine` garantit qu'une seule des deux issues est appliquée :
- La réponse texte, dès qu'elle est reçue, annule le timer de la question (`clearQuestionTimeout`) avant tout traitement.
- Le callback de timeout vérifie que `session.currentIndex` n'a pas déjà avancé (signe qu'une vraie réponse l'a précédé) avant d'agir.
- Un verrou en mémoire par session (`sessionsBeingProcessed`) protège en plus contre deux messages texte quasi simultanés.
