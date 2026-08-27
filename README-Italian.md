# open-english

> 📌 **Aggiornamento (2026-08-27)**: Aggiunto un «Angolo sviluppo freelance» (100 lingue, link per la ricerca di lavoro, passaggio all'insegnante IA), una cassaforte iframe cross-origin (`vault.html`) che isola il token GitHub e la chiave API di Google Search dalla pagina principale, un secondo indirizzo email di backup per il login e una scorciatoia per avviare Chrome in incognito. Corretti due bug reali trovati tramite test dal vivo nel browser (perdita di chiave obsoleta, messaggio di stato fuorviante in modalità cassaforte). Dettagli completi nelle voci del 2026-08-27 in CLAUDE.md (giapponese).


> 📌 **Aggiornamento (2026-08-24, seguito 2): aggiunta la "Guida alla
> carriera" al corso di ripetizioni per anno scolastico.** La schermata
> degli esercizi ora mostra, per ogni materia, i settori/mestieri a cui
> potrebbe essere utile e i ruoli avanzati che si potrebbero perseguire
> approfondendola — sempre con un linguaggio prudente ("potrebbe aiutare",
> mai una promessa di lavoro garantito). Progettazione ispirata a una
> ricerca reale sul sistema duale tedesco di formazione professionale
> (Berufsschule, qualifiche IHK, Ausbildung). Dettagli e fonti in CLAUDE.md.

> 📌 **Ultimo aggiornamento (2026-08-24, seguito 6): citazioni/proverbi +
> messaggio motivazionale + nuova materia "Communication & Questioning
> Skills"**: ogni riquadro di orientamento professionale mostra ora una
> citazione/proverbio bilingue (italiano/inglese, es. "Strike while the
> iron is hot") e un messaggio motivazionale prudente (non una garanzia)
> che esprime la speranza che chi impara possa trovare lavoro, cambiare
> carriera e mantenersi ovunque vada. Una nuova materia (medie/superiori)
> insegna espressioni inglesi reali per discussioni ipotetiche costruttive
> e feedback costruttivo. Dettagli in CLAUDE.md.

> 📌 **Ultimo aggiornamento (2026-08-24, seguito): auto-riparazione del DUAL DB
> (ritentativi automatici della coda) + supporto TLS per la connessione
> PostgreSQL + supporto al metodo HTTP HEAD**:
> - **Auto-riparazione del DUAL DB**: ciò che finora era documentato come «non
>   implementato» ora è implementato. Una scrittura verso il mirror che
>   fallisce viene accodata in una tabella SQLite locale `mirror_outbox` e
>   ritentata automaticamente da un'attività in background (ogni 60 secondi
>   per impostazione predefinita). Le righe vengono ritentate fino a 100 volte
>   per impostazione predefinita; quelle che continuano a fallire non vengono
>   scartate in silenzio — sono marcate `give_up` e i conteggi sono visibili
>   tramite `GET /v1/db/info` (`mirror_outbox_pending`/
>   `mirror_outbox_given_up`). **Limiti onesti**: sono coperte solo le
>   scritture che questo stesso processo ha tentato e fallito — righe
>   cancellate direttamente sul mirror, o modifiche fatte da un altro
>   percorso, non possono essere rilevate. I ritentativi sono semplici
>   INSERT, quindi un raro duplicato "at-least-once" è possibile.
> - **Supporto TLS**: aggiunto `tokio-postgres-rustls`, così la connessione
>   mirror a PostgreSQL può ora usare `sslmode=require` ecc. verso un database
>   gestito (`sslmode=disable`, il valore predefinito, mantiene invariato il
>   comportamento in chiaro esistente).
> - **Supporto HTTP HEAD**: il server di file statici ora risponde
>   correttamente alle richieste `HEAD` (prima restituiva 404/405, il che
>   conta nella pratica perché molti client HTTP e strumenti di health-check
>   usano HEAD per le loro verifiche). Ciò ha richiesto di aggiungere
>   `MethodRouter::head` alla facciata condivisa `RPoem`
>   (`open-runo-poem-compat`) — puramente additivo, nessuna API esistente è
>   cambiata.
> - **Nuovo alias `/health`**: aggiunto accanto all'esistente `/healthz`
>   affinché la forma del controllo di salute di questa app corrisponda a
>   quanto altri repo di questo ecosistema si aspettano genericamente nel loro
>   schema di registrazione dei tenant "tecnica del sosia" (分身の術)
>   (open-web-server / open-easy-web).
> - `GET /v1/db/info` ora riporta anche `rsync_available` (una verifica reale
>   con `rsync --version`), così si può controllare se rsync è disponibile
>   prima di provare `/v1/db/rsync-backup`.
> - Verificato con `cargo build`/`cargo test` (18/18 verdi) più un binario
>   realmente in esecuzione: `HEAD /` e `HEAD /app.js` restituiscono il
>   corretto Content-Length/Content-Type con corpo vuoto, `GET /health`
>   restituisce `{"ok":true}`, e `GET /v1/db/info` include `rsync_available`.

> 📌 **Ultimo aggiornamento (2026-08-24): una scuola virtuale (istruzione
> superiore) e una scuola di formazione professionale online virtuale**:
> - **🏫 Scuola virtuale** propone quattro categorie — istituto professionale
>   (senmon gakko), istituto universitario biennale, università (triennale) e
>   scuola di dottorato. Si scelgono gli ambiti, li si installa e l'app propone
>   **domande originali** ispirate a esami di ammissione, lezioni e verifiche,
>   correggendo le risposte.
> - **🛠 Scuola di formazione professionale virtuale** funziona allo stesso modo
>   per settori e mestieri.
> - **Oggi funzionano davvero sette ambiti, con cinque domande ciascuno**:
>   università = discipline umanistiche e sociali / scienze e ingegneria; istituto
>   professionale = informatica; dottorato = fondamenti della ricerca (progetto di
>   ricerca, etica della ricerca, colloquio); formazione professionale = basi di
>   informatica e programmazione, basi di contabilità, basi del servizio al cliente.
> - **Tutto il resto indica onestamente «non ancora pronto»** (segreteria medica,
>   assistenza alla persona, estetica, cucina, edilizia, **tutti e quattro gli ambiti
>   dell'istituto biennale**, area medico-infermieristica, scienze dell'educazione e
>   altro). Ogni pulsante di categoria mostra «N ambiti su M disponibili».
> - Ogni ambito riporta un collegamento a una **pagina di risultati di ricerca YouTube**
>   con una parola chiave generica. **Nessun video specifico viene indicato come corretto.**
> - **Divulgazione onesta**: tutte le domande sono originali; nulla è copiato da esami
>   di ammissione reali, manuali o eserciziari commerciali. **Tema scritto, colloquio e
>   prove pratiche sono soltanto approssimati come domande a scelta multipla** e non
>   sostituiscono una correzione reale né un vero allenamento al colloquio. Il punteggio
>   non dice nulla su ammissioni o qualifiche reali.
> - I risultati sono salvati tramite lo storico esistente (`/v1/db/history`); non è
>   stata aggiunta alcuna nuova API.

> 📌 **Ultimo aggiornamento (2026-08-23, seguito 4)**: **funzione quiz con
> un indovinello originale dell'autore**. Se si scrive "proponimi un
> problema", "fammi un quiz" o "give me a quiz", l'app propone un
> problema originale di **Masahiro Ishizuka (石塚正浩)**, autore di questa
> applicazione: usando **quattro cifre 9** — `9 ◯ 9 ◯ 9 ◯ 9 = 10` — al
> posto di ogni ◯ va messo uno fra i segni `+`, `-`, `×`, `÷` (lo stesso
> segno può ripetersi); se serve, le parentesi ( ) possono cambiare
> l'ordine delle operazioni. Il risultato deve fare **esattamente 10**.
> La soluzione è `(9 × 9 + 9) ÷ 9 = 10` (9×9=81, 81+9=90, 90÷9=10). Non è
> un gioco di parole né un tranello: sono **solo le quattro operazioni**,
> verificabili con una calcolatrice o con un pallottoliere. Curiosità: la
> persona più giovane che finora l'ha risolto era un bambino di **prima
> elementare**. Lo scambio avviene in **due fasi** — prima compare solo il
> testo del problema, e la soluzione appare soltanto quando si scrive
> "non lo so" oppure "dimmi la risposta".
> **Multilingua e il suo limite dichiarato**: per impostazione predefinita
> il testo è bilingue giapponese + inglese; chi ha scelto es/fr/de/zh/ko
> come lingua di studio o lingua madre riceve la traduzione in testa. Le
> traduzioni esistono **solo per queste sette lingue** (ja/en/es/fr/de/zh/
> ko): le 130 lingue supportate **non** sono state riempite con traduzione
> automatica per far sembrare che ci sia una copertura totale, e chi usa
> un'altra lingua riceve il testo bilingue predefinito. Come già per le
> risposte su "chi ha creato l'app", sulla storia religiosa e sul "666",
> anche questa è una **risposta a testo fisso basata su regole, senza
> inferenza AI** — un GPT-2 grezzo produrrebbe calcoli sbagliati dall'aria
> convincente. Il **conteggio giornaliero di utilizzo non viene consumato**.

> 📌 **Ultimo aggiornamento (2026-08-23, solo formulazione)**: tre punti
> della risposta a testo fisso su "666 / marchio della bestia" sono stati
> **riscritti sul piano stilistico** — il gioco di parole "666 = WWW", la
> leggenda del codice a barre e la nota su Apocalisse 13,16-17 accostata agli
> acquisti moderni fra codici a barre e Amazon. Le formule di cautela
> rigide ("mai come l'affermazione che una profezia si sia avverata") sono
> state sostituite da un tono più leggero e cordiale: **"da prendere come
> una curiosità più che come una prova solida"**. **Il vincolo resta
> identico**: nulla è affermato come profezia avverata, il 666 nei codici a
> barre resta esplicitamente una **leggenda metropolitana senza fondamento
> tecnico** (Snopes: FALSA; le barre di guardia sono larghe 3 moduli invece
> di 7), e il serpente di Python resta **pura coincidenza**. È cambiato solo
> lo stile — l'obiettivo era leggibilità e garbo, non meno onestà.

> 📌 **Ultimo aggiornamento (2026-08-23)**: aggiunte due **risposte a testo
> fisso, scritte a mano e basate su regole** (bilingui JA/EN, senza
> inferenza AI).
> **(1) Islam, Iran/Persia e mondo arabo**: alle domande su storia e radici
> si risponde con una sintesi neutrale e basata sui fatti — le comunità
> cristiane dell'Arabia preislamica (Najran, Ghassanidi), la formazione del
> Corano che gli studi descrivono come **tradizione autonoma e distinta**,
> la differenza fra civiltà iranica e araba e l'influenza zoroastriana,
> quest'ultima presentata espressamente solo come **"tesi sostenuta da
> alcuni studiosi"** e non come fatto acquisito. Due affermazioni che si
> voleva includere (il Corano nato da una traduzione della Bibbia; un
> fratello di Maometto come traduttore) sono state **deliberatamente
> escluse per mancanza di riscontri nelle fonti**. Chiude il messaggio che
> le barriere linguistiche alimentano i malintesi e che **traduzione
> automatica e dialogo multilingue possono favorire comprensione e pace**.
> **(2) "666 è il marchio della bestia?"**: una risposta leggera in forma
> di curiosità. Cita il passo dell'Apocalisse in modo neutrale, presenta il
> gioco di parole moderno **"666 = WWW"** (ghematria ebraica: la lettera
> vav vale 6) **esplicitamente come lettura di alcuni e non come dottrina**,
> segnala la storia del "666 nascosto nei codici a barre" **esplicitamente
> come leggenda metropolitana** e ne spiega la tecnica reale: le barre più
> lunghe alle estremità e al centro sono le **barre di guardia** (marcatori
> di inizio, fine e separazione per lo scanner); *somigliano* soltanto alla
> cifra 6 ma usano una codifica diversa (3 moduli invece di 7) — i
> fact-checker come Snopes valutano l'affermazione FALSA: **nessun
> significato occulto e nessun fondamento tecnico**. Segue la chiusura
> positiva: web e scanner hanno reso comodi acquisti e spesa **senza che
> nessuno debba portare un marchio sul corpo**; infine la nota che il logo
> di Python è un serpente ma il nome viene dalla serie comica "Monty
> Python's Flying Circus" — la somiglianza con la "bestia" è **dichiarata
> pura coincidenza e gioco di parole**, senza alcun legame reale.
> **Aggiunta del 2026-08-23**: un'ulteriore nota ricorda che Apocalisse
> 13,16-17 contiene davvero un passo secondo cui nessuno senza il marchio può
> comprare o vendere, e che **alcune persone vi notano un parallelo
> interessante** con il fatto che fare acquisti oggi dipende sempre più da
> codici a barre e pagamenti online come Amazon — **proposto solo come una
> coincidenza che alcuni trovano curiosa, mai come l'affermazione che una
> profezia si sia avverata**.
> Dettagli negli HANDOFF del 2026-08-23 in [CLAUDE.md](CLAUDE.md).

> 📌 **Ultimo aggiornamento (2026-08-22)**: aggiunti **esami di pratica
> per le lingue del mondo, un'interfaccia di selezione delle lingue e la
> visualizzazione e lettura ad alta voce sequenziale multilingue**.
> Inglese e giapponese restano le lingue predefinite, ma tramite un
> banner bilingue e il pannello "🌐 Languages" è possibile attivare set
> di esercizi originali per **38 lingue** (Europa, Medio Oriente, Asia,
> India, Africa). Dopo la correzione, le domande sbagliate portano alla
> conversazione con il tutor di quella lingua, esattamente come nel
> flusso Eiken/TOEIC/TOEFL/JLPT già esistente. Si possono inoltre
> selezionare **da 2 a 5 lingue** (inglese e giapponese inclusi) per
> vedere e ascoltare la stessa frase in sequenza, riascoltabile quante
> volte si vuole, con copia/incolla, download .txt e salvataggio nel
> database SQLite locale. Dichiarazione onesta: sono domande originali
> scritte per questa app, non prove d'esame reali e senza alcun legame
> con certificazioni ufficiali (DELE, DELF, Goethe-Zertifikat, HSK,
> TOPIK…). I livelli in stile CEFR (A1–C2) sono solo indicativi, il
> numero di domande è disomogeneo (3–6 per lingua) e la lettura usa la
> Web Speech API del browser: senza una voce installata il testo viene
> solo visualizzato. Dettagli nel HANDOFF del 2026-08-22 in
> [CLAUDE.md](CLAUDE.md).

> 📌 **Ultimo aggiornamento (2026-08-18)**: Aggiunto un vero database
> locale per cronologia chat/impostazioni (SQLite + specchio opzionale
> auto-riparante `aruaru-db`/PostgreSQL), oltre alle API per la scelta
> della posizione di archiviazione, il backup rsync e l'importazione di
> dati legacy. Se `rsync` non è installato, l'app mostra un messaggio
> bilingue **"Let's install RSync!"** e può installarlo automaticamente
> tramite il gestore pacchetti del sistema operativo, eseguendo poi
> subito il backup. Dettagli in [CLAUDE.md](CLAUDE.md) (voci HANDOFF del
> 2026-08-18, in giapponese).

> 📌 **Aggiornamento precedente (2026-08-11–12, v0.6.0)**: Android/tablet ora
> funziona in modo completamente autonomo, senza bisogno di un PC o di
> un server Linux. Il motore di risposta AI (`aruaru-llm`) è ora
> integrato direttamente nell'APK; la verifica sul dispositivo ha
> confermato che entrambi i processi restano attivi e rispondono a
> `/healthz`/`/v1/chat`. Aggiunto anche: un angolo di preparazione agli
> esami di certificazione (Eiken 1-5, TOEIC, TOEFL, JLPT N1-N5, Nihongo
> Kentei 1-3, 10 domande originali ciascuno) che, dopo la valutazione,
> passa le domande sbagliate al tutor AI (passaggio automatico alla
> modalità "aula di giapponese" per JLPT/Nihongo Kentei), un selettore
> "quale lingua vuoi imparare" e installer Linux/macOS
> (`installer/unix/install.sh`). Divulgazione onesta: i pesi del
> modello (famiglia GPT-2, modello di embedding) non sono inclusi
> nell'APK: usare la chat AI su Android richiede ancora di posizionare
> manualmente i file del modello nella memoria interna (nessun download
> automatico per ora). Vedi le voci HANDOFF del 2026-08-11 (continua
> 7-10) in [CLAUDE.md](CLAUDE.md).

> 📌 **Aggiornamento precedente (2026-08-11, continua 3)**: Aggiunta
> l'auto-aggiornamento (solo Windows) che al avvio controlla l'ultima
> versione su GitHub e, se più recente, disinstalla automaticamente la
> vecchia e installa la nuova. Divulgazione onesta: non esiste ancora
> alcuna GitHub Release, quindi il flusso completo di disinstallazione→
> installazione non è ancora stato verificato end-to-end (la logica di
> confronto versioni e il percorso "nessuna release trovata, continua
> in sicurezza" sono stati verificati).

> 📌 **Aggiornamento precedente (2026-08-11, continua 2)**: Aggiunto il
> rilevamento di argomenti su ricerca di lavoro/cambio carriera/turismo
> che presenta aruaru.tokyo, audiocafe.tokyo/aruaru, audiocafe.tokyo/
> aruaru-lady e nasa.tokyo sia in inglese che in giapponese — funziona
> sia in chat normale che in modalità training, verificato dal vivo.

> 📌 **Aggiornamento precedente (2026-08-11, continua)**: Collegato a un
> nuovo database geo/turistico (tutte le 47 prefetture giapponesi, i 50
> stati USA, le principali capitali mondiali con luoghi d'interesse/
> cibo/souvenir) per rendere dinamico il training di auto-presentazione.
> Quando si parla del Monte Fuji, l'app mostra ora un avviso di
> sicurezza bilingue (indossare abbigliamento da sci + casco, prenotare
> in anticipo un rifugio) più informazioni reali su rifugi/bus/negozi di
> attrezzatura e una ricerca di prenotazione tour. Aggiunta UI di
> selezione fascia d'età/livello/inglese business. Verificato dal vivo
> con `aruaru-llm` + server statico realmente in esecuzione (trovati e
> corretti 3 bug reali).

> 📌 **Aggiornamento precedente (2026-08-11)**: Aggiunto un pannello di
> impostazioni per salvare la propria chiave API di Google Search/cx
> direttamente dal browser (`POST /v1/settings/google-search`, solo in
> memoria, mai scritto su disco). L'installer Windows
> (`installer/windows/`, Inno Setup) è stato effettivamente compilato,
> installato, avviato e disinstallato su hardware reale (senza
> privilegi di amministratore).

> 📌 **Aggiornamento precedente (2026-08-10, continua)**: (1) Passato dal
> modello predefinito `gpt2` (124M) a `distilgpt2` (82M), ~42% più
> veloce. (2) Deciso di **non** portare il JS del frontend a Rust/WASM
> (nessun vantaggio in termini di prestazioni, e `SpeechRecognition` non
> ha un binding web-sys standard) — invece è stato **portato a Rust il
> server dei file locale** (nuovo crate `server/`, basato su
> `open-runo-poem-compat` di RPoem, eliminando la dipendenza da
> `python3 -m http.server`). (3) Migliorata la gestione dell'input in
> giapponese così che le risposte ibride (inglese+giapponese) siano
> sempre garantite. (4) Aggiunta la gestione delle versioni
> (`version.json` con un campo `version` semantico, mostrato a piè di
> pagina) e la pulizia automatica delle tracce lato browser delle
> versioni precedenti.

> 📌 **Aggiornamento recente (2026-08-10)**: Aggiunto supporto CORS,
> risolta alla radice la ripetizione degenerata del greedy decoding di
> GPT-2 (`generate_with_repetition_penalty` di `open-cuda`, penalty
> predefinita 1,3), ritoccato l'aspetto del personaggio Tora-san +
> aggiunto un jingle al cambio personaggio + corretta la sua auto-
> presentazione, aggiunto un passo di training basato sulla tecnica di
> servizio clienti reale di un vero maid café di Akihabara
> (@ほぉ～むカフェ), ricercato e aggiunto un passo sul boom attuale
> all'estero della cultura giapponese (anime/manga, canzoni anime,
> videogiochi, studenti di giapponese, collezione di goshuin, turismo
> onsen/ryokan, cibo giapponese), aggiunte icone di avvio per
> Windows/Mac/Linux/Android/iPhone/iPad e implementato un meccanismo di
> auto-aggiornamento.

Un'app web (Fase 0) per l'apprendimento della conversazione in inglese,
utilizzabile da PC/tablet/smartphone. In stile "lezione di inglese in un
maid café", un personaggio maid da maga (design originale, animato)
accompagna gli studenti dal principiante assoluto all'avanzato.

## Architettura (su indicazione dell'utente, 2026-08-10)

- **Lato Linux (VPS)**: solo un server di distribuzione per il
  download (non è dove gira effettivamente l'app). La gestione
  dell'app è affidata a
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Lato dispositivo dell'utente (PC/tablet/telefono)**: il frontend
  web statico di questo repo (HTML/CSS/JS, gira nel browser) + un
  server nativo eseguito localmente da
  [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) (che usa
  internamente i backend di inferenza di `open-directx`/`open-cuda`),
  scaricato ed eseguito dall'utente stesso. Il browser si connette
  localmente (online od offline) a `http://localhost:4600` (porta
  predefinita di aruaru-llm) — un design "ibrido".

## Ambito attuale (Fase 0) — divulgazione onesta

- **Qualità delle risposte AI**: `/v1/generate` di `aruaru-llm` esegue
  generazione di testo autoregressiva con GPT-2 (124M-1,5B, centrato
  sull'inglese, senza fine-tuning per il dialogo). La fluidità o
  l'adeguatezza al livello non sono garantite — questo è dichiarato a
  schermo, non esagerato. Dal 2026-08-10, una penalità di ripetizione
  (predefinita 1,3) risolve il precedente bug del loop di ripetizione
  infinita.
- **CORS**: risolto dal 2026-08-10 — il server HTTP di `aruaru-llm` ora
  invia header `Access-Control-*`, quindi questo frontend può essere
  aperto cross-origin (o via `file://`) e comunque raggiungere
  `http://localhost:4600`.
- **Selezione del livello**: il selettore di livello da principiante ad
  avanzato esiste nell'interfaccia, ma l'applicazione effettiva del
  livello si limita a una breve istruzione nel prompt — GPT-2 non è
  garantito che la rispetti.
- **Voce/TTS**: la vera Web Speech API (SpeechSynthesis per l'output,
  SpeechRecognition per l'input microfono) è collegata, con
  regolazione di tono/velocità per personaggio.
- **Modalità training**: uno script deterministico di auto-presentazione
  (non generato dall'AI) che ora include anche la tecnica di
  conversazione a parole di un vero maid café di Akihabara e un passo
  che riassume il boom attuale della cultura giapponese all'estero.
- **Icone di avvio**: `icons/` + `manifest.json` (PWA) + `launchers/`
  permettono di avviare l'app da un'icona sul desktop
  (Windows/Mac/Linux) o dalla schermata home (Android/iPhone/iPad).
- **Auto-aggiornamento**: `auto-update.js` interroga `version.json`
  ogni 5s e ricarica la pagina quando cambia il build ID.
  **Limitazione nota**: alcuni browser bloccano `fetch()` di file
  locali sotto lo schema `file://` — funziona garantito se servito da
  un server HTTP locale, altrimenti si disattiva silenziosamente.

## Programmi di installazione necessari (aggiunto il 2026-08-17)

Per eseguire open-english è necessario scaricare e installare i seguenti
due programmi (non serve compilare dal codice sorgente, è quasi un
processo a un tocco).

| # | Cosa | Windows | Linux | Android/tablet |
|---|---|---|---|---|
| 1 | **open-english stesso** (questo repository — frontend statico + server di distribuzione) | [open-english-install.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-install.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest) | [APK](https://github.com/aon-co-jp/open-english/releases/latest) (scegliere l'asset `.apk`) |
| 2 | **aruaru-llm** (il motore di risposta IA — obbligatorio, senza di esso la chat non funziona) | [aruaru-llm-windows-x86_64.zip](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-windows-x86_64.zip) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Già incluso (integrato nell'APK di open-english, non serve installarlo separatamente) |

**Divulgazione onesta**: i link "latest" sopra puntano sempre alla
release GitHub più recente (usare la
[pagina Releases](https://github.com/aon-co-jp/open-english/releases)
direttamente se si desidera una versione specifica fissata). Non esiste
ancora un binario macOS precompilato per `aruaru-llm` (open-english
stesso distribuisce un tar.gz per macOS, ma `aruaru-llm` solo per
Linux/Windows) — su macOS occorre compilare `aruaru-llm` dal codice
sorgente.

Su Windows/Linux/macOS, dopo l'installazione, la funzione di
aggiornamento automatico integrata (`server/src/self_update.rs`,
estesa a Linux e macOS il 2026-08-19) controlla le GitHub Releases
all'avvio e, se esiste una versione più recente, si aggiorna
automaticamente (Windows: disinstallazione→installazione; Linux/macOS:
il binario in esecuzione si sostituisce da solo) — senza alcuna azione
da parte dell'utente. Prima di applicare un aggiornamento, il binario
attuale viene salvato; dopo l'avvio della nuova versione, un controllo
di salute sul nuovo endpoint `/healthz` deve avere successo entro un
breve periodo, altrimenti l'app torna automaticamente (downgrade) alla
versione precedente salvata. **Divulgazione onesta**: Android/iPhone/
iPad sono esclusi da questo meccanismo di aggiornamento/rollback
automatico (il sistema operativo non consente un'installazione APK
completamente silenziosa) — le notifiche di aggiornamento richiedono
ancora un'installazione manuale da parte dell'utente (e non esiste
nemmeno un percorso di downgrade).

È stata inoltre aggiunta una nuova pagina di ingresso, `facebook.html`,
per gli utenti il cui piano mobile consente l'accesso solo a Facebook —
divulgazione onesta: non si tratta di una partnership ufficiale "Free
Basics" con Meta, ma solo di una normale pagina raggiungibile dal
browser integrato di Facebook che rimanda agli installer esistenti.

*(Nota sulla traduzione automatica: questo paragrafo è stato tradotto
dall'agente IA stesso, senza revisione da parte di un madrelingua.)*

## Come avviare l'app

1. Avviare [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) con
   `cargo run --release` (predefinito `http://localhost:4600`, modello
   predefinito ora `distilgpt2`).
2. Nella cartella `server/`, eseguire `cargo run --release` per servire
   il frontend statico di questo repo su `http://127.0.0.1:4601/`
   (basato su RPoem — `python3 -m http.server` non è più necessario;
   porta configurabile con la variabile d'ambiente
   `OPEN_ENGLISH_SERVER_BIND`).
3. Aprire `http://127.0.0.1:4601/` nel browser. Aprire direttamente
   `index.html` via `file://` funziona ancora, ma alcuni browser
   bloccano `fetch()` in quel caso e disabilitano l'auto-aggiornamento
   — è consigliato il server del passo 2.

## Prossimi passi

1. ~~Supporto CORS lato `aruaru-llm`~~ **Fatto (2026-08-10)**.
2. ~~Loop di ripetizione del greedy decoding GPT-2~~ **Causa
   principale risolta (2026-08-10, penalità di ripetizione)**.
3. ~~Velocizzare il modello predefinito~~ **Fatto (2026-08-10, passato
   a distilgpt2, ~42% più veloce)**.
4. ~~Garantire risposte ibride per l'input in giapponese~~ **Fatto
   (2026-08-10)**.
5. ~~Portare in Rust il server dei file locale~~ **Fatto (2026-08-10,
   crate `server/`)**. Portare a Rust/WASM il JS del frontend stesso è
   stato valutato e scartato (nessun vantaggio prestazionale — vedi
   `CLAUDE.md`).
6. Aggiungere rifiniture a TTS/lip-sync.
7. Implementare un curriculum per livello (grammatica, liste di
   vocabolario, ecc.).
8. **(su indicazione dell'utente, 2026-08-10)** Un'idea futura per far
   girare `open-directx`/`open-cuda`/`aruaru-llm` direttamente nel
   browser (WASM/WebGPU) e integrarli con `RPoem` (una piattaforma
   GraphQL Federation). Si tratta di una direzione architetturale
   ampia e separata rispetto all'attuale design di Fase 0, rimandata a
   dopo il completamento dell'MVP.
9. Verificare se le tecniche di Toshiba SBM o della famiglia DeepSeek
   abbiano applicazioni reali qui (non ancora iniziato).

---

Altre lingue: [日本語](README.md) · [English](README-English.md) ·
[Deutsch](README-German.md) · [Français](README-French.md) ·
[Русский](README-Russian.md) · [Українська](README-Ukrainian.md) ·
[עברית](README-Hebrew.md) · [فارسی](README-Persian.md)

---

## 🎓 Corso di ripetizioni: salvare lo storico di apprendimento (consigliato prima di iniziare)

**Prima di usare il corso di ripetizioni consigliamo di configurare un
database per lo storico**: **aruaru-db** oppure un **normale server
PostgreSQL**. Verranno registrati le classi e le materie studiate, gli
esercizi risolti e i risultati dei test, così da poter rivedere in seguito il
proprio percorso. Senza database i punteggi restano solo nel file SQLite
locale incorporato (si perde reinstallando o cambiando dispositivo) e le
scelte di classe/materia solo nel localStorage del browser.

Entrambi si configurano allo stesso modo: `OPEN_ENGLISH_DATABASE_URL` con una
stringa di connessione PostgreSQL (aruaru-db parla lo stesso protocollo).
**Avvertenze oneste**: la connessione è senza TLS, quindi i servizi
PostgreSQL gestiti che richiedono SSL non funzionano ancora, e un PostgreSQL
puro non è stato provato end-to-end nel nostro ambiente.

- **Configurazione doppia (DUAL) — aruaru-db + PostgreSQL**: due database che
  si copiano a vicenda proteggono dal guasto di uno dei due. **Stato reale**:
  open-english scrive su SQLite più *un solo* database; **la scrittura
  simultanea su due database non è ancora implementata**. Oggi il DUAL si
  ottiene con `DUAL_DATABASE_URL` di aruaru-db
  (open-english → aruaru-db → PostgreSQL).
- **Backup con rsync**: il database *può essere aggiunto* a un backup rsync
  verso un disco esterno, un altro PC o un server dal pannello
  “💾 Data & Model Storage” (non è automatico). **Constatazione onesta**: in
  `open-easy-web` non abbiamo trovato alcun meccanismo rsync; ciò che esiste
  davvero è la funzione rsync integrata in open-english.
- **Google Drive**: con [rclone](https://rclone.org/drive/) si può
  sincronizzare la cartella di backup:
  `rclone sync /path/to/backup gdrive:open-english-backup`. **Nulla viene
  sincronizzato automaticamente**: la configurazione è a vostra cura.
- **Hosting condiviso / VPS**: qualsiasi host raggiungibile via SSH (piani con
  SSH come Lolipop o Sakura Internet, VPS come ConoHa) funziona con rsync:
  `rsync -avz /path/to/backup user@your-vps-host:/backup/open-english/`.

## Aggiornamenti recenti (2026-08-27)

Distribuzione reale sul VPS (easy-web.tokyo/open-english), selettore di
cartelle per i percorsi di backup/archiviazione, badge permanente dello
stato di rete (pubblico/privato) con supporto DuckDNS, pannelli
dell'interfaccia comprimibili, test reale end-to-end della scrittura
GitHub/VPS, caricamento di disegni + commento testuale dell'IA condiviso
con il nuovo server open-cg-cad, test di prova multilingue per la
certificazione statunitense "Data Scientist", e un nuovo argomento di
opinione sui risparmi per la pensione. Dettagli completi solo nella
versione giapponese.
