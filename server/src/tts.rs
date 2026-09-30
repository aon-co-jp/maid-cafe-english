//! サーバー側の音声合成(open-englishのローカル版・ミックス版、2026-09-30新設)。
//!
//! WEB版はブラウザのWeb Speech APIで読み上げるが、その出力音声はスクリプトから取り出せず、声質の加工ができない
//! (`app.js`の`enqueueSpeech`参照)。ローカルサーバーは、OSの音声合成(現状はWindowsのSAPIのみ)で作ったWAVを、
//! RPoemの共有クレート`open-runo-voice`で加工して(先生=メイド風、ヘルパー=太く低い男性)返せる。
//! クライアントは`GET /v1/public/tts/status`で使えるか確かめ、使えなければ従来のWeb Speech APIへフォールバックする。
//!
//! - `POST /v1/public/tts` — `{"text": "...", "lang": "en-US", "persona": "teacher"|"helper", "harmony": false}` → `audio/wav`
//! - `GET  /v1/public/tts/status` — `{"available": bool, "engine": "windows-sapi"|null, "voices": [...]}`
//!
//! **正直な開示**:
//! - 実装はWindowsのSAPI(PowerShell経由)のみ。macOS/Linux/VPSでは`available: false`を返し、クライアントはWeb Speech APIを使う。
//! - 声の元は、OSにインストールされた音声。言語ごとに選ぶので、その言語の音声が無ければ404を返す(クライアントはその発話だけ
//!   Web Speech APIへフォールバックする)。
//! - 測っているのはスペクトル包絡の近さ等の数値で、聴感品質は評価していない。加工は元のTTS音声の質を超えない。
//! - 環境変数`OPEN_ENGLISH_TTS=off`で無効化できる。

use open_runo_voice::{parse_wav, render, wav_bytes, SourceGender, VoiceStyle};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::{read_rs_json_body, rs_json_response, Request, Response, StatusCode};

/// 1回の合成で受け付ける最大文字数(クライアントは110文字程度に分割して送る)。
pub const MAX_TEXT_CHARS: usize = 600;
/// 同時に走らせる合成(PowerShellプロセス)の数。
const MAX_CONCURRENT: usize = 2;
/// キャッシュする音声の数(同じ発話の再生を速くする)。
const CACHE_ENTRIES: usize = 64;

/// 先生(メイド風)とヘルパー(太く低い男性)。`app.js`の`isHelper`に対応。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Persona {
    Teacher,
    Helper,
}

impl Persona {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "teacher" | "" => Some(Persona::Teacher),
            "helper" => Some(Persona::Helper),
            _ => None,
        }
    }

    fn style(self) -> VoiceStyle {
        match self {
            Persona::Teacher => VoiceStyle::Maid,
            Persona::Helper => VoiceStyle::DeepMale,
        }
    }

    /// 話速の倍率。`app.js`のWeb Speech版(先生 rate 0.82、ヘルパー 1.05)と同じ。
    fn rate(self) -> f64 {
        match self {
            Persona::Teacher => 0.82,
            Persona::Helper => 1.05,
        }
    }
}

/// OSにインストールされている音声。
#[derive(Clone, Debug, PartialEq)]
pub struct OsVoice {
    pub name: String,
    pub culture: String,
    pub gender: SourceGender,
}

#[derive(Debug, PartialEq)]
pub enum TtsError {
    /// この環境には音声合成エンジンが無い(Windows以外、または音声が1つも無い)。
    Unavailable,
    /// その言語の音声が無い。
    NoVoice(String),
    BadRequest(String),
    Failed(String),
}

#[derive(serde::Deserialize)]
struct TtsBody {
    text: String,
    #[serde(default)]
    lang: Option<String>,
    #[serde(default)]
    persona: Option<String>,
    #[serde(default)]
    harmony: bool,
}

/// 検証済みの合成リクエスト。
#[derive(Clone, Debug, PartialEq)]
pub struct Validated {
    pub text: String,
    pub lang: String,
    pub persona: Persona,
    pub harmony: bool,
}

fn validate(body: TtsBody) -> Result<Validated, TtsError> {
    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(TtsError::BadRequest("text is empty".into()));
    }
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(TtsError::BadRequest(format!("text is too long (max {MAX_TEXT_CHARS} characters)")));
    }
    let lang = body.lang.unwrap_or_else(|| "en-US".into());
    if lang.len() > 16 || !lang.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(TtsError::BadRequest("invalid lang".into()));
    }
    let persona = Persona::parse(body.persona.as_deref().unwrap_or("")).ok_or_else(|| TtsError::BadRequest("unknown persona".into()))?;
    Ok(Validated { text, lang, persona, harmony: body.harmony })
}

/// 言語(`en-US`等)と人物に合う音声を選ぶ。言語の一致(先頭のサブタグ)が必須で、同じ言語なら完全一致(`en-US`)を優先し、
/// 先生は女性、ヘルパーは男性の声を優先する。その言語の音声が無ければ`None`。
pub fn pick_voice<'a>(voices: &'a [OsVoice], lang: &str, persona: Persona) -> Option<&'a OsVoice> {
    let primary = lang.split('-').next().unwrap_or("").to_ascii_lowercase();
    let mut candidates: Vec<&OsVoice> = voices.iter().filter(|v| v.culture.to_ascii_lowercase().split('-').next() == Some(primary.as_str())).collect();
    let want = if persona == Persona::Helper { SourceGender::Male } else { SourceGender::Female };
    // 安定ソート: 完全一致、次に性別の一致、の順に優先
    candidates.sort_by_key(|v| (!v.culture.eq_ignore_ascii_case(lang), v.gender != want));
    candidates.first().copied()
}

/// 話速の倍率(1.0=標準)をSAPIのRate(-10..10)へ。おおむね-10が約1/3倍、+10が約3倍。
pub fn rate_step(multiplier: f64) -> i32 {
    ((10.0 * multiplier.ln() / 3f64.ln()).round() as i32).clamp(-10, 10)
}

// ── 小さなキャッシュ ──────────────────────────────────────────────

#[derive(Default)]
struct Cache {
    map: HashMap<String, Arc<Vec<u8>>>,
    order: VecDeque<String>,
}

impl Cache {
    fn get(&self, key: &str) -> Option<Arc<Vec<u8>>> {
        self.map.get(key).cloned()
    }

    fn put(&mut self, key: String, value: Arc<Vec<u8>>, cap: usize) {
        if self.map.insert(key.clone(), value).is_none() {
            self.order.push_back(key);
        }
        while self.order.len() > cap {
            if let Some(old) = self.order.pop_front() {
                self.map.remove(&old);
            }
        }
    }
}

fn cache() -> &'static Mutex<Cache> {
    static C: OnceLock<Mutex<Cache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(Cache::default()))
}

fn cache_key(v: &Validated, voice: &OsVoice) -> String {
    format!("{}|{}|{:?}|{}|{}", voice.name, v.lang, v.persona, v.harmony, v.text)
}

// ── エンジン(OSの音声合成) ─────────────────────────────────────

fn disabled_by_env() -> bool {
    std::env::var("OPEN_ENGLISH_TTS").map(|v| v.eq_ignore_ascii_case("off")).unwrap_or(false)
}

/// インストール済みの音声(短時間キャッシュ。空なら短く、あれば長く)。
async fn voices() -> Vec<OsVoice> {
    if disabled_by_env() {
        return Vec::new();
    }
    static CACHE: OnceLock<Mutex<Option<(Instant, Vec<OsVoice>)>>> = OnceLock::new();
    let cell = CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(g) = cell.lock() {
        if let Some((at, v)) = g.as_ref() {
            let ttl = if v.is_empty() { Duration::from_secs(30) } else { Duration::from_secs(600) };
            if at.elapsed() < ttl {
                return v.clone();
            }
        }
    }
    let listed = engine::list_voices().await;
    if let Ok(mut g) = cell.lock() {
        *g = Some((Instant::now(), listed.clone()));
    }
    listed
}

/// 合成して、加工済みのWAV(16bit・モノラル)を返す。
pub async fn synthesize(v: &Validated) -> Result<Arc<Vec<u8>>, TtsError> {
    let all = voices().await;
    if all.is_empty() {
        return Err(TtsError::Unavailable);
    }
    let voice = pick_voice(&all, &v.lang, v.persona).ok_or_else(|| TtsError::NoVoice(v.lang.clone()))?.clone();
    let key = cache_key(v, &voice);
    if let Some(hit) = cache().lock().ok().and_then(|c| c.get(&key)) {
        return Ok(hit);
    }
    static LIMIT: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
    let limit = LIMIT.get_or_init(|| tokio::sync::Semaphore::new(MAX_CONCURRENT));
    let _permit = limit.acquire().await.map_err(|e| TtsError::Failed(e.to_string()))?;
    let raw = engine::synthesize_wav(&voice, &v.text, rate_step(v.persona.rate())).await?;
    let pcm = parse_wav(&raw).ok_or_else(|| TtsError::Failed("could not read the engine output as 16-bit PCM WAV".into()))?;
    if pcm.samples.len() < pcm.sample_rate as usize / 20 {
        return Err(TtsError::Failed("the engine produced (almost) no audio".into()));
    }
    let out = render(&pcm, v.persona.style(), voice.gender, v.harmony, 1.0);
    let wav = Arc::new(wav_bytes(&out));
    if let Ok(mut c) = cache().lock() {
        c.put(key, wav.clone(), CACHE_ENTRIES);
    }
    Ok(wav)
}

#[cfg(windows)]
mod engine {
    use super::{OsVoice, TtsError};
    use open_runo_voice::SourceGender;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    pub const NAME: &str = "windows-sapi";
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    const HEADER: &str = "[Console]::OutputEncoding = [Text.Encoding]::UTF8\nAdd-Type -AssemblyName System.Speech\n";

    fn list_script() -> String {
        format!(
            "{HEADER}$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n\
             $s.GetInstalledVoices() | Where-Object {{ $_.Enabled }} | ForEach-Object {{\n\
             \x20   $_.VoiceInfo.Name + \"`t\" + $_.VoiceInfo.Culture.Name + \"`t\" + $_.VoiceInfo.Gender\n}}\n"
        )
    }

    fn synth_script() -> String {
        format!(
            "param([string]$InFile, [string]$OutFile, [string]$Voice, [int]$Rate)\n{HEADER}\
             $s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n\
             $s.SelectVoice($Voice)\n$s.Rate = $Rate\n\
             $text = [IO.File]::ReadAllText($InFile, [Text.Encoding]::UTF8)\n\
             $s.SetOutputToWaveFile($OutFile)\n$s.Speak($text)\n$s.SetOutputToNull()\n"
        )
    }

    fn gender(s: &str) -> SourceGender {
        match s.trim().to_ascii_lowercase().as_str() {
            "female" => SourceGender::Female,
            "male" => SourceGender::Male,
            _ => SourceGender::Unknown,
        }
    }

    /// Windows PowerShell 5.1は、BOMなしUTF-8のスクリプトを日本語コードページで読むので、BOMを付けて書く。
    fn write_script(dir: &Path, name: &str, body: &str) -> std::io::Result<PathBuf> {
        let path = dir.join(name);
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(body.as_bytes());
        std::fs::write(&path, bytes)?;
        Ok(path)
    }

    fn work_dir() -> std::io::Result<PathBuf> {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!("open-english-tts-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    async fn powershell(args: Vec<String>, timeout: Duration) -> Result<String, TtsError> {
        let mut cmd = tokio::process::Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]).args(args);
        cmd.stdin(std::process::Stdio::null()).kill_on_drop(true).creation_flags(CREATE_NO_WINDOW);
        let out = tokio::time::timeout(timeout, cmd.output())
            .await
            .map_err(|_| TtsError::Failed("speech engine timed out".into()))?
            .map_err(|e| TtsError::Failed(format!("could not start powershell: {e}")))?;
        if !out.status.success() {
            return Err(TtsError::Failed(format!("speech engine failed: {}", String::from_utf8_lossy(&out.stderr).trim())));
        }
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    pub async fn list_voices() -> Vec<OsVoice> {
        let Ok(dir) = work_dir() else { return Vec::new() };
        let result = async {
            let script = write_script(&dir, "list.ps1", &list_script()).map_err(|e| TtsError::Failed(e.to_string()))?;
            powershell(vec!["-File".into(), script.display().to_string()], Duration::from_secs(30)).await
        }
        .await;
        let _ = std::fs::remove_dir_all(&dir);
        result
            .map(|out| {
                out.lines()
                    .filter_map(|l| {
                        let p: Vec<&str> = l.trim_end_matches('\r').split('\t').collect();
                        (p.len() >= 3).then(|| OsVoice { name: p[0].to_string(), culture: p[1].to_string(), gender: gender(p[2]) })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 1回の発話をWAVにする。文章はファイル経由で渡す(コマンドラインに埋め込まないので、引用符等でのインジェクションが起きない)。
    pub async fn synthesize_wav(voice: &OsVoice, text: &str, rate: i32) -> Result<Vec<u8>, TtsError> {
        let dir = work_dir().map_err(|e| TtsError::Failed(e.to_string()))?;
        let result = async {
            let script = write_script(&dir, "synth.ps1", &synth_script()).map_err(|e| TtsError::Failed(e.to_string()))?;
            let input = dir.join("in.txt");
            let output = dir.join("out.wav");
            std::fs::write(&input, text.as_bytes()).map_err(|e| TtsError::Failed(e.to_string()))?;
            powershell(
                vec![
                    "-File".into(),
                    script.display().to_string(),
                    "-InFile".into(),
                    input.display().to_string(),
                    "-OutFile".into(),
                    output.display().to_string(),
                    "-Voice".into(),
                    voice.name.clone(),
                    "-Rate".into(),
                    rate.to_string(),
                ],
                Duration::from_secs(60),
            )
            .await?;
            std::fs::read(&output).map_err(|e| TtsError::Failed(format!("no output WAV: {e}")))
        }
        .await;
        let _ = std::fs::remove_dir_all(&dir);
        result
    }
}

#[cfg(not(windows))]
mod engine {
    use super::{OsVoice, TtsError};

    pub const NAME: &str = "none";

    pub async fn list_voices() -> Vec<OsVoice> {
        Vec::new()
    }

    pub async fn synthesize_wav(_voice: &OsVoice, _text: &str, _rate: i32) -> Result<Vec<u8>, TtsError> {
        Err(TtsError::Unavailable)
    }
}

// ── HTTPハンドラ ─────────────────────────────────────────────────

/// `GET /v1/public/tts/status`
pub async fn status() -> Response {
    let voices = voices().await;
    let available = !voices.is_empty();
    rs_json_response(
        StatusCode::OK,
        &serde_json::json!({
            "available": available,
            "engine": if available { Some(engine::NAME) } else { None },
            "voices": voices.iter().map(|v| serde_json::json!({"name": v.name, "culture": v.culture})).collect::<Vec<_>>(),
            "max_text_chars": MAX_TEXT_CHARS,
        }),
    )
}

/// `POST /v1/public/tts`
pub async fn handle(req: Request) -> Response {
    let body: TtsBody = match read_rs_json_body(req).await {
        Ok(b) => b,
        Err(resp) => return resp,
    };
    let validated = match validate(body) {
        Ok(v) => v,
        Err(e) => return error_response(e),
    };
    match synthesize(&validated).await {
        Ok(wav) => hyper::Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "audio/wav")
            .header("cache-control", "private, max-age=3600")
            .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(wav.as_ref().clone())))
            .unwrap_or_else(|_| rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": "failed to build the response"}))),
        Err(e) => error_response(e),
    }
}

fn error_response(e: TtsError) -> Response {
    let (status, msg, code) = match e {
        TtsError::Unavailable => (StatusCode::NOT_IMPLEMENTED, "server-side speech synthesis is not available on this machine".to_string(), "unavailable"),
        TtsError::NoVoice(lang) => (StatusCode::NOT_FOUND, format!("no installed voice for {lang}"), "no_voice"),
        TtsError::BadRequest(m) => (StatusCode::BAD_REQUEST, m, "bad_request"),
        TtsError::Failed(m) => (StatusCode::BAD_GATEWAY, m, "failed"),
    };
    // クライアント(app.js)は、200以外ならその発話だけWeb Speech APIへフォールバックする。
    rs_json_response(status, &serde_json::json!({"error": msg, "code": code, "fallback": true}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(name: &str, culture: &str, gender: SourceGender) -> OsVoice {
        OsVoice { name: name.into(), culture: culture.into(), gender }
    }

    fn body(text: &str) -> TtsBody {
        TtsBody { text: text.into(), lang: None, persona: None, harmony: false }
    }

    #[test]
    fn pick_voice_needs_the_language_and_prefers_exact_culture_and_gender() {
        let voices = vec![
            v("Haruka", "ja-JP", SourceGender::Female),
            v("Zira", "en-US", SourceGender::Female),
            v("David", "en-US", SourceGender::Male),
            v("Hazel", "en-GB", SourceGender::Female),
        ];
        assert_eq!("Zira", pick_voice(&voices, "en-US", Persona::Teacher).unwrap().name);
        assert_eq!("David", pick_voice(&voices, "en-US", Persona::Helper).unwrap().name);
        assert_eq!("Hazel", pick_voice(&voices, "en-GB", Persona::Teacher).unwrap().name);
        // en-AUは無いが、同じ言語(en)の別地域の声を使う。完全一致は無いので性別で選ぶ
        assert_eq!("David", pick_voice(&voices, "en-AU", Persona::Helper).unwrap().name);
        assert_eq!("Haruka", pick_voice(&voices, "ja-JP", Persona::Helper).unwrap().name); // 男性が無くても、その言語の声は使う
        assert!(pick_voice(&voices, "fr-FR", Persona::Teacher).is_none());
        assert!(pick_voice(&[], "en-US", Persona::Teacher).is_none());
    }

    #[test]
    fn rate_step_matches_the_web_speech_rates() {
        assert_eq!(0, rate_step(1.0));
        assert_eq!(10, rate_step(3.0));
        assert_eq!(-10, rate_step(1.0 / 3.0));
        assert_eq!(-2, rate_step(Persona::Teacher.rate())); // 0.82: ゆっくり
        assert_eq!(0, rate_step(Persona::Helper.rate())); // 1.05: ほぼ標準
        assert_eq!(10, rate_step(100.0));
    }

    #[test]
    fn validation_rejects_bad_requests() {
        assert!(matches!(validate(body("   ")), Err(TtsError::BadRequest(_))));
        assert!(matches!(validate(body(&"a".repeat(MAX_TEXT_CHARS + 1))), Err(TtsError::BadRequest(_))));
        assert!(validate(body(&"あ".repeat(MAX_TEXT_CHARS))).is_ok()); // 文字数で数える(バイトではない)
        let mut b = body("hi");
        b.lang = Some("en-US; rm -rf".into());
        assert!(matches!(validate(b), Err(TtsError::BadRequest(_))));
        let mut b = body("hi");
        b.persona = Some("villain".into());
        assert!(matches!(validate(b), Err(TtsError::BadRequest(_))));
    }

    #[test]
    fn validation_applies_defaults_and_trims() {
        let ok = validate(body("  Hello  ")).unwrap();
        assert_eq!(Validated { text: "Hello".into(), lang: "en-US".into(), persona: Persona::Teacher, harmony: false }, ok);
        let mut b = body("こんにちは");
        b.lang = Some("ja-JP".into());
        b.persona = Some("helper".into());
        b.harmony = true;
        let ok = validate(b).unwrap();
        assert_eq!((Persona::Helper, true, "ja-JP"), (ok.persona, ok.harmony, ok.lang.as_str()));
    }

    #[test]
    fn cache_evicts_the_oldest_entries() {
        let mut c = Cache::default();
        for i in 0..5 {
            c.put(format!("k{i}"), Arc::new(vec![i as u8]), 3);
        }
        assert!(c.get("k0").is_none() && c.get("k1").is_none());
        assert_eq!(Some(vec![4u8]), c.get("k4").map(|a| a.to_vec()));
        assert_eq!(3, c.map.len());
        // 同じキーの上書きでは、順序の長さが増えない
        c.put("k4".into(), Arc::new(vec![9]), 3);
        assert_eq!(3, c.order.len());
    }

    #[test]
    fn cache_key_separates_voice_persona_harmony_and_text() {
        let a = Validated { text: "hi".into(), lang: "en-US".into(), persona: Persona::Teacher, harmony: false };
        let zira = v("Zira", "en-US", SourceGender::Female);
        let mut keys = std::collections::HashSet::new();
        keys.insert(cache_key(&a, &zira));
        keys.insert(cache_key(&Validated { persona: Persona::Helper, ..a.clone() }, &zira));
        keys.insert(cache_key(&Validated { harmony: true, ..a.clone() }, &zira));
        keys.insert(cache_key(&Validated { text: "ho".into(), ..a.clone() }, &zira));
        keys.insert(cache_key(&a, &v("David", "en-US", SourceGender::Male)));
        assert_eq!(5, keys.len());
    }

    /// 実機のSAPIで合成→加工まで通す(Windowsで英語の音声が入っているときだけ。無ければスキップ)。
    #[cfg(windows)]
    #[tokio::test]
    async fn real_sapi_synthesizes_and_processes_english() {
        let all = voices().await;
        if pick_voice(&all, "en-US", Persona::Teacher).is_none() {
            eprintln!("SKIP: no en voice installed");
            return;
        }
        for (persona, harmony) in [(Persona::Teacher, false), (Persona::Helper, false), (Persona::Teacher, true)] {
            let req = Validated { text: "Welcome back. Let us practice English together.".into(), lang: "en-US".into(), persona, harmony };
            let wav = synthesize(&req).await.expect("synthesis works");
            let pcm = parse_wav(&wav).expect("output is a 16-bit PCM WAV");
            assert!(pcm.seconds() > 1.0 && pcm.seconds() < 15.0, "duration {}", pcm.seconds());
            let rms = (pcm.samples.iter().map(|x| (*x as f64).powi(2)).sum::<f64>() / pcm.samples.len() as f64).sqrt();
            let peak = pcm.samples.iter().fold(0f32, |m, x| m.max(x.abs()));
            assert!((0.05..0.3).contains(&rms), "rms {rms} (音量が統一されているはず)");
            assert!(peak <= 0.92, "peak {peak}");
            // 2回目はキャッシュから同じ音声が返る
            let again = synthesize(&req).await.unwrap();
            assert!(Arc::ptr_eq(&wav, &again), "cache miss");
        }
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn missing_language_is_reported_as_no_voice() {
        let all = voices().await;
        if all.is_empty() || pick_voice(&all, "xx-XX", Persona::Teacher).is_some() {
            return;
        }
        let req = Validated { text: "hello".into(), lang: "xx-XX".into(), persona: Persona::Teacher, harmony: false };
        assert_eq!(Err(TtsError::NoVoice("xx-XX".into())), synthesize(&req).await.map(|_| ()));
    }
}
