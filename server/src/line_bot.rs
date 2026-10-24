//! LINE公式アカウント版 maid-cafe-english(ユーザー指示 2026-10-24「この内容をLINEアプリでも実現したい。
//! LINEアプリでは、マウスの代わりに数字で選択できるようにして」)。
//!
//! - Webhook: `POST /v1/line/webhook`(LINE Developersの「Webhook URL」には
//!   `https://easy-web.tokyo/maid-cafe-english/v1/line/webhook` を設定する)。
//! - 署名検証: `X-Line-Signature` = Base64(HMAC-SHA256(チャネルシークレット, 生のボディ))。
//!   一致しない要求は処理しない。`LINE_CHANNEL_SECRET`未設定なら503(何もしない)。
//! - 返信: `LINE_CHANNEL_ACCESS_TOKEN`でReply APIを呼ぶ。AIの返答はWEB版と同じaruaru-llmの
//!   `complete-priority`を使う(共有ニュースストックも自動で差し込まれる)。
//! - 操作は全て**数字**: メニューの番号を送る。どの画面でも `0` でメニューへ戻る。
//! - 状態(レベル・学ぶ言語・研修の進み具合・直近の会話)はメモリ上のみ(再起動で初期化)。
//!   会話内容は保存しない(個人情報を含みうるため)。

use std::collections::HashMap;
use std::sync::Mutex;

use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::{Request, Response, StatusCode};

const LEVELS: [&str; 3] = ["Beginner / 初級", "Intermediate / 中級", "Advanced / 上級"];
const LANGS: [&str; 9] = ["English", "Japanese", "German", "French", "Spanish", "Italian", "Russian", "Thai", "Vietnamese"];
const MAX_SESSIONS: usize = 5000;
const MAX_REPLY_CHARS: usize = 4500;
const MAX_CONCURRENT_EVENTS: usize = 16;

/// メイドカフェ英会話研修のフレーズ(日本語, 英語)。
const TRAINING: [(&str, &str); 8] = [
    ("お帰りなさいませ、ご主人様!", "Welcome home, Master!"),
    ("ご注文はお決まりですか?", "Are you ready to order?"),
    ("当店は1時間ごとにチャージ料がかかります。", "There is a seating fee per hour."),
    ("美味しくなるおまじないをかけましょう!", "Let's cast a magic spell to make it delicious!"),
    ("私の真似をしてハートを作ってください。", "Please make a heart shape with your hands and repeat after me!"),
    ("一緒に記念写真を撮りましょう!", "Would you like to take a souvenir photo with me?"),
    ("キャストに触れないでください。", "Please do not touch the maids."),
    ("いってらっしゃいませ、ご主人様!", "Have a wonderful day, Master!"),
];

const REFERENCES: &str = "📚 参考リンク\n\
1) https://aonceo.blogspot.com/2026/10/blog-post_23.html\n\
2) めいどりーみん: https://maidreamin.com/recruit/special/detail.html?id=4168\n\
3) kimini英会話: https://kimini.online/blog/archives/91887";

/// 先生のキャラクター。メイドちゃん=かわいい女性の声、執事(男性)=男性の声で読み上げる。
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Character {
    Maid,
    Butler,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mode {
    Menu,
    PickChar,
    Chat,
    News,
    Training(usize),
    PickLevel,
    PickLang,
}

#[derive(Clone, Debug)]
pub struct Session {
    mode: Mode,
    level: usize,
    lang: usize,
    character: Character,
    voice: bool,
    history: Vec<(String, String)>,
}

impl Default for Session {
    fn default() -> Self {
        Session { mode: Mode::Menu, level: 0, lang: 0, character: Character::Maid, voice: true, history: Vec::new() }
    }
}

/// 1回の入力に対する結果。`Llm`はAIへの問い合わせが要る場合。
#[derive(Debug, PartialEq)]
pub enum Step {
    Text(String),
    Llm { prompt: String, prefix: String },
}

fn menu_text(s: &Session) -> String {
    format!(
        "☕ メイドカフェ英会話 / Maid Cafe English\n数字を送って選んでください。\n\n\
         1. 英会話レッスン(自由会話)\n2. メイドカフェ英会話研修(フレーズ練習)\n3. レベル変更(いま: {})\n\
         4. 学ぶ言語変更(いま: {})\n5. 参考リンク\n6. ニュースで会話\n\
         7. 先生を選ぶ(いま: {})\n8. 音声の返事 ON/OFF(いま: {})\n\n0. いつでもメニューに戻る\n\
         🎤 LINEの音声メッセージ(マイク)で話しかけても、文字で送ってもOKです。",
        LEVELS[s.level],
        LANGS[s.lang],
        if s.character == Character::Maid { "メイドちゃん" } else { "執事(男性)" },
        if s.voice { "ON" } else { "OFF" }
    )
}

/// 全角数字を半角にし、前後の空白を除く。
fn normalize(input: &str) -> String {
    input
        .trim()
        .chars()
        .map(|c| if ('０'..='９').contains(&c) { char::from_u32(c as u32 - '０' as u32 + '0' as u32).unwrap_or(c) } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

fn training_prompt(i: usize) -> String {
    let (jp, _) = TRAINING[i];
    format!(
        "🎀 研修 {}/{}\n日本語: {}\n英語で言ってみてください。\n\n1. 答えを見る  2. 次へ  0. メニュー",
        i + 1,
        TRAINING.len(),
        jp
    )
}

fn persona(s: &Session) -> String {
    let who = if s.character == Character::Maid { "cheerful, cute maid" } else { "polite, gentle male butler" };
    format!(
        "You are a {who} and a friendly {lang} conversation trainer at a maid cafe, helping the student practice {lang}. Student level: {level}. Keep your reply to at most 3 short sentences, praise the attempt, correct mistakes gently, and add one short Japanese translation line.",
        lang = LANGS[s.lang],
        level = LEVELS[s.level]
    )
}

pub fn step(s: &mut Session, raw: &str) -> Step {
    let t = normalize(raw);
    if t == "0" || t.is_empty() {
        s.mode = Mode::Menu;
        s.history.clear();
        return Step::Text(menu_text(s));
    }
    match s.mode {
        Mode::Menu => match t.as_str() {
            "1" => {
                s.mode = Mode::Chat;
                Step::Text(format!("💬 英会話レッスン({})\n何でも話しかけてください。\n(0 でメニューに戻ります)", LANGS[s.lang]))
            }
            "2" => {
                s.mode = Mode::Training(0);
                Step::Text(training_prompt(0))
            }
            "3" => {
                s.mode = Mode::PickLevel;
                Step::Text("レベルを選んでください。\n1. 初級\n2. 中級\n3. 上級\n0. 戻る".to_string())
            }
            "4" => {
                s.mode = Mode::PickLang;
                let list: Vec<String> = LANGS.iter().enumerate().map(|(i, l)| format!("{}. {}", i + 1, l)).collect();
                Step::Text(format!("学ぶ言語を選んでください。\n{}\n0. 戻る", list.join("\n")))
            }
            "5" => Step::Text(format!("{REFERENCES}\n\n0. メニュー")),
            "6" => {
                s.mode = Mode::News;
                Step::Text("📰 ニュースで会話\n国名か話題を英語で送ってください(例: Japan, Spain)。\n(0 でメニューに戻ります)".to_string())
            }
            "7" => {
                s.mode = Mode::PickChar;
                Step::Text("先生を選んでください。\n1. メイドちゃん(かわいい女性の声)\n2. 執事(男性の声)\n0. 戻る".to_string())
            }
            "8" => {
                s.voice = !s.voice;
                Step::Text(format!("音声の返事を {} にしました。\n\n{}", if s.voice { "ON" } else { "OFF" }, menu_text(s)))
            }
            _ => Step::Text(format!("数字で選んでください。\n\n{}", menu_text(s))),
        },
        Mode::PickChar => match t.as_str() {
            "1" | "2" => {
                s.character = if t == "1" { Character::Maid } else { Character::Butler };
                s.mode = Mode::Menu;
                let hello = if s.character == Character::Maid { "Welcome home, Master! 🎀" } else { "Welcome back, my lord." };
                Step::Text(format!("{hello}\n\n{}", menu_text(s)))
            }
            _ => Step::Text("1 か 2 を選んでください。 0 で戻る".to_string()),
        },
        Mode::PickLevel => match t.parse::<usize>() {
            Ok(n) if (1..=LEVELS.len()).contains(&n) => {
                s.level = n - 1;
                s.mode = Mode::Menu;
                Step::Text(format!("レベルを {} にしました。\n\n{}", LEVELS[s.level], menu_text(s)))
            }
            _ => Step::Text("1〜3 の数字で選んでください。 0 で戻る".to_string()),
        },
        Mode::PickLang => match t.parse::<usize>() {
            Ok(n) if (1..=LANGS.len()).contains(&n) => {
                s.lang = n - 1;
                s.mode = Mode::Menu;
                Step::Text(format!("学ぶ言語を {} にしました。\n\n{}", LANGS[s.lang], menu_text(s)))
            }
            _ => Step::Text(format!("1〜{} の数字で選んでください。 0 で戻る", LANGS.len())),
        },
        Mode::Training(i) => match t.as_str() {
            "1" => Step::Text(format!("✅ 答え: {}\n\n2. 次へ  0. メニュー", TRAINING[i].1)),
            "2" => {
                let next = (i + 1) % TRAINING.len();
                s.mode = Mode::Training(next);
                let head = if next == 0 { "🎉 一巡しました!最初に戻ります。\n\n" } else { "" };
                Step::Text(format!("{head}{}", training_prompt(next)))
            }
            _ => Step::Llm {
                prompt: format!(
                    "{} The target phrase is: \"{}\" (Japanese: {}). Give feedback on the student's attempt.\nStudent: {}",
                    persona(s),
                    TRAINING[i].1,
                    TRAINING[i].0,
                    raw.trim()
                ),
                prefix: String::new(),
            },
        },
        Mode::Chat | Mode::News => {
            let topic = if s.mode == Mode::News {
                format!("Tell me the latest news in or about: {}. Then ask me one easy question.", raw.trim())
            } else {
                raw.trim().to_string()
            };
            let hist: String = s.history.iter().rev().take(3).rev().map(|(u, a)| format!("Student: {u}\nTeacher: {a}\n")).collect();
            s.history.push((raw.trim().chars().take(200).collect(), String::new()));
            Step::Llm { prompt: format!("{} {hist}\nStudent: {topic}", persona(s)), prefix: String::new() }
        }
    }
}

fn record_answer(s: &mut Session, answer: &str) {
    if let Some(last) = s.history.last_mut() {
        last.1 = answer.chars().take(300).collect();
    }
}

pub fn verify_signature(secret: &str, body: &[u8], header: &str) -> bool {
    use base64::Engine;
    let Ok(sig) = base64::engine::general_purpose::STANDARD.decode(header.trim()) else { return false };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else { return false };
    mac.update(body);
    mac.verify_slice(&sig).is_ok()
}

static SESSIONS: Mutex<Option<HashMap<String, Session>>> = Mutex::new(None);

fn with_session<R>(user: &str, f: impl FnOnce(&mut Session) -> R) -> R {
    let mut g = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    let map = g.get_or_insert_with(HashMap::new);
    if map.len() >= MAX_SESSIONS && !map.contains_key(user) {
        map.clear(); // 上限を超えたら初期化(古い利用者はメニューから再開)
    }
    f(map.entry(user.to_string()).or_default())
}

async fn ask_llm(prompt: &str) -> String {
    if !crate::aruaru_llm_chat_rate_limit_allow() {
        return "ただいま混み合っています。少し待ってからもう一度送ってください。".to_string();
    }
    let url = format!("{}/v1/chat-providers/complete-priority", crate::aruaru_llm_base_url());
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(25)).build() {
        Ok(c) => c,
        Err(_) => return "エラーが発生しました。0 でメニューに戻れます。".to_string(),
    };
    let body = serde_json::json!({"prompt": prompt, "use_google_search": false});
    match client.post(&url).json(&body).send().await {
        Ok(r) if r.status().is_success() => r
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v["reply"]["text"].as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "うまく答えられませんでした。もう一度送ってください。".to_string()),
        _ => "AIにつながりませんでした。少し待ってからもう一度送ってください。".to_string(),
    }
}

/// 音声で読む部分(英語の行だけ)を取り出す。日本語・URL・記号の行は読まない。
pub fn speakable(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.contains("http") && !l.starts_with('(') && !l.starts_with("0."))
        .filter(|l| {
            let total = l.chars().count();
            let ascii = l.chars().filter(|c| c.is_ascii()).count();
            total >= 3 && ascii * 10 >= total * 9
        })
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(crate::tts::MAX_TEXT_CHARS)
        .collect()
}

/// LINEのAPIの基点(通常は変更しない。試験でモックLINEサーバーを指すためだけの環境変数)。
fn api_base(var: &str, default: &str) -> String {
    std::env::var(var).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| default.to_string()).trim_end_matches('/').to_string()
}

fn audio_dir() -> std::path::PathBuf {
    std::env::var("LINE_AUDIO_DIR").map(Into::into).unwrap_or_else(|_| std::path::PathBuf::from("data/line-audio"))
}

fn audio_base_url() -> String {
    std::env::var("LINE_AUDIO_BASE_URL").unwrap_or_else(|_| "https://easy-web.tokyo/maid-cafe-english".to_string())
}

fn clean_old_audio(dir: &std::path::Path) {
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.metadata().and_then(|m| m.modified()).is_ok_and(|m| m < cutoff) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

/// 英語の文を、選んだ先生の声(メイド=かわいい女性/執事=男性、maid-cafe-seの`open-runo-voice`で加工)で
/// m4aにして保存し、(公開URL, 長さms)を返す。エンジンが無い等で作れなければ`None`(文字だけ送る)。
async fn speak(text: &str, character: Character) -> Option<(String, u64)> {
    use std::process::Stdio;
    use tokio::io::AsyncWriteExt;
    if text.trim().is_empty() {
        return None;
    }
    let persona = if character == Character::Maid { crate::tts::Persona::Teacher } else { crate::tts::Persona::Helper };
    let wav = crate::tts::synthesize_text(text, "en-US", persona).await.ok()?;
    let duration_ms = crate::tts::wav_duration_ms(&wav).unwrap_or(3000);
    let dir = audio_dir();
    std::fs::create_dir_all(&dir).ok()?;
    clean_old_audio(&dir);
    let id: String = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_nanos();
        format!("{:032x}", n ^ ((std::process::id() as u128) << 96))
    };
    let out = dir.join(format!("{id}.m4a"));
    let mut child = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "64k", "-f", "ipod"])
        .arg(&out)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let mut stdin = child.stdin.take()?;
    let bytes = wav.as_ref().clone();
    let writer = tokio::spawn(async move {
        let _ = stdin.write_all(&bytes).await;
    });
    let ok = tokio::time::timeout(std::time::Duration::from_secs(30), child.wait()).await.ok()?.ok()?.success();
    let _ = writer.await;
    if !ok {
        let _ = std::fs::remove_file(&out);
        return None;
    }
    Some((format!("{}/v1/line/audio?id={id}", audio_base_url()), duration_ms))
}

/// `GET /v1/line/audio?id=<hex>` — LINEが取りに来る音声(m4a)。IDは推測しにくい長い値で、1時間で消える。
pub async fn audio(req: Request) -> Response {
    let id = crate::query_param(&req, "id").unwrap_or_default();
    if id.len() < 16 || id.len() > 64 || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return crate::rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"error": "not found"}));
    }
    match std::fs::read(audio_dir().join(format!("{id}.m4a"))) {
        Ok(b) => hyper::Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "audio/mp4")
            .header("cache-control", "private, max-age=600")
            .body(open_runo_poem_compat::hyper_compat::fixed_body(bytes::Bytes::from(b)))
            .unwrap_or_else(|_| crate::rs_json_response(StatusCode::INTERNAL_SERVER_ERROR, &serde_json::json!({"error": "build failed"}))),
        Err(_) => crate::rs_json_response(StatusCode::NOT_FOUND, &serde_json::json!({"error": "not found"})),
    }
}

const LANG_CODES: [&str; 9] = ["en", "ja", "de", "fr", "es", "it", "ru", "th", "vi"];

/// LINEの音声メッセージ(m4a)を取得し、aruaru-llmのwhisperで文字にする。使えない場合は理由(日本語)を返す。
async fn transcribe_line_audio(token: &str, message_id: &str, lang: usize) -> Result<String, String> {
    use base64::Engine;
    use std::process::Stdio;
    use tokio::io::AsyncWriteExt;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(40)).build().map_err(|e| e.to_string())?;
    let content = client
        .get(format!("{}/v2/bot/message/{message_id}/content", api_base("LINE_DATA_API_BASE", "https://api-data.line.me")))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "音声を取得できませんでした。".to_string())?
        .bytes()
        .await
        .map_err(|_| "音声を取得できませんでした。".to_string())?;
    let mut child = tokio::process::Command::new("ffmpeg")
        .args(["-loglevel", "error", "-i", "pipe:0", "-f", "f32le", "-ar", "16000", "-ac", "1", "pipe:1"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "音声の変換に失敗しました。".to_string())?;
    let mut stdin = child.stdin.take().ok_or("音声の変換に失敗しました。")?;
    let feeder = tokio::spawn(async move {
        let _ = stdin.write_all(&content).await;
    });
    let out = tokio::time::timeout(std::time::Duration::from_secs(30), child.wait_with_output())
        .await
        .map_err(|_| "音声の変換が時間切れになりました。".to_string())?
        .map_err(|_| "音声の変換に失敗しました。".to_string())?;
    let _ = feeder.await;
    if out.stdout.is_empty() {
        return Err("音声を読み取れませんでした。".to_string());
    }
    let body = serde_json::json!({
        "pcm_f32_base64": base64::engine::general_purpose::STANDARD.encode(&out.stdout),
        "sample_rate": 16000,
        "language": LANG_CODES[lang.min(LANG_CODES.len() - 1)],
    });
    let resp = client
        .post(format!("{}/v1/transcribe", crate::aruaru_llm_base_url()))
        .json(&body)
        .send()
        .await
        .map_err(|_| "音声認識につながりませんでした。".to_string())?;
    if !resp.status().is_success() {
        return Err("音声認識は準備中です。文字(または、キーボードのマイクで音声入力)で送ってください。".to_string());
    }
    let v = resp.json::<serde_json::Value>().await.map_err(|_| "音声認識の応答を読めませんでした。".to_string())?;
    let t = v["transcript"].as_str().unwrap_or("").trim().to_string();
    if t.is_empty() {
        Err("うまく聞き取れませんでした。もう一度話してください。".to_string())
    } else {
        Ok(t)
    }
}

async fn reply(token: &str, reply_token: &str, text: &str) {
    reply_with_audio(token, reply_token, text, None).await
}

async fn reply_with_audio(token: &str, reply_token: &str, text: &str, audio: Option<(String, u64)>) {
    let mut messages = vec![serde_json::json!({"type": "text", "text": text.chars().take(MAX_REPLY_CHARS).collect::<String>()})];
    if let Some((url, ms)) = audio {
        messages.push(serde_json::json!({"type": "audio", "originalContentUrl": url, "duration": ms}));
    }
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build() {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = client
        .post(format!("{}/v2/bot/message/reply", api_base("LINE_API_BASE", "https://api.line.me")))
        .bearer_auth(token)
        .json(&serde_json::json!({"replyToken": reply_token, "messages": messages}))
        .send()
        .await;
}

async fn handle_event(token: String, ev: serde_json::Value) {
    let user = ev["source"]["userId"].as_str().unwrap_or("anonymous").to_string();
    let Some(reply_token) = ev["replyToken"].as_str().map(str::to_string) else { return };
    let mut heard = String::new();
    let incoming = match ev["type"].as_str() {
        Some("follow") => Some("0".to_string()),
        Some("message") if ev["message"]["type"] == "text" => ev["message"]["text"].as_str().map(str::to_string),
        Some("message") if ev["message"]["type"] == "audio" => {
            let id = ev["message"]["id"].as_str().unwrap_or("").to_string();
            let lang = with_session(&user, |s| s.lang);
            match transcribe_line_audio(&token, &id, lang).await {
                Ok(t) => {
                    heard = format!("🎤 {t}

");
                    Some(t)
                }
                Err(msg) => {
                    reply(&token, &reply_token, &msg).await;
                    return;
                }
            }
        }
        Some("message") => {
            reply(&token, &reply_token, "テキスト(数字)か音声メッセージで送ってください。0 でメニューです。").await;
            return;
        }
        _ => None,
    };
    let Some(text) = incoming else { return };
    let out = with_session(&user, |s| step(s, &text));
    let (msg, spoken) = match out {
        Step::Text(t) => {
            // 研修の「答え」とあいさつだけは英語を読み上げる。メニューや説明は読まない。
            let say = if let Some(rest) = t.strip_prefix("✅ 答え:") {
                rest.lines().next().unwrap_or("").trim().to_string()
            } else if t.contains("Welcome") {
                speakable(&t)
            } else {
                String::new()
            };
            (t, say)
        }
        Step::Llm { prompt, prefix } => {
            let ans = ask_llm(&prompt).await;
            with_session(&user, |s| record_answer(s, &ans));
            let say = speakable(&ans);
            (format!("{prefix}{ans}

(0 でメニュー)"), say)
        }
    };
    let (voice_on, character) = with_session(&user, |s| (s.voice, s.character));
    let audio = if voice_on && !spoken.is_empty() { speak(&spoken, character).await } else { None };
    reply_with_audio(&token, &reply_token, &format!("{heard}{msg}"), audio).await;
}

/// `GET /v1/line/info` — 画面の「LINE友だち」案内用。友だち追加URL(`LINE_ADD_FRIEND_URL`、
/// 例 https://line.me/R/ti/p/@xxxxxxxx)が設定されていれば返す。未設定なら案内文だけ表示させる。
pub async fn info() -> Response {
    let url = std::env::var("LINE_ADD_FRIEND_URL").ok().filter(|u| u.starts_with("https://"));
    crate::rs_json_response_cors(StatusCode::OK, &serde_json::json!({"configured": url.is_some(), "add_friend_url": url}))
}

/// `POST /v1/line/webhook`
pub async fn webhook(req: Request) -> Response {
    use http_body_util::BodyExt;
    let (Ok(secret), Ok(token)) = (std::env::var("LINE_CHANNEL_SECRET"), std::env::var("LINE_CHANNEL_ACCESS_TOKEN")) else {
        return crate::rs_json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            &serde_json::json!({"error": "LINE is not configured (LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN)"}),
        );
    };
    let sig = req.headers().get("x-line-signature").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let bytes = match req.into_body().collect().await {
        Ok(c) => c.to_bytes(),
        Err(_) => return crate::rs_json_response(StatusCode::BAD_REQUEST, &serde_json::json!({"error": "bad body"})),
    };
    if !verify_signature(&secret, &bytes, &sig) {
        return crate::rs_json_response(StatusCode::UNAUTHORIZED, &serde_json::json!({"error": "bad signature"}));
    }
    let events = serde_json::from_slice::<serde_json::Value>(&bytes).ok().and_then(|v| v["events"].as_array().cloned()).unwrap_or_default();
    // 同時に処理するイベント数を制限する(少ないメモリで大量のアクセスをさばくための背圧)。
    // 上限を超えた分は待たせる(LINEのreplyTokenの有効時間内に間に合う範囲)。
    static LIMIT: std::sync::OnceLock<std::sync::Arc<tokio::sync::Semaphore>> = std::sync::OnceLock::new();
    let limit = LIMIT.get_or_init(|| std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_EVENTS))).clone();
    for ev in events {
        let (token, limit) = (token.clone(), limit.clone());
        tokio::spawn(async move {
            let _permit = limit.acquire_owned().await;
            handle_event(token, ev).await;
        });
    }
    crate::rs_json_response(StatusCode::OK, &serde_json::json!({"ok": true}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(s: Step) -> String {
        match s {
            Step::Text(t) => t,
            other => panic!("expected text, got {other:?}"),
        }
    }

    #[test]
    fn numeric_menu_flow_and_zero_returns_to_menu() {
        let mut s = Session::default();
        assert!(text(step(&mut s, "0")).contains("数字を送って"));
        assert!(text(step(&mut s, "３")).contains("レベルを選んで")); // 全角数字も受け付ける
        assert!(text(step(&mut s, "2")).contains("Intermediate"));
        assert_eq!(s.level, 1);
        assert!(text(step(&mut s, "4")).contains("学ぶ言語を選んで"));
        assert!(text(step(&mut s, "3")).contains("German"));
        assert_eq!(s.lang, 2);
        assert!(text(step(&mut s, "5")).contains("aonceo.blogspot.com"));
        assert!(text(step(&mut s, "abc")).contains("数字で選んで"));
    }

    #[test]
    fn training_walks_phrases_and_wraps() {
        let mut s = Session::default();
        step(&mut s, "0");
        assert!(text(step(&mut s, "2")).contains("1/8"));
        assert!(text(step(&mut s, "1")).contains("Welcome home, Master!"));
        assert!(text(step(&mut s, "2")).contains("2/8"));
        for _ in 0..6 {
            step(&mut s, "2");
        }
        assert!(text(step(&mut s, "2")).contains("一巡"));
        match step(&mut s, "Welcome home master") {
            Step::Llm { prompt, .. } => assert!(prompt.contains("Welcome home, Master!") && prompt.contains("Student: Welcome home master")),
            other => panic!("{other:?}"),
        }
        assert!(text(step(&mut s, "0")).contains("メニュー"));
    }

    #[test]
    fn chat_goes_to_llm_with_level_and_language() {
        let mut s = Session::default();
        step(&mut s, "1");
        match step(&mut s, "Hello!") {
            Step::Llm { prompt, .. } => assert!(prompt.contains("English") && prompt.contains("Beginner") && prompt.ends_with("Student: Hello!")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn signature_must_match() {
        use base64::Engine;
        let body = br#"{"events":[]}"#;
        let mut mac = Hmac::<Sha256>::new_from_slice(b"secret").unwrap();
        mac.update(body);
        let good = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
        assert!(verify_signature("secret", body, &good));
        assert!(!verify_signature("other", body, &good));
        assert!(!verify_signature("secret", b"tampered", &good));
        assert!(!verify_signature("secret", body, "not-base64!!"));
    }

    #[test]
    fn character_and_voice_toggle_via_numbers() {
        let mut s = Session::default();
        assert_eq!(s.character, Character::Maid);
        step(&mut s, "7");
        assert!(text(step(&mut s, "2")).contains("Welcome back"));
        assert_eq!(s.character, Character::Butler);
        match step(&mut s, "1") {
            Step::Text(_) => {}
            other => panic!("{other:?}"),
        }
        step(&mut s, "0");
        assert!(text(step(&mut s, "8")).contains("OFF"));
        assert!(!s.voice);
        step(&mut s, "1");
        match step(&mut s, "Hi") {
            Step::Llm { prompt, .. } => assert!(prompt.contains("butler")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn speakable_keeps_only_english_lines() {
        let t = "Great job! Welcome home, Master!
日本語の行です。
https://example.com/x
(0 でメニュー)";
        assert_eq!(speakable(t), "Great job! Welcome home, Master!");
        assert_eq!(speakable("✅ 答え: Welcome home, Master!

2. 次へ"), "");
    }
}
