# PORTING.md — Guide de portage d'open-english (version condensée)

> **Depuis (2026-08-27)** : nouveaux patterns — coffre-fort iframe cross-origin pour secrets, aide-mémoire de chiffrement générique (`owEncryptSecret`/`owDecryptSecret`) — voir PORTING.md (japonais) pour les entrées du 2026-08-27.


> **Note** : ceci est une traduction condensée. Le guide technique
> complet avec détails de code et pièges reste disponible uniquement
> en japonais dans [PORTING.md](PORTING.md) — s'y référer avant
> d'adopter réellement un pattern.

Résumé des patterns d'implémentation réutilisables de ce projet, au
cas où ils seraient portés vers un autre projet :

1. **Pattern d'intégration `aruaru-llm`** : nécessite un support CORS
   (`.with_cors()`) et une pénalité de répétition
   (`generate_with_repetition_penalty`, par défaut 1,3) côté
   `aruaru-llm`, sinon le navigateur bloque `fetch()` ou le décodage
   glouton de GPT-2 tombe dans une boucle de répétition.
2. **Extraction de la langue pour le TTS** (`extractSpeechText`) :
   sépare les lignes bilingues au format "English / 日本語" avant de
   les passer à `SpeechSynthesisUtterance`, pour éviter une
   prononciation saccadée.
3. **Jeu d'icônes de lancement** (`icons/` + `manifest.json` +
   `launchers/`) : encodeur PNG/ICO écrit à la main sans outils
   graphiques externes, plus des scripts pour `.lnk` Windows,
   `.desktop` Linux et `.app` macOS.
4. **Mise à jour automatique** (`auto-update.js` + `version.json`) :
   simple polling du `buildId` toutes les 5s avec `location.reload()`.
5. **Serveur statique basé sur RPoem** (`server/`) : remplace
   `python3 -m http.server` par un crate Rust réutilisant le
   `static_file_handler` de `open-runo-poem-compat`.
6. **Garantie structurelle des réponses hybrides**
   (`ensureHybridReply`) : ajoute automatiquement une courte note en
   japonais si la réponse du modèle ne contient pas de japonais — sans
   exagérer la qualité de traduction.
7. **Gestion des versions + nettoyage côté navigateur des anciennes
   versions** : `version.json` avec un champ `version`, suppression
   des clés `localStorage` propres à l'application lors d'une nouvelle
   version.
8. **Bridge Google Custom Search JSON API + panneau de paramètres dans
   le navigateur** : identifiants uniquement en mémoire de processus,
   jamais sur disque.
9. **Installateur Windows (Inno Setup) — étapes de vérification
   réelle** : `PrivilegesRequired=lowest` contre les blocages UAC,
   `MSYS_NO_PATHCONV=1` pour les installations silencieuses depuis Git
   Bash.
10. **Base de données géo/tourisme avec avis de sécurité pilotés par le
    sujet** : recherche par sous-chaîne plutôt que correspondance
    exacte ; pour les sujets dangereux (ex. alpinisme), toujours
    joindre un avis de sécurité.
11. **Mise à jour automatique via GitHub Releases (Windows/Linux/macOS,
    voir aussi le point 14 pour le rollback)** : doit être implémentée
    côté natif (pas dans le JS du navigateur) ; son propre .exe en cours
    d'exécution ne peut pas être supprimé sous Windows — lancer d'abord
    un script batch détaché, puis terminer son propre processus.
12. **Les classes CSS des modales nécessitent `max-height`/
    `overflow-y`** : chaque classe de conteneur de modale doit définir
    la scrollabilité, sinon le contenu long est inaccessible sur
    mobile.
13. **Inclusion d'un serveur Rust sur Android** : rendre les chemins
    surchargeables au runtime via une variable d'environnement ;
    toujours protéger la logique de mise à jour automatique spécifique
    à Windows avec `cfg!(target_os = "windows")`.

14. **Mise à jour automatique multiplateforme avec retour arrière
    (rollback) piloté par un health-check** : généraliser
    `apply_update_linux` en `apply_update_unix` (Linux et macOS
    partagent le remplacement du binaire en cours d'exécution) ;
    sauvegarder le binaire actuel avant d'appliquer une mise à jour ;
    après le démarrage de la nouvelle version, sonder un nouveau point
    de terminaison `/healthz` dans un court délai, et restaurer la
    sauvegarde en cas d'échec. Android/iOS restent explicitement hors
    de portée (contrainte de la plateforme, pas un oubli).
15. **Promotion + installation automatique de RSync** : si `rsync` est
    introuvable, afficher un message bilingue engageant ("Let's install
    RSync!") plutôt qu'une erreur sèche, puis tenter une installation
    automatique via une chaîne de gestionnaires de paquets selon l'OS
    (winget→choco sur Windows, apt-get→dnf→pacman sur Linux, brew sur
    macOS, pkg sur Termux/Android), et enchaîner directement sur la
    sauvegarde en cas de succès.
16. **Page d'entrée dédiée pour un canal d'accès restreint** (ex. :
    `facebook.html` pour les utilisateurs limités à Facebook) : une
    simple page statique réutilisant les liens de téléchargement déjà
    présents dans le README, avec une divulgation honnête explicite
    précisant qu'aucun accès "zero-rated" gratuit officiel n'est
    obtenu — seulement un point d'entrée alternatif.

*(Note de traduction automatique : les entrées 14 à 16 ont été
traduites par l'agent IA lui-même, sans relecture par un locuteur
natif.)*

**Avertissement important** : ce projet est un prototype de Phase 0 —
la qualité des réponses IA (basée sur GPT-2), le naturel de la synthèse
vocale et l'adaptation fiable au niveau ne sont pas garantis. Cela doit
également être clairement indiqué lors de tout portage.

---

Autres langues : [日本語 (original, détails complets)](PORTING.md) ·
[Deutsch](PORTING-German.md) · [Italiano](PORTING-Italian.md) ·
[Русский](PORTING-Russian.md) · [Українська](PORTING-Ukrainian.md) ·
[עברית](PORTING-Hebrew.md) · [فارسی](PORTING-Persian.md)

## Modèle : examens originaux multilingues + sélection des langues + lecture (2026-08-22)

1. Séparer les données en deux fichiers : les questions d'examen et les
   phrases lues n'ont pas le même usage.
2. Exposer une API de résumé sans les énoncés (`GET /v1/world-languages`)
   et ne charger le JSON complet qu'au lancement du test.
3. Ne pas réécrire l'interface d'examen : ajouter seulement un
   `<optgroup>` avec des valeurs `world:<code>` et réutiliser la
   correction ainsi que le passage au tuteur.
4. Imposer le minimum et le maximum de langues au niveau des cases à
   cocher ; à la limite atteinte, ne désactiver que les cases **non
   cochées**.
5. Réutiliser la synthèse vocale existante en n'ajoutant que la table
   code → BCP-47 ; indiquer honnêtement qu'en l'absence de voix installée
   le texte est seulement affiché.
6. Afficher les textes dans des `<textarea>` `readonly` (copiables) et
   enregistrer via l'endpoint de persistance existant, sans nouvelle table.

## Motif : réponses à texte fixe déclenchées par des règles (2026-08-23)

1. Trois briques : fonction de détection par mots-clés + table de textes
   indexée par code langue + fonction qui compose la réponse bilingue.
   À placer dans le gestionnaire d'envoi **avant** le chemin IA.
2. Combiner mot-thème ET mot-intention, pour qu'un « Iran » lâché au
   passage ne détourne pas la conversation ordinaire. En anglais, ne mettre
   la limite de mot `\b` **qu'au début**, sinon « Zoroastrianism » échappe
   à la détection (bug réellement rencontré).
3. Tester d'abord les sujets les plus précis (666 avant l'histoire
   religieuse).
4. Écrire les garanties d'honnêteté dans le texte lui-même : on
   **présente** les thèses, on **déclare** les légendes urbaines comme
   telles (avec l'explication technique quand c'est possible, comme pour
   les barres de garde), on **nomme** les coïncidences comme coïncidences ;
   les « parallèles intéressants » entre textes anciens et situation actuelle
   sont **présentés seulement comme une possibilité** (« certains le disent »)
   et jamais comme une prophétie accomplie (exemple : Apocalypse 13,16-17
   « sans la marque, ni acheter ni vendre » rapproché des codes-barres et des
   paiements en ligne comme Amazon).
5. Documenter ce qui a été écarté et pourquoi — dans la réponse et dans un
   commentaire de code (« à lire avant toute modification »).
6. Les précautions nécessaires **n'ont pas à être des clauses de
   non-responsabilité guindées** : une formulation légère et chaleureuse
   (« à prendre comme une curiosité amusante plutôt que comme une preuve
   solide ») convient parfaitement, tant que le lecteur comprend clairement
   que rien n'est démontré. Le critère est « affirme-t-on quelque chose
   comme un fait ? », **et non le ton**. Mais l'allègement ne doit jamais
   glisser vers des tournures qui se lisent comme une affirmation (« la
   prophétie s'est accomplie », « c'est en train de se produire »).

## Motif : réponse à texte fixe en deux temps avec un seul indicateur d'état (2026-08-23)

Le quiz original de l'auteur (quatre 9 pour faire 10, solution
`(9 × 9 + 9) ÷ 9 = 10`) ajoute deux enseignements réutilisables au motif de
réponses à texte fixe déclenchées par des règles décrit plus haut.

1. **Pour tout ce qui doit être exact — arithmétique, énoncés, corrigés —
   utiliser un texte fixe, jamais une génération de modèle.** Un GPT-2 brut
   produit des calculs faux d'apparence convaincante ; les fonctions
   `isQuizRequest()` / `quizQuestionText()` / `quizAnswerText()` court-circuitent
   le chemin IA et ne consomment pas le quota quotidien.
2. **Un échange en deux temps ne demande pas de machine à états** : un seul
   booléen de portée module (`quizAwaitingAnswer`) suffit — d'abord l'énoncé,
   puis la solution une fois que l'utilisateur dit « je ne sais pas ». Placer
   le test d'attente de réponse **avant** celui de la demande de quiz, et ne
   consulter le détecteur aux tournures trop générales (« je ne sais pas »)
   **que** lorsque l'indicateur est vrai : la conversation ordinaire n'est
   ainsi jamais détournée.
3. **Assumer la couverture linguistique réelle** : table de traductions
   indexée par code de langue, la langue choisie par l'utilisateur en tête et
   un repli bilingue par défaut. Ne pas remplir toutes les langues par
   traduction automatique pour paraître universel — ici 7 langues traduites
   sur 130 au registre, ce qui est indiqué honnêtement.
4. **Ne pas retirer les phrases qui évitent les fausses pistes** : préciser
   que le problème est de l'arithmétique pure et non une devinette est
   fonctionnel, pas décoratif.

## Motif : réutiliser une ossature de cours existante pour un autre public (2026-08-24)

L'école virtuelle et l'école de formation professionnelle reposent sur **le même motif
que le cours de soutien scolaire**, avec un public différent.

- Trois tables de données suffisent : les catégories (avec un champ `mode` séparant les
  deux types d'école), les domaines par catégorie, et les questions sous la clé
  `<catégorie>:<domaine>`. N'introduire aucun concept nouveau.
- **Une seule fenêtre modale pour les deux types d'école** : une fonction remplace le
  titre et l'intitulé, puis filtre la liste des catégories par `mode`. Pas de HTML en
  double. Au changement de mode, abandonner la sélection et les domaines installés.
- **Toujours marquer l'absence de contenu comme « pas encore prêt »** : désactiver la
  case à cocher et afficher « N domaines sur M disponibles » sur le bouton de catégorie,
  pour que la couverture soit visible avant même l'ouverture. Si une catégorie est
  entièrement vide, le signaler explicitement.
- **YouTube uniquement en lien de résultats de recherche** (mot-clé encodé dans l'URL),
  avec `rel="noopener noreferrer"` et une note précisant qu'aucune vidéo n'est recommandée.
- **Les formats qui ne se corrigent pas automatiquement** (dissertation, entretien,
  pratique) doivent être présentés comme de simples approximations, jamais vendus comme
  une fonctionnalité.
- Enregistrer les résultats via l'historique existant, en changeant seulement le rôle.
- Droit d'auteur : se documenter sur les tendances générales des épreuves, mais rédiger
  soi-même tous les énoncés.

## Motif : file d'attente locale + nouvelles tentatives pour l'auto-réparation d'un miroir (2026-08-24, suite)

1. **Ne pas essayer de rendre l'écriture miroir infaillible tout de suite** :
   commencer par écrire aussi vers une table de file d'attente locale
   (SQLite ici, `mirror_outbox`) chaque fois qu'une écriture vers une
   destination distante échoue, puis laisser une tâche de fond
   (`tokio::time::interval`) retenter à intervalle fixe jusqu'à un nombre
   maximal de tentatives configurable. Marquer les lignes définitivement
   en échec (`give_up`) plutôt que les supprimer silencieusement, et
   exposer les compteurs par une route de diagnostic existante plutôt que
   d'en créer une nouvelle.
2. **Documenter la portée réelle de la garantie, pas la portée souhaitée** :
   ce motif ne couvre que les écritures que ce processus a lui-même
   tentées et manquées ; il ne peut pas détecter une divergence introduite
   par un autre chemin. Les nouvelles tentatives étant de simples INSERT,
   un doublon rare (at-least-once) doit être annoncé comme un compromis
   assumé, pas corrigé en silence.
3. **Ajouter TLS à un client PostgreSQL existant sans casser le cas par
   défaut** : introduire `tokio-postgres-rustls` en parallèle du chemin
   `NoTls` existant, brancher sur `sslmode` de la chaîne de connexion, et
   garder `sslmode=disable` comme comportement inchangé. Préférer les
   certificats racine du magasin système (`rustls-native-certs`, repli
   `webpki-roots`) à un fichier de certificat embarqué. Une porte de
   secours désactivant la vérification (variable d'environnement dédiée,
   nom explicite, avertissement bruyant dans les journaux) peut être utile
   pour des réseaux fermés de confiance, mais ne doit jamais être le
   réglage par défaut.
4. **Ajouter le support HTTP HEAD à une façade de serveur de fichiers
   partagée plutôt qu'à chaque projet** : si plusieurs projets partagent
   une même façade de routage (ici `RPoem`/`open-runo-poem-compat`),
   ajouter `MethodRouter::head` une seule fois à la façade profite à tous
   les projets qui en dépendent, pour un coût additif seul (aucune API
   existante modifiée).
5. **Ajouter un alias d'endpoint de santé sans dupliquer la logique** :
   quand un motif d'écosystème externe attend un nom de route différent
   (ici `/health` à côté de `/healthz`), faire pointer les deux routes vers
   la même fonction plutôt que dupliquer le code — et ne jamais présenter
   l'ajout de l'alias comme une preuve d'intégration réelle avec ce motif
   externe s'il n'y en a pas.


## Guide de carrière (2026-08-24)

Ajout d'une table de correspondance légère `TUTOR_CAREER_GUIDANCE` (par
matière, pas par question) affichée sous chaque question du parcours de
tutorat, indiquant secteurs/métiers utiles et métiers avancés possibles,
avec un langage toujours prudent. Voir PORTING.md (§17, japonais) pour
les détails et les sources sur le système dual allemand.

## Mise à jour (2026-08-27)

Déploiement VPS (nginx vs proxy réel à vérifier via `ss -tlnp` avant
toute modification de config), badge d'état réseau public/privé limité
à la détection de la liaison locale (ne détecte pas un reverse proxy),
panneaux repliables généralisés en une seule fonction utilitaire
réutilisable, agent GitHub testé en conditions réelles (jeton lu
uniquement côté shell VPS, jamais journalisé). Détails complets
uniquement en japonais.
