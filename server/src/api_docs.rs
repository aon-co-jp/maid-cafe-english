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
    Op::post(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

fn post(path: &str, summary: &str, tag: &str) -> Op {
    Op::post(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

fn get_t<T: JsonSchema>(path: &str, summary: &str, tag: &str) -> Op {
    Op::post(path).summary(summary).tag(tag).public().ok::<T>("OK").response::<ErrorBody>(400, "入力不正")
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
        .op(get_t::<AppConfig>("/openenglish.v1.Config/Config", "アプリ設定", "system"))
        .op(get_t::<PlatformInfo>("/openenglish.v1.PlatformInfo/PlatformInfo", "実行環境の情報", "system"))
        .op(get_t::<CpuRuntime>("/openenglish.v1.CpuRuntime/CpuRuntime", "CPU実行基盤の情報", "system"))
        .op(get("/openenglish.v1.WorldLanguages/WorldLanguages", "対応する世界の言語一覧", "system"))
        .op(get("/openenglish.v1.RegionInfo/RegionInfo", "地域情報", "region").query::<LangQuery>())
        .op(get("/openenglish.v1.RegionNews/RegionNews", "地域ニュース", "region").query::<LangQuery>())
        .op(get_t::<UpdatesHistoryResponse>("/openenglish.v1.Updates/History", "アップデート履歴", "updates"))
        .op(post_t::<DowngradeResponse>("/openenglish.v1.Updates/Downgrade", "指定版へ戻す", "updates").body::<DowngradeRequest>());
    // --- aruaru-llm (admin / public proxy) ---
    let s = s
        .op(get_t::<AdminModelsResponse>("/openenglish.v1.AdminAruaruLlm/Models", "aruaru-llmのモデル一覧(管理)", "aruaru-llm"))
        .op(get("/openenglish.v1.AdminAruaruLlm/Runtime", "aruaru-llmの実行基盤(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/RecommendAndDownload", "推奨モデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/ModelsSelect", "モデルを選択(管理、aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/ModelsInstall", "モデルを導入(管理、aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/DownloadLarger", "より大きいモデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/DownloadSmaller", "より小さいモデルを取得(管理)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/QwenSelect", "Qwenを選択(管理、中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AdminAruaruLlm/QwenInstall", "Qwenを導入(管理、中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.AruaruLlm/Recommend", "推奨モデル", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.AruaruLlm/ModelsCatalog", "モデルカタログ", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AruaruLlm/ModelsSelect", "モデルを選択(公開)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.AruaruLlm/SwitchStatus", "モデル切替の状況", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AruaruLlm/Generate", "文章生成(aruaru-llmへ中継)", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.AruaruLlm/GenerateWithSearch", "検索付き文章生成", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.ChatProviders/CompletePriority", "優先順位つきチャット補完", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.ChatProviders/Active", "有効なチャット提供元", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.News/Latest", "最新ニュース", "news").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.Knowledge/Export", "知識の書き出し", "news").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(post("/openenglish.v1.Persona/Prompt", "ペルソナのプロンプト", "aruaru-llm").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get("/openenglish.v1.News/For", "国別ニュース(クエリ: country)", "news").query_param("country", true, "国").description("aruaru-llmの対応するエンドポイントのレスポンスをそのまま中継する(形状はaruaru-llmの /api/docs を参照)。"))
        .op(get_t::<ItemsResponse>("/openenglish.v1.News/ArchiveSearch", "ニュースアーカイブ検索", "news").query::<ArchiveSearchQuery>())
        .op(get("/openenglish.v1.News/Ask", "世界情勢Q&A(出典・日付つき)", "news").query_param("q", true, "質問").description("保存した報道記事から、出典と日付つきで回答する。該当が無いときは検索へのリンクを返す。"))
        .op(get("/openenglish.v1.News/Stock", "ニュース保存の状況", "news").description("ためた記事の件数、出典ごとの件数、最新の日時を返す。"))
        .op(get("/openenglish.v1.Internal/NewsExport", "ニュースの書き出し(内部)", "news").description("GitHubの公開ニュース保存庫への日次書き出し用。この端末内からのアクセスだけ受け付ける(クエリ: since=Unix秒)。"))
        .op(get("/openenglish.v1.AruaruLlm/Runtime", "実行環境の概要(公開用に整形)", "aruaru-llm").description("aruaru-llmの /v1/runtime を、公開してよい項目だけに整えて返す。"))
        .op(get("/openenglish.v1.AruaruLlm/Accelerators", "利用できる計算資源(公開用に整形)", "aruaru-llm").description("aruaru-llmの /v1/accelerators を、公開してよい項目だけに整えて返す。"))
        .op(post("/openenglish.v1.Freelance/JobSearch", "フリーランス案件の検索", "freelance").body::<PublicFreelanceJobSearchRequest>())
        .op(get("/openenglish.v1.Tts/Status", "音声合成の状態", "tts"))
        .op(post("/openenglish.v1.Tts/Tts", "音声合成", "tts").body::<tts::TtsBody>());
    // --- LINE ---
    let s = s
        .op(Op::post("/v1/line/webhook").summary("LINE Messaging APIのWebhook(署名検証あり)").tag("line").public().body_raw("application/json").response_empty(200, "受理"))
        .op(get("/v1/line/audio", "LINE向け音声", "line"))
        .op(get("/v1/line/info", "LINEボットの情報", "line"));
    // --- auth ---
    let s = s
        .op(get_t::<AuthConfig>("/openenglish.v1.Auth/ConfigGet", "認証設定の取得", "auth"))
        .op(post_t::<AuthConfigSetResponse>("/openenglish.v1.Auth/ConfigSet", "認証設定の更新", "auth").body::<SetAuthConfigRequest>())
        .op(post_t::<SentResponse>("/openenglish.v1.Auth/RequestOtp", "メールOTPを送る", "auth").body::<RequestOtpRequest>())
        .op(post_t::<SmsSentResponse>("/openenglish.v1.Auth/RequestSmsOtp", "SMSのOTPを送る", "auth").body::<RequestSmsOtpRequest>())
        .op(post("/openenglish.v1.Auth/VerifyOtp", "OTPを検証してセッションを発行", "auth").body::<VerifyOtpRequest>())
        .op(post("/openenglish.v1.Auth/QrLoginStart", "QRログインを開始", "auth"))
        .op(post_t::<OkResponse>("/openenglish.v1.Auth/QrLoginConfirm", "別端末でQRログインを確認", "auth").body::<QrLoginIdRequest>())
        .op(get_t::<ConfirmedResponse>("/openenglish.v1.Auth/QrLoginStatus", "QRログインの状態", "auth").query::<IdQuery>())
        .op(post("/openenglish.v1.Auth/QrLoginFinish", "QRログインを完了しCookieを発行", "auth").body::<QrLoginIdRequest>())
        .op(get_t::<MaskedIdentityResponse>("/openenglish.v1.Auth/QrLoginWhoami", "QRログイン確認端末の識別", "auth").query::<IdQuery>())
        .op(get_t::<SessionResponse>("/openenglish.v1.Auth/Session", "現在のセッション", "auth"))
        .op(post("/openenglish.v1.Auth/Logout", "ログアウト", "auth"))
        .op(post_t::<TotpSetupResponse>("/openenglish.v1.Auth/TotpSetup", "TOTPの設定", "auth").body::<TotpSetupRequest>())
        .op(post("/openenglish.v1.Auth/TotpVerify", "TOTPの検証", "auth").body::<TotpVerifyRequest>());
    // --- db / settings / network ---
    let s = s
        .op(get_t::<Vec<crate::db::StoredMessage>>("/openenglish.v1.Db/HistoryGet", "会話履歴の取得", "db"))
        .op(post_t::<OkResponse>("/openenglish.v1.Db/HistorySet", "会話にメッセージを追加", "db").body::<AddMessageRequest>())
        .op(post_t::<OkResponse>("/openenglish.v1.Db/HistoryClear", "会話履歴を消去", "db"))
        .op(get_t::<std::collections::HashMap<String, String>>("/openenglish.v1.Db/SettingsGet", "設定の取得", "db"))
        .op(post_t::<OkResponse>("/openenglish.v1.Db/SettingsSet", "設定を保存", "db").body::<SetSettingRequest>())
        .op(get_t::<CustomQaResponse>("/openenglish.v1.CustomQa/CustomQaGet", "カスタムQ&Aの取得", "db"))
        .op(post_t::<OkResponse>("/openenglish.v1.CustomQa/CustomQaSet", "カスタムQ&Aの保存", "db").body::<SetCustomQaRequest>())
        .op(get_t::<DbInfo>("/openenglish.v1.Db/Info", "DBの情報", "db"))
        .op(post_t::<RelocateResponse>("/openenglish.v1.Db/StoragePath", "DBの保存先を移す", "db").body::<RelocateRequest>())
        .op(get_t::<FsListResponse>("/openenglish.v1.Fs/ListDir", "ディレクトリ一覧", "db").query::<PathQuery>())
        .op(post("/openenglish.v1.Duckdns/Update", "DuckDNSを更新", "network").body::<DuckDnsUpdateRequest>())
        .op(get("/openenglish.v1.Network/Status", "ネットワーク状態", "network"))
        .op(post_t::<DetailResponse>("/openenglish.v1.Db/RsyncBackup", "rsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post_t::<RsyncAllResponse>("/openenglish.v1.Db/RsyncBackupAll", "全件のrsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post_t::<MigrateLegacyResponse>("/openenglish.v1.Db/MigrateLegacy", "旧形式の履歴を移行", "db").body::<MigrateLegacyRequest>())
        .op(post_t::<InstallRsyncResponse>("/openenglish.v1.Db/InstallRsync", "rsyncを導入", "db").body::<InstallRsyncRequest>());
    // --- agent ---
    let s = s
        .op(get_t::<ContentResponse>("/openenglish.v1.Agent/LocalRead", "ローカルファイルを読む", "agent").query::<PathQuery>())
        .op(post_t::<OkResponse>("/openenglish.v1.Agent/LocalWrite", "ローカルファイルを書く", "agent").body::<LocalWriteRequest>())
        .op(get_t::<crate::local_agent::LocalAgentStatus>("/openenglish.v1.Agent/LocalStatus", "ローカルエージェントの状態", "agent"))
        .op(get_t::<ContentResponse>("/openenglish.v1.Agent/VpsRead", "VPSファイルを読む", "agent").query::<PathQuery>())
        .op(post_t::<OkResponse>("/openenglish.v1.Agent/VpsWrite", "VPSファイルを書く", "agent").body::<VpsWriteRequest>())
        .op(get_t::<crate::vps_agent::VpsAgentStatus>("/openenglish.v1.Agent/VpsStatus", "VPSエージェントの状態", "agent"))
        .op(get_t::<GithubReadResponse>("/openenglish.v1.Agent/GithubRead", "GitHubファイルを読む", "agent").query::<GithubReadQuery>())
        .op(post_t::<GithubCommitResponse>("/openenglish.v1.Agent/GithubCommit", "GitHubへコミット", "agent").body::<GithubCommitRequest>())
        .op(get_t::<crate::github_agent::ServerModeStatus>("/openenglish.v1.Agent/GithubStatus", "GitHubエージェントの状態", "agent"))
        .op(post_t::<GithubPushResponse>("/openenglish.v1.Agent/GithubCreateAndPush", "GitHubにリポジトリを作成してpush", "agent").body::<GithubCreateAndPushRequest>());
    // --- world-lab ---
    s.op(get_t::<crate::world_lab::WorldLabStatus>("/openenglish.v1.WorldLab/Status", "world-labの状態", "world-lab"))
        .op(post_t::<PairResponse>("/openenglish.v1.WorldLab/Pair", "端末をペアリング", "world-lab").body::<WorldLabPairRequest>())
        .op(get_t::<DevicesResponse>("/openenglish.v1.WorldLab/Devices", "ペアリング済み端末", "world-lab"))
        .op(post_t::<UnpairResponse>("/openenglish.v1.WorldLab/Unpair", "ペアリング解除", "world-lab").body::<WorldLabUnpairRequest>())
        .op(post_t::<BulkPairResponse>("/openenglish.v1.WorldLab/PairBulk", "一括ペアリング", "world-lab").body::<WorldLabBulkPairRequest>())
        .op(post("/openenglish.v1.WorldLab/TaskRun", "タスクを実行", "world-lab").body::<WorldLabTaskRunRequest>())
        .op(post("/openenglish.v1.WorldLab/DispatchRequest", "配信を要求(承認待ち)", "world-lab").body::<WorldLabDispatchRequestBody>())
        .op(get_t::<PendingResponse>("/openenglish.v1.WorldLab/DispatchPending", "承認待ちの配信", "world-lab"))
        .op(post("/openenglish.v1.WorldLab/DispatchApprove", "配信を承認", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
        .op(post_t::<DenyResponse>("/openenglish.v1.WorldLab/DispatchDeny", "配信を拒否", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
}

#[cfg(test)]
mod tests {
    /// 宣言と、`app.at("/openenglish.v1....")`で登録された実ルートの食い違いを検出する
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
                    let api = path.starts_with("/openenglish.v1.") || path == "/healthz" || path == "/health";
                    let none = s.undocumented([("POST", path)]).len() == 1;
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
        assert_eq!(ok("/openenglish.v1.Auth/Session", "post"), "#/components/schemas/SessionResponse");
        assert_eq!(ok("/openenglish.v1.Db/InstallRsync", "post"), "#/components/schemas/InstallRsyncResponse");
        let params = d["paths"]["/openenglish.v1.Agent/GithubRead"]["post"]["parameters"].as_array().unwrap();
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
