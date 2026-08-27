# Philosophie de développement et règles d'environnement (open-english)

> **Depuis (2026-08-27)** : Coin développement freelance, coffre-fort iframe cross-origin (`vault.html`) pour le token GitHub et la clé Google Search, connexion avec e-mail de secours, correctifs de bugs — voir CLAUDE.md (japonais) pour les entrées du 2026-08-27.


> **Note** : ceci est une traduction condensée de l'état actuel. Le
> journal historique détaillé des HANDOFF (des dizaines d'entrées
> depuis le 2026-08-10) reste disponible uniquement en japonais dans
> [CLAUDE.md](CLAUDE.md) par souci de concision — s'y référer pour le
> détail de chaque session.

Disque de travail : `F:\runo`. Cette section suit la pratique
consistant à copier la section correspondante du `CLAUDE.md` de
[`open-raid-z`](https://github.com/aon-co-jp/open-raid-z) dans chaque
projet comme référence. Dépôt GitHub :
[aon-co-jp/open-english](https://github.com/aon-co-jp/open-english).

**Début du développement : 2026-08-10.**

## Rôle de ce projet

Une application web d'apprentissage de l'anglais pour PC/tablette/
smartphone. Dans le style d'un « cours d'anglais en maid café », un
personnage de maid magique (design original, animé) accompagne les
apprenants du débutant à l'avancé. Les réponses IA sont assurées par
[`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm).

## Architecture (selon les instructions de l'utilisateur, 2026-08-10)

- **Côté Linux (VPS)** : uniquement un serveur de distribution pour le
  téléchargement. La gestion de l'application est assurée par
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Côté appareil de l'utilisateur** : le frontend web statique de ce
  dépôt + un serveur natif exécuté localement par `aruaru-llm`
  (utilise en interne les backends d'inférence de `open-directx`/
  `open-cuda`), que l'utilisateur télécharge et exécute lui-même. Le
  navigateur se connecte localement (en ligne/hors ligne) à
  `http://localhost:4600`.

## Divulgation honnête / limitations connues (au 2026-08-10)

- `/v1/generate` de `aruaru-llm` est basé sur GPT-2 (centré sur
  l'anglais, sans fine-tuning pour le dialogue) — la qualité des
  réponses et le respect du niveau ne sont pas garantis.
- Le CORS a été corrigé le 2026-08-10 (`.with_cors()` côté
  `aruaru-llm`).
- La synthèse vocale (TTS)/synchronisation labiale pour les
  personnages tuteurs est branchée via la Web Speech API ; l'animation
  du personnage maid elle-même reste une simple boucle CSS
  d'ouverture/fermeture de bouche.

## Vision future (selon les instructions de l'utilisateur, 2026-08-10, pas encore commencée)

Il existe une idée de faire tourner `open-directx`/`open-cuda`/
`aruaru-llm` également de manière autonome dans le navigateur (WASM/
WebGPU) et de les intégrer avec `RPoem` (une plateforme GraphQL
Federation). Étant donné qu'il s'agit d'un changement architectural
majeur par rapport à la conception actuelle de la Phase 0 (serveur
résident local + connexion localhost), cela ne sera abordé qu'après
l'achèvement du MVP, avec un périmètre dédié.

## Autres mises à jour (2026-08-19 à 2026-08-20)

Depuis lors ont notamment été ajoutés : un message affiché à
l'atteinte de la limite d'utilisation quotidienne, renvoyant vers les
offres payantes et les quotas gratuits d'autres fournisseurs ; un
nouveau panneau « Data & Model Storage » avec interface de
sauvegarde/restauration ; une bannière incitant à mobiliser les
smartphones inutilisés (`PhoneAccelWorker` avec détection NNAPI) ;
une sauvegarde rsync combinée pour aruaru-db/PostgreSQL ; une page de
feuille de route provisoire pour les portages consoles
(PlayStation/Switch/Wii/Wii U, en attente de l'accord des
constructeurs) ; les mises à jour automatiques étendues à tous les
composants embarqués (aruaru-llm/aruaru-db) avec vérification
périodique toutes les 6 heures et rétrogradation manuelle par
composant ; un correctif faisant démarrer aruaru-llm automatiquement
sous Windows (plus aucune étape manuelle) ; une bannière d'information
sur les quotas gratuits des fournisseurs IA/recherche (incluant
Claude/Anthropic) ; un correctif critique empêchant la perte de la
base de données de conversation lors d'une mise à jour/rétrogradation
automatique Windows (vérifié de bout en bout via un véritable
installateur) ; ainsi que de nouvelles fonctionnalités Android
(détection automatique de l'URL du PC par balayage de sous-réseau,
vérifiée sur un appareil Snapdragon réel avec détection NNAPI
réussie, le déchargement de calcul NNAPI proprement dit restant non
implémenté). Détails dans les entrées HANDOFF du 2026-08-19 et du
2026-08-20 de [CLAUDE.md](CLAUDE.md).

## Mises à jour récentes liées à l'installation (2026-08-19)

Installateur Windows unifié `open-english-install.exe` ; la mise à jour
automatique intégrée (`server/src/self_update.rs`) a été étendue à
Linux puis à macOS, avec un retour arrière (rollback) automatique basé
sur un contrôle de santé `/healthz` si la nouvelle version échoue à
démarrer correctement ; nouvelle page d'entrée `facebook.html` pour les
utilisateurs n'ayant accès qu'à Facebook (divulgation honnête : ce
n'est pas un partenariat officiel avec Meta) ; et, depuis le
2026-08-18, l'application encourage et automatise l'installation de
`rsync` lorsqu'il est absent, avant de lancer directement la
sauvegarde. Détails complets uniquement dans les entrées HANDOFF
japonaises ci-dessous.

*(Note de traduction automatique : ce résumé a été traduit par l'agent
IA lui-même, sans relecture par un locuteur natif.)*

---

Autres langues : [日本語 (original, avec l'historique complet des HANDOFF)](CLAUDE.md) ·
[Deutsch](CLAUDE-German.md) · [Italiano](CLAUDE-Italian.md) ·
[Русский](CLAUDE-Russian.md) · [Українська](CLAUDE-Ukrainian.md) ·
[עברית](CLAUDE-Hebrew.md) · [فارسی](CLAUDE-Persian.md)

## Mise à jour 2026-08-22 : examens pour langues du monde, sélection des langues, lecture multilingue

Avant l'implémentation, le code a été vérifié : **il n'existait aucune
liste de langues de traduction ni table i18n** (`learn-target` ne
proposait que l'anglais et le japonais). La liste a donc été définie par
cette fonctionnalité — **38 langues** (17 européennes dont le romanche
suisse, le russe, 4 du Moyen-Orient, 7 d'Asie du Sud, 8 d'Asie de l'Est
et du Sud-Est, 1 africaine), plus l'anglais et le japonais toujours actifs.

- Nouvelles données : `world-language-exams.json` (questions originales à
  choix multiples avec niveaux de style CECR, 3 à 6 par langue) et
  `world-language-phrases.json` (5 phrases de base × 40 langues).
- Nouvelle API : `GET /v1/world-languages` ne renvoie que le résumé, sans
  les énoncés. Aucun nouvel endpoint n'a été créé pour l'enregistrement
  en base : `POST /v1/db/history` suffit.
- Interface : bannière bilingue, panneau « 🌐 Languages » avec cases à
  cocher, « Tout sélectionner » et « Tout désélectionner sauf EN et JA »,
  choix de **2 à 5 langues** (limite imposée par l'interface), affichage
  et lecture séquentiels rejouables à volonté (tout ou une seule langue),
  copie, téléchargement .txt et enregistrement dans SQLite.
- Après la correction, les questions manquées mènent à la conversation
  avec le tuteur de la langue (réutilisation d'`examPrepMissedQuestions`).

**Divulgation honnête** : questions originales, sans lien avec des
certifications officielles ; seulement 3 à 6 questions par langue ;
aucune relecture par des locuteurs natifs ; la lecture réelle dans les 38
langues n'a pas été vérifiée avec de vraies voix (uniquement via un stub
d'observation). Détails dans le HANDOFF du 2026-08-22 de
[CLAUDE.md](CLAUDE.md).

## Réponses à texte fixe déclenchées par des règles (2026-08-23)

Sur les sujets où une erreur factuelle fait le plus de dégâts, l'application
répond **sans inférence IA**, avec un texte écrit à la main. Trois cas
suivent le même schéma : `isCreatorQuestion()` (présentation de l'auteur),
`isReligionHistoryQuestion()` / `RELIGION_HISTORY_TEXTS` (islam, Iran, monde
arabe) et `isMarkOfBeastQuestion()` / `MARK_OF_BEAST_TEXTS` (666 et marque
de la bête). Raison : un GPT-2 brut invente, et sur l'histoire religieuse le
préjudice est élevé. Le quota quotidien n'est pas consommé ; les textes sont
dans une table indexée par code langue (aujourd'hui `ja` et `en` seulement).

**Histoire religieuse neutre** : diversité religieuse de l'Arabie
préislamique, formation du Coran décrite par la recherche comme une
**tradition autonome** (selon la doctrine islamique, révélation faite à
Mahomet), différence entre civilisations iranienne et arabe, influence
zoroastrienne présentée seulement comme la thèse de certains chercheurs.
Deux affirmations initialement souhaitées (Coran issu d'une traduction
biblique ; un frère de Mahomet traducteur) ont été **écartées faute de
sources**, après plusieurs échanges ; le texte dit *pourquoi* elles ne sont
pas avancées. La note sur les limites de la traduction prémoderne ne porte
**que** sur les traductions arabes de la Bible historiquement attestées et
ne doit **jamais** être reliée à la formation du Coran. En conclusion, le
message sur la traduction, le dialogue multilingue et la paix.

**666 / marque de la bête** : le passage de l'Apocalypse est cité
neutralement, sans affirmer d'interprétation « correcte ». Le jeu de mots
**« 666 = WWW »** (guématrie, vav = 6) est présenté **seulement comme une
lecture répandue depuis les années 1990**, pas comme une doctrine.
L'histoire du 666 caché dans les codes-barres est **qualifiée de légende
urbaine** et expliquée techniquement : les **barres de garde** marquent le
début, la fin et le milieu pour le scanner, ne ressemblent au chiffre 6 que
visuellement et relèvent d'un autre encodage (3 modules contre 7) ; Snopes
la juge FAUSSE — **aucun sens occulte, aucun fondement technique**.
Conclusion positive (le web et les scanners rendent les achats commodes
**sans marque corporelle**) et note sur Python (logo serpent, nom venu de
Monty Python) **déclarée pure coïncidence**.

**Ajout du 2026-08-23 (parallèle intéressant — présenter, non affirmer)** :
Apocalypse 13,16-17 contient bien un passage disant que nul ne peut acheter
ni vendre sans la marque (l'existence de ce verset peut être citée comme un
fait). Une phrase ajoutée signale que **certaines personnes y voient un
parallèle intéressant** avec le fait que les achats modernes reposent de plus
en plus sur les codes-barres et les paiements en ligne comme Amazon.
**Contrainte impérative** : présenter cela uniquement comme une possibilité
(« certains le disent »), **jamais** affirmer qu'une prophétie se serait
accomplie — le texte le précise lui-même.

**En cas de modification** : les quatre garanties d'honnêteté — « présenter
et non affirmer », « légende déclarée légende », « coïncidence déclarée
coïncidence » — ne doivent être ni affaiblies ni omises.

## Formulation seulement : ton allégé sur le « 666 » (2026-08-23)

Trois passages de `MARK_OF_BEAST_TEXTS` ont été revus **uniquement sur le
plan du style** : le jeu de mots « 666 = WWW », la légende du code-barres et
la remarque sur Apocalypse 13,16-17 (nul ne peut acheter ni vendre sans la
marque) rapprochée des achats d'aujourd'hui via codes-barres et Amazon. Les
formules de prudence rigides ont laissé place à un ton plus chaleureux.

- **Avant** : « …jamais comme l'affirmation qu'une prophétie se serait
  accomplie » / JA : 「〜と断定するものではありません」
- **Après** : « …à prendre comme une curiosité amusante plutôt que comme une
  preuve solide » / JA : 「話のタネとして」「真偽のほどは分かりませんが、
  こういう見方をすると聖書の世界も少し身近に感じられるかもしれません」

**La contrainte elle-même est inchangée** et reste à respecter : (1) rien
n'est affirmé comme prophétie accomplie ; (2) le 666 du code-barres demeure
explicitement une **légende urbaine sans fondement technique** (Snopes :
FAUX ; barres de garde de 3 modules contre 7 pour un chiffre) ; (3) la
ressemblance entre le serpent de Python et la « bête » demeure **une pure
coïncidence** ; (4) les lectures se présentent, elles ne s'enseignent pas.
Seul le style a changé, au profit de la lisibilité : **aucun affaiblissement
de l'honnêteté**.

## Quiz original de l'auteur : « quatre 9 pour faire 10 » (2026-08-23, suite 4)

Lorsque l'utilisateur demande « donne-moi un problème », « pose-moi une
question », "give me a quiz", l'application propose un **problème original de
son auteur, Masahiro Ishizuka (石塚正浩)** : utiliser quatre fois le chiffre 9
dans `9 ◯ 9 ◯ 9 ◯ 9 = 10`, en remplaçant chaque ◯ par `+`, `-`, `×` ou `÷`
(un même signe peut servir plusieurs fois) et en ajoutant si besoin des
parenthèses ( ) pour changer les priorités, afin d'obtenir exactement 10.
Solution : `(9 × 9 + 9) ÷ 9 = 10` (9×9=81, 81+9=90, 90÷9=10).

- **À ne jamais retirer de l'énoncé** : ce n'est **ni une devinette ni un
  piège** — de l'arithmétique pure, vérifiable à la calculatrice ou au
  boulier. Sans cette phrase, l'utilisateur part sur de fausses pistes
  (« coucher le 9 sur le côté », etc.). L'anecdote « le plus jeune à avoir
  trouvé était un enfant de CP » vient de l'auteur : **ne rien y broder**.
- **Pourquoi ne pas laisser l'IA générer** : un GPT-2 brut produit des
  calculs faux présentés avec aplomb. Énoncé comme solution restent donc des
  **textes fixes**, dans la même logique de branchement à base de règles que
  les réponses « qui a créé cette application », « histoire des religions » et
  « 666 ». Aucun appel à `aruaru-llm`, et le quota d'utilisation quotidien
  n'est pas consommé.
- **Implémentation** : `isQuizRequest()`, `isQuizAnswerRequest()`, table
  `QUIZ_TEXTS`, `quizQuestionText()`, `quizAnswerText()`,
  `quizPreferredLangCode()` dans `app.js`.
- **Échange en deux temps** : un seul indicateur de portée module,
  `quizAwaitingAnswer`, tient l'état (pas de machine à états) — d'abord
  **l'énoncé seul**, puis la solution quand l'utilisateur répond « je ne sais
  pas » / « donne-moi la réponse ». Le test d'attente de réponse est placé
  **avant** `isQuizRequest` dans le gestionnaire d'envoi ;
  `isQuizAnswerRequest()` contient des tournures très courantes mais n'est
  consulté que si `quizAwaitingAnswer === true`, si bien que la pratique
  ordinaire de la conversation n'est jamais détournée.
- **Multilingue et limite assumée** : par défaut japonais + anglais. Si la
  langue choisie (langue à apprendre, sinon langue maternelle) figure dans
  `QUIZ_TEXTS`, sa traduction est placée en tête. Seules **7 langues** sont
  traduites (ja / en / es / fr / de / zh / ko). Les 130 langues du registre
  **n'ont volontairement pas été remplies par traduction automatique** pour
  faire croire à une couverture complète : les autres utilisateurs reçoivent
  l'énoncé bilingue japonais-anglais par défaut. Ajouter une langue revient à
  ajouter une clé de code de langue à `QUIZ_TEXTS` (les codes dérivés comme
  `zh-Hant` réutilisent la traduction du code de base `zh`).
- Prochaine étape possible : si l'auteur propose d'autres problèmes,
  transformer `QUIZ_TEXTS` en tableau de problèmes (aujourd'hui un seul, et
  « un autre problème » renvoie le même).

## École virtuelle / école de formation professionnelle en ligne (2026-08-24)

À la demande de l'utilisateur, une **école virtuelle** (école spécialisée, institut
de premier cycle, université, école doctorale) et une **école de formation
professionnelle en ligne** ont été ajoutées : choisir une catégorie → installer un
domaine → questions tirées au hasard → correction.

- La conception **reprend telle quelle celle du cours de soutien scolaire existant**
  (`TUTOR_*`) ; **aucune nouvelle API, aucun nouveau stockage, aucune nouvelle table**
  n'a été créé. Les résultats passent par le `POST /v1/db/history` existant. Code :
  `VSCHOOL_*` / `vschool*` à la fin de `app.js`, interface `#vschool-modal` dans
  `index.html`. Deux boutons ouvrent **la même fenêtre modale** en deux modes.
- **Recherche préalable (2026-08-24, recherche web en japonais)** : dans les
  procédures d'admission des universités, instituts et écoles spécialisées, la
  dissertation (sur texte, sur thème ou sur données) et l'entretien dominent, la
  dissertation suivant classiquement le triptyque introduction–développement–
  conclusion ; en école doctorale, on évalue le projet de recherche, l'état de l'art,
  les épreuves spécialisées et l'entretien. La formation professionnelle publique
  couvre notamment l'informatique, la vente, l'aide à la personne, le bâtiment,
  l'esthétique et la cuisine. **Ces tendances générales n'ont servi qu'à définir le
  découpage ; tous les énoncés sont rédigés spécialement pour l'application.**
- **Réalisé (7 domaines, 5 questions chacun)** : université = lettres et sciences
  sociales, sciences et ingénierie ; école spécialisée = informatique ; école
  doctorale = bases de la recherche ; formation professionnelle = informatique,
  comptabilité, relation client.
- **Non réalisé, signalé honnêtement comme « pas encore prêt »** : secrétariat médical,
  aide à la personne, esthétique, cuisine, bâtiment, **les quatre domaines de l'institut
  de premier cycle**, santé et soins infirmiers, sciences de l'éducation, spécialités
  doctorales en ingénierie, ainsi que les bases d'aide à la personne, du bâtiment, de
  la cuisine et de l'esthétique côté formation professionnelle.
- **Divulgation honnête (à ne pas affaiblir)** : aucune reprise de sujets réels ; la
  dissertation, l'entretien et la pratique ne sont qu'approchés en QCM ; aucune
  prédiction d'admission ou de diplôme.
- **YouTube** : uniquement des liens vers des **pages de résultats de recherche** pour
  des mots-clés génériques, avec la mise en garde correspondante.
- **Vérification réelle (trois cycles TEST → amélioration → nouveau TEST)** : serveur
  démarré (`http://127.0.0.1:4601/`), les deux modes parcourus intégralement dans le
  navigateur (3/3 avec de bonnes réponses, 0/3 avec affichage des questions sans
  réponse), restauration depuis `localStorage` après rechargement, réinitialisation au
  changement de mode, message pour une catégorie sans contenu, et bouton « réviser avec
  l'entraîneuse ». Deux lignes `[virtual-school] …` ont bien été enregistrées dans
  `/v1/db/history`. Aucune erreur JavaScript.
- Version complète : entrée HANDOFF du 2026-08-24 dans [CLAUDE.md](CLAUDE.md).

## Auto-réparation DUAL DB, TLS PostgreSQL, HTTP HEAD, alias `/health` (2026-08-24, suite)

1. **Auto-réparation de la DUAL DB (file d'attente de nouvelles tentatives)** :
   ce qui restait documenté comme « non implémenté » depuis l'ajout de
   l'écriture simultanée sur deux bases est maintenant fait. Une écriture
   miroir qui échoue est enregistrée dans une table SQLite locale
   `mirror_outbox` et une tâche de fond la retente automatiquement (toutes
   les 60 s par défaut, jusqu'à 100 tentatives par défaut). Les lignes qui
   échouent encore sont marquées `give_up` plutôt que silencieusement
   perdues, et les compteurs (`mirror_outbox_pending`/
   `mirror_outbox_given_up`) sont exposés via `GET /v1/db/info`.
   **Limites honnêtes, à ne pas passer sous silence** : seules les
   écritures que ce processus a lui-même tentées et manquées sont
   couvertes — une suppression faite directement côté miroir, ou un
   changement passé par un autre chemin, échappe à la détection. Les
   nouvelles tentatives sont de simples INSERT, donc un doublon rare
   (at-least-once) reste possible.
2. **Support TLS pour le miroir PostgreSQL** : ajout du crate
   `tokio-postgres-rustls`, ce qui permet à la connexion miroir d'utiliser
   `sslmode=require`/`verify-ca`/`verify-full` face à une base gérée.
   `sslmode=disable` (la valeur par défaut) garde le comportement en clair
   inchangé. Les certificats racine viennent du magasin système
   (rustls-native-certs, repli sur webpki-roots). Une porte de secours
   `OPEN_ENGLISH_DB_TLS_INSECURE=1` désactive la vérification du
   certificat — avertissement explicite dans les journaux, vulnérable à
   une attaque de l'intercepteur, réservée aux réseaux fermés de
   confiance.
3. **Support de la méthode HTTP HEAD** : le serveur de fichiers statiques
   répond désormais correctement à `HEAD` (auparavant 404/405). Cela a
   nécessité l'ajout de `MethodRouter::head` à la façade partagée `RPoem`
   (`open-runo-poem-compat`) — un ajout purement additif, sans impact sur
   l'API existante.
4. **Nouvel alias `/health`** aux côtés de l'existant `/healthz` (même
   contenu JSON `{"ok":true}`), pour correspondre à ce qu'attend
   génériquement le motif d'enregistrement de locataires « digital twin »
   d'autres dépôts de cet écosystème (open-web-server/open-easy-web) —
   **cela ne signifie pas** qu'open-english est déjà intégré à
   open-web-server.
5. **`GET /v1/db/info`** renvoie désormais aussi `rsync_available` (une
   véritable sonde `rsync --version`).
6. **Vérification réelle** : `cargo build`/`cargo test` (18/18 au vert)
   ainsi qu'un binaire réellement lancé — `HEAD /` et `HEAD /app.js`
   renvoient le bon Content-Length/Content-Type avec un corps vide,
   `GET /health` renvoie `{"ok":true}`, et `GET /v1/db/info` inclut bien
   `rsync_available`.


## Guide de carrière dans le parcours de tutorat par niveau scolaire (2026-08-24, suite 2)

L'écran d'exercice affiche désormais, pour chaque matière (japonais,
calcul, sciences, sciences sociales, anglais, programmation, éveil), une
boîte « Guide de carrière » indiquant les secteurs/métiers auxquels la
matière pourrait être utile et les métiers avancés envisageables en
l'approfondissant. Conception fondée sur une recherche réelle du système
dual allemand de formation professionnelle (Berufsschule, certifications
IHK, Ausbildung — sources : IHK Darmstadt, deutschland.de, Wikipédia).
Formulations toujours prudentes (« pourrait aider »), jamais de promesse
d'emploi garanti. Portée : niveau de la matière, pas de chaque question
individuelle ; fonctionnalité vérifiée en conditions réelles (serveur
lancé, CE3/calcul installé, guidage affiché correctement). Détails
complets uniquement dans la version japonaise de CLAUDE.md.

**Mise à jour (suite, 2026-08-24)**: Extension du career guidance à l'École
virtuelle / formation professionnelle virtuelle (`VSCHOOL_FIELDS`, 23
domaines). Correction d'un bug urgent : texte blanc sur fond blanc dans
plusieurs zones (saisie de chat, panneaux de langues) à cause d'un fond
clair sans couleur de texte définie sur le thème sombre — corrigé avec
des couleurs de texte explicites. Tailles de police incohérentes entre
texte japonais et libellés latins (ex. "JP", "(default / 既定)")
uniformisées. Texte obsolète sur le support TLS de la base de données
corrigé pour refléter le support TLS réellement implémenté
(`tokio-postgres-rustls`), avec mention honnête que ce n'a pas pu être
testé faute de cargo/psql/Docker sur cette machine.

**Mise à jour (suite 6, 2026-08-24)**: Ajout de citations/proverbes
bilingues (japonais/anglais) dans les trois encarts de conseil de
carrière existants, d'un message de motivation (formulé comme un espoir,
non une garantie) exprimant le souhait que les apprenants deviennent
employables et capables de gagner leur vie partout, et d'une nouvelle
matière « Communication & Questioning Skills » (collège/lycée) qui
enseigne de vraies expressions anglaises pour la discussion hypothétique
constructive, le feedback constructif, et l'importance d'être « audacieux
mais délicat ». Vérifié en conditions réelles (serveur lancé, navigateur).
Détails complets uniquement dans la version japonaise de CLAUDE.md.

**Mise à jour (2026-08-27)** : Déploiement réel sur le VPS
(easy-web.tokyo/open-english), sélecteur de dossier (explorateur) pour
choisir les chemins de sauvegarde/stockage, badge permanent d'état
public/privé du réseau avec prise en charge de DuckDNS pour un domaine
personnalisé, panneaux d'interface repliables (avertissement, bannière
smartphones inutilisés, bannière langues du monde, barre de réglages),
test réel de bout en bout de l'écriture GitHub/VPS via l'agent, upload de
plans + commentaire IA textuel partagé avec le nouveau serveur
open-cg-cad (semi-conducteurs/automobile/bâtiment, vos propres fichiers
uniquement, aucune analyse d'image — aruaru-llm ne traite que du texte),
test blanc multilingue (8 langues supplémentaires) pour la certification
« Data Scientist » américaine, et un nouveau sujet d'opinion répondant
aux questions sur l'épargne retraite / le « problème des 20 millions de
yens ». Détails complets uniquement dans la version japonaise de
CLAUDE.md.
