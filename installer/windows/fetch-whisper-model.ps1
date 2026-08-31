# ブラウザ内 Whisper 音声認識(P2-α、docs/SPEECH_RECOGNITION_REDESIGN.md)用の
# ONNX モデルを取得するスクリプト(2026-08-29新設)。
#
# 正直な開示:
# - これは transformers.js(ONNX Runtime Web)が読み込める形式の Whisper
#   モデル一式を Hugging Face Hub から取得し、open-english が同一オリジンで
#   配信する `models/` 配下へ置くだけのもの。取得後はブラウザの Service
#   Worker がキャッシュするため、2 回目以降はオフラインで動く。
# - 既定モデルは `onnx-community/whisper-base`(多言語・量子化済み、
#   合計およそ 40〜80MB)。`-Model onnx-community/whisper-small` を渡すと
#   より高精度だが大きい(およそ 240MB)モデルを取得する。
# - このスクリプト自体は Hugging Face へ 1 度だけアクセスする。以後の
#   open-english の動作に外部ネットワークは不要。
param(
    [Parameter(Mandatory = $true)]
    [string]$DestDir,
    [string]$Model = "onnx-community/whisper-base"
)

$ErrorActionPreference = "Stop"

function Get-File($url, $out) {
    try {
        $dir = Split-Path -Parent $out
        if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -Headers @{ "User-Agent" = "open-english-installer" }
        return $true
    } catch {
        Write-Output "whisper-model: could not fetch $url ($_)"
        return $false
    }
}

# transformers.js が Whisper を初期化する際に実際に要求するファイル群。
# onnx/ 配下は量子化版のみ(fp32 のフル重みは取得しない — サイズ削減)。
$files = @(
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx"
)

# transformers.js 本体 + ONNX Runtime Web ランタイム(WASM/WebGPU/WebNN)。
# `-DestDir` 直下ではなく、その親(= open-english の {app})の vendor/ へ置く
# ——app.js の `WHISPER_VENDOR_URL` / `wasmPaths` が `/vendor/` を指すため。
$appDir = Split-Path -Parent $DestDir
$vendorDir = Join-Path $appDir "vendor"
$tfjsVersion = "3.7.5"
$tfjsBase = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@$tfjsVersion/dist"
$ortFiles = @(
    "transformers.min.js",
    "ort/ort-wasm-simd-threaded.mjs",
    "ort/ort-wasm-simd-threaded.wasm",
    "ort/ort-wasm-simd-threaded.jsep.mjs",
    "ort/ort-wasm-simd-threaded.jsep.wasm"
)

try {
    $modelDir = Join-Path $DestDir $Model
    New-Item -ItemType Directory -Force -Path (Join-Path $modelDir "onnx") | Out-Null

    $base = "https://huggingface.co/$Model/resolve/main"
    $ok = 0
    foreach ($f in $files) {
        if (Get-File "$base/$f" (Join-Path $modelDir $f)) { $ok++ }
    }

    # transformers.js + ORT ランタイム(dist 直下の ort ファイル名は
    # バージョンで変わりうるため、取得できたものだけ使う)。
    $vok = 0
    foreach ($f in $ortFiles) {
        $src = if ($f -eq "transformers.min.js") { "$tfjsBase/transformers.min.js" } else { "$tfjsBase/$($f -replace '^ort/','')" }
        if (Get-File $src (Join-Path $vendorDir $f)) { $vok++ }
    }

    $encoder = Join-Path $modelDir "onnx/encoder_model_quantized.onnx"
    $decoder = Join-Path $modelDir "onnx/decoder_model_merged_quantized.onnx"
    $tfjs = Join-Path $vendorDir "transformers.min.js"
    if ((Test-Path $encoder) -and (Test-Path $decoder) -and (Test-Path $tfjs) -and $ok -ge 5) {
        Write-Output "whisper-model: $Model + transformers.js runtime downloaded (model $ok/$($files.Count), vendor $vok/$($ortFiles.Count)). Browser Whisper is now available offline."
    } else {
        Write-Output "whisper-model: download incomplete. Browser Whisper will fall back to the built-in Web Speech API until model + runtime are present. Retry later, or fetch manually: model https://huggingface.co/$Model , runtime $tfjsBase"
    }
} catch {
    # ダウンロード失敗はインストーラー全体を止めない(可用性優先、
    # 既存の fetch-aruaru-llm.ps1 と同じ方針)。
    Write-Output "whisper-model download failed: $_. open-english will keep working with the built-in Web Speech API; you can add the Whisper model later."
    exit 0
}
