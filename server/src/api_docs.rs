//! 型付きのAPI宣言(RPoemのopen-runo-openapi)。`/api/docs`・`/api/openapi.json`・
//! Cosmo互換SDL・Tauriマニフェスト・TSクライアントの元になる。
//!
//! リクエスト本文の型は、実際のハンドラが読む構造体そのもの(`super::*Request`)。
//! レスポンスはハンドラが`json!`で組み立てる形をここで型として写したもの
//! (ハンドラの返却形を変えたらここも直す)。個別に写していないものは共通の外枠
//! (`Envelope`: `ok`/`error`+追加フィールド)で宣言する。

use super::*;
use open_runo_poem_compat::openapi::{Operation as Op, Spec};
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{Map, Value};

/// 個別に写していないエンドポイントが返すJSONの外枠。
#[derive(Serialize, JsonSchema)]
struct Envelope {
    ok: Option<bool>,
    error: Option<String>,
    #[serde(flatten)]
    data: Map<String, Value>,
}

#[derive(Serialize, JsonSchema)]
struct ErrorBody {
    error: String,
}
#[derive(Serialize, JsonSchema)]
struct SentResponse {
    sent: bool,
}
#[derive(Serialize, JsonSchema)]
struct SmsSentResponse {
    sent: bool,
    webotp_domain_configured: bool,
}
#[derive(Serialize, JsonSchema)]
struct ConfirmedResponse {
    confirmed: bool,
}
#[derive(Serialize, JsonSchema)]
struct MaskedIdentityResponse {
    ok: bool,
    masked_identifier: String,
}
#[derive(Serialize, JsonSchema)]
struct TotpSetupResponse {
    ok: bool,
    secret: String,
    qr_svg: String,
}
#[derive(Serialize, JsonSchema)]
struct AuthConfigSetResponse {
    ok: bool,
    login_mode: String,
    login_required: bool,
}
#[derive(Serialize, JsonSchema)]
struct SessionResponse {
    logged_in: bool,
    email: Option<String>,
    admin: bool,
    #[serde(flatten)]
    more: Map<String, Value>,
}
#[derive(Serialize, JsonSchema)]
struct CustomQaResponse {
    pairs: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct RelocateResponse {
    ok: bool,
    new_path: String,
}
#[derive(Serialize, JsonSchema)]
struct DetailResponse {
    ok: bool,
    detail: String,
}
#[derive(Serialize, JsonSchema)]
struct InstallRsyncResponse {
    ok: bool,
    detail: String,
    backup_ran: bool,
    backup_detail: Option<String>,
    backup_error: Option<String>,
}
#[derive(Serialize, JsonSchema)]
struct RsyncAllResponse {
    sqlite_backup: Value,
    postgres_backup: Value,
}
#[derive(Serialize, JsonSchema)]
struct MigrateLegacyResponse {
    ok: bool,
    imported_messages: u64,
    imported_settings: u64,
}
#[derive(Serialize, JsonSchema)]
struct ContentResponse {
    ok: bool,
    content: String,
}
#[derive(Serialize, JsonSchema)]
struct GithubReadResponse {
    ok: bool,
    content: String,
    sha: String,
}
#[derive(Serialize, JsonSchema)]
struct GithubCommitResponse {
    ok: bool,
    commit_sha: String,
    html_url: String,
}
#[derive(Serialize, JsonSchema)]
struct GithubPushResponse {
    ok: bool,
    html_url: String,
}
#[derive(Serialize, JsonSchema)]
struct PairResponse {
    ok: bool,
    device: Value,
}
#[derive(Serialize, JsonSchema)]
struct DevicesResponse {
    ok: bool,
    devices: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct UnpairResponse {
    ok: bool,
    removed: Value,
}
#[derive(Serialize, JsonSchema)]
struct BulkPairResponse {
    ok: bool,
    succeeded: u64,
    total: u64,
    results: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct PendingResponse {
    ok: bool,
    pending: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct DenyResponse {
    ok: bool,
    denied: bool,
}
#[derive(Serialize, JsonSchema)]
struct UpdatesHistoryResponse {
    components: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct DowngradeResponse {
    ok: bool,
    note: Option<String>,
}
#[derive(Serialize, JsonSchema)]
struct FsListResponse {
    ok: bool,
    path: String,
    parent: Option<String>,
    entries: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct ItemsResponse {
    count: u64,
    items: Vec<Value>,
}
#[derive(Serialize, JsonSchema)]
struct AdminModelsResponse {
    gpt2_catalog: Value,
    qwen_catalog: Value,
    recommend: Value,
}

// ---- GETのクエリ(ハンドラが`query_param`で読むキー) ----

#[derive(JsonSchema)]
#[allow(dead_code)]
struct IdQuery {
    /// QRログインのセッションID
    id: String,
}
#[derive(JsonSchema)]
#[allow(dead_code)]
struct PathQuery {
    /// 対象のパス
    path: Option<String>,
}
#[derive(JsonSchema)]
#[allow(dead_code)]
struct GithubReadQuery {
    owner: String,
    repo: String,
    path: String,
    /// ブランチ/タグ(`ref`)
    #[serde(rename = "ref")]
    branch: Option<String>,
}
#[derive(JsonSchema)]
#[allow(dead_code)]
struct LangQuery {
    /// 言語コード
    lang: Option<String>,
}
#[derive(JsonSchema)]
#[allow(dead_code)]
struct ArchiveSearchQuery {
    /// 検索語
    q: Option<String>,
    /// 件数(既定10)
    limit: Option<u32>,
}

fn get(path: &str, summary: &str, tag: &str) -> Op {
    Op::get(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

fn post(path: &str, summary: &str, tag: &str) -> Op {
    Op::post(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

fn get_t<T: JsonSchema>(path: &str, summary: &str, tag: &str) -> Op {
    Op::get(path).summary(summary).tag(tag).public().ok::<T>("OK").response::<ErrorBody>(400, "入力不正")
}

fn post_t<T: JsonSchema>(path: &str, summary: &str, tag: &str) -> Op {
    Op::post(path).summary(summary).tag(tag).public().ok::<T>("OK").response::<ErrorBody>(400, "入力不正")
}

pub fn spec() -> Spec {
    let s = Spec::new("open-english server", env!("CARGO_PKG_VERSION"))
        .description("open-englishのローカル/VPSサーバーAPI。本文の型は実装の構造体、レスポンスは実装の返却形を写した型(個別に写していないものは共通の外枠 ok/error+追加フィールド)。");
    // --- system ---
    let s = s
        .op(get_t::<OkResponse>("/healthz", "生存確認", "system"))
        .op(get_t::<OkResponse>("/health", "生存確認(別名)", "system"))
        .op(get_t::<AppConfig>("/v1/config", "アプリ設定", "system"))
        .op(get_t::<PlatformInfo>("/v1/platform-info", "実行環境の情報", "system"))
        .op(get_t::<CpuRuntime>("/v1/cpu-runtime", "CPU実行基盤の情報", "system"))
        .op(get("/v1/world-languages", "対応する世界の言語一覧", "system"))
        .op(get("/v1/region-info", "地域情報", "region").query::<LangQuery>())
        .op(get("/v1/region-news", "地域ニュース", "region").query::<LangQuery>())
        .op(get_t::<UpdatesHistoryResponse>("/v1/updates/history", "アップデート履歴", "updates"))
        .op(post_t::<DowngradeResponse>("/v1/updates/downgrade", "指定版へ戻す", "updates").body::<DowngradeRequest>());
    // --- aruaru-llm (admin / public proxy) ---
    let s = s
        .op(get_t::<AdminModelsResponse>("/v1/admin/aruaru-llm/models", "aruaru-llmのモデル一覧(管理)", "aruaru-llm"))
        .op(get("/v1/admin/aruaru-llm/runtime", "aruaru-llmの実行基盤(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/recommend-and-download", "推奨モデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/models/select", "モデルを選択(管理、aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/models/install", "モデルを導入(管理、aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/download-larger", "より大きいモデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/download-smaller", "より小さいモデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/qwen/select", "Qwenを選択(管理、中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/admin/aruaru-llm/qwen/install", "Qwenを導入(管理、中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/aruaru-llm/recommend", "推奨モデル", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/aruaru-llm/models/catalog", "モデルカタログ", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/public/aruaru-llm/models/select", "モデルを選択(公開)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/aruaru-llm/switch-status", "モデル切替の状況", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/public/aruaru-llm/generate", "文章生成(aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/public/aruaru-llm/generate-with-search", "検索付き文章生成", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/public/chat-providers/complete-priority", "優先順位つきチャット補完", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/chat-providers/active", "有効なチャット提供元", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/news/latest", "最新ニュース", "news").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/knowledge/export", "知識の書き出し", "news").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/v1/public/persona/prompt", "ペルソナのプロンプト", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/v1/public/news/for", "国別ニュース(クエリ: country)", "news").query_param("country", true, "国").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get_t::<ItemsResponse>("/v1/public/news/archive-search", "ニュースアーカイブ検索", "news").query::<ArchiveSearchQuery>())
        .op(post("/v1/public/freelance/job-search", "フリーランス案件の検索", "freelance").body::<PublicFreelanceJobSearchRequest>())
        .op(get("/v1/public/tts/status", "音声合成の状態", "tts"))
        .op(post("/v1/public/tts", "音声合成", "tts").body::<tts::TtsBody>());
    // --- LINE ---
    let s = s
        .op(Op::post("/v1/line/webhook").summary("LINE Messaging APIのWebhook(署名検証あり)").tag("line").public().body_raw("application/json").response_empty(200, "受理"))
        .op(get("/v1/line/audio", "LINE向け音声", "line"))
        .op(get("/v1/line/info", "LINEボットの情報", "line"));
    // --- auth ---
    let s = s
        .op(get_t::<AuthConfig>("/v1/auth/config", "認証設定の取得", "auth"))
        .op(post_t::<AuthConfigSetResponse>("/v1/auth/config", "認証設定の更新", "auth").body::<SetAuthConfigRequest>())
        .op(post_t::<SentResponse>("/v1/auth/request-otp", "メールOTPを送る", "auth").body::<RequestOtpRequest>())
        .op(post_t::<SmsSentResponse>("/v1/auth/request-sms-otp", "SMSのOTPを送る", "auth").body::<RequestSmsOtpRequest>())
        .op(post("/v1/auth/verify-otp", "OTPを検証してセッションを発行", "auth").body::<VerifyOtpRequest>())
        .op(post("/v1/auth/qr-login/start", "QRログインを開始", "auth"))
        .op(post_t::<OkResponse>("/v1/auth/qr-login/confirm", "別端末でQRログインを確認", "auth").body::<QrLoginIdRequest>())
        .op(get_t::<ConfirmedResponse>("/v1/auth/qr-login/status", "QRログインの状態", "auth").query::<IdQuery>())
        .op(post("/v1/auth/qr-login/finish", "QRログインを完了しCookieを発行", "auth").body::<QrLoginIdRequest>())
        .op(get_t::<MaskedIdentityResponse>("/v1/auth/qr-login/whoami", "QRログイン確認端末の識別", "auth").query::<IdQuery>())
        .op(get_t::<SessionResponse>("/v1/auth/session", "現在のセッション", "auth"))
        .op(post("/v1/auth/logout", "ログアウト", "auth"))
        .op(post_t::<TotpSetupResponse>("/v1/auth/totp-setup", "TOTPの設定", "auth").body::<TotpSetupRequest>())
        .op(post("/v1/auth/totp-verify", "TOTPの検証", "auth").body::<TotpVerifyRequest>());
    // --- db / settings / network ---
    let s = s
        .op(get_t::<Vec<crate::db::StoredMessage>>("/v1/db/history", "会話履歴の取得", "db"))
        .op(post_t::<OkResponse>("/v1/db/history", "会話にメッセージを追加", "db").body::<AddMessageRequest>())
        .op(post_t::<OkResponse>("/v1/db/history/clear", "会話履歴を消去", "db"))
        .op(get_t::<std::collections::HashMap<String, String>>("/v1/db/settings", "設定の取得", "db"))
        .op(post_t::<OkResponse>("/v1/db/settings", "設定を保存", "db").body::<SetSettingRequest>())
        .op(get_t::<CustomQaResponse>("/v1/custom-qa", "カスタムQ&Aの取得", "db"))
        .op(post_t::<OkResponse>("/v1/custom-qa", "カスタムQ&Aの保存", "db").body::<SetCustomQaRequest>())
        .op(get_t::<DbInfo>("/v1/db/info", "DBの情報", "db"))
        .op(post_t::<RelocateResponse>("/v1/db/storage-path", "DBの保存先を移す", "db").body::<RelocateRequest>())
        .op(get_t::<FsListResponse>("/v1/fs/list-dir", "ディレクトリ一覧", "db").query::<PathQuery>())
        .op(post("/v1/duckdns/update", "DuckDNSを更新", "network").body::<DuckDnsUpdateRequest>())
        .op(get("/v1/network/status", "ネットワーク状態", "network"))
        .op(post_t::<DetailResponse>("/v1/db/rsync-backup", "rsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post_t::<RsyncAllResponse>("/v1/db/rsync-backup-all", "全件のrsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post_t::<MigrateLegacyResponse>("/v1/db/migrate-legacy", "旧形式の履歴を移行", "db").body::<MigrateLegacyRequest>())
        .op(post_t::<InstallRsyncResponse>("/v1/db/install-rsync", "rsyncを導入", "db").body::<InstallRsyncRequest>());
    // --- agent ---
    let s = s
        .op(get_t::<ContentResponse>("/v1/agent/local/read", "ローカルファイルを読む", "agent").query::<PathQuery>())
        .op(post_t::<OkResponse>("/v1/agent/local/write", "ローカルファイルを書く", "agent").body::<LocalWriteRequest>())
        .op(get_t::<crate::local_agent::LocalAgentStatus>("/v1/agent/local/status", "ローカルエージェントの状態", "agent"))
        .op(get_t::<ContentResponse>("/v1/agent/vps/read", "VPSファイルを読む", "agent").query::<PathQuery>())
        .op(post_t::<OkResponse>("/v1/agent/vps/write", "VPSファイルを書く", "agent").body::<VpsWriteRequest>())
        .op(get_t::<crate::vps_agent::VpsAgentStatus>("/v1/agent/vps/status", "VPSエージェントの状態", "agent"))
        .op(get_t::<GithubReadResponse>("/v1/agent/github/read", "GitHubファイルを読む", "agent").query::<GithubReadQuery>())
        .op(post_t::<GithubCommitResponse>("/v1/agent/github/commit", "GitHubへコミット", "agent").body::<GithubCommitRequest>())
        .op(get_t::<crate::github_agent::ServerModeStatus>("/v1/agent/github/status", "GitHubエージェントの状態", "agent"))
        .op(post_t::<GithubPushResponse>("/v1/agent/github/create-and-push", "GitHubにリポジトリを作成してpush", "agent").body::<GithubCreateAndPushRequest>());
    // --- world-lab ---
    s.op(get_t::<crate::world_lab::WorldLabStatus>("/v1/world-lab/status", "world-labの状態", "world-lab"))
        .op(post_t::<PairResponse>("/v1/world-lab/pair", "端末をペアリング", "world-lab").body::<WorldLabPairRequest>())
        .op(get_t::<DevicesResponse>("/v1/world-lab/devices", "ペアリング済み端末", "world-lab"))
        .op(post_t::<UnpairResponse>("/v1/world-lab/unpair", "ペアリング解除", "world-lab").body::<WorldLabUnpairRequest>())
        .op(post_t::<BulkPairResponse>("/v1/world-lab/pair/bulk", "一括ペアリング", "world-lab").body::<WorldLabBulkPairRequest>())
        .op(post("/v1/world-lab/task/run", "タスクを実行", "world-lab").body::<WorldLabTaskRunRequest>())
        .op(post("/v1/world-lab/dispatch/request", "配信を要求(承認待ち)", "world-lab").body::<WorldLabDispatchRequestBody>())
        .op(get_t::<PendingResponse>("/v1/world-lab/dispatch/pending", "承認待ちの配信", "world-lab"))
        .op(post("/v1/world-lab/dispatch/:id/approve", "配信を承認", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
        .op(post_t::<DenyResponse>("/v1/world-lab/dispatch/:id/deny", "配信を拒否", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
}

#[cfg(test)]
mod tests {
    /// 宣言と、`app.at("/v1/...")`で登録された実ルートの食い違いを検出する
    /// (main.rsのソースを走査。少なくとも1メソッドの宣言が無いパスを失敗にする)。
    #[test]
    fn spec_is_lint_clean_and_covers_registered_api_routes() {
        let s = super::spec();
        assert!(s.lint().is_empty(), "{:?}", s.lint());
        let mut undeclared = Vec::new();
        let mut rest = include_str!("main.rs");
        while let Some(i) = rest.find("app.at(") {
            rest = &rest[i + 7..];
            if let Some(p) = rest.trim_start().strip_prefix('"') {
                if let Some(end) = p.find('"') {
                    let path = &p[..end];
                    let api = path.starts_with("/v1/") || path == "/healthz" || path == "/health";
                    let none = s.undocumented([("GET", path), ("POST", path)]).len() == 2;
                    if api && none {
                        undeclared.push(path.to_string());
                    }
                }
            }
        }
        assert!(undeclared.is_empty(), "未宣言のルート: {undeclared:?}");
    }

    #[test]
    fn typed_responses_and_queries_are_in_the_document() {
        let d = super::spec().build();
        let ok = |p: &str, m: &str| d["paths"][p][m]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].as_str().unwrap_or("").to_string();
        assert_eq!(ok("/v1/auth/session", "get"), "#/components/schemas/SessionResponse");
        assert_eq!(ok("/v1/db/install-rsync", "post"), "#/components/schemas/InstallRsyncResponse");
        let params = d["paths"]["/v1/agent/github/read"]["get"]["parameters"].as_array().unwrap();
        assert!(params.iter().any(|p| p["name"] == "ref"), "{params:?}");
        assert!(params.iter().any(|p| p["name"] == "owner" && p["required"] == true));
    }
}

// ---- ハンドラが実際に返す型(ハンドラはこれをそのまま構築して返す。文書もこの型から作る) ----

#[derive(Serialize, JsonSchema)]
pub(crate) struct OkResponse {
    pub(crate) ok: bool,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct PlatformInfo {
    pub(crate) os: &'static str,
    pub(crate) arch: &'static str,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct AppConfig {
    pub(crate) aruaru_llm_base_url: Option<String>,
    pub(crate) self_hosted_hostnames: Vec<String>,
    pub(crate) aruaru_llm_public_chat_available: bool,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct AuthConfig {
    pub(crate) login_mode: String,
    pub(crate) login_required: bool,
    pub(crate) smtp_configured: bool,
    pub(crate) sms_configured: bool,
    pub(crate) webotp_domain_configured: bool,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct DbInfo {
    pub(crate) db_path: String,
    pub(crate) db_file_size_bytes: u64,
    pub(crate) postgres_mirror_configured: bool,
    pub(crate) rsync_available: bool,
    pub(crate) dual_mirror: bool,
    pub(crate) mirror_targets: Vec<String>,
    pub(crate) mirror_outbox_pending: i64,
    pub(crate) mirror_outbox_given_up: i64,
    pub(crate) used_disk_bytes: Option<u64>,
    pub(crate) total_disk_bytes: Option<u64>,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct CombinationExamples {
    #[serde(rename = "avx2+fma3")]
    pub(crate) avx2_fma3: bool,
    #[serde(rename = "avx512f+bw+vl")]
    pub(crate) avx512f_bw_vl: bool,
    #[serde(rename = "avx512f+bw+vnni")]
    pub(crate) avx512f_bw_vnni: bool,
    #[serde(rename = "ssse3+pclmulqdq")]
    pub(crate) ssse3_pclmulqdq: bool,
    #[serde(rename = "gfni+avx2")]
    pub(crate) gfni_avx2: bool,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct CpuFeatures {
    pub(crate) sse2: bool,
    pub(crate) ssse3: bool,
    pub(crate) popcnt: bool,
    pub(crate) aes: bool,
    pub(crate) pclmulqdq: bool,
    pub(crate) bmi1: bool,
    pub(crate) bmi2: bool,
    pub(crate) fma: bool,
    pub(crate) sha: bool,
    pub(crate) avx2: bool,
    pub(crate) avx512f: bool,
    pub(crate) avx512bw: bool,
    pub(crate) avx512vl: bool,
    pub(crate) avx_vnni: bool,
    pub(crate) avx512vnni: bool,
    pub(crate) gfni: bool,
    pub(crate) vpclmulqdq: bool,
}

#[derive(Serialize, JsonSchema)]
pub(crate) struct CpuRuntime {
    pub(crate) open_cpu_version: &'static str,
    pub(crate) summary: String,
    pub(crate) gf_impl: String,
    pub(crate) isa_profile: String,
    pub(crate) isa_profile_raw: String,
    pub(crate) float_impl: String,
    pub(crate) bit_impl: String,
    pub(crate) avx512_opt_in: bool,
    pub(crate) cpu_vendor: String,
    pub(crate) cpu_family: String,
    pub(crate) fast_bmi2: bool,
    pub(crate) detected_but_unused: String,
    pub(crate) combination_examples: CombinationExamples,
    pub(crate) features: CpuFeatures,
    pub(crate) disclosure_ja: &'static str,
    pub(crate) disclosure_en: &'static str,
}
