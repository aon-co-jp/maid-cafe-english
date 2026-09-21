package tokyo.runo.openenglish

import android.util.Log
import com.google.flatbuffers.FlatBufferBuilder
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * 「行列(コーパス)×クエリ」の内積を一括で計算するNNAPIカーネル(2026-09-21新設)。
 * `FULLY_CONNECTED`(NPU/GPUが最も得意な演算)1個だけのTFLiteモデルを実行時に組み立てる。重み=コーパス
 * (M行×N列の埋め込み行列、モデルへ定数として埋め込む)、入力=クエリ[B,N]、出力=[B,M]の内積。
 * 1組のコサイン類似度ではNNAPI起動のオーバーヘッドが計算量を上回るため、まとめて計算する用途向け。
 * どのハードウェアで走るかはNNAPIランタイムが決める(`NnapiVectorKernel`のdocと同じ正直な開示)。
 */
class NnapiMatVecKernel private constructor(
    private val interpreter: Interpreter,
    private val delegate: NnApiDelegate?,
    val rows: Int,
    val cols: Int,
    val batch: Int,
) : AutoCloseable {
    private val inBuf = ByteBuffer.allocateDirect(batch * cols * 4).order(ByteOrder.nativeOrder())
    private val outBuf = ByteBuffer.allocateDirect(batch * rows * 4).order(ByteOrder.nativeOrder())

    /** queries[batch*cols] を掛けた [batch*rows] の内積を返す。 */
    fun multiply(queries: FloatArray): FloatArray {
        require(queries.size == batch * cols)
        inBuf.clear(); inBuf.asFloatBuffer().put(queries)
        outBuf.clear()
        interpreter.run(inBuf, outBuf)
        val out = FloatArray(batch * rows)
        outBuf.rewind(); outBuf.asFloatBuffer().get(out)
        return out
    }

    override fun close() {
        try { interpreter.close() } catch (_: Throwable) {}
        try { delegate?.close() } catch (_: Throwable) {}
    }

    companion object {
        private const val TAG = "NnapiMatVecKernel"
        private const val OP_FULLY_CONNECTED = 9

        fun create(
            corpus: FloatArray, rows: Int, cols: Int, batch: Int,
            allowFp16: Boolean, allowNnapiCpuReference: Boolean = false,
            /** falseならNNAPIを付けず、TFLite自身のCPUカーネルだけで実行する(NNAPIの効果を切り分ける比較用)。 */
            useNnapiDelegate: Boolean = true, cpuThreads: Int = 1,
        ): NnapiMatVecKernel? {
            var delegate: NnApiDelegate? = null
            return try {
                val iopts = Interpreter.Options().setNumThreads(cpuThreads)
                if (useNnapiDelegate) {
                    delegate = NnApiDelegate(
                        NnApiDelegate.Options()
                            .setExecutionPreference(NnApiDelegate.Options.EXECUTION_PREFERENCE_SUSTAINED_SPEED)
                            .setAllowFp16(allowFp16)
                            .setUseNnapiCpu(allowNnapiCpuReference)
                    )
                    iopts.addDelegate(delegate)
                }
                val interp = Interpreter(buildModel(corpus, rows, cols, batch), iopts)
                NnapiMatVecKernel(interp, delegate, rows, cols, batch)
            } catch (t: Throwable) {
                Log.i(TAG, "matvec kernel unavailable: ${t.message}")
                try { delegate?.close() } catch (_: Throwable) {}
                null
            }
        }

        /** CPU参照実装(数値照合・フォールバック・速度比較用)。 */
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

        internal fun buildModel(corpus: FloatArray, m: Int, n: Int, batch: Int): ByteBuffer {
            require(corpus.size == m * n)
            val fb = FlatBufferBuilder(corpus.size * 4 + 1024)
            val tensors = listOf(
                NnapiVectorKernel.tensor(fb, intArrayOf(batch, n), 0, 0, "query"),
                NnapiVectorKernel.tensor(fb, intArrayOf(m, n), 0, 1, "corpus"),
                NnapiVectorKernel.tensor(fb, intArrayOf(batch, m), 0, 0, "scores"),
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
            val wBytes = ByteBuffer.allocate(corpus.size * 4).order(ByteOrder.LITTLE_ENDIAN)
            wBytes.asFloatBuffer().put(corpus)
            val wData = fb.createByteVector(wBytes.array())
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
