package tokyo.runo.openenglish

import android.util.Log
import org.junit.Assert.assertTrue
import org.junit.Test

class NnapiProbeTest {
    @Test
    fun listNnapiDevices() {
        val (devs, err) = NnapiProbe.devices()
        Log.i("NnapiProbe", "error=$err devices=" + devs.joinToString(" | ") { "${it.name} type=${it.typeLabel} ver=${it.version} fl=${it.featureLevel} real=${it.isRealAccelerator}" })
        assertTrue("probe must not fail on Android 10+ (err=$err)", err == null)
    }
}
