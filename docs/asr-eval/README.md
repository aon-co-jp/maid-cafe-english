# ASR 評価データセット / ASR evaluation set

`docs/SPEECH_RECOGNITION_REDESIGN.md` §5 の「プロトタイプ → 計測 → 改善 →
再計測」ループの計測に使う小さな参照セット。評価ハーネスは
[`tools/asr-bench/wer.mjs`](../../tools/asr-bench/wer.mjs)(依存ゼロ、Node)。

## ファイル

| ファイル | 形式 | 内容 |
|---|---|---|
| `refs.jsonl` | JSONL `{id, text, lang}` | 正解の書き起こし(1 発話 = 1 行)。`lang` は BCP-47 の言語部分(`ja` / `en` / `es` …)。 |
| `keywords.jsonl` | JSONL `{id, keywords: [...]}` | その発話に含まれるべき固有名詞(R-WER 近似の recall 用)。任意。 |
| `audio/<id>.webm` | 音声 | 実マイクで録った各発話。**Git には入れない**(`.gitignore`)。手元でのみ保持。 |
| `hyp-<engine>.jsonl` | JSONL `{id, text}` | あるエンジンの出力。ブラウザの devtools から `window.__asrDump` を貼るか、手で作る。**Git には入れない**(計測結果の表だけコミットする)。 |

## 使い方

1. `audio/<id>.webm` を録り、`refs.jsonl` に正解を書く(1 行 1 発話)。
2. open-english をブラウザで開き、devtools で
   `localStorage.setItem("openEnglish.asrBench","1")` してリロード。各発話を
   マイクで話すたびに `window.__asrBench` へ
   `{id, lang, webspeech, whisper, server, fused}` が積まれる(コンソールにも
   出る)。`refs.jsonl` の id と順番を合わせて話すこと。計測が終わったら
   devtools で `copy(JSON.stringify(window.__asrBench))` し、そこから
   `hyp-webspeech.jsonl`(各行 `{"id":..., "text": <webspeech>}`)/
   `hyp-whisper.jsonl` / `hyp-server.jsonl` / `hyp-fused.jsonl` を切り出す
   (1 分程度の手作業。将来 `tools/asr-bench/split-bench.mjs` を足してもよい)。
3. `window.__asrBench` を保存して切り出し → 計測:
   ```bash
   # devtools: copy(JSON.stringify(window.__asrBench)) → bench.local.json へ保存
   node tools/asr-bench/split-bench.mjs docs/asr-eval/bench.local.json docs/asr-eval
   node tools/asr-bench/wer.mjs --ref docs/asr-eval/refs.jsonl \
     --hyp docs/asr-eval/hyp-webspeech.jsonl \
     --hyp docs/asr-eval/hyp-whisper.jsonl \
     --hyp docs/asr-eval/hyp-server.jsonl \
     --hyp docs/asr-eval/hyp-fused.jsonl \
     --keywords docs/asr-eval/keywords.jsonl --md
   ```
4. 出てきた Markdown 表を、その周のコミットメッセージ or この README の
   「結果ログ」へ貼る。悪化したら即戻す(§5 のルール)。

## 指標

- **WER**(語誤り率): スペース区切り言語の主指標。挿入+削除+置換 / 正解語数。
- **CER**(文字誤り率): 日本語・中国語など空白の無い言語の主指標。ハーネスが
  `lang` と実際の空白率から自動で CJK 判定し、CER を主に見る。
- **kw-recall**: `keywords.jsonl` の固有名詞が(正規化後)仮説に現れた割合。
  固有名詞の取りこぼし(R-WER が捉える弱点)の代理指標。
- **missing**: `refs` にあって `hyp` に無い発話数(= そのエンジンが何も返せ
  なかった数)。WER/CER には「全削除」として乗る。

正規化: NFKC → 小文字化 → 記号・句読点除去 → 空白畳み込み。

## 受け入れ基準(§5.3 準拠)

主要言語で **WER < 10%(CJK は CER < 10%)**、固有名詞 **kw-recall > 80%**、
かつ会話のテンポを崩さない遅延。各フェーズ内でこのループを回して到達させる。

## 結果ログ

（まだ実マイク計測を実施していない。P1〜P2-γ は実装・`node --check` /
`cargo test` までで、WER/CER の実測はマイクのある環境でユーザーが実施予定。
最初の計測結果をここに貼ること。）
