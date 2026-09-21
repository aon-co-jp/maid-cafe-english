package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

/** 行列×ベクトルでNNAPI(実機NPU等)がCPUに勝つ損益分岐点を測る。結果はlogcatの"MatVecBench"へ。 */
class NnapiMatVecBenchmarkTest {
    @Test
    fun benchmarkMatVec() {
        val n = 768
        var anyKernel = false
        for (m in intArrayOf(256, 2048, 8192, 16384)) {
            val rnd = java.util.Random(1)
            val corpus = FloatArray(m * n) { rnd.nextGaussian().toFloat() }
            val q = FloatArray(n) { rnd.nextGaussian().toFloat() }
            val ref = NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q)
            val runs = if (m >= 8192) 10 else 30
            for (i in 0 until 3) NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q) // CPUもウォームアップして公平に比べる
            val t0 = System.nanoTime()
            for (i in 0 until runs) NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q)
            val cpuMs = (System.nanoTime() - t0) / 1e6 / runs
            // 切り分け用: NNAPIを付けないTFLite自身のCPUカーネル(1スレッド/4スレッド)
            for (threads in intArrayOf(1, 4)) {
                val kc = NnapiMatVecKernel.create(corpus, m, n, 1, false, useNnapiDelegate = false, cpuThreads = threads)
                if (kc != null) kc.use {
                    for (i in 0 until 3) it.multiply(q)
                    val t2 = System.nanoTime()
                    for (i in 0 until runs) it.multiply(q)
                    val ms = (System.nanoTime() - t2) / 1e6 / runs
                    Log.i("MatVecBench", "m=$m tflite-cpu(threads=$threads) = ${"%.3f".format(ms)}ms (naive-kotlin cpu=${"%.3f".format(cpuMs)}ms)")
                }
            }
            for (fp16 in booleanArrayOf(false, true)) {
                val k = NnapiMatVecKernel.create(corpus, m, n, 1, fp16)
                if (k == null) {
                    Log.i("MatVecBench", "m=$m fp16=$fp16 kernel=null cpu=${"%.3f".format(cpuMs)}ms")
                    continue
                }
                anyKernel = true
                k.use {
                    val got = it.multiply(q)
                    var scale = 0.0
                    for (i in ref.indices) scale += ref[i].toDouble() * ref[i]
                    scale = sqrt(scale / ref.size) + 1e-9
                    var maxErr = 0.0
                    for (i in ref.indices) maxErr = maxOf(maxErr, abs((got[i] - ref[i]).toDouble()) / scale)
                    for (i in 0 until 3) it.multiply(q)
                    val t1 = System.nanoTime()
                    for (i in 0 until runs) it.multiply(q)
                    val nMs = (System.nanoTime() - t1) / 1e6 / runs
                    Log.i(
                        "MatVecBench",
                        "m=$m n=$n fp16=$fp16 maxErr(norm)=${"%.2e".format(maxErr)} nnapi=${"%.3f".format(nMs)}ms cpu=${"%.3f".format(cpuMs)}ms speedup=x${"%.2f".format(cpuMs / nMs)}"
                    )
                }
            }
        }
        assertTrue("at least one NNAPI matvec kernel must be created", anyKernel)
    }
}
