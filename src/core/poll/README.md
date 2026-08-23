# Module Poll — RodrickBOT

Sondages en chat : création par assistant pas-à-pas ou syntaxe rapide, vote par chiffre en réponse (reply) à la carte du sondage, expiration automatique optionnelle, résultats avec barres de progression.

## Commandes

| Commande | Effet |
|---|---|
| `/poll` | Démarre l'assistant pas-à-pas (titre, puis options une par une, `fin` pour terminer) |
| `/poll "Titre" A \| B \| C [\| durée]` | Création immédiate (syntaxe rapide), durée optionnelle en dernier segment |
| `/poll <1h\|2j\|30min>` | Fixe la durée du sondage le plus récent du chat (sucre syntaxique pour `/poll duration`) |
| `/poll results [id]` | Résultats avec pourcentages et barres de progression |
| `/poll info [id]` | Créateur, date de création, statut, nombre de votants, dernière activité |
| `/poll list` | Sondages actifs du chat courant |
| `/poll close [id]` | Ferme le sondage (créateur ou admin) |
| `/poll delete [id]` | Supprime définitivement — demande confirmation (`1`/`2`, valable 5 min) |
| `/poll duration <1h\|2j\|30min> [id]` | Fixe ou change la durée d'un sondage existant |
| `/poll cancel` | Annule un brouillon de création en cours |
| `/poll help` | Aide complète |

Sans `[id]`, une commande de gestion cible le **sondage le plus récent du chat**. L'`id` est un code court à 6 caractères (ex: `a3f9c1`), affiché sur chaque carte de sondage et dans `/poll list`.

**Fermer ou supprimer un sondage** est réservé à son créateur ou à un administrateur du bot (`ADMIN_JIDS`) — vérifié côté serveur, jamais fait confiance au client.

## Vote

**Pourquoi pas de vrais boutons WhatsApp ?** Même limitation que `/quiz` (voir `src/core/quiz/README.md` et CHANGELOG 1.19.1) : WhatsApp affiche les messages liste/boutons en texte brut sans aucune ligne cliquable sur les comptes personnels (non-Business) — restriction plateforme, pas un choix arbitraire de ce module.

Le vote se fait donc en **répondant (reply) à la carte du sondage** avec un chiffre nu (`1`, `2`, `3`...). C'est le fait de répondre à un message précis (identifié par son `stanzaId`), et non un chiffre envoyé dans le vide comme pour `/quiz`, qui permet plusieurs sondages actifs simultanément dans le même chat sans ambiguïté sur celui visé.

Un utilisateur peut voter une seule fois par sondage ; répondre à nouveau **remplace** son vote précédent (jamais un doublon). Toutes les vérifications (statut actif, plage de chiffre valide, dédoublonnage réseau) sont faites côté serveur, jamais côté client.

## Architecture

```
commands/poll.js                    (point d'entrée utilisateur, sous-commandes)
        │
        ▼
core/poll/PollManager.js            (orchestrateur — jamais d'accès disque direct)
        │
   ┌────┼─────────────┬─────────────┬───────────────┐
   ▼    ▼             ▼             ▼               ▼
Storage  SessionManager  Renderer   Timer      pollDuration
(persistance (brouillon +  (rendu   (expiration  (parsing "1h"/
polls.json)  confirmation,  texte,    par sondage,  "2j"/"30min",
             en mémoire)    aucun     en mémoire)   délègue s/min/h
                            accès                   à utils/duration.js)
                            disque)
        │
        ▼
core/poll/PollCleanupService.js     (filet de sécurité : balayage périodique
                                      des sondages expirés + reprise au
                                      redémarrage, initialisé dans src/index.js)
```

Réutilisation explicite de code existant (pas de duplication) :
- **`core/quiz/QuizInteractionGuard.js`** — dédoublonnage réseau (`isDuplicateDelivery`/`markDelivered`) et parsing de chiffre nu (`parseAnswerDigit`/`parseControlDigit`), génériques et déjà éprouvés par `/quiz`.
- **`utils/duration.js`** — `pollDuration.js` délègue s/min/h à `parseDuration()` existant et n'ajoute que les jours par-dessus, dans un fichier séparé (modifier `utils/duration.js` pour accepter les jours aurait cassé son test existant, qui rejette explicitement `"10 jours"`).
- **`utils/quotedContent.js`** — `getQuotedInfo()` existant fournit le `stanzaId` utilisé pour router un vote vers le bon sondage.

## Persistance et redémarrage

Un sondage créé est **persisté immédiatement** dans `polls.json` (racine du projet, même convention que `warnings.json`/`group_settings.json`) — jamais seulement en mémoire. Au redémarrage, `PollCleanupService.initPollCleanupService()` :

1. **Reprend** tous les sondages actifs (`PollManager.resumeActivePolls`) et réarme un timer d'expiration pour ceux qui en ont un.
2. **Balaye** immédiatement les sondages dont l'expiration est déjà passée pendant que le bot était arrêté, et les ferme (`closedReason: 'expired'`).
3. Répète ce balayage toutes les **60 secondes** en continu — filet de sécurité si un timer en mémoire (`PollTimer.js`) a été perdu (redémarrage, crash).

Le brouillon de création en cours et une éventuelle confirmation de suppression en attente (`PollSessionManager.js`) ne sont **volontairement pas persistés** : les perdre à un redémarrage est sans conséquence (rien n'a encore été créé ni supprimé).

## Robustesse

- **Double vote** : `setVote()` écrase l'entrée existante pour le même utilisateur (`votes[userId] = optionId`) — jamais deux entrées.
- **Doublon réseau** : un même `messageId` WhatsApp redélivré (reconnexion Baileys) est ignoré via `QuizInteractionGuard.isDuplicateDelivery`.
- **Double-envoi concurrent** : un verrou en mémoire par sondage (`pollsBeingVoted`, dans `PollManager.js`) empêche deux votes quasi simultanés sur le même sondage de se chevaucher pendant l'écriture disque.
- **Conflits entre sondages** : chaque sondage a un `id` unique et un compteur de séquence (`seq`) strictement monotone — `getMostRecentPollForChat` s'appuie sur `seq`, pas sur l'horodatage (`createdAt`), pour rester correct même si deux sondages sont créés dans la même milliseconde.
- **Corruption des données** : `polls.json` est réécrit intégralement (jamais de correctif partiel) à chaque mutation ; une lecture qui échoue au démarrage repart d'un état vide plutôt que de planter (voir `PollStorage.load`).

## Limites connues

- Vote uniquement par réponse (reply) à la carte du sondage, jamais par bouton natif — voir section [Vote](#vote).
- Pas de vote anonyme : `poll.votes` associe chaque JID à son choix (nécessaire pour permettre le changement de vote et interdire le double vote).
- `polls.json` n'est jamais purgé automatiquement des sondages fermés/supprimés autrement que par `/poll delete` — un usage intensif sur le très long terme peut faire grossir ce fichier (pas de commande d'archivage à ce jour).
