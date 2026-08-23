# Module Remind — RodrickBOT

Rappels personnels programmés depuis WhatsApp : durée relative, date/heure absolue, assistant guidé, récurrence quotidienne/hebdomadaire, tout en message privé.

## Commandes

| Commande | Effet |
|---|---|
| `/remind <durée> <message>` | Ex: `/remind 10min appeler maman`, `/remind 2h vérifier mon projet`, `/remind 1d envoyer le document`, `/remind 30s boire de l'eau` |
| `/remind <date> <message>` | Ex: `/remind demain 08:00 cours`, `/remind 20/08/2026 18:30 réunion` |
| `/remind every day HH:MM <message>` | Rappel quotidien récurrent |
| `/remind every week <jour> HH:MM <message>` | Rappel hebdomadaire récurrent (jour en français : lundi, mardi...) |
| `/remind` (seul) | Assistant pas-à-pas (menu 1-4, puis le message) |
| `/reminders` | Liste tes rappels actifs |
| `/remind cancel <id>` | Annule un rappel précis |
| `/remind cancel all` | Annule tous tes rappels actifs — confirmation `1`/`2` demandée |
| `/remind cancel` (sans id) | Annule un brouillon d'assistant en cours |
| `/remind info <id>` | Détail d'un rappel (créateur, dates, statut) |
| `/remind help` | Aide complète |

Un rappel est **toujours strictement personnel** : seul son créateur peut le voir/l'annuler (pas d'équivalent admin, contrairement à `/poll` où un sondage est une ressource de groupe partagée) ; il est notifié en **message privé**, que la commande ait été tapée en groupe ou en privé.

## Architecture

```
commands/remind.js, commands/reminders.js   (points d'entrée utilisateur)
        │
        ▼
core/remind/RemindManager.js                (orchestrateur — seul point d'accès à RemindStorage)
        │
   ┌────┼──────────────┬───────────────┬──────────────────┐
   ▼    ▼               ▼               ▼                  ▼
Storage  SessionManager   Renderer    remindDuration      remindDate
(reminders.json) (brouillon    (rendu texte,   (réutilise      (parsing "demain
                  assistant +   aucun accès      core/poll/       HH:MM", "JJ/MM/
                  confirmation  disque)          pollDuration.js  AAAA HH:MM",
                  cancel-all,                    — voir note      conversion fuseau
                  en mémoire)                    dans le fichier) horaire via Intl
                                                                    natif, aucune
                                                                    dépendance ajoutée)
        │
        ▼
core/remind/RemindScheduler.js   (balayage périodique — PAS de setTimeout par
                                   rappel, voir "Pourquoi pas de timers" plus bas)
```

Réutilisation explicite de code existant :
- **`core/quiz/QuizInteractionGuard.js`** (`parseControlDigit`) — parsing du chiffre 1/2 pour la confirmation `/remind cancel all`, même fonction déjà utilisée par `/poll delete`.
- **`core/poll/pollDuration.js`** — parsing de `10min`/`2h`/`1j` (générique, sans dépendance au domaine sondage), réexporté par `remindDuration.js` plutôt que dupliqué une 3e fois.
- **`config/index.js`** (`config.prefix`) — les messages envoyés directement (pas via une `description` de commande) doivent substituer le préfixe eux-mêmes ; `{prefix}` littéral ne fonctionne QUE dans les descriptions de `!menu` (substitué par `help.js`), pas ailleurs — piège réel rencontré et corrigé pendant le développement.

## Pourquoi pas de timer par rappel

`setTimeout(fn, délai)` déborde silencieusement en Node/V8 au-delà de **~24,8 jours** (dépassement d'entier 32 bits interne) et se déclenche **immédiatement** au lieu d'attendre — un rappel à 30 jours avec un timer direct partirait donc tout de suite, en silence, sans aucune erreur visible. `RemindScheduler.js` n'utilise donc **aucun timer par rappel** : un unique balayage périodique (toutes les 15s) compare `scheduledAt <= now`, structurellement insensible à ce problème quelle que soit la durée d'attente.

Bénéfice secondaire : la reprise après redémarrage est gratuite — contrairement à `PollCleanupService.resumeActivePolls()` qui doit réarmer un timer par sondage actif au démarrage, il n'y a ici rien à réarmer : le premier balayage retrouve tout seul les rappels en attente dans `reminders.json`.

## Fuseau horaire

Aucun système de préférences par utilisateur n'existe dans RodrickBOT à ce jour (vérifié). `remindDate.js` expose `getUserTimezone(userId)`, qui retourne toujours `DEFAULT_TIMEZONE` (`Africa/Douala`, UTC+1 fixe) pour l'instant — mais centralise le point d'appel : le jour où un vrai système de préférences existe, seul ce fichier a besoin d'être modifié. La conversion heure murale → UTC utilise `Intl.DateTimeFormat` natif (aucune dépendance ajoutée), correcte y compris à travers les changements d'heure d'été (vérifié avec `Europe/Paris`).

## Robustesse

- **Rappel mal formé** : `parseReminderCommand` ne lève jamais d'exception, retourne toujours `{ ok: false, reason }` avec un message clair (date invalide, durée hors bornes, message vide/trop long...).
- **Téléphone hors ligne** : un échec d'envoi laisse le rappel `pending` (retenté au balayage suivant) au lieu de le perdre — borné par `EXPIRY_GRACE_MS` (24h) pour ne pas retenter indéfiniment un destinataire injoignable.
- **Rappel très en retard** (bot resté arrêté longtemps) : passe `expired` au lieu d'envoyer un rappel qui n'aurait plus de sens des heures/jours après l'échéance prévue.
- **Doublons d'événements / chevauchement** : garde `sweeping` dans `RemindScheduler.js` — un balayage ne démarre jamais tant que le précédent n'est pas terminé.
- **Deux utilisateurs créant un rappel « simultanément »** : `RemindStorage` est synchrone (pas d'`await` entre lecture et écriture), donc sérialisé sans condition de course par la boucle d'événements Node — même garantie que `PollStorage.js`.
- **Conflits entre rappels** : compteur `seq` strictement monotone dès la conception (voir le bug équivalent trouvé — et corrigé — a posteriori sur `PollStorage.js`).
- **Limites anti-abus** : `MAX_ACTIVE_REMINDERS_PER_USER` (25) et `MAX_MESSAGE_LENGTH` (300), constantes nommées dans `RemindManager.js` — même convention que `WARN_LIMIT`/`MIN_POLL_DURATION_MS`.

## Limites connues

- Un seul fuseau par défaut pour tous les utilisateurs (voir section Fuseau horaire) — pas encore de préférence par utilisateur.
- La récurrence hebdomadaire ne supporte qu'un seul jour par rappel (pas de "lundi et jeudi" en une seule commande).
- `reminders.json` n'est jamais purgé des rappels `sent`/`cancelled`/`expired` anciens — pas de commande d'archivage à ce jour (même limite déjà documentée pour `polls.json`).
