# open-cg-cad(AI工務店&AI建設CADシステム)を、open-englishインストーラーの
# 「まとめてインストール」タスクから取得するスクリプト(2026-08-25新設)。
#
# ユーザー指示「open-englishかopen-easy-webからopen-cg-cadをインストール
# すると、open-englishとopen-cg-cadはハイブリッドで相互に機能するシステム
# という仕様にして」への対応。
#
# 正直な開示(最重要): open-easy-web/open-web-serverの同梱(無関係な独立
# 製品の任意同梱)とは異なり、open-cg-cadとopen-englishは実際に相互連携
# する設計になっている——(1) open-english側のworld-labパネルに
# 「🏗 open-cg-cad」ボタンがあり別タブで開ける、(2) open-cg-cad側にも
# 「← open-englishへ戻る」リンクがあり、localStorage経由でお互いの
# URLを渡し合う、(3) 両アプリとも同じaruaru-llmインスタンス(既定
# http://127.0.0.1:4600)を指せば、図面のAI解説機能を共有できる。
# ただし現時点でこの連携は「双方向リンク+同じAIバックエンドの共有」の
# 範囲に留まり、それ以上の専用連携API(データの自動同期等)は無い。
#
# **正直な開示(現状の制約)**: 本スクリプト作成時点(2026-08-25)で
# open-cg-cadはまだGitHub Releasesにビルド済みバイナリを公開していない
# (継続的インテグレーションのリリースパイプラインが未整備)。そのため
# 以下はGitHub Releasesの`latest`を試み、無ければソースからの
# ビルド手順を正直に案内するのみに留める(取得失敗を偽装しない)。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/aon-co-jp/open-cg-cad/releases/latest"
    $release = $null
    try {
        $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" }
    } catch {
        $release = $null
    }

    $asset = $null
    if ($release) {
        $asset = $release.assets | Where-Object { $_.name -like "*windows*x86_64*.zip" -or $_.name -like "*windows*x86_64*.exe" } | Select-Object -First 1
    }

    if (-not $asset) {
        Write-Output "open-cg-cad: no packaged Windows release is published yet (as of 2026-08-25, open-cg-cad has no release pipeline set up). Skipping download honestly rather than pretending success. To try it now, build from source: git clone https://github.com/aon-co-jp/open-cg-cad, then 'cargo build --release -p open-cg-cad-server' (requires the sibling repos it path-depends on, see open-cg-cad/CLAUDE.md)."
        exit 0
    }

    $zipPath = Join-Path $DestDir "open-cg-cad.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "open-cg-cad downloaded to $DestDir. This is OPTIONAL but designed to interoperate with open-english: both apps link to each other (world-lab panel <-> the back-link in open-cg-cad's own page) and can share the same local aruaru-llm instance for drawing AI explanations. Run open-cg-cad-server.exe yourself to start it (default http://127.0.0.1:4701/), see its own README for setup."
} catch {
    Write-Output "open-cg-cad download failed: $_. This is optional and open-english still works fully without it. You can install open-cg-cad manually later from https://github.com/aon-co-jp/open-cg-cad"
    exit 0
}
