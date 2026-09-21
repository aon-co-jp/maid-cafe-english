package tokyo.runo.openenglish

import android.util.Log
import android.webkit.WebView
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test

/** 診断レポートの実機検証(結果はlogcatの"HwReport"へ全文出力)。 */
class HardwareReportTest {
    @Test
    fun reportContainsDeviceCpuGpuNnapi() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        var report: org.json.JSONObject? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            report = HardwareReport(ctx, WebView(ctx)).build()
        }
        val r = report!!
        Log.i("HwReport", r.toString(1))
        assertTrue(r.has("device") && r.has("cpu") && r.has("gpu") && r.has("nnapi"))
        assertTrue("cpu flags must be present", r.getJSONObject("cpu").getJSONArray("flags").length() > 0)
    }
}
