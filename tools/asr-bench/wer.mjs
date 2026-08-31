#!/usr/bin/env node
// ASR 評価ハーネス(docs/SPEECH_RECOGNITION_REDESIGN.md §5「試作品駆動で
// TEST と改善を繰り返す」の計測部分、2026-08-29新設)。
//
// 依存ゼロ(Node 標準のみ)。参照(正解)と仮説(各エンジンの出力)を
// JSONL で受け取り、WER / CER / 固有名詞 recall(R-WER 近似)を出して
// Markdown 表にする。1 周 = 1 コミットの「計測 → 改善 → 再計測」で使う。
//
// 使い方:
//   node tools/asr-bench/wer.mjs --ref docs/asr-eval/refs.jsonl \
//        --hyp docs/asr-eval/hyp-webspeech.jsonl [--hyp docs/asr-eval/hyp-whisper.jsonl ...] \
//        [--lang ja] [--keywords docs/asr-eval/keywords.jsonl] [--md]
//
// JSONL の各行: {"id": "u001", "text": "...", "lang": "ja"(任意)}
//   - refs:     正解の書き起こし。`lang` があれば言語別に集計。
//   - hyp:      あるエンジンの出力。id は refs と対応。欠けている id は
//               「無音扱い(全削除)」としてカウント(取りこぼしも WER に乗る)。
//   - keywords: {"id": "u001", "keywords": ["Fuji", "Akihabara"]} — その発話に
//               含まれるべき固有名詞。hyp に(正規化後)現れた割合を recall として出す。
//
// 正規化: 小文字化・記号除去・空白畳み込み。スペース区切り言語は語単位 WER、
// 日本語/中国語(lang が ja/zh/yue、または空白がほぼ無い)は文字単位 CER を
// 主指標にする(WER も参考値として出す)。

import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const out = { hyp: [], ref: null, lang: null, keywords: null, md: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ref") out.ref = argv[++i];
    else if (a === "--hyp") out.hyp.push(argv[++i]);
    else if (a === "--lang") out.lang = argv[++i];
    else if (a === "--keywords") out.keywords = argv[++i];
    else if (a === "--md") out.md = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!out.ref || out.hyp.length === 0) {
    throw new Error("usage: node wer.mjs --ref <refs.jsonl> --hyp <hyp.jsonl> [--hyp ...] [--lang ja] [--keywords kw.jsonl] [--md]");
  }
  return out;
}

function readJsonl(path) {
  const rows = new Map();
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const obj = JSON.parse(s);
    if (!obj.id) throw new Error(`${path}: a row has no "id": ${s.slice(0, 80)}`);
    rows.set(obj.id, obj);
  }
  return rows;
}

// Unicode プロパティで記号・句読点を落とし、空白を畳む。全角も対象。
function normalize(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// スペースがほぼ無い(CJK)テキストか。
function isCjkLike(text, lang) {
  if (lang && /^(ja|zh|yue|zh-hant|zh-hans)/i.test(lang)) return true;
  const n = normalize(text);
  if (!n) return false;
  const spaces = (n.match(/ /g) || []).length;
  const cjk = (n.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  return cjk > 0 && spaces / Math.max(1, n.length) < 0.02;
}

// Levenshtein 距離(挿入/削除/置換 = 各コスト1)。トークン列に対して。
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function tokensWord(text) {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}
function tokensChar(text) {
  return Array.from(normalize(text).replace(/ /g, ""));
}

function scoreOne(refText, hypText, lang) {
  const cjk = isCjkLike(refText, lang);
  const rW = tokensWord(refText);
  const hW = tokensWord(hypText);
  const rC = tokensChar(refText);
  const hC = tokensChar(hypText);
  const werErr = editDistance(rW, hW);
  const cerErr = editDistance(rC, hC);
  return {
    cjk,
    werErr,
    werN: rW.length,
    cerErr,
    cerN: rC.length,
    wer: rW.length ? werErr / rW.length : hW.length ? 1 : 0,
    cer: rC.length ? cerErr / rC.length : hC.length ? 1 : 0,
  };
}

function keywordRecall(hypText, keywords) {
  if (!keywords || !keywords.length) return null;
  const n = normalize(hypText);
  let hit = 0;
  for (const kw of keywords) {
    if (n.includes(normalize(kw))) hit++;
  }
  return { hit, total: keywords.length, recall: hit / keywords.length };
}

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

function main() {
  const args = parseArgs(process.argv);
  const refs = readJsonl(args.ref);
  const kw = args.keywords ? readJsonl(args.keywords) : null;

  const perEngine = [];
  for (const hypPath of args.hyp) {
    const hyps = readJsonl(hypPath);
    let werErr = 0;
    let werN = 0;
    let cerErr = 0;
    let cerN = 0;
    let kwHit = 0;
    let kwTotal = 0;
    let n = 0;
    let missing = 0;
    const byLang = new Map();
    for (const [id, ref] of refs) {
      const lang = ref.lang || args.lang || null;
      const hyp = hyps.get(id);
      if (!hyp) missing++;
      const s = scoreOne(ref.text, hyp ? hyp.text : "", lang);
      werErr += s.werErr;
      werN += s.werN;
      cerErr += s.cerErr;
      cerN += s.cerN;
      n++;
      const key = lang || "?";
      const b = byLang.get(key) || { werErr: 0, werN: 0, cerErr: 0, cerN: 0, n: 0 };
      b.werErr += s.werErr;
      b.werN += s.werN;
      b.cerErr += s.cerErr;
      b.cerN += s.cerN;
      b.n++;
      byLang.set(key, b);
      if (kw && kw.get(id)) {
        const r = keywordRecall(hyp ? hyp.text : "", kw.get(id).keywords || []);
        if (r) {
          kwHit += r.hit;
          kwTotal += r.total;
        }
      }
    }
    perEngine.push({
      engine: hypPath.replace(/^.*[\\/]/, "").replace(/\.jsonl$/, ""),
      n,
      missing,
      wer: werN ? werErr / werN : 0,
      cer: cerN ? cerErr / cerN : 0,
      kwRecall: kwTotal ? kwHit / kwTotal : null,
      byLang: [...byLang.entries()].map(([k, b]) => ({
        lang: k,
        n: b.n,
        wer: b.werN ? b.werErr / b.werN : 0,
        cer: b.cerN ? b.cerErr / b.cerN : 0,
      })),
    });
  }

  // 出力(Markdown 表 or プレーン)。
  const rows = perEngine.map((e) => [
    e.engine,
    String(e.n),
    String(e.missing),
    pct(e.wer),
    pct(e.cer),
    e.kwRecall == null ? "-" : pct(e.kwRecall),
  ]);
  const head = ["engine", "utts", "missing", "WER", "CER", "kw-recall"];
  if (args.md) {
    console.log("| " + head.join(" | ") + " |");
    console.log("| " + head.map(() => "---").join(" | ") + " |");
    for (const r of rows) console.log("| " + r.join(" | ") + " |");
    console.log("");
    for (const e of perEngine) {
      if (e.byLang.length <= 1) continue;
      console.log(`### ${e.engine} — 言語別`);
      console.log("| lang | utts | WER | CER |");
      console.log("| --- | --- | --- | --- |");
      for (const b of e.byLang) console.log(`| ${b.lang} | ${b.n} | ${pct(b.wer)} | ${pct(b.cer)} |`);
      console.log("");
    }
  } else {
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
    console.log(fmt(head));
    console.log(widths.map((w) => "-".repeat(w)).join("  "));
    for (const r of rows) console.log(fmt(r));
  }
}

main();
