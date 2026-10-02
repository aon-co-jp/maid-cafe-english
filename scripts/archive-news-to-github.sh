#!/bin/bash
# aruaru-llm側で古くなったニュースを刈り取り、GitHubへ退避する。
#
# 2026-10-02の方針変更(ユーザー指示):
#   - ニュースは「DBにため過ぎず、すぐ世界中の人に読んでもらうため公開」
#     → aruaru-llm側の保持期間を8日→20時間へ短縮し、このスクリプトは毎時実行する。
#   - 「著作権上の問題にならない内容は公開、問題になりそうなら非公開」
#     → 刈り取ったMarkdownを2つに分けてpushする(archive-policy.json参照):
#         * 公開 : タイトル・リンク・国名・日付・タグだけ(open-english-news-archive)
#         * 非公開: 抜粋文を含む完全版(open-english-news-snippets-archive)
#       Yahoo!ニュース等の他社記事の抜粋文は公開側へ載せない。
#   - 公開設定の安全装置: push先リポジトリの実際の公開設定が、種類ごとの期待値
#     (公開/非公開)と一致しなければ、何もpushせず止まる(fail closed)。
#
# 環境変数(systemdユニット側で設定):
#   ARUARU_LLM_DIR / OPEN_ENGLISH_DIR / ARUARU_LLM_BASE_URL
#
# `gh` CLIは使わない(このVPSでは`gh auth`のトークンが失効していたため)。push自体は
# git+credential store(fine-grained PAT)、リポジトリ情報の照会・作成は同じPATで
# GitHub REST APIへcurlする。
set -euo pipefail

ARUARU_LLM_DIR="${ARUARU_LLM_DIR:-/root/aruaru-llm}"
OPEN_ENGLISH_DIR="${OPEN_ENGLISH_DIR:-/root/easy-web.tokyo/open-english}"
ARUARU_LLM_BASE_URL="${ARUARU_LLM_BASE_URL:-http://127.0.0.1:4600}"

ORG="aon-co-jp"
THRESHOLD_MB=819   # github-limits.jsonのrecommendedRepoSizeMb(1024)の80%。
PRECREATE_THRESHOLD_MB=$((THRESHOLD_MB * 8 / 10))

STATE_DIR="$OPEN_ENGLISH_DIR/data"
LOG_FILE="$STATE_DIR/news-archive-push.log"
PENDING_MD="$ARUARU_LLM_DIR/data/news-archive-pending.md"
NEWS_README="$OPEN_ENGLISH_DIR/NEWS-TITLE-README.md"

mkdir -p "$STATE_DIR"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log() { echo "[$NOW] $1" >> "$LOG_FILE"; }

PAT="$(grep -oP '(?<=https://)[^:]+' ~/.git-credentials | head -1)"
if [ -z "$PAT" ]; then
  log "エラー: ~/.git-credentials からPATを取り出せませんでした。中断します。"
  exit 1
fi

api() { curl -fsS --max-time 20 -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" "$@"; }

repo_exists() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Authorization: Bearer $PAT" \
    "https://api.github.com/repos/$ORG/$1")" = "200" ]
}

repo_size_mb() {
  local size_kb
  size_kb="$(api "https://api.github.com/repos/$ORG/$1" | jq -r '.size // 0')"
  echo "scale=1; $size_kb / 1024" | bc
}

next_repo_name() {
  local current="$1"
  if [[ "$current" =~ ^(.*)-([0-9]{3})$ ]]; then
    printf "%s-%03d" "${BASH_REMATCH[1]}" "$((10#${BASH_REMATCH[2]} + 1))"
  else
    echo "${current}-002"
  fi
}

# $1=リポジトリ名 $2=public|private
create_archive_repo() {
  local priv=true
  [ "$2" = "public" ] && priv=false
  api -X POST "https://api.github.com/orgs/$ORG/repos" \
    -d "{\"name\":\"$1\",\"private\":$priv,\"description\":\"open-englishニュースアーカイブ($2、自動生成、archive-policy.json参照)\"}" >/dev/null
}

# 公開設定の安全装置。$1=リポジトリ名 $2=期待する公開設定(public|private)。
assert_visibility() {
  local actual
  actual="$(api "https://api.github.com/repos/$ORG/$1" | jq -r 'if .private then "private" else "public" end')"
  if [ "$actual" != "$2" ]; then
    log "中断: $ORG/$1 の公開設定が '$actual' ですが、ポリシー上は '$2' が必要です。pushしません(fail closed)。"
    return 1
  fi
}

# 種類ごとにローテーション先を決める。$1=kind $2=repoBase $3=public|private
# 出力: 書き込み先リポジトリ名(標準出力)。
resolve_target_repo() {
  local kind="$1" base="$2" vis="$3"
  local state="$STATE_DIR/archive-current-repo-$kind.txt"
  [ -f "$state" ] || echo "$base" > "$state"
  local current; current="$(cat "$state")"
  if ! repo_exists "$current"; then
    log "$current が存在しないため作成します($vis)。"
    create_archive_repo "$current" "$vis"
  fi
  local size; size="$(repo_size_mb "$current")"
  log "[$kind] 書き込み先: $ORG/$current ($size MB / 閾値 $THRESHOLD_MB MB)"
  local next; next="$(next_repo_name "$current")"
  if (( $(echo "$size >= $PRECREATE_THRESHOLD_MB" | bc -l) )) && ! repo_exists "$next"; then
    log "[$kind] 事前作成閾値に到達。次のリポジトリを先行作成: $ORG/$next ($vis)"
    create_archive_repo "$next" "$vis"
  fi
  if (( $(echo "$size >= $THRESHOLD_MB" | bc -l) )); then
    repo_exists "$next" || create_archive_repo "$next" "$vis"
    echo "$next" > "$state"
    current="$next"
    log "[$kind] 書き込み先を切り替えました: $ORG/$current"
  fi
  echo "$current"
}

# 国別ページ(wiki/<国名>.md)へ追記してpushする。$1=リポジトリ名 $2=入力Markdown
push_country_pages() {
  local repo="$1" input="$2" bytes
  bytes="$(wc -c < "$input")"
  local work; work="$(mktemp -d)"
  git clone --quiet "https://github.com/$ORG/$repo.git" "$work/repo" 2>>"$LOG_FILE"
  mkdir -p "$work/repo/wiki"
  awk -v outdir="$work/repo/wiki" '
    /^### / {
      line = $0; sub(/^### /, "", line)
      match(line, /^[^(]+/); country = substr(line, RSTART, RLENGTH)
      gsub(/[ \t]+$/, "", country)
      safe = country; gsub(/[\/\\:*?"<>|]/, "_", safe)
      outfile = outdir "/" safe ".md"; print $0 >> outfile; current = outfile; next
    }
    { if (current != "") print $0 >> current }
  ' "$input"
  {
    echo "# open-english ニュースアーカイブ 索引 / News Archive Index"
    echo
    echo "国別ページ(Wikipedia風)。 / One page per country."
    echo
    echo "## 国一覧 / Countries"
    echo
    for f in "$work"/repo/wiki/*.md; do
      b="$(basename "$f" .md)"; [ "$b" = "Home" ] && continue
      echo "- [$b](wiki/$b.md)"
    done | sort
  } > "$work/repo/wiki/Home.md"
  (
    cd "$work/repo"
    git add wiki/
    if git -c user.email="noreply@aon.tokyo" -c user.name="open-english archive bot" \
        commit --quiet -m "archive: $(date -u +%Y-%m-%d_%H) ($bytes bytes)"; then
      git push --quiet 2>>"$LOG_FILE"
      log "push完了: $ORG/$repo/wiki/"
    else
      log "コミット対象なし: $ORG/$repo"
    fi
  )
  rm -rf "$work"
}

# 1) aruaru-llmへ刈り取りを依頼する。
if ! curl -fsS -X POST --max-time 15 "$ARUARU_LLM_BASE_URL/v1/news/prune-archive" -o /dev/null; then
  log "警告: prune-archive の呼び出しに失敗しました(aruaru-llm未起動の可能性)。中断します。"
  exit 0
fi
if [ ! -s "$PENDING_MD" ]; then
  exit 0   # 毎時実行なので、対象なしは静かに終了する
fi
log "刈り取り済みニュース: $(wc -c < "$PENDING_MD") bytes"

# 2) open-english本体のNEWS-TITLE-README.md(archive-search APIが読む)へ追記する(完全版)。
if [ -s "$NEWS_README" ] && [ "$(tail -c 1 "$NEWS_README")" != "" ]; then echo >> "$NEWS_README"; fi
cat "$PENDING_MD" >> "$NEWS_README"

# 3) 公開用(抜粋文を除去)を作る。箇条書きは「- [タイトル](リンク) — 抜粋文」形式なので、
#    " — 以降" を削る。他社記事の抜粋文は公開側へ載せない。
PUBLIC_MD="$(mktemp)"
sed -E 's/^(- \[[^]]*\]\([^)]*\)) — .*$/\1/' "$PENDING_MD" > "$PUBLIC_MD"
# 念のための検査: 公開用に「 — 」が残っていたら(想定外の形式)、公開せず非公開側だけへ送る。
PUBLIC_OK=1
if grep -q ' — ' "$PUBLIC_MD"; then
  PUBLIC_OK=0
  log "警告: 公開用データに抜粋文が残る行があるため、今回は公開側へpushしません(非公開側のみ)。"
fi

# 4) 非公開(完全版)→ 公開(見出しのみ)の順でpushする。どちらも公開設定を確認してから。
PRIV_REPO="$(resolve_target_repo news-snippets open-english-news-snippets-archive private)"
if assert_visibility "$PRIV_REPO" private; then
  push_country_pages "$PRIV_REPO" "$PENDING_MD"
else
  rm -f "$PUBLIC_MD"; exit 1
fi

if [ "$PUBLIC_OK" = 1 ]; then
  PUB_REPO="$(resolve_target_repo news-headlines open-english-news-archive public)"
  if assert_visibility "$PUB_REPO" public; then
    push_country_pages "$PUB_REPO" "$PUBLIC_MD"
  else
    rm -f "$PUBLIC_MD"; exit 1
  fi
fi
rm -f "$PUBLIC_MD"

# 5) 成功したのでpending.mdを空にする(次回の重複追記を防ぐ)。
: > "$PENDING_MD"
log "完了。$PENDING_MD をクリアしました。"
