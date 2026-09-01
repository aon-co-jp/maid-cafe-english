# open-english

> 📌 **Update (2026-08-27)**: Eine „Freelance-Ecke“ hinzugefügt (100 Sprachen, Jobsuche-Links, Übergabe an die KI-Lehrerin), ein Cross-Origin-iframe-Tresor (`vault.html`), der das GitHub-Token und den Google-Search-API-Schlüssel von der Hauptseite isoliert, eine zweite Backup-E-Mail-Adresse für den Login sowie eine Chrome-Inkognito-Start-Verknüpfung. Zwei echte, durch Live-Browser-Tests gefundene Fehler (veralteter Schlüssel-Leak, irreführende Statusanzeige im Tresor-Modus) wurden behoben. Details in den Einträgen vom 2026-08-27 in CLAUDE.md (Japanisch).


> 📌 **Neuestes Update (2026-08-26, Fortsetzung 2, Aufgabe für nächstes
> Mal notiert):** Es stimmt, dass die KI-Antwort Google-Suchergebnisse
> widerspiegelt, wenn der Suchboost aktiv ist — die bestehende
> Einschränkung bleibt jedoch bestehen: kleine GPT-2-Modelle
> garantieren keine korrekte Nutzung dieses Suchkontexts. Es wurde
> eine Aufgabe notiert, in der nächsten Sitzung zu untersuchen, ob
> technische Verbesserungen über Rust + RPoem + open-directx/open-cuda
> + aruaru-llm diese Einschränkung verringern können (noch nichts
> untersucht oder umgesetzt). Details siehe CLAUDE.md.

> 📌 **Update (2026-08-26, Fortsetzung): GitHub/YouTube-Suche +
> Hinweis auf aufgebrauchtes Kontingent + API-Schlüssel-Links + Abfrage
> zum lokalen Datenbank-Speichern.** Das Panel "🔀 AI Provider Priority"
> hat jetzt Kontrollkästchen für Google-, GitHub- (Token optional) und
> YouTube-Suche (API-Schlüssel nötig) — Suchergebnisse werden jetzt bei
> jeder Chat-Nachricht tatsächlich in den Prompt eingefügt (dies behebt
> eine Lücke, bei der die Funktion zuvor nie in den echten
> Konversationsablauf eingebunden war). Wenn alle konfigurierten
> Anbieter ihr Tageskontingent aufgebraucht haben, zeigt die App
> zweisprachig „Heutiges kostenloses Kontingent aufgebraucht" und
> wechselt automatisch zur lokalen KI; ein bezahlter Anbieter läuft
> automatisch weiter. Direktlinks zu den API-Schlüssel-Seiten hinzugefügt.
> Bei der heruntergeladenen PC-Version wird jetzt zweisprachig gefragt,
> ob der Schlüssel auch in der lokalen Datenbank gespeichert werden soll.
> Details siehe CLAUDE.md.

> 📌 **Update (2026-08-26): Multi-LLM-Anbieter-Priorität.**
> Neben der Google-Suche können jetzt ChatGPT (OpenAI), DeepSeek, Gemini
> und Claude (Anthropic) einzeln oder gleichzeitig aufgerufen werden. Das
> neue Panel „🔀 AI Provider Priority" erlaubt es, „kostenlose Kontingente
> der Reihe nach aufbrauchen" zu aktivieren — die Reihenfolge der 5 Dienste
> kann per Zahleneingabe oder nummerierten Radiobuttons festgelegt werden.
> API-Schlüssel werden nur im lokalen Speicher dieses Browsers gespeichert
> und als Laufzeiteinstellung an die eigene aruaru-llm-Instanz gesendet
> (nie dort auf Festplatte geschrieben). Live über echte HTTP-Anfragen an
> Anthropic verifiziert. Details siehe CLAUDE.md.

> 📌 **Update (2026-08-25, Fortsetzung 2): Massen-Pairing hinzugefügt.** Neue Funktion für Büros/große Filialen mit vielen PCs/Tablets/Handys — Gerätenamen zeilenweise einfügen und alle in einer Aktion pairen. Das Grundprinzip bleibt unverändert: erfordert weiterhin das korrekte Token und explizites Handeln, jeder Eintrag durchläuft dieselbe Validierung wie ein einzelnes Pairing. Details siehe CLAUDE.md.

> 📌 **Update (2026-08-25, Fortsetzung): „wan"-Verbindungslabel hinzugefügt,
> automatisches Port-Öffnen (UPnP) bewusst abgelehnt.** UPnP ist selbst ein
> altbekannter Router-Angriffsvektor — der Server bleibt standardmäßig auf
> 127.0.0.1 beschränkt; WAN-Exposition erfordert explizite manuelle
> Konfiguration. Details siehe CLAUDE.md.

> 📌 **Neuestes Update (2026-08-25): world-lab unterstützt jetzt
> Gerätetyp/selbst gemeldete Hardware-Fähigkeit (CPU/GPU/NPU) +
> Verknüpfungen zu verwandten Werkzeugen, automatisches Vorausfüllen des
> Formulars (mit bewusst beibehaltener Sicherheitsgrenze), und ein
> gefundener/behobener Test-Flake.** Beim Pairing kann jetzt ein
> Gerätetyp (📱Telefon/📲Tablet/🖥PC/❓Sonstiges) und eine selbst gemeldete
> Hardware-Fähigkeit angegeben werden — unverifiziert, echte
> GPU/NPU-Dispatch an entfernte Geräte (z. B. ungenutzte Büro-PCs) bleibt
> **nicht implementiert** (Entwurf im CLAUDE.md-Abschnitt „Zukunftsvision"
> festgehalten, aber ohne dieselbe Sicherheitsstrenge wie die
> WASM-Sandbox aus Phase 2 bewusst nicht gebaut). Microsoft/GitHub
> Copilot wurden als reine Link-Einträge hinzugefügt (kein API-Zugriff).
> Das Formular füllt sich beim Öffnen automatisch mit Vermutungen zu
> Gerätetyp/GPU — **Pairing selbst erfordert weiterhin immer ein
> explizites Token und einen Klick**, um die Anti-Relay-Grenze zu
> wahren. Details siehe CLAUDE.md, Eintrag 2026-08-25.

> 📌 **Update (2026-08-24, Fortsetzung 9): verbleibende world-lab-
> Aufgaben angegangen — UI-Anbindung, Nebenläufigkeitsbegrenzung,
> prozessübergreifende E2E-Tests, Ursachenforschung.** Neues Panel „🌐
> world-lab" (Status, Geräte-Pairing, WASM-Aufgaben-Ausführung) live im
> Browser getestet. Nebenläufigkeit und Warteschlangenlänge sind jetzt
> begrenzt (`tokio::sync::Semaphore` + `AtomicUsize`), um zu verhindern,
> dass eine Flut von Anfragen den Serverprozess selbst erschöpft. Bei einer
> erneuten Sicherheitsprüfung wurde ein weiteres Loch gefunden und
> behoben: der Anfragetext wurde vollständig gelesen, **bevor** die
> Größenbegrenzung geprüft wurde — jetzt wird er im Stream begrenzt.
> Ein Versionswechsel auf wasmtime 27.0.0 reproduzierte denselben Absturz,
> was bestätigt, dass es sich nicht um einen versionsspezifischen Fehler
> handelt (die Prozessisolation bleibt notwendig). Mehrgeräteverifikation
> war auf simulierte Geräte über echtes HTTP (alle vier Verbindungsarten)
> auf derselben Maschine beschränkt, da kein zweites physisches Gerät zur
> Verfügung stand. Details siehe CLAUDE.md, Eintrag 2026-08-24 (Fortsetzung 9).

> 📌 **Update (2026-08-24, Fortsetzung 8): „world-lab" Phase 2 —
> WASM-Sandbox-Rechenaufgaben, plus ein kritischer Absturz gefunden und
> per Prozessisolation behoben.** Ungenutzte Rechenkapazität (CPU/GPU/NPU)
> alter Smartphones/Tablets/PCs kann jetzt experimentell und standardmäßig
> deaktiviert für beliebige Berechnungen in einer WASM-Sandbox geteilt
> werden (`POST /v1/world-lab/task/run`), ohne Bezahlung — reine
> gegenseitige Hilfe. **Beim echten Testen stellte sich heraus, dass die
> Fuel-Grenze (Befehlszähler), die eigentlich außer Kontrolle geratenen
> Gast-Code stoppen sollte, stattdessen den gesamten Serverprozess zum
> Absturz bringen konnte** — der Sicherheitsmechanismus selbst war ein
> Denial-of-Service-Loch mit nur einer Anfrage. Die WASM-Ausführung läuft
> jetzt in einem **isolierten Kindprozess**; ein echter HTTP-Test bestätigt,
> dass eine Endlosschleife diesen Kindprozess zum Absturz bringt, während
> der Hauptserver überlebt und weiterhin korrekt bedient. Es wurde weiterhin
> keine Weiterleitungsfunktion für fremden Datenverkehr implementiert
> („niemals ein Relay" bleibt bestehen). Details siehe CLAUDE.md, Eintrag
> vom 2026-08-24 (Fortsetzung 8).

> 📌 **Update (2026-08-24, Fortsetzung 2): „Karriereorientierung" im
> Nachhilfekurs nach Klassenstufe hinzugefügt.** Der Übungsbildschirm zeigt
> jetzt pro Fach, welchen Branchen/Berufen dieser Lernstoff nützlich sein
> könnte und welche fortgeschrittenen Berufe man durch weiteres Vertiefen
> anstreben könnte — stets vorsichtig formuliert („könnte helfen", nie ein
> Versprechen auf einen Arbeitsplatz). Das Design orientiert sich an einer
> echten Recherche zum deutschen dualen Ausbildungssystem (Berufsschule,
> IHK-Abschlüsse, Ausbildung). Details und Quellen siehe CLAUDE.md.

> 📌 **Neuestes Update (2026-08-24, Fortsetzung 6): Zitate/Sprichwörter +
> Motivationsbotschaft + neues Fach „Communication & Questioning
> Skills"**: Jedes Karriereberatungsfeld zeigt nun ein zweisprachiges
> Zitat/Sprichwort (Deutsch/Englisch, z. B. „Strike while the iron is
> hot") sowie eine zurückhaltend formulierte Motivationsbotschaft (keine
> Garantie), die die Hoffnung ausdrückt, dass Lernende eine Anstellung
> finden, den Beruf wechseln und sich überall behaupten können. Ein neues
> Fach (Mittel-/Oberstufe) vermittelt echte englische Redewendungen für
> konstruktive hypothetische Diskussionen und konstruktives Feedback.
> Details in CLAUDE.md.

> 📌 **Neuestes Update (2026-08-24, Fortsetzung): Selbstheilung bei DUAL DB
> (automatischer Outbox-Retry) + TLS-Unterstützung für die PostgreSQL-Verbindung
> + HTTP-HEAD-Unterstützung**:
> - **Selbstheilung bei DUAL DB**: Was bisher als „nicht implementiert" dokumentiert
>   war, ist jetzt umgesetzt. Ein fehlgeschlagener Mirror-Schreibvorgang wird in eine
>   lokale SQLite-Tabelle `mirror_outbox` eingereiht und automatisch von einem
>   Hintergrundtask erneut versucht (standardmäßig alle 60 Sekunden). Zeilen werden
>   standardmäßig bis zu 100-mal erneut versucht; Zeilen, die weiterhin scheitern,
>   werden nicht stillschweigend verworfen — sie erhalten den Status `give_up`, und
>   die Anzahl ist über `GET /v1/db/info` (`mirror_outbox_pending`/
>   `mirror_outbox_given_up`) einsehbar. **Ehrliche Grenzen**: Erfasst werden nur
>   Schreibvorgänge, die dieser Prozess selbst versucht hat und die fehlgeschlagen
>   sind — Zeilen, die direkt am Mirror gelöscht wurden, oder Änderungen über einen
>   anderen Weg, können nicht erkannt werden. Die Retries sind einfache INSERTs,
>   daher ist ein seltenes at-least-once-Duplikat möglich.
> - **TLS-Unterstützung**: `tokio-postgres-rustls` wurde hinzugefügt, sodass die
>   PostgreSQL-Mirror-Verbindung nun `sslmode=require` usw. gegen eine verwaltete
>   Datenbank verwenden kann (`sslmode=disable`, der Standard, belässt das
>   bisherige Klartextverhalten unverändert). Root-Zertifikate stammen aus dem
>   Betriebssystem-Vertrauensspeicher (rustls-native-certs, Fallback webpki-roots).
>   Ein Notausgang `OPEN_ENGLISH_DB_TLS_INSECURE=1` deaktiviert die
>   Zertifikatsprüfung (mit deutlicher Warnung, anfällig für MITM-Angriffe, nur für
>   vertrauenswürdige geschlossene Netzwerke gedacht).
> - **HTTP-HEAD-Unterstützung**: Der statische Dateiserver beantwortet `HEAD`-
>   Anfragen jetzt korrekt (früher 404/405, was in der Praxis relevant war, da
>   viele HTTP-Clients und Health-Check-Tools mit HEAD anfragen). Dafür wurde
>   `MethodRouter::head` zur gemeinsam genutzten `RPoem`-Fassade
>   (`open-runo-poem-compat`) hinzugefügt — rein additiv, keine bestehende API
>   wurde verändert.
> - **Neuer `/health`-Alias**: zusätzlich zum bestehenden `/healthz` eingeführt,
>   damit die Health-Check-Namensgebung dieser App zu dem passt, was andere Repos
>   im „Bunshin-no-jutsu"-Mieter-Registrierungsmuster dieses Ökosystems
>   (open-web-server / open-easy-web) generisch erwarten.
> - `GET /v1/db/info` meldet jetzt zusätzlich `rsync_available` (eine echte
>   `rsync --version`-Prüfung), damit man vor `/v1/db/rsync-backup` prüfen kann, ob
>   rsync überhaupt nutzbar ist.
> - Verifiziert mit `cargo build`/`cargo test` (18/18 grün) sowie einer echten
>   laufenden Binärdatei: `HEAD /` und `HEAD /app.js` liefern die korrekten
>   Content-Length/Content-Type-Header mit leerem Body, `GET /health` liefert
>   `{"ok":true}`, und `GET /v1/db/info` enthält `rsync_available`.

> 📌 **Neuestes Update (2026-08-24): virtuelle Hochschule und virtuelle
> Online-Berufsschule**:
> - **🏫 Virtuelle Hochschule** bietet vier Kategorien — Fachschule (senmon gakko),
>   Junior College, Universität (Bachelor) und Graduiertenschule. Man wählt darin
>   Fachgebiete aus, installiert sie und erhält **selbst verfasste Übungsfragen**,
>   die Aufnahmeprüfungen, Vorlesungen und Klausuren nachempfinden, samt Auswertung.
> - **🛠 Virtuelle Berufsschule** funktioniert genauso für Branchen und Berufe.
> - **Sieben Fachgebiete funktionieren derzeit wirklich, mit je fünf Fragen**:
>   Universität = Geistes-/Sozialwissenschaften und Naturwissenschaften/Technik;
>   Fachschule = Informationstechnik; Graduiertenschule = Forschungsgrundlagen
>   (Forschungsplan, Forschungsethik, Auswahlgespräch); Berufsschule = IT-/
>   Programmiergrundlagen, Buchhaltungsgrundlagen, Grundlagen des Kundenservice.
> - **Alles Übrige zeigt ehrlich „noch nicht bereit“** (Medizinische Verwaltung,
>   Pflege, Kosmetik, Kochen, Bauwesen, **alle vier Fachgebiete des Junior College**,
>   Medizin/Pflegewissenschaft, Pädagogik u. a.). Jede Kategorie-Schaltfläche zeigt
>   „N von M Fachgebieten verfügbar“, sodass der Umfang vorab erkennbar ist.
> - Zu jedem Fachgebiet gibt es einen Link auf eine **YouTube-Suchergebnisseite** mit
>   einem allgemeinen Suchbegriff. **Kein bestimmtes Video wird als richtig empfohlen.**
> - **Ehrliche Offenlegung**: Alle Fragen sind Eigenentwicklungen; nichts stammt aus
>   echten Aufnahmeprüfungen, Lehrbüchern oder kommerziellen Übungsbänden. **Aufsätze,
>   Auswahlgespräche und praktische Fertigkeiten werden nur als Multiple-Choice-
>   Wissensfragen angenähert** und ersetzen kein echtes Aufsatz-Feedback und kein
>   Bewerbungstraining. Die Punktzahl sagt nichts über echte Zulassungen aus.
> - Ergebnisse werden über den bestehenden Verlaufs-Endpunkt (`/v1/db/history`)
>   gespeichert; es wurde keine neue API hinzugefügt.

> 📌 **Neuestes Update (2026-08-23, Fortsetzung 4)**: **Quizfunktion mit
> einem Original-Rätsel des Autors**. Wer "Stell mir eine Aufgabe",
> "Gib mir ein Quiz" oder "give me a quiz" schreibt, bekommt ein
> Original-Rätsel von **Masahiro Ishizuka (石塚正浩)**, dem Autor dieser
> App: Setze zwischen **vier Neunen** — `9 ◯ 9 ◯ 9 ◯ 9 = 10` — jeweils
> eines der Zeichen `+`, `-`, `×`, `÷` ein (dasselbe Zeichen darf
> mehrfach vorkommen); bei Bedarf dürfen Klammern ( ) die Reihenfolge
> ändern. Ergebnis soll **genau 10** sein. Die Lösung lautet
> `(9 × 9 + 9) ÷ 9 = 10` (9×9=81, 81+9=90, 90÷9=10). Das ist
> **kein Scherz- oder Fangrätsel**, sondern **reine Grundrechenarithmetik**,
> die sich mit Taschenrechner oder Abakus nachrechnen lässt. Übrigens: die
> bisher jüngste Person, die es richtig gelöst hat, war ein Kind in der
> **ersten Klasse der Grundschule**. Der Ablauf ist **zweistufig** —
> zuerst erscheint nur die Aufgabe, und erst wenn man "Ich weiß es nicht"
> oder "Sag mir die Lösung" schreibt, wird die Antwort gezeigt.
> **Mehrsprachigkeit und ihre ehrliche Grenze**: Standard ist die
> zweisprachige Ausgabe Japanisch + Englisch; wer als Lernsprache oder
> Muttersprache es/fr/de/zh/ko gewählt hat, bekommt die Übersetzung
> vorangestellt. Übersetzungen gibt es **nur für diese sieben Sprachen**
> (ja/en/es/fr/de/zh/ko) — die 130 unterstützten Sprachen wurden
> **bewusst nicht** maschinell aufgefüllt, um "alle Sprachen unterstützt"
> vorzutäuschen; wer eine andere Sprache nutzt, erhält die japanisch-
> englische Standardausgabe. Wie schon die Antworten zu "Wer hat das
> gemacht?", zur Religionsgeschichte und zu "666" ist auch dies ein
> **regelbasierter Festtext ohne KI-Inferenz** — ein blankes GPT-2 würde
> beim Rechnen überzeugend klingende, aber falsche Ergebnisse liefern.
> Das **Tageskontingent wird dafür nicht verbraucht**.

> 📌 **Neuestes Update (2026-08-23, nur Formulierung)**: Drei Stellen der
> Festtext-Antwort zu "666 / Zeichen des Tieres" wurden **sprachlich
> überarbeitet** — das Wortspiel "666 = WWW", die Barcode-Legende und der
> Nebensatz zu Offenbarung 13,16-17 neben Barcodes und Amazon. Die steifen
> Distanzierungsformeln ("keinesfalls als Behauptung, eine Prophezeiung habe
> sich erfüllt") wurden durch einen leichteren, freundlicheren Ton ersetzt:
> **"eher als nette Trivia denn als harter Beweis"**. **Inhaltlich ändert
> sich nichts**: Nichts wird als erfüllte Prophezeiung behauptet, die
> Barcode-Geschichte bleibt ausdrücklich eine **technisch haltlose
> Großstadtlegende** (Snopes: FALSCH; Guard Bars sind 3 statt 7 Module
> breit), und die Python-Schlange bleibt ausdrücklich **reiner Zufall**.
> Geändert wurde allein der Stil — Ziel war Lesbarkeit und Charme, keine
> Aufweichung der Ehrlichkeit.

> 📌 **Neuestes Update (2026-08-23)**: Zwei **regelbasierte, von Hand
> geschriebene Festtext-Antworten** (zweisprachig JA/EN, ohne KI-Inferenz)
> wurden ergänzt.
> **(1) Islam, Iran/Persien und die arabische Welt**: Fragen nach
> Geschichte und Wurzeln werden mit einer neutralen, faktenbasierten
> Zusammenfassung beantwortet — vorislamische christliche Gemeinden auf
> der Arabischen Halbinsel (Nadschran, Ghassaniden), die Entstehung des
> Korans, die in der Forschung als **eigenständige, unabhängige
> Überlieferung** beschrieben wird, der Unterschied zwischen iranischer
> und arabischer Kultur sowie der zoroastrische Einfluss — letzterer
> ausdrücklich nur als **"von einigen Forschenden vertretene These"**,
> nicht als gesicherte Tatsache. Zwei Behauptungen, die ursprünglich
> aufgenommen werden sollten (der Koran sei aus einer Bibelübersetzung
> entstanden; ein Bruder Mohammeds sei der Übersetzer gewesen), wurden
> nach Prüfung **mangels Quellenbelegen bewusst weggelassen**. Den
> Abschluss bildet die Botschaft, dass Sprachbarrieren Missverständnisse
> begünstigen und **maschinelle Übersetzung und mehrsprachiger Austausch
> zu Verständigung und Frieden beitragen können**.
> **(2) "Ist 666 das Zeichen des Tieres?"**: eine leichte, zweisprachige
> Trivia-Antwort. Sie nennt die Offenbarungsstelle neutral, stellt das
> moderne Wortspiel **"666 = WWW"** (hebräische Gematrie: der Buchstabe
> Waw = 6) **ausdrücklich als Lesart einiger Leute und nicht als Lehre**
> vor, kennzeichnet die Geschichte vom "versteckten 666 im Barcode"
> **ausdrücklich als Großstadtlegende** und erklärt die tatsächliche
> Technik: die längeren Striche an den Rändern und in der Mitte sind
> **Guard Bars** (Start-, End- und Trennmarken für den Scanner); sie
> *sehen* der Ziffer 6 nur ähnlich, sind aber eine andere Kodierung
> (3 statt 7 Module) — Faktenchecker wie Snopes bewerten die Behauptung
> als FALSCH, es gibt **weder okkulte Bedeutung noch technische
> Grundlage**. Danach der positive Schluss, dass Web und Barcode-Scanner
> das Einkaufen bequem gemacht haben, **ohne dass jemand ein Zeichen am
> Körper braucht**, und zuletzt die Fußnote, dass das Python-Logo eine
> Schlange zeigt, der Name aber von der Comedy-Serie "Monty Python's
> Flying Circus" stammt — die Ähnlichkeit zum "Tier" ist **ausdrücklich
> reiner Zufall und Wortspiel** ohne jede inhaltliche Verbindung.
> **Ergänzung 2026-08-23**: Ein weiterer Nebensatz weist darauf hin, dass
> Offenbarung 13,16-17 tatsächlich eine Stelle enthält, wonach niemand ohne
> das Zeichen kaufen oder verkaufen kann, und dass **manche Leute darin eine
> interessante Parallele sehen** zu der Tatsache, dass modernes Einkaufen
> immer stärker auf Barcodes und Online-Bezahldienste wie Amazon angewiesen
> ist — **ausdrücklich nur als Zufall, den manche bemerkenswert finden, und
> keinesfalls als Behauptung, eine Prophezeiung habe sich erfüllt**.
> Details in den HANDOFF-Einträgen vom 2026-08-23 in [CLAUDE.md](CLAUDE.md).

> 📌 **Neuestes Update (2026-08-22)**: **Übungsprüfungen für Weltsprachen,
> eine Sprachauswahl-Oberfläche sowie sequentielle mehrsprachige Anzeige
> und Vorlesefunktion** hinzugefügt. Englisch und Japanisch bleiben die
> Standardsprachen, doch über ein zweisprachiges Banner und das Panel
> "🌐 Languages" lassen sich Original-Übungssätze für **38 Sprachen**
> (Europa, Naher Osten, Asien, Indien, Afrika) aktivieren. Nach der
> Auswertung führen die falsch beantworteten Aufgaben – genau wie beim
> bestehenden Eiken/TOEIC/TOEFL/JLPT-Ablauf – direkt ins Gespräch mit
> dem Tutor der jeweiligen Sprache. Zusätzlich lassen sich **2–5
> Sprachen** (inkl. Englisch und Japanisch) wählen, um denselben Satz
> nacheinander anzuzeigen und vorzulesen – beliebig oft wiederholbar,
> mit Kopieren/Einfügen, .txt-Download und Speichern in der lokalen
> SQLite-Datenbank. Ehrliche Offenlegung: Es handelt sich um eigens für
> diese App verfasste Originalaufgaben – keine früheren Prüfungsfragen
> und ohne jede Verbindung zu realen Sprachzertifikaten (DELE, DELF,
> Goethe-Zertifikat, HSK, TOPIK …). Die CEFR-artigen Stufen (A1–C2) sind
> nur grobe Anhaltspunkte, die Aufgabenzahl ist ungleich verteilt (3–6
> pro Sprache), und das Vorlesen nutzt die Web Speech API des Browsers –
> ohne installierte Stimme wird der Text nur angezeigt. Details im
> HANDOFF-Eintrag vom 2026-08-22 in [CLAUDE.md](CLAUDE.md).

> 📌 **Neuestes Update (2026-08-20)**: Periodische automatische
> Update-Prüfung hinzugefügt (alle 6 Stunden, zusätzlich zur Prüfung
> beim Start) sowie eine manuelle Downgrade-Funktion. Erweist sich eine
> neue Version als fehlerhaft, lassen sich über `GET /v1/updates/
> history` (aktuelle + aufbewahrte frühere Versionen) und
> `POST /v1/updates/downgrade` (open-english selbst, aruaru-llm oder
> aruaru-db einzeln auf eine bestimmte Version zurücksetzen) einzelne
> Komponenten gezielt zurückrollen. UI: Abschnitt "🔄 Updates &
> Rollback" im Panel "💾 Data & Model Storage". Ehrliche Offenlegung:
> standardmäßig werden nur die letzten 3 Generationen aufbewahrt
> (Speicherplatz-Rücksicht) — ein Rollback über diese hinaus, oder auf
> eine nie tatsächlich angewendete Version, ist nicht möglich. Details
> im HANDOFF-Eintrag vom 2026-08-20 in [CLAUDE.md](CLAUDE.md).

> 📌 **Update (2026-08-19, Fortsetzung 8)**: Wird das tägliche
> Nutzungslimit erreicht (standardmäßig 100, clientseitiger
> `localStorage`-Zähler), zeigt der Chat jetzt einen zweisprachigen
> Hinweis — "Möchten Sie zu einem kostenpflichtigen Plan wechseln?" —
> sowie Informationen zu den kostenlosen Kontingenten anderer
> KI-Anbieter (Google Search/DeepSeek/ChatGPT/Gemini/Claude), dynamisch
> aus `provider-free-tiers.json` gelesen. Ehrliche Offenlegung: Dies ist
> eine reine Hinweisfunktion clientseitig, ohne echten Abrechnungs-/
> Upgrade-Ablauf.

> 📌 **Update (2026-08-19)**: `facebook.html` hinzugefügt, eine
> Einstiegsseite zum Teilen als Link auf einer Facebook-Seite oder in
> Messenger, für Nutzer, deren Mobilfunktarif nur Facebook-Zugang
> erlaubt. Ehrliche Offenlegung: echter kostenloser Zero-Rating-Zugang
> im Stil von Facebooks "Free Basics" ist ohne offizielle Partnerschaft
> mit Meta nicht erreichbar — `facebook.html` funktioniert als normale,
> über Facebooks eingebauten Browser erreichbare Seite und verweist auf
> die bestehenden Installer (Windows/Linux/macOS/Android); die App
> selbst läuft weiterhin auf einem lokalen Server auf dem eigenen Gerät
> (`server/`).

> 📌 **Update (2026-08-19)**: Claude (Anthropic) als kostenpflichtige
> Option zum Info-Banner für kostenlose Kontingente von KI-/
> Suchanbietern hinzugefügt (ehrlich vermerkt: kein dauerhaftes
> kostenloses Kontingent, allenfalls ein kleines Guthaben bei der
> Anmeldung).

> 📌 **Neuestes Update (2026-08-18)**: Eine echte lokale Datenbank für
> Chatverlauf/Einstellungen hinzugefügt (SQLite + optionaler
> selbstheilender `aruaru-db`/PostgreSQL-Spiegel), plus APIs für
> Speicherort-Auswahl, rsync-Backup und Import alter Daten. Fehlt
> `rsync`, zeigt die App zweisprachig **"Let's install RSync!"** an und
> kann es automatisch über den Paketmanager des Betriebssystems
> installieren und danach sofort das Backup ausführen. Details siehe
> [CLAUDE.md](CLAUDE.md) (2026-08-18 HANDOFF-Einträge, Japanisch).

> 📌 **Älteres Update (2026-08-11–12, v0.6.0)**: Android/Tablet läuft
> jetzt vollständig eigenständig — kein PC oder Linux-Server mehr
> nötig. Die KI-Antwort-Engine (`aruaru-llm`) selbst ist jetzt in die
> APK gebündelt; die Verifikation auf dem Gerät bestätigte, dass beide
> Prozesse am Leben bleiben und auf `/healthz`/`/v1/chat` antworten.
> Außerdem hinzugefügt: eine Prüfungsvorbereitungs-Ecke (Eiken 1-5,
> TOEIC, TOEFL, JLPT N1-N5, Nihongo Kentei 1-3, je 10 Originalfragen),
> die falsch beantwortete Fragen nach der Bewertung an den KI-Trainer
> weiterreicht (automatischer Wechsel in einen "Japanisch-Klassenzimmer"
> -Modus für JLPT/Nihongo Kentei), eine Auswahl "welche Sprache lernen",
> sowie Linux/macOS-Installer (`installer/unix/install.sh`). Ehrliche
> Offenlegung: Modellgewichte (GPT-2-Familie, Embedding-Modell) sind
> nicht in der APK gebündelt — KI-Chat unter Android erfordert weiterhin
> manuelles Ablegen der Modelldateien im internen Speicher (noch kein
> automatischer Download). Siehe die HANDOFF-Einträge vom 2026-08-11
> (Fortsetzung 7-10) in [CLAUDE.md](CLAUDE.md).

> 📌 **Älteres Update (2026-08-11, Fortsetzung 3)**: Automatische
> Selbstaktualisierung (nur Windows) hinzugefügt, die beim Start die
> neueste GitHub-Version prüft und bei einer neueren Version die alte
> automatisch deinstalliert und die neue installiert. Ehrliche
> Offenlegung: Es existiert noch kein GitHub-Release, daher wurde der
> vollständige Deinstallations-/Installationsablauf noch nicht
> Ende-zu-Ende verifiziert (Versionsvergleichslogik und der Pfad "kein
> Release gefunden, sicher fortfahren" wurden verifiziert).

> 📌 **Älteres Update (2026-08-11, Fortsetzung 2)**: Erkennung für
> Jobsuche-/Karrierewechsel-/Tourismus-Themen hinzugefügt, die
> aruaru.tokyo, audiocafe.tokyo/aruaru, audiocafe.tokyo/aruaru-lady und
> nasa.tokyo auf Englisch und Japanisch vorstellt — funktioniert sowohl
> im normalen Chat als auch im Trainingsmodus, live verifiziert.

> 📌 **Älteres Update (2026-08-11, Fortsetzung)**: Anbindung an eine
> neue Geo-/Tourismus-Datenbank (alle 47 japanischen Präfekturen, 50
> US-Bundesstaaten, wichtige Welthauptstädte mit Sehenswürdigkeiten/
> Essen/Souvenirs), um das Selbstvorstellungs-Training dynamisch zu
> machen. Beim Thema Fuji zeigt die App jetzt einen zweisprachigen
> Sicherheitshinweis (Skibekleidung + Helm tragen, Berghütte im Voraus
> reservieren) sowie echte Hütten-/Bus-/Ausrüstungsladen-Infos und eine
> Tourbuchungssuche. Auswahl-UI für Altersgruppe/Level/Business-Englisch
> hinzugefügt. Live gegen ein laufendes `aruaru-llm` + statischen Server
> verifiziert (3 echte Bugs gefunden und behoben).

> 📌 **Älteres Update (2026-08-11)**: Einstellungsfeld zum Speichern des
> eigenen Google-Search-API-Schlüssels/cx direkt aus dem Browser
> hinzugefügt (`POST /v1/settings/google-search`, nur im Speicher,
> nie auf Festplatte geschrieben). Der Windows-Installer
> (`installer/windows/`, Inno Setup) wurde tatsächlich gebaut,
> installiert, gestartet und auf echter Hardware deinstalliert (keine
> Admin-Rechte nötig).

> 📌 **Älteres Update (2026-08-10, Fortsetzung)**: (1) Standardmodell
> von `gpt2` (124M) auf `distilgpt2` (82M) umgestellt, ~42% schneller.
> (2) Entschieden, die Frontend-JS **nicht** nach Rust/WASM zu
> portieren (kein Performancegewinn, `SpeechRecognition` hat keine
> standardisierte web-sys-Anbindung) — stattdessen wurde **der lokale
> Datei-Server nach Rust portiert** (neue `server/`-Crate, basierend
> auf RPoems `open-runo-poem-compat`, entfernt die Abhängigkeit von
> `python3 -m http.server`). (3) Japanische Eingaben verbessert, sodass
> hybride (Englisch+Japanisch) Antworten immer garantiert sind. (4)
> Versionsverwaltung hinzugefügt (`version.json` mit semantischer
> `version`, in der Fußzeile angezeigt) und automatisches Aufräumen der
> browserseitigen Spuren alter Versionen.

> 📌 **Aktuelles Update (2026-08-10)**: CORS-Unterstützung hinzugefügt,
> die Ursache der entarteten Wiederholungsschleife beim GPT-2-Greedy-
> Decoding behoben (`open-cuda`s `generate_with_repetition_penalty`,
> Standard `penalty=1.3`), das Aussehen der Tora-san-Figur angepasst +
> Umschalt-Jingle + Vorstellungs-Fix hinzugefügt, einen Trainingsschritt
> basierend auf der echten Kundenbetreuungstechnik eines Akihabara-
> Maid-Cafés (@ほぉ～むカフェ) hinzugefügt, einen Schritt über den
> aktuellen Boom der japanischen Kultur im Ausland recherchiert und
> hinzugefügt (Anime/Manga, Anime-Songs, Spiele, Japanisch-Lernende,
> Goshuin-Sammeln, Onsen-Ryokan-Tourismus, japanisches Essen), Launcher-
> Icons für Windows/Mac/Linux/Android/iPhone/iPad hinzugefügt und einen
> Auto-Update-Mechanismus implementiert.

Eine browserbasierte (Phase 0) Web-App zum Englischlernen für
PC/Tablet/Smartphone. Im Stil einer "Maid-Café-Englischstunde"
begleitet eine magische Maid-Figur (Originaldesign, animiert) Lernende
vom absoluten Anfänger bis zum Fortgeschrittenen.

## Architektur (gemäß Nutzeranweisung, 2026-08-10)

- **Linux (VPS)-Seite**: nur ein Download-Verteilserver (nicht der Ort,
  an dem diese App tatsächlich läuft). Die App-Verwaltung übernimmt
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Nutzergerät (PC/Tablet/Handy)-Seite**: das statische Web-Frontend
  dieses Repos (HTML/CSS/JS, läuft im Browser) + ein lokal laufender
  nativer Server aus [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm)
  (der intern die Inferenz-Backends von `open-directx`/`open-cuda`
  nutzt), den der Nutzer selbst herunterlädt und ausführt. Der Browser
  verbindet sich lokal (online oder offline) mit `http://localhost:4600`
  (Standardport von aruaru-llm) — ein "hybrides" Design.

## Aktueller Umfang (Phase 0) — ehrliche Offenlegung

- **Qualität der KI-Antworten**: `aruaru-llm`s `/v1/generate` führt
  autoregressive Textgenerierung mit GPT-2 (124M-1,5B, englischzentriert,
  ohne Dialog-Finetuning) durch. Flüssigkeit oder Level-Angemessenheit
  der Antworten sind nicht garantiert — dies wird auf dem Bildschirm
  offengelegt, nicht beschönigt. Seit 2026-08-10 behebt ein
  Wiederholungs-Penalty (Standard 1,3) den zuvor gemeldeten Bug der
  endlosen Wiederholungsschleife.
- **CORS**: seit 2026-08-10 behoben — der HTTP-Server von `aruaru-llm`
  sendet jetzt `Access-Control-*`-Header, sodass dieses Frontend
  Cross-Origin (oder über `file://`) geöffnet werden kann und trotzdem
  `http://localhost:4600` erreicht.
- **Level-Auswahl**: der Level-Wähler von Anfänger bis Fortgeschritten
  existiert in der UI, aber die tatsächliche Durchsetzung des Levels
  beschränkt sich auf eine kurze Prompt-Anweisung — GPT-2 folgt ihr
  nicht garantiert.
- **Sprache/TTS**: echte Web-Speech-API (SpeechSynthesis für Ausgabe,
  SpeechRecognition für Mikrofoneingabe) ist eingebunden, mit
  charakterspezifischer Tonhöhen-/Geschwindigkeitseinstellung.
- **Trainingsmodus**: ein deterministisches Selbstvorstellungs-Skript
  (nicht KI-generiert), das jetzt auch die wortbasierte Gesprächstechnik
  eines echten Akihabara-Maid-Cafés sowie einen Schritt über den
  aktuellen Boom der japanischen Kultur im Ausland enthält.
- **Launcher-Icons**: `icons/` + `manifest.json` (PWA) + `launchers/`
  ermöglichen das Starten der App über ein Desktop-Icon
  (Windows/Mac/Linux) oder ein Homescreen-Icon (Android/iPhone/iPad).
- **Auto-Update**: `auto-update.js` fragt `version.json` alle 5s ab und
  lädt die Seite bei einer neuen Build-ID neu. **Bekannte Einschränkung**:
  manche Browser blockieren `fetch()` lokaler Dateien unter dem
  `file://`-Schema — garantiert funktionsfähig bei Bereitstellung über
  einen lokalen HTTP-Server, deaktiviert sich sonst stillschweigend.

## Erforderliche Installationsprogramme (hinzugefügt am 2026-08-17)

Um open-english auszuführen, müssen die folgenden zwei Programme
heruntergeladen und installiert werden (kein Bauen aus dem Quellcode
nötig, nahezu ein Ein-Klick-Verfahren).

| # | Was | Windows | Linux | Android/Tablet |
|---|---|---|---|---|
| 1 | **open-english selbst** (dieses Repository — statisches Frontend + Auslieferungsserver) | [open-english-install.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-install.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest) | [APK](https://github.com/aon-co-jp/open-english/releases/latest) (die `.apk`-Datei aus der Asset-Liste wählen) |
| 2 | **aruaru-llm** (die KI-Antwort-Engine — erforderlich, ohne sie funktioniert der Chat nicht) | [aruaru-llm-installer.exe](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-installer.exe) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Bereits enthalten (in der APK von open-english eingebettet, keine separate Installation nötig) |

**Ehrliche Offenlegung**: Die "latest"-Links oben verweisen immer auf das
neueste GitHub-Release (nutze die
[Releases-Seite](https://github.com/aon-co-jp/open-english/releases)
direkt, wenn du eine bestimmte, fest angegebene Version möchtest). Für
`aruaru-llm` gibt es derzeit noch keine vorgefertigte macOS-Binärdatei
(open-english selbst bietet ein macOS-tar.gz, aber `aruaru-llm` nur
Linux/Windows) — unter macOS muss `aruaru-llm` aus dem Quellcode gebaut
werden.

Unter Windows/Linux/macOS prüft die eingebaute Auto-Update-Funktion
(`server/src/self_update.rs`, seit 2026-08-19 auf Linux und macOS
erweitert) nach der Installation beim Start die GitHub Releases und
aktualisiert automatisch, falls eine neuere Version verfügbar ist
(Windows: Deinstallation→Neuinstallation; Linux/macOS: die laufende
Binärdatei ersetzt sich selbst) — ohne Zutun des Benutzers. Vor jedem
Update wird die aktuelle Binärdatei gesichert; erreicht die neue
Version den neuen `/healthz`-Endpunkt nicht innerhalb einer kurzen
Frist, wird automatisch auf die gesicherte Version zurückgerollt.
**Ehrlicher Hinweis**: Android/iPhone/iPad sind von diesem Auto-Update/
Rollback-Mechanismus ausgenommen (das Betriebssystem erlaubt keine
stille APK-Installation) — dort bleibt die manuelle Installation durch
den Nutzer nötig, ein Rollback-Pfad existiert dort nicht.

Außerdem wurde `facebook.html` als neue Einstiegsseite hinzugefügt, für
Nutzer, deren Mobilfunktarif nur Facebook-Zugriff erlaubt — ehrlicher
Hinweis: es handelt sich nicht um eine offizielle "Free Basics"-
Partnerschaft mit Meta, sondern lediglich um eine normale Seite, die
über den in Facebook integrierten Browser erreichbar ist und auf die
bestehenden Installationsprogramme verweist.

*(Hinweis zur maschinellen Übersetzung: Dieser Absatz wurde vom
KI-Agenten selbst übersetzt, ohne Prüfung durch einen Muttersprachler.)*

## Ausführung

1. [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) mit
   `cargo run --release` starten (Standard `http://localhost:4600`,
   Standardmodell jetzt `distilgpt2`).
2. Im Verzeichnis `server/` `cargo run --release` ausführen, um das
   statische Frontend dieses Repos unter `http://127.0.0.1:4601/`
   bereitzustellen (RPoem-basiert — `python3 -m http.server` wird nicht
   mehr benötigt; Port über die Umgebungsvariable
   `OPEN_ENGLISH_SERVER_BIND` änderbar).
3. `http://127.0.0.1:4601/` im Browser öffnen. Direktes Öffnen von
   `index.html` über `file://` funktioniert weiterhin, aber manche
   Browser blockieren dabei `fetch()` und deaktivieren Auto-Update —
   der Server aus Schritt 2 wird empfohlen.

## Nächste Schritte

1. ~~CORS-Unterstützung auf `aruaru-llm`-Seite~~ **Erledigt (2026-08-10)**.
2. ~~GPT-2-Wiederholungsschleife~~ **Ursache behoben (2026-08-10,
   Wiederholungs-Penalty)**.
3. ~~Standardmodell beschleunigen~~ **Erledigt (2026-08-10, Wechsel zu
   distilgpt2, ~42% schneller)**.
4. ~~Hybride Antworten bei japanischer Eingabe garantieren~~ **Erledigt
   (2026-08-10)**.
5. ~~Lokalen Datei-Server nach Rust portieren~~ **Erledigt (2026-08-10,
   `server/`-Crate)**. Die Portierung des Frontend-JS selbst nach
   Rust/WASM wurde geprüft und verworfen (kein Performancegewinn —
   siehe `CLAUDE.md`).
6. TTS/Lippensynchronisation verfeinern.
7. Ein Curriculum pro Level (Grammatik, Vokabellisten usw.)
   implementieren.
8. **(gemäß Nutzeranweisung, 2026-08-10)** Zukünftige Idee:
   `open-directx`/`open-cuda`/`aruaru-llm` im Browser (WASM/WebGPU)
   laufen lassen und mit `RPoem` (einer GraphQL-Federation-Plattform)
   integrieren. Dies ist eine große, separate architektonische
   Richtung gegenüber dem aktuellen Phase-0-Design und wird auf nach
   dem MVP verschoben.
9. Untersuchen, ob Techniken aus Toshiba SBM oder der DeepSeek-Familie
   hier echten Nutzen hätten (noch nicht begonnen).

---

Weitere Sprachen: [日本語](README.md) · [English](README-English.md) ·
[Italiano](README-Italian.md) · [Français](README-French.md) ·
[Русский](README-Russian.md) · [Українська](README-Ukrainian.md) ·
[עברית](README-Hebrew.md) · [فارسی](README-Persian.md)

---

## 🎓 Nachhilfekurs: Lernverlauf speichern (Empfehlung vor dem Start)

**Vor der Nutzung des Nachhilfekurses empfehlen wir, eine Datenbank für den
Lernverlauf einzurichten** — entweder **aruaru-db** oder ein **normaler
PostgreSQL-Server**. Dann wird festgehalten, welche Klassenstufen und Fächer
Sie gelernt haben, welche Aufgaben Sie gelöst haben und wie die Tests
ausgingen, sodass Sie später auf Ihren Lernweg zurückblicken können.
Ohne Datenbank landen die Ergebnisse nur in der eingebauten lokalen
SQLite-Datei (geht bei Neuinstallation oder Gerätewechsel verloren), und die
Klassen-/Fachauswahl nur im localStorage des Browsers.

Beides funktioniert über dieselbe Einstellung: `OPEN_ENGLISH_DATABASE_URL`
mit einer PostgreSQL-Verbindungszeichenfolge (aruaru-db spricht dasselbe
PostgreSQL-Wire-Protokoll). **Ehrliche Einschränkungen**: Die Verbindung
läuft ohne TLS, verwaltete PostgreSQL-Dienste mit SSL-Pflicht funktionieren
also noch nicht, und ein reiner PostgreSQL-Server wurde bei uns noch nicht
End-to-End getestet.

- **Doppelte (DUAL) Einrichtung — aruaru-db + PostgreSQL**: Zwei Datenbanken,
  die einander spiegeln, schützen vor dem Ausfall einer Seite. **Stand der
  Umsetzung, ehrlich**: open-english selbst schreibt in SQLite plus *eine*
  Datenbank; **gleichzeitiges Schreiben in zwei Datenbanken ist noch nicht
  implementiert**. Heute erreicht man DUAL über `DUAL_DATABASE_URL` von
  aruaru-db (open-english → aruaru-db → PostgreSQL).
- **Sicherung per rsync**: Die Lernverlaufs-Datenbank *kann* im Panel
  „💾 Data & Model Storage“ per rsync auf eine externe Platte, einen anderen
  PC oder einen Server kopiert werden (nicht automatisch). **Ehrlicher
  Befund**: In `open-easy-web` haben wir keinen rsync-Mechanismus gefunden —
  nutzbar ist die eingebaute rsync-Sicherung von open-english.
- **Google Drive**: Mit [rclone](https://rclone.org/drive/) lässt sich der
  Sicherungsordner zu Google Drive synchronisieren:
  `rclone sync /path/to/backup gdrive:open-english-backup`. Es wird **nichts
  automatisch** synchronisiert; Sie richten das selbst ein.
- **Webhosting / VPS**: Alles, was per SSH erreichbar ist (Hosting-Tarife mit
  SSH wie Lolipop oder Sakura Internet, VPS wie ConoHa), geht direkt mit
  rsync: `rsync -avz /path/to/backup user@your-vps-host:/backup/open-english/`.
  Ziel und SSH-Schlüssel richten Sie selbst ein.

## Neueste Updates (2026-08-27)

Echtes Deployment auf dem VPS (easy-web.tokyo/open-english),
Ordner-Browser für Backup-/Speicherpfade, dauerhaftes
Netzwerkstatus-Badge (öffentlich/privat) mit DuckDNS-Unterstützung,
einklappbare UI-Panels, echter End-to-End-Test des GitHub-/VPS-Zugriffs,
Zeichnungs-Upload + textbasierter KI-Kommentar zusammen mit dem neuen
open-cg-cad-Server, mehrsprachiger Übungstest für die
US-Zertifizierung „Data Scientist“, sowie ein neues Meinungsthema zur
Altersvorsorge. Vollständige Details nur in der japanischen Version.
