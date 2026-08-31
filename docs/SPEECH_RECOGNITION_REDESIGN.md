# 音声認識(ASR)精度の抜本改善 — 設計文書

> ステータス: **P1-α / P1-β / P1-β2 実装済み(2026-08-29)。P1 コア完了。
> 次は実機マイク検証(ユーザー) → P1-γ(翻訳機能・要判断)/ P2(ハイブリッド
> Whisper・要判断)**
> 対象: `open-english` + `aruaru-llm` + `open-cuda` + `open-directx` +
> `open-cpu` の連携
> 決定者: masahiro ishizuka(AON CEO)
> 目的: AI 音声認識の認識精度が低すぎる問題を解消し、その先の**翻訳精度**を上げる
> 関連: [`CLAUDE.md`](../CLAUDE.md) ・ [`PORTING.md`](../PORTING.md)

---

## 0. なぜこの文書があるか

ユーザー指示(2026-08-29):
> 「open-english の open-directx / open-cuda / aruaru-llm と open-cpu の連携で
> AI による音声認識の認識精度が低すぎるので、翻訳精度向上の為に、世界中の
> 言語で Google 検索と GitHub 調査して改善・改良の為の開発・実装に活かして」

英日・多言語で調査した結果と、5 リポジトリ連携での改善設計を**正本**として
ここにまとめる。以後、音声認識まわりに手を入れる者はまずここを読む。

---

## 1. 現状(コードベース調査)

### 1.1 音声入力の実装
`app.js` L4072〜 の音声入力は **ブラウザの Web Speech API のみ**:

```js
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognitionImpl();
recognition.interimResults = false;
recognition.maxAlternatives = 1;
// ...
recognition.lang = replyLangEl.value === "ja" ? "ja-JP" : "en-US";  // ← 致命的
// ...
recognition.addEventListener("result", (event) => {
  const transcript = event.results[0][0].transcript;   // 単一仮説・無補正
  inputEl.value = transcript;
  formEl.requestSubmit();
});
```

### 1.2 周辺の実装状況
- `aruaru-llm`: `/v1/generate`・`/v1/chat`・**`/v1/translate`(NLLB、200言語)**・
  geo/news 等。`/v1/runtime` が accel 階層(`directx-gemm` / cuda / vulkan /
  directx / `cpu_simd`〈open-cpu が検出、例 `avx2+fma3`〉)を報告する。
  **ASR(音声→テキスト)エンドポイントは存在しない**。Whisper 系は未導入。
- `open-english-server`(Rust): 静的配信 + `/v1/cpu-runtime`(open-cpu)+
  AI プログラミング支援。`aruaru-llm`(127.0.0.1:4600)を同梱・プロセス管理。
- `worldLanguages`(`world-language-regions.json` の `languages[]`): 各要素に
  `code`(短い言語コード)。**BCP-47 タグ(`en-US` 等)を持つフィールドは無い**。

---

## 2. 低精度の根本原因(5点)

| # | 原因 | 影響 |
|---|---|---|
| 1 | `recognition.lang` が **`ja-JP` / `en-US` 固定**。アプリは 100+ 言語対応なのに認識器へ間違った言語を伝えている | 英日以外の発話はほぼ全滅 |
| 2 | `maxAlternatives = 1`・`interimResults = false`。単一仮説のみで n-best 再スコアリングの余地が無い | 誤認識を後段で訂正できない |
| 3 | 認識結果を**無補正で** `inputEl` へ直行(誤字・同音異義・区切りの誤り) | 文脈による訂正が全く効かない |
| 4 | 現在の練習問題の**期待語彙(フレーズ・固有名詞)でバイアスしていない** | 専門語・地名・人名を外す |
| 5 | Web Speech API の天井: Chrome=Google クラウド認識(言語差大)、Firefox/Safari=非対応 | エンジン自体が弱い言語が多数 |

---

## 3. 調査結果(2026、英日・多言語)

### 3.1 ローカル ASR エンジン
- **whisper.cpp**(ggml、依存ゼロの C/C++。単一リーンバイナリ)は
  **NVIDIA CUDA・AMD ROCm・Vulkan・Intel OpenVINO・WebAssembly** を
  すべて 1 バイナリで叩ける。→ この 5 リポジトリ連携の accel 階層に素直に乗る:
  - **open-cuda** → whisper.cpp CUDA バックエンド(GPU 段)
  - **open-directx** → whisper.cpp **Vulkan** バックエンド(あるいは
    DirectML/ONNX。`/v1/runtime` の `directx-gemm` 段に相当)
  - **open-cpu** → whisper.cpp ggml CPU バックエンド(open-cpu が検出済みの
    SIMD プロファイル `avx2+fma3` 等をそのまま活用)
  出典: [Northflank: Best open source STT 2026](https://northflank.com/blog/best-open-source-speech-to-text-stt-model-in-2026-benchmarks)
- **large-v3-turbo**: 809M・6倍速・精度 -1〜2%。**distil-whisper**: 756M・
  WER 差 1% 以内。**large-v3**: 英語 WER 約 2.5%。
- **多言語 SoTA**: **Canary-1B-v2** 24言語平均 WER 8.1%(Whisper-large-v3 の
  9.9% を上回る)、**SeamlessM4T** 7.2%(音声→他言語テキストを 1 発=翻訳精度に
  直結)、**MMS** 1000+言語、**Omnilingual ASR** 1600+言語。ただし
  **実用最良の多言語は依然 Whisper large-v3 / turbo**(99+言語・成熟・移植容易)。
  Parakeet は最速だが英語専用。
  出典: [Canary/Parakeet](https://arxiv.org/pdf/2509.14128) ・
  [Omnilingual ASR](https://arxiv.org/pdf/2511.09690) ・
  [SeamlessM4T](https://arxiv.org/pdf/2308.11596)

### 3.2 LLM によるエラー訂正(GenSEC 系)
- テキスト LLM に **n-best 仮説 + 文脈** を渡し、最も意図に近い一文へ訂正させる。
  小型モデル(<13B)は複雑な指示に弱く、GPT-4o/Llama3-70B 級が有効とされるが、
  **文脈と候補列を与えるだけで小型でも一定の改善**が出る(open-english は
  外部プロバイダ経路 `tryPriorityProviderReply` を既に持つ)。
  出典: [Non-Intrusive ASR Refinement: A Survey](https://arxiv.org/pdf/2508.07285) ・
  [Whispering LLaMA](https://arxiv.org/pdf/2310.06434) ・
  GenSEC Challenge(IEEE SLT 2024)

### 3.3 contextual biasing(期待語彙の注入)
- Whisper `initial_prompt` は**末尾 224 トークンのみ**有効・**末尾ほど強く効く**。
  重要語(固有名詞・専門語)を末尾へ、コンパクトに。
- 素の単語列をそのまま渡すと Whisper は「直前セグメントの書き起こし」と
  誤解して**全体 WER が悪化することがある** → **CB-Whisper**(open-vocab
  keyword-spotting)や、LLM 訂正段でのバイアスが安全。
  効果例: R-WER 23.7→18.0%、OOV-WER 60→37.1%。
  出典: [Improving Rare-Word Recognition of Whisper](https://arxiv.org/html/2502.11572v1) ・
  [Contextual Biasing without Fine-Tuning](https://arxiv.org/pdf/2410.18363)

### 3.4 ブラウザ内 Whisper
- **transformers.js**(ONNX Runtime Web)で **whisper-tiny(40MB)/ small
  (240MB)/ turbo** を **WebGPU** 実行(Chrome/Edge)。WASM 自動フォールバック。
  **100 言語**の書き起こし + 翻訳。サーバー不要・オフライン可。
  出典: [transformers.js](https://github.com/huggingface/transformers.js/) ・
  [Whisper WebGPU 概説](https://senoritadeveloper.medium.com/whisper-webgpu-2b1cadfab897)

### 3.5 VAD・ストリーミング
- **Silero VAD** で無音除去(誤検出 -34%、遅延 89ms)。whisper.cpp はネイティブ
  VAD を搭載、faster-whisper は `vad_filter=True`。
- ストリーミング: **3〜5 秒窓・0.5 秒オーバーラップ・`beam_size=1〜2`・
  `condition_on_previous_text=false`**(仮説ドリフト防止)。
  出典: [WhisperPipe](https://arxiv.org/abs/2604.25611) ・
  [Whisper-Streaming](https://www.emergentmind.com/topics/whisper-streaming)

---

## 4. 改善設計(3 フェーズ)

### 4.0 設計原則
1. **既存の可用性優先を壊さない**: 新経路が使えない時は必ず従来
   (Web Speech API → 最後は手入力)へ自動フォールバック。
2. **正直な開示**: 各エンジンの制約(ブラウザ対応・モデルサイズ・精度)を
   UI とドキュメントに明記(このリポジトリの既存方針)。
3. **キーを増やさない・重い依存を安易に足さない**: 新エンジンは
   オプトイン。既定は現状維持で回帰ゼロ。
4. **翻訳精度がゴール**: ASR の出力は最終的に `/v1/translate`(NLLB)や
   SeamlessM4T へ渡る。ASR 段の改善は翻訳段の入力品質改善として測る。

### 4.1 Phase 1 — クライアントのみ・新規依存ゼロ(`app.js`)

| 記号 | 内容 |
|---|---|
| **A. 言語選択の修正** | `recognition.lang` を、対象言語(`learnTargetEl` / `replyLangEl` / `worldLanguageByCode()`)の **BCP-47 タグ**へ。ja/en 固定をやめる。`world-language-regions.json` の各 `languages[]` に **`bcp47` フィールドを追加**(無ければコード→BCP-47 の対応表を `app.js` に用意)。 |
| **B. n-best + interim** | `recognition.maxAlternatives = 5`・`interimResults = true`。`result` イベントで全 alternative(と confidence)を収集。 |
| **C. LLM 訂正パス** | aruaru-llm の**既存 `/v1/generate`**(新エンドポイント不要)。プロンプト: 「これは {言語} 学習者の音声認識の雑な書き起こし。文脈: {練習トピック/期待フレーズ}。認識器の候補: 1) … 2) … 3) …。**最も意図に近い一文だけ**を出力。」外部プロバイダ経路(`tryPriorityProviderReply`)が有効ならそちらを優先。top 候補が十分クリーン(confidence 高・既知語のみ)ならスキップして往復を省く。 |
| **D. 語彙バイアス** | 現在の練習問題の期待語彙(`world-language-phrases.json` / アクティブな設問)から**コンパクトなヒント文字列**を作り、C の文脈へ入れる(重要語は末尾)。 |
| **E. 翻訳へ接続** | 訂正済みテキストを `/v1/translate`(NLLB)で対象言語へ。 |

- 影響ファイル: `app.js`(音声入力ブロック + 新ヘルパー
  `correctTranscriptWithLLM()` + BCP-47 対応表)、`world-language-regions.json`
  (`bcp47` フィールド追加、任意)、README/CLAUDE(制約の開示)。
- 検証: マイク実機は**ユーザー側で必須**(この開発環境にマイク無し)。
  ロジック単体(BCP-47 マッピング・プロンプト組み立て・フォールバック分岐)は
  `console-ports` か軽量テストで確認。

### 4.2 Phase 2 — 本物の Whisper(要・方針決定)

- **(a) ブラウザ内 Whisper WebGPU**: `transformers.js` + `whisper-turbo`
  (ONNX、~240MB、Service Worker キャッシュ)。`MediaRecorder` で録音 →
  ローカル推論 → n-best。WebGPU 非対応は WASM、それも無ければ Web Speech API。
  長所: サーバー不要・オフライン・プライバシー。短所: 初回 240MB DL。
- **(b) aruaru-llm に `POST /v1/transcribe`**: `whisper-rs`(whisper.cpp
  バインディング)で新設。**open-cuda(CUDA)/ open-directx(Vulkan)/
  open-cpu(SIMD)** に自動で乗る。`/v1/runtime` の `acceleration` に
  `whisper` 段(選ばれたバックエンド)を追加。open-english-server が
  マイク音声(webm/opus → PCM)をプロキシ。長所: 最高精度・GPU 活用。
  短所: C++ 依存(whisper.cpp ビルド)・モデル配布。
- **共通**: **Silero VAD** で無音トリム、ストリーミング窓(3〜5s/0.5s
  overlap/`beam_size=2`/`condition_on_previous_text=false`)、`initial_prompt`
  に D の語彙ヒント(末尾 224 トークン制約を守る)。

### 4.3 Phase 3 — 多言語 SoTA / 音声→翻訳の一発化
- **Canary-1B-v2**(多言語 WER が Whisper 超え)を aruaru-llm の選択可能
  エンジンに。
- **SeamlessM4T**: 音声 → **他言語テキスト**を 1 発。ASR + NLLB の 2 段を
  短絡でき、翻訳精度のゴールに直結。`/v1/transcribe?translate_to=xx` として公開。

### 4.4 ハイブリッド融合(「良い所どり」、ユーザー指示 2026-08-29)

**P2 は「(a) か (b) を選ぶ」ではなく、利用可能なエンジンを全部使って
n-best を融合する**。各エンジンの強みを組み合わせる:

| エンジン | 強み | 弱み | ハイブリッドでの役割 |
|---|---|---|---|
| Web Speech API | 速い・ストリーミング・ゼロ依存・ゼロコスト | 言語差大・非対応ブラウザあり・単一仮説 | 即時の暫定表示 + n-best の 1 系統 |
| ブラウザ Whisper WebGPU | 高精度・オフライン・プライバシー・100言語・`initial_prompt` 対応 | 初回 240MB DL・WebGPU 必須(WASM 遅い) | 主力の高精度仮説(対応環境で) |
| aruaru-llm `/v1/transcribe`(whisper.cpp) | 最高精度・GPU(open-cuda/open-directx/open-cpu) | サーバー必要・C++依存 | サーバー到達時の最有力仮説 |

**融合ロジック**:
1. マイク押下と同時に **Web Speech API を即開始**(体感速度のため)。
   録音した音声(`MediaRecorder`)も並行して保持。
2. 録音停止後、到達可能なエンジン(ブラウザ Whisper / `/v1/transcribe`)へ
   同じ音声を投げ、各エンジンの n-best を集約。
3. 全エンジンの仮説を 1 つのリストにまとめ、**`refineTranscript()`
   (P1-β)の再スコアリング/LLM 訂正**へ渡す。エンジンごとの信頼度・
   一致度(複数エンジンが同じ文字列を出したら強い)を加味。
4. どのエンジンも使えなければ Web Speech API 単独 → 最後は手入力
   (§4.0 原則 1、回帰ゼロ)。

`refineTranscript(alts, langTag)` は既に「候補配列を受け取り最良の一文を
返す」インターフェースなので、**融合は「alts に複数エンジンの候補を
足すだけ」**で P1-β の実装がそのまま活きる(設計上の連続性)。

---

## 5. 開発の進め方 — 試作品(プロトタイプ)駆動で、TEST と改善を繰り返す

> **この節はユーザー指示(2026-08-29)により固定**:
> 「試作品のプロトタイプを開発して TEST も繰り返して改善も繰り返す」。
> 一発で完成品を作らない。**プロトタイプ → 計測 → 改善 → 再計測**の
> ループを、精度目標に届くまで(実用的になるまで)何周も回す。

### 5.1 反復ループ(1 周の中身)

```
(1) 試作品を1つ作る/変更する(最小の縦切り。動く状態を保つ)
        ↓
(2) TEST: 固定の音声サンプルセットで書き起こし → WER / CER を計測
        ↓
(3) 誤りを分類(言語誤り / 固有名詞 / 同音異義 / 区切り / 幻聴 / 無音)
        ↓
(4) 一番効く改善を1つ入れる(§4 の A〜E、VAD、initial_prompt、モデル差替 等)
        ↓
(5) 再計測。前周より WER が下がったか? 下がらなければ変更を戻す
        ↓
   目標未達なら (1) へ戻る / 達成なら次フェーズ or 完了
```

- **1 周 = 1 コミット**を原則にする(何を変えて WER がどう動いたかを履歴に残す)。
- 変更で悪化したら**即座に戻す**(§4.0 原則 1「回帰ゼロ」)。

### 5.2 評価データセット(`docs/asr-eval/`)

- `open-english` の実利用に即した**固定サンプルセット**を用意する:
  - 言語: 少なくとも `en` / `ja` + 学習需要の高い数言語(`zh` `ko` `es`
    `fr` `pt` `ar` など)。1 言語あたり 20〜50 発話。
  - 内容: 練習フレーズ(`world-language-phrases.json` 由来)・数字/日付・
    地名/人名(`world-language-regions.json` 由来)・雑音下・非母語アクセント。
  - 形式: `sample.wav` + `sample.ref.txt`(正解書き起こし)。個人が特定
    される音声は入れない。読み上げは TTS で合成してもよい(その旨を記録)。
- **メトリクス**: WER(単語誤り率)/ CER(文字誤り率、CJK 向け)/
  **R-WER**(固有名詞・専門語だけの誤り率)/ 実時間比(RTF)/ 初回遅延。
- **ハーネス**: `tools/asr-bench/`(小さな Node か Rust スクリプト)。
  各エンジン(Web Speech API 記録 / ブラウザ Whisper / `/v1/transcribe`)の
  出力を `sample.ref.txt` と突き合わせて表を出す。CI では音声を回せない
  ため**ローカル実行**(結果表を PR/コミットメッセージに貼る)。

### 5.3 各フェーズのプロトタイプと受け入れ基準

| フェーズ | プロトタイプ | 受け入れ基準(前周比) / 状況 |
|---|---|---|
| **P1-α** ✅ | §4.1 A(BCP-47 言語修正、`speechLangTag()`) | 非英日言語の WER が明確に低下。**実装済み**(コミット `7d99656`)。実機マイク検証待ち |
| **P1-β** ✅ | + B/C(`maxAlternatives=5` n-best + `refineTranscript()` の外部LLMプロバイダ訂正 + 信頼度フォールバック) | R-WER が低下。全体 WER は非悪化。**実装済み**(コミット `0ddb87e`)。実機・外部プロバイダ検証待ち |
| **P1-β2** ✅ | + D(直近トレーナー発話を訂正文脈に) | 固有名詞・話題語の R-WER 低下。**実装済み**(コミット `0dd2d29`)。`lastTrainerUtterance()` が DOM の最後の `.msg.trainer` から話題を拾い訂正プロンプト末尾へ付与。実機検証待ち。※練習問題(4択クイズ)はマイクではなくクリック回答のため、マイク文脈としては会話練習の「直前の話題」を採用した |
| **P1-γ** | + E(NLLB `/v1/translate` へ接続) | 要・機能判断。open-english フロントには `/v1/translate` 呼び出しが**皆無** → 「音声→他言語翻訳」機能の**新規追加**。かつ aruaru-llm は既定ビルドで `nllb-translate` feature がオフのため NLLB は使えず GPT-2 品質へフォールバック(要ビルド設定 or ユーザーの外部プロバイダ)。着手前に「翻訳ヘルパーを付けるか/どの UI か」をユーザーへ確認 |
| **P2 ハイブリッド** | §4.4 の多エンジン融合(Web Speech API + ブラウザ Whisper WebGPU + aruaru-llm whisper.cpp) | 要・依存判断。ブラウザ Whisper は ~240MB モデル DL、aruaru-llm `/v1/transcribe` は whisper-rs(C++ ビルド)。どちらを先に入れるか(両方が理想)をユーザーへ確認 |
| **P2-α** | ブラウザ Whisper WebGPU(small)を**選択可能エンジン**として追加 | 対応ブラウザで WER が Web Speech API 比で低下。非対応時は自動フォールバック |
| **P2-β** | `aruaru-llm /v1/transcribe`(whisper.cpp、open-cpu 経路のみ先行) | サーバー経路で WER 低下。`/v1/runtime` に `whisper` 段が出る |
| **P2-γ** | + open-cuda / open-directx バックエンド、VAD、ストリーミング窓 | RTF・初回遅延が実用域(会話のテンポを崩さない) |
| **P3** | Canary-1B-v2 / SeamlessM4T をエンジン選択肢に | 多言語 WER がさらに低下 / 音声→翻訳 1 発の経路が成立 |

- **「実用的」の定義**: 主要言語で WER が体感で気にならない水準
  (目安 < 10%、固有名詞は R-WER < 20%)、かつ会話のテンポを崩さない遅延。
  ここに届くまで各フェーズ内で 5.1 のループを回す。

### 5.4 フェーズと着手順

- **P0(本文書)** 調査・設計の確定。 ← 済
- **P1** `app.js` の Phase 1。α → β → γ を 5.1 のループで。回帰ゼロ・オプトイン。
- **P2** 方針決定後、α → β → γ。VAD・ストリーミング。
- **P3** Canary / SeamlessM4T をエンジン選択肢に。
- 各フェーズ完了時: `tools/asr-bench` の結果表 → README/CLAUDE の開示更新 →
  commit → push。マイク実機・GPU 実機検証はユーザーへ依頼し、結果を次周へ反映。

---

## 6. 影響を受けるリポジトリ

| リポジトリ | 影響 |
|---|---|
| `open-english` | `app.js`(音声入力の全面改修)、`world-language-regions.json`(`bcp47`)、`open-english-server`(Phase 2b で音声プロキシ)、docs、README/CLAUDE |
| `aruaru-llm` | Phase 2b: `POST /v1/transcribe`(`whisper-rs`)、`/v1/runtime` に `whisper` 段。Phase 3: Canary/SeamlessM4T エンジン |
| `open-cuda` | whisper.cpp CUDA バックエンドの検証(既存のデバイスプールに ASR 用途を追加) |
| `open-directx` | whisper.cpp Vulkan(または DirectML)バックエンドの検証 |
| `open-cpu` | whisper.cpp ggml CPU の SIMD ディスパッチ検証(既存の検出結果を流用) |

---

## 7. 却下・保留した案

- **Web Speech API のまま `lang` だけ直す** → Phase 1 A として採用するが、
  それ単独では 3.5 の天井(弱い言語・非対応ブラウザ)を越えられないため
  最終形ではない。
- **ブラウザで large-v3 フル(1.5GB)** → DL が重すぎる。turbo/small に留める。
- **外部クラウド ASR(Google/Azure/Deepgram)** → キーを増やさない原則に反する。
  ユーザーが外部 LLM プロバイダを設定済みの場合の訂正段(Phase 1 C)でのみ
  外部を使う。
