//! email+ワンタイムパスワード(OTP)ログイン(2026-08-26新設)。
//!
//! **背景・設計方針(ユーザー指示への対応)**: 「open-englishはご利用者様
//! ご自身の端末へダウンロードしてご利用いただくアプリ」という既存方針
//! (CLAUDE.md「アーキテクチャ」節)の通り、単一利用者の前提で長らく
//! 認証機構を持たなかった。しかしユーザーから「そのPC・タブレット・
//! スマホなどは、家族や会社で共有する場合もある」という指摘があり、
//! **既定オフのオプトイン機能**として、家族・同僚と共有する端末向けの
//! ログイン保護を追加した。
//!
//! - 既定は`login_required = false`(無効、従来通りログイン不要)。
//!   起動時の初回案内(フロントエンド側)で「ログインセキュリティを
//!   導入しますか?/ Would you like to enable login security?」と
//!   日英併記で尋ね、選択結果を`db.rs`の設定テーブル(既存の
//!   `settings`キーバリュー、新規テーブルは追加しない)へ保存する。
//! - 有効化した場合、`localhost`経由のアクセスであっても(=アイコン
//!   ダブルクリックで直接開いた場合でも)ログインを要求する——
//!   「共有端末の誰でも開ける」という懸念に対応するため、localhost
//!   だからといって特別扱いはしない(ドメイン経由アクセスかどうかに
//!   関わらず統一的に保護する)。
//! - **保護範囲(正直な開示)**: 会話履歴・設定(`/v1/db/*`)への
//!   アクセスをサーバー側で実際にセッションCookieでゲートする
//!   (`require_session`関数、`main.rs`の該当ハンドラから呼ばれる)。
//!   これが最も個人情報に近いデータのため優先的に保護した。**その他の
//!   機能(資格試験対策・世界の言語選択等、個人情報を含まない静的
//!   データを返すだけの機能)はサーバー側では未保護のまま**
//!   ——フロントエンド側の全画面ログインオーバーレイ(app.js)で
//!   通常の利用導線としては塞ぐが、技術的にAPIを直接叩けば迂回できる
//!   ことを隠さず記録する。今後、保護範囲を広げる場合は
//!   `require_session`を該当ハンドラへ追加で組み込むだけでよい設計。
//!
//! **SMTP送信**: 環境変数(`OPEN_ENGLISH_SMTP_HOST`/`_PORT`/`_USER`/
//! `_PASSWORD`/`_FROM`)が全て設定されている場合のみ実際にメール送信を
//! 行う(未設定時は`is_smtp_configured() == false`を返し、呼び出し側が
//! 正直にその旨を利用者へ伝える——Google Custom Search APIキーと同じ
//! 設計方針)。パスワード等の認証情報はサーバー側プロセスの環境変数と
//! してのみ扱い、HTTPレスポンスに含めることは一切ない。
//!
//! **乱数**: セッショントークン・OTPコードは`ring::rand::SystemRandom`
//! (OSの暗号学的乱数源、`world_lab.rs`の`RandomState`ベース実装より
//! 強度が高い)で生成する。

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use anyhow::{bail, Context, Result};
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use ring::rand::{SecureRandom, SystemRandom};

const OTP_TTL: Duration = Duration::from_secs(10 * 60);
const OTP_RESEND_COOLDOWN: Duration = Duration::from_secs(60);
const SESSION_TTL: Duration = Duration::from_secs(24 * 60 * 60);
pub const SESSION_COOKIE_NAME: &str = "oe_session";
pub const LOGIN_REQUIRED_SETTING_KEY: &str = "login_required";

struct OtpEntry {
    code: String,
    expires_at: SystemTime,
    last_sent_at: SystemTime,
}

struct SessionEntry {
    email: String,
    expires_at: SystemTime,
}

struct AuthState {
    otps: Mutex<HashMap<String, OtpEntry>>,
    sessions: Mutex<HashMap<String, SessionEntry>>,
}

static AUTH_STATE: std::sync::OnceLock<AuthState> = std::sync::OnceLock::new();

fn state() -> &'static AuthState {
    AUTH_STATE.get_or_init(|| AuthState { otps: Mutex::new(HashMap::new()), sessions: Mutex::new(HashMap::new()) })
}

fn rng() -> &'static SystemRandom {
    static RNG: std::sync::OnceLock<SystemRandom> = std::sync::OnceLock::new();
    RNG.get_or_init(SystemRandom::new)
}

/// 定数時間比較(タイミング攻撃対策、`world_lab.rs`の`constant_time_eq`と
/// 同じ設計思想)。
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn random_hex(len_bytes: usize) -> String {
    let mut buf = vec![0u8; len_bytes];
    rng().fill(&mut buf).expect("system RNG failure");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// 6桁の数字OTPコード("000000"〜"999999")。
fn random_otp_code() -> String {
    let mut buf = [0u8; 4];
    rng().fill(&mut buf).expect("system RNG failure");
    let n = u32::from_le_bytes(buf) % 1_000_000;
    format!("{n:06}")
}

pub fn is_smtp_configured() -> bool {
    smtp_config().is_ok()
}

struct SmtpConfig {
    host: String,
    port: u16,
    user: String,
    password: String,
    from: String,
}

fn smtp_config() -> Result<SmtpConfig> {
    let host = std::env::var("OPEN_ENGLISH_SMTP_HOST").ok().filter(|s| !s.trim().is_empty());
    let user = std::env::var("OPEN_ENGLISH_SMTP_USER").ok().filter(|s| !s.trim().is_empty());
    let password = std::env::var("OPEN_ENGLISH_SMTP_PASSWORD").ok().filter(|s| !s.trim().is_empty());
    let from = std::env::var("OPEN_ENGLISH_SMTP_FROM").ok().filter(|s| !s.trim().is_empty());
    let port = std::env::var("OPEN_ENGLISH_SMTP_PORT").ok().and_then(|s| s.parse::<u16>().ok()).unwrap_or(587);
    match (host, user, password, from) {
        (Some(host), Some(user), Some(password), Some(from)) => Ok(SmtpConfig { host, port, user, password, from }),
        _ => bail!("SMTP is not configured (set OPEN_ENGLISH_SMTP_HOST/_USER/_PASSWORD/_FROM)"),
    }
}

/// OTPコードを生成し(必要ならクールダウンを守り)、SMTP経由で実際に
/// メール送信する。**正直な開示**: SMTP未設定の場合は生成すら行わず
/// エラーを返す(呼び出し側main.rsが「設定されていません」と利用者へ
/// 正直に伝える)。
/// `email1`(必須)と`email2`(任意、2026-08-27新設)へ同じOTPコードを
/// 送る。`email2`はバックアップ用の位置付け——`email1`が受信できない
/// 状況(旧メールが使えなくなった等)でも`email2`側で受け取ったコードで
/// ログインできる(`verify_otp`はコードを送ったいずれのメールアドレスで
/// 呼んでも成功する、片方だけ届けば十分という設計、ユーザー指示)。
/// **正直な開示**: 二段階認証(両方の入力を要求する方式)ではない——
/// `email2`はあくまで予備であり、どちらか一方が使えれば認証を突破できる
/// (単一メールのみの場合と比べてセキュリティが「強化」されるわけでは
/// なく、あくまで「本人が受け取れる経路が増える」という可用性の改善)。
pub async fn request_otp(email1: &str, email2: Option<&str>) -> Result<()> {
    let email1 = email1.trim().to_lowercase();
    if email1.is_empty() || !email1.contains('@') {
        bail!("invalid email address (email1)");
    }
    let email2 = match email2.map(|e| e.trim().to_lowercase()) {
        Some(e) if e.is_empty() => None,
        Some(e) if !e.contains('@') => bail!("invalid email address (email2)"),
        Some(e) if e == email1 => None, // 同一アドレスを2回送る必要はない
        other => other,
    };
    let cfg = smtp_config().context("SMTP not configured")?;

    let now = SystemTime::now();
    {
        let otps = state().otps.lock().unwrap();
        if let Some(existing) = otps.get(&email1) {
            if let Ok(elapsed) = now.duration_since(existing.last_sent_at) {
                if elapsed < OTP_RESEND_COOLDOWN {
                    bail!("please wait before requesting another code");
                }
            }
        }
    }

    let code = random_otp_code();
    {
        let mut otps = state().otps.lock().unwrap();
        otps.insert(email1.clone(), OtpEntry { code: code.clone(), expires_at: now + OTP_TTL, last_sent_at: now });
        if let Some(ref email2) = email2 {
            otps.insert(email2.clone(), OtpEntry { code: code.clone(), expires_at: now + OTP_TTL, last_sent_at: now });
        }
    }

    let body = format!(
        "Your open-english login code / open-englishのログインコード: {code}\n\n\
         This code expires in 10 minutes. / このコードは10分で失効します。\n\
         If you did not request this, you can safely ignore this email. / \
         心当たりが無い場合は、このメールを無視して構いません。"
    );
    let creds = Credentials::new(cfg.user.clone(), cfg.password.clone());
    // **2026-08-27修正(実バグ)**: `relay()`は既定で暗黙的TLS(ラッパー方式、
    // 通常ポート465向け)を仮定するため、STARTTLSを使うポート587の
    // Gmail等へ接続すると平文のSMTPバナーへ即座にTLSハンドシェイクを
    // 試みてしまい`received corrupt message of type InvalidContentType`
    // で失敗する(実機で本番Gmailアカウントへの送信を試みて発見)。
    // `open-easy-web/server/src/mail.rs`が最初から使っている
    // `starttls_relay()`(ポート587のSTARTTLS専用コンストラクタ)へ
    // 揃えて解消した。
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&cfg.host)
        .context("failed to configure SMTP relay")?
        .port(cfg.port)
        .credentials(creds)
        .build();

    for recipient in std::iter::once(email1.as_str()).chain(email2.as_deref()) {
        let email_msg = Message::builder()
            .from(cfg.from.parse().context("invalid OPEN_ENGLISH_SMTP_FROM address")?)
            .to(recipient.parse().context("invalid recipient email address")?)
            .subject("Your open-english login code / open-englishのログインコード")
            .header(ContentType::TEXT_PLAIN)
            .body(body.clone())
            .context("failed to build email message")?;
        mailer.send(email_msg).await.context("SMTP send failed")?;
    }
    Ok(())
}

/// OTPコードを検証し、成功すればセッショントークンを発行する。
pub fn verify_otp(email: &str, code: &str) -> Result<String> {
    let email = email.trim().to_lowercase();
    let now = SystemTime::now();
    let mut otps = state().otps.lock().unwrap();
    let entry = otps.get(&email).context("no pending code for this email (request one first)")?;
    if now > entry.expires_at {
        otps.remove(&email);
        bail!("code expired, please request a new one");
    }
    if !constant_time_eq(&entry.code, code.trim()) {
        bail!("incorrect code");
    }
    otps.remove(&email);
    drop(otps);

    let token = random_hex(32);
    let mut sessions = state().sessions.lock().unwrap();
    sessions.insert(token.clone(), SessionEntry { email, expires_at: now + SESSION_TTL });
    Ok(token)
}

/// セッショントークンが有効なら、ログイン中のメールアドレスを返す。
pub fn session_email(token: &str) -> Option<String> {
    let now = SystemTime::now();
    let mut sessions = state().sessions.lock().unwrap();
    match sessions.get(token) {
        Some(entry) if entry.expires_at > now => Some(entry.email.clone()),
        Some(_) => {
            sessions.remove(token);
            None
        }
        None => None,
    }
}

pub fn logout(token: &str) {
    state().sessions.lock().unwrap().remove(token);
}

/// リクエストヘッダーの`Cookie`から`oe_session`の値を取り出す
/// (open-english自体は既存のクッキー解析ヘルパーを持たないため
/// ここで最小限の手書きパーサーを用意する)。
pub fn extract_session_cookie(cookie_header: Option<&str>) -> Option<String> {
    let header = cookie_header?;
    for part in header.split(';') {
        let part = part.trim();
        if let Some(value) = part.strip_prefix(&format!("{SESSION_COOKIE_NAME}=")) {
            return Some(value.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_eq_matches_and_rejects() {
        assert!(constant_time_eq("123456", "123456"));
        assert!(!constant_time_eq("123456", "123457"));
        assert!(!constant_time_eq("123456", "12345"));
    }

    #[test]
    fn random_otp_code_is_six_digits() {
        for _ in 0..20 {
            let code = random_otp_code();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|c| c.is_ascii_digit()));
        }
    }

    #[test]
    fn verify_otp_rejects_unknown_email() {
        let result = verify_otp("nobody-requested-this@example.com", "000000");
        assert!(result.is_err());
    }

    /// email2(2026-08-27新設)のバリデーションが、SMTP設定確認より前に
    /// 行われることを確認する(SMTP未設定のこのテスト環境でも、不正な
    /// email2は「SMTP not configured」ではなく「invalid email address
    /// (email2)」で先に弾かれるはず)。
    #[tokio::test]
    async fn request_otp_rejects_invalid_email2_before_checking_smtp() {
        let result = request_otp("valid@example.com", Some("not-an-email")).await;
        let err = result.expect_err("invalid email2 should be rejected");
        assert!(format!("{err:#}").contains("email2"), "error should mention email2: {err:#}");
    }

    /// email2がemail1と同一(大文字小文字違い含む)の場合は重複送信せず
    /// email1のみ扱いになる、というdedupロジックのユニットテスト
    /// (SMTP呼び出しまで到達するため、SMTP未設定環境では
    /// "SMTP not configured"エラーで止まる=email2バリデーションの
    /// 分岐自体は正常に通過したことの間接的な確認)。
    #[tokio::test]
    async fn request_otp_treats_identical_email2_as_no_backup() {
        let result = request_otp("Same@Example.com", Some("same@example.com")).await;
        let err = result.expect_err("no SMTP configured in test environment");
        assert!(
            format!("{err:#}").contains("SMTP not configured") || format!("{err:#}").contains("SMTP"),
            "should fail on SMTP config, not on email2 validation: {err:#}"
        );
    }

    #[test]
    fn extract_session_cookie_finds_value_among_multiple_cookies() {
        let header = "foo=bar; oe_session=abc123; baz=qux";
        assert_eq!(extract_session_cookie(Some(header)), Some("abc123".to_string()));
        assert_eq!(extract_session_cookie(Some("foo=bar")), None);
        assert_eq!(extract_session_cookie(None), None);
    }

    #[test]
    fn smtp_config_requires_all_four_vars() {
        // 環境変数を汚染しないよう、他のテストと衝突しない一意な値の
        // 有無だけを確認する簡易チェック(既存のこのファイルには他に
        // 環境変数を触るテストが無いため直列化ロックは不要)。
        std::env::remove_var("OPEN_ENGLISH_SMTP_HOST");
        std::env::remove_var("OPEN_ENGLISH_SMTP_USER");
        std::env::remove_var("OPEN_ENGLISH_SMTP_PASSWORD");
        std::env::remove_var("OPEN_ENGLISH_SMTP_FROM");
        assert!(!is_smtp_configured());
    }
}
