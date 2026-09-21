package tokyo.runo.openenglish

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * この端末のCPU・GPU・NPU(NNAPI)の診断レポート(2026-09-21新設、ユーザー指示「スマホ版のNPUがあれば計算にも使用して」
 * 「WE2の方はアプリをインストールして対応」)。adbが無くても、アプリ内の画面から診断できるようにする。
 *
 * ## 正直な開示
 * - NNAPIのアクセラレーター(NPU/DSP)の**名前**はJavaから取得できない。代わりに、実測(NNAPI対CPUの速度・数値一致)と
 *   デリゲートの適用ノード数の有無を報告する。加速器が無い端末では、NNAPIはCPU/GPU代替に落ちて速くならない(実機で確認済み)。
 * - 個人を特定できる情報(IMEI・シリアル・MACアドレス等)は一切含めない。
 */
class HardwareReport(private val context: Context, private val webView: WebView) {

    /** JSから呼ばれる。ローカルサーバー(127.0.0.1)のページ以外には結果を返さない。所要数秒(JSスレッドで実行)。 */
    @JavascriptInterface
    fun hardwareReport(): String {
        val url = try { webView.url ?: "" } catch (_: Throwable) { "" }
        if (!(url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:"))) {
            return JSONObject().put("error", "only available from the local app page").toString()
        }
        return build().toString()
    }

    fun build(): JSONObject {
        val root = JSONObject()
        root.put("device", JSONObject().apply {
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("android", Build.VERSION.RELEASE)
            put("sdk", Build.VERSION.SDK_INT)
            put("hardware", Build.HARDWARE)
            put("board", Build.BOARD)
            if (Build.VERSION.SDK_INT >= 31) {
                put("soc_manufacturer", Build.SOC_MANUFACTURER)
                put("soc_model", Build.SOC_MODEL)
            }
            put("abi", Build.SUPPORTED_ABIS.joinToString(","))
        })
        root.put("cpu", cpuInfo())
        root.put("gpu", gpuInfo())
        root.put("nnapi", nnapiInfo())
        return root
    }

    private fun cpuInfo(): JSONObject {
        val o = JSONObject()
        o.put("logical_cores", Runtime.getRuntime().availableProcessors())
        try {
            val text = File("/proc/cpuinfo").readText()
            val flags = Regex("(?m)^(?:Features|flags)\\s*:\\s*(.*)$").find(text)?.groupValues?.get(1)?.trim()?.split(Regex("\\s+")) ?: emptyList()
            o.put("flags", JSONArray(flags))
            // big.LITTLE: (implementer, part) ごとのコア数
            val groups = LinkedHashMap<String, Int>()
            var impl = "0x41"
            for (line in text.lines()) {
                val kv = line.split(":", limit = 2)
                if (kv.size < 2) continue
                val k = kv[0].trim(); val v = kv[1].trim()
                if (k == "CPU implementer") impl = v
                if (k == "CPU part") { val key = "$impl/$v"; groups[key] = (groups[key] ?: 0) + 1 }
            }
            o.put("core_groups", JSONArray(groups.map { (k, c) -> JSONObject().put("implementer_part", k).put("count", c) }))
        } catch (e: Throwable) {
            o.put("cpuinfo_error", e.message ?: "unreadable")
        }
        return o
    }

    private fun gpuInfo(): JSONObject {
        val o = JSONObject()
        val pm = context.packageManager
        o.put("vulkan", pm.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION))
        try {
            val info = (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).deviceConfigurationInfo
            o.put("gles_version", info.glEsVersion)
        } catch (_: Throwable) {}
        // GL_RENDERER / GL_VENDOR はオフスクリーンのEGLコンテキストで取得する
        try {
            val dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val ver = IntArray(2)
            EGL14.eglInitialize(dpy, ver, 0, ver, 1)
            val attrs = intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE)
            val configs = arrayOfNulls<EGLConfig>(1)
            val n = IntArray(1)
            EGL14.eglChooseConfig(dpy, attrs, 0, configs, 0, 1, n, 0)
            val ctx = EGL14.eglCreateContext(dpy, configs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
            val surf = EGL14.eglCreatePbufferSurface(dpy, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
            EGL14.eglMakeCurrent(dpy, surf, surf, ctx)
            o.put("gl_renderer", GLES20.glGetString(GLES20.GL_RENDERER))
            o.put("gl_vendor", GLES20.glGetString(GLES20.GL_VENDOR))
            EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            EGL14.eglDestroySurface(dpy, surf)
            EGL14.eglDestroyContext(dpy, ctx)
            EGL14.eglTerminate(dpy)
        } catch (e: Throwable) {
            o.put("gl_error", e.message ?: "unavailable")
        }
        return o
    }

    /** NNAPIの診断: 実在する加速器の列挙と、行列×ベクトル(768×2048/8192)の実測(`MatVecSelector`)。 */
    private fun nnapiInfo(): JSONObject {
        val o = JSONObject()
        try {
            val pair = NnapiVectorKernel.selectBest(768)
            o.put("pair_768_selected", pair.label)
            pair.kernel?.close()
        } catch (e: Throwable) {
            o.put("pair_error", e.message ?: "failed")
        }
        val rows = JSONArray()
        for (m in intArrayOf(2048, 8192)) {
            try { rows.put(MatVecSelector.evaluate(m, 768)) } catch (t: Throwable) { rows.put(JSONObject().put("rows", m).put("error", t.message ?: "failed")) }
        }
        o.put("matvec", rows)
        o.put("note", "判定はTFLiteのCPUカーネル(NNAPIなし)との比較。実在する加速器を名前指定して測り、1.3倍以上速く品質ゲートも通った場合だけ「加速器が効いている」と見なします。int8は近似(上位10件の一致率で評価)です。")
        return o
    }
}
