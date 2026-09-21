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
 * ## NNAPI(NPU/GPU/DSP)対応について(正直な開示、2026-09-21更新)
 * 内積・二乗和の重い計算は、`NnapiVectorKernel`が実行時に組み立てた小さなTFLiteモデルとしてNNAPIへ委譲する
 * (ベクトル長ごとに1回、FP32→FP16許可の順に試し、CPUと数値が一致しCPUより速い方式だけを採用。
 * 条件を満たさなければ従来どおりCPU計算)。**どのハードウェア(NPU/GPU/DSP/CPU)で実行されるかはNNAPI
 * ランタイムが決める**ため、「NPUで走った」とは断定せず、採用方式・実測時間・数値誤差を`device_label`と
 * ログに残す。エミュレータ(NPU無し)ではNNAPI参照CPU実装での動作確認まで行い、実機NPUでの速度は端末依存。
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

    /** ベクトル長ごとの採用方式(1回だけ選ぶ)。kernelがnullならCPU。 */
    private val selections = HashMap<Int, NnapiVectorKernel.Companion.Selection>()

    private fun selectionFor(n: Int): NnapiVectorKernel.Companion.Selection = synchronized(selections) {
        selections.getOrPut(n) {
            val sel = if (nnapiAvailable) NnapiVectorKernel.selectBest(n) else NnapiVectorKernel.Companion.Selection(null, "cpu", "NNAPI not available")
            onLog("Compute path for n=$n: ${sel.label} [${sel.detail}] / ベクトル長${n}の計算方式: ${sel.label}(NNAPIが選んだ実行先までは断定しません)")
            sel
        }
    }

    /** 直近に使った計算方式のラベル(結果のdevice_labelに載せる)。 */
    @Volatile private var lastPathLabel: String = "cpu"

    /** NNAPI(採用された場合)またはCPUでコサイン類似度を計算する。 */
    private fun computeCosine(a: FloatArray, b: FloatArray): Float {
        if (a.isEmpty() || a.size != b.size) return 0f
        val sel = selectionFor(a.size)
        lastPathLabel = sel.label
        val k = sel.kernel
        if (k != null) {
            try {
                return k.cosineSimilarity(a, b)
            } catch (t: Throwable) {
                Log.w(TAG, "NNAPI kernel failed at runtime, falling back to CPU: ${t.message}")
                synchronized(selections) { selections[a.size] = NnapiVectorKernel.Companion.Selection(null, "cpu(fallback)", "runtime failure") }
                try { k.close() } catch (_: Throwable) {}
            }
        }
        lastPathLabel = "cpu"
        return cosineSimilarity(a, b)
    }

    /** ポーリングループを開始する。既に稼働中なら何もしない。 */
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            onLog(
                if (nnapiAvailable) {
                    "NNAPI detected: vector math is delegated to NNAPI (NPU/GPU/DSP chosen by the runtime) when it is faster and numerically matches the CPU; otherwise CPU. / " +
                        "NNAPIを検出しました。ベクトル計算は、CPUより速く数値が一致する場合にNNAPI(NPU/GPU/DSPはランタイムが選択)へ委譲し、そうでなければCPUで計算します。"
                } else {
                    "NNAPI not available on this device; computing on CPU. / このデバイスではNNAPIが利用できないため、CPUで計算します。"
                }
            )
            while (isActive) {
                try {
                    val task = fetchTask()
                    if (task != null) {
                        val (taskId, vecA, vecB) = task
                        val similarity = computeCosine(vecA, vecB)
                        submitResult(taskId, similarity)
                        onLog("Computed task #$taskId: similarity=$similarity (path=$lastPathLabel) / タスク#${taskId}を計算しました: 類似度=$similarity")
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
        synchronized(selections) {
            selections.values.forEach { try { it.kernel?.close() } catch (_: Throwable) {} }
            selections.clear()
        }
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
            put("device_label", "android-phone-accel-worker(nnapiAvailable=$nnapiAvailable,path=$lastPathLabel)")
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

    /** CPUでのコサイン類似度(NNAPIを使えない/採用されない場合と数値照合の代替)。 */
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
