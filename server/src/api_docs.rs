//! 型付きのAPI宣言(RPoemのopen-runo-openapi)。`/api/docs`・`/api/openapi.json`・
//! Cosmo互換SDL・Tauriマニフェスト・TSクライアントの元になる。
//!
//! リクエスト本文の型は、実際のハンドラが読む構造体そのもの(`super::*Request`)。
//! レスポンスはハンドラごとにアドホックな`json!`なので、共通の外枠
//! (`ok`/`error`+任意の追加フィールド)として宣言する(個別の形状は未宣言)。

use super::*;
use open_runo_poem_compat::openapi::{Operation as Op, Spec};
use schemars::JsonSchema;
use serde::Serialize;

/// 多くのエンドポイントが返すJSONの外枠。`ok`と`error`以外は
/// エンドポイントごとに異なる追加フィールドとして付く。
#[derive(Serialize, JsonSchema)]
struct Envelope {
    ok: Option<bool>,
    error: Option<String>,
    #[serde(flatten)]
    data: serde_json::Map<String, serde_json::Value>,
}

fn get(path: &str, summary: &str, tag: &str) -> Op {
    Op::get(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

fn post(path: &str, summary: &str, tag: &str) -> Op {
    Op::post(path).summary(summary).tag(tag).public().ok::<Envelope>("OK").response::<Envelope>(400, "入力不正")
}

pub fn spec() -> Spec {
    let s = Spec::new("open-english server", env!("CARGO_PKG_VERSION"))
        .description("open-englishのローカル/VPSサーバーAPI。本文の型は実装の構造体、レスポンスは共通の外枠(ok/error+追加フィールド)。");
    // --- system ---
    let s = s
        .op(get("/healthz", "生存確認", "system"))
        .op(get("/health", "生存確認(別名)", "system"))
        .op(get("/v1/config", "アプリ設定", "system"))
        .op(get("/v1/platform-info", "実行環境の情報", "system"))
        .op(get("/v1/cpu-runtime", "CPU実行基盤の情報", "system"))
        .op(get("/v1/world-languages", "対応する世界の言語一覧", "system"))
        .op(get("/v1/region-info", "地域情報(クエリで指定)", "region"))
        .op(get("/v1/region-news", "地域ニュース(クエリで指定)", "region"))
        .op(get("/v1/updates/history", "アップデート履歴", "updates"))
        .op(post("/v1/updates/downgrade", "指定版へ戻す", "updates").body::<DowngradeRequest>());
    // --- aruaru-llm (admin / public proxy) ---
    let s = s
        .op(get("/v1/admin/aruaru-llm/models", "aruaru-llmのモデル一覧(管理)", "aruaru-llm"))
        .op(get("/v1/admin/aruaru-llm/runtime", "aruaru-llmの実行基盤(管理)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/recommend-and-download", "推奨モデルを取得(管理)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/models/select", "モデルを選択(管理、aruaru-llmへ中継)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/models/install", "モデルを導入(管理、aruaru-llmへ中継)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/download-larger", "より大きいモデルを取得(管理)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/download-smaller", "より小さいモデルを取得(管理)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/qwen/select", "Qwenを選択(管理、中継)", "aruaru-llm"))
        .op(post("/v1/admin/aruaru-llm/qwen/install", "Qwenを導入(管理、中継)", "aruaru-llm"))
        .op(get("/v1/public/aruaru-llm/recommend", "推奨モデル", "aruaru-llm"))
        .op(get("/v1/public/aruaru-llm/models/catalog", "モデルカタログ", "aruaru-llm"))
        .op(post("/v1/public/aruaru-llm/models/select", "モデルを選択(公開)", "aruaru-llm"))
        .op(get("/v1/public/aruaru-llm/switch-status", "モデル切替の状況", "aruaru-llm"))
        .op(post("/v1/public/aruaru-llm/generate", "文章生成(aruaru-llmへ中継)", "aruaru-llm"))
        .op(post("/v1/public/aruaru-llm/generate-with-search", "検索付き文章生成", "aruaru-llm"))
        .op(post("/v1/public/chat-providers/complete-priority", "優先順位つきチャット補完", "aruaru-llm"))
        .op(get("/v1/public/chat-providers/active", "有効なチャット提供元", "aruaru-llm"))
        .op(get("/v1/public/news/latest", "最新ニュース", "news"))
        .op(get("/v1/public/knowledge/export", "知識の書き出し", "news"))
        .op(post("/v1/public/persona/prompt", "ペルソナのプロンプト", "aruaru-llm"))
        .op(get("/v1/public/news/for", "国別ニュース(クエリ)", "news"))
        .op(get("/v1/public/news/archive-search", "ニュースアーカイブ検索(クエリ)", "news"))
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
        .op(get("/v1/auth/config", "認証設定の取得", "auth"))
        .op(post("/v1/auth/config", "認証設定の更新", "auth").body::<SetAuthConfigRequest>())
        .op(post("/v1/auth/request-otp", "メールOTPを送る", "auth").body::<RequestOtpRequest>())
        .op(post("/v1/auth/request-sms-otp", "SMSのOTPを送る", "auth").body::<RequestSmsOtpRequest>())
        .op(post("/v1/auth/verify-otp", "OTPを検証してセッションを発行", "auth").body::<VerifyOtpRequest>())
        .op(post("/v1/auth/qr-login/start", "QRログインを開始", "auth"))
        .op(post("/v1/auth/qr-login/confirm", "別端末でQRログインを確認", "auth").body::<QrLoginIdRequest>())
        .op(get("/v1/auth/qr-login/status", "QRログインの状態(クエリ)", "auth"))
        .op(post("/v1/auth/qr-login/finish", "QRログインを完了しCookieを発行", "auth").body::<QrLoginIdRequest>())
        .op(get("/v1/auth/qr-login/whoami", "QRログイン確認端末の識別", "auth"))
        .op(get("/v1/auth/session", "現在のセッション", "auth"))
        .op(post("/v1/auth/logout", "ログアウト", "auth"))
        .op(post("/v1/auth/totp-setup", "TOTPの設定", "auth").body::<TotpSetupRequest>())
        .op(post("/v1/auth/totp-verify", "TOTPの検証", "auth").body::<TotpVerifyRequest>());
    // --- db / settings / network ---
    let s = s
        .op(get("/v1/db/history", "会話履歴の取得", "db"))
        .op(post("/v1/db/history", "会話にメッセージを追加", "db").body::<AddMessageRequest>())
        .op(post("/v1/db/history/clear", "会話履歴を消去", "db"))
        .op(get("/v1/db/settings", "設定の取得", "db"))
        .op(post("/v1/db/settings", "設定を保存", "db").body::<SetSettingRequest>())
        .op(get("/v1/custom-qa", "カスタムQ&Aの取得", "db"))
        .op(post("/v1/custom-qa", "カスタムQ&Aの保存", "db").body::<SetCustomQaRequest>())
        .op(get("/v1/db/info", "DBの情報", "db"))
        .op(post("/v1/db/storage-path", "DBの保存先を移す", "db").body::<RelocateRequest>())
        .op(get("/v1/fs/list-dir", "ディレクトリ一覧(クエリ)", "db"))
        .op(post("/v1/duckdns/update", "DuckDNSを更新", "network").body::<DuckDnsUpdateRequest>())
        .op(get("/v1/network/status", "ネットワーク状態", "network"))
        .op(post("/v1/db/rsync-backup", "rsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post("/v1/db/rsync-backup-all", "全件のrsyncバックアップ", "db").body::<RsyncBackupRequest>())
        .op(post("/v1/db/migrate-legacy", "旧形式の履歴を移行", "db").body::<MigrateLegacyRequest>())
        .op(post("/v1/db/install-rsync", "rsyncを導入", "db").body::<InstallRsyncRequest>());
    // --- agent ---
    let s = s
        .op(get("/v1/agent/local/read", "ローカルファイルを読む(クエリ)", "agent"))
        .op(post("/v1/agent/local/write", "ローカルファイルを書く", "agent").body::<LocalWriteRequest>())
        .op(get("/v1/agent/local/status", "ローカルエージェントの状態", "agent"))
        .op(get("/v1/agent/vps/read", "VPSファイルを読む(クエリ)", "agent"))
        .op(post("/v1/agent/vps/write", "VPSファイルを書く", "agent").body::<VpsWriteRequest>())
        .op(get("/v1/agent/vps/status", "VPSエージェントの状態", "agent"))
        .op(get("/v1/agent/github/read", "GitHubファイルを読む(クエリ)", "agent"))
        .op(post("/v1/agent/github/commit", "GitHubへコミット", "agent").body::<GithubCommitRequest>())
        .op(get("/v1/agent/github/status", "GitHubエージェントの状態", "agent"))
        .op(post("/v1/agent/github/create-and-push", "GitHubにリポジトリを作成してpush", "agent").body::<GithubCreateAndPushRequest>());
    // --- world-lab ---
    s.op(get("/v1/world-lab/status", "world-labの状態", "world-lab"))
        .op(post("/v1/world-lab/pair", "端末をペアリング", "world-lab").body::<WorldLabPairRequest>())
        .op(get("/v1/world-lab/devices", "ペアリング済み端末", "world-lab"))
        .op(post("/v1/world-lab/unpair", "ペアリング解除", "world-lab").body::<WorldLabUnpairRequest>())
        .op(post("/v1/world-lab/pair/bulk", "一括ペアリング", "world-lab").body::<WorldLabBulkPairRequest>())
        .op(post("/v1/world-lab/task/run", "タスクを実行", "world-lab").body::<WorldLabTaskRunRequest>())
        .op(post("/v1/world-lab/dispatch/request", "配信を要求(承認待ち)", "world-lab").body::<WorldLabDispatchRequestBody>())
        .op(get("/v1/world-lab/dispatch/pending", "承認待ちの配信", "world-lab"))
        .op(post("/v1/world-lab/dispatch/:id/approve", "配信を承認", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
        .op(post("/v1/world-lab/dispatch/:id/deny", "配信を拒否", "world-lab").body::<WorldLabDispatchTokenOnlyRequest>())
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
}
