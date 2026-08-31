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

try {
    $modelDir = Join-Path $DestDir $Model
    New-Item -ItemType Directory -Force -Path (Join-Path $modelDir "onnx") | Out-Null

    $base = "https://huggingface.co/$Model/resolve/main"
    $ok = 0
    foreach ($f in $files) {
        $url = "$base/$f"
        $out = Join-Path $modelDir $f
        try {
            Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -Headers @{ "User-Agent" = "open-english-installer" }
            $ok++
        } catch {
            # 一部のモデルは encoder/decoder の量子化ファイル名が異なる
            # (_fp16 等)。encoder/decoder の必須ファイルが 1 つも取れな
            # かった場合のみ後段でエラーにする。
            Write-Output "whisper-model: could not fetch $f ($_)"
        }
    }

    $encoder = Join-Path $modelDir "onnx/encoder_model_quantized.onnx"
    $decoder = Join-Path $modelDir "onnx/decoder_model_merged_quantized.onnx"
    if ((Test-Path $encoder) -and (Test-Path $decoder) -and $ok -ge 5) {
        Write-Output "whisper-model: $Model downloaded to $modelDir ($ok/$($files.Count) files). Browser Whisper is now available offline."
    } else {
        Write-Output "whisper-model: download incomplete for $Model. Browser Whisper will fall back to the built-in Web Speech API until the model is present. You can retry later or download it manually from https://huggingface.co/$Model"
    }
} catch {
    # ダウンロード失敗はインストーラー全体を止めない(可用性優先、
    # 既存の fetch-aruaru-llm.ps1 と同じ方針)。
    Write-Output "whisper-model download failed: $_. open-english will keep working with the built-in Web Speech API; you can add the Whisper model later."
    exit 0
}
