//! ローカルドライブへの常駐エージェント読み書き(2026-08-20新設)。
//!
//! ユーザー指示「ローカルドライブへの自動読み書き: サーバー常駐エージェント
//! 式(open-englishのサーバー側プロセスがローカルファイルシステムへの
//! 常駐アクセス権を持つ)。ユーザーはこれがブラウザ単体の制約より高い
//! セキュリティリスクを伴う設計であることを理解した上で選択済み」への
//! 対応。
//!
//! ## セキュリティ設計(最重要、絶対に省略しないこと)
//!
//! - 書き込み・読み込みとも、`OPEN_ENGLISH_AGENT_ALLOWED_DIRS`環境変数
//!   (セミコロン区切りの絶対パス一覧)で明示的に許可されたディレクトリ
//!   配下のみに限定する。この環境変数が未設定・空の場合は、**一切の
//!   読み書きを許可しない**(既定で無効、オプトイン方式)。
//! - パストラバーサル対策として、要求パスを`dunce`等の外部クレートに
//!   頼らず標準ライブラリのみで正規化(`..`コンポーネントを解決)した
//!   上で、許可ディレクトリのいずれかを前置詞として持つかを確認する。
//!   シンボリックリンクを使った迂回を減らすため、読み込み時は
//!   `std::fs::canonicalize`(実体パス解決)を使い、書き込み時は
//!   ファイルがまだ存在しない場合があるため親ディレクトリを
//!   `canonicalize`してから許可判定する。
//! - 「任意のパスに書き込める」API は絶対に公開しない、という
//!   ユーザー指示を踏まえ、許可ディレクトリチェックを通らないリクエストは
//!   すべて`403 Forbidden`相当のエラーとして拒否する(コード上省略不可の
//!   経路として実装、`main.rs`側のハンドラも必ずこのモジュールの
//!   検証関数を経由させること)。

use anyhow::{bail, Result};
use std::path::{Path, PathBuf};

/// `OPEN_ENGLISH_AGENT_ALLOWED_DIRS`(セミコロン区切り)から許可
/// ディレクトリ一覧を読む。未設定・空文字列のみなら空ベクタを返す
/// (=常に拒否、オプトイン方式)。
pub fn allowed_dirs() -> Vec<PathBuf> {
    std::env::var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS")
        .unwrap_or_default()
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// `path`が`allowed`のいずれかの配下にあるかを確認する。`base_for_check`
/// には呼び出し元が既に正規化(canonicalize)した実体パスを渡すこと——
/// この関数自体は文字列前方一致の確認のみを行う(正規化は呼び出し側の
/// 責務、読み込み/書き込みで正規化のタイミングが異なるため)。
fn is_within_allowed(candidate: &Path, allowed: &[PathBuf]) -> bool {
    allowed.iter().any(|dir| candidate.starts_with(dir))
}

/// ブラウザ側UIの「SETUP済み表示」用の状態確認(2026-09-01新設)。
pub fn status() -> serde_json::Value {
    let allowed = allowed_dirs();
    serde_json::json!({
        "configured": !allowed.is_empty(),
        "allowed_dirs": allowed.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
    })
}

/// 読み込み対象パスを検証し、正規化済みの実体パスを返す。
///
/// 許可ディレクトリが1件も設定されていない場合、または実際に許可
/// ディレクトリの外を指している場合はエラーを返す(黙って読めない
/// ファイルを空扱いにはしない)。
pub fn validate_read_path(requested: &str) -> Result<PathBuf> {
    let allowed = allowed_dirs();
    if allowed.is_empty() {
        bail!("local agent is disabled: set OPEN_ENGLISH_AGENT_ALLOWED_DIRS to opt in / ローカルエージェントは無効です(OPEN_ENGLISH_AGENT_ALLOWED_DIRSで許可ディレクトリを設定してください)");
    }
    let candidate = PathBuf::from(requested);
    let canonical = candidate
        .canonicalize()
        .map_err(|e| anyhow::anyhow!("failed to resolve path {requested:?}: {e}"))?;
    // 許可ディレクトリ自体も同じ規則でcanonicalizeして比較する
    // (許可設定側がシンボリックリンクや`..`を含む書き方をしていても
    // 正しく判定できるようにするため)。
    let allowed_canonical: Vec<PathBuf> = allowed.iter().filter_map(|d| d.canonicalize().ok()).collect();
    if !is_within_allowed(&canonical, &allowed_canonical) {
        bail!("path {requested:?} is outside the allowed directories / 許可ディレクトリの範囲外です");
    }
    Ok(canonical)
}

/// 書き込み対象パスを検証する。ファイル自体はまだ存在しない場合がある
/// ため、親ディレクトリを`canonicalize`してから判定する(親ディレクトリも
/// 存在しない場合はエラー——存在しないディレクトリを勝手に作成しない、
/// 過大な権限を持たせないための意図的な制約)。
pub fn validate_write_path(requested: &str) -> Result<PathBuf> {
    let allowed = allowed_dirs();
    if allowed.is_empty() {
        bail!("local agent is disabled: set OPEN_ENGLISH_AGENT_ALLOWED_DIRS to opt in / ローカルエージェントは無効です(OPEN_ENGLISH_AGENT_ALLOWED_DIRSで許可ディレクトリを設定してください)");
    }
    let candidate = PathBuf::from(requested);
    let Some(parent) = candidate.parent() else {
        bail!("path {requested:?} has no parent directory / 親ディレクトリを特定できません");
    };
    let parent_canonical = parent.canonicalize().map_err(|e| anyhow::anyhow!("failed to resolve parent directory of {requested:?}: {e}"))?;
    let Some(file_name) = candidate.file_name() else {
        bail!("path {requested:?} has no file name / ファイル名を特定できません");
    };
    let allowed_canonical: Vec<PathBuf> = allowed.iter().filter_map(|d| d.canonicalize().ok()).collect();
    if !is_within_allowed(&parent_canonical, &allowed_canonical) {
        bail!("path {requested:?} is outside the allowed directories / 許可ディレクトリの範囲外です");
    }
    Ok(parent_canonical.join(file_name))
}

/// テキストファイルとして読み込む(バイナリファイルはUTF-8として解釈
/// できない場合エラーになる——正直な制約、このAPIはプログラミング
/// 支援向けのテキストソース読み書きに範囲を絞っている)。
pub fn read_file(requested: &str) -> Result<String> {
    let path = validate_read_path(requested)?;
    Ok(std::fs::read_to_string(&path)?)
}

pub fn write_file(requested: &str, content: &str) -> Result<()> {
    let path = validate_write_path(requested)?;
    Ok(std::fs::write(&path, content)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// **2026-08-25修正: テストのフレーク(不安定な失敗)を発見・修正**。
    /// この3件のテストはいずれもプロセス全体で1つしかない環境変数
    /// `OPEN_ENGLISH_AGENT_ALLOWED_DIRS`を`set_var`/`remove_var`する。
    /// 元のコメントは「単一スレッドのテストでは~が標準的な方法」と
    /// 書いていたが、これは誤り——Rustの既定のテストランナーは
    /// `#[test]`関数を**複数スレッドで並行実行する**ため、実際には
    /// 単一スレッド前提が成り立たず、他のテストがこの環境変数を
    /// 変更している最中に割り込まれてアサーションが失敗する
    /// (`cargo test --release`をworld-lab関連の変更と合わせて実行した
    /// 際に実機で再現・発見した)。テスト全体をこの`Mutex`でロックする
    /// ことで、3件が互いに割り込まないよう直列化する(本番コード自体に
    /// バグは無い——テストの分離が不十分だっただけ)。
    static ENV_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn disabled_by_default_when_env_unset() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        std::env::remove_var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS");
        assert!(validate_read_path("C:\\Windows\\win.ini").is_err() || allowed_dirs().is_empty());
        assert!(allowed_dirs().is_empty());
    }

    #[test]
    fn rejects_paths_outside_allowed_dirs() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("open-english-local-agent-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("ok.txt"), "hello").unwrap();
        let outside_dir = std::env::temp_dir().join(format!("open-english-local-agent-outside-{}", std::process::id()));
        std::fs::create_dir_all(&outside_dir).unwrap();
        std::fs::write(outside_dir.join("secret.txt"), "nope").unwrap();

        // SAFETY (test-only): `ENV_TEST_LOCK`が同一プロセス内の他のテスト
        // との並行変更を防いでいるため、ここでの環境変数の変更は安全。
        unsafe {
            std::env::set_var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS", dir.to_string_lossy().to_string());
        }
        assert!(read_file(dir.join("ok.txt").to_str().unwrap()).is_ok());
        assert!(read_file(outside_dir.join("secret.txt").to_str().unwrap()).is_err());
        unsafe {
            std::env::remove_var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS");
        }
        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&outside_dir).ok();
    }

    #[test]
    fn write_then_read_round_trips_within_allowed_dir() {
        let _guard = ENV_TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("open-english-local-agent-test-write-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        unsafe {
            std::env::set_var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS", dir.to_string_lossy().to_string());
        }
        let file_path = dir.join("new_file.txt");
        write_file(file_path.to_str().unwrap(), "generated content").unwrap();
        assert_eq!(read_file(file_path.to_str().unwrap()).unwrap(), "generated content");
        unsafe {
            std::env::remove_var("OPEN_ENGLISH_AGENT_ALLOWED_DIRS");
        }
        std::fs::remove_dir_all(&dir).ok();
    }
}
