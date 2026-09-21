package tokyo.runo.openenglish

import android.util.Log
import com.google.flatbuffers.FlatBufferBuilder
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * NNAPI(NPU/GPU/DSP)へ委譲するベクトル計算カーネル(2026-09-21新設、ユーザー指示
 * 「スマホ版のNPUがあれば、計算やハードウェアアクセラレーターにも使用して」への対応)。
 *
 * コサイン類似度の重い部分(内積 a·b と二乗和 a·a、b·b)を、長さNのベクトルに対して
 * `MUL`→`SUM`(リダクション)だけで構成した小さなTFLiteモデルとして**実行時に組み立て**
 * (`.tflite`ファイルの同梱は不要、Nは任意)、`NnApiDelegate`付きの`Interpreter`で実行する。
 * 最後の`sqrt`と割り算(スカラー3個)だけCPUで行う。
 *
 * ## 正直な開示
 * - どのハードウェア(NPU/GPU/DSP/CPU)で実際に走るかは**NNAPIランタイムが決める**。JavaからはそのAPIが
 *   無いため、こちらから「NPUで走った」とは断定しない。代わりに(1)NNAPIへ委譲できたか、(2)CPU計算との
 *   数値一致、(3)NNAPI対CPUの実測時間、を記録して報告する。
 * - まずFP32、次にFP16許可(多くのNPUはFP32を扱えないため)の順に試し、CPUと数値が許容内で一致し、かつ
 *   CPUより速い方式だけを採用する(`selectBest`)。どちらも満たさなければCPU計算へ戻す。
 * - NNAPIが加速器を持たない端末(エミュレータ等)では、`allowNnapiCpuReference=false`だと
 *   委譲先が無くTFLiteのCPUカーネルで実行される(その場合も結果は正しい)。
 */
class NnapiVectorKernel private constructor(
    private val interpreter: Interpreter,
    private val delegate: NnApiDelegate?,
    val length: Int,
    /** NNAPIデリゲートを構築でき、インタプリタへ取り付けられたか(実行先ハードウェアの断定ではない)。 */
    val nnapiDelegateAttached: Boolean,
) : AutoCloseable {

    private val inA = ByteBuffer.allocateDirect(length * 4).order(ByteOrder.nativeOrder())
    private val inB = ByteBuffer.allocateDirect(length * 4).order(ByteOrder.nativeOrder())
    private val outDot = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder())
    private val outAa = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder())
    private val outBb = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder())

    /** [a·b, a·a, b·b] を返す。 */
    fun dotAndNorms(a: FloatArray, b: FloatArray): FloatArray {
        require(a.size == length && b.size == length) { "vector length mismatch: expected $length" }
        inA.clear(); inA.asFloatBuffer().put(a)
        inB.clear(); inB.asFloatBuffer().put(b)
        outDot.clear(); outAa.clear(); outBb.clear()
        val outputs = HashMap<Int, Any>()
        outputs[0] = outDot
        outputs[1] = outAa
        outputs[2] = outBb
        interpreter.runForMultipleInputsOutputs(arrayOf<Any>(inA, inB), outputs)
        return floatArrayOf(outDot.getFloat(0), outAa.getFloat(0), outBb.getFloat(0))
    }

    fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        val r = dotAndNorms(a, b)
        val denom = sqrt(r[1]) * sqrt(r[2])
        return if (denom == 0f) 0f else r[0] / denom
    }

    override fun close() {
        try { interpreter.close() } catch (_: Throwable) {}
        try { delegate?.close() } catch (_: Throwable) {}
    }

    /** 自己診断の結果(実機/エミュレータでの検証・ログ用)。 */
    data class SelfTestResult(
        val ok: Boolean,
        val nnapiDelegateAttached: Boolean,
        val maxRelativeError: Double,
        val nnapiMillisPerRun: Double,
        val cpuMillisPerRun: Double,
        val detail: String,
    )

    companion object {
        private const val TAG = "NnapiVectorKernel"

        // TFLiteスキーマの定数(schema.fbs): TensorType.FLOAT32=0/INT32=2、BuiltinOperator.MUL=18/SUM=74。
        private const val TYPE_FLOAT32 = 0
        private const val TYPE_INT32 = 2
        private const val OP_MUL = 18
        private const val OP_SUM = 74

        /**
         * NNAPI付きのカーネルを作る。作れなければ(NNAPI非対応・モデル拒否等)nullを返し、呼び出し側はCPU計算を使う。
         * @param allowNnapiCpuReference trueなら加速器の無い端末でもNNAPIの参照CPU実装へ委譲する(検証用)。
         * @param allowFp16 trueならNNAPIランタイムがFP32をFP16で計算してよい(多くのNPUはFP16以下しか扱えないため、NPU利用には必要)。
         */
        fun create(length: Int, allowNnapiCpuReference: Boolean = false, allowFp16: Boolean = false): NnapiVectorKernel? {
            if (length <= 0) return null
            var delegate: NnApiDelegate? = null
            return try {
                val opts = NnApiDelegate.Options()
                    .setExecutionPreference(NnApiDelegate.Options.EXECUTION_PREFERENCE_SUSTAINED_SPEED)
                    .setAllowFp16(allowFp16)
                    .setUseNnapiCpu(allowNnapiCpuReference)
                delegate = NnApiDelegate(opts)
                val model = buildModel(length)
                val interp = Interpreter(model, Interpreter.Options().addDelegate(delegate))
                NnapiVectorKernel(interp, delegate, length, true)
            } catch (t: Throwable) {
                Log.i(TAG, "NNAPI kernel unavailable (n=$length): ${t.message}")
                try { delegate?.close() } catch (_: Throwable) {}
                null
            }
        }

        /** CPU参照実装(数値照合と、NNAPI非対応時のフォールバック用)。 */
        fun cpuDotAndNorms(a: FloatArray, b: FloatArray): FloatArray {
            var dot = 0.0
            var aa = 0.0
            var bb = 0.0
            for (i in a.indices) {
                dot += a[i].toDouble() * b[i]
                aa += a[i].toDouble() * a[i]
                bb += b[i].toDouble() * b[i]
            }
            return floatArrayOf(dot.toFloat(), aa.toFloat(), bb.toFloat())
        }

        /**
         * NNAPI版とCPU版の数値照合+速度計測。許容誤差(相対1e-3)を超えたらok=falseで、
         * 呼び出し側はこのカーネルを使わない。
         */
        fun selfTest(length: Int = 1024, allowNnapiCpuReference: Boolean = false, runs: Int = 200, allowFp16: Boolean = false): SelfTestResult {
            val kernel = create(length, allowNnapiCpuReference, allowFp16)
                ?: return SelfTestResult(false, false, Double.NaN, 0.0, 0.0, "NNAPI kernel could not be created; using CPU")
            kernel.use { k ->
                val rnd = java.util.Random(42)
                val a = FloatArray(length) { rnd.nextGaussian().toFloat() }
                val b = FloatArray(length) { rnd.nextGaussian().toFloat() }
                val ref = cpuDotAndNorms(a, b)
                val got = k.dotAndNorms(a, b)
                // 誤差の尺度: 二乗和は相対誤差、内積は0付近で相対誤差が暴れるため sqrt(a·a × b·b) で正規化する。
                val scale = sqrt(ref[1].toDouble() * ref[2].toDouble()) + 1e-9
                val errDot = abs((got[0] - ref[0]).toDouble()) / scale
                val errAa = abs((got[1] - ref[1]).toDouble()) / (abs(ref[1].toDouble()) + 1e-9)
                val errBb = abs((got[2] - ref[2]).toDouble()) / (abs(ref[2].toDouble()) + 1e-9)
                val maxRel = maxOf(errDot, errAa, errBb)
                for (i in 0 until 5) k.dotAndNorms(a, b) // ウォームアップ
                val t0 = System.nanoTime()
                for (i in 0 until runs) k.dotAndNorms(a, b)
                val nnapiMs = (System.nanoTime() - t0) / 1e6 / runs
                var sink = 0f
                for (i in 0 until 30) sink += cpuDotAndNorms(a, b)[0] // CPU側もウォームアップ(JIT)して公平に比べる
                val t1 = System.nanoTime()
                for (i in 0 until runs) sink += cpuDotAndNorms(a, b)[0]
                val cpuMs = (System.nanoTime() - t1) / 1e6 / runs
                val ok = maxRel < 1e-3
                val detail = "n=$length maxRelErr=$maxRel nnapi=${"%.4f".format(nnapiMs)}ms cpu=${"%.4f".format(cpuMs)}ms (sink=$sink)"
                Log.i(TAG, "selfTest ok=$ok $detail")
                return SelfTestResult(ok, k.nnapiDelegateAttached, maxRel, nnapiMs, cpuMs, detail)
            }
        }

        /** 最良カーネルの選択結果。kernelがnullならCPU計算を使う。 */
        data class Selection(val kernel: NnapiVectorKernel?, val label: String, val detail: String)

        /**
         * FP32→FP16許可の順にNNAPIカーネルを試し、(1)CPUと数値が許容内で一致し、(2)CPUより速いものだけを採用する。
         * どれも条件を満たさなければkernel=null(CPU計算)。NPUを使えたと断定はせず、実測の事実だけをlabel/detailに残す。
         */
        fun selectBest(length: Int, allowNnapiCpuReference: Boolean = false): Selection {
            val notes = StringBuilder()
            for (fp16 in booleanArrayOf(false, true)) {
                val tag = if (fp16) "nnapi-fp16" else "nnapi-fp32"
                val r = selfTest(length, allowNnapiCpuReference, runs = 60, allowFp16 = fp16)
                notes.append("$tag: ok=${r.ok} ${r.detail}; ")
                if (r.nnapiDelegateAttached && r.ok && r.nnapiMillisPerRun < r.cpuMillisPerRun) {
                    val k = create(length, allowNnapiCpuReference, fp16)
                    if (k != null) return Selection(k, tag, notes.toString())
                }
            }
            return Selection(null, "cpu", notes.toString())
        }

        // ---- TFLite FlatBufferモデルの組み立て ----

        internal fun intVector(fb: FlatBufferBuilder, values: IntArray): Int {
            fb.startVector(4, values.size, 4)
            for (i in values.indices.reversed()) fb.addInt(values[i])
            return fb.endVector()
        }

        internal fun tensor(fb: FlatBufferBuilder, shape: IntArray, type: Int, buffer: Int, name: String): Int {
            val shapeOff = intVector(fb, shape)
            val nameOff = fb.createString(name)
            fb.startTable(6)
            fb.addOffset(0, shapeOff, 0)
            fb.addByte(1, type.toByte(), 0)
            fb.addInt(2, buffer, 0)
            fb.addOffset(3, nameOff, 0)
            return fb.endTable()
        }

        internal fun operator(fb: FlatBufferBuilder, opcodeIndex: Int, inputs: IntArray, outputs: IntArray): Int {
            val inOff = intVector(fb, inputs)
            val outOff = intVector(fb, outputs)
            fb.startTable(5)
            fb.addInt(0, opcodeIndex, 0)
            fb.addOffset(1, inOff, 0)
            fb.addOffset(2, outOff, 0)
            // builtin_options は省略(MULは活性化なし、SUMはkeep_dims=falseが既定)。
            return fb.endTable()
        }

        internal fun operatorCode(fb: FlatBufferBuilder, builtinCode: Int): Int {
            fb.startTable(4)
            fb.addByte(0, builtinCode.coerceAtMost(127).toByte(), 0) // deprecated_builtin_code
            fb.addInt(2, 1, 0) // version
            fb.addInt(3, builtinCode, 0) // builtin_code
            return fb.endTable()
        }

        internal fun <T> tableVector(fb: FlatBufferBuilder, offsets: List<Int>): Int {
            fb.startVector(4, offsets.size, 4)
            for (i in offsets.indices.reversed()) fb.addOffset(offsets[i])
            return fb.endVector()
        }

        /**
         * a[1,N], b[1,N] → dot=SUM(a*b), aa=SUM(a*a), bb=SUM(b*b) (各[1])。
         * テンソル: 0=a 1=b 2=axis(定数1) 3=a*b 4=a*a 5=b*b 6=dot 7=aa 8=bb
         */
        internal fun buildModel(n: Int): ByteBuffer {
            val fb = FlatBufferBuilder(1024)
            val vecShape = intArrayOf(1, n)
            val scalarShape = intArrayOf(1)

            val tensors = listOf(
                tensor(fb, vecShape, TYPE_FLOAT32, 0, "a"),
                tensor(fb, vecShape, TYPE_FLOAT32, 0, "b"),
                tensor(fb, intArrayOf(1), TYPE_INT32, 1, "axis"),
                tensor(fb, vecShape, TYPE_FLOAT32, 0, "ab"),
                tensor(fb, vecShape, TYPE_FLOAT32, 0, "aa_elem"),
                tensor(fb, vecShape, TYPE_FLOAT32, 0, "bb_elem"),
                tensor(fb, scalarShape, TYPE_FLOAT32, 0, "dot"),
                tensor(fb, scalarShape, TYPE_FLOAT32, 0, "aa"),
                tensor(fb, scalarShape, TYPE_FLOAT32, 0, "bb"),
            )
            val ops = listOf(
                operator(fb, 0, intArrayOf(0, 1), intArrayOf(3)),
                operator(fb, 0, intArrayOf(0, 0), intArrayOf(4)),
                operator(fb, 0, intArrayOf(1, 1), intArrayOf(5)),
                operator(fb, 1, intArrayOf(3, 2), intArrayOf(6)),
                operator(fb, 1, intArrayOf(4, 2), intArrayOf(7)),
                operator(fb, 1, intArrayOf(5, 2), intArrayOf(8)),
            )
            val tensorsVec = tableVector<Int>(fb, tensors)
            val opsVec = tableVector<Int>(fb, ops)
            val inputsVec = intVector(fb, intArrayOf(0, 1))
            val outputsVec = intVector(fb, intArrayOf(6, 7, 8))
            val nameOff = fb.createString("cosine_parts")
            fb.startTable(5)
            fb.addOffset(0, tensorsVec, 0)
            fb.addOffset(1, inputsVec, 0)
            fb.addOffset(2, outputsVec, 0)
            fb.addOffset(3, opsVec, 0)
            fb.addOffset(4, nameOff, 0)
            val subgraph = fb.endTable()
            val subgraphsVec = tableVector<Int>(fb, listOf(subgraph))

            val codes = listOf(operatorCode(fb, OP_MUL), operatorCode(fb, OP_SUM))
            val codesVec = tableVector<Int>(fb, codes)

            // buffers: 0=空, 1=axis定数(int32 = 1)
            val emptyBufferData = fb.createByteVector(ByteArray(0))
            fb.startTable(1)
            fb.addOffset(0, emptyBufferData, 0)
            val buf0 = fb.endTable()
            val axisBytes = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(1).array()
            val axisData = fb.createByteVector(axisBytes)
            fb.startTable(1)
            fb.addOffset(0, axisData, 0)
            val buf1 = fb.endTable()
            val buffersVec = tableVector<Int>(fb, listOf(buf0, buf1))

            val desc = fb.createString("open-english cosine parts (NNAPI)")
            fb.startTable(5)
            fb.addInt(0, 3, 0) // version
            fb.addOffset(1, codesVec, 0)
            fb.addOffset(2, subgraphsVec, 0)
            fb.addOffset(3, desc, 0)
            fb.addOffset(4, buffersVec, 0)
            val model = fb.endTable()
            fb.finish(model, "TFL3")

            val bytes = fb.sizedByteArray()
            val direct = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
            direct.put(bytes)
            direct.rewind()
            return direct
        }
    }
}
