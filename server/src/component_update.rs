//! 同梱コンポーネント(aruaru-llm本体・任意のaruaru-db)の自動アップデート
//! 機能(2026-08-19新設)。
//!
//! ユーザー指示「自動UPDATE機能は、全ての関連リポジトリを自動アップデート
//! する機能搭載として」への対応。`self_update.rs`はopen-english本体
//! (このサーバーバイナリ自身)だけを対象にしていたが、インストーラーが
//! 同梱するaruaru-llm(`installer/windows/fetch-aruaru-llm.ps1`、既定で
//! 同梱)・aruaru-db(`fetch-aruaru-db.ps1`、任意)も、open-englishの
//! 自動アップデートと同じタイミングでチェックし、新版があれば安全に
//! 差し替える。
//!
//! ## 既存資産の再利用
//!
//! GitHub Releases問い合わせ・バージョン比較・ダウンロード・ディレクトリ
//! コピー・実行権限付与・ヘルスチェックのロジックは、いずれも
//! `self_update.rs`が既に実装済みのものを`pub(crate)`化して再利用した
//! (重複実装を避ける)。新規に書いたのは「コンポーネントごとの配置場所・
//! 実行ファイル名・展開方式(zip/tar.gz)・プロセス生死管理」の差分部分の
//! みに絞っている。
//!
//! ## 対応コンポーネントと制約(正直な開示)
//!
//! - **aruaru-llm**(`aon-co-jp/aruaru-llm`): `{exe_dir}/aruaru-llm/
//!   aruaru-llm(.exe)`に存在する場合のみ対象。Windows(`*-windows-
//!   x86_64.zip`)・Linux(`*-linux-x86_64.tar.gz`)向けのリリース
//!   アセットが実際に存在することを`.github/workflows/release.yml`で
//!   確認済み。**macOS向けのビルドはこのリポジトリのCIにまだ無い**
//!   (`aruaru-llm/CLAUDE.md`にも記載済みの既知の制約)——macOS環境では
//!   aruaru-llmコンポーネントの自動更新は「対応アセットなし」として
//!   スキップされる(open-english本体自体のmacOS自己更新は別
//!   〈`self_update.rs`〉で対応済み、混同しないこと)。
//!   `/healthz`(`ARUARU_LLM_BIND`、既定`127.0.0.1:4600`)で本物の
//!   ヘルスチェックができるため、`main.rs`の`maybe_launch_aruaru_llm`と
//!   同じ考え方で「新版を起動→ヘルスチェック→失敗なら旧版へ復元」という
//!   ロールバックを実装した。
//! - **aruaru-db**(`aon-co-jp/aruaru-db`、任意): `{exe_dir}/aruaru-db/
//!   aruaru-server(.exe)`に存在する場合のみ対象。Windows/Linuxアセットの
//!   存在は同様に確認済み(macOSは同じ理由で対象外)。**正直な開示・
//!   aruaru-db固有の制約**: aruaru-server(pgwireサーバー)にはHTTPの
//!   `/healthz`に相当する軽量エンドポイントが確認できなかった
//!   (`aruaru-db/crates/aruaru-server/src/main.rs`確認済み、`/admin`・
//!   `/graphql`はあるが単純な生存確認用ではない)。そのため、aruaru-db
//!   については「新版のpgwireポート(既定`5432`)へTCP接続できるか」を
//!   簡易ヘルスチェックとして採用した——HTTPの`/healthz`ほど意味内容の
//!   保証は強くない(単に何かがそのポートで待ち受けているかの確認に
//!   留まる)ことを明記する。またaruaru-dbはopen-english自身がプロセス
//!   管理していない(ユーザーが手動起動する運用、`maybe_launch_aruaru_llm`
//!   のような自動起動が無い)ため、更新時に「元々起動していたかどうか」を
//!   プロセス検出(`tasklist`/`pgrep`相当)で判定し、起動していなければ
//!   ファイル差し替えのみを行い自動起動はしない(ユーザーが次回自分で
//!   起動する)。
//!
//! ## 実機検証状況(正直な開示、最重要)
//!
//! この開発機はWindowsで、かつ`aon-co-jp/aruaru-llm`・`aon-co-jp/
//! aruaru-db`のGitHub Releasesにこのバージョンマーカー方式
//! (`.component-version`)を前提とした実際のリリースがまだ存在しない
//! ため、「新版検出→ダウンロード→展開→旧版バックアップ→ヘルスチェック→
//! 成功/失敗分岐」という一連の流れは、(a)コンパイル成功、(b)
//! バージョン比較・アセット名判定の単体テスト、(c)コンポーネント
//! ディレクトリが存在しない場合に正直に何もしないこと、の3点までを
//! 実機確認した。実際にディレクトリを用意し疑似的なローカルHTTPサーバー
//! (`/healthz`を返すだけのスタブ)を使ったヘルスチェック分岐の動作確認は
//! 次回、実際のリリースまたはより作り込んだ統合テスト環境で行う必要が
//! ある。

use std::path::Path;
use std::time::Duration;

use crate::self_update::{
    copy_dir_recursive, download_to, fetch_latest_release_for, health_check, is_newer, set_executable_permission,
    tracing_log_if_available, LatestRelease, HEALTH_CHECK_SECS,
};

/// 同梱コンポーネントの定義。`dir_name`は`{exe_dir}/{dir_name}/`配下に
/// 実行ファイルが配置される前提(既存の`fetch-aruaru-llm.ps1`/
/// `fetch-aruaru-db.ps1`・`maybe_launch_aruaru_llm`と同じ相対配置)。
/// コンポーネントの種別ごとに「新版が正常か」の判定方法が異なる
/// (2026-09-23拡張、ユーザー指示「open-cpu/open-directx/open-cudaも
/// 個別に自動バージョンアップできるように」への対応)。
#[derive(PartialEq, Eq)]
enum ComponentKind {
    /// 常駐サーバー(aruaru-llm)。HTTP `/healthz`で稼働確認する。
    Server,
    /// 常駐サーバーだがHTTPヘルスチェックが無い(aruaru-db)。TCPポート
    /// 疎通のみで稼働確認する。
    Database,
    /// 一度実行して終了する診断CLI(open-cpu-diag等)。常駐しないため
    /// 「元々起動していたか」の概念が無く、単に新版を1回実行して
    /// 正常終了(exit code 0)するかだけを確認する。
    DiagnosticCli,
}

struct Component {
    dir_name: &'static str,
    repo: &'static str,
    /// 拡張子抜きの実行ファイル名(`.exe`はWindowsで自動付与)。
    binary_stem: &'static str,
    kind: ComponentKind,
}

const COMPONENTS: &[Component] = &[
    Component { dir_name: "aruaru-llm", repo: "aon-co-jp/aruaru-llm", binary_stem: "aruaru-llm", kind: ComponentKind::Server },
    Component { dir_name: "aruaru-db", repo: "aon-co-jp/aruaru-db", binary_stem: "aruaru-server", kind: ComponentKind::Database },
    // 2026-09-23追加: open-cpuのCPU命令セット診断CLI(`open-cpu-inventory`)。
    // ハードウェア診断ツールとしてopen-englishへ任意同梱し、他コンポーネント
    // と同じ仕組みで個別に自動バージョンアップする
    // (`open-cpu/.github/workflows/release.yml`が`open-cpu-diag-{linux,windows}
    // -x86_64.{tar.gz,zip}`を公開、中身は`open-cpu-inventory`/`open-cpu-bench`
    // の2バイナリ)。
    Component { dir_name: "open-cpu-diag", repo: "aon-co-jp/open-cpu", binary_stem: "open-cpu-inventory", kind: ComponentKind::DiagnosticCli },
    // 2026-09-23追加: open-cudaのGPU/Vulkan診断CLI(`opencuda-vulkan-info`)。
    // 実行時に`real-vulkan`機能(ashの動的ロード)でVulkanドライバを開こうと
    // するため、Vulkan非対応機ではヘルスチェック(1回実行してexit 0)が
    // 失敗しロールバックされる——その場合、この任意コンポーネントは
    // 単に「未導入のまま」扱いになる(aruaru-dbと同じ「同梱しなければ
    // 何もしない」設計)。
    Component { dir_name: "opencuda-diag", repo: "aon-co-jp/open-cuda", binary_stem: "opencuda-vulkan-info", kind: ComponentKind::DiagnosticCli },
];

fn binary_file_name(stem: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    }
}

/// バージョンマーカーファイル名。この機構が新設される前に
/// `fetch-aruaru-*.ps1`で取得された既存インストールにはこのファイルが
/// 無いため、その場合はローカル版を`"0.0.0"`とみなす(=常に「新版あり」
/// 判定となり、初回の更新チェックで最新版へ揃った上でこのファイルが
/// 書き込まれる——2回目以降は正しく比較できるようになる、という
/// 正直な移行動作)。
const VERSION_MARKER: &str = ".component-version";

fn local_component_version(component_dir: &Path) -> String {
    std::fs::read_to_string(component_dir.join(VERSION_MARKER))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "0.0.0".to_string())
}

fn write_component_version(component_dir: &Path, tag: &str) {
    let _ = std::fs::write(component_dir.join(VERSION_MARKER), tag);
}

/// Windows向けzipアセット(`*-windows-x86_64.zip`、`fetch-aruaru-*.ps1`
/// と同じ命名判定)。
fn windows_zip_asset<'a>(release: &'a LatestRelease, dir_name: &str) -> Option<&'a crate::self_update::ReleaseAsset> {
    release.assets.iter().find(|a| {
        let name = a.name.to_lowercase();
        name.starts_with(dir_name) && name.contains("windows") && name.ends_with(".zip")
    })
}

/// Linux向けtarball(macOSは`aruaru-llm`/`aruaru-db`いずれもCIビルドが
/// 無いため対象外、モジュールdoc参照)。
fn linux_tarball_asset<'a>(release: &'a LatestRelease, dir_name: &str) -> Option<&'a crate::self_update::ReleaseAsset> {
    release.assets.iter().find(|a| {
        let name = a.name.to_lowercase();
        name.starts_with(dir_name) && name.contains("linux") && name.ends_with(".tar.gz")
    })
}

/// 実行ファイル名(image name)からプロセスが稼働中かどうかを判定する。
/// **正直な開示**: これは簡易実装であり(Windows: `tasklist`のテキスト
/// 出力を検索、Unix: `pgrep`)、同名の無関係なプロセスがあれば誤検出
/// しうる——`self_update.rs`本体側のWindows自己更新が既に同種の
/// `taskkill /IM`前提の設計(同ファイルのHANDOFF既知の制約と同じ)を
/// とっているため、それと同じ精度の割り切りとした。
async fn is_process_running(binary_file_name: &str) -> bool {
    if cfg!(target_os = "windows") {
        let output = tokio::process::Command::new("tasklist")
            .args(["/FI", &format!("IMAGENAME eq {binary_file_name}")])
            .output()
            .await;
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).to_lowercase().contains(&binary_file_name.to_lowercase()),
            Err(_) => false,
        }
    } else {
        tokio::process::Command::new("pgrep").arg("-f").arg(binary_file_name).status().await.map(|s| s.success()).unwrap_or(false)
    }
}

async fn kill_process(binary_file_name: &str) {
    if cfg!(target_os = "windows") {
        let _ = tokio::process::Command::new("taskkill").args(["/IM", binary_file_name, "/F"]).output().await;
    } else {
        let _ = tokio::process::Command::new("pkill").arg("-f").arg(binary_file_name).status().await;
    }
}

/// zip(Windows)を展開する。このcrateはzip解凍クレートに依存していない
/// ため、既存の`fetch-aruaru-llm.ps1`/`fetch-aruaru-db.ps1`と同じく
/// Windows標準の`Expand-Archive`(PowerShell)を子プロセスとして呼ぶ
/// (新規の解凍ロジックを自前実装するより、OS標準機能の再利用を優先)。
async fn extract_zip(zip_path: &Path, dest_dir: &Path) -> anyhow::Result<()> {
    let status = tokio::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                zip_path.display(),
                dest_dir.display()
            ),
        ])
        .status()
        .await?;
    if !status.success() {
        anyhow::bail!("Expand-Archive failed with status {status}");
    }
    Ok(())
}

/// tar.gz(Linux)を展開する。`self_update.rs::apply_update_unix`と同じ
/// `tar`呼び出しパターン。
async fn extract_tarball(tarball_path: &Path, dest_dir: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(dest_dir)?;
    let status = tokio::process::Command::new("tar")
        .args(["xzf", &tarball_path.to_string_lossy(), "-C"])
        .arg(dest_dir)
        .status()
        .await?;
    if !status.success() {
        anyhow::bail!("tar extraction failed with status {status}");
    }
    Ok(())
}

/// 1コンポーネント分の更新チェック・適用。エラーは呼び出し元(`check_
/// and_apply_all`)がログに残すだけで、他コンポーネント・サーバー本体の
/// 動作には影響させない(可用性優先の既存方針を踏襲)。
async fn check_and_apply_one(exe_dir: &Path, component: &Component) -> anyhow::Result<()> {
    let component_dir = exe_dir.join(component.dir_name);
    if !component_dir.exists() {
        // 「まとめてインストール」を選ばなかった、またはaruaru-db
        // (任意コンポーネント)を同梱しなかった場合。正直に何もしない。
        return Ok(());
    }

    let local_version = local_component_version(&component_dir);
    let release = fetch_latest_release_for(component.repo).await?;
    if !is_newer(&release.tag_name, &local_version) {
        tracing_log_if_available(&format!(
            "open-english component-update ({}): up to date (local {local_version}, latest {})",
            component.dir_name, release.tag_name
        ));
        return Ok(());
    }

    let is_windows = cfg!(target_os = "windows");
    let asset = if is_windows { windows_zip_asset(&release, component.dir_name) } else { linux_tarball_asset(&release, component.dir_name) };
    let Some(asset) = asset else {
        tracing_log_if_available(&format!(
            "open-english component-update ({}): newer release {} found but no {} asset attached — skipping \
             (note: macOS builds for this component do not exist yet, see component_update.rs module doc)",
            component.dir_name,
            release.tag_name,
            if is_windows { "Windows .zip" } else { "Linux .tar.gz" }
        ));
        return Ok(());
    };

    tracing_log_if_available(&format!(
        "open-english component-update ({}): newer release {} found (local {local_version}), downloading {}",
        component.dir_name, release.tag_name, asset.name
    ));

    let dest = std::env::temp_dir().join(format!("open-english-component-{}-{}", component.dir_name, asset.name));
    download_to(&asset.browser_download_url, &dest).await?;

    let bin_name = binary_file_name(component.binary_stem);
    let was_running = is_process_running(&bin_name).await;

    // ロールバック用バックアップ(2026-08-19新設、`self_update.rs`の
    // 自動ロールバック機能と同じ考え方: 上書き前に退避しておき、
    // ヘルスチェック失敗時に復元する)。
    let backup_dir = std::env::temp_dir().join(format!("open-english-component-{}-backup", component.dir_name));
    let _ = std::fs::remove_dir_all(&backup_dir);
    copy_dir_recursive(&component_dir, &backup_dir)?;

    if was_running {
        tracing_log_if_available(&format!(
            "open-english component-update ({}): stopping running process ({bin_name}) before replacing files",
            component.dir_name
        ));
        kill_process(&bin_name).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    let extract_dir = std::env::temp_dir().join(format!("open-english-component-{}-extract", component.dir_name));
    let _ = std::fs::remove_dir_all(&extract_dir);
    if is_windows {
        extract_zip(&dest, &extract_dir).await?;
    } else {
        extract_tarball(&dest, &extract_dir).await?;
    }
    // zip/tarballはinstall.ps1/install.shも同梱するフラット構成
    // (トップレベルディレクトリなし、`fetch-aruaru-*.ps1`の
    // `Expand-Archive -DestinationPath $DestDir`と同じ想定)。既存の
    // component_dir へそのまま上書きコピーする。
    copy_dir_recursive(&extract_dir, &component_dir)?;
    set_executable_permission(&component_dir.join(&bin_name))?;

    let rollback = |reason: String| {
        let component_dir = component_dir.clone();
        let backup_dir = backup_dir.clone();
        let dir_name = component.dir_name;
        async move {
            tracing_log_if_available(&format!("open-english component-update ({dir_name}): {reason} — rolling back to the previous version"));
            let _ = std::fs::remove_dir_all(&component_dir);
            let _ = copy_dir_recursive(&backup_dir, &component_dir);
        }
    };

    if component.kind == ComponentKind::Server {
        // 実HTTPヘルスチェック(既存`maybe_launch_aruaru_llm`と同じ
        // `/healthz`)。新版を起動し、ヘルスチェックが通れば採用、
        // 失敗すれば復元する。
        let bind = std::env::var("ARUARU_LLM_BIND").unwrap_or_else(|_| "127.0.0.1:4600".to_string());
        let candidate = component_dir.join(&bin_name);
        let spawn_result = tokio::process::Command::new(&candidate).env("ARUARU_LLM_BIND", &bind).current_dir(&component_dir).spawn();
        match spawn_result {
            Ok(mut child) => {
                let addr: std::net::SocketAddr = match bind.parse() {
                    Ok(a) => a,
                    Err(_) => "127.0.0.1:4600".parse().unwrap(),
                };
                let mut healthy = false;
                for _ in 0..HEALTH_CHECK_SECS {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    if let Ok(Some(status)) = child.try_wait() {
                        tracing_log_if_available(&format!(
                            "open-english component-update (aruaru-llm): new version exited immediately (status: {status})"
                        ));
                        break;
                    }
                    if health_check(&addr).await {
                        healthy = true;
                        break;
                    }
                }
                if healthy {
                    // 手動ダウングレード用の複数世代履歴(2026-08-20新設)。
                    let _ = crate::self_update::save_history_dir(exe_dir, component.dir_name, &local_version, &backup_dir);
                    write_component_version(&component_dir, &release.tag_name);
                    tracing_log_if_available(&format!(
                        "open-english component-update (aruaru-llm): updated to {} and passed health check",
                        release.tag_name
                    ));
                } else {
                    let _ = child.kill().await;
                    rollback("new version failed health check".to_string()).await;
                }
            }
            Err(e) => {
                rollback(format!("failed to launch new version for health check ({e})")).await;
            }
        }
    } else if component.kind == ComponentKind::DiagnosticCli {
        // 診断CLI(open-cpu-diag等): 常駐プロセスではないため「元々起動
        // していたか」の概念が無い。新版を引数無しで1回実行し、正常終了
        // (exit code 0)すれば採用、異常終了またはそもそも起動できなければ
        // ロールバックする。
        let candidate = component_dir.join(&bin_name);
        match tokio::process::Command::new(&candidate).current_dir(&component_dir).status().await {
            Ok(status) if status.success() => {
                let _ = crate::self_update::save_history_dir(exe_dir, component.dir_name, &local_version, &backup_dir);
                write_component_version(&component_dir, &release.tag_name);
                tracing_log_if_available(&format!(
                    "open-english component-update ({}): updated to {} and ran successfully (exit 0)",
                    component.dir_name, release.tag_name
                ));
            }
            Ok(status) => {
                rollback(format!("new version exited with a non-zero status ({status})")).await;
            }
            Err(e) => {
                rollback(format!("failed to run new version ({e})")).await;
            }
        }
    } else {
        // aruaru-db: モジュールdoc記載の通り、確認できたHTTPヘルスチェック
        // 用エンドポイントが無いため、pgwireポート(既定5432、
        // `ARUARU_DB_PG_PORT`で上書き可)へのTCP接続可否を簡易ヘルス
        // チェックとして使う。**正直な開示**: これは「何かがそのポートで
        // 待ち受けているか」の確認に留まり、実際にpgwireとして正しく
        // 応答するかまでは検証しない。
        let pg_port: u16 = std::env::var("ARUARU_DB_PG_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(5432);
        let candidate = component_dir.join(&bin_name);
        if was_running {
            let spawn_result = tokio::process::Command::new(&candidate).current_dir(&component_dir).spawn();
            match spawn_result {
                Ok(mut child) => {
                    let mut healthy = false;
                    for _ in 0..HEALTH_CHECK_SECS {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                        if let Ok(Some(status)) = child.try_wait() {
                            tracing_log_if_available(&format!(
                                "open-english component-update (aruaru-db): new version exited immediately (status: {status})"
                            ));
                            break;
                        }
                        if tokio::net::TcpStream::connect(("127.0.0.1", pg_port)).await.is_ok() {
                            healthy = true;
                            break;
                        }
                    }
                    if healthy {
                        let _ = crate::self_update::save_history_dir(exe_dir, component.dir_name, &local_version, &backup_dir);
                        write_component_version(&component_dir, &release.tag_name);
                        tracing_log_if_available(&format!(
                            "open-english component-update (aruaru-db): updated to {} and pgwire port {pg_port} is accepting connections",
                            release.tag_name
                        ));
                    } else {
                        let _ = child.kill().await;
                        rollback("new version's pgwire port did not become reachable".to_string()).await;
                    }
                }
                Err(e) => {
                    rollback(format!("failed to launch new version for a connectivity check ({e})")).await;
                }
            }
        } else {
            // 元々起動していなかった場合、ファイルを差し替えるだけに
            // 留め、勝手に起動はしない(aruaru-dbはユーザーが手動起動する
            // 運用のため、`maybe_launch_aruaru_llm`のような自動起動は
            // 行わない設計方針をここでも踏襲)。
            let _ = crate::self_update::save_history_dir(exe_dir, component.dir_name, &local_version, &backup_dir);
            write_component_version(&component_dir, &release.tag_name);
            tracing_log_if_available(&format!(
                "open-english component-update (aruaru-db): files replaced with {} (was not running, so not auto-started)",
                release.tag_name
            ));
        }
    }

    let _ = std::fs::remove_dir_all(&backup_dir);
    let _ = std::fs::remove_dir_all(&extract_dir);
    let _ = std::fs::remove_file(&dest);
    Ok(())
}

/// 起動時のメンテナンスチェックの一部として呼ぶエントリポイント
/// (`main.rs`から`self_update::check_and_apply_update()`と並行して
/// `tokio::spawn`する想定)。open-english本体の自己更新
/// (`self_update.rs`)とは独立に、同梱コンポーネントごとの新版チェックを
/// 順に行う。**正直な開示**: 現状は逐次実行(並行化していない)——
/// コンポーネント数が2つと少なく、シンプルさを優先した。
/// `GET /v1/updates/history`用: 全コンポーネントの現在バージョン+保持
/// している旧バージョン一覧(2026-08-20新設、`self_update.rs`の
/// `ComponentHistoryInfo`をそのまま再利用)。
pub(crate) fn history_info_all() -> Vec<crate::self_update::ComponentHistoryInfo> {
    let Ok(exe) = std::env::current_exe() else { return Vec::new() };
    let Some(exe_dir) = exe.parent() else { return Vec::new() };
    COMPONENTS
        .iter()
        .map(|c| {
            let component_dir = exe_dir.join(c.dir_name);
            let current =
                if component_dir.exists() { local_component_version(&component_dir) } else { "not installed".to_string() };
            let versions = crate::self_update::list_history_versions(exe_dir, c.dir_name);
            crate::self_update::ComponentHistoryInfo { component: c.dir_name.to_string(), current_version: current, available_downgrades: versions }
        })
        .collect()
}

/// `POST /v1/updates/downgrade`用: 指定コンポーネントを保持している
/// 履歴バージョンへ手動で戻す(2026-08-20新設、ユーザー指示「バージョン
/// アップしたらBUGだった場合の為に、簡単にそのBUGのリポジトリだけ
/// ダウングレード出来るように」への対応、主な新規実装対象)。
/// **正直な開示**: 保持世代(既定3世代)を超えて古いバージョンや、この
/// マシンで一度も自動更新が発生していないバージョンへは戻せない。
pub async fn downgrade_component(name: &str, target_version: &str) -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("could not resolve install directory"))?.to_path_buf();
    let component = COMPONENTS.iter().find(|c| c.dir_name == name).ok_or_else(|| anyhow::anyhow!("unknown component: {name}"))?;
    let component_dir = exe_dir.join(component.dir_name);
    let history_dir = crate::self_update::history_root(&exe_dir, component.dir_name).join(target_version);
    if !history_dir.exists() {
        anyhow::bail!(
            "no retained backup for {} version {target_version} (only the last {} generations are kept, and only once \
             at least one automatic update has happened on this machine)",
            component.dir_name,
            crate::self_update::MAX_HISTORY_GENERATIONS
        );
    }

    let bin_name = binary_file_name(component.binary_stem);
    let was_running = is_process_running(&bin_name).await;
    if was_running {
        tracing_log_if_available(&format!("open-english manual downgrade ({}): stopping running process ({bin_name}) before restoring", component.dir_name));
        kill_process(&bin_name).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }

    let _ = std::fs::remove_dir_all(&component_dir);
    copy_dir_recursive(&history_dir, &component_dir)?;
    set_executable_permission(&component_dir.join(&bin_name))?;
    write_component_version(&component_dir, target_version);

    if was_running {
        // 元々起動していた場合のみ再起動する(既存の自動更新ロジックと
        // 同じ「元の起動状態を尊重する」方針、`aruaru-db`が起動していな
        // かった場合に勝手に起動しないのと対称的な扱い)。
        match tokio::process::Command::new(component_dir.join(&bin_name)).current_dir(&component_dir).spawn() {
            Ok(_) => {}
            Err(e) => tracing_log_if_available(&format!("open-english manual downgrade ({}): restored files but failed to restart process ({e})", component.dir_name)),
        }
    }

    tracing_log_if_available(&format!("open-english manual downgrade ({}): switched to {target_version}", component.dir_name));
    Ok(())
}

pub async fn check_and_apply_all() {
    // Android/iOSは`self_update.rs`と同じ理由(サイレント自己更新機構が
    // OS制約上そもそも成立しない)で対象外。
    if !cfg!(any(target_os = "windows", target_os = "linux", target_os = "macos")) {
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(exe_dir) = exe.parent().map(|p| p.to_path_buf()) else { return };

    for component in COMPONENTS {
        if let Err(e) = check_and_apply_one(&exe_dir, component).await {
            tracing_log_if_available(&format!(
                "open-english component-update ({}): failed ({e}) — continuing without updating this component",
                component.dir_name
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> crate::self_update::ReleaseAsset {
        crate::self_update::ReleaseAsset { name: name.to_string(), browser_download_url: format!("https://example.invalid/{name}") }
    }

    fn release_with(names: &[&str]) -> LatestRelease {
        LatestRelease { tag_name: "v1.2.3".to_string(), assets: names.iter().map(|n| asset(n)).collect() }
    }

    #[test]
    fn finds_windows_zip_asset_by_component_prefix() {
        let release = release_with(&["aruaru-llm-windows-x86_64.zip", "aruaru-llm-linux-x86_64.tar.gz"]);
        let found = windows_zip_asset(&release, "aruaru-llm").expect("should find windows asset");
        assert_eq!(found.name, "aruaru-llm-windows-x86_64.zip");
    }

    #[test]
    fn finds_linux_tarball_asset_by_component_prefix() {
        let release = release_with(&["aruaru-db-windows-x86_64.zip", "aruaru-db-linux-x86_64.tar.gz"]);
        let found = linux_tarball_asset(&release, "aruaru-db").expect("should find linux asset");
        assert_eq!(found.name, "aruaru-db-linux-x86_64.tar.gz");
    }

    #[test]
    fn does_not_cross_match_between_components() {
        // aruaru-llmの検索でaruaru-db向けアセットを誤って拾わないこと
        // (プレフィックス一致にしている理由の検証)。
        let release = release_with(&["aruaru-db-windows-x86_64.zip"]);
        assert!(windows_zip_asset(&release, "aruaru-llm").is_none());
    }

    #[test]
    fn finds_open_cpu_diag_assets_by_prefix() {
        // 2026-09-23追加(診断CLIコンポーネント新設)。"open-cpu"だけで
        // 前方一致させると将来的な別アセットとの誤爆余地があるため、
        // dir_nameを"open-cpu-diag"にしたことをここで固定する回帰テスト。
        let release = release_with(&["open-cpu-diag-windows-x86_64.zip", "open-cpu-diag-linux-x86_64.tar.gz"]);
        assert!(windows_zip_asset(&release, "open-cpu-diag").is_some());
        assert!(linux_tarball_asset(&release, "open-cpu-diag").is_some());
    }

    #[test]
    fn component_kind_for_open_cpu_diag_is_diagnostic_cli() {
        let c = COMPONENTS.iter().find(|c| c.dir_name == "open-cpu-diag").expect("open-cpu-diag must be registered");
        assert!(c.kind == ComponentKind::DiagnosticCli);
    }

    #[test]
    fn finds_opencuda_diag_assets_by_prefix() {
        let release = release_with(&["opencuda-diag-windows-x86_64.zip", "opencuda-diag-linux-x86_64.tar.gz"]);
        assert!(windows_zip_asset(&release, "opencuda-diag").is_some());
        assert!(linux_tarball_asset(&release, "opencuda-diag").is_some());
    }

    #[test]
    fn binary_file_name_appends_exe_only_on_windows() {
        let name = binary_file_name("aruaru-server");
        if cfg!(target_os = "windows") {
            assert_eq!(name, "aruaru-server.exe");
        } else {
            assert_eq!(name, "aruaru-server");
        }
    }

    #[test]
    fn missing_version_marker_is_treated_as_unknown_oldest() {
        let tmp = std::env::temp_dir().join("open-english-component-update-test-no-marker");
        let _ = std::fs::create_dir_all(&tmp);
        assert_eq!(local_component_version(&tmp), "0.0.0");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn version_marker_round_trips() {
        let tmp = std::env::temp_dir().join("open-english-component-update-test-marker");
        let _ = std::fs::create_dir_all(&tmp);
        write_component_version(&tmp, "v1.2.3");
        assert_eq!(local_component_version(&tmp), "v1.2.3");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
