package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 実在する加速器(NPU/DSP/GPU)が、計算量(行数×バッチ)を増やすとTFLite CPUに勝てるかを測る。
 * 結果はlogcatの"NpuScale"へ。基準は同じ設定のTFLite CPU(4スレッド、NNAPIなし)。
 */
class NpuScalingTest {
    @Test
    fun scaling() {
        val (devs, _) = NnapiProbe.devices()
        val accels = devs.filter { it.isRealAccelerator }
        Log.i("NpuScale", "accelerators=" + accels.joinToString(",") { it.name })
        if (accels.isEmpty()) { Log.i("NpuScale", "no real accelerator on this device"); return }
        val n = 768
        for (m in intArrayOf(8192, 16384)) {
            val rnd = java.util.Random(1)
            val corpus = FloatArray(m * n) { rnd.nextGaussian().toFloat() }
            for (batch in intArrayOf(1, 16, 64)) {
                val calib = FloatArray(8 * n) { rnd.nextGaussian().toFloat() }
                val q = FloatArray(batch * n) { rnd.nextGaussian().toFloat() }
                val ref = NnapiMatVecKernel.cpuMultiply(corpus, m, n, batch, q)
                fun run(label: String, k: NnapiMatVecKernel?): Double {
                    if (k == null) { Log.i("NpuScale", "m=$m b=$batch $label unavailable"); return Double.NaN }
                    return k.use {
                        val got = it.multiply(q)
                        val ql = NnapiMatVecKernel.quality(ref.copyOfRange(0, m), got.copyOfRange(0, m))
                        for (i in 0 until 2) it.multiply(q)
                        val runs = 5
                        val t = System.nanoTime()
                        for (i in 0 until runs) it.multiply(q)
                        val ms = (System.nanoTime() - t) / 1e6 / runs
                        Log.i("NpuScale", "m=$m b=$batch $label ${"%.2f".format(ms)}ms err=${"%.1e".format(ql.normRmsError)} top10=${ql.topKOverlap}")
                        ms
                    }
                }
                val cpu = run("tflite-cpu4", NnapiMatVecKernel.create(corpus, m, n, batch, useNnapiDelegate = false, cpuThreads = 4))
                for (a in accels) {
                    for (mode in listOf("fp16", "int8")) {
                        val k = if (mode == "fp16") NnapiMatVecKernel.create(corpus, m, n, batch, allowFp16 = true, acceleratorName = a.name)
                        else NnapiMatVecKernel.create(corpus, m, n, batch, acceleratorName = a.name, int8 = true, calibrationQueries = calib)
                        val ms = run("$mode@${a.name}", k)
                        if (!ms.isNaN() && !cpu.isNaN()) Log.i("NpuScale", "   -> gain vs cpu4 = x${"%.2f".format(cpu / ms)}")
                    }
                }
            }
        }
        assertTrue(true)
    }
}
