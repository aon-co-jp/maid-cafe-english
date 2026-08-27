# PORTING.md — Guida al porting di open-english (versione condensata)

> **Da (2026-08-27)**: nuovi pattern — cassaforte iframe cross-origin per segreti, helper di cifratura generico (`owEncryptSecret`/`owDecryptSecret`) — vedi PORTING.md (giapponese) per le voci del 2026-08-27.


> **Nota**: questa è una traduzione condensata. La guida tecnica
> completa con dettagli di codice e insidie resta disponibile solo in
> giapponese in [PORTING.md](PORTING.md) — consultarla prima di
> adottare effettivamente un pattern.

Riepilogo dei pattern di implementazione riutilizzabili di questo
progetto, nel caso vengano portati in un altro progetto:

1. **Pattern di integrazione con `aruaru-llm`**: richiede supporto
   CORS (`.with_cors()`) e una penalità di ripetizione
   (`generate_with_repetition_penalty`, predefinita 1,3) lato
   `aruaru-llm`, altrimenti il browser blocca `fetch()` oppure il
   greedy decoding di GPT-2 cade in un loop di ripetizione.
2. **Estrazione della lingua per il TTS** (`extractSpeechText`): separa
   le righe bilingue nel formato "English / 日本語" prima di passarle a
   `SpeechSynthesisUtterance`, per evitare una pronuncia a scatti.
3. **Set di icone di avvio** (`icons/` + `manifest.json` +
   `launchers/`): encoder PNG/ICO scritto a mano senza strumenti
   grafici esterni, più script per `.lnk` Windows, `.desktop` Linux e
   `.app` macOS.
4. **Auto-aggiornamento** (`auto-update.js` + `version.json`): semplice
   polling del `buildId` ogni 5s con `location.reload()`.
5. **Server statico basato su RPoem** (`server/`): sostituisce
   `python3 -m http.server` con un crate Rust che riusa lo
   `static_file_handler` di `open-runo-poem-compat`.
6. **Garanzia strutturale delle risposte ibride** (`ensureHybridReply`):
   aggiunge automaticamente una breve nota in giapponese se la risposta
   del modello non contiene giapponese — senza esagerare la qualità
   della traduzione.
7. **Gestione delle versioni + pulizia lato browser delle versioni
   vecchie**: `version.json` con campo `version`, cancellazione delle
   chiavi `localStorage` proprie dell'app alla nuova versione.
8. **Bridge Google Custom Search JSON API + pannello impostazioni nel
   browser**: credenziali solo in memoria di processo, mai su disco.
9. **Installer Windows (Inno Setup) — passi di verifica reale**:
   `PrivilegesRequired=lowest` contro i blocchi UAC,
   `MSYS_NO_PATHCONV=1` per installazioni silenziose da Git Bash.
10. **DB geo/turistico con avvisi di sicurezza guidati dal tema**:
    ricerca per sottostringa invece di corrispondenza esatta; per
    argomenti pericolosi (es. alpinismo) allegare sempre un avviso di
    sicurezza.
11. **Auto-aggiornamento tramite GitHub Releases (Windows/Linux/macOS,
    vedi anche il punto 14 per il rollback)**: deve essere implementato
    lato nativo (non nel JS del browser); il proprio .exe in esecuzione
    non può essere eliminato su Windows — avviare prima uno script
    batch distaccato, poi terminare il proprio processo.
12. **Le classi CSS dei modali richiedono `max-height`/`overflow-y`**:
    ogni classe contenitore di modale deve definire la scorribilità,
    altrimenti i contenuti lunghi non sono raggiungibili su mobile.
13. **Inclusione di un server Rust su Android**: rendere i percorsi
    sovrascrivibili a runtime tramite variabile d'ambiente; proteggere
    sempre la logica di auto-aggiornamento specifica di Windows con
    `cfg!(target_os = "windows")`.
14. **Auto-aggiornamento multipiattaforma con rollback guidato da
    health-check**: generalizzare `apply_update_linux` in
    `apply_update_unix` (Linux e macOS condividono la sostituzione del
    binario in esecuzione); salvare il binario attuale prima di
    applicare un aggiornamento; dopo l'avvio della nuova versione,
    interrogare un nuovo endpoint `/healthz` entro un breve periodo e
    ripristinare il salvataggio in caso di fallimento. Android/iOS
    restano esplicitamente fuori dall'ambito (limite della piattaforma,
    non una dimenticanza).
15. **Promozione + installazione automatica di RSync**: se `rsync`
    manca, mostrare un messaggio bilingue invitante ("Let's install
    RSync!") invece di un errore secco, poi tentare un'installazione
    automatica tramite una catena di gestori di pacchetti in base al
    SO (winget→choco su Windows, apt-get→dnf→pacman su Linux, brew su
    macOS, pkg su Termux/Android), proseguendo direttamente con il
    backup in caso di successo.
16. **Pagina d'ingresso dedicata per un canale di accesso limitato**
    (es. `facebook.html` per utenti limitati all'accesso da Facebook):
    una semplice pagina statica che riutilizza i link di download già
    presenti nel README, con una divulgazione onesta ed esplicita che
    non si ottiene un accesso gratuito ufficiale di tipo "zero-rated"
    — solo un punto d'ingresso alternativo.

*(Nota sulla traduzione automatica: le voci da 14 a 16 sono state
tradotte dall'agente IA stesso, senza revisione da parte di un
madrelingua.)*

**Avvertenza importante**: questo progetto è un prototipo di Fase 0 —
qualità delle risposte AI (basata su GPT-2), naturalezza della sintesi
vocale e adattamento affidabile al livello non sono garantiti. Questo
va reso esplicito anche in ogni porting.

---

Altre lingue: [日本語 (originale, dettagli completi)](PORTING.md) ·
[Deutsch](PORTING-German.md) · [Français](PORTING-French.md) ·
[Русский](PORTING-Russian.md) · [Українська](PORTING-Ukrainian.md) ·
[עברית](PORTING-Hebrew.md) · [فارسی](PORTING-Persian.md)

## Schema: esami originali multilingue + selezione lingue + lettura (2026-08-22)

1. Separare i dati in due file: domande d'esame e frasi per la lettura
   hanno scopi diversi.
2. Esporre un'API di riepilogo senza i testi delle domande
   (`GET /v1/world-languages`) e caricare il JSON completo solo all'avvio
   del test.
3. Non riscrivere l'interfaccia d'esame esistente: aggiungere solo un
   `<optgroup>` con valori `world:<code>` e riusare correzione e
   proseguimento verso il tutor.
4. Imporre minimo e massimo di lingue nelle caselle di spunta;
   disabilitare **solo quelle non spuntate** al raggiungimento del limite.
5. Riusare il TTS esistente aggiungendo solo la mappa codice → BCP-47;
   dichiarare che senza voce installata il testo è solo visualizzato.
6. Mostrare i testi in `<textarea>` `readonly` (copiabili) e salvare
   usando l'endpoint di persistenza già esistente, senza nuove tabelle.

## Schema: risposte a testo fisso basate su regole per temi delicati (2026-08-23)

1. Tre elementi: funzione di rilevamento per parole chiave + tabella di
   testi con codice lingua come chiave + funzione che compone la risposta
   bilingue. Va inserita nell'handler di invio **prima** del percorso AI.
2. Combinare parola-tema E parola-intento, così un "Iran" occasionale non
   dirotta la conversazione normale. Per l'inglese mettere il confine di
   parola `\b` **solo all'inizio**, altrimenti sfugge "Zoroastrianism"
   (bug realmente incontrato).
3. Valutare prima i temi più specifici (666 prima della storia religiosa).
4. Scrivere le garanzie di onestà dentro il testo stesso: le tesi si
   **presentano**, le leggende metropolitane si **dichiarano tali** (se
   possibile con la spiegazione tecnica, come per le barre di guardia), le
   coincidenze si **dichiarano coincidenze**; i "paralleli interessanti"
   tra testi antichi e situazione odierna si **presentano solo come
   possibilità** ("c'è chi lo dice") e mai come profezia avverata (esempio:
   Apocalisse 13,16-17 "senza il marchio non si compra né si vende" accostato
   a codici a barre e pagamenti online come Amazon).
5. Documentare ciò che è stato escluso e perché — nel testo di risposta e
   in un commento nel codice ("leggere prima di modificare").
6. Le cautele necessarie **non devono essere formule rigide da disclaimer**:
   un tono leggero e cordiale ("da prendere come una curiosità più che come
   una prova solida") va benissimo, purché al lettore risulti chiaro che
   non si sta dimostrando nulla. Il criterio è "si sta affermando qualcosa
   come un fatto?", **non il tono**. L'alleggerimento però non deve mai
   scivolare in formulazioni che suonano come un'affermazione ("la profezia
   si è avverata", "sta accadendo davvero").

## Schema: quiz a testo fisso con risposta in due fasi (2026-08-23)

1. Stessa triade dello schema precedente (rilevamento + tabella di testi +
   funzione di composizione), qui `isQuizRequest()` / `QUIZ_TEXTS` /
   `quizQuestionText()` e `quizAnswerText()`. L'indovinello è a testo
   fisso perché un modello linguistico, messo a calcolare, produce
   risultati sbagliati dall'aria convincente: inaccettabile per un
   problema con un'unica soluzione verificabile.
2. **Due fasi senza macchina a stati**: basta un singolo flag a livello di
   modulo (`quizAwaitingAnswer`) — prima il problema, poi, dopo "non lo so"
   / "dimmi la risposta", la soluzione. Niente automa di dialogo, niente
   oggetto di sessione.
3. Il controllo "sta aspettando la risposta" va messo **prima** di quello
   su una nuova richiesta di quiz, altrimenti "dammene un altro" prevale
   sulla risposta attesa. Parole molto generiche ("non lo so") sono
   innocue purché vengano valutate **solo** quando il flag è attivo:
   diversamente dirottano la conversazione normale.
4. **Tenere onesta la copertura linguistica**: il testo predefinito è
   bilingue; per le lingue realmente tradotte (qui ja/en/es/fr/de/zh/ko) si
   antepone la traduzione, tutte le altre ricevono il predefinito. Non
   riempire l'elenco con traduzione automatica per simulare una copertura
   totale — ampliare significa aggiungere una voce vera alla tabella, con
   il codice lingua come chiave.
5. Nel portare indovinelli: rifare i calcoli della soluzione e dichiarare
   nel testo che si tratta di un **problema autentico e verificabile**, non
   di un tranello, altrimenti il lettore cerca dalla parte sbagliata.

## Schema: riusare l'ossatura di un corso esistente per un altro pubblico (2026-08-24)

La scuola virtuale e la scuola di formazione professionale usano **lo stesso schema del
corso di ripetizioni**, cambiando soltanto il pubblico.

- Bastano tre tabelle di dati: le categorie (con un campo `mode` che separa i due tipi di
  scuola), gli ambiti per categoria e le domande sotto la chiave `<categoria>:<ambito>`.
  Non introdurre concetti nuovi.
- **Una sola finestra modale per entrambi i tipi di scuola**: una funzione sostituisce
  titolo e intestazione e filtra l'elenco delle categorie in base a `mode`. Niente HTML
  duplicato. Al cambio di modalità scartare selezione e ambiti installati.
- **Segnalare sempre i contenuti mancanti come «non ancora pronti»**: disattivare la
  casella e mostrare «N ambiti su M disponibili» sul pulsante di categoria, così la
  copertura si vede prima ancora di aprire. Se una categoria è del tutto vuota, dirlo
  esplicitamente.
- **YouTube solo come collegamento ai risultati di ricerca** (parola chiave codificata
  nell'URL), con `rel="noopener noreferrer"` e una nota che nessun video è raccomandato.
- **I formati che non si prestano alla correzione automatica** (tema, colloquio, pratica)
  vanno presentati come semplici approssimazioni, mai come funzionalità.
- Salvare i risultati tramite lo storico esistente, cambiando soltanto il ruolo.
- Diritto d'autore: documentarsi sulle tendenze generali delle prove, ma scrivere da sé
  tutti i testi delle domande.


## Guida alla carriera (2026-08-24)

Aggiunta una tabella leggera `TUTOR_CAREER_GUIDANCE` (per materia, non
per domanda) mostrata sotto ogni domanda del corso di ripetizioni, con
settori/mestieri utili e possibili ruoli avanzati, sempre con linguaggio
prudente. Dettagli e fonti sul sistema duale tedesco in PORTING.md (§17,
giapponese).

## Aggiornamento (2026-08-27)

Distribuzione VPS (verificare con `ss -tlnp` prima di modificare la
configurazione nginx se sia effettivamente nginx o un altro processo a
gestire il traffico), il badge di stato della rete rileva solo il bind
locale, non un reverse proxy, pannelli comprimibili generalizzati in
un'unica funzione riutilizzabile, agente GitHub testato dal vivo (token
letto solo nella shell del VPS, mai registrato). Dettagli completi solo
in giapponese.
