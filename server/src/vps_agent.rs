//! VPSへの自動読み書き(SSH鍵経由、2026-08-20新設)。
//!
//! ユーザー指示「VPSへの自動読み書き: SSH鍵経由。鍵はサーバー側
//! (Windows環境変数または設定ファイル)で管理し、ブラウザ側には一切
//! 送信しない」+「VPSへのSSHアクセスも、実行可能なコマンド・書き込み先
//! パスを制限する設計にすること(任意のシェルコマンドを無制限に実行
//! できるAPIにはしないこと)」への対応。
//!
//! ## セキュリティ設計(最重要)
//!
//! - 秘密鍵のパスは`OPEN_ENGLISH_VPS_SSH_KEY_PATH`環境変数で指定し、
//!   サーバープロセス(このRustバイナリ)側でのみファイルから読み込む。
//!   ブラウザ側JS(`app.js`)へ鍵の内容・パスを送信することは一切ない
//!   ——HTTP API自体が鍵を返す経路を持たない設計にしている。
//! - 接続先ホスト・ユーザー名も同様に`OPEN_ENGLISH_VPS_HOST`
//!   (`host:port`または`host`、既定ポート22)・`OPEN_ENGLISH_VPS_USER`
//!   環境変数で指定する(接続先自体をリクエストから受け取らない——
//!   利用者が誤って/悪意ある入力で無関係なホストへ接続してしまう
//!   リスクを排除)。
//! - **任意のシェルコマンド実行は一切許可しない**。このモジュールが
//!   リモートで実行するコマンドは「読み込み対象パスの`cat`」「書き込み
//!   対象パスへの`cat > <path>`(標準入力からのリダイレクト)」の
//!   2種類のみに固定し、他のコマンド名を受け付ける経路を作らない
//!   (ユーザー指示「ファイル読み書き・特定の安全なコマンドセットに
//!   限定する」への対応)。
//! - 読み書き対象パスは`OPEN_ENGLISH_VPS_ALLOWED_PATHS`環境変数
//!   (セミコロン区切りの絶対パス〈リモート側〉一覧)で許可された
//!   ディレクトリ配下に限定する。未設定・空なら常に拒否(オプトイン
//!   方式、`local_agent.rs`と同じ設計)。
//! - シェルインジェクション対策として、リモートパスをシェルの単一
//!   引用符でクォートし、パス文字列中に含まれる単一引用符自体は
//!   POSIXシェルの標準的なエスケープ手法(`'"'"'`への置換)で処理する。
//!   `..`を含むパス指定も文字列レベルで拒否する(サーバー側で正規化
//!   できないリモートパスのため、`local_agent.rs`のような
//!   `canonicalize`は使えない——文字列ベースの許可ディレクトリ前方
//!   一致+`..`拒否という保守的な二重チェックにとどめている旨を
//!   正直に明記)。

use anyhow::{bail, Context, Result};
use russh::client::{self, Handle};
use russh::keys::PrivateKeyWithHashAlg;
use russh::ChannelMsg;
use std::sync::Arc;

/// `OPEN_ENGLISH_VPS_ALLOWED_PATHS`(セミコロン区切り)から許可
/// ディレクトリ一覧(リモート側の絶対パス文字列)を読む。
fn allowed_remote_dirs() -> Vec<String> {
    std::env::var("OPEN_ENGLISH_VPS_ALLOWED_PATHS")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// リモートパスが許可ディレクトリ配下かどうかを、文字列の前方一致で
/// 判定する(**正直な開示**: リモート側ファイルシステムをこのプロセスは
/// 直接見られないため`canonicalize`のような実体パス解決はできない——
/// `..`が含まれるパスは無条件で拒否することで迂回を防ぐ、保守的な
/// 二重チェック)。
fn validate_remote_path(requested: &str) -> Result<()> {
    if requested.contains("..") {
        bail!("path must not contain '..' / パスに'..'を含めることはできません");
    }
    if !requested.starts_with('/') {
        bail!("path must be an absolute remote path starting with '/' / リモート側の絶対パス('/'始まり)を指定してください");
    }
    let allowed = allowed_remote_dirs();
    if allowed.is_empty() {
        bail!("VPS agent is disabled: set OPEN_ENGLISH_VPS_ALLOWED_PATHS to opt in / VPSエージェントは無効です(OPEN_ENGLISH_VPS_ALLOWED_PATHSで許可パスを設定してください)");
    }
    if !allowed.iter().any(|dir| requested.starts_with(dir.as_str())) {
        bail!("path {requested:?} is outside the allowed remote directories / 許可されたリモートディレクトリの範囲外です");
    }
    Ok(())
}

/// POSIXシェルの単一引用符クォート(`'`自体は`'"'"'`へ置換)。
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r#"'"'"'"#))
}

struct SshHandler;

impl client::Handler for SshHandler {
    type Error = russh::Error;

    // **2026-08-25更新**: `russh` 0.45→0.63へアップグレード
    // (RUSTSEC-2026-0153/0154、High 7.5——`russh-cryptovec`の未検査
    // アロケーション/成長処理を修正した安全なバージョンへの追従)に
    // 伴い、シグネチャが`&PublicKey`→`&PublicKeyOrCertificate`、
    // `async fn`→`fn(...) -> impl Future<...> + Send`へ変更された。
    fn check_server_key(&mut self, _server_public_key: &russh::keys::PublicKeyOrCertificate) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        // **正直な開示**: ホスト鍵の検証(known_hostsとの照合)は今回の
        // スコープでは実装していない——TOFU(Trust On First Use)すら
        // 行わず常に受理する簡易実装。実運用では中間者攻撃(MITM)への
        // 耐性が無いという既知の制約であり、`OPEN_ENGLISH_VPS_HOST`を
        // 信頼できる直接到達可能な自社VPSに限定する運用を前提としている。
        async { Ok(true) }
    }
}

struct VpsConfig {
    host: String,
    port: u16,
    user: String,
    key_path: String,
}

/// ブラウザ側UIの「SETUP済み表示」用の状態確認(2026-09-01新設)。
/// 秘密鍵のパス・内容は一切含めず、接続先ホスト・ユーザー名・許可パス
/// 一覧のみを返す(これらは秘匿情報ではなく、設定ミス確認に必要な情報)。
/// 2026-09-01新設(ユーザー指示「環境変数名は分かりにくいので固定パスへ
/// 統一して」への対応、GitHubトークンの`secrets/github-token.txt`と
/// 同じ設計): 実行ファイルと同じディレクトリの`secrets/vps-ssh-key`へ
/// 秘密鍵ファイルを置くだけで、環境変数名を覚えなくても自動的に読み
/// 込まれる。`OPEN_ENGLISH_VPS_SSH_KEY_PATH`(任意の場所を指定したい
/// 上級者向け)は引き続き優先される。
fn default_key_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let path = dir.join("secrets").join("vps-ssh-key");
    path.exists().then_some(path)
}

fn resolved_key_path() -> Option<String> {
    if let Ok(p) = std::env::var("OPEN_ENGLISH_VPS_SSH_KEY_PATH") {
        if !p.trim().is_empty() {
            return Some(p);
        }
    }
    default_key_path().map(|p| p.to_string_lossy().to_string())
}

pub fn status() -> serde_json::Value {
    let host = std::env::var("OPEN_ENGLISH_VPS_HOST").ok();
    let user = std::env::var("OPEN_ENGLISH_VPS_USER").ok();
    let has_key = resolved_key_path().is_some();
    let allowed = allowed_remote_dirs();
    let configured = host.is_some() && user.is_some() && has_key && !allowed.is_empty();
    serde_json::json!({
        "configured": configured,
        "host": host,
        "user": user,
        "allowed_paths": allowed,
    })
}

fn config_from_env() -> Result<VpsConfig> {
    let host_raw = std::env::var("OPEN_ENGLISH_VPS_HOST").context("OPEN_ENGLISH_VPS_HOST is not set")?;
    let (host, port) = match host_raw.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().context("invalid port in OPEN_ENGLISH_VPS_HOST")?),
        None => (host_raw, 22u16),
    };
    let user = std::env::var("OPEN_ENGLISH_VPS_USER").context("OPEN_ENGLISH_VPS_USER is not set")?;
    let key_path = resolved_key_path().context(
        "no SSH key found: set OPEN_ENGLISH_VPS_SSH_KEY_PATH, or place a key file at secrets/vps-ssh-key next to the server executable",
    )?;
    Ok(VpsConfig { host, port, user, key_path })
}

async fn connect(cfg: &VpsConfig) -> Result<Handle<SshHandler>> {
    let ssh_config = Arc::new(client::Config::default());
    let mut session = client::connect(ssh_config, (cfg.host.as_str(), cfg.port), SshHandler).await.context("failed to connect to VPS over SSH")?;
    let key_pair = russh::keys::load_secret_key(&cfg.key_path, None).with_context(|| format!("failed to load SSH private key from {}", cfg.key_path))?;
    // **2026-09-01修正(実機で発見した実バグ)**: `None`を渡すとRSA鍵は
    // レガシーな`ssh-rsa`(SHA-1署名)にフォールバックするが、
    // 多くの最新のsshd(このリポジトリの本番VPS含む)はセキュリティ上
    // `ssh-rsa`を無効化しており、`rsa-sha2-256`/`512`のみ受け付ける
    // ——このため実際のVPSに対して`authenticate_publickey`が常に
    // 拒否される実バグがあった(実機テストで発見)。
    // `Some(HashAlg::Sha256)`を明示することで、RSA鍵は`rsa-sha2-256`で
    // 署名するようになる(非RSA鍵ではこの指定は無視される、
    // `PrivateKeyWithHashAlg::new`の既存の仕様通り)。
    let key = PrivateKeyWithHashAlg::new(Arc::new(key_pair), Some(russh::keys::HashAlg::Sha256));
    let auth_result = session.authenticate_publickey(&cfg.user, key).await.context("SSH publickey authentication failed")?;
    if !matches!(auth_result, client::AuthResult::Success) {
        bail!("SSH authentication was rejected by the VPS / VPS側でSSH認証が拒否されました");
    }
    Ok(session)
}

/// 固定コマンド(`cat <path>`)のみを実行し、標準出力全体を返す。
/// 終了コードが0以外の場合はエラーとして扱う(黙って空文字を返さない)。
pub async fn read_file(requested_path: &str) -> Result<String> {
    validate_remote_path(requested_path)?;
    let cfg = config_from_env()?;
    let session = connect(&cfg).await?;
    let mut channel = session.channel_open_session().await.context("failed to open SSH channel")?;
    let command = format!("cat {}", shell_quote(requested_path));
    channel.exec(true, command.as_bytes()).await.context("failed to exec remote command")?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status: Option<u32> = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { ref data } => stdout.extend_from_slice(data),
            ChannelMsg::ExtendedData { ref data, .. } => stderr.extend_from_slice(data),
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Eof | ChannelMsg::Close => {}
            _ => {}
        }
    }
    match exit_status {
        Some(0) => Ok(String::from_utf8(stdout).context("remote file content is not valid UTF-8 (binary files are not supported by this endpoint)")?),
        Some(code) => bail!("remote `cat` exited with status {code}: {}", String::from_utf8_lossy(&stderr)),
        None => bail!("remote command did not report an exit status"),
    }
}

/// 固定コマンド(`cat > <path>`、標準入力からのリダイレクト)のみを実行し、
/// 内容を書き込む。
pub async fn write_file(requested_path: &str, content: &str) -> Result<()> {
    validate_remote_path(requested_path)?;
    let cfg = config_from_env()?;
    let session = connect(&cfg).await?;
    let mut channel = session.channel_open_session().await.context("failed to open SSH channel")?;
    let command = format!("cat > {}", shell_quote(requested_path));
    channel.exec(true, command.as_bytes()).await.context("failed to exec remote command")?;
    channel.data(content.as_bytes()).await.context("failed to write to remote stdin")?;
    channel.eof().await.context("failed to send EOF to remote command")?;

    let mut stderr = Vec::new();
    let mut exit_status: Option<u32> = None;
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::ExtendedData { ref data, .. } => stderr.extend_from_slice(data),
            ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
            ChannelMsg::Eof | ChannelMsg::Close => {}
            _ => {}
        }
    }
    match exit_status {
        Some(0) => Ok(()),
        Some(code) => bail!("remote write exited with status {code}: {}", String::from_utf8_lossy(&stderr)),
        None => bail!("remote command did not report an exit status"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// **2026-08-25修正**: `local_agent.rs`と同根のテストフレーク
    /// (`CLAUDE.md`2026-08-25 HANDOFF参照)。この3件も同一プロセス内
    /// グローバルな環境変数`OPEN_ENGLISH_VPS_ALLOWED_PATHS`を
    /// 並行して書き換え合っており、実機で不安定な失敗を確認したため
    /// 同じ`Mutex`直列化パターンで修正した。
    static ENV_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn rejects_paths_outside_allowed_dirs_without_env() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        std::env::remove_var("OPEN_ENGLISH_VPS_ALLOWED_PATHS");
        assert!(validate_remote_path("/etc/passwd").is_err());
    }

    #[test]
    fn rejects_dotdot_traversal() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("OPEN_ENGLISH_VPS_ALLOWED_PATHS", "/home/deploy/app");
        }
        assert!(validate_remote_path("/home/deploy/app/../../etc/passwd").is_err());
        unsafe {
            std::env::remove_var("OPEN_ENGLISH_VPS_ALLOWED_PATHS");
        }
    }

    #[test]
    fn accepts_paths_within_allowed_dir() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("OPEN_ENGLISH_VPS_ALLOWED_PATHS", "/home/deploy/app");
        }
        assert!(validate_remote_path("/home/deploy/app/src/main.rs").is_ok());
        unsafe {
            std::env::remove_var("OPEN_ENGLISH_VPS_ALLOWED_PATHS");
        }
    }

    #[test]
    fn shell_quote_escapes_single_quotes() {
        assert_eq!(shell_quote("it's a path"), r#"'it'"'"'s a path'"#);
    }
}
