package tokyo.runo.openenglish

import android.util.Log
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

/** PCのaruaru-llmを模した最小HTTPサーバーで、タスク取得→計算→結果送信の往復を検証する。 */
class PhoneAccelWorkerTest {
    @Test
    fun workerFetchesComputesAndSubmitsResult() = runBlocking {
        val n = 768
        val rnd = java.util.Random(7)
        val a = FloatArray(n) { rnd.nextGaussian().toFloat() }
        val b = FloatArray(n) { rnd.nextGaussian().toFloat() }
        val expected = NnapiVectorKernel.cpuDotAndNorms(a, b).let { it[0] / (kotlin.math.sqrt(it[1]) * kotlin.math.sqrt(it[2])) }
        val received = AtomicReference<JSONObject?>(null)
        val server = ServerSocket(0)
        val port = server.localPort
        var served = false
        val t = thread(isDaemon = true) {
            while (!server.isClosed) {
                try {
                    val s = server.accept()
                    val reader = s.getInputStream().bufferedReader()
                    val reqLine = reader.readLine() ?: continue
                    var len = 0
                    while (true) {
                        val h = reader.readLine() ?: break
                        if (h.isEmpty()) break
                        if (h.startsWith("Content-Length", ignoreCase = true)) len = h.substringAfter(":").trim().toInt()
                    }
                    val out = s.getOutputStream()
                    if (reqLine.startsWith("GET") && !served) {
                        served = true
                        val body = JSONObject().put("task_id", 1).put("vec_a", org.json.JSONArray(a.map { it.toDouble() })).put("vec_b", org.json.JSONArray(b.map { it.toDouble() })).toString()
                        out.write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n$body".toByteArray())
                    } else if (reqLine.startsWith("POST")) {
                        val buf = CharArray(len); var read = 0
                        while (read < len) { val r = reader.read(buf, read, len - read); if (r < 0) break; read += r }
                        received.set(JSONObject(String(buf, 0, read)))
                        out.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".toByteArray())
                    } else {
                        out.write("HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".toByteArray())
                    }
                    out.flush(); s.close()
                } catch (_: Exception) {}
            }
        }
        val logs = mutableListOf<String>()
        val worker = PhoneAccelWorker("http://127.0.0.1:$port") { logs.add(it); Log.i("WorkerTest", it) }
        worker.start()
        var waited = 0
        while (received.get() == null && waited < 30000) { delay(250); waited += 250 }
        worker.stop(); server.close()
        val r = received.get()
        assertTrue("result must be posted (logs=$logs)", r != null)
        assertEquals(1, r!!.getInt("task_id"))
        val sim = r.getDouble("similarity")
        assertTrue("similarity $sim must match CPU $expected", kotlin.math.abs(sim - expected) < 1e-3)
        Log.i("WorkerTest", "device_label=${r.getString("device_label")} similarity=$sim expected=$expected")
        assertTrue(r.getString("device_label").contains("path="))
    }
}
