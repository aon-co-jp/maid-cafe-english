# PORTING.md — Leitfaden zur Portierung von open-english (Kurzfassung)

> **Seit (2026-08-27)**: neue Patterns — Cross-Origin-iframe-Tresor für Geheimnisse, generische Verschlüsselungs-Helfer (`owEncryptSecret`/`owDecryptSecret`) — siehe PORTING.md (Japanisch) für die Einträge vom 2026-08-27.


> **Hinweis**: Dies ist eine kondensierte Übersetzung. Die vollständige
> technische Anleitung mit Code-Details und Fallstricken bleibt nur auf
> Japanisch in [PORTING.md](PORTING.md) verfügbar — dort nachschlagen,
> bevor ein Muster tatsächlich übernommen wird.

Zusammenfassung der wiederverwendbaren Implementierungsmuster aus
diesem Projekt, falls sie in ein anderes Projekt portiert werden:

1. **`aruaru-llm`-Integrationsmuster**: erfordert CORS-Unterstützung
   (`.with_cors()`) und einen Wiederholungs-Penalty
   (`generate_with_repetition_penalty`, Standard 1,3) auf der
   `aruaru-llm`-Seite, sonst blockiert der Browser `fetch()` bzw. das
   GPT-2-Greedy-Decoding gerät in eine Wiederholungsschleife.
2. **Sprachextraktion für TTS** (`extractSpeechText`): trennt
   zweisprachige Zeilen im Format "Englisch / 日本語" vor der Übergabe
   an `SpeechSynthesisUtterance`, um abgehackte Aussprache zu
   vermeiden.
3. **Launcher-Icon-Set** (`icons/` + `manifest.json` + `launchers/`):
   handgeschriebener PNG/ICO-Encoder ohne externe Bildwerkzeuge, plus
   Skripte für Windows-`.lnk`, Linux-`.desktop` und macOS-`.app`.
4. **Auto-Update** (`auto-update.js` + `version.json`): einfaches
   Polling der `buildId` alle 5s mit `location.reload()`.
5. **RPoem-basierter statischer Server** (`server/`): ersetzt
   `python3 -m http.server` durch eine Rust-Crate, die
   `open-runo-poem-compat`s `static_file_handler` wiederverwendet.
6. **Strukturelle Garantie hybrider Antworten** (`ensureHybridReply`):
   ergänzt automatisch eine kurze japanische Notiz, wenn die
   Modellantwort kein Japanisch enthält — ohne die Übersetzungsqualität
   zu beschönigen.
7. **Versionsverwaltung + browserseitige Bereinigung alter Versionen**:
   `version.json` mit `version`-Feld, Löschen von app-eigenen
   `localStorage`-Schlüsseln bei neuer Version.
8. **Google Custom Search JSON API-Bridge + Browser-Einstellungspanel**:
   Zugangsdaten nur im Prozessspeicher, nie auf Festplatte.
9. **Windows-Installer (Inno Setup) — reale Verifikationsschritte**:
   `PrivilegesRequired=lowest` gegen UAC-Hänger,
   `MSYS_NO_PATHCONV=1` für Git-Bash-Silent-Installs.
10. **Geo-/Tourismus-DB mit themengesteuerten Sicherheitshinweisen**:
    Teilstring-Suche statt exakter Übereinstimmung; bei gefährlichen
    Themen (z. B. Bergsteigen) immer einen Sicherheitshinweis
    beifügen.
11. **Automatisches Update via GitHub Releases (Windows/Linux/macOS,
    siehe Punkt 14 für Rollback)**: muss
    zwingend nativ (nicht im Browser-JS) implementiert werden; die
    eigene laufende .exe kann unter Windows nicht gelöscht werden —
    erst eine losgelöste Batch-Datei starten, dann den eigenen
    Prozess beenden.
12. **Modale CSS-Klassen brauchen `max-height`/`overflow-y`**: jede
    Modal-Container-Klasse muss Scroll-Fähigkeit definieren, sonst
    sind lange Inhalte auf Mobilgeräten nicht erreichbar.
13. **Android-Bündelung eines Rust-Servers**: Pfade zur Laufzeit per
    Umgebungsvariable überschreibbar machen; Windows-spezifische
    Auto-Update-Logik unbedingt mit `cfg!(target_os = "windows")`
    absichern.

14. **Plattformübergreifendes Auto-Update mit Health-Check-gestütztem
    Rollback**: `apply_update_linux` zu `apply_update_unix`
    verallgemeinern (Linux und macOS teilen sich das Ersetzen der
    laufenden Binärdatei); die aktuelle Binärdatei vor dem Update
    sichern; nach dem Start der neuen Version einen neuen
    `/healthz`-Endpunkt innerhalb kurzer Frist prüfen und bei
    Fehlschlag die Sicherung wiederherstellen. Android/iOS bleiben
    ausdrücklich außerhalb des Umfangs (Plattformbeschränkung, kein
    Versäumnis).
15. **Werbung + automatische Installation von RSync**: fehlt `rsync`,
    eine einladende zweisprachige Meldung ("Let's install RSync!")
    statt eines trockenen Fehlers anzeigen, dann eine automatische
    Installation über eine Paketmanager-Kette je nach OS versuchen
    (winget→choco unter Windows, apt-get→dnf→pacman unter Linux, brew
    unter macOS, pkg unter Termux/Android) und bei Erfolg direkt das
    Backup anschließen.
16. **Dedizierte Einstiegsseite für einen eingeschränkten Zugangskanal**
    (z. B. `facebook.html` für Nutzer mit reinem Facebook-Zugang): eine
    einfache statische Seite, die die bereits im README vorhandenen
    Download-Links wiederverwendet, mit expliziter ehrlicher
    Offenlegung, dass kein offizieller kostenloser "Zero-Rating"-Zugang
    erreicht wird — nur ein alternativer Einstiegspunkt.

*(Hinweis zur maschinellen Übersetzung: Die Einträge 14–16 wurden vom
KI-Agenten selbst übersetzt, ohne Korrekturlesen durch einen
Muttersprachler.)*

**Wichtiger Vorbehalt**: Dieses Projekt ist ein Phase-0-Prototyp — KI-
Antwortqualität (GPT-2-basiert), Natürlichkeit der Sprachsynthese und
verlässliche Level-Anpassung sind nicht garantiert. Dies sollte auch
bei jeder Portierung klar offengelegt werden.

---

Weitere Sprachen: [日本語 (Original, vollständige Details)](PORTING.md) ·
[Italiano](PORTING-Italian.md) · [Français](PORTING-French.md) ·
[Русский](PORTING-Russian.md) · [Українська](PORTING-Ukrainian.md) ·
[עברית](PORTING-Hebrew.md) · [فارسی](PORTING-Persian.md)

## Muster: mehrsprachige Original-Prüfungen + Sprachauswahl + Vorlesen (2026-08-22)

1. Datenschicht in zwei Dateien trennen: Prüfungsaufgaben und Phrasen für
   das Vorlesen haben unterschiedliche Zwecke.
2. Übersichts-API ohne Aufgabentexte anbieten (`GET /v1/world-languages`),
   die vollständige JSON-Datei erst beim tatsächlichen Test laden.
3. Bestehende Prüfungs-UI nicht umbauen: nur eine `<optgroup>` mit Werten
   `world:<code>` ergänzen und Bewertung/Weiterleitung wiederverwenden.
4. Ober- und Untergrenze der Sprachauswahl in den Checkboxen erzwingen;
   bei erreichter Grenze **nur nicht angehakte** Boxen deaktivieren.
5. Vorhandene TTS wiederverwenden, nur eine Zuordnung Sprachcode → BCP-47
   ergänzen; ehrlich offenlegen, dass ohne installierte Stimme nur Text
   erscheint.
6. Texte in `readonly`-`<textarea>` ausgeben (kopierbar); zum Speichern
   den bestehenden Persistenz-Endpunkt nutzen statt neuer Tabellen.

## Muster: regelbasierte Festtext-Antworten zu sensiblen Themen (2026-08-23)

1. Drei Bausteine: Schlüsselwort-Prüffunktion + Texttabelle mit Sprachcode
   als Schlüssel + Funktion, die daraus die zweisprachige Antwort baut.
   Im Submit-Handler **vor** dem KI-Pfad einsetzen und dort zurückkehren.
2. Themenwort UND Absichtswort verknüpfen, damit ein beiläufiges "Iran"
   das normale Gespräch nicht kapert. Bei englischen Schlüsselwörtern die
   Wortgrenze `\b` **nur am Wortanfang** setzen, sonst entgeht einem
   "Zoroastrianism" (real aufgetretener Fehler).
3. Konkretere Themen zuerst prüfen (666 vor Religionsgeschichte).
4. Die Ehrlichkeitsgarantien direkt in den Text schreiben: Thesen nur
   **vorstellen**, Großstadtlegenden **als solche kennzeichnen** (nach
   Möglichkeit mit technischer Auflösung, wie bei den Guard Bars des
   Barcodes), Zufälle **als Zufall benennen**; "interessante Parallelen"
   zwischen alten Texten und heutigen Verhältnissen **nur als Möglichkeit
   vorstellen** ("manche sagen das") und nie als erfüllte Prophezeiung
   behaupten (Beispiel: Offenbarung 13,16-17 "ohne das Zeichen kein Kaufen
   und Verkaufen" neben Barcodes und Online-Bezahldiensten wie Amazon).
5. Weggelassene Behauptungen samt Grund dokumentieren — im Antworttext und
   als Kommentar im Code ("vor dem Ändern lesen").
6. Die nötigen Vorbehalte müssen **keine steifen Distanzierungsformeln**
   sein: eine leichte, warme Formulierung ("eher als nette Trivia denn als
   harter Beweis") ist völlig in Ordnung, solange Lesende klar erkennen,
   dass nichts bewiesen wird. Maßstab ist "wird etwas als Tatsache
   behauptet?", **nicht der Tonfall**. Die Abmilderung darf aber nie in
   Formulierungen kippen, die wie eine Behauptung klingen ("die
   Prophezeiung hat sich erfüllt", "das passiert gerade wirklich").

## Muster: Festtext-Quiz mit zweistufiger Antwort (2026-08-23)

1. Dasselbe Dreigespann wie oben (Prüffunktion + Texttabelle + Aufbau-
   funktion), hier `isQuizRequest()` / `QUIZ_TEXTS` / `quizQuestionText()`
   und `quizAnswerText()`. Das Rätsel selbst ist Festtext, weil ein
   Sprachmodell beim Rechnen überzeugend klingende Falschergebnisse
   liefert — bei einer Aufgabe mit genau einer nachprüfbaren Lösung ist
   das nicht hinnehmbar.
2. **Zweistufigkeit ohne Zustandsmaschine**: Ein einziges Flag im
   Modulscope (`quizAwaitingAnswer`) genügt — erst die Aufgabe, dann nach
   "Ich weiß es nicht" / "Sag mir die Lösung" die Antwort. Kein
   Dialogzustandsautomat, kein Session-Objekt.
3. Die Prüfung auf "wartet auf Antwort" gehört **vor** die Prüfung auf
   eine neue Quiz-Anfrage, sonst gewinnt "noch eine Aufgabe" gegen die
   erwartete Antwort. Sehr allgemeine Wörter ("weiß nicht") sind
   unbedenklich, solange sie **nur** bei gesetztem Flag ausgewertet werden
   — sonst kapern sie das normale Gespräch.
4. **Sprachabdeckung ehrlich halten**: Standard ist die zweisprachige
   Ausgabe; für die tatsächlich übersetzten Sprachen (hier ja/en/es/fr/de/
   zh/ko) wird die Übersetzung vorangestellt, alle übrigen bekommen den
   Standard. Die Sprachliste **nicht** maschinell auffüllen, um eine
   Vollabdeckung vorzutäuschen — Erweitern heißt: einen echten Eintrag
   mit Sprachcode als Schlüssel in die Tabelle legen.
5. Beim Portieren von Rätseln: die Lösung selbst nachrechnen und im Text
   festhalten, dass es sich um eine **echte, nachprüfbare Aufgabe** und
   nicht um ein Fangrätsel handelt — sonst suchen Lesende am falschen Ende.

## Muster: bestehendes Kurs-Gerüst für eine andere Zielgruppe wiederverwenden (2026-08-24)

Die virtuelle Hochschule und die virtuelle Berufsschule verwenden **dasselbe Muster
wie der Nachhilfekurs**, nur mit anderer Zielgruppe.

- Drei Datentabellen genügen: Kategorien (mit einem `mode`-Feld zur Trennung der
  beiden Schulformen), Fachgebiete je Kategorie und Fragen unter dem Schlüssel
  `<Kategorie>:<Fachgebiet>`. Keine neuen Konzepte einführen.
- **Eine einzige Modalbox für beide Schulformen**: eine Funktion tauscht Titel und
  Überschrift aus und filtert die Kategorienliste nach `mode`. Kein doppeltes HTML.
  Beim Moduswechsel Auswahl und installierte Fachgebiete verwerfen.
- **Fehlende Inhalte immer als „noch nicht bereit“ kennzeichnen**: Checkbox
  deaktivieren und zusätzlich „N von M Fachgebieten verfügbar“ auf der Kategorie-
  Schaltfläche anzeigen, damit der Umfang schon vor dem Öffnen sichtbar ist. Enthält
  eine Kategorie gar nichts, dies ausdrücklich vermerken.
- **YouTube nur als Suchergebnis-Link** (Stichwort per URL-Kodierung anhängen), mit
  `rel="noopener noreferrer"` und einem Hinweis, dass kein Video empfohlen wird.
- **Formate, die sich nicht automatisch bewerten lassen** (Aufsatz, Gespräch, Praxis),
  ausdrücklich als Annäherung kennzeichnen statt sie als Funktion zu bewerben.
- Ergebnisse über den vorhandenen Verlaufs-Endpunkt speichern, nur mit anderer Rolle.
- Urheberrecht: allgemeine Prüfungstendenzen recherchieren, aber alle Fragetexte
  selbst verfassen.


## Karriereorientierung (2026-08-24)

Neue schlanke Zuordnungstabelle `TUTOR_CAREER_GUIDANCE` (pro Fach, nicht
pro Frage), die unter jeder Frage im Nachhilfekurs Branchen/Berufe und
mögliche fortgeschrittene Berufe anzeigt — stets vorsichtig formuliert.
Details und Quellen zum deutschen dualen System siehe PORTING.md (§17,
Japanisch).


## world-lab: Geteilte Rechenleistung ungenutzter Geräte (2026-08-24)

`server/src/world_lab.rs` implementiert Geräte-Pairing plus Ausführung
beliebiger Rechenaufgaben in einer WASM-Sandbox, mit zwei getrennten,
standardmäßig deaktivierten Opt-in-Flags. **Wichtigste Erkenntnis aus
echten Tests**: die Fuel-Grenze (Befehlszähler) von wasmtime, die
außer Kontrolle geratenen Gast-Code stoppen soll, brachte auf diesem
Windows-Entwicklungsrechner stattdessen den gesamten Serverprozess zum
Absturz (`/GS`-Stapelschutz-Konflikt mit SEH-basierter Trap-Behandlung).
Die Lösung: WASM-Ausführung läuft jetzt in einem **isolierten
Kindprozess** — stürzt dieser ab, bleibt der Hauptserver unberührt.
**Beim Portieren dieses Musters unbedingt beibehalten**: Fuel-/
Speichergrenzen allein garantieren keine Sicherheit vor unbekannten
Bugs in der Ausführungs-Engine selbst; eine Prozessgrenze als
zusätzliche, vom Laufzeitsystem unabhängige Verteidigungsschicht ist
notwendig. Details siehe PORTING.md (Abschnitt „world-lab", Japanisch)
und CLAUDE.md, Eintrag 2026-08-24 (Fortsetzung 8).


## world-lab: weitere Erkenntnisse aus Phase 3 (2026-08-24)

Bei der Umsetzung der UI-Anbindung, Nebenläufigkeitsbegrenzung und
erneuten Sicherheitsprüfung: (1) gemeinsame JSON-Body-Lese-Hilfsfunktionen
nicht ungeprüft für Endpunkte mit beliebig großen Eingaben wiederverwenden
— eine dedizierte, mit `http_body_util::Limited` gestreamte Variante ist
für „beliebige Berechnung"/„beliebige Datei" nötig, da die Größenprüfung
sonst erst nach dem vollständigen Lesen (bzw. Base64-Dekodieren) greift.
(2) Nebenläufigkeitsbegrenzung braucht neben dem `Semaphore` einen
separaten Zähler für Wartende, da unbegrenztes Warten selbst zur
Ressourcenerschöpfung werden kann. (3) Ein Versionswechsel der Sandbox-
Engine (wasmtime) garantiert nicht, dass ein gefundener Absturz behoben
ist — erst nach echtem Reproduktionstest mit der neuen Version davon
ausgehen. Details siehe PORTING.md (Abschnitt „world-lab", Japanisch).


## world-lab: Massenoperationen (2026-08-25)

Beim Hinzufügen von `bulk_pair()`: intern denselben einzelnen `pair()`-
Aufruf wiederverwenden (keine separate, laxere Validierungslogik für den
Massenfall). Teilerfolge zulassen statt alles abzubrechen, wenn ein
Eintrag ungültig ist. Eine feste Obergrenze für die Stapelgröße setzen.

## Multi-LLM-Anbieter-Priorität-Panel (2026-08-26)

Die serverseitige Implementierung liegt in `aruaru-llm`
(`chat_providers.rs` / `provider_priority.rs`). Die open-english-Seite
enthält nur die UI — API-Schlüssel werden wie beim Google-Search-Setup
nur im lokalen Speicher des Browsers gespeichert und bei jedem Speichern
als Laufzeiteinstellung an `POST /v1/settings/chat-providers` /
`POST /v1/settings/provider-priority` gesendet. Die Reihenfolge kann
sowohl per Zahleneingabe als auch per nummeriertem Radiobutton geändert
werden — beide müssen dieselbe `setPosition()`-Funktion durchlaufen
(Duplikate werden per Tausch aufgelöst). Beim Öffnen des Panels sollte
der tatsächliche Serverstatus abgerufen werden (`GET`-Endpunkte), damit
bereits per Umgebungsvariable konfigurierte Anbieter sichtbar sind.
Details siehe japanische PORTING.md.

## Genauigkeit der Suchkontext-Nutzung ≠ GPU-Geschwindigkeit (2026-08-26)

Beim Portieren von `/v1/generate-with-search` nicht verwechseln: "Such-
ergebnisse werden in den Prompt eingebettet" ist nicht dasselbe wie
"das Modell nutzt diesen Kontext korrekt". GPT-2-Modelle (ohne
Instruction-Tuning) bieten keine solche Garantie, und `open-directx`/
`open-cuda` sind Geschwindigkeits-Infrastruktur für GPU-Inferenz, keine
Genauigkeits-Infrastruktur. Untersuchung möglicher Abhilfen ist als
Aufgabe in `aruaru-llm/CLAUDE.md` (2026-08-26) vermerkt, aber noch
nicht begonnen.

## Update (2026-08-27)

VPS-Deployment (vor jeder nginx-Konfigurationsänderung mit `ss -tlnp`
prüfen, ob nginx oder ein anderer Prozess tatsächlich den Traffic
verarbeitet), Netzwerkstatus-Badge erkennt nur die lokale Bindung, keine
Reverse-Proxy-Situation, einklappbare Panels zu einer einzigen
wiederverwendbaren Hilfsfunktion verallgemeinert, GitHub-Agent live
getestet (Token nur in der VPS-Shell gelesen, nie geloggt). Vollständige
Details nur auf Japanisch.
