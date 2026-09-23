# ニュースアーカイブ / News Archive

VPS(easy-web.tokyo)のディスク容量を圧迫しないよう、生きているニュース
DATABASE(`aruaru-llm`の`data/news_by_country.json`)から8日以上経過した
記事をここへ退避しています。全文検索を不要にするため、各セクションに
`Tags: `国名`と年月(YYYY-MM)`を付けています(GitHub上でCtrl+Fするだけで
辿れる簡易的な目的にとどめ、検索インデックスは構築しません)。

書き込みは`aruaru-llm`が生成するMarkdown(`data/news-archive-pending.md`)を
VPS上のcronスクリプト(`aruaru-llm/scripts/archive-news-to-github.sh`)が
このファイルへ追記してpushする形で自動化しています(常時稼働するRustサーバー
本体にはGitHub書き込み資格情報を持たせていません)。

open-englishの質問フォームは、このファイルを`GET /v1/public/news/archive-search
?q=<keyword>`経由でその場読み込みし、利用者の質問に関連しそうな過去記事を
参照します(`server/src/main.rs`の`news_archive_search`/`parse_news_archive_markdown`)。

---

This file receives news items older than 8 days, pruned from the live
per-country news database (`aruaru-llm`'s `data/news_by_country.json`) to
avoid filling up the VPS disk. Each section is tagged with the country and
year-month so a simple Ctrl+F on GitHub is enough — no search index is built.

Writes are automated: `aruaru-llm` generates Markdown
(`data/news-archive-pending.md`), and a VPS-side cron script
(`aruaru-llm/scripts/archive-news-to-github.sh`) appends it here and pushes.
The always-running Rust server itself is never given GitHub write
credentials.

The open-english question form reads this file on demand via
`GET /v1/public/news/archive-search?q=<keyword>` to reference relevant past
articles for a user's question (see `news_archive_search` /
`parse_news_archive_markdown` in `server/src/main.rs`).