package tokyo.runo.openenglish

/**
 * 「余ったスマホ・タブレット・PCをUSB/Wi-Fi/Bluetooth/LANのいずれか、
 * もしくは複数同時接続で計算リソースとして繋げる」という要望
 * (2026-08-19ユーザー指示)に対する、通信経路の抽象化レイヤー。
 *
 * ## 現状の実装範囲(正直な開示、最重要)
 * このインターフェース自体は複数トランスポートを見据えた設計だが、
 * **実際に動く実装は[HttpTransport]([PhoneAccelWorker]が使うHTTP
 * ポーリング経路)の1つだけ**。他の2つ([UsbAccessoryTransport]・
 * [BluetoothClassicTransport])は「将来実装するならこういう形になる」
 * という設計スタブであり、呼び出すと[NotImplementedError]を投げる
 * ——動くふりのコードは書かない、という開発方針に基づく。
 *
 * ## なぜ今回HTTPのみを実装し、USB/Bluetoothは設計止まりにしたか
 * - **USB Accessory Mode**(`android.hardware.usb.accessory`): Android側は
 *   通常のアプリでもホストモード無しでアクセサリ通信ができるが、
 *   PC側にも同じUSBアクセサリプロトコル(Android Open Accessory、AOA)を
 *   実装したドライバ/常駐プログラムが必要になる。この開発環境には
 *   実機のAndroid端末・USBケーブル経由でPCと通信する検証手段が無く、
 *   PC側(`server/`、Rust)にAOAホスト実装を追加しても実機で1バイトも
 *   検証できない——「実装した」と主張することが「動くふりのコードを
 *   書かない」という方針に反するため、今回は見送った。
 * - **Bluetooth Classic/BLE**: ペアリング・RFCOMMソケット通信自体は
 *   Android標準APIで実装可能だが、(a) 実機Bluetoothアダプタでの
 *   ペアリングフロー(`BluetoothDevice.createBond()`のUI導線を含む)の
 *   検証ができない、(b) タスクのペイロード(埋め込みベクトル、384次元
 *   float=1.5KB程度)自体は小さくBluetooth Classicの帯域(~1-3Mbps)でも
 *   問題にならない見込みだが、SPP(Serial Port Profile)の実機ペアリング
 *   なしにこの見込みを検証する手段が無い。
 * - 上記いずれも、次に実機Android端末・実機Bluetooth環境が用意できた
 *   時点で、この[Transport]インターフェースへ実装を追加するだけで
 *   [PhoneAccelWorker]側のロジック変更なしに接続経路を増やせるよう、
 *   抽象化だけは先に用意しておく。
 *
 * ## 複数同時接続について
 * [PhoneAccelWorker]は2026-08-19の拡張で、カンマ区切りで複数のPC/
 * ホスト側URLを受け取り、**それぞれ独立したポーリングループ**として
 * 並行実行するようになった(`multiHostBaseUrls`引数)。これは
 * [HttpTransport]の複数インスタンスを同時稼働させているのと等価——
 * 「複数の余剰スマホを様々な経路で繋げる」という要望のうち、
 * 「同じ経路(HTTP/Wi-Fi・LAN)で複数台を同時に使う」部分は実際に動く
 * 形で実装されている。「異なる経路を同時に使う」(例: このスマホは
 * USB、あのスマホはBluetooth)は、上記の理由によりUSB/Bluetooth自体が
 * 未実装のため、今回は実現していない。
 */
interface Transport {
    /** この経路の人間向けラベル(ログ・UI表示用)。 */
    val label: String

    /** この経路が現在の端末・環境で実際に利用可能か。 */
    fun isAvailable(): Boolean
}

/**
 * 実装済みの唯一の経路。[PhoneAccelWorker]が`HttpURLConnection`で
 * PC/ホスト側の`GET /v1/background-fold/task`・
 * `POST /v1/background-fold/task-result`をポーリングする(WiFi/LAN、
 * またはUSBテザリング/`adb forward`経由でも同じくHTTPとして到達可能)。
 */
class HttpTransport(private val baseUrl: String) : Transport {
    override val label: String = "HTTP ($baseUrl)"
    override fun isAvailable(): Boolean = baseUrl.isNotBlank()
}

/**
 * 設計スタブ(未実装)。USB Accessory Mode経由の通信を将来実装する場合の
 * 置き場所——PC側に対応するAOAホスト実装が用意でき、かつ実機で検証
 * できる状況になるまでは呼び出さないこと。
 */
class UsbAccessoryTransport : Transport {
    override val label: String = "USB Accessory Mode (design only, not implemented)"
    override fun isAvailable(): Boolean = false

    fun connect(): Nothing = throw NotImplementedError(
        "USB Accessory Modeは設計のみで未実装(PC側AOAホスト実装+実機USB " +
            "検証環境がこの開発環境に無いため、Transport.ktのdoc参照)。" +
            "USB Accessory Mode is design-only and not implemented " +
            "(no PC-side AOA host implementation or real USB test rig " +
            "available in this dev environment)."
    )
}

/**
 * 設計スタブ(未実装)。Bluetooth Classic SPP経由の通信を将来実装する
 * 場合の置き場所。軽量タスク(コサイン類似度計算程度)のみに絞る前提。
 */
class BluetoothClassicTransport : Transport {
    override val label: String = "Bluetooth Classic SPP (design only, not implemented)"
    override fun isAvailable(): Boolean = false

    fun connect(): Nothing = throw NotImplementedError(
        "Bluetooth Classic SPPは設計のみで未実装(実機ペアリング検証環境が" +
            "この開発環境に無いため、Transport.ktのdoc参照)。" +
            "Bluetooth Classic SPP is design-only and not implemented " +
            "(no real pairing/test environment available here)."
    )
}
