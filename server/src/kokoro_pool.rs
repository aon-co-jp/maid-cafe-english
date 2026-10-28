//! Kokoro(ONNX int8)日本語音声合成のワーカープール(Rustだけ。[`rs-kokoro-ja`](https://github.com/aon-co-jp/rs-kokoro-ja)を内蔵)。
//!
//! GPUの無いVPS(レンタルサーバー)のCPUで合成するための仕組み。端末に十分な演算機能が無いクライアントが、
//! `POST /v1/public/tts`(`lang: ja-*`)で依頼する。**同時実行数の上限と待ち行列**を持つ:
//! - ワーカー数 = 同時に合成できる数(各ワーカーは専用スレッドとONNXセッションを持つ。`OPEN_ENGLISH_KOKORO_WORKERS`、既定2)
//! - 待ち行列の長さ(`OPEN_ENGLISH_KOKORO_QUEUE`、既定6)を超えたら、待たせず `Busy`(HTTP 503 + `Retry-After`)。
//!   クライアントは別の手段(端末の合成・Web Speech API)へ切り替えられる。
//! - 待っている間にクライアントが切断した依頼は、実行せずに捨てる(無駄なCPUを使わない)。
//! - 依頼は30秒で打ち切って呼び出し側へエラーを返す(走り出した推論自体は止められないが、数秒で終わる)。
//!   合成中にパニックしたワーカーは、モデルを読み直して続ける。
//!
//! 有効化: cargoの機能 `kokoro`(これを付けないと辞書とONNX Runtimeを内蔵せず、バイナリが小さいまま)と、
//! `OPEN_ENGLISH_KOKORO_DIR`(`kokoro-v1.0.int8.onnx`・`voices-v1.0.bin` のあるフォルダ)。
//! 各ワーカーのONNXスレッド数は `OPEN_ENGLISH_KOKORO_THREADS`(既定2)。
//! **正直な開示**: 日本語のみ。英語など他言語は対象外(呼び出し側が404にして従来の手段へ)。

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, OnceCell};

/// 1依頼の待ち時間の上限。
const JOB_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, PartialEq)]
pub enum PoolError {
    /// 待ち行列が一杯(混雑)。
    Busy,
    Failed(String),
}

/// 1回分の合成: (文章, 声の名前, 話速) → WAV。
type SynthFn = Box<dyn FnMut(&str, &str, f32) -> Result<Vec<u8>, String> + Send>;
/// 合成器を作る(モデルを読む)。ワーカーごとに1回呼ぶ。
type Factory = Arc<dyn Fn() -> Result<SynthFn, String> + Send + Sync>;

struct Job {
    text: String,
    voice: String,
    speed: f32,
    reply: oneshot::Sender<Result<Vec<u8>, String>>,
}

pub struct Pool {
    tx: mpsc::Sender<Job>,
    timeout: Duration,
}

struct Settings {
    #[cfg_attr(not(feature = "kokoro"), allow(dead_code))]
    dir: std::path::PathBuf,
    workers: usize,
    queue: usize,
    threads: usize,
}

fn env_usize(name: &str, default: usize, min: usize, max: usize) -> usize {
    std::env::var(name).ok().and_then(|v| v.trim().parse().ok()).unwrap_or(default).clamp(min, max)
}

fn settings() -> Option<Settings> {
    let dir = std::path::PathBuf::from(std::env::var("OPEN_ENGLISH_KOKORO_DIR").ok().filter(|s| !s.trim().is_empty())?);
    Some(Settings {
        dir,
        workers: env_usize("OPEN_ENGLISH_KOKORO_WORKERS", 2, 1, 8),
        queue: env_usize("OPEN_ENGLISH_KOKORO_QUEUE", 6, 0, 64),
        threads: env_usize("OPEN_ENGLISH_KOKORO_THREADS", 2, 1, 16),
    })
}

/// 有効にできるか(機能 `kokoro` つきのビルドで、フォルダが設定されている)。プロセスは起動しない。
pub fn enabled() -> bool {
    cfg!(feature = "kokoro") && settings().is_some() && !std::env::var("OPEN_ENGLISH_TTS").is_ok_and(|v| v.eq_ignore_ascii_case("off"))
}

/// 声の一覧(名前, 性別が女性か)。先生=jf_alpha、ヘルパー=jm_kumo。
pub const VOICES: &[(&str, bool)] = &[("jf_alpha", true), ("jm_kumo", false)];

impl Pool {
    /// ワーカースレッドを起動してプールを作る(tokioのランタイム内で呼ぶ)。
    fn spawn(workers: usize, queue: usize, timeout: Duration, factory: Factory) -> Pool {
        let (tx, rx) = mpsc::channel::<Job>(queue.max(1));
        let rx = Arc::new(Mutex::new(rx));
        for n in 0..workers {
            let rx = Arc::clone(&rx);
            let factory = Arc::clone(&factory);
            let _ = std::thread::Builder::new().name(format!("kokoro-worker-{n}")).spawn(move || worker_loop(rx, factory));
        }
        Pool { tx, timeout }
    }

    /// 依頼を出す。待ち行列が一杯なら待たずに `Busy`。
    async fn submit(&self, text: &str, voice: &str, speed: f32) -> Result<Vec<u8>, PoolError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .try_send(Job { text: text.to_string(), voice: voice.to_string(), speed, reply })
            .map_err(|_| PoolError::Busy)?;
        match tokio::time::timeout(self.timeout, rx).await {
            Ok(Ok(Ok(wav))) => Ok(wav),
            Ok(Ok(Err(e))) => Err(PoolError::Failed(e)),
            Ok(Err(_)) => Err(PoolError::Failed("the Kokoro pool shut down".into())),
            Err(_) => Err(PoolError::Failed("the Kokoro worker timed out".into())),
        }
    }
}

fn worker_loop(rx: Arc<Mutex<mpsc::Receiver<Job>>>, factory: Factory) {
    // 最初の依頼を待たせないよう、先にモデルを読み込んでおく(失敗しても依頼が来たときに再試行する)。
    let mut synth: Option<SynthFn> = factory().ok();
    loop {
        let job = match rx.lock() {
            Ok(mut g) => g.blocking_recv(),
            Err(_) => return,
        };
        let Some(job) = job else { return };
        if job.reply.is_closed() {
            continue; // 待っている間にクライアントが切断した
        }
        if synth.is_none() {
            match factory() {
                Ok(s) => synth = Some(s),
                Err(e) => {
                    let _ = job.reply.send(Err(e));
                    continue;
                }
            }
        }
        let outcome = match synth.as_mut() {
            Some(s) => std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| s(&job.text, &job.voice, job.speed))),
            None => continue,
        };
        match outcome {
            Ok(r) => {
                let _ = job.reply.send(r);
            }
            Err(_) => {
                synth = None; // パニックしたら作り直す
                let _ = job.reply.send(Err("the Kokoro worker crashed".into()));
            }
        }
    }
}

#[cfg(feature = "kokoro")]
fn real_factory(s: &Settings) -> Result<Factory, String> {
    use kokoro_ja::engine::{wav_bytes, Engine, Vocab, Voices, SAMPLE_RATE};
    let g2p = Arc::new(kokoro_ja::JaG2p::new()?);
    let voices = Arc::new(Voices::load(&s.dir.join("voices-v1.0.bin"))?);
    let vocab = Arc::new(Vocab::builtin()?);
    let model = ["kokoro-v1.0.int8.onnx", "kokoro-v1.0.onnx"]
        .iter()
        .map(|n| s.dir.join(n))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("no Kokoro model in {}", s.dir.display()))?;
    let threads = s.threads;
    Ok(Arc::new(move || {
        let mut engine = Engine::load(&model, threads)?;
        let (g2p, voices, vocab) = (Arc::clone(&g2p), Arc::clone(&voices), Arc::clone(&vocab));
        let f: SynthFn = Box::new(move |text, voice, speed| {
            let phonemes = g2p.phonemes(text)?;
            let audio = engine.speak(&vocab, &voices, voice, &phonemes, speed)?;
            Ok(wav_bytes(&audio, SAMPLE_RATE))
        });
        Ok(f)
    }))
}

#[cfg(not(feature = "kokoro"))]
fn real_factory(_s: &Settings) -> Result<Factory, String> {
    Err("built without the `kokoro` feature".into())
}

async fn pool() -> Option<&'static Pool> {
    static POOL: OnceCell<Option<Pool>> = OnceCell::const_new();
    POOL.get_or_init(|| async {
        let s = settings()?;
        // 辞書・声・語彙の読み込みは重いので、非同期のスレッドを塞がない
        let (workers, queue) = (s.workers, s.queue);
        let loaded = tokio::task::spawn_blocking(move || real_factory(&s)).await.ok()?;
        match loaded {
            Ok(factory) => Some(Pool::spawn(workers, queue, JOB_TIMEOUT, factory)),
            Err(e) => {
                eprintln!("[kokoro] could not start the synthesis pool: {e}");
                None
            }
        }
    })
    .await
    .as_ref()
}

/// プールを(まだなら)作ってワーカーの起動を始める。状態の問い合わせなどで先に呼んでおくと、最初の合成が速い。
pub async fn warm() {
    let _ = pool().await;
}

/// 合成する。`voice` は `VOICES` の名前、`speed` は話速の倍率。混雑時は待たずに `Busy`。
pub async fn synthesize(voice: &str, text: &str, speed: f64) -> Result<Vec<u8>, PoolError> {
    let pool = pool().await.ok_or_else(|| PoolError::Failed("Kokoro is not configured".into()))?;
    pool.submit(text, voice, speed as f32).await
}

/// 状態(ワーカー数・待ち行列の長さ)。
pub fn describe() -> serde_json::Value {
    match settings() {
        Some(s) if cfg!(feature = "kokoro") => serde_json::json!({"workers": s.workers, "queue": s.queue, "threads_per_worker": s.threads, "engine": "rs-kokoro-ja"}),
        _ => serde_json::Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// 偽の合成器。`text` が `sleep:秒` なら待ってから、`panic` ならパニック、`fail` ならエラー、
    /// それ以外は `text` をそのまま「WAV」として返す。
    fn fake_factory(builds: Arc<AtomicUsize>) -> Factory {
        Arc::new(move || {
            builds.fetch_add(1, Ordering::SeqCst);
            let f: SynthFn = Box::new(|text, _voice, _speed| {
                let mut t = text.to_string();
                if let Some(s) = t.strip_prefix("sleep:") {
                    std::thread::sleep(Duration::from_secs_f64(s.parse().unwrap_or(0.0)));
                    t = "slept".into();
                }
                match t.as_str() {
                    "panic" => panic!("boom"),
                    "fail" => Err("boom".into()),
                    _ => Ok(t.into_bytes()),
                }
            });
            Ok(f)
        })
    }

    fn pool_with(workers: usize, queue: usize, timeout_ms: u64) -> (Pool, Arc<AtomicUsize>) {
        let builds = Arc::new(AtomicUsize::new(0));
        (Pool::spawn(workers, queue, Duration::from_millis(timeout_ms), fake_factory(Arc::clone(&builds))), builds)
    }

    async fn warm_up(p: &Pool) {
        assert!(p.submit("warm", "v", 1.0).await.is_ok());
    }

    #[tokio::test]
    async fn returns_the_synth_output() {
        let (p, _) = pool_with(1, 2, 5000);
        assert_eq!(p.submit("hello", "v", 1.0).await, Ok(b"hello".to_vec()));
        assert_eq!(p.submit("again", "v", 1.0).await, Ok(b"again".to_vec()));
    }

    #[tokio::test]
    async fn full_queue_is_busy_not_waiting() {
        let (p, _) = pool_with(1, 1, 5000);
        warm_up(&p).await;
        let p = Arc::new(p);
        let running = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.6", "v", 1.0).await } });
        tokio::time::sleep(Duration::from_millis(250)).await; // 1つ目はワーカーが処理中
        let queued = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("queued", "v", 1.0).await } });
        tokio::time::sleep(Duration::from_millis(100)).await; // 2つ目は待ち行列(容量1)
        assert_eq!(p.submit("third", "v", 1.0).await, Err(PoolError::Busy)); // 3つ目は待たせず混雑
        assert_eq!(running.await.unwrap(), Ok(b"slept".to_vec()));
        assert_eq!(queued.await.unwrap(), Ok(b"queued".to_vec()));
    }

    #[tokio::test]
    async fn runs_up_to_the_worker_count_in_parallel() {
        let (p, _) = pool_with(2, 4, 5000);
        let p = Arc::new(p);
        let (w1, w2) = (
            tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.2", "v", 1.0).await } }),
            tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.2", "v", 1.0).await } }),
        );
        assert!(w1.await.unwrap().is_ok() && w2.await.unwrap().is_ok());
        let t = std::time::Instant::now();
        let a = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.5", "v", 1.0).await } });
        let b = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.5", "v", 1.0).await } });
        assert!(a.await.unwrap().is_ok() && b.await.unwrap().is_ok());
        assert!(t.elapsed() < Duration::from_millis(950), "2ワーカーなら並列(約0.5秒)のはず: {:?}", t.elapsed());
    }

    #[tokio::test]
    async fn timeout_reports_an_error_and_the_pool_keeps_working() {
        let (p, _) = pool_with(1, 2, 300);
        assert!(matches!(p.submit("sleep:0.8", "v", 1.0).await, Err(PoolError::Failed(m)) if m.contains("timed out")));
        tokio::time::sleep(Duration::from_millis(700)).await; // 走り出した推論(0.8秒)が終わるのを待つ
        assert_eq!(p.submit("after", "v", 1.0).await, Ok(b"after".to_vec())); // 走り出した推論が終われば続けて動く
    }

    #[tokio::test]
    async fn a_panic_rebuilds_the_synth_and_a_reported_failure_does_not() {
        let (p, builds) = pool_with(1, 2, 5000);
        warm_up(&p).await;
        assert_eq!(builds.load(Ordering::SeqCst), 1);
        assert_eq!(p.submit("fail", "v", 1.0).await, Err(PoolError::Failed("boom".into())));
        assert_eq!(builds.load(Ordering::SeqCst), 1); // 失敗を返しただけなら作り直さない
        assert!(matches!(p.submit("panic", "v", 1.0).await, Err(PoolError::Failed(m)) if m.contains("crashed")));
        assert_eq!(p.submit("ok", "v", 1.0).await, Ok(b"ok".to_vec()));
        assert_eq!(builds.load(Ordering::SeqCst), 2); // パニックの後は作り直した
    }

    #[tokio::test]
    async fn queued_jobs_of_disconnected_clients_are_dropped_unrun() {
        let (p, _) = pool_with(1, 4, 5000);
        warm_up(&p).await;
        let p = Arc::new(p);
        let running = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:0.5", "v", 1.0).await } });
        tokio::time::sleep(Duration::from_millis(200)).await;
        let gone = tokio::spawn({ let p = Arc::clone(&p); async move { p.submit("sleep:2", "v", 1.0).await } });
        tokio::time::sleep(Duration::from_millis(100)).await;
        gone.abort(); // 待ち行列に入った依頼の呼び出し側(=クライアント)がいなくなる
        let t = std::time::Instant::now();
        assert!(running.await.unwrap().is_ok());
        assert_eq!(p.submit("next", "v", 1.0).await, Ok(b"next".to_vec()));
        assert!(t.elapsed() < Duration::from_millis(1500), "切断済みの依頼(2秒)を実行してしまった: {:?}", t.elapsed());
    }
}
