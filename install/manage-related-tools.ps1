# open-englishインストール後、関連ツール(aon-co-jpエコシステムの他
# 独立製品)を後からでも簡単にインストール・アンインストールできるように
# するための対話メニュー(2026-08-26新設、ユーザー指示「インストールが
# 完了したあとでも、インストールやアンインストール可能なものは簡単に
# 行えるようにして」への対応)。
#
# 正直な開示: ここに一覧されるのは、open-english本体の動作には無関係な
# 独立したaon-co-jp製品(open-english.issの[Tasks]と同じ一覧)のみ。
# aruaru-llm(必須のAI応答エンジン)はopen-english本体に組み込み済みで
# 独自のインストーラーを持たないため、ここでの管理対象外
# (open-english自体をアンインストールすれば一緒に削除される設計)。
$ErrorActionPreference = "Stop"

$Tools = @(
    @{ Name = "RS-Blog";        Repo = "RS-Blog";        AssetPattern = "*-installer.exe" },
    @{ Name = "RS-EC";          Repo = "RS-EC";           AssetPattern = "*-installer.exe" },
    @{ Name = "RS-Guard";       Repo = "RS-Guard";        AssetPattern = "*-installer.exe" },
    @{ Name = "RS-Ops";         Repo = "RS-Ops";          AssetPattern = "*-installer.exe" },
    @{ Name = "open-gitea";     Repo = "open-gitea";      AssetPattern = "*-installer.exe" },
    @{ Name = "open-raid-z";    Repo = "open-raid-z";     AssetPattern = "*-installer.exe" },
    @{ Name = "open-redmine";   Repo = "open-redmine";    AssetPattern = "*-installer.exe" },
    @{ Name = "rs-link-fusion"; Repo = "rs-link-fusion";  AssetPattern = "*-installer.exe" },
    @{ Name = "runo.tokyo";     Repo = "runo.tokyo";      AssetPattern = "*-installer.exe" },
    @{ Name = "open-runo Tray"; Repo = "RPoem";           AssetPattern = "open-runo-tray-installer.exe"; DestName = "open-runo-tray" }
)

$ScriptDir = $PSScriptRoot
$FetchScript = Join-Path $ScriptDir "fetch-related-tool.ps1"

function Get-UninstallEntry([string]$DisplayNameLike) {
    # Windowsの「アプリと機能」レジストリ一覧から、独自のアンインストーラー
    # (unins000.exe)を持つ関連ツールを名前で検索する(Inno Setupが自動
    # 登録するキー、HKCU/HKLM両方の32/64bit両方を確認)。
    $roots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($root in $roots) {
        $entries = Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*$DisplayNameLike*" }
        if ($entries) { return $entries | Select-Object -First 1 }
    }
    return $null
}

function Show-Menu {
    Clear-Host
    Write-Host "===================================================================="
    Write-Host " open-english — Manage related tools / 関連ツールの管理"
    Write-Host " (independent aon-co-jp apps, not required for open-english itself)"
    Write-Host " (open-english本体には無関係な独立aon-co-jp製アプリ群)"
    Write-Host "===================================================================="
    Write-Host ""
    for ($i = 0; $i -lt $Tools.Count; $i++) {
        $t = $Tools[$i]
        $entry = Get-UninstallEntry $t.Name
        $status = if ($entry) { "[installed / インストール済み]" } else { "[not installed / 未インストール]" }
        Write-Host ("  {0,2}) {1,-16} {2}" -f ($i + 1), $t.Name, $status)
    }
    Write-Host ""
    Write-Host "  Q) Quit / 終了"
    Write-Host ""
}

while ($true) {
    Show-Menu
    $choice = Read-Host "Select a tool number to install/uninstall, or Q to quit / 番号を選択(インストール/アンインストール)、Qで終了"
    if ($choice -match "^[Qq]$") { break }
    if ($choice -notmatch "^\d+$" -or [int]$choice -lt 1 -or [int]$choice -gt $Tools.Count) {
        Write-Host "Invalid choice / 無効な選択です"
        Start-Sleep -Seconds 1
        continue
    }
    $t = $Tools[[int]$choice - 1]
    $entry = Get-UninstallEntry $t.Name

    if ($entry) {
        $confirm = Read-Host "Uninstall $($t.Name)? (y/N) / $($t.Name) をアンインストールしますか? (y/N)"
        if ($confirm -match "^[Yy]") {
            Write-Host "Uninstalling $($t.Name)..."
            try {
                $uninstallString = $entry.UninstallString
                if ($uninstallString) {
                    # Inno Setupの標準UninstallStringは "path\unins000.exe" 形式
                    # (末尾に引数が続くこともある)——そのまま実行する。
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "$uninstallString /VERYSILENT" -Wait
                    Write-Host "$($t.Name) uninstalled. / アンインストールしました。"
                } else {
                    Write-Host "Could not find an uninstall command for $($t.Name)."
                }
            } catch {
                Write-Host "Uninstall failed: $_"
            }
        }
    } else {
        $confirm = Read-Host "Install $($t.Name)? (Y/n) / $($t.Name) をインストールしますか? (Y/n)"
        if ($confirm -notmatch "^[Nn]") {
            $destName = if ($t.DestName) { $t.DestName } else { $t.Name }
            $destDir = Join-Path $ScriptDir "related\$destName"
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $FetchScript -Owner "aon-co-jp" -Repo $t.Repo -DestDir $destDir -AssetPattern $t.AssetPattern
        }
    }
    Write-Host ""
    Read-Host "Press Enter to continue / Enterキーで続行"
}
