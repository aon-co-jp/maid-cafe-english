package tokyo.runo.openenglish

import android.util.Log
import com.google.flatbuffers.FlatBufferBuilder
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 「行列(コーパス)×クエリ」の内積を一括で計算するカーネル(2026-09-21新設、同日作り直し)。
 * `FULLY_CONNECTED` 1個だけのTFLiteモデルを実行時に組み立てる。重み=コーパス(M行×N列、定数)、入力=クエリ[B,N]、
 * 出力=[B,M]。
 *
 * ## 作り直しの要点(2026-09-21、ユーザー指摘「NPUが効かないのはアプリの試作品の出来が悪かった可能性」)
 * 1. **int8量子化モード**: 多くのNPU/DSPはFP32を扱えず、8ビット整数だけを高速に処理する。FP32モデルだけでは
 *    NPUへ委譲されず黙ってCPUへ落ちていた。対称量子化(zero_point=0)のint8モデルを組み立てられるようにした。
 * 2. **加速器の名前指定**: `NnapiProbe`で列挙した実在の加速器名を`setAcceleratorName`で指定し、NNAPIが黙ってCPUへ
 *    落ちる(=「NNAPIを使った」つもりが実はCPU)のを防ぐ。
 * 3. **CPU基準の見直し**: 比較相手は素朴なループではなく、NNAPIを付けない「TFLite自身のCPUカーネル」。
 *
 * どの加速器で走ったかは、名前指定した場合のみ確実(指定した加速器で実行できなければモデル構築が失敗する)。
 */
class NnapiMatVecKernel private constructor(
    private val interpreter: Interpreter,
    private val delegate: NnApiDelegate?,
    val rows: Int,
    val cols: Int,
    val batch: Int,
    /** int8モードの量子化パラメータ(nullならFP32)。 */
    private val quant: Quant?,
) : AutoCloseable {

    /** 対称量子化(zero_point=0)の入力/出力スケール。 */
    class Quant(val inScale: Float, val outScale: Float)

    private val inBuf = ByteBuffer.allocateDirect(batch * cols * (if (quant != null) 1 else 4)).order(ByteOrder.nativeOrder())
    private val outBuf = ByteBuffer.allocateDirect(batch * rows * (if (quant != null) 1 else 4)).order(ByteOrder.nativeOrder())

    val isInt8: Boolean get() = quant != null

    /** queries[batch*cols] を掛けた [batch*rows] の内積(float)を返す。int8モードでは量子化/逆量子化込み。 */
    fun multiply(queries: FloatArray): FloatArray {
        require(queries.size == batch * cols)
        inBuf.clear()
        outBuf.clear()
        if (quant == null) {
            inBuf.asFloatBuffer().put(queries)
        } else {
            for (v in queries) inBuf.put((v / quant.inScale).roundToInt().coerceIn(-127, 127).toByte())
            inBuf.rewind()
        }
        interpreter.run(inBuf, outBuf)
        val out = FloatArray(batch * rows)
        outBuf.rewind()
        if (quant == null) {
            outBuf.asFloatBuffer().get(out)
        } else {
            for (i in out.indices) out[i] = outBuf.get().toFloat() * quant.outScale
        }
        return out
    }

    override fun close() {
        try { interpreter.close() } catch (_: Throwable) {}
        try { delegate?.close() } catch (_: Throwable) {}
    }

    companion object {
        private const val TAG = "NnapiMatVecKernel"
        private const val OP_FULLY_CONNECTED = 9
        private const val TYPE_FLOAT32 = 0
        private const val TYPE_INT8 = 9

        /**
         * @param acceleratorName NNAPIの加速器名(`NnapiProbe`で列挙)。nullなら名前指定なし(NNAPI任せ)。
         * @param useNnapiDelegate falseならNNAPIを付けず、TFLite自身のCPUカーネルだけで実行する(基準用)。
         * @param int8 trueならint8量子化モデル(calibrationQueriesでスケールを決める)。
         */
        fun create(
            corpus: FloatArray, rows: Int, cols: Int, batch: Int,
            allowFp16: Boolean = false, allowNnapiCpuReference: Boolean = false,
            useNnapiDelegate: Boolean = true, cpuThreads: Int = 1,
            acceleratorName: String? = null,
            int8: Boolean = false, calibrationQueries: FloatArray? = null,
        ): NnapiMatVecKernel? {
            var delegate: NnApiDelegate? = null
            return try {
                val iopts = Interpreter.Options().setNumThreads(cpuThreads)
                if (useNnapiDelegate) {
                    val o = NnApiDelegate.Options()
                        .setExecutionPreference(NnApiDelegate.Options.EXECUTION_PREFERENCE_SUSTAINED_SPEED)
                        .setAllowFp16(allowFp16)
                        .setUseNnapiCpu(allowNnapiCpuReference)
                    if (acceleratorName != null) o.setAcceleratorName(acceleratorName)
                    delegate = NnApiDelegate(o)
                    iopts.addDelegate(delegate)
                }
                var quant: Quant? = null
                var wScale = 0f
                var wQ: ByteArray? = null
                if (int8) {
                    val calib = calibrationQueries ?: return null
                    val qAbs = calib.maxOf { abs(it) }.coerceAtLeast(1e-6f)
                    wScale = corpus.maxOf { abs(it) }.coerceAtLeast(1e-6f) / 127f
                    wQ = ByteArray(corpus.size) { (corpus[it] / wScale).roundToInt().coerceIn(-127, 127).toByte() }
                    val inScale = qAbs / 127f
                    // 出力スケール: 較正クエリでの真の出力の最大絶対値(+余裕20%)
                    val ref = cpuMultiply(corpus, rows, cols, calib.size / cols, calib)
                    val oAbs = ref.maxOf { abs(it) }.coerceAtLeast(1e-6f) * 1.2f
                    quant = Quant(inScale, oAbs / 127f)
                }
                val model = buildModel(corpus, rows, cols, batch, quant, wScale, wQ)
                val interp = Interpreter(model, iopts)
                NnapiMatVecKernel(interp, delegate, rows, cols, batch, quant)
            } catch (t: Throwable) {
                Log.i(TAG, "matvec kernel unavailable (accel=$acceleratorName int8=$int8): ${t.message}")
                try { delegate?.close() } catch (_: Throwable) {}
                null
            }
        }

        /** 素朴なCPU参照実装(数値の正解値として使う)。速度の基準には使わない。 */
        fun cpuMultiply(corpus: FloatArray, rows: Int, cols: Int, batch: Int, queries: FloatArray): FloatArray {
            val out = FloatArray(batch * rows)
            for (b in 0 until batch) {
                val qo = b * cols
                for (r in 0 until rows) {
                    var acc = 0f
                    val ro = r * cols
                    for (c in 0 until cols) acc += corpus[ro + c] * queries[qo + c]
                    out[b * rows + r] = acc
                }
            }
            return out
        }

        /** 品質評価: 正規化RMS誤差と、上位k件の一致率(検索用途ではこちらが本質)。 */
        data class Quality(val normRmsError: Double, val topKOverlap: Double)

        fun quality(reference: FloatArray, got: FloatArray, k: Int = 10): Quality {
            var se = 0.0
            var sr = 0.0
            for (i in reference.indices) {
                val d = (got[i] - reference[i]).toDouble()
                se += d * d
                sr += reference[i].toDouble() * reference[i]
            }
            val rms = Math.sqrt(se / max(sr, 1e-12))
            fun topK(a: FloatArray): Set<Int> = a.indices.sortedByDescending { a[it] }.take(k).toSet()
            val overlap = topK(reference).intersect(topK(got)).size.toDouble() / k
            return Quality(rms, overlap)
        }

        // ---- TFLite FlatBufferモデルの組み立て ----

        private fun quantization(fb: FlatBufferBuilder, scale: Float): Int {
            fb.startVector(4, 1, 4)
            fb.addFloat(scale)
            val sc = fb.endVector()
            fb.startVector(8, 1, 8)
            fb.addLong(0L)
            val zp = fb.endVector()
            fb.startTable(7)
            fb.addOffset(2, sc, 0)
            fb.addOffset(3, zp, 0)
            return fb.endTable()
        }

        private fun tensorQ(fb: FlatBufferBuilder, shape: IntArray, type: Int, buffer: Int, name: String, q: Int): Int {
            val shapeOff = NnapiVectorKernel.intVector(fb, shape)
            val nameOff = fb.createString(name)
            fb.startTable(6)
            fb.addOffset(0, shapeOff, 0)
            fb.addByte(1, type.toByte(), 0)
            fb.addInt(2, buffer, 0)
            fb.addOffset(3, nameOff, 0)
            if (q != 0) fb.addOffset(4, q, 0)
            return fb.endTable()
        }

        internal fun buildModel(corpus: FloatArray, m: Int, n: Int, batch: Int, quant: Quant?, wScale: Float, wQ: ByteArray?): ByteBuffer {
            require(corpus.size == m * n)
            val fb = FlatBufferBuilder(corpus.size * 4 + 1024)
            val isQ = quant != null
            val dt = if (isQ) TYPE_INT8 else TYPE_FLOAT32
            // 量子化パラメータ(テーブルは他のオブジェクトより先に作る)
            val qIn = if (isQ) quantization(fb, quant!!.inScale) else 0
            val qW = if (isQ) quantization(fb, wScale) else 0
            val qOut = if (isQ) quantization(fb, quant!!.outScale) else 0
            val tensors = listOf(
                tensorQ(fb, intArrayOf(batch, n), dt, 0, "query", qIn),
                tensorQ(fb, intArrayOf(m, n), dt, 1, "corpus", qW),
                tensorQ(fb, intArrayOf(batch, m), dt, 0, "scores", qOut),
            )
            // FULLY_CONNECTED: inputs=[input, weights, bias(なし=-1)]
            val op = NnapiVectorKernel.operator(fb, 0, intArrayOf(0, 1, -1), intArrayOf(2))
            val tensorsVec = NnapiVectorKernel.tableVector<Int>(fb, tensors)
            val opsVec = NnapiVectorKernel.tableVector<Int>(fb, listOf(op))
            val inputsVec = NnapiVectorKernel.intVector(fb, intArrayOf(0))
            val outputsVec = NnapiVectorKernel.intVector(fb, intArrayOf(2))
            val nameOff = fb.createString("matvec")
            fb.startTable(5)
            fb.addOffset(0, tensorsVec, 0)
            fb.addOffset(1, inputsVec, 0)
            fb.addOffset(2, outputsVec, 0)
            fb.addOffset(3, opsVec, 0)
            fb.addOffset(4, nameOff, 0)
            val subgraph = fb.endTable()
            val subgraphsVec = NnapiVectorKernel.tableVector<Int>(fb, listOf(subgraph))
            val codesVec = NnapiVectorKernel.tableVector<Int>(fb, listOf(NnapiVectorKernel.operatorCode(fb, OP_FULLY_CONNECTED)))

            val emptyData = fb.createByteVector(ByteArray(0))
            fb.startTable(1)
            fb.addOffset(0, emptyData, 0)
            val buf0 = fb.endTable()
            val wBytes: ByteArray = if (isQ) {
                wQ!!
            } else {
                val bb = ByteBuffer.allocate(corpus.size * 4).order(ByteOrder.LITTLE_ENDIAN)
                bb.asFloatBuffer().put(corpus)
                bb.array()
            }
            val wData = fb.createByteVector(wBytes)
            fb.startTable(1)
            fb.addOffset(0, wData, 0)
            val buf1 = fb.endTable()
            val buffersVec = NnapiVectorKernel.tableVector<Int>(fb, listOf(buf0, buf1))

            val desc = fb.createString("open-english matvec (NNAPI)")
            fb.startTable(5)
            fb.addInt(0, 3, 0)
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
