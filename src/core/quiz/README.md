# Module Quiz — RodrickBOT

Quiz interactif par chat : questions à choix multiples, XP, pièces, niveaux, classement et succès. Réponse par un simple chiffre en texte (voir [Pourquoi pas des vrais boutons ?](#pourquoi-pas-de-vrais-boutons-whatsapp)).

## Commandes

| Commande | Effet |
|---|---|
| `/quiz` | Démarre un quiz (catégories mélangées, toutes difficultés) |
| `/quiz random` | Identique à `/quiz` (alias explicite) |
| `/quiz <categorie>` | Démarre un quiz filtré sur une catégorie (ex: `/quiz sciences`) |
| `/quiz <categorie> <difficulte>` | Filtre en plus par difficulté : `facile`, `moyen`, `difficile` |
| `/quiz categories` | Liste les catégories disponibles |
| `/quiz stats` | Affiche XP, niveau, pièces, taux de réussite, succès débloqués |
| `/quiz classement` | Top 10 global + rang de l'utilisateur |
| `/quiz abandonner` | Quitte le quiz en cours (progression sauvegardée) |
| `/quiz reset` | Réinitialise toutes les données quiz de l'utilisateur — demande confirmation (`1` = confirmer, `2` = annuler), refusé si un quiz est en cours |
| `/quiz sessions` *(admin)* | Liste toutes les sessions quiz actives, tous utilisateurs confondus |
| `/quiz sessions clear` *(admin)* | Interrompt de force **toutes** les sessions actives (utile pour débloquer un état incohérent) |
| `/quiz sessions clear @mention` / `<numero>` *(admin)* | Interrompt de force la session d'un utilisateur précis (mention, réponse à son message, ou numéro en argument) |
| `/quiz sessions purge` *(admin)* | Vide `quiz_sessions.json` dans son intégralité (actives comprises), sans toucher aux stats/XP des utilisateurs |
| `/quiz resetall` *(admin)* | Réinitialise les données quiz de **TOUS** les utilisateurs — demande confirmation (`1`/`2`), interrompt d'abord toute partie en cours |
| `/quiz refresh` *(admin)* | Force une récupération immédiate de nouvelles questions depuis Internet (ignore le cache de 24h) |
| `/quiz purge` *(admin)* | Réinitialisation complète du module : sessions + stats + cache de questions, en une seule commande. Irréversible, sans confirmation |

Pendant un quiz, l'utilisateur répond en envoyant simplement le numéro de l'option choisie (`1`, `2`, `3`...). Tout autre message pendant une question active est ignoré par le quiz et continue son chemin normal dans le bot (donc `/quiz abandonner` en pleine partie fonctionne bien).

`/quiz sessions` est réservé aux administrateurs (`ADMIN_JIDS`, voir `.env`) — contrairement à `/quiz reset` qui n'agit que sur les propres données de l'appelant, `sessions clear` interrompt de force la partie d'un tiers sans toucher à ses statistiques/XP (utile en cas de session bloquée), et notifie l'utilisateur concerné.

`/quiz resetall` (admin) est le seul flux destructeur *avec confirmation* pour tout le monde à la fois : il utilise sa propre fenêtre de confirmation, entièrement indépendante de celle de `/quiz reset`, pour qu'un admin qui aurait aussi une confirmation personnelle en attente ne puisse jamais confirmer l'une par erreur en répondant à l'autre.

`/quiz purge` (admin) va plus loin que `/quiz resetall` : là où `resetall` ne touche qu'aux stats des utilisateurs (`quiz_stats.json`), `purge` vide en plus `quiz_sessions.json` dans son intégralité (pas seulement les sessions actives) et supprime le cache de questions Internet (`quiz_questions_cache.json`), qui sera régénéré au prochain `/quiz refresh` ou redémarrage. Contrairement à `/quiz reset`/`/quiz resetall`, il n'y a **pas de fenêtre de confirmation** — à réserver à un usage développement/diagnostic. `/quiz sessions purge` fait la même chose que la partie "sessions" de `/quiz purge`, mais sans toucher aux stats ni au cache de questions.

## Source des questions

Les questions viennent d'**Internet**, pas d'une banque figée dans le code : [Open Trivia Database](https://opentdb.com) (gratuit, sans clé), traduites en français via [MyMemory](https://mymemory.translated.net) (gratuit, sans clé non plus — aucune dépendance à Groq pour ce module, volontairement, pour ne pas consommer son quota). Contrairement à une traduction par IA, MyMemory ne génère pas d'explication pédagogique : seule la banque de secours locale en fournit. Fiabilité en 3 niveaux :

1. **Cache disque** (`quiz_questions_cache.json`, à la racine) — valide 24h, chargé instantanément au démarrage s'il est encore frais.
2. **Récupération Internet** — si le cache est périmé ou absent, en tâche de fond (ne bloque jamais le démarrage du bot). Remplace le pool dès que ça aboutit.
3. **Banque de secours locale** (`src/data/quizQuestions.json`) — utilisée uniquement si les deux premiers niveaux échouent (pas de réseau, clé `GROQ_API_KEY` absente ou quota dépassé). Garantit que `/quiz` répond toujours, même hors ligne.

Catégories mappées vers Open Trivia DB : `geographie` (22), `histoire` (23), `sciences` (17), `informatique` (18) — mêmes noms que les commandes `/quiz <categorie>` existantes.

`/quiz refresh` (admin) force une récupération immédiate, en ignorant la fraîcheur du cache. `/quiz purge` (admin) fait l'inverse : il supprime le cache disque (`QuizLoader.purgeCache`) sans le remplacer immédiatement — la banque de secours locale prend le relais jusqu'au prochain `/quiz refresh` ou redémarrage.

⚠️ Limite connue : si une session est en cours au moment où le pool bascule de secours→internet, ses questions restantes peuvent disparaître de l'index — `QuizEngine.sendQuestionCard` détecte le cas et termine proprement la session plutôt que de planter, mais la partie s'arrête un peu tôt pour l'utilisateur concerné. Cas rare (seulement au tout premier démarrage sans cache), pas testé en conditions réelles — à surveiller.

## Architecture

```
commands/quiz.js                    (point d'entrée utilisateur)
        │
        ▼
core/quiz/QuizEngine.js             (orchestrateur — jamais d'accès disque direct)
        │
   ┌────┼─────────────┬─────────────┬──────────────┬───────────────┐
   ▼    ▼             ▼             ▼              ▼               ▼
Session  Loader   InteractionGuard  Rewards     Statistics     Achievements
Manager  (questions)  (validation/  (XP, pièces,  (persistance   (succès
(état de  quizQuestions  anti-doublon) bonus série)  quiz_stats.json) débloqués)
 session)   .json)
   │                                                    │
   ▼                                                    ▼
QuizTimer                                           QuizRanking
(inactivité 10 min)                                 (classement)
   │
   ▼
QuizCleanupService                                  QuizRenderer
(balayage 60s + reprise                             (seul module qui sait à quoi
 au démarrage)                                       ressemble un message quiz)
                                                          │
QuizResetService                                         ▼
(confirmation avant                                 sock.sendMessage(...)
 suppression, 1/2)
```

Chaque module a une seule responsabilité et ne connaît pas les détails internes des autres — `QuizEngine` est le seul point de passage obligé, les commandes et `messageHandler.js` ne parlent jamais directement à `QuizSessionManager` ou `QuizStatistics`.

### Fichiers

| Fichier | Rôle |
|---|---|
| `QuizEngine.js` | Orchestration : démarrage, traitement d'une réponse, fin de quiz, expiration, reprise après redémarrage |
| `QuizSessionManager.js` | État "en cours" d'un quiz — persisté dans `quiz_sessions.json`, une seule session active par utilisateur |
| `QuizLoader.js` | Fournit les questions — **source principale : Internet** (Open Trivia DB, traduites via MyMemory, cache 24h), avec repli automatique sur `src/data/quizQuestions.json` (banque de secours embarquée) si le réseau/MyMemory est indisponible |
| `QuizInteractionGuard.js` | Parsing/validation des réponses (chiffre nu, anti-doublon réseau + anti-double-envoi utilisateur) |
| `QuizRewards.js` | Calcul XP/pièces par réponse, bonus de série, bonus "sans-faute" |
| `QuizStatistics.js` | Stats cumulées par utilisateur — persisté dans `quiz_stats.json` (XP, niveau, pièces, historique) |
| `QuizRanking.js` | Classement global à partir de `QuizStatistics` |
| `QuizAchievements.js` | Évalue et débloque les succès après chaque quiz terminé |
| `QuizTimer.js` | Timer d'inactivité en mémoire par session (10 min) |
| `QuizCleanupService.js` | Filet de sécurité : balayage périodique des sessions expirées + reprise des timers au démarrage du process |
| `QuizResetService.js` | Flux de confirmation avant suppression définitive des données d'un utilisateur |
| `QuizRenderer.js` | Construit tous les messages WhatsApp envoyés par le module |

## Sécurité

- **Anti-doublon réseau** : chaque `messageId` traité une seule fois (`QuizInteractionGuard.isDuplicateDelivery`), pour les redélivrances Baileys après reconnexion.
- **Anti-double-envoi utilisateur** : un verrou en mémoire par session (`sessionsBeingAnswered`) empêche deux messages "2" envoyés coup sur coup d'être comptés deux fois, même s'ils n'ont pas le même `messageId`.
- **Une seule session active par utilisateur**, appliqué dans `QuizSessionManager` (donc vrai même pour un futur mode PvP qui ajouterait d'autres points d'entrée).
- **Expiration automatique après 10 minutes d'inactivité**, avec notification et sauvegarde de la progression partielle.
- **Sauvegarde après chaque réponse** (`quiz_sessions.json` réécrit à chaque mutation).
- **Reprise après redémarrage** : `QuizCleanupService.initQuizCleanupService()` réarme les timers des sessions encore valides au démarrage du process, et nettoie immédiatement celles déjà expirées pendant l'arrêt.
- **Reset avec confirmation obligatoire**, jeton à usage unique (retiré dès la première réponse, valide ou non), et suppression atomique (stats + session active éventuelle, jamais de donnée orpheline).

## Répétition des questions

Chaque `/quiz` tire `QUESTIONS_PER_QUIZ` questions au hasard dans le pool (`QuizLoader.pickRandomQuestions`). `QuizEngine` mémorise en plus, par utilisateur et en mémoire (non persisté, remis à zéro au redémarrage), les 30 dernières questions vues (`recentlySeenByUser`) et les exclut en priorité du tirage suivant — avec repli gracieux : si le pool filtré (catégorie/difficulté) est trop petit pour éviter toute répétition, il complète avec des questions déjà vues plutôt que de raccourcir la partie. Un filtre par catégorie avec un petit pool (`/quiz <categorie>` sur une catégorie peu peuplée) reste donc plus sujet aux répétitions qu'un `/quiz`/`/quiz random` sans filtre.

## Pourquoi pas de vrais boutons WhatsApp ?

La première version utilisait le message liste natif WhatsApp (`sections`/`rows`, un vrai clic). Testé en conditions réelles : WhatsApp affiche ce message en texte brut, sans aucune ligne cliquable, pour les comptes personnels (non-Business) — restriction plateforme côté Meta, pas un bug Baileys. Le module répond donc uniquement par chiffre en texte, avec la même contrainte "pas de texte libre" assurée côté serveur (`QuizInteractionGuard`) plutôt que par l'UI. Voir `CHANGELOG.md` (`1.19.1`) pour le détail du changement.

## Évolutivité

Conçu pour ne pas nécessiter de réécriture du moteur en cas d'ajout futur :

- **Questions image/audio/vidéo** : ajouter les champs correspondants dans `quizQuestions.json` + un rendu dédié dans `QuizRenderer` (le moteur ne lit jamais le contenu d'une question, seulement sa structure `options`/`correctIndex`).
- **Chronomètre** : `QuizTimer` gère déjà un timer par session — un chrono par question réutiliserait le même mécanisme à une granularité différente.
- **Quiz quotidiens, défis, PvP, coopératif, tournois, saisons** : `QuizSessionManager` n'impose qu'une session active par `userId` — un mode multi-joueurs nécessiterait un nouveau type de session (ex: `groupSessionId` partagé) sans toucher `QuizRewards`/`QuizStatistics`/`QuizRanking`.
- **Récompenses rares/événements spéciaux** : `QuizRewards.computeReward` et `QuizAchievements.evaluateAchievements` sont les deux seuls points d'entrée à étendre.

## Tests manuels

Voir le déroulé complet donné en conversation (installation, premier quiz, sous-commandes, cas limites, test d'expiration accéléré). En résumé : `npm install`, `.env` en place, `npm start`, `/quiz` depuis WhatsApp, puis vérifier `/quiz stats`, `/quiz classement`, `/quiz abandonner`, `/quiz reset` (`1` et `2` séparément), double session refusée, redémarrage en pleine partie.

Pas de tests automatisés à ce jour (pas de dossier `tests/` dans le projet) — à ajouter si besoin, notamment sur `QuizRewards`, `QuizAchievements` et `QuizInteractionGuard` qui sont des fonctions pures.
