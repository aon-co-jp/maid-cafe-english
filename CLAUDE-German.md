# Entwicklungsphilosophie & Umgebungsregeln (open-english)

> **Seit (2026-08-27)**: Freelance-Ecke, Cross-Origin-iframe-Tresor (`vault.html`) für GitHub-Token und Google-Search-Schlüssel, Backup-E-Mail-Login, Bugfixes — siehe CLAUDE.md (Japanisch) für die Einträge vom 2026-08-27.


> **Hinweis**: Dies ist eine kondensierte Übersetzung des aktuellen
> Zustands. Das ausführliche historische HANDOFF-Änderungsprotokoll
> (Dutzende von Einträgen seit 2026-08-10) bleibt aus Gründen der
> Kürze nur auf Japanisch in [CLAUDE.md](CLAUDE.md) verfügbar — siehe
> dort für Details zu einzelnen Sitzungen.

Arbeitslaufwerk: `F:\runo`. Dieser Abschnitt folgt der Praxis, den
entsprechenden Abschnitt aus dem `CLAUDE.md` von
[`open-raid-z`](https://github.com/aon-co-jp/open-raid-z) als
Referenz zu übernehmen und in jedes Projekt zu kopieren. GitHub-Repo:
[aon-co-jp/open-english](https://github.com/aon-co-jp/open-english).

**Entwicklungsbeginn: 2026-08-10.**

## Rolle dieses Projekts

Eine Web-App zum Englischlernen für PC/Tablet/Smartphone. Im Stil
einer "Maid-Café-Englischstunde" begleitet eine magische Maid-Figur
(Originaldesign, animiert) Lernende vom Anfänger bis zum
Fortgeschrittenen. Die KI-Antworten übernimmt
[`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm).

## Architektur (gemäß Nutzeranweisung, 2026-08-10)

- **Linux (VPS)-Seite**: nur ein Download-Verteilserver. Die
  App-Verwaltung übernimmt
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Nutzergerät-Seite**: das statische Web-Frontend dieses Repos +
  ein lokal laufender nativer Server aus `aruaru-llm` (nutzt intern
  die Inferenz-Backends von `open-directx`/`open-cuda`), den der
  Nutzer selbst herunterlädt und ausführt. Der Browser verbindet
  sich lokal (online/offline) mit `http://localhost:4600`.

## Ehrliche Offenlegung / bekannte Einschränkungen (Stand 2026-08-10)

- `aruaru-llm`s `/v1/generate` ist GPT-2 (englischzentriert, kein
  Dialog-Finetuning) — Antwortqualität und Level-Einhaltung sind
  nicht garantiert.
- CORS wurde am 2026-08-10 behoben (`.with_cors()` bei `aruaru-llm`).
- Sprachsynthese (TTS)/Lippensynchronisation für die Trainer-
  Charaktere ist per Web Speech API angebunden; die Animation der
  Maid-Figur selbst ist weiterhin eine einfache CSS-Mundöffnungs-
  schleife.

## Zukunftsvision (gemäß Nutzeranweisung, 2026-08-10, noch nicht begonnen)

Es gibt die Idee, `open-directx`/`open-cuda`/`aruaru-llm` auch
eigenständig im Browser (WASM/WebGPU) laufen zu lassen und mit
`RPoem` (einer GraphQL-Federation-Plattform) zu integrieren. Da dies
eine große architektonische Änderung gegenüber dem aktuellen
Phase-0-Design (lokaler residenter Server + localhost-Verbindung)
bedeutet, wird dies erst nach Abschluss des MVP und mit eigenem
Scope in Angriff genommen.

## Weitere Updates (2026-08-19 bis 2026-08-20)

Seither kamen u. a. hinzu: ein Hinweis bei Erreichen des täglichen
Nutzungslimits mit Hinweisen auf kostenpflichtige Pläne und die
kostenlosen Kontingente anderer Anbieter; ein neues Panel „Data &
Model Storage" mit Backup-/Wiederherstellungs-UI; ein Banner zur
Mobilisierung ungenutzter Smartphones (`PhoneAccelWorker` mit
NNAPI-Erkennung); eine kombinierte rsync-Sicherung für aruaru-db/
PostgreSQL; eine Roadmap-Platzhalterseite für Konsolen-Ports
(PlayStation/Switch/Wii/Wii U, abhängig von der Zustimmung der
Plattformhalter); automatische Updates, erweitert auf alle
mitgelieferten Komponenten (aruaru-llm/aruaru-db) mit
6-Stunden-Intervall-Prüfung und manuellem Downgrade pro Komponente;
ein Fix, der aruaru-llm unter Windows automatisch startet (kein
manueller Schritt mehr nötig); ein Info-Banner zu kostenlosen
Kontingenten von KI-/Suchanbietern (inkl. Claude/Anthropic); ein
kritischer Fix, der den Verlust der Gesprächsdatenbank bei
Windows-Auto-Update/Downgrade verhindert (End-to-End über einen
echten Installer verifiziert); sowie neue Android-Funktionen
(Subnetz-Scan zur automatischen PC-URL-Erkennung, auf einem echten
Snapdragon-Gerät mit erfolgreicher NNAPI-Erkennung verifiziert,
wobei die tatsächliche NNAPI-Rechenauslagerung noch nicht
implementiert ist). Details in den HANDOFF-Einträgen vom 2026-08-19
und 2026-08-20 in [CLAUDE.md](CLAUDE.md).

## Neueste installationsbezogene Updates (2026-08-19)

Vereinheitlichter Windows-Installer `open-english-install.exe`; das
eingebaute Auto-Update (`server/src/self_update.rs`) wurde auf Linux
und dann macOS erweitert, mit automatischem Rollback basierend auf
einem `/healthz`-Health-Check, falls die neue Version nicht korrekt
startet; neue Einstiegsseite `facebook.html` für Nutzer mit reinem
Facebook-Zugang (ehrliche Offenlegung: keine offizielle
Meta-Partnerschaft); und seit 2026-08-18 fördert und automatisiert die
App die Installation von `rsync`, falls es fehlt, und startet
anschließend direkt das Backup. Vollständige Details nur in den
japanischen HANDOFF-Einträgen unten.

*(Hinweis zur maschinellen Übersetzung: Diese Zusammenfassung wurde vom
KI-Agenten selbst übersetzt, ohne Korrekturlesen durch einen
Muttersprachler.)*

---

Weitere Sprachen: [日本語 (Original, mit vollständigem HANDOFF-Verlauf)](CLAUDE.md) ·
[Italiano](CLAUDE-Italian.md) · [Français](CLAUDE-French.md) ·
[Русский](CLAUDE-Russian.md) · [Українська](CLAUDE-Ukrainian.md) ·
[עברית](CLAUDE-Hebrew.md) · [فارسی](CLAUDE-Persian.md)

## Update 2026-08-22: Weltsprachen-Übungsprüfungen, Sprachauswahl, mehrsprachige Wiedergabe

Vor der Umsetzung wurde der Code geprüft: **es existierte bisher keine
Liste unterstützter Übersetzungssprachen und keine i18n-Tabelle**
(`learn-target` kannte nur Englisch/Japanisch). Die Sprachliste wurde
daher mit dieser Funktion neu definiert — **38 Sprachen** (17 europäische
inkl. Rätoromanisch/Schweiz, Russisch, 4 nahöstliche, 7 südasiatische,
8 ost-/südostasiatische, 1 afrikanische) plus Englisch und Japanisch als
stets aktive Standardsprachen.

- Neue Daten: `world-language-exams.json` (Original-Multiple-Choice-Aufgaben
  mit CEFR-artigen Stufen, 3–6 pro Sprache) und `world-language-phrases.json`
  (5 Basissätze × 40 Sprachen).
- Neue API: `GET /v1/world-languages` liefert nur die Übersicht (ohne
  Aufgabentexte). Für die DB-Speicherung wurde **kein** neuer Endpunkt
  angelegt — der bestehende `POST /v1/db/history` genügt.
- UI: zweisprachiges Banner, Panel "🌐 Languages" mit Checkboxen,
  "Alle auswählen" und "Alle außer EN & JA abwählen", Auswahl von
  **2–5 Sprachen** (Grenze in der UI erzwungen), sequentielle Anzeige +
  Vorlesen mit beliebiger Wiederholung (gesamt oder pro Sprache),
  Kopieren, .txt-Download und Speichern in SQLite.
- Nach der Auswertung führen die falschen Aufgaben in das Gespräch mit
  dem Tutor der jeweiligen Sprache (bestehende `examPrepMissedQuestions`-
  Logik wiederverwendet).

**Ehrliche Offenlegung**: Originalaufgaben, keine echten Prüfungsfragen
und ohne Bezug zu offiziellen Zertifikaten; nur 3–6 Aufgaben pro Sprache;
keine muttersprachliche Prüfung der Texte; das tatsächliche Vorlesen in
allen 38 Sprachen wurde mangels installierter Stimmen nicht real
verifiziert (nur mit einem Beobachtungs-Stub). Details siehe HANDOFF vom
2026-08-22 in [CLAUDE.md](CLAUDE.md).

## Regelbasierte Festtext-Antworten zu sensiblen Themen (2026-08-23)

Bei Themen, bei denen falsche Angaben besonders schaden, antwortet die App
**ohne KI-Inferenz** mit von Hand geschriebenem Text. Drei Fälle folgen
demselben Muster: `isCreatorQuestion()` (Vorstellung des Autors),
`isReligionHistoryQuestion()` / `RELIGION_HISTORY_TEXTS` (Islam, Iran,
arabische Welt) und `isMarkOfBeastQuestion()` / `MARK_OF_BEAST_TEXTS`
(666 und das Zeichen des Tieres). Grund: ein blankes GPT-2 erfindet
Inhalte, und gerade bei Religionsgeschichte ist der Schaden hoch. Das
Tageskontingent wird nicht verbraucht; die Texte liegen in einer Tabelle
mit Sprachcode als Schlüssel (derzeit nur `ja` und `en`).

**Neutrale Religionsgeschichte**: beschrieben werden die religiöse Vielfalt
des vorislamischen Arabiens, die Entstehung des Korans als in der Forschung
**eigenständige Überlieferung** (nach islamischer Lehre Offenbarung an
Mohammed), der Unterschied zwischen iranischer und arabischer Kultur sowie
der zoroastrische Einfluss — Letzteres ausdrücklich nur als These einiger
Forschender. Zwei ursprünglich gewünschte Behauptungen (Koran aus einer
Bibelübersetzung; ein Bruder Mohammeds als Übersetzer) wurden **mangels
Quellenbelegen nach mehrfacher Rücksprache weggelassen**; der Text legt
offen, *warum* sie nicht behauptet werden. Eine Anmerkung zu den Grenzen
vormoderner Übersetzungsarbeit bezieht sich **ausschließlich** auf die
historisch belegten arabischen Bibelübersetzungen und darf **nie** mit der
Entstehung des Korans verknüpft werden. Am Ende steht die Botschaft, dass
Übersetzung und mehrsprachiger Austausch zu Verständigung und Frieden
beitragen können.

**666 / Zeichen des Tieres**: die Offenbarungsstelle wird neutral genannt,
ohne eine "richtige" Deutung zu behaupten. Das Wortspiel **"666 = WWW"**
(Gematrie, Waw = 6) wird **nur als Lesart einiger Leute seit den 1990ern**
vorgestellt, nicht als Lehre. Die Geschichte vom versteckten 666 im Barcode
wird **als Großstadtlegende gekennzeichnet** und technisch aufgelöst:
**Guard Bars** markieren Start, Ende und Mitte für den Scanner, ähneln der
Ziffer 6 nur optisch und sind eine andere Kodierung (3 statt 7 Module);
Snopes bewertet die Behauptung als FALSCH — **keine okkulte Bedeutung, keine
technische Grundlage**. Der Schluss ist positiv (Web und Scanner machen das
Einkaufen bequem, **ohne Zeichen am Körper**), und die Python-Fußnote
(Schlangenlogo, Name von Monty Python) wird **ausdrücklich als reiner
Zufall und Wortspiel** gekennzeichnet.

**Ergänzung 2026-08-23 (interessante Parallele — vorstellen, nicht
behaupten)**: Offenbarung 13,16-17 enthält tatsächlich eine Stelle, wonach
niemand ohne das Zeichen kaufen oder verkaufen kann (die Existenz dieser
Bibelstelle darf als Tatsache genannt werden). Hinzugefügt wurde ein Satz,
dass **manche Leute darin eine interessante Parallele sehen** zu der
Tatsache, dass modernes Einkaufen immer stärker auf Barcodes und
Online-Bezahldienste wie Amazon angewiesen ist. **Zwingende Einschränkung**:
nur als Möglichkeit vorstellen ("manche sagen das"), **niemals** behaupten,
eine Prophezeiung habe sich erfüllt — der Text sagt das ausdrücklich selbst.

**Beim Ändern beachten**: Die vier Ehrlichkeitsgarantien — "Vorstellung
statt Behauptung", "Legende ausdrücklich als Legende", "Zufall ausdrücklich
als Zufall" — dürfen weder abgeschwächt noch weggelassen werden.

## Nur Formulierung: leichterer Ton bei "666" (2026-08-23)

Drei Stellen von `MARK_OF_BEAST_TEXTS` wurden **rein sprachlich**
überarbeitet: das Wortspiel "666 = WWW", die Barcode-Legende und der
Nebensatz zu Offenbarung 13,16-17 (niemand kann ohne das Zeichen kaufen
oder verkaufen) neben dem heutigen Einkaufen per Barcode und Amazon. Die
steifen Distanzierungsformeln wurden durch einen wärmeren Ton ersetzt.

- **Vorher**: "… keinesfalls als Behauptung, eine Prophezeiung habe sich
  erfüllt" / JA: 「〜と断定するものではありません」
- **Nachher**: "… eher als nette Trivia denn als harter Beweis" / JA:
  「話のタネとして」「真偽のほどは分かりませんが、こういう見方をすると
  聖書の世界も少し身近に感じられるかもしれません」

**Die Auflagen selbst sind unverändert** und weiterhin einzuhalten:
(1) nichts wird als erfüllte Prophezeiung behauptet; (2) das Barcode-666
bleibt ausdrücklich eine **technisch haltlose Großstadtlegende** (Snopes:
FALSCH; Guard Bars 3 Module statt 7 pro Ziffer); (3) die Ähnlichkeit von
Python-Schlange und "Tier" bleibt **reiner Zufall**; (4) Deutungen werden
nur vorgestellt, nicht gelehrt. Geändert wurde allein der Stil zugunsten
von Lesbarkeit — **keine Aufweichung der Ehrlichkeit**.

## Quizfunktion: Original-Rätsel des Autors (2026-08-23, Fortsetzung 4)

Auf Anfragen wie "Stell mir eine Aufgabe" / "give me a quiz" antwortet die
App mit einem Original-Rätsel des Autors **Masahiro Ishizuka (石塚正浩)**:
`9 ◯ 9 ◯ 9 ◯ 9 = 10` — in die Kreise kommt je eines der Zeichen `+`, `-`,
`×`, `÷` (Wiederholung erlaubt), Klammern ( ) dürfen die Reihenfolge
ändern; Lösung `(9 × 9 + 9) ÷ 9 = 10`. Im Text ist **ausdrücklich**
festzuhalten, dass es sich **nicht um ein Scherz- oder Fangrätsel**
handelt, sondern um **reine Grundrechenarithmetik**, nachprüfbar mit
Taschenrechner oder Abakus. Dazu die Episode, dass die bisher jüngste
richtige Lösung von einem Kind der **ersten Grundschulklasse** kam.

Bausteine (in `app.js`): `isQuizRequest()`, `isQuizAnswerRequest()`,
`QUIZ_TEXTS`, `quizQuestionText()`, `quizAnswerText()`,
`quizPreferredLangCode()` sowie die Zustandsvariable `quizAwaitingAnswer`.
Der Ablauf ist **zweistufig**: zuerst nur die Aufgabe, dann — nach "Ich
weiß es nicht" / "Sag mir die Lösung" — die Antwort; der Flag merkt sich
den Zwischenzustand.

**Warum kein KI-Pfad**: Wie bei den übrigen Festtext-Antworten (Autor,
Religionsgeschichte, 666) läuft dies **ohne KI-Inferenz** über
regelbasierte Verzweigungen. Ein blankes GPT-2 erzeugt beim Rechnen
überzeugend formulierte, aber **falsche** Ergebnisse — bei einer Aufgabe
mit genau einer nachprüfbaren Lösung ist das inakzeptabel. Das
Tageskontingent wird nicht verbraucht.

**Mehrsprachigkeit und ihre bewusste Grenze**: Standard ist die
zweisprachige Ausgabe JA + EN; bei Lern- oder Muttersprache es/fr/de/zh/ko
wird die jeweilige Übersetzung vorangestellt. Übersetzungen existieren nur
für diese **sieben Sprachen** (ja/en/es/fr/de/zh/ko). Die 130 unterstützten
Sprachen wurden **absichtlich nicht** maschinell aufgefüllt, um "alle
Sprachen unterstützt" vorzutäuschen; nicht erfasste Sprachen erhalten die
japanisch-englische Standardausgabe. Diese Grenze ist beim Ändern
beizubehalten und offenzulegen.

## Virtuelle Hochschule / virtuelle Online-Berufsschule (2026-08-24)

Auf Nutzeranweisung wurde eine **virtuelle Hochschule** (Fachschule, Junior
College, Universität, Graduiertenschule) und eine **virtuelle Online-Berufsschule**
ergänzt: Kategorie wählen → Fachgebiet installieren → Zufallsfragen → Auswertung.

- Das Design übernimmt **unverändert das Muster des bestehenden Nachhilfekurses**
  (`TUTOR_*`); es wurden **keine neue API, kein neuer Speicherort und keine neue
  Tabelle** eingeführt. Ergebnisse gehen an das bestehende `POST /v1/db/history`.
  Code: `VSCHOOL_*` / `vschool*` am Ende von `app.js`, UI `#vschool-modal` in
  `index.html`. Zwei Schaltflächen öffnen **dieselbe Modalbox** in zwei Modi.
- **Vorab-Recherche (2026-08-24, japanische Websuche)**: Bei Auswahlverfahren an
  Universitäten, Junior Colleges und Fachschulen dominieren Aufsatz (mit
  Textvorlage, Themenstellung oder Datenanalyse) und Auswahlgespräch; der Aufsatz
  folgt üblicherweise dem Dreischritt Einleitung–Hauptteil–Schluss. Bei
  Graduiertenschulen zählen Forschungsplan, Literaturüberblick, Fachprüfung und
  Gespräch. Die öffentliche Berufsausbildung deckt u. a. IT, Vertrieb, Pflege, Bau,
  Kosmetik und Gastronomie ab. **Diese allgemeinen Tendenzen begründen nur die
  Einteilung; alle Fragetexte sind selbst verfasst.**
- **Umgesetzt (7 Fachgebiete, je 5 Fragen)**: Universität = Geistes-/Sozial-
  wissenschaften und Naturwissenschaften/Technik; Fachschule = Informationstechnik;
  Graduiertenschule = Forschungsgrundlagen; Berufsschule = IT-/Programmiergrundlagen,
  Buchhaltung, Kundenservice.
- **Nicht umgesetzt, ehrlich als „noch nicht bereit“ ausgewiesen**: Medizinische
  Verwaltung, Pflege, Kosmetik, Kochen, Bauwesen, **alle vier Fachgebiete des Junior
  College**, Medizin/Pflegewissenschaft, Pädagogik, technische Graduiertenfächer sowie
  Pflege-, Bau-, Koch- und Kosmetikgrundlagen in der Berufsschule.
- **Ehrliche Offenlegung (nicht abschwächen)**: keine Übernahme echter Prüfungsfragen;
  Aufsatz, Gespräch und Praxis werden nur als Multiple-Choice angenähert; keine Aussage
  über echte Zulassungen oder Abschlüsse.
- **YouTube**: nur Links auf **Suchergebnisseiten** zu allgemeinen Stichwörtern, mit
  entsprechendem Hinweis. **Kein bestimmtes Video wird als richtig dargestellt.**
- **Praxistest (drei Runden TEST → Verbesserung → erneuter TEST)**: Server gestartet
  (`http://127.0.0.1:4601/`), im Browser beide Modi vollständig durchlaufen (3/3 bei
  korrekten Antworten, 0/3 mit Anzeige unbeantworteter Fragen), Wiederherstellung aus
  dem `localStorage` nach Neuladen, Zurücksetzen beim Moduswechsel, Hinweis bei einer
  Kategorie ohne Inhalte sowie die Schaltfläche „mit der Trainerin wiederholen“ geprüft.
  Zwei Zeilen `[virtual-school] …` wurden tatsächlich in `/v1/db/history` gespeichert.
  Keine JavaScript-Fehler.
- Vollständige Fassung: HANDOFF-Eintrag vom 2026-08-24 in [CLAUDE.md](CLAUDE.md).

## DUAL-DB-Selbstheilung, PostgreSQL-TLS, HTTP HEAD, `/health` (2026-08-24, Fortsetzung)

Vier kleinere, aber wichtige Ergänzungen zur bestehenden DUAL-DB-Funktion
(gleichzeitiges Schreiben in SQLite + optionalen PostgreSQL/aruaru-db-Mirror):

1. **Selbstheilung (Outbox-Retry)**: Ein Mirror-Schreibvorgang, der fehlschlägt,
   wird jetzt in eine lokale SQLite-Tabelle `mirror_outbox` eingereiht und von
   einem Hintergrundtask automatisch erneut versucht (standardmäßig alle 60
   Sekunden, bis zu 100 Versuche). Zeilen, die weiterhin scheitern, werden als
   `give_up` markiert statt stillschweigend verworfen zu werden; die Zähler
   `mirror_outbox_pending`/`mirror_outbox_given_up` sind über `GET /v1/db/info`
   abrufbar. Dies schließt die in der Session vom 2026-08-24 (DUAL DB, siehe
   [CLAUDE.md](CLAUDE.md)) unter Punkt 6(a) offen gelassene Lücke, bleibt aber
   selbst mit einer ehrlichen Grenze behaftet: erfasst werden nur Schreibvorgänge,
   die dieser Prozess selbst versucht und dabei verloren hat — nicht Zeilen, die
   während einer Downtime direkt am Mirror verändert wurden. Da die Retries
   einfache INSERTs sind, ist ein seltenes at-least-once-Duplikat möglich.
2. **TLS für die PostgreSQL-Mirror-Verbindung**: neue Abhängigkeit
   `tokio-postgres-rustls` erlaubt `sslmode=require`/`verify-ca`/`verify-full`
   gegen verwaltete PostgreSQL-Instanzen; `sslmode=disable` (Standard) bleibt
   unverändert im Klartext. Root-Zertifikate kommen aus dem
   Betriebssystem-Vertrauensspeicher (rustls-native-certs, mit webpki-roots als
   Fallback). Ein Notausgang `OPEN_ENGLISH_DB_TLS_INSECURE=1` deaktiviert die
   Zertifikatsprüfung — mit deutlicher Warnung im Log, anfällig für
   Man-in-the-Middle-Angriffe, nur für vertrauenswürdige geschlossene Netzwerke
   gedacht. Damit ist der in der DUAL-DB-Session unter 6(b) genannte Punkt
   „TLS bleibt unimplementiert" erledigt.
3. **HTTP-HEAD-Unterstützung**: Der statische Dateiserver beantwortete `HEAD`
   bisher mit 404/405; das betrifft in der Praxis viele HTTP-Clients und
   Health-Check-Werkzeuge, die standardmäßig mit HEAD prüfen. Behoben durch
   Hinzufügen von `MethodRouter::head` zur gemeinsamen `RPoem`-Fassade
   (`open-runo-poem-compat`) — rein additiv, keine bestehende Route wurde
   verändert.
4. **`/health`-Alias**: liefert denselben Inhalt wie das bestehende `/healthz`
   (`{"ok":true}`), damit die Namensgebung zu dem passt, was das
   „Bunshin-no-jutsu"-Mieter-Registrierungsmuster anderer Repos in diesem
   Ökosystem (open-web-server / open-easy-web) generisch erwartet. **Das ist
   keine Behauptung, dass open-english bereits über open-web-server
   ausgeliefert wird** — nur eine Vorbereitung für Interoperabilität.
5. `GET /v1/db/info` liefert außerdem `rsync_available` (eine echte
   `rsync --version`-Prüfung), um vor `/v1/db/rsync-backup` zu erkennen, ob
   rsync überhaupt vorhanden ist.
6. **Verifiziert**: `cargo build`/`cargo test` (18/18 grün) sowie echte HTTP-
   Prüfungen gegen eine laufende Binärdatei (`HEAD /`, `HEAD /app.js`, `GET
   /health`, `GET /v1/db/info`).

*(Hinweis zur maschinellen Übersetzung: dieser Abschnitt wurde vom KI-Agenten
selbst übersetzt, ohne Korrekturlesen durch einen Muttersprachler.)*


## Karriereorientierung im Nachhilfekurs nach Klassenstufe (2026-08-24, Fortsetzung 2)

Der Übungsbildschirm zeigt jetzt für jedes Fach (Japanisch, Rechnen,
Naturwissenschaften, Sozialkunde, Englisch, Programmieren, Sachkunde)
eine „Karriereorientierung"-Box mit Branchen/Berufen, denen das Fach
nützlich sein könnte, sowie fortgeschrittenen Berufen, die durch weitere
Vertiefung erreichbar sein könnten. Das Design basiert auf einer echten
Recherche zum deutschen dualen Ausbildungssystem (Berufsschule,
IHK-Abschlüsse, Ausbildung — Quellen: IHK Darmstadt, deutschland.de,
Wikipedia). Formulierungen stets vorsichtig („könnte helfen"), niemals
ein Versprechen auf einen garantierten Arbeitsplatz. Umfang: Fachebene,
nicht jede einzelne Frage; live getestet (Server gestartet, Klasse 3
Mathematik installiert, Anzeige korrekt bestätigt). Vollständige Details
nur in der japanischen Version von CLAUDE.md.

**Update (Fortsetzung, 2026-08-24)**: Career-Guidance auf die virtuelle
Schule/Berufsschule (`VSCHOOL_FIELDS`, 23 Bereiche) erweitert. Dringender
Bugfix: weißer Text auf weißem Hintergrund an mehreren Stellen
(Chat-Eingabe, Sprachpanels) durch hellen Hintergrund ohne explizite
Textfarbe im dunklen Theme — mit expliziten Textfarben behoben.
Uneinheitliche Schriftgrößen zwischen japanischem Text und lateinischen
Labels (z. B. "JP", "(default / 既定)") vereinheitlicht. Veralteter Text
zur TLS-Unterstützung der Datenbank korrigiert, um die tatsächlich
implementierte TLS-Unterstützung (`tokio-postgres-rustls`) widerzuspiegeln,
mit ehrlichem Hinweis, dass dies mangels cargo/psql/Docker auf dieser
Maschine nicht getestet werden konnte.

**Update (Fortsetzung 6, 2026-08-24)**: Zweisprachige (Japanisch/Englisch)
Zitate/Sprichwörter in allen drei bestehenden Karriereberatungsfeldern
ergänzt, außerdem eine Motivationsbotschaft (als Hoffnung, nicht als
Garantie formuliert) mit dem Wunsch, dass Lernende eine Anstellung finden
und sich überall behaupten können, sowie ein neues Fach „Communication &
Questioning Skills" (Mittel-/Oberstufe), das echte englische Redewendungen
für konstruktive hypothetische Diskussionen, konstruktives Feedback und
die Bedeutung von „mutig, aber taktvoll" vermittelt. Live getestet
(Server gestartet, Browser). Vollständige Details nur in der japanischen
Version von CLAUDE.md.

**Update (Fortsetzung 8, 2026-08-24)**: „world-lab" Phase 2 implementiert
— geteilte Rechenleistung ungenutzter CPU/GPU/NPU über eine WASM-Sandbox
(standardmäßig deaktiviert, ohne Bezahlung). Beim echten Testen wurde ein
kritischer Fehler entdeckt: die Fuel-Grenze, die außer Kontrolle
geratenen Gast-Code stoppen soll, brachte stattdessen den gesamten
Serverprozess zum Absturz. Behoben durch Ausführung in einem isolierten
Kindprozess — ein echter Angriffsversuch (Endlosschleife) ließ den
Kindprozess abstürzen, während der Hauptserver unbeeinflusst weiterlief,
was per HTTP nachgewiesen wurde. Keine Weiterleitungsfunktion für
fremden Datenverkehr wurde hinzugefügt. Vollständige Details nur in der
japanischen Version von CLAUDE.md.

**Update (Fortsetzung 9, 2026-08-24)**: verbleibende world-lab-Aufgaben
angegangen. UI-Panel hinzugefügt und live getestet (Pairing, Geräteliste,
WASM-Aufgabenausführung). Nebenläufigkeit/Warteschlange begrenzt
(Semaphore + Zähler), um Ressourcenerschöpfung des Serverprozesses durch
Anfrageflut zu verhindern. Bei einer erneuten Sicherheitsprüfung ein
weiteres Loch gefunden: der Anfragetext wurde vollständig gelesen, bevor
die Größenbegrenzung griff — jetzt im Stream begrenzt (mit echtem HTTP-
Test einer 5-MB-Nutzlast bestätigt, die sofort mit 413 abgelehnt wird).
Wasmtime-Versionswechsel (21→27) reproduzierte denselben Absturz,
bestätigt Prozessisolation als notwendige Maßnahme unabhängig von der
Ursache. Mehrgeräteverifikation blieb auf simulierte Geräte über echtes
HTTP auf derselben Maschine beschränkt (kein zweites physisches Gerät
verfügbar). Vollständige Details nur in der japanischen Version von
CLAUDE.md.

**Update (2026-08-25, Fortsetzung, Deutsch):** Gerätetyp/selbst gemeldete
CPU/GPU/NPU-Fähigkeit zum Pairing hinzugefügt, Microsoft/GitHub Copilot
als Link-Einträge ergänzt, Formular-Vorausfüllung (mit bewusst
beibehaltener Sicherheitsgrenze — Pairing erfordert weiterhin immer ein
Token), ein „wan"-Verbindungslabel hinzugefügt, aber **automatisches
Öffnen von Ports (UPnP) bewusst abgelehnt** (UPnP ist selbst ein
altbekannter Angriffsvektor für Router — der Server bleibt standardmäßig
auf 127.0.0.1 beschränkt, WAN-Exposition erfordert explizite manuelle
Konfiguration von `OPEN_ENGLISH_SERVER_BIND`). Außerdem zwei
Test-Flakes (racende Umgebungsvariablen in parallelen Tests) in
`local_agent.rs` und `vps_agent.rs` gefunden und behoben. Vollständige
Details nur in der japanischen Version von CLAUDE.md.

**Update (2026-08-25, Fortsetzung 2, Deutsch):** Massen-Pairing
hinzugefügt (`POST /v1/world-lab/pair/bulk`) für Büros/große Filialen
mit vielen PCs/Tablets/Handys — Gerätenamen zeilenweise einfügen, alle
in einer Aktion pairen. Grundprinzip unverändert: erfordert weiterhin
das korrekte Token, jeder Eintrag durchläuft dieselbe Validierung wie
ein Einzel-Pairing; ein fehlgeschlagener Eintrag verwirft nicht die
erfolgreichen anderen (Stapelgrößenlimit 100). Verifiziert mit 30
simulierten Büro-PCs in einer Anfrage sowie live im Browser. Vollständige
Details nur in der japanischen Version von CLAUDE.md.

## Multi-LLM-Anbieter-Priorität (2026-08-26)

Neben Google Search können jetzt ChatGPT (OpenAI), DeepSeek, Gemini und
Claude (Anthropic) einzeln oder gleichzeitig aufgerufen werden (Hauptteil
in `aruaru-llm`: `chat_providers.rs` / `provider_priority.rs`). Das neue
Panel "🔀 AI Provider Priority" erlaubt "kostenlose Kontingente der Reihe
nach aufbrauchen" — die Reihenfolge der 5 Dienste kann per Zahleneingabe
oder nummerierten Radiobuttons geändert werden (Duplikate werden per
Tausch aufgelöst). API-Schlüssel werden nur im lokalen Speicher dieses
Browsers gespeichert und beim Speichern an die eigene aruaru-llm-Instanz
als Laufzeiteinstellung gesendet (nie auf Festplatte geschrieben, gleiche
Richtlinie wie bei Google Search). Sicherheitsüberprüfung: Gemini-Schlüssel
läuft jetzt über den Header `x-goog-api-key` statt Query-String; ein
Prompt-Längenlimit (20.000 Zeichen) wurde eingeführt, um versehentliche
hohe API-Kosten zu vermeiden. Live verifiziert: Browser-UI → Einstellung
auf aruaru-llm angewendet → echte HTTP-Anfrage an die Anthropic-API.
Vollständige Details nur in der japanischen Version von CLAUDE.md
(2026-08-26 HANDOFF).

## Genauigkeit der Suchkontext-Nutzung — Aufgabe für nächstes Mal (2026-08-26)

Es ist korrekt, dass die KI-Antwort Google-Suchergebnisse widerspiegelt,
wenn "🔎 Google search boost" aktiv ist — die Suchergebnisse werden
tatsächlich vor den Prompt eingefügt. Die bestehende Einschränkung
bleibt jedoch bestehen: kleine GPT-2-Modelle (ohne Instruction-Tuning)
garantieren keine korrekte Nutzung dieses Kontexts. Aufgabe für die
nächste Sitzung: untersuchen, ob technische Verbesserungen über Rust +
RPoem + open-directx/open-cuda + aruaru-llm dies verringern können.
Wichtig: `open-directx`/`open-cuda` sind Geschwindigkeits-Infrastruktur
für GPU-Inferenz, nicht Genauigkeits-Infrastruktur — dieser Unterschied
muss bei der Untersuchung beachtet werden. Noch nichts untersucht oder
umgesetzt; vollständige Details nur in der japanischen Version von
CLAUDE.md und in `aruaru-llm/CLAUDE.md`.

**Update (2026-08-27)**: Echtes Deployment auf dem VPS
(easy-web.tokyo/open-english), Ordner-Browser (Explorer) zur Auswahl von
Backup-/Speicherpfaden, dauerhaftes Öffentlich/Privat-Netzwerkstatus-
Badge mit DuckDNS-Unterstützung für eine eigene Domain, einklappbare
UI-Panels (Haftungsausschluss, Banner für ungenutzte Smartphones, Banner
für Weltsprachen, Einstellungsleiste), echter End-to-End-Test des
GitHub-/VPS-Schreibzugriffs über den Agent, Zeichnungs-Upload +
textbasierter KI-Kommentar gemeinsam mit dem neuen open-cg-cad-Server
(Halbleiter/Automobil/Gebäude, nur eigene Dateien, keine Bildanalyse —
aruaru-llm verarbeitet nur Text), mehrsprachiger (8 weitere Sprachen)
Übungstest für die US-Zertifizierung „Data Scientist“, sowie ein neues
Meinungsthema zu Fragen über Altersvorsorge / das „20-Millionen-Yen-
Problem“. Vollständige Details nur in der japanischen Version von
CLAUDE.md.
