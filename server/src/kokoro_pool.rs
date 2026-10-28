//! Kokoro(ONNX int8)日本語音声合成のワーカープール(`tts_worker/kokoro_worker.py`を子プロセスとして常駐)。
//!
//! GPUの無いVPS(レンタルサーバー)のCPUで合成するための仕組み。端末に十分な演算機能が無いクライアントが、
//! `POST /v1/public/tts`(`lang: ja-*`)で依頼する。**同時実行数の上限と待ち行列**を持つ:
//! - ワーカー数 = 同時に合成できる数(各ワーカーは1リクエストずつ。`OPEN_ENGLISH_KOKORO_WORKERS`、既定2)
//! - 待ち行列の長さ(`OPEN_ENGLISH_KOKORO_QUEUE`、既定6)を超えたら、待たせず `Busy`(HTTP 503 + `Retry-After`)。
//!   クライアントは別の手段(端末の合成・Web Speech API)へ切り替えられる。
//! - 待っている間にクライアントが切断した依頼は、実行せずに捨てる(無駄なCPUを使わない)。
//! - 1依頼のタイムアウトは30秒。タイムアウト・異常終了したワーカーは殺して次の依頼の前に起動し直す。
//!
//! 有効化: `OPEN_ENGLISH_KOKORO_DIR` にモデルのあるフォルダ(`kokoro-v1.0.int8.onnx`・`voices-v1.0.bin`)、
//! `OPEN_ENGLISH_KOKORO_PYTHON`(既定 `<dir>/venv/bin/python`)、`OPEN_ENGLISH_KOKORO_WORKER`
//! (既定 `<dir>/kokoro_worker.py`)。各ワーカーのONNXスレッド数は `OPEN_ENGLISH_KOKORO_THREADS`(既定2)。
//! **正直な開示**: 日本語のみ(G2PがOpenJTalk)。英語など他言語は対象外(呼び出し側が404にして従来の手段へ)。

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, Mutex, OnceCell};

/// 1依頼のタイムアウト。
const JOB_TIMEOUT: Duration = Duration::from_secs(30);
/// ワーカーの起動(モデル読み込み+ウォームアップ)を待つ上限。
const START_TIMEOUT: Duration = Duration::from_secs(60);
/// ワーカーが返すWAVの上限(異常な長さの応答でメモリを使い切らない)。
const MAX_WAV_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, PartialEq)]
pub enum PoolError {
    /// 待ち行列が一杯(混雑)。
    Busy,
    Failed(String),
}

struct Job {
    line: String,
    reply: oneshot::Sender<Result<Vec<u8>, String>>,
}

pub struct Pool {
    tx: mpsc::Sender<Job>,
}

struct Settings {
    timeout: Duration,
    python: PathBuf,
    script: PathBuf,
    dir: PathBuf,
    workers: usize,
    queue: usize,
    threads: usize,
}

fn env_usize(name: &str, default: usize, min: usize, max: usize) -> usize {
    std::env::var(name).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(default).clamp(min, max)
}

fn settings() -> Option<Settings> {
    let dir = PathBuf::from(std::env::var("OPEN_ENGLISH_KOKORO_DIR").ok().filter(|s| !s.trim().is_empty())?);
    let python = std::env::var("OPEN_ENGLISH_KOKORO_PYTHON").map(PathBuf::from).unwrap_or_else(|_| dir.join("venv/bin/python"));
    let script = std::env::var("OPEN_ENGLISH_KOKORO_WORKER").map(PathBuf::from).unwrap_or_else(|_| dir.join("kokoro_worker.py"));
    Some(Settings {
        timeout: JOB_TIMEOUT,
        python,
        script,
        dir,
        workers: env_usize("OPEN_ENGLISH_KOKORO_WORKERS", 2, 1, 8),
        queue: env_usize("OPEN_ENGLISH_KOKORO_QUEUE", 6, 0, 64),
        threads: env_usize("OPEN_ENGLISH_KOKORO_THREADS", 2, 1, 16),
    })
}

/// 有効にする設定があるか(プロセスは起動しない)。
pub fn enabled() -> bool {
    settings().is_some() && !std::env::var("OPEN_ENGLISH_TTS").is_ok_and(|v| v.eq_ignore_ascii_case("off"))
}

/// 声の一覧(名前, 性別が女性か)。先生=jf_alpha、ヘルパー=jm_kumo。
pub const VOICES: &[(&str, bool)] = &[("jf_alpha", true), ("jm_kumo", false)];

struct Running {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

async fn start(s: &Settings) -> Result<Running, String> {
    let mut child = Command::new(&s.python)
        .arg(&s.script)
        .arg(&s.dir)
        .env("KOKORO_THREADS", s.threads.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("could not start the Kokoro worker: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let mut stdout = BufReader::new(child.stdout.take().ok_or("no stdout")?);
    let mut line = String::new();
    let ready = tokio::time::timeout(START_TIMEOUT, stdout.read_line(&mut line)).await;
    match ready {
        Ok(Ok(n)) if n > 0 && line.contains("\"ready\"") => Ok(Running { child, stdin, stdout }),
        _ => {
            let _ = child.kill().await;
            Err("the Kokoro worker did not become ready".into())
        }
    }
}

async fn run_job(r: &mut Running, line: &str) -> Result<Vec<u8>, String> {
    r.stdin.write_all(line.as_bytes()).await.map_err(|e| format!("worker write failed: {e}"))?;
    r.stdin.write_all(b"\n").await.map_err(|e| format!("worker write failed: {e}"))?;
    r.stdin.flush().await.map_err(|e| format!("worker write failed: {e}"))?;
    let mut head = String::new();
    let n = r.stdout.read_line(&mut head).await.map_err(|e| format!("worker read failed: {e}"))?;
    if n == 0 {
        return Err("the Kokoro worker exited".into());
    }
    let v: serde_json::Value = serde_json::from_str(head.trim()).map_err(|e| format!("bad worker reply: {e}"))?;
    if v.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        return Err(v.get("error").and_then(|x| x.as_str()).unwrap_or("synthesis failed").to_string());
    }
    let len = v.get("len").and_then(|x| x.as_u64()).ok_or("bad worker reply: no len")? as usize;
    if len > MAX_WAV_BYTES {
        return Err("the worker returned an oversized WAV".into());
    }
    let mut wav = vec![0u8; len];
    r.stdout.read_exact(&mut wav).await.map_err(|e| format!("worker read failed: {e}"))?;
    Ok(wav)
}

async fn worker_loop(s: Arc<Settings>, rx: Arc<Mutex<mpsc::Receiver<Job>>>) {
    // 最初の依頼を待たせないよう、先に起動してモデルを読み込んでおく(失敗しても依頼が来たときに再試行する)。
    let mut running: Option<Running> = start(&s).await.ok();
    loop {
        let job = { rx.lock().await.recv().await };
        let Some(job) = job else { return };
        if job.reply.is_closed() {
            continue; // 待っている間にクライアントが切断した
        }
        if running.is_none() {
            match start(&s).await {
                Ok(r) => running = Some(r),
                Err(e) => {
                    let _ = job.reply.send(Err(e));
                    continue;
                }
            }
        }
        let outcome = match running.as_mut() {
            Some(r) => tokio::time::timeout(s.timeout, run_job(r, &job.line)).await,
            None => continue,
        };
        match outcome {
            Ok(Ok(wav)) => {
                let _ = job.reply.send(Ok(wav));
            }
            Ok(Err(e)) => {
                // ワーカーが「失敗」を返しただけなら生かす。パイプ不良・終了は作り直す。
                let broken = e.contains("worker") || e.contains("exited") || e.contains("oversized");
                if broken {
                    if let Some(mut r) = running.take() {
                        let _ = r.child.kill().await;
                    }
                }
                let _ = job.reply.send(Err(e));
            }
            Err(_) => {
                if let Some(mut r) = running.take() {
                    let _ = r.child.kill().await;
                }
                let _ = job.reply.send(Err("the Kokoro worker timed out".into()));
            }
        }
    }
}

impl Pool {
    /// ワーカーを起動してプールを作る(tokioのランタイム内で呼ぶ)。
    fn spawn(s: Settings) -> Pool {
        let s = Arc::new(s);
        let (tx, rx) = mpsc::channel::<Job>(s.queue.max(1));
        let rx = Arc::new(Mutex::new(rx));
        for _ in 0..s.workers {
            tokio::spawn(worker_loop(Arc::clone(&s), Arc::clone(&rx)));
        }
        Pool { tx }
    }

    /// 依頼を出す。待ち行列が一杯なら待たずに `Busy`。
    async fn submit(&self, line: String) -> Result<Vec<u8>, PoolError> {
        let (reply, rx) = oneshot::channel();
        self.tx.try_send(Job { line, reply }).map_err(|_| PoolError::Busy)?;
        match rx.await {
            Ok(Ok(wav)) => Ok(wav),
            Ok(Err(e)) => Err(PoolError::Failed(e)),
            Err(_) => Err(PoolError::Failed("the Kokoro pool shut down".into())),
        }
    }
}

async fn pool() -> Option<&'static Pool> {
    static POOL: OnceCell<Option<Pool>> = OnceCell::const_new();
    POOL.get_or_init(|| async { settings().map(Pool::spawn) }).await.as_ref()
}

/// プールを(まだなら)作ってワーカーの起動を始める。状態の問い合わせなどで先に呼んでおくと、最初の合成が速い。
pub async fn warm() {
    let _ = pool().await;
}

/// 合成する。`voice` は `VOICES` の名前、`speed` は話速の倍率。混雑時は待たずに `Busy`。
pub async fn synthesize(voice: &str, text: &str, speed: f64) -> Result<Vec<u8>, PoolError> {
    let pool = pool().await.ok_or_else(|| PoolError::Failed("Kokoro is not configured".into()))?;
    let line = serde_json::json!({"id": 0, "text": text, "voice": voice, "speed": speed}).to_string();
    pool.submit(line).await
}

/// 状態(ワーカー数・待ち行列の長さ)。
pub fn describe() -> serde_json::Value {
    match settings() {
        Some(s) => serde_json::json!({"workers": s.workers, "queue": s.queue, "threads_per_worker": s.threads}),
        None => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// プロトコルを話す偽ワーカー(Python)。`text` が `sleep:秒` なら待ってから、`die` なら即終了、
    /// `fail` なら失敗を返し、それ以外は `text` をそのまま「WAV」として返す。
    const FAKE: &str = r#"
import sys, json, time
out = sys.stdout.buffer
out.write(b'{"ready": true}\n'); out.flush()
for line in sys.stdin:
    r = json.loads(line); t = r["text"]
    if t.startswith("sleep:"): time.sleep(float(t[6:])); t = "slept"
    if t == "die": sys.exit(1)
    if t == "fail":
        out.write(json.dumps({"id": 0, "ok": False, "error": "boom"}).encode() + b"\n"); out.flush(); continue
    b = t.encode()
    out.write(json.dumps({"id": 0, "ok": True, "len": len(b)}).encode() + b"\n"); out.write(b); out.flush()
"#;

    fn python() -> Option<PathBuf> {
        ["python3", "python"].iter().find_map(|n| {
            std::process::Command::new(n).arg("--version").output().ok().filter(|o| o.status.success()).map(|_| PathBuf::from(n))
        })
    }

    fn pool_with(workers: usize, queue: usize, timeout_ms: u64) -> Option<Pool> {
        let python = python()?;
        let dir = std::env::temp_dir().join(format!("kokoro-pool-test-{}-{workers}-{queue}-{timeout_ms}", std::process::id()));
        std::fs::create_dir_all(&dir).ok()?;
        let script = dir.join("fake_worker.py");
        std::fs::write(&script, FAKE).ok()?;
        Some(Pool::spawn(Settings { timeout: Duration::from_millis(timeout_ms), python, script, dir, workers, queue, threads: 1 }))
    }

    fn req(text: &str) -> String {
        serde_json::json!({"id": 0, "text": text, "voice": "v", "speed": 1.0}).to_string()
    }

    #[tokio::test]
    async fn returns_the_worker_output() {
        let Some(p) = pool_with(1, 2, 5000) else { return };
        assert_eq!(p.submit(req("hello")).await, Ok(b"hello".to_vec()));
        assert_eq!(p.submit(req("again")).await, Ok(b"again".to_vec())); // 同じワーカーが続けて処理する
    }

    #[tokio::test]
    async fn full_queue_is_busy_not_waiting() {
        let Some(p) = pool_with(1, 1, 5000) else { return };
        let p = Arc::new(p);
        let running = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.6")).await } });
        tokio::time::sleep(Duration::from_millis(250)).await; // 1つ目はワーカーが処理中
        let queued = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("queued")).await } });
        tokio::time::sleep(Duration::from_millis(100)).await; // 2つ目は待ち行列(容量1)
        assert_eq!(p.submit(req("third")).await, Err(PoolError::Busy)); // 3つ目は待たせず混雑
        assert_eq!(running.await.unwrap(), Ok(b"slept".to_vec()));
        assert_eq!(queued.await.unwrap(), Ok(b"queued".to_vec()));
    }

    #[tokio::test]
    async fn runs_up_to_the_worker_count_in_parallel() {
        let Some(p) = pool_with(2, 4, 5000) else { return };
        let p = Arc::new(p);
        // 先にワーカー2つを起動済みにする(Pythonの起動時間を計測に含めない)
        let w1 = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.3")).await } });
        let w2 = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.3")).await } });
        assert!(w1.await.unwrap().is_ok() && w2.await.unwrap().is_ok());
        let t = std::time::Instant::now();
        let a = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.5")).await } });
        let b = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.5")).await } });
        assert!(a.await.unwrap().is_ok() && b.await.unwrap().is_ok());
        assert!(t.elapsed() < Duration::from_millis(950), "2ワーカーなら並列(約0.5秒)のはず: {:?}", t.elapsed());
    }

    #[tokio::test]
    async fn timeout_and_crash_restart_the_worker() {
        let Some(p) = pool_with(1, 2, 400) else { return };
        assert!(matches!(p.submit(req("sleep:1.5")).await, Err(PoolError::Failed(m)) if m.contains("timed out")));
        assert_eq!(p.submit(req("after-timeout")).await, Ok(b"after-timeout".to_vec())); // 作り直されて動く
        assert!(matches!(p.submit(req("die")).await, Err(PoolError::Failed(_))));
        assert_eq!(p.submit(req("after-crash")).await, Ok(b"after-crash".to_vec()));
    }

    #[tokio::test]
    async fn a_reported_failure_keeps_the_worker_alive() {
        let Some(p) = pool_with(1, 2, 5000) else { return };
        assert_eq!(p.submit(req("fail")).await, Err(PoolError::Failed("boom".into())));
        assert_eq!(p.submit(req("ok")).await, Ok(b"ok".to_vec()));
    }

    #[tokio::test]
    async fn queued_jobs_of_disconnected_clients_are_dropped_unrun() {
        let Some(p) = pool_with(1, 4, 5000) else { return };
        let p = Arc::new(p);
        let running = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:0.5")).await } });
        tokio::time::sleep(Duration::from_millis(200)).await;
        // 待ち行列に入った依頼の呼び出し側(=クライアント)がいなくなる
        let gone = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit(req("sleep:2")).await } });
        tokio::time::sleep(Duration::from_millis(100)).await;
        gone.abort();
        let t = std::time::Instant::now();
        assert!(running.await.unwrap().is_ok());
        assert_eq!(p.submit(req("next")).await, Ok(b"next".to_vec()));
        assert!(t.elapsed() < Duration::from_millis(1500), "切断済みの依頼(2秒)を実行してしまった: {:?}", t.elapsed());
    }
}
