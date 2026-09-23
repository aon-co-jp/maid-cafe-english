package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenCpuProbeTest {
    @Test
    fun readsCpuInventoryViaJni() {
        val (inv, err) = OpenCpuProbe.inventory()
        Log.i("OpenCpuProbe", "error=$err arch=${inv?.arch} source=${inv?.source} detected=" + (inv?.detectedNames?.joinToString(" ") ?: ""))
        assertNotNull("open_cpu JNI probe must not fail on a real arm64 device (err=$err)", inv)
        assertTrue("inventory() must report at least one detected feature on real aarch64 hardware", (inv?.detectedNames?.isNotEmpty()) == true)
    }
}
