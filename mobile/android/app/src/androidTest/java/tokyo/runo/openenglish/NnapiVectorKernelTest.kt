package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertTrue
import org.junit.Test

/** NNAPIカーネルの実機/エミュレータ検証(`./gradlew connectedPhoneDebugAndroidTest`)。 */
class NnapiVectorKernelTest {
    @Test
    fun nnapiKernelMatchesCpu_smallAndLarge() {
        for (n in intArrayOf(8, 384, 768, 4096)) {
            val r = NnapiVectorKernel.selfTest(length = n, allowNnapiCpuReference = true, runs = 100)
            Log.i("NnapiTest", "n=$n ok=${r.ok} attached=${r.nnapiDelegateAttached} ${r.detail}")
            assertTrue("NNAPI kernel must be created (n=$n): ${r.detail}", r.nnapiDelegateAttached)
            assertTrue("NNAPI result must match CPU (n=$n): ${r.detail}", r.ok)
        }
    }

    @Test
    fun cosineOfIdenticalVectorsIsOne_andOrthogonalIsZero() {
        val k = NnapiVectorKernel.create(4, allowNnapiCpuReference = true)
        assertTrue("kernel created", k != null)
        k!!.use {
            val one = it.cosineSimilarity(floatArrayOf(1f, 2f, 3f, 4f), floatArrayOf(1f, 2f, 3f, 4f))
            val zero = it.cosineSimilarity(floatArrayOf(1f, 0f, 0f, 0f), floatArrayOf(0f, 1f, 0f, 0f))
            assertTrue("identical=1 got $one", kotlin.math.abs(one - 1f) < 1e-4f)
            assertTrue("orthogonal=0 got $zero", kotlin.math.abs(zero) < 1e-4f)
        }
    }
}
