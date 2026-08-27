# aruaru-db(PostgreSQLワイヤプロトコル互換の分散DBサーバー、Pure Rust
# 実装)本体を、open-englishインストーラーの「まとめてインストール」
# タスクから取得するスクリプト(2026-08-19新設)。
#
# 正直な開示: aruaru-dbはopen-englishの会話履歴DBの必須要件ではない。
# open-english自体の会話履歴・設定は`server/src/db.rs`が管理するSQLite
# (ローカルファイル、常時利用可能)で完結しており、aruaru-dbは
# `OPEN_ENGLISH_DATABASE_URL`環境変数を設定した場合にのみ有効になる
# ベストエフォートの追加ミラー先(片方に障害があっても他方から復旧
# できる、という安全性向上のためのオプション機能)に過ぎない。
# 未設定であればopen-englishは通常通りSQLite単体で動作する。
#
# これが取得するのは`aruaru-server`(aruaru-db本体、PostgreSQLワイヤ
# プロトコル互換のPure Rust実装で、外部にPostgreSQLサーバー本体を
# 別途インストールする必要はない)の実行ファイルのみ。取得後も既定では
# 起動しない(`OPEN_ENGLISH_DATABASE_URL`を設定してユーザー自身が
# `aruaru-server.exe`を起動しない限りopen-englishからは使われない)。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/aon-co-jp/aruaru-db/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" }
    $asset = $release.assets | Where-Object { $_.name -like "*windows*x86_64*.zip" } | Select-Object -First 1

    if (-not $asset) {
        Write-Output "aruaru-db: no Windows release asset found. Please download it manually from https://github.com/aon-co-jp/aruaru-db/releases"
        exit 0
    }

    $zipPath = Join-Path $DestDir "aruaru-db.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "aruaru-db downloaded to $DestDir. This is OPTIONAL: open-english works fine on SQLite alone. To use aruaru-db as an extra mirror, run aruaru-server.exe yourself, then set the OPEN_ENGLISH_DATABASE_URL environment variable to its PostgreSQL-wire endpoint before starting open-english-server.exe. Tauri Admin GUI / full cluster setup are NOT included here (single-binary only) - see aruaru-db's own README for those."
} catch {
    # ダウンロード失敗はインストーラー全体を止めない(可用性優先、
    # 既存のaruaru-llm同梱スクリプトと同じ方針)。aruaru-dbはあくまで
    # オプション機能のため、失敗してもopen-english本体には影響しない。
    Write-Output "aruaru-db download failed: $_. This is optional and open-english still works via SQLite alone. You can install aruaru-db manually later from https://github.com/aon-co-jp/aruaru-db/releases"
    exit 0
}
