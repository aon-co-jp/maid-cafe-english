package tokyo.runo.openenglish

import android.util.Log
import android.webkit.WebView
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JSブリッジ経由の呼び出しの再現テスト: `hardwareReport()`はJSブリッジのスレッド(メインスレッド以外)から呼ばれる。
 * 以前は`WebView.getUrl()`をそのスレッドで呼んで失敗し、「only available from the local app page」で拒否されていた。
 */
class HardwareReportBridgeTest {
    @Test
    fun bridgeCalledFromBackgroundThreadAcceptsLocalPage() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        lateinit var wv: WebView
        inst.runOnMainSync {
            wv = WebView(ctx)
            wv.loadUrl("http://127.0.0.1:9/") // 接続先は無くてよい(webView.urlがローカルになることだけが目的)
        }
        Thread.sleep(500)
        var out: String? = null
        val t = Thread { out = HardwareReport(ctx, wv).hardwareReport() } // メインスレッドではないスレッド
        t.start(); t.join(120000)
        val json = JSONObject(out ?: "{}")
        Log.i("HwBridge", "keys=" + json.keys().asSequence().toList())
        assertFalse("must not be rejected: $out", json.has("error"))
        assertTrue(json.has("nnapi"))
    }

    @Test
    fun bridgeRejectsNonLocalPage() {
        val inst = InstrumentationRegistry.getInstrumentation()
        val ctx = inst.targetContext
        lateinit var wv: WebView
        inst.runOnMainSync {
            wv = WebView(ctx)
            wv.loadUrl("https://example.invalid/")
        }
        Thread.sleep(500)
        var out: String? = null
        val t = Thread { out = HardwareReport(ctx, wv).hardwareReport() }
        t.start(); t.join(30000)
        assertTrue("non-local pages must be rejected: $out", JSONObject(out ?: "{}").has("error"))
    }
}
