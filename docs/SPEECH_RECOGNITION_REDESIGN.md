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

### 3.6 追加調査(2026-08-29、試作 P1〜P2 の実装・TEST を踏まえた再調査、多言語)

試作でぶつかった具体的な問題を軸に、日英中露で Google/GitHub を再調査した。

- **【P2-α に直結・要修正】transformers.js の dtype 落とし穴**(実測報告多数):
  - **WebGPU + q8(量子化)デコーダ → 出力が gibberish**(壊れる)。WASM では
    正しいのに WebGPU だと壊れる、が tiny/base/small/large-v3-turbo 全てで再現。
  - **q8 エンコーダ → 特徴量の質が劣化**。fp16 エンコーダも WebGPU で精度問題
    (issue #1590)。
  - **推奨 = fp32 エンコーダ + q4 デコーダのハイブリッド**(精度維持 + サイズ許容)。
  - **transformers.js は 3.8.x に固定**。v4.0.0-next 系はタイムスタンプ/
    セグメント分割に回帰(3.8.1 は複数の短いセグメントを正しく返すが v4-next は
    全体 1 セグメントになる)。3.8.1 では `SuppressTokensLogitsProcessor` が
    コメントアウトされており幻覚しやすいトークン(90 個)が抑制されない点は
    `suppress_tokens` 明示で補う。
  - → **本コミットで対応**: `fetch-whisper-model.ps1` を fp32 encoder +
    q4 decoder 取得 + tfjs 3.8.1 へ、`app.js` の dtype を
    `{encoder_model:"fp32", decoder_model_merged:"q4"}`(失敗時 q8 リトライ)へ、
    `pipe()` に `condition_on_previous_text:false` /
    `no_speech_threshold` / `compression_ratio_threshold` / 温度フォールバックを
    追加。
  - 出典: [tfjs #1317(WebGPU q8 gibberish)](https://github.com/huggingface/transformers.js/issues/1317) ・
    [#1590(WebGPU fp16 encoder 精度)](https://github.com/huggingface/transformers.js/issues/1590) ・
    [v4 timestamp 回帰の報告](https://github.com/huggingface/transformers.js/issues/1590)

- **【P2-β に直結・設計変更が必要】`whisper-rs` は Windows(MSVC)で現状ビルド不能**:
  `whisper-rs-sys` の bindgen が glibc 固有型を生成し、`whisper_full_params`
  等のサイズ表明が MSVC のレイアウトと食い違う(`1_usize - 264_usize overflow`)。
  **`whisper-rs 0.16.0` でも `WHISPER_DONT_GENERATE_BINDINGS=1` でも解消しない**
  (事前生成バインディング自体が glibc 生成)。issue は 2026-04-21 報告、
  公式 fix 未提供。open-english の主対象は **Windows 上で利用者が起動する
  aruaru-llm** なので、これは P2-β の設計前提を崩す。
  - **→ P2-β の方針変更**: `whisper-rs` を直接リンクするのではなく、
    **whisper.cpp のプレビルド CLI(`whisper-cli.exe` 等、公式リリース同梱)を
    サブプロセス起動**する方式へ切り替える(このエコシステムが `pg_dump` /
    `Expand-Archive` / PowerShell / `adb` で既に多用している「外部バイナリを
    子プロセスで呼ぶ」パターン)。C++ リンク・bindgen を完全に回避でき、
    GPU バックエンド(Vulkan/CUDA)はプレビルド CLI 側の feature で選べる。
    `whisper-transcribe` feature は残し、feature 有効時に CLI パスを
    `ARUARU_LLM_WHISPER_CLI` で受ける(既定は `<crate>/models/whisper/whisper-cli.exe`)。
  - 出典: [whisper-rs-sys MSVC bindgen 問題(全版で再現)](https://github.com/Dimillian/CodexMonitor/issues/599) ・
    [whisper-rs-sys の `WHISPER_DONT_GENERATE_BINDINGS`](https://lib.rs/crates/whisper-rs-sys)

- **contextual biasing は Whisper 自身のプロンプトでも効く**(中露の実務記事で一致):
  ドメイン語(専門用語・固有名詞)を `initial_prompt` / `prompt` に入れるだけで
  用語認識が上がる。現状 P1-β2 は「事後 LLM 訂正」で直前トレーナー発話を使う
  のみ。**Whisper 呼び出し時の `prompt` にも直前トレーナー発話 + 練習問題の
  期待語彙を渡す**のが低コストで確実(transformers.js 側の対応可否は要確認、
  whisper.cpp CLI は `--prompt` で確実)。

- **VAD(無音除去)が幻覚対策として最も効果が高い**(日中露で一致):
  認識前に無音区間を落とすと、幻覚が減り・速くもなる。ブラウザは
  **Silero VAD(ONNX、`@ricky0123/vad-web` または `onnx-community/silero-vad`)**
  を transformers.js/ORT-web で動かせる(参照実装: Silero VAD + Whisper +
  SmolLM2 + Kokoro を全て tfjs で動かすデモが存在)。→ **P2-γ の必須項目に格上げ**。

- **Moonshine(27M、量子化 ONNX ~50MB)= 低遅延経路の有力候補**:
  リアルタイム/短発話向けに設計され WebGPU 加速 + WASM フォールバック、
  ORT-web + tfjs で動く。**日本語版 `moonshine-tiny-ja-ONNX` も存在**。
  Whisper-base より軽く速いため、**「即時に出す」低遅延エンジンとして
  Moonshine、精度確認用に Whisper**、という二枚看板が組める(§4.4 融合の
  受け皿は既にあるので候補を増やすだけ)。
  出典: [Moonshine Web](https://huggingface.co/posts/Xenova/486935205804807) ・
  [moonshine-tiny-ja-ONNX](https://huggingface.co/wmoto-ai/moonshine-tiny-ja-ONNX)

- **WebNN(NPU)は 2026 時点でまだフラグ裏**: Chrome/Edge で
  「Enables WebNN API」フラグ + Windows 11 24H2 + `kWebNNOnnxRuntime` フラグが
  必要、GPU/NPU は preview。→ P2-α の WebNN カスケードは**残すが、実際に
  効くのは限定的**と正直に注記。Whisper Tiny クラスなら near-native
  スループットの実証はある。
  出典: [ONNX Runtime WebNN EP](https://onnxruntime.ai/docs/tutorials/web/ep-webnn.html) ・
  [WebNN Overview(Microsoft)](https://learn.microsoft.com/en-us/windows/ai/directml/webnn-overview)

- **P3 多言語 SoTA の 2026 最新**: **Parakeet-TDT-0.6B-v3**(25 言語、平均 WER
  6.34%、自動言語判定、TDT デコーダで 10〜100× 高速)、**Canary-1B-v2**
  (25 言語 + 音声翻訳)、**Omnilingual ASR LLM 7B v2**(1000+ 言語、多言語
  ベンチで上位、ただし専用エンコーダには劣る)、**Fast Conformer**(2× 高速)。
  評価は **Open ASR Leaderboard**(多言語 + long-form トラック新設)を
  `docs/asr-eval/` の基準に採用する。
  出典: [Canary-1B-v2 & Parakeet-TDT-0.6B-v3](https://arxiv.org/pdf/2509.14128) ・
  [Open ASR Leaderboard(多言語/long-form)](https://arxiv.org/pdf/2510.06961) ・
  [HF blog: Open ASR Leaderboard trends](https://huggingface.co/blog/open-asr-leaderboard)

- **LLM GER の最新 = MPA GER(多パス増強生成訂正)**: 入力側で複数 ASR
  システムの仮説をまとめ、出力側で複数 LLM の訂正をマージする。**日本語
  専用ベンチ**(arXiv:2408.16180)あり。ProGRes(プロンプト生成リスコア)、
  HyPoradise(オープンベースライン)、Denoising GER(雑音頑健)。現状 P1-β の
  `refineTranscript` は単一 LLM・単一 ASR 仮説群 → **複数エンジン(Web Speech
  + Whisper + サーバー)の n-best を 1 リストに束ねて 1 回の LLM 訂正へ**
  という現行設計は MPA GER の縮小版として妥当。
  出典: [HyPoradise](https://arxiv.org/abs/2309.15701) ・
  [ProGRes](https://arxiv.org/pdf/2409.00217) ・
  [日本語 ASR-LLM MPA GER ベンチ](https://arxiv.org/html/2408.16180) ・
  [Denoising GER](https://arxiv.org/html/2509.04392)

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

- **(a) ブラウザ内 Whisper(ハードウェアアクセラレータ対応の実行段カスケード)**:
  `transformers.js`(ONNX Runtime Web)+ `onnx-community/whisper-base`
  (量子化 ONNX、約 40〜80MB、Service Worker キャッシュ。より高精度が
  必要なら `whisper-small` ~240MB を選択可)。`MediaRecorder` で録音 →
  ローカル推論 → n-best。
  **実行段(execution provider)は利用可能なものへ自動カスケード**
  (ユーザー指示 2026-08-29「GPU だけでなく NPU や open-cpu の CPU 命令でも
  ハードウェアアクセラレータ対応に」):
  1. **WebGPU**(GPU)— `device: "webgpu"`
  2. **WebNN**(NPU/統合アクセラレータ — OS の Neural API 経由。Chrome
     で実験的)— `executionProviders: ["webnn"]`(`deviceType: "npu"` →
     失敗時 `"gpu"` → `"cpu"`)
  3. **WASM**(CPU)— ONNX Runtime Web の WASM バックエンド。**WASM SIMD128
     を有効化**し、ブラウザの JIT が CPU の SIMD 命令(AVX2/NEON 等)へ
     マップする。スレッド数は `open-english-server` の既存
     `GET /v1/cpu-runtime`(open-cpu の検出結果 — `avx2+fma3` 等)を
     ヒントに決める(SIMD 非対応なら 1 スレッド + シングル)。
  4. どれも駄目なら **Web Speech API**、最後は手入力。
  長所: サーバー不要・オフライン・プライバシー。短所: 初回モデル DL。
  → open-cpu は「ブラウザ内から直接呼ぶ」ものではなく、**サーバーが
    報告する CPU 能力を app.js が WASM 実行段のチューニングに使う**形で
    連携する(ネイティブ推論の open-cpu 直結は P2-β の `/v1/transcribe`
    側)。
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
- **ハーネス = 実装済み(2026-08-29)**:
  - [`tools/asr-bench/wer.mjs`](../../tools/asr-bench/wer.mjs) — 依存ゼロの
    Node。`--ref refs.jsonl --hyp hyp-*.jsonl [--keywords kw.jsonl] [--md]`。
    NFKC 正規化 → 語 or 文字(`lang` と空白率で CJK 自動判定)Levenshtein で
    WER/CER、`keywords` から kw-recall(R-WER 近似)、`missing`(取りこぼし数)。
    言語別内訳も出す。自己テスト済み。
  - [`tools/asr-bench/split-bench.mjs`](../../tools/asr-bench/split-bench.mjs)
    — ブラウザで集めた `window.__asrBench` を `hyp-{webspeech,whisper,server,
    fused}.jsonl` へ切り出す。
  - `app.js`: `localStorage["openEnglish.asrBench"]="1"` で
    `finalizeVoiceInput()` が各発話の 4 エンジン出力 + 融合結果を
    `window.__asrBench` へ記録(計測時のみ)。
  - [`docs/asr-eval/README.md`](../asr-eval/README.md) に手順・形式・
    受け入れ基準・結果ログ欄。`refs.example.jsonl` / `keywords.example.jsonl`
    をサンプルとして同梱。実音声(`audio/`)と生出力(`hyp-*.jsonl`)は
    `.gitignore`(結果表だけコミット)。CI では音声を回せないため
    **ローカル実行**(結果表をコミットメッセージ or README の結果ログへ)。

### 5.3 各フェーズのプロトタイプと受け入れ基準

| フェーズ | プロトタイプ | 受け入れ基準(前周比) / 状況 |
|---|---|---|
| **P1-α** ✅ | §4.1 A(BCP-47 言語修正、`speechLangTag()`) | 非英日言語の WER が明確に低下。**実装済み**(コミット `7d99656`)。実機マイク検証待ち |
| **P1-β** ✅ | + B/C(`maxAlternatives=5` n-best + `refineTranscript()` の外部LLMプロバイダ訂正 + 信頼度フォールバック) | R-WER が低下。全体 WER は非悪化。**実装済み**(コミット `0ddb87e`)。実機・外部プロバイダ検証待ち |
| **P1-β2** ✅ | + D(直近トレーナー発話を訂正文脈に) | 固有名詞・話題語の R-WER 低下。**実装済み**(コミット `0dd2d29`)。`lastTrainerUtterance()` が DOM の最後の `.msg.trainer` から話題を拾い訂正プロンプト末尾へ付与。実機検証待ち。※練習問題(4択クイズ)はマイクではなくクリック回答のため、マイク文脈としては会話練習の「直前の話題」を採用した |
| **P1-γ** ✅ | + E(NLLB `/v1/translate` へ接続) | **実装済み**(コミット `1001346`)。`speechTranslationHelper()` がマイクの訂正済みトランスクリプトを母国語へ翻訳し「🌐 Japanese: …」のシステムメッセージで補助表示。engine が `m2m100` で始まらなければ「簡易翻訳」バッジを日英併記。fire-and-forget・失敗時スキップ。**制約**: aruaru-llm 既定ビルドは `nllb-translate` オフ → GPT-2 品質。実用には aruaru-llm を `--features nllb-translate` で再ビルド。実機検証待ち |

### P2 の着手順(AI 判断、ユーザー承認 2026-08-29「AIの判断で良い所どり」)

**P2-α 実装状況(2026-08-29)**:
- ✅ モデル/ランタイムのホスト: `fetch-whisper-model.ps1`(model +
  transformers.js + ORT wasm を取得)、`whisper-model-installer.exe`
  (ISCC ビルド済み)、`open-english.iss` 同梱、`server` の
  `maybe_fetch_whisper_model()` が起動時 + 6h ごとに自動取得、
  `/models/...`・`/vendor/...` を STATIC_FILES で同一オリジン配信。
- ✅ `app.js` エンジン: `loadWhisperModule()` /
  `getWhisperPipeline()`(実行段カスケード WebGPU → WebNN-npu/gpu/cpu →
  WASM、スレッド数は `/v1/cpu-runtime` ヒント) /
  `blobToPcm16k()` / `whisperTranscribeBlob()`。マイク押下で Web Speech
  API と `MediaRecorder` を**並行起動**、`end` で融合(`finalizeVoiceInput`:
  Whisper 候補 + Web Speech n-best を 1 リストにして `refineTranscript`)。
  vendor/model 未配置なら静かに無効化 → Web Speech API 単独(回帰ゼロ)。
- ✅ **VPS 本番(`https://easy-web.tokyo/open-english/`)へ実配信・実ブラウザ
  検証済み(2026-08-29)**。デプロイで判明・修正した 3 点:
  1. **モデル/ランタイム取得は Linux でも動く必要がある**。`server` の
     `maybe_fetch_whisper_model()` は Windows 専用だった → `installer/unix/
     fetch-whisper-model.sh`(curl/wget 版)を新設し、非 Windows では
     `sh` でこれを起動するようにした。VPS で実行し model 9/9 取得。
  2. **transformers.js の ORT 配布物は `ort-wasm-simd-threaded.jsep.{mjs,wasm}`
     のみ**(WASM/WebGPU/WebNN を 1 つで賄う JSEP 統合ビルド)。非 jsep 版は
     jsdelivr で 404。ps1/sh/STATIC_FILES をこの 2 ファイル + `transformers.min.js`
     の 3 点に修正。
  3. **リバースプロキシがアプリを `/open-english/` プレフィックス配下で配信**
     (`strip_prefix=true`)しており、`/vendor/...` `/models/...` を
     ドメイン直下の絶対パスにするとバックエンドへ転送されず 404。
     `app.js` が自身の読み込み URL からアプリのベース(`/` or
     `/open-english/`)を導出し、そこからの相対で `WHISPER_VENDOR_URL` /
     `localModelPath` / `wasmPaths` を組み立てるよう変更(ローカル/
     インストーラー版=`/` でも VPS でも正しく解決)。
  - 実ブラウザ確認: `loadWhisperModule()` が同一オリジンの
    `/open-english/vendor/transformers.min.js` を dynamic import 成功、
    `env.localModelPath` = `/open-english/models/`、`numThreads` = 4
    (`/v1/cpu-runtime` 経由)、`config.json` fetch = 200。以前は 404 で
    静かに無効化 → Web Speech API のみだったのが、**本番でブラウザ
    Whisper が実際に engage できる状態になった**。
- ⏳ 実機検証待ち: 実マイクでの WebGPU/WebNN/WASM 各段の動作と WER 計測
  (マイクのある環境でユーザーが実施)。

**P2-α = ブラウザ Whisper を先に**。理由:
- `app.js` だけで完結(C++ ビルド不要・サーバー変更不要・新バックエンド不要)
- open-english の「PC/Linux サーバー不要・オフライン動作」方針(Android 単体
  ビルド、aruaru-llm 無しでも動く設計)と最も整合
- transformers.js は単一 ES モジュールで vendor 可能
- Chrome/Edge 利用者に即座に精度向上が届く
- 融合の受け皿(`refineTranscript` が多エンジン候補を受ける)は既に P1-β で完成

**P2-β = aruaru-llm `/v1/transcribe`(whisper.cpp CLI)を後に**。最高精度・
GPU(open-cuda が使うのと同じ物理 GPU 上で whisper.cpp が走る)だが、
サーバー側実装・`/v1/runtime` 配線・外部バイナリの用意が要る。

**P2-β 実装状況(2026-08-29、aruaru-llm リポジトリ側)**:
- ✅ `POST /v1/transcribe`(`{pcm_f32_base64, sample_rate=16000, language,
  tenant}` → `{transcript, language, engine, disclosure}`)。入力は
  P2-α の `blobToPcm16k()` が出す 16kHz mono f32 PCM の LE バイト列
  base64。`sample_rate≠16000` / base64 不正 / 10 分超は `400`。
- ✅ **方針変更・実装済み(2026-08-29)**: 当初の `whisper-rs` 直リンクは
  `whisper-rs-sys` が **Windows(MSVC)で bindgen 破綻**(glibc 固有型生成 →
  `1_usize - 264_usize overflow`)。再調査で **`whisper-rs 0.16.0` でも
  `WHISPER_DONT_GENERATE_BINDINGS=1` でも解消しない**既知ブロッカー(issue
  2026-04-21、公式 fix 未提供)と確認。open-english の主対象は Windows なので
  直リンク方式は不成立 → **whisper.cpp の公式リリース同梱プレビルド CLI
  (`whisper-cli` / 旧 `main`)を子プロセス起動**する方式へ全面書き換え
  (`pg_dump` / `Expand-Archive` / `adb` と同じパターン、C++ リンク・bindgen
  を完全回避)。`src/transcribe.rs`: 16kHz mono f32 PCM → 最小 WAV →
  `whisper-cli -m <model> -f <wav> -l <lang|auto> -oj -nt -np -t <n>` →
  `out.json` を `serde_json` で緩くパース。壁時計上限(既定 300s、
  `ARUARU_LLM_WHISPER_TIMEOUT_SECS`)で kill。スクラッチは temp_dir 下の
  一意サブディレクトリ(`tempfile` crate を実行時依存に加えない)。
  **Cargo feature は撤去**(コンパイル時依存が無くなったため不要)。
- ✅ `GET /v1/runtime` の `whisper` 段 = `{available, backend, cli_path,
  cli_present, model_path, model_present, detail}`。`is_available()` =
  `cli_present && model_present` の実行時判定。CLI パスは
  `ARUARU_LLM_WHISPER_CLI`(既定 `<crate>/models/whisper/whisper-cli[.exe]`)、
  モデルは `ARUARU_LLM_WHISPER_MODEL`(既定 `.../ggml-base.bin`)。どちらも
  リポジトリ非同梱、無ければ `503` + 入手先(whisper.cpp releases)を案内。
- ✅ `cargo build --release` 成功、`cargo test --release` **100 passed /
  1 ignored**(新規 `transcribe` テスト 7 件 = WAV ヘッダ・JSON パース・
  CLI/モデル不在時のエラー・env 上書き、回帰なし)。
- ⏳ 実機検証待ち: プレビルド `whisper-cli` + `ggml-base.bin` を用意して
  `POST /v1/transcribe` を実 HTTP で書き起こし検証(環境に両方が無いため未達)。

**融合(P2-γ)**: Web Speech API(即時)+ ブラウザ Whisper(WebGPU 時)+
サーバー `/v1/transcribe`(到達時)を並行実行し、全 n-best を
`refineTranscript` へ集約。

**P2-γ 実装状況(2026-08-29)**:
- ✅ **3 経路融合を配線済み**(`app.js`)。`serverTranscribeBlob()` 新設:
  可否は既に定期ポーリング済みの `lastRuntimeInfo.whisper`
  (`GET /v1/runtime`、新 shape `available` 優先・旧 shape も許容)で判定、
  到達不可なら静かにスキップ(回帰ゼロ)。到達時は `blobToPcm16k()` の
  16kHz mono f32 PCM を LE バイト列 → base64(`f32ToBase64()`、8KB
  チャンク)にして `POST {apiBase}/v1/transcribe` へ(60s タイムアウト)。
  `finalizeVoiceInput()` は `Promise.all([whisperTranscribeBlob,
  serverTranscribeBlob])` で**並行**実行し、
  `serverAlts.concat(whisperAlts).concat(speechAlts)`(精度が高い順)を
  1 リストにして `refineTranscript()`(= MPA GER の縮小版)へ渡す。
  `node --check` OK、VPS 配信済み。
- ✅ **無音トリム(第一段の VAD)を実装**(`app.js` `trimSilenceVad()`)。
  依存ゼロ・ダウンロードゼロの RMS ベース。30ms フレーム/10ms ホップで
  各フレームの RMS を出し、適応しきい値(ノイズフロア ×3、ピーク ×8%、
  絶対下限 -40dBFS)で先頭/末尾の無音を刈る(前後 100ms パディング、
  刈りすぎ防止ガード付き)。`finalizeVoiceInput()` が PCM を1回だけ
  デコード → `trimSilenceVad()` → **同じ PCM** をブラウザ Whisper と
  サーバー `/v1/transcribe` の両方へ渡す(`whisperTranscribePcm` /
  `serverTranscribePcm` へリネーム)。幻覚のいちばん多いトリガー(先頭/
  末尾の無音)に効く。`node --check` OK。
- ✅ **Silero VAD(ONNX v5)を第二段として実装**(`app.js`
  `sileroVadTrim()` / `getSileroSession()` / `vadTrim()`)。
  `onnx-community/silero-vad`(~2.2MB)を standalone の
  `onnxruntime-web@1.22.0`(非 jsep wasm ビルド一式を `/vendor/ort-vad/` へ
  **完全隔離** — transformers.js の jsep ビルドと ABI/バージョンが混ざら
  ないように)経由で実行。512 サンプル(32ms)ごとに発話確率 →
  ヒステリシス(on 0.5 / off 0.35)+ 最小発話 120ms + ギャップ 200ms
  未満は連結 + 前後 100ms パディングで発話セグメントへまとめ、**内部の
  無音ギャップも落とした** PCM を返す。モデル/ローダー未配置・バージョン
  不整合・実行失敗は catch → RMS 版へフォールバック(`vadTrim` は必ず
  有効な PCM を返す、回帰ゼロ)。**VPS 本番で実ブラウザ検証済み**:
  セッションロード 849ms(初回のみ)、I/O 名は `input`/`state`/`sr` →
  `output`/`stateN` を自動検出、3s 音声で推論 89ms、フレーム間で state
  を carry、エネルギーに追従した graded な発話確率を返す。合成音
  (正弦波 + 雑音)は Silero が正しく「非発話」と判定 → null → RMS へ
  フォールバックすることも確認(誤検出しない)。
- ⏳ 実機検証待ち: **実発話**での Silero セグメント抽出(合成音では
  Silero が発話と判定しないため、実マイクが要る)+ 利用者 PC の
  aruaru-llm(whisper-cli + GGML)を用意した 3 経路同時の WER/CER 計測。
  `tools/asr-bench/` のハーネスで数値化する。

**P2-α の唯一の未決事項 = Whisper モデル(ONNX、~240MB)のホスト先**:
- リポジトリに 240MB は入れられない
- 「オフライン優先・外部依存ゼロ」方針上、HF CDN 直リンクは CSP・方針に反する
- 候補: (a) aruaru-llm / open-english-server が `/models/whisper/` として
  静的配信(利用者が一度取得すれば SW キャッシュ)、(b) 初回のみ HF CDN
  から取得しキャッシュ + 正直な開示、(c) インストーラー同梱オプション
  (`fetch-aruaru-llm.ps1` と同型)。→ ここだけユーザー判断が要る。
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
