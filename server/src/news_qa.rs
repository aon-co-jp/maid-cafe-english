//! 世界情勢Q&A(2026-10-29新設): 報道機関のRSSを毎時集めてSQLiteへ「ストック」し、質問には、保存した記事の
//! 見出し・日付・短い要約・出典・リンクだけで答える。**AIによる推測や要約は入れない**(根拠となる記事が無ければ
//! 「分かりません」と答える)。保存した記事は、日ごとのファイルにして公開のニュース保存庫(GitHub)へ書き出す
//! (`scripts/archive-articles-to-github.sh`が`GET /v1/internal/news/export`を読む)。
//!
//! 正直な開示:
//! - 集めるのは各社がRSSとして配信している「見出し・短い要約・日付・リンク」だけで、記事の本文は保存しない。
//! - RSSには「いま配信されている新しい記事」しか無いため、過去分は、このストックを始めた日からの蓄積になる。
//! - 回答は、保存した記事の引用の並べ替えであり、記事の内容の正しさを保証するものではない。

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub struct Feed {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub lang: &'static str,
}

/// 集める報道機関のRSS(各社が配信用に公開しているもの)。
pub const FEEDS: &[Feed] = &[
    Feed { id: "bbc-world", name: "BBC News (World)", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en" },
    Feed { id: "nhk-intl", name: "NHKニュース(国際)", url: "https://www3.nhk.or.jp/rss/news/cat6.xml", lang: "ja" },
    Feed { id: "nhk-main", name: "NHKニュース(主要)", url: "https://www3.nhk.or.jp/rss/news/cat0.xml", lang: "ja" },
    Feed { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "en" },
    Feed { id: "dw-world", name: "Deutsche Welle (World)", url: "https://rss.dw.com/rdf/rss-en-world", lang: "en" },
    Feed { id: "guardian-world", name: "The Guardian (World)", url: "https://www.theguardian.com/world/rss", lang: "en" },
    Feed { id: "japantimes", name: "The Japan Times", url: "https://www.japantimes.co.jp/feed/", lang: "en" },
    Feed { id: "france24", name: "France 24", url: "https://www.france24.com/en/rss", lang: "en" },
    // 日本語の新しい記事(NHKの配信は2026-08-08で更新が止まっているため、他社の配信を追加: 2026-10-29)
    Feed { id: "mainichi-flash", name: "毎日新聞(速報)", url: "https://mainichi.jp/rss/etc/mainichi-flash.rss", lang: "ja" },
    Feed { id: "asahi-headlines", name: "朝日新聞(見出し)", url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf", lang: "ja" },
    Feed { id: "yomiuri-world", name: "読売新聞(国際)", url: "https://assets.wor.jp/rss/rdf/yomiuri/world.rdf", lang: "ja" },
];

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Item {
    pub url: String,
    pub title: String,
    pub summary: String,
    pub published_at: i64,
    pub source: String,
    pub lang: String,
}

static STORE: OnceLock<Mutex<Connection>> = OnceLock::new();

const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS news_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    published_at INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    feed_id TEXT NOT NULL,
    lang TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(published_at DESC);
CREATE TABLE IF NOT EXISTS news_keys (
    key TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    PRIMARY KEY (key, item_id)
);
CREATE INDEX IF NOT EXISTS idx_news_keys_item ON news_keys(item_id);";

/// 保存した記事から、索引のキーを自動で作る。地名は `place:paris`(日本語名でも英名でも同じキー)、
/// 話題の言葉は `w:russia` のように付ける。質問のときも同じ作り方でキーを作るので、保存と質問が自動でつながる。
pub fn extract_keys(title: &str, summary: &str) -> Vec<String> {
    let text = format!("{title} {summary}");
    let mut keys: Vec<String> = crate::places::find(&text).iter().map(|p| crate::places::key(p)).collect();
    for t in tokens(title).into_iter().chain(tokens(summary)) {
        keys.push(format!("w:{}", t.to_lowercase()));
    }
    keys.sort();
    keys.dedup();
    keys.truncate(60);
    keys
}

fn index_item(conn: &Connection, id: i64, title: &str, summary: &str) {
    for k in extract_keys(title, summary) {
        let _ = conn.execute("INSERT OR IGNORE INTO news_keys (key, item_id) VALUES (?1, ?2)", params![k, id]);
    }
    // 重要な言葉(統計で選んだもの)は `kw:` として、別に印を付ける
    for w in pick_important(conn, title, summary, 8) {
        let _ = conn.execute("INSERT OR IGNORE INTO news_keys (key, item_id) VALUES (?1, ?2)", params![format!("kw:{}", w.to_lowercase()), id]);
    }
}

fn idf(conn: &Connection, tok: &str, n_items: i64) -> f64 {
    let df: i64 = conn.query_row("SELECT COUNT(*) FROM news_keys WHERE key = ?1", params![format!("w:{}", tok.to_lowercase())], |r| r.get(0)).unwrap_or(0);
    (((n_items + 1) as f64) / ((df + 1) as f64)).ln()
}

/// 文章の中で「重要な言葉」を選ぶ(統計): ストック全体で珍しい言葉ほど重要(idf)、見出しに出る言葉・地名は更に重要、
/// 1文字の語や、ありふれた語は下げる。外部のAIが無くても動く。
pub fn pick_important(conn: &Connection, title: &str, summary: &str, n: usize) -> Vec<String> {
    let n_items: i64 = conn.query_row("SELECT COUNT(*) FROM news_items", [], |r| r.get(0)).unwrap_or(0);
    let in_title: std::collections::HashSet<String> = tokens(title).into_iter().collect();
    let mut cands: Vec<String> = tokens(title).into_iter().chain(tokens(summary)).collect();
    cands.sort();
    cands.dedup();
    let mut scored: Vec<(f64, String)> = cands
        .into_iter()
        .map(|t| {
            let mut s = idf(conn, &t, n_items) + 0.5;
            if in_title.contains(&t) {
                s *= 1.6;
            }
            if !crate::places::find(&t).is_empty() {
                s *= 1.5;
            }
            if t.chars().count() < 2 {
                s *= 0.5;
            }
            (s, t)
        })
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal).then(a.1.cmp(&b.1)));
    scored.into_iter().take(n).map(|(_, t)| t).collect()
}

/// aruaru-llm(open-cudaで動く埋め込み)に、見出しとの「意味の近さ」で候補の言葉を並べ直してもらい、
/// 近い上位を `ik:` として足す。aruaru-llmに繋がらないときは何もしない(統計のキーだけで動き続ける)。
/// 1回に処理する記事数に上限を付け、残りは次の回(毎時)に回す。
pub async fn refine_with_llm(limit: usize) -> usize {
    let todo: Vec<(i64, String, Vec<String>)> = with_store(|c| {
        let mut out = Vec::new();
        if let Ok(mut st) = c.prepare("SELECT id,title,summary FROM news_items WHERE NOT EXISTS (SELECT 1 FROM news_keys k WHERE k.item_id = news_items.id AND k.key = 'llm:done') ORDER BY published_at DESC LIMIT ?1") {
            if let Ok(rows) = st.query_map(params![limit as i64], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))) {
                for (id, t, s) in rows.filter_map(Result::ok) {
                    out.push((id, t.clone(), pick_important(c, &t, &s, 12)));
                }
            }
        }
        out
    })
    .unwrap_or_default();
    if todo.is_empty() {
        return 0;
    }
    let base = std::env::var("ARUARU_LLM_BIND").map(|b| format!("http://{b}")).unwrap_or_else(|_| "http://127.0.0.1:4600".to_string());
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build() {
        Ok(c) => c,
        Err(_) => return 0,
    };
    let mut done = 0;
    for (id, title, cands) in todo {
        if cands.is_empty() {
            with_store(|c| c.execute("INSERT OR IGNORE INTO news_keys (key,item_id) VALUES ('llm:done', ?1)", params![id]).ok());
            continue;
        }
        let docs: Vec<String> = cands.iter().take(15).map(|s| s.chars().take(400).collect()).collect();
        let q: String = title.chars().take(300).collect();
        let resp = client.post(format!("{base}/v1/rerank")).json(&json!({"query": q, "documents": docs})).send().await;
        let scores: Vec<f64> = match resp {
            Ok(r) if r.status().is_success() => match r.json::<serde_json::Value>().await {
                Ok(v) => v["scores"].as_array().map(|a| a.iter().filter_map(|x| x.as_f64()).collect()).unwrap_or_default(),
                Err(_) => Vec::new(),
            },
            _ => Vec::new(),
        };
        if scores.len() != docs.len() {
            break; // aruaru-llmに繋がらない/失敗: 今回は終わり(次の回にやり直す)
        }
        let mut ranked: Vec<(f64, &String)> = scores.iter().cloned().zip(cands.iter()).collect();
        ranked.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        with_store(|c| {
            for (_, w) in ranked.iter().take(4) {
                let _ = c.execute("INSERT OR IGNORE INTO news_keys (key,item_id) VALUES (?1, ?2)", params![format!("ik:{}", w.to_lowercase()), id]);
            }
            let _ = c.execute("INSERT OR IGNORE INTO news_keys (key,item_id) VALUES ('llm:done', ?1)", params![id]);
        });
        done += 1;
    }
    done
}

/// 既にストックしてある記事のうち、キーが未作成のものに、キーを後付けする(起動時。何度でも安全)。
pub fn backfill_keys(conn: &Connection) -> usize {
    let rows: Vec<(i64, String, String)> = match conn.prepare("SELECT id,title,summary FROM news_items WHERE NOT EXISTS (SELECT 1 FROM news_keys k WHERE k.item_id = news_items.id) LIMIT 20000") {
        Ok(mut st) => st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).map(|it| it.filter_map(Result::ok).collect()).unwrap_or_default(),
        Err(_) => return 0,
    };
    let _ = conn.execute_batch("BEGIN");
    for (id, t, s) in &rows {
        index_item(conn, *id, t, s);
    }
    let _ = conn.execute_batch("COMMIT");
    rows.len()
}

pub fn init(path: PathBuf) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("news dir: {e}"))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("news db: {e}"))?;
    conn.execute_batch(SCHEMA).map_err(|e| format!("news schema: {e}"))?;
    backfill_keys(&conn);
    STORE.set(Mutex::new(conn)).map_err(|_| "news store already initialised".to_string())
}

fn now_unix() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

// ---------------------------------------------------------------- RSS/Atomの読み取り

fn decode_entities(s: &str) -> String {
    s.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&amp;", "&")
}

/// HTMLのタグを取り除き、空白を詰める。
fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    // 目に見えない文字(ゼロ幅の空白など。France 24の要約に混ざっていた)を取り除く
    let cleaned: String = decode_entities(&out).chars().filter(|c| !matches!(*c, '​' | '‌' | '‍' | '⁠' | '﻿')).collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(max).collect();
        t.push('…');
        t
    }
}

fn parse_date(s: &str) -> Option<i64> {
    let s = s.trim();
    chrono::DateTime::parse_from_rfc2822(s)
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(s))
        .ok()
        .map(|d| d.timestamp())
}

/// 名前の優先順に、中身のある最初の子要素のテキストを返す(説明文より前に空の media:content などがあっても、読み飛ばす)。
fn child_text(node: roxmltree::Node, names: &[&str]) -> Option<String> {
    for name in names {
        let found = node
            .children()
            .filter(|c| c.is_element() && c.tag_name().name() == *name)
            .find_map(|c| c.text().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()));
        if found.is_some() {
            return found;
        }
    }
    None
}

fn child_link(node: roxmltree::Node) -> Option<String> {
    for c in node.children().filter(|c| c.is_element() && c.tag_name().name() == "link") {
        if let Some(h) = c.attribute("href") {
            if c.attribute("rel").map(|r| r == "alternate").unwrap_or(true) {
                return Some(h.trim().to_string());
            }
        }
        if let Some(t) = c.text() {
            let t = t.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

/// RSS 2.0 / RSS 1.0(RDF) / Atom のどれでも、記事(item/entry)を読み取る。
pub fn parse_feed(xml: &str, feed: &Feed, now: i64) -> Vec<Item> {
    let opts = roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() };
    let doc = match roxmltree::Document::parse_with_options(xml, opts) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let mut items = Vec::new();
    for node in doc.descendants().filter(|n| n.is_element() && matches!(n.tag_name().name(), "item" | "entry")) {
        let title = match child_text(node, &["title"]) {
            Some(t) => strip_tags(&t),
            None => continue,
        };
        let url = match child_link(node).or_else(|| child_text(node, &["guid", "id"])) {
            Some(u) if u.starts_with("http") => u,
            _ => continue,
        };
        let summary = child_text(node, &["description", "summary", "content"]).map(|d| truncate_chars(&strip_tags(&d), 240)).unwrap_or_default();
        let published_at = child_text(node, &["pubDate", "published", "updated", "date"]).and_then(|d| parse_date(&d)).unwrap_or(now);
        if title.is_empty() {
            continue;
        }
        items.push(Item { url, title, summary, published_at, source: feed.name.to_string(), lang: feed.lang.to_string() });
    }
    items
}

/// 新しい記事だけ保存する(同じURLは保存済みとして無視)。新規に保存した件数を返す。
fn upsert(conn: &Connection, feed: &Feed, items: &[Item], now: i64) -> usize {
    let mut added = 0;
    for it in items {
        let n = conn
            .execute(
                "INSERT OR IGNORE INTO news_items (url, title, summary, published_at, fetched_at, source, feed_id, lang) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![it.url, it.title, it.summary, it.published_at, now, it.source, feed.id, it.lang],
            )
            .unwrap_or(0);
        if n == 1 {
            index_item(conn, conn.last_insert_rowid(), &it.title, &it.summary);
        }
        added += n;
    }
    added
}

/// すべての報道機関のRSSを取得して保存する。報告用の文字列を返す。
pub async fn fetch_all() -> String {
    let client = match reqwest::Client::builder()
        .user_agent("maid-cafe.tokyo news-stock (+https://maid-cafe.tokyo)")
        .timeout(std::time::Duration::from_secs(25))
        .build()
    {
        Ok(c) => c,
        Err(e) => return format!("client error: {e}"),
    };
    let mut report = Vec::new();
    for feed in FEEDS {
        let res = client.get(feed.url).send().await;
        let text = match res {
            Ok(r) if r.status().is_success() => r.text().await.ok(),
            Ok(r) => {
                report.push(format!("{}: HTTP {}", feed.id, r.status().as_u16()));
                None
            }
            Err(e) => {
                report.push(format!("{}: {}", feed.id, e));
                None
            }
        };
        if let Some(xml) = text {
            let now = now_unix();
            let items = parse_feed(&xml, feed, now);
            let added = STORE.get().map(|m| upsert(&m.lock().unwrap_or_else(|e| e.into_inner()), feed, &items, now)).unwrap_or(0);
            report.push(format!("{}: {} items, +{} new", feed.id, items.len(), added));
        }
        tokio::time::sleep(std::time::Duration::from_millis(800)).await; // 相手に優しく: 取得の間隔を空ける
    }
    report.join("; ")
}

/// 起動して少し待ってから、毎時、RSSを集めてストックする。
pub async fn run_collector() {
    tokio::time::sleep(std::time::Duration::from_secs(20)).await;
    loop {
        let r = fetch_all().await;
        eprintln!("[news-stock] {r}");
        let refined = refine_with_llm(30).await;
        eprintln!("[news-stock] aruaru-llm refined keywords for {refined} items");
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}

// ---------------------------------------------------------------- 質問の解釈と検索

const STOP_JA: &[&str] = &[
    "世界情勢", "国際情勢", "情勢", "ニュース", "今日", "最新", "最近", "現在", "教えて", "ください", "について", "どう", "何", "状況", "出典", "つき", "ついて",
    // 質問の「型」を表すだけの一般的な言葉(これに当たった記事を出すと、無関係な記事が混ざる)
    "動向", "現状", "問題", "関係", "影響", "理由", "原因", "結果", "内容", "詳細", "一覧", "発表", "話題", "出来事",
];
const STOP_EN: &[&str] = &[
    "the", "and", "what", "whats", "is", "are", "about", "tell", "me", "news", "latest", "today", "world", "please", "how", "any", "with", "source", "sources", "from", "for", "of", "in", "on", "to", "a",
];

/// 日本語の言葉 → 英語の記事にも当たるための対応(よく出る話題)。
const JA_EN: &[(&str, &[&str])] = &[
    ("ロシア", &["russia", "putin", "moscow"]),
    ("ウクライナ", &["ukraine", "kyiv", "zelensky"]),
    ("中国", &["china", "chinese", "beijing"]),
    ("米国", &["us ", "u.s.", "united states", "american", "trump", "washington"]),
    ("アメリカ", &["us ", "u.s.", "united states", "american", "trump", "washington"]),
    ("イスラエル", &["israel", "israeli"]),
    ("ガザ", &["gaza", "palestin"]),
    ("パレスチナ", &["palestin", "gaza"]),
    ("イラン", &["iran", "tehran"]),
    ("北朝鮮", &["north korea", "pyongyang"]),
    ("韓国", &["south korea", "seoul"]),
    ("台湾", &["taiwan", "taipei"]),
    ("日本", &["japan", "japanese", "tokyo"]),
    ("インド", &["india", "indian", "delhi", "modi"]),
    ("欧州", &["europe", "european", "eu "]),
    ("英国", &["britain", "british", "uk ", "london"]),
    ("フランス", &["france", "french", "paris", "macron"]),
    ("ドイツ", &["germany", "german", "berlin"]),
    ("経済", &["econom", "market", "inflation", "trade"]),
    ("戦争", &["war ", "conflict", "military", "attack"]),
    ("選挙", &["elect", "vote", "poll"]),
    ("核", &["nuclear"]),
    ("地震", &["earthquake", "quake"]),
    ("気候", &["climate", "warming"]),
    ("石油", &["oil", "crude", "opec"]),
    ("関税", &["tariff", "trade war"]),
    ("人工知能", &["artificial intelligence", " ai "]),
    ("宇宙", &["space", "nasa", "rocket"]),
];

fn is_kanji(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF)
}
fn is_katakana(c: char) -> bool {
    matches!(c as u32, 0x30A0..=0x30FF) || c == 'ー'
}

/// 質問から、探す言葉を取り出す。(言葉, 一般的な言葉だけの質問か)
pub fn tokens(q: &str) -> Vec<String> {
    let q = q.trim();
    let lower = q.to_lowercase();
    let mut out: Vec<String> = Vec::new();
    // 漢字・カタカナの連なり
    let chars: Vec<char> = q.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let kind = if is_kanji(chars[i]) { 1 } else if is_katakana(chars[i]) { 2 } else { 0 };
        if kind == 0 {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < chars.len() && ((kind == 1 && is_kanji(chars[j])) || (kind == 2 && is_katakana(chars[j]))) {
            j += 1;
        }
        let run: String = chars[i..j].iter().collect();
        i = j;
        let mut rest = run.clone();
        for s in STOP_JA {
            rest = rest.replace(s, " ");
        }
        for part in rest.split_whitespace() {
            if part.chars().count() >= 2 || part == "核" {
                out.push(part.to_string());
            }
        }
    }
    // 単独の1文字の漢字(「核」など)は、文が短いときだけ話題として使う
    if out.is_empty() && q.chars().count() <= 6 {
        for c in q.chars().filter(|c| is_kanji(*c)) {
            out.push(c.to_string());
        }
    }
    // 英単語
    let mut word = String::new();
    for c in lower.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_alphanumeric() {
            word.push(c);
        } else {
            if word.len() >= 3 && !STOP_EN.contains(&word.as_str()) {
                out.push(word.clone());
            }
            word.clear();
        }
    }
    // 日本語 → 英語
    let mut extra: Vec<String> = Vec::new();
    for (ja, ens) in JA_EN {
        if q.contains(ja) {
            extra.extend(ens.iter().map(|s| s.to_string()));
        }
    }
    out.extend(extra);
    // 地名(日本語名・英名どちらで聞かれても、両方の名前で探す)
    for pl in crate::places::find(q) {
        out.push(pl.en.to_lowercase());
        out.push(pl.ja.to_string());
    }
    out.sort();
    out.dedup();
    out
}

#[derive(Debug, Clone, Serialize)]
pub struct Hit {
    #[serde(flatten)]
    pub item: Item,
    pub score: i64,
}

fn like_escape(t: &str) -> String {
    t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// 保存した記事から、質問に合うものを探す。言葉が取り出せない一般的な質問(「今日の世界情勢」など)は、新しい順に、
/// 出典が偏らないよう並べる。
pub fn search(conn: &Connection, q: &str, limit: usize, now: i64) -> Vec<Hit> {
    let toks = tokens(q);
    let mut hits: Vec<Hit> = Vec::new();
    if toks.is_empty() {
        let mut stmt = match conn.prepare("SELECT url,title,summary,published_at,source,lang FROM news_items ORDER BY published_at DESC LIMIT 120") {
            Ok(s) => s,
            Err(_) => return hits,
        };
        let rows: Vec<Item> = stmt
            .query_map([], |r| Ok(Item { url: r.get(0)?, title: r.get(1)?, summary: r.get(2)?, published_at: r.get(3)?, source: r.get(4)?, lang: r.get(5)? }))
            .map(|it| it.filter_map(Result::ok).collect())
            .unwrap_or_default();
        // 出典ごとに順番に1件ずつ取る(特定の1社に偏らない)
        let mut by_source: Vec<(String, Vec<Item>)> = Vec::new();
        for it in rows {
            match by_source.iter_mut().find(|(s, _)| *s == it.source) {
                Some((_, v)) => v.push(it),
                None => by_source.push((it.source.clone(), vec![it])),
            }
        }
        let mut idx = 0;
        while hits.len() < limit && by_source.iter().any(|(_, v)| idx < v.len()) {
            for (_, v) in &by_source {
                if hits.len() < limit {
                    if let Some(it) = v.get(idx) {
                        hits.push(Hit { item: it.clone(), score: 0 });
                    }
                }
            }
            idx += 1;
        }
        return hits;
    }
    let conds: Vec<String> = toks.iter().enumerate().map(|(i, _)| format!("(lower(title) LIKE ?{n} ESCAPE '\\' OR lower(summary) LIKE ?{n} ESCAPE '\\')", n = i + 1)).collect();
    let sql = format!(
        "SELECT url,title,summary,published_at,source,lang FROM news_items WHERE {} ORDER BY published_at DESC LIMIT 400",
        conds.join(" OR ")
    );
    let pats: Vec<String> = toks.iter().map(|t| format!("%{}%", like_escape(&t.to_lowercase()))).collect();
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return hits,
    };
    let rows = stmt.query_map(rusqlite::params_from_iter(pats.iter()), |r| {
        Ok(Item { url: r.get(0)?, title: r.get(1)?, summary: r.get(2)?, published_at: r.get(3)?, source: r.get(4)?, lang: r.get(5)? })
    });
    if let Ok(rows) = rows {
        for it in rows.filter_map(Result::ok) {
            let t = it.title.to_lowercase();
            let s = it.summary.to_lowercase();
            let mut score = 0i64;
            for tok in &toks {
                let tok = tok.to_lowercase();
                if t.contains(&tok) {
                    score += 3;
                }
                if s.contains(&tok) {
                    score += 1;
                }
            }
            let age = now - it.published_at;
            if age < 86_400 {
                score += 2;
            } else if age < 3 * 86_400 {
                score += 1;
            }
            hits.push(Hit { item: it, score });
        }
    }
    // 索引(保存時に自動で付けたキー)からも探す。地名のキーに合う記事は、点を多く足す。
    let mut qkeys: Vec<String> = crate::places::find(q).iter().map(|p| crate::places::key(p)).collect();
    let place_n = qkeys.len();
    qkeys.extend(toks.iter().map(|t| format!("w:{}", t.to_lowercase())));
    // 質問の中の「重要な言葉」(ストックで珍しい言葉)は、重要語のキー(kw:/ik:)でも引く
    let n_items: i64 = conn.query_row("SELECT COUNT(*) FROM news_items", [], |r| r.get(0)).unwrap_or(0);
    let mut ranked: Vec<(f64, &String)> = toks.iter().map(|t| (idf(conn, t, n_items), t)).collect();
    ranked.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    for (_, t) in ranked.into_iter().take(6) {
        qkeys.push(format!("kw:{}", t.to_lowercase()));
        qkeys.push(format!("ik:{}", t.to_lowercase()));
    }
    if !qkeys.is_empty() {
        let ph = (1..=qkeys.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT n.url,n.title,n.summary,n.published_at,n.source,n.lang,k.key FROM news_keys k JOIN news_items n ON n.id = k.item_id WHERE k.key IN ({ph}) ORDER BY n.published_at DESC LIMIT 600"
        );
        if let Ok(mut st) = conn.prepare(&sql) {
            let rows = st.query_map(rusqlite::params_from_iter(qkeys.iter()), |r| {
                Ok((Item { url: r.get(0)?, title: r.get(1)?, summary: r.get(2)?, published_at: r.get(3)?, source: r.get(4)?, lang: r.get(5)? }, r.get::<_, String>(6)?))
            });
            if let Ok(rows) = rows {
                for (it, key) in rows.filter_map(Result::ok) {
                    let bonus = if qkeys[..place_n].contains(&key) {
                        4
                    } else if key.starts_with("ik:") {
                        3
                    } else if key.starts_with("kw:") {
                        2
                    } else {
                        1
                    };
                    match hits.iter_mut().find(|h| h.item.url == it.url) {
                        Some(h) => h.score += bonus,
                        None => hits.push(Hit { item: it, score: bonus }),
                    }
                }
            }
        }
    }
    hits.sort_by(|a, b| b.score.cmp(&a.score).then(b.item.published_at.cmp(&a.item.published_at)));
    hits.truncate(limit);
    hits
}

fn jst(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|d| d.with_timezone(&chrono::FixedOffset::east_opt(9 * 3600).unwrap()).format("%Y-%m-%d %H:%M JST").to_string())
        .unwrap_or_default()
}

fn stock_stats(conn: &Connection) -> (i64, i64) {
    conn.query_row("SELECT COUNT(*), COALESCE(MAX(published_at),0) FROM news_items", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap_or((0, 0))
}

/// 質問に、保存した記事の引用だけで答える(出典・日付つき)。根拠が無ければ「分かりません」。
pub fn answer(conn: &Connection, q: &str, now: i64) -> serde_json::Value {
    let hits = search(conn, q, 6, now);
    let (total, latest) = stock_stats(conn);
    let generic = tokens(q).is_empty();
    let card = crate::places::card(q);
    if hits.is_empty() {
        let ja = format!(
            "📰 分かりません。保存したニュース({total}件、最新 {})の中に、ご質問に合う記事がありませんでした。推測では答えません。別の言葉(国名・出来事の名前)でもう一度お試しください。",
            if latest > 0 { jst(latest) } else { "なし".into() }
        );
        let en = format!(
            "📰 I don't know. None of the {total} stored news items (latest: {}) match your question, and I won't guess. Please try other words (a country or an event).",
            if latest > 0 { jst(latest) } else { "none".into() }
        );
        let (pj, pe) = card.clone().unwrap_or_default();
        return json!({"ok": true, "found": 0, "stock_total": total, "latest_published_at": latest, "items": [], "answer_ja": ja, "answer_en": en, "place_ja": pj, "place_en": pe});
    }
    let mut ja = String::new();
    let mut en = String::new();
    if let Some((pj, pe)) = &card {
        ja.push_str(pj);
        ja.push_str("\n\n");
        en.push_str(pe);
        en.push_str("\n\n");
    }
    ja.push_str(if generic { "📰 世界情勢Q&A — 保存した最新の記事です(見出し・日付・出典のみ。AIの推測は入れていません)\n" } else { "📰 世界情勢Q&A — ご質問に合う、保存した記事です(見出し・日付・出典のみ。AIの推測は入れていません)\n" });
    en.push_str(if generic { "📰 World-affairs Q&A — latest stored articles (headline, date and source only; no AI guesses)\n" } else { "📰 World-affairs Q&A — stored articles matching your question (headline, date and source only; no AI guesses)\n" });
    for h in &hits {
        let it = &h.item;
        ja.push_str(&format!("\n・[{}] {}「{}」", jst(it.published_at), it.source, it.title));
        en.push_str(&format!("\n- [{}] {}: \"{}\"", jst(it.published_at), it.source, it.title));
        if !it.summary.is_empty() {
            ja.push_str(&format!("\n  {}", it.summary));
            en.push_str(&format!("\n  {}", it.summary));
        }
        ja.push_str(&format!("\n  出典: {}", it.url));
        en.push_str(&format!("\n  Source: {}", it.url));
    }
    ja.push_str(&format!("\n\n(ストック {total}件、最新 {}。記事の内容の正しさは保証できません。出典のリンク先でご確認ください。)", jst(latest)));
    en.push_str(&format!("\n\n(Stock: {total} items, latest {}. Accuracy is not guaranteed; please check the linked sources.)", jst(latest)));
    let items: Vec<serde_json::Value> = hits
        .iter()
        .map(|h| json!({"title": h.item.title, "url": h.item.url, "source": h.item.source, "published_at": h.item.published_at, "published_jst": jst(h.item.published_at), "summary": h.item.summary}))
        .collect();
    json!({"ok": true, "found": hits.len(), "stock_total": total, "latest_published_at": latest, "items": items, "answer_ja": ja, "answer_en": en})
}

// ---------------------------------------------------------------- 該当記事が無いときの検索結果(Google・YouTube・ウェブ検索)

/// URLに入れるための文字の変換(英数字と -_.~ 以外を %XX にする)。
pub fn pct_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn google_url(q: &str) -> String {
    format!("https://www.google.com/search?q={}", pct_encode(q))
}

pub fn youtube_url(q: &str) -> String {
    format!("https://www.youtube.com/results?search_query={}", pct_encode(q))
}

/// 検索結果の1件: (題名, リンク, 抜粋)
pub type Found = (String, String, String);

/// 該当記事が無いときの案内文(日本語, 英語)。**「記事の裏付けのある答え」ではなく検索結果である**ことを明記する。
pub fn compose_fallback(q: &str, stock_total: i64, web: &[Found], videos: &[Found]) -> (String, String) {
    let mut ja = format!("📰 保存したニュース({stock_total}件)の中に、ご質問に合う記事がありませんでした。代わりに、検索の結果を表示します。\n※これは検索結果であり、ニュース記事の裏付けのある答えではありません。内容の正しさは、各リンク先でご確認ください。\n");
    let mut en = format!("📰 None of the {stock_total} stored news items match your question. Showing search results instead.\nNote: these are search results, not an answer backed by news articles; please check each linked page.\n");
    ja.push_str(&format!("\n🔎 Google検索の結果: {}\n▶️ YouTubeの検索結果: {}\n", google_url(q), youtube_url(q)));
    en.push_str(&format!("\n🔎 Google results: {}\n▶️ YouTube results: {}\n", google_url(q), youtube_url(q)));
    if !web.is_empty() {
        ja.push_str("\n【ウェブ検索の結果】");
        en.push_str("\n[Web search results]");
        for (t, l, sn) in web {
            ja.push_str(&format!("\n・{t}\n  {l}"));
            en.push_str(&format!("\n- {t}\n  {l}"));
            if !sn.is_empty() {
                let sn = truncate_chars(sn, 140);
                ja.push_str(&format!("\n  {sn}"));
                en.push_str(&format!("\n  {sn}"));
            }
        }
    }
    if !videos.is_empty() {
        ja.push_str("\n\n【YouTubeの動画】");
        en.push_str("\n\n[YouTube videos]");
        for (t, l, _) in videos {
            ja.push_str(&format!("\n・{t}\n  {l}"));
            en.push_str(&format!("\n- {t}\n  {l}"));
        }
    }
    (ja, en)
}

fn is_youtube(link: &str) -> bool {
    let host = link.split("://").nth(1).unwrap_or("").split('/').next().unwrap_or("").to_lowercase();
    host == "youtu.be" || host == "youtube.com" || host.ends_with(".youtube.com")
}

async fn aruaru_search(client: &reqwest::Client, base: &str, query: &str, hl: &str, n: usize) -> Vec<Found> {
    let url = format!("{base}/v1/search?q={}&hl={hl}&n={n}", pct_encode(query));
    let v: serde_json::Value = match client.get(&url).send().await {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or_default(),
        _ => return Vec::new(),
    };
    v["results"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    let link = r["link"].as_str()?.to_string();
                    if !link.starts_with("http") {
                        return None;
                    }
                    Some((r["title"].as_str().unwrap_or(&link).to_string(), link, r["snippet"].as_str().unwrap_or("").to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// 1分に20回まで(検索サービスを、この入口から使いすぎないため)。
static FALLBACK_WINDOW: Mutex<(i64, u32)> = Mutex::new((0, 0));
fn fallback_allowed(now: i64) -> bool {
    let mut g = FALLBACK_WINDOW.lock().unwrap_or_else(|e| e.into_inner());
    if now - g.0 >= 60 {
        *g = (now, 0);
    }
    if g.1 >= 20 {
        false
    } else {
        g.1 += 1;
        true
    }
}

/// 該当記事が無かった回答(found == 0)を、Google・YouTubeの検索へのリンクと、ウェブ検索の結果つきの案内に差し替える。
/// ウェブ検索(aruaru-search、APIキー不要)に接続できなくても、GoogleとYouTubeへのリンクは必ず付ける。
pub async fn with_fallback(mut base: serde_json::Value, q: &str) -> serde_json::Value {
    let q: String = q.chars().take(200).collect();
    let total = base["stock_total"].as_i64().unwrap_or(0);
    let (mut web, mut videos): (Vec<Found>, Vec<Found>) = (Vec::new(), Vec::new());
    if fallback_allowed(now_unix()) {
        let search_base = std::env::var("ARUARU_SEARCH_URL").unwrap_or_else(|_| "http://127.0.0.1:4610".to_string());
        let hl = if q.chars().any(|c| is_kanji(c) || is_katakana(c) || ('\u{3040}'..='\u{309f}').contains(&c)) { "ja" } else { "en" };
        if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12)).build() {
            let yq = format!("site:youtube.com {q}");
            let (w, y) = tokio::join!(aruaru_search(&client, &search_base, &q, hl, 5), aruaru_search(&client, &search_base, &yq, hl, 8));
            web = w.into_iter().filter(|(_, l, _)| !is_youtube(l)).take(5).collect();
            videos = y.into_iter().filter(|(_, l, _)| is_youtube(l)).take(4).collect();
        }
    }
    let (mut ja, mut en) = compose_fallback(&q, total, &web, &videos);
    // 地名の索引カードがあれば、先頭に付ける(名所・都市の質問でも、まず名簿の事実を示す)
    if let (Some(pj), Some(pe)) = (base["place_ja"].as_str().filter(|s| !s.is_empty()), base["place_en"].as_str()) {
        ja = format!("{pj}\n\n{ja}");
        en = format!("{pe}\n\n{en}");
    }
    let pack = |v: &[Found]| -> Vec<serde_json::Value> { v.iter().map(|(t, l, s)| json!({"title": t, "url": l, "snippet": s})).collect() };
    base["answer_ja"] = json!(ja);
    base["answer_en"] = json!(en);
    base["fallback"] = json!({"google_url": google_url(&q), "youtube_url": youtube_url(&q), "web": pack(&web), "videos": pack(&videos)});
    base
}

// ---------------------------------------------------------------- 公開API用の入口

fn with_store<T>(f: impl FnOnce(&Connection) -> T) -> Option<T> {
    STORE.get().map(|m| f(&m.lock().unwrap_or_else(|e| e.into_inner())))
}

pub fn ask(q: &str) -> serde_json::Value {
    let q: String = q.chars().take(200).collect();
    with_store(|c| answer(c, &q, now_unix())).unwrap_or_else(|| json!({"ok": false, "error": "news store is not ready"}))
}

pub fn stats() -> serde_json::Value {
    with_store(|c| {
        let (total, latest) = stock_stats(c);
        let mut per: Vec<serde_json::Value> = Vec::new();
        if let Ok(mut st) = c.prepare("SELECT source, COUNT(*), MAX(published_at) FROM news_items GROUP BY source ORDER BY COUNT(*) DESC") {
            if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))) {
                for (s, n, m) in rows.filter_map(Result::ok) {
                    per.push(json!({"source": s, "count": n, "latest": jst(m)}));
                }
            }
        }
        json!({"ok": true, "stock_total": total, "latest": if latest > 0 { jst(latest) } else { String::new() }, "sources": per})
    })
    .unwrap_or_else(|| json!({"ok": false}))
}

/// GitHubへ書き出す用: `since`(unix秒)以降に保存した記事を、1行1件のJSONで返す。
pub fn export_jsonl(since: i64) -> String {
    with_store(|c| {
        let mut out = String::new();
        if let Ok(mut st) = c.prepare("SELECT url,title,summary,published_at,source,lang,(SELECT group_concat(key) FROM news_keys WHERE item_id = news_items.id) FROM news_items WHERE fetched_at >= ?1 ORDER BY published_at ASC LIMIT 5000") {
            if let Ok(rows) = st.query_map(params![since], |r| Ok(json!({"url": r.get::<_, String>(0)?, "title": r.get::<_, String>(1)?, "summary": r.get::<_, String>(2)?, "published_at": r.get::<_, i64>(3)?, "published_jst": jst(r.get::<_, i64>(3)?), "source": r.get::<_, String>(4)?, "lang": r.get::<_, String>(5)?, "keys": r.get::<_, Option<String>>(6)?.unwrap_or_default().split(',').filter(|k| !k.is_empty()).collect::<Vec<_>>()}))) {
                for v in rows.filter_map(Result::ok) {
                    out.push_str(&v.to_string());
                    out.push('\n');
                }
            }
        }
        out
    })
    .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FEED: Feed = Feed { id: "t", name: "Test News", url: "https://example.test/rss", lang: "en" };

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA).unwrap();
        c
    }

    #[test]
    fn parses_rss2_with_cdata_html_and_truncates() {
        let long = "x".repeat(400);
        let xml = format!(
            r#"<?xml version="1.0"?><rss version="2.0"><channel><item><title>Russia &amp; Ukraine talks resume</title><link>https://ex.test/a</link><description><![CDATA[<p>Talks <b>resume</b> in Istanbul &amp; more. {long}</p>]]></description><pubDate>Wed, 28 Oct 2026 14:05:00 GMT</pubDate></item></channel></rss>"#
        );
        let items = parse_feed(&xml, &FEED, 1);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Russia & Ukraine talks resume");
        assert!(items[0].summary.starts_with("Talks resume in Istanbul & more."));
        assert!(!items[0].summary.contains('<'));
        assert!(items[0].summary.chars().count() <= 241);
        assert_eq!(items[0].published_at, 1_793_196_300); // 2026-10-28T14:05:00Z
        assert_eq!(items[0].source, "Test News");
    }

    #[test]
    fn parses_atom_and_rdf_and_skips_broken_items() {
        let atom = r#"<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom item</title><link rel="alternate" href="https://ex.test/atom"/><summary>S</summary><updated>2026-10-28T10:00:00+09:00</updated></entry><entry><title>No link</title></entry></feed>"#;
        let a = parse_feed(atom, &FEED, 1);
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].url, "https://ex.test/atom");
        assert_eq!(a[0].published_at, 1_793_149_200); // 2026-10-28T01:00:00Z
        let rdf = r#"<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>RDF item</title><link>https://ex.test/rdf</link><dc:date>2026-10-28T00:00:00Z</dc:date></item></rdf:RDF>"#;
        let r = parse_feed(rdf, &FEED, 1);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].published_at, 1_793_145_600);
        assert!(parse_feed("not xml at all", &FEED, 1).is_empty());
    }

    #[test]
    fn tokens_pick_topics_and_map_japanese_to_english() {
        let t = tokens("ロシアとウクライナの最新ニュースを教えて");
        assert!(t.contains(&"ロシア".to_string()) && t.contains(&"ウクライナ".to_string()));
        assert!(t.contains(&"russia".to_string()) && t.contains(&"ukraine".to_string()));
        assert!(!t.iter().any(|x| x == "ニュース" || x == "最新"));
        assert!(tokens("今日の世界情勢を、出典つきで教えてください。").is_empty()); // 一般的な質問
        assert!(tokens("What is the latest news about Taiwan?").contains(&"taiwan".to_string()));
        assert_eq!(tokens("核"), vec!["nuclear".to_string(), "核".to_string()]);
    }

    #[test]
    fn answers_with_sources_dates_and_says_unknown_without_evidence() {
        let c = mem();
        let now = 1_793_200_000;
        let items = vec![
            Item { url: "https://ex.test/1".into(), title: "Russia launches new offensive in Ukraine".into(), summary: "Fighting intensified overnight.".into(), published_at: now - 3600, source: "Test News".into(), lang: "en".into() },
            Item { url: "https://ex.test/2".into(), title: "Typhoon hits the Philippines".into(), summary: "Thousands evacuated.".into(), published_at: now - 7200, source: "Other News".into(), lang: "en".into() },
        ];
        assert_eq!(upsert(&c, &FEED, &items, now), 2);
        assert_eq!(upsert(&c, &FEED, &items, now), 0); // 同じURLは重複して保存しない
        let v = answer(&c, "ウクライナの状況を教えて", now);
        assert_eq!(v["found"], 1);
        let ja = v["answer_ja"].as_str().unwrap();
        assert!(ja.contains("https://ex.test/1") && ja.contains("2026-10-28 23:06 JST") && ja.contains("Test News"));
        assert!(!ja.contains("Typhoon"));
        let none = answer(&c, "量子コンピュータの最新動向", now);
        assert_eq!(none["found"], 0);
        assert!(none["answer_ja"].as_str().unwrap().contains("分かりません"));
        let generic = answer(&c, "今日の世界情勢", now);
        assert_eq!(generic["found"], 2); // 一般的な質問は新しい順に、出典を偏らせず返す
    }

    #[test]
    fn generic_question_words_do_not_cause_false_matches_and_invisible_chars_are_removed() {
        assert!(!tokens("量子コンピュータの最新動向").iter().any(|t| t == "動向"));
        let c = mem();
        let now = 1_793_200_000;
        upsert(&c, &FEED, &[Item { url: "https://ex.test/oil".into(), title: "アメリカの原油輸出減少".into(), summary: "輸出動向が注目されます".into(), published_at: now, source: "T".into(), lang: "ja".into() }], now);
        assert_eq!(answer(&c, "量子コンピュータの最新動向", now)["found"], 0);
        assert_eq!(strip_tags("a​ b⁠c"), "a bc");
    }

    #[test]
    fn fallback_links_are_encoded_and_the_text_says_these_are_search_results() {
        assert_eq!(pct_encode("a b&ウ"), "a%20b%26%E3%82%A6");
        assert_eq!(google_url("量子"), "https://www.google.com/search?q=%E9%87%8F%E5%AD%90");
        assert_eq!(youtube_url("quantum computing"), "https://www.youtube.com/results?search_query=quantum%20computing");
        let web = vec![("Quantum computing - Wikipedia".to_string(), "https://en.wikipedia.org/wiki/Quantum_computing".to_string(), "A quantum computer...".to_string())];
        let vid = vec![("Quantum explained".to_string(), "https://www.youtube.com/watch?v=abc".to_string(), String::new())];
        let (ja, en) = compose_fallback("量子コンピュータ", 342, &web, &vid);
        assert!(ja.contains("検索結果であり、ニュース記事の裏付けのある答えではありません"));
        assert!(ja.contains("google.com/search?q=") && ja.contains("youtube.com/results?search_query="));
        assert!(ja.contains("Quantum computing - Wikipedia") && ja.contains("watch?v=abc") && ja.contains("342件"));
        assert!(en.contains("not an answer backed by news articles"));
        assert!(!ja.contains("分かりません"));
        // 検索サービスに接続できなくても、リンクは必ず付く
        let (ja2, _) = compose_fallback("x", 0, &[], &[]);
        assert!(ja2.contains("google.com/search?q=x") && ja2.contains("youtube.com/results"));
        assert!(is_youtube("https://www.youtube.com/watch?v=1") && is_youtube("https://youtu.be/1") && !is_youtube("https://notyoutube.com/x") && !is_youtube("https://example.com/youtube.com"));
    }

    #[test]
    fn fallback_is_rate_limited_per_minute() {
        let base = 10_000_000_000i64;
        let mut allowed = 0;
        for _ in 0..30 {
            if fallback_allowed(base) {
                allowed += 1;
            }
        }
        assert_eq!(allowed, 20);
        assert!(fallback_allowed(base + 61));
    }

    #[test]
    fn like_special_characters_are_escaped() {
        let c = mem();
        let now = 1_793_200_000;
        upsert(&c, &FEED, &[Item { url: "https://ex.test/p".into(), title: "100% growth".into(), summary: String::new(), published_at: now, source: "T".into(), lang: "en".into() }], now);
        assert_eq!(like_escape("a_b%c\\d"), "a\\_b\\%c\\\\d");
        assert!(search(&c, "xyz_%", 5, now).is_empty());
    }

    #[test]
    fn empty_media_content_before_description_does_not_hide_the_summary() {
        let xml = r#"<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>T</title><link>https://ex.test/m</link><media:content url="https://img"/><description>Real summary</description><pubDate>Wed, 28 Oct 2026 14:05:00 GMT</pubDate></item></channel></rss>"#;
        let it = parse_feed(xml, &FEED, 1);
        assert_eq!(it[0].summary, "Real summary");
    }
}

#[cfg(test)]
mod live_probe {
    // 実際のRSSで確認するための補助(通常は走らせない): cargo test live_probe -- --ignored --nocapture
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn real_feeds_parse_and_answer() {
        let dir = std::env::temp_dir().join(format!("news-probe-{}", now_unix()));
        init(dir.join("news.sqlite3")).unwrap();
        let report = fetch_all().await;
        println!("REPORT: {report}");
        for q in ["今日の世界情勢", "ウクライナ", "中国の経済", "核", "量子コンピュータの最新動向"] {
            let v = ask(q);
            println!("Q={q} found={} stock={}", v["found"], v["stock_total"]);
            if v["found"].as_i64().unwrap_or(0) > 0 {
                println!("{}", v["answer_ja"].as_str().unwrap_or("").lines().take(6).collect::<Vec<_>>().join("\n"));
            }
        }
    }
}

#[cfg(test)]
mod index_tests {
    use super::*;

    #[test]
    fn stocking_auto_indexes_and_backfill_covers_old_rows() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA).unwrap();
        // 索引が無かった時代に保存した記事(キー無し)
        c.execute("INSERT INTO news_items (url,title,summary,published_at,fetched_at,source,feed_id,lang) VALUES ('https://ex.test/old','Fire near the Eiffel Tower in Paris','Visitors evacuated.',1793190000,1793190000,'Old News','t','en')", []).unwrap();
        assert_eq!(c.query_row("SELECT COUNT(*) FROM news_keys", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
        assert_eq!(backfill_keys(&c), 1);
        assert_eq!(backfill_keys(&c), 0); // 2回目は何もしない
        // 新しく保存する記事は、保存と同時にキーが付く
        let feed = Feed { id: "t", name: "New News", url: "x", lang: "ja" };
        let it = Item { url: "https://ex.test/new".into(), title: "京都で国際会議が開幕".into(), summary: String::new(), published_at: 1793195000, source: "New News".into(), lang: "ja".into() };
        assert_eq!(upsert(&c, &feed, &[it], 1793195000), 1);
        let has = |k: &str| c.query_row("SELECT COUNT(*) FROM news_keys WHERE key=?1", [k], |r| r.get::<_, i64>(0)).unwrap();
        assert_eq!(has("place:paris"), 1);
        assert_eq!(has("place:eiffel tower"), 1);
        assert_eq!(has("place:kyoto"), 1);
        // 日本語で聞いても、英語の記事に届く / 英語で聞いても、日本語の記事に届く
        let h = search(&c, "パリの様子は?", 5, 1793200000);
        assert!(h.iter().any(|x| x.item.url == "https://ex.test/old"));
        let h = search(&c, "Kyoto news", 5, 1793200000);
        assert!(h.iter().any(|x| x.item.url == "https://ex.test/new"));
        let a = answer(&c, "エッフェル塔について", 1793200000);
        assert!(a["answer_ja"].as_str().unwrap().contains("フランス・パリ"));
    }
}

#[cfg(test)]
mod important_tests {
    use super::*;

    #[test]
    fn rare_words_in_the_headline_beat_common_words() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA).unwrap();
        let feed = Feed { id: "t", name: "T", url: "x", lang: "en" };
        // 「government」は、どの記事にも出るありふれた言葉
        let mut items = Vec::new();
        for i in 0..30 {
            items.push(Item { url: format!("https://ex.test/{i}"), title: format!("Government statement number {i}"), summary: "The government said".into(), published_at: 1793190000 + i, source: "T".into(), lang: "en".into() });
        }
        upsert(&c, &feed, &items, 1793190000);
        let pick = pick_important(&c, "Government announces Zelenskyy visit", "The government said", 3);
        eprintln!("PICK={pick:?}");
        assert!(pick.contains(&"zelenskyy".to_string()));
        assert!(!pick.contains(&"government".to_string()) || pick.iter().position(|x| x == "government").unwrap() > 0);
        // 質問側でも、重要語のキー(kw:)が付いた記事に届く
        let mut it = items[0].clone();
        it.url = "https://ex.test/z".into();
        it.title = "Zelenskyy visits Warsaw".into();
        upsert(&c, &feed, &[it], 1793190100);
        let h = search(&c, "Zelenskyy", 3, 1793200000);
        assert_eq!(h[0].item.url, "https://ex.test/z");
    }
}
