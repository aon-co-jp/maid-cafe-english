package tokyo.runo.openenglish

import org.json.JSONArray
import org.json.JSONObject

/**
 * 行列×ベクトル計算の実行方式を、実測で公平に選ぶ(2026-09-21、作り直し)。
 *
 * 候補: (1)NNAPIを付けないTFLite自身のCPUカーネル(1/4スレッド。= 実用上の「CPUの最良」)、
 *       (2)NNAPIの実在する加速器ごとに FP32 / FP16 / int8 を、加速器名を指定して(黙ってCPUへ落ちないように)。
 * 採用条件: 品質ゲートを通り(FP32/FP16は数値がほぼ一致、int8は上位10件の一致率90%以上かつ誤差5%未満)、
 *           かつCPUの最良より1.3倍以上速いこと。満たさなければCPU。
 * 「速い」の基準は素朴なKotlinのループではなく、TFLiteのCPUカーネル(NNAPIの効果をNPUの効果と取り違えないため)。
 */
object MatVecSelector {
    private const val MIN_GAIN = 1.3

    data class Candidate(val label: String, val ms: Double, val normRms: Double, val topK: Double, val passesQuality: Boolean, val note: String = "")

    fun evaluate(m: Int, n: Int, includeReferenceCpu: Boolean = false, batch: Int = 1): JSONObject {
        val out = JSONObject().put("rows", m).put("cols", n).put("batch", batch)
        val (devices, probeErr) = NnapiProbe.devices()
        out.put("nnapi_devices", JSONArray(devices.map { JSONObject().put("name", it.name).put("type", it.typeLabel).put("version", it.version).put("real_accelerator", it.isRealAccelerator) }))
        if (probeErr != null) out.put("probe_error", probeErr)

        val rnd = java.util.Random(1)
        val corpus = FloatArray(m * n) { rnd.nextGaussian().toFloat() }
        val calib = FloatArray(8 * n) { rnd.nextGaussian().toFloat() }
        val q = FloatArray(batch * n) { rnd.nextGaussian().toFloat() }
        val ref = NnapiMatVecKernel.cpuMultiply(corpus, m, n, batch, q)
        val runs = if (batch >= 32) 4 else 8
        val cands = ArrayList<Candidate>()

        fun measure(label: String, k: NnapiMatVecKernel?, gate: (NnapiMatVecKernel.Companion.Quality) -> Boolean, note: String = "") {
            if (k == null) { cands.add(Candidate(label, Double.NaN, Double.NaN, 0.0, false, "unavailable")); return }
            k.use {
                try {
                    val got = it.multiply(q)
                    val ql = NnapiMatVecKernel.quality(ref.copyOfRange(0, m), got.copyOfRange(0, m)) // 先頭クエリの結果で評価
                    for (i in 0 until 3) it.multiply(q)
                    val t = System.nanoTime()
                    for (i in 0 until runs) it.multiply(q)
                    val ms = (System.nanoTime() - t) / 1e6 / runs
                    cands.add(Candidate(label, ms, ql.normRmsError, ql.topKOverlap, gate(ql), note))
                } catch (e: Throwable) {
                    cands.add(Candidate(label, Double.NaN, Double.NaN, 0.0, false, "error: ${e.message}"))
                }
            }
        }
        val exact = { ql: NnapiMatVecKernel.Companion.Quality -> ql.normRmsError < 1e-2 && ql.topKOverlap >= 1.0 }
        val fp16 = { ql: NnapiMatVecKernel.Companion.Quality -> ql.normRmsError < 5e-3 && ql.topKOverlap >= 0.9 }
        val int8 = { ql: NnapiMatVecKernel.Companion.Quality -> ql.normRmsError < 5e-2 && ql.topKOverlap >= 0.9 }

        // CPU基準(NNAPIなし)
        for (th in intArrayOf(1, 4)) {
            measure("tflite-cpu(threads=$th)", NnapiMatVecKernel.create(corpus, m, n, batch, useNnapiDelegate = false, cpuThreads = th), exact)
        }
        val cpuBest = cands.filter { it.passesQuality && !it.ms.isNaN() }.minByOrNull { it.ms }

        // 実在する加速器ごと(名前指定)。参照CPU実装は、検証用にincludeReferenceCpu=trueのときだけ含める。
        val targets = devices.filter { it.isRealAccelerator || includeReferenceCpu }
        for (d in targets) {
            val nm = d.name
            measure("nnapi-fp32@$nm", NnapiMatVecKernel.create(corpus, m, n, batch, allowFp16 = false, acceleratorName = nm), exact)
            measure("nnapi-fp16@$nm", NnapiMatVecKernel.create(corpus, m, n, batch, allowFp16 = true, acceleratorName = nm), fp16)
            measure("nnapi-int8@$nm", NnapiMatVecKernel.create(corpus, m, n, batch, acceleratorName = nm, int8 = true, calibrationQueries = calib), int8, "int8量子化(近似)")
        }
        if (targets.isEmpty()) out.put("accelerator_note", "この端末のNNAPIには実在する加速器(NPU/DSP/GPU)がありません(nnapi-referenceはAndroid標準のCPU実装)。")

        val accel = cands.filter { it.label.startsWith("nnapi") && it.passesQuality && !it.ms.isNaN() }.minByOrNull { it.ms }
        val chosen = if (accel != null && cpuBest != null && cpuBest.ms / accel.ms >= MIN_GAIN) accel else cpuBest
        out.put("candidates", JSONArray(cands.map {
            JSONObject().put("label", it.label).put("ms", if (it.ms.isNaN()) JSONObject.NULL else it.ms).put("norm_rms_error", if (it.normRms.isNaN()) JSONObject.NULL else it.normRms)
                .put("top10_overlap", it.topK).put("passes_quality", it.passesQuality).put("note", it.note)
        }))
        out.put("chosen", chosen?.label ?: "none")
        out.put("accelerator_effective", chosen != null && chosen.label.startsWith("nnapi"))
        if (chosen != null && cpuBest != null) out.put("gain_vs_best_cpu", cpuBest.ms / chosen.ms)
        return out
    }
}
