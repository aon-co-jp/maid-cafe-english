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
#
# open-cuda / open-cpu について / About open-cuda / open-cpu:
#   aruaru-llm を使うなら open-cuda・open-cpu も必要だが、別途ダウン
#   ロードは不要。open-cuda(opencuda-blas/opencuda-bert/open-cuda-llm
#   等のGEMM・Attention・GPT-2デコーダ実装)・open-cpu(CPU命令セット
#   〈AVX2/AVX-512等〉検出・SIMD加速)は、いずれもaruaru-llm.exeへCargo
#   のpath依存として静的リンクされており、この zip に既に含まれている。
#   Vulkan/DirectX の GPU バックエンドだけは aruaru-llm 側の GPU ビルド
#   (aruaru-llm-installer.exe の installgpu タスク、既定オフ)を使う
#   場合にのみ有効になる。
#   If you use aruaru-llm you also need open-cuda and open-cpu, but
#   there is nothing extra to download: both open-cuda (the
#   opencuda-blas/opencuda-bert/open-cuda-llm GEMM, attention and GPT-2
#   decoder code) and open-cpu (CPU instruction-set detection / SIMD
#   acceleration) are Cargo path dependencies statically linked into
#   aruaru-llm.exe and are already inside this zip. Only the
#   Vulkan/DirectX GPU backends require aruaru-llm's separate GPU build
#   (the installgpu task in aruaru-llm-installer.exe, off by default).
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
        $msg = "aruaru-llm: no Windows release asset found in the latest release. open-english's chat feature will show 'Setup aruaru-llm' until you install it manually from https://github.com/aon-co-jp/aruaru-llm/releases"
        Write-Output $msg
        # 2026-09-08 BUG修正: このタスクはFlags: runhiddenで実行される
        # ため、失敗してもコンソールが一切表示されず利用者が気づけな
        # かった(実際にaruaru-llmの最新リリースにWindows資産が無い
        # 期間が生じ、この分岐へ黙って落ちていた——open-cpuのsibling
        # checkout漏れが原因、aruaru-llm/.github/workflows/release.yml
        # 参照)。必須コンポーネントの取得失敗なので、runhiddenでも
        # 表示されるメッセージボックスで明示的に警告する。
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($msg, "open-english setup", "OK", "Warning") | Out-Null
        exit 0
    }

    $zipPath = Join-Path $DestDir "aruaru-llm.zip"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $DestDir -Force
    Remove-Item $zipPath -Force

    Write-Output "aruaru-llm downloaded to $DestDir. Model weights are NOT included - no manual commands needed, just open open-english, go to 'Setup aruaru-llm', and click the 'Recommend LLM' button."
} catch {
    # ダウンロード失敗はインストーラー全体を止めない(可用性優先、
    # 既存のaruaru-llm自体の「サービスを止めない」設計方針と同じ)が、
    # 必須コンポーネントのため上記と同様にメッセージボックスで警告する
    # (2026-09-08、runhidden下で無音失敗していた実バグへの対応)。
    $msg = "aruaru-llm download failed: $_. You can install it manually later from https://github.com/aon-co-jp/aruaru-llm/releases"
    Write-Output $msg
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($msg, "open-english setup", "OK", "Warning") | Out-Null
    exit 0
}
