# open-english Companion (VS Code Extension)

*日本語は下にあります / Japanese follows below.*

A companion extension for [open-english](https://github.com/aon-co-jp/open-english) — an AI-assisted language-learning platform where you study English, Japanese and languages from all over the world together with an AI teacher. It plays lesson audio in a Webview player that can optionally clean up the sound in real time (see below), and it can forward a file to a locally running [open-audio-sr](https://github.com/aon-co-jp/open-audio-sr) service (a real diffusion-model audio super-resolution AI, run entirely on your own machine) for AI quality enhancement. Nothing is sent anywhere beyond `127.0.0.1`.

## Install (VSIX from GitHub — no Marketplace account needed) / インストール(GitHubのVSIX、Marketplaceアカウント不要)

1. Download **`open-english-companion-0.2.0.vsix`** from the [companion-0.2.0 release](https://github.com/aon-co-jp/open-english/releases/tag/companion-0.2.0).
2. In VS Code: Extensions view → `...` menu → **Install from VSIX...** (or `code --install-extension open-english-companion-0.2.0.vsix`).
3. Open the Command Palette (`Ctrl+Shift+P`) and type `open-english`.

It is **not yet on the VS Code Marketplace**, so the search box inside VS Code will not find it yet. / VS Code Marketplaceには**未公開**のため、VS Code内の検索ではまだ見つかりません。

1. [companion-0.2.0のリリース](https://github.com/aon-co-jp/open-english/releases/tag/companion-0.2.0)から **`open-english-companion-0.2.0.vsix`** をダウンロードします。
2. VS Codeの「拡張機能」ビュー → `...` メニュー → **VSIXからのインストール**(または `code --install-extension open-english-companion-0.2.0.vsix`)。
3. コマンドパレット(`Ctrl+Shift+P`)で `open-english` と入力します。

## What it is for

Together with open-english you can choose **aruaru-search + aruaru-llm (completely free)**, free trials of **ChatGPT / DeepSeek / Grok**, or the most capable (but paid) **Claude Code Desktop**. You study English, Japanese and languages from all over the world with an AI teacher — and, at the same time, learn programming and enjoy building a smartphone app or a website together, using freelance job posts, internet news and the public curriculum of online-learning sites such as [Coursera](https://www.coursera.org) (for example, the data-scientist learning paths popular in the United States) as study material. This is the idea behind the [Maid Cafe Programming School](https://github.com/aon-co-jp/maidcafe-programming-school), which works hand in hand with open-english. (Coursera's offerings and prices change — always check Coursera's own site.)

## 何ができるか

open-englishと一緒に使うと、**aruaru-search + aruaru-llmの完全無料版**、無料でお試しできる**ChatGPT・DeepSeek・Grok**、一番優秀ですが有料の**Claude Code Desktop**などをお選びいただけます。AI先生と一緒に日本語・英語や世界中の言語を学びながら、同時にフリーランス案件・インターネットニュース・[Coursera](https://www.coursera.org)などオンライン学習サイトの公開カリキュラム(アメリカで求められるデータサイエンティストの学習内容など)を題材に、プログラミングを学び、スマホアプリやWEBサイトの開発も一緒に楽しめます。これが、open-englishと連携する[メイドカフェ・プログラミングスクール(Maid Cafe Programming School)](https://github.com/aon-co-jp/maidcafe-programming-school)の構想です。(Courseraの提供内容・料金は変わります。必ずCoursera公式サイトでご確認ください。)

## Commands

- **open-english: Open Audio Player** — opens a lesson/recording audio file in a Webview `<audio>` player.
- **open-english: Enhance Audio Quality (via local open-audio-sr)** — sends the selected file to a locally running `open-audio-sr` HTTP service (`http://127.0.0.1:4620`) for AI-based bandwidth extension / quality enhancement, and saves the result as `<name>.enhanced.wav` next to the original.

### Real-time sound enhancement in the player (new in 0.2.0, off by default)

The player has a **Preset** selector. It uses the Web Audio API inside the Webview — classic DSP, **not AI denoising**:

| Preset | What it does |
|---|---|
| Off | The original sound (default). |
| Clarity | Low-cut (90 Hz), a gentle voice-presence EQ, and a compressor/limiter that evens out loudness. |
| Quiet background | Low-cut, 50/60 Hz hum filters, and a **noise gate** that lowers steady background noise *between* phrases (by about 18 dB), with a short look-ahead so word beginnings are not cut. |
| Clarity + quiet background | Both. |

Measured in a browser with a synthetic voice over a −52 dBFS noise floor: the "Quiet background" preset lowered the background noise by about 15 dB while the voice level changed by only +1.3 dB. It cannot remove noise that overlaps the voice — for that, use AI enhancement below. If the gate cuts word beginnings, lower the *Noise gate threshold* slider. If a file's sound cannot be routed through the enhancer (it would be muted), the player detects it after a few seconds and automatically falls back to the original sound.

- **open-english: Toggle AI Teacher / Student Color View** — turns the color-coded overlay below on/off for the active editor.
- **open-english: Announce AI Teacher's Next Edit Area** — marks the current selection (or current line) with a dashed-yellow "about to be edited by the AI teacher" outline, before any text is actually written.
- **open-english: Write Here as AI Teacher** — prompts for text and inserts/replaces it at the current selection, tagged as AI-teacher-authored (clears any matching announcement).

### AI Teacher / Student visualizer (colors)

A lightweight, purely visual overlay for pairing an AI teacher with a student in the same file — no AI calls happen inside this extension; it only renders decorations based on who/what wrote which range:

| Color | Meaning |
|---|---|
| 🟦 Blue background | Text written via "Write Here as AI Teacher" (AI-teacher-authored) |
| 🟥 Red background | Text typed directly by the student (any other edit) |
| 🟨 Dashed yellow outline | Area announced via "Announce AI Teacher's Next Edit Area" — not written yet |
| 🟩 Green background | Whatever is being actively edited right now (fades out ~2.5s after typing stops) |

## Requirements

`Enhance Audio Quality` requires `open-audio-sr` running locally (`cargo run --release` inside that repository, see its README for the Python venv setup it depends on). Everything else works standalone.

## Bundled: Live Share

This extension is packaged with Microsoft's [Live Share](https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare) (`ms-vsliveshare.vsliveshare`) as an *extension pack*, so installing this extension also installs Live Share. Live Share lets two people read and edit the same files in real time (similar to the early Cloud9 shared-editor experience) — useful for the "Maid Cafe Programming School" project, where a learner and a mentor/AI-assisted pair work in the same editor session. This extension does not integrate with Live Share's protocol itself; it is simply installed alongside it for convenience.

## Also bundled (recommended): Japanese Language Pack + Prettier

This extension also bundles, as part of the same *extension pack* as Live Share (so they install alongside it, but are not a hard requirement to activate this extension):

- Microsoft's [Japanese Language Pack](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-ja) (`ms-ceintl.vscode-language-pack-ja`) — reflecting the Japanese-first, bilingual nature of open-english and this companion extension.
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) (`esbenp.prettier-vscode`) — this extension also contributes a guaranteed keybinding, **`Ctrl+Shift+I`**, for VS Code's built-in "Format Document" command (`editor.action.formatDocument`), so a formatting shortcut is always available regardless of the user's own keybinding customizations.

## Related projects

- [open-english](https://github.com/aon-co-jp/open-english) — the AI-assisted language-learning platform this extension is a companion to.
- [aon-co-jp on GitHub](https://github.com/aon-co-jp) — the organization behind open-english and its related projects (open-audio-sr, open-mqa-dsd, aruaru-search, aruaru-llm, and more).

---

## 日本語

[open-english](https://github.com/aon-co-jp/open-english)(AI先生と一緒に、英語・日本語・世界中の言語を学べるAI活用の語学学習プラットフォーム)の相棒(companion)となる拡張機能です。レッスン音声をWebviewのプレーヤーで再生し、任意でリアルタイムに音を整えられます(下記)。また、利用者自身のPC上で動く[open-audio-sr](https://github.com/aon-co-jp/open-audio-sr)(拡散モデルによる実在の音声帯域拡張AI)へファイルを渡して、AIによる高音質化もできます。`127.0.0.1`(自分のPC)を超えてネットワークへ音声を送信することはありません。

### コマンド

- **open-english: Open Audio Player / 音声プレーヤーを開く** — レッスン・録音音声ファイルをWebview内の`<audio>`プレーヤーで開きます。
- **open-english: Enhance Audio Quality (via local open-audio-sr) / 音声を高音質化する(ローカルのopen-audio-sr経由)** — 選択したファイルをローカルで起動している`open-audio-sr`のHTTPサービス(`http://127.0.0.1:4620`)へ送り、AIによる帯域拡張/高音質化を行い、結果を元ファイルと同じ場所へ`<ファイル名>.enhanced.wav`として保存します。

### プレーヤーのリアルタイム音質強調(0.2.0新機能、既定はオフ)

プレーヤーに**プリセット**の選択欄があります。Webview内のWeb Audio APIを使う一般的なDSPで、**AIによるノイズ除去ではありません**。

| プリセット | 内容 |
|---|---|
| オフ | 元の音(既定)。 |
| 明瞭化 | 低域カット(90Hz)、声の聞き取りやすさを上げる軽いEQ、音量を均一にするコンプレッサ/リミッタ。 |
| 背景ノイズ低減 | 低域カット、50/60Hzのハム除去、発話の「間」の一定の背景ノイズを(約18dB)下げる**ノイズゲート**(語頭が切れないよう短い先読み付き)。 |
| 明瞭化+背景ノイズ低減 | 両方。 |

ブラウザでの実測(−52dBFSの雑音床に擬似音声を重ねた音源): 「背景ノイズ低減」で背景ノイズが約15dB下がり、声の音量の変化は+1.3dBでした。声に重なったノイズは除けません(その場合は下記のAI高音質化を使ってください)。語頭が切れるときは「ノイズゲートのしきい値」スライダーを下げてください。ファイルによっては強調を通すと音が出なくなる場合があり、その際は数秒後に自動で検知して元の音の再生へ戻します。

- **open-english: AI先生・生徒の色分け表示を切り替え** — 下記の色分けオーバーレイのON/OFFを切り替えます。
- **open-english: AI先生の次の編集予定エリアを予告** — 実際に書き込む前に、選択範囲(または現在行)を「AI先生がこれから編集予定」として黄色の破線で予告表示します。
- **open-english: ここにAI先生として書き込む** — 入力したテキストを現在の選択位置へ挿入・置換し、「AI先生が書いた範囲」として色分けします(該当する予告表示は自動的に解除されます)。

### AI先生・生徒 色分けビジュアライザ

同じファイルでAI先生と生徒がペア作業する際の、純粋に表示だけの軽量な仕組みです。この拡張機能内でAIモデルを呼び出すことは無く、「誰(何)がどの範囲を書いたか」に基づいて色分け表示するだけです。

| 色 | 意味 |
|---|---|
| 🟦 青背景 | 「ここにAI先生として書き込む」で書かれたテキスト(AI先生が書いた範囲) |
| 🟥 赤背景 | 生徒が直接入力したテキスト(それ以外の編集) |
| 🟨 黄色破線枠 | 「AI先生の次の編集予定エリアを予告」でマークされた、まだ書かれていないエリア |
| 🟩 緑背景 | 今まさに編集中の箇所(入力が止まってから約2.5秒でフェードアウト) |

### 必要環境

「高音質化」コマンドの利用には、ローカルで`open-audio-sr`を起動しておく必要があります(そのリポジトリ内で`cargo run --release`。事前のPython venv準備はそのリポジトリのREADMEを参照)。それ以外の機能は単独で動作します。

### 同梱: Live Share

本拡張機能はMicrosoft製の[Live Share](https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare)(`ms-vsliveshare.vsliveshare`)を*extension pack*として同梱しており、本拡張機能をインストールするとLive Shareも一緒にインストールされます。Live Shareは初期のCloud9のように、相手と同じファイルをリアルタイムに読み書きできる機能で、「Maid Cafe Programming School」プロジェクト(学習者とメンター/AIがペアで同じエディターセッションを共有する)向けに有用です。本拡張機能自体はLive Shareのプロトコルとは連携しておらず、利便性のために同梱しているだけです。

### 同梱(おすすめ): 日本語言語パック + Prettier

Live Shareと同じ*extension pack*の一部として、以下もおすすめ機能として同梱しています(一緒にインストールされますが、無くても本拡張機能自体は動作する非必須の同梱です)。

- Microsoft製の[日本語言語パック](https://marketplace.visualstudio.com/items?itemName=MS-CEINTL.vscode-language-pack-ja)(`ms-ceintl.vscode-language-pack-ja`) — open-englishおよび本拡張機能の日本語ファーストな(英日併記の)方針を反映。
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)(`esbenp.prettier-vscode`) — あわせて、VS Code標準の「ドキュメントのフォーマット」コマンド(`editor.action.formatDocument`)に**`Ctrl+Shift+I`**のショートカットキーを本拡張機能側で保証しています(利用者のキーバインド設定に関わらず、整形ショートカットが必ず使える状態にする狙い)。

### 関連プロジェクト

- [open-english](https://github.com/aon-co-jp/open-english) — 本拡張機能が相棒として連携する、AI活用の語学学習プラットフォーム。
- [aon-co-jp (GitHub)](https://github.com/aon-co-jp) — open-englishおよび関連プロジェクト(open-audio-sr、open-mqa-dsd、aruaru-search、aruaru-llm等)を開発している組織。

## Status / 現状

Type-checked with `npm run compile`. The player's enhancement code (`media/enhance.js`) and the exact webview HTML this extension generates were checked in a real browser (preset switching, noise-gate state, loudness change, and the automatic fall-back when a source is muted). **Not yet click-tested inside VS Code's Extension Development Host** (this environment has no VS Code GUI), so the Webview's own resource loading under VS Code's content-security policy still needs a run on your machine.
`npm run compile`による型検査済み。プレーヤーの強調処理(`media/enhance.js`)と、この拡張機能が実際に生成するWebviewのHTMLは、実ブラウザで確認しました(プリセット切替・ノイズゲートの状態・音量変化・音が消えたときの自動復旧)。**VS Codeの拡張機能開発ホストでの実クリック確認はまだです**(この環境にVS Code GUIが無いため)。VS CodeのCSP下でのWebview自身のリソース読み込みは、お手元の端末での確認が必要です。

## Local testing & publishing / ローカルでの実クリック確認・Marketplace公開手順

This environment has no VS Code GUI, so click-testing and Marketplace publishing must be done on your own machine.
この環境にはVS CodeのGUIが無いため、実クリック確認・Marketplace公開はご自身の端末で行ってください。

1. **Click-test in the Extension Development Host / 実クリック確認**:
   ```bash
   cd vscode-extension
   npm install
   code .
   ```
   Then press **F5** in VS Code (or Run → Start Debugging) to launch a second "Extension Development Host" window with this extension loaded. Try the commands from the Command Palette (`Ctrl+Shift+P` → type "open-english"). /
   VS Codeで上記を実行後、**F5**キー(または「実行」→「デバッグの開始」)を押すと、この拡張機能が読み込まれた2つ目の「拡張機能開発ホスト」ウィンドウが起動します。コマンドパレット(`Ctrl+Shift+P`→「open-english」で検索)から各コマンドを試せます。

2. **Package as `.vsix` (already done once in this repo, reproducible) / `.vsix`パッケージ化**:
   ```bash
   npx --yes @vscode/vsce package
   ```
   This produces `open-english-companion-<version>.vsix`, installable locally via VS Code's "Install from VSIX..." command (Extensions view → `...` menu) — no Marketplace account needed for this step. /
   `open-english-companion-<version>.vsix`が生成されます。VS Codeの「拡張機能」ビュー→`...`メニュー→「VSIXからのインストール」でMarketplaceアカウント無しにローカルインストールできます。

3. **Publish to the Marketplace (requires a Microsoft publisher account + PAT, not something an AI agent should hold) / Marketplaceへの公開(Microsoftのpublisherアカウント・PATが必要、AIエージェントが保持すべきものではありません)**:
   - Create a publisher at https://marketplace.visualstudio.com/manage (publisher id used here: `aon-co-jp`, matching `package.json`'s `publisher` field — create it under that id, or change the field to match whatever id you register).
   - Get a Personal Access Token from Azure DevOps (Marketplace (publish) scope) — see https://code.visualstudio.com/api/working-with-extensions/publishing-extension.
   - Then: `npx --yes @vscode/vsce publish` (prompts for the PAT, or set `VSCE_PAT` env var).
   / [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)でpublisherを作成(`package.json`の`publisher`欄と同じ`aon-co-jp`、または登録したidに合わせて書き換え)。Azure DevOpsでPersonal Access Token(Marketplace publish権限)を発行し、`npx --yes @vscode/vsce publish`を実行してください(PATの入力を求められます、または環境変数`VSCE_PAT`)。
