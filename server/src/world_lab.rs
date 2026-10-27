//! world-lab: 遊休デバイス(使わなくなったスマホ・タブレット・PC)を
//! USB/Wi-Fi/Bluetooth/LAN経由でつなぎ、ハードウェアアクセラレータを
//! 共有して世界中の人・研究機関と協力するための構想機能。
//!
//! **現状のスコープ(2026-08-24新設、最小スケルトン)**: 実装しているのは
//! 「ペアリングトークンを知っている相手だけが、このサーバーに自分の
//! デバイス情報(名前・接続方式)を登録できる」という**発見/ペアリングの
//! 記帳のみ**。以下は**意図的に実装していない**:
//! - デバイス間でタスク(計算)を実際に配布・実行する機能
//! - 他のデバイス/ネットワーク宛てに通信を中継・転送する機能
//!   (中継機能を持たせないこと自体が、Winnyのような「踏み台」化
//!   〈悪用された結果、無関係な第三者への攻撃中継点にされること〉を
//!   構造的に防ぐ最も確実な方法——中継コードが存在しなければ中継には
//!   使いようがない)
//! - インターネット越しの自動デバイス発見(mDNS/UDPブロードキャスト等)
//!   ——ペアリングトークンは呼び出し元が既に知っている前提で、サーバー
//!   自身がそれを外部へ広告することはしない
//!
//! **セキュリティ設計方針**:
//! 1. **既定で無効**(`OPEN_ENGLISH_WORLD_LAB_ENABLED=1`を明示的に設定
//!    しない限り、全エンドポイントが「無効です」を返す、オプトイン方式)。
//! 2. **トークン認証必須**: ペアリングにはこのプロセス起動時に生成した
//!    トークン(`OPEN_ENGLISH_WORLD_LAB_PAIRING_TOKEN`環境変数で固定値を
//!    指定することも可、未指定時は起動のたびに新しいトークンをログへ
//!    出力するのみでAPI経由では一切公開しない)が必須。
//! 3. **任意コード実行なし**: このモジュールはJSON文字列(デバイス名・
//!    接続方式)を受け取ってメモリ上の連想配列へ記帳するだけで、外部から
//!    受け取った値を実行・評価する経路は無い。
//! 4. **プロセス終了で消える**: 永続化しない(再起動すればペアリング
//!    状態はリセットされる)——意図せぬ長期間の登録残留を避けるための
//!    最小実装上の割り切り。
//!
//! **正直な開示**: これは構想段階の機能を段階的に検証するための
//! 最小スケルトンであり、実際にハードウェアアクセラレータを共有する
//! ところまでは実装していない。次の段階(実装するなら)は、ペアリング
//! 済みデバイスに対してのみ・暗号化された通信路(TLS/mTLS等)上で・
//! サーバー(オーナー)が明示的に許可した種類のタスクだけを送る、という
//! 設計にすべきで、任意のネットワークトラフィックを中継する機能は
//! 今後も持たせるべきではない。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// `GET /v1/world-lab/status`のレスポンス(ハンドラはこの型をそのまま返す)。
#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WorldLabStatus {
    pub enabled: bool,
    pub paired_device_count: usize,
    pub paired_by_kind: PairedByKind,
    pub disclosure_ja: &'static str,
    pub disclosure_en: &'static str,
    pub capabilities_disclosure_ja: &'static str,
    pub capabilities_disclosure_en: &'static str,
    pub wan_disclosure_ja: &'static str,
    pub wan_disclosure_en: &'static str,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct PairedByKind {
    pub phone: usize,
    pub tablet: usize,
    pub pc: usize,
    pub other: usize,
}

/// ペアリング済みデバイス1件分の情報。
#[derive(Debug, Clone, Serialize)]
pub struct PairedDevice {
    pub device_id: String,
    pub device_name: String,
    /// "usb" | "wifi" | "bluetooth" | "lan"(LANクロスケーブル直結を
    /// 含む)| "wan"(インターネット越し、2026-08-25追加)。**"wan"に
    /// ついての重要な注記**: これは自己申告の分類ラベルに過ぎず、
    /// このサーバー自体をインターネットへ自動的に公開する機能は
    /// 一切実装していない(ポートフォワーディング・UPnP・動的DNS等は
    /// 意図的に実装しない——既定で外部非公開という方針の一部)。
    /// また現在のペアリングAPIは平文HTTP(TLS無し)でトークンを
    /// やり取りするため、"wan"を選んで実際にインターネット越しへ
    /// 接続する場合、利用者自身の判断でTLS終端(リバースプロキシ等)を
    /// 用意しない限りトークンが盗聴されるリスクがある——この注記は
    /// `capabilities_disclosure_*`とは別に、下記`pair()`のエラー
    /// メッセージ・UI双方で明示する。
    pub connection: String,
    /// "phone" | "tablet" | "pc" | "other"(2026-08-24追加、ユーザー指示
    /// 「複数のスマホ接続対応+複数のタブレット接続対応、複数のPC接続
    /// 対応」への対応)。**この記帳機構自体は元々デバイス種別を区別せず
    /// 任意台数を`HashMap`で保持できる設計だった**(新規実装は不要)ため、
    /// 今回追加したのは「種別を自己申告させ、一覧で見分けやすくする」
    /// という表示・分類上の改善であり、複数台の同時ペアリング自体は
    /// 元から可能だった(下記テスト`pairs_many_devices_of_mixed_kinds`
    /// で20台同時ペアリングを検証)。
    pub kind: String,
    /// このデバイスが利用可能だと**自己申告**するハードウェア種別
    /// (`"cpu"` / `"gpu"` / `"npu"`の部分集合、2026-08-24追加)。
    /// **正直な開示(重要)**: これはペアリングする側が申告する値を
    /// そのまま記録するだけで、サーバー側で実際にそのハードウェアが
    /// 存在する・利用可能であることを検証・計測してはいない
    /// (ベンチマークもping的な実測もしていない)。実際のGPU/NPU越境
    /// ディスパッチ(他デバイスのGPU/NPUで計算タスクを実行させること)
    /// 自体も未実装——Phase 2のWASM計算タスクは常にCPU
    /// (`wasmtime`のCPUバックエンド)で実行される。この一覧は
    /// 「将来GPU/NPU対応タスクを実装する際にどのデバイスが候補になり
    /// 得るかの参考情報」に留まる。
    pub capabilities: Vec<String>,
    pub paired_at_unix: u64,
}

const ALLOWED_DEVICE_KINDS: &[&str] = &["phone", "tablet", "pc", "other"];
const ALLOWED_CAPABILITIES: &[&str] = &["cpu", "gpu", "npu"];

pub struct WorldLab {
    enabled: bool,
    pairing_token: String,
    devices: Mutex<HashMap<String, PairedDevice>>,
}

impl WorldLab {
    /// 環境変数から設定を読み込む。`OPEN_ENGLISH_WORLD_LAB_ENABLED=1`が
    /// 無ければ全機能が無効のまま起動する(オプトイン)。
    pub fn from_env() -> Self {
        let enabled = std::env::var("OPEN_ENGLISH_WORLD_LAB_ENABLED").map(|v| v == "1").unwrap_or(false);
        let pairing_token = std::env::var("OPEN_ENGLISH_WORLD_LAB_PAIRING_TOKEN")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(random_pairing_token);

        if enabled {
            println!("world-lab: ENABLED (experimental, pairing bookkeeping only — no task dispatch, no traffic relay)");
            println!("world-lab: pairing token for this session (share only with devices you own): {pairing_token}");
        } else {
            println!("world-lab: disabled (set OPEN_ENGLISH_WORLD_LAB_ENABLED=1 to enable the experimental pairing API)");
        }

        Self { enabled, pairing_token, devices: Mutex::new(HashMap::new()) }
    }

    /// トークンがこのサーバーのペアリングトークンと一致するかを
    /// 定数時間比較で確認する(`pair`と同じ検証をタスク実行APIからも
    /// 再利用するための公開ラッパー)。
    pub fn token_matches(&self, token: &str) -> bool {
        self.enabled && constant_time_eq(token.as_bytes(), self.pairing_token.as_bytes())
    }

    /// テスト専用のコンストラクタ(2026-08-24追加)。`from_env()`は
    /// プロセスグローバルな環境変数を読むため、並行実行される他の
    /// テストと状態を共有してしまう(フレークの原因になる)。テストでは
    /// こちらを使い、環境変数に一切触れずに「有効」なインスタンスを
    /// 直接作る。
    #[cfg(test)]
    fn new_enabled_for_test(token: &str) -> Self {
        Self { enabled: true, pairing_token: token.to_string(), devices: Mutex::new(HashMap::new()) }
    }

    pub fn status(&self) -> WorldLabStatus {
        let devices = self.devices.lock().unwrap();
        // 種別ごとの内訳(2026-08-24追加、ユーザー指示「複数のスマホ/
        // タブレット/PC接続対応」の一覧性向上——利用者が一覧を開かずとも
        // 「今どんな端末が何台繋がっているか」を状態パネルで一目で
        // 把握できるようにする、使いやすさの改善)。
        let mut by_kind: HashMap<&str, usize> = HashMap::new();
        for d in devices.values() {
            *by_kind.entry(d.kind.as_str()).or_insert(0) += 1;
        }
        WorldLabStatus {
            enabled: self.enabled,
            paired_device_count: devices.len(),
            paired_by_kind: PairedByKind {
                phone: by_kind.get("phone").copied().unwrap_or(0),
                tablet: by_kind.get("tablet").copied().unwrap_or(0),
                pc: by_kind.get("pc").copied().unwrap_or(0),
                other: by_kind.get("other").copied().unwrap_or(0),
            },
            disclosure_ja: "これはデバイス発見/ペアリングの記帳のみを行う実験的機能です。実際のタスク配布・計算の共有・通信の中継は実装していません。このサーバーには他者宛ての通信を転送するコード自体が存在しないため、ペアリング済みデバイスが増えても、あるいは接続方式が何であっても(USB/Wi-Fi/Bluetooth/LAN)、Winnyのような『踏み台』(第三者への攻撃・不正アクセスの中継点)として悪用することは構造上できません。",
            disclosure_en: "This is an experimental device discovery/pairing bookkeeping feature only. Task dispatch, shared computation, and traffic relaying are not implemented. Because this server contains no code path that forwards traffic on behalf of anyone, it cannot be abused as a Winny-style relay/stepping-stone for attacking or gaining unauthorized access to third parties, regardless of how many devices are paired or which transport (USB/Wi-Fi/Bluetooth/LAN) they use.",
            capabilities_disclosure_ja: "各デバイスのCPU/GPU/NPU対応は接続側の自己申告であり、サーバー側では検証・計測していません。実際の計算タスク(WASMサンドボックス)は常にCPUで実行され、GPU/NPUへの越境ディスパッチは未実装です。",
            capabilities_disclosure_en: "Each device's CPU/GPU/NPU capability is self-reported by the pairing client and is not verified or measured by this server. Actual compute tasks (the WASM sandbox) always run on CPU — dispatching to a remote device's GPU/NPU is not implemented.",
            wan_disclosure_ja: "接続方式に「wan」を選ぶことはできますが、これは自己申告の分類ラベルに過ぎません。このサーバーは既定で127.0.0.1(このPC自身)にのみ待受し、外部からは一切到達できません——インターネットまたはLAN越しに公開したい場合は、利用者自身が`OPEN_ENGLISH_SERVER_BIND`環境変数を明示的に変更する必要があり、これが唯一の「手動設定」経路です。自動でのポート開放(UPnP等)は意図的に実装していません——UPnPによる自動ポート開放はそれ自体がルーターの既知の攻撃経路として長年問題視されており、踏み台化防止を掲げるworld-labへ組み込むのは本末転倒と判断しました。実際にインターネット越しへ公開する場合、現在のペアリングAPIは平文HTTP(TLS無し)のため、ご自身でTLS終端(リバースプロキシ等、既存のopen-web-server/open-easy-webが利用できます)を用意することを強く推奨します。",
            wan_disclosure_en: "You can label a device's connection as \"wan\", but that is only a self-reported classification. This server listens on 127.0.0.1 (this machine only) by default and is unreachable from outside — exposing it to a LAN or the internet requires the operator to explicitly change the OPEN_ENGLISH_SERVER_BIND environment variable, which is the one and only manual path to doing so. Automatic port opening (e.g. UPnP) is deliberately not implemented — UPnP-based auto port-forwarding is itself a long-standing, well-known router attack vector, and building it into a feature whose whole point is preventing relay/stepping-stone abuse would be self-defeating. If you do expose this over the real internet, the pairing API is still plain HTTP (no TLS) today, so setting up your own TLS termination (e.g. via open-web-server/open-easy-web) is strongly recommended.",
        }
    }

    pub fn pair(&self, token: &str, device_name: &str, connection: &str, kind: &str, capabilities: &[String]) -> Result<PairedDevice, String> {
        if !self.enabled {
            return Err("world-lab is disabled on this server (set OPEN_ENGLISH_WORLD_LAB_ENABLED=1)".to_string());
        }
        if !constant_time_eq(token.as_bytes(), self.pairing_token.as_bytes()) {
            return Err("invalid pairing token".to_string());
        }
        let connection = match connection {
            "usb" | "wifi" | "bluetooth" | "lan" | "wan" => connection.to_string(),
            other => return Err(format!("connection must be one of: usb, wifi, bluetooth, lan, wan (got \"{other}\")")),
        };
        // kind未指定(空文字列)は既存クライアント/既存テストとの後方互換
        // のため"other"へフォールバックする(2026-08-24追加の必須項目に
        // していない——古いUI/スクリプトが送ってきても失敗させない)。
        let kind = if kind.is_empty() {
            "other".to_string()
        } else {
            match kind {
                k if ALLOWED_DEVICE_KINDS.contains(&k) => k.to_string(),
                other => return Err(format!("kind must be one of: {} (got \"{other}\")", ALLOWED_DEVICE_KINDS.join(", "))),
            }
        };
        let mut seen_caps = Vec::new();
        for cap in capabilities {
            if !ALLOWED_CAPABILITIES.contains(&cap.as_str()) {
                return Err(format!("capabilities must be a subset of: {} (got \"{cap}\")", ALLOWED_CAPABILITIES.join(", ")));
            }
            if !seen_caps.contains(cap) {
                seen_caps.push(cap.clone());
            }
        }
        let device_name = device_name.trim();
        if device_name.is_empty() || device_name.chars().count() > 100 {
            return Err("device_name must be 1-100 characters".to_string());
        }

        let device_id = random_hex(8);
        let device = PairedDevice {
            device_id: device_id.clone(),
            device_name: device_name.to_string(),
            connection,
            kind,
            capabilities: seen_caps,
            paired_at_unix: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
        };
        self.devices.lock().unwrap().insert(device_id, device.clone());
        Ok(device)
    }

    pub fn list_devices(&self) -> Result<Vec<PairedDevice>, String> {
        if !self.enabled {
            return Err("world-lab is disabled on this server (set OPEN_ENGLISH_WORLD_LAB_ENABLED=1)".to_string());
        }
        let mut devices: Vec<PairedDevice> = self.devices.lock().unwrap().values().cloned().collect();
        devices.sort_by_key(|d| d.paired_at_unix);
        Ok(devices)
    }

    pub fn unpair(&self, device_id: &str) -> Result<bool, String> {
        if !self.enabled {
            return Err("world-lab is disabled on this server (set OPEN_ENGLISH_WORLD_LAB_ENABLED=1)".to_string());
        }
        Ok(self.devices.lock().unwrap().remove(device_id).is_some())
    }

    /// **一括ペアリング(2026-08-25追加)**。ユーザー指示「企業やオフィス等
    /// で大量にあるPC/タブレット/スマホに対して一斉に手動による許可・
    /// 公開設定を可能に」への対応。**重要: これは1件ずつの
    /// `pair()`呼び出しをまとめて処理する利便性機能であり、認証・
    /// オプトインの原則は一切緩めていない**——依然として正しい
    /// ペアリングトークンを持つ人が、対象デバイスのリストを明示的に
    /// 用意して1回のボタン操作で送信する必要がある(自動発見・
    /// 自動承認ではない)。1件ごとに`pair()`と全く同じ検証(kind/
    /// capabilitiesのホワイトリスト等)を通すため、一括だからといって
    /// 検証が緩くなることはない。件数上限(既定100件)を設け、
    /// 極端に大きなリクエストで無制限に処理させない。
    pub fn bulk_pair(&self, token: &str, requests: &[BulkPairEntry]) -> Result<Vec<BulkPairResult>, String> {
        if !self.enabled {
            return Err("world-lab is disabled on this server (set OPEN_ENGLISH_WORLD_LAB_ENABLED=1)".to_string());
        }
        const MAX_BULK_SIZE: usize = 100;
        if requests.is_empty() {
            return Err("devices list must not be empty".to_string());
        }
        if requests.len() > MAX_BULK_SIZE {
            return Err(format!("too many devices in one bulk request ({} given, limit {MAX_BULK_SIZE})", requests.len()));
        }
        // 各エントリで`pair()`をそのまま呼ぶため、トークン検証も
        // エントリ数だけ実行される(定数時間比較なのでNが増えても
        // 個々の比較の安全性は変わらない)。1件ごとに独立した
        // `pair()`と全く同じ検証を通ることが重要——一括だからといって
        // 検証をバイパスする経路を作らない設計。
        let results: Vec<BulkPairResult> = requests
            .iter()
            .map(|entry| match self.pair(token, &entry.device_name, &entry.connection, &entry.kind, &entry.capabilities) {
                Ok(device) => BulkPairResult { device_name: entry.device_name.clone(), ok: true, device: Some(device), error: None },
                Err(e) => BulkPairResult { device_name: entry.device_name.clone(), ok: false, device: None, error: Some(e) },
            })
            .collect();
        Ok(results)
    }
}

#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
pub struct BulkPairEntry {
    pub device_name: String,
    pub connection: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BulkPairResult {
    pub device_name: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<PairedDevice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// タイミング攻撃(トークン照合にかかる時間差からの推測)を避けるための
/// 定数時間比較。長さが違う場合のみ早期returnする(値自体の長さは秘密
/// ではないため許容——トークン自体の内容だけを漏らさなければよい)。
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// OS由来のランダム性で16進文字列を生成する。**正直な開示**: 専用の
/// CSPRNGクレート(`rand`/`getrandom`等)は本サーバーの既存依存に
/// 含まれていないため追加していない——代わりに`RandomState`
/// (Rust標準ライブラリのHashMap既定ハッシャー、生成のたびにOSの
/// エントロピー源からシードされる)を複数回シードし直してハッシュ値を
/// 連結する方式にした。ペアリングコード(利用者が手元の2台間だけで
/// 共有する短命な値)としては妥当な強度だが、長期間有効な秘密鍵や
/// TLS証明書の代わりにはならない——将来、実際の暗号化通信を実装する
/// 段になったら、その用途には`rustls`が既に依存しているため
/// `ring`/`rustls`側の乱数機構を使うこと。
fn random_hex(len_bytes: usize) -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let mut out = Vec::with_capacity(len_bytes + 8);
    let mut counter: u64 = 0;
    while out.len() < len_bytes {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(counter);
        h.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos());
        h.write_usize(out.len());
        let v = h.finish();
        out.extend_from_slice(&v.to_le_bytes());
        counter = counter.wrapping_add(1);
    }
    out.truncate(len_bytes);
    out.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn random_pairing_token() -> String {
    random_hex(16)
}

// ============================================================================
// Phase 2(2026-08-24追加): WASMサンドボックス内での計算タスク実行
// ============================================================================
//
// ユーザー指示「CPU+NPU+グラフィックボード+スマホやタブレットやその他の
// PCなどをほとんど使っていない時間に、他社のPCでの計算に共同利用しても
// らう」「WASMサンドボックス内での任意計算」「報酬・インセンティブは無し
// (相互扶助・無償提供)」への対応。**Phase 1(上記のペアリング記帳)とは
// 別に、既定で無効の追加フラグ(`OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED`)
// で保護する**——ペアリングだけ有効化して計算実行は無効のまま、という
// 構成を選べるようにするための二段階のオプトイン。
//
// **サンドボックスの安全性の核心(なぜ安全と言えるか)**:
// 1. **Linkerへ何もimportしない**——空の`Linker<StoreLimits>`しか使わない
//    ため、guestのWASMコードはファイル・ネットワーク・時刻・環境変数
//    など、ホスト側の一切の機能を呼び出せない。WASI(WebAssembly System
//    Interface)は意図的にlinkしていない。guestが何らかのimportを要求
//    するモジュールを送ってきた場合はinstantiate自体が失敗する
//    (「セルフコンテインドな純粋計算モジュールのみ受理する」という
//    設計)。
// 2. **fuel(命令数)上限**——`Config::consume_fuel(true)`+
//    `Store::set_fuel(...)`で、実行できる命令数の総量を制限する。
//    無限ループも指数的に重い計算も、この上限に達すれば
//    トラップ(実行時エラー)で強制終了する。
// 3. **壁時計タイムアウト(fuel計算のズレに対する保険)**——呼び出し元
//    (`main.rs`)が`tokio::time::timeout`+`spawn_blocking`で追加の
//    ハード上限をかける(fuel消費量の見積もりが外れるケースへの保険)。
// 4. **メモリ上限**——`StoreLimitsBuilder::memory_size(...)`で線形
//    メモリの総量に上限を設ける(既定4MiB)。
// 5. **入出力サイズの上限**——受け取るWASMバイナリ・入力バイト列・
//    出力バイト列のいずれにも明示的な上限を設け、無制限のメモリ確保・
//    転送を許さない。
// 6. **通信の中継は無い**(このファイル冒頭のdoc参照)——このモジュールは
//    「送られてきたWASMを、送られてきた入力で実行し、結果を返す」だけで
//    あり、guestコードが外部と通信する手段自体が存在しない(上記1番の
//    帰結)。
//
// **正直な開示・この段階でも解決していないリスク**:
// - guestコードが**送信者の意図通りに動く保証は無い**——結果の正しさは
//   検証していない(悪意ある送信者が間違った/有害な結果を返すことは
//   ゲーム理論的には可能。今回は「無償の相互扶助」という前提のため、
//   評判システム・結果の多重検証〈複数ノードでの再計算比較〉のような
//   対策は実装していない)。
// - **サイドチャネル攻撃**(実行時間の差分からの情報推測等)への対策は
//   していない——機密データを扱う計算をこの上で動かすことは想定しない。
// - **同時実行数の上限は今回未実装**——大量のリクエストを送りつけられた
//   場合のリソース枯渇(このプロセス自体のCPU/メモリ)への対策は、
//   個々のタスクの上限(fuel/メモリ/タイムアウト)だけでは不十分な
//   可能性がある。次の段階で同時実行数の上限・キューイングを検討する
//   必要がある。

/// guestモジュールへ課す上限(既定値、環境変数で上書き可)。
pub struct ComputeLimits {
    pub max_wasm_bytes: usize,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
    pub memory_limit_bytes: usize,
    pub fuel_limit: u64,
    pub timeout_secs: u64,
}

impl ComputeLimits {
    fn from_env() -> Self {
        fn env_usize(key: &str, default: usize) -> usize {
            std::env::var(key).ok().and_then(|v| v.parse().ok()).filter(|n| *n > 0).unwrap_or(default)
        }
        fn env_u64(key: &str, default: u64) -> u64 {
            std::env::var(key).ok().and_then(|v| v.parse().ok()).filter(|n| *n > 0).unwrap_or(default)
        }
        Self {
            max_wasm_bytes: env_usize("OPEN_ENGLISH_WORLD_LAB_MAX_WASM_BYTES", 256 * 1024),
            max_input_bytes: env_usize("OPEN_ENGLISH_WORLD_LAB_MAX_INPUT_BYTES", 64 * 1024),
            max_output_bytes: env_usize("OPEN_ENGLISH_WORLD_LAB_MAX_OUTPUT_BYTES", 64 * 1024),
            memory_limit_bytes: env_usize("OPEN_ENGLISH_WORLD_LAB_MEMORY_LIMIT_BYTES", 4 * 1024 * 1024),
            fuel_limit: env_u64("OPEN_ENGLISH_WORLD_LAB_FUEL_LIMIT", 500_000_000),
            timeout_secs: env_u64("OPEN_ENGLISH_WORLD_LAB_TIMEOUT_SECS", 5),
        }
    }
}

/// guestモジュールに要求するABI: `memory`(線形メモリ)+
/// `run(in_ptr: i32, in_len: i32, out_ptr: i32, out_cap: i32) -> i32`
/// (書き込んだ出力バイト数、または負値でエラーを表す関数)。
/// 入力は線形メモリのオフセット0から書き込み、出力は`out_ptr`
/// (`max_input_bytes`直後のオフセット)から`out_cap`
/// (`max_output_bytes`)バイトまで書き込める前提とする。
fn run_wasm_blocking(wasm: &[u8], input: &[u8], limits: &ComputeLimits) -> Result<(Vec<u8>, u64), String> {
    if wasm.len() > limits.max_wasm_bytes {
        return Err(format!("wasm module too large ({} bytes, limit {})", wasm.len(), limits.max_wasm_bytes));
    }
    if input.len() > limits.max_input_bytes {
        return Err(format!("input too large ({} bytes, limit {})", input.len(), limits.max_input_bytes));
    }

    let mut config = wasmtime::Config::new();
    config.consume_fuel(true);
    let engine = wasmtime::Engine::new(&config).map_err(|e| format!("failed to create WASM engine: {e}"))?;

    // `Module::new`はWATテキスト/WASMバイナリの両方を受理する
    // (wasmtimeの既定`wat`featureによる自動判別)——サンドボックスの
    // 安全性は入力形式(テキストかバイナリか)には依存しないため、
    // どちらを送っても同じ安全性で扱える。
    let module = wasmtime::Module::new(&engine, wasm).map_err(|e| format!("failed to compile WASM module: {e}"))?;

    let limiter = wasmtime::StoreLimitsBuilder::new()
        .memory_size(limits.memory_limit_bytes)
        .instances(1)
        .memories(1)
        .tables(1)
        .build();
    let mut store = wasmtime::Store::new(&engine, limiter);
    store.limiter(|state| state);
    store.set_fuel(limits.fuel_limit).map_err(|e| format!("failed to set fuel limit: {e}"))?;

    // **意図的に空のLinker**(このファイル冒頭のdoc参照)——ホスト関数を
    // 一切importさせない。guestが何らかのimportを要求するモジュールを
    // 送ってきた場合、instantiateがそのままエラーになる。
    let linker: wasmtime::Linker<wasmtime::StoreLimits> = wasmtime::Linker::new(&engine);
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| format!("failed to instantiate module (it must be self-contained: no imports allowed): {e}"))?;

    let memory = instance
        .get_memory(&mut store, "memory")
        .ok_or_else(|| "module must export a linear memory named \"memory\"".to_string())?;

    let run_fn = instance
        .get_typed_func::<(i32, i32, i32, i32), i32>(&mut store, "run")
        .map_err(|_| "module must export a function \"run(in_ptr: i32, in_len: i32, out_ptr: i32, out_cap: i32) -> i32\"".to_string())?;

    let out_ptr = limits.max_input_bytes; // 入力領域の直後を出力領域に使う
    let out_cap = limits.max_output_bytes;
    let needed = out_ptr + out_cap;
    if (memory.data(&store).len()) < needed {
        return Err(format!(
            "module's initial memory ({} bytes) is smaller than input+output area ({} bytes) — export a larger initial memory",
            memory.data(&store).len(),
            needed
        ));
    }

    memory.write(&mut store, 0, input).map_err(|e| format!("failed to write input into guest memory: {e}"))?;

    let written = run_fn
        .call(&mut store, (0, input.len() as i32, out_ptr as i32, out_cap as i32))
        .map_err(|e| format!("guest module trapped or ran out of fuel: {e}"))?;

    if written < 0 {
        return Err(format!("guest module returned an error code ({written})"));
    }
    let written = written as usize;
    if written > out_cap {
        return Err(format!("guest module reported writing {written} bytes, which exceeds the output capacity {out_cap}"));
    }

    let mut output = vec![0u8; written];
    memory.read(&store, out_ptr, &mut output).map_err(|e| format!("failed to read output from guest memory: {e}"))?;

    let fuel_consumed = limits.fuel_limit.saturating_sub(store.get_fuel().unwrap_or(0));
    Ok((output, fuel_consumed))
}

pub struct ComputeEngine {
    pub enabled: bool,
    pub limits: ComputeLimits,
    /// 同時実行数の上限(2026-08-24追加、ユーザー指示「同時実行数の
    /// 上限・キューイング」への対応)。個々のタスクにfuel/メモリ/
    /// タイムアウト上限を課しても、**大量のリクエストを同時に送りつけ
    /// られれば、その分だけ子プロセスが並列に立ち上がり、このホスト
    /// プロセス自体のCPU/メモリ/プロセステーブルを圧迫し得る**——
    /// 個々のタスクの上限だけでは防げないリソース枯渇に対する追加の
    /// 防御層。`tokio::sync::Semaphore`の許可証(permit)を先着順で
    /// 配布し、上限に達している間は新規タスクを待機させる。
    concurrency: Arc<tokio::sync::Semaphore>,
    /// 現在待機(実行許可待ち)中のタスク数。`max_queue`を超えたら、
    /// 待機させ続けるのではなく即座に拒否する(無制限キューイングも
    /// それ自体がメモリ枯渇の一種であるため)。
    queued: Arc<std::sync::atomic::AtomicUsize>,
    max_queue: usize,
}

impl ComputeEngine {
    pub fn from_env() -> Self {
        let enabled = std::env::var("OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED").map(|v| v == "1").unwrap_or(false);
        let limits = ComputeLimits::from_env();
        let max_concurrent = std::env::var("OPEN_ENGLISH_WORLD_LAB_MAX_CONCURRENT_TASKS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(2);
        let max_queue = std::env::var("OPEN_ENGLISH_WORLD_LAB_MAX_QUEUE")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|n| *n > 0)
            .unwrap_or(8);
        if enabled {
            println!(
                "world-lab compute: ENABLED (experimental, WASM sandbox in an isolated worker process — empty Linker, no WASI, fuel={}, memory_limit={}B, timeout={}s, max_concurrent={max_concurrent}, max_queue={max_queue})",
                limits.fuel_limit, limits.memory_limit_bytes, limits.timeout_secs
            );
        } else {
            println!("world-lab compute: disabled (set OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED=1 in addition to OPEN_ENGLISH_WORLD_LAB_ENABLED=1 to enable)");
        }
        Self {
            enabled,
            limits,
            concurrency: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            queued: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            max_queue,
        }
    }

    /// **サブプロセス隔離での実行(2026-08-24追加、実機テストで発覚した
    /// 重大な問題への対応)**。
    ///
    /// **経緯(正直な開示)**: 当初はこのプロセス内で直接`wasmtime`を呼ぶ
    /// 設計(`run_wasm_blocking`を`spawn_blocking`で包むだけ)だった。
    /// しかし実際にfuel上限へ達する無限ループのWASMモジュールで
    /// テストしたところ、この開発機(Windows)では**HTTPサーバー
    /// プロセス自体がクラッシュして異常終了する**ことを実機で確認した
    /// (`wasmtime`のトラップ配送〈SEHベースのlongjmp〉がWindowsの
    /// /GSスタック保護チェックに引っかかり`STATUS_STACK_BUFFER_OVERRUN`で
    /// abortする、cargo testでも同じ手順で再現済み)。fuel上限は本来
    /// 「悪意あるコードを安全に止める」ための機構のはずが、逆にその
    /// 機構自体がクラッシュの引き金になってしまっていた——「サンドボックス
    /// のつもりが、攻撃者が1回のリクエストでサーバー全体を落とせる
    /// DoSの穴だった」という重大な設計上の欠陥であり、そのまま出荷
    /// できないと判断した。
    ///
    /// **対策**: WASM実行そのものを、このバイナリ自身を
    /// `--world-lab-worker`引数付きで起動した**別プロセス**の中で行う
    /// ようにした。子プロセスが(fuel枯渇に限らずどんな理由であれ)
    /// クラッシュ・異常終了しても、それは子プロセスの終了コードとして
    /// 観測されるだけで、親プロセス(HTTPサーバー本体・他の利用者の
    /// リクエスト)には一切影響しない。ブラウザのタブ分離・多くの
    /// サンドボックス実装(V8 isolate等)と同じ「プロセス境界による
    /// 多層防御」の考え方——WASMサンドボックス自体の欠陥(既知・未知
    /// 問わず)が見つかっても、被害をこのプロセス1つに封じ込められる。
    ///
    /// 通信は標準入出力経由の単純な長さ接頭辞つきバイナリフレーミング
    /// (`run_worker_main`のdoc参照)。壁時計タイムアウトを超えた場合は
    /// 子プロセスを`kill`する。
    pub async fn run_isolated(&self, wasm: &[u8], input: &[u8]) -> Result<(Vec<u8>, u64), String> {
        if !self.enabled {
            return Err("world-lab compute execution is disabled on this server (set OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED=1)".to_string());
        }
        // 明らかに上限超過のリクエストのために、わざわざ子プロセスを
        // 起動しない(早期に親プロセス側で弾く)。
        if wasm.len() > self.limits.max_wasm_bytes {
            return Err(format!("wasm module too large ({} bytes, limit {})", wasm.len(), self.limits.max_wasm_bytes));
        }
        if input.len() > self.limits.max_input_bytes {
            return Err(format!("input too large ({} bytes, limit {})", input.len(), self.limits.max_input_bytes));
        }

        // 同時実行数の上限・キューイング(このstructのdoc参照)。
        // 上限に達している間に並んで待つリクエストが多すぎる場合は、
        // 無制限に待たせるのではなく即座に拒否する。
        use std::sync::atomic::Ordering;
        let queued_now = self.queued.fetch_add(1, Ordering::SeqCst) + 1;
        if queued_now > self.max_queue {
            self.queued.fetch_sub(1, Ordering::SeqCst);
            return Err(format!(
                "too many world-lab tasks are already queued ({} waiting, limit {}) — try again later",
                queued_now - 1,
                self.max_queue
            ));
        }
        let permit = match self.concurrency.clone().acquire_owned().await {
            Ok(p) => p,
            Err(e) => {
                self.queued.fetch_sub(1, Ordering::SeqCst);
                return Err(format!("internal error acquiring concurrency slot: {e}"));
            }
        };
        self.queued.fetch_sub(1, Ordering::SeqCst);

        let result = run_in_worker_process(wasm, input, self.limits.timeout_secs).await;
        drop(permit); // 明示——許可証は次に待っているタスクへ回る
        result
    }
}

/// `wasm`+`input`を子プロセス(`--world-lab-worker`)へ渡して実行させ、
/// 結果を受け取る。子プロセスの異常終了(クラッシュ)・タイムアウトの
/// いずれも、通常のエラー文字列として返す(親プロセスは道連れにしない)。
async fn run_in_worker_process(wasm: &[u8], input: &[u8], timeout_secs: u64) -> Result<(Vec<u8>, u64), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let exe = std::env::current_exe().map_err(|e| format!("failed to resolve own executable path: {e}"))?;
    let mut child = tokio::process::Command::new(exe)
        .arg("--world-lab-worker")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to spawn isolated worker process: {e}"))?;

    let mut child_stdin = child.stdin.take().ok_or("failed to open worker stdin")?;
    let mut child_stdout = child.stdout.take().ok_or("failed to open worker stdout")?;

    let wasm = wasm.to_vec();
    let input = input.to_vec();
    let write_fut = async move {
        child_stdin.write_all(&(wasm.len() as u64).to_le_bytes()).await?;
        child_stdin.write_all(&wasm).await?;
        child_stdin.write_all(&(input.len() as u64).to_le_bytes()).await?;
        child_stdin.write_all(&input).await?;
        child_stdin.shutdown().await?;
        Ok::<(), std::io::Error>(())
    };
    let read_fut = async move {
        let mut status_byte = [0u8; 1];
        child_stdout.read_exact(&mut status_byte).await?;
        let mut fuel_bytes = [0u8; 8];
        child_stdout.read_exact(&mut fuel_bytes).await?;
        let mut len_bytes = [0u8; 8];
        child_stdout.read_exact(&mut len_bytes).await?;
        let payload_len = u64::from_le_bytes(len_bytes) as usize;
        let mut payload = vec![0u8; payload_len];
        child_stdout.read_exact(&mut payload).await?;
        Ok::<(u8, u64, Vec<u8>), std::io::Error>((status_byte[0], u64::from_le_bytes(fuel_bytes), payload))
    };

    let combined = async {
        let (write_result, read_result) = tokio::join!(write_fut, read_fut);
        write_result?;
        read_result
    };

    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), combined).await {
        Ok(Ok((status, fuel_consumed, payload))) => {
            let _ = child.wait().await; // ゾンビプロセスを残さない
            if status == 1 {
                Ok((payload, fuel_consumed))
            } else {
                Err(String::from_utf8_lossy(&payload).to_string())
            }
        }
        Ok(Err(io_err)) => {
            // フレーミングが途中で切れた=子プロセスが応答を書き終える前に
            // 終了した(クラッシュ)と考えられる。実際の終了コードも
            // 添えて報告する(正直な開示——親プロセスは無事だが、子
            // プロセス側で何かが実際に落ちたことを利用者に隠さない)。
            let _ = child.kill().await;
            let exit_info = match child.wait().await {
                Ok(status) => format!("{status}"),
                Err(e) => format!("(failed to read exit status: {e})"),
            };
            Err(format!("worker process I/O error (it likely crashed): {io_err}; exit status: {exit_info}"))
        }
        Err(_) => {
            let _ = child.kill().await;
            Err(format!("task exceeded wall-clock timeout ({timeout_secs}s) and the worker process was killed"))
        }
    }
}

/// `--world-lab-worker`引数付きで起動された場合のワーカーエントリ
/// ポイント(`main.rs`の`fn main()`冒頭から呼ばれる、通常の起動処理
/// 〈DBオープン・HTTPサーバー起動等〉は一切行わない)。stdinから
/// 1件のリクエストを読み、`run_wasm_blocking`でWASMを実行し、
/// stdoutへ結果を書いてプロセスを終了する。
///
/// **フレーミング形式(正直に仕様を書き残す、変更する場合は親側
/// `run_in_worker_process`と対で直すこと)**:
/// - リクエスト(stdin): `[u64 LE: wasm_len][wasm bytes][u64 LE:
///   input_len][input bytes]`
/// - レスポンス(stdout): `[u8: 1=成功/0=失敗][u64 LE: fuel_consumed
///   (失敗時は0)][u64 LE: payload_len][payload bytes(成功時は出力
///   バイト列、失敗時はUTF-8エラーメッセージ)]`
///
/// **このプロセス自体がクラッシュした場合**(`run_wasm_blocking`内部の
/// `wasmtime`が万一abortする等)、上記のレスポンスが書き終わる前に
/// プロセスが消えるため、親プロセス側は「フレーミングが途中で切れた」
/// エラーとして検出する(`run_in_worker_process`参照)——親プロセスの
/// HTTPサーバー機能そのものは無事に動き続ける。
pub fn run_worker_main() -> ! {
    use std::io::{Read, Write};

    fn read_u64(r: &mut impl Read) -> std::io::Result<u64> {
        let mut b = [0u8; 8];
        r.read_exact(&mut b)?;
        Ok(u64::from_le_bytes(b))
    }
    fn read_vec(r: &mut impl Read, len: usize) -> std::io::Result<Vec<u8>> {
        let mut v = vec![0u8; len];
        r.read_exact(&mut v)?;
        Ok(v)
    }

    let result: Result<(Vec<u8>, u64), String> = (|| {
        let mut stdin = std::io::stdin().lock();
        let wasm_len = read_u64(&mut stdin).map_err(|e| format!("failed to read wasm_len: {e}"))? as usize;
        let wasm = read_vec(&mut stdin, wasm_len).map_err(|e| format!("failed to read wasm bytes: {e}"))?;
        let input_len = read_u64(&mut stdin).map_err(|e| format!("failed to read input_len: {e}"))? as usize;
        let input = read_vec(&mut stdin, input_len).map_err(|e| format!("failed to read input bytes: {e}"))?;
        let limits = ComputeLimits::from_env();
        run_wasm_blocking(&wasm, &input, &limits)
    })();

    let mut stdout = std::io::stdout().lock();
    let _ = (|| -> std::io::Result<()> {
        match result {
            Ok((output, fuel_consumed)) => {
                stdout.write_all(&[1u8])?;
                stdout.write_all(&fuel_consumed.to_le_bytes())?;
                stdout.write_all(&(output.len() as u64).to_le_bytes())?;
                stdout.write_all(&output)?;
            }
            Err(e) => {
                let payload = e.into_bytes();
                stdout.write_all(&[0u8])?;
                stdout.write_all(&0u64.to_le_bytes())?;
                stdout.write_all(&(payload.len() as u64).to_le_bytes())?;
                stdout.write_all(&payload)?;
            }
        }
        stdout.flush()
    })();
    std::process::exit(0);
}

// ============================================================================
// Phase B(2026-08-25追加): 受信側デバイスでの明示的承認ゲート
// ============================================================================
//
// CLAUDE.md 2026-08-25付「world-lab複数デバイス計算配布のセキュリティ設計」
// (e)節のPhase B(「受信側の明示的承認UIと、ペアリング通信のTLS化…まだ
// 実際のタスク転送は行わず、承認フローだけを単体で実機検証する」)への
// 対応。**このモジュールが実装するのは受信側の承認ゲートのみ**——
// どこか別のデバイスへ実際にタスクを送りつける経路(送信側)はこの
// リポジトリのどこにも存在しない(それはPhase C)。「配布リクエストが
// 届いた」とは、この実装では単に「このサーバーの
// `/v1/world-lab/dispatch/request`へHTTPリクエストが届いた」ことを
// 指すだけで、送信元が本当に別の物理デバイスか、同一マシン上のcurlか
// (今回2台目の実機が用意できなかったため後者のみでテスト)は、この
// モジュールにとって区別する必要がない設計——どちらであっても全く
// 同じコード経路を通る。
//
// **設計の核心(CLAUDE.md (b)節どおり)**: 有効なペアリングトークンを
// 持っているだけでは、このデバイス上でタスクを実行してよい許可には
// **ならない**。すべての配布リクエストはまず`PendingDispatch`として
// キューへ積まれ、受信側の人間が`approve()`を明示的に呼ぶまでWASM
// モジュールは一切実行されない。キューを消費する経路は`list()`
// (一覧表示のみ、実行なし)・`approve()`(実行を伴う唯一の経路)・
// `deny()`(実行せず破棄)の3つだけで、自動・無承認で実行される経路は
// どこにも無い。「常時自動承認」の設定はこのモジュールには存在しない
// (Phase Dのスコープであり、CLAUDE.mdはその段階でもオプトインを
// 要求している)。

/// キュー一覧表示用のサマリ(WASM/入力の実バイト列は含まない——
/// 一覧APIのレスポンスに任意サイズのペイロードを含めないための設計、
/// 承認時にのみ`take_for_approval`で実バイト列を取り出す)。
#[derive(Debug, Clone, Serialize)]
pub struct PendingDispatchSummary {
    pub id: String,
    pub from_device_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_device_id: Option<String>,
    pub task_name: String,
    pub wasm_len: usize,
    pub input_len: usize,
    pub requested_at_unix: u64,
}

/// キュー内の1件(実バイト列を保持する完全版、`approve()`で取り出されて
/// 消費される)。
pub struct PendingDispatch {
    pub id: String,
    pub from_device_name: String,
    pub from_device_id: Option<String>,
    pub task_name: String,
    pub requested_at_unix: u64,
    pub wasm: Vec<u8>,
    pub input: Vec<u8>,
}

impl PendingDispatch {
    fn summary(&self) -> PendingDispatchSummary {
        PendingDispatchSummary {
            id: self.id.clone(),
            from_device_name: self.from_device_name.clone(),
            from_device_id: self.from_device_id.clone(),
            task_name: self.task_name.clone(),
            wasm_len: self.wasm.len(),
            input_len: self.input.len(),
            requested_at_unix: self.requested_at_unix,
        }
    }
}

/// 受信側の承認待ちキュー。`WorldLab`とは別構造体にしている
/// (承認ゲートはworld-lab全体の記帳機能とは独立した責務のため)が、
/// 呼び出し側(`main.rs`)は同じペアリングトークンで両方を保護する。
pub struct ApprovalQueue {
    pending: Mutex<HashMap<String, PendingDispatch>>,
    max_pending: usize,
}

impl Default for ApprovalQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl ApprovalQueue {
    pub fn new() -> Self {
        Self { pending: Mutex::new(HashMap::new()), max_pending: 50 }
    }

    /// 配布リクエストをキューへ積む(実行はしない)。呼び出し元
    /// (`main.rs`のHTTPハンドラ)がペアリングトークンを既に検証済みで
    /// ある前提——このメソッド自体はトークンを見ない(`WorldLab`側の
    /// 責務との分離)。
    pub fn request(&self, from_device_name: &str, from_device_id: Option<String>, task_name: &str, wasm: Vec<u8>, input: Vec<u8>) -> Result<String, String> {
        let from_device_name = from_device_name.trim();
        if from_device_name.is_empty() || from_device_name.chars().count() > 100 {
            return Err("from_device_name must be 1-100 characters".to_string());
        }
        let task_name = {
            let trimmed = task_name.trim();
            let name = if trimmed.is_empty() { "(unnamed task)" } else { trimmed };
            name.chars().take(200).collect::<String>()
        };

        let mut pending = self.pending.lock().unwrap();
        if pending.len() >= self.max_pending {
            return Err(format!("too many pending dispatch approvals already queued ({}, limit {})", pending.len(), self.max_pending));
        }
        let id = random_hex(8);
        pending.insert(
            id.clone(),
            PendingDispatch {
                id: id.clone(),
                from_device_name: from_device_name.to_string(),
                from_device_id,
                task_name,
                requested_at_unix: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
                wasm,
                input,
            },
        );
        Ok(id)
    }

    /// 承認待ち一覧(何が・どのデバイスから・いつ届いたか)。ペイロード
    /// 本体は含まない。
    pub fn list(&self) -> Vec<PendingDispatchSummary> {
        let mut v: Vec<PendingDispatchSummary> = self.pending.lock().unwrap().values().map(PendingDispatch::summary).collect();
        v.sort_by_key(|d| d.requested_at_unix);
        v
    }

    /// 承認: キューから該当エントリを取り除いて呼び出し元へ返す
    /// (取り除くこと自体をこの関数の責務とし、実行は呼び出し元
    /// ——既存Phase 2の`ComputeEngine::run_isolated`——に委ねる。これに
    /// より、このモジュール自体は「もう一つのサンドボックス」を持たず、
    /// 既存のWASM実行コードをそのまま再利用する設計になる)。**承認前に
    /// キューから取り除く**ため、同一IDへの同時多重承認が二重実行に
    /// ならない(2回目の呼び出しは「見つからない」エラーになる)。
    pub fn take_for_approval(&self, id: &str) -> Result<PendingDispatch, String> {
        self.pending.lock().unwrap().remove(id).ok_or_else(|| format!("no pending dispatch approval with id \"{id}\" (already handled, or never existed)"))
    }

    /// 却下: 実行せずキューから破棄する。呼び出し元(送信側)には
    /// 「拒否された」という事実を正直に返す(黙って握りつぶさない)。
    pub fn deny(&self, id: &str) -> Result<(), String> {
        self.pending
            .lock()
            .unwrap()
            .remove(id)
            .map(|_| ())
            .ok_or_else(|| format!("no pending dispatch approval with id \"{id}\" (already handled, or never existed)"))
    }
}

#[cfg(test)]
mod approval_queue_tests {
    use super::*;

    /// `mod tests`内の同名定数と同一内容(バイト各+1する自己完結WASM)。
    /// モジュールをまたいだprivate定数の共有を避けるためここに複製した
    /// (意図的な重複、実装のコピーではなく1関数分のテストフィクスチャ)。
    const WAT_INCREMENT: &str = r#"
        (module
          (memory (export "memory") 2)
          (func (export "run") (param $in_ptr i32) (param $in_len i32) (param $out_ptr i32) (param $out_cap i32) (result i32)
            (local $i i32)
            (local.set $i (i32.const 0))
            (block $done
              (loop $loop
                (br_if $done (i32.ge_s (local.get $i) (local.get $in_len)))
                (i32.store8
                  (i32.add (local.get $out_ptr) (local.get $i))
                  (i32.add (i32.const 1) (i32.load8_u (i32.add (local.get $in_ptr) (local.get $i)))))
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $loop)))
            (local.get $in_len)))
    "#;

    fn test_limits() -> ComputeLimits {
        ComputeLimits {
            max_wasm_bytes: 64 * 1024,
            max_input_bytes: 4096,
            max_output_bytes: 4096,
            memory_limit_bytes: 256 * 1024,
            fuel_limit: 10_000_000,
            timeout_secs: 5,
        }
    }

    #[test]
    fn request_does_not_execute_and_appears_in_pending_list() {
        let queue = ApprovalQueue::new();
        let id = queue.request("laptop-2", Some("dev-1".to_string()), "increment bytes", b"wasm-bytes-stub".to_vec(), b"hello".to_vec()).unwrap();
        let pending = queue.list();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, id);
        assert_eq!(pending[0].from_device_name, "laptop-2");
        assert_eq!(pending[0].from_device_id.as_deref(), Some("dev-1"));
        assert_eq!(pending[0].task_name, "increment bytes");
        assert_eq!(pending[0].input_len, 5);
    }

    #[test]
    fn approve_removes_from_queue_and_hands_back_the_real_payload_for_execution() {
        let queue = ApprovalQueue::new();
        let id = queue.request("laptop-2", None, "task", WAT_INCREMENT.as_bytes().to_vec(), b"hello".to_vec()).unwrap();
        let entry = queue.take_for_approval(&id).expect("should approve the queued entry");
        assert_eq!(entry.input, b"hello");
        assert_eq!(entry.wasm, WAT_INCREMENT.as_bytes());
        // 承認後はキューから消えている(二重承認できないことの実証)。
        assert!(queue.take_for_approval(&id).is_err());
        assert_eq!(queue.list().len(), 0);
    }

    #[test]
    fn approve_then_execute_actually_runs_via_the_existing_phase2_sandbox() {
        // 「承認したら実際にタスクが進行できる」ことを、既存Phase 2の
        // run_wasm_blocking(サブプロセス隔離の内側で最終的に呼ばれるのと
        // 同じ関数)を直接呼ぶことで実証する(モックの実行系を新設しない
        // ——ユーザー指示「既存のPhase 2 WASMサンドボックスコードを
        // 再利用し、2つ目のサンドボックスを作らない」に対応)。
        let queue = ApprovalQueue::new();
        let id = queue.request("laptop-2", None, "increment bytes", WAT_INCREMENT.as_bytes().to_vec(), b"hello".to_vec()).unwrap();
        let entry = queue.take_for_approval(&id).unwrap();
        let (output, fuel_consumed) = run_wasm_blocking(&entry.wasm, &entry.input, &test_limits()).expect("approved task should actually execute");
        assert_eq!(output, vec![b'h' + 1, b'e' + 1, b'l' + 1, b'l' + 1, b'o' + 1]);
        assert!(fuel_consumed > 0);
    }

    #[test]
    fn deny_removes_from_queue_without_executing_and_reports_denial_honestly() {
        let queue = ApprovalQueue::new();
        let id = queue.request("laptop-2", None, "task", WAT_INCREMENT.as_bytes().to_vec(), b"hello".to_vec()).unwrap();
        queue.deny(&id).expect("deny should succeed for a queued entry");
        // 拒否後は実行できない(take_for_approvalが失敗する=実行経路が
        // 塞がれていることの実証)。
        assert!(queue.take_for_approval(&id).is_err());
        assert_eq!(queue.list().len(), 0);
        // 二重拒否は「見つからない」を正直に返す(黙って握りつぶさない)。
        assert!(queue.deny(&id).is_err());
    }

    #[test]
    fn approve_or_deny_unknown_id_is_reported_as_an_honest_error() {
        let queue = ApprovalQueue::new();
        assert!(queue.take_for_approval("does-not-exist").is_err());
        assert!(queue.deny("does-not-exist").is_err());
    }

    #[test]
    fn queue_rejects_requests_once_the_pending_limit_is_reached() {
        let queue = ApprovalQueue::new();
        for i in 0..50 {
            queue.request(&format!("device-{i}"), None, "task", b"w".to_vec(), b"i".to_vec()).unwrap();
        }
        let err = queue.request("one-too-many", None, "task", b"w".to_vec(), b"i".to_vec()).unwrap_err();
        assert!(err.contains("too many pending"), "got: {err}");
        assert_eq!(queue.list().len(), 50);
    }

    #[test]
    fn rejects_empty_from_device_name() {
        let queue = ApprovalQueue::new();
        let err = queue.request("", None, "task", b"w".to_vec(), b"i".to_vec()).unwrap_err();
        assert!(err.contains("from_device_name"), "got: {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 入力バイト列の各バイトを+1して出力する、最小の自己完結WASM
    /// モジュール(WATテキストで直接記述、外部importなし)。
    /// `(memory 1)`は64KiB=65536バイトの線形メモリを1ページ確保する
    /// ——既定の`max_input_bytes`(64KiB)+`max_output_bytes`(64KiB)を
    /// 賄うには実際には2ページ必要なため、このテストでは
    /// `ComputeLimits`を小さめに設定して確認する。
    const WAT_INCREMENT: &str = r#"
        (module
          (memory (export "memory") 2)
          (func (export "run") (param $in_ptr i32) (param $in_len i32) (param $out_ptr i32) (param $out_cap i32) (result i32)
            (local $i i32)
            (local.set $i (i32.const 0))
            (block $done
              (loop $loop
                (br_if $done (i32.ge_s (local.get $i) (local.get $in_len)))
                (i32.store8
                  (i32.add (local.get $out_ptr) (local.get $i))
                  (i32.add (i32.const 1) (i32.load8_u (i32.add (local.get $in_ptr) (local.get $i)))))
                (local.set $i (i32.add (local.get $i) (i32.const 1)))
                (br $loop)))
            (local.get $in_len)))
    "#;

    /// 無限ループのみを行う自己完結WASMモジュール。
    ///
    /// **重要な注記(このテストで見つかった実バグの記録)**: 当初
    /// `run_wasm_blocking`をこの関数呼び出し元プロセス〈`cargo test`の
    /// テストバイナリ自身〉から直接呼んでfuel上限が効くかを検証する
    /// テストを書いたところ、Windows上で`wasmtime`のトラップ配送
    /// (`out_of_gas`→SEHベースのlongjmpアンワインド)が`/GS`スタック
    /// 保護チェックに引っかかり、**プロセス自体が`STATUS_STACK_BUFFER_
    /// OVERRUN`でabortする**ことを実機(`cargo test --release`)で
    /// 発見した——fuel上限は「悪意あるコードを安全に止める」機構の
    /// はずが、その機構自体がクラッシュの引き金になっていた。この
    /// 発見を受け、実際のHTTP APIはこのプロセス内で直接`wasmtime`を
    /// 呼ばず、`ComputeEngine::run_isolated`が別プロセス
    /// (`--world-lab-worker`)を経由するよう設計を変更した(このファイル
    /// 上部の`run_isolated`/`run_in_worker_process`/`run_worker_main`の
    /// doc参照)——**同じプロセス内でこの定数を使ってfuel枯渇を
    /// 起こす単体テストは、上記の理由により意図的に置いていない**
    /// (テスト実行そのものがクラッシュしてしまうため)。fuel上限の
    /// 実証は、代わりに実際のサブプロセス経由の実HTTP検証
    /// (CLAUDE.md HANDOFF参照)で行った。
    #[allow(dead_code)]
    const WAT_INFINITE_LOOP: &str = r#"
        (module
          (memory (export "memory") 1)
          (func (export "run") (param i32 i32 i32 i32) (result i32)
            (loop $forever (br $forever))
            (i32.const 0)))
    "#;

    /// 何らかのimportを要求する(=セルフコンテインドでない)モジュール。
    /// instantiateの時点で拒否されることを確認するためのテスト用。
    const WAT_REQUIRES_IMPORT: &str = r#"
        (module
          (import "env" "host_fn" (func $host_fn))
          (memory (export "memory") 1)
          (func (export "run") (param i32 i32 i32 i32) (result i32) (i32.const 0)))
    "#;

    fn test_limits() -> ComputeLimits {
        ComputeLimits {
            max_wasm_bytes: 64 * 1024,
            max_input_bytes: 4096,
            max_output_bytes: 4096,
            memory_limit_bytes: 256 * 1024,
            fuel_limit: 10_000_000,
            timeout_secs: 5,
        }
    }

    #[test]
    fn runs_self_contained_module_and_returns_transformed_output() {
        let input = b"hello";
        let (output, fuel_consumed) = run_wasm_blocking(WAT_INCREMENT.as_bytes(), input, &test_limits()).expect("should run successfully");
        assert_eq!(output, vec![b'h' + 1, b'e' + 1, b'l' + 1, b'l' + 1, b'o' + 1]);
        assert!(fuel_consumed > 0, "fuel_consumed should be nonzero for a module that actually did work");
    }

    #[test]
    fn rejects_module_that_requires_imports() {
        let err = run_wasm_blocking(WAT_REQUIRES_IMPORT.as_bytes(), b"", &test_limits()).unwrap_err();
        assert!(err.contains("self-contained"), "error should explain that imports are not allowed, got: {err}");
    }

    // `infinite_loop_is_stopped_by_fuel_limit`という単体テストは意図的に
    // 置いていない——上記`WAT_INFINITE_LOOP`のdoc参照。fuel上限自体は
    // `run_isolated`(サブプロセス隔離)経由の実HTTP検証で確認済み。

    /// **根本原因調査の記録(2026-08-24、ユーザー指示「root cause
    /// 追跡」への対応)**。このテストは`#[ignore]`により通常の
    /// `cargo test`では実行されない(実行すればプロセスごとabortする
    /// ため)——将来この問題が解消したか手動で再確認するためだけに
    /// 残してある(`cargo test -- --ignored
    /// world_lab::tests::repro_in_process_fuel_exhaustion_crash`)。
    ///
    /// **調査結果**: (1) Web検索で調べた限り、`STATUS_STACK_BUFFER_
    /// OVERRUN`(/GSスタック保護チェック失敗)がlongjmp系の非標準的な
    /// 制御移行と組み合わさって発生する事例は他のプロジェクト
    /// (unicorn-engineエミュレータ)でも報告されており、Windows
    /// Control Flow Guard(CFG)有効時に典型的に起きるパターンだと
    /// 判明した。ただし本プロジェクトのビルドではCFGを有効化する
    /// rustcフラグ(`-Z control-flow-guard`、nightly限定・既定無効)を
    /// 一切指定していないため、CFGそのものが直接の原因である可能性は
    /// 低いと判断した。(2) **`wasmtime`を21.0.2→27.0.0へ一時的に
    /// 引き上げて同じ手順で再現実験を行ったところ、全く同じ
    /// `STATUS_STACK_BUFFER_OVERRUN`が再現した**——つまり特定バージョン
    /// の既知バグではなく、この開発環境(Windows、rustc 1.96、MSVC
    /// ツールチェイン)での`wasmtime`のfuel枯渇トラップ配送
    /// (`wasmtime_longjmp`によるSEHベースの非標準アンワインド)に
    /// より一般的な相性問題があると考えられる。実験後、`wasmtime`は
    /// 21.0.2へ戻した(バージョンアップによる恩恵が無く、既存の
    /// 21.0.2での動作実績〈本ファイルの他のテスト・実HTTP検証〉を
    /// 変える理由が無いため)。
    ///
    /// **正直な開示・追跡しきれなかった部分**: `wasmtime`本体の
    /// ソースコードレベルでのデバッグ(Windows x64の unwind情報
    /// 〈.pdataテーブル〉がJIT生成コードに対して正しく登録されているか
    /// 等)までは行っていない——専用のデバッガ・`wasmtime`内部への
    /// 深い調査が必要で、今回のセッションのスコープを超えると判断した。
    /// **この根本原因が未解明のままでも、`ComputeEngine::run_isolated`
    /// によるサブプロセス隔離という対策自体は有効であり続ける**
    /// (`wasmtime`側のバグかどうかに関わらず、プロセス境界による
    /// 被害局所化は独立して機能する設計のため)。
    #[test]
    #[ignore = "process-crashing repro — see doc comment; run manually with `cargo test -- --ignored` only"]
    fn repro_in_process_fuel_exhaustion_crash() {
        let mut limits = test_limits();
        limits.fuel_limit = 1_000_000;
        let _ = run_wasm_blocking(WAT_INFINITE_LOOP.as_bytes(), b"", &limits);
    }

    #[test]
    fn rejects_wasm_module_larger_than_limit() {
        let mut limits = test_limits();
        limits.max_wasm_bytes = 4; // WATソースは必ずこれより長いので確実に弾かれる
        let err = run_wasm_blocking(WAT_INCREMENT.as_bytes(), b"", &limits).unwrap_err();
        assert!(err.contains("too large"), "error should mention size limit, got: {err}");
    }

    #[test]
    fn rejects_input_larger_than_limit() {
        let mut limits = test_limits();
        limits.max_input_bytes = 2;
        let err = run_wasm_blocking(WAT_INCREMENT.as_bytes(), b"abc", &limits).unwrap_err();
        assert!(err.contains("input too large"), "error should mention input size limit, got: {err}");
    }

    #[tokio::test]
    async fn compute_engine_disabled_by_default_rejects_run() {
        std::env::remove_var("OPEN_ENGLISH_WORLD_LAB_COMPUTE_ENABLED");
        let engine = ComputeEngine::from_env();
        assert!(!engine.enabled);
        // 無効時は子プロセスを起動する前に即座にエラーを返す設計
        // (`run_isolated`のdoc参照)ため、ここでは実際に`--world-lab-worker`
        // を起動しない。
        let err = engine.run_isolated(WAT_INCREMENT.as_bytes(), b"x").await.unwrap_err();
        assert!(err.contains("disabled"), "error should say compute execution is disabled, got: {err}");
    }

    /// **多台数の同時ペアリング検証(2026-08-24追加、ユーザー指示
    /// 「複数のスマホ接続対応+複数のタブレット接続対応、複数のPC接続
    /// 対応」への対応)**。この記帳機構は元々`HashMap`ベースで台数
    /// 上限を設けていない設計だったため、新規実装というより既存設計の
    /// 検証だが、スマホ10台・タブレット5台・PC5台=計20台を実際に
    /// ペアリングし、一覧・種別内訳(`status()`の`paired_by_kind`)が
    /// いずれも正しく反映されることを確認する。
    #[test]
    fn bulk_pair_registers_all_valid_entries() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let entries = vec![
            BulkPairEntry { device_name: "office-pc-1".to_string(), connection: "lan".to_string(), kind: "pc".to_string(), capabilities: vec!["cpu".to_string()] },
            BulkPairEntry { device_name: "office-pc-2".to_string(), connection: "lan".to_string(), kind: "pc".to_string(), capabilities: vec!["cpu".to_string(), "gpu".to_string()] },
            BulkPairEntry { device_name: "meeting-tablet".to_string(), connection: "wifi".to_string(), kind: "tablet".to_string(), capabilities: vec![] },
        ];
        let results = wl.bulk_pair("test-token", &entries).unwrap();
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.ok));
        assert_eq!(wl.list_devices().unwrap().len(), 3);
    }

    #[test]
    fn bulk_pair_reports_per_entry_failures_without_aborting_the_batch() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let entries = vec![
            BulkPairEntry { device_name: "good-pc".to_string(), connection: "lan".to_string(), kind: "pc".to_string(), capabilities: vec![] },
            BulkPairEntry { device_name: "bad-kind".to_string(), connection: "lan".to_string(), kind: "toaster".to_string(), capabilities: vec![] },
        ];
        let results = wl.bulk_pair("test-token", &entries).unwrap();
        assert_eq!(results.len(), 2);
        assert!(results[0].ok && results[0].device.is_some());
        assert!(!results[1].ok && results[1].error.is_some());
        // 1件失敗しても、成功した分は実際に登録されている(全滅にしない)。
        assert_eq!(wl.list_devices().unwrap().len(), 1);
    }

    #[test]
    fn bulk_pair_rejects_wrong_token_for_every_entry() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let entries = vec![BulkPairEntry { device_name: "x".to_string(), connection: "lan".to_string(), kind: "pc".to_string(), capabilities: vec![] }];
        let results = wl.bulk_pair("wrong-token", &entries).unwrap();
        assert!(!results[0].ok);
        assert_eq!(wl.list_devices().unwrap().len(), 0);
    }

    #[test]
    fn bulk_pair_rejects_empty_and_oversized_batches() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        assert!(wl.bulk_pair("test-token", &[]).is_err());
        let too_many: Vec<BulkPairEntry> = (0..101)
            .map(|i| BulkPairEntry { device_name: format!("d{i}"), connection: "lan".to_string(), kind: "pc".to_string(), capabilities: vec![] })
            .collect();
        let err = wl.bulk_pair("test-token", &too_many).unwrap_err();
        assert!(err.contains("too many devices"), "got: {err}");
    }

    #[test]
    fn pairs_many_devices_of_mixed_kinds() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        for i in 0..10 {
            wl.pair("test-token", &format!("phone-{i}"), "wifi", "phone", &["cpu".to_string()]).unwrap();
        }
        for i in 0..5 {
            wl.pair("test-token", &format!("tablet-{i}"), "bluetooth", "tablet", &["cpu".to_string(), "gpu".to_string()]).unwrap();
        }
        for i in 0..5 {
            wl.pair("test-token", &format!("pc-{i}"), "lan", "pc", &["cpu".to_string(), "gpu".to_string(), "npu".to_string()]).unwrap();
        }
        let devices = wl.list_devices().unwrap();
        assert_eq!(devices.len(), 20);
        let status = serde_json::to_value(wl.status()).unwrap();
        assert_eq!(status["paired_device_count"], 20);
        assert_eq!(status["paired_by_kind"]["phone"], 10);
        assert_eq!(status["paired_by_kind"]["tablet"], 5);
        assert_eq!(status["paired_by_kind"]["pc"], 5);
        assert_eq!(status["paired_by_kind"]["other"], 0);
    }

    #[test]
    fn accepts_wan_as_a_connection_label() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let device = wl.pair("test-token", "remote-office-pc", "wan", "pc", &["cpu".to_string()]).unwrap();
        assert_eq!(device.connection, "wan");
    }

    #[test]
    fn status_includes_wan_disclosure() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let status = serde_json::to_value(wl.status()).unwrap();
        assert!(status["wan_disclosure_en"].as_str().unwrap().contains("TLS"));
        assert!(status["wan_disclosure_ja"].as_str().unwrap().contains("TLS"));
    }

    #[test]
    fn rejects_unknown_device_kind() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let err = wl.pair("test-token", "mystery-box", "wifi", "toaster", &[]).unwrap_err();
        assert!(err.contains("kind must be one of"), "got: {err}");
    }

    #[test]
    fn rejects_unknown_capability() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let err = wl.pair("test-token", "dev1", "wifi", "pc", &["quantum".to_string()]).unwrap_err();
        assert!(err.contains("capabilities must be a subset of"), "got: {err}");
    }

    #[test]
    fn empty_kind_falls_back_to_other_for_backward_compatibility() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let device = wl.pair("test-token", "legacy-client", "usb", "", &[]).unwrap();
        assert_eq!(device.kind, "other");
    }

    #[test]
    fn deduplicates_repeated_capabilities() {
        let wl = WorldLab::new_enabled_for_test("test-token");
        let device = wl.pair("test-token", "dev1", "wifi", "pc", &["cpu".to_string(), "cpu".to_string(), "gpu".to_string()]).unwrap();
        assert_eq!(device.capabilities, vec!["cpu".to_string(), "gpu".to_string()]);
    }
}
