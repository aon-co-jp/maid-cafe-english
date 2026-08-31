#!/bin/sh
# ブラウザ内 Whisper 音声認識(P2-α、docs/SPEECH_RECOGNITION_REDESIGN.md)用の
# ONNX モデル + transformers.js ランタイムを取得する Linux/macOS 版
# (`installer/windows/fetch-whisper-model.ps1` の Unix 版、2026-08-29新設)。
#
# 正直な開示:
# - transformers.js(ONNX Runtime Web)が読み込める形式の Whisper モデル
#   一式を Hugging Face Hub から取得し、open-english が同一オリジンで
#   配信する `models/` 配下へ置くだけ。取得後はブラウザの Service Worker
#   がキャッシュするため、2 回目以降はオフラインで動く。
# - 既定モデルは `onnx-community/whisper-base`(多言語)。
# - 2026-08-29 調査反映: WebGPU + q8 デコーダは出力が壊れるため、
#   **fp32 エンコーダ(encoder_model.onnx)+ q4 デコーダ
#   (decoder_model_merged_q4.onnx)のハイブリッド**を第一に取得し、
#   q8 版も後方互換・フォールバック用に取得する。
# - transformers.js 本体 + ORT ランタイムは jsdelivr から一度だけ取得する。
#   以後の open-english の動作に外部ネットワークは不要。
# - このスクリプトはインストーラー全体を止めない(失敗しても exit 0)。

set -u

DEST_DIR="${1:?usage: fetch-whisper-model.sh <models-dir> [model-id]}"
MODEL="${2:-onnx-community/whisper-base}"

# 取得先ダウンローダ(curl 優先、無ければ wget)。
if command -v curl >/dev/null 2>&1; then
    dl() { curl -fsSL -A "open-english-installer" -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
    dl() { wget -q -U "open-english-installer" -O "$2" "$1"; }
else
    echo "whisper-model: neither curl nor wget found; skipping" >&2
    exit 0
fi

get_file() {
    # $1 = url, $2 = out path。ディレクトリを作り、失敗しても続行。
    _dir="$(dirname "$2")"
    mkdir -p "$_dir" 2>/dev/null || true
    if dl "$1" "$2"; then
        return 0
    else
        echo "whisper-model: could not fetch $1" >&2
        rm -f "$2" 2>/dev/null || true
        return 1
    fi
}

MODEL_DIR="$DEST_DIR/$MODEL"
mkdir -p "$MODEL_DIR/onnx" 2>/dev/null || true
BASE="https://huggingface.co/$MODEL/resolve/main"

# transformers.js が Whisper 初期化時に実際に要求するファイル群。
MODEL_FILES="
config.json
generation_config.json
preprocessor_config.json
tokenizer.json
tokenizer_config.json
onnx/encoder_model.onnx
onnx/decoder_model_merged_q4.onnx
onnx/encoder_model_quantized.onnx
onnx/decoder_model_merged_quantized.onnx
"

ok=0
total=0
for f in $MODEL_FILES; do
    total=$((total + 1))
    if get_file "$BASE/$f" "$MODEL_DIR/$f"; then
        ok=$((ok + 1))
    fi
done

# transformers.js 本体 + ORT ランタイム。`-DestDir` 直下ではなくその親
# (= open-english の配信ルート)の vendor/ へ置く——app.js の
# `WHISPER_VENDOR_URL` / `wasmPaths` が `/vendor/` を指すため。
APP_DIR="$(dirname "$DEST_DIR")"
VENDOR_DIR="$APP_DIR/vendor"
# 2026-08-29 調査反映: v4.0.0-next 系はタイムスタンプ/セグメント分割に
# 回帰があるため v3 系(3.8.1)を上限に固定する。
TFJS_VERSION="3.8.1"
TFJS_BASE="https://cdn.jsdelivr.net/npm/@huggingface/transformers@$TFJS_VERSION/dist"

vok=0
get_file "$TFJS_BASE/transformers.min.js" "$VENDOR_DIR/transformers.min.js" && vok=$((vok + 1))
for f in ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.jsep.mjs ort-wasm-simd-threaded.jsep.wasm; do
    get_file "$TFJS_BASE/$f" "$VENDOR_DIR/ort/$f" && vok=$((vok + 1))
done

# fp32 encoder か q8 encoder のどちらか + デコーダ + tfjs 本体が揃えば利用可。
enc_ok=0
[ -f "$MODEL_DIR/onnx/encoder_model.onnx" ] && enc_ok=1
[ -f "$MODEL_DIR/onnx/encoder_model_quantized.onnx" ] && enc_ok=1
dec_ok=0
[ -f "$MODEL_DIR/onnx/decoder_model_merged_q4.onnx" ] && dec_ok=1
[ -f "$MODEL_DIR/onnx/decoder_model_merged_quantized.onnx" ] && dec_ok=1

if [ "$enc_ok" -eq 1 ] && [ "$dec_ok" -eq 1 ] && [ -f "$VENDOR_DIR/transformers.min.js" ] && [ "$ok" -ge 6 ]; then
    echo "whisper-model: $MODEL + transformers.js runtime downloaded (model $ok/$total, vendor $vok/5). Browser Whisper is now available offline."
else
    echo "whisper-model: download incomplete (model $ok/$total, vendor $vok/5). Browser Whisper will fall back to the built-in Web Speech API until model + runtime are present."
fi
exit 0
