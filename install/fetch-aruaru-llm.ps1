# aruaru-llm(AI応答エンジン)本体を、open-englishインストーラーの
# 「まとめてインストール」タスクから取得するスクリプト(2026-08-11新設)。
#
# 正直な開示: これはaruaru-llmの実行ファイルのみを取得する。GPT-2/
# DistilGPT-2の実モデル重み(数百MB〜数GB)は含まない——ただしこれは
# 手動コマンド不要で取得できる。open-englishを起動し「⚙ Setup
# aruaru-llm.」パネル内の「🧠 Recommend LLM / おすすめLLM」ボタンを
# 押すだけでよい(内部でaruaru-llm側のAPIを自動的に呼ぶGUI導線、
# 2026-08-26修正——以前は`POST /v1/models/install`という生のAPI呼び
# 出しを案内していたが、これは大半の利用者が実行できないコマンドで
# あり不親切だった)。aruaru-db・PostgreSQLは含まない——それぞれ別
# リポジトリのセットアップ手順に従うこと(README-INSTALLED.txt参照)。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/aon-co-jp/aruaru-llm/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" }
    $asset = $release.assets | Where-Object { $_.name -like "*windows*x86_64*.zip" } | Select-Object -First 1

    if (-not $asset) {
        Write-Output "aruaru-llm: no Windows release asset found. Please download it manually from https://github.com/aon-co-jp/aruaru-llm/releases"
        exit 0
    }

    $zipPath = Join-Path $DestDir "aruaru-llm.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "aruaru-llm downloaded to $DestDir. Model weights are NOT included - no manual commands needed, just open open-english, go to 'Setup aruaru-llm', and click the 'Recommend LLM' button."
} catch {
    # ダウンロード失敗はインストーラー全体を止めない(可用性優先、
    # 既存のaruaru-llm自体の「サービスを止めない」設計方針と同じ)。
    Write-Output "aruaru-llm download failed: $_. You can install it manually later from https://github.com/aon-co-jp/aruaru-llm/releases"
    exit 0
}
