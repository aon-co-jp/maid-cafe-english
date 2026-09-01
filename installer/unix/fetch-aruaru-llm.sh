#!/bin/sh
# aruaru-llm(AI応答エンジン)本体を、open-englishインストーラーの
# 「まとめてインストール」から取得するスクリプト(Linux/macOS版、
# `installer/windows/fetch-aruaru-llm.ps1`のUnix版)。
#
# 正直な開示: これはaruaru-llmの実行ファイルのみを取得する。GPT-2/
# DistilGPT-2の実モデル重み(数百MB〜数GB)・aruaru-db・PostgreSQLは
# 含まない——それぞれ別途セットアップが必要(README-INSTALLED.txt参照)。
#
# open-cuda について / About open-cuda:
#   aruaru-llm を使うなら open-cuda も必要だが、別途ダウンロードは不要。
#   open-cuda(opencuda-blas/opencuda-bert/open-cuda-llm 等)は
#   aruaru-llm バイナリへ静的リンクされており、取得済みバイナリに既に
#   含まれている。Vulkan/DirectX の GPU バックエンドだけは aruaru-llm
#   側の GPU ビルドを使う場合のみ有効。
#   If you use aruaru-llm you also need open-cuda, but nothing extra to
#   download: open-cuda is statically linked into the aruaru-llm binary
#   and is already inside the fetched artifact. Only the Vulkan/DirectX
#   GPU backends need aruaru-llm's separate GPU build.

set -eu

DEST_DIR="${1:?usage: fetch-aruaru-llm.sh <dest-dir>}"
mkdir -p "$DEST_DIR"

OS_NAME="$(uname -s)"
case "$OS_NAME" in
    Linux) ASSET_PATTERN="linux" ;;
    Darwin) ASSET_PATTERN="macos" ;;
    *) echo "aruaru-llm: unsupported OS ($OS_NAME), skipping" >&2; exit 0 ;;
esac

API_URL="https://api.github.com/repos/aon-co-jp/aruaru-llm/releases/latest"
ASSET_URL=$(curl -fsSL -H "User-Agent: open-english-installer" "$API_URL" \
    | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_PATTERN}[^\"]*\"" \
    | head -1 \
    | sed -E 's/.*"(https:[^"]+)"/\1/') || true

if [ -z "${ASSET_URL:-}" ]; then
    echo "aruaru-llm: no ${ASSET_PATTERN} release asset found. Download manually from https://github.com/aon-co-jp/aruaru-llm/releases" >&2
    exit 0
fi

ARCHIVE="$DEST_DIR/aruaru-llm-download"
if ! curl -fsSL "$ASSET_URL" -o "$ARCHIVE"; then
    echo "aruaru-llm: download failed. You can install it manually later from https://github.com/aon-co-jp/aruaru-llm/releases" >&2
    exit 0
fi

case "$ASSET_URL" in
    *.tar.gz) tar -xzf "$ARCHIVE" -C "$DEST_DIR" ;;
    *.zip) unzip -oq "$ARCHIVE" -d "$DEST_DIR" ;;
    *) echo "aruaru-llm: unrecognized archive format ($ASSET_URL)" >&2 ;;
esac
rm -f "$ARCHIVE"

echo "aruaru-llm downloaded to $DEST_DIR. Model weights are NOT included — run it once and use POST /v1/models/install, or see its own README."
