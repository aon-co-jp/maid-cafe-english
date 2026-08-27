# open-english

> 📌 **Mise à jour (2026-08-27)** : Ajout d'un « Coin développement freelance » (100 langages, liens de recherche d'emploi, transfert vers le professeur IA), d'un coffre-fort iframe cross-origin (`vault.html`) qui isole le token GitHub et la clé API Google Search de la page principale, d'une seconde adresse e-mail de secours pour la connexion, et d'un raccourci de lancement Chrome en navigation privée. Deux bugs réels détectés par des tests en direct dans le navigateur (fuite de clé obsolète, message de statut trompeur en mode coffre-fort) ont été corrigés. Voir les entrées du 2026-08-27 dans CLAUDE.md (japonais) pour les détails complets.


> 📌 **Mise à jour (2026-08-24, suite 2) : « Conseils de carrière » ajoutés
> au parcours de tutorat par niveau scolaire.** L'écran d'exercice affiche
> désormais, pour chaque matière, les secteurs/métiers auxquels elle
> pourrait être utile et les métiers avancés qu'on pourrait viser en
> approfondissant — toujours formulé avec prudence (« pourrait aider »,
> jamais de promesse d'emploi garanti). Conception inspirée d'une recherche
> réelle sur le système dual allemand de formation professionnelle
> (Berufsschule, certifications IHK, Ausbildung). Voir CLAUDE.md pour les
> détails et les sources.

> 📌 **Dernière mise à jour (2026-08-24, suite 6) : citations/proverbes +
> message de motivation + nouvelle matière « Communication & Questioning
> Skills »** : chaque encart de conseil de carrière affiche désormais une
> citation ou un proverbe bilingue (français/anglais, ex. « Strike while
> the iron is hot ») et un message de motivation prudent (pas une
> garantie) exprimant l'espoir que l'apprenant puisse trouver un emploi,
> changer de carrière et gagner sa vie partout. Une nouvelle matière
> (collège/lycée) enseigne de vraies expressions anglaises pour une
> discussion hypothétique constructive et un retour constructif. Détails
> dans CLAUDE.md.

> 📌 **Dernière mise à jour (2026-08-24, suite) : auto-réparation de la
> DUAL DB (file d'attente de nouvelles tentatives) + support TLS pour la
> connexion PostgreSQL + support de la méthode HTTP HEAD** :
> - **Auto-réparation de la DUAL DB** : ce qui était jusqu'ici documenté
>   comme « non implémenté » est désormais en place. Une écriture miroir
>   qui échoue est mise en file d'attente dans une table SQLite locale
>   `mirror_outbox` et réessayée automatiquement par une tâche de fond
>   (toutes les 60 s par défaut). Chaque ligne est retentée jusqu'à 100 fois
>   par défaut ; les lignes qui échouent toujours ne sont pas abandonnées
>   silencieusement — elles sont marquées `give_up`, et les compteurs sont
>   visibles via `GET /v1/db/info` (`mirror_outbox_pending`/
>   `mirror_outbox_given_up`). **Limites honnêtes** : seules les écritures
>   que ce processus a lui-même tentées et manquées sont couvertes — une
>   ligne supprimée directement côté miroir, ou une modification passée par
>   un autre chemin, ne peut pas être détectée. Les nouvelles tentatives
>   sont de simples INSERT, donc un doublon rare (at-least-once) reste
>   possible.
> - **Support TLS** : ajout de `tokio-postgres-rustls`, permettant à la
>   connexion miroir PostgreSQL d'utiliser `sslmode=require`,
>   `verify-ca` ou `verify-full` face à une base gérée
>   (`sslmode=disable`, la valeur par défaut, garde le comportement en
>   clair inchangé). Les certificats racine proviennent du magasin de
>   confiance du système (rustls-native-certs, avec repli sur
>   webpki-roots). Une porte de secours `OPEN_ENGLISH_DB_TLS_INSECURE=1`
>   désactive la vérification du certificat (avertissement explicite,
>   vulnérable à une attaque de l'intercepteur, réservée aux réseaux
>   fermés de confiance).
> - **Support de la méthode HTTP HEAD** : le serveur de fichiers statiques
>   répond désormais correctement aux requêtes `HEAD` (il renvoyait
>   auparavant 404/405, ce qui compte en pratique puisque de nombreux
>   clients HTTP et outils de vérification de santé sondent avec HEAD).
>   Cela a nécessité l'ajout de `MethodRouter::head` à la façade partagée
>   `RPoem` (`open-runo-poem-compat`) — un ajout pur, sans changement
>   d'API existante.
> - **Nouvel alias `/health`** : ajouté aux côtés de l'existant `/healthz`
>   pour que la forme du contrôle de santé de cette application corresponde
>   à ce qu'attend génériquement le motif d'enregistrement de locataires
>   « digital twin » (分身の術) d'autres dépôts de cet écosystème
>   (open-web-server / open-easy-web). Cela ne signifie pas qu'open-english
>   est déjà intégré à open-web-server.
> - `GET /v1/db/info` renvoie désormais aussi `rsync_available` (une
>   véritable sonde `rsync --version`), pour vérifier si rsync est
>   utilisable avant d'essayer `/v1/db/rsync-backup`.
> - Vérifié avec `cargo build`/`cargo test` (18/18 au vert) ainsi qu'avec
>   un binaire réellement lancé : `HEAD /` et `HEAD /app.js` renvoient le
>   bon Content-Length/Content-Type avec un corps vide, `GET /health`
>   renvoie `{"ok":true}`, et `GET /v1/db/info` inclut bien
>   `rsync_available`.

> 📌 **Dernière mise à jour (2026-08-24) : une école virtuelle (enseignement
> supérieur) et une école de formation professionnelle en ligne virtuelle** :
> - **🏫 École virtuelle** propose quatre catégories — école spécialisée
>   (senmon gakko), institut universitaire de premier cycle, université (licence)
>   et école doctorale. On y choisit des domaines, on les installe, et l'application
>   pose des **questions d'entraînement originales** inspirées des concours d'entrée,
>   des cours et des contrôles, puis les corrige.
> - **🛠 École de formation professionnelle virtuelle** fonctionne de la même façon
>   pour des domaines professionnels.
> - **Sept domaines fonctionnent réellement aujourd'hui, cinq questions chacun** :
>   université = lettres et sciences sociales / sciences et ingénierie ; école
>   spécialisée = informatique ; école doctorale = bases de la recherche (projet de
>   recherche, éthique de la recherche, entretien) ; formation professionnelle =
>   bases de l'informatique et de la programmation, bases de la comptabilité, bases
>   de la relation client.
> - **Tout le reste affiche honnêtement « pas encore prêt »** (secrétariat médical,
>   aide à la personne, esthétique, cuisine, bâtiment, **les quatre domaines de
>   l'institut de premier cycle**, santé et soins infirmiers, sciences de l'éducation,
>   etc.). Chaque bouton de catégorie indique « N domaines sur M disponibles ».
> - Chaque domaine comporte un lien vers une **page de résultats de recherche YouTube**
>   pour un mot-clé général. **Aucune vidéo particulière n'est recommandée comme juste.**
> - **Divulgation honnête** : toutes les questions sont originales ; rien n'est repris
>   de vrais sujets d'examen, de manuels ou d'annales commerciales. **La dissertation,
>   l'entretien et les épreuves pratiques ne sont qu'approchés sous forme de questions
>   à choix multiples** et ne remplacent ni une correction de copie ni un entraînement
>   à l'entretien. Le score ne préjuge en rien d'une admission réelle.
> - Les résultats sont enregistrés via l'historique existant (`/v1/db/history`) ;
>   aucune nouvelle API n'a été ajoutée.

> 📌 **Dernière mise à jour (2026-08-23, suite)** : un **quiz original de
> l'auteur de l'application, Masahiro Ishizuka (石塚正浩)**. Si vous demandez
> « pose-moi un problème », « donne-moi un quiz » ou "give me a quiz",
> l'application propose ceci : utiliser quatre fois le chiffre 9 dans
> `9 ◯ 9 ◯ 9 ◯ 9 = 10`, en mettant dans chaque ◯ l'un des signes `+`, `-`,
> `×`, `÷` (un même signe peut resservir) et, si besoin, des parenthèses ( )
> pour changer les priorités, de façon à obtenir exactement 10. **Ce n'est ni
> une devinette ni un piège** : de l'arithmétique pure, que l'on peut
> vérifier à la calculatrice ou au boulier. Le plus jeune à l'avoir résolu
> était un enfant de première année d'école primaire. L'échange se fait **en
> deux temps** : d'abord l'énoncé seul, puis la solution
> (`(9 × 9 + 9) ÷ 9 = 10`) lorsque vous répondez « je ne sais pas » ou
> « donne-moi la réponse ». **Langues** : par défaut japonais + anglais ; si
> vous avez choisi l'espagnol, le français, l'allemand, le chinois ou le
> coréen comme langue étudiée ou langue maternelle, la traduction
> correspondante est placée en tête. **Nous ne prétendons pas couvrir les 130
> langues** : seules ces 7 langues sont traduites, les autres reçoivent
> l'énoncé bilingue japonais-anglais. Comme pour les réponses « qui a créé
> cette application » ou « 666 », il s'agit d'un **texte fixe, sans passer
> par l'IA** (un GPT-2 brut donne des calculs faux à l'air convaincant), et
> cela ne consomme pas votre quota d'utilisation quotidien.

> 📌 **Dernière mise à jour (2026-08-23, formulation seulement)** : trois
> passages de la réponse à texte fixe sur « 666 / la marque de la bête » ont
> été **retravaillés sur le plan du style** — le jeu de mots « 666 = WWW »,
> la légende du code-barres et la remarque sur Apocalypse 13,16-17 rapprochée
> des achats modernes via codes-barres et Amazon. Les formules de prudence
> rigides (« jamais comme l'affirmation qu'une prophétie se serait
> accomplie ») ont cédé la place à un ton plus léger et chaleureux : **« à
> prendre comme une curiosité amusante plutôt que comme une preuve
> solide »**. **La contrainte, elle, est inchangée** : rien n'est affirmé
> comme prophétie accomplie, le 666 du code-barres reste explicitement une
> **légende urbaine sans fondement technique** (Snopes : FAUX ; les barres de
> garde font 3 modules contre 7 pour un chiffre), et le serpent de Python
> reste **une pure coïncidence**. Seul le style a changé — l'objectif était
> la lisibilité et le charme, pas moins d'honnêteté.

> 📌 **Dernière mise à jour (2026-08-23)** : ajout de deux **réponses à
> texte fixe, écrites à la main et déclenchées par des règles** (bilingues
> JA/EN, sans inférence IA).
> **(1) Islam, Iran/Perse et monde arabe** : les questions sur l'histoire
> et les racines reçoivent une synthèse neutre et factuelle — les
> communautés chrétiennes de l'Arabie préislamique (Najran, Ghassanides),
> la formation du Coran que la recherche décrit comme une **tradition
> autonome et distincte**, la différence entre civilisations iranienne et
> arabe, et l'influence zoroastrienne, présentée expressément comme une
> **« thèse défendue par certains chercheurs »** et non comme un fait
> établi. Deux affirmations que l'on souhaitait au départ inclure (le Coran
> issu d'une traduction de la Bible ; un frère de Mahomet comme traducteur)
> ont été **délibérément écartées faute de sources**. Le texte se termine
> sur l'idée que les barrières linguistiques nourrissent les malentendus et
> que **la traduction automatique et le dialogue multilingue peuvent
> favoriser la compréhension mutuelle et la paix**.
> **(2) « 666 est-il la marque de la bête ? »** : une réponse légère, sous
> forme d'anecdote. Elle cite le passage de l'Apocalypse de façon neutre,
> présente le jeu de mots moderne **« 666 = WWW »** (guématrie hébraïque :
> la lettre vav vaut 6) **explicitement comme une lecture de certains et
> non comme une doctrine**, signale l'histoire du « 666 caché dans les
> codes-barres » **explicitement comme une légende urbaine** et en explique
> la technique réelle : les barres plus longues aux extrémités et au centre
> sont les **barres de garde** (repères de début, de fin et de séparation
> pour le scanner) ; elles *ressemblent* seulement au chiffre 6 mais
> utilisent un autre encodage (3 modules au lieu de 7) — Snopes juge
> l'affirmation FAUSSE : **aucun sens occulte, aucun fondement technique**.
> Vient ensuite une conclusion positive : le web et les scanners ont rendu
> les achats commodes **sans que personne ait besoin d'une marque sur le
> corps** ; enfin la note que le logo de Python est un serpent mais que son
> nom vient de la série comique « Monty Python's Flying Circus » — la
> ressemblance avec la « bête » est **déclarée pure coïncidence et jeu de
> mots**, sans aucun lien réel.
> **Ajout du 2026-08-23** : une autre remarque signale qu'Apocalypse
> 13,16-17 contient bien un passage disant que nul ne peut acheter ni vendre
> sans la marque, et que **certaines personnes y voient un parallèle
> intéressant** avec le fait que les achats modernes reposent de plus en plus
> sur les codes-barres et les paiements en ligne comme Amazon — **présenté
> strictement comme une coïncidence que certains trouvent frappante, jamais
> comme l'affirmation qu'une prophétie se serait accomplie**.
> Détails dans les HANDOFF du 2026-08-23 de [CLAUDE.md](CLAUDE.md).

> 📌 **Dernière mise à jour (2026-08-22)** : ajout d'**examens
> d'entraînement pour les langues du monde, d'une interface de sélection
> des langues et d'un affichage/lecture à voix haute multilingue
> séquentiel**. L'anglais et le japonais restent les langues par défaut,
> mais une bannière bilingue et le panneau « 🌐 Languages » permettent
> d'activer des séries d'exercices originaux pour **38 langues**
> (Europe, Moyen-Orient, Asie, Inde, Afrique). Après la correction, les
> questions manquées mènent à une conversation avec le tuteur de la
> langue choisie, exactement comme le parcours Eiken/TOEIC/TOEFL/JLPT
> existant. On peut aussi choisir **2 à 5 langues** (anglais et japonais
> compris) pour afficher et écouter la même phrase l'une après l'autre,
> autant de fois que souhaité, avec copier-coller, téléchargement .txt
> et enregistrement dans la base SQLite locale. Divulgation honnête :
> ce sont des questions originales écrites pour cette application, et
> non d'anciens sujets d'examens ; elles n'ont aucun lien avec les
> certifications réelles (DELE, DELF, Goethe-Zertifikat, HSK, TOPIK…).
> Les niveaux de style CECR (A1–C2) ne sont qu'indicatifs, le nombre de
> questions est inégal (3 à 6 par langue) et la lecture repose sur la
> Web Speech API du navigateur : sans voix installée, le texte est
> seulement affiché. Détails dans l'entrée HANDOFF du 2026-08-22 de
> [CLAUDE.md](CLAUDE.md).

> 📌 **Dernière mise à jour (2026-08-18)**: Ajout d'une véritable base de
> données locale pour l'historique des conversations/paramètres (SQLite
> + miroir optionnel auto-réparateur `aruaru-db`/PostgreSQL), ainsi que
> des API de sélection de l'emplacement de stockage, de sauvegarde rsync
> et d'import de données héritées. Si `rsync` n'est pas installé,
> l'application affiche un message bilingue **"Let's install RSync!"**
> et peut l'installer automatiquement via le gestionnaire de paquets du
> système, puis lance aussitôt la sauvegarde. Détails dans
> [CLAUDE.md](CLAUDE.md) (entrées HANDOFF du 2026-08-18, en japonais).

> 📌 **Mise à jour précédente (2026-08-11–12, v0.6.0)**: Android/tablette
> fonctionne désormais de manière totalement autonome — plus besoin de
> PC ni de serveur Linux. Le moteur de réponse IA (`aruaru-llm`)
> lui-même est maintenant intégré dans l'APK ; la vérification sur
> l'appareil a confirmé que les deux processus restent actifs et
> répondent à `/healthz`/`/v1/chat`. Ajouté également : un coin de
> préparation aux examens de certification (Eiken 1-5, TOEIC, TOEFL,
> JLPT N1-N5, Nihongo Kentei 1-3, 10 questions originales chacun) qui
> transmet les questions ratées au tuteur IA après notation (bascule
> automatique vers un mode « classe de japonais » pour JLPT/Nihongo
> Kentei), un sélecteur « quelle langue apprendre », et des
> installateurs Linux/macOS (`installer/unix/install.sh`). Divulgation
> honnête : les poids du modèle (famille GPT-2, modèle d'embedding) ne
> sont pas intégrés à l'APK — utiliser le chat IA sur Android nécessite
> toujours de placer manuellement les fichiers du modèle dans le
> stockage interne (pas encore de téléchargement automatique). Voir les
> entrées HANDOFF du 2026-08-11 (suite 7-10) dans [CLAUDE.md](CLAUDE.md).

> 📌 **Mise à jour précédente (2026-08-11, suite 3)**: Ajout d'une
> fonction de mise à jour automatique (Windows uniquement) qui vérifie
> au démarrage la dernière version sur GitHub et, si plus récente,
> désinstalle automatiquement l'ancienne et installe la nouvelle.
> Divulgation honnête : aucune GitHub Release n'existe encore, donc le
> flux complet de désinstallation→installation n'a pas encore été
> vérifié de bout en bout (la logique de comparaison de versions et le
> chemin « aucune release trouvée, continuer en toute sécurité » ont
> été vérifiés).

> 📌 **Mise à jour précédente (2026-08-11, suite 2)**: Ajout de la
> détection des sujets de recherche d'emploi/changement de carrière/
> tourisme qui présente aruaru.tokyo, audiocafe.tokyo/aruaru,
> audiocafe.tokyo/aruaru-lady et nasa.tokyo en anglais et en japonais —
> fonctionne en chat normal comme en mode entraînement, vérifié en
> direct.

> 📌 **Mise à jour précédente (2026-08-11, suite)**: Connexion à une
> nouvelle base de données géo/tourisme (les 47 préfectures japonaises,
> les 50 États américains, les principales capitales mondiales avec
> sites/plats/souvenirs) pour rendre dynamique l'entraînement à
> l'auto-présentation. Lorsque le Mont Fuji est évoqué, l'application
> affiche désormais un avis de sécurité bilingue (porter des vêtements
> de ski + un casque, réserver un refuge à l'avance) ainsi que des
> informations réelles sur les refuges/bus/magasins d'équipement et une
> recherche de réservation de circuit. Ajout d'une UI de sélection
> tranche d'âge/niveau/anglais des affaires. Vérifié en direct avec un
> `aruaru-llm` + serveur statique réellement en fonctionnement (3 vrais
> bugs trouvés et corrigés).

> 📌 **Mise à jour précédente (2026-08-11)**: Ajout d'un panneau de
> paramètres pour enregistrer sa propre clé API Google Search/cx
> directement depuis le navigateur (`POST /v1/settings/google-search`,
> en mémoire uniquement, jamais écrit sur disque). L'installateur
> Windows (`installer/windows/`, Inno Setup) a été réellement compilé,
> installé, lancé et désinstallé sur du matériel réel (sans droits
> administrateur).

> 📌 **Mise à jour précédente (2026-08-10, suite)**: (1) Passage du
> modèle par défaut de `gpt2` (124M) à `distilgpt2` (82M), ~42% plus
> rapide. (2) Décision de **ne pas** porter le JS du frontend vers
> Rust/WASM (aucun gain de performance, et `SpeechRecognition` n'a pas
> de liaison web-sys standard) — à la place, **le serveur de fichiers
> local a été porté vers Rust** (nouveau crate `server/`, basé sur
> `open-runo-poem-compat` de RPoem, supprimant la dépendance à
> `python3 -m http.server`). (3) Amélioration de la gestion de la
> saisie japonaise afin que les réponses hybrides (anglais+japonais)
> soient toujours garanties. (4) Ajout de la gestion des versions
> (`version.json` avec un champ `version` sémantique, affiché en pied
> de page) et du nettoyage automatique des traces côté navigateur des
> anciennes versions.

> 📌 **Mise à jour récente (2026-08-10)**: Ajout du support CORS,
> correction à la racine de la boucle de répétition dégénérée du
> décodage glouton de GPT-2 (`generate_with_repetition_penalty` de
> `open-cuda`, pénalité par défaut 1,3), ajustement de l'apparence du
> personnage Tora-san + ajout d'un jingle de changement de personnage +
> correction de sa présentation, ajout d'une étape d'entraînement basée
> sur la technique de service client réelle d'un vrai maid café
> d'Akihabara (@ほぉ～むカフェ), recherche et ajout d'une étape sur
> l'engouement actuel pour la culture japonaise à l'étranger (anime/
> manga, chansons d'anime, jeux vidéo, apprenants de japonais,
> collection de goshuin, tourisme onsen/ryokan, cuisine japonaise),
> ajout d'icônes de lancement pour Windows/Mac/Linux/Android/iPhone/
> iPad et mise en place d'un mécanisme de mise à jour automatique.

Une application web (Phase 0) d'apprentissage de la conversation
anglaise pour PC/tablette/smartphone. Dans le style d'un « cours
d'anglais en maid café », un personnage de maid magique (design
original, animé) accompagne les apprenants du grand débutant à
l'avancé.

## Architecture (selon les instructions de l'utilisateur, 2026-08-10)

- **Côté Linux (VPS)**: uniquement un serveur de distribution pour le
  téléchargement (ce n'est pas là que l'application s'exécute
  réellement). La gestion de l'application est assurée par
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Côté appareil de l'utilisateur (PC/tablette/téléphone)**: le
  frontend web statique de ce dépôt (HTML/CSS/JS, fonctionne dans le
  navigateur) + un serveur natif exécuté localement par
  [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) (qui utilise
  en interne les backends d'inférence de `open-directx`/`open-cuda`),
  que l'utilisateur télécharge et exécute lui-même. Le navigateur se
  connecte localement (en ligne ou hors ligne) à
  `http://localhost:4600` (port par défaut d'aruaru-llm) — une
  conception « hybride ».

## Portée actuelle (Phase 0) — divulgation honnête

- **Qualité des réponses IA**: `/v1/generate` de `aruaru-llm` effectue
  une génération de texte autorégressive avec GPT-2 (124M-1,5B, centré
  sur l'anglais, sans fine-tuning pour le dialogue). La fluidité ou
  l'adéquation au niveau ne sont pas garanties — cela est indiqué à
  l'écran, sans exagération. Depuis le 2026-08-10, une pénalité de
  répétition (1,3 par défaut) corrige le bug précédemment signalé de
  boucle de répétition infinie.
- **CORS**: corrigé depuis le 2026-08-10 — le serveur HTTP de
  `aruaru-llm` envoie désormais des en-têtes `Access-Control-*`, donc
  ce frontend peut être ouvert en cross-origin (ou via `file://`) tout
  en atteignant `http://localhost:4600`.
- **Sélection du niveau**: le sélecteur de niveau débutant à avancé
  existe dans l'UI, mais l'application réelle du niveau se limite à une
  courte instruction dans le prompt — GPT-2 n'est pas garanti de la
  respecter.
- **Voix/TTS**: la vraie Web Speech API (SpeechSynthesis pour la
  sortie, SpeechRecognition pour l'entrée micro) est branchée, avec un
  réglage de hauteur/débit par personnage.
- **Mode entraînement**: un script déterministe d'auto-présentation
  (non généré par l'IA) qui inclut désormais aussi la technique de
  conversation par mots-clés d'un vrai maid café d'Akihabara, ainsi
  qu'une étape résumant l'engouement actuel pour la culture japonaise à
  l'étranger.
- **Icônes de lancement**: `icons/` + `manifest.json` (PWA) +
  `launchers/` permettent de lancer l'application depuis une icône de
  bureau (Windows/Mac/Linux) ou une icône d'écran d'accueil
  (Android/iPhone/iPad).
- **Mise à jour automatique**: `auto-update.js` interroge
  `version.json` toutes les 5s et recharge la page lorsque l'ID de
  build change. **Limitation connue**: certains navigateurs bloquent
  `fetch()` de fichiers locaux sous le schéma `file://` — garanti de
  fonctionner lorsqu'il est servi via un serveur HTTP local, sinon se
  désactive silencieusement.

## Installateurs requis (ajouté le 2026-08-17)

Pour lancer open-english, vous devez télécharger et installer les deux
logiciels suivants (aucune compilation depuis les sources requise,
proche d'une installation en un clic).

| # | Quoi | Windows | Linux | Android/tablette |
|---|---|---|---|---|
| 1 | **open-english lui-même** (ce dépôt — frontend statique + serveur de diffusion) | [open-english-install.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-install.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest) | [APK](https://github.com/aon-co-jp/open-english/releases/latest) (choisir l'asset `.apk`) |
| 2 | **aruaru-llm** (le moteur de réponse IA — obligatoire, le chat ne fonctionne pas sans lui) | [aruaru-llm-windows-x86_64.zip](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-windows-x86_64.zip) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Déjà inclus (intégré dans l'APK d'open-english, aucune installation séparée nécessaire) |

**Divulgation honnête**: les liens "latest" ci-dessus pointent toujours
vers la dernière Release GitHub (utilisez directement la
[page Releases](https://github.com/aon-co-jp/open-english/releases) si
vous voulez une version précise figée). Il n'existe pas encore de
binaire macOS précompilé pour `aruaru-llm` (open-english lui-même
fournit un tar.gz macOS, mais `aruaru-llm` ne propose que Linux/Windows)
— sur macOS, il faudra compiler `aruaru-llm` depuis les sources.

Sous Windows/Linux/macOS, après l'installation, la fonction de mise à
jour automatique intégrée (`server/src/self_update.rs`, étendue à
Linux puis à macOS le 2026-08-19) vérifie les GitHub Releases au
démarrage et, si une version plus récente existe, effectue la mise à
jour automatiquement (Windows : désinstallation→installation ;
Linux/macOS : le binaire en cours d'exécution se remplace lui-même sur
place) — sans aucune action de l'utilisateur. Avant d'appliquer une
mise à jour, le binaire actuel est sauvegardé ; une fois la nouvelle
version démarrée, une vérification de santé sur le nouveau point de
terminaison `/healthz` doit réussir dans un court délai, sinon
l'application revient automatiquement (rétrograde) à la version
précédente sauvegardée. **Divulgation honnête** : Android/iPhone/iPad
sont exclus de ce mécanisme de mise à jour/retour automatique (l'OS
n'autorise pas l'installation silencieuse d'APK) — les notifications de
mise à jour y restent une installation manuelle par l'utilisateur (et
il n'existe pas non plus de chemin de rétrogradation).

Une nouvelle page d'entrée, `facebook.html`, a également été ajoutée
pour les utilisateurs dont le forfait mobile ne permet d'accéder qu'à
Facebook — divulgation honnête : il ne s'agit pas d'un partenariat
officiel "Free Basics" avec Meta, seulement d'une page normale
accessible depuis le navigateur intégré de Facebook, qui pointe vers
les installateurs existants.

*(Note de traduction automatique : ce paragraphe a été traduit par
l'agent IA lui-même, sans relecture par un locuteur natif.)*

## Comment lancer l'application

1. Lancer [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) avec
   `cargo run --release` (par défaut `http://localhost:4600`, modèle
   par défaut désormais `distilgpt2`).
2. Dans `server/`, exécuter `cargo run --release` pour servir le
   frontend statique de ce dépôt sur `http://127.0.0.1:4601/`
   (basé sur RPoem — `python3 -m http.server` n'est plus nécessaire ;
   port modifiable via la variable d'environnement
   `OPEN_ENGLISH_SERVER_BIND`).
3. Ouvrir `http://127.0.0.1:4601/` dans un navigateur. Ouvrir
   directement `index.html` via `file://` fonctionne encore, mais
   certains navigateurs y bloquent `fetch()` et désactivent la mise à
   jour automatique — le serveur de l'étape 2 est recommandé.

## Prochaines étapes

1. ~~Support CORS côté `aruaru-llm`~~ **Fait (2026-08-10)**.
2. ~~Boucle de répétition du décodage glouton GPT-2~~ **Cause racine
   corrigée (2026-08-10, pénalité de répétition)**.
3. ~~Accélérer le modèle par défaut~~ **Fait (2026-08-10, passage à
   distilgpt2, ~42% plus rapide)**.
4. ~~Garantir des réponses hybrides pour la saisie japonaise~~ **Fait
   (2026-08-10)**.
5. ~~Porter le serveur de fichiers local vers Rust~~ **Fait
   (2026-08-10, crate `server/`)**. Porter le JS du frontend lui-même
   vers Rust/WASM a été évalué et abandonné (aucun gain de performance
   — voir `CLAUDE.md`).
6. Ajouter des finitions TTS/lip-sync.
7. Implémenter un programme par niveau (grammaire, listes de
   vocabulaire, etc.).
8. **(selon les instructions de l'utilisateur, 2026-08-10)** Une idée
   future consistant à faire tourner `open-directx`/`open-cuda`/
   `aruaru-llm` directement dans le navigateur (WASM/WebGPU) et à
   l'intégrer avec `RPoem` (une plateforme GraphQL Federation). Il
   s'agit d'une direction architecturale importante et distincte de la
   conception actuelle de la Phase 0, reportée après l'achèvement du
   MVP.
9. Étudier si les techniques de Toshiba SBM ou de la famille DeepSeek
   ont une application réelle ici (pas encore commencé).

---

Autres langues : [日本語](README.md) · [English](README-English.md) ·
[Deutsch](README-German.md) · [Italiano](README-Italian.md) ·
[Русский](README-Russian.md) · [Українська](README-Ukrainian.md) ·
[עברית](README-Hebrew.md) · [فارسی](README-Persian.md)

---

## 🎓 Cours de soutien scolaire : enregistrer l'historique d'apprentissage (recommandé avant de commencer)

**Avant d'utiliser le cours de soutien, nous recommandons de configurer une
base de données d'historique** : **aruaru-db** ou un **serveur PostgreSQL
classique**. Vous conserverez ainsi la trace des niveaux et matières
travaillés, des exercices réussis et des résultats, pour revoir plus tard le
chemin parcouru. Sans base de données, les scores ne vivent que dans le
fichier SQLite local intégré (perdu en cas de réinstallation ou de changement
d'appareil) et vos choix de niveau/matière seulement dans le localStorage.

Les deux se configurent de la même façon : `OPEN_ENGLISH_DATABASE_URL` avec
une chaîne de connexion PostgreSQL (aruaru-db parle le même protocole).
**Réserves honnêtes** : la connexion se fait sans TLS, donc les services
PostgreSQL managés exigeant SSL ne fonctionnent pas encore, et un PostgreSQL
seul n'a pas été testé de bout en bout chez nous.

- **Configuration double (DUAL) — aruaru-db + PostgreSQL** : deux bases qui se
  recopient protègent d'une panne de l'une d'elles. **État réel** :
  open-english écrit dans SQLite plus *une seule* base ; **l'écriture
  simultanée dans deux bases n'est pas encore implémentée**. Aujourd'hui, le
  DUAL passe par `DUAL_DATABASE_URL` d'aruaru-db
  (open-english → aruaru-db → PostgreSQL).
- **Sauvegarde rsync** : la base *peut être ajoutée* à une sauvegarde rsync
  vers un disque externe, un autre PC ou un serveur depuis le panneau
  « 💾 Data & Model Storage » (ce n'est pas automatique). **Constat honnête** :
  nous n'avons trouvé aucun mécanisme rsync dans `open-easy-web` ; ce qui
  existe réellement, c'est la sauvegarde rsync intégrée à open-english.
- **Google Drive** : avec [rclone](https://rclone.org/drive/), synchronisez le
  dossier de sauvegarde :
  `rclone sync /path/to/backup gdrive:open-english-backup`. **Rien n'est
  synchronisé automatiquement** ; la configuration vous appartient.
- **Hébergement mutualisé / VPS** : tout hôte accessible en SSH (offres avec
  SSH comme Lolipop ou Sakura Internet, VPS comme ConoHa) fonctionne avec
  rsync : `rsync -avz /path/to/backup user@your-vps-host:/backup/open-english/`.

## Mises à jour récentes (2026-08-27)

Déploiement réel sur le VPS (easy-web.tokyo/open-english), explorateur
de dossiers pour choisir les chemins de sauvegarde/stockage, badge
permanent d'état public/privé du réseau avec DuckDNS, panneaux
d'interface repliables, test réel de bout en bout de l'écriture
GitHub/VPS, upload de plans + commentaire IA textuel partagé avec le
nouveau serveur open-cg-cad, test blanc multilingue pour la
certification américaine « Data Scientist », et un nouveau sujet
d'opinion sur l'épargne retraite. Détails complets uniquement dans la
version japonaise.
