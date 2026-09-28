# open-english Companion (VS Code Extension)

*日本語は下にあります / Japanese follows below.*

A small companion extension for [open-english](https://github.com/aon-co-jp/open-english) — an AI-assisted language-learning platform. This extension itself is a **thin client**: it only opens a Webview and hands playback to the HTML `<audio>` element, and it never processes audio in JavaScript. When you ask it to enhance audio quality, it forwards the file's bytes to a locally running [open-audio-sr](https://github.com/aon-co-jp/open-audio-sr) service (a real diffusion-model audio super-resolution AI, run entirely on your own machine) and writes back whatever that service returns — it does not implement any audio DSP itself, and it does not send audio anywhere over the network beyond `127.0.0.1`.

## Commands

- **open-english: Open Audio Player** — opens a lesson/recording audio file in a Webview `<audio>` player.
- **open-english: Enhance Audio Quality (via local open-audio-sr)** — sends the selected file to a locally running `open-audio-sr` HTTP service (`http://127.0.0.1:4620`) for AI-based bandwidth extension / quality enhancement, and saves the result as `<name>.enhanced.wav` next to the original.

Dedicated noise reduction is not yet available in the aon-co-jp toolchain and is intentionally not claimed by this extension; it may be added once a real backend exists.

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

## Related projects

- [open-english](https://github.com/aon-co-jp/open-english) — the AI-assisted language-learning platform this extension is a companion to.
- [aon-co-jp on GitHub](https://github.com/aon-co-jp) — the organization behind open-english and its related projects (open-audio-sr, open-mqa-dsd, aruaru-search, aruaru-llm, and more).

---

## 日本語

[open-english](https://github.com/aon-co-jp/open-english)(AI活用の語学学習プラットフォーム)の相棒(companion)となる小さな拡張機能です。この拡張機能自体は**薄いクライアント**であり、Webview内のHTML `<audio>` 要素に再生を任せるだけで、JavaScript側で音声処理を一切行いません。「高音質化」コマンドを実行した場合も、ファイルのバイト列をローカルで起動している[open-audio-sr](https://github.com/aon-co-jp/open-audio-sr)サービス(拡散モデルによる実在の音声帯域拡張AIを、利用者自身のPC上で完結して実行するもの)へ転送し、その応答をそのまま書き出すだけです。拡張機能自体は音声DSPを実装しておらず、`127.0.0.1`(自分のPC)を超えてネットワークへ音声を送信することもありません。

### コマンド

- **open-english: Open Audio Player / 音声プレーヤーを開く** — レッスン・録音音声ファイルをWebview内の`<audio>`プレーヤーで開きます。
- **open-english: Enhance Audio Quality (via local open-audio-sr) / 音声を高音質化する(ローカルのopen-audio-sr経由)** — 選択したファイルをローカルで起動している`open-audio-sr`のHTTPサービス(`http://127.0.0.1:4620`)へ送り、AIによる帯域拡張/高音質化を行い、結果を元ファイルと同じ場所へ`<ファイル名>.enhanced.wav`として保存します。

低ノイズ処理(ノイズ除去)専用の機能は、aon-co-jpのツール群にまだ実在するバックエンドが無いため、本拡張機能では意図的に謳っていません。実在のバックエンドが用意でき次第、追加を検討します。

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

### 関連プロジェクト

- [open-english](https://github.com/aon-co-jp/open-english) — 本拡張機能が相棒として連携する、AI活用の語学学習プラットフォーム。
- [aon-co-jp (GitHub)](https://github.com/aon-co-jp) — open-englishおよび関連プロジェクト(open-audio-sr、open-mqa-dsd、aruaru-search、aruaru-llm等)を開発している組織。

## Status / 現状

Type-checked with `npm run compile` only. Not yet click-tested in the VS Code Extension Development Host in this environment.
`npm run compile`による型検査のみ確認済みです。この環境ではVS Code拡張機能開発ホストでの実クリック確認はまだ行っていません。
