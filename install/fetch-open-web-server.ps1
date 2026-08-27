# open-web-server(スタンドアロンWebサーバー/リバースプロキシ・DDNS等、
# 独立したエコシステム製品)本体を、open-englishインストーラーの
# 「まとめてインストール」タスクから取得するスクリプト(2026-08-19新設)。
#
# 正直な開示(最重要): open-englishはopen-web-serverに機能的に依存して
# いない。open-english自身のCLAUDE.md「アーキテクチャ」節に明記の通り、
# open-englishの利用者端末側は静的フロントエンド+aruaru-llmローカル
# サーバーへの接続のみで完結しており、open-web-server(汎用リバース
# プロキシ・DDNS連携等を担う別プロダクト)を経由する設計にはなっていない。
# つまりopen-web-serverをインストールしなくてもopen-english(英会話
# トレーナー機能)は完全に動作する。ここで同梱するのは「同じエコシステム
# の別プロダクトを、ついでに試してみたい利用者向けの任意インストール」
# であり、必須コンポーネントの同梱ではない。
#
# 取得するのはopen-web-server(実行ファイル一式、Windows向けzip)のみで、
# 取得後も既定では起動しない(自動起動タスクは登録しない——独立した
# Webサーバー/リバースプロキシであり、利用者が意図せず勝手に別の
# サーバーサービス・ポート待受が起動する事態を避けるため)。使い方は
# README-INSTALLED.txt、または
# https://github.com/aon-co-jp/open-web-server を参照。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/aon-co-jp/open-web-server/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" }
    $asset = $release.assets | Where-Object { $_.name -like "*windows*x86_64*.zip" } | Select-Object -First 1

    if (-not $asset) {
        Write-Output "open-web-server: no Windows release asset found. Please download it manually from https://github.com/aon-co-jp/open-web-server/releases"
        exit 0
    }

    $zipPath = Join-Path $DestDir "open-web-server.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "open-web-server downloaded to $DestDir. This is OPTIONAL and NOT required for open-english to work: open-english does not route through open-web-server. open-web-server is a separate standalone reverse-proxy/web-server product from the same ecosystem; run its executable yourself if you want to try it, see its own README for setup."
} catch {
    Write-Output "open-web-server download failed: $_. This is optional and open-english still works fully without it. You can install open-web-server manually later from https://github.com/aon-co-jp/open-web-server/releases"
    exit 0
}
