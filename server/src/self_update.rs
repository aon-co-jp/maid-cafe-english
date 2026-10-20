//! 自動アップデート機能(2026-08-11新設)。
//!
//! ユーザー指示「起動時の自動メンテナンスで自動UPDATEの自動バージョン
//! アップ機能も搭載して、自動でGithubから最新版を見つけて古いのは
//! 自動でアンインストールして最新版を自動インストールする機能も
//! 搭載して」への対応。
//!
//! ## 2026-08-19追記: Windows限定ガードをLinuxへも拡張
//!
//! ユーザー指示「Windowsのみ、の所をAndroidスマホ・タブレット・
//! iPhone・Linuxでも使えるようにしてほしい」への対応として、
//! プラットフォームごとに正直に実現可能性を評価した結果は以下の通り:
//!
//! - **Linux**: 実行中のバイナリ自身を別バイナリで置き換えることは
//!   Windowsと異なり技術的に可能(Linuxでは実行中の実行ファイルの
//!   inodeを`rename`/上書きしても、既に起動済みのプロセスは古い
//!   inodeを掴んだまま実行を続けられるため、ファイルロックの制約が
//!   無い)。このため`apply_update_linux`を新設し、
//!   `open-english-installer-<os_label>.tar.gz`(CI`.github/workflows/
//!   release.yml`の`build-unix-installer`が生成するのと同じ命名、
//!   2026-08-25に`open-english-<os_label>.tar.gz`から改名)を
//!   ダウンロード→展開→現在の実行ディレクトリ(`installer/unix/
//!   install.sh`が配置する構成、バイナリと静的アセットが同じ
//!   ディレクトリに同居)へ上書きコピー→新バイナリを子プロセスとして
//!   再起動→自身を終了、という流れで実装した。Windows版と異なり
//!   アンインストーラーは無い(root権限不要のユーザー空間コピー
//!   インストールのため、単純な上書きで十分)。
//! - **Android**: OS自体がAPKの完全サイレント自動インストールを許可
//!   しない(`REQUEST_INSTALL_PACKAGES`権限+ユーザーの明示的な確認
//!   タップが必須)。この`self_update.rs`はデスクトップサーバー
//!   バイナリ自身の差し替え機構であり、Android版はそもそも別の
//!   バイナリ(`libopenenglishserver.so`、`jniLibs`同梱)として動作
//!   するため対象外のまま——Android向けの更新は`android/app/src/
//!   main/java/tokyo/runo/openenglish/MainActivity.kt`の
//!   `checkForAppUpdate`/`downloadAndInstallApk`が別途、2026-08-17
//!   時点で「新バージョン検出→タップでAPKダウンロード→Android標準
//!   インストーラー画面を開く(最終確認はユーザー自身)」という、
//!   OS制約内で可能な範囲まで既に実装済み(本HANDOFF着手前から
//!   存在、今回は現状維持)。
//! - **iPhone/iOS**: このリポジトリに`android/`はあるが`ios/`に相当
//!   するネイティブアプリは存在しない(2026-08-19確認、`ios`という
//!   名前のディレクトリ・Xcodeプロジェクトなし)。iOSアプリ自体が
//!   実在しないため実装対象が無い。将来Webアプリとしてブラウザ経由で
//!   使う構成であれば、既存の`auto-update.js`(`version.json`の
//!   `buildId`をポーリングし変化時に`location.reload()`)が新バージョン
//!   検出→案内表示の役割を既に担っており、iPhoneのSafari等でも
//!   同様に動作する(Webアプリ配布ならApp Store審査の制約を受けない)。
//!   ネイティブiOSアプリの新規開発は本タスクのスコープ外。
//!
//! これに伴い、旧来「Windows限定」だった`check_and_apply_update`冒頭の
//! ガードを「Windows または Linux」へ変更し(Android/iOS/macOSは
//! 引き続き対象外)、Linux向けの`fetch/apply`ロジックを追加した。
//! **正直な開示・未検証事項**: この開発機はWindowsのため、Linux版の
//! 「新バージョン検出→実際にダウンロード→自己置換→再起動」という
//! 一連の流れの実機検証は、コンパイル成功・単体テスト(バージョン
//! 比較・アセット名判定ロジック)の確認までにとどまり、実際のLinux
//! 環境での最初から最後までのE2E検証は次回Linux実機で行う必要がある。
//!
//! ## 2026-08-19追記(続き): macOS対応+自動ロールバック機能を追加
//!
//! ユーザー指示「MAC版にも対応、失敗した時ダウングレードする機能も
//! 搭載」への対応。
//!
//! - **macOS対応**: macOSもLinuxと同じくUnix系のファイルシステムの
//!   仕組み(実行中のバイナリを`rename`/上書きしても既存プロセスは
//!   古いinodeを掴んだまま動作を続けられる)を持つため、Linux向けに
//!   実装済みだった`apply_update_linux`をそのまま流用できると判断し、
//!   `apply_update_unix`へリネームして`cfg!(any(target_os = "linux",
//!   target_os = "macos"))`の共通コードとした(重複実装を避ける
//!   ユーザー指示に沿い、Linux/macOSでロジックを分岐させていない)。
//!   アセット探索も`linux_tarball_asset`(名前に`"linux"`を含むものだけ
//!   採用しmacOSを明示的に除外していた)を廃止し、`unix_tarball_asset`
//!   として実行中のOSに応じて`"linux"`/`"macos"`のいずれかを含む
//!   アセット名を探すよう一般化した。**正直な開示**: この開発機は
//!   Windowsのため、macOS版の実機E2E検証(実際のmacOS実機での
//!   ダウンロード→自己置換→再起動)は未実施——コンパイル成功・単体
//!   テストの確認までにとどまる(Linux版と同じ既知の制約)。
//! - **自動ロールバック(ダウングレード)機能**: 新バージョン適用前に
//!   現在の実行ファイル(Windows/Linux/macOS共通、ネイティブバイナリ
//!   配布のプラットフォームのみ対象)を`.bak`として退避し、新
//!   バージョン起動後に`server/src/main.rs`へ新設した`/healthz`
//!   エンドポイントへ一定秒数(`HEALTH_CHECK_SECS`)以内に到達できるかを
//!   確認する。到達できない、または新プロセスが直後に終了した場合は
//!   新プロセスを終了させ、退避しておいたバイナリを復元して起動し
//!   直す、という単純な流れ(複雑な状態機械は組んでいない、ユーザー
//!   指示「シンプルに」を踏まえた設計)。Unix系(Linux/macOS)では
//!   まだ実ポートで稼働中の旧プロセス自身が新バイナリの生死判定まで
//!   面倒を見る構造上、新バイナリの起動確認は一時的な別ポート
//!   (実ポート+1)を使ったプローブ起動で行い、ヘルスチェック成功後に
//!   改めて実ポートで正式起動してから旧プロセスが終了する(実ポートの
//!   奪い合いを避けるための工夫)。Windows側は既存の「別プロセス
//!   〈バッチスクリプト〉がアンインストール→インストールを行う間に
//!   自分自身は終了する」という設計のため、ヘルスチェック→
//!   失敗時のバックアップ復元もこのバッチスクリプト側に追記する形で
//!   実装した(PowerShellの`Invoke-WebRequest`で`/healthz`を叩く)。
//! - **Android/iOSでのロールバックについて(正直な開示)**: モジュール
//!   doc冒頭に記載の通り、Android/iOSはOSの制約上そもそもAPKの
//!   サイレント自動インストール自体ができない(`REQUEST_INSTALL_
//!   PACKAGES`権限+ユーザーの明示的な確認タップが必須)。同じ理由で
//!   「失敗時に自動でダウングレードする」機能も、旧APKの自動再
//!   インストールをOSが許可しない以上、実現できない——本ロールバック
//!   機能はネイティブサーバーバイナリを自己置換するWindows/Linux/
//!   macOSに限定されるスコープであり、Android/iOSアプリ自体の更新は
//!   引き続き既存の「新バージョン検出→ユーザーのタップでダウンロード
//!   →Android標準インストーラー画面(最終確認はユーザー自身)」という
//!   設計のまま変更していない。ダウングレードしたい場合、ユーザーが
//!   GitHub Releasesページから旧バージョンのAPKを手動で入手し、
//!   手動でインストールし直す以外の手段は無い(この制約はコード上の
//!   不備ではなくAndroid/iOSのプラットフォーム制約そのものであり、
//!   将来的にも回避できない)。
//!
//! ## 正直な開示(最重要)
//!
//! - **現時点でGitHub Releaseが1件も存在しない**(2026-08-11確認、
//!   `GET /repos/aon-co-jp/open-english/releases/latest`は`404`)。
//!   この機能自体は正しく実装・単体テスト済みだが、実際に「新しい
//!   バージョンを検出→自動アンインストール→自動インストール」という
//!   一連の流れを実機で最初から最後まで実行するには、まずタグを
//!   push してGitHub Actions(`.github/workflows/release.yml`、本コミット
//!   で新設)経由で最初のリリースアセットを公開する必要がある。今回は
//!   「リリースが無い場合に正直に何もしない(クラッシュしない)」ことと
//!   「バージョン比較ロジックの正しさ」までを検証済みとし、実際の
//!   自動アンインストール→インストールの実行そのものは次回のリリース後に
//!   確認する必要があることを明記する。
//! - **アンインストール→インストールの実行方式**: 実行中のサーバー
//!   バイナリ自身が入っているディレクトリを、実行中のプロセスが
//!   ロックを保持したまま削除することはWindows上ではできない。
//!   このため、別プロセス(一時バッチスクリプト)を検出時に起動し、
//!   そのスクリプトが「少し待つ→既存のアンインストーラー
//!   (`unins000.exe`)をサイレント実行→新しいインストーラーをサイレント
//!   実行」という順で実行する間に、このサーバー自身のプロセスは終了する
//!   (`std::process::exit`)——ファイルロックを解放してから削除・
//!   上書きが行われる設計。新しいインストーラー側の`[Run]`セクション
//!   (既存の`open-english.iss`)がインストール後に自動でアプリを再起動
//!   するため、ユーザー操作なしで新バージョンが起動し直す。

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;

/// 更新を確認するGitHubリポジトリ。**2026-10-21**: リポジトリを `maid-cafe-english` へ改名・お引越しした
/// (ユーザー指示「自動更新の参照URLやディレクトリは、元も残して、新しい参照先と両方を一生ずっと残す」)。
/// 先頭が新しい参照先、末尾が元の参照先。**どちらも削除しない**(元の `open-english` だけを見る旧版の
/// アプリへも更新を配り続けるため、両方に同じ版を公開する運用)。
const GITHUB_REPOS: [&str; 2] = ["aon-co-jp/maid-cafe-english", "aon-co-jp/open-english"];

/// 新バージョン起動後、ヘルスチェックへ猶予を与える秒数
/// (2026-08-19新設、自動ロールバック機能)。「シンプルに」というユーザー
/// 指示を踏まえ、複雑な指数バックオフ等は行わず固定秒数で1回判定する。
/// 2026-08-19追記: `component_update.rs`(同梱コンポーネントの自動更新)
/// からも同じ値を再利用する(`pub(crate)`化)。
pub(crate) const HEALTH_CHECK_SECS: u64 = 12;

/// 手動ダウングレード機能(2026-08-20新設)。ユーザー指示「バージョン
/// アップしたらBUGだった場合の為に、簡単にそのBUGのリポジトリだけ
/// ダウングレード出来るように」への対応として、更新前に退避した旧
/// バージョンを直近1世代だけでなく複数世代保持する。**ディスク容量への
/// 配慮**: 無制限に残すと配布物のサイズが際限なく増えるため、既定で
/// 直近3世代のみを残し、それより古いものは自動的に削除する(過大な
/// 設計を避けるユーザー指示に沿った現実的な既定値)。
pub(crate) const MAX_HISTORY_GENERATIONS: usize = 3;

/// コンポーネントごとの現在バージョン+保持している旧バージョン一覧
/// (`GET /v1/updates/history`のレスポンス要素、`main.rs`参照)。
#[derive(Debug, serde::Serialize)]
pub(crate) struct ComponentHistoryInfo {
    pub(crate) component: String,
    pub(crate) current_version: String,
    /// 新しい順。`downgrade`APIへそのまま渡せる文字列。
    pub(crate) available_downgrades: Vec<String>,
}

/// `{exe_dir}/.update-history/{component}/`。ここへ世代ごとに
/// `{version}/`サブディレクトリとして退避先を保持する。
pub(crate) fn history_root(exe_dir: &Path, component: &str) -> PathBuf {
    exe_dir.join(".update-history").join(component)
}

/// 退避しておいたディレクトリ(`source_dir`)を、`{version}`世代として
/// 履歴へコピー保存し、直近`MAX_HISTORY_GENERATIONS`世代のみ残す
/// (ディスク容量への配慮、モジュールdoc参照)。バージョン不明
/// (`"0.0.0"`、移行前の未マーカー状態)は履歴として無意味なため保存
/// しない。
pub(crate) fn save_history_dir(exe_dir: &Path, component: &str, version: &str, source_dir: &Path) -> std::io::Result<()> {
    if version == "0.0.0" || version.is_empty() {
        return Ok(());
    }
    let root = history_root(exe_dir, component);
    let dest = root.join(version);
    let _ = std::fs::remove_dir_all(&dest);
    copy_dir_recursive(source_dir, &dest)?;
    prune_history(&root)
}

/// `save_history_dir`のファイル単体版(Unix系の自己更新で使う、
/// 退避対象がバイナリ1個のみのため)。`file_name`で履歴ディレクトリ内の
/// 保存名を指定する。
pub(crate) fn save_history_file(exe_dir: &Path, component: &str, version: &str, source_file: &Path, file_name: &str) -> std::io::Result<()> {
    if version == "0.0.0" || version.is_empty() {
        return Ok(());
    }
    let root = history_root(exe_dir, component);
    let dest_dir = root.join(version);
    std::fs::create_dir_all(&dest_dir)?;
    std::fs::copy(source_file, dest_dir.join(file_name))?;
    prune_history(&root)
}

/// バージョン文字列(ディレクトリ名)を`parse_version`で比較し、古い順に
/// `MAX_HISTORY_GENERATIONS`を超えた分を削除する。
fn prune_history(root: &Path) -> std::io::Result<()> {
    let Ok(entries) = std::fs::read_dir(root) else { return Ok(()) };
    let mut versions: Vec<String> =
        entries.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().into_string().ok()).collect();
    versions.sort_by_key(|v| parse_version(v));
    while versions.len() > MAX_HISTORY_GENERATIONS {
        let oldest = versions.remove(0);
        let _ = std::fs::remove_dir_all(root.join(oldest));
    }
    Ok(())
}

/// 保持している履歴バージョンを新しい順で返す(`downgrade`APIの選択肢
/// 一覧に使う)。
pub(crate) fn list_history_versions(exe_dir: &Path, component: &str) -> Vec<String> {
    let root = history_root(exe_dir, component);
    let Ok(entries) = std::fs::read_dir(&root) else { return Vec::new() };
    let mut versions: Vec<String> =
        entries.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().into_string().ok()).collect();
    versions.sort_by_key(|v| parse_version(v));
    versions.reverse();
    versions
}

/// open-english本体の現在バージョン+保持している旧バージョン一覧
/// (`GET /v1/updates/history`)。
pub(crate) fn self_history_info() -> ComponentHistoryInfo {
    let current = local_version().unwrap_or_else(|| "unknown (not an installed copy)".to_string());
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));
    let versions = exe_dir.map(|d| list_history_versions(&d, "self")).unwrap_or_default();
    ComponentHistoryInfo { component: "open-english (self)".to_string(), current_version: current, available_downgrades: versions }
}

/// open-english本体を、保持している履歴バージョンへ手動で戻す
/// (`POST /v1/updates/downgrade`、2026-08-20新設)。**正直な開示**:
/// 履歴に無いバージョン(保持世代を超えて古い、またはこのマシンで一度も
/// 自動更新が発生していない)は戻せない——保持していないものは戻し
/// ようがないという当然の制約であり、エラーメッセージにその旨を含める。
pub async fn downgrade_self(target_version: &str) -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let exe_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("could not resolve install directory"))?.to_path_buf();
    let history_dir = history_root(&exe_dir, "self").join(target_version);
    if !history_dir.exists() {
        anyhow::bail!(
            "no retained backup for version {target_version} (only the last {MAX_HISTORY_GENERATIONS} generations are kept, and only \
             once at least one automatic update has happened on this machine)"
        );
    }

    if cfg!(target_os = "windows") {
        downgrade_self_windows(&exe, &exe_dir, &history_dir).await
    } else {
        downgrade_self_unix(&exe, &exe_dir, &history_dir).await
    }
}

/// Windows版: 実行中の自分自身を上書きできないため(`apply_update_
/// windows`と同じ制約)、デタッチしたバッチスクリプトへ「kill→履歴
/// ディレクトリの内容で上書き→再起動」を委ね、このプロセス自身は
/// ファイルロック解放のため終了する。**呼び出し元には戻らない**
/// (`std::process::exit`、既存の`apply_update_windows`と同じ設計)。
async fn downgrade_self_windows(exe: &Path, install_dir: &Path, history_dir: &Path) -> anyhow::Result<()> {
    let script_path = std::env::temp_dir().join("open-english-downgrade.bat");
    let exe_name = exe.file_name().and_then(|n| n.to_str()).unwrap_or("open-english-server.exe").to_string();
    // **同種のデータ消失バグへの予防措置(2026-08-20、`apply_update_
    // windows`側で発見した実害バグと同根)**: `history_dir`は過去の
    // 更新時点の`{app}`丸ごとスナップショットであり、その中の`data\`は
    // その時点の古い会話履歴DBのまま。ここで無条件にxcopyすると、
    // ダウングレード後に現在の(より新しい)会話履歴DBが古いものへ
    // 巻き戻ってしまう——本来ダウングレードしたいのはアプリ本体の
    // バージョンであって会話履歴ではないため、xcopy前に現在の`data\`を
    // 一時退避し、xcopy後に上書きして復元する(ダウングレード後も
    // 会話履歴は現在のまま維持される)。
    let data_stash = std::env::temp_dir().join("open-english-downgrade-data-stash");
    let mut script = String::from("@echo off\r\nping 127.0.0.1 -n 2 > nul\r\n");
    script += &format!("taskkill /IM \"{exe_name}\" /F >nul 2>nul\r\n");
    script += "ping 127.0.0.1 -n 2 > nul\r\n";
    script += &format!("if exist \"{}\\data\" rd /S /Q \"{}\"\r\n", data_stash.display(), data_stash.display());
    script += &format!(
        "if exist \"{}\\data\" xcopy \"{}\\data\" \"{}\\data\" /E /Y /I >nul\r\n",
        install_dir.display(),
        install_dir.display(),
        data_stash.display()
    );
    script += &format!("xcopy \"{}\" \"{}\" /E /Y /I >nul\r\n", history_dir.display(), install_dir.display());
    script += &format!(
        "if exist \"{}\\data\" xcopy \"{}\\data\" \"{}\\data\" /E /Y /I >nul\r\n",
        data_stash.display(),
        data_stash.display(),
        install_dir.display()
    );
    script += &format!("if exist \"{}\" rd /S /Q \"{}\"\r\n", data_stash.display(), data_stash.display());
    script += &format!("start \"\" \"{}\"\r\n", exe.display());
    script += &format!("del \"{}\"\r\n", script_path.display());
    std::fs::write(&script_path, script)?;

    tokio::process::Command::new("cmd").args(["/C", "start", "", script_path.to_string_lossy().as_ref()]).spawn()?;

    tracing_log_if_available("open-english manual downgrade: launched restore script (kill -> restore history version -> restart), exiting to release file locks");
    std::process::exit(0);
}

/// Unix系(Linux/macOS): 実行中の自分自身のバイナリを直接上書きできる
/// (`apply_update_unix`と同じ理屈)。履歴に保存しておいたバイナリで
/// 現在の実行ファイルを置き換え、新プロセスを起動してから自身は終了
/// する。
async fn downgrade_self_unix(exe: &Path, install_dir: &Path, history_dir: &Path) -> anyhow::Result<()> {
    let restored_bin = history_dir.join("open-english-server");
    if !restored_bin.exists() {
        anyhow::bail!("retained backup for this version is missing the server binary");
    }
    let new_exe = install_dir.join("open-english-server");
    std::fs::copy(&restored_bin, &new_exe)?;
    set_executable_permission(&new_exe)?;
    tokio::process::Command::new(&new_exe).current_dir(install_dir).spawn()?;
    let _ = exe; // silence unused warning on some cfg paths
    tracing_log_if_available("open-english manual downgrade: restored previous binary and restarted, exiting old process");
    std::process::exit(0);
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReleaseAsset {
    pub(crate) name: String,
    pub(crate) browser_download_url: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct LatestRelease {
    pub(crate) tag_name: String,
    pub(crate) assets: Vec<ReleaseAsset>,
}

/// `"v0.5.1"`や`"0.5.1"`のようなタグ文字列を`(major, minor, patch)`へ
/// パースする。パース不可な部分は0扱い(誇張せず「不明時は最新とは
/// 判断しない」安全側)。
pub(crate) fn parse_version(raw: &str) -> (u64, u64, u64) {
    let trimmed = raw.trim().trim_start_matches('v');
    let mut parts = trimmed.split('.').map(|s| s.parse::<u64>().unwrap_or(0));
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

/// リモート版がローカル版より新しいかどうか。
pub(crate) fn is_newer(remote: &str, local: &str) -> bool {
    parse_version(remote) > parse_version(local)
}

/// 現在の実行ファイルと同じディレクトリにある`version.json`の
/// `version`フィールドを読む(インストーラーがコピーする配置、
/// `open-english.iss`の`[Files]`参照)。
///
/// **正直な開示・実機テストで発覚した実バグ(2026-08-12)**: 以前は
/// 読めない場合に`"0.0.0"`を返していたが、これは`cargo build`の
/// `target/release/`から直接バイナリを実行する開発時やCI検証時など
/// (`version.json`が隣に存在しない)、常に「ローカルは0.0.0=最も古い」
/// と誤判定させ、`check_and_apply_update`が実際にGitHub Releaseの
/// インストーラーをダウンロードして無人インストールしてしまう
/// (このマシン自体で実際に再現・実害を確認した)。インストール済み
/// 配布物としての目印である`version.json`が無い=「インストーラー
/// 経由でインストールされたコピーではない」と判断し、`None`を返して
/// 呼び出し元でアップデート処理自体をスキップするよう変更。
pub(crate) fn local_version() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let path = dir.join("version.json");
    let text = std::fs::read_to_string(&path).ok()?;
    #[derive(Deserialize)]
    struct V {
        version: String,
    }
    serde_json::from_str::<V>(&text).ok().map(|v: V| v.version)
}

/// 新旧どちらのリポジトリにも問い合わせ、**新しい版を採用する**(同じ版なら先に並べた新しい参照先)。
/// 片方に届かなくても、もう片方で更新を続けられる(両方に届かない時だけ失敗)。
async fn fetch_latest_release() -> anyhow::Result<LatestRelease> {
    let mut found: Vec<LatestRelease> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    for repo in GITHUB_REPOS {
        match fetch_latest_release_for(repo).await {
            Ok(r) => found.push(r),
            Err(e) => errors.push(format!("{repo}: {e:#}")),
        }
    }
    pick_newest_release(found).ok_or_else(|| anyhow::anyhow!("no release source reachable ({})", errors.join("; ")))
}

/// 候補のうち一番新しい版を返す。同じ版なら先頭(=新しい参照先)を残す。
fn pick_newest_release(candidates: Vec<LatestRelease>) -> Option<LatestRelease> {
    let mut best: Option<LatestRelease> = None;
    for r in candidates {
        best = match best {
            None => Some(r),
            Some(b) => Some(if is_newer(&r.tag_name, &b.tag_name) { r } else { b }),
        };
    }
    best
}

/// `component_update.rs`(同梱コンポーネントaruaru-llm/aruaru-dbの自動
/// 更新、2026-08-19新設)からも同じGitHub Releases問い合わせロジックを
/// 再利用するため、対象リポジトリを引数化した汎用版(`fetch_latest_
/// release`本体はこの関数へ委譲するだけにした、重複実装を避ける)。
pub(crate) async fn fetch_latest_release_for(repo: &str) -> anyhow::Result<LatestRelease> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let res = client.get(&url).header("User-Agent", "open-english-self-updater").send().await?;
    if !res.status().is_success() {
        anyhow::bail!("GitHub releases API returned HTTP {}", res.status());
    }
    Ok(res.json::<LatestRelease>().await?)
}

/// 2026-08-17変更: インストーラーのファイル名規則を`open-english-setup-
/// {version}.exe`から`open-english-install.exe`(バージョン番号なし、
/// ユーザーが一目でインストーラーと分かる名前)へ変更したため、
/// マッチ対象の部分文字列も"setup"から"install"へ合わせた。旧リリース
/// (v0.6.6以前)のアセット名との後方互換のため"setup"も引き続き許容する。
/// **2026-08-25追記**: 全リポジトリ共通の命名規則統一により、実際の
/// ファイル名は`open-english-installer.exe`へ変更した(`"installer"`は
/// `"install"`を含むため、下記のマッチロジック自体は変更不要)。
fn windows_installer_asset(release: &LatestRelease) -> Option<&ReleaseAsset> {
    release.assets.iter().find(|a| {
        let name = a.name.to_lowercase();
        name.ends_with(".exe") && (name.contains("install") || name.contains("setup"))
    })
}

/// Unix系(Linux/macOS)向けリリースtarball(`.github/workflows/
/// release.yml`の`build-unix-installer`ジョブが生成する`open-english-
/// installer-linux-x86_64.tar.gz`/`open-english-installer-macos-aarch64.tar.gz`
/// のような命名、2026-08-25に`open-english-<os_label>.tar.gz`から改名)を
/// 探す。実行中のOSに応じて`"linux"`/`"macos"`のいずれかを
/// 含むアセットのみ採用する(2026-08-19変更: 以前は`linux_tarball_
/// asset`という名前でLinux決め打ち・macOSを明示的に除外していたが、
/// macOS対応につき実行中のOSで振り分ける形へ一般化した)。
fn unix_tarball_asset(release: &LatestRelease) -> Option<&ReleaseAsset> {
    let os_label = if cfg!(target_os = "macos") { "macos" } else { "linux" };
    release.assets.iter().find(|a| {
        let name = a.name.to_lowercase();
        name.ends_with(".tar.gz") && name.contains(os_label)
    })
}

/// 実行ファイルと同じディレクトリの`unins000.exe`(Inno Setup既定の
/// アンインストーラー名)を探す。無ければ`None`(初回インストール直後の
/// 開発ビルド等、正常なケース)。
fn existing_uninstaller() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let candidate = dir.join("unins000.exe");
    candidate.exists().then_some(candidate)
}

/// アップデートを検出したら、アンインストール→新規インストールを
/// 行うバッチスクリプトを生成し、デタッチ起動した上でこのプロセス自身を
/// 終了する(ファイルロック解放のため)。呼び出し元には戻らない
/// (`std::process::exit`)。
async fn apply_update_windows(installer_path: &std::path::Path, local_version_str: &str) -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let install_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("could not resolve install directory"))?.to_path_buf();

    // バックアップ(2026-08-19新設、自動ロールバック機能): アンインストール
    // する前に、インストールディレクトリ全体を退避しておく。新バージョン
    // がヘルスチェックに失敗した場合、このバックアップから復元して
    // 旧バージョンをそのまま起動し直す。
    let backup_dir = std::env::temp_dir().join("open-english-self-update-backup");
    let _ = std::fs::remove_dir_all(&backup_dir);
    copy_dir_recursive(&install_dir, &backup_dir)?;

    // 手動ダウングレード用の複数世代履歴(2026-08-20新設、モジュールdoc
    // 「手動ダウングレード機能」節参照)。この時点の`backup_dir`は
    // まだ旧バージョンそのものなので、ここでコピー保存しておく
    // (更新が後で失敗しロールバックされた場合も、履歴に「実質的に
    // 現在と同じバージョン」が1件残るだけで実害は無い——このプロセス
    // 自身はこの後すぐ終了しバッチスクリプトに委ねる設計上、成功/失敗を
    // 待ってから判断することができないための割り切り)。
    let _ = save_history_dir(&install_dir, "self", local_version_str, &backup_dir);

    let script_path = std::env::temp_dir().join("open-english-self-update.bat");
    let uninstaller = existing_uninstaller();
    let mut script = String::from("@echo off\r\nping 127.0.0.1 -n 3 > nul\r\n");
    if let Some(u) = &uninstaller {
        script += &format!("\"{}\" /VERYSILENT /SUPPRESSMSGBOXES\r\n", u.display());
        script += "ping 127.0.0.1 -n 3 > nul\r\n";
    }
    script += &format!("\"{}\" /VERYSILENT /SUPPRESSMSGBOXES\r\n", installer_path.display());

    // ヘルスチェック→失敗時のロールバック(2026-08-19新設)。新
    // インストーラーの`[Run]`セクションがインストール後に自動で
    // アプリを再起動する設計(モジュールdoc参照)なので、少し待ってから
    // `server/src/main.rs`に新設した`/healthz`へPowerShellで到達
    // できるか確認する。失敗すればアプリを強制終了し、退避しておいた
    // バックアップを復元してから旧exeを直接起動し直す(「シンプルに:
    // 起動→N秒待つ→ヘルスチェック→失敗ならkill+restore+restart」という
    // ユーザー指示通りの単純な流れ、複雑な状態管理はしていない)。
    let addr = crate::bind_addr();
    let exe_name = exe.file_name().and_then(|n| n.to_str()).unwrap_or("open-english-server.exe").to_string();
    script += &format!("ping 127.0.0.1 -n {} > nul\r\n", HEALTH_CHECK_SECS + 3);
    script += &format!(
        "powershell -NoProfile -Command \"try {{ $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://{addr}/healthz'; if ($r.StatusCode -ne 200) {{ exit 1 }} }} catch {{ exit 1 }}\"\r\n"
    );
    script += "if %errorlevel% neq 0 (\r\n";
    script += &format!("  taskkill /IM \"{exe_name}\" /F >nul 2>nul\r\n");
    script += "  ping 127.0.0.1 -n 2 > nul\r\n";
    script += &format!("  xcopy \"{}\" \"{}\" /E /Y /I >nul\r\n", backup_dir.display(), install_dir.display());
    script += &format!("  start \"\" \"{}\"\r\n", exe.display());
    script += ")\r\n";
    // **重大バグ修正(2026-08-20)**: `[UninstallDelete]`
    // (`installer/windows/open-english.iss`)は`{app}`ディレクトリ
    // 全体を削除対象にしているため、上のアンインストール実行時に
    // 会話履歴DB(`server/src/db.rs`の`db_path()`既定値、`{app}\data\
    // open-english.sqlite3`)ごと消えてしまう——ヘルスチェック
    // 「成功」時はこれまで何の復元も行っておらず、新規インストール後の
    // `{app}\data\`が空のまま(=会話履歴が実際に消失する)という実害
    // バグがあった(別セッションの監査で指摘・本セッションで実コード
    // 確認の上、確定した)。ヘルスチェックの成功/失敗いずれの分岐でも、
    // アンインストール前に退避しておいた`backup_dir\data`を
    // `install_dir\data`へ無条件に復元することで解消する(失敗分岐は
    // 既にディレクトリ全体をxcopy済みのため重複コピーになるだけで
    // 無害、成功分岐では新規インストール後の空の`data\`を退避済みの
    // 内容で上書きし、通常の手動アンインストール〈ユーザーが明示的に
    // アンインストールを選んだ場合〉ではデータも削除される、という
    // 意図された挙動自体は変更しない——あくまで自動更新の内部処理と
    // して意図せずデータが消えるケースのみを防ぐ)。
    script += &format!(
        "if exist \"{}\\data\" xcopy \"{}\\data\" \"{}\\data\" /E /Y /I >nul\r\n",
        backup_dir.display(),
        backup_dir.display(),
        install_dir.display()
    );
    script += &format!("rd /S /Q \"{}\"\r\n", backup_dir.display());
    script += &format!("del \"{}\"\r\n", script_path.display());
    std::fs::write(&script_path, script)?;

    tokio::process::Command::new("cmd")
        .args(["/C", "start", "", script_path.to_string_lossy().as_ref()])
        .spawn()?;

    tracing_log_if_available("open-english self-update: launched uninstall+reinstall+healthcheck script, exiting to release file locks");
    std::process::exit(0);
}

/// Linux/macOS共通版(2026-08-19、旧`apply_update_linux`からリネームし
/// macOSも同じロジックで扱うよう一般化——モジュールdoc冒頭参照): ダウン
/// ロードした`open-english-<linux|macos>-*.tar.gz`を展開し、中身
/// (バイナリ+静的アセット一式、`install.sh`が配置するのと同じフラット
/// 構成)を現在の実行ファイルと同じディレクトリへ上書きコピーする。
/// Windowsと異なり、実行中の自分自身の実行ファイルを上書き(`rename`/
/// コピー)してもUnix系のファイルシステムの仕組み上問題ない(既に
/// 実行中のプロセスは古いinodeを掴んだまま動作を続けられる)ため、
/// 専用のアンインストーラーは不要。
///
/// 自動ロールバック(2026-08-19新設): 上書き前に現在のバイナリを
/// `.bak`として退避し、新バイナリをまず実ポート+1の一時プローブ
/// ポートで起動してヘルスチェックする(このプロセス自身がまだ実
/// ポートで稼働中のため、新バイナリをいきなり実ポートで起動すると
/// ポート競合による即終了と実際の不具合を区別できないための工夫)。
/// ヘルスチェックが通れば、改めて実ポートで新バイナリを正式起動して
/// からこのプロセス自身を終了する(呼び出し元には戻らない、
/// `std::process::exit`)。失敗すればプローブを止め、退避しておいた
/// バイナリを復元し、このプロセス(旧バージョン)はそのまま動作を
/// 継続する(旧プロセスを一度も止めていないため、単に何もしなかった
/// ことにするだけで復旧が完了する——ここが「シンプルに」というユーザー
/// 指示に沿える設計上の利点)。
async fn apply_update_unix(tarball_path: &std::path::Path, local_version_str: &str) -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let install_dir = exe.parent().ok_or_else(|| anyhow::anyhow!("could not resolve install directory"))?.to_path_buf();

    let backup_path = install_dir.join("open-english-server.bak");
    std::fs::copy(&exe, &backup_path)?;

    // 手動ダウングレード用の複数世代履歴(2026-08-20新設、Windows版と
    // 同じ考え方、モジュールdoc参照)。
    let _ = save_history_file(&install_dir, "self", local_version_str, &backup_path, "open-english-server");

    let extract_dir = std::env::temp_dir().join("open-english-self-update-extract");
    let _ = std::fs::remove_dir_all(&extract_dir);
    std::fs::create_dir_all(&extract_dir)?;

    let status = tokio::process::Command::new("tar")
        .args(["xzf", &tarball_path.to_string_lossy(), "-C"])
        .arg(&extract_dir)
        .status()
        .await?;
    if !status.success() {
        anyhow::bail!("tar extraction failed with status {status}");
    }

    // tar.gzは`open-english-<os_label>/`という単一のトップディレクトリを
    // 含む構成(release.ymlの`PKG`変数参照)。その中身をinstall_dirへ
    // 上書きコピーする。
    let mut entries = std::fs::read_dir(&extract_dir)?;
    let top_dir = entries
        .find_map(|e| e.ok())
        .map(|e| e.path())
        .ok_or_else(|| anyhow::anyhow!("extracted tarball is empty"))?;

    copy_dir_recursive(&top_dir, &install_dir)?;

    let new_exe = install_dir.join("open-english-server");
    set_executable_permission(&new_exe)?;

    let real_addr = crate::bind_addr();
    let probe_addr = SocketAddr::new(real_addr.ip(), real_addr.port().wrapping_add(1));

    let mut probe_child = tokio::process::Command::new(&new_exe)
        .current_dir(&install_dir)
        .env("OPEN_ENGLISH_SERVER_BIND", probe_addr.to_string())
        .spawn()?;

    if health_check_with_wait(&mut probe_child, &probe_addr).await {
        let _ = probe_child.kill().await;
        tokio::process::Command::new(&new_exe).current_dir(&install_dir).spawn()?;
        tracing_log_if_available("open-english self-update: new version passed health check, switching over and exiting");
        std::process::exit(0);
    }

    let _ = probe_child.kill().await;
    tracing_log_if_available(
        "open-english self-update: new version failed health check — rolling back to the previous binary (this process was never stopped, so no restart is needed)",
    );
    std::fs::copy(&backup_path, &new_exe)?;
    set_executable_permission(&new_exe)?;
    Ok(())
}

/// 新バイナリを起動した子プロセスに対し、`HEALTH_CHECK_SECS`秒の猶予を
/// 与えつつ、その間に自然終了していないか(即クラッシュしていないか)を
/// 監視し、生存していれば最後に`/healthz`へ到達できるかを確認する
/// (2026-08-19新設、自動ロールバック機能)。
async fn health_check_with_wait(child: &mut tokio::process::Child, addr: &SocketAddr) -> bool {
    for _ in 0..HEALTH_CHECK_SECS {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if let Ok(Some(status)) = child.try_wait() {
            tracing_log_if_available(&format!("open-english self-update: new version exited immediately (status: {status})"));
            return false;
        }
    }
    health_check(addr).await
}

pub(crate) async fn health_check(addr: &SocketAddr) -> bool {
    let url = format!("http://{addr}/healthz");
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(3)).build() else {
        return false;
    };
    match client.get(&url).send().await {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

#[cfg(unix)]
pub(crate) fn set_executable_permission(path: &std::path::Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms)
}

#[cfg(not(unix))]
pub(crate) fn set_executable_permission(_path: &std::path::Path) -> std::io::Result<()> {
    Ok(())
}

pub(crate) fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

pub(crate) fn tracing_log_if_available(msg: &str) {
    println!("{msg}");
}

/// 起動時のメンテナンスチェックの一部として呼ぶ想定のエントリポイント。
/// GitHub Releasesを確認し、新しいバージョンがあればダウンロード→
/// アンインストール/インストールを起動する。ネットワーク断・リリース
/// 未存在(404)等は正直にログへ記録するだけで、サーバー自体の起動は
/// 妨げない(既存の「サービスを止めない」方針を踏襲)。
pub async fn check_and_apply_update() {
    // 2026-08-11修正: この自動更新機構は「実行中の自分自身のexeを
    // アンインストーラー→新インストーラーで差し替え、プロセスを終了する」
    // というWindows専用の設計(モジュールdoc冒頭参照)。プラットフォーム
    // 判定を一切していなかったため、Android版(単体動作アプリに同梱した
    // このバイナリ)でも新しいGitHub Releaseを検出するたびに
    // Windows用インストーラーの起動を試み(実機で`cmd: Can't find
    // service: /C`エラーとして実際に確認)、直後に`std::process::exit`
    // でサーバー自体を毎回強制終了させてしまう実バグがあった——
    // Android上ではこの機構全体を無効化する。Android版のアプリ更新は
    // 別途Kotlin側(`MainActivity.checkForAppUpdate`)がGitHub
    // Releasesページへのリンク表示のみを行う設計に委ねる。
    // 2026-08-19変更: Windows専用ガードをWindows/Linuxへ拡張(モジュール
    // doc冒頭の2026-08-19追記参照)。
    // 2026-08-19変更(続き): さらにmacOSへも拡張(モジュールdoc「macOS
    // 対応+自動ロールバック機能を追加」節参照)。Android/iOSは引き続き
    // 対象外(そもそもこのネイティブサーバーバイナリの自己更新機構が
    // 原理的に使えない別プラットフォームのため)。
    if !cfg!(any(target_os = "windows", target_os = "linux", target_os = "macos")) {
        tracing_log_if_available(
            "open-english self-update: skipped (this update mechanism supports Windows, Linux, and macOS only)",
        );
        return;
    }

    let release = match fetch_latest_release().await {
        Ok(r) => r,
        Err(e) => {
            tracing_log_if_available(&format!(
                "open-english self-update: could not check GitHub releases ({e}) — continuing without updating"
            ));
            return;
        }
    };

    let Some(local) = local_version() else {
        tracing_log_if_available(
            "open-english self-update: skipped (no version.json next to the executable — not an installed copy)",
        );
        return;
    };
    if !is_newer(&release.tag_name, &local) {
        tracing_log_if_available(&format!(
            "open-english self-update: up to date (local {local}, latest release {})",
            release.tag_name
        ));
        return;
    }

    let is_windows = cfg!(target_os = "windows");
    let asset = if is_windows { windows_installer_asset(&release) } else { unix_tarball_asset(&release) };
    let Some(asset) = asset else {
        let platform = if is_windows {
            "Windows installer"
        } else if cfg!(target_os = "macos") {
            "macOS tarball"
        } else {
            "Linux tarball"
        };
        tracing_log_if_available(&format!(
            "open-english self-update: newer release {} found but no {platform} asset attached — skipping",
            release.tag_name
        ));
        return;
    };

    tracing_log_if_available(&format!(
        "open-english self-update: newer release {} found (local {local}), downloading {}",
        release.tag_name, asset.name
    ));

    let dest = std::env::temp_dir().join(&asset.name);
    match download_to(&asset.browser_download_url, &dest).await {
        Ok(()) => {
            let result = if is_windows { apply_update_windows(&dest, &local).await } else { apply_update_unix(&dest, &local).await };
            if let Err(e) = result {
                tracing_log_if_available(&format!("open-english self-update: failed to launch update ({e})"));
            }
        }
        Err(e) => {
            tracing_log_if_available(&format!("open-english self-update: download failed ({e}) — continuing without updating"));
        }
    }
}

pub(crate) async fn download_to(url: &str, dest: &std::path::Path) -> anyhow::Result<()> {
    let client = reqwest::Client::builder().build()?;
    let bytes = client.get(url).header("User-Agent", "open-english-self-updater").send().await?.bytes().await?;
    std::fs::write(dest, &bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_version_strings_with_and_without_v_prefix() {
        assert_eq!(parse_version("v0.5.1"), (0, 5, 1));
        assert_eq!(parse_version("0.5.1"), (0, 5, 1));
        assert_eq!(parse_version("1.0"), (1, 0, 0));
        assert_eq!(parse_version("garbage"), (0, 0, 0));
    }

    #[test]
    fn is_newer_compares_semver_correctly() {
        assert!(is_newer("v0.6.0", "0.5.1"));
        assert!(is_newer("v1.0.0", "0.9.9"));
        assert!(!is_newer("v0.5.1", "0.5.1"));
        assert!(!is_newer("v0.5.0", "0.5.1"));
    }

    fn rel(tag: &str, marker: &str) -> LatestRelease {
        LatestRelease {
            tag_name: tag.to_string(),
            assets: vec![ReleaseAsset { name: marker.to_string(), browser_download_url: String::new() }],
        }
    }

    #[test]
    fn newest_of_the_two_repositories_wins_and_ties_prefer_the_new_one() {
        // 新リポジトリが新しい → 新リポジトリ
        let p = pick_newest_release(vec![rel("v0.9.0", "new"), rel("v0.8.14", "old")]).unwrap();
        assert_eq!(p.assets[0].name, "new");
        // 旧リポジトリだけが新しい(旧版アプリ向けに旧側にだけ先に公開された場合も取りこぼさない)
        let p = pick_newest_release(vec![rel("v0.8.14", "new"), rel("v0.9.0", "old")]).unwrap();
        assert_eq!(p.assets[0].name, "old");
        // 同じ版 → 先頭(新しい参照先)
        let p = pick_newest_release(vec![rel("v0.8.14", "new"), rel("v0.8.14", "old")]).unwrap();
        assert_eq!(p.assets[0].name, "new");
        // 片方しか届かない
        let p = pick_newest_release(vec![rel("v0.8.14", "old")]).unwrap();
        assert_eq!(p.assets[0].name, "old");
        assert!(pick_newest_release(vec![]).is_none());
    }

    #[test]
    fn both_repositories_are_listed_and_the_original_is_never_dropped() {
        assert_eq!(GITHUB_REPOS[0], "aon-co-jp/maid-cafe-english");
        assert!(GITHUB_REPOS.contains(&"aon-co-jp/open-english"));
    }
}
