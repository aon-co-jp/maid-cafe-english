# open-easy-web(スタンドアロンWebサーバー管理アプリ、独立したエコシステム
# 製品)本体を、open-englishインストーラーの「まとめてインストール」タスク
# から取得するスクリプト(2026-08-19新設)。
#
# 正直な開示(最重要): open-englishはopen-easy-webに機能的に依存していない。
# open-english自身のCLAUDE.md「アーキテクチャ」節に明記の通り、
# open-easy-webはVPS(Linux)側のアプリ配布・管理を担うサーバー管理ツールで
# あり、open-englishの利用者端末側の動作(静的フロントエンド+aruaru-llm
# ローカルサーバーへの接続)には一切関与しない。つまりopen-easy-webを
# インストールしなくてもopen-english(英会話トレーナー機能)は完全に動作
# する。ここで同梱するのは「同じエコシステムの別プロダクトを、ついでに
# 試してみたい利用者向けの任意インストール」であり、必須コンポーネントの
# 同梱ではない。
#
# 取得するのはopen-easy-web-server(実行ファイル一式、Windows向けzip)の
# みで、取得後も既定では起動しない(自動起動タスクは登録しない——独立した
# Webサーバーであり、利用者が意図せず勝手に別のサーバーサービスが起動する
# 事態を避けるため)。使い方はREADME-INSTALLED.txt、または
# https://github.com/aon-co-jp/open-easy-web を参照。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/aon-co-jp/open-easy-web/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" }
    $asset = $release.assets | Where-Object { $_.name -like "*windows*x86_64*.zip" } | Select-Object -First 1

    if (-not $asset) {
        Write-Output "open-easy-web: no Windows release asset found. Please download it manually from https://github.com/aon-co-jp/open-easy-web/releases"
        exit 0
    }

    $zipPath = Join-Path $DestDir "open-easy-web.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "open-easy-web downloaded to $DestDir. This is OPTIONAL and NOT required for open-english to work: open-english connects only to its own local aruaru-llm server, not to open-easy-web. open-easy-web is a separate standalone web-server management tool from the same ecosystem; run open-easy-web-server.exe yourself if you want to try it, see its own README for setup."
} catch {
    Write-Output "open-easy-web download failed: $_. This is optional and open-english still works fully without it. You can install open-easy-web manually later from https://github.com/aon-co-jp/open-easy-web/releases"
    exit 0
}
