#!/bin/bash
# aruaru-llm側で8日以上前になったニュースを刈り取り、open-englishの
# NEWS-TITLE-README.mdへ追記した上で、非公開のGitHubアーカイブリポジトリへ
# 実際にpushする(ユーザー指示、2026-09-30: 「実際のデータ書き出し処理…を
# 実装して」への対応)。
#
# 2026-09-23新設のsystemdタイマー(news-archive-push.timer、毎日03:15)から
# 呼ばれる想定。ExecStartはこのファイルのパスを指すよう更新済み
# (`/root/easy-web.tokyo/open-english/scripts/archive-news-to-github.sh`)。
#
# 環境変数(systemdユニット側で設定):
#   ARUARU_LLM_DIR        aruaru-llmのチェックアウト先(既定 /root/aruaru-llm)
#   OPEN_ENGLISH_DIR       open-englishのチェックアウト先
#   ARUARU_LLM_BASE_URL    aruaru-llmのAPIベースURL(既定 http://127.0.0.1:4600)
#
# **正直な開示・設計判断**: このスクリプトは`gh` CLIを使わない
# (このVPSでは`gh auth`のトークンが失効していることが2026-09-30に判明した
# ため)。GitHubへのpush自体はgit本体+既存のcredential.helper store
# (fine-grained PAT、コロン必須形式)で行い、リポジトリのサイズ照会・
# 新規リポジトリ作成はGitHub REST APIへ`curl`で直接アクセスする
# (同じPATをBearerトークンとして使う)。ローテーション先の記録は
# open-englishリポジトリの`.archive-pointer.json`(Claude Code側で
# `scripts/archive-rotate.mjs`が更新)とは別に、このVPS上だけのローカル
# 状態ファイル(`data/news-archive-current-repo.txt`)で独立して管理する
# ——常時稼働環境のNode.js依存を避け、gitのcredential storeだけで完結させる
# ための単純化(2つの記録が食い違いうる点は既知の制約として残る)。
set -euo pipefail

ARUARU_LLM_DIR="${ARUARU_LLM_DIR:-/root/aruaru-llm}"
OPEN_ENGLISH_DIR="${OPEN_ENGLISH_DIR:-/root/easy-web.tokyo/open-english}"
ARUARU_LLM_BASE_URL="${ARUARU_LLM_BASE_URL:-http://127.0.0.1:4600}"

ORG="aon-co-jp"
BASE_REPO_NAME="open-english-news-archive"
THRESHOLD_MB=819   # github-limits.jsonのrecommendedRepoSizeMb(1024)の80%。archive-rotate.mjsと同じ値。
PRECREATE_THRESHOLD_MB=$((THRESHOLD_MB * 8 / 10))

STATE_DIR="$OPEN_ENGLISH_DIR/data"
CURRENT_REPO_FILE="$STATE_DIR/news-archive-current-repo.txt"
LOG_FILE="$STATE_DIR/news-archive-push.log"
PENDING_MD="$ARUARU_LLM_DIR/data/news-archive-pending.md"
NEWS_README="$OPEN_ENGLISH_DIR/NEWS-TITLE-README.md"

mkdir -p "$STATE_DIR"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log() { echo "[$NOW] $1" >> "$LOG_FILE"; }

# credential storeからPAT(GitHub REST API用のBearerトークン)を取り出す。
PAT="$(grep -oP '(?<=https://)[^:]+' ~/.git-credentials | head -1)"
if [ -z "$PAT" ]; then
  log "エラー: ~/.git-credentials からPATを取り出せませんでした。中断します。"
  exit 1
fi

# 1) aruaru-llmへ刈り取りを依頼する(古いニュースをローカルpending.mdへ追記させる)。
if ! curl -fsS -X POST --max-time 15 "$ARUARU_LLM_BASE_URL/v1/news/prune-archive" -o /dev/null; then
  log "警告: $ARUARU_LLM_BASE_URL/v1/news/prune-archive の呼び出しに失敗しました(aruaru-llm未起動の可能性)。続行を中断します。"
  exit 0
fi

if [ ! -s "$PENDING_MD" ]; then
  log "刈り取り対象のニュースはありませんでした($PENDING_MD が空か存在しません)。終了します。"
  exit 0
fi

PENDING_BYTES="$(wc -c < "$PENDING_MD")"
log "刈り取り済みニュース: $PENDING_BYTES bytes ($PENDING_MD)"

# 2) open-english本体のNEWS-TITLE-README.md(archive-search APIが直接読む
#    ローカルファイル)へ追記する。既存ファイルが改行で終わっていない場合に
#    前の行と結合してしまうバグが実機テストで発覚したため、先に改行を
#    1つ確実に入れてから追記する。
if [ -s "$NEWS_README" ] && [ "$(tail -c 1 "$NEWS_README")" != "" ]; then
  echo >> "$NEWS_README"
fi
cat "$PENDING_MD" >> "$NEWS_README"
log "NEWS-TITLE-README.md へ追記しました。"

# 3) ローテーション先リポジトリを決定する(2段階閾値、archive-rotate.mjsと同じ方針)。
if [ ! -f "$CURRENT_REPO_FILE" ]; then
  echo "$BASE_REPO_NAME" > "$CURRENT_REPO_FILE"
fi
CURRENT_REPO="$(cat "$CURRENT_REPO_FILE")"

repo_size_mb() {
  local repo="$1"
  local size_kb
  size_kb="$(curl -fsS --max-time 15 -H "Authorization: Bearer $PAT" \
    "https://api.github.com/repos/$ORG/$repo" | jq -r '.size // 0')"
  echo "scale=1; $size_kb / 1024" | bc
}

repo_exists() {
  curl -fsS --max-time 15 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $PAT" \
    "https://api.github.com/repos/$ORG/$1" | grep -q '^200$'
}

next_repo_name() {
  local current="$1"
  if [[ "$current" =~ ^(.*)-([0-9]{3})$ ]]; then
    local base="${BASH_REMATCH[1]}"
    local num="${BASH_REMATCH[2]}"
    printf "%s-%03d" "$base" "$((10#$num + 1))"
  else
    echo "${current}-002"
  fi
}

create_archive_repo() {
  local repo="$1"
  # 2026-09-30変更(ユーザー指示「公開Githubに移して…ハイブリッドなDATABASE化」):
  # 非公開ではなく公開リポジトリとして作成し、Wiki機能も有効化する。
  curl -fsS --max-time 20 -X POST -H "Authorization: Bearer $PAT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/orgs/$ORG/repos" \
    -d "{\"name\":\"$repo\",\"private\":false,\"has_wiki\":true,\"description\":\"open-englishニュースアーカイブのローテーション先(公開、Wikipedia風、自動生成)\"}" \
    > /dev/null
}

CURRENT_SIZE_MB="$(repo_size_mb "$CURRENT_REPO")"
log "現在の書き込み先: $ORG/$CURRENT_REPO ($CURRENT_SIZE_MB MB / 閾値 $THRESHOLD_MB MB)"

if (( $(echo "$CURRENT_SIZE_MB >= $PRECREATE_THRESHOLD_MB" | bc -l) )); then
  STANDBY_REPO="$(next_repo_name "$CURRENT_REPO")"
  if ! repo_exists "$STANDBY_REPO"; then
    log "事前作成閾値到達。次のリポジトリを先行作成します: $ORG/$STANDBY_REPO"
    create_archive_repo "$STANDBY_REPO"
  fi
fi

if (( $(echo "$CURRENT_SIZE_MB >= $THRESHOLD_MB" | bc -l) )); then
  NEXT_REPO="$(next_repo_name "$CURRENT_REPO")"
  if ! repo_exists "$NEXT_REPO"; then
    log "容量超過。次のリポジトリを作成します: $ORG/$NEXT_REPO"
    create_archive_repo "$NEXT_REPO"
  fi
  echo "$NEXT_REPO" > "$CURRENT_REPO_FILE"
  CURRENT_REPO="$NEXT_REPO"
  log "書き込み先を切り替えました: $ORG/$CURRENT_REPO"
fi

# 4) 決定したリポジトリの `wiki/` フォルダへ、Wikipediaのように
#    「国ごとに育っていく記事」として追記する(ユーザー指示、2026-09-30:
#    「できればWikiPEDIAみたいなNewsだともっと良いです」への対応)。
#    **正直な開示・設計変更**: 当初GitHub純正のWiki機能
#    (`<repo>.wiki.git`)を使う設計にしたが、実機テストの結果、GitHubの
#    Wikiは「最初の1ページをWebブラウザから手動作成するまでgitリポジトリ
#    自体が存在しない」という仕様であることが判明し(`git clone`が
#    `Repository not found`で失敗)、自動化スクリプトからは初期化できない
#    ——そのため純正Wiki機能は使わず、本体リポジトリ内の`wiki/`フォルダに
#    同じ「国名を記事タイトルとするページが時系列で育つ」構成を実現する
#    方式に変更した(通常のgit pushで完結するため自動化と相性が良い)。
#    索引ページ(`wiki/Home.md`)は、実在するページ一覧から国名の
#    アルファベット順で自動生成し、毎回上書きする。
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
git clone --quiet "https://github.com/$ORG/$CURRENT_REPO.git" "$WORKDIR/repo" 2>>"$LOG_FILE"
mkdir -p "$WORKDIR/repo/wiki"

# pending.md を "### 国名(検索日時 / searched at: ...)" ブロックごとに分割し、
# 各国のページ(wiki/<国名>.md)へ追記する。ファイル名に使えない文字は "_" に置換。
awk -v outdir="$WORKDIR/repo/wiki" '
  /^### / {
    line = $0
    sub(/^### /, "", line)
    match(line, /^[^(]+/)
    country = substr(line, RSTART, RLENGTH)
    gsub(/[ \t]+$/, "", country)
    safe = country
    gsub(/[\/\\:*?"<>|]/, "_", safe)
    outfile = outdir "/" safe ".md"
    print $0 >> outfile
    current = outfile
    next
  }
  { if (current != "") print $0 >> current }
' "$PENDING_MD"

# 索引ページ(wiki/Home.md)を、実在する国別ページ一覧から再生成する。
{
  echo "# open-english ニュースアーカイブ 索引 / News Archive Index"
  echo
  echo "日本語話者・各国語話者どちらでも読めるハイブリッドDATABASE(Wikipedia風、国別ページ)。 /"
  echo "A hybrid database readable by both Japanese speakers and speakers of each article's own language (Wikipedia-style, one page per country)."
  echo
  echo "## 国一覧 / Countries"
  echo
  for f in "$WORKDIR"/repo/wiki/*.md; do
    base="$(basename "$f" .md)"
    [ "$base" = "Home" ] && continue
    echo "- [$base](wiki/$base.md)"
  done | sort
} > "$WORKDIR/repo/wiki/Home.md"

cd "$WORKDIR/repo"
git add wiki/
if git -c user.email="noreply@aon.tokyo" -c user.name="open-english archive bot" \
    commit --quiet -m "archive: $(date -u +%Y-%m-%d) 分のニュースを追加 ($PENDING_BYTES bytes)"; then
  git push --quiet 2>>"$LOG_FILE"
  log "push完了: $ORG/$CURRENT_REPO/wiki/"
else
  log "コミット対象なし(変更なし)。"
fi

# 5) 成功したのでpending.mdを空にする(次回の重複追記を防ぐ)。
: > "$PENDING_MD"
log "$PENDING_MD をクリアしました。完了。"
