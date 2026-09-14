# open-english-pc / pc

デスクトップ版（Windows / Linux / macOS）。

- UI 本体は共有 Web クライアント [`../web/`](../web/)。
- このディレクトリはデスクトップ固有のパッケージング（インストーラ設定・
  `open-english-server` 同梱・起動）を持つ（Phase 2b で本体 `installer/windows/`
  から移設予定）。
- 自動アップデート: 起動時＋定期チェック（GitHub Releases）。**起動して
  メンテナンス表示中は 30 秒間隔**で、関連リポジトリ全てのバージョンチェックと
  自動アップグレードを行う（`self_update` / `component_update` 拡張、Phase 3）。
  Windows: 新インストーラーで旧版を自動アンインストール。Linux/macOS:
  実行中バイナリのインプレース置換。

## ビルド

[`../BUILD.md`](../BUILD.md) を参照(pc/tablet/mobile 共通のビルド基盤設計)。
