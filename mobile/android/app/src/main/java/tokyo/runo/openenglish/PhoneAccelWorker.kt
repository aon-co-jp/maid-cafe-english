package tokyo.runo.openenglish

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.sqrt

/**
 * PC側(`aruaru-llm`)が新設した`GET /v1/background-fold/task`・
 * `POST /v1/background-fold/task-result`をポーリングし、受け取った軽量な
 * 数値計算タスク(2本のベクトルのコサイン類似度)をこの端末上で実行して
 * 結果を送り返すワーカー(2026-08-19新設、ユーザー指示「使わなくなった
 * スマホもフル動員…USBで接続すると、そのスマホのCPU・GPU・NPUを
 * モデル圧縮の計算に活用できます」への対応の第一歩)。
 *
 * ## 通信経路の設計判断(正直な開示)
 * 実機のAndroid端末・USB接続環境がこの開発環境に無いため、`adb forward`
 * によるUSB経由のポートフォワーディングを実際に構築・検証することは
 * できなかった。そのため、通信経路自体は最も単純な「単純にHTTP経由で
 * PCのIP:ポートへポーリングする」方式を選んだ(既存の`MainActivity`が
 * 内蔵サーバーへ`http://127.0.0.1:<port>/`でアクセスするのと同じ
 * `HttpURLConnection`ベースの実装パターンを流用)。実運用時は利用者が
 * (a) `adb forward tcp:4600 tcp:4600`を実行してUSB経由でPCの
 * `aruaru-llm`(既定ポート4600)へアクセスできるようにする、または
 * (b) USBテザリング/同一Wi-Fi経由でPCのIPアドレスへ直接アクセスする、
 * のいずれかを選べる——`pcBaseUrl`を設定可能にしているのはこのため。
 * 本ワーカー自体はどちらの経路で到達可能になっていても同じ動作をする
 * (`adb forward`後は`http://127.0.0.1:4600/`、Wi-Fi/テザリングでは
 * `http://<PCのIP>:4600/`を指定する)。
 *
 * ## NNAPI(NPU/GPU)対応について(正直な開示、最重要)
 * TensorFlow Lite NNAPI Delegate(`org.tensorflow:tensorflow-lite`+
 * `tensorflow-lite-support`)をGradle依存に追加し、起動時に
 * `NnApiDelegate`の構築を試みることで、この端末がNNAPI
 * (`android.hardware.neuralnetworks`、NPU/GPU/DSPへのオフロード窓口)を
 * サポートしているかどうかを実際に検出する。しかし、コサイン類似度
 * 計算のような任意長ベクトルの内積を行う`.tflite`モデル自体を
 * (a) 事前にビルド・同梱するか、(b) 実行時にFlatBuffer形式で動的構築
 * する必要があり、いずれもこの開発環境には実機のNPU搭載端末・検証手段が
 * 無いため「正しく動く`.tflite`モデルを実際に検証した上で同梱する」
 * ところまでは実施できなかった。そのため、**実際の計算(内積・コサイン
 * 類似度そのもの)は常にCPU(Kotlin標準の`FloatArray`計算)で行い、
 * NNAPI Delegateは「この端末でNPU/GPUオフロードが利用可能かどうかを
 * 検出してログに残す」用途に限定している**——「NPUを使って計算した」と
 * 偽ることは避け、「NPUが利用可能なら検出・記録するが、実際の計算
 * オフロードは今回のスコープでは実装できなかった」という限界を正直に
 * 開示する設計にした。`nnapiAvailable`フィールドをタスク結果の
 * `device_label`に含め、PC側のログからも実際にどちらの経路で計算
 * されたかが分かるようにしている。
 */
class PhoneAccelWorker(
    private val pcBaseUrl: String,
    private val onLog: (String) -> Unit = {},
) {
    private var job: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    /** 起動時に一度だけ判定し、以降はキャッシュする(端末構成が実行中に変わることは無い前提)。 */
    val nnapiAvailable: Boolean by lazy { detectNnApiAvailability() }

    private fun detectNnApiAvailability(): Boolean {
        return try {
            // NnApiDelegateのコンストラクタは、この端末がNNAPI自体を
            // サポートしていない場合(古い端末・API 27未満相当)に例外を
            // 投げることがある。成功すればこの端末はNNAPI経由でNPU/GPU/
            // DSPへオフロードできる可能性がある、という検出結果のみを
            // 意味する(上記クラスdocの通り、実際の計算オフロードは
            // 未実装)。
            val delegate = org.tensorflow.lite.nnapi.NnApiDelegate()
            delegate.close()
            true
        } catch (e: Throwable) {
            Log.i(TAG, "NNAPI delegate not available on this device, falling back to CPU: ${e.message}")
            false
        }
    }

    /** ポーリングループを開始する。既に稼働中なら何もしない。 */
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            onLog(
                if (nnapiAvailable) {
                    "NNAPI detected (NPU/GPU offload may be available on this device), but actual computation still runs on CPU in this version. / " +
                        "このデバイスでNNAPIを検出しました(NPU/GPUオフロードが利用可能な可能性があります)が、" +
                        "本バージョンでは実際の計算は引き続きCPUで行います。"
                } else {
                    "NNAPI not available on this device; computing on CPU. / このデバイスではNNAPIが利用できないため、CPUで計算します。"
                }
            )
            while (isActive) {
                try {
                    val task = fetchTask()
                    if (task != null) {
                        val (taskId, vecA, vecB) = task
                        val similarity = cosineSimilarity(vecA, vecB)
                        submitResult(taskId, similarity)
                        onLog("Computed task #$taskId: similarity=$similarity (nnapiAvailable=$nnapiAvailable) / タスク#${taskId}を計算しました: 類似度=$similarity")
                    }
                } catch (e: Exception) {
                    onLog("Phone accel worker error (will retry): ${e.message} / スマホ計算ワーカーでエラー(再試行します): ${e.message}")
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private data class Task(val taskId: Long, val vecA: FloatArray, val vecB: FloatArray)

    private suspend fun fetchTask(): Task? = withContext(Dispatchers.IO) {
        val url = URL("$pcBaseUrl/v1/background-fold/task")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        try {
            if (conn.responseCode != 200) return@withContext null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val taskId = json.optLong("task_id", -1L)
            if (taskId < 0) return@withContext null
            val vecA = jsonArrayToFloatArray(json.getJSONArray("vec_a"))
            val vecB = jsonArrayToFloatArray(json.getJSONArray("vec_b"))
            Task(taskId, vecA, vecB)
        } finally {
            conn.disconnect()
        }
    }

    private suspend fun submitResult(taskId: Long, similarity: Float) = withContext(Dispatchers.IO) {
        val url = URL("$pcBaseUrl/v1/background-fold/task-result")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        val payload = JSONObject().apply {
            put("task_id", taskId)
            put("similarity", similarity.toDouble())
            put("device_label", "android-phone-accel-worker(nnapiAvailable=$nnapiAvailable)")
        }
        try {
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }

    private fun jsonArrayToFloatArray(arr: JSONArray): FloatArray {
        val out = FloatArray(arr.length())
        for (i in 0 until arr.length()) {
            out[i] = arr.getDouble(i).toFloat()
        }
        return out
    }

    /**
     * コサイン類似度計算(常にCPU、Kotlin標準の`FloatArray`)。
     * NNAPI経由での実行は上記クラスdocの通り今回は未実装。
     */
    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.isEmpty() || b.isEmpty() || a.size != b.size) return 0f
        var dot = 0f
        var normA = 0f
        var normB = 0f
        for (i in a.indices) {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        val denom = sqrt(normA) * sqrt(normB)
        return if (denom == 0f) 0f else dot / denom
    }

    companion object {
        private const val TAG = "PhoneAccelWorker"
        private const val POLL_INTERVAL_MS = 5_000L
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 8_000
    }
}
