#!/bin/bash
# GitHubの容量制限ドキュメントを毎朝クロールし、既知の数値(github-limits.json)が
# まだ同じかを簡易確認するスクリプト(ユーザー指示、2026-09-30: 「毎朝自動クロール
# でこの情報を入手して、実際に活かして」への対応)。
#
# **正直な開示**: GitHubの公式ドキュメントページはHTML構造が変わりうるため、本格的な
# 構造化パース(数値を自動で書き換える)はしない。curlでページ本文を取得し、
# github-limits.json記載の既知の数値(1 GB/5 GB/100 MB/25 MB/2 GB)がまだ本文中に
# 見つかるかを文字列一致で確認するだけの素朴なチェック。見つからない場合は
# 「変更の可能性あり」として警告ログを残し、lastCheckedは更新しない
# (=数値が古いままの状態を明示的に残す)。取得成功かつ全数値が見つかった場合のみ
# lastCheckedを本日の日付で更新する。実際にarchive-rotate.mjsの閾値算出は
# github-limits.jsonの`limits.recommendedRepoSizeMb`を読むため、このスクリプトが
# lastCheckedを更新し続けること自体が「まだ古い情報のまま運用していないか」の
# 監視ログとして機能する。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
LIMITS_JSON="$REPO_DIR/github-limits.json"
LOG_FILE="$REPO_DIR/data/github-limits-check.log"
DOC_URL="https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github"

mkdir -p "$(dirname "$LOG_FILE")"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ ! -f "$LIMITS_JSON" ]; then
  echo "[$NOW] エラー: $LIMITS_JSON が見つかりません" >> "$LOG_FILE"
  exit 1
fi

BODY="$(curl -fsSL --max-time 20 "$DOC_URL" 2>>"$LOG_FILE" || true)"
if [ -z "$BODY" ]; then
  echo "[$NOW] 警告: $DOC_URL の取得に失敗しました(ネットワーク不通の可能性)。lastCheckedは更新しません。" >> "$LOG_FILE"
  exit 0
fi

# 既知の数値が本文中にまだ現れるか(表記ゆれ吸収のため簡易な部分一致)。
MISSING=""
for needle in "100 MB" "50 MB" "5 GB" "25 MB"; do
  if ! grep -qi "$needle" <<< "$BODY"; then
    MISSING="$MISSING [$needle]"
  fi
done

if [ -n "$MISSING" ]; then
  echo "[$NOW] 警告: ドキュメント本文に見つからなかった既知の数値:$MISSING — 内容が変更された可能性があります。github-limits.jsonを手動で見直してください。lastCheckedは更新しません。" >> "$LOG_FILE"
  exit 0
fi

echo "[$NOW] OK: 既知の数値をすべて確認できました。lastCheckedを更新します。" >> "$LOG_FILE"
TMP="$(mktemp)"
jq --arg today "$(date -u +%Y-%m-%d)" '.lastChecked = $today' "$LIMITS_JSON" > "$TMP" && mv "$TMP" "$LIMITS_JSON"
