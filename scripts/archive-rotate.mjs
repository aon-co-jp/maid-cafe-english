#!/usr/bin/env node
// GitHubの非公開アーカイブリポジトリを「溢れる前に」ローテーションするための
// 汎用スクリプト(ユーザー指示、2026-09-30: 「DATAがあふれる前に予測して、
// 非公開のGithubの新規リポジトリをあらかじめ作っておいて、タイミングよく
// そのリポジトリを切り替えてDATAが溢れないようにして」への対応)。
//
// 設計方針:
// - GitHub上の1リポジトリの推奨上限(公式ドキュメントが目安とする1GB)より
//   十分保守的な閾値(既定800MB)を超えたら「次」の連番リポジトリ
//   (例: open-english-news-archive-002)を新規作成し、以降はそちらへ切り替える。
// - どのリポジトリが「現在の書き込み先」かは、このリポジトリ内の
//   `.archive-pointer.json`(バージョン管理する、gitignoreしない)で追跡する。
// - **正直な開示・意図的な設計**: このスクリプトはCLAUDE CODE(本人の対話
//   セッション)から手動/定期実行される想定で、常時稼働のサーバープロセス
//   (open-english-server等)には組み込まない——サーバーにGitHubへの書き込み
//   権限を持たせない、という既存方針(news_prune_archiveのHANDOFF参照)を
//   そのまま踏襲する。
//
// 使い方:
//   node scripts/archive-rotate.mjs <kind> [--threshold-mb=800]
//   例: node scripts/archive-rotate.mjs news
//   出力: 現在の書き込み先リポジトリのfull name(owner/repo)を標準出力へ1行。
//   ローテーションが発生した場合は標準エラーへその旨を出力する。
//
// 前提: `gh`(GitHub CLI)が認証済みであること。

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POINTER_PATH = join(__dirname, "..", ".archive-pointer.json");

const ORG = "aon-co-jp";
const DEFAULT_THRESHOLD_MB = 800; // GitHub公式の目安(1GB)より保守的な既定値。

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function loadPointers() {
  if (!existsSync(POINTER_PATH)) return {};
  return JSON.parse(readFileSync(POINTER_PATH, "utf8"));
}

function savePointers(pointers) {
  writeFileSync(POINTER_PATH, JSON.stringify(pointers, null, 2) + "\n");
}

function repoExists(fullName) {
  try {
    gh(["repo", "view", fullName, "--json", "name"]);
    return true;
  } catch {
    return false;
  }
}

function repoSizeKb(fullName) {
  const out = gh(["api", `repos/${fullName}`, "--jq", ".size"]);
  return parseInt(out, 10) || 0;
}

/** "open-english-news-archive" -> "open-english-news-archive-002" のように次の連番名を作る。 */
function nextRepoName(baseName, currentName) {
  const m = currentName.match(/^(.*)-(\d{3})$/);
  if (!m) return `${baseName}-002`;
  const next = String(parseInt(m[2], 10) + 1).padStart(3, "0");
  return `${m[1]}-${next}`;
}

function main() {
  const kind = process.argv[2];
  if (!kind) {
    console.error("使い方: node scripts/archive-rotate.mjs <kind> [--threshold-mb=800] [--base=repo-base-name]");
    process.exit(1);
  }
  const thresholdArg = process.argv.find((a) => a.startsWith("--threshold-mb="));
  const thresholdMb = thresholdArg ? parseInt(thresholdArg.split("=")[1], 10) : DEFAULT_THRESHOLD_MB;
  const baseArg = process.argv.find((a) => a.startsWith("--base="));

  const pointers = loadPointers();
  let currentRepoName = pointers[kind];

  if (!currentRepoName) {
    if (!baseArg) {
      console.error(
        `エラー: kind="${kind}"の初回登録には --base=<repo-base-name> の指定が必要です` +
          `(例: --base=open-english-news-archive)。`,
      );
      process.exit(1);
    }
    currentRepoName = baseArg.split("=")[1];
    pointers[kind] = currentRepoName;
    savePointers(pointers);
    console.error(`初回登録: kind="${kind}" -> ${ORG}/${currentRepoName}`);
  }

  const baseName = currentRepoName.replace(/-\d{3}$/, "");
  const currentFullName = `${ORG}/${currentRepoName}`;

  if (!repoExists(currentFullName)) {
    console.error(`エラー: ${currentFullName} が見つかりません(先に作成してください)。`);
    process.exit(1);
  }

  const sizeKb = repoSizeKb(currentFullName);
  const sizeMb = sizeKb / 1024;
  console.error(`${currentFullName}: ${sizeMb.toFixed(1)} MB / 閾値 ${thresholdMb} MB`);

  // 事前作成閾値(既定: 本閾値の80%)。ここに達したら「次」のリポジトリを
  // 作成だけしておき(切り替えはまだしない)、本閾値到達時にはリポジトリ
  // 作成を待たずに即座に切り替えられるようにする(ユーザー指示「あらかじめ
  // 作っておいて、タイミングよく切り替えて」への対応)。
  const precreateThresholdMb = thresholdMb * 0.8;
  if (sizeMb >= precreateThresholdMb && sizeMb < thresholdMb) {
    const standbyName = nextRepoName(baseName, currentRepoName);
    const standbyFullName = `${ORG}/${standbyName}`;
    if (!repoExists(standbyFullName)) {
      console.error(`事前作成閾値(${precreateThresholdMb.toFixed(0)} MB)に到達。次のリポジトリを先行作成します: ${standbyFullName}`);
      gh([
        "repo",
        "create",
        standbyFullName,
        "--private",
        "--description",
        `${baseName}のローテーション先(自動生成、archive-rotate.mjs)。前世代: ${currentRepoName}`,
      ]);
    } else {
      console.error(`次のリポジトリは既に先行作成済みです: ${standbyFullName}(まだ切り替えません)`);
    }
  }

  if (sizeMb >= thresholdMb) {
    const nextName = nextRepoName(baseName, currentRepoName);
    const nextFullName = `${ORG}/${nextName}`;
    if (!repoExists(nextFullName)) {
      console.error(`容量超過を検出。次のアーカイブリポジトリを作成します: ${nextFullName}`);
      gh([
        "repo",
        "create",
        nextFullName,
        "--private",
        "--description",
        `${baseName}のローテーション先(自動生成、archive-rotate.mjs)。前世代: ${currentRepoName}`,
      ]);
    } else {
      console.error(`次のアーカイブリポジトリは既に先行作成済みです: ${nextFullName}(切り替えのみ実施)`);
    }
    pointers[kind] = nextName;
    savePointers(pointers);
    console.log(nextFullName);
    return;
  }

  console.log(currentFullName);
}

main();
