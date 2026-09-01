#!/bin/sh
# ブラウザ内OCR(Tesseract.js)vendorファイルを取得するLinux/macOS版
# (`installer/windows/fetch-tesseract.ps1`のUnix版、2026-09-01新設)。
#
# 正直な開示:
# - Tesseract.js本体+英語・日本語の学習済みデータをjsDelivrから一度だけ
#   取得し、open-englishが同一オリジンで配信する`vendor/tesseract/`配下へ
#   置くだけ。取得後はopen-english自身はCDNへ一切アクセスしない。
# - OCR結果の精度は写真の解像度・文字の綺麗さに大きく左右される。
# - このスクリプトはインストーラー全体を止めない(失敗してもexit 0)。

set -u

DEST_DIR="${1:?usage: fetch-tesseract.sh <vendor-dir>}"

if command -v curl >/dev/null 2>&1; then
    dl() { curl -fsSL -A "open-english-installer" -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
    dl() { wget -q -U "open-english-installer" -O "$2" "$1"; }
else
    echo "tesseract: neither curl nor wget found; skipping" >&2
    exit 0
fi

get_file() {
    _dir="$(dirname "$2")"
    mkdir -p "$_dir" 2>/dev/null || true
    if dl "$1" "$2"; then
        return 0
    fi
    echo "tesseract: could not fetch $1" >&2
    return 1
}

VENDOR_DIR="$DEST_DIR/tesseract"
mkdir -p "$VENDOR_DIR" 2>/dev/null || true

TESSERACT_VERSION="5.1.1"
BASE="https://cdn.jsdelivr.net/npm/tesseract.js@$TESSERACT_VERSION/dist"
TESSDATA_BASE="https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_fast"

OK=1
get_file "$BASE/tesseract.min.js" "$VENDOR_DIR/tesseract.min.js" || OK=0
get_file "$BASE/worker.min.js" "$VENDOR_DIR/worker.min.js" || OK=0
get_file "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js" "$VENDOR_DIR/tesseract-core-simd.wasm.js" || OK=0
get_file "$TESSDATA_BASE/eng.traineddata.gz" "$VENDOR_DIR/eng.traineddata.gz" || OK=0
get_file "$TESSDATA_BASE/jpn.traineddata.gz" "$VENDOR_DIR/jpn.traineddata.gz" || OK=0

if [ "$OK" -eq 1 ]; then
    echo "tesseract: fetched vendor files into $VENDOR_DIR"
else
    echo "tesseract: one or more files failed to fetch -- OCR will stay disabled (honest fallback to filename-only)." >&2
fi
exit 0
