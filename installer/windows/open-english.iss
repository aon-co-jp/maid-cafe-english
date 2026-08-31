; open-english Windowsインストーラー(Inno Setup)。
;
; ユーザー指示「Windows用とAndroidスマホ様にインストーラー付きアプリに
; して、アンインストーラーとバージョン管理機能も付けて」への対応。
;
; 正直な開示: このインストーラー自体が同梱するのは本リポジトリ
; (open-english)の静的フロントエンド+配信サーバー(server/、RPoemベース)
; のみ。`aruaru-llm`(AI推論本体、既定同梱)・`aruaru-db`(任意の
; PostgreSQLワイヤ互換ミラーDB)・`open-easy-web`/`open-web-server`
; (いずれも任意、open-englishの動作には機能的に無関係な独立
; エコシステム別製品)はいずれも別リポジトリの実行ファイルのため、
; インストーラー本体には含めず、[Tasks]でチェックされた場合のみ各
; fetch-*.ps1がGitHub Releasesから追加ダウンロードする(2026-08-19、
; open-easy-web/open-web-server取得を追加)。手動で取得する場合は
; それぞれ https://github.com/aon-co-jp/aruaru-llm/releases /
; https://github.com/aon-co-jp/aruaru-db/releases /
; https://github.com/aon-co-jp/open-easy-web/releases /
; https://github.com/aon-co-jp/open-web-server/releases から取得する
; (インストール後に表示するREADMEに明記)。
;
; ビルド方法: `server/`で`cargo build --release`を実行した後、
; このディレクトリで`ISCC.exe open-english.iss`を実行する。

; MyAppVersion: 実際のリリースタグと手動で同期させる必要があったため
; 2026-08-17時点で0.6.3のまま何度もリリースを跨いで取り残されていた
; (ユーザー指摘「install.exeと分かりやすい名前にすべきでは」で発覚した
; 副次的な実バグ)。CI(release.yml)が`/DMyAppVersion=...`でタグの
; バージョン番号を渡すため、それが無い場合(手元でのローカルビルド等)の
; フォールバック値としてのみこの値を使う。
#define MyAppName "open-english"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-local-build"
#endif
#define MyAppPublisher "aon-co-jp"
#define MyAppURL "https://github.com/aon-co-jp/open-english"
#define MyAppExeName "open-english-server.exe"

[Setup]
; PrivilegesRequired=lowest: このアプリは管理者権限を必要とする操作
; (システム領域への書き込み・サービス登録等)を一切行わないため、
; UAC昇格プロンプトを不要にする(ユーザー体験の改善、かつ非対話的な
; 自動インストール検証を可能にするための実用上の理由もある)。
PrivilegesRequired=lowest
AppId={{8F2C9B1A-6E44-4B7E-9C10-2C3E7B4A9D01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; アンインストーラーはInno Setupが自動生成・レジストリ登録する
; (Windows「アプリと機能」から標準の方法でアンインストール可能)。
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
OutputDir=dist
; 2026-08-17変更(ユーザー指摘「install.exeと分かりやすい名前にすべき
; では」への対応): 従来はバージョン番号入りのファイル名
; (`open-english-setup-{version}.exe`)だったが、(a) バージョン部分が
; 実際のリリースと同期されず何度も取り残されるバグの温床になっていた、
; (b) ユーザーにとって「これがインストーラーだ」と一目で分かる名前では
; なかった。エコシステム全体の命名規則として`<アプリ名>-install.exe`
; (バージョン番号なし、常に同じファイル名)に統一する(ユーザー承認、
; 2026-08-17)——`server/src/self_update.rs`のアセット検出ロジックも
; "setup"ではなく"install"を含むファイル名を探すよう合わせて変更済み。
OutputBaseFilename=open-english-installer
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\server\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\style.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\app.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\auto-update.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\manifest.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\exam-prep-questions.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\icons\*"; DestDir: "{app}\icons"; Flags: ignoreversion recursesubdirs
Source: "README-INSTALLED.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-aruaru-llm.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-aruaru-db.ps1"; DestDir: "{app}"; Flags: ignoreversion
; ブラウザ内 Whisper 音声認識(P2-α)用の ONNX モデル取得
; スクリプト + 単体GUIインストーラー(2026-08-29新設)。exe も {app} へ
; 同梱し、あとからモデルだけ再取得/更新したい利用者が使えるようにする。
Source: "fetch-whisper-model.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "whisper-model-installer.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-open-easy-web.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-open-web-server.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-open-cg-cad.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "fetch-related-tool.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "manage-related-tools.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
; インストール後でも関連ツールを追加・削除できるようにする
; (ユーザー指示「インストールが完了したあとでも、インストールや
; アンインストール可能なものは簡単に行えるようにして」への対応、
; 2026-08-26)。対話メニューのためコンソールウィンドウを表示する。
;
; 【2026-08-27 BUG修正、続き】Nameパラメータ内の"\"はInno Setupにとって
; スタートメニューの「サブフォルダ区切り」であり、単なる日英併記の
; 視覚的な区切り文字としては使えない——旧記述
; "Manage related tools \ 関連ツールの管理" は、末尾に半角スペースを
; 含むサブフォルダ「Manage related tools 」を作成しようとし、
; 実機でIPersistFile::Save エラー(コード0x80070003、指定されたパスが
; 見つかりません)を引き起こすバグだった(ユーザー報告のスクリーン
; ショットで実際に確認)。**最初の修正で"/"(スラッシュ)へ変更したが、
; 実機再検証したところ"/"もWindowsのパスAPI側で"\"へ正規化され、
; 依然として空のサブフォルダが作成されてしまうことが判明した**
; (正直な記録: 1回目の修正は不十分だった)。パス区切りとして解釈
; されない文字が必要なため、最終的にスラッシュ類を避け
; "Manage related tools (関連ツールの管理)"という、丸括弧で日本語訳を
; 併記する形に変更した。
Name: "{group}\Manage related tools (関連ツールの管理)"; \
    Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\manage-related-tools.ps1"""; \
    WorkingDir: "{app}"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
; aruaru-db同梱タスク(ユーザー指示「aruaru-dbも同梱して」への対応、
; 2026-08-19)。既定は未チェック——aruaru-llmと違いopen-english本体の
; 動作に必須ではないため(会話履歴はSQLite単体で完結。aruaru-dbは
; `OPEN_ENGLISH_DATABASE_URL`を設定した場合のみ有効になるオプションの
; PostgreSQLワイヤ互換ミラー先)。正直な開示: 取得するのは`aruaru-server`
; (単体で完結するPure Rustバイナリ、PostgreSQLワイヤプロトコルを自前実装
; しており外部PostgreSQL本体のインストールは不要)の実行ファイルのみ。
; Tauri管理GUI・Raft分散クラスタ構成・バックアップ運用等は含まれず、
; 取得後も自動起動はしない(ユーザー自身が`aruaru-server.exe`を起動し
; `OPEN_ENGLISH_DATABASE_URL`を設定する必要がある、手順はfetch-aruaru-db.ps1
; の出力メッセージとREADME-INSTALLED.txtに記載)。
Name: "installaruarudb"; Description: "Also install aruaru-db (optional PostgreSQL-wire mirror DB, not required) / aruaru-db(任意のPostgreSQL互換ミラーDB、必須ではありません)も一緒にインストール"; Flags: unchecked
; ブラウザ内 Whisper 音声認識モデル(P2-α、~40-80MB)。既定は未チェック
; ——チェックしなくても、open-english-server が起動時の自動メンテナンスで
; モデルが無ければ自動取得する(server/src/main.rs)。ここでチェックすると
; インストール時に先に取得しておく(初回起動を速くしたい場合向け)。
Name: "installwhispermodel"; Description: "Also download the browser Whisper speech-recognition model now (~40-80 MB; otherwise fetched automatically on first run) / ブラウザ内 Whisper 音声認識モデル(約40〜80MB)を今ダウンロード(未選択でも初回起動時に自動取得)"; Flags: unchecked
; open-easy-web/open-web-server同梱タスク(ユーザー指示「open-easy-web も
; open-web-serverもopen-englishの同梱に含めて」への対応、2026-08-19。
; 2026-08-26追記: ユーザー指摘「必要なのか?一緒にインストールする
; メリットを明確に」を受け、下記の通り具体的な利用場面を明記した)。
;
; 正直な開示・具体的な必要性(いつ必要か、いつ不要か):
; - open-englishを**このPC単体でローカルに使うだけなら、どちらも
;   不要**(既定でlocalhost経由で完結して動作する)。
; - **open-web-server**が役立つ場面: このPC上のopen-english(または
;   aruaru-llm)を、スマホ・タブレット等**同一LAN内の他端末**や
;   インターネット経由で、独自ドメイン+正式なTLS証明書付きで公開
;   したい場合(汎用リバースプロキシ/Webサーバーとして機能する)。
;   単にLAN内で使うだけならopen-web-server無しでも既存のLANアクセス
;   機能(ホスト名:4600への自動接続、CLAUDE.md参照)で足りる。
; - **open-easy-web**が役立つ場面: 自分のVPS(レンタルサーバー)上に
;   open-english(や他のaon-co-jp製アプリ)を**複数まとめて**デプロイ・
;   ドメイン登録・HTTPS自動発行したい場合(VPS側のアプリ配布・管理
;   ツール)。PC/スマホでの利用のみなら不要。
; - いずれもopen-english自身のCLAUDE.md「アーキテクチャ」節に明記の
;   通り、open-englishの英会話AI機能自体への技術的な依存関係は無い
;   ——上記の追加ユースケースに該当しない場合は不要。既定オフのまま。
Name: "installopeneasyweb"; Description: "Also install open-easy-web — useful if you want to deploy open-english (or other aon-co-jp apps) on your own VPS/rental server with domain + auto-HTTPS; NOT needed for local PC/phone use / open-easy-webも一緒にインストール——ご自身のVPS/レンタルサーバーへopen-english(や他のaon-co-jp製アプリ)をドメイン+自動HTTPS付きでデプロイしたい場合に便利です。PC/スマホでのローカル利用のみなら不要です"; Flags: unchecked
Name: "installopenwebserver"; Description: "Also install open-web-server — useful if you want to expose this PC's open-english to other devices on your LAN or the internet with a proper domain + TLS; NOT needed for local-only use / open-web-serverも一緒にインストール——このPCのopen-englishを独自ドメイン+正式なTLSでLAN内の他端末やインターネットへ公開したい場合に便利です。ローカル利用のみなら不要です"; Flags: unchecked
; open-cg-cad同梱タスク(ユーザー指示「open-englishかopen-easy-webから
; open-cg-cadをインストールすると、open-englishとopen-cg-cadはハイブリッド
; で相互に機能するシステムという仕様にして」への対応、2026-08-25)。
; 既定は未チェック(必須ではないため、他の任意タスクと同じ方針)——ただし
; open-easy-web/open-web-serverとは異なり「無関係」ではなく、実際に
; 相互リンク+同じaruaru-llmインスタンスの共有という形で連携する設計
; (詳細はfetch-open-cg-cad.ps1冒頭のコメント、CLAUDE.md「アーキテクチャ」
; 節参照)。正直な開示: 2026-08-25時点でopen-cg-cadにはまだGitHub
; Releasesのビルド済みバイナリが無く、このタスクを有効にしても
; スクリプトが正直にその旨を報告するのみに留まる(取得成功を偽装しない)。
Name: "installopencgcad"; Description: "Also install open-cg-cad (optional, AI construction/CAD app that interoperates with open-english via shared links and a shared aruaru-llm backend) / open-cg-cad(任意、open-englishと相互リンク+同じaruaru-llmバックエンド共有で連携するAI工務店&AI建設CADアプリ)も一緒にインストール"; Flags: unchecked
; 2026-08-26新設: aon-co-jpエコシステムの他ツール(open-english本体の
; 動作には無関係な独立製品)を、ワンクリックでまとめてインストール
; できるようにする(ユーザー指示「open-english-installer.exeをダブル
; クリックしただけで、関連インストーラーも全部インストール可能で、
; 特に必要でない場合関連インストーラーがあれば、選択式にして」への
; 対応)。**いずれも既定は未チェック**(open-easy-web/open-web-server
; と同じ方針、無関係な製品を利用者の意図に反して追加インストール
; しないため)。**この一群は上記のaruaru-llmとは異なり、それぞれが
; 独自のインストーラー・アンインストーラーを持つ独立した製品として
; インストールされる**(利用者が後から個別にアンインストール可能
; ——「Windowsの設定→アプリ」から、または後述の関連ツール管理
; スクリプトから)。各ツールの役割の要約(詳細は各リポジトリの
; README/CLAUDE.md参照):
Name: "installrsblog"; Description: "RS-Blog — independent blog engine / RS-Blog——独立したブログエンジン(open-englishとは無関係)"; Flags: unchecked
Name: "installrsec"; Description: "RS-EC — independent e-commerce tool / RS-EC——独立したECツール(open-englishとは無関係)"; Flags: unchecked
Name: "installrsguard"; Description: "RS-Guard — independent security/supply-chain scanner / RS-Guard——独立したセキュリティ/サプライチェーンスキャナ(open-englishとは無関係)"; Flags: unchecked
Name: "installrsops"; Description: "RS-Ops — independent ops/deployment CLI tool / RS-Ops——独立した運用・デプロイ支援CLIツール(open-englishとは無関係)"; Flags: unchecked
Name: "installopengitea"; Description: "open-gitea — independent self-hosted Git server / open-gitea——独立した自己ホスト型Gitサーバー(open-englishとは無関係)"; Flags: unchecked
Name: "installopenraidz"; Description: "open-raid-z — independent ZFS-compatible storage CLI (orzctl) / open-raid-z——独立したZFS互換ストレージCLI(orzctl、open-englishとは無関係)"; Flags: unchecked
Name: "installopenredmine"; Description: "open-redmine — independent project-management tool / open-redmine——独立したプロジェクト管理ツール(open-englishとは無関係)"; Flags: unchecked
Name: "installrslinkfusion"; Description: "rs-link-fusion — independent multi-WAN/multi-LAN network tool / rs-link-fusion——独立した複数WAN/LAN対応ネットワークツール(open-englishとは無関係)"; Flags: unchecked
Name: "installrunotokyo"; Description: "runo.tokyo — independent personal site app / runo.tokyo——独立した個人サイトアプリ(open-englishとは無関係)"; Flags: unchecked
Name: "installopenrunotray"; Description: "open-runo Tray — independent system-tray companion for the aon-co-jp ecosystem / open-runo Tray——独立したシステムトレイ常駐アプリ(open-englishとは無関係)"; Flags: unchecked

[Run]
; aruaru-llmはopen-englishのAI応答機能そのものに必須のため(2026-08-26、
; ユーザー指示「役割上一緒にインストールする事が必要なのは必ず一緒に
; インストールするシステムにして」への対応)、選択式チェックボックスを
; 廃止し常に取得する(旧`installaruarullm`タスクは削除済み)。取得先は
; open-english自身の`{app}\aruaru-llm\`(独立したアンインストーラーを
; 持たない、open-english自体をアンインストールすれば一緒に削除される)
; ため、「むやみにそれだけアンインストールできない」という要件も
; この配置だけで自然に満たされる。
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-aruaru-llm.ps1"" -DestDir ""{app}\aruaru-llm"""; \
    StatusMsg: "Downloading aruaru-llm (required)... / aruaru-llm(必須)をダウンロード中..."; \
    Flags: runhidden waituntilterminated
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-aruaru-db.ps1"" -DestDir ""{app}\aruaru-db"""; \
    StatusMsg: "Downloading aruaru-db (optional)... / aruaru-db(任意)をダウンロード中..."; \
    Flags: runhidden waituntilterminated; \
    Tasks: installaruarudb
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-whisper-model.ps1"" -DestDir ""{app}\models"""; \
    StatusMsg: "Downloading the browser Whisper model (~40-80 MB)... / ブラウザ内 Whisper モデル(約40〜80MB)をダウンロード中..."; \
    Flags: runhidden waituntilterminated; \
    Tasks: installwhispermodel
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-open-easy-web.ps1"" -DestDir ""{app}\open-easy-web"""; \
    StatusMsg: "Downloading open-easy-web (optional)... / open-easy-web(任意)をダウンロード中..."; \
    Flags: runhidden waituntilterminated; \
    Tasks: installopeneasyweb
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-open-web-server.ps1"" -DestDir ""{app}\open-web-server"""; \
    StatusMsg: "Downloading open-web-server (optional)... / open-web-server(任意)をダウンロード中..."; \
    Flags: runhidden waituntilterminated; \
    Tasks: installopenwebserver
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-open-cg-cad.ps1"" -DestDir ""{app}\open-cg-cad"""; \
    StatusMsg: "Downloading open-cg-cad (optional)... / open-cg-cad(任意)をダウンロード中..."; \
    Flags: runhidden waituntilterminated; \
    Tasks: installopencgcad
; その他のaon-co-jpエコシステムツール(2026-08-26新設、それぞれ独自の
; インストーラー<リポジトリ名>-installer.exeをダウンロードし
; /VERYSILENTで実行する。runhiddenを付けない——管理者権限が必要な
; ものはUACプロンプトを表示する必要があるため)。
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo RS-Blog -DestDir ""{app}\related\RS-Blog"""; \
    StatusMsg: "Installing RS-Blog (optional)... / RS-Blog(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrsblog
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo RS-EC -DestDir ""{app}\related\RS-EC"""; \
    StatusMsg: "Installing RS-EC (optional)... / RS-EC(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrsec
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo RS-Guard -DestDir ""{app}\related\RS-Guard"""; \
    StatusMsg: "Installing RS-Guard (optional)... / RS-Guard(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrsguard
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo RS-Ops -DestDir ""{app}\related\RS-Ops"""; \
    StatusMsg: "Installing RS-Ops (optional)... / RS-Ops(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrsops
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo open-gitea -DestDir ""{app}\related\open-gitea"""; \
    StatusMsg: "Installing open-gitea (optional)... / open-gitea(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installopengitea
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo open-raid-z -DestDir ""{app}\related\open-raid-z"""; \
    StatusMsg: "Installing open-raid-z (optional)... / open-raid-z(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installopenraidz
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo open-redmine -DestDir ""{app}\related\open-redmine"""; \
    StatusMsg: "Installing open-redmine (optional)... / open-redmine(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installopenredmine
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo rs-link-fusion -DestDir ""{app}\related\rs-link-fusion"""; \
    StatusMsg: "Installing rs-link-fusion (optional)... / rs-link-fusion(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrslinkfusion
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo runo.tokyo -DestDir ""{app}\related\runo.tokyo"""; \
    StatusMsg: "Installing runo.tokyo (optional)... / runo.tokyo(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installrunotokyo
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\fetch-related-tool.ps1"" -Owner aon-co-jp -Repo RPoem -DestDir ""{app}\related\open-runo-tray"" -AssetPattern ""open-runo-tray-installer.exe"""; \
    StatusMsg: "Installing open-runo Tray (optional)... / open-runo Tray(任意)をインストール中..."; \
    Flags: waituntilterminated; \
    Tasks: installopenrunotray
; 実機E2E検証(2026-08-12)で発覚した実バグ: self_update.rsは
; `/VERYSILENT`でこのインストーラーを起動して無人での自動更新を行う
; ため、サーバー起動エントリに`skipifsilent`が付いていると更新後に
; サーバーが自動起動しない(GUIウィザードでの「起動する」チェックボックス
; 相当の分岐がサイレント時は常にスキップされるため)。ブラウザを開く方は
; 無人更新中にユーザーの意図しないウィンドウが突然開くのを避けるため
; `skipifsilent`を維持する(通常のGUIインストールでは表示、サイレント
; 自動更新では非表示、のままで問題ない)。
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall
Filename: "http://127.0.0.1:4601/"; Flags: shellexec nowait postinstall skipifsilent runasoriginaluser

[UninstallDelete]
; ログ等の生成物が残っていても正常にアンインストールできるよう、
; インストールディレクトリ自体を明示的に削除対象にする。
Type: filesandordirs; Name: "{app}"
