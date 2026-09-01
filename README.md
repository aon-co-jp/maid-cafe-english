# open-english

*English*: [README-English.md](README-English.md) ·
*Other languages*: [中文](README-Chinese.md) · [한국어](README-Korean.md) ·
[Español](README-Spanish.md) · [Deutsch](README-German.md) · [Italiano](README-Italian.md) ·
[Français](README-French.md) · [Русский](README-Russian.md) ·
[Українська](README-Ukrainian.md) · [עברית](README-Hebrew.md) ·
[فارسی](README-Persian.md) · [العربية](README-Arabic.md)

> 📌 **最新の更新(2026-08-29): AI音声認識(ASR)精度の抜本改善に着手**。
> 正本は [`docs/SPEECH_RECOGNITION_REDESIGN.md`](docs/SPEECH_RECOGNITION_REDESIGN.md)
> (英日・多言語で Google/GitHub 調査した結果と、open-english /
> open-directx / open-cuda / open-cpu / aruaru-llm の 5 リポジトリ連携での
> 改善設計)。**現状**: P1(クライアントのみ・新規依存ゼロ = BCP-47 言語
> 修正・n-best・LLM 訂正・語彙バイアス・翻訳ヘルパー)実装済み。
> P2-α(ブラウザ内 Whisper、transformers.js、実行段カスケード
> WebGPU→WebNN→WASM)実装済み。P2-β(`aruaru-llm` の
> `POST /v1/transcribe`、whisper.cpp)は API・`/v1/runtime` の `whisper` 段
> まで実装済みだが、`whisper-rs` の Windows/MSVC ビルド不能(既知の上流
> ブロッカー)により**次周に whisper.cpp プレビルド CLI のサブプロセス
> 起動方式へ差し替え予定**。2026-08-29 の多言語再調査で
> transformers.js の dtype 落とし穴(WebGPU + q8 デコーダは出力が壊れる →
> fp32 encoder + q4 decoder のハイブリッドへ修正済み)も反映。詳細・
> 次にすべきことは設計文書と [CLAUDE.md](CLAUDE.md) の 2026-08-29 HANDOFF
> 参照。
>
> 📌 **最新の更新(2026-08-27 続き4)**: 実機E2Eテストで、検索付き
> プロンプトに「質問の中にペルソナ全文と別の生成キューが入れ子になる」
> 品質バグを発見・修正。`Question: {生の発話}\nAnswer:`という意図通りの
> シンプルな構造で`aruaru-llm`へ送られることを、fetchインターセプトで
> 実際に確認済み。Google検索④vaultモードのキー漏れバグ・ステータス
> 誤表示バグの修正(GitHubトークン側にも同種の防御的修正を横展開)も
> 実施。詳細は[CLAUDE.md](CLAUDE.md)の2026-08-27(続き11〜13)エントリ
> 参照。
>
> 📌 **更新(2026-08-27 続き3)**: ログイン機能を2つのメール
> アドレス(email1必須+email2任意のバックアップ)対応へ拡張。同じ
> ワンタイムコードが両方へ送られ、どちらか一方で受け取れればログイン
> 可能(二段階認証ではなく、可用性向上のための予備アドレス)。既存の
> クライアントとの後方互換を維持(`email2`省略可)。`cargo build
> --release`成功、HTTPリクエストの受理・DOM要素の存在をブラウザで
> 確認済み(実SMTP送信のE2E検証はこの開発機にSMTP環境が無いため未実施)。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-27(続き5)エントリ参照。
>
> 📌 **更新(2026-08-27 続き2)**: クロスオリジンiframeサンドボックス
> 保管庫(`vault.html`)を実装。GitHubトークンの復号・GitHub APIへの実際の
> fetch呼び出しをvault内だけで行い、本体(index.html)へはpush結果のURLの
> みを返す設計(平文トークンが本体のJSへ一切渡らないことを実機検証済み)。
> `sandbox="allow-scripts allow-same-origin allow-forms"`も設定したが、
> **同一オリジン配信の間はこの組み合わせがsandboxを実質的に無効化する
> 既知の落とし穴があり、真の分離は別オリジン配信でしか得られない**旨を
> 誇張せずUIに明記。今回は同一オリジンでの動作確認に留まり、実際の
> 別サブドメイン配信での検証は次回課題。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-27(続き3)エントリ参照。
>
> 📌 **更新(2026-08-27 続き)**: Google検索APIキーにもGitHub連携と
> 同じ安全な受け渡し方式(①ファイル/②暗号化/③平文)を追加。一方AI
> プロバイダ(ChatGPT/DeepSeek/Gemini/Claude)のキーは、機能上サーバーへ
> 必ず平文送信される設計のため暗号化しても意味が無いと判断し、**見せかけ
> の対策を追加しないことを選択**(理由をUIに明記)。あわせて、
> 2026-08-26〜27の平文保存期間中に保存したGitHubトークンの失効・
> 再発行、およびVPS/レンタルサーバーのSSH鍵等を他の場所で平文保存して
> いた場合の破棄・再発行を推奨する案内を日英併記で追加。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-27(続き)エントリ参照。
>
> 📌 **更新(2026-08-27)**: フリーランス開発コーナーのGitHub
> トークンの受け渡し方法を3種類に拡張(①ローカルファイルから読み込み
> ・保存しない〈推奨〉、②パスフレーズでAES-GCM暗号化してから保存
> 〈利便性との折衷、暗号化の限界も正直に開示〉、③平文保存〈非推奨・
> 旧来方式〉)。実機検証済み(暗号化ラウンドトリップ・誤パスフレーズでの
> 失敗・削除・ファイル読込のいずれも確認)。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-27エントリ参照。
>
> 📌 **更新(2026-08-26 続き3)**: 「フリーランス開発コーナー」を
> 新設(💼ボタン)。プログラミング言語100種(選択または自由入力)+
> フレームワーク自由入力→Google検索を新規タブで開く方式での公式情報・
> フリーランス案件検索(APIキー不要)→URL/テキストコピー→サンプル案件
> または実案件メモを元にAI先生へ相談、という一連の流れを実装・実機検証
> 済み。さらにGitHubへの自動アップロード(ブラウザから直接GitHub REST
> APIを呼び、個人アクセストークンでリポジトリ作成+ファイルpush、
> 公開/非公開選択可)も実装——**トークンはブラウザのlocalStorageにのみ
> 保存しサーバーへは送らない設計だが、日英併記の安全上の警告を必ず
> 表示**。VPS自動読み書き(ブラウザの技術的制約で同方式では実現不可)・
> GitLab/Bitbucket等への同様連携・DB記録は未実装、次回課題。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-26(続き)エントリ参照。
>
> 📌 **更新(2026-08-26 続き2、未着手タスクの記録)**: 「Google
> 検索結果を参考にAIが回答している」という理解は正しい一方、GPT-2系の
> 小型モデルが検索結果を正確に活用する保証は無いという既存の制約は
> 変わりません。この制約をRust+RPoem+open-directx/open-cuda+
> aruaru-llm側の改善で緩和できないか、次回セッションで調査・改善する
> ことを記録しました(今回は調査・実装とも未着手)。詳細は
> [CLAUDE.md](CLAUDE.md)・[aruaru-llm/CLAUDE.md](https://github.com/aon-co-jp/aruaru-llm/blob/main/CLAUDE.md)の
> 2026-08-26(続き3)エントリ参照。
>
> 📌 **更新(2026-08-26 続き): GitHub/YouTube検索連携+無料枠切れ
> 表示+APIキー取得リンク+DB保存確認機能を追加**:
> - 「🔀 AI Provider Priority」パネルからGoogle検索・GitHub検索
>   (トークン任意)・YouTube検索(APIキー必要)をチェックボックスで
>   有効化でき、実際にチャット送信のたびに検索結果がAIへの依頼文へ
>   埋め込まれるようになりました(この機能は前回追加時、実際の会話
>   フローへ配線されていなかったバグを今回修正しています)。
> - 設定済みの全AIプロバイダで本日の無料枠を使い切った場合のみ、
>   日英併記で「本日の無料枠は使い切りました」と表示し、内蔵の
>   ローカルAIへ自動的に切り替えます。有料契約済みのプロバイダは
>   自動的にそのまま使われ続けます(無料枠切れの判定自体が発生しない
>   ため)。
> - OpenAI/DeepSeek/Gemini/Claude各社のAPIキー取得ページへの直リンクを
>   追加しました。
> - ダウンロードPC版でご利用の場合、APIキー保存時に「ローカルデータ
>   ベースに保存して次回の再入力を省略しますか?」と日英併記で確認する
>   ようになりました(同意した場合のみ保存、ブラウザ版では表示されません)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-26(続き2)HANDOFF参照。
>
> 📌 **更新(2026-08-26): マルチLLMプロバイダ優先順位機能を追加**:
> - Google検索の他、ChatGPT(OpenAI)・DeepSeek・Gemini・Claude
>   (Anthropic)を単体でも同時実行でも呼び出せるようになりました
>   (実装は`aruaru-llm`側`chat_providers.rs`・`provider_priority.rs`)。
> - 「🔀 AI Provider Priority」パネルから「無料枠を優先で使い切り、
>   順番に使用」を有効化でき、5サービスの優先順位は番号入力欄・
>   番号のラジオボタンいずれでも変更できます(重複は入れ替えで解決)。
> - 各社APIキーはこのブラウザのlocalStorageにのみ保存され、
>   ご自身のaruaru-llmへ実行時設定として送られます(ディスクへの
>   永続化はしません、既存のGoogle検索キー設定と同じ方針)。
> - 実際に両サーバーを起動し、ブラウザのUI操作→aruaru-llmへの設定
>   反映→実際のAnthropic APIへのHTTPリクエストまでを実機検証済みです。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-26 HANDOFF、
>   [aruaru-llm/CLAUDE.md](https://github.com/aon-co-jp/aruaru-llm/blob/main/CLAUDE.md)参照。
>
> 📌 **更新(2026-08-25 続き14): メンテナンスバナーの改善+
> ブラウザ内AI実行(WASM+WebGPU)構想の技術検証+Google検索APIキーの
> 共有消費バグ修正**:
> - メンテナンスバナーが終了時に日英併記の「終了しました」メッセージへ
>   切り替わり、長い説明文はCLOSE/OPENで開閉できるようになりました。
> - 資格試験対策で、問題データが未収録の区分を選んだ際に画面が無反応に
>   見えるバグを修正し、「準備中です」と正直に案内するようにしました。
> - ブラウザ内でaruaru-llm/open-cuda/open-directxのAI/GPU計算が実行
>   できるかを調査した結果、**現時点では未実装**であることを確認し、
>   実現可能性の技術検証(`wgpu`のブラウザ向けビルドがコンパイル
>   レベルで成功することを確認)と段階的な導入計画を策定しました
>   (詳細は`RPoem`/`aruaru-llm`のCLAUDE.md参照)。**現状唯一の実用的な
>   手段は引き続き「利用者自身の端末でaruaru-llmネイティブ版を起動し
>   localhost:4600へローカル接続する」という既存アーキテクチャ**です。
> - Google検索APIキーは、複数の訪問者が共有するVPSデプロイで意図せず
>   共有・消費されないよう、各自のキーをブラウザのローカルストレージに
>   のみ保存する方式へ変更しました(開発者が設定したキーは訪問者の
>   検索で使用・消費されません)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25(続き14)HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き13): world-lab複数デバイス計算配布
> Phase B(受信側の明示的承認ゲート+TLS)を実装、実機HTTP/TLS検証済み
> ——実物理デバイス間の配布(Phase C)は依然未着手**:
> - **承認ゲート**: 計算タスクが届いても、受信側が`承認/拒否`を明示的に
>   選ぶまでは既存Phase 2のWASMサンドボックスは一切実行されません
>   (自動承認の設定はコード上どこにも存在しません)。二重承認・二重
>   拒否・不明ID・キュー上限超過はいずれも正直なエラーになることを
>   単体テスト7件+実HTTP往復(curl/PowerShell)で確認済みです。
> - **TLS**: `RPoem`の既存rustls実装を再利用し、
>   `OPEN_ENGLISH_TLS_ENABLED=1`でオプトインの第2ポートを追加しました
>   (証明書未指定時は開発専用の自己署名証明書を生成)。実ハンドシェイク
>   ・証明書検証エラーの両方を実機`curl`で確認済み。既存の平文HTTPポート
>   は今回廃止していません。
> - **正直な開示**: 今回の検証はすべて単一マシン上のcurl/PowerShellに
>   よるものであり、**2台以上の実物理デバイス間でのクロスデバイス配布
>   (送信側の実装含む)はまだ一切行っていません**(Phase Cで着手予定)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25(続き13)HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き12): ハードウェア検出→推奨LLMサイズ機能を
> 実機End-to-Endで再検証(既存実装、コード変更なし)**:
> - `aruaru-llm`側に既に実装済みの`GET /v1/recommend`
>   (`hardware.rs`のCPU/GPU/NPU検出)と、それに配線済みのopen-english
>   側UI(「⚙ Setup aruaru-llm.」パネル内「🧠 Recommend LLM / おすすめ
>   LLM」ボタン)を、実際に両サーバーを起動し実ブラウザで操作して
>   動作を確認しました。このマシンでは実際のCPU(AVX2+FMA3検出)を
>   反映し`GPT-2 (124M, default)`が推奨されました。
> - モデルの切替は`POST /v1/models/select`ボタンをユーザーが明示的に
>   押した場合のみ行われ、サイレントな自動切替はありません。
> - **正直な開示**: 現状の推奨ロジックはGPU VRAM容量のみの単純な
>   閾値判定で、CPUコア数・NPU有無・world-labでペアリングした他デバイス
>   のハードウェアは推奨結果に反映されません。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25(続き12)HANDOFF参照。
>
> 📌 **更新(2026-08-27): open-cg-cad「図面操作」パネルを新設+実機検証済み**:
> - トップバーに「📐 open-cg-cad 図面操作(UPLOAD/合成/再設計)」パネルを
>   追加。半導体(CPU/NPU/GPU)・自動車/バイク/新幹線/リニア/航空機の
>   図面を、open-english画面から直接アップロード・複数図面の合成・
>   旧図面の再設計指示ができます(実データはopen-cg-cad側に保存)。
> - **実機検証済み**: aruaru-llmを実際に起動した状態で、open-english
>   →open-cg-cad→aruaru-llmの3段の経路を通した合成・再設計が実際に
>   成功することを確認済み。aruaru-llmの接続先を上書きする入力欄も
>   あります(既定はこのチャットと同じ`http://localhost:4600`)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-27(続き17・18)HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き10): open-cg-cadとの「ハイブリッド相互
> 機能」をインストーラー経由でも導入可能に**:
> - Windowsインストーラーに`open-cg-cad`も一緒にインストールする任意
>   タスク(既定未チェック)を追加しました。
> - **正直な開示**: 2026-08-25時点で`open-cg-cad`にはまだGitHub
>   Releasesのビルド済みバイナリが公開されていません。そのためこの
>   タスクは現時点では「まだ公開されていません、ソースからビルドして
>   ください」という正直なメッセージを表示するだけで、取得成功を
>   偽装しません。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25(続き10)HANDOFF参照。
>
> 📌 **最新の更新(2026-08-25 続き5): GPU/NPU安全設計の再調査+Copilot
> API連携の見積もりをCLAUDE.mdへ記録(いずれも構想段階、未着手)**:
> - **GPU/NPU越境ディスパッチ**: `wasi:webgpu`(WASI公式提案、2026年
>   4月にwasmCloudで実働デモあり)を有望な候補として特定しました。
>   ただしまだ標準化の途上で、WGSLのメモリ安全性に関する既知の研究
>   指摘もあり、Phase 2のWASMサンドボックスと同列の成熟度には未達
>   ——引き続き未実装です。
> - **Microsoft 365 Copilot API連携**: delegated権限のみサポート
>   (固定APIキー方式は使えない)と判明。OAuth 2.0サインインフロー+
>   リフレッシュトークンの安全な保管を要する規模の実装で、利用者側の
>   Azure ADアプリ登録・Copilotライセンスが前提となるため、別スコープ
>   として設計方針のみ記録し、実装は見送りました。
> - 詳細は[CLAUDE.md](CLAUDE.md)の「将来構想」節参照。
>
> 📌 **更新(2026-08-25 続き4): バーチャルスクールへ「アメリカの
> 資格(擬似模擬)」トラックを追加**:
> - 米国の**データサイエンティスト**(単一の政府公認資格は無く、
>   代表的な民間資格を参考にしたオリジナル模擬問題であることを明記)、
>   **建築士登録試験(NCARB ARE)**(日本の一級建築士に相当する米国の
>   代表的試験)を、日英併記の模擬問題(各5問)として追加しました。
> - 既存のバーチャルスクール機構をそのまま再利用しており、新しい仕組み
>   は増やしていません。実機ブラウザで出題→選択肢シャッフルまで
>   確認済みです。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25(続き3)HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き3): セキュリティ監査で`wasmtime`の
> Critical脆弱性2件を発見・修正+吹き出しの文字色バグ修正**:
> - `cargo audit`による依存関係監査を実施し、world-lab Phase 2の
>   基盤である**`wasmtime`21.0.2にCritical(CVSS 9.0)のサンドボックス
>   脱出脆弱性が2件**含まれていたことを発見しました。`wasmtime`を
>   **48.0.1**へアップグレードして修正——21件あった脆弱性が1件
>   (上流未修正のため対処不能な既知issue)まで減りました。
> - **副産物**: 以前記録していた「fuel枯渇でホストプロセスが
>   クラッシュする」バグも、この更新で解消していることを実機で
>   確認しました(サブプロセス隔離という多層防御は引き続き維持)。
> - `russh`(SSH経由のVPS連携機能)にもHigh(CVSS 7.5)の脆弱性2件が
>   見つかり、0.63.1へアップグレードして修正しました。
> - トレーナーキャラクターの初回挨拶の吹き出しが、暗い背景に暗い
>   文字で読めなくなっていたバグ(ユーザー報告)も修正しました。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き2): 一括ペアリング機能を追加**:
> - 企業・大きなお店等で大量にあるPC/タブレット/スマホを、1回の操作で
>   まとめて登録できる「🏢 一括ペアリング」機能(`POST /v1/world-lab/
>   pair/bulk`)を追加しました。デバイス名を改行区切りで貼り付けるだけ
>   です。
> - **原則は変わりません**: 正しいペアリングトークンを持つ人が明示的に
>   実行する必要があり、1件ごとに通常のペアリングと全く同じ検証を
>   通ります——自動発見・自動承認ではありません。1件失敗しても他の
>   成功分は失われません(件数上限は既定100件)。
> - 実機検証として模擬オフィスPC30台の一括ペアリングを実HTTP経由で
>   確認しました。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25HANDOFF参照。
>
> 📌 **更新(2026-08-25 続き): WAN接続ラベル追加+自動ポート開放
> (UPnP)は明確に見送り+テストのフレーク2件追加発見・修正**:
> - 接続方式に`wan`(インターネット越し)ラベルを追加しましたが、
>   **自動ポート開放(UPnP)は実装しません**——UPnPによる自動ポート
>   開放はそれ自体が長年のルーター攻撃経路として問題視されており、
>   踏み台化防止を掲げるworld-labへ組み込むのは本末転倒と判断しました。
> - サーバーは既定で`127.0.0.1`(このPC自身)にのみ待受し、
>   `OPEN_ENGLISH_SERVER_BIND`環境変数を利用者が明示的に変更しない
>   限り外部到達不可——これが「手動設定のみで到達可能」という要件を
>   既に満たしています。実際にWAN公開する場合はTLS終端を自分で
>   用意することを状態パネルで案内します(現在のペアリングAPIは
>   平文HTTPのため)。
> - `local_agent.rs`に続き`vps_agent.rs`にも同種のテストフレーク
>   (環境変数の並行書き換えによる不安定な失敗)を発見・修正しました。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25HANDOFF参照。
>
> 📌 **更新(2026-08-25): world-labにデバイス種別・自己申告
> ハードウェア対応(CPU/GPU/NPU)+関連ツール導線を追加、テストの
> フレークを発見・修正**:
> - **複数のスマホ/タブレット/PC接続**: ペアリング時にデバイス種別
>   (📱スマホ/📲タブレット/🖥PC/❓その他)と、自己申告のハードウェア
>   対応(CPU/GPU/NPU)を指定できるようにしました。状態パネルに
>   種別ごとの内訳(例「📱3 📲2 🖥1」)が表示されます。
> - **正直な開示**: CPU/GPU/NPU対応は接続側の自己申告であり検証して
>   いません。実際の計算タスクは現状すべてCPUで実行され、大企業の
>   オフィス等で遊んでいるPCのGPU/NPUへ実際に計算を飛ばす機能(越境
>   ディスパッチ)は**未実装**です——安全に実装する道筋(`open-cuda`/
>   `open-directx`活用案を含む)は[CLAUDE.md](CLAUDE.md)の「将来構想」
>   節に記録しましたが、Phase 2のWASMサンドボックスと同水準の安全設計が
>   GPU/NPU向けにはまだ無いため、機能だけ先に実装することは避けました。
> - **Microsoft Copilot/GitHub Copilot**: 「AIコーディング支援」パネルの
>   ツール選択肢に追加しました(公式サイトへの案内リンクのみ、本体との
>   API連携ではありません)。world-labパネルからも1タップで開けます。
> - **テストのフレークを発見・修正**: 既存の`local_agent.rs`テスト3件が
>   環境変数を並行して書き換え合い、稀に失敗することを発見し修正
>   しました(本番コード自体にバグは無し)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-25HANDOFF参照。
>
> 📌 **更新(2026-08-24 続き9): world-labの残課題(UI配線・同時実行
> 上限・複数プロセス間E2E・root cause追跡)に着手**:
> - **UI**: 新規「🌐 world-lab (experimental)」パネルを追加。状態表示・
>   デバイスのペアリング/一覧/解除・上級者向けWASMタスク実行(.wasm
>   ファイルアップロード)を実ブラウザで操作できます。
> - **同時実行数の上限・キューイング**: 大量リクエストによるホスト
>   プロセス自体のリソース枯渇を防ぐため、`tokio::sync::Semaphore`で
>   同時実行数を、`AtomicUsize`でキュー長を制限しました(超過時は
>   即座に拒否)。
> - **セキュリティ再監査で新たな穴を発見・修正**: 「任意計算を受け付ける
>   エンドポイントなのに、ボディサイズの上限チェック前に無制限に
>   読み込んでしまう」という別のDoSの穴を発見し、ストリーム段階で
>   打ち切る専用の読み取り処理へ修正しました。
> - **root cause追跡**: `wasmtime`を21.0.2→27.0.0へ引き上げても同じ
>   クラッシュが再現することを確認し、特定バージョンの問題ではなく
>   より一般的な相性問題だと判明しました(サブプロセス隔離の対策自体は
>   引き続き有効)。
> - **複数デバイス間の検証(正直な開示)**: この開発環境に2台目の実機が
>   無いため、USB/Wi-Fi/Bluetooth/LANの4接続方式それぞれで模擬デバイスを
>   実HTTP経由でペアリングする形の検証にとどまり、文字通りの「別々の
>   物理デバイス間」検証はできていません。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-24(続き9)HANDOFF参照。
>
> 📌 **更新(2026-08-24 続き8): 「world-lab」Phase 2——WASM
> サンドボックスでの計算タスク実行を実装、実機テストでサーバー全体を
> 落とせる重大なクラッシュ問題を発見・サブプロセス隔離で修正**:
> - 使わなくなったスマホ・タブレット・PCの遊休CPU/GPU/NPUを、WASM
>   サンドボックス内で任意の計算タスクとして共有できるAPI
>   (`POST /v1/world-lab/task/run`)を実装しました。既定で無効
>   (2段階のオプトイン)、報酬・インセンティブ無しの相互扶助を前提と
>   しています。
> - **実機テストで、fuel(命令数)上限機構自体がサーバープロセス全体を
>   クラッシュさせてしまう重大な欠陥を発見しました**——「安全に
>   止めるはずの機構が、逆に1回のリクエストでサーバーを落とせるDoSの
>   穴になっていた」という致命的な問題です。この場でWASM実行を
>   **別プロセスへ隔離する設計に変更**し、実際に攻撃を打ち込んで
>   「子プロセスはクラッシュするがサーバー本体は生き残り、直後も
>   正常にサービスを提供し続けられる」ことを実HTTPで実証しました。
> - 通信の中継機能は引き続き一切実装していません(踏み台化防止の
>   方針は不変)。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-24(続き8)HANDOFF参照。
>
> 📌 **最新の更新(2026-08-24 続き6): 名言・ことわざ+モチベーション
> メッセージ+「話し方・質問の仕方」教材を追加**:
> - キャリアガイダンス欄(学年別・家庭教師コース/バーチャルスクール・
>   職業訓練校の全箇所)に、日英併記のことわざ・名言(「鉄は熱いうちに
>   打て / Strike while the iron is hot.」等8件)と、「就職できる、
>   転職できる、食っていける、どこに行っても通用する人に育つように」
>   という誇張しすぎないトーンのモチベーションメッセージを追加しました。
> - 新教科「🗣 話し方・質問の仕方 / Communication & Questioning Skills」
>   (中学・高校段階)を新設。曖昧な話・仮説的な話を建設的に切り出す
>   英語表現、問題点を指摘した上で意見を求める構造化された話法、
>   「大胆かつ繊細さ」の重要性を、**実際に使える英語フレーズの4択問題**
>   として教材化しました。
> - 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-24(続き6)HANDOFF参照。
>
> 📌 **最新の更新(2026-08-24 続き2): 学年別・家庭教師コースに
> 「キャリアガイダンス」機能を追加**:
> - 問題を解く画面に、出題中の教科について**「この内容をマスターすると
>   役立つかもしれない業界・職種」「さらに極めると目指せる可能性のある
>   上級職種」**を補足表示する🧭キャリアガイダンス欄を追加しました
>   (国語・算数・生活・理科・社会・英語・プログラミングの7教科分)。
> - 設計にあたり、ドイツの職業教育制度(デュアルシステム、Berufsschule・
>   IHK資格・Ausbildung)を実際に日英で調査し、「学習内容が具体的な
>   職業・上級資格と結びついている」という考え方を参考にしました
>   (出典: [IHK Darmstadt](https://www.ihk.de/darmstadt/en/productlabels/training/voctrain-2533080)、
>   [deutschland.de](https://www.deutschland.de/en/topic/business/how-germanys-dual-vocational-training-system-works)、
>   [Wikipedia: Dual education system](https://en.wikipedia.org/wiki/Dual_education_system))。
> - **正直な開示**: 「必ず就職できる」という断定表現は使わず、すべて
>   「〜かもしれません」「〜に役立つ可能性があります」という表現に
>   統一しています。表示は教科単位(学年×教科の問題1問ごとではなく)
>   で、全レッスンを網羅するものではありません。就職・資格取得を
>   保証するものでもありません。
> - 実機検証: 実際にサーバーを起動し、小学3年生の算数をインストール→
>   出題→採点後もキャリアガイダンス欄が正しく表示され続けることを
>   ブラウザで確認しました。
>
> 📌 **最新の更新(2026-08-24 続き): DUAL DBの自己修復(未反映キューの自動
> リトライ)+PostgreSQL接続のTLS対応+HTTP HEADメソッド対応**:
> - **DUAL DB自己修復**: これまで「未実装」と明記していたミラー書き込み失敗時の
>   自己修復を実装。ミラー書き込みに失敗した行はローカルSQLiteの`mirror_outbox`
>   テーブルへ記録され、60秒ごと(既定)のバックグラウンドタスクが自動的に
>   再送する。既定100回まで再試行し、それでも失敗した行は黙って捨てず
>   `give_up`件数として`GET /v1/db/info`(`mirror_outbox_pending`/
>   `mirror_outbox_given_up`)で確認できる。**限界の正直な開示**: このプロセスが
>   書き込もうとして失敗した行のみが対象で、ミラー先で直接削除された行や
>   他経路で入った差分は検出できない。再送はINSERTのため、稀に重複行になり得る
>   (at-least-once)。
> - **TLS対応**: `tokio-postgres-rustls`を導入し、接続文字列の`sslmode`次第で
>   `sslmode=require`等のマネージドPostgreSQLへ接続できるようになった
>   (`sslmode=disable`〈既定〉なら従来どおり平文接続、既存の接続は壊れない)。
> - **HTTP HEADメソッド対応**: 静的ファイルサーバーが`HEAD`リクエストに正しく
>   応答するようになった(従来は404/405で、多くのHTTPクライアント・
>   ヘルスチェックツールがHEADを使うため実用上の影響が大きかった)。
>   共有基盤`RPoem`(`open-runo-poem-compat`)へ`MethodRouter::head`を追加した
>   上での対応(追加のみ、既存APIへの影響なし)。
> - **`/health`エイリアス新設**: `open-web-server`/`open-easy-web`側の
>   「分身の術」テナント登録パターンが汎用的に期待するヘルスチェック命名に
>   形状を揃えるため、既存`/healthz`と同一内容を返す`/health`を追加した
>   (既存の`/healthz`はそのまま維持)。open-english自体をopen-web-server経由で
>   公開したい場合、この2エンドポイントのどちらでも接続確認が通る。
> - `GET /v1/db/info`が`rsync_available`(実際に`rsync --version`を呼んで
>   確認した結果)を返すようになった——`/v1/db/rsync-backup`を試す前に
>   rsyncが使えるかどうかを1回のAPI呼び出しで確認できる。
> - 実機検証: `cargo build`/`cargo test`(18/18 green)に加え、実際に
>   バイナリを起動し`HEAD /`・`HEAD /app.js`が正しい`Content-Length`/
>   `Content-Type`かつ空ボディで200を返すこと、`GET /health`が
>   `{"ok":true}`を返すこと、`GET /v1/db/info`に`rsync_available`が
>   含まれることを確認した。

> 📌 **最新の更新(2026-08-24): バーチャルスクール(高等教育)と
> バーチャルオンライン職業訓練校を新設**:
> - 画面上部の**「🏫 バーチャルスクール(高等教育)」**から、**専門学校・短期大学・
>   大学(学部)・大学院**の4区分を選び、その中の分野を選んでインストールすると、
>   入試・授業・校内テストを擬似的に想定した**オリジナル模擬問題**が出題・採点されます。
> - **「🛠 バーチャル職業訓練校」**では、産業・職業分野を選んでインストールすると、
>   その分野の基礎知識を問う**オリジナル問題**が出題・採点されます。
> - **いま実際に出題できるのは7分野・各5問です**: 大学=人文社会科学系/理工系、
>   専門学校=情報処理・IT、大学院=研究基礎(研究計画・研究倫理・面接)、
>   職業訓練校=IT・プログラミング基礎/簿記・経理基礎/接客・サービス業基礎。
> - **それ以外は「準備中」と正直に表示します**(医療事務、介護福祉、美容、調理・製菓、
>   建築・土木、**短期大学は4分野すべて**、医療・看護系、教育系、理工学研究科専門科目ほか)。
>   区分ボタンに「収録済み N/M 分野」と出るので、開く前に用意できている量が分かります。
> - 各分野に、学習の参考になりそうな**YouTube検索結果ページへのリンク**を添えています
>   (例「簿記3級 独学」)。**特定の動画を「これが正しい」と紹介するものではありません。**
> - **正直な開示**: 全問このアプリ用の書き下ろしオリジナルで、実際の入試問題・市販問題集・
>   教科書の転載は一切ありません。**小論文・面接・実技は自動採点になじまないため、
>   4択の知識問題として近似しているだけ**で、本物の小論文添削や面接練習の代わりには
>   なりません。合否や資格取得を予測・保証するものでもありません。
> - 採点結果は既存の学習履歴(`/v1/db/history`)に保存されます(新しいAPIは追加していません)。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-24 HANDOFF参照。

> 📌 **最新の更新(2026-08-23 続き6): 家庭教師コースを大幅拡張**:
> - **対応学年を保育園児・幼稚園児〜高3の13学年へ拡大**。保育園児・幼稚園児
>   向けのオリジナル問題(ことば/かず/かたち・いろ、計14問)を新規作成しました。
>   **年齢による選択制限はありません**——高校生でも社会人でも、最初から
>   保育園児・幼稚園児レベルを選べます。
> - **落ちこぼれ防止を「学年連動」方式へ再設計(回数の上限なし)**。まちがえると
>   まず**同じ学年の中で**用意されている易しい類題へ順に下がり、その学年ぶんを
>   使い切ったら**1つ下の学年**の同じ教科の問題へ切り替わります(問題が無い
>   学年は飛ばします)。**固定の回数制限はコード上に置いていません**——
>   用意されているデータがある限り下がり続け、**保育園児・幼稚園児が下限**です。
>   そこでも解けない場合は、正解を示して「トレーナーと復習」へ優しく案内します。
>   「🍼 もっとずっと易しい問題」で一番下の学年まで一気に下げることもできます。
> - **いつでも学年を変更できる**「🔁 学年を変更する」ボタンを追加しました。
> - **選んだ学年に問題が無くても使えます**——下の学年の問題まで遡って出題し、
>   「どの学年の問題を出しているか」を正直に表示します(高3で数学を選ぶと
>   高1の問題が出る、等)。
> - **学習履歴DBの事前セットアップを推奨する案内を追加**(aruaru-db **または
>   標準的なPostgreSQL**、DUAL構成、rsyncバックアップ、Googleドライブ、
>   レンタルサーバー/VPSへの同期)。**正直な開示**: 2つのDBへ同時書き込みする
>   機能は未実装(aruaru-db側の`DUAL_DATABASE_URL`経由でのみDUALが可能)、
>   接続はTLS非対応、Googleドライブ・VPSへの同期は利用者ご自身のセットアップが
>   必要で自動同期はしません。`open-easy-web`のrsync機構は実際に調べた結果
>   **存在しませんでした**(open-english内蔵のrsync機能をご利用ください)。
>   これらの案内は8言語版READMEにも翻訳して掲載しています。

> 📌 **最新の更新(2026-08-23 続き5): クイズを3問に増やし、「学年別・
> 家庭教師コース」を新設しました**:
> - **クイズが3問に**: 従来の「9を4つで10を作る」に加え、**カタツムリの
>   井戸**(深さ10mの井戸、昼に3m登り夜に2m滑り落ちる。答えは**8日目**、
>   図解つき)と**ニワトリの卵**(1羽半が1個半を1日半で産むなら、1羽が
>   1個産むのは何日?答えは**1日**)を追加し、依頼のたびにランダムで
>   1問出題します。**正直な但し書き**: 追加した2問の訳文は**日本語と
>   英語のみ**です(既存の1問目のes/fr/de/zh/ko訳は維持)。
> - **🎓 学生向け家庭教師コース**: 画面上部のボタンから、**小1〜高3の
>   12学年**を選び、その学年の教科(国語・算数/数学・理科・社会・英語等)を
>   個別に、または「全教科をインストール」でまとめて導入できます。
>   出題は**毎回ランダムに1問**、選択肢の並びも毎回シャッフルします。
> - **落ちこぼれ防止(最大5段階)**: まちがえた問題に「もう少し易しい類題」が
>   用意されていれば、採点後にそのまま挑戦でき、**まちがえるたびに最大5段階
>   まで段階的に易しく**なります。最終段階でもまちがえた場合は、正解を提示
>   して「トレーナーと復習」へご案内します(3段階目以降を無理に作らず、
>   丁寧な解説で締めくくる設計)。**正直な但し書き**: 段階は人手で書いた
>   静的な問題リスト(AI生成ではありません)で、用意できている段階数は
>   問題ごとに異なります——現在は**5段階が2問・2段階が16問・1段階が33問・
>   類題なしが20問(教科の練習問題71問)**、ほかにプログラミングの基礎問題
>   6問(うち1段階が3問)です。
> - **英語は小学3年生から**: 学習指導要領で小3から外国語活動が始まることに
>   合わせ、**小3の英語**(あいさつ・色・数・受け答えの入門レベル、
>   オリジナル5問)を追加しました。小1・小2でも国語・算数はご利用いただけます。
> - **プログラミング(新設、正直な但し書きつき)**: 小3以上の教科として
>   「プログラミング」を追加しました。まず
>   **「プログラミングの授業については、open-englishのAIエンジン(aruaru-llm)
>   単体では対応力が弱いため、CLAUDE CODE DESKTOPの有料版を合わせて
>   お申し込みいただくことをお勧めします。ご利用可能時間はご契約のプランに
>   よって変動いたします。」**というご案内を表示します。そのうえで、
>   open-english単体でも取り組める基礎教材として、**動くサンプルコード2本**
>   (じゃんけんゲーム、自己紹介ページ)と改造課題、HTML/CSS/JavaScriptの
>   基礎問題6問を用意しました。**AIがゼロからゲームやWEBサイトを生成する
>   わけではありません**——配布しているのは人手で書いた固定のサンプルと
>   固定の練習問題だけです。
> - **図解**: 井戸・円の面積・直方体・分数・数直線・直角三角形・放物線など、
>   図があると分かりやすい問題にインラインSVGの図解を付けました
>   (**全問には付いていません**——不要な問題には付けていません)。
> - **正直な但し書き**: 問題はすべて本アプリ用の**オリジナル**で、教科書・
>   問題集・入試問題の転載は一切ありません。また**問題を用意できているのは
>   小1・小3・小6・中1・中3・高1の6学年 ×(国語・算数/数学・英語)の
>   一部だけ**で、それ以外の学年・教科を選ぶと「**現在この学年・教科の
>   問題は準備中です**」と正直に表示します。採点結果はローカルDBへ保存し、
>   `OPEN_ENGLISH_DATABASE_URL`が設定されていればaruaru-dbへもミラーされ
>   ます(既存の`/v1/db/history`の仕組みをそのまま利用)。快適にお使い
>   いただくため、**Google検索**と**aruaru-db**の併用を推奨する案内も
>   コース画面に表示しています。
>
> *English*: The built-in puzzle set is now **three puzzles** (four 9s, the
> snail in the well — answer: **day 8**, with a diagram — and the hen and the
> egg — answer: **one day**), asked at random; the two new ones are
> **Japanese + English only**. A new **🎓 student tutor course** asks which of
> the **12 grades** (elementary 1 – high school 3) you are in, lets you install
> subjects individually or all at once, and then asks **one randomly chosen
> question at a time**. If you miss a question that has an **easier version**,
> you can try that next (hand-written pairs, not AI-generated; only one step
> easier). **Inline SVG diagrams** are attached to the questions where a
> picture helps — not to every question. **Honest caveat**: every question is
> **original** to this app (nothing copied from textbooks or real exams), and
> only **6 grades × a few subjects** have questions so far; anything else
> honestly says "not ready yet". Scores are stored via the existing
> `/v1/db/history` endpoint (local SQLite, mirrored to aruaru-db when
> `OPEN_ENGLISH_DATABASE_URL` is set).

> 📌 **最新の更新(2026-08-23 続き4): 作者オリジナルのクイズを出題できる
> ようにしました**: 「何か問題を出して」「クイズ出して」「問題ください」
> 等と話しかけると、本アプリの作者・**石塚正浩さんのオリジナル問題**を
> 出題します。問題は「数字の9を4つ使い、`9 ◯ 9 ◯ 9 ◯ 9 = 10`の◯に
> `+` `-` `×` `÷` のいずれかを入れて(同じ記号を何度使ってもよく、必要
> なら括弧()で優先順位を変えてもよい)、結果を10にする」というもの。
> **トンチやひっかけではなく、電卓やそろばんでも解ける純粋な四則演算**
> です。これまでで最年少の正解者は小学一年生の子だったそうです。
> やり取りは**2段階**で、まず問題文だけをお見せし、「わからない」
> 「答えを教えて」と送っていただくと解答をお見せします。
> 出題は**既定で日本語と英語の併記**、加えて学習言語または母国語として
> スペイン語・フランス語・ドイツ語・中国語・韓国語を選んでいる場合は
> その言語の訳文を先頭に添えます。**正直な但し書き**: 訳文を用意して
> いるのはこの7言語のみで、対応130言語すべてを機械翻訳で埋めて
> 「全言語対応」に見せることはしていません(未収録の言語をお使いの方に
> は既定の日英併記で出題します)。なお出題・解答とも**AI推論を通さない
> 固定文**です——素のGPT-2に算数を生成させると計算の合わない答えを
> もっともらしく出してしまうため、意図的にそうしています。
>
> *English*: Ask for "a quiz" / 「問題を出して」 and the app now poses an
> **original puzzle by its creator, Masahiro Ishizuka**: using four 9s, fill
> `9 ◯ 9 ◯ 9 ◯ 9 = 10` with `+ - × ÷` (repeats allowed, parentheses
> allowed) so the result is exactly 10. It is **not a trick question** —
> pure arithmetic, checkable on a calculator or an abacus. The youngest
> solver so far was a first-grader. The exchange is **two-stage**: the
> question first, the answer only when you say you don't know. Output is
> **Japanese + English by default**, with es/fr/de/zh/ko added when that is
> your selected language. Honest caveat: only those 7 languages are
> translated — the other supported languages fall back to the ja+en default,
> and both question and answer are **hand-written fixed text, never AI
> generated** (a bare GPT-2 confidently gets arithmetic wrong).

> 📌 **最新の更新(2026-08-23 続き3): 666応答の言い回しを柔らかく調整
> (機能・制約は変更なし)**: 下記の666応答のうち「WWW=666」「バーコードの
> 都市伝説」「黙示録13:16-17と現代の買い物の符合」の3点について、
> **表現だけ**を軽妙で親しみやすいトーンへ書き直しました。従来の
> 「〜と断定するものではありません」「not as a claim that any prophecy has
> been fulfilled」といった硬い否定表現を、「話のタネとして」「真偽のほどは
> 分かりませんが、こういう見方をすると聖書の世界も少し身近に感じられる
> かもしれません」/ "take this as a fun bit of trivia rather than solid
> proof" のような言い回しへ置き換えています。
> **重要: 断定しないという制約自体は一切弱めていません**——古代の預言が
> 現代のAmazon・POSレジに対応しているという趣旨を事実として主張しないこと、
> バーコード666は技術的根拠のない都市伝説であると明記すること、Pythonの
> ヘビとの符合は偶然と明記すること、はいずれも従来どおり維持しています。
> 変えたのは文章の魅力・読みやすさだけです。
>
> *English*: The 666 answer was **reworded, not rescoped**. The WWW wordplay,
> the barcode legend, and the Revelation 13:16-17 aside now read in a lighter,
> friendlier voice ("take this as a fun bit of trivia rather than solid
> proof") instead of stiff disclaimers. **Every honesty guarantee is intact**:
> nothing is asserted as fulfilled prophecy, the barcode 666 is still stated
> plainly as an urban legend with no technical basis, and the Python
> coincidence is still labelled a coincidence.

> 📌 **最新の更新(2026-08-23 続き)**: **「666は悪魔・獣の印なのか」という
> 質問に、軽妙な豆知識として日英併記で答える**ようにしました。「666」
> 「獣の数字」「悪魔の数字」「mark of the beast」等を検出すると、AI推論を
> 通さず人手で書いた固定文を返します。内容は、(1) ヨハネの黙示録に
> 「獣の数字は666」という記述があり伝統的に額・右手の刻印として解釈されて
> きたという中立的な前提、(2) ヘブライ語のゲマトリアで文字ヴァヴ(ו)が
> 数値6であることから「666はWWW(World Wide Web)と読める」という
> **現代の語呂合わせ**、(3) 「バーコードに666が隠れている」という都市伝説と
> その技術的な種明かし、(4) WWWとバーコードスキャナーのおかげで買い物・通販が便利になった
> という現代への肯定的な着地、(5) Pythonのロゴはヘビだが名前の由来は
> 英コメディ番組「空飛ぶモンティ・パイソン」という余談。
> **正直な開示・含めた内容と含めなかった内容の区別**: (a) (2)のWWW説は
> **「そういう解釈をする人たちがいる」という紹介**であり、聖書の正式な
> 教義的解釈としては断定していません(1990年代以降ポップカルチャーで
> 語られてきた、という形で提示)。(b) (3)のバーコードの話は**都市伝説で
> あると明記した上で**紹介し、日英両方のWeb検索(Wikipedia「バーコード」・
> Snopesのファクトチェック等)で裏取りした技術的な種明かしを添えています
> ——両端と中央の少し長い線は読み取りの開始・終了・区切りを示す
> **ガードバー**であり、その見た目が偶然に数字6のパターンと似ているだけで、
> 技術的には**ガードバー(3モジュール幅)と数字(7モジュール幅)は異なる
> エンコード方式**、Snopes等でも**「FALSE(誤り)」と判定**されており、
> **オカルト的な意味も技術的根拠も無い**、という点まで明記しています。
> (c) (5)の「ヘビ=獣」との符合は**単なる偶然の一致・言葉遊びであると
> 明記**し、意味のある繋がりがあるかのようには書いていません。
> (d) 全体として特定の宗教的解釈への賛否は表明していません。
> **(e) 2026-08-23 追記**: 黙示録13章16〜17節に「刻印を持たない者は
> 売り買いができない」という趣旨の記述が実際にあること(この聖句の存在
> 自体は事実)と、現代ではバーコードやオンライン決済(Amazonなど)なしに
> 買い物が難しくなっていることを重ね合わせて語られることがある、という
> 「面白い符合」を1文追加しました。**これも断定ではなく「そう語られる
> ことがある」という可能性の紹介にとどめており、「預言が成就した」
> という趣旨の断定的な表現は使っていません**(本文中にもその旨を明記)。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-23(続き2)HANDOFF参照。
>
> *English*: The tutor now answers **"is 666 the mark of the beast?"** with a
> light, bilingual piece of trivia (hand-written fixed text, no AI inference).
> It states the Revelation passage neutrally, then introduces the modern
> "666 = WWW" gematria wordplay **explicitly as a reading some people enjoy,
> not as doctrine**, flags the hidden-666-in-barcodes story **explicitly as
> an urban legend** and explains the actual engineering (the longer bars at
> each end and in the middle are **guard bars** marking start/end/midpoint;
> they merely *look* like the digit 6, and are a different encoding —
> 3 modules wide vs 7 — so Snopes rates the claim FALSE, with no occult
> meaning and no technical basis), lands on how nice it is that the Web and barcode
> scanners made shopping convenient without anyone needing a mark on their
> body, and closes with the Python-logo footnote — noting **explicitly that
> the snake/beast resemblance is pure coincidence and wordplay** with no
> meaningful connection. **Added 2026-08-23**: one more aside noting that
> Revelation 13:16-17 really does contain a passage saying no one without the
> mark can buy or sell, and that **some people note an interesting parallel**
> between this and how modern shopping increasingly relies on barcodes and
> online payment systems like Amazon — **offered strictly as a coincidence
> some find striking, never as a claim that a prophecy has been fulfilled**.

> 📌 **最新の更新(2026-08-23)**: **イスラム教・イラン(ペルシャ)・アラブの
> 歴史についての質問に、中立的・事実ベースの解説を日英併記で返す**ように
> しました。「イスラム教についてどう思いますか」「イランとアラブは違う文明
> だと知っているが、深い歴史やルーツを聞かせてほしい」といった質問を検出
> すると、AI推論を通さず、人手で書いた固定の解説を表示します。イスラム以前
> のアラビア半島のキリスト教共同体(ナジュラーン、ガッサーン朝)、クルアーン
> の成立が学術的には別個の独立した伝統として記述されること、イラン系文明と
> アラブ系文明の系統の違い、ゾロアスター教の影響をめぐる学説などを扱います。
> **正直な開示**: (1) これは固定文であってAIが生成した回答ではありません
> ——素のGPT-2に宗教史を語らせると事実でない内容を作ってしまうためです。
> (2) 作成時、ユーザーから「クルアーンは聖書の翻訳から成立した」
> 「ムハンマドの兄弟が翻訳者だった」という説を含めたいという相談が
> ありましたが、**現存する史料で裏付けが確認できなかったため、複数回の
> 確認を経て両方とも事実としては含めないことで合意し、除外しました**。
> (3) ゾロアスター教の影響については「一部の研究者が指摘している説」
> という留保付きで紹介し、断定していません。(4) 外部動画等への自動リンク
> 表示は行わず、「〜について調べてみてください」という中立的な案内に
> とどめています。(5) 追加のやり取りを経て、**聖書のアラビア語訳という史実
> 部分にのみ**「当時の翻訳は人の手によるもので、版ごとの揺れや誤差はあり得た
> だろう」という前近代の翻訳作業一般についての注記を加えました。これは
> **クルアーンの成立とは結びつけていません**(「翻訳ミスから生まれた」という
> 含意は持たせない、という線引きをユーザーと明確に合意しています)。
> (6) 末尾に「言語の壁は誤解の一因になり得る。自動翻訳が発展し世界中の人々が
> 多言語で対話できるようになれば、相互理解が深まり平和に近づく助けになる
> かもしれない」というメッセージを添えました。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-23 HANDOFF参照。
>
> *English*: The tutor now answers questions about **Islam, Iran/Persia and
> the Arab world** with a neutral, fact-based summary in both Japanese and
> English. Honest disclosure: this is **hand-written fixed text, not an AI
> generation** — a bare GPT-2 would invent things, and the harm of doing that
> on religious history is high. Two claims the user originally wanted included
> (that the Qur'an was assembled from a Bible translation, and that a brother
> of Muhammad was the translator) **were deliberately excluded** after several
> rounds of checking, because the surviving sources do not support them. The
> Zoroastrian-influence hypothesis is presented as "some scholars argue this",
> not as settled fact, and no external video links are shown. A note that
> premodern translation was done by hand and inevitably carried some variation
> is attached **only to the historical fact of Bible translation into Arabic**,
> and is deliberately not connected to the origin of the Qur'an. The section
> closes with a message that better machine translation and everyday
> multilingual conversation may reduce misunderstanding between cultures.

> 📌 **最新の更新(2026-08-22 続き2)**: **AI応答(aruaru-llm連携)の実用性を改善**しました。
> - **実行基盤バッジ**: 画面下の接続状態の隣に「compute: CPU · <モデル名>」を表示します。
>   これはaruaru-llmの`GET /v1/runtime`が実際に報告した内容(`open-cuda`のデバイス
>   プールがCPUのみか、実GPUを含むか)をそのまま出すものです。**既定のビルドはCPUのみ
>   で、GPU高速化は効いていません**——`--features real-vulkan`でビルドし実GPUの初期化に
>   成功した場合のみGPUが使われます。独立リポジトリ`aon-co-jp/open-directx`はこの経路に
>   一切関与していません(誇張しない開示)。
> - **応答が返らないまま無限に待つ問題を解消**: 生成60秒・接続確認4秒・補助API 8秒の
>   タイムアウトを設け、超過時は「何が起きたか・次に何をすればよいか」を英日併記で
>   案内します(接続不可・HTTPエラーも区別して表示)。
> - **待っている間が見えるように**: 送信直後に経過秒数付きの「…thinking / 考え中…」を
>   表示し、応答後は実測の往復時間(例「last reply 8.6s」)を接続状態欄に残します。
>   **正直な開示**: 体感の改善であり生成自体は速くなりません。aruaru-llmの
>   `/v1/generate`は生成完了後に一括で返す設計のため、トークン単位のストリーミング
>   表示は実装できていません。
>
> 📌 **2026-08-22 の更新**: **設定の永続化・母国語の指定・表示順の
> カスタマイズ・話題ブリーフィング・対応言語一覧の130言語化**を追加しました。
> - **言語のインストール/アンインストール**: 「🌐 Languages」パネルのチェックを
>   入れる=その言語をインストール(追加)、外す=アンインストール(削除)。
>   **母国語(ネイティブ)を1つ指定**でき、母国語+学びたい言語で**合計最大6項目**
>   (英語・日本語は常時有効、追加は最大3言語+母国語1)を扱えます。130言語の
>   一覧は**言語名でも国名でも絞り込み検索**でき、各行に**国旗絵文字と国名**を併記します。
> - **表示・読み上げ順の指定**: ①数字を直接入力、②1〜6のラジオボタン、③▲▼ボタン
>   の3系統から指定でき、**どれを操作しても互いに連動**します。既に他の言語が使って
>   いる番号を選ぶと、その言語と順番を入れ替えます(重複しません)。
> - **設定はメンテナンス/自動アップデート後も保持**: ブラウザのlocalStorageと
>   ローカルSQLite DBへ二重保存し、localStorageが消えてもDBから復元します。
>   `auto-update.js`のバージョン変更時のデータ破棄処理からも、これらの設定キーを
>   明示的に除外しました。
> - **話題ブリーフィング**: 言語を選び終えると「情報を集めています(メンテナンス中)」
>   の進捗表示とともに、一番上に設定した言語圏の情報をまとめます。**ニュース見出しは
>   実際にインターネット(公開のGoogleニュースRSS)から毎回取得**し、首都・主要都市・
>   観光名所・名物・有名人・有名な会社(1〜2文の概要付き)は本アプリ用に書いた静的
>   データを表示します。最後に「この話題でAI講師と練習する」で会話練習へつながります。
> - **対応言語一覧を130言語へ拡大**: ただし**模擬問題を実際に書き下ろしてあるのは
>   40言語(英語・日本語+38言語)、詳細な地域データがあるのも同じ40言語**です。
>   残り90言語は一覧に名前・国旗・国名だけを載せた段階的拡大の途中で、UI上も
>   「問題未収録」「詳細データ未作成」と正直に表示します——**130言語に完全対応した
>   わけではありません**。言語別ドキュメントの置き場所として
>   [`docs/i18n/<言語コード>/`](docs/i18n/)に130言語ぶんのREADME/CLAUDE/PORTINGを
>   用意しましたが、こちらも**大半は未翻訳のプレースホルダー**です(機械翻訳を
>   翻訳済みのように貼り付けることはしていません)。
>
> *English*: Added persistent settings (kept across maintenance and auto-updates via
> localStorage **and** the local SQLite DB), a **native language** setting, three
> interlinked ways to set the display/read-aloud order (number input, radio buttons 1–6,
> ▲▼), a **topic briefing** that fetches **live news headlines from a public RSS feed**
> plus static background data (capital, major cities, sights, food, famous people,
> well-known companies with one-line summaries), country names and flag emoji in the
> language list with search by language *or* country, and an expansion of the language
> registry to **130 languages**. Honest disclosure: **only 40 of those 130 actually have
> practice questions and detailed background data**; the other 90 are listed by name,
> flag and country only and are labelled as such in the UI. The 130 per-language doc
> folders under [`docs/i18n/`](docs/i18n/) are mostly untranslated placeholders — no
> machine translation has been passed off as a real translation.

> 📌 **最新の更新(2026-08-22)**: **世界の言語の擬似模擬試験+言語選択UI+
> 多言語の連続表示・読み上げ**を追加しました。日本語・英語はこれまで通り
> 既定ですが、トップの案内バナー(日英併記)と「🌐 Languages / 言語を追加」
> パネルから、**38言語**(ヨーロッパ・中東・アジア・インド・アフリカ)の
> オリジナル模擬試験を有効化できます。既存の英検/TOEIC/TOEFL/JLPTと同じ
> 「採点→間違えた問題を持ってAI講師との会話練習へ」という導線が、
> 選んだ言語のトレーナーにもそのままつながります。あわせて、選択した
> **2〜5か国語**(英語・日本語を含む)で同じフレーズを順番に画面表示+
> 音声読み上げし、何度でも再生し直せる機能、表示文のコピー&ペースト・
> テキストファイル保存・ローカルSQLite DBへの保存を追加しました。
> **正直な開示**: 収録問題は本アプリ用に書き下ろしたオリジナル問題で、
> 実在の資格試験(DELE・DELF・Goethe-Zertifikat・HSK・TOPIK等)の過去問
> ではなく、それらの試験とは一切無関係・公認も受けていません。レベル
> 表記(A1〜C2)はCEFR風の大まかな目安に過ぎず、収録数も言語ごとに
> 不均一(3〜6問)です。読み上げはブラウザ内蔵のWeb Speech APIを使う
> ため、その言語の音声がOSに無い環境では表示のみになります。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-22 HANDOFF参照。
>
> *English*: Added **world-language practice exams, a language-selection
> UI, and sequential multilingual display & read-aloud**. English and
> Japanese remain the defaults, but a bilingual banner and the
> "🌐 Languages" panel let you enable original practice sets for **38
> languages** (Europe, Middle East, Asia, India, Africa). Scoring flows
> into conversation practice with the tutor for that language, exactly
> like the existing Eiken/TOEIC/TOEFL/JLPT flow. You can also select
> **2–5 languages** (including English and Japanese) and have the same
> phrase displayed and read aloud in order, replayable as often as you
> like, with copy/paste, .txt download, and save-to-SQLite. Honest
> disclosure: these are original questions written for this app — not
> past questions from, and not affiliated with or endorsed by, any real
> certification exam. CEFR-style levels are loose approximations, item
> counts are uneven (3–6 per language), and read-aloud depends on the
> voices your browser/OS provides.

> 📌 **最新の更新(2026-08-20)**: 定期的な自動アップデートチェック
> (起動時に加え6時間ごと)+手動ダウングレード機能を追加しました。
> 新バージョンに切り替えた後で不具合に気づいた場合、`GET /v1/updates/
> history`(現在バージョン+保持している旧バージョン一覧)・
> `POST /v1/updates/downgrade`(open-english本体・aruaru-llm・
> aruaru-dbのいずれかを指定バージョンへ戻す)で、そのコンポーネント
> だけを個別に元へ戻せます。UIは「💾 Data & Model Storage」パネル内
> 「🔄 Updates & Rollback」節。**正直な開示**: 保持する世代数は
> ディスク容量への配慮から既定3世代——それより古いバージョンや、
> このマシンで一度も自動更新が発生していないバージョンへは戻せません。
> 詳細・実機検証結果は[CLAUDE.md](CLAUDE.md)の2026-08-20 HANDOFF参照。
>
> *English*: Added periodic automatic update checks (every 6 hours, in
> addition to the startup check) and a manual downgrade feature. If a
> new version turns out to be buggy after a while, `GET /v1/updates/
> history` (current + retained previous versions) and `POST /v1/updates/
> downgrade` (roll back open-english itself, aruaru-llm, or aruaru-db
> individually to a specific version) let you revert just that one
> component. UI: the "🔄 Updates & Rollback" section inside the "💾 Data
> & Model Storage" panel. Honest disclosure: only the last 3 generations
> are retained by default (disk-space consideration) — you cannot roll
> back further, or to a version that was never actually applied on this
> machine. See the 2026-08-20 HANDOFF entry in [CLAUDE.md](CLAUDE.md).

> 📌 **追記(2026-08-19、続き8)**: 1日の利用回数上限(既定100回、
> クライアント側`localStorage`カウンタ)に到達した際、チャット上に
> 「本日の無料利用枠を超えました。有料版に切り替えますか？」+他の
> AIプロバイダ(Google検索/DeepSeek/ChatGPT/Gemini/Claude)の無料枠情報を
> 日英併記で表示するようにしました(`provider-free-tiers.json`を動的に
> 参照、ハードコードなし)。**正直な開示**: これは通知のみのクライアント側
> 実装で、実際の課金・アップグレード処理は行いません。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-19(続き8)HANDOFF参照。
>
> *English*: When the daily usage counter (default 100, client-side
> `localStorage`) is reached, the chat now shows a bilingual notice —
> "You've exceeded today's free usage limit. Would you like to switch to
> a paid plan?" plus the free-tier info for other AI providers (Google
> Search/DeepSeek/ChatGPT/Gemini/Claude), read dynamically from
> `provider-free-tiers.json`. Honest disclosure: this is a notice-only,
> client-side implementation with no real billing/upgrade flow. See the
> 2026-08-19 (continued 8) HANDOFF entry in [CLAUDE.md](CLAUDE.md).

> 📌 **最新の更新(2026-08-19)**: Facebookしかアクセスできないスマホ
> 契約の利用者向けに、Facebookページ/Messengerで共有するリンク先
> `facebook.html`を新設しました。**正直な開示**: Facebookの
> 「Free Basics」等のゼロレーティングプログラムへの正式な提携・
> 登録は本プロジェクト単独ではできないため、「Facebook経由で完全
> 無料アクセス」自体は実現できていません——`facebook.html`は
> Facebookアプリ内蔵ブラウザから開けるリンク先として機能し、
> そこから既存のインストーラー(Windows/Linux/macOS/Android)への
> ダウンロード導線を案内するにとどまります。アプリ本体は変わらず
> 利用者端末上のローカルサーバー(`server/`)で動作します。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-19 HANDOFF参照。
>
> *English*: Added `facebook.html`, an entry page meant to be shared as
> a link on a Facebook Page or in Messenger, for users whose mobile
> plan only allows Facebook access. Honest disclosure: true Facebook
> "Free Basics"-style zero-rated free access is not achievable without
> an official partnership with Meta, which this project does not have
> — `facebook.html` works as a normal page reachable from Facebook's
> in-app browser and points to the existing installers (Windows/Linux/
> macOS/Android); the app itself still runs on a local server on your
> own device (`server/`). See the 2026-08-19 HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).

> 📌 **追記(2026-08-19)**: 上部のAI/検索無料枠バナーに、有料前提の
> Claude(Anthropic)を選択肢として追加しました(恒常的な無料枠は無く、
> 新規登録時のごく少額クレジットのみ、と正直に記載)。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-19(続き5)HANDOFF参照。
>
> *English*: Added Claude (Anthropic) to the AI/search free-tier banner
> as a paid-by-default option (honestly noted as having no ongoing free
> tier, only a small signup credit if any). See the 2026-08-19
> (continued 5) HANDOFF entry in [CLAUDE.md](CLAUDE.md).

> 📌 **最新の更新(2026-08-11〜12、v0.6.0)**: Android/タブレットが
> PC/Linuxサーバー不要で単体動作するアプリになりました——AI応答
> エンジン(`aruaru-llm`)自体もAPKへ実際に同梱し、実機で両プロセスの
> 生存・`/healthz`・`/v1/chat`応答を確認済みです。あわせて英検1〜5級・
> TOEIC・TOEFL・JLPT N1〜N5・日本語検定1〜3級の資格試験対策コーナー
> (各10問、オリジナル問題)+採点後にAI講師との練習(JLPT/日本語検定は
> 「日本語教室」モードへ自動切替)へつなげる機能、「学びたい言語
> (英会話/日本語会話)」選択、Linux/macOS版インストーラー
> (`installer/unix/install.sh`)を追加しました。**正直な開示**:
> モデル重み(GPT-2系・埋め込みモデル)はAPKに同梱していないため、
> Android版でAI応答を使うには別途モデルを内部ストレージへ配置する
> 必要があります(自動ダウンロード機能は未実装)。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-11(続き7〜10)HANDOFF参照。
>
> *English*: Android/tablet now runs fully standalone — no PC or Linux
> server required. The AI response engine (`aruaru-llm`) itself is now
> bundled into the APK; on-device verification confirmed both processes
> stay alive and respond to `/healthz`/`/v1/chat`. Also added: a
> certification exam-prep corner (Eiken 1-5, TOEIC, TOEFL, JLPT N1-N5,
> Nihongo Kentei 1-3, 10 original questions each) that hands missed
> questions to the AI trainer after scoring (auto-switching to a
> "Japanese classroom" mode for JLPT/Nihongo Kentei), a "which language
> to learn" selector, and Linux/macOS installers
> (`installer/unix/install.sh`). Honest disclosure: model weights
> (GPT-2 family, embedding model) are not bundled in the APK — using AI
> chat on Android still requires placing model files in internal storage
> manually (no auto-download yet). See the 2026-08-11 (continued 7-10)
> HANDOFF entries in [CLAUDE.md](CLAUDE.md).

> 📌 **最新の更新(2026-08-18)**: 会話履歴・設定の本格的なローカル
> データベース化に着手しました。**なぜSQLite単体ではないか**——SQLiteは
> 常時利用可能なローカルコピーとして必須の基盤にしつつ、`aruaru-db`
> (PostgreSQL)を設定すればそちらへも自動でミラー書き込みします。
> `aruaru-db`自身が持つ`DUAL_DATABASE_URL`(2つのPostgreSQLインスタンス
> 間の自己修復ミラーリング)機能と組み合わせることで、**片側のDBに
> 障害が起きてももう片側から自動修復し、データを守る**、SQLite単体より
> 安全性の高い構成になります。接続先未設定・接続失敗時はSQLiteのみで
> 動作を継続するため、可用性は損ないません。今回実装したのは会話履歴・
> 設定のSQLite永続化+`/v1/db/*`API+実HTTPでの動作確認まで
> (`server/src/db.rs`参照)——円グラフでの使用率表示・保存先選択
> (マイクロSD等)・外部rsyncバックアップ・複数端末間の同期は次の
> 増分で着手します。続けて保存先選択(`/v1/db/storage-path`)・rsync
> バックアップ(`/v1/db/rsync-backup`)・旧データ取り込み(`/v1/db/
> migrate-legacy`)も実装。rsyncが未導入の環境では「**RSyncを
> インストールしましょう！**」という案内が返り、`/v1/db/install-rsync`
> でOS別パッケージマネージャ(Windows: winget/choco、Linux: apt-get/dnf/
> pacman、macOS: brew、Android: pkg)経由の自動インストール+成功直後の
> 自動バックアップ実行までを1回の呼び出しで行えます。
>
> *English*: Started building a proper local database for conversation
> history/settings. **Why not SQLite alone** — SQLite remains the
> always-available local baseline, but when `aruaru-db` (PostgreSQL) is
> configured, writes are also mirrored there automatically. Combined with
> `aruaru-db`'s own `DUAL_DATABASE_URL` feature (self-healing mirroring
> between two PostgreSQL instances), **if one database instance fails,
> the other automatically repairs it and protects your data** — a safer
> setup than SQLite alone. If no mirror is configured or the connection
> fails, the app keeps working on SQLite only, so availability is never
> sacrificed. This increment implements SQLite persistence for messages/
> settings plus the `/v1/db/*` API, verified over real HTTP (see
> `server/src/db.rs`). Also added: storage-location picker
> (`/v1/db/storage-path`), rsync backup (`/v1/db/rsync-backup`), and a
> generic legacy-data import endpoint (`/v1/db/migrate-legacy`). If rsync
> isn't installed, the API replies with a bilingual **"Let's install
> RSync!"** prompt, and `/v1/db/install-rsync` auto-installs it via the
> right package manager for the OS (winget/choco on Windows, apt-get/dnf/
> pacman on Linux, brew on macOS, pkg on Android) and immediately retries
> the backup on success. Usage pie chart display and multi-device sync
> are still planned for the next increment.

> 📌 **旧更新(2026-08-11、続き3)**: 起動時に自動でGitHubの最新版を
> 確認し、新しいバージョンがあれば自動でアンインストール→自動で
> インストールする機能を追加(Windowsのみ、`server/src/self_update.rs`)。
> **正直な開示**: 現時点でGitHub Releaseがまだ1件も無いため、実際の
> 自動更新の一気通貫の動作確認はまだできていない(バージョン比較ロジック・
> 「リリース無し時に正直に継続する」動作は実機確認済み)。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-11(続き5)HANDOFF参照。
>
> *English*: Added an automatic self-update feature (Windows only) that
> checks GitHub for the latest release at startup and, if newer,
> automatically uninstalls the old version and installs the new one.
> Honest disclosure: no GitHub Release exists yet, so the full
> uninstall→install flow hasn't been end-to-end verified yet (version-
> comparison logic and the "no release found, continue safely" path
> have been). See the 2026-08-11 (continued 5) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).

> 📌 **旧更新(2026-08-11、続き2)**: 就職・転職・観光の話題を検出し、
> aruaru.tokyo(AI駆動開発 CLAUDE CODE DESKTOP)・audiocafe.tokyo/aruaru
> (IT・建築系求人)・audiocafe.tokyo/aruaru-lady(女性向け求人)・
> nasa.tokyoへのリンクを日英併記で案内する機能を追加(通常チャット・
> 研修モード両方で動作)。実機でも実際にリンク表示を確認済み。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-11(続き4)HANDOFF参照。
>
> *English*: Added detection for job-hunting/career-change/tourism
> topics that introduces aruaru.tokyo, audiocafe.tokyo/aruaru,
> audiocafe.tokyo/aruaru-lady, and nasa.tokyo in both English and
> Japanese (works in both normal chat and training mode). Verified
> live. See the 2026-08-11 (continued 4) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).

> 📌 **旧更新(2026-08-11、続き)**: 日本47都道府県・米国50州・主要
> 世界首都(観光名所・名物料理・お土産)のDBと連携し、自己紹介研修の
> 話題を動的化。富士山が話題になると安全上の注意(スキーウェア・
> ヘルメット着用、山小屋の事前予約推奨)・山小屋/登山バス/登山用品店
> 一覧・観光ツアーのオンライン予約検索を日英併記で案内する機能を追加。
> 年齢層(乳幼児〜シニア)・レベル(超初心者〜ネイティブ)・ビジネス
> 英会話追加選択のUIも追加。実際に`aruaru-llm`+配信サーバーを起動し
> ブラウザで検証済み(発見した3件の実バグも修正済み)。詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-11の各HANDOFF参照。
>
> *English*: Linked to a new geo/tourism database (all 47 Japanese
> prefectures, 50 US states, major world capitals with landmarks/food/
> souvenirs) to make the self-introduction training dynamic. When Mount
> Fuji comes up, the app now shows a bilingual safety advisory (wear
> ski gear + a helmet, reserve a mountain hut in advance) plus real hut/
> bus/gear-shop info and a tour-booking search. Added age-group/level/
> business-English selection UI. Verified live against a real running
> `aruaru-llm` + static server (found and fixed 3 real bugs in the
> process). See the 2026-08-11 HANDOFF entries in [CLAUDE.md](CLAUDE.md).

> 📌 **旧更新(2026-08-11)**: ブラウザから直接Google検索APIキー・
> 検索エンジンIDを保存できる設定パネルを追加(`POST /v1/settings/
> google-search`、メモリ上保持のみ)。Windowsインストーラー
> (`installer/windows/`)を実際にビルド・インストール・起動・
> アンインストールまで実機検証済み(Inno Setup、UAC不要)。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-11 HANDOFF参照。
>
> *English*: Added a settings panel for saving your Google Search API
> key/cx directly from the browser (`POST /v1/settings/google-search`,
> in-memory only). The Windows installer (`installer/windows/`) has
> now been actually built, installed, launched, and uninstalled on
> real hardware (Inno Setup, no admin rights required). See the
> 2026-08-11 HANDOFF entry in [CLAUDE.md](CLAUDE.md).

> 📌 **旧更新(2026-08-10、続き5)**: Google Custom Search JSON API
> によるブリッジ式検索補強(`POST /v1/generate-with-search`、ユーザー
> 自身のAPIキーが必要・未設定時は自動フォールバック)+「Google search
> boost」トグルをUIに追加。Android WebViewアプリ(`android/`、タブレット
> でも同一アプリで動作)・Windowsインストーラー(`installer/windows/`、
> Inno Setup)に着手(実機/実ビルド検証は一部次回持ち越し、詳細は
> [CLAUDE.md](CLAUDE.md)の2026-08-10(続き5)HANDOFF参照)。
>
> *English*: Added a bridge-style Google Custom Search JSON API
> integration (`POST /v1/generate-with-search`, requires your own API
> key, falls back automatically when unset) + a "Google search boost"
> UI toggle. Started an Android WebView app (`android/`, same app works
> on tablets) and a Windows installer (`installer/windows/`, Inno
> Setup) — some real-device/build verification is carried over to next
> time, see the 2026-08-10 (continued 5) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md).

> 📌 **最近の更新(2026-08-10、続き)**: (1) 既定モデルを`gpt2`(124M)から
> `distilgpt2`(82M)へ切替(約42%高速化、詳細は`aruaru-llm/CLAUDE.md`
> 参照)。(2) フロントエンドJSのRust/WASM移植は「性能上のメリットが無く
> `SpeechRecognition`は非標準APIで手書きFFIが必要」と判断し見送り、
> 代わりに**配信サーバー側をRust化**(新規`server/`、RPoem
> `open-runo-poem-compat`ベース、`python3 -m http.server`依存を解消)。
> (3) 日本語で話しかけてもハイブリッド(英日併記)応答を必ず返すよう
> 改善(`app.js`の`ensureHybridReply`——モデルが日本語を含む応答を
> 生成できなかった場合はフロントエンド側で日本語の一言を自動補完し、
> 「英日併記」という構造を保証する。機械翻訳の質を偽って主張はしない)。
> (4) バージョン管理機能(`version.json`にセマンティックバージョン追加+
> 画面下部に表示)と、旧バージョンの自動クリーンアップ
> (`auto-update.js`——新バージョン検出時にこのアプリ専用の
> localStorageを破棄しキャッシュ破棄付きで再読み込み。ネイティブ
> インストーラーではない静的Webアプリのため「旧ファイルの自動削除」は
> 安全性の観点から行わず、ブラウザ側の痕跡クリーンアップに限定)。
> 詳細は[CLAUDE.md](CLAUDE.md)の2026-08-10(続き3)HANDOFF参照。
>
> *English*: (1) Switched the default model from `gpt2` (124M) to
> `distilgpt2` (82M), ~42% faster (see `aruaru-llm/CLAUDE.md`).
> (2) Decided **against** porting the frontend JS to Rust/WASM (no
> performance benefit, and `SpeechRecognition` has no standard web-sys
> binding) — instead **ported the local file server to Rust**
> (new `server/` crate, built on RPoem's `open-runo-poem-compat`,
> removing the `python3 -m http.server` dependency). (3) Improved
> Japanese input handling so hybrid (English+Japanese) replies are
> always guaranteed (`app.js`'s `ensureHybridReply` — if the model's
> reply contains no Japanese, the frontend appends a short honest
> Japanese note itself; it does not fake machine-translation quality).
> (4) Added version management (`version.json` now has a semantic
> `version` field, shown in the footer) and automatic cleanup of old
> versions' browser-side traces (`auto-update.js` clears this app's own
> `localStorage` and does a cache-busting reload on update — since this
> is a static web app with no native installer, "uninstalling old
> versions" is scoped to browser-side leftovers only, not disk files).
> See the 2026-08-10 (continued 3) HANDOFF entry in
> [CLAUDE.md](CLAUDE.md) for details.

> 📌 **最近の更新(2026-08-10)**: CORS対応(`aruaru-llm`側に
> `.with_cors()`実装)、GPT-2貪欲デコードの反復ループ根本解決
> (`open-cuda`側`GptModel::generate_with_repetition_penalty`、既定
> `penalty=1.3`)、風天のトラさんキャラクターの見た目調整(カバン・
> わらじサンダル)+切替時ジングル+研修モード名乗り修正、実際の秋葉原
> メイドカフェ(@ほぉ～むカフェ)の接客技法を研修モードへ追加、日本文化
> ブーム(アニメ・漫画・アニソン・ゲーム・日本語学習者・御朱印・温泉旅館・
> 日本食)を日英でWeb調査し研修内容へ反映、Windows/Mac/Linux/Android/
> iPhone/iPad向けランチャーアイコン一式(`icons/`+`launchers/`+
> `manifest.json`)、自動更新機能(`auto-update.js`、`version.json`
> ポーリング)を追加。詳細は[CLAUDE.md](CLAUDE.md)の2026-08-10 HANDOFF
> 参照。
>
> *English*: Added CORS support (`.with_cors()` on the `aruaru-llm`
> side), fixed the root cause of GPT-2 greedy-decode's degenerate
> repetition loop (`open-cuda`'s `GptModel::generate_with_repetition_
> penalty`, default `penalty=1.3`), tweaked the Tora-san character's
> look (bigger light-brown bag, straw-sandal-style feet) + added a
> switch-in jingle + fixed his self-introduction, added a training step
> based on a real Akihabara maid cafe's (@ほぉ～むカフェ) actual
> customer-service technique, researched (in Japanese and English) and
> added a step covering the current overseas boom in Japanese culture
> (anime/manga, anime songs, games, Japanese-language learners, goshuin
> stamp collecting, onsen ryokan tourism, Japanese food), added launcher
> icons for Windows/Mac/Linux/Android/iPhone/iPad
> (`icons/`+`launchers/`+`manifest.json`), and added an auto-update
> mechanism (`auto-update.js` polling `version.json`). See the
> 2026-08-10 HANDOFF entry in [CLAUDE.md](CLAUDE.md) for details.

PC・タブレット・スマートフォンで動く英会話学習Webアプリ(Phase 0)。
「メイドカフェ・イングリッシュ」のような雰囲気で、超初心者から上級者まで
自由に対応する英会話トレーナーを、魔法少女メイドキャラクター
(`sample-maid`と同じ独自デザインの流れを汲む、アニメーション付き)が
担当する。

## アーキテクチャ(ユーザー指示、2026-08-10)

- **Linux(VPS)側**: 配布用のダウンロードサーバーのみ(このアプリ自体の
  実行環境ではない)。アプリ管理は
  [`open-easy-web`](https://github.com/aon-co-jp/open-easy-web)が担う。
- **利用者の端末(PC/タブレット/スマホ)側**: このリポジトリの静的Web
  フロントエンド(HTML/CSS/JS、ブラウザで動く)+
  [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm)のローカル常駐
  サーバー(ネイティブ実行ファイル、`open-directx`/`open-cuda`の推論基盤を
  内部で利用)を利用者自身の端末にダウンロード・実行してもらい、ブラウザは
  `http://localhost:4600`(aruaru-llmの既定ポート)へオンライン/オフライン
  問わずローカル接続する「ハイブリッド」構成。

## 現在のスコープ(Phase 0)・正直な開示

- **AI応答の品質について**: `aruaru-llm`の`/v1/generate`はGPT-2(124M〜
  1.5B、英語中心・対話特化のファインチューニング無し)による自己回帰的
  テキスト生成であり、`aruaru-llm`自身のCLAUDE.mdに「応答品質は不安定」
  と明記されている。本アプリのAI応答にも同じ注意書きを画面上に表示する
  ——「流暢な会話ができる」という誇張はしない。
- **CORSについて**: `aruaru-llm`のHTTPサーバーにはCORSヘッダの設定が
  無いため、このフロントエンドを`aruaru-llm`とは別オリジン
  (別ポート/別ホスト)で配信すると、ブラウザから直接`fetch`できない
  (ブロックされる)。Phase 0では、利用者が`file://`または
  `aruaru-llm`と同一オリジンでこのフロントエンドを開く運用を前提とする
  ——恒久対応(`aruaru-llm`側へのCORS対応追加)は別リポジトリの変更を
  伴うため、ユーザー確認の上で別途対応する。
- **レベル別対応**: 超初心者〜上級者のレベル選択UIはこのPhase 0でも
  実装しているが、実際にレベルに応じて応答の難易度を変える機能は
  プロンプトへの簡単な指示文の付加のみ(GPT-2側で確実にレベルを
  守った応答をする保証は無い、正直な開示)。
- **多言語対応の拡張(2026-08-25、正直な開示・最重要)**: 「学びたい
  言語」(`#learn-target`)・「応答言語」(`#reply-lang`)にドイツ語・
  フランス語・スペイン語・イタリア語・ロシア語・アラビア語・
  ペルシャ語(Farsi)・ヘブライ語を追加した。UI選択肢としては
  配線済みだが、**実機検証の結果、これらの言語ではaruaru-llm
  (英語中心の小型GPT-2)がプロンプトの言語指示を完全に無視し、
  何度試しても常に英語のみで応答した**(ロシア語・アラビア語・
  ペルシャ語・ヘブライ語のいずれも対象スクリプトの文字が生成結果に
  1文字も含まれなかった)。日本語向けの`ensureHybridReply`と同じ
  「構造的な保証」パターンを踏襲し、ロシア語/アラビア語/ペルシャ語/
  ヘブライ語(`containsCyrillic`/`containsArabicScript`/
  `containsHebrewScript`によるUnicodeスクリプト判定)については
  対象文字が1文字も生成されなかった場合に、その旨を正直に告げる
  定型の英日併記ノートを自動追記する(`ensureScriptGuaranteedReply`、
  `app.js`)。ドイツ語・フランス語・スペイン語・イタリア語は英語と
  同じラテン文字のため機械的な生成失敗検出はできず、UIの言語選択欄
  直下に「実機検証で品質が低いことを確認済み」という注記のみを表示
  している。**結論として、これら8言語は「選択肢としては使えるが、
  実用的な会話練習の役には立たない」状態であり、機能として完成した
  とは主張しない。** アラビア語・ペルシャ語・ヘブライ語はRTL(右書き)
  スクリプトのため、該当言語選択時はチャット吹き出し単体に
  `dir="rtl"`を設定する(アプリ全体のLTRレイアウトは維持)。
- **アニメーション**: メイドキャラクターはCSSアニメーション(口の
  開閉ループ)で「喋っている」演出をするプレースホルダー。実際の
  音声合成(TTS)・リップシンクは未実装(次回以降のロードマップ)。

## 必要なインストーラー一覧(2026-08-17新設)

open-englishを動かすには、以下2つのソフトをダウンロード・インストール
する必要があります(ソースからのビルドが不要な、ワンタップに近い方法)。

| # | 何か | Windows | Linux | Android/タブレット |
|---|---|---|---|---|
| 1 | **open-english本体**(このリポジトリ、静的フロントエンド+配信サーバー) | [open-english-installer.exe](https://github.com/aon-co-jp/open-english/releases/latest/download/open-english-installer.exe) | [tar.gz](https://github.com/aon-co-jp/open-english/releases/latest)(`open-english-installer-<os>.tar.gz`) | [APK](https://github.com/aon-co-jp/open-english/releases/latest)(`open-english-installer.apk`) |
| 2 | **aruaru-llm**(AI応答エンジン、必須——無いとチャット機能が動きません) | [aruaru-llm-installer.exe](https://github.com/aon-co-jp/aruaru-llm/releases/latest/download/aruaru-llm-installer.exe) | [tar.gz](https://github.com/aon-co-jp/aruaru-llm/releases/latest) | Android版は同梱済み(open-englishのAPK内に含まれる、別途インストール不要) |

**インストール後の起動方法(2026-08-27追記、ユーザーからの質問への
回答)**: インストーラー(`installer/windows/open-english.iss`)の
アプリ名・スタートメニューのグループ名・ショートカット名は、いずれも
**「open-english」**という文字列で統一されています。デスクトップ
アイコンのダブルクリックでも、Windows検索(画面左下の検索欄)に
「open-english」と入力してもアプリが見つかり起動できます(既定で
デスクトップアイコンも「open-english」という名前で作成されます、
インストール時に「デスクトップアイコンを作成」を選んだ場合)。<br />
**How to launch it after installing (added 2026-08-27, in response to a
user question)**: the app name, Start Menu group name, and shortcut
name in the installer (`installer/windows/open-english.iss`) are all
the same string, **"open-english"**. You can launch it either by
double-clicking the desktop icon or by typing "open-english" into
Windows Search (bottom-left search box) — both find the same app (the
desktop icon, if you chose to create one during install, also uses the
same "open-english" name).

なお、インストーラー本体(`open-english-installer.exe`)はGitHubリポジトリ
内の[`installer/windows/open-english-installer.exe`](installer/windows/open-english-installer.exe)
にも直接コミットされています(通常はGitHub Releasesの最新版リンクを
推奨しますが、リポジトリ内から直接辿りたい場合の分かりやすい場所として)。<br />
The installer binary (`open-english-installer.exe`) is also committed
directly in the GitHub repository at
[`installer/windows/open-english-installer.exe`](installer/windows/open-english-installer.exe)
(the GitHub Releases "latest" link below is still the recommended way
to get it, but this is a clear, discoverable spot if you'd rather
browse the repo directly).

**正直な開示**: 上記の表の「latest」リンクはGitHub Releasesの最新版を指す
自動追従リンクです(タグを固定した特定バージョンが欲しい場合は
[Releasesページ](https://github.com/aon-co-jp/open-english/releases)から
個別に選んでください)。macOS向けの`aruaru-llm`ビルド済み配布は現時点で
まだ無く(`open-english`側はLinux/macOS両対応のtar.gzがありますが、
`aruaru-llm`はLinux/Windowsのみ)、macOSで動かす場合は`aruaru-llm`を
ソースからビルドする必要があります。

Windows/Linux/macOS版はインストール後、起動時に自動アップデート機能
(`server/src/self_update.rs`、2026-08-19にmacOSへも対応)がGitHub Releasesを
確認し、新しいバージョンがあれば自動でアップデートします(ユーザー操作
不要、Windowsはアンインストール→インストール、Linux/macOSは実行中の
バイナリ自身をその場で置き換える方式)。新バージョン適用時は現在の
バイナリを退避した上で、新バージョン起動後に`/healthz`エンドポイントへの
ヘルスチェックが一定時間以内に成功するかを確認し、失敗した場合は自動的に
退避しておいた旧バージョンへロールバック(ダウングレード)します。
**正直な開示**: Android/iPhone/iPadはOSの制約上(APKの完全サイレント
自動インストールが許可されない)、この自動アップデート・自動ロール
バック機構の対象外です——引き続きアプリ内の更新通知からユーザー自身が
タップして手動でダウンロード・インストール(旧バージョンへ戻す場合も
手動)する運用のままです。

## 実行方法

1. [`aruaru-llm`](https://github.com/aon-co-jp/aruaru-llm)を
   `cargo run --release`で起動(既定`http://localhost:4600`、既定モデルは
   `distilgpt2`)。
2. `server/`ディレクトリで`cargo run --release`を実行し、このリポジトリの
   静的フロントエンドを`http://127.0.0.1:4601/`で配信する(RPoemベース、
   `python3 -m http.server`は不要になった——`OPEN_ENGLISH_SERVER_BIND`
   環境変数でポート変更可)。
3. ブラウザで`http://127.0.0.1:4601/`を開く。`file://`で直接開くことも
   可能だが、一部ブラウザは`fetch()`をブロックし自動更新機能が無効化
   されるため、上記手順2のサーバー経由を推奨する。

## 資格試験対策コーナー(2026-08-11)

英検1〜5級・TOEIC・TOEFLのレベル別擬似模擬試験機能(「📝 Exam Prep /
資格対策」ボタン)。**すべてオリジナルの練習問題**(実際の過去問は
著作権保護対象のため未使用)。採点後、間違えた問題を「トレーナーと
練習する」ボタンでチャットへ引き継ぎ、AI講師との会話練習につなげられる。

## Android版(単体動作、2026-08-11更新、記述の古さを2026-08-17に修正)

`android/`は、**PC/LinuxのWEBサーバー無しでスマホ単体で動作する**
Androidアプリ。`open-english-server`(静的フロントエンド配信)に加え、
AI応答エンジン`aruaru-llm`本体も`libaruarullm.so`としてAPKへ同梱済み
(2026-08-11)——両方とも端末上の`127.0.0.1`限定で自己完結して起動する
設計で、**同じWi-Fi内のPCへ接続する必要は無い**(このREADMEに以前
あった「PC上のIPアドレスを入力して接続」という説明は、aruaru-llm同梱前
〈2026-08-11当日の早い時点〉の古い状態を指しており、実態と乖離した
まま更新漏れしていたものです。訂正します)。

**正直な開示(このAndroid版固有の制約)**: 実際の応答生成に必要な
モデル重み(GPT-2系〈数百MB〉・multilingual-e5-small)はAPKには同梱
していません(サイズ・ライセンスの都合、PC版と同じ制約)。現時点では
ユーザー自身が端末の内部ストレージへモデルファイルを手動配置する
必要があり、自動ダウンロード機能はまだ実装していません——「サーバーが
端末内で起動すること」「静的UIが表示されること」までは単体で完結
しますが、実用的な応答品質を得るにはこのモデル配置手順が別途必要です。
詳細・実機検証結果は`CLAUDE.md`のHANDOFFを参照してください。

## 次にすべきこと

1. ~~`aruaru-llm`側へのCORS対応~~ **完了(2026-08-10)**。
2. ~~GPT-2貪欲デコードの反復ループ~~ **根本解決済み(2026-08-10、
   繰り返しペナルティ実装)**。
3. ~~既定モデルの高速化~~ **完了(2026-08-10、distilgpt2切替、約42%
   高速化)**。
4. ~~日本語入力時のハイブリッド応答保証~~ **完了(2026-08-10)**。
5. ~~配信サーバーのRust化~~ **完了(2026-08-10、`server/`crate)**。
   フロントエンドJS自体のRust/WASM移植は性能上のメリットが無いと判断し
   見送り(調査結果は`CLAUDE.md`参照)。
6. 音声合成(TTS)・リップシンクアニメーションの追加。
7. レベル別カリキュラム(文法・単語リスト等)の実装。
8. **(ユーザー指示、2026-08-10)** `open-directx`/`open-cuda`/
   `aruaru-llm`をブラウザ単体(WASM/WebGPU)でも動作させ、
   `RPoem`(GraphQL Federationプラットフォーム)とも連携させる構想。
   現在のPhase 0(ローカル常駐サーバー+localhost接続)とは別方向の
   大規模なアーキテクチャ変更(WASMコンパイル・WebGPU移植)を伴うため、
   MVP完成後に別途スコープを切って着手する。
9. 東芝SBM・DeepSeek系技術の適用可否調査(未着手)。
10. ~~自動UPDATE機能を全関連リポジトリ(aruaru-llm/aruaru-db)対応に
    拡張~~ **完了(2026-08-19)**。同梱コンポーネントの自動アップデート
    はaruaru-llm・aruaru-db(任意)のみ対応——macOS向けリリースアセットが
    まだ両リポジトリのCIに存在しないため、macOSでは「対応アセットなし」
    としてスキップされる(詳細は`CLAUDE.md`同日HANDOFF・
    `PORTING.md`4h節参照)。

## 追記(2026-08-24 続き): バーチャル職業訓練校へのキャリアガイダンス拡張+表示バグ修正

- キャリアガイダンス機能をバーチャルスクール/職業訓練校
  (`VSCHOOL_FIELDS`、23分野)へも拡張(分野選択画面に表示)。家庭教師
  コース側との重複表示バグ(セッション分岐により2つの実装が並行して
  作られたことが原因)を実機で発見・修正済み。
- **緊急バグ修正**: 明るい背景色に文字色を指定していない要素
  (チャット入力欄、多言語連続表示、話題ブリーフィング等)で、白文字が
  白背景と同化して読めなくなっていた問題を解消。「JP」等の言語コード
  表記や「(default / 既定)」のような日英併記部分のフォントサイズが
  不揃いだった点も統一。
- 学習履歴DBの案内文にあった「TLS非対応」という記述が、実際には
  2026-08-24付ですでにTLS対応(`tokio-postgres-rustls`)済みだったのに
  古いまま残っていたため、実態に合わせて修正。この開発機に`cargo`/
  `psql`/Dockerが無く実機検証はできていない旨は正直に明記した。

## 追記(2026-08-24続き2): AndroidでのPWAワンタップインストール対応

Service Worker(`sw.js`)を新設し、`manifest.json`(既存)と組み合わせて
Android版ChromeでのPWAインストール(ホーム画面への「ワンタップ追加」)に
対応した。**正直な開示**: この開発機に`cargo`が無いため`server`を
再ビルドできず、`/sw.js`が実際に配信されること・インストールバナーが
実機で出ることは検証できていない(次回`cargo`が使える環境で要検証)。
既存のネイティブAPK(`android/`、Android SDKあり)は今回のセッションでは
再ビルドしていない。

## 追記(同日、さらなる更新)

老後資金・年金問題への意見トピックと、eガバメント議論トピックの
どちらにも追加の論点(小さな政府・税収不足対策・オバマ元大統領の
発言の具現化)を追記し、いずれも学びたい言語として14言語(スペイン語・
フランス語・ドイツ語・ポルトガル語・ロシア語・中国語簡体字/繁体字・
韓国語・ヒンディー語・アラビア語・ヘブライ語・ペルシャ語・
ウクライナ語・イタリア語)を選択している場合に、その言語への訳文が
追加表示されるようになった。詳細は本CLAUDE.mdの2026-08-27付
HANDOFFを参照。
