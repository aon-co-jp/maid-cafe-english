#!/bin/bash
# 世界情勢Q&A(server/src/news_qa.rs)のためにためた記事を、日ごとのJSONLにして、公開のニュース保存庫(GitHub)へ書き出す(2026-10-29新設)。
#
#   open-english-news-archive           articles/YYYY-MM-DD.jsonl … 題名・リンク・出典・日付・言語だけ
#   open-english-news-snippets-archive  articles/YYYY-MM-DD.jsonl … 上に加えて、短い要約(RSSが配信している抜粋、最大240字)
#
# 方針(archive-policy.json、2026-10-24のユーザー決定「ニュースストックは全て公開」): 両方とも公開。
# 安全装置(fail closed): push先の実際の公開設定が「公開」でなければ、何もpushせず止まる。
# 記事の本文は保存しない(RSSの見出し・短い要約・日付・リンクだけ)。
#
# 記事は、open-english-serverが毎時RSSから集めてSQLiteにためている。ここでは、前回書き出した後の分だけを、
# サーバー内からだけ読めるAPI(GET /v1/internal/news/export?since=)で受け取る。
#
# 環境変数(systemdユニット側で設定。既定は本番VPSの配置):
#   OPEN_ENGLISH_DIR / OPEN_ENGLISH_BASE_URL / ARTICLES_WORK_DIR
# `gh` CLIは使わない。pushはgit+credential store(fine-grained PAT)、公開設定の確認は同じPATでGitHub REST APIへcurlする。
set -euo pipefail

OPEN_ENGLISH_DIR="${OPEN_ENGLISH_DIR:-/root/easy-web.tokyo/open-english}"
BASE_URL="${OPEN_ENGLISH_BASE_URL:-http://127.0.0.1:8104}"
WORK="${ARTICLES_WORK_DIR:-/root/news-articles-work}"
ORG="aon-co-jp"
HEAD_REPO="open-english-news-archive"
SNIP_REPO="open-english-news-snippets-archive"

STATE_DIR="$OPEN_ENGLISH_DIR/data"
STATE="$STATE_DIR/news-articles-last-export.txt"
LOG_FILE="$STATE_DIR/news-articles-push.log"
mkdir -p "$STATE_DIR" "$WORK"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG_FILE"; }

PAT="$(grep -oP '(?<=https://)[^:]+' ~/.git-credentials | head -1)"
[ -n "$PAT" ] || { log "エラー: ~/.git-credentials からPATを取り出せませんでした。中断します。"; exit 1; }
api() { curl -fsS --max-time 20 -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" "$@"; }

for r in "$HEAD_REPO" "$SNIP_REPO"; do
  priv="$(api "https://api.github.com/repos/$ORG/$r" | jq -r .private)" || { log "エラー: $r の公開設定を確認できませんでした。中断します。"; exit 1; }
  [ "$priv" = "false" ] || { log "エラー: $r が公開ではありません(private=$priv)。方針と食い違うため、何もpushせず中断します。"; exit 1; }
done

SINCE="$(cat "$STATE" 2>/dev/null || echo 0)"
NOW="$(date +%s)"
DATA="$(curl -fsS --max-time 60 "$BASE_URL/v1/internal/news/export?since=$SINCE")" || { log "エラー: 記事の取得に失敗しました(since=$SINCE)。"; exit 1; }
if [ -z "$DATA" ]; then
  log "新しい記事はありませんでした(since=$SINCE)。"
  [ "${DRY_RUN:-0}" = "1" ] || echo "$NOW" > "$STATE"
  exit 0
fi
N_NEW="$(printf '%s\n' "$DATA" | wc -l)"

sync_repo() {  # $1=リポジトリ名
  local dir="$WORK/$1"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" pull --rebase -q
  else
    git clone -q --depth 1 "https://github.com/$ORG/$1.git" "$dir"
  fi
}

write_and_push() {  # $1=リポジトリ名 $2=full|head
  local name="$1" mode="$2" dir="$WORK/$1" d f proj
  sync_repo "$name"
  mkdir -p "$dir/articles"
  if [ "$mode" = "head" ]; then proj='{title,url,source,published_at,published_jst,lang}'; else proj='.'; fi
  for d in $(printf '%s\n' "$DATA" | jq -r '.published_jst[0:10]' | sort -u); do
    f="$dir/articles/$d.jsonl"
    { [ -f "$f" ] && cat "$f"; printf '%s\n' "$DATA" | jq -c --arg d "$d" "select(.published_jst | startswith(\$d)) | $proj"; } \
      | jq -s -c 'unique_by(.url) | sort_by(.published_at) | .[]' > "$f.tmp"
    mv "$f.tmp" "$f"
  done
  if [ "${DRY_RUN:-0}" = "1" ]; then  # 試し実行: 書き出す内容を表示するだけで、commit・pushしない(作業用のコピーも元に戻す)
    echo "== DRY_RUN $name ($mode): $(git -C "$dir" status --short articles | wc -l) 個のファイルが変わります"
    git -C "$dir" status --short articles | head -5
    git -C "$dir" checkout -q -- . 2>/dev/null || true
    git -C "$dir" clean -fdq articles
    return 0
  fi
  git -C "$dir" add articles
  if git -C "$dir" diff --cached --quiet; then
    log "$name: 変更なし"
  else
    git -C "$dir" -c user.name="news-stock" -c user.email="news-stock@maid-cafe.tokyo" commit -q -m "data: news articles $(date -u +%Y-%m-%d_%H)"
    git -C "$dir" push -q
    log "$name: pushしました(新規 $N_NEW 件)"
  fi
}

write_and_push "$HEAD_REPO" head
write_and_push "$SNIP_REPO" full
[ "${DRY_RUN:-0}" = "1" ] || echo "$NOW" > "$STATE"
log "完了(since=$SINCE → $NOW)"
