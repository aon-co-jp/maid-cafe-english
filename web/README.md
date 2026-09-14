# open-english-pc / web

`open-english` の**共有 Web クライアント**（ブラウザで動く静的フロントエンド）。
`open-english` 本体リポジトリから `git filter-repo` で履歴を保って移設
（2026-09-10、Phase 2）。

- `index.html` / `style.css` / `app.js` … 本体
- `auto-update.js` … 自動アップデート UI（`open-english-server` の
  `self_update` / `component_update` と連携）
- `sw.js` / `manifest.json` … PWA（Service Worker・インストール）
- `version.json` … 現在バージョン
- `exam-prep-questions.json` … 資格試験対策の問題データ
- `facebook.html` / `qr-confirm.html` / `vault.html` … ログイン/連携フロー用ページ
- `icons/` … アプリアイコン

pc / tablet / mobile はこの共有クライアントを土台に、プラットフォーム固有の
パッケージング（インストーラ・起動設定）だけを持つ。

**Phase 2b（未）**: `open-english` 本体側は現在も同じファイルのコピーを保持して
デモ配信している。本体の `release.yml` / `installer/windows/open-english.iss` /
`server/src/main.rs`（静的 root）をこの `web/` を参照する形へ切り替え、
本体からコピーを削除する（取得方法は submodule か CI clone を選択）。
