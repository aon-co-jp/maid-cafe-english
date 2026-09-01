# ブラウザ内OCR(Tesseract.js)vendorファイルを取得するスクリプト
# (2026-09-01新設、ユーザー指示「写真の設計書をOCR+AIで解析して読み取れる
# 様にして」への対応)。
#
# 正直な開示:
# - Tesseract.js(WASM版Tesseract OCRエンジン)本体+英語・日本語の
#   学習済みデータをjsDelivr(npmパッケージのCDNミラー)から1度だけ取得し、
#   open-englishが同一オリジンで配信する`vendor/tesseract/`配下へ置く。
#   取得後はopen-english自身はCDNへ一切アクセスしない(app.jsは常に
#   同一オリジンの/vendor/tesseract/を読む)。
# - OCR結果の精度は写真の解像度・文字の綺麗さに大きく左右される
#   (完全なAI読解ではなく光学文字認識であることを利用者にも明記する)。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir
)

$ErrorActionPreference = "Stop"

function Get-File($url, $out) {
    try {
        $dir = Split-Path -Parent $out
        if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -Headers @{ "User-Agent" = "open-english-installer" }
        return $true
    } catch {
        Write-Output "tesseract: could not fetch $url ($_)"
        return $false
    }
}

$tesseractVersion = "5.1.1"
$base = "https://cdn.jsdelivr.net/npm/tesseract.js@$tesseractVersion/dist"
$tessdataBase = "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast"

$vendorDir = Join-Path $DestDir "tesseract"
New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

$ok = $true
$ok = (Get-File "$base/tesseract.min.js" (Join-Path $vendorDir "tesseract.min.js")) -and $ok
$ok = (Get-File "$base/worker.min.js" (Join-Path $vendorDir "worker.min.js")) -and $ok
$ok = (Get-File "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js" (Join-Path $vendorDir "tesseract-core-simd.wasm.js")) -and $ok
$ok = (Get-File "$tessdataBase/eng.traineddata.gz" (Join-Path $vendorDir "eng.traineddata.gz")) -and $ok
$ok = (Get-File "$tessdataBase/jpn.traineddata.gz" (Join-Path $vendorDir "jpn.traineddata.gz")) -and $ok

if ($ok) {
    Write-Output "tesseract: fetched vendor files into $vendorDir"
} else {
    Write-Output "tesseract: one or more files failed to fetch — OCR will stay disabled (honest fallback to filename-only)."
}
