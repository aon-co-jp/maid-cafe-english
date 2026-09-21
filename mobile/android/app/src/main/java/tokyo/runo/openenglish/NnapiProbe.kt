package tokyo.runo.openenglish

import org.json.JSONObject

/**
 * この端末のNNAPI加速器(NPU/DSP/GPU等)の列挙(`nnapi_probe.c`)。
 * 「NNAPIが黙ってCPUへ落ちているのか、本物の加速器が使われているのか」を切り分けるための基盤。
 */
object NnapiProbe {
    data class Device(val name: String, val type: Int, val version: String, val featureLevel: Long) {
        /** 1=other 2=cpu 3=gpu 4=accelerator */
        val typeLabel: String get() = when (type) { 2 -> "cpu"; 3 -> "gpu"; 4 -> "accelerator(NPU/DSP)"; 1 -> "other"; else -> "unknown" }
        /** Android標準のCPU参照実装(加速器ではない)。 */
        val isReferenceCpu: Boolean get() = name == "nnapi-reference" || type == 2
        /** 実際に使う価値のある加速器(GPU/NPU/DSP等。参照CPU実装は除く)。 */
        val isRealAccelerator: Boolean get() = !isReferenceCpu
    }

    private val loaded: Boolean by lazy {
        try { System.loadLibrary("nnapi_probe"); true } catch (_: Throwable) { false }
    }

    private external fun devicesJson(): String

    /** 列挙結果。読み込めない/Android 10未満なら空リスト(error付き)。 */
    fun devices(): Pair<List<Device>, String?> {
        if (!loaded) return Pair(emptyList(), "native probe library not loaded")
        return try {
            val o = JSONObject(devicesJson())
            if (!o.optBoolean("available")) return Pair(emptyList(), o.optString("error", "NNAPI unavailable"))
            val arr = o.getJSONArray("devices")
            Pair((0 until arr.length()).map {
                val d = arr.getJSONObject(it)
                Device(d.getString("name"), d.optInt("type"), d.optString("version"), d.optLong("feature_level"))
            }, null)
        } catch (t: Throwable) {
            Pair(emptyList(), t.message)
        }
    }
}
