# open-english-installer.exeから「関連ツール」をダブルクリック1回で
# まとめてインストールできるようにする汎用スクリプト(2026-08-26新設、
# ユーザー指示「open-english-installer.exeをダブルクリックしただけで、
# 関連インストーラーも全部インストール可能で、特に必要でない場合関連
# インストーラーがあれば、選択式にして」への対応)。
#
# 正直な開示(最重要): ここで言う「関連ツール」は、aon-co-jp組織配下の
# 他リポジトリという意味での「関連」であり、open-englishの動作(英会話
# AI機能)に技術的な依存関係があるという意味ではない——既存の
# open-easy-web/open-web-server同梱タスクと同じ位置づけ。各ツールは
# open-english本体とは無関係に独立して動作する。選択は既定すべて未
# チェックとし(open-english.iss参照)、利用者が明示的に選んだ場合のみ
# ダウンロード・実行する。
#
# 各リポジトリの release.yml が Inno Setup で`<リポジトリ名>-installer.
# exe`(2026-08-26統一の命名規則)をビルドしGitHub Releaseへ添付する
# ようになっているため(このスクリプトが書かれた時点でCIは更新済みだが、
# 実際に新しいタグがpushされてリリースされるまでは、対象リポジトリの
# 最新リリースにこのアセットがまだ存在しない場合がある——その場合は
# 黙って失敗にせず正直にその旨を報告し、次のツールへ進む)。
param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [string]$Repo,
    [Parameter(Mandatory = $true)]
    [string]$DestDir,
    # 既定は「そのリポジトリの最新リリースにある*-installer.exeアセット
    # のいずれか1件」。ただし1つのリポジトリが複数の`-installer.exe`を
    # 公開している場合(例: RPoemは`open-runo-router-installer.exe`と
    # `open-runo-tray-installer.exe`の両方を公開)は曖昧になるため、
    # 呼び出し側が具体的なファイル名パターンを明示すること。
    [string]$AssetPattern = "*-installer.exe"
)

$ErrorActionPreference = "Stop"

try {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $apiUrl = "https://api.github.com/repos/$Owner/$Repo/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "open-english-installer" } -TimeoutSec 20
    $asset = $release.assets | Where-Object { $_.name -like $AssetPattern } | Select-Object -First 1

    if (-not $asset) {
        Write-Output "$Repo : no <repo>-installer.exe release asset found yet. Skipping (this does not affect the rest of the installation). Install it manually later from https://github.com/$Owner/$Repo/releases"
        exit 0
    }

    $exePath = Join-Path $DestDir $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exePath -UseBasicParsing

    Write-Output "$Repo : running $($asset.name) silently..."
    # /VERYSILENT: ダイアログ・ウィザードを表示せず無人インストール。
    # 各`<repo>-installer.exe`はそれぞれ独自のPrivilegesRequired設定を
    # 持つ(lowestまたはadmin、各リポジトリのCLAUDE.md参照)——admin指定の
    # ものは、この処理自体がopen-english-installer.exe実行中のプロセスの
    # 権限を引き継ぐため、open-english自体を管理者権限で実行していない
    # 限りUACプロンプトが別途表示され得る(正直な開示、Windowsの標準的な
    # 昇格の仕組みでありこのスクリプト側で回避できない)。
    $proc = Start-Process -FilePath $exePath -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Output "$Repo : installer exited with code $($proc.ExitCode) (installation may have been cancelled, e.g. a UAC prompt was declined). This does not affect the rest of the installation."
    } else {
        Write-Output "$Repo : installed successfully."
    }
} catch {
    # ダウンロード・実行失敗はopen-english本体のインストールを止めない
    # (既存のfetch-*.ps1と同じ可用性優先の設計方針)。
    Write-Output "$Repo : failed ($_). You can install it manually later from https://github.com/$Owner/$Repo/releases. This does not affect the rest of the installation."
    exit 0
}
