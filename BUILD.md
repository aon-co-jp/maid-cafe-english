# ビルド基盤（pc / tablet / mobile 共通設計）

`open-english`(本体)のクライアントを3フォームファクタ
（デスクトップ / タブレット / モバイル）へ展開する。3つは**同じ資産**を
土台にし、差分はパッケージングのみ。

> **2026-09-15**: クライアント資産(`web/` `pc/` `tablet/` `mobile/`)は
> 元々`aon-co-jp/open-english-pc`という別リポジトリへsubmodule切り出し
> していたが、インストーラー組み立て・リリースCI・配信サーバーが
> いずれも本体側に残ったままで分離の目的が実現されず、二重管理の
> コストだけが残っていたため、履歴を保持して本体へ再統合した
> （`open-english-pc`リポジトリ自体は削除済み）。以下の説明は
> この再統合後(単一リポジトリ)の構成を前提とする。

## 1. 単一の正本

| 対象 | 正本 |
|---|---|
| クライアント UI（HTML/CSS/JS/PWA/アイコン/多言語データ） | [`web/`](web/) |
| バージョン番号 | [`web/version.json`](web/version.json) の `version` |

- 本体サーバーが起動時に`web/`を配信ルートへミラーする
  （`server/src/main.rs`の`sync_web_assets()`）。
- どのプラットフォームのビルドも `web/version.json` を読んで版数を決める。
  手動で各所に版数を書かない。

## 2. プラットフォーム別ビルド

### pc/（デスクトップ Windows / Linux / macOS）

デスクトップの実体は `open-english-server`（Rust）＋ `web/` の静的
ファイル。

- インストーラは `.github/workflows/release.yml`（Inno Setup / Unix
  tarball）が生成し、`web/` から同梱する。
- `pc/` はデスクトップ固有の補助（起動オプション・配布メモ等）を置く場所。
  インストーラ設定そのものの二重管理はしない。

### mobile/（Android スマートフォン）・tablet/（Android タブレット）

`mobile/android/` の**単一 Gradle プロジェクト**を、product flavor
`phone` / `tablet` の2本立てでビルドする。

| flavor | applicationId | 用途 |
|---|---|---|
| `phone` | `tokyo.runo.openenglish` | スマートフォン |
| `tablet` | `tokyo.runo.openenglish.tablet` | タブレット（別アプリとして併存可） |

- 共通コード・レイアウトは `app/src/main/`。flavor 差分は
  `app/src/phone/` `app/src/tablet/`（アプリ名・既定の向き・
  `smallestScreenWidthDp` ガード等の最小限）。
- `versionName` は Gradle が `../../web/version.json` から読む。
  `versionCode` は `major*10000 + minor*100 + patch`。
- `assets/webroot/`（APK同梱の静的アセット）は`web/`から
  `preBuild`依存のGradleタスク（`syncWebrootFromWeb`）でビルドの
  たびに自動同期される（2026-09-14追加、手動`cp`忘れによる旧
  コンテンツ配信バグの再発防止）。
- 生成物: `app/build/outputs/apk/{phone,tablet}/release/*.apk`
  （`mobile/`=phone、`tablet/`=tablet）。

## 3. リリースフロー

版数は `web/version.json` を bump → `vX.Y.Z` タグを打つ、の1系統に
揃える。

- **デスクトップ**: `vX.Y.Z` タグ → Inno Setup / tarball（`web/`から
  同梱）。
- **Android（phone/tablet）**: 同じ `vX.Y.Z` タグで、
  `.github/workflows/release.yml` の `build-android` ジョブが
  `mobile/android/` から `assemblePhoneRelease` /
  `assembleTabletRelease` を実行し、APK を同じ GitHub Release へ添付する。
  リリース署名鍵（`ANDROID_KEYSTORE_*` シークレット、2026-09-11 導入済み）が
  あれば `assemble*Release`（リリース署名済み）、無ければ `assemble*Debug`
  （自動署名・インストール可能）にフォールバックする。

## 4. 状態（2026-09-15 時点）

- [x] Android リリース署名鍵を導入済み。`ANDROID_KEYSTORE_BASE64` 等が
      Actions シークレットに設定されていれば `assemble*Release`、
      無ければ `assemble*Debug` にフォールバック（`build.gradle.kts` 参照）。
- [x] `tablet` flavor 専用レイアウト（操作パネルを中央 600dp 幅へ）。
- [x] `pc/` は追加のビルド構成なしで完結（デスクトップの実体は
      `open-english-server` ＋ `web/`）。
- [x] `open-english-pc`からの再統合完了（2026-09-15）。submodule撤去、
      `client/web`・`client/mobile/android`参照を`web`・`mobile/android`
      へ更新。

今後の拡張候補（未着手・必須ではない）:
- [ ] Play Store 提出を行う場合の App Bundle（`.aab`）対応
- [ ] `tablet` flavor 向けのさらなるレイアウト調整（二カラム化等、実機/
      実データが無いため現時点では見送り）
