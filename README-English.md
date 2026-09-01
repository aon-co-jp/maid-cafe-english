# open-english

*日本語*: [README.md](README.md) ·
*Other languages*: [中文](README-Chinese.md) · [한국어](README-Korean.md) ·
[Español](README-Spanish.md) · [Deutsch](README-German.md) · [Italiano](README-Italian.md) ·
[Français](README-French.md) · [Русский](README-Russian.md) ·
[Українська](README-Ukrainian.md) · [עברית](README-Hebrew.md) ·
[فارسی](README-Persian.md) · [العربية](README-Arabic.md)

> 📌 **Latest update (2026-08-29): started a ground-up overhaul of AI
> speech recognition (ASR) accuracy.** The canonical record is
> [`docs/SPEECH_RECOGNITION_REDESIGN.md`](docs/SPEECH_RECOGNITION_REDESIGN.md)
> (findings from English/multilingual Google + GitHub research, plus the
> improvement design across the 5 repos: open-english / open-directx /
> open-cuda / open-cpu / aruaru-llm). **Status**: P1 (client-only, zero
> new deps — BCP-47 language fix, n-best, LLM correction, vocabulary
> bias, translation helper) done. P2-α (in-browser Whisper via
> transformers.js, execution-tier cascade WebGPU → WebNN → WASM) done.
> P2-β (`aruaru-llm`'s `POST /v1/transcribe` via whisper.cpp): the
> endpoint and the `whisper` tier in `/v1/runtime` are done, but
> `whisper-rs` currently cannot build on Windows/MSVC (a known upstream
> blocker), so **next iteration switches to spawning a prebuilt
> whisper.cpp CLI as a subprocess**. The 2026-08-29 multilingual
> re-research also fed back a transformers.js dtype pitfall (WebGPU + q8
> decoder produces garbled output → switched to an fp32-encoder +
> q4-decoder hybrid). See the design doc and the 2026-08-29 HANDOFF in
> [CLAUDE.md](CLAUDE.md) for details and next steps.
>
> 📌 **Latest update (2026-08-27, cont. 4)**: Live end-to-end testing
> uncovered a quality bug in the search-augmented prompt: the persona
> template and a second generation cue were getting nested inside the
> "question," instead of a clean `Question: {raw user text}\nAnswer:`
> structure. Fixed and verified via a fetch interceptor that the
> request sent to `aruaru-llm` now has the intended simple structure.
> Also fixed a key-leak bug and a misleading status message in the
> Google Search ④ vault mode (and applied the same defensive fix to the
> GitHub token side). See the 2026-08-27 (cont. 11-13) entries in
> [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Update (2026-08-27, cont. 3)**: Extended login to support
> a second, optional backup email address alongside the required first
> one. The same one-time code is sent to both; receiving it at either
> is enough to log in (this is not two-factor authentication — it's a
> backup address for availability, not an added security layer).
> Backward compatible with existing clients (`email2` is optional).
> `cargo build --release` succeeded; verified in-browser that the HTTP
> request is accepted and the new form fields exist (an end-to-end test
> with a real SMTP send was not done, as this dev machine has no SMTP
> environment). See the 2026-08-27 (cont. 5) entry in
> [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Update (2026-08-27, cont. 2)**: Implemented a cross-origin
> iframe sandbox vault (`vault.html`). GitHub token decryption and the
> actual fetch call to the GitHub API now happen entirely inside the
> vault; the main page (index.html) only ever receives the resulting
> URL — verified end to end that the plain-text token never reaches the
> main page's own JS. Also set `sandbox="allow-scripts allow-same-origin
> allow-forms"`, but honestly disclosed a well-known pitfall: combining
> those two flags effectively neutralizes the sandbox while served
> same-origin — real isolation only comes from actually deploying
> vault.html on a different origin, which this session verified the
> mechanics of but did not actually test cross-origin (a deployment
> step, deferred). See the 2026-08-27 (cont. 3) entry in
> [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Update (2026-08-27, cont.)**: Extended the same secure
> hand-over options (① file / ② encrypted / ③ plain) to the Google
> Search API key. For the AI provider keys (ChatGPT/DeepSeek/Gemini/
> Claude), we deliberately did **not** add encryption — they're always
> sent in plain text to your aruaru-llm server by design, so encrypting
> the browser-side copy wouldn't meaningfully help, and we chose not to
> add security theater (the reasoning is spelled out in the UI). Also
> added guidance recommending you revoke/reissue any GitHub token saved
> during the 2026-08-26–27 plain-text-only window, and general advice
> to discard/reissue any VPS/rental-server SSH keys you may have stored
> in plain text elsewhere before this secure hand-over mechanism
> existed. See the 2026-08-27 (cont.) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-27)**: Expanded how the Freelance Dev
> Corner's GitHub token is handed over, to three options: ① read from
> a local file each time, never saved (recommended), ② encrypt with a
> passphrase (AES-GCM) before saving — a convenience/security
> trade-off, with its real limits honestly disclosed, ③ save in plain
> text (not recommended, the old behavior). Verified end to end
> (encrypt/decrypt round-trip, wrong-passphrase failure, clearing, and
> file-based loading all confirmed). See the 2026-08-27 entry in
> [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Update (2026-08-26, cont. 3)**: Added a new "Freelance
> Dev Corner" (💼 button). Implemented and verified end to end: pick
> from 100 programming languages (or type your own) + a framework, open
> Google search in a new tab for official info and freelance/IT job
> listings (no API key needed), copy URLs/text, use a sample listing or
> your own job notes, and hand it all off to the AI teacher for a
> lesson. Also added automatic upload to GitHub — calling the GitHub
> REST API **directly from the browser** with a personal access token
> to create a repo (public or private) and push a file — **the token
> is stored only in the browser's localStorage and never sent to our
> own server, but a bilingual (JA/EN) security warning is always shown
> before use**. Automatic VPS read/write (not possible the same way due
> to a browser platform limitation), similar GitLab/Bitbucket
> integrations, and database logging remain unimplemented — deferred to
> a future session. See the 2026-08-26 entries in
> [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Update (2026-08-26, cont. 2, task recorded for next
> time)**: It's correct that the AI's reply reflects Google search
> results when search boost is on — but the existing limitation still
> stands: small GPT-2-family models have no guarantee of using that
> search context accurately. We recorded a task to investigate, next
> session, whether engineering improvements across Rust + RPoem +
> open-directx/open-cuda + aruaru-llm can reduce this limitation
> (nothing investigated or implemented yet). See the 2026-08-26
> (cont. 3) entries in [CLAUDE.md](CLAUDE.md) and
> [aruaru-llm/CLAUDE.md](https://github.com/aon-co-jp/aruaru-llm/blob/main/CLAUDE.md)
> for details.
>
> 📌 **Previous update (2026-08-26, cont.): GitHub/YouTube search
> integration + free-quota-exhausted notice + API key links + local DB
> save confirmation**:
> - The "🔀 AI Provider Priority" panel now has checkboxes for Google
>   Search, GitHub Search (token optional), and YouTube Search (needs
>   an API key) — search results are now actually inserted into the
>   prompt on every chat message when enabled (this fixes a gap from
>   the earlier version, where the feature was never wired into the
>   actual conversation flow).
> - When every configured AI provider has used up today's free quota,
>   the app shows "Today's free quota has been used up" in English and
>   Japanese, then automatically falls back to the built-in local AI.
>   A paid-plan provider keeps working automatically (it never hits the
>   quota-exceeded condition in the first place).
> - Added direct links to each provider's API key page (OpenAI,
>   DeepSeek, Gemini, Claude).
> - On the downloaded PC version, saving an API key now asks (in
>   English and Japanese) whether to also save it to the local database
>   so you don't have to re-enter it next time — only if you agree, and
>   this prompt never appears in the plain browser version.
> - See [CLAUDE.md](CLAUDE.md)'s 2026-08-26 (cont. 2) HANDOFF for
>   details.
>
> 📌 **Previous update (2026-08-26): Multi-LLM provider priority**:
> - Beyond Google Search, you can now call ChatGPT (OpenAI), DeepSeek,
>   Gemini, and Claude (Anthropic) individually or all at once
>   (implemented in `aruaru-llm`'s `chat_providers.rs` /
>   `provider_priority.rs`).
> - The new "🔀 AI Provider Priority" panel lets you enable "use free
>   tiers in order, one after another" — the order of the 5 services can
>   be set either by typing a number or clicking a numbered radio button
>   (duplicates are resolved by swapping).
> - Each provider's API key is saved only in this browser's
>   localStorage and sent to your own aruaru-llm as a runtime setting
>   (never written to disk there either — same policy as the existing
>   Google Search key setup).
> - Verified live: browser UI → settings applied on aruaru-llm → an
>   actual HTTP request reaching the real Anthropic API.
> - See [CLAUDE.md](CLAUDE.md)'s 2026-08-26 HANDOFF and
>   [aruaru-llm/CLAUDE.md](https://github.com/aon-co-jp/aruaru-llm/blob/main/CLAUDE.md)
>   for details.
>
> 📌 **Previous update (2026-08-25, cont. 13): world-lab multi-device
> compute dispatch Phase B (explicit receiver approval gate + TLS)
> implemented, verified live over real HTTP/TLS — cross-device dispatch
> across real physical devices (Phase C) is still not started**:
> - **Approval gate**: an incoming compute task never runs until the
>   receiving device explicitly approves or denies it — the existing
>   Phase 2 WASM sandbox only executes after approval (no auto-approve
>   setting exists anywhere in the code). Verified with 7 unit tests plus
>   real HTTP round-trips (curl/PowerShell): double-approve, double-deny,
>   unknown IDs, and queue-limit overflow all return honest errors.
> - **TLS**: reused RPoem's existing rustls implementation, adding an
>   opt-in second port via `OPEN_ENGLISH_TLS_ENABLED=1` (a dev-only
>   self-signed certificate is generated if none is provided). Verified
>   live with `curl`: a real TLS handshake succeeds, and certificate
>   validation correctly fails without `-k`. The existing plaintext HTTP
>   port was not removed.
> - **Honest disclosure**: all of this testing happened on a single
>   machine via curl/PowerShell — **real cross-device dispatch across two
>   or more physical devices, including the sending side, has not been
>   built or tested yet** (that's Phase C).
> - See the 2026-08-25 (cont. 13) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 12): re-verified the hardware-detection
> → recommended-LLM-size feature live end-to-end (pre-existing feature,
> no code changes)**:
> - `aruaru-llm` already implements `GET /v1/recommend` (CPU/GPU/NPU
>   detection in `hardware.rs`), and open-english's UI ("🧠 Recommend LLM"
>   button in the "⚙ Setup aruaru-llm." panel) was already wired to it. We
>   started both servers and drove the real UI in a browser to confirm it
>   works — on this machine it correctly detected real CPU AVX2/FMA3 and
>   recommended `GPT-2 (124M, default)`.
> - Switching models only happens when the user explicitly clicks
>   `POST /v1/models/select` — never a silent auto-swap.
> - **Honest disclosure**: the current recommendation logic is a simple
>   GPU-VRAM threshold check only — CPU core count, NPU presence, and the
>   hardware of other world-lab-paired devices are not factored in.
> - See the 2026-08-25 (cont. 12) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-27): new open-cg-cad "Drawing Ops" panel, verified
> end-to-end**:
> - A new "📐 open-cg-cad Drawing Ops (Upload/Merge/Redesign)" panel is now
>   in the top bar. Upload semiconductor (CPU/NPU/GPU), automobile/
>   motorcycle/shinkansen/maglev/aircraft drawings, merge multiple ones, or
>   ask for a redesign — directly from the open-english screen (the actual
>   data lives on open-cg-cad).
> - **Verified on a real running instance**: with a live aruaru-llm
>   running, the full open-english → open-cg-cad → aruaru-llm chain was
>   confirmed to actually succeed for both merge and redesign. There's also
>   an override field for aruaru-llm's address (defaults to the same
>   `http://localhost:4600` this chat uses).
> - See the 2026-08-27 (cont. 17/18) entries in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 10): the open-cg-cad "hybrid mutual
> feature" is now reachable via the installer too**:
> - The Windows installer now has an optional (unchecked by default) task
>   to also install `open-cg-cad`.
> - **Honest disclosure**: as of 2026-08-25, `open-cg-cad` has no
>   published GitHub Release binary yet, so this task currently just
>   reports that honestly ("not published yet, build from source") rather
>   than faking a successful fetch.
> - See the 2026-08-25 (cont. 10) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 5): recorded a re-researched GPU/NPU
> safe-design path and a Microsoft Copilot API integration estimate in
> CLAUDE.md (both still at the vision/planning stage, not implemented)**:
> - **GPU/NPU cross-device dispatch**: identified `wasi:webgpu` (an
>   official WASI proposal, with a working wasmCloud demo in April 2026)
>   as a promising candidate. It's still standardizing, though, and known
>   WGSL memory-safety research concerns exist — it hasn't yet reached
>   the same maturity as the Phase 2 WASM sandbox, so this remains
>   unimplemented.
> - **Microsoft 365 Copilot API**: confirmed it only supports delegated
>   permissions (no static API-key flow). Building this requires a full
>   OAuth 2.0 sign-in flow plus secure refresh-token storage, and depends
>   on the user's own Azure AD app registration and Copilot license — so
>   we recorded the design as a separate future scope rather than
>   building it now.
> - See the "Future Vision" section in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 4): added a "US certifications (mock)"
> track to Virtual School**:
> - Added original bilingual (English/Japanese) mock questions (5 each)
>   for a **Data Scientist** track (honestly noting the US has no single
>   government-issued license here — the questions are modeled on
>   representative vendor-neutral certifications) and the **Architect
>   Registration Examination (NCARB ARE)** (the closest US equivalent to
>   Japan's Ikkyu Kenchikushi license).
> - Reuses the existing Virtual School mechanism as-is — no new
>   machinery was added. Verified live in a browser through installing
>   and taking the quiz (with answer-choice shuffling intact).
> - See the 2026-08-25 (cont. 3) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 3): security audit found and fixed two
> Critical wasmtime CVEs, plus a text-contrast bug fix**:
> - Ran a `cargo audit` dependency scan and found **two Critical (CVSS
>   9.0) sandbox-escape vulnerabilities in wasmtime 21.0.2** — the exact
>   engine world-lab's Phase 2 sandbox depends on. Upgraded to
>   **48.0.1**, bringing 21 known vulnerabilities down to 1 (an
>   upstream-unfixed `rsa` crate issue with no available patch).
> - **Bonus**: this upgrade also fixed the previously-documented "fuel
>   exhaustion crashes the host process" bug — verified live (the
>   subprocess-isolation defense stays in place regardless).
> - Also found and fixed two High (CVSS 7.5) vulnerabilities in `russh`
>   (used for the VPS SSH integration), upgrading to 0.63.1.
> - Fixed a reported contrast bug where the trainer's first greeting
>   speech bubble showed dark text on a dark background.
> - See the 2026-08-25 entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont. 2): added bulk pairing**:
> - Added a "🏢 Bulk pairing" feature (`POST /v1/world-lab/pair/bulk`)
>   for offices/large stores with many PCs/tablets/phones — paste
>   newline-separated device names and pair them all in one action.
> - **The core principle is unchanged**: it still requires someone with
>   the correct pairing token to act explicitly, and each entry goes
>   through the exact same validation as a normal pairing — this is not
>   auto-discovery or auto-approval. One failed entry doesn't lose the
>   others that succeeded (batch size capped at 100 by default).
> - Verified over real HTTP by bulk-pairing 30 simulated office PCs in a
>   single request.
> - See the 2026-08-25 entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-25, cont.): added a "wan" connection label,
> explicitly declined automatic port-opening (UPnP), and found/fixed two
> more flaky tests**:
> - Added `wan` (over the internet) as a connection label, but
>   **deliberately did not implement automatic port forwarding
>   (UPnP)** — UPnP-based auto port-opening is itself a long-standing,
>   well-known router attack vector, and building it into a feature whose
>   whole point is preventing relay/stepping-stone abuse would be
>   self-defeating.
> - The server listens on 127.0.0.1 (this machine only) by default and
>   is unreachable from outside unless the operator explicitly changes
>   `OPEN_ENGLISH_SERVER_BIND` — that already satisfies "reachable only
>   via manual configuration." The status panel now recommends setting up
>   your own TLS termination if you do expose it over WAN (the pairing
>   API is still plain HTTP today).
> - Found and fixed the same kind of test flake (env vars raced across
>   parallel tests) in `vps_agent.rs`, following the one already fixed in
>   `local_agent.rs`.
> - See the 2026-08-25 entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Latest update (2026-08-25): world-lab now supports device
> kind/self-reported hardware capability (CPU/GPU/NPU) + related-tool
> shortcuts, plus a form auto-fill (with an explicit security boundary
> kept), and a test flake found & fixed**:
> - **Multiple phones/tablets/PCs**: pairing now takes a device kind
>   (📱phone/📲tablet/🖥PC/❓other) and self-reported hardware capability
>   (CPU/GPU/NPU). The status panel shows a per-kind breakdown (e.g.
>   "📱3 📲2 🖥1").
> - **Honest disclosure**: capability is self-reported and unverified.
>   Compute tasks still always run on CPU — dispatching to a remote
>   device's GPU/NPU (e.g. idle office PCs) is **not implemented**; the
>   design sketch (including a possible role for `open-cuda`/
>   `open-directx`) is recorded in [CLAUDE.md](CLAUDE.md)'s "future
>   vision" section, but building it without the same safety rigor as
>   the Phase 2 WASM sandbox was deliberately avoided.
> - **Microsoft/GitHub Copilot**: added as link-only entries to the AI
>   Coding Assistant tool list (official site links, not an API
>   integration) — reachable with one tap from the world-lab panel too.
> - **Auto-fill, with a boundary kept on purpose**: opening the world-lab
>   panel now pre-fills the device-kind guess and GPU checkbox from data
>   already on screen — but pairing itself still always requires an
>   explicit token entry and button click. No token-less auto-pairing was
>   added; that stays central to the anti-relay design.
> - **Found and fixed a flaky test**: three existing `local_agent.rs`
>   tests raced on the same env var; serialized with a lock (production
>   code had no bug).
> - See the 2026-08-25 entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-24, cont. 9): tackled world-lab's remaining
> scope — UI wiring, concurrency limiting, cross-process E2E, and root
> cause tracking**:
> - **UI**: added a "🌐 world-lab (experimental)" panel — status, pairing
>   a device, listing/unpairing devices, and an advanced .wasm-upload task
>   runner, all exercised live in a browser.
> - **Concurrency limiting/queueing**: added a `tokio::sync::Semaphore` cap
>   on concurrent tasks and an `AtomicUsize` queue-length cap (excess
>   requests are rejected immediately rather than queued forever) — a
>   defense the per-task fuel/memory/timeout limits alone couldn't provide
>   against flooding the host process itself.
> - **Found and fixed another hole during a fresh security pass**: the
>   endpoint was reading the request body to completion *before* checking
>   size limits — for an "arbitrary compute" endpoint, that's a real DoS
>   hole. Switched to a streaming, capped reader instead.
> - **Root-cause tracking**: bumped wasmtime 21.0.2 → 27.0.0 and reproduced
>   the identical crash, confirming it isn't version-specific but a more
>   general compatibility issue on this platform — the process-isolation
>   mitigation remains necessary and correct either way.
> - **Multi-device verification (honest disclosure)**: this dev environment
>   has no second physical device, so verification was limited to pairing
>   simulated devices over real HTTP across all four connection types
>   (USB/Wi-Fi/Bluetooth/LAN) — not literally separate physical machines.
> - See the 2026-08-24 (cont. 9) entry in [CLAUDE.md](CLAUDE.md).
>
> 📌 **Update (2026-08-24, cont. 8): "world-lab" Phase 2 — WASM
> sandboxed compute tasks, plus a critical crash found and fixed via
> process isolation**:
> - Added `POST /v1/world-lab/task/run`, letting idle CPU/GPU/NPU capacity
>   on spare devices run arbitrary compute inside a WASM sandbox. Disabled
>   by default (two separate opt-in flags), with no reward/incentive —
>   this is meant as mutual aid, not a paid marketplace.
> - **While testing this for real, we found that the fuel (instruction
>   count) limit meant to stop runaway guest code could instead crash the
>   entire server process** — the safety mechanism itself was a one-request
>   denial-of-service hole. We redesigned it on the spot to run WASM
>   execution in an **isolated child process**, then proved over real HTTP
>   that a submitted infinite loop does crash that child process while the
>   main server survives and keeps serving other requests correctly right
>   after.
> - No traffic-relaying capability has been added — the "never a relay"
>   design commitment is unchanged.
> - See the 2026-08-24 (cont. 8) entry in [CLAUDE.md](CLAUDE.md) for the
>   full write-up.
>
> 📌 **Latest update (2026-08-24, cont. 6): Quotes/proverbs + motivation
> message + a new "Communication & Questioning Skills" subject**:
> - Every career-guidance box (tutor course and virtual school/vocational
>   school alike) now also shows a bilingual (Japanese/English) quote or
>   proverb (e.g. "Strike while the iron is hot.") plus a motivation
>   message — hoping learners grow into people who "can get a job, change
>   careers, make a living, and hold their own anywhere" — phrased as our
>   own hope/goal rather than a guarantee.
> - A new subject, "🗣 Communication & Questioning Skills" (junior high /
>   high school), teaches real, usable English phrases for raising a vague
>   or hypothetical idea constructively, pointing out a problem clearly
>   before asking someone specific (or everyone) for their opinion, and
>   why being "bold yet tactful" tends to work better than being too
>   passive — all as multiple-choice questions.
> - See the 2026-08-24 (cont. 6) entry in [CLAUDE.md](CLAUDE.md) for details.
>
> 📌 **Latest update (2026-08-24, cont. 2): "Career guidance" added to the
> grade-based tutor course**:
> - The practice-question screen now shows a 🧭 Career Guidance box for the
>   subject being practiced: **"industries/occupations that mastering this
>   content may help with"** and **"advanced occupations you might be able
>   to pursue by going further"** (covering 7 subjects: Japanese, math, life
>   studies, science, social studies, English, and programming).
> - This was designed after actually researching Germany's dual vocational
>   education system (Berufsschule, IHK qualifications, Ausbildung) in
>   Japanese and English, borrowing its idea that learning content is
>   explicitly linked to specific occupations and further qualifications.
>   Sources: [IHK Darmstadt](https://www.ihk.de/darmstadt/en/productlabels/training/voctrain-2533080),
>   [deutschland.de](https://www.deutschland.de/en/topic/business/how-germanys-dual-vocational-training-system-works),
>   [Wikipedia: Dual education system](https://en.wikipedia.org/wiki/Dual_education_system).
> - **Honest disclosure**: no claim like "you will definitely get a job" is
>   made — everything is phrased as "may help" / "might open a path
>   toward". The guidance is shown per subject (not per individual
>   question), does not cover every lesson, and does not guarantee
>   employment or any qualification.
> - Verified live: started the server, installed elementary-3 math,
>   answered questions, and confirmed in the browser that the career
>   guidance box renders correctly and stays visible after scoring.
>
> 📌 **Latest update (2026-08-24, cont.): DUAL DB self-repair (automatic
> outbox retry) + PostgreSQL TLS support + HTTP HEAD support**:
> - **DUAL DB self-repair**: what used to be documented as "not implemented"
>   is now implemented. A mirror write that fails is queued into a local
>   SQLite `mirror_outbox` table and automatically retried by a background
>   task (every 60s by default). Rows are retried up to 100 times by default;
>   rows that still fail are not silently dropped — they are marked
>   `give_up` and the counts are visible via `GET /v1/db/info`
>   (`mirror_outbox_pending`/`mirror_outbox_given_up`). **Honest limits**:
>   only writes this process itself attempted and failed are covered — rows
>   deleted directly on the mirror, or changes made through another path,
>   can't be detected. Retries are plain INSERTs, so a rare at-least-once
>   duplicate is possible.
> - **TLS support**: added `tokio-postgres-rustls` so the PostgreSQL mirror
>   connection can now use `sslmode=require` etc. against a managed database
>   (`sslmode=disable`, the default, keeps the existing plaintext behavior
>   unchanged).
> - **HTTP HEAD support**: the static file server now answers `HEAD`
>   requests correctly (it used to return 404/405, which matters in practice
>   since many HTTP clients and health-check tools probe with HEAD). This
>   required adding `MethodRouter::head` to the shared `RPoem`
>   (`open-runo-poem-compat`) facade — purely additive, no existing API
>   changed.
> - **New `/health` alias**: added alongside the existing `/healthz` so this
>   app's health-check shape matches what other repos in this ecosystem's
>   "digital twin" (分身の術) tenant-registration pattern (open-web-server /
>   open-easy-web) generically expect.
> - `GET /v1/db/info` now reports `rsync_available` (an actual
>   `rsync --version` probe) so you can check whether rsync is usable before
>   trying `/v1/db/rsync-backup`.
> - Verified with `cargo build`/`cargo test` (18/18 green) plus a real
>   running binary: `HEAD /` and `HEAD /app.js` return the correct
>   Content-Length/Content-Type with an empty body, `GET /health` returns
>   `{"ok":true}`, and `GET /v1/db/info` includes `rsync_available`.

> 📌 **Latest update (2026-08-24): a virtual school (higher education) and a
> virtual online vocational school**:
> - **🏫 Virtual school (higher education)** lets you pick one of four categories —
>   **vocational college (senmon gakko), junior college, university (undergraduate),
>   graduate school** — then install fields within it. Installed fields produce
>   **original mock questions** loosely modelled on entrance exams, classes and
>   in-school tests, and score your answers.
> - **🛠 Virtual vocational school** works the same way for industry/occupation fields,
>   testing basic knowledge with **original questions**.
> - **Seven fields actually work today, five questions each**: university = humanities &
>   social sciences / science & engineering; vocational college = information technology;
>   graduate school = research fundamentals (research plans, research ethics, interviews);
>   vocational training = IT & programming basics / bookkeeping & accounting basics /
>   customer service basics.
> - **Everything else honestly says "not ready yet"** (medical office admin, care work,
>   beauty, cooking, construction, **all four junior-college fields**, medicine & nursing,
>   education, engineering graduate specialisation, and more). Each category button shows
>   "N of M fields available" so you can see the coverage before opening it.
> - Each field carries a link to a **YouTube search-results page** for a generic study
>   keyword. **No specific video is endorsed as correct.**
> - **Honest disclosure**: every question is original to this app; nothing is copied from
>   real entrance exams, textbooks or commercial workbooks. **Essays, interviews and
>   practical skills are only approximated as multiple-choice knowledge questions** and are
>   no substitute for real essay feedback or interview practice. Scores predict nothing
>   about real admissions or qualifications.
> - Scores are stored through the existing history endpoint (`/v1/db/history`); no new API
>   was added.
> See the 2026-08-24 HANDOFF in [CLAUDE.md](CLAUDE.md) for details.

> 📌 **Latest update (2026-08-23, cont. 6): a much bigger tutor course**:
> - **13 grades, from preschool/kindergarten up to high school 3**, with new
>   original preschool questions (words, numbers, shapes & colours — 14 in all).
>   **No age gating**: a high-schooler or an adult can pick the preschool level
>   from the very start.
> - **Catch-up redesigned around grades, with no fixed limit.** Miss a question
>   and you first work through the easier versions available **within the same
>   grade**; when those run out you move to the same subject **one grade lower**
>   (grades with no questions are skipped). **No fixed step count exists in the
>   code** — it keeps going as long as prepared material exists, with
>   **preschool as the floor**, where it stops, shows the answer, and hands you
>   to the trainer. "🍼 Much easier" jumps straight to the lowest grade.
> - **"🔁 Change grade"** lets you switch grade at any time, mid-practice.
> - **A grade with no questions still works** — the course falls back to the
>   nearest lower grade that has them and says honestly which grade the question
>   came from.
> - **Guidance to set up a learning-history database first** (aruaru-db **or a
>   standard PostgreSQL**), plus dual-database, rsync backup, Google Drive and
>   shared-hosting/VPS sync notes. **Honest disclosure**: writing to two
>   databases at once is not implemented (dual is only possible via aruaru-db's
>   own `DUAL_DATABASE_URL`), connections are made without TLS, and Drive/VPS
>   sync is something you set up yourself — nothing syncs automatically. We
>   looked for the rsync mechanism in `open-easy-web` and **found none**; the
>   built-in rsync backup is what actually exists. These notes are translated
>   into the eight other README languages.

> 📌 **Latest update (2026-08-23, cont. 5): three puzzles, and a new
> grade-by-grade tutor course**:
> - **Three puzzles instead of one.** Alongside the "four 9s" puzzle there are
>   now **the snail in the well** (a 10 m well; the snail climbs 3 m by day and
>   slides back 2 m at night — the answer is **day 8**, and the question comes
>   with a diagram) and **the hen and the egg** (if one and a half hens lay one
>   and a half eggs in one and a half days, how long does one hen take to lay
>   one egg? — **one day**). One of the three is chosen at random each time.
>   **Honest caveat**: the two new puzzles are translated into **Japanese and
>   English only**; the original puzzle keeps its es/fr/de/zh/ko translations.
> - **🎓 Student tutor course.** A new button asks **which of the 12 grades**
>   (elementary 1 through high school 3) you are in, then lets you install that
>   grade's subjects one by one or with a single "install all subjects" button.
>   Practice asks **one randomly chosen question at a time**, with the answer
>   choices shuffled every time.
> - **Catch-up support (up to five steps).** When you miss a question that has
>   an **easier version**, you can go straight on to it, and each further miss
>   steps down again — **up to five progressively easier steps**. Miss the last
>   step and the app stops laddering, shows the correct answer, and points you
>   to the trainer review instead. **Honest caveat**: the steps are hand-written
>   static questions, not AI-generated, and how many steps exist differs per
>   question — currently **2 questions have all 5 steps, 16 have 2, 33 have 1,
>   and 20 have none (71 subject questions)**, plus 6 programming basics
>   questions of which 3 have one step.
> - **English from elementary grade 3.** Matching when foreign-language
>   activities begin in the Japanese curriculum, grade 3 now has **English**
>   (5 original beginner questions: greetings, colours, numbers, replies).
>   Grades 1–2 still have Japanese and arithmetic.
> - **Programming (new, with an honest caveat).** "Programming" is now offered
>   from grade 3 up. It first shows the guidance that **open-english's own AI
>   engine (aruaru-llm) is not strong enough on its own for programming
>   tuition, so we recommend the paid version of Claude Code Desktop alongside
>   it (available usage time depends on your plan)**. On top of that, open-english
>   alone offers **two ready-to-run hand-written samples** (a rock-paper-scissors
>   game and a self-introduction page) with step-by-step "try changing this"
>   challenges, plus 6 HTML/CSS/JavaScript basics questions. **The AI does not
>   generate games or websites from scratch** — everything here is fixed,
>   hand-written material.
> - **Diagrams.** Inline SVG figures are attached where a picture helps (the
>   well, circle area, a rectangular prism, fractions, a number line, a right
>   triangle, a parabola vertex) — **not to every question**.
> - **Honest caveat.** Every question is **original** to this app; nothing is
>   copied from textbooks, workbooks or real entrance exams. Only **6 grades
>   (elementary 1/3/6, junior high 1/3, high school 1) × a few subjects
>   (Japanese, maths, English)** have questions so far — any other combination
>   honestly reports "**not ready yet**" instead of pretending to be covered.
>   Scores are saved through the existing `/v1/db/history` endpoint (local
>   SQLite, mirrored to aruaru-db when `OPEN_ENGLISH_DATABASE_URL` is set), and
>   the course screen recommends setting up **Google Search** and **aruaru-db**
>   for the best experience.

> 📌 **Latest update (2026-08-23, cont. 4): the app can now pose an original
> puzzle from its creator**: say "give me a quiz", "give me a problem" or
> 「問題を出して」 and you get an **original puzzle by Masahiro Ishizuka**,
> the creator of this app. Using four 9s, fill each circle in
> `9 ◯ 9 ◯ 9 ◯ 9 = 10` with `+`, `-`, `×` or `÷` — the same symbol may be
> reused, and parentheses `( )` may be added to change the order of
> operations — so that the result is exactly 10. **It is not a trick
> question or a play on words**: it is pure arithmetic, and you can check it
> on a calculator or an abacus. The youngest person to have solved it so far
> was a first-grader in elementary school. The exchange is **two-stage** —
> you get the question first, and the answer only once you say "I don't
> know" or "tell me the answer". Output is **Japanese + English by default**;
> if your selected learning language (or native language) is Spanish,
> French, German, Chinese or Korean, that translation is placed first.
> **Honest caveat**: only those 7 languages (ja/en/es/fr/de/zh/ko) are
> translated — we have deliberately *not* machine-translated all 130
> supported languages to look "fully localised", so speakers of the other
> languages get the default Japanese + English version. Both the question
> and the answer are **hand-written fixed text that never passes through AI
> inference**, for the same reason as the answers below: a bare GPT-2 will
> confidently produce arithmetic that does not add up. It does not consume
> your daily usage quota.

> 📌 **Latest update (2026-08-23)**: Added two **rule-based, hand-written
> fixed-text answers** (bilingual JA/EN, no AI inference).
> **(1) Islam, Iran/Persia and the Arab world**: questions about history and
> roots get a neutral, fact-based summary — the Christian communities of
> pre-Islamic Arabia (Najran, the Ghassanids), the formation of the Qur'an
> which scholarship describes as **its own distinct, independent tradition**,
> the difference between Iranian and Arab civilisations, and the Zoroastrian
> influence, the last of these presented explicitly only as **"a hypothesis
> some scholars argue"** rather than settled fact. Two claims that were
> originally to be included (that the Qur'an came out of a Bible translation;
> that a brother of Muhammad was the translator) were **deliberately left out
> for lack of support in the surviving sources**. It closes with the thought
> that language barriers feed misunderstanding, and that **machine
> translation and multilingual conversation may help build mutual
> understanding and peace**.
> **(2) "Is 666 the mark of the beast?"**: a light piece of bilingual trivia.
> It states the Revelation passage neutrally, introduces the modern
> **"666 = WWW"** wordplay (Hebrew gematria: the letter vav is worth 6)
> **explicitly as a reading some people enjoy, not as doctrine**, flags the
> "hidden 666 in barcodes" story **explicitly as an urban legend** and
> explains the actual engineering: the longer bars at each end and in the
> middle are **guard bars** marking start, end and midpoint for the scanner;
> they merely *look* like the digit 6 but use a different encoding (3 modules
> rather than 7) — fact-checkers such as Snopes rate the claim FALSE, so there
> is **no occult meaning and no technical basis**. It then lands somewhere
> cheerful: the Web and barcode scanners made shopping convenient **without
> anyone needing a mark on their body**. A closing footnote notes that the
> Python logo is a snake but the name comes from the comedy series "Monty
> Python's Flying Circus" — the resemblance to the "beast" is **stated
> explicitly to be pure coincidence and wordplay**, with no real connection.
> **Added 2026-08-23**: one further aside notes that Revelation 13:16-17
> really does contain a passage saying no one without the mark can buy or
> sell, and that **some people note an interesting parallel** between this and
> how modern shopping increasingly relies on barcodes and online payment
> systems like Amazon — **offered strictly as a coincidence some find
> striking, never as a claim that any prophecy has been fulfilled**.
> See the 2026-08-23 HANDOFF entries in [CLAUDE.md](CLAUDE.md).

> 📌 **Latest update (2026-08-22, continued)**: Added **persistent settings, a native
> language setting, customisable display order, a topic briefing, and a 130-language
> registry**.
> - **Install / uninstall languages**: in the "🌐 Languages" panel, ticking a box
>   installs (adds) a language and unticking uninstalls (removes) it. You can also pick
>   **one native language**; together with the languages you are learning you can have
>   **up to 6 entries** (English and Japanese are always on, plus up to 3 more and your
>   native language). The 130-language list can be **filtered by language name or by
>   country**, and each row shows a **flag emoji and country name**.
> - **Ordering**: set the display and read-aloud order in three interlinked ways —
>   (1) type a number, (2) pick a radio button 1–6, (3) use ▲ / ▼. Changing one updates
>   the others. Picking a number another language already uses swaps the two, so numbers
>   never collide.
> - **Settings survive maintenance and automatic updates**: they are written to both
>   browser localStorage and the local SQLite database, and restored from the database if
>   localStorage is cleared. `auto-update.js` now explicitly preserves these keys when it
>   purges old-version data.
> - **Topic briefing**: after you choose your languages, a progress display ("gathering
>   information / maintenance in progress") collects background about the region of your
>   top-ranked language. **News headlines are genuinely fetched from the internet** (a
>   public Google News RSS feed, headlines only — never article text). Capital, major
>   cities, sights, food, famous people and well-known companies (with one-line summaries)
>   come from static data written for this app. A button then hands the topics to the AI
>   tutor for conversation practice.
> - **Language registry expanded to 130** — but **only 40 of them (English, Japanese and
>   38 more) actually have practice questions and detailed background data**. The other 90
>   are listed with name, flag and country only, and the UI says so plainly. This is a
>   staged rollout, **not full support for 130 languages**. The 130 per-language doc
>   folders in [`docs/i18n/`](docs/i18n/) are mostly untranslated placeholders; no machine
>   translation has been pasted in and presented as a finished translation.
>
> *日本語*: 設定の永続化(localStorage+ローカルSQLite)、母国語の指定、表示順の
> 3系統連動指定(数字入力・ラジオボタン・▲▼)、公開RSSからの実ニュース取得を含む
> 話題ブリーフィング、国旗・国名付きの言語一覧と国名検索、対応言語一覧の130言語化を
> 追加しました。ただし実際に問題・地域データがあるのは40言語のみで、残り90言語は
> 名前のみの段階的拡大です。詳細は[CLAUDE.md](CLAUDE.md)の2026-08-22 HANDOFF参照。

> 📌 **Latest update (2026-08-22)**: Added **world-language practice
> exams, a language-selection UI, and sequential multilingual display &
> read-aloud**. English and Japanese remain the defaults, but a
> bilingual banner and the "🌐 Languages" panel let you enable original
> practice sets for **38 languages** (Europe, Middle East, Asia, India,
> Africa). After scoring, the missed items flow into conversation
> practice with the tutor for that language, exactly like the existing
> Eiken/TOEIC/TOEFL/JLPT flow. You can also select **2–5 languages**
> (including English and Japanese) and have the same phrase displayed
> and read aloud in order, replayable as often as you like (all at once
> or one language at a time), with copy/paste, .txt download, and
> save-to-local-SQLite. Honest disclosure: these are original questions
> written for this app — not past questions from, and not affiliated
> with or endorsed by, any real certification exam (DELE, DELF,
> Goethe-Zertifikat, HSK, TOPIK, ...). CEFR-style levels (A1–C2) are
> loose approximations only, item counts are uneven (3–6 per language),
> and read-aloud uses the browser's built-in Web Speech API, so a
> language with no installed voice is displayed but not spoken. See the
> 2026-08-22 HANDOFF entry in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 世界38言語のオリジナル擬似模擬試験・言語選択UI(2〜5か国語)・
> 多言語の連続表示/読み上げ(何度でも再生可)・コピー&ペースト/ファイル
> 保存/DB保存を追加しました。実在の資格試験の過去問ではなく、それらとは
> 無関係なオリジナル問題です。詳細は[CLAUDE.md](CLAUDE.md)参照。

> 📌 **Latest update (2026-08-20)**: Added periodic automatic update
> checks (every 6 hours, in addition to the startup check) and a
> manual downgrade feature. If a new version turns out to be buggy
> after a while, `GET /v1/updates/history` (current + retained
> previous versions) and `POST /v1/updates/downgrade` (roll back
> open-english itself, aruaru-llm, or aruaru-db individually to a
> specific version) let you revert just that one component. UI: the
> "🔄 Updates & Rollback" section inside the "💾 Data & Model Storage"
> panel. Honest disclosure: only the last 3 generations are retained
> by default (disk-space consideration) — you cannot roll back
> further, or to a version that was never actually applied on this
> machine. See the 2026-08-20 HANDOFF entry in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 定期的な自動アップデートチェック(起動時に加え6時間ごと)+
> 手動ダウングレード機能を追加しました。`GET /v1/updates/history`・
> `POST /v1/updates/downgrade`で、open-english本体・aruaru-llm・
> aruaru-dbのいずれかを個別に旧バージョンへ戻せます。保持世代は
> 既定3世代までです。詳細は[CLAUDE.md](CLAUDE.md)の2026-08-20 HANDOFF
> 参照。

> 📌 **Update (2026-08-19, continued 8)**: When the daily usage
> counter (default 100, client-side `localStorage`) is reached, the
> chat now shows a bilingual notice — "You've exceeded today's free
> usage limit. Would you like to switch to a paid plan?" — plus the
> free-tier info for other AI providers (Google Search/DeepSeek/
> ChatGPT/Gemini/Claude), read dynamically from
> `provider-free-tiers.json`. Honest disclosure: this is a
> notice-only, client-side implementation with no real billing/
> upgrade flow. See the 2026-08-19 (continued 8) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 1日の利用回数上限(既定100回)に到達した際、チャット上に
> 「有料版に切り替えますか？」+他のAIプロバイダの無料枠情報を日英併記
> で表示するようにしました。実際の課金処理は行いません。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-19(続き8)HANDOFF参照。

> 📌 **Update (2026-08-19)**: Added Claude (Anthropic) to the
> AI/search free-tier banner as a paid-by-default option (honestly
> noted as having no ongoing free tier, only a small signup credit if
> any). See the 2026-08-19 (continued 5) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 上部のAI/検索無料枠バナーに、有料前提のClaude(Anthropic)
> を選択肢として追加しました。詳細は[CLAUDE.md](CLAUDE.md)の
> 2026-08-19(続き5)HANDOFF参照。

> 📌 **Latest update (2026-08-19)**: Added `facebook.html`, an entry
> page meant to be shared as a link on a Facebook Page or in Messenger,
> for users whose mobile plan only allows Facebook access. Honest
> disclosure: true Facebook "Free Basics"-style zero-rated free access
> is not achievable without an official partnership with Meta, which
> this project does not have — `facebook.html` works as a normal page
> reachable from Facebook's in-app browser and points to the existing
> installers (Windows/Linux/macOS/Android); the app itself still runs
> on a local server on your own device (`server/`). See the 2026-08-19
> HANDOFF entry in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: Facebookしかアクセスできないスマホ契約の利用者向けに、
> Facebookページ/Messengerで共有するリンク先`facebook.html`を新設
> しました。Facebookとの正式提携が無いため「完全無料アクセス」自体は
> 実現できておらず、既存インストーラーへの導線を案内するのみです。

> 📌 **Latest update (2026-08-11–12, v0.6.0)**: Android/tablet now runs
> fully standalone — no PC or Linux server required. The AI response
> engine (`aruaru-llm`) itself is now bundled into the APK; on-device
> verification confirmed both processes stay alive and respond to
> `/healthz`/`/v1/chat`. Also added: a certification exam-prep corner
> (Eiken 1-5, TOEIC, TOEFL, JLPT N1-N5, Nihongo Kentei 1-3, 10 original
> questions each) that hands missed questions to the AI trainer after
> scoring (auto-switching to a "Japanese classroom" mode for JLPT/
> Nihongo Kentei), a "which language to learn" selector, and Linux/
> macOS installers (`installer/unix/install.sh`). Honest disclosure:
> model weights (GPT-2 family, embedding model) are not bundled in the
> APK — using AI chat on Android still requires placing model files in
> internal storage manually (no auto-download yet). See the 2026-08-11
> (continued 7-10) HANDOFF entries in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: Android/タブレットがPC/Linuxサーバー不要で単体動作する
> アプリになりました。AI応答エンジン自体もAPKへ同梱し実機で動作
> 確認済み。資格試験対策コーナー(英検/TOEIC/TOEFL/JLPT/日本語検定、
> 各10問)+採点後のAI講師連携、学びたい言語選択、Linux/macOS版
> インストーラーを追加。モデル重みは未同梱(手動配置が必要)。

> 📌 **Latest update (2026-08-18)**: Started building a proper local
> database for conversation history/settings. **Why not SQLite alone**
> — SQLite remains the always-available local baseline, but when
> `aruaru-db` (PostgreSQL) is configured, writes are also mirrored
> there automatically. Combined with `aruaru-db`'s own
> `DUAL_DATABASE_URL` feature (self-healing mirroring between two
> PostgreSQL instances), **if one database instance fails, the other
> automatically repairs it and protects your data** — a safer setup
> than SQLite alone. If no mirror is configured or the connection
> fails, the app keeps working on SQLite only, so availability is
> never sacrificed. This increment implements SQLite persistence for
> messages/settings plus the `/v1/db/*` API, verified over real HTTP
> (see `server/src/db.rs`). Also added: a storage-location picker
> (`/v1/db/storage-path`), rsync backup (`/v1/db/rsync-backup`), and a
> generic legacy-data import endpoint (`/v1/db/migrate-legacy`). If
> rsync isn't installed, the API replies with a bilingual **"Let's
> install RSync!"** prompt, and `/v1/db/install-rsync` auto-installs it
> via the right package manager for the OS (winget/choco on Windows,
> apt-get/dnf/pacman on Linux, brew on macOS, pkg on Android) and
> immediately retries the backup on success. Usage pie chart display
> and multi-device sync are still planned for the next increment.
>
> *日本語*: 会話履歴・設定の本格的なローカルデータベース化に着手。
> SQLiteを常時利用可能な基盤にしつつ、`aruaru-db`(PostgreSQL)を
> 設定すればそちらへも自動ミラー。`aruaru-db`のDUAL DB自己修復機能と
> 組み合わせ、片側障害時にもう片側から自動修復する安全性の高い構成。
> 未設定時はSQLiteのみで継続動作。保存先選択・rsyncバックアップ・
> 旧データ取り込みも実装済み。rsync未導入時は「RSyncをインストール
> しましょう！」と案内し、自動インストール+成功後の自動バックアップ
> まで1回で完了。円グラフ表示・複数端末同期は次の増分で対応。

> 📌 **Older update (2026-08-11, continued 3)**: Added an automatic
> self-update feature (Windows only) that checks GitHub for the latest
> release at startup and, if newer, automatically uninstalls the old
> version and installs the new one. Honest disclosure: no GitHub
> Release exists yet, so the full uninstall→install flow hasn't been
> end-to-end verified (version-comparison logic and the "no release
> found, continue safely" path have been). See the 2026-08-11
> (continued 5) HANDOFF entry in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 起動時にGitHubの最新版を自動確認し、新しければ自動で
> アンインストール→自動インストールする機能を追加(Windowsのみ)。
> リリースがまだ無いため一気通貫の動作確認は次回持ち越し。

> 📌 **Older update (2026-08-11, continued 2)**: Added detection for
> job-hunting/career-change/tourism topics that introduces aruaru.tokyo
> (AI-driven development, Claude Code Desktop), audiocafe.tokyo/aruaru
> (IT/construction jobs), audiocafe.tokyo/aruaru-lady (jobs for women),
> and nasa.tokyo in both English and Japanese — works in both normal
> chat and training mode, verified live. See the 2026-08-11 (continued
> 4) HANDOFF entry in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 就職・転職・観光の話題を検出し、aruaru.tokyo・
> audiocafe.tokyo/aruaru・aruaru-lady・nasa.tokyoへのリンクを日英併記で
> 案内する機能を追加(通常チャット・研修モード両方)。

> 📌 **Older update (2026-08-11, continued)**: Linked to a new geo/
> tourism database (all 47 Japanese prefectures, 50 US states, major
> world capitals with landmarks/food/souvenirs) to make the self-
> introduction training dynamic. When Mount Fuji comes up, the app now
> shows a bilingual safety advisory (wear ski gear + a helmet, reserve
> a mountain hut in advance) plus real hut/bus/gear-shop info and a
> tour-booking search. Added age-group/level/business-English selection
> UI. Verified live against a real running `aruaru-llm` + static server
> (found and fixed 3 real bugs in the process). See the 2026-08-11
> HANDOFF entries in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: 地理・観光DBと連携し自己紹介研修の話題を動的化。富士山の
> 話題では安全上の注意・山小屋/バス/登山用品店情報・観光ツアー検索を
> 日英併記で案内。年齢層・レベル・ビジネス英会話選択UIも追加。実機で
> 検証し3件のバグを修正済み。

> 📌 **Older update (2026-08-11)**: Added a settings panel for saving
> your Google Search API key/cx directly from the browser
> (`POST /v1/settings/google-search`, in-memory only, never written to
> disk). The Windows installer (`installer/windows/`, Inno Setup) has
> now been actually built, installed, launched, and uninstalled on real
> hardware (no admin rights required). See the 2026-08-11 HANDOFF entry
> in [CLAUDE.md](CLAUDE.md).
>
> *日本語*: ブラウザから直接Google検索APIキー・cxを保存できる設定パネルを
> 追加(メモリ上保持のみ)。Windowsインストーラーを実際にビルド・
> インストール・起動・アンインストールまで実機検証済み。

> 📌 **Older update (2026-08-10, continued)**: (1) Switched the default
> model from `gpt2` (124M) to `distilgpt2` (82M), ~42% faster (see
> `aruaru-llm/CLAUDE.md`). (2) Decided **against** porting the frontend
> JS to Rust/WASM (no performance benefit, and `SpeechRecognition` has
> no standard web-sys binding) — instead **ported the local file
> server to Rust** (new `server/` crate, built on RPoem's
> `open-runo-poem-compat`, removing the `python3 -m http.server`
> dependency). (3) Improved Japanese input handling so hybrid
> (English+Japanese) replies are always guaranteed
> (`app.js`'s `ensureHybridReply` — if the model's reply contains no
> Japanese, the frontend appends a short honest Japanese note itself;
> it does not fake machine-translation quality). (4) Added version
> management (`version.json` now has a semantic `version` field, shown
> in the footer) and automatic cleanup of old versions' browser-side
> traces (`auto-update.js` clears this app's own `localStorage` and
> does a cache-busting reload on update — since this is a static web
> app with no native installer, "uninstalling old versions" is scoped
> to browser-side leftovers only, not disk files). See the 2026-08-10
> (continued 3) HANDOFF entry in [CLAUDE.md](CLAUDE.md) for details.
>
> *日本語*: 既定モデルをdistilgpt2へ切替(約42%高速化)、フロントエンドJSの
> Rust移植は見送り配信サーバー側をRust化、日本語入力時のハイブリッド
> 応答を保証、バージョン管理+旧バージョンのブラウザ側クリーンアップを
> 追加した。詳細は[CLAUDE.md](CLAUDE.md)参照。

> 📌 **Recent update (2026-08-10)**: Added CORS support (`.with_cors()`
> on the `aruaru-llm` side), fixed the root cause of GPT-2 greedy-
> decode's degenerate repetition loop (`open-cuda`'s `GptModel::
> generate_with_repetition_penalty`, default `penalty=1.3`), tweaked
> the Tora-san character's look (bigger light-brown bag, straw-sandal-
> style feet) + added a switch-in jingle + fixed his self-introduction,
> added a training step based on a real Akihabara maid cafe's
> (@ほぉ～むカフェ) actual customer-service technique, researched (in
> Japanese and English) and added a step covering the current overseas
> boom in Japanese culture (anime/manga, anime songs, games, Japanese-
> language learners, goshuin stamp collecting, onsen ryokan tourism,
> Japanese food), added launcher icons for Windows/Mac/Linux/Android/
> iPhone/iPad (`icons/`+`launchers/`+`manifest.json`), and added an
> auto-update mechanism (`auto-update.js` polling `version.json`). See
> the 2026-08-10 HANDOFF entry in [CLAUDE.md](CLAUDE.md) for details.
>
> *日本語*: CORS対応・GPT-2反復ループの根本解決・トラさんの見た目調整・
> 実際のメイドカフェ接客技法の反映・日本文化ブームの調査反映・全プラット
> フォーム向けランチャーアイコン・自動更新機能を追加した。詳細は
> [CLAUDE.md](CLAUDE.md)参照。

A browser-based (Phase 0) English-conversation learning web app for
PC/tablet/smartphone. In the style of a "maid cafe English lesson,"
a magical-girl maid character (original design, animated) coaches
students from complete beginner to advanced.

## Architecture (per user instruction, 2026-08-10)

- **Linux (VPS) side**: only a download-distribution server (not where
  this app actually runs). App management is handled by
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web).
- **User's device (PC/tablet/phone) side**: this repo's static web
  frontend (HTML/CSS/JS, runs in the browser) + a locally-run native
  server from [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm)
  (which internally uses `open-directx`/`open-cuda`'s inference
  backend), which the user downloads and runs themselves. The browser
  connects to `http://localhost:4600` (aruaru-llm's default port)
  locally, online or offline — a "hybrid" design.

## Current scope (Phase 0) — honest disclosure

- **AI response quality**: `aruaru-llm`'s `/v1/generate` performs
  autoregressive text generation via GPT-2 (124M-1.5B, English-centric,
  no dialogue fine-tuning). Response quality is not guaranteed to be
  fluent or level-appropriate — this is disclosed on-screen, not
  overstated. As of 2026-08-10, a repetition penalty (default 1.3,
  `ARUARU_LLM_REPETITION_PENALTY` env var) fixes the previously-reported
  degenerate infinite-repeat bug (e.g. endless "Student: Hello").
- **CORS**: fixed as of 2026-08-10 — `aruaru-llm`'s HTTP server now
  sends `Access-Control-*` headers via `open-runo-poem-compat`'s
  `.with_cors()`, so this frontend can be opened cross-origin (or via
  `file://`) and still reach `http://localhost:4600`.
- **Level selection**: the beginner-to-advanced level picker exists in
  the UI, but actual level enforcement is limited to a short prompt
  instruction — GPT-2 is not guaranteed to honor it.
- **Expanded language support (2026-08-25, honest disclosure — important)**:
  `#learn-target` and `#reply-lang` now offer German, French, Spanish,
  Italian, Russian, Arabic, Persian (Farsi), and Hebrew. These options
  are wired up end-to-end, but **live testing showed aruaru-llm
  (English-centric small GPT-2) completely ignores the language
  instruction and always replies in plain English** — repeated tests
  for Russian, Arabic, Persian, and Hebrew produced zero characters of
  the target script. We reused the same "structural guarantee" pattern
  as the existing Japanese `ensureHybridReply`: for Russian/Arabic/
  Persian/Hebrew (detectable via `\p{Script=Cyrillic}` /
  `\p{Script=Arabic}` / `\p{Script=Hebrew}`), `app.js`'s
  `ensureScriptGuaranteedReply` appends an honest bilingual note when
  no target-script character was generated. German/French/Spanish/
  Italian use the same Latin alphabet as English, so failed generation
  can't be mechanically detected — the UI shows a static caveat next
  to the language picker instead. **Bottom line: these 8 languages are
  selectable but not practically usable for conversation practice yet
  — we are not claiming this is a finished feature.** Arabic, Persian,
  and Hebrew are RTL scripts, so the chat bubble for those selections
  gets `dir="rtl"` (the rest of the app stays LTR).
- **Voice**: real Web Speech API (SpeechSynthesis for output,
  SpeechRecognition for mic input) is wired up, with per-character
  pitch/rate tuning (maid vs. Tora-san helper) and a
  language-extraction fix (2026-08-10) so mixed English/Japanese lines
  no longer sound choppy when spoken.
- **Training mode**: a deterministic self-introduction script (not
  AI-generated) that now also includes a real Akihabara maid cafe's
  (@ほぉ～むカフェ) word-based conversation technique (e.g. "Where are
  you from?" -> "Australia!" -> "Kangaroo!!"), and a step summarizing
  the current overseas boom in Japanese culture (researched in both
  Japanese and English): anime/manga (Demon Slayer, Attack on Titan),
  anime song live events (Animelo Summer Live), Japanese video games,
  ~3.79 million Japanese-language learners worldwide, goshuin (temple/
  shrine stamp) collecting among tourists, onsen ryokan and shrine/
  temple tourism, and Japanese food.
- **Launcher icons**: `icons/` + `manifest.json` (PWA) + `launchers/`
  (Windows `.lnk` creation script, Linux `.desktop` file, macOS `.app`
  builder script, and a mobile PWA "Add to Home Screen" guide) let
  users launch this app from a Windows/Mac/Linux desktop icon or an
  Android/iPhone/iPad home-screen icon.
- **Auto-update**: `auto-update.js` polls `version.json` every 5s and
  reloads the page when the build ID changes. **Known limitation**:
  some browsers block `fetch()` of local files under the `file://`
  scheme for security reasons — this feature is guaranteed to work when
  served over a local HTTP server (see `launchers/mobile/README.md`
  for a one-line `python3 -m http.server` example), and silently
  no-ops (doesn't break anything) if blocked under `file://`.

## Required installers (added 2026-08-17)

To run open-english, you need to download and install the following two pieces of
software (no build-from-source required, close to a one-tap install).

| # | What | Windows | Linux | Android/tablet |
|---|---|---|---|---|
| 1 | **open-english itself** (this repo — static frontend + delivery server) | [open-english-installer.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-installer.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest) (`open-english-installer-<os>.tar.gz`) | [APK](https://github.com/aon-co-jp/open-english/releases/latest) (`open-english-installer.apk`) |
| 2 | **aruaru-llm** (the AI response engine — required, chat won't work without it) | [aruaru-llm-installer.exe](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-installer.exe) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Bundled already (included inside open-english's APK, no separate install needed) |

**How to launch it after installing (added 2026-08-27, in response to a
user question)**: the app name, Start Menu group name, and shortcut
name in the installer (`installer/windows/open-english.iss`) are all
the same string, **"open-english"**. You can launch it either by
double-clicking the desktop icon or by typing "open-english" into
Windows Search (bottom-left search box) — both find the same app (the
desktop icon, if you chose to create one during install, also uses the
same "open-english" name). / **インストール後の起動方法(2026-08-27
追記、ユーザーからの質問への回答)**: インストーラーのアプリ名・
スタートメニューのグループ名・ショートカット名は、いずれも
「open-english」という文字列で統一されています。デスクトップアイコンの
ダブルクリックでも、Windows検索(画面左下の検索欄)に「open-english」と
入力してもアプリが見つかり起動できます。

The installer binary (`open-english-installer.exe`) is also committed
directly in the GitHub repository at
[`installer/windows/open-english-installer.exe`](installer/windows/open-english-installer.exe)
(the GitHub Releases "latest" link above is still the recommended way
to get it, but this is a clear, discoverable spot if you'd rather
browse the repo directly). / インストーラー本体は
[`installer/windows/open-english-installer.exe`](installer/windows/open-english-installer.exe)
にも直接コミットされています。

**Honest disclosure**: the "latest" links above always point to the newest GitHub
Release (use the [Releases page](https://github.com/aon-co-jp/open-english/releases)
directly if you want a specific pinned version). There is no prebuilt macOS binary for
`aruaru-llm` yet (open-english itself ships a macOS tar.gz, but `aruaru-llm` only ships
Linux/Windows) — on macOS you'll need to build `aruaru-llm` from source.

On Windows/Linux/macOS, after installation the app's built-in auto-update feature
(`server/src/self_update.rs`, extended to Linux on 2026-08-19 and to macOS the same day)
checks GitHub Releases at startup and, if a newer version exists, automatically updates
(Windows: uninstall→install; Linux/macOS: the running binary replaces itself in place) —
no user action required. Before applying an update, the current binary is backed up; after
the new version starts, a health check against the new `/healthz` endpoint must succeed
within a short grace period, or the app automatically rolls back (downgrades) to the
backed-up previous version. **Honest disclosure**: Android/iPhone/iPad are excluded from
this auto-update/auto-rollback mechanism, since the OS does not allow fully silent APK
install — update notifications still require the user to tap through the install
manually (and there is no downgrade path there either).

*(Machine-translation note: this paragraph and the note below were translated by the AI
agent itself, without native-speaker proofreading.)*

There is also a new entry page, `facebook.html`, for users whose mobile plan only allows
access to Facebook — see the 2026-08-19 banner above for details and its honest
disclosure about the limits of this approach.

## How to run

1. Run [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm) with
   `cargo run --release` (default `http://localhost:4600`, default
   model is now `distilgpt2`).
2. In `server/`, run `cargo run --release` to serve this repo's static
   frontend at `http://127.0.0.1:4601/` (RPoem-based — `python3 -m
   http.server` is no longer needed; override the port with the
   `OPEN_ENGLISH_SERVER_BIND` env var).
3. Open `http://127.0.0.1:4601/` in a browser. Opening `index.html`
   directly via `file://` still works, but some browsers block
   `fetch()` there and disable auto-update — the server in step 2 is
   recommended.

## Next steps

1. ~~CORS support on the `aruaru-llm` side~~ **Done (2026-08-10)**.
2. ~~GPT-2 greedy-decode repetition loop~~ **Root cause fixed
   (2026-08-10, repetition penalty)**.
3. ~~Speed up the default model~~ **Done (2026-08-10, switched to
   distilgpt2, ~42% faster)**.
4. ~~Guarantee hybrid replies for Japanese input~~ **Done
   (2026-08-10)**.
5. ~~Rust-ify the local file server~~ **Done (2026-08-10, `server/`
   crate)**. Porting the frontend JS itself to Rust/WASM was
   evaluated and skipped (no performance benefit — see `CLAUDE.md`).
6. Add TTS/lip-sync animation polish.
7. Implement a per-level curriculum (grammar, vocabulary lists, etc.).
8. **(per user instruction, 2026-08-10)** A future idea to run
   `open-directx`/`open-cuda`/`aruaru-llm` in-browser (WASM/WebGPU) and
   integrate with `RPoem` (a GraphQL Federation platform). This is a
   large, separate architectural direction from the current Phase 0
   (local resident server + localhost connection) design, deferred
   until after the MVP is complete and scoped as its own effort.
9. Investigate whether Toshiba SBM or DeepSeek-family techniques have
   any genuine application here (not yet started).


---

## Update 2026-08-23 — `GET /v1/cpu-runtime` extended with ISA *combination* information

Previously the endpoint returned a flat list of CPU feature booleans. Since
real CPUs carry several instruction sets simultaneously (AVX2+FMA3,
AVX-512F+BW+VNNI, …), a flat list does not reveal the actual dispatch
conditions. Using the new combination API in `open-cpu`, the response now
also includes:

- `isa_profile` / `isa_profile_raw` — the satisfied combination tier
- `float_impl` / `bit_impl` — the implementation chosen per kernel
- `combination_examples` — whether `avx2+fma3`, `avx512f+bw+vl`,
  `avx512f+bw+vnni`, `ssse3+pclmulqdq` and `gfni+avx2` hold
- `cpu_vendor`, `cpu_family`, `fast_bmi2`
- `detected_but_unused` — features detected but not exploited
- `gfni` and `vpclmulqdq` detection

Verified end-to-end by starting the server and running
`curl http://127.0.0.1:4601/v1/cpu-runtime`. On the development machine
(Ryzen 9 3950X, Zen 2): `isa_profile: "avx2+fma3"`, `fast_bmi2: false`,
`detected_but_unused: "aes sha"`.

### ⚠️ Honest disclosure: this remains display-only

We searched `server/src` for anything worth SIMD-accelerating and found
**no CPU-bound hot loop**: chat responses are HTTP calls to `aruaru-llm`,
and the learning features are static-data lookups with no heavy text
similarity computation. Rather than inventing a theoretical use, the
response now carries `disclosure_ja` / `disclosure_en` fields stating that
the genuinely accelerated consumers are `open-raid-z` (GF(2^8)),
`open-cuda` / `aruaru-llm` (CPU inference) and `open-cg-cad`
(cross-section derivative).

## Update (2026-08-24, continued): career guidance extended to the virtual vocational school + display bug fixes

- Career guidance was extended to the virtual school / vocational
  school corner (`VSCHOOL_FIELDS`, 23 fields), shown on the field
  selection screen. A duplicate-display bug (caused by two parallel
  implementations from a session branch) between this and the tutor
  course was found and fixed on real device testing.
- **Urgent bug fix**: elements with a light background but no explicit
  text color (chat input, multilingual sequential display, topic
  briefing, etc.) rendered white-on-white and were unreadable — fixed.
  Inconsistent font sizes between Japanese text and Latin labels (e.g.
  "JP", "(default / 既定)") were also unified.
- The learning-history DB guidance text still said "no TLS support,"
  even though TLS support (`tokio-postgres-rustls`) was actually added
  on 2026-08-24 — updated to match reality. Honestly noted that this
  machine has no cargo/psql/Docker, so it could not be tested end to
  end here.

## Update (2026-08-24, continued): one-tap PWA install on Android

Added a Service Worker (`sw.js`) which, combined with the existing
`manifest.json`, enables PWA installation (one-tap "Add to Home Screen")
on Android Chrome. **Honest disclosure**: this machine has no `cargo`, so
the server could not be rebuilt, and it has not been verified end to end
that `/sw.js` is actually served or that the install banner appears on a
real device (needs testing once `cargo` is available). The existing
native APK (`android/`, Android SDK present) was not rebuilt this
session.

## Recent updates (2026-08-27)

Real deployment to the VPS (easy-web.tokyo/open-english), a folder
browser for choosing backup/storage paths, a persistent public/private
network-status badge with DuckDNS support for a custom domain,
collapsible UI panels, a real end-to-end test of GitHub/VPS write access
via the agent, drawing upload + text-based AI commentary shared with the
new open-cg-cad server (your own files only, no image analysis），a
multilingual (8 more languages) practice test for the US "Data
Scientist" certification, and a new opinion topic responding to
questions about retirement savings / Japan's "20-million-yen problem".
Full details only in the Japanese README.md/CLAUDE.md.

## Further updates (same day)

The retirement-savings/pension opinion topic and the e-government
opinion topic were each expanded with additional points (small
government, tax-revenue shortfalls, and a callback to the Obama quote),
and both topics now offer translations in 14 languages (Spanish, French,
German, Portuguese, Russian, Chinese Simplified/Traditional, Korean,
Hindi, Arabic, Hebrew, Persian, Ukrainian, Italian) when the learner has
selected one of those as their target language. Full details only in
the Japanese CLAUDE.md.
