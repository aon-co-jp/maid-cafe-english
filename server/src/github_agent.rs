//! GitHubへの自動読み書き(2026-08-20新設)。
//!
//! ユーザー指示「GitHubへの自動読み書き: 読み取り・書き込み両方
//! (commit/push含む)。ユーザーのGitHubトークンを使用」への対応。
//! GitHub REST APIの`Contents API`(単一ファイルの取得・作成・更新)を
//! そのまま使う——Git Data API(blob/tree/commit低レベルAPI)は複数
//! ファイルの単一コミット化等より高度な操作向けだが、今回のスコープ
//! (1ファイル単位の読み書き)には`Contents API`で十分なため、過大な
//! 実装を避けてこちらを採用した。
//!
//! ## セキュリティ設計(最重要)
//!
//! - トークンはリクエストの都度クライアント(ブラウザ)から受け取り、
//!   このプロセスのメモリ上でのみ使う——**ディスクへ平文永続化しない**。
//!   `server/src/db.rs`のSQLite設定テーブルへ保存することも技術的には
//!   可能だが、本モジュールはそれを行わない(呼び出し元がどうしても
//!   保存したい場合は、既存の`POST /v1/db/settings`を明示的に別途呼ぶ
//!   形になる——「保存するかどうかユーザーに選ばせる」設計をAPIの
//!   分離によって実現している)。
//! - トークン自体をログへ出力しない。

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

const GITHUB_API_BASE: &str = "https://api.github.com";
const USER_AGENT: &str = "open-english-server";

#[derive(Debug, Deserialize)]
struct ContentsGetResponse {
    content: String,
    encoding: String,
    sha: String,
}

pub struct FileContent {
    pub content: String,
    pub sha: String,
}

/// `GET /repos/{owner}/{repo}/contents/{path}` — ファイル1件を取得する。
/// `token`が`None`の場合は未認証のGitHub REST API(公開リポジトリのみ
/// 閲覧可、レート制限が厳しい)としてアクセスする。
pub async fn read_file(owner: &str, repo: &str, path: &str, branch: Option<&str>, token: Option<&str>) -> Result<FileContent> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build().context("failed to build HTTP client")?;
    let mut url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}");
    if let Some(branch) = branch {
        url.push_str("?ref=");
        url.push_str(&urlencode(branch));
    }
    let mut req = client.get(&url).header("accept", "application/vnd.github+json");
    if let Some(t) = token {
        req = req.header("authorization", format!("Bearer {t}"));
    }
    let resp = req.send().await.context("GitHub API request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        bail!("GitHub API returned {status}: {body}");
    }
    let parsed: ContentsGetResponse = resp.json().await.context("failed to parse GitHub API response")?;
    if parsed.encoding != "base64" {
        bail!("unexpected encoding from GitHub API: {}", parsed.encoding);
    }
    // GitHub returns base64 with embedded newlines; strip them before decoding.
    let cleaned: String = parsed.content.chars().filter(|c| !c.is_whitespace()).collect();
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(cleaned).context("failed to base64-decode file content")?;
    let content = String::from_utf8(bytes).context("file content is not valid UTF-8 (binary files are not supported by this endpoint)")?;
    Ok(FileContent { content, sha: parsed.sha })
}

#[derive(Debug, Serialize)]
struct ContentsPutRequest<'a> {
    message: &'a str,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    sha: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct ContentsPutResponse {
    commit: CommitInfo,
}

#[derive(Debug, Deserialize)]
struct CommitInfo {
    sha: String,
    html_url: Option<String>,
}

/// `PUT /repos/{owner}/{repo}/contents/{path}` — 新規作成または更新の
/// コミットを1件作成する。既存ファイルを更新する場合は`sha`(直前の
/// `read_file`で取得したもの)の指定が必須(GitHub API自体の仕様——
/// 楽観的ロックによる意図しない上書き防止)。
pub async fn commit_file(owner: &str, repo: &str, path: &str, content: &str, message: &str, branch: Option<&str>, sha: Option<&str>, token: &str) -> Result<(String, Option<String>)> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build().context("failed to build HTTP client")?;
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}");
    use base64::Engine;
    let body = ContentsPutRequest { message, content: base64::engine::general_purpose::STANDARD.encode(content.as_bytes()), sha, branch };
    let resp = client
        .put(&url)
        .header("accept", "application/vnd.github+json")
        .header("authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .context("GitHub API request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        bail!("GitHub API commit returned {status}: {text}");
    }
    let parsed: ContentsPutResponse = resp.json().await.context("failed to parse GitHub API commit response")?;
    Ok((parsed.commit.sha, parsed.commit.html_url))
}

/// サーバー側管理モード(2026-09-01新設、ユーザー指示「GitHubトークンも
/// レンタルサーバーやVPS上にあっても良さそう」への対応)。VPSエージェント
/// (`vps_agent.rs`)と同じ設計思想——トークンをサーバー起動時の環境変数
/// (`OPEN_ENGLISH_GITHUB_TOKEN`)としてのみ保持し、**ブラウザへは
/// 一切送信しない**(既存のファイル/暗号化/平文の3モードは、いずれも
/// 何らかの形でトークンがブラウザのJS上に一度は存在するが、この
/// モードはその瞬間が構造的に存在しない、既存モードより一段安全な
/// 選択肢)。
#[derive(Debug, Serialize)]
pub struct ServerModeStatus {
    pub configured: bool,
}

/// 2026-09-01修正(ユーザー指示「環境変数名は分かりにくいので辞めて」への
/// 対応): 環境変数(`OPEN_ENGLISH_GITHUB_TOKEN`/`OPEN_ENGLISH_GITHUB_TOKEN_
/// FILE`)は上級者向けの選択肢として残しつつ、**最もわかりやすい方法**として
/// 実行ファイルと同じディレクトリの`secrets/github-token.txt`へトークンを
/// 1行書いて置くだけで自動的に読み込む固定パスも用意した——環境変数名を
/// 覚える必要が無く、「このフォルダにこのファイルを置く」だけで済む。
fn default_token_file_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    Some(dir.join("secrets").join("github-token.txt"))
}

pub fn server_token() -> Option<String> {
    if let Ok(t) = std::env::var("OPEN_ENGLISH_GITHUB_TOKEN") {
        if !t.trim().is_empty() {
            return Some(t.trim().to_string());
        }
    }
    if let Ok(path) = std::env::var("OPEN_ENGLISH_GITHUB_TOKEN_FILE") {
        if let Ok(content) = std::fs::read_to_string(&path) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    if let Some(path) = default_token_file_path() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

pub fn status() -> ServerModeStatus {
    ServerModeStatus { configured: server_token().is_some() }
}

#[derive(Debug, Serialize)]
struct CreateRepoRequest<'a> {
    name: &'a str,
    private: bool,
    auto_init: bool,
}

#[derive(Debug, Deserialize)]
struct CreateRepoResponse {
    html_url: String,
    full_name: String,
}

/// `POST /user/repos` — 認証したユーザー配下に新規リポジトリを作成する。
pub async fn create_repo(name: &str, private: bool, token: &str) -> Result<(String, String)> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build().context("failed to build HTTP client")?;
    let resp = client
        .post(format!("{GITHUB_API_BASE}/user/repos"))
        .header("accept", "application/vnd.github+json")
        .header("authorization", format!("Bearer {token}"))
        .json(&CreateRepoRequest { name, private, auto_init: false })
        .send()
        .await
        .context("GitHub API request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        bail!("GitHub API repo creation returned {status}: {text}");
    }
    let parsed: CreateRepoResponse = resp.json().await.context("failed to parse GitHub API repo creation response")?;
    Ok((parsed.html_url, parsed.full_name))
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
