# open-english-pc / mobile

モバイル版。`android/` に Android プロジェクト（`open-english` 本体の
`android/` から `git filter-repo` で履歴を保って移設、Phase 2）。
`android/app/src/main/assets/webroot/` は共有 Web クライアント
（[`../web/`](../web/)）の同梱コピー。

自動アップデート方針は [`../pc/README.md`](../pc/README.md) と共通
（メンテナンス表示中 30 秒間隔で関連リポジトリ一括バージョンアップ、Phase 3）。

## ビルド

[`../BUILD.md`](../BUILD.md) を参照(pc/tablet/mobile 共通のビルド基盤設計)。
