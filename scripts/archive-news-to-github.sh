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
REALDATA_ENV="${REALDATA_ENV:-/root/repository/realdata.pro/.env.realdata}"

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
  local body="{\"name\":\"$1\",\"private\":$priv,\"description\":\"open-englishニュースアーカイブ($2、自動生成、archive-policy.json参照)\"}"
  # aon-co-jpは組織ではなく個人ユーザーのアカウントのため、/orgs/ は404になる
  # (2026-10-02の実機テストで判明。初版は組織用APIのみで、一度も作成に成功していなかった)。
  # realdata.pro(github.rs)と同じく、組織用を先に試して404なら個人用へフォールバックする。
  # さらに、push用のfine-grained PATは仕様上リポジトリを新規作成できない
  # (403 "Resource not accessible by personal access token")。作成には、realdata.proが
  # 自動引っ越しで使っている作成権限つきトークン(RRD_GITHUB_TOKEN)を、作成の呼び出し
  # だけに使う(pushには使わない)。環境変数ARCHIVE_GITHUB_CREATE_TOKENで上書き可能。
  local ctok="${ARCHIVE_GITHUB_CREATE_TOKEN:-}"
  if [ -z "$ctok" ] && [ -f "$REALDATA_ENV" ]; then
    ctok="$(grep -E '^RRD_GITHUB_TOKEN=' "$REALDATA_ENV" | head -1 | cut -d= -f2-)"
  fi
  if [ -z "$ctok" ]; then
    log "エラー: リポジトリ作成用トークンがありません(fine-grained PATは作成不可)。$1 を手動で作成してください。"
    return 1
  fi
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H "Authorization: Bearer $ctok" \
    -H "Accept: application/vnd.github+json" "https://api.github.com/orgs/$ORG/repos" -d "$body")"
  if [ "$code" = "404" ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H "Authorization: Bearer $ctok" \
      -H "Accept: application/vnd.github+json" "https://api.github.com/user/repos" -d "$body")"
  fi
  case "$code" in 201|422) return 0 ;; *) log "エラー: リポジトリ作成に失敗しました(HTTP $code): $1"; return 1 ;; esac
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
    /^### [^(]+\(検索日時 \/ searched at: / {
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

# 2) 公開用(抜粋文を除去)を作る。箇条書きは「- [タイトル](リンク) — 抜粋文」形式。
#    タイトルに「 — 」や角括弧が含まれる場合があるため、リンクURLの直後(") — ")で切る。
#    他社記事の抜粋文は公開側へ載せない。変換後も「- [タイトル](リンク)」の厳密な形に
#    ならない行(リンクのURLに括弧を含む等、想定外の形式)は、抜粋が残る恐れがあるため
#    その行だけ公開用から除く(完全版は非公開側に残るので失われない)。
PUBLIC_MD="$(mktemp)"
# 許可リスト方式: 「アーカイブ日の見出し」「国の見出し」「Tags行」「空行」「厳密な形の見出し+リンクの箇条書き」
# だけを残し、それ以外(複数行にまたがる抜粋の2行目以降などを含む)は全て公開用から除く。
sed -E 's(- \[.*\]\(https?:\/\/[^)]*\)) — .*$/\1/' "$PENDING_MD" \
  | awk '
      ## アーカイブ日/ { print; next }
      ### [^(]+\(検索日時 \/ searched at: [^)]*\)$/ { print; next }
      Tags: / { print; next }
      $/ { print; next }
      - \(no items/ { print; next }
      - \[.*\]\(https?:\/\/[^)]*\)$/ { print; next }
      { dropped++ }
      END { if (dropped) print dropped > "/dev/stderr" }' \
  > "$PUBLIC_MD" 2> "$PUBLIC_MD.dropped" || true
if [ -s "$PUBLIC_MD.dropped" ]; then
  log "公開用から除いた行(形式が想定外): $(cat "$PUBLIC_MD.dropped") 行(完全版は非公開側に保存済み)"
fi
rm -f "$PUBLIC_MD.dropped"
PUBLIC_OK=1

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

# 5) ここまで全て成功した場合だけ、open-english本体のNEWS-TITLE-README.md
#    (archive-search APIが読む、完全版)へ追記し、pending.mdを空にする。
#    (以前は追記を先に行っていたため、push失敗のたびに同じ内容が重複追記される
#    不具合があった。失敗時は何も変えずに終了し、次回の実行で再試行する。)
if [ -s "$NEWS_README" ] && [ "$(tail -c 1 "$NEWS_README")" != "" ]; then echo >> "$NEWS_README"; fi
cat "$PENDING_MD" >> "$NEWS_README"
: > "$PENDING_MD"
log "完了。$PENDING_MD をクリアしました。"
