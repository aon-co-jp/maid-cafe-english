package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertTrue
import org.junit.Test

/** 新セレクターの実機検証(結果はlogcatの"MatVecSel")。 */
class MatVecSelectorTest {
    @Test
    fun selectorProducesCandidatesAndAChoice() {
        // includeReferenceCpu=true: 加速器の無い端末/エミュレータでも、加速器名指定+int8経路を動かして検証する
        val r = MatVecSelector.evaluate(4096, 768, includeReferenceCpu = true)
        Log.i("MatVecSel", r.toString(1).replace("\n", " ").replace(Regex("\\s+"), " "))
        assertTrue(r.has("candidates") && r.has("chosen"))
        val cands = r.getJSONArray("candidates")
        assertTrue("must include the tflite-cpu baseline", (0 until cands.length()).any { cands.getJSONObject(it).getString("label").startsWith("tflite-cpu") })
    }

    @Test
    fun int8KernelIsApproximatelyCorrect() {
        val m = 1024; val n = 256
        val rnd = java.util.Random(3)
        val corpus = FloatArray(m * n) { rnd.nextGaussian().toFloat() }
        val calib = FloatArray(8 * n) { rnd.nextGaussian().toFloat() }
        val q = FloatArray(n) { rnd.nextGaussian().toFloat() }
        // 参照CPU実装(nnapi-reference)へ名前指定してint8モデルを動かす。名前指定が効くことも確認する
        val k = NnapiMatVecKernel.create(corpus, m, n, 1, acceleratorName = "nnapi-reference", int8 = true, calibrationQueries = calib)
        assertTrue("int8 kernel must build on nnapi-reference", k != null)
        k!!.use {
            val got = it.multiply(q)
            val ql = NnapiMatVecKernel.quality(NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q), got)
            Log.i("MatVecSel", "int8 quality normRms=${ql.normRmsError} top10=${ql.topKOverlap}")
            assertTrue("int8 normalized error must be < 5% (was ${ql.normRmsError})", ql.normRmsError < 0.05)
            assertTrue("int8 top-10 overlap must be >= 0.7 (was ${ql.topKOverlap})", ql.topKOverlap >= 0.7)
        }
    }

    @Test
    fun unknownAcceleratorNameFailsInsteadOfSilentlyUsingCpu() {
        val k = NnapiMatVecKernel.create(FloatArray(64 * 16) { 1f }, 64, 16, 1, acceleratorName = "no-such-accelerator")
        assertTrue("must not silently fall back to CPU when a named accelerator does not exist", k == null)
    }
}
