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

    /** NNAPIの実測: ベクトル長768の1組と、行列×ベクトル(768×2048 / 768×8192、FP32)でCPUとの速度・数値を比べる。 */
    private fun nnapiInfo(): JSONObject {
        val o = JSONObject()
        try {
            val pair = NnapiVectorKernel.selectBest(768)
            o.put("pair_768_selected", pair.label)
            o.put("pair_768_detail", pair.detail)
            pair.kernel?.close()
        } catch (e: Throwable) {
            o.put("pair_error", e.message ?: "failed")
        }
        val rows = JSONArray()
        for (m in intArrayOf(2048, 8192)) {
            rows.put(matVec(m, 768))
        }
        o.put("matvec", rows)
        o.put("note", "NNAPIのどの加速器(NPU/DSP/GPU)で走ったかは取得できません。判定はTFLiteのCPUカーネルとの比較(1.3倍以上で加速器が効いていると見なす)。素朴なCPUループとの比較は参考値です。")
        return o
    }

    private fun matVec(m: Int, n: Int): JSONObject {
        val o = JSONObject().put("rows", m).put("cols", n)
        try {
            val rnd = java.util.Random(1)
            val corpus = FloatArray(m * n) { rnd.nextGaussian().toFloat() }
            val q = FloatArray(n) { rnd.nextGaussian().toFloat() }
            val ref = NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q)
            val runs = 5
            for (i in 0 until 2) NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q) // CPU側もウォームアップして公平に比べる
            val t0 = System.nanoTime()
            for (i in 0 until runs) NnapiMatVecKernel.cpuMultiply(corpus, m, n, 1, q)
            val cpuMs = (System.nanoTime() - t0) / 1e6 / runs
            o.put("cpu_ms", cpuMs)
            // 切り分け: NNAPIを付けない「TFLite自身のCPUカーネル」。素朴なループより速いのはTFLiteの最適化のおかげで
            // あってNPUとは限らないため、NNAPIの効果はこの基準と比べて判定する。
            var tfliteCpuMs = Double.NaN
            NnapiMatVecKernel.create(corpus, m, n, 1, allowFp16 = false, useNnapiDelegate = false, cpuThreads = 1)?.use { kc ->
                for (i in 0 until 3) kc.multiply(q)
                val t2 = System.nanoTime()
                for (i in 0 until runs) kc.multiply(q)
                tfliteCpuMs = (System.nanoTime() - t2) / 1e6 / runs
            }
            if (!tfliteCpuMs.isNaN()) o.put("tflite_cpu_ms", tfliteCpuMs)
            val k = NnapiMatVecKernel.create(corpus, m, n, 1, allowFp16 = false)
            if (k == null) {
                o.put("nnapi", "unavailable")
            } else {
                k.use {
                    val got = it.multiply(q)
                    var scale = 0.0
                    for (r in ref) scale += r.toDouble() * r
                    scale = Math.sqrt(scale / ref.size) + 1e-9
                    var maxErr = 0.0
                    for (i in ref.indices) maxErr = maxOf(maxErr, Math.abs((got[i] - ref[i]).toDouble()) / scale)
                    for (i in 0 until 2) it.multiply(q)
                    val t1 = System.nanoTime()
                    for (i in 0 until runs) it.multiply(q)
                    val nMs = (System.nanoTime() - t1) / 1e6 / runs
                    o.put("nnapi_ms", nMs).put("max_err", maxErr).put("speedup", cpuMs / nMs)
                    if (!tfliteCpuMs.isNaN()) {
                        val gain = tfliteCpuMs / nMs
                        o.put("gain_vs_tflite_cpu", gain)
                        // 判定: TFLiteのCPUより明確に速い(1.3倍以上)ときだけ「加速器が効いている」とみなす
                        o.put("accelerator_effective", gain >= 1.3 && maxErr < 1e-3)
                    }
                }
            }
        } catch (t: Throwable) {
            o.put("error", t.message ?: "failed")
        }
        return o
    }
}
