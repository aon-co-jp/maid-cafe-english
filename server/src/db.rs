//! 会話履歴・設定のローカルデータベース(SQLite、2026-08-18新設)。
//!
//! ユーザー指示「open-englishのDATABASEは…円グラフと何%中の何%
//! 使用中かを表示して保存先を選択可能にしたり、保存DATABASEを移動も
//! 可能にしたり外部のGoogleドライブやUSBスティックメモリーやVPSにも
//! RSyncなどを使ってバックアップも…PCとタブレットとスマホのDATABASEを
//! 融合、同期…簡単に自動バックアップや同期が取れる事をPRして」への
//! 対応の**第一段階**。ユーザーとの相談の結果、まず会話履歴・設定を
//! 本格的なローカルデータベース(SQLite)化するところから着手する方針を
//! 確認済み。
//!
//! ## 正直な開示・今回のスコープ(重要)
//!
//! 今回実装したのは以下のみ:
//! - 会話履歴(`messages`テーブル)・設定(`settings`テーブル)の
//!   SQLite永続化と、それを読み書きするHTTP API。
//! - DBファイルの保存先パスを`OPEN_ENGLISH_DB_PATH`環境変数で変更
//!   可能にする(将来の「保存先選択」機能が土台にできるよう、既定パス
//!   決定ロジックを`OPEN_ENGLISH_SERVER_ROOT`と同じパターンで実装)。
//! - `GET /v1/db/info`でDBファイルサイズ・保存先ディスクの空き容量・
//!   総容量(使用率%算出用の生データ)を返す——**ただし実際の円グラフ
//!   表示・保存先選択UI・DBファイルの移動機能・外部(Googleドライブ/
//!   USB/VPS)へのrsyncバックップ・複数端末間の同期(重複しないマージ)
//!   は、いずれもこのコミットではまだ実装していない**。これらは
//!   このSQLite化を土台として次の増分で着手する(規模の大きい別機能
//!   群のため、一度に実装すると検証が疎かになるのを避ける)。
//! - フロントエンド(`app.js`)側は、既存の会話ログ表示に加えてこの
//!   APIへ保存する配線を追加したが、**既存の`localStorage`使用箇所
//!   (バージョン管理関連のクリーンアップ等)は置き換えていない**——
//!   会話履歴の永続化先をSQLiteへ追加しただけで、localStorage自体を
//!   廃止したわけではない。
//!
//! ## aruaru-db(PostgreSQL DUAL DB)へのオプトインミラーリング(2026-08-18)
//!
//! ユーザー再確認「SQLiteではなく、aruaru-db+できればPostgreSQLの
//! DUAL DBの方が片側にトラブルがあっても片側から自動修復する機能で
//! 安全性が高い」を受けて追加。**正直な開示(重要)**: `aruaru-db`
//! 自身が`DUAL_DATABASE_URL`環境変数経由で2つのPostgreSQLインスタンス
//! 間の自己修復ミラーリング(`DualDatabaseMirror`)を実装している
//! (`aruaru-db`側の既存機能)——このリポジトリ側で新たにDUAL DB
//! ロジックを実装したわけではない。`open-english-server`は
//! `OPEN_ENGLISH_DATABASE_URL`環境変数が設定されていれば
//! (`aruaru-llm`の`geo_content.rs`と同じ`tokio-postgres`直結パターンで)
//! そのPostgreSQLエンドポイント(`aruaru-db`が管理する冗長化構成で
//! あることを推奨)へも書き込みをミラーする、**普通のPostgreSQL
//! クライアントとして振る舞う**設計。未設定・接続失敗時はSQLiteのみで
//! 引き続き動作し続ける(既存の「サービスを止めない」方針、書き込み
//! 失敗はログに警告を出すのみでリクエスト自体は失敗させない)。
//!
//! ## DUAL同時書き込みの実装(2026-08-24追加)
//!
//! ユーザー指示「aruaru-dbとPostgreSQLの両方へ同時に書き込む機能を
//! 実装」への対応。上記2026-08-18時点の「このリポジトリ側でDUAL DB
//! ロジックを実装したわけではない」という記述は**この増分で更新される**
//! ——`open-english-server`自身が複数のミラー先へ同時書き込みできる
//! ようになった。
//!
//! - `OPEN_ENGLISH_DATABASE_URL` … 主ミラー先(従来からの互換名、
//!   `aruaru-db`を想定)。
//! - `OPEN_ENGLISH_DATABASE_URL_SECONDARY` … 副ミラー先(新設、
//!   標準PostgreSQLを想定)。
//!
//! 両方設定 → 両方へ同時書き込み(DUAL)。片方だけ → そちらのみ。
//! どちらも未設定 → SQLiteのみ(従来通り)。どちらを`aruaru-db`に
//! 割り当てても動作は同じ(どちらも普通のPostgreSQLクライアントとして
//! 接続するため)。
//!
//! **独立エラーハンドリング**: `Db::mirror_message_to_all`が各ミラー先
//! ごとに`tokio::spawn`で別タスクを起動し、それぞれの結果を個別に
//! 収集する。片方が接続不能・SQLエラーでも、もう片方の書き込みには
//! 一切影響しない(失敗した側だけが`eprintln!`でログに記録される)。
//! SQLiteが常に正の情報源であり、ミラーの失敗でHTTPリクエストが
//! 失敗することはない、という既存方針は変えていない。
//!
//! ## 自己修復(未反映キュー / outbox)の実装(2026-08-24追加)
//!
//! **2026-08-24以前の「自己修復は未実装」という記述はこの節で更新される。**
//! ユーザー指示「片方が失敗した場合、失敗した書き込みを後で自動的に
//! リトライ・補完できる仕組みを」への対応。設計は指示どおり
//! **シンプルなリトライキュー**で、分散合意やベクタークロックのような
//! 仕組みは一切導入していない。
//!
//! - ミラー書き込みが失敗すると、その1件を**ローカルSQLiteの
//!   `mirror_outbox`テーブル**へ「未反映」として記録する(SQLiteは
//!   常に正の情報源であり続けるので、キューもそこに置くのが最も安全)。
//! - 起動時に1回、その後は`OPEN_ENGLISH_MIRROR_RETRY_SECS`
//!   (既定60秒)ごとにバックグラウンドタスクが未反映行を読み出し、
//!   **元と同じミラー先(`label`で対応付け)**へ再送する。成功した行だけ
//!   キューから削除し、失敗した行は`attempts`と`last_error`を更新して
//!   残す(次回また試す)。
//! - `attempts`が`MAX_OUTBOX_ATTEMPTS`(既定100回)を超えた行は
//!   **黙って捨てず**、`give_up`フラグを立てて残す——利用者が
//!   `GET /v1/db/info`の`mirror_outbox`で件数を確認できる。
//!
//! **正直な開示・この方式の限界**: (a) 補完できるのは「このプロセスが
//! 書き込もうとして失敗した行」だけ。ミラー先で直接削除された行や、
//! open-englishが起動していない間に他経路で入った差分は検出できない
//! (`pg_dump`同士の突き合わせが必要)。(b) 再送は`INSERT`なので、
//! 「実際にはミラー先へ届いていたがACKだけ失われた」ケースでは
//! **重複行になり得る**(at-least-once)。厳密な冪等性が要る場合は
//! ミラー側にユニーク制約を張る必要がある。(c) キューはローカル
//! SQLiteファイルにあるため、そのファイルを失うとキューも失われる。
//!
//! ## TLS対応(2026-08-24追加)
//!
//! 従来は`tokio_postgres::NoTls`固定で、`sslmode=require`のマネージド
//! PostgreSQLへ接続できなかった。`tokio-postgres-rustls`(rustls 0.23)
//! を導入し、接続文字列の`sslmode`をtokio-postgres自身に解釈させる
//! 形へ変更した(`sslmode=disable`〈既定〉ならTLSハンドシェイクは
//! 発生せず従来と同じ平文接続、`require`/`verify-ca`/`verify-full`なら
//! TLSで接続する)。ルート証明書はOSのトラストストア
//! (`rustls-native-certs`)を読み、失敗した場合は`webpki-roots`
//! (Mozillaのルート集合)へフォールバックする。
//!
//! **正直な開示**: 自己署名証明書(社内VPSや`aruaru-db --tls-cert`で
//! 自前生成した証明書等)は既定では検証に失敗して接続できない。
//! その場合に限り`OPEN_ENGLISH_DB_TLS_INSECURE=1`で**証明書検証を
//! 無効化**できるが、これは中間者攻撃に対して無防備になる設定で
//! あり、信頼できる閉じたネットワーク以外では使わないこと
//! (起動時に警告ログを出す)。
//!
//! ## aruaru-db(PostgreSQL)側の同時rsyncバックアップ(2026-08-19追加)
//!
//! ユーザー指示「RSyncで、open-englishのaruaru-dbとpostgresqlを他の
//! デバイスなどにバックアップ同時を可能に」への対応。**正直な開示・
//! データ一貫性への配慮(重要)**: `aruaru-db`は独自のストレージ
//! エンジン(fjall LSM行ストア + Prolly Tree + WAL、`aruaru-db/README.md`
//! 参照)であり、稼働中のデータディレクトリを`rsync`で直接ファイル
//! コピーすると、書き込み中のファイルを中途半端な状態で複製してしまう
//! 一貫性リスクがある(PostgreSQL本体のデータディレクトリを止めずに
//! そのまま`rsync`するのが危険なのと同じ理由)。このリポジトリは
//! `aruaru-db`のデータディレクトリへ直接アクセスできる位置関係にある
//! とは限らない(`OPEN_ENGLISH_DATABASE_URL`はネットワーク越しの
//! 接続文字列であり、別ホスト上で稼働している可能性がある)ため、
//! ファイルシステムレベルの`rsync`ではなく、**標準の`pg_dump`
//! (PostgreSQLワイヤプロトコル経由、単一トランザクションのスナップ
//! ショットとして一貫性のあるダンプを取得する標準ツール)でSQL
//! ダンプファイルへ書き出した上で、そのダンプファイル1個だけを
//! `rsync`で複製する**方式を採る。これにより、稼働中の`aruaru-db`を
//! 止めずに一貫性のあるバックアップが取れる(`pg_dump`自体が
//! アプリケーション側の一時停止を必要としない設計のツールであるため)。
//! **未検証事項**: `aruaru-db`の`aruaru-wire`クレートがpgwireプロト
//! コルのどこまでを実装しているか(`pg_dump`が要求する内部カタログ
//! クエリ等に完全対応しているか)は、この開発環境に到達可能な
//! `aruaru-db`インスタンスが無いため実機検証できていない——`pg_dump`
//! が非対応のクエリを投げてエラーになった場合は、その旨をそのまま
//! エラーメッセージとして利用者へ返す(黙って成功したことにしない)。

use anyhow::{Context, Result};
use rusqlite::{Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;

/// `rsync`実行時のエラー種別。`NotInstalled`かどうかで呼び出し側
/// (`main.rs`のハンドラ)がインストール案内(bilingual message)を
/// 出すかどうかを分岐できるようにする(2026-08-18新設)。
#[derive(Debug)]
pub enum RsyncError {
    NotInstalled,
    Other(String),
}

impl std::fmt::Display for RsyncError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RsyncError::NotInstalled => write!(f, "rsync is not installed / rsyncがインストールされていません"),
            RsyncError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for RsyncError {}

pub struct Db {
    conn: Mutex<Connection>,
    /// **2026-08-18変更**: 保存先パスを実行時に変更できるよう
    /// `Mutex`化(ユーザー指示「DATA保存先は、既存の保存先でもそれ以外
    /// でも選択可能にして」への対応、`relocate`メソッド参照)。
    path: Mutex<PathBuf>,
    /// 設定されているPostgreSQLワイヤプロトコル互換のミラー先一覧
    /// (**2026-08-24のDUAL同時書き込み対応で`Option<String>`から
    /// `Vec<MirrorTarget>`へ変更**)。0個(未設定)・1個(従来通りの
    /// 単一ミラー)・2個(DUAL構成: aruaru-dbと標準PostgreSQLの両方へ
    /// 同時書き込み)のいずれも取り得る。接続自体はリクエストごとに
    /// 行う——常時接続を維持する複雑さを避けた簡易実装(従来通り)。
    mirrors: Vec<MirrorTarget>,
}

/// DUAL同時書き込みのミラー先1件(2026-08-24新設)。`label`は
/// ログ・API応答で「どちら側が失敗したか」を人間に伝えるためだけの
/// 表示名で、接続の挙動には一切影響しない。
#[derive(Debug, Clone)]
pub struct MirrorTarget {
    pub label: String,
    pub url: String,
}

/// ミラー先の環境変数を読む(2026-08-24、DUAL同時書き込み対応で
/// 複数返すよう変更)。
///
/// - `OPEN_ENGLISH_DATABASE_URL` … 主ミラー先(従来からの互換名。
///   `aruaru-db`を想定しているが、実体は普通のPostgreSQL接続文字列
///   なので標準PostgreSQLを指定しても同じように動く)。
/// - `OPEN_ENGLISH_DATABASE_URL_SECONDARY` … 副ミラー先(新設。
///   標準PostgreSQLを想定)。
///
/// 両方設定されていれば**両方へ独立して同時に書き込む**(DUAL構成)。
/// 片方だけならそちらのみ。どちらも未設定ならSQLiteのみ。
/// 接続文字列の例: `host=127.0.0.1 user=aruaru dbname=open_english`。
fn mirrors_from_env() -> Vec<MirrorTarget> {
    let mut out = Vec::new();
    for (var, label) in [
        ("OPEN_ENGLISH_DATABASE_URL", "primary (aruaru-db)"),
        ("OPEN_ENGLISH_DATABASE_URL_SECONDARY", "secondary (PostgreSQL)"),
    ] {
        if let Some(url) = std::env::var(var).ok().filter(|s| !s.trim().is_empty()) {
            out.push(MirrorTarget { label: label.to_string(), url });
        }
    }
    out
}

/// ミラー先1つへメッセージ1件を書き込む(2026-08-24、DUAL同時書き込み
/// 対応で`Result`を返すよう変更——呼び出し側が「どちらが成功し、
/// どちらが失敗したか」を個別に判定・ログできるようにするため)。
///
/// **独立エラーハンドリングの要点**: この関数は自分の接続だけを扱い、
/// 他方のミラー先の成否を一切参照しない。`add_message`は各ミラー先に
/// 対してこの関数を**別々のタスクとして**起動するため、片方が接続
/// 不能・タイムアウト・SQLエラーになっても、もう片方の書き込みは
/// そのまま完了する(SQLite側が常に正の情報源であり続ける設計は従来
/// 通りで、どちらのミラーが失敗してもHTTPリクエスト自体は成功する)。
pub async fn mirror_message_to_postgres(url: &str, role: &str, content: &str) -> Result<(), String> {
    // エラーは`source()`まで辿って文字列化する——tokio-postgresの
    // Displayは"invalid configuration"のように要約だけを返すことがあり、
    // 実際の原因(どの設定がどう悪いのか)が分からず調査に時間を要した
    // ため(2026-08-24の実機検証で判明)。
    let (client, connection) = tokio_postgres::connect(url, make_tls()).await.map_err(|e| format!("connect failed: {}", describe_error(&e)))?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("open-english: mirror connection error: {e}");
        }
    });
    client
        .execute(
            "CREATE TABLE IF NOT EXISTS open_english_messages (
                id BIGSERIAL PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )",
            &[],
        )
        .await
        .map_err(|e| format!("schema migration failed: {e}"))?;
    client
        .execute("INSERT INTO open_english_messages (role, content) VALUES ($1, $2)", &[&role, &content])
        .await
        .map_err(|e| format!("insert failed: {e}"))?;
    Ok(())
}

/// エラーを`source()`チェーンごと1行の文字列にする(2026-08-24新設)。
pub fn describe_error(e: &(dyn std::error::Error + 'static)) -> String {
    let mut out = e.to_string();
    let mut cur = e.source();
    while let Some(s) = cur {
        out.push_str(&format!(" -> {s}"));
        cur = s.source();
    }
    out
}

/// TLSコネクタを構築する(2026-08-24新設、モジュールdocのTLS節参照)。
///
/// **重要**: これを渡しても、実際にTLSハンドシェイクが起きるかどうかは
/// 接続文字列の`sslmode`をtokio-postgres自身が解釈して決める。
/// `sslmode=disable`(PostgreSQLクライアントの既定)ならTLSは使われず
/// 従来と完全に同じ平文接続になるので、TLS非対応のサーバー
/// (`aruaru-db`を平文起動している場合等)への既存の接続は壊れない。
pub fn make_tls() -> tokio_postgres_rustls::MakeRustlsConnect {
    // rustlsのCryptoProviderは1プロセスにつき1回だけ入れればよい。
    // 既に入っている場合(他クレートが先に入れた等)のErrは無視する。
    let _ = rustls::crypto::ring::default_provider().install_default();

    let insecure = std::env::var("OPEN_ENGLISH_DB_TLS_INSECURE").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);

    let config = if insecure {
        eprintln!(
            "open-english: WARNING - OPEN_ENGLISH_DB_TLS_INSECURE is set; \
             TLS certificate verification is DISABLED for DB mirror connections \
             (vulnerable to man-in-the-middle; use only on a trusted closed network) \
             / TLS証明書の検証を無効化しています(中間者攻撃に無防備)"
        );
        rustls::ClientConfig::builder().dangerous().with_custom_certificate_verifier(std::sync::Arc::new(NoCertVerifier)).with_no_client_auth()
    } else {
        let mut roots = rustls::RootCertStore::empty();
        match rustls_native_certs::load_native_certs() {
            Ok(certs) => {
                for cert in certs {
                    roots.add(cert).ok();
                }
            }
            Err(e) => eprintln!("open-english: could not load OS trust store ({e}); falling back to webpki-roots"),
        }
        if roots.is_empty() {
            roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        }
        rustls::ClientConfig::builder().with_root_certificates(roots).with_no_client_auth()
    };
    tokio_postgres_rustls::MakeRustlsConnect::new(config)
}

/// `OPEN_ENGLISH_DB_TLS_INSECURE=1`のときだけ使う、検証を一切しない
/// 証明書検証器。**通常経路では絶対に使われない**(上の`make_tls`が
/// 環境変数を見て明示的に選んだ場合のみ)。
#[derive(Debug)]
struct NoCertVerifier;

impl rustls::client::danger::ServerCertVerifier for NoCertVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider().signature_verification_algorithms.supported_schemes()
    }
}

/// 再送を諦めるまでの試行回数(モジュールdoc参照)。超えても行は
/// **削除せず**`give_up=1`を立てて残す(黙って捨てない)。
pub const MAX_OUTBOX_ATTEMPTS: i64 = 100;

/// 1回のリトライ周期で処理する最大件数(長時間ブロックしないための
/// 上限。残りは次の周期で処理される)。
const OUTBOX_BATCH: i64 = 200;

/// 未反映キューへ1件積む(2026-08-24新設)。**自前の接続を開く**
/// ——`Db`の`Mutex<Connection>`を非同期タスクへ跨がせないための
/// 意図的な設計(`await`をまたいでロックを保持しない)。
/// キューへの記録自体に失敗しても、呼び出し元の処理は止めない
/// (ログに出すのみ——SQLiteの本体書き込みは既に成功しているため)。
pub fn outbox_enqueue(db_path: &std::path::Path, label: &str, role: &str, content: &str, error: &str) {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let result = Connection::open(db_path).and_then(|conn| {
        conn.execute(
            "INSERT INTO mirror_outbox (label, role, content, created_at_unix, attempts, last_error) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
            rusqlite::params![label, role, content, now, error],
        )
    });
    match result {
        Ok(_) => eprintln!("open-english: queued 1 failed mirror write for {label} (will retry automatically)"),
        Err(e) => eprintln!("open-english: could not queue failed mirror write for {label}: {e}"),
    }
}

/// キューに溜まった未反映行を1周ぶん再送する(2026-08-24新設)。
/// 起動時に1回+`OPEN_ENGLISH_MIRROR_RETRY_SECS`ごとに呼ばれる。
/// 戻り値は`(送信成功件数, まだ失敗している件数)`。
///
/// `label`でミラー先を引き当てるため、環境変数の割り当てを入れ替えた
/// (primaryとsecondaryを逆にした等)場合、古いキュー行は対応する
/// ミラー先が見つからず**そのまま残る**——黙って別のDBへ書き込んで
/// しまうより安全side、という意図的な選択。
pub async fn outbox_retry_once(db_path: PathBuf, mirrors: Vec<MirrorTarget>) -> (usize, usize) {
    if mirrors.is_empty() {
        return (0, 0);
    }
    // 送信対象の読み出しは同期SQLite。`await`の前にスコープを閉じる。
    let pending: Vec<(i64, String, String, String)> = {
        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("open-english: outbox retry could not open DB: {e}");
                return (0, 0);
            }
        };
        let mut stmt = match conn.prepare("SELECT id, label, role, content FROM mirror_outbox WHERE give_up = 0 ORDER BY id LIMIT ?1") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("open-english: outbox retry query failed: {e}");
                return (0, 0);
            }
        };
        let rows = stmt.query_map(rusqlite::params![OUTBOX_BATCH], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)));
        match rows {
            Ok(r) => r.filter_map(|x| x.ok()).collect(),
            Err(_) => Vec::new(),
        }
    };
    if pending.is_empty() {
        return (0, 0);
    }
    let mut ok_ids: Vec<i64> = Vec::new();
    let mut fail: Vec<(i64, String)> = Vec::new();
    for (id, label, role, content) in pending {
        let Some(target) = mirrors.iter().find(|m| m.label == label) else {
            // 対応するミラー先が今の設定に無い(環境変数が変わった等)。
            // 誤って別のDBへ書き込まないよう、何もせず残す。
            continue;
        };
        match mirror_message_to_postgres(&target.url, &role, &content).await {
            Ok(()) => ok_ids.push(id),
            Err(e) => fail.push((id, e)),
        }
    }
    // 結果の反映(ここも同期SQLite、`await`はもう無い)。
    if let Ok(conn) = Connection::open(&db_path) {
        for id in &ok_ids {
            conn.execute("DELETE FROM mirror_outbox WHERE id = ?1", rusqlite::params![id]).ok();
        }
        for (id, err) in &fail {
            conn.execute(
                "UPDATE mirror_outbox SET attempts = attempts + 1, last_error = ?2, give_up = CASE WHEN attempts + 1 >= ?3 THEN 1 ELSE 0 END WHERE id = ?1",
                rusqlite::params![id, err, MAX_OUTBOX_ATTEMPTS],
            )
            .ok();
        }
    }
    if !ok_ids.is_empty() {
        eprintln!("open-english: self-repair replayed {} queued mirror write(s) successfully", ok_ids.len());
    }
    (ok_ids.len(), fail.len())
}

/// DBファイルの保存先。`OPEN_ENGLISH_DB_PATH`環境変数が最優先(将来の
/// 「保存先選択(内部ストレージ/microSD等)」機能が、この環境変数を
/// 動的に切り替える形で実装できるようにする土台)。未設定時は、
/// `OPEN_ENGLISH_SERVER_ROOT`(静的ファイル配信元、`main.rs`参照)と
/// 同じディレクトリ配下の`data/open-english.sqlite3`とする——インス
/// トール先ディレクトリに書き込み権限があることが既に前提の構成
/// (静的ファイルもそこから読むため)なのでDBファイルもそこに置く。
pub fn db_path(server_root: &std::path::Path) -> PathBuf {
    if let Ok(p) = std::env::var("OPEN_ENGLISH_DB_PATH") {
        return PathBuf::from(p);
    }
    server_root.join("data").join("open-english.sqlite3")
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).with_context(|| format!("failed to create DB directory {parent:?}"))?;
        }
        let conn = Connection::open(&path).with_context(|| format!("failed to open SQLite DB at {path:?}"))?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at_unix INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            -- 自己修復用の未反映キュー(2026-08-24新設、モジュールdoc
            -- 「自己修復(未反映キュー / outbox)」節参照)。ミラー先への
            -- 書き込みが失敗した1件をここへ積み、後でバックグラウンド
            -- タスクが同じ`label`のミラー先へ再送する。
            CREATE TABLE IF NOT EXISTS mirror_outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at_unix INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                give_up INTEGER NOT NULL DEFAULT 0
            );
            ",
        )
        .context("failed to run schema migration")?;
        Ok(Self { conn: Mutex::new(conn), path: Mutex::new(path), mirrors: mirrors_from_env() })
    }

    pub fn has_postgres_mirror(&self) -> bool {
        !self.mirrors.is_empty()
    }

    /// DUAL構成(2つ以上のミラー先が設定され、実際に同時書き込みが
    /// 行われる状態)かどうか(2026-08-24新設)。
    pub fn is_dual_mirror(&self) -> bool {
        self.mirrors.len() >= 2
    }

    /// 設定済みミラー先の表示名一覧(URL自体はパスワードを含み得るため
    /// 返さない——API応答・ログへ接続文字列を漏らさないための意図的な
    /// 設計)。
    pub fn mirror_labels(&self) -> Vec<String> {
        self.mirrors.iter().map(|m| m.label.clone()).collect()
    }

    /// 設定済みミラー先すべてへ、1件のメッセージを**同時かつ独立に**
    /// 書き込む(2026-08-24新設のDUAL同時書き込み本体)。各ミラー先を
    /// 別タスクで起動して`join`するため、片方の失敗・遅延が他方を
    /// 妨げない。戻り値は`(label, 結果)`の一覧で、呼び出し側が
    /// 部分失敗をそのまま報告できる。
    pub async fn mirror_message_to_all(mirrors: Vec<MirrorTarget>, role: String, content: String) -> Vec<(String, Result<(), String>)> {
        let handles: Vec<_> = mirrors
            .into_iter()
            .map(|m| {
                let (role, content) = (role.clone(), content.clone());
                tokio::spawn(async move {
                    let result = mirror_message_to_postgres(&m.url, &role, &content).await;
                    (m.label, result)
                })
            })
            .collect();
        let mut out = Vec::new();
        for h in handles {
            match h.await {
                Ok((label, result)) => {
                    if let Err(e) = &result {
                        // 片側の失敗はここで記録するのみ——他方の書き込み
                        // にも、HTTPリクエストの成否にも影響させない。
                        eprintln!("open-english: DB mirror write to {label} failed (other targets unaffected): {e}");
                    }
                    out.push((label, result));
                }
                Err(e) => out.push(("unknown".to_string(), Err(format!("mirror task panicked: {e}")))),
            }
        }
        out
    }

    /// ミラー先設定の複製(非同期タスクへ渡す用)。
    pub fn mirrors(&self) -> Vec<MirrorTarget> {
        self.mirrors.clone()
    }

    /// 未反映キューの件数`(pending, given_up)`(`GET /v1/db/info`用)。
    pub fn outbox_counts(&self) -> (i64, i64) {
        let conn = self.conn.lock().unwrap();
        let pending: i64 = conn.query_row("SELECT COUNT(*) FROM mirror_outbox WHERE give_up = 0", [], |r| r.get(0)).unwrap_or(0);
        let given_up: i64 = conn.query_row("SELECT COUNT(*) FROM mirror_outbox WHERE give_up = 1", [], |r| r.get(0)).unwrap_or(0);
        (pending, given_up)
    }

    pub fn path(&self) -> PathBuf {
        self.path.lock().unwrap().clone()
    }

    /// 保存先を`new_path`へ変更する(ユーザー指示「DATA保存先は、既存の
    /// 保存先でもそれ以外でも選択可能にして」への対応、2026-08-18新設)。
    /// 現在のSQLite接続を閉じ、既存DBファイルを新しい場所へコピーした
    /// 上で新しい場所を開き直す——コピー完了まで元ファイルは削除しない
    /// (コピー失敗時に元データを失わないため)。
    pub fn relocate(&self, new_path: PathBuf) -> Result<()> {
        if let Some(parent) = new_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| format!("failed to create DB directory {parent:?}"))?;
        }
        let mut conn_guard = self.conn.lock().unwrap();
        let mut path_guard = self.path.lock().unwrap();
        // 保留中のSQLiteページキャッシュをディスクへ確実に反映してから
        // ファイルをコピーする(WALモード等の未フラッシュデータの
        // 取りこぼしを防ぐ)。
        conn_guard.execute("PRAGMA wal_checkpoint(FULL)", []).ok();
        std::fs::copy(&*path_guard, &new_path).with_context(|| format!("failed to copy DB file from {:?} to {new_path:?}", *path_guard))?;
        let new_conn = Connection::open(&new_path).with_context(|| format!("failed to open relocated DB at {new_path:?}"))?;
        let old_path = path_guard.clone();
        *conn_guard = new_conn;
        *path_guard = new_path;
        drop(conn_guard);
        drop(path_guard);
        // 元ファイルは安全のため自動削除しない(ユーザー自身の判断で
        // 削除できるよう、パスをログへ出すのみに留める——誤って
        // データを失わせないための意図的な保守的挙動)。
        eprintln!("open-english: DB relocated, old file left in place at {old_path:?} (delete manually once verified)");
        Ok(())
    }

    /// `rsync`を子プロセスとして起動し、現在のDBファイルを
    /// `destination`(ローカルパス・`user@host:/path`のいずれも可、
    /// rsyncのCLI仕様通り)へ複製する(ユーザー指示「外部のGoogle
    /// ドライブやUSBスティックメモリーやVPSにもRsyncなどを使って
    /// バックアップも簡単に取れる」+「同期先もRSyncで選択可能に」への
    /// 対応、2026-08-18新設)。**正直な開示**: `rsync`本体はこのアプリに
    /// 同梱していない——利用者の環境(Linux/macOS/VPS/Android Termux等)に
    /// 既にインストールされている`rsync`をそのまま呼び出すのみ。
    /// Windows開発機のようにPATH上に`rsync`が無い環境では、その旨を
    /// 正直にエラーとして返す(黙って失敗にしない)。
    pub fn backup_via_rsync(&self, destination: &str) -> Result<String, RsyncError> {
        let path = self.path();
        let output = std::process::Command::new("rsync").arg("-a").arg(&path).arg(destination).output().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                RsyncError::NotInstalled
            } else {
                RsyncError::Other(format!("failed to launch `rsync`: {e}"))
            }
        })?;
        if output.status.success() {
            Ok(format!("rsync backup of {path:?} to {destination} succeeded"))
        } else {
            Err(RsyncError::Other(format!("rsync exited with {}: {}", output.status, String::from_utf8_lossy(&output.stderr))))
        }
    }

    /// `aruaru-db`/PostgreSQLミラー先を`pg_dump`で一貫性のあるSQL
    /// ダンプへ書き出し、そのダンプファイルを`rsync`で`destination`へ
    /// 複製する(ユーザー指示「aruaru-dbとpostgresqlも他のデバイスに
    /// 同時にバックアップ」への対応、2026-08-19新設)。**正直な開示**:
    /// モジュールdocの通り、稼働中データディレクトリの直接rsyncは
    /// 一貫性リスクがあるため採用せず、`pg_dump`(標準PostgreSQL
    /// クライアントツール、`OPEN_ENGLISH_DATABASE_URL`と同じPATH上に
    /// 存在する前提)を経由する。`OPEN_ENGLISH_DATABASE_URL`未設定
    /// (ミラー無効)の場合は`None`を返す——呼び出し側(`main.rs`)が
    /// 「対象なし」として扱う。
    ///
    /// **2026-08-24 DUAL対応**: ミラー先が2つ設定されている場合は
    /// 両方を別々のダンプファイルとして書き出し、それぞれ`rsync`する。
    /// 1つでも失敗すればその内容をエラーとして返す(成功したものは
    /// メッセージ中に併記し、黙って握り潰さない)。
    pub fn backup_postgres_via_pg_dump(&self, destination: &str) -> Option<Result<String, RsyncError>> {
        if self.mirrors.is_empty() {
            return None;
        }
        let mut successes = Vec::new();
        for (index, mirror) in self.mirrors.iter().enumerate() {
            match self.dump_and_rsync_one(&mirror.url, index, destination) {
                Ok(msg) => successes.push(format!("{}: {msg}", mirror.label)),
                Err(RsyncError::NotInstalled) => return Some(Err(RsyncError::NotInstalled)),
                Err(RsyncError::Other(e)) => {
                    return Some(Err(RsyncError::Other(format!(
                        "{} failed: {e}{}",
                        mirror.label,
                        if successes.is_empty() { String::new() } else { format!(" (succeeded before this: {})", successes.join("; ")) }
                    ))))
                }
            }
        }
        Some(Ok(successes.join("; ")))
    }

    /// ミラー先1つ分の`pg_dump` + `rsync`(上記から呼ばれるヘルパ)。
    fn dump_and_rsync_one(&self, url: &str, index: usize, destination: &str) -> Result<String, RsyncError> {
        {
            let dump_path = std::env::temp_dir().join(format!("open-english-db-dump-{}-{index}.sql", std::process::id()));
            let dump_output = std::process::Command::new("pg_dump").arg(url).arg("-f").arg(&dump_path).output().map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    RsyncError::NotInstalled
                } else {
                    RsyncError::Other(format!("failed to launch `pg_dump`: {e}"))
                }
            })?;
            if !dump_output.status.success() {
                return Err(RsyncError::Other(format!(
                    "pg_dump exited with {}: {}",
                    dump_output.status,
                    String::from_utf8_lossy(&dump_output.stderr)
                )));
            }
            let rsync_output = std::process::Command::new("rsync").arg("-a").arg(&dump_path).arg(destination).output().map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    RsyncError::NotInstalled
                } else {
                    RsyncError::Other(format!("failed to launch `rsync`: {e}"))
                }
            })?;
            std::fs::remove_file(&dump_path).ok(); // 一時ダンプファイルは複製後に削除(失敗しても致命的ではないため無視)。
            if rsync_output.status.success() {
                Ok(format!("pg_dump + rsync to {destination} succeeded"))
            } else {
                Err(RsyncError::Other(format!("rsync exited with {}: {}", rsync_output.status, String::from_utf8_lossy(&rsync_output.stderr))))
            }
        }
    }

    /// `rsync`が実際にPATH上で実行可能か(バージョン問い合わせのみ、
    /// 副作用なし)。インストール後の「本当に使えるようになったか」の
    /// 確認に使う。
    pub fn rsync_available() -> bool {
        std::process::Command::new("rsync").arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
    }

    /// このOS向けに`rsync`のインストールを試みる(ユーザー指示
    /// 「RSyncをインストールしましょう！を…表示して簡単にインストール
    /// して簡単に自動で移行する機能を搭載して」への対応、2026-08-18
    /// 新設)。利用可能なパッケージマネージャを順に試す——
    /// **正直な開示**: このアプリ自身が`rsync`のインストーラーを同梱・
    /// ダウンロードするわけではなく、各OS標準/準標準のパッケージ
    /// マネージャ(Windows: winget→choco、Linux: apt-get→dnf→pacman、
    /// macOS: brew、Android/Termux: pkg)を子プロセスとして呼び出す
    /// だけ。該当するパッケージマネージャが1つも見つからない環境
    /// (例: 素のWindows開発機でwinget/chocoともに未導入)では、その旨を
    /// 正直に返し、手動インストール手順への案内に委ねる。
    pub fn install_rsync() -> Result<String, RsyncError> {
        let candidates: &[(&str, &[&str])] = if cfg!(target_os = "windows") {
            &[("winget", &["install", "-e", "--id", "cwrsync.cwrsync", "--accept-package-agreements", "--accept-source-agreements"]), ("choco", &["install", "rsync", "-y"])]
        } else if cfg!(target_os = "macos") {
            &[("brew", &["install", "rsync"])]
        } else if std::env::var("PREFIX").map(|p| p.contains("com.termux")).unwrap_or(false) {
            &[("pkg", &["install", "-y", "rsync"])]
        } else {
            &[("apt-get", &["install", "-y", "rsync"]), ("dnf", &["install", "-y", "rsync"]), ("pacman", &["-S", "--noconfirm", "rsync"])]
        };
        let mut tried = Vec::new();
        for (cmd, args) in candidates {
            match std::process::Command::new(cmd).args(*args).output() {
                Ok(output) if output.status.success() => {
                    return Ok(format!("installed rsync via `{cmd}`"));
                }
                Ok(output) => tried.push(format!("{cmd}: exited with {} ({})", output.status, String::from_utf8_lossy(&output.stderr).trim())),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => tried.push(format!("{cmd}: not found")),
                Err(e) => tried.push(format!("{cmd}: {e}")),
            }
        }
        Err(RsyncError::Other(format!("no working package manager found for rsync install (tried: {})", tried.join("; "))))
    }

    /// 旧形式のエクスポート(メッセージ配列+設定連想配列)を新しい
    /// DATABASEシステムへ取り込む(ユーザー指示「既存の古い物から
    /// DATABASEシステムに移動も簡単にする機能」への対応、2026-08-18
    /// 新設)。**正直な開示**: このコミット時点でopen-english自体には
    /// 実際に永続化された「古いデータ」は存在しない(`app.js`は
    /// これまで会話履歴をlocalStorageへ保存していなかったことを実際に
    /// 確認済み——バージョン管理用の一部キーのみ)。そのため本関数は
    /// 実在する具体的な旧データ形式への対応ではなく、**将来どのような
    /// 旧形式のエクスポートが持ち込まれても受け入れられる汎用的な
    /// 取り込み口**として実装した(役割ID・本文の配列、キー/値設定の
    /// 連想配列という最小公倍数的な形)。戻り値は取り込んだ件数。
    pub fn import_legacy(&self, messages: &[(String, String)], settings: &[(String, String)]) -> Result<(usize, usize)> {
        for (role, content) in messages {
            self.add_message(role, content)?;
        }
        for (key, value) in settings {
            self.set_setting(key, value)?;
        }
        Ok((messages.len(), settings.len()))
    }

    /// SQLiteへ同期的に保存し、設定されているミラー先(1つでも2つでも)
    /// **すべてへ同時かつ独立に**非同期でベストエフォートミラーする
    /// (呼び出し元のエラーには影響しない、上記モジュールdoc参照)。
    pub fn add_message(&self, role: &str, content: &str) -> Result<()> {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        self.conn
            .lock()
            .unwrap()
            .execute("INSERT INTO messages (role, content, created_at_unix) VALUES (?1, ?2, ?3)", rusqlite::params![role, content, now as i64])
            .context("failed to insert message")?;
        let mirrors = self.mirrors.clone();
        if !mirrors.is_empty() {
            let role = role.to_string();
            let content = content.to_string();
            let db_path = self.path();
            tokio::spawn(async move {
                let results = Self::mirror_message_to_all(mirrors, role.clone(), content.clone()).await;
                // 失敗した分だけを未反映キューへ積む(2026-08-24、自己修復)。
                // 成功した側は何も積まない——再送時に重複させないため。
                for (label, result) in results {
                    if let Err(e) = result {
                        outbox_enqueue(&db_path, &label, &role, &content, &e);
                    }
                }
            });
        }
        Ok(())
    }

    pub fn list_messages(&self, limit: i64) -> Result<Vec<StoredMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, role, content, created_at_unix FROM messages ORDER BY id DESC LIMIT ?1")?;
        let rows = stmt.query_map(rusqlite::params![limit], |row| {
            Ok(StoredMessage { id: row.get(0)?, role: row.get(1)?, content: row.get(2)?, created_at_unix: row.get(3)? })
        })?;
        let mut out: Vec<StoredMessage> = rows.collect::<rusqlite::Result<_>>()?;
        out.reverse(); // 古い順に戻す(表示側は時系列順を期待するため)。
        Ok(out)
    }

    pub fn clear_messages(&self) -> Result<()> {
        self.conn.lock().unwrap().execute("DELETE FROM messages", []).context("failed to clear messages")?;
        Ok(())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn
            .lock()
            .unwrap()
            .execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", rusqlite::params![key, value])
            .context("failed to upsert setting")?;
        Ok(())
    }

    /// 単一設定値の取得(2026-08-26新設、auth.rsのログイン要否設定用)。
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        conn.query_row("SELECT value FROM settings WHERE key = ?1", rusqlite::params![key], |row| row.get::<_, String>(0))
            .optional()
            .context("failed to read setting")
    }

    pub fn get_all_settings(&self) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// DBファイルの容量・保存先ディスクの空き容量を返す(将来の円グラフ
    /// 表示機能向けの生データ、2026-08-18時点ではこの数値をそのまま
    /// JSONで返すのみで、円グラフ描画自体は未実装)。
    pub fn file_size_bytes(&self) -> u64 {
        std::fs::metadata(self.path()).map(|m| m.len()).unwrap_or(0)
    }
}

#[derive(Debug, Clone, serde::Serialize, schemars::JsonSchema)]
pub struct StoredMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub created_at_unix: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_and_list_messages_round_trips_in_chronological_order() {
        let dir = std::env::temp_dir().join(format!("open-english-db-test-{}", std::process::id()));
        let db = Db::open(dir.join("test.sqlite3")).unwrap();
        db.add_message("user", "hello").unwrap();
        db.add_message("trainer", "hi there").unwrap();
        let msgs = db.list_messages(10).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].content, "hello");
        assert_eq!(msgs[1].content, "hi there");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn clear_messages_removes_all_rows() {
        let dir = std::env::temp_dir().join(format!("open-english-db-test-clear-{}", std::process::id()));
        let db = Db::open(dir.join("test.sqlite3")).unwrap();
        db.add_message("user", "hello").unwrap();
        db.clear_messages().unwrap();
        assert_eq!(db.list_messages(10).unwrap().len(), 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn set_setting_upserts_by_key() {
        let dir = std::env::temp_dir().join(format!("open-english-db-test-settings-{}", std::process::id()));
        let db = Db::open(dir.join("test.sqlite3")).unwrap();
        db.set_setting("level", "beginner").unwrap();
        db.set_setting("level", "intermediate").unwrap();
        let all = db.get_all_settings().unwrap();
        assert_eq!(all, vec![("level".to_string(), "intermediate".to_string())]);
        std::fs::remove_dir_all(&dir).ok();
    }
}
