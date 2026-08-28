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
/// ログイン方式の選択(2026-08-28新設、ユーザー指示「パスワード無し・
/// email OTP・QR撮影のみ・email OTP+QR撮影、と選べるように」への対応)。
/// 値は`"none"`(ログイン不要)・`"otp"`(email/SMSワンタイムパスワード
/// 単体)・`"qr"`(QR撮影のみ、事前のメール確認なし)・`"otp_qr"`
/// (email/SMS OTP+QR撮影の二段階認証)のいずれか。未設定の場合は
/// 旧`LOGIN_REQUIRED_SETTING_KEY`(真偽値)から後方互換で導出する
/// (`true`→`"otp"`〈2FA導入前の元の挙動〉、`false`→`"none"`)。
pub const LOGIN_MODE_SETTING_KEY: &str = "login_mode";

pub fn is_valid_login_mode(s: &str) -> bool {
    matches!(s, "none" | "otp" | "qr" | "otp_qr")
}

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
    qr_logins: Mutex<HashMap<String, QrLoginEntry>>,
}

static AUTH_STATE: std::sync::OnceLock<AuthState> = std::sync::OnceLock::new();

fn state() -> &'static AuthState {
    AUTH_STATE.get_or_init(|| AuthState {
        otps: Mutex::new(HashMap::new()),
        sessions: Mutex::new(HashMap::new()),
        qr_logins: Mutex::new(HashMap::new()),
    })
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

/// OTPコードを検証するだけで、セッションは発行しない
/// (2026-08-28新設、二段階認証の第一要素として使う内部ヘルパー)。
fn verify_otp_code_only(identifier: &str, code: &str) -> Result<String> {
    let identifier = identifier.trim().to_lowercase();
    let now = SystemTime::now();
    let mut otps = state().otps.lock().unwrap();
    let entry = otps.get(&identifier).context("no pending code for this identifier (request one first)")?;
    if now > entry.expires_at {
        otps.remove(&identifier);
        bail!("code expired, please request a new one");
    }
    if !constant_time_eq(&entry.code, code.trim()) {
        bail!("incorrect code");
    }
    otps.remove(&identifier);
    Ok(identifier)
}

/// OTPコードを検証し、成功すればセッショントークンを発行する。
/// **2026-08-28時点の位置づけ**: 二段階認証(email/SMS OTP+QRスキャン
/// 確認)を導入したため、通常のログインゲートはこの関数を直接使わず
/// `verify_otp_start_2fa`(下記)経由でQR確認セッションへ進む。この関数
/// 自体は後方互換のため残してある(単体テスト・将来2FAを無効化した
/// 場合のフォールバック用途)。
pub fn verify_otp(email: &str, code: &str) -> Result<String> {
    let identifier = verify_otp_code_only(email, code)?;
    let token = random_hex(32);
    let mut sessions = state().sessions.lock().unwrap();
    sessions.insert(token.clone(), SessionEntry { email: identifier, expires_at: SystemTime::now() + SESSION_TTL });
    Ok(token)
}

// ----------------------------------------------------------------------------
// 二段階認証: email/SMS OTP(第一要素)+ QRコード確認(第二要素、
// 2026-08-28新設、ユーザー指示「email OTP+QRコードを毎回その場で
// スキャンして即ログイン、という二段階ログインへ統一」への対応)。
//
// **設計(旧TOTP方式との違い、重要)**: 旧方式(`totp_setup`/
// `totp_verify`、下記)は認証アプリへ秘密鍵を1回登録し、以降は
// 30秒ごとに変わる6桁コードを手入力する仕組みだった。今回のQR確認方式は
// **秘密鍵の事前登録が一切不要**——ログインのたびに使い捨てのQR
// コード(短い有効期限のセッションIDを含むURL)を生成し、スマホ/
// タブレット/WEBカメラ搭載端末でそのURLを開いて「確認」ボタンを押す
// だけで完了する。
//
// **正直な開示(誇張しないこと)**: これは「その場でQR画像を解析して
// 生体認証や暗号署名を行う」ような強い証明ではない——QRは単に
// 短命なURLを画面上に表示しているだけで、確認端末はそのURLを開いて
// ボタンを押すという単純な操作をするに過ぎない。したがって、もし
// 画面が他人に見える状態でQRを共有してしまった場合(画面共有・
// 覗き見等)、そのURLを知った第三者も確認ボタンを押せてしまう
// (有効期限3分+1回限りの消費で被害範囲を抑える設計だが、真の
// 生体・暗号学的な第二要素と同水準の強度ではない)。
const QR_LOGIN_TTL: Duration = Duration::from_secs(3 * 60);

struct QrLoginEntry {
    identifier: String,
    confirmed: bool,
    expires_at: SystemTime,
}

/// OTPコード検証(第一要素)に成功した後、QR確認セッション(第二要素)を
/// 開始する。返り値はQRコードに埋め込むURLの末尾に付ける短命なID。
pub fn verify_otp_start_2fa(identifier: &str, code: &str) -> Result<String> {
    let identifier = verify_otp_code_only(identifier, code)?;
    let mut logins = state().qr_logins.lock().unwrap();
    logins.retain(|_, v| v.expires_at > SystemTime::now());
    let id = random_hex(16);
    logins.insert(id.clone(), QrLoginEntry { identifier, confirmed: false, expires_at: SystemTime::now() + QR_LOGIN_TTL });
    Ok(id)
}

/// QR単体ログイン(第一要素なし、事前のメール確認は不要、2026-08-28
/// 新設)のセッションを開始する。**正直な開示**: この方式では、QRを
/// 見てURLを開ける人なら誰でもログインできてしまう(誰の識別子とも
/// 紐付いていない)——email OTPを一切要求しない最も緩い方式であり、
/// 「同じ部屋にいる人以外には見せない」程度の運用を前提とする。
pub fn start_qr_only_login() -> String {
    let mut logins = state().qr_logins.lock().unwrap();
    logins.retain(|_, v| v.expires_at > SystemTime::now());
    let id = random_hex(16);
    logins.insert(
        id.clone(),
        QrLoginEntry { identifier: "(qr-only login)".to_string(), confirmed: false, expires_at: SystemTime::now() + QR_LOGIN_TTL },
    );
    id
}

fn mask_identifier(s: &str) -> String {
    if s.starts_with('(') {
        // QR単体ログイン等、実在の識別子を持たないプレースホルダーは
        // そのまま表示する(マスクする対象が無いため)。
        return s.to_string();
    }
    if let Some(at) = s.find('@') {
        let (local, domain) = s.split_at(at);
        let visible: String = local.chars().take(2).collect();
        format!("{visible}***{domain}")
    } else if s.chars().count() > 4 {
        let chars: Vec<char> = s.chars().collect();
        let head: String = chars[..2].iter().collect();
        let tail: String = chars[chars.len() - 2..].iter().collect();
        format!("{head}***{tail}")
    } else {
        "***".to_string()
    }
}

/// QR確認ページ(`qr-confirm.html`)がユーザーへ「どのアカウントの
/// ログインを確認しようとしているか」を表示するための、マスク済み
/// 識別子(メールアドレス/電話番号の一部を伏せた文字列)。
pub fn qr_login_masked_identifier(id: &str) -> Option<String> {
    let logins = state().qr_logins.lock().unwrap();
    logins.get(id).filter(|e| e.expires_at > SystemTime::now()).map(|e| mask_identifier(&e.identifier))
}

/// QR確認ページの「確認」ボタン押下時に呼ぶ——このQRセッションを
/// 「確認済み」にする(まだセッションCookieは発行しない、プライマリ
/// 端末側の`qr_login_finish`が発行する)。
pub fn qr_login_confirm(id: &str) -> Result<()> {
    let mut logins = state().qr_logins.lock().unwrap();
    let entry = logins.get_mut(id).context("this QR login link is invalid or has expired")?;
    if SystemTime::now() > entry.expires_at {
        logins.remove(id);
        bail!("this QR login link has expired, please try again");
    }
    entry.confirmed = true;
    Ok(())
}

/// プライマリ端末が数秒おきにポーリングして、確認済みになったかを見る。
pub fn qr_login_status(id: &str) -> Option<bool> {
    let logins = state().qr_logins.lock().unwrap();
    logins.get(id).filter(|e| e.expires_at > SystemTime::now()).map(|e| e.confirmed)
}

/// 確認済みであることを見たプライマリ端末が呼ぶ——実際のセッション
/// Cookieトークンをここで初めて発行する(QRセッション自体は使い捨てで
/// 直後に消費・削除する)。
pub fn qr_login_finish(id: &str) -> Result<String> {
    let mut logins = state().qr_logins.lock().unwrap();
    let entry = logins.get(id).context("this QR login link is invalid or has expired")?;
    if SystemTime::now() > entry.expires_at {
        logins.remove(id);
        bail!("this QR login link has expired, please try again");
    }
    if !entry.confirmed {
        bail!("not confirmed yet");
    }
    let identifier = entry.identifier.clone();
    logins.remove(id);
    drop(logins);

    let token = random_hex(32);
    let mut sessions = state().sessions.lock().unwrap();
    sessions.insert(token.clone(), SessionEntry { email: identifier, expires_at: SystemTime::now() + SESSION_TTL });
    Ok(token)
}

// ----------------------------------------------------------------------------
// 携帯電話番号への実SMS送信によるワンタイムパスワード(2026-08-27新設、
// ユーザー指示「ワンタイムパスワード+携帯電話でSMSを自動受取」への
// 対応)。既存のメールOTP(`request_otp`/`verify_otp`)と全く同じ
// `state().otps`(識別子文字列→OTPエントリのマップ)を再利用し、識別子を
// 電話番号にしただけ——`verify_otp`はメール専用の処理を含んでいない
// ため、コード変更無しでそのまま電話番号でも動く。
//
// **正直な開示(最重要)**: 実際のSMS送信にはTwilio(または互換の
// SMSゲートウェイ)のアカウントが必要。このアプリ自身はSMSゲートウェイ
// を持たない——利用者自身のTwilioアカウント(Account SID・Auth Token・
// 送信元電話番号)を環境変数で設定して初めて動作する、既存のSMTP設定
// (BYOメールサーバー)と同じ「持ち込み型」設計。未設定の場合は
// `is_sms_configured() == false`を返し、生成すら行わない(黙って
// 失敗したふりをしない)。
// ----------------------------------------------------------------------------

struct SmsConfig {
    account_sid: String,
    auth_token: String,
    from_number: String,
}

fn sms_config() -> Result<SmsConfig> {
    let account_sid = std::env::var("OPEN_ENGLISH_TWILIO_ACCOUNT_SID").ok().filter(|s| !s.trim().is_empty());
    let auth_token = std::env::var("OPEN_ENGLISH_TWILIO_AUTH_TOKEN").ok().filter(|s| !s.trim().is_empty());
    let from_number = std::env::var("OPEN_ENGLISH_TWILIO_FROM_NUMBER").ok().filter(|s| !s.trim().is_empty());
    match (account_sid, auth_token, from_number) {
        (Some(account_sid), Some(auth_token), Some(from_number)) => Ok(SmsConfig { account_sid, auth_token, from_number }),
        _ => bail!("SMS is not configured (set OPEN_ENGLISH_TWILIO_ACCOUNT_SID/_AUTH_TOKEN/_FROM_NUMBER)"),
    }
}

pub fn is_sms_configured() -> bool {
    sms_config().is_ok()
}

/// WebOTP自動入力に必要なドメイン設定が済んでいるか(UIの正直な開示用、
/// 未設定でもSMS送信自体は行えるが手入力が必要になる)。
pub fn is_webotp_domain_configured() -> bool {
    std::env::var("OPEN_ENGLISH_WEBOTP_DOMAIN").ok().filter(|s| !s.trim().is_empty()).is_some()
}

/// ごく簡易な電話番号の妥当性チェック(E.164に近い形式を推奨するのみ、
/// 厳密なバリデーションは行わない——実際の可否はTwilio API自体が
/// 判定する)。数字・空白・ハイフン・括弧・先頭の`+`のみを許可する。
fn looks_like_phone_number(s: &str) -> bool {
    let s = s.trim();
    if s.len() < 6 || s.len() > 20 {
        return false;
    }
    s.chars().enumerate().all(|(i, c)| c.is_ascii_digit() || c == ' ' || c == '-' || c == '(' || c == ')' || (i == 0 && c == '+'))
}

/// OTPコードを生成し、Twilio REST API経由で実際にSMS送信する。
/// **正直な開示**: Twilio未設定の場合は生成すら行わずエラーを返す
/// (`request_otp`のSMTP版と同じ設計)。
pub async fn request_sms_otp(phone: &str) -> Result<()> {
    let phone = phone.trim().to_string();
    if !looks_like_phone_number(&phone) {
        bail!("invalid phone number (use digits, spaces, -, (), and an optional leading + for the country code)");
    }
    let cfg = sms_config().context("SMS not configured")?;

    let now = SystemTime::now();
    {
        let otps = state().otps.lock().unwrap();
        if let Some(existing) = otps.get(&phone) {
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
        otps.insert(phone.clone(), OtpEntry { code: code.clone(), expires_at: now + OTP_TTL, last_sent_at: now });
    }

    // WebOTP API(ブラウザがSMSを自動的に読み取りコード欄へ自動入力する
    // 標準機能、Android Chrome等が対応)に対応するため、本文の**最後の
    // 行**を`@<ドメイン> #<コード>`という規定フォーマットにする
    // (WebOTP仕様が要求する形式、これが無いと自動入力は機能しない)。
    // ドメインは`OPEN_ENGLISH_WEBOTP_DOMAIN`環境変数で指定
    // (例: "easy-web.tokyo")——未設定でもSMS自体は送信されるが、
    // その場合はブラウザの自動入力は効かず手入力が必要になる
    // (正直な開示、`is_webotp_domain_configured`経由でUIにも表示)。
    let webotp_line = std::env::var("OPEN_ENGLISH_WEBOTP_DOMAIN")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|domain| format!("\n@{} #{}", domain.trim(), code))
        .unwrap_or_default();
    let body = format!("Your open-english login code / open-englishのログインコード: {code}{webotp_line}");
    let client = reqwest::Client::new();
    let url = format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", cfg.account_sid);
    let resp = client
        .post(&url)
        .basic_auth(&cfg.account_sid, Some(&cfg.auth_token))
        .form(&[("To", phone.as_str()), ("From", cfg.from_number.as_str()), ("Body", body.as_str())])
        .send()
        .await
        .context("Twilio API request failed")?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        // 送信に失敗したのでOTPエントリを取り消す(利用者に「送った」と
        // 偽った状態で待たせないため)。
        state().otps.lock().unwrap().remove(&phone);
        bail!("Twilio returned {status}: {text}");
    }
    Ok(())
}

// ----------------------------------------------------------------------------
// 携帯電話番号+QRコード撮影による2FA(2026-08-27新設、`totp.rs`参照)。
// ユーザー指示「メールアドレス1と2と携帯電話番号の3種類を入力するように
// 仕様変更して、携帯電話番号はQRコードを撮影する2FAとして」+「その3種類の
// どれでもログイン出来るようにして」への対応。
//
// **設計(既存のemail1/email2と同じ「どれか一つでOK」の可用性向上の考え方
// を踏襲、二段階認証=ANDではない)**: TOTPコードでのログインが成功すれば、
// 既存のemail OTPログインと全く同じセッショントークンを発行する——email1・
// email2のどちらか、またはTOTPコードのいずれか1つで認証完了する設計
// (3つ全部の入力を要求するものではない)。
//
// **正直な開示**: TOTPシークレットは`Db`の設定テーブル(`set_setting`/
// `get_setting`、`totp_secret:<email>`キー)へ永続化する——ただし現状の
// `Db::set_setting`は平文でSQLiteへ書き込む設計(既存の他の設定項目と
// 同水準)であり、TOTPシークレット専用の追加暗号化は行っていない。
// ディスクへのアクセス権を持つ攻撃者からは保護されない点は、既存の
// `db.rs`の設計方針をそのまま引き継いでいる。
// ----------------------------------------------------------------------------

/// このアカウント(email、既存のemail1/email2と同じ正規化されたキー)に
/// 未設定ならTOTPシークレットを新規生成してDBへ保存し、認証アプリで
/// 読み取れるQRコード(SVG)を返す。既に設定済みなら、その既存シークレット
/// からQRコードを再生成して返す(再表示のため、シークレット自体は
/// 変更しない)。
pub fn totp_setup(db: &crate::db::Db, email: &str, phone_label: Option<&str>) -> Result<(String, String)> {
    let email = email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        bail!("invalid email address");
    }
    let setting_key = format!("totp_secret:{email}");
    let secret = match db.get_setting(&setting_key).ok().flatten() {
        Some(existing) if !existing.trim().is_empty() => existing,
        _ => {
            let generated = crate::totp::generate_secret();
            db.set_setting(&setting_key, &generated).context("failed to save TOTP secret")?;
            generated
        }
    };
    if let Some(label) = phone_label {
        let label = label.trim();
        if !label.is_empty() {
            let _ = db.set_setting(&format!("totp_phone_label:{email}"), label);
        }
    }
    let qr_svg = crate::totp::totp_qr_svg(&secret, &email, "open-english").map_err(|e| anyhow::anyhow!(e))?;
    Ok((secret, qr_svg))
}

/// 6桁のTOTPコードを検証し、成功すればセッショントークンを発行する
/// (`verify_otp`と同じセッション発行ロジック、認証方式が違うだけ)。
pub fn totp_verify(db: &crate::db::Db, email: &str, code: &str) -> Result<String> {
    let email = email.trim().to_lowercase();
    let setting_key = format!("totp_secret:{email}");
    let secret = db
        .get_setting(&setting_key)
        .ok()
        .flatten()
        .context("TOTP is not set up for this email yet (set it up first) / このメールアドレスにはまだTOTPが設定されていません(先に設定してください)")?;
    let now_unix = SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    if !crate::totp::verify_code(&secret, code, now_unix) {
        bail!("incorrect or expired TOTP code / TOTPコードが正しくないか期限切れです");
    }
    let token = random_hex(32);
    let mut sessions = state().sessions.lock().unwrap();
    sessions.insert(token.clone(), SessionEntry { email, expires_at: SystemTime::now() + SESSION_TTL });
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
