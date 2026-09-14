// open-english Android版シェル(2026-08-10新規作成、ユーザー指示
// 「Windows用とAndroidスマホ様にインストーラー付きアプリにして、
// アンインストーラーとバージョン管理機能も付けて」への対応)。
//
// `aruaru-llm/android`(`tokyo.runo.aruarullm`)の構成パターンを踏襲。
// このアプリはopen-englishの静的フロントエンド(index.html等)を
// `WebView`で表示する薄いラッパー——ネイティブバイナリ同梱
// (jniLibs/クロスコンパイル)は行わない。接続先(このリポジトリの
// `server/`をPC上で起動したURL、既定`http://<PCのIPアドレス>:4601`)を
// アプリ内で設定できる。
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
