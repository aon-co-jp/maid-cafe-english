// open-english Service Worker(2026-08-24新設)
//
// 目的: ワンタップでのホーム画面インストール(Android版Chromeの
// 「アプリをインストール」バナー/`beforeinstallprompt`)を有効にする。
// Chromeのインストール可能性判定は、有効なmanifest.json(既存)に加えて
// 「fetchイベントハンドラを持つ登録済みService Worker」を要求するため、
// 新設した。
//
// **正直な開示(スコープを誇張しないこと)**:
// - これはオフラインキャッシュの最小実装であり、本格的なオフライン
//   対応(会話履歴の同期、バックグラウンド更新等)は行っていない。
// - `aruaru-llm`へのAPI呼び出し(`/v1/...`)・サーバー側の動的
//   エンドポイント(`/v1/db/*`等)は意図的にキャッシュしない
//   (会話・設定データが古いレスポンスで上書きされる事故を防ぐため)。
//   キャッシュ対象は静的アセット(HTML/CSS/JS/マニフェスト/アイコン)
//   のみに限定する。
// - `auto-update.js`の既存の仕組み(`version.json`のポーリングで
//   リロードを促す)と役割が重ならないよう、ここでは積極的な
//   キャッシュ更新戦略(stale-while-revalidate等)は組まず、
//   シンプルな「ネットワーク優先、失敗時のみキャッシュ」に留める。

const CACHE_NAME = "open-english-shell-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {
        // 一部アセットの取得に失敗してもインストール自体は続行する
        // (可用性優先、既存プロジェクトの方針を踏襲)。
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // 静的アセット(同一オリジン、GETのみ)だけをオフラインフォールバック
  // 対象にする。APIリクエスト(/v1/...)やクロスオリジンのリクエスト
  // (aruaru-llm等)には一切介入しない。
  const isShellAsset =
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/v1/");
  if (!isShellAsset) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
