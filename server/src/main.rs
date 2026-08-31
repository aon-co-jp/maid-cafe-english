//! open-englishの静的フロントエンドをローカルで配信するRPoemサーバー。
//!
//! 従来`python3 -m http.server`に依存していた(`README.md`/`CLAUDE.md`
//! 記載の既知の制約——file://直接オープンだと一部ブラウザが`fetch()`を
//! ブロックし、`auto-update.js`のポーリングが無効化される)。このバイナリは
//! その代替として、リポジトリ内の静的ファイル群をディスクから配信する
//! (`open_runo_poem_compat::hyper_compat::static_file_handler`、既存実装を
//! そのまま再利用——新規パーサ・新規ロジックは書いていない)。
//!
//! 実行方法: `cargo run --release`(このディレクトリで)。既定で
//! `http://127.0.0.1:4601/`を配信する(`OPEN_ENGLISH_SERVER_BIND`環境変数で
//! 上書き可)。`aruaru-llm`(既定`http://localhost:4600`)とは別ポート。

use open_runo_poem_compat::hyper_compat::static_file_handler;
use open_runo_poem_compat::{get, handler_fn, post, Request, Response, Route, StatusCode};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

mod auth;
mod component_update;
mod db;
mod github_agent;
mod local_agent;
mod self_update;
mod totp;
mod vps_agent;
mod world_lab;

use db::Db;

/// (URLパス, 実ファイル名, Content-Type)。リポジトリ直下に存在する
/// 静的アセットのみを列挙する(推測でパスを増やさない)。
const STATIC_FILES: &[(&str, &str, &str)] = &[
    ("/", "index.html", "text/html; charset=utf-8"),
    ("/index.html", "index.html", "text/html; charset=utf-8"),
    ("/facebook.html", "facebook.html", "text/html; charset=utf-8"),
    // 2026-08-27新設: クロスオリジンiframeサンドボックス保管庫
    // (`vault.html`)。単体で完結する静的ページで、GitHubトークン等の
    // 復号・外部API呼び出しをこのページ内だけで行い、親ページ
    // (index.html)へは結果URLのみをpostMessageで返す設計。**正直な
    // 開示**: 本番で真の分離効果を得るには、このパスを本体
    // (index.html)とは別オリジン(別サブドメイン等)で配信する必要が
    // ある——同一オリジンで配信している間は分離の効果は無い(詳細は
    // vault.html冒頭のコメント、CLAUDE.mdの2026-08-27エントリ参照)。
    ("/vault.html", "vault.html", "text/html; charset=utf-8"),
    // 2026-08-28新設: QRコード確認ログイン(第二要素)のページ。スマホ/
    // タブレット/WEBカメラ搭載端末で開き、「確認」ボタンを押すだけの
    // 単体完結ページ。詳細は`auth.rs`の「二段階認証」節参照。
    ("/qr-confirm.html", "qr-confirm.html", "text/html; charset=utf-8"),
    ("/style.css", "style.css", "text/css; charset=utf-8"),
    ("/app.js", "app.js", "application/javascript; charset=utf-8"),
    ("/auto-update.js", "auto-update.js", "application/javascript; charset=utf-8"),
    ("/version.json", "version.json", "application/json; charset=utf-8"),
    ("/manifest.json", "manifest.json", "application/manifest+json; charset=utf-8"),
    // 2026-08-24新設: PWAとしての「ワンタップでホーム画面に追加」
    // (Android版Chromeのインストールバナー)を有効にするための
    // Service Worker。詳細・スコープの制約は`sw.js`冒頭のコメント参照。
    // **正直な開示**: この変更はソース追加のみで、この開発機に`cargo`が
    // 無いため実バイナリの再ビルド・実配信確認はできていない
    // (`server/target/release/open-english-server.exe`は旧バイナリの
    // ままで、再ビルドされるまで`/sw.js`は配信されない)。
    ("/sw.js", "sw.js", "application/javascript; charset=utf-8"),
    ("/exam-prep-questions.json", "exam-prep-questions.json", "application/json; charset=utf-8"),
    ("/provider-free-tiers.json", "provider-free-tiers.json", "application/json; charset=utf-8"),
    ("/world-language-exams.json", "world-language-exams.json", "application/json; charset=utf-8"),
    ("/world-language-phrases.json", "world-language-phrases.json", "application/json; charset=utf-8"),
    ("/world-language-regions.json", "world-language-regions.json", "application/json; charset=utf-8"),
    ("/icons/icon-32.png", "icons/icon-32.png", "image/png"),
    ("/icons/icon-180.png", "icons/icon-180.png", "image/png"),
    ("/icons/icon-192.png", "icons/icon-192.png", "image/png"),
    ("/icons/icon-512.png", "icons/icon-512.png", "image/png"),
    ("/icons/open-english.ico", "icons/open-english.ico", "image/x-icon"),
    // 2026-08-29新設: ブラウザ内 Whisper 音声認識(P2-α、
    // docs/SPEECH_RECOGNITION_REDESIGN.md)用の ONNX モデルを同一
    // オリジンで配信する。ファイルは `models/onnx-community/whisper-base/`
    // 配下に、`fetch-whisper-model.ps1`(インストーラー同梱)または
    // 起動時の自動メンテナンス(`maybe_fetch_whisper_model`)が取得する。
    // 未取得のうちは各パスが 404 を返し、app.js は組み込みの
    // Web Speech API へフォールバックする(回帰ゼロ)。この compat
    // ルーターは可変長パスに対応しないため、transformers.js が実際に
    // 要求する固定ファイル集合を明示列挙する。
    (
        "/models/onnx-community/whisper-base/config.json",
        "models/onnx-community/whisper-base/config.json",
        "application/json; charset=utf-8",
    ),
    (
        "/models/onnx-community/whisper-base/generation_config.json",
        "models/onnx-community/whisper-base/generation_config.json",
        "application/json; charset=utf-8",
    ),
    (
        "/models/onnx-community/whisper-base/preprocessor_config.json",
        "models/onnx-community/whisper-base/preprocessor_config.json",
        "application/json; charset=utf-8",
    ),
    (
        "/models/onnx-community/whisper-base/tokenizer.json",
        "models/onnx-community/whisper-base/tokenizer.json",
        "application/json; charset=utf-8",
    ),
    (
        "/models/onnx-community/whisper-base/tokenizer_config.json",
        "models/onnx-community/whisper-base/tokenizer_config.json",
        "application/json; charset=utf-8",
    ),
    // 2026-08-29 調査反映(§3.6): WebGPU + q8 デコーダは出力が壊れるため
    // **fp32 エンコーダ + q4 デコーダのハイブリッド**を第一候補にする。
    // q8 版も後方互換・フォールバック用に配信する(app.js が見つかった
    // dtype を使う)。
    (
        "/models/onnx-community/whisper-base/onnx/encoder_model.onnx",
        "models/onnx-community/whisper-base/onnx/encoder_model.onnx",
        "application/octet-stream",
    ),
    (
        "/models/onnx-community/whisper-base/onnx/decoder_model_merged_q4.onnx",
        "models/onnx-community/whisper-base/onnx/decoder_model_merged_q4.onnx",
        "application/octet-stream",
    ),
    (
        "/models/onnx-community/whisper-base/onnx/encoder_model_quantized.onnx",
        "models/onnx-community/whisper-base/onnx/encoder_model_quantized.onnx",
        "application/octet-stream",
    ),
    (
        "/models/onnx-community/whisper-base/onnx/decoder_model_merged_quantized.onnx",
        "models/onnx-community/whisper-base/onnx/decoder_model_merged_quantized.onnx",
        "application/octet-stream",
    ),
    // Silero VAD(ONNX、v5、~2.2MB)。ブラウザ内で認識前の無音除去に使う
    // (P2-γ、docs/SPEECH_RECOGNITION_REDESIGN.md §3.6)。未取得なら app.js は
    // RMS ベースの `trimSilenceVad()` へフォールバックする。
    (
        "/models/silero-vad/model.onnx",
        "models/silero-vad/model.onnx",
        "application/octet-stream",
    ),
    // transformers.js 本体 + ONNX Runtime Web ランタイム。
    // `fetch-whisper-model.{ps1,sh}` が `vendor/` へ取得する。app.js は
    // `/vendor/transformers.min.js` を dynamic import し、ORT の wasmPaths を
    // `/vendor/ort/` に向ける。未取得なら 404 → Web Speech API へフォールバック。
    // 2026-08-29 実配信で判明: transformers.js の配布物は
    // `ort-wasm-simd-threaded.jsep.{mjs,wasm}`(JSEP 統合ビルド、WASM/WebGPU/
    // WebNN を 1 つで賄う)**のみ**を同梱しており、非 jsep 版は存在しない。
    (
        "/vendor/transformers.min.js",
        "vendor/transformers.min.js",
        "application/javascript; charset=utf-8",
    ),
    (
        "/vendor/ort/ort-wasm-simd-threaded.jsep.mjs",
        "vendor/ort/ort-wasm-simd-threaded.jsep.mjs",
        "application/javascript; charset=utf-8",
    ),
    (
        "/vendor/ort/ort-wasm-simd-threaded.jsep.wasm",
        "vendor/ort/ort-wasm-simd-threaded.jsep.wasm",
        "application/wasm",
    ),
];

/// 静的ファイルへの`HEAD`リクエスト用ハンドラ(2026-08-24新設)。
///
/// **背景・正直な開示**: 従来`STATIC_FILES`は`GET`のみ登録しており、
/// `curl -I`のようなHEADリクエストは(登録された`GET`ルートと同じ
/// パスであっても)`open_runo_router::hyper_compat::Router`が
/// メソッド不一致として`404`を返していた。多くのHTTPクライアント・
/// リバースプロキシ・ヘルスチェックツールは接続確認や更新確認に
/// `HEAD`を使うため、実用性への影響が小さくない既知のギャップ
/// だった(この節の直前のHANDOFF「静的ファイルサーバーがHEADメソッド
/// 未対応」参照)。RFC 9110 9.3.2の定義通り、`GET`と同じヘッダー
/// (`Content-Type`・`Content-Length`)を返しつつボディは送らない。
/// `open-runo-poem-compat`側に`MethodRouter::head`/`head()`が
/// 無かったため、本対応の一環として新設した(`RPoem/crates/
/// open-runo-poem-compat/src/lib.rs`参照、追加のみで既存APIは
/// 変更していない)。
fn static_file_head_handler(path: PathBuf, content_type: &'static str) -> open_runo_poem_compat::Handler {
    std::sync::Arc::new(move |_req, _params| {
        let path = path.clone();
        Box::pin(async move {
            match tokio::fs::metadata(&path).await {
                Ok(meta) => hyper::Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", content_type)
                    .header("content-length", meta.len().to_string())
                    .body(open_runo_poem_compat::fixed_body(bytes::Bytes::new()))
                    .expect("building a HEAD response from a fixed set of valid headers cannot fail"),
                Err(_) => open_runo_poem_compat::empty_status(StatusCode::NOT_FOUND),
            }
        })
    })
}

/// 静的ファイルの配信元ディレクトリ。
///
/// **正直な開示・実機テストで発覚した実バグ(2026-08-12)**: 以前は
/// 既定値をビルド時の`CARGO_MANIFEST_DIR`(コンパイルを実行した
/// マシン上のリポジトリパス)の親ディレクトリとしていたが、これは
/// GitHub Actions CIでビルドした配布用バイナリ(Windows installer/
/// Linux・macOS tarball)には全く無意味な値——CIランナー上の
/// `D:\a\open-english\open-english`や`/home/runner/work/...`が
/// バイナリに焼き込まれ、実際にインストールしたユーザーの環境には
/// そのパスは存在しないため、`index.html`等が見つからず**全ページが
/// 404になる**(Windows installer・Linux tarball実機インストールで
/// 実際に再現・確認した——ビルドはCI green、リリースも作れていたが、
/// 配布されたインストーラー自体が実際には機能しない状態だった)。
/// 実際のインストーラー/tarballのレイアウト(Windows Inno Setupの
/// `{app}`、Unix `install.sh`のインストール先)は、いずれも
/// 実行ファイルと`index.html`等を同じディレクトリへ**フラットに**
/// 配置する。このため既定値は「実行ファイルと同じディレクトリ」に
/// 変更し、そこに`index.html`が実在する場合のみ採用する。存在しない
/// 場合(開発機で`cargo run`する場合、`server/target/debug/`直下には
/// `index.html`が無い)は、開発時の便宜として`CARGO_MANIFEST_DIR`の
/// 親ディレクトリ(リポジトリルート)へフォールバックする。
/// `OPEN_ENGLISH_SERVER_ROOT`環境変数が設定されていれば常にそれを
/// 最優先する(Android版向け、2026-08-11追加——アプリの内部ストレージ
/// へ展開した静的ファイル群を指すパスを実行時に渡す必要があるため)。
fn repo_root() -> PathBuf {
    if let Ok(root) = std::env::var("OPEN_ENGLISH_SERVER_ROOT") {
        return PathBuf::from(root);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            if exe_dir.join("index.html").exists() {
                return exe_dir.to_path_buf();
            }
        }
    }
    // このバイナリは`open-english/server/`配下でビルドされる前提
    // (Cargo.tomlのpath依存が`../../RPoem/...`である通り)。
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("server/ crate must have a parent directory")
        .to_path_buf()
}

/// aruaru-llm(AI応答エンジン)をコマンド操作なしで自動起動する
/// (2026-08-19新設)。
///
/// **発端**: ユーザーがGitHub上で読んだ`README-INSTALLED.txt`には
/// 「aruaru-llmは別途手動でダウンロード・起動が必要」と書かれていたが、
/// 実際には`installer/windows/open-english.iss`の`installaruarullm`
/// タスク(既定オン)が`fetch-aruaru-llm.ps1`でaruaru-llm本体を
/// `{app}\aruaru-llm\`へ**取得済み**だった。矛盾の正体は
/// 「取得はするが起動はしない」——`fetch-aruaru-llm.ps1`はダウンロード・
/// 展開のみでプロセスは一切起動せず、インストーラーの`[Run]`セクションも
/// `open-english-server.exe`しか起動していなかったため、結局ユーザーは
/// 毎回aruaru-llm.exeを手動起動する必要があった(README-INSTALLED.txtの
/// 記述自体は「含まれていません」という部分こそ古いが、「コマンド操作が
/// 必要」という結論は皮肉にも正しかった)。
///
/// この関数は、サーバー起動時に`http://127.0.0.1:4600/healthz`へ
/// 到達できるか確認し、できなければ実行ファイルと同じディレクトリ配下の
/// `aruaru-llm\aruaru-llm.exe`(Windows)/`aruaru-llm/aruaru-llm`
/// (Linux/macOS、`installer/unix/fetch-aruaru-llm.sh`が同じ相対配置で
/// 取得する)を子プロセスとして起動する。**正直な開示**: バイナリが
/// 存在しない(「まとめてインストール」を選ばなかった、または未取得の)
/// 場合は何もしない——エラーにはせず、フロントエンド側の既存の接続状態
/// 表示(`checkHealth`)がその旨を正直にユーザーへ伝える設計に委ねる。
/// 起動した子プロセスはこのサーバープロセスの生存中にデタッチせず
/// 保持する必要は無い(`std::process::Command::spawn`後は`Child`を
/// drop——OS側でプロセス自体は起動したまま存続し続ける、Windows/Unix
/// いずれも同様)。
async fn maybe_launch_aruaru_llm() {
    let aruaru_llm_bind = std::env::var("ARUARU_LLM_BIND").unwrap_or_else(|_| "127.0.0.1:4600".to_string());
    let health_url = format!("http://{aruaru_llm_bind}/healthz");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(700))
        .build()
        .expect("building a minimal reqwest client cannot fail");
    if client.get(&health_url).send().await.is_ok() {
        println!("aruaru-llm already running at http://{aruaru_llm_bind}/ (skip auto-launch)");
        return;
    }

    let Ok(exe) = std::env::current_exe() else { return };
    let Some(exe_dir) = exe.parent() else { return };
    let binary_name = if cfg!(target_os = "windows") { "aruaru-llm.exe" } else { "aruaru-llm" };
    let candidate = exe_dir.join("aruaru-llm").join(binary_name);
    if !candidate.exists() {
        println!(
            "aruaru-llm binary not found at {} - skipping auto-launch (install it via the installer's \
             \"Also install aruaru-llm\" option, or start it manually)",
            candidate.display()
        );
        return;
    }

    match std::process::Command::new(&candidate)
        .env("ARUARU_LLM_BIND", &aruaru_llm_bind)
        .current_dir(&exe_dir.join("aruaru-llm"))
        .spawn()
    {
        Ok(child) => println!(
            "auto-launched aruaru-llm (pid {}) from {} on http://{aruaru_llm_bind}/",
            child.id(),
            candidate.display()
        ),
        Err(e) => println!("failed to auto-launch aruaru-llm from {}: {e}", candidate.display()),
    }
}

/// ブラウザ内 Whisper 音声認識(P2-α、docs/SPEECH_RECOGNITION_REDESIGN.md)用の
/// ONNX モデルが無ければ、起動時の自動メンテナンスで取得する
/// (2026-08-29新設、ユーザー指示「メンテナンスで自動インストールして」への対応)。
///
/// **正直な開示**: 取得処理は取得スクリプト(`fetch-whisper-model.ps1`
/// = Windows、`fetch-whisper-model.sh` = Linux/macOS)に委ねる
/// best-effort 処理。実行ファイルの隣、または `installer/unix/` /
/// `installer/windows/` にスクリプトを探す。既にモデルが存在する場合・
/// スクリプトが見つからない場合は何もしない。取得に失敗しても
/// open-english は組み込みの Web Speech API で動き続ける(`app.js` 側が
/// 同一オリジンの `/models/...` が 404 ならフォールバックする設計)。
async fn maybe_fetch_whisper_model() {
    let root = repo_root();
    let onnx_dir = root
        .join("models")
        .join("onnx-community")
        .join("whisper-base")
        .join("onnx");
    // ハイブリッド(fp32 encoder)か q8 版のどちらかが揃っていれば取得済み。
    if onnx_dir.join("encoder_model.onnx").exists()
        || onnx_dir.join("encoder_model_quantized.onnx").exists()
    {
        return;
    }
    let dest = root.join("models");

    #[cfg(target_os = "windows")]
    {
        let script = ["fetch-whisper-model.ps1", "installer/windows/fetch-whisper-model.ps1"]
            .iter()
            .map(|p| root.join(p))
            .find(|p| p.exists());
        let Some(script) = script else {
            println!("whisper-model auto-fetch: skipped (fetch-whisper-model.ps1 not found)");
            return;
        };
        println!("whisper-model auto-fetch: model missing, running {} -> {}", script.display(), dest.display());
        match std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .arg("-DestDir")
            .arg(&dest)
            .spawn()
        {
            Ok(child) => println!("whisper-model auto-fetch: started (pid {})", child.id()),
            Err(e) => println!("whisper-model auto-fetch: failed to start powershell: {e}"),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let script = ["fetch-whisper-model.sh", "installer/unix/fetch-whisper-model.sh"]
            .iter()
            .map(|p| root.join(p))
            .find(|p| p.exists());
        let Some(script) = script else {
            println!("whisper-model auto-fetch: skipped (fetch-whisper-model.sh not found; add the model under {}/models manually)", root.display());
            return;
        };
        println!("whisper-model auto-fetch: model missing, running {} -> {}", script.display(), dest.display());
        match std::process::Command::new("sh")
            .arg(&script)
            .arg(&dest)
            .spawn()
        {
            Ok(child) => println!("whisper-model auto-fetch: started (pid {})", child.id()),
            Err(e) => println!("whisper-model auto-fetch: failed to start sh: {e}"),
        }
    }
}

/// `self_update.rs`のロールバック用ヘルスチェックからも参照するため
/// `pub(crate)`にする(2026-08-19追加、自動ロールバック機能)。
pub(crate) fn bind_addr() -> SocketAddr {
    std::env::var("OPEN_ENGLISH_SERVER_BIND")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:4601".parse().unwrap())
}

/// `/v1/db/*`のHTTPボディを、RPoemの`Json<T>`(内部は素の`serde_json`)
/// ではなく、Rust-JSON(`../../RS-JSON`)の`from_slice_strict`/
/// `to_vec_strict`経由で読み書きする(2026-08-18、ユーザー指摘「HTTP
/// ボディ処理は対象外とはどういう事?」への対応)。**訂正した理解**:
/// Rust-JSONの`from_slice_strict<T: DeserializeOwned>`/
/// `to_vec_strict<T: Serialize>`はRPC/wire format向けの型付き入出力を
/// 明示的に想定したAPIであり(クレート自身のdoc参照)、埋め込み/静的
/// JSONファイルのパースに限定される理由は無かった——過去のHANDOFFの
/// 「対象外」判断は撤回する。RFC 8259厳密モード(`parse_strict`と同じ
/// 検証)を経由するため、挙動はRPoemの`Json<T>`(`serde_json::from_slice`
/// 直接呼び出し)と等価——検証の通り道をRust-JSON経由に変えただけで、
/// 受理するJSONの範囲自体は変わらない(正直な開示)。
async fn read_rs_json_body<T: serde::de::DeserializeOwned>(req: Request) -> Result<T, Response> {
    use http_body_util::BodyExt;
    let bytes = match req.into_body().collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => return Err(rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "failed to read request body"}))),
    };
    rust_json::from_slice_strict::<T>(&bytes)
        .map_err(|e| rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("invalid JSON body (Rust-JSON strict mode): {e}")})))
}

/// 単純な生存確認エンドポイント(2026-08-19新設、自動ロールバック機能の
/// ヘルスチェック先として`self_update.rs`が使う。既存の`aruaru-llm`側
/// `/healthz`と同じ命名に揃えた)。
async fn healthz() -> Response {
    rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true}))
}

/// デプロイ固有の設定を返すエンドポイント(2026-08-25新設)。
///
/// **背景**: `app.js`の`apiBaseEl`(aruaru-llm接続先)は、ローカルPC版の
/// 「同一LAN内のPCへ接続する」ユースケース向けに`http://<hostname>:4600`を
/// 既定値として自動補完する設計になっている。しかしVPS等のリバース
/// プロキシ配下でaruaru-llmを動かす場合、この既定値(生ポート直叩き)は
/// ファイアウォール/TLSの都合で到達できないことが多い。
/// `OPEN_ENGLISH_ARUARU_LLM_BASE_URL`環境変数が設定されている場合のみ
/// その値を返し、`app.js`側はこれを最優先の既定値として使う——未設定
/// (ローカルPC版の既定)なら`null`を返し、従来通りhostname:4600の
/// 自動補完に任せる。
async fn app_config() -> Response {
    let aruaru_llm_base_url = std::env::var("OPEN_ENGLISH_ARUARU_LLM_BASE_URL").ok();
    rs_json_response(StatusCode::OK, &serde_json::json!({"aruaru_llm_base_url": aruaru_llm_base_url}))
}

/// 実行基盤(CPU)の情報を返すエンドポイント(2026-08-22新設)。
///
/// `aruaru-llm`側に追加した実行基盤バッジ機能と同様に、このサーバーが
/// どのCPU命令セットを使える環境で動いているかをフロントエンドから
/// 確認できるようにする。検出はエコシステム共通ライブラリ
/// [`open_cpu`](https://github.com/aon-co-jp/open-cpu)へ委譲しており、
/// 内部で`OnceLock`キャッシュ済みのため毎リクエストのコストはほぼゼロ。
///
/// 【正直な開示】現時点では「検出結果を返すだけ」で、open-englishの
/// 処理そのものをこれらの命令で高速化しているわけではない。将来
/// 音声処理・行列演算等を最適化する際の判断材料として先に公開する。
async fn cpu_runtime() -> Response {
    let c = open_cpu::detect();
    let (vendor, family) = open_cpu::vendor_family();
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "open_cpu_version": open_cpu::VERSION,
            "summary": c.summary(),
            "gf_impl": format!("{:?}", open_cpu::selected_impl()),
            // --- 2026-08-23 追加: 複数命令セットの「組み合わせ」情報 ---
            // 単独フラグの羅列だけでは「AVX-512F と BW が両方揃っているか」
            // のような実際のディスパッチ条件が分からないため、open-cpu が
            // 判定した組み合わせプロファイルと各カーネルの選択実装を返す。
            "isa_profile": c.isa_profile().name(),
            "isa_profile_raw": c.isa_profile_raw().name(),
            "float_impl": open_cpu::selected_float_impl().to_string(),
            "bit_impl": open_cpu::bit_impl_summary(),
            "avx512_opt_in": open_cpu::avx512_opt_in(),
            "cpu_vendor": format!("{:?}", vendor),
            "cpu_family": format!("{family:#x}"),
            // BMI2 ビットが立っていても Zen〜Zen 2 では pext/pdep が
            // マイクロコードで遅く、スカラーの方が速い(実測 7.1 倍差)。
            "fast_bmi2": c.fast_bmi2(),
            "detected_but_unused": c.detected_but_unused().to_names(),
            "combination_examples": {
                "avx2+fma3": c.supports_all(&[open_cpu::Feature::Avx2, open_cpu::Feature::Fma]),
                "avx512f+bw+vl": c.supports_all(&[
                    open_cpu::Feature::Avx512f,
                    open_cpu::Feature::Avx512bw,
                    open_cpu::Feature::Avx512vl
                ]),
                "avx512f+bw+vnni": c.supports_all(&[
                    open_cpu::Feature::Avx512f,
                    open_cpu::Feature::Avx512bw,
                    open_cpu::Feature::Avx512vnni
                ]),
                "ssse3+pclmulqdq": c.supports_all(&[
                    open_cpu::Feature::Ssse3,
                    open_cpu::Feature::Pclmulqdq
                ]),
                "gfni+avx2": c.supports_all(&[open_cpu::Feature::Gfni, open_cpu::Feature::Avx2])
            },
            "features": {
                "sse2": c.sse2,
                "ssse3": c.ssse3,
                "popcnt": c.popcnt,
                "aes": c.aes,
                "pclmulqdq": c.pclmulqdq,
                "bmi1": c.bmi1,
                "bmi2": c.bmi2,
                "fma": c.fma,
                "sha": c.sha,
                "avx2": c.avx2,
                "avx512f": c.avx512f,
                "avx512bw": c.avx512bw,
                "avx512vl": c.avx512vl,
                "avx_vnni": c.avx_vnni,
                "avx512vnni": c.avx512vnni,
                "gfni": c.gfni,
                "vpclmulqdq": c.vpclmulqdq
            },
            // 誇張しないための明示。
            "disclosure_ja": "このエンドポイントはCPU命令セットの検出結果を報告するだけで、open-english本体の処理(チャット応答・学習機能)はCPU集約的な演算を持たないため、現時点でSIMD高速化の適用先は無い。実際に高速化されているのは open-raid-z のGF(2^8)演算、open-cuda/aruaru-llm のCPU推論、open-cg-cad の断面積微分。",
            "disclosure_en": "This endpoint only reports detected CPU features. open-english itself has no CPU-bound hot loop, so no SIMD path is applied here yet; the actual accelerated consumers are open-raid-z (GF(2^8)), open-cuda/aruaru-llm (CPU inference) and open-cg-cad."
        }),
    )
}

fn rs_json_response(status: StatusCode, value: &impl serde::Serialize) -> Response {
    let body = rust_json::to_vec_strict(value).unwrap_or_else(|_| b"{}".to_vec());
    hyper::Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(body)))
        .expect("building a response from a fixed set of valid headers cannot fail")
}

#[derive(serde::Deserialize)]
struct AddMessageRequest {
    role: String,
    content: String,
}

async fn db_add_message(req: Request, db: Arc<Db>) -> Response {
    let body: AddMessageRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match db.add_message(&body.role, &body.content) {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

async fn db_list_messages(db: Arc<Db>) -> Response {
    match db.list_messages(500) {
        Ok(msgs) => rs_json_response(StatusCode::OK, &msgs),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

async fn db_clear_messages(db: Arc<Db>) -> Response {
    match db.clear_messages() {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

#[derive(serde::Deserialize)]
struct SetSettingRequest {
    key: String,
    value: String,
}

async fn db_set_setting(req: Request, db: Arc<Db>) -> Response {
    let body: SetSettingRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match db.set_setting(&body.key, &body.value) {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

async fn db_get_settings(db: Arc<Db>) -> Response {
    match db.get_all_settings() {
        Ok(pairs) => {
            let map: std::collections::HashMap<String, String> = pairs.into_iter().collect();
            rs_json_response(StatusCode::OK, &map)
        }
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

/// ログイン保護の現在の設定を返す(2026-08-26新設、auth.rsモジュール
/// doc参照)。`login_required`はDB設定(既定false)、`smtp_configured`は
/// 環境変数の有無から判定する(実際にメール送信が可能かどうかの正直な
/// 開示)。
/// 現在有効なログイン方式を返す(2026-08-28新設)。`login_mode`設定が
/// あればそれを使い、無ければ旧`login_required`真偽値から後方互換で
/// 導出する(`auth::LOGIN_MODE_SETTING_KEY`のdoc参照)。
fn login_mode(db: &Db) -> String {
    if let Ok(Some(m)) = db.get_setting(auth::LOGIN_MODE_SETTING_KEY) {
        if auth::is_valid_login_mode(&m) {
            return m;
        }
    }
    let legacy = db.get_setting(auth::LOGIN_REQUIRED_SETTING_KEY).ok().flatten().map(|v| v == "true").unwrap_or(false);
    if legacy { "otp".to_string() } else { "none".to_string() }
}

async fn auth_config(db: Arc<Db>) -> Response {
    let mode = login_mode(&db);
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "login_mode": mode,
            "login_required": mode != "none",
            "smtp_configured": auth::is_smtp_configured(),
            "sms_configured": auth::is_sms_configured(),
            "webotp_domain_configured": auth::is_webotp_domain_configured(),
        }),
    )
}

#[derive(serde::Deserialize)]
struct SetAuthConfigRequest {
    /// 新方式(2026-08-28新設): `"none"`/`"otp"`/`"qr"`/`"otp_qr"`のいずれか。
    #[serde(default)]
    login_mode: Option<String>,
    /// 旧方式との後方互換用(`login_mode`未指定時のみ参照、`true`→`"otp"`)。
    #[serde(default)]
    login_required: Option<bool>,
}

async fn auth_set_config(req: Request, db: Arc<Db>) -> Response {
    let body: SetAuthConfigRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let mode = match (&body.login_mode, body.login_required) {
        (Some(m), _) => {
            if !auth::is_valid_login_mode(m) {
                return rs_json_response(
                    StatusCode::BAD_REQUEST,
                    &serde_json::json!({"error": "login_mode must be one of: none, otp, qr, otp_qr"}),
                );
            }
            m.clone()
        }
        (None, Some(true)) => "otp".to_string(),
        (None, Some(false)) => "none".to_string(),
        (None, None) => {
            return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "login_mode or login_required is required"}))
        }
    };
    if let Err(e) = db.set_setting(auth::LOGIN_MODE_SETTING_KEY, &mode) {
        return rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()}));
    }
    // 旧クライアント/旧設定読み取りとの整合のため、真偽値も併せて更新する。
    let _ = db.set_setting(auth::LOGIN_REQUIRED_SETTING_KEY, if mode != "none" { "true" } else { "false" });
    rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "login_mode": mode, "login_required": mode != "none"}))
}

#[derive(serde::Deserialize)]
struct RequestOtpRequest {
    email: String,
    /// バックアップ用の2つ目のメールアドレス(任意、2026-08-27新設)。
    /// 指定すると同じOTPコードが両方へ送られ、どちらか一方で
    /// `verify_otp`できる(`auth::request_otp`のdoc参照)。
    #[serde(default)]
    email2: Option<String>,
}

async fn auth_request_otp(req: Request) -> Response {
    let body: RequestOtpRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !auth::is_smtp_configured() {
        return rs_json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            &serde_json::json!({
                "error": "SMTP is not configured on this server. Set OPEN_ENGLISH_SMTP_HOST/_PORT/_USER/_PASSWORD/_FROM. / このサーバーではSMTPが未設定です。OPEN_ENGLISH_SMTP_HOST/_PORT/_USER/_PASSWORD/_FROMを設定してください。"
            }),
        );
    }
    match auth::request_otp(&body.email, body.email2.as_deref()).await {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"sent": true})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("{e:#}")})),
    }
}

#[derive(serde::Deserialize)]
struct RequestSmsOtpRequest {
    phone: String,
}

/// `POST /v1/auth/request-sms-otp`(2026-08-27新設、ユーザー指示
/// 「ワンタイムパスワード+携帯電話でSMSを自動受取」への対応)。
/// 検証は既存の`/v1/auth/verify-otp`をそのまま流用する(`auth::
/// verify_otp`はメール専用の処理を含まない、識別子文字列とコードの
/// 照合のみのため、電話番号をそのまま渡せば動く——新しい検証
/// エンドポイントは追加していない)。
async fn auth_request_sms_otp(req: Request) -> Response {
    let body: RequestSmsOtpRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !auth::is_sms_configured() {
        return rs_json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            &serde_json::json!({
                "error": "SMS is not configured on this server. Set OPEN_ENGLISH_TWILIO_ACCOUNT_SID/_AUTH_TOKEN/_FROM_NUMBER. / このサーバーではSMSが未設定です。OPEN_ENGLISH_TWILIO_ACCOUNT_SID/_AUTH_TOKEN/_FROM_NUMBERを設定してください。"
            }),
        );
    }
    match auth::request_sms_otp(&body.phone).await {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"sent": true, "webotp_domain_configured": auth::is_webotp_domain_configured()})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("{e:#}")})),
    }
}

#[derive(serde::Deserialize)]
struct VerifyOtpRequest {
    email: String,
    code: String,
}

fn request_host_scheme(req: &Request) -> (String, &'static str) {
    let host = req.headers().get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost").to_string();
    let scheme =
        if req.headers().get("x-forwarded-proto").and_then(|v| v.to_str().ok()) == Some("https") { "https" } else { "http" };
    (host, scheme)
}

/// QR確認セッションの開始レスポンスを組み立てる共通ヘルパー
/// (2026-08-28新設、`otp_qr`モード・`qr`モードの両方から使う)。
fn qr_login_start_response(host: &str, scheme: &str, qr_login_id: String) -> Response {
    let confirm_url = format!("{scheme}://{host}/qr-confirm.html?id={qr_login_id}");
    match totp::text_qr_svg(&confirm_url) {
        Ok(qr_svg) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "ok": true,
                "second_factor_required": true,
                "qr_login_id": qr_login_id,
                "qr_svg": qr_svg,
                "confirm_url": confirm_url,
            }),
        ),
        Err(e) => {
            rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": format!("failed to generate QR code: {e}")}))
        }
    }
}

/// `POST /v1/auth/verify-otp`(2026-08-28変更: ログイン方式選択に対応)。
/// `login_mode`設定に応じて挙動が変わる: `"otp"`なら従来通りコード検証
/// 成功時に即セッションCookieを発行、`"otp_qr"`ならコード検証は第一要素に
/// 過ぎず、続けてQRコード確認(第二要素)が必要——QR確認用のセッションID・
/// QRコードSVG・確認用URLを返す(このリクエストのHostヘッダーから絶対
/// URLを組み立てる、スマホ/タブレット/別端末で開ける必要があるため相対
/// パスでは不十分)。
async fn auth_verify_otp(req: Request, db: Arc<Db>) -> Response {
    let (host, scheme) = request_host_scheme(&req);
    let mode = login_mode(&db);
    let body: VerifyOtpRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if mode == "otp_qr" {
        match auth::verify_otp_start_2fa(&body.email, &body.code) {
            Ok(qr_login_id) => qr_login_start_response(&host, scheme, qr_login_id),
            Err(e) => rs_json_response(StatusCode::UNAUTHORIZED, &serde_json::json!({"error": format!("{e:#}")})),
        }
    } else {
        // "otp"(単体)・"none"/"qr"(本来この経路は使われないが、呼ばれても
        // 安全側に倒す)いずれも、コード検証成功で即セッション発行する
        // 従来通りの単一要素ログイン。
        match auth::verify_otp(&body.email, &body.code) {
            Ok(token) => {
                let resp_body = rust_json::to_vec_strict(&serde_json::json!({"ok": true})).unwrap_or_else(|_| b"{}".to_vec());
                hyper::Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "application/json")
                    .header("set-cookie", format!("{}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400", auth::SESSION_COOKIE_NAME))
                    .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(resp_body)))
                    .expect("building a response from a fixed set of valid headers cannot fail")
            }
            Err(e) => rs_json_response(StatusCode::UNAUTHORIZED, &serde_json::json!({"error": format!("{e:#}")})),
        }
    }
}

/// `POST /v1/auth/qr-login/start`(2026-08-28新設): `"qr"`モード
/// (QR撮影のみ、事前のメール確認なし)専用の開始エンドポイント。
async fn auth_qr_login_start(req: Request) -> Response {
    let (host, scheme) = request_host_scheme(&req);
    let qr_login_id = auth::start_qr_only_login();
    qr_login_start_response(&host, scheme, qr_login_id)
}

#[derive(serde::Deserialize)]
struct QrLoginIdRequest {
    id: String,
}

/// `POST /v1/auth/qr-login/confirm`(2026-08-28新設): QR確認ページ
/// (`qr-confirm.html`、スマホ/タブレット/WEBカメラ搭載端末で開く)から
/// 呼ばれる。このQRセッションを「確認済み」にするだけで、まだ
/// セッションCookieは発行しない(この端末とプライマリ端末が別物のため、
/// Cookieはプライマリ端末側の`qr-login/finish`で発行する設計)。
async fn auth_qr_login_confirm(req: Request) -> Response {
    let body: QrLoginIdRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match auth::qr_login_confirm(&body.id) {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("{e:#}")})),
    }
}

/// `GET /v1/auth/qr-login/status?id=`(2026-08-28新設): プライマリ端末が
/// 数秒おきにポーリングし、別端末での確認が済んだかを見る。
async fn auth_qr_login_status(req: Request) -> Response {
    let id = query_param(&req, "id").unwrap_or_default();
    if id.is_empty() {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing id"}));
    }
    match auth::qr_login_status(&id) {
        Some(confirmed) => rs_json_response(StatusCode::OK, &serde_json::json!({"confirmed": confirmed})),
        None => rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"error": "this QR login link is invalid or has expired"})),
    }
}

/// `POST /v1/auth/qr-login/finish`(2026-08-28新設): 別端末での確認が
/// 済んだことをポーリングで確認したプライマリ端末が呼ぶ。ここで初めて
/// 実際のセッションCookieを発行する。
async fn auth_qr_login_finish(req: Request) -> Response {
    let body: QrLoginIdRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match auth::qr_login_finish(&body.id) {
        Ok(token) => {
            let resp_body = rust_json::to_vec_strict(&serde_json::json!({"ok": true})).unwrap_or_else(|_| b"{}".to_vec());
            hyper::Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "application/json")
                .header("set-cookie", format!("{}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400", auth::SESSION_COOKIE_NAME))
                .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(resp_body)))
                .expect("building a response from a fixed set of valid headers cannot fail")
        }
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("{e:#}")})),
    }
}

/// `GET /v1/auth/qr-login/whoami?id=`(2026-08-28新設): QR確認ページが
/// 「どのアカウントのログインを確認しようとしているか」を、マスク済み
/// 識別子(メールアドレス/電話番号の一部を伏せた文字列)で表示するため
/// に使う。
async fn auth_qr_login_whoami(req: Request) -> Response {
    let id = query_param(&req, "id").unwrap_or_default();
    match auth::qr_login_masked_identifier(&id) {
        Some(masked) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "masked_identifier": masked})),
        None => rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"ok": false, "error": "this QR login link is invalid or has expired"})),
    }
}

#[derive(serde::Deserialize)]
struct TotpSetupRequest {
    email: String,
    #[serde(default)]
    phone_label: Option<String>,
}

/// `POST /v1/auth/totp-setup`(2026-08-27新設): このメールアドレスに
/// TOTPシークレットが無ければ新規生成、あれば既存のものからQRコードを
/// 再生成して返す。認証(ログイン)は行わない——設定のみ。
async fn auth_totp_setup(req: Request, db: Arc<Db>) -> Response {
    let body: TotpSetupRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match auth::totp_setup(&db, &body.email, body.phone_label.as_deref()) {
        Ok((secret, qr_svg)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "secret": secret, "qr_svg": qr_svg})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("{e:#}")})),
    }
}

#[derive(serde::Deserialize)]
struct TotpVerifyRequest {
    email: String,
    code: String,
}

/// `POST /v1/auth/totp-verify`(2026-08-27新設): 認証アプリの6桁コードで
/// ログインする(既存のemail OTPログインと同じセッションCookieを発行する
/// 「もう1つの入口」——email1・email2・TOTPのいずれか1つで認証完了、
/// 3つ全部の入力を要求するものではない)。
async fn auth_totp_verify(req: Request, db: Arc<Db>) -> Response {
    let body: TotpVerifyRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match auth::totp_verify(&db, &body.email, &body.code) {
        Ok(token) => {
            let resp_body = rust_json::to_vec_strict(&serde_json::json!({"ok": true})).unwrap_or_else(|_| b"{}".to_vec());
            hyper::Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "application/json")
                .header("set-cookie", format!("{}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400", auth::SESSION_COOKIE_NAME))
                .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(resp_body)))
                .expect("building a response from a fixed set of valid headers cannot fail")
        }
        Err(e) => rs_json_response(StatusCode::UNAUTHORIZED, &serde_json::json!({"error": format!("{e:#}")})),
    }
}

async fn auth_session(req: Request) -> Response {
    let cookie_header = req.headers().get("cookie").and_then(|v| v.to_str().ok());
    let token = auth::extract_session_cookie(cookie_header);
    let email = token.as_deref().and_then(auth::session_email);
    rs_json_response(StatusCode::OK, &serde_json::json!({"logged_in": email.is_some(), "email": email}))
}

async fn auth_logout(req: Request) -> Response {
    let cookie_header = req.headers().get("cookie").and_then(|v| v.to_str().ok());
    if let Some(token) = auth::extract_session_cookie(cookie_header) {
        auth::logout(&token);
    }
    hyper::Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "application/json")
        .header("set-cookie", format!("{}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0", auth::SESSION_COOKIE_NAME))
        .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(&b"{\"ok\":true}"[..])))
        .expect("building a response from a fixed set of valid headers cannot fail")
}

/// ログイン保護が有効な場合のみ、有効なセッションCookieを要求する
/// ゲート(2026-08-26新設)。保護対象ハンドラの先頭で呼ぶ——`Ok(())`なら
/// 続行、`Err(response)`ならそのレスポンスをそのまま返して処理を止める。
/// **正直な開示**: 現時点で実際にこのゲートを適用しているのは
/// `/v1/db/*`(会話履歴・設定)のみ(auth.rsモジュールdoc参照)。
async fn require_session(req: &Request, db: &Arc<Db>) -> Result<(), Response> {
    if login_mode(db) == "none" {
        return Ok(());
    }
    let cookie_header = req.headers().get("cookie").and_then(|v| v.to_str().ok());
    let token = auth::extract_session_cookie(cookie_header);
    match token.as_deref().and_then(auth::session_email) {
        Some(_) => Ok(()),
        None => Err(rs_json_response(
            StatusCode::UNAUTHORIZED,
            &serde_json::json!({"error": "login required / ログインが必要です"}),
        )),
    }
}

/// **正直な開示**: `used_disk_bytes`/`total_disk_bytes`はこのコミット
/// 時点では未実装で常に`null`を返す(クロスプラットフォームのディスク
/// 空き容量取得はOS別実装が必要な別増分——Windows/Linux/macOS/Android
/// それぞれ異なるAPIが必要で、今回のスコープには含めていない)。
/// `db_file_size_bytes`(実際のDBファイルサイズ)・
/// `postgres_mirror_configured`(aruaru-db/PostgreSQLミラーが設定
/// 済みか)は実データを返す。フロントエンド側の円グラフ・保存先選択
/// UIは、この情報が出揃ってから次の増分で実装する。
async fn db_info(db: Arc<Db>) -> Response {
    // `Db::rsync_available()`はブロッキングな子プロセス呼び出し
    // (`rsync --version`)のため、tokioワーカースレッドを塞がないよう
    // `spawn_blocking`へ逃がす(2026-08-24、これまでこの関数はどこからも
    // 呼ばれておらずdead_code警告が出ていた——`/v1/db/rsync-backup`は
    // 実際に`rsync`を起動してから初めて未インストールを検知する設計
    // だったため、事前にここで分かるようにして`GET /v1/db/info`一発で
    // 「バックアップを試す前にrsync が使えるかどうか」を確認できるようにした)。
    let rsync_available = tokio::task::spawn_blocking(Db::rsync_available).await.unwrap_or(false);
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "db_path": db.path().display().to_string(),
            "db_file_size_bytes": db.file_size_bytes(),
            "postgres_mirror_configured": db.has_postgres_mirror(),
            "rsync_available": rsync_available,
            // 2026-08-24 DUAL同時書き込み対応で追加。`dual_mirror`が
            // trueなら`OPEN_ENGLISH_DATABASE_URL`と
            // `OPEN_ENGLISH_DATABASE_URL_SECONDARY`の両方が設定済みで、
            // 会話履歴が2つのDBへ同時に書き込まれる状態。
            // `mirror_targets`は表示名のみ(接続文字列はパスワードを
            // 含み得るため返さない)。
            "dual_mirror": db.is_dual_mirror(),
            "mirror_targets": db.mirror_labels(),
            // 2026-08-24 自己修復(未反映キュー)対応で追加。
            // `mirror_outbox_pending`は「ミラー書き込みに失敗して
            // 再送待ちの件数」、`mirror_outbox_given_up`は
            // 「規定回数リトライしても成功しなかった件数」
            // (黙って捨てず件数として見えるようにしてある)。
            "mirror_outbox_pending": db.outbox_counts().0,
            "mirror_outbox_given_up": db.outbox_counts().1,
            "used_disk_bytes": serde_json::Value::Null,
            "total_disk_bytes": serde_json::Value::Null,
        }),
    )
}

/// `GET /v1/fs/list-dir`(2026-08-25新設、ユーザー指示「(rsync/DB移動先
/// 入力欄が)一つのファームだけではわかりにくいので、エクスプローラーの
/// 様な物を立ち上げて」への対応)。
///
/// **設計方針(正直な開示)**: このアプリは利用者自身のPC上でローカル
/// 起動するデスクトップ寄りのアプリであり(既定`127.0.0.1`限定
/// バインド)、「バックアップ先フォルダを選ぶ」という操作はOS標準の
/// 「フォルダを開く」ダイアログに相当する。ブラウザの`File System
/// Access API`(`showDirectoryPicker()`)は実際のOSダイアログを開ける
/// ものの、セキュリティ上の理由で**選択したフォルダの絶対パス文字列を
/// JS側へ一切渡さない**設計になっており、rsyncのコマンドライン引数に
/// 必要な実際のパス文字列を得られない——このため、`local_agent.rs`の
/// ような読み書き許可リスト方式ではなく、**ディレクトリ名の一覧のみを
/// 返す読み取り専用API**をサーバー側(ローカルファイルシステムへ
/// フルアクセスできる立場)に新設した。ファイルの中身・隠しファイルの
/// 詳細は返さず、フォルダ名の一覧+現在位置+親ディレクトリのみを返す
/// (「保存先フォルダを選ぶ」という目的に必要な最小限の情報)。
async fn fs_list_dir(req: Request) -> Response {
    let path_param = query_param(&req, "path").filter(|s| !s.is_empty());
    let requested = match path_param {
        Some(p) => PathBuf::from(p),
        None => {
            // パス未指定 = ルート一覧を返す(Windowsはドライブレター、
            // Unix系は"/")。
            return rs_json_response(StatusCode::OK, &fs_list_roots());
        }
    };
    let canonical = match std::fs::canonicalize(&requested) {
        Ok(p) => p,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("cannot open '{}': {e}", requested.display())})),
    };
    let read_dir = match std::fs::read_dir(&canonical) {
        Ok(rd) => rd,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("cannot list '{}': {e}", canonical.display())})),
    };
    let mut entries: Vec<serde_json::Value> = Vec::new();
    for entry in read_dir.flatten() {
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !is_dir {
            continue; // フォルダ選択が目的のため、ファイルは一覧に含めない。
        }
        let name = entry.file_name().to_string_lossy().to_string();
        entries.push(serde_json::json!({"name": name}));
    }
    entries.sort_by(|a, b| a["name"].as_str().unwrap_or("").to_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_lowercase()));
    // strip_windows_prefixで`\\?\C:\...`形式の冗長プレフィックスを除去
    // (canonicalizeがWindowsで付与する、そのままだと利用者に分かり
    // にくい表記)。
    let display_path = strip_windows_verbatim_prefix(&canonical.display().to_string());
    let parent = canonical.parent().map(|p| strip_windows_verbatim_prefix(&p.display().to_string()));
    rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "path": display_path, "parent": parent, "entries": entries}))
}

/// Windowsの`canonicalize()`が付与する`\\?\`プレフィックス
/// (Long Path対応の内部表記)を、利用者向け表示・rsync等への入力
/// どちらでも扱いやすい通常のドライブレター表記へ戻す。
fn strip_windows_verbatim_prefix(s: &str) -> String {
    s.strip_prefix(r"\\?\").unwrap_or(s).to_string()
}

fn fs_list_roots() -> serde_json::Value {
    #[cfg(target_os = "windows")]
    {
        let mut entries = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if std::fs::metadata(&drive).is_ok() {
                entries.push(serde_json::json!({"name": format!("{}:", letter as char)}));
            }
        }
        serde_json::json!({"ok": true, "path": "", "parent": serde_json::Value::Null, "entries": entries})
    }
    #[cfg(not(target_os = "windows"))]
    {
        serde_json::json!({"ok": true, "path": "/", "parent": serde_json::Value::Null, "entries": [{"name": ""}]})
    }
}

/// DuckDNS(無料の動的DNSサービス)経由で、この端末に固定のURL
/// (例: `https://your-name.duckdns.org`)を割り当てる(ユーザー指示
/// 「アイコンクリックで起動するか、URLをお気に入りに入れて、DuckDNSや
/// 好きなURLを割り当て可能に」への対応、2026-08-25新設)。
///
/// **正直な開示・世界のネットワークの仕組み上の限界(重要)**:
/// (1) DuckDNSは**ドメイン名→現在のIPアドレスの対応付け**を行う
///     サービスに過ぎない。**ポート開放・ポートフォワーディングは
///     一切行わない**——world-labの`wan`接続ラベル設計
///     (`world_lab.rs`)と同じ考え方で、UPnP等による自動ポート開放は
///     意図的に実装していない(踏み台化防止の既存方針)。実際に
///     インターネット越しに到達させたい場合は、利用者自身がルーターの
///     ポートフォワーディング設定、および`open-web-server`/
///     `open-easy-web`等によるTLS終端を別途用意する必要がある。
/// (2) このサーバー自体は既定で`127.0.0.1`(ループバックのみ)へ
///     バインドしており(`OPEN_ENGLISH_SERVER_BIND`環境変数で変更
///     しない限り)、DuckDNSでドメインを割り当てただけでは**外部から
///     到達可能にはならない**——この点をUI上でも明記すること。
/// (3) DuckDNSのトークンはリクエストのたびに受け取り、このプロセスの
///     メモリ上でのみ使う(`github_agent.rs`と同じ設計、ディスクへの
///     平文保存はしない)。
#[derive(serde::Deserialize)]
struct DuckDnsUpdateRequest {
    domain: String,
    token: String,
    /// 空文字/未指定ならDuckDNS側にリクエスト元IPから自動検出させる。
    ip: Option<String>,
}

async fn duckdns_update(req: Request) -> Response {
    let body: DuckDnsUpdateRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let domain = body.domain.trim();
    let token = body.token.trim();
    if domain.is_empty() || token.is_empty() {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": "domain and token are required / domainとtokenは必須です"}));
    }
    // DuckDNSのドメイン名はサブドメイン部分のみ(例: "your-name")を
    // 受け付ける仕様のため、利用者が誤って"your-name.duckdns.org"の
    // ように入力しても動くよう剥がす。
    let domain = domain.trim_end_matches(".duckdns.org");
    let ip = body.ip.as_deref().unwrap_or("").trim();

    let url = format!("https://www.duckdns.org/update?domains={}&token={}&ip={}", urlencoding_simple(domain), urlencoding_simple(token), urlencoding_simple(ip));
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build() {
        Ok(c) => c,
        Err(e) => return rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"ok": false, "error": format!("client build failed: {e}")})),
    };
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => return rs_json_response(StatusCode::BAD_GATEWAY, &serde_json::json!({"ok": false, "error": format!("could not reach DuckDNS / DuckDNSへ接続できませんでした: {e}")})),
    };
    let text = resp.text().await.unwrap_or_default();
    let ok = text.trim().starts_with("OK");
    let full_url = format!("https://{domain}.duckdns.org/");
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "ok": ok,
            "duckdns_response": text.trim(),
            "assigned_url": if ok { Some(full_url) } else { None },
            "note_en": "This only points the domain name at your current IP address. It does NOT open any ports on your router and does NOT make this server reachable from the internet by itself — this server still listens on 127.0.0.1 only unless you explicitly change OPEN_ENGLISH_SERVER_BIND, and your router still needs manual port forwarding + TLS (e.g. via open-web-server/open-easy-web) for real WAN access.",
            "note_ja": "これはドメイン名を現在のIPアドレスへ結びつけるだけです。ルーターのポートは一切開きません。このサーバー自体もOPEN_ENGLISH_SERVER_BINDを明示的に変更しない限り127.0.0.1限定のままで、DuckDNSでドメインを割り当てただけではインターネットから到達可能にはなりません——実際に外部公開する場合は、ルーターのポートフォワーディング設定と、TLS終端(open-web-server/open-easy-web等)を別途ご自身で用意してください。",
        }),
    )
}

/// 現在このサーバーが「公開(WANから到達しうる)」か「非公開(ループバック
/// 限定)」かを、ユーザーがいつでも一目で確認できるようにする(ユーザー
/// 指示「公開サーバーか非公開サーバーかはいつでも選択可能として…
/// 表示して」への対応、2026-08-25新設)。
///
/// **正直な開示**: この判定は`OPEN_ENGLISH_SERVER_BIND`に設定された
/// アドレスが`127.0.0.1`/`localhost`/`::1`かどうかだけを見る簡易判定
/// であり、実際にルーターのポートフォワーディング・ファイアウォールが
/// 外部到達を許しているかまでは分からない(あくまで「このプロセス自身が
/// ループバック限定でリッスンしているか」の確認)。**切り替え自体は
/// この環境変数を変更してサーバーを再起動する必要がある**——起動中の
/// プロセスがリッスンしているソケットを無停止で差し替えることはせず、
/// 誤った「今すぐ安全に切り替えました」という印象を与えない設計にした。
fn network_status_json() -> serde_json::Value {
    let addr = bind_addr();
    let ip = addr.ip();
    let is_loopback = ip.is_loopback();
    serde_json::json!({
        "bind": addr.to_string(),
        "is_public": !is_loopback,
        "note_en": if is_loopback {
            "Private: this server only listens on the loopback address (127.0.0.1), so it is not reachable from other devices or the internet."
        } else {
            "Public-facing bind address configured: this server is listening on a non-loopback address. Whether it is actually reachable from the internet still depends on your router/firewall settings, which this app does not control."
        },
        "note_ja": if is_loopback {
            "非公開: このサーバーはループバックアドレス(127.0.0.1)限定でリッスンしているため、他の端末やインターネットからは到達できません。"
        } else {
            "公開向けのバインドアドレスが設定されています: ループバック以外のアドレスでリッスンしています。実際にインターネットから到達できるかどうかは、このアプリが関知しないルーター/ファイアウォール設定に依存します。"
        },
        "switch_instructions_en": "To switch, set the OPEN_ENGLISH_SERVER_BIND environment variable (e.g. 127.0.0.1:4601 for private, or 0.0.0.0:4601 to listen on all interfaces) and restart this server. This app never changes your router or firewall automatically.",
        "switch_instructions_ja": "切り替えるには環境変数 OPEN_ENGLISH_SERVER_BIND を設定し(例: 非公開なら127.0.0.1:4601、全インターフェースで待ち受けるなら0.0.0.0:4601)、サーバーを再起動してください。このアプリがルーターやファイアウォールを自動で変更することはありません。",
    })
}

async fn network_status(_req: Request) -> Response {
    rs_json_response(StatusCode::OK, &network_status_json())
}

/// `reqwest`のURLエンコード用ヘルパは`percent-encoding`クレート追加が
/// 必要になるため、DuckDNSが受け付ける値の範囲(英数字・ハイフン・
/// ピリオドのみを想定するドメイン名/トークン)に限定した最小限の
/// エンコードで済ませる(汎用エンコーダは意図的に導入しない)。
fn urlencoding_simple(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 保存先変更(ユーザー指示「DATA保存先は、既存の保存先でもそれ以外でも
/// 選択可能にして」への対応、2026-08-18新設)。`new_path`にフルパスを
/// 渡す(例: 増設したマイクロSDのマウント先配下)。
#[derive(serde::Deserialize)]
struct RelocateRequest {
    new_path: String,
}

async fn db_relocate(req: Request, db: Arc<Db>) -> Response {
    let body: RelocateRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match db.relocate(PathBuf::from(&body.new_path)) {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "new_path": db.path().display().to_string()})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

/// rsync同期先を選択して即時バックアップを実行する(ユーザー指示「同期先も
/// RSyncで選択可能にして」への対応、2026-08-18新設)。`destination`は
/// rsyncのCLIがそのまま受理する文字列(ローカルパス・`user@host:/path`の
/// いずれも可)。
#[derive(serde::Deserialize)]
struct RsyncBackupRequest {
    destination: String,
}

/// 「Let's install RSync! / RSyncをインストールしましょう！」の英日併記
/// メッセージ(ユーザー指示、2026-08-18新設)。`rsync`未導入で
/// バックアップに失敗した際、フロントエンドがこの文言+
/// `/v1/db/install-rsync`呼び出しボタンを表示できるよう、
/// `rsync_missing: true`と共に返す。
const INSTALL_RSYNC_PROMPT_EN: &str = "Let's install RSync! Click \"Install RSync\" to set it up automatically, then your backup will run right away.";
const INSTALL_RSYNC_PROMPT_JA: &str = "RSyncをインストールしましょう！「RSyncをインストール」を押すと自動でセットアップし、そのままバックアップを実行します。";

async fn db_rsync_backup(req: Request, db: Arc<Db>) -> Response {
    let body: RsyncBackupRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let destination = body.destination;
    match tokio::task::spawn_blocking(move || db.backup_via_rsync(&destination)).await {
        Ok(Ok(msg)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "detail": msg})),
        Ok(Err(db::RsyncError::NotInstalled)) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "ok": false,
                "rsync_missing": true,
                "message_en": INSTALL_RSYNC_PROMPT_EN,
                "message_ja": INSTALL_RSYNC_PROMPT_JA,
            }),
        ),
        Ok(Err(e)) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": format!("rsync task panicked: {e}")})),
    }
}

/// `rsync`を自動インストールし、`retry_destination`が指定されていれば
/// 成功直後にそのままバックアップまで実行する(ユーザー指示「簡単に
/// インストールして簡単に自動で移行する機能を搭載して」への対応、
/// 2026-08-18新設——「インストール」ボタン1回でインストール→
/// バックアップまで通しで完了する設計)。
#[derive(serde::Deserialize)]
struct InstallRsyncRequest {
    #[serde(default)]
    retry_destination: Option<String>,
}

async fn db_install_rsync(req: Request, db: Arc<Db>) -> Response {
    let body: InstallRsyncRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let install_result = tokio::task::spawn_blocking(Db::install_rsync).await;
    let install_msg = match install_result {
        Ok(Ok(msg)) => msg,
        Ok(Err(e)) => {
            return rs_json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({
                    "ok": false,
                    "error": e.to_string(),
                    "message_en": "Automatic install failed. Please install rsync manually for your OS (e.g. `winget install cwrsync.cwrsync` on Windows, `apt-get install rsync` on Linux, `brew install rsync` on macOS, `pkg install rsync` on Android/Termux).",
                    "message_ja": "自動インストールに失敗しました。お使いのOS向けに手動でrsyncをインストールしてください(例: Windowsは`winget install cwrsync.cwrsync`、Linuxは`apt-get install rsync`、macOSは`brew install rsync`、Android/Termuxは`pkg install rsync`)。",
                }),
            )
        }
        Err(e) => return rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": format!("install task panicked: {e}")})),
    };
    let Some(destination) = body.retry_destination else {
        return rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "detail": install_msg, "backup_ran": false}));
    };
    match tokio::task::spawn_blocking(move || db.backup_via_rsync(&destination)).await {
        Ok(Ok(backup_msg)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "detail": install_msg, "backup_ran": true, "backup_detail": backup_msg})),
        Ok(Err(e)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "detail": install_msg, "backup_ran": false, "backup_error": e.to_string()})),
        Err(e) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "detail": install_msg, "backup_ran": false, "backup_error": format!("rsync task panicked: {e}")})),
    }
}

/// SQLite会話履歴DB + aruaru-db/PostgreSQLミラー(設定されていれば)を
/// **1回の呼び出しで同時に**同じ宛先へrsyncバックアップする(ユーザー
/// 指示「RSyncで、open-englishのaruaru-dbとpostgresqlを他のデバイス
/// などにバックアップ同時を可能に、その設定方法も簡単にして」への
/// 対応、2026-08-19新設)。**設定を簡単にする狙い**: 利用者は宛先を
/// 1箇所入力するだけでよく、SQLite側は`<destination>`直下へ、
/// aruaru-db側は`db_rs::backup_postgres_via_pg_dump`が同じ宛先文字列を
/// そのまま`rsync`へ渡す(pg_dumpしたファイル1個の複製のため、
/// ディレクトリ宛先であれば両者は自動的に別ファイル名で共存する)。
/// aruaru-dbミラー未設定時は`postgres_backup: null`を返す(存在しない
/// 対象を「失敗」として扱わない)。データ一貫性への配慮は`db.rs`の
/// `backup_postgres_via_pg_dump`のdoc参照(稼働中データディレクトリの
/// 直接rsyncではなく`pg_dump`のトランザクション一貫スナップショットを
/// 経由する)。
async fn db_rsync_backup_all(req: Request, db: Arc<Db>) -> Response {
    let body: RsyncBackupRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let destination = body.destination;
    let sqlite_destination = destination.clone();
    let db_for_sqlite = Arc::clone(&db);
    let sqlite_result = tokio::task::spawn_blocking(move || db_for_sqlite.backup_via_rsync(&sqlite_destination)).await;
    let sqlite_json = match sqlite_result {
        Ok(Ok(msg)) => serde_json::json!({"ok": true, "detail": msg}),
        Ok(Err(db::RsyncError::NotInstalled)) => serde_json::json!({
            "ok": false, "rsync_missing": true,
            "message_en": INSTALL_RSYNC_PROMPT_EN, "message_ja": INSTALL_RSYNC_PROMPT_JA,
        }),
        Ok(Err(e)) => serde_json::json!({"ok": false, "error": e.to_string()}),
        Err(e) => serde_json::json!({"ok": false, "error": format!("rsync task panicked: {e}")}),
    };

    let postgres_destination = destination;
    let db_for_pg = Arc::clone(&db);
    let pg_result = tokio::task::spawn_blocking(move || db_for_pg.backup_postgres_via_pg_dump(&postgres_destination)).await;
    let postgres_json = match pg_result {
        Ok(None) => serde_json::Value::Null,
        Ok(Some(Ok(msg))) => serde_json::json!({"ok": true, "detail": msg}),
        Ok(Some(Err(db::RsyncError::NotInstalled))) => serde_json::json!({
            "ok": false, "rsync_or_pg_dump_missing": true,
            "message_en": "Let's install RSync and PostgreSQL client tools (pg_dump)! Please install rsync and the PostgreSQL client package (which provides pg_dump) for your OS, then try again.",
            "message_ja": "RSyncとPostgreSQLクライアントツール(pg_dump)をインストールしましょう！お使いのOS向けにrsyncとPostgreSQLクライアントパッケージ(pg_dumpを含む)をインストールしてから、もう一度お試しください。",
        }),
        Ok(Some(Err(e))) => serde_json::json!({"ok": false, "error": e.to_string()}),
        Err(e) => serde_json::json!({"ok": false, "error": format!("pg_dump/rsync task panicked: {e}")}),
    };

    rs_json_response(StatusCode::OK, &serde_json::json!({"sqlite_backup": sqlite_json, "postgres_backup": postgres_json}))
}

/// 旧形式データの取り込み(ユーザー指示「既存の古い物からDATABASE
/// システムに移動も簡単にする機能」への対応、2026-08-18新設。実際に
/// 存在する旧データ形式は無い〈`db.rs`の`import_legacy`doc参照〉ため、
/// 汎用的な取り込み口として実装)。
#[derive(serde::Deserialize)]
struct LegacyMessage {
    role: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct MigrateLegacyRequest {
    #[serde(default)]
    messages: Vec<LegacyMessage>,
    #[serde(default)]
    settings: std::collections::HashMap<String, String>,
}

async fn db_migrate_legacy(req: Request, db: Arc<Db>) -> Response {
    let body: MigrateLegacyRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    let messages: Vec<(String, String)> = body.messages.into_iter().map(|m| (m.role, m.content)).collect();
    let settings: Vec<(String, String)> = body.settings.into_iter().collect();
    match db.import_legacy(&messages, &settings) {
        Ok((n_msg, n_set)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "imported_messages": n_msg, "imported_settings": n_set})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": e.to_string()})),
    }
}

/// クエリ文字列から1個のパラメータを取り出す(RPoem/hyperにクエリ
/// パーサが無いため、簡易な自前実装で足りる範囲〈`key=value`を`&`で
/// 区切り、`%XX`パーセントエンコーディングをデコード〉に留めた、
/// 2026-08-20新設)。
fn query_param(req: &Request, key: &str) -> Option<String> {
    let query = req.uri().query()?;
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        let k = it.next()?;
        let v = it.next().unwrap_or("");
        if k == key {
            return Some(percent_decode(v));
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ============================================================
// AIプログラミング支援バックエンド(2026-08-20新設)
//
// ユーザー指示「open-englishに、AIプログラミング支援のためのバックエンド
// 機能として、VPSへの自動読み書き・GitHubへの自動読み書き・ローカル
// ドライブへの自動読み書き(サーバー常駐エージェント式)を追加」への
// 対応。セキュリティ設計の詳細は`vps_agent.rs`/`github_agent.rs`/
// `local_agent.rs`各モジュールのdoc参照(鍵・トークンはブラウザへ
// 送信しない、書き込み範囲は許可ディレクトリ/許可パスに限定、任意
// コマンド実行APIは公開しない、という3原則はいずれのモジュールでも
// 省略せず実装済み)。
// ============================================================

async fn agent_local_read(req: Request) -> Response {
    let Some(path) = query_param(&req, "path") else {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing 'path' query parameter"}));
    };
    match tokio::task::spawn_blocking(move || local_agent::read_file(&path)).await {
        Ok(Ok(content)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "content": content})),
        Ok(Err(e)) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e.to_string()})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": format!("task panicked: {e}")})),
    }
}

#[derive(serde::Deserialize)]
struct LocalWriteRequest {
    path: String,
    content: String,
}

async fn agent_local_write(req: Request) -> Response {
    let body: LocalWriteRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match tokio::task::spawn_blocking(move || local_agent::write_file(&body.path, &body.content)).await {
        Ok(Ok(())) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Ok(Err(e)) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e.to_string()})),
        Err(e) => rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": format!("task panicked: {e}")})),
    }
}

async fn agent_vps_read(req: Request) -> Response {
    let Some(path) = query_param(&req, "path") else {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing 'path' query parameter"}));
    };
    match vps_agent::read_file(&path).await {
        Ok(content) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "content": content})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
    }
}

#[derive(serde::Deserialize)]
struct VpsWriteRequest {
    path: String,
    content: String,
}

async fn agent_vps_write(req: Request) -> Response {
    let body: VpsWriteRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match vps_agent::write_file(&body.path, &body.content).await {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
    }
}

/// GitHubトークンはヘッダ(`x-github-token`)経由で都度受け取る(クエリ
/// 文字列やURLへは載せない——アクセスログ等への平文残留を避けるため)。
async fn agent_github_read(req: Request) -> Response {
    let token = req.headers().get("x-github-token").and_then(|v| v.to_str().ok()).map(str::to_string);
    let Some(owner) = query_param(&req, "owner") else {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing 'owner' query parameter"}));
    };
    let Some(repo) = query_param(&req, "repo") else {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing 'repo' query parameter"}));
    };
    let Some(path) = query_param(&req, "path") else {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "missing 'path' query parameter"}));
    };
    let branch = query_param(&req, "ref");
    match github_agent::read_file(&owner, &repo, &path, branch.as_deref(), token.as_deref()).await {
        Ok(f) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "content": f.content, "sha": f.sha})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
    }
}

#[derive(serde::Deserialize)]
struct GithubCommitRequest {
    owner: String,
    repo: String,
    path: String,
    content: String,
    message: String,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    sha: Option<String>,
    token: String,
}

async fn agent_github_commit(req: Request) -> Response {
    let body: GithubCommitRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match github_agent::commit_file(&body.owner, &body.repo, &body.path, &body.content, &body.message, body.branch.as_deref(), body.sha.as_deref(), &body.token).await {
        Ok((commit_sha, html_url)) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "commit_sha": commit_sha, "html_url": html_url})),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
    }
}

/// world-lab(2026-08-24新設、`world_lab.rs`モジュールdoc参照):
/// デバイス発見/ペアリングの最小スケルトンAPI。既定で無効
/// (`OPEN_ENGLISH_WORLD_LAB_ENABLED=1`未設定時は全エンドポイントが
/// 「無効です」を返す)。タスク配布・通信中継は一切実装していない。
async fn world_lab_status(wl: Arc<world_lab::WorldLab>) -> Response {
    rs_json_response(StatusCode::OK, &wl.status())
}

#[derive(serde::Deserialize)]
struct WorldLabPairRequest {
    token: String,
    device_name: String,
    connection: String,
    /// "phone" | "tablet" | "pc" | "other"。未指定(空文字列)なら
    /// `WorldLab::pair`側で"other"へフォールバックする(既存クライアント
    /// との後方互換)。
    #[serde(default)]
    kind: String,
    /// 自己申告のハードウェア種別("cpu"/"gpu"/"npu"の部分集合)。
    /// 未指定なら空配列(=申告なし)として扱う。
    #[serde(default)]
    capabilities: Vec<String>,
}

async fn world_lab_pair(req: Request, wl: Arc<world_lab::WorldLab>) -> Response {
    let body: WorldLabPairRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match wl.pair(&body.token, &body.device_name, &body.connection, &body.kind, &body.capabilities) {
        Ok(device) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "device": device})),
        Err(e) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e})),
    }
}

async fn world_lab_devices(wl: Arc<world_lab::WorldLab>) -> Response {
    match wl.list_devices() {
        Ok(devices) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "devices": devices})),
        Err(e) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e})),
    }
}

#[derive(serde::Deserialize)]
struct WorldLabUnpairRequest {
    device_id: String,
}

async fn world_lab_unpair(req: Request, wl: Arc<world_lab::WorldLab>) -> Response {
    let body: WorldLabUnpairRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match wl.unpair(&body.device_id) {
        Ok(removed) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "removed": removed})),
        Err(e) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e})),
    }
}

/// `POST /v1/world-lab/pair/bulk`(2026-08-25新設): 複数デバイスの
/// 一括ペアリング(企業・オフィス等で大量のPC/タブレット/スマホを
/// 一度に登録する用途、`world_lab.rs`の`bulk_pair`doc参照)。
#[derive(serde::Deserialize)]
struct WorldLabBulkPairRequest {
    token: String,
    devices: Vec<world_lab::BulkPairEntry>,
}

async fn world_lab_pair_bulk(req: Request, wl: Arc<world_lab::WorldLab>) -> Response {
    let body: WorldLabBulkPairRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    match wl.bulk_pair(&body.token, &body.devices) {
        Ok(results) => {
            let succeeded = results.iter().filter(|r| r.ok).count();
            rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "succeeded": succeeded, "total": results.len(), "results": results}))
        }
        Err(e) => rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": e})),
    }
}

/// `POST /v1/world-lab/task/run`(2026-08-24新設、Phase 2):
/// WASMサンドボックス内で計算タスクを実行する。既定で無効
/// (`OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED=1`が必要、`world_lab.rs`
/// モジュールdoc「Phase 2」節参照)。ペアリングトークンによる認証も
/// 兼ねる(トークンが一致しなければ実行しない)。wasmtimeの実行自体は
/// 同期(ブロッキング)APIのため`spawn_blocking`で包み、fuel計算の
/// ズレに対する保険として`tokio::time::timeout`も併用する。
#[derive(serde::Deserialize)]
struct WorldLabTaskRunRequest {
    token: String,
    wasm_base64: String,
    input_base64: String,
}

/// リクエストボディを、指定バイト数を超えたら**ストリーム読み取りの
/// 途中で**打ち切る形で読む(`http_body_util::Limited`を使用)。
///
/// **なぜ`read_rs_json_body`をそのまま使わなかったか(2026-08-24、
/// セキュリティレビューで発見・修正)**: 既存の`read_rs_json_body`は
/// `collect()`でボディを最後まで無制限に読み切ってからパースする設計
/// (他の`/v1/db/*`・`/v1/agent/*`エンドポイントと共有のヘルパー)。
/// 通常のJSON設定値程度のペイロードでは実害が薄いが、**「任意の計算
/// タスク」を受け付けるworld-labのエンドポイントでは、悪意ある送信者が
/// 巨大なBase64文字列(例: 数GB)を送りつけるだけで、`ComputeLimits`の
/// サイズ上限チェック(Base64をデコードした**後**に行われる)へ到達する
/// 前に、このプロセスのメモリを食い潰せてしまう**——「WASM実行は
/// サンドボックス+サブプロセス隔離で守ったのに、その手前のHTTPボディ
/// 読み取り自体がDoSの穴だった」となっては本末転倒なため、この
/// エンドポイント専用にストリーム段階でのキャップを追加した。
async fn read_capped_rs_json_body<T: serde::de::DeserializeOwned>(req: Request, max_bytes: usize) -> Result<T, Response> {
    use http_body_util::{BodyExt, Limited};
    let limited = Limited::new(req.into_body(), max_bytes);
    let bytes = match limited.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => {
            return Err(rs_json_response(
                StatusCode::PAYLOAD_TOO_LARGE,
                &serde_json::json!({"error": format!("request body exceeds the {max_bytes}-byte limit for this endpoint")}),
            ))
        }
    };
    rust_json::from_slice_strict::<T>(&bytes)
        .map_err(|e| rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": format!("invalid JSON body (Rust-JSON strict mode): {e}")})))
}

// ----------------------------------------------------------------------------
// world-lab Phase B(2026-08-25新設): 受信側デバイスでの明示的承認ゲート
// ----------------------------------------------------------------------------
//
// `world_lab.rs`の`ApprovalQueue`doc参照。ここは単にHTTPの薄い配線層——
// 実際の承認ロジック(自動実行しない・二重承認できない・拒否を正直に
// 報告する等)はすべて`ApprovalQueue`側にある。

#[derive(serde::Deserialize)]
struct WorldLabDispatchRequestBody {
    token: String,
    from_device_name: String,
    #[serde(default)]
    from_device_id: Option<String>,
    #[serde(default)]
    task_name: String,
    wasm_base64: String,
    input_base64: String,
}

/// `POST /v1/world-lab/dispatch/request`: 他デバイスからの計算タスク配布
/// リクエストを**キューへ積むだけ**(実行しない)。呼び出し元が
/// 「実際に別の物理デバイスか、このマシン自身のcurlか」は区別しない
/// ——`world_lab.rs`モジュールdoc参照。ペアリングトークンの検証は
/// 必須(トークンを持たない相手からの要求はキューにすら載せない)。
async fn world_lab_dispatch_request(req: Request, wl: Arc<world_lab::WorldLab>, compute: Arc<world_lab::ComputeEngine>, queue: Arc<world_lab::ApprovalQueue>) -> Response {
    use base64::Engine as _;
    // task/runと同じ理由(巨大なBase64文字列によるメモリ枯渇DoS対策)で
    // ボディサイズをストリーム段階で上限管理する。
    let max_body_bytes = (compute.limits.max_wasm_bytes + compute.limits.max_input_bytes) * 4 / 3 + 4096;
    let body: WorldLabDispatchRequestBody = match read_capped_rs_json_body(req, max_body_bytes).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !wl.token_matches(&body.token) {
        return rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": "invalid pairing token"}));
    }
    let wasm = match base64::engine::general_purpose::STANDARD.decode(&body.wasm_base64) {
        Ok(v) => v,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("wasm_base64 is not valid base64: {e}")})),
    };
    let input = match base64::engine::general_purpose::STANDARD.decode(&body.input_base64) {
        Ok(v) => v,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("input_base64 is not valid base64: {e}")})),
    };
    if wasm.len() > compute.limits.max_wasm_bytes {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("wasm module too large ({} bytes, limit {})", wasm.len(), compute.limits.max_wasm_bytes)}));
    }
    if input.len() > compute.limits.max_input_bytes {
        return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("input too large ({} bytes, limit {})", input.len(), compute.limits.max_input_bytes)}));
    }
    match queue.request(&body.from_device_name, body.from_device_id.clone(), &body.task_name, wasm, input) {
        Ok(id) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "ok": true,
                "approval_id": id,
                "status": "pending_approval",
                "disclosure_ja": "タスクはまだ実行されていません。受信側デバイスの利用者が明示的に承認するまで待機します。",
                "disclosure_en": "The task has not executed yet. It will wait until a human operator on this device explicitly approves it.",
            }),
        ),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e})),
    }
}

#[derive(serde::Deserialize)]
struct WorldLabDispatchTokenOnlyRequest {
    token: String,
}

/// `GET /v1/world-lab/dispatch/pending?token=...`: 承認待ちの一覧
/// (何が・どのデバイスから・いつ届いたか)。ペイロード本体は含まない。
async fn world_lab_dispatch_pending(req: Request, wl: Arc<world_lab::WorldLab>, queue: Arc<world_lab::ApprovalQueue>) -> Response {
    let token = open_runo_poem_compat::hyper_compat::query_params(&req).get("token").cloned().unwrap_or_default();
    if !wl.token_matches(&token) {
        return rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": "invalid pairing token"}));
    }
    rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "pending": queue.list()}))
}

/// `POST /v1/world-lab/dispatch/:id/approve`: 明示的承認。既存Phase 2の
/// `ComputeEngine::run_isolated`(サブプロセス隔離、fuel/メモリ/タイム
/// アウト上限)をそのまま呼び出す——承認ゲート専用の別サンドボックスは
/// 作らない。`OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED=1`が未設定の場合、
/// キューからは取り除いた上で(＝再承認はできない)実行不可のエラーを返す
/// (承認自体は成立した=もう一度キューに戻って人間の判断を待つ必要は
/// ない、という誠実な扱い)。
async fn world_lab_dispatch_approve(req: Request, params: open_runo_poem_compat::hyper_compat::Params, wl: Arc<world_lab::WorldLab>, compute: Arc<world_lab::ComputeEngine>, queue: Arc<world_lab::ApprovalQueue>) -> Response {
    use base64::Engine as _;
    let id = params.get("id").unwrap_or("").to_string();
    let body: WorldLabDispatchTokenOnlyRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !wl.token_matches(&body.token) {
        return rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": "invalid pairing token"}));
    }
    let entry = match queue.take_for_approval(&id) {
        Ok(e) => e,
        Err(e) => return rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"ok": false, "error": e})),
    };
    match compute.run_isolated(&entry.wasm, &entry.input).await {
        Ok((output, fuel_consumed)) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({"ok": true, "approved": true, "output_base64": base64::engine::general_purpose::STANDARD.encode(output), "fuel_consumed": fuel_consumed}),
        ),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "approved": true, "executed": false, "error": e})),
    }
}

/// `POST /v1/world-lab/dispatch/:id/deny`: 明示的却下。実行せずキューから
/// 破棄し、拒否された事実を正直に返す。
async fn world_lab_dispatch_deny(req: Request, params: open_runo_poem_compat::hyper_compat::Params, wl: Arc<world_lab::WorldLab>, queue: Arc<world_lab::ApprovalQueue>) -> Response {
    let id = params.get("id").unwrap_or("").to_string();
    let body: WorldLabDispatchTokenOnlyRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !wl.token_matches(&body.token) {
        return rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": "invalid pairing token"}));
    }
    match queue.deny(&id) {
        Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "denied": true})),
        Err(e) => rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"ok": false, "error": e})),
    }
}

async fn world_lab_task_run(req: Request, wl: Arc<world_lab::WorldLab>, compute: Arc<world_lab::ComputeEngine>) -> Response {
    use base64::Engine as _;
    // Base64は元データの約4/3倍に膨らむため、JSON側の余裕(フィールド名・
    // 引用符等、4KiB見込み)を足した上限を、ボディ読み取りの時点で課す。
    let max_body_bytes = (compute.limits.max_wasm_bytes + compute.limits.max_input_bytes) * 4 / 3 + 4096;
    let body: WorldLabTaskRunRequest = match read_capped_rs_json_body(req, max_body_bytes).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if !wl.token_matches(&body.token) {
        return rs_json_response(StatusCode::FORBIDDEN, &serde_json::json!({"ok": false, "error": "invalid pairing token"}));
    }
    let wasm = match base64::engine::general_purpose::STANDARD.decode(&body.wasm_base64) {
        Ok(v) => v,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("wasm_base64 is not valid base64: {e}")})),
    };
    let input = match base64::engine::general_purpose::STANDARD.decode(&body.input_base64) {
        Ok(v) => v,
        Err(e) => return rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": format!("input_base64 is not valid base64: {e}")})),
    };

    // **サブプロセス隔離で実行**(`world_lab.rs`の`run_isolated`doc参照、
    // 実機テストでこのプロセス内直接実行がクラッシュすることが判明した
    // ための設計変更)。子プロセスのタイムアウトは`run_isolated`内部で
    // 処理される。
    match compute.run_isolated(&wasm, &input).await {
        Ok((output, fuel_consumed)) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({"ok": true, "output_base64": base64::engine::general_purpose::STANDARD.encode(output), "fuel_consumed": fuel_consumed}),
        ),
        Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e})),
    }
}

/// `GET /v1/updates/history`(2026-08-20新設): open-english本体+同梱
/// コンポーネント(aruaru-llm・aruaru-db)それぞれの現在バージョン+
/// 保持している旧バージョン一覧を返す。UI側の「🔄 Updates & Rollback」
/// パネルがこれを基にダウングレード先の選択肢を表示する。
async fn updates_history() -> Response {
    let mut list = vec![self_update::self_history_info()];
    list.extend(component_update::history_info_all());
    rs_json_response(StatusCode::OK, &serde_json::json!({"components": list}))
}

#[derive(serde::Deserialize)]
struct DowngradeRequest {
    component: String,
    version: String,
}

/// `POST /v1/updates/downgrade`(2026-08-20新設、ユーザー指示「バージョン
/// アップしたらBUGだった場合の為に、簡単にそのBUGのリポジトリだけ
/// ダウングレード出来るように」への対応、主な新規実装対象)。
/// `component`は`"self"`(open-english本体)・`"aruaru-llm"`・
/// `"aruaru-db"`のいずれか。**正直な開示**: `self`のダウングレードが
/// 成功する場合、内部で`std::process::exit`によりこのプロセス自体が
/// 終了する(既存の自己更新〈`self_update::check_and_apply_update`〉と
/// 同じ設計)ため、成功時のHTTPレスポンス自体はクライアントへ届かない
/// ことがある——UI側は数秒待ってから`/healthz`への再接続を試みる想定。
async fn updates_downgrade(req: Request) -> Response {
    let body: DowngradeRequest = match read_rs_json_body(req).await {
        Ok(v) => v,
        Err(resp) => return resp,
    };
    if body.component == "self" || body.component == "open-english" {
        match self_update::downgrade_self(&body.version).await {
            Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true, "note": "restart in progress"})),
            Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
        }
    } else {
        match component_update::downgrade_component(&body.component, &body.version).await {
            Ok(()) => rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true})),
            Err(e) => rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"ok": false, "error": e.to_string()})),
        }
    }
}

/// `GET /v1/world-languages`(2026-08-22新設、ユーザー指示「世界中の言語
/// でも擬似模擬試験を受けられるように」への対応)。`world-language-exams.json`
/// を読み、**問題本文を含まない**言語一覧のサマリ(言語コード・現地語表記・
/// 英語名・日本語名・RTLか・収録問題数・収録レベル)だけを返す。
///
/// **設計意図**: フロントエンドの「追加する言語を選ぶ」UI(メンテナンス
/// 中の言語追加パネル)は一覧だけあれば描画でき、全問題(数十KB)を毎回
/// 転送する必要が無い。実際の出題時のみ`/world-language-exams.json`
/// (静的配信)を取得する二段構えにしている。
///
/// **正直な開示**: 収録問題はこのアプリ用に書き下ろしたオリジナル問題で、
/// 実在の資格試験(DELE・DELF・Goethe-Zertifikat・HSK・TOPIK等)の
/// 過去問ではなく、それらの試験とは一切無関係。言語ごとの収録数は不均一
/// (3〜6問)で、レベル表記もCEFR風の目安に過ぎない。この不均一さは
/// レスポンスの`question_count`にそのまま出るため、UI側で正直に表示できる。
async fn world_languages() -> Response {
    // VPS等のメモリ・ディスク容量が限られたデプロイ向けの制限モード
    // (2026-08-25新設、ユーザー指示「easy-web.tokyo/open-englishの世界中
    // 言語対応はメモリとHDD容量が少ないのでここでは英語と日本語だけに
    // 限定して」への対応)。`OPEN_ENGLISH_LIMITED_LANGUAGES=1`を設定した
    // 場合のみ有効——ローカルPC版(既定)は従来通り130言語すべてを返す。
    // 英語・日本語は元々この一覧(world-language-exams.json)には含まれて
    // いない(`learn-target`側に別途組み込み済み)ため、この一覧を空にする
    // だけで「英語・日本語のみ」の状態になる。
    if std::env::var("OPEN_ENGLISH_LIMITED_LANGUAGES").map(|v| v == "1").unwrap_or(false) {
        return rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "count": 0,
                "limited": true,
                "notice_en": "This server has limited memory and disk space, so only English and Japanese are supported here. To use all of the world's languages, please download and install open-english on your own device.",
                "notice_ja": "このサーバーはメモリ・ディスク容量が限られているため、ここでは英語と日本語のみに対応しています。世界中の言語をご利用になりたい場合は、お手元の端末へopen-englishをダウンロード・インストールしてご利用ください。",
                "languages": [],
            }),
        );
    }
    let path = repo_root().join("world-language-exams.json");
    let raw = match std::fs::read_to_string(&path) {
        Ok(v) => v,
        Err(e) => {
            return rs_json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({"error": format!("failed to read world-language-exams.json: {e}")}),
            )
        }
    };
    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return rs_json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({"error": format!("world-language-exams.json is not valid JSON: {e}")}),
            )
        }
    };
    let empty = vec![];
    let langs = parsed.get("languages").and_then(|v| v.as_array()).unwrap_or(&empty);
    let summary: Vec<serde_json::Value> = langs
        .iter()
        .map(|lang| {
            let questions = lang.get("questions").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut levels: Vec<String> = questions
                .iter()
                .filter_map(|q| q.get("level").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .collect();
            levels.sort();
            levels.dedup();
            serde_json::json!({
                "code": lang.get("code").cloned().unwrap_or(serde_json::Value::Null),
                "endonym": lang.get("endonym").cloned().unwrap_or(serde_json::Value::Null),
                "en": lang.get("en").cloned().unwrap_or(serde_json::Value::Null),
                "ja": lang.get("ja").cloned().unwrap_or(serde_json::Value::Null),
                "rtl": lang.get("rtl").cloned().unwrap_or(serde_json::Value::Bool(false)),
                "authored": lang.get("authored").cloned().unwrap_or(serde_json::Value::Bool(false)),
                "question_count": questions.len(),
                "levels": levels,
            })
        })
        .collect();
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "count": summary.len(),
            "disclosure_en": "Original practice questions written for this app. Not past questions from, and not affiliated with, any official language certification exam. Levels are loose CEFR-style approximations only.",
            "disclosure_ja": "本アプリ用に書き下ろしたオリジナル練習問題です。実在の語学資格試験の過去問ではなく、いかなる公式試験とも無関係です。レベル表記はCEFR風の大まかな目安に過ぎません。",
            "languages": summary,
        }),
    )
}

/// `GET /v1/region-info?lang=<code>`(2026-08-22新設、ユーザー指示「選択した
/// 言語〈特に一番上の言語〉の地域に関する情報を集めて、その言語での話題に
/// ついていけるように」への対応)。`world-language-regions.json`から
/// 該当言語1件ぶんの静的な基本情報(国旗・国名・首都・主要都市・観光名所・
/// 名物・著名人・代表的な企業とその概要・その他)を返す。
///
/// **正直な開示**: ここで返すのは**リアルタイムの情報ではない**——本アプリ用に
/// 記述した一般的な百科事典的知識であり、インターネットから取得していないため
/// 古くなり得る。最新ニュースの見出しは別エンドポイント(`/v1/region-news`)が
/// 担当する。
async fn region_info(req: Request) -> Response {
    let lang = query_param(&req, "lang").unwrap_or_default();
    let path = repo_root().join("world-language-regions.json");
    let raw = match std::fs::read_to_string(&path) {
        Ok(v) => v,
        Err(e) => {
            return rs_json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({"error": format!("failed to read world-language-regions.json: {e}")}),
            )
        }
    };
    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return rs_json_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &serde_json::json!({"error": format!("world-language-regions.json is not valid JSON: {e}")}),
            )
        }
    };
    let empty = vec![];
    let found = parsed
        .get("languages")
        .and_then(|v| v.as_array())
        .unwrap_or(&empty)
        .iter()
        .find(|l| l.get("code").and_then(|c| c.as_str()) == Some(lang.as_str()));
    match found {
        Some(entry) => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "ok": true,
                "region": entry,
                "disclosure_en": "Static background knowledge written for this app, not fetched from the internet and not real-time. Details may be out of date.",
                "disclosure_ja": "本アプリ用に記述した静的な基礎知識です。インターネットから取得したリアルタイム情報ではなく、内容が古くなっている場合があります。",
            }),
        ),
        None => rs_json_response(
            StatusCode::OK,
            &serde_json::json!({
                "ok": false,
                "error_en": format!("No background data has been written for language '{lang}' yet."),
                "error_ja": format!("言語コード「{lang}」の基礎データはまだ作成されていません。"),
            }),
        ),
    }
}

/// `GET /v1/region-news?lang=<code>`(2026-08-22新設)。**実際にインターネットへ
/// 接続して**、その言語向けのGoogleニュースRSS(公開フィード)から最新の見出しを
/// 取得して返す。
///
/// **設計判断**: 専用のニュースAPI(有償・APIキー必須のものが多い)へ依存させず、
/// 認証不要の公開RSSを使う。取得するのは**見出しと公開日時とリンクのみ**で、
/// 記事本文は取得・再配布しない(著作権への配慮——本文を読みたい利用者は
/// 元記事のリンクを開く)。
///
/// **正直な開示**: オフライン環境・RSSの仕様変更・地域による到達性の違いに
/// より取得に失敗することがある。その場合はエラーを黙って握りつぶさず、
/// `ok:false`と理由を返す(UI側もその旨を利用者へ正直に表示する)。
async fn region_news(req: Request) -> Response {
    let lang = query_param(&req, "lang").unwrap_or_default();
    // 言語コード -> Googleニュースの hl/gl/ceid パラメータ。未知の言語は
    // 英語版のフィードへフォールバックする(黙って空を返さない)。
    let (hl, gl) = match lang.as_str() {
        "ja" => ("ja", "JP"),
        "es" => ("es", "ES"),
        "fr" => ("fr", "FR"),
        "de" => ("de", "DE"),
        "it" => ("it", "IT"),
        "pt" => ("pt-PT", "PT"),
        "nl" => ("nl", "NL"),
        "sv" => ("sv", "SE"),
        "no" => ("no", "NO"),
        "da" => ("da", "DK"),
        "fi" => ("fi", "FI"),
        "pl" => ("pl", "PL"),
        "cs" => ("cs", "CZ"),
        "hu" => ("hu", "HU"),
        "ro" => ("ro", "RO"),
        "ru" => ("ru", "RU"),
        "uk" => ("uk", "UA"),
        "el" => ("el", "GR"),
        "tr" => ("tr", "TR"),
        "ar" => ("ar", "EG"),
        "he" => ("he", "IL"),
        "fa" => ("fa", "IR"),
        "hi" => ("hi", "IN"),
        "bn" => ("bn", "BD"),
        "id" => ("id", "ID"),
        "ms" => ("ms", "MY"),
        "vi" => ("vi", "VN"),
        "th" => ("th", "TH"),
        "tl" => ("en", "PH"),
        "zh" => ("zh-CN", "CN"),
        "zh-Hant" => ("zh-TW", "TW"),
        "ko" => ("ko", "KR"),
        "ta" => ("ta", "IN"),
        "te" => ("te", "IN"),
        "ur" => ("ur", "PK"),
        "mr" => ("mr", "IN"),
        "pa" => ("pa", "IN"),
        "sw" => ("sw", "KE"),
        "rm" => ("de", "CH"),
        _ => ("en", "US"),
    };
    let url = format!("https://news.google.com/rss?hl={hl}&gl={gl}&ceid={gl}:{hl}");
    let client = match reqwest::Client::builder()
        .user_agent("open-english/1.0 (topic briefing)")
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return rs_json_response(
                StatusCode::OK,
                &serde_json::json!({"ok": false, "error": format!("failed to build HTTP client: {e}")}),
            )
        }
    };
    let body = match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                return rs_json_response(
                    StatusCode::OK,
                    &serde_json::json!({"ok": false, "source": url, "error": format!("failed to read the feed body: {e}")}),
                )
            }
        },
        Ok(resp) => {
            return rs_json_response(
                StatusCode::OK,
                &serde_json::json!({"ok": false, "source": url, "error": format!("the news feed returned HTTP {}", resp.status())}),
            )
        }
        Err(e) => {
            return rs_json_response(
                StatusCode::OK,
                &serde_json::json!({"ok": false, "source": url, "error": format!("could not reach the news feed (offline?): {e}")}),
            )
        }
    };
    let items = extract_rss_titles(&body, 8);
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "ok": true,
            "lang": lang,
            "source": url,
            "headlines": items,
            "disclosure_en": "Headlines only, fetched live from a public Google News RSS feed. Article text is not copied; open the original link to read a story.",
            "disclosure_ja": "公開されているGoogleニュースRSSからその都度取得した見出しのみです。記事本文は取得・転載していません(本文は元記事のリンクからお読みください)。",
        }),
    )
}

/// RSS(XML)から`<item>`の`<title>`を最大`limit`件抜き出す最小のパーサ。
/// XMLパーサのクレートを追加せずに済ませるための割り切った実装で、
/// `<title>`の入れ子や属性は扱わない(Googleニュースの単純なRSSに限定)。
/// **正直な開示**: 汎用のRSSパーサではないため、フィードの構造が変われば
/// 見出しが0件になることがある(その場合もエラーにはせず空配列を返す)。
fn extract_rss_titles(xml: &str, limit: usize) -> Vec<String> {
    let mut out = Vec::new();
    // チャンネル自身の<title>を拾わないよう、最初の<item>以降だけを見る。
    let body = match xml.find("<item>") {
        Some(i) => &xml[i..],
        None => return out,
    };
    for chunk in body.split("<item>").skip(0) {
        if out.len() >= limit {
            break;
        }
        let Some(start) = chunk.find("<title>") else { continue };
        let rest = &chunk[start + "<title>".len()..];
        let Some(end) = rest.find("</title>") else { continue };
        let title = decode_xml_entities(rest[..end].trim());
        if !title.is_empty() {
            out.push(title);
        }
    }
    out
}

fn decode_xml_entities(s: &str) -> String {
    let s = s
        .trim_start_matches("<![CDATA[")
        .trim_end_matches("]]>")
        .to_string();
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[tokio::main]
async fn main() {
    // world-lab計算タスクの隔離ワーカー(2026-08-24新設)。通常の起動処理
    // (DBオープン・HTTPサーバー起動等)を一切せず、`world_lab.rs`
    // モジュールdoc「サブプロセス隔離」節のプロトコルでWASMを1件実行して
    // 即終了する。`run_worker_main`は`!`を返す(`std::process::exit`で
    // 終了するため、これ以降のコードには絶対に到達しない)。
    if std::env::args().nth(1).as_deref() == Some("--world-lab-worker") {
        world_lab::run_worker_main();
    }

    // world-lab Phase B TLS(2026-08-25追加): このプロセスは`rustls`(0.23)
    // を複数の依存経路(PostgreSQLミラーTLS・`reqwest`のrustls-tls・
    // world-lab TLS)から使うため、ビルド全体としてはring/aws-lc-ring両方の
    // crypto backend featureがどこかで有効になり得て、rustls側が
    // どちらを既定にすべきか自動判定できずpanicする(実際にこの変更を
    // 実機で起動して発見した実バグ——型チェックだけでは検出できなかった
    // 起動時crash)。プロセス起動の最初期に明示的に`ring`を既定provider
    // として一度だけinstallすることで解消する(このリポジトリの既存
    // rustls依存が`features = ["ring", ...]`である方針と一致)。
    if tokio_rustls::rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();
    }

    let root = repo_root();
    let db_path = db::db_path(&root);
    let db = Arc::new(Db::open(db_path).expect("failed to open local SQLite DB (data/open-english.sqlite3)"));
    println!(
        "conversation DB: {} (mirror: {})",
        db.path().display(),
        if db.is_dual_mirror() {
            format!("DUAL simultaneous write to [{}]", db.mirror_labels().join(", "))
        } else if db.has_postgres_mirror() {
            format!("single target [{}] (set OPEN_ENGLISH_DATABASE_URL_SECONDARY for DUAL)", db.mirror_labels().join(", "))
        } else {
            "disabled (SQLite only)".to_string()
        }
    );

    // 自己修復(未反映キューの再送)バックグラウンドタスク
    // (2026-08-24新設、`db.rs`モジュールdoc「自己修復」節参照)。
    // 起動時に1回試し、その後は一定間隔で繰り返す。ミラー先が
    // 未設定なら何もしない(タスク自体を起動しない)。
    if db.has_postgres_mirror() {
        let retry_secs: u64 = std::env::var("OPEN_ENGLISH_MIRROR_RETRY_SECS").ok().and_then(|v| v.parse().ok()).filter(|n| *n > 0).unwrap_or(60);
        let retry_path = db.path();
        let retry_mirrors = db.mirrors();
        println!("DB mirror self-repair: retry queue enabled (every {retry_secs}s)");
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(retry_secs));
            loop {
                // 1回目の`tick()`は即座に返る(=起動時の初回実行)。
                ticker.tick().await;
                db::outbox_retry_once(retry_path.clone(), retry_mirrors.clone()).await;
            }
        });
    }

    let mut app = Route::new();
    for (url_path, rel_file, content_type) in STATIC_FILES {
        let file_path = root.join(rel_file);
        app = app.at(
            url_path,
            get(static_file_handler(file_path.clone(), content_type)).head(static_file_head_handler(file_path, content_type)),
        );
    }
    app = app.at("/healthz", get(handler_fn(move |_req, _p| async move { healthz().await })));
    app = app.at("/v1/config", get(handler_fn(move |_req, _p| async move { app_config().await })));
    // `/health`はopen-web-server/open-easy-web側の「分身の術」テナント
    // 登録パターン(他リポジトリのCLAUDE.md HANDOFF多数参照)が汎用的に
    // 期待するヘルスチェック命名に形状を揃えるための別名(2026-08-24新設)。
    // 中身は`/healthz`と同一(`healthz()`をそのまま呼ぶだけ、新規ロジック
    // なし)——open-english自体をopen-web-server経由で公開する際に
    // エンドポイント名の食い違いで弾かれないようにする、実装コストの
    // 小さい歩み寄り。既存の`/healthz`は後方互換のためそのまま維持する。
    app = app.at("/health", get(handler_fn(move |_req, _p| async move { healthz().await })));
    // 実行基盤(CPU命令セット)情報(2026-08-22新設、cpu_runtime()のdoc参照)。
    app = app.at("/v1/cpu-runtime", get(handler_fn(move |_req, _p| async move { cpu_runtime().await })));
    // 多言語擬似模擬試験の対応言語一覧(2026-08-22新設、world_languages()のdoc参照)。
    app = app.at("/v1/world-languages", get(handler_fn(move |_req, _p| async move { world_languages().await })));
    // 話題ブリーフィング(2026-08-22新設): 静的な地域情報+公開RSSからの実ニュース見出し。
    app = app.at("/v1/region-info", get(handler_fn(move |req, _p| async move { region_info(req).await })));
    app = app.at("/v1/region-news", get(handler_fn(move |req, _p| async move { region_news(req).await })));

    // email+OTPログイン(2026-08-26新設、auth.rsモジュールdoc参照)。
    {
        let db_for_auth_get = Arc::clone(&db);
        let db_for_auth_set = Arc::clone(&db);
        let db_for_totp_setup = Arc::clone(&db);
        let db_for_totp_verify = Arc::clone(&db);
        app = app.at(
            "/v1/auth/config",
            get(handler_fn(move |_req, _p| {
                let db = Arc::clone(&db_for_auth_get);
                async move { auth_config(db).await }
            }))
            .post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_auth_set);
                async move { auth_set_config(req, db).await }
            })),
        );
        app = app.at("/v1/auth/request-otp", post(handler_fn(move |req, _p| async move { auth_request_otp(req).await })));
        app = app.at("/v1/auth/request-sms-otp", post(handler_fn(move |req, _p| async move { auth_request_sms_otp(req).await })));
        let db_for_verify_otp = Arc::clone(&db);
        app = app.at(
            "/v1/auth/verify-otp",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_verify_otp);
                async move { auth_verify_otp(req, db).await }
            })),
        );
        app = app.at("/v1/auth/qr-login/start", post(handler_fn(move |req, _p| async move { auth_qr_login_start(req).await })));
        app = app.at("/v1/auth/qr-login/confirm", post(handler_fn(move |req, _p| async move { auth_qr_login_confirm(req).await })));
        app = app.at("/v1/auth/qr-login/status", get(handler_fn(move |req, _p| async move { auth_qr_login_status(req).await })));
        app = app.at("/v1/auth/qr-login/finish", post(handler_fn(move |req, _p| async move { auth_qr_login_finish(req).await })));
        app = app.at("/v1/auth/qr-login/whoami", get(handler_fn(move |req, _p| async move { auth_qr_login_whoami(req).await })));
        app = app.at("/v1/auth/session", get(handler_fn(move |req, _p| async move { auth_session(req).await })));
        app = app.at("/v1/auth/logout", post(handler_fn(move |req, _p| async move { auth_logout(req).await })));
        app = app.at(
            "/v1/auth/totp-setup",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_totp_setup);
                async move { auth_totp_setup(req, db).await }
            })),
        );
        app = app.at(
            "/v1/auth/totp-verify",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_totp_verify);
                async move { auth_totp_verify(req, db).await }
            })),
        );
    }

    // 会話履歴・設定の永続化API(2026-08-18新設、db.rsモジュールdoc参照)。
    {
        // ログイン保護(2026-08-26新設、auth.rsモジュールdoc参照)が有効な
        // 場合、会話履歴・設定という最も個人情報に近いデータへは
        // `require_session`でセッションCookieを要求する。
        let db_for_add = Arc::clone(&db);
        let db_for_list = Arc::clone(&db);
        app = app.at(
            "/v1/db/history",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_add);
                async move {
                    if let Err(resp) = require_session(&req, &db).await {
                        return resp;
                    }
                    db_add_message(req, db).await
                }
            }))
            .get(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_list);
                async move {
                    if let Err(resp) = require_session(&req, &db).await {
                        return resp;
                    }
                    db_list_messages(db).await
                }
            })),
        );
        let db_for_clear = Arc::clone(&db);
        app = app.at(
            "/v1/db/history/clear",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_clear);
                async move {
                    if let Err(resp) = require_session(&req, &db).await {
                        return resp;
                    }
                    db_clear_messages(db).await
                }
            })),
        );
        let db_for_set = Arc::clone(&db);
        let db_for_get = Arc::clone(&db);
        app = app.at(
            "/v1/db/settings",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_set);
                async move {
                    if let Err(resp) = require_session(&req, &db).await {
                        return resp;
                    }
                    db_set_setting(req, db).await
                }
            }))
            .get(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_get);
                async move {
                    if let Err(resp) = require_session(&req, &db).await {
                        return resp;
                    }
                    db_get_settings(db).await
                }
            })),
        );
        let db_for_info = Arc::clone(&db);
        app = app.at(
            "/v1/db/info",
            get(handler_fn(move |_req, _p| {
                let db = Arc::clone(&db_for_info);
                async move { db_info(db).await }
            })),
        );
        let db_for_relocate = Arc::clone(&db);
        app = app.at(
            "/v1/db/storage-path",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_relocate);
                async move { db_relocate(req, db).await }
            })),
        );
        app = app.at("/v1/fs/list-dir", get(handler_fn(move |req, _p| async move { fs_list_dir(req).await })));
        app = app.at("/v1/duckdns/update", post(handler_fn(move |req, _p| async move { duckdns_update(req).await })));
        app = app.at("/v1/network/status", get(handler_fn(move |req, _p| async move { network_status(req).await })));
        let db_for_rsync = Arc::clone(&db);
        app = app.at(
            "/v1/db/rsync-backup",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_rsync);
                async move { db_rsync_backup(req, db).await }
            })),
        );
        let db_for_rsync_all = Arc::clone(&db);
        app = app.at(
            "/v1/db/rsync-backup-all",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_rsync_all);
                async move { db_rsync_backup_all(req, db).await }
            })),
        );
        let db_for_migrate = Arc::clone(&db);
        app = app.at(
            "/v1/db/migrate-legacy",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_migrate);
                async move { db_migrate_legacy(req, db).await }
            })),
        );
        let db_for_install_rsync = Arc::clone(&db);
        app = app.at(
            "/v1/db/install-rsync",
            post(handler_fn(move |req, _p| {
                let db = Arc::clone(&db_for_install_rsync);
                async move { db_install_rsync(req, db).await }
            })),
        );
        app = app.at("/v1/updates/history", get(handler_fn(move |_req, _p| async move { updates_history().await })));
        app = app.at("/v1/updates/downgrade", post(handler_fn(move |req, _p| async move { updates_downgrade(req).await })));
    }

    // AIプログラミング支援バックエンド(2026-08-20新設、上記
    // "AIプログラミング支援バックエンド"セクションのdoc参照)。
    {
        app = app.at("/v1/agent/local/read", get(handler_fn(move |req, _p| async move { agent_local_read(req).await })));
        app = app.at("/v1/agent/local/write", post(handler_fn(move |req, _p| async move { agent_local_write(req).await })));
        app = app.at("/v1/agent/vps/read", get(handler_fn(move |req, _p| async move { agent_vps_read(req).await })));
        app = app.at("/v1/agent/vps/write", post(handler_fn(move |req, _p| async move { agent_vps_write(req).await })));
        app = app.at("/v1/agent/github/read", get(handler_fn(move |req, _p| async move { agent_github_read(req).await })));
        app = app.at("/v1/agent/github/commit", post(handler_fn(move |req, _p| async move { agent_github_commit(req).await })));
    }

    // world-lab(2026-08-24新設、`world_lab.rs`モジュールdoc参照)。
    // 既定で無効(OPEN_ENGLISH_WORLD_LAB_ENABLED=1未設定時は全て「無効」を返す)。
    {
        let world_lab = Arc::new(world_lab::WorldLab::from_env());
        let wl = Arc::clone(&world_lab);
        app = app.at(
            "/v1/world-lab/status",
            get(handler_fn(move |_req, _p| {
                let wl = Arc::clone(&wl);
                async move { world_lab_status(wl).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        app = app.at(
            "/v1/world-lab/pair",
            post(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                async move { world_lab_pair(req, wl).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        app = app.at(
            "/v1/world-lab/devices",
            get(handler_fn(move |_req, _p| {
                let wl = Arc::clone(&wl);
                async move { world_lab_devices(wl).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        app = app.at(
            "/v1/world-lab/unpair",
            post(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                async move { world_lab_unpair(req, wl).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        app = app.at(
            "/v1/world-lab/pair/bulk",
            post(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                async move { world_lab_pair_bulk(req, wl).await }
            })),
        );

        // Phase 2(2026-08-24新設): WASMサンドボックスでの計算タスク実行。
        // 二段階目のオプトイン(OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED=1)
        // で保護——ペアリングだけ有効化しタスク実行は無効のまま、という
        // 構成を選べる(`world_lab.rs`モジュールdoc「Phase 2」節参照)。
        let compute_engine = Arc::new(world_lab::ComputeEngine::from_env());
        let wl = Arc::clone(&world_lab);
        let ce = Arc::clone(&compute_engine);
        app = app.at(
            "/v1/world-lab/task/run",
            post(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                let compute_engine = Arc::clone(&ce);
                async move { world_lab_task_run(req, wl, compute_engine).await }
            })),
        );

        // Phase B(2026-08-25新設): 受信側デバイスでの明示的承認ゲート
        // (`world_lab.rs`の`ApprovalQueue`doc参照)。ペアリングだけ・
        // Phase 2実行だけ有効化してもこのキュー自体は動く(承認だけ
        // 積んで、実行はcompute_engineが無効なら`run_isolated`が
        // 「無効です」エラーを返すだけ——キューへ積むこと自体は
        // Phase 2の有効/無効に依存しない設計)。
        let approval_queue = Arc::new(world_lab::ApprovalQueue::new());
        let wl = Arc::clone(&world_lab);
        let ce = Arc::clone(&compute_engine);
        let aq = Arc::clone(&approval_queue);
        app = app.at(
            "/v1/world-lab/dispatch/request",
            post(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                let ce = Arc::clone(&ce);
                let aq = Arc::clone(&aq);
                async move { world_lab_dispatch_request(req, wl, ce, aq).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        let aq = Arc::clone(&approval_queue);
        app = app.at(
            "/v1/world-lab/dispatch/pending",
            get(handler_fn(move |req, _p| {
                let wl = Arc::clone(&wl);
                let aq = Arc::clone(&aq);
                async move { world_lab_dispatch_pending(req, wl, aq).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        let ce = Arc::clone(&compute_engine);
        let aq = Arc::clone(&approval_queue);
        app = app.at(
            "/v1/world-lab/dispatch/:id/approve",
            post(handler_fn(move |req, p| {
                let wl = Arc::clone(&wl);
                let ce = Arc::clone(&ce);
                let aq = Arc::clone(&aq);
                async move { world_lab_dispatch_approve(req, p, wl, ce, aq).await }
            })),
        );
        let wl = Arc::clone(&world_lab);
        let aq = Arc::clone(&approval_queue);
        app = app.at(
            "/v1/world-lab/dispatch/:id/deny",
            post(handler_fn(move |req, p| {
                let wl = Arc::clone(&wl);
                let aq = Arc::clone(&aq);
                async move { world_lab_dispatch_deny(req, p, wl, aq).await }
            })),
        );
    }

    // aruaru-llmの自動起動(2026-08-19新設、上記maybe_launch_aruaru_llmの
    // doc参照)。サーバー本体の起動をブロックしないよう非同期タスクで
    // バックグラウンド実行する(ヘルスチェック自体に最大700msかかり
    // 得るため)。
    tokio::spawn(maybe_launch_aruaru_llm());

    // ブラウザ内 Whisper 音声認識モデルの自動取得(2026-08-29新設、
    // ユーザー指示「メンテナンスで自動インストールして」)。無ければ
    // 起動時に一度取得を試みる(best-effort、詳細は関数doc参照)。
    tokio::spawn(maybe_fetch_whisper_model());

    // 起動時の自動メンテナンス/自動アップデート(2026-08-11追加、ユーザー
    // 指示「起動時の自動メンテナンスで自動UPDATEの自動バージョンアップ
    // 機能も搭載して」)。サーバーの起動(=フロントエンド側のメンテナンス
    // バナー表示中)をブロックしないよう、非同期タスクとしてバック
    // グラウンドで実行する。新バージョンが見つかった場合、この関数は
    // アンインストール/インストールを起動した上でプロセス自体を終了する
    // (`self_update.rs`のモジュールdoc参照)。
    tokio::spawn(self_update::check_and_apply_update());

    // 同梱コンポーネント(aruaru-llm・任意のaruaru-db)の自動アップデート
    // (2026-08-19新設、`component_update.rs`のモジュールdoc参照、ユーザー
    // 指示「自動UPDATE機能は、全ての関連リポジトリを自動アップデートする
    // 機能搭載として」への対応)。open-english本体の自己更新
    // (`self_update::check_and_apply_update`)とは独立のタスクとして
    // バックグラウンド実行する。
    tokio::spawn(component_update::check_and_apply_all());

    // 定期的な自動アップデートチェック(2026-08-20新設、ユーザー指示
    // 「メンテナンスのタイミングで自動バージョンアップの自動アップデート
    // 機能も確実に」への対応)。従来は起動時のみのチェックだったため、
    // 長時間起動しっぱなしのユーザーには新バージョンがいつまでも
    // 反映されない可能性があった。GitHub REST APIの未認証レート制限
    // (1時間あたり60リクエスト)に配慮し、過度に頻繁にはせず6時間間隔
    // とした(本体+aruaru-llm+aruaru-dbで1回あたり最大3リクエスト、
    // 24時間でも12リクエスト程度に収まる現実的な値)。
    tokio::spawn(async {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(6 * 60 * 60));
        interval.tick().await; // 1回目のtickは即時発火するため消費するだけ(起動時チェックは上で既に実施済み)
        loop {
            interval.tick().await;
            println!("open-english periodic maintenance: running scheduled update check (every 6h)");
            self_update::check_and_apply_update().await;
            component_update::check_and_apply_all().await;
            maybe_fetch_whisper_model().await;
        }
    });

    let addr = bind_addr();
    // 実行基盤(CPU命令セット)を起動時に1行ログへ出す。どのSIMD経路が
    // 選ばれたかを実機で後から確認できるようにするため(open-cpu導入、2026-08-22)。
    println!("{}", open_cpu::runtime_summary());
    println!("open-english static server listening on http://{addr}/");
    println!("serving files from {}", root.display());

    // world-lab Phase B TLS(2026-08-25追加、`world_lab.rs`のPhase B節・
    // CLAUDE.md 2026-08-25設計エントリ(c)への対応)。
    //
    // **正直な開示**: 平文HTTPリスナー(上記`addr`)は今回**廃止していない**
    // ——既存の全エンドポイント(会話履歴・aruaru-llm連携・エージェント
    // 機能等)を今回のパスでTLS必須に切り替えるのはスコープが大きすぎる
    // ため見送った。ここで追加したのは、world-lab関連の平文HTTP問題
    // (CLAUDE.md「現行のPhase 1ペアリングAPIが平文HTTPである点も…
    // 要修正」という指摘)に対して、**同じルート表を追加のTLSポートでも
    // 提供できるようにする**という最小限の対応。運用者は
    // `OPEN_ENGLISH_TLS_ENABLED=1`でこのポートを有効化し、world-lab関連
    // エンドポイントにはそちらだけを使うことで、平文ポートを別途
    // ファイアウォールで塞ぐ、という運用ができる(コード側で平文ポートの
    // world-lab系エンドポイントだけを無効化する、というような強制はして
    // いない——両ポートで同一ルート表が有効なままなので、平文ポートを
    // 塞ぐかどうかは運用者の選択に委ねられる)。
    //
    // **本番証明書 vs 開発用自己署名証明書**: `OPEN_ENGLISH_TLS_CERT_PATH`/
    // `OPEN_ENGLISH_TLS_KEY_PATH`が指す実在のPEMファイルがあればそれを
    // 使う(本番運用ではLet's Encrypt等の正式な証明書を想定)。無ければ
    // `rcgen`でその場限りの自己署名証明書を生成する
    // (**開発/ローカル検証専用**、ブラウザ/クライアント側で証明書エラーが
    // 出るのは想定通り——`curl -k`/`--insecure`や自己署名証明書を信頼
    // 済みにしたクライアントでの検証が前提)。**トークン由来の独自
    // pinningスキームは実装していない**——CLAUDE.md
    // (f)(ii)が「暗号設計として一度も第三者レビューを受けていない自己流の
    // 案」と正直に指摘した設計は、今回意図的に実装を見送った。TLS
    // ハンドシェイクそのものは`rustls`(`open_runo_poem_compat::
    // hyper_compat::tls`、RPoem/RS-SmartTCP既存パターンの再利用)に
    // 完全に委譲しており、本サーバー独自の暗号コードは一切無い。
    let router = app.build();
    let tls_enabled = std::env::var("OPEN_ENGLISH_TLS_ENABLED").map(|v| v == "1").unwrap_or(false);
    if tls_enabled {
        match load_or_generate_tls_config() {
            Ok(tls_config) => {
                let tls_addr = std::env::var("OPEN_ENGLISH_TLS_BIND").ok().and_then(|s| s.parse::<SocketAddr>().ok()).unwrap_or_else(|| {
                    let mut a = addr;
                    a.set_port(addr.port() + 1);
                    a
                });
                let tls_router = router.clone();
                match open_runo_poem_compat::hyper_compat::tls::serve_tls(tls_router, tls_addr, tls_config).await {
                    Ok((bound, tls_handle)) => {
                        println!("open-english TLS listener on https://{bound}/ (world-lab dispatch/pairing should prefer this port once a 2nd device is available for Phase C)");
                        tokio::spawn(async move {
                            let _ = tls_handle.await;
                        });
                    }
                    Err(e) => eprintln!("open-english: failed to start TLS listener on {tls_addr}: {e} (continuing with plain HTTP only)"),
                }
            }
            Err(e) => eprintln!("open-english: OPEN_ENGLISH_TLS_ENABLED=1 but TLS config could not be loaded/generated: {e} (continuing with plain HTTP only)"),
        }
    } else {
        println!("open-english TLS listener: disabled (set OPEN_ENGLISH_TLS_ENABLED=1 to also serve over TLS on a second port; see CLAUDE.md Phase B entry for the honest scope of this — dev/self-signed cert unless OPEN_ENGLISH_TLS_CERT_PATH/KEY_PATH point at real ones)");
    }

    let (bound_addr, handle) = open_runo_poem_compat::hyper_compat::serve(router, addr).await.expect("failed to bind local server (is the port already in use?)");
    println!("bound to http://{bound_addr}/");
    handle.await.expect("server task panicked");
}

/// world-lab Phase B TLS用の`rustls::ServerConfig`を用意する。実在の
/// `OPEN_ENGLISH_TLS_CERT_PATH`/`OPEN_ENGLISH_TLS_KEY_PATH`(PEM)があれば
/// それをロード(本番想定)、無ければ`rcgen`でその場限りの自己署名
/// 証明書(`localhost`/`127.0.0.1`向け、プロセスを再起動するたびに
/// 再生成される——ディスクに保存しない)を生成する
/// (**開発/ローカル検証専用**、正式なCAチェーンではないため本番配布
/// には使わないこと)。
fn load_or_generate_tls_config() -> Result<tokio_rustls::rustls::ServerConfig, String> {
    let cert_path = std::env::var("OPEN_ENGLISH_TLS_CERT_PATH").ok();
    let key_path = std::env::var("OPEN_ENGLISH_TLS_KEY_PATH").ok();
    if let (Some(cert_path), Some(key_path)) = (cert_path, key_path) {
        if Path::new(&cert_path).exists() && Path::new(&key_path).exists() {
            println!("open-english TLS: loading certificate from {cert_path} (OPEN_ENGLISH_TLS_CERT_PATH/KEY_PATH set)");
            return open_runo_poem_compat::hyper_compat::tls::load_tls_config(Path::new(&cert_path), Path::new(&key_path)).map_err(|e| e.to_string());
        }
        return Err(format!("OPEN_ENGLISH_TLS_CERT_PATH/KEY_PATH set but file(s) not found ({cert_path}, {key_path})"));
    }

    println!("open-english TLS: OPEN_ENGLISH_TLS_CERT_PATH/KEY_PATH not set — generating a throwaway self-signed dev certificate (rcgen). This is NOT suitable for production; browsers/clients will reject it unless explicitly told to trust it.");
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".to_string(), "127.0.0.1".to_string()]).map_err(|e| format!("failed to generate self-signed dev certificate: {e}"))?;
    let cert_der = cert.cert.der().clone();
    let key_der = tokio_rustls::rustls::pki_types::PrivatePkcs8KeyDer::from(cert.key_pair.serialize_der());
    tokio_rustls::rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der], tokio_rustls::rustls::pki_types::PrivateKeyDer::Pkcs8(key_der))
        .map_err(|e| format!("failed to build rustls ServerConfig from generated dev certificate: {e}"))
}
