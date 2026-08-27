open-english をインストールしていただきありがとうございます。

【重要・2026-08-20追記】会話履歴データについて:
アンインストール(「アプリと機能」から手動でアンインストールした場合)
を選ぶと、会話履歴・設定を保存している {app}\data\ フォルダも含めて
インストール先フォルダ全体が削除されます(これは意図された仕様です)。
一方、**自動アップデート機能**(起動時にGitHubの新バージョンを検出し、
自動でアンインストール→再インストールする仕組み)については、以前は
この{app}\data\フォルダが更新のたびに失われてしまう実害バグが
ありましたが、2026-08-20の修正で更新前に自動退避→更新後に自動復元
するようになり、通常の自動アップデートで会話履歴が失われることは
無くなりました。会話履歴を確実に守りたい場合は、アプリ内の
「💾 Data & Model Storage」パネルから随時バックアップを取ることを
おすすめします。

【2026-08-26更新】aruaru-llm(AI応答エンジン)は open-english の役割上
必ず必要なため、コマンド操作もチェックボックスでの選択も不要で、常に
自動的に一緒にインストールされます(以前は「aruaru-llmも一緒に
インストール」という任意のチェックボックスでしたが、ユーザー指示
「役割上一緒にインストールする事が必要なのは必ず一緒にインストール
するシステムにして」への対応として、選択の余地なく必須コンポーネント
としました)。このアプリの起動時(open-english-server.exeの起動時)に
aruaru-llmがまだ動いていなければ自動的に起動します。スタートメニュー/
デスクトップのショートカットを実行するだけで、ブラウザが
http://127.0.0.1:4601/ を開き、そのままAIとチャットできます。
aruaru-llmは独自のアンインストーラーを持たず(open-englishの一部として
{app}\aruaru-llm\に配置されるのみ)、open-english自体をアンインストール
すれば一緒に削除されます——それだけを個別にアンインストールすることは
できません(意図された設計です)。

正直な開示・制約:
・GitHub側に一時的にWindows向けリリースアセットが見つからない等の理由で
  自動取得が失敗した場合は、以下から手動で取得し、
  {インストール先}\aruaru-llm\aruaru-llm.exe として配置してから
  このアプリを起動し直してください:
  https://github.com/aon-co-jp/aruaru-llm/releases
・aruaru-llmの実際の応答生成に使うAIモデルの重み(GPT-2系、数百MB)は
  このインストーラーには含まれません。取得にコマンド入力は不要です
  ——open-englishを開き、「⚙ Setup aruaru-llm.」パネル内の
  「🧠 Recommend LLM / おすすめLLM」ボタンを押すだけで、お使いの
  端末に合ったモデルを自動的に検出・ダウンロードします(未取得の
  間は、aruaru-llmがその旨を正直に返します)。
・GitHubのリリースにWindows向け aruaru-llm アセットが見つからない場合
  (例: 一時的な欠落)、自動取得はスキップされ、上記の手動手順が
  必要になります。

スマートフォン(Android)から使う場合:
Android版アプリ(open-english)は2026-08-11以降、PC不要の単体動作版
です。アプリ内に open-english のサーバーと aruaru-llm の両方を内蔵
して端末上で直接起動するため、PCのIPアドレスを入力する必要は一切
ありません。Google Playではなく直接配布のAPKのため、初回のみ
「提供元不明のアプリ」の許可が必要です。

(参考)PC上のこのサーバーへ、Androidアプリではなく普通のブラウザ
(スマホ・タブレット・別のPC等)で同じWi-Fi内からアクセスしたい場合の
み、そのブラウザで http://(このPCのIPアドレス):4601/ を開いてください
——その場合もAIサーバー接続先(api-base欄)はページを開いたホスト名
から自動的に補完されるため、手入力は基本的に不要です。

【任意】aruaru-db(PostgreSQLワイヤプロトコル互換ミラーDB)について
(2026-08-19追加): インストール時に「aruaru-dbも一緒にインストール」に
チェックを入れた場合、aruaru-server.exe が {app}\aruaru-db\ に取得
されます。ただしこれは完全に任意の機能です——open-english の会話履歴・
設定は SQLite(ローカルファイル)だけで通常通り動作するため、
aruaru-db を使わなくても問題ありません。使う場合は aruaru-server.exe
をご自身で起動し、環境変数 OPEN_ENGLISH_DATABASE_URL に
その接続先(PostgreSQLワイヤプロトコル)を設定してから
open-english-server.exe を起動してください(コマンド操作が必要です)。
Tauri管理GUI・複数ノードのRaftクラスタ構成等は含まれません(単体の
サーバー実行ファイルのみ)。

【任意】open-easy-web / open-web-serverについて(2026-08-19追加):
インストール時に「open-easy-webも一緒にインストール」「open-web-server
も一緒にインストール」にそれぞれチェックを入れた場合、対応する実行
ファイル一式が{app}\open-easy-web\・{app}\open-web-server\に取得されます。
**正直な開示: これらはopen-englishの動作に一切関係のない、同じ
エコシステムの独立した別製品です**(open-easy-webはVPS側のアプリ配布・
管理ツール、open-web-serverは汎用リバースプロキシ/Webサーバー)。
open-englishの英会話AI機能はaruaru-llmローカルサーバーへの接続のみで
完結しており、これらをインストールしなくても何も変わりません。取得後も
自動起動はしません——それぞれの製品を試したい場合のみ、ご自身で
実行ファイルを起動してください(使い方は各製品自身のREADMEを参照)。

【任意】open-cg-cad(AI工務店&AI建設)について(2026-08-25追加):
インストール時に「open-cg-cadも一緒にインストール」にチェックを入れた
場合、{app}\open-cg-cad\ にファイルが取得されます(2026-08-25時点で
open-cg-cadにはまだGitHub Releasesのビルド済みバイナリが公開されて
いないため、実際には「まだ公開されていません」というメッセージのみが
表示されます——取得成功を偽装しません。将来公開され次第、このタスクで
自動取得できるようになります)。**open-easy-web/open-web-serverとは
異なり、open-cg-cadはopen-englishと実際に連携する設計です**——
open-english画面の「🏗 open-cg-cad」ボタンから別タブで開けるほか、
open-cg-cad側にも「← open-englishへ戻る」リンクがあり、両者は
localStorage経由でお互いのURLを渡し合います。また両アプリとも同じ
aruaru-llmインスタンス(既定http://127.0.0.1:4600)を指せば、
図面のAI解説機能を共有できます。取得後もopen-cg-cad-server.exeの
自動起動はしません(ご自身で起動してください、既定
http://127.0.0.1:4701/)。

【任意】その他のaon-co-jpエコシステムツール(2026-08-26追加):
インストール時に、RS-Blog・RS-EC・RS-Guard・RS-Ops・open-gitea・
open-raid-z・open-redmine・rs-link-fusion・runo.tokyo・open-runo Tray
——これらいずれも**open-english本体の動作には無関係な独立した
aon-co-jp製アプリ**です。必要なものだけチェックを入れてください
(既定はすべて未チェック)。open-easy-web/open-web-serverと違い、
これらはそれぞれ**独自のインストーラー・アンインストーラーを持つ
独立した製品として**インストールされます(open-englishをアン
インストールしても自動的には削除されません、Windowsの「アプリと
機能」から個別にアンインストール可能)。
インストール完了後に、あとから追加・削除したくなった場合は、
スタートメニューの「Manage related tools / 関連ツールの管理」を
実行してください——対話メニューで、各ツールが現在インストール
済みかどうかを確認し、番号を選んでインストール/アンインストール
できます。

---

Thank you for installing open-english.

[Important, added 2026-08-20] About your conversation history:
Uninstalling manually (via "Apps & features") deletes the entire
install folder, including the {app}\data\ folder that holds your
conversation history and settings — this is intended behavior. The
**automatic update mechanism** (which detects a new GitHub release on
startup and silently uninstalls + reinstalls), however, used to have a
real bug where this same {app}\data\ folder was wiped on every
automatic update. As of the 2026-08-20 fix, the data folder is now
backed up before the update and restored afterward, so a routine
automatic update will no longer lose your conversation history. If you
want extra peace of mind, use the "💾 Data & Model Storage" panel in
the app to back up your conversation history whenever you like.

[Updated 2026-08-26] aruaru-llm (the AI backend) is required for
open-english's core purpose, so it is no longer an optional checkbox —
it is always downloaded and installed automatically, no command-line
steps needed. open-english-server.exe automatically launches it on
startup if it isn't already running. Just run the Start Menu / Desktop
shortcut, and your browser will open http://127.0.0.1:4601/ ready to
chat. aruaru-llm has no separate uninstaller of its own (it lives
inside {app}\aruaru-llm\) — uninstalling open-english removes it too;
it cannot be uninstalled on its own by design.

Honest disclosure / limitations:
- If the automatic download fails (e.g. a temporary gap in GitHub
  release assets), download it manually and place it at
  {install dir}\aruaru-llm\aruaru-llm.exe, then restart this app:
  https://github.com/aon-co-jp/aruaru-llm/releases
- The AI model weights aruaru-llm needs for actual response
  generation (GPT-2 family, hundreds of MB) are not bundled by this
  installer. No commands needed to fetch them — open open-english,
  go to the "⚙ Setup aruaru-llm." panel, and click the
  "🧠 Recommend LLM" button; it auto-detects your hardware and
  downloads a matching model (aruaru-llm will honestly report if
  weights are still missing).
- If no Windows aruaru-llm release asset is found on GitHub (e.g. a
  temporary gap), the automatic fetch is skipped and the manual steps
  above are required.

To use this from a smartphone (Android):
Since 2026-08-11 the Android app (open-english) is a standalone build
that runs without a PC. It bundles both the open-english server and
aruaru-llm and launches them directly on the device, so entering this
PC's IP address is never required. Since it is distributed as a
direct APK (not via Google Play), you'll need to allow "install from
unknown sources" the first time.

(For reference) If you instead want to reach this PC's server from a
regular mobile/tablet/PC browser on the same Wi-Fi (not the Android
app), open http://(this PC's IP address):4601/ in that browser — the
AI server address field (api-base) there is also auto-filled from the
hostname you used to open the page, so manual entry is normally not
needed either.

[Optional] About aruaru-db (PostgreSQL-wire compatible mirror DB,
added 2026-08-19): If you checked "Also install aruaru-db" during
setup, aruaru-server.exe was downloaded to {app}\aruaru-db\. This is
entirely optional — open-english's conversation history and settings
work fine on SQLite (a local file) alone, so you do not need
aruaru-db. To use it, start aruaru-server.exe yourself and set the
OPEN_ENGLISH_DATABASE_URL environment variable to its endpoint
(PostgreSQL wire protocol) before starting open-english-server.exe
(this is a one-time command-line step). The Tauri admin GUI and
multi-node Raft clustering are not included (single server binary
only).

[Optional] About open-easy-web / open-web-server (added 2026-08-19):
If you checked "Also install open-easy-web" / "Also install
open-web-server" during setup, the corresponding executables were
downloaded to {app}\open-easy-web\ and {app}\open-web-server\.
**Honest disclosure: these are unrelated to how open-english works**
— they are separate standalone products from the same ecosystem
(open-easy-web is a VPS-side app distribution/management tool,
open-web-server is a general-purpose reverse-proxy/web server).
open-english's conversation-AI feature only ever talks to its own
local aruaru-llm server; nothing changes whether or not you install
these. Neither is auto-launched after download — only run their
executables yourself if you want to try them (see each product's own
README for setup).

[Optional] About open-cg-cad (AI construction/CAD assistant, added
2026-08-25): If you checked "Also install open-cg-cad" during setup,
files were fetched to {app}\open-cg-cad\ (as of 2026-08-25, open-cg-cad
has not yet published a built binary on GitHub Releases, so in
practice you'll only see an honest "not published yet" message — no
fake success. Once a release exists, this same task will fetch it
automatically). **Unlike open-easy-web/open-web-server, open-cg-cad is
designed to actually interoperate with open-english** — a "🏗
open-cg-cad" button in open-english opens it in a new tab, and
open-cg-cad has its own "back to open-english" link; the two pass
each other's URL via localStorage. Both apps can also point at the
same local aruaru-llm instance (default http://127.0.0.1:4600) to
share the drawing AI-explanation feature. open-cg-cad-server.exe is
not auto-launched after download — run it yourself (default
http://127.0.0.1:4701/).

[Optional] Other aon-co-jp ecosystem tools (added 2026-08-26):
During setup you can also check RS-Blog, RS-EC, RS-Guard, RS-Ops,
open-gitea, open-raid-z, open-redmine, rs-link-fusion, runo.tokyo, and
open-runo Tray — all of these are **independent aon-co-jp apps
unrelated to open-english's own function** (all unchecked by default).
Unlike open-easy-web/open-web-server above, each of these is installed
as its **own product with its own installer/uninstaller** (they are
not removed automatically when you uninstall open-english; uninstall
them individually via Windows "Apps & features").
If you want to add or remove any of them after setup is done, run
"Manage related tools" from the Start Menu — an interactive menu
shows which of these tools are currently installed and lets you pick
a number to install or uninstall it.
