#!/usr/bin/env node
// ブラウザで集めた window.__asrBench(JSON 配列)を、エンジン別の
// hyp-*.jsonl(wer.mjs が読む形式)へ切り出す(2026-08-29新設)。
//
// 使い方:
//   copy(JSON.stringify(window.__asrBench))  // devtools で
//   pbpaste > docs/asr-eval/bench.local.json  // または貼り付けて保存
//   node tools/asr-bench/split-bench.mjs docs/asr-eval/bench.local.json docs/asr-eval
//
// 出力: <outdir>/hyp-webspeech.jsonl / hyp-whisper.jsonl / hyp-server.jsonl / hyp-fused.jsonl

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , inPath, outDir = "docs/asr-eval"] = process.argv;
if (!inPath) {
  console.error("usage: node tools/asr-bench/split-bench.mjs <bench.json> [outdir]");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(inPath, "utf8"));
if (!Array.isArray(rows)) throw new Error("input is not a JSON array");

const engines = { webspeech: "webspeech", whisper: "whisper", server: "server", fused: "fused" };
for (const [field, name] of Object.entries(engines)) {
  const lines = rows
    .filter((r) => r && r.id)
    .map((r) => JSON.stringify({ id: r.id, text: r[field] || "" }));
  const out = join(outDir, `hyp-${name}.jsonl`);
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`wrote ${out} (${lines.length} rows)`);
}
