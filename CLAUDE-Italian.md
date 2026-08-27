# Filosofia di sviluppo e regole d'ambiente (open-english)

> **Da (2026-08-27)**: Angolo sviluppo freelance, cassaforte iframe cross-origin (`vault.html`) per token GitHub e chiave Google Search, login con email di backup, correzioni di bug — vedi CLAUDE.md (giapponese) per le voci del 2026-08-27.


> **Nota**: questa è una traduzione condensata dello stato attuale. Il
> log storico dettagliato degli HANDOFF (decine di voci dal
> 2026-08-10) resta disponibile solo in giapponese in
> [CLAUDE.md](CLAUDE.md) per brevità — consultarlo per i dettagli
> delle singole sessioni.

Unità di lavoro: `F:\runo`. Questa sezione segue la pratica di copiare
la sezione corrispondente del `CLAUDE.md` di
[`open-raid-z`](https://github.com/aon-co-jp/open-raid-z) in ogni
progetto come riferimento. Repository GitHub:
[aon-co-jp/open-english](https://github.com/aon-co-jp/open-english).

**Inizio sviluppo: 2026-08-10.**

## Ruolo di questo progetto

Un'app web per l'apprendimento dell'inglese per PC/tablet/smartphone.
In stile "lezione di inglese in un maid café", un personaggio maid da
maga (design originale, animato) accompagna gli studenti dal
principiante all'avanzato. Le risposte AI sono gestite da
[`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm).

## Architettura (su indicazione dell'utente, 2026-08-10)

- **Lato Linux (VPS)**: solo un server di distribuzione per il
  download. La gestione dell'app è affidata a
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **Lato dispositivo dell'utente**: il frontend web statico di questo
  repo + un server nativo eseguito localmente da `aruaru-llm` (usa
  internamente i backend di inferenza di `open-directx`/`open-cuda`),
  scaricato ed eseguito dall'utente stesso. Il browser si connette
  localmente (online/offline) a `http://localhost:4600`.

## Divulgazione onesta / limitazioni note (al 2026-08-10)

- `/v1/generate` di `aruaru-llm` è GPT-2 (centrato sull'inglese, senza
  fine-tuning per il dialogo) — qualità delle risposte e rispetto del
  livello non sono garantiti.
- Il CORS è stato risolto il 2026-08-10 (`.with_cors()` lato
  `aruaru-llm`).
- La sintesi vocale (TTS)/lip-sync per i personaggi tutor è collegata
  tramite Web Speech API; l'animazione del personaggio maid stesso
  resta un semplice loop CSS di apertura/chiusura della bocca.

## Visione futura (su indicazione dell'utente, 2026-08-10, non ancora iniziata)

C'è l'idea di far girare `open-directx`/`open-cuda`/`aruaru-llm`
anche in modo autonomo nel browser (WASM/WebGPU) e integrarli con
`RPoem` (una piattaforma GraphQL Federation). Trattandosi di un grande
cambiamento architetturale rispetto all'attuale design di Fase 0
(server residente locale + connessione localhost), verrà affrontato
solo dopo il completamento dell'MVP, con un ambito dedicato.

## Altri aggiornamenti (2026-08-19 - 2026-08-20)

Da allora sono stati aggiunti, tra l'altro: un avviso al
raggiungimento del limite di utilizzo giornaliero, con indicazioni sui
piani a pagamento e sui livelli gratuiti di altri provider; un nuovo
pannello "Data & Model Storage" con interfaccia di backup/ripristino;
un banner per mobilitare gli smartphone inutilizzati
(`PhoneAccelWorker` con rilevamento NNAPI); un backup rsync combinato
per aruaru-db/PostgreSQL; una pagina roadmap segnaposto per i port
console (PlayStation/Switch/Wii/Wii U, in attesa dell'autorizzazione
dei produttori); gli aggiornamenti automatici estesi a tutti i
componenti inclusi (aruaru-llm/aruaru-db) con controllo periodico
ogni 6 ore e downgrade manuale per singolo componente; una correzione
che avvia automaticamente aruaru-llm su Windows (nessun passaggio
manuale residuo); un banner informativo sui livelli gratuiti dei
provider IA/ricerca (incluso Claude/Anthropic); una correzione
critica che previene la perdita del database delle conversazioni
durante l'aggiornamento/downgrade automatico su Windows (verificata
end-to-end tramite un installer reale); e nuove funzionalità Android
(rilevamento automatico dell'URL del PC tramite scansione di
sottorete, verificato su un dispositivo Snapdragon reale con
rilevamento NNAPI riuscito, mentre l'effettivo offload di calcolo
NNAPI non è ancora implementato). Dettagli nelle voci HANDOFF del
2026-08-19 e del 2026-08-20 in [CLAUDE.md](CLAUDE.md).

## Aggiornamenti recenti relativi all'installazione (2026-08-19)

Installer Windows unificato `open-english-install.exe`; l'aggiornamento
automatico integrato (`server/src/self_update.rs`) è stato esteso a
Linux e poi a macOS, con rollback automatico basato su un controllo di
salute `/healthz` se la nuova versione non si avvia correttamente;
nuova pagina di ingresso `facebook.html` per utenti con accesso solo a
Facebook (divulgazione onesta: non è una partnership ufficiale con
Meta); e dal 2026-08-18 l'app promuove e automatizza l'installazione di
`rsync` quando manca, avviando subito dopo il backup. Dettagli completi
solo nelle voci HANDOFF in giapponese qui sotto.

*(Nota sulla traduzione automatica: questo riepilogo è stato tradotto
dall'agente IA stesso, senza revisione da parte di un madrelingua.)*

---

Altre lingue: [日本語 (originale, con la cronologia completa degli HANDOFF)](CLAUDE.md) ·
[Deutsch](CLAUDE-German.md) · [Français](CLAUDE-French.md) ·
[Русский](CLAUDE-Russian.md) · [Українська](CLAUDE-Ukrainian.md) ·
[עברית](CLAUDE-Hebrew.md) · [فارسی](CLAUDE-Persian.md)

## Aggiornamento 2026-08-22: esami per lingue del mondo, selezione lingue, lettura multilingue

Prima di implementare è stato verificato il codice: **non esisteva alcun
elenco di lingue di traduzione né tabella i18n** (`learn-target` aveva
solo inglese/giapponese). L'elenco è quindi stato definito ex novo con
questa funzione — **38 lingue** (17 europee incluso il romancio svizzero,
russo, 4 mediorientali, 7 sud-asiatiche, 8 est/sud-est asiatiche, 1
africana) più inglese e giapponese sempre attivi.

- Nuovi dati: `world-language-exams.json` (domande originali a scelta
  multipla con livelli in stile CEFR, 3–6 per lingua) e
  `world-language-phrases.json` (5 frasi base × 40 lingue).
- Nuova API: `GET /v1/world-languages` restituisce solo il riepilogo,
  senza i testi delle domande. Per il salvataggio in database **non** è
  stato creato alcun endpoint nuovo: basta `POST /v1/db/history`.
- UI: banner bilingue, pannello "🌐 Languages" con caselle di spunta,
  "Seleziona tutto" e "Deseleziona tutto tranne EN e JA", scelta di
  **2–5 lingue** (limite imposto dall'interfaccia), visualizzazione e
  lettura sequenziale ripetibile quante volte si vuole (tutte o una sola
  lingua), copia, download .txt e salvataggio in SQLite.
- Dopo la correzione le domande sbagliate portano alla conversazione con
  il tutor di quella lingua (riuso di `examPrepMissedQuestions`).

**Dichiarazione onesta**: domande originali, non prove reali e senza
legami con certificazioni ufficiali; solo 3–6 domande per lingua; nessuna
revisione da parte di madrelingua; la lettura effettiva nelle 38 lingue
non è stata verificata su voci reali (solo con uno stub di osservazione).
Dettagli nel HANDOFF del 2026-08-22 in [CLAUDE.md](CLAUDE.md).

## Risposte a testo fisso basate su regole per temi delicati (2026-08-23)

Sui temi in cui un errore fattuale fa più danno, l'app risponde **senza
inferenza AI** con testo scritto a mano. Tre casi seguono lo stesso schema:
`isCreatorQuestion()` (presentazione dell'autore),
`isReligionHistoryQuestion()` / `RELIGION_HISTORY_TEXTS` (islam, Iran, mondo
arabo) e `isMarkOfBeastQuestion()` / `MARK_OF_BEAST_TEXTS` (666 e marchio
della bestia). Motivo: un GPT-2 puro inventa contenuti, e sulla storia
religiosa il danno è alto. Non consumano il limite giornaliero e i testi
stanno in una tabella con il codice lingua come chiave (oggi solo `ja`/`en`).

**Storia religiosa neutrale**: diversità religiosa dell'Arabia preislamica,
formazione del Corano descritta dagli studi come **tradizione autonoma**
(per la dottrina islamica, rivelazione a Maometto), differenza fra civiltà
iranica e araba, influenza zoroastriana presentata solo come tesi di alcuni
studiosi. Due affermazioni inizialmente richieste (Corano da una traduzione
biblica; un fratello di Maometto traduttore) sono state **escluse per
assenza di riscontri**, dopo più scambi con l'utente; il testo dichiara
*perché* non vengono affermate. La nota sui limiti della traduzione
premoderna riguarda **solo** le traduzioni arabe della Bibbia storicamente
attestate e non va **mai** collegata alla formazione del Corano. In chiusura
il messaggio su traduzione, dialogo multilingue e pace.

**666 / marchio della bestia**: il passo dell'Apocalisse è citato in modo
neutrale, senza affermare un'interpretazione "giusta". Il gioco di parole
**"666 = WWW"** (ghematria, vav = 6) è presentato **solo come lettura
diffusa dagli anni '90**, non come dottrina. La storia del 666 nascosto nei
codici a barre è **etichettata come leggenda metropolitana** e spiegata
tecnicamente: le **barre di guardia** segnano inizio, fine e centro per lo
scanner, somigliano alla cifra 6 solo otticamente e usano una codifica
diversa (3 moduli contro 7); Snopes la valuta FALSA — **nessun significato
occulto, nessun fondamento tecnico**. Chiusura positiva (web e scanner
rendono comoda la spesa **senza marchi sul corpo**) e nota su Python (logo
a serpente, nome da Monty Python) **dichiarata pura coincidenza**.

**Aggiunta del 2026-08-23 (parallelo interessante — presentare, non
affermare)**: Apocalisse 13,16-17 contiene davvero un passo secondo cui
nessuno senza il marchio può comprare o vendere (l'esistenza del versetto può
essere citata come fatto). È stata aggiunta una frase secondo cui **alcune
persone vi notano un parallelo interessante** con il fatto che fare acquisti
oggi dipende sempre più da codici a barre e pagamenti online come Amazon.
**Vincolo tassativo**: presentarlo solo come possibilità ("c'è chi lo dice"),
**mai** affermare che una profezia si sia avverata — il testo lo dichiara
esplicitamente.

**Nel modificare**: le quattro garanzie di onestà — "presentare, non affermare",
"leggenda dichiarata leggenda", "coincidenza dichiarata coincidenza" — non
vanno indebolite né omesse.

## Solo formulazione: tono più leggero sul "666" (2026-08-23)

Tre punti di `MARK_OF_BEAST_TEXTS` sono stati rivisti **solo sul piano
stilistico**: il gioco di parole "666 = WWW", la leggenda del codice a barre
e la nota su Apocalisse 13,16-17 (senza il marchio non si compra né si
vende) accostata agli acquisti odierni fra codici a barre e Amazon. Le
formule di cautela rigide sono state sostituite da un tono più cordiale.

- **Prima**: "…mai come l'affermazione che una profezia si sia avverata" /
  JA: 「〜と断定するものではありません」
- **Dopo**: "…da prendere come una curiosità più che come una prova solida" /
  JA: 「話のタネとして」「真偽のほどは分かりませんが、こういう見方をすると
  聖書の世界も少し身近に感じられるかもしれません」

**Il vincolo in sé è invariato** e va mantenuto: (1) nulla è affermato come
profezia avverata; (2) il 666 nei codici a barre resta esplicitamente una
**leggenda metropolitana priva di fondamento tecnico** (Snopes: FALSA; barre
di guardia da 3 moduli contro i 7 di una cifra); (3) la somiglianza fra il
serpente di Python e la "bestia" resta **pura coincidenza**; (4) le letture
si presentano, non si insegnano. È cambiato solo lo stile, per leggibilità:
**nessun indebolimento dell'onestà**.

## Funzione quiz: indovinello originale dell'autore (2026-08-23, seguito 4)

A richieste come "proponimi un problema" / "give me a quiz" l'app
risponde con un indovinello originale dell'autore **Masahiro Ishizuka
(石塚正浩)**: `9 ◯ 9 ◯ 9 ◯ 9 = 10` — al posto di ogni cerchio va uno fra
`+`, `-`, `×`, `÷` (ripetizioni ammesse) e le parentesi ( ) possono
cambiare l'ordine; soluzione `(9 × 9 + 9) ÷ 9 = 10`. Nel testo va detto
**esplicitamente** che non è un gioco di parole né un tranello ma
**pura aritmetica delle quattro operazioni**, verificabile con una
calcolatrice o un pallottoliere. Si riporta anche l'episodio: la persona
più giovane che l'ha risolto era un bambino di **prima elementare**.

Elementi (in `app.js`): `isQuizRequest()`, `isQuizAnswerRequest()`,
`QUIZ_TEXTS`, `quizQuestionText()`, `quizAnswerText()`,
`quizPreferredLangCode()` e il flag di stato `quizAwaitingAnswer`. Lo
scambio è in **due fasi**: prima solo il problema, poi — dopo "non lo so"
/ "dimmi la risposta" — la soluzione; il flag conserva lo stato
intermedio.

**Perché non passa dall'AI**: come le altre risposte a testo fisso
(autore, storia religiosa, 666), questa funziona **senza inferenza AI**,
con semplici diramazioni basate su regole. Un GPT-2 grezzo, messo a fare
calcoli, produce risultati **sbagliati** ma formulati in modo
convincente: inaccettabile per un problema con un'unica soluzione
verificabile. Il conteggio giornaliero di utilizzo non viene consumato.

**Multilingua e limite deliberato**: per impostazione predefinita il testo
è bilingue JA + EN; se la lingua di studio o la lingua madre è es/fr/de/
zh/ko, la relativa traduzione viene messa in testa. Le traduzioni
esistono solo per queste **sette lingue** (ja/en/es/fr/de/zh/ko). Le 130
lingue supportate **non** sono state riempite con traduzione automatica
per simulare una copertura totale; le lingue non incluse ricevono il testo
bilingue predefinito. Questo limite va mantenuto e dichiarato anche in
caso di modifiche.

## Scuola virtuale / scuola di formazione professionale online (2026-08-24)

Su indicazione dell'utente sono state aggiunte una **scuola virtuale** (istituto
professionale, istituto biennale, università, dottorato) e una **scuola di formazione
professionale online**: scegliere una categoria → installare un ambito → domande
casuali → correzione.

- L'impianto **riprende integralmente quello del corso di ripetizioni esistente**
  (`TUTOR_*`); **non sono state aggiunte nuove API, nuovi archivi né nuove tabelle**.
  I risultati passano dal `POST /v1/db/history` già presente. Codice: `VSCHOOL_*` /
  `vschool*` in fondo ad `app.js`, interfaccia `#vschool-modal` in `index.html`. Due
  pulsanti aprono **la stessa finestra modale** in due modalità.
- **Ricerca preliminare (2026-08-24, ricerca web in giapponese)**: nelle selezioni di
  università, istituti biennali e istituti professionali prevalgono il tema scritto
  (su testo, su argomento o su dati) e il colloquio, con la classica struttura in tre
  parti introduzione–svolgimento–conclusione; nei dottorati contano progetto di
  ricerca, stato dell'arte, prove specialistiche e colloquio. La formazione
  professionale pubblica copre tra l'altro informatica, vendita, assistenza alla
  persona, edilizia, estetica e cucina. **Queste tendenze generali sono servite solo a
  definire le categorie: tutti i testi delle domande sono scritti appositamente.**
- **Realizzati (7 ambiti, 5 domande ciascuno)**: università = umanistico-sociale e
  scientifico-ingegneristico; istituto professionale = informatica; dottorato =
  fondamenti della ricerca; formazione professionale = informatica, contabilità,
  servizio al cliente.
- **Non realizzati, segnalati onestamente come «non ancora pronti»**: segreteria medica,
  assistenza alla persona, estetica, cucina, edilizia, **tutti e quattro gli ambiti
  dell'istituto biennale**, area medico-infermieristica, scienze dell'educazione,
  specialistiche ingegneristiche di dottorato e, nella formazione professionale, basi di
  assistenza, edilizia, cucina ed estetica.
- **Divulgazione onesta (da non indebolire)**: nessuna riproduzione di prove reali; tema,
  colloquio e pratica sono solo approssimati a scelta multipla; nessuna previsione su
  ammissioni o qualifiche.
- **YouTube**: solo collegamenti a **pagine di risultati di ricerca** con parole chiave
  generiche, accompagnati dalla relativa avvertenza.
- **Verifica sul campo (tre cicli TEST → miglioramento → nuovo TEST)**: server avviato
  (`http://127.0.0.1:4601/`), entrambe le modalità percorse per intero nel browser (3/3
  con risposte corrette, 0/3 con indicazione delle domande senza risposta), ripristino da
  `localStorage` dopo il ricaricamento, azzeramento al cambio di modalità, avviso per una
  categoria priva di contenuti e pulsante «rivedi con l'insegnante». Due righe
  `[virtual-school] …` sono state effettivamente salvate in `/v1/db/history`. Nessun
  errore JavaScript.
- Versione completa: voce HANDOFF del 2026-08-24 in [CLAUDE.md](CLAUDE.md).

## Auto-riparazione del DUAL DB + TLS + supporto HEAD (2026-08-24, seguito)

Quattro cambiamenti, tutti verificati con `cargo build`/`cargo test` (18/18 verdi)
più controlli HTTP reali su un binario in esecuzione:

- **Auto-riparazione del mirror (coda `mirror_outbox`)**: finora la scrittura
  simultanea verso il mirror opzionale PostgreSQL/aruaru-db falliva senza
  alcun meccanismo di recupero (dichiarato esplicitamente "non implementato"
  nella voce del 2026-08-24 precedente). Ora le scritture fallite vengono
  accodate in una tabella SQLite locale e ritentate da un'attività in
  background ogni 60 secondi (fino a 100 tentativi, entrambi valori
  predefiniti configurabili); le righe che restano irrecuperabili sono
  marcate `give_up` e contate in `GET /v1/db/info`. **Limiti dichiarati
  onestamente**: copre solo le scritture fallite da questo stesso processo,
  non le modifiche fatte altrove sul mirror; i ritentativi sono INSERT
  semplici, quindi un duplicato raro (at-least-once) resta possibile.
- **TLS per il mirror PostgreSQL**: aggiunto il crate `tokio-postgres-rustls`
  per supportare `sslmode=require`/`verify-ca`/`verify-full` verso database
  gestiti; `sslmode=disable` (predefinito) resta invariato. I certificati
  radice vengono presi dal trust store del sistema operativo
  (`rustls-native-certs`, con fallback su `webpki-roots`). Esiste una via
  di fuga `OPEN_ENGLISH_DB_TLS_INSECURE=1` che disattiva la verifica del
  certificato — genera un avviso ben visibile, è vulnerabile a
  man-in-the-middle e va usata solo su reti chiuse fidate.
- **Supporto al metodo HTTP HEAD**: il server di file statici rispondeva
  prima con 404/405 alle richieste `HEAD`; ora risponde correttamente. Ha
  richiesto di aggiungere `MethodRouter::head()` alla facciata condivisa
  `RPoem` (`open-runo-poem-compat`) — modifica puramente additiva.
- **Nuovo alias `/health`** accanto all'esistente `/healthz` (stesso JSON
  `{"ok":true}`), per compatibilità con lo schema di registrazione dei
  tenant di altri repo dell'ecosistema (open-web-server/open-easy-web) — **non**
  significa che open-english sia già integrato con open-web-server, solo che
  la forma del controllo di salute corrisponde.
- `GET /v1/db/info` ora restituisce anche `rsync_available` (una verifica
  reale con `rsync --version`).

Verifica effettiva: oltre a `cargo build`/`cargo test`, sono stati eseguiti
controlli HTTP reali su un binario avviato — `HEAD /` e `HEAD /app.js`
restituiscono Content-Length/Content-Type corretti a corpo vuoto,
`GET /health` risponde `{"ok":true}`, `GET /v1/db/info` include
`rsync_available`. Versione completa (in giapponese): voce HANDOFF
"2026-08-24 DUAL DB同時書き込みを実装" e seguenti in [CLAUDE.md](CLAUDE.md).


## Guida alla carriera nel corso di ripetizioni per anno scolastico (2026-08-24, seguito 2)

La schermata degli esercizi ora mostra, per ogni materia (giapponese,
calcolo, scienze, scienze sociali, inglese, programmazione, educazione
civica), un riquadro "Guida alla carriera" con i settori/mestieri a cui
la materia potrebbe essere utile e i ruoli avanzati raggiungibili
approfondendola. Progettazione basata su una ricerca reale sul sistema
duale tedesco di formazione professionale (Berufsschule, qualifiche IHK,
Ausbildung — fonti: IHK Darmstadt, deutschland.de, Wikipedia).
Formulazioni sempre prudenti ("potrebbe aiutare"), mai una promessa di
lavoro garantito. Ambito: livello della materia, non ogni singola
domanda; verificato dal vivo (server avviato, matematica di terza
elementare installata, visualizzazione corretta confermata). Dettagli
completi solo nella versione giapponese di CLAUDE.md.

**Aggiornamento (continua, 2026-08-24)**: Career guidance esteso alla
scuola virtuale/formazione professionale virtuale (`VSCHOOL_FIELDS`, 23
aree). Bugfix urgente: testo bianco su sfondo bianco in più punti
(campo chat, pannelli lingue) causato da sfondi chiari senza colore del
testo esplicito nel tema scuro — risolto con colori espliciti.
Dimensioni del font incoerenti tra testo giapponese ed etichette latine
(es. "JP", "(default / 既定)") uniformate. Testo obsoleto sul supporto
TLS del database corretto per riflettere il supporto TLS realmente
implementato (`tokio-postgres-rustls`), con nota onesta che non è stato
possibile testarlo per mancanza di cargo/psql/Docker su questa macchina.

**Aggiornamento (seguito 6, 2026-08-24)**: aggiunte citazioni/proverbi
bilingui (giapponese/inglese) a tutti e tre i riquadri di orientamento
professionale esistenti, un messaggio motivazionale (espresso come
speranza, non garanzia) che augura agli studenti di trovare lavoro e
mantenersi ovunque, e una nuova materia "Communication & Questioning
Skills" (medie/superiori) che insegna espressioni inglesi reali per
discussioni ipotetiche costruttive, feedback costruttivo e l'importanza
di essere "audaci ma delicati". Verificato dal vivo (server avviato,
browser). Dettagli completi solo nella versione giapponese di CLAUDE.md.

**Aggiornamento (2026-08-27)**: Distribuzione reale sul VPS
(easy-web.tokyo/open-english), selettore di cartelle (esplora file) per
scegliere i percorsi di backup/archiviazione, badge permanente dello
stato pubblico/privato della rete con supporto DuckDNS per un dominio
personalizzato, pannelli dell'interfaccia comprimibili (avviso, banner
per smartphone inutilizzati, banner lingue del mondo, barra delle
impostazioni), test reale end-to-end della scrittura GitHub/VPS tramite
l'agente, caricamento di disegni + commento testuale dell'IA condiviso
con il nuovo server open-cg-cad (semiconduttori/automotive/edilizia,
solo i propri file, nessuna analisi delle immagini — aruaru-llm elabora
solo testo), test di prova multilingue (8 lingue aggiuntive) per la
certificazione statunitense "Data Scientist", e un nuovo argomento di
opinione che risponde a domande sui risparmi per la pensione / il
"problema dei 20 milioni di yen". Dettagli completi solo nella versione
giapponese di CLAUDE.md.
