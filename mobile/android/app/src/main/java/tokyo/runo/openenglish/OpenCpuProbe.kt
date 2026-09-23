package tokyo.runo.openenglish

import org.json.JSONArray
import org.json.JSONObject

/**
 * この端末のCPU命令セット対応状況(`open-cpu`の`inventory()`をJNI経由で呼ぶ、
 * `libopen_cpu.so`はopen-cpuリポジトリ側で`cargo ndk`により事前ビルドし
 * `jniLibs/arm64-v8a/`へ配置したもの——NnapiProbeと同じ「事前ビルド共有
 * ライブラリをSystem.loadLibraryでロードする」経路、2026-09-23新設)。
 */
object OpenCpuProbe {
    data class Feature(val name: String, val detected: Boolean, val usedByOpenCpu: Boolean)
    data class CoreGroup(val name: String, val count: Int)
    data class Inventory(
        val arch: String,
        val source: String,
        val features: List<Feature>,
        val cores: List<CoreGroup>,
        val rawFlags: List<String>,
    ) {
        val detectedNames: List<String> get() = features.filter { it.detected }.map { it.name }
    }

    private val loaded: Boolean by lazy {
        try { System.loadLibrary("open_cpu"); true } catch (_: Throwable) { false }
    }

    private external fun inventoryJson(): String

    /** CPU命令セット・コア構成。ロードできない場合はnull+error文字列。 */
    fun inventory(): Pair<Inventory?, String?> {
        if (!loaded) return Pair(null, "native open_cpu library not loaded")
        return try {
            val o = JSONObject(inventoryJson())
            val features = (0 until o.getJSONArray("features").length()).map {
                val f = o.getJSONArray("features").getJSONObject(it)
                Feature(f.getString("name"), f.getBoolean("detected"), f.getBoolean("used_by_open_cpu"))
            }
            val cores = (0 until o.getJSONArray("cores").length()).map {
                val c = o.getJSONArray("cores").getJSONObject(it)
                CoreGroup(c.getString("name"), c.getInt("count"))
            }
            val rawArr: JSONArray = o.getJSONArray("raw_flags")
            val rawFlags = (0 until rawArr.length()).map { rawArr.getString(it) }
            Pair(Inventory(o.getString("arch"), o.getString("source"), features, cores, rawFlags), null)
        } catch (t: Throwable) {
            Pair(null, t.message)
        }
    }
}
