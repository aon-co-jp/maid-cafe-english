// open-english フロントエンド(Phase 0)。
//
// 正直な開示: `aruaru-llm`の`/v1/generate`は対話特化のファインチューニング
// を受けていない素のGPT-2であり、応答品質・レベル遵守は保証されない。
// このスクリプトはそれを誠実に開示した上で、実際にaruaru-llmへ接続する。

const levelInstructions = {
  "super-beginner": "Use only very simple words and short sentences.",
  beginner: "Use simple vocabulary and short sentences.",
  intermediate: "Use natural, everyday English.",
  native: "Use rich vocabulary, idioms, and native-level sentence structures.",
};

// 年齢層別の言葉づかい調整(ユーザー指示「保育園児、幼稚園児、小学生、
// 中学生、高校生、大学生などのどれか一つ選択」への対応)。学習内容自体を
// 差し替えるのではなく、プロンプトへの指示文で語彙・話題の難度を調整する
// 簡易的な仕組み(GPT-2系は指示追従が保証されないため、確実な遵守を主張
// しない、既存の`levelInstructions`と同じ「正直な開示」方針)。
const ageGroupInstructions = {
  infant: "The student is an infant/toddler (under nursery age). Use extremely short, gentle, sing-song words and lots of repetition, as if talking to a very young child.",
  nursery: "The student is a nursery-age child (around 2-3 years old). Use extremely simple, friendly, playful words.",
  kindergarten: "The student is a kindergarten-age child (around 4-6 years old). Use simple, friendly, playful words.",
  elementary: "The student is an elementary school student. Use simple, clear words and short sentences.",
  "junior-high": "The student is a junior high school student. Use clear, everyday words.",
  "high-school": "The student is a high school student. Use natural, everyday English.",
  university: "The student is a university student or adult. Natural, everyday English is fine.",
  "working-adult": "The student is a working adult. Use natural, professional, everyday English.",
  senior: "The student is a senior adult. Use clear, natural English at a comfortable, unhurried pace.",
};

// ビジネス英会話の追加選択(ユーザー指示「もう一つ複数選択でビジネス
// 英会話も追加選択可能」への対応、他の年齢層/レベル選択とは独立した
// チェックボックスとして併用できる)。
const BUSINESS_ENGLISH_INSTRUCTION =
  "Also weave in some polite business English phrases (greetings, meetings, email requests) suitable for a workplace context.";

const langInstructions = {
  en: "Reply only in English.",
  ja: "日本語のみで返答してください(Reply only in Japanese).",
  hybrid: "Reply with a short mix of English and Japanese in the same message (e.g. give the English sentence, then a brief Japanese translation or note), to help the student learn both.",
  // 2026-08-25追加(ユーザー指示「ドイツ語・欧州主要言語・ロシア語・
  // アラビア語・ペルシャ語・ヘブライ語への対応拡張」への対応)。
  // 正直な開示: aruaru-llmは英語中心に事前学習された小型GPT-2ベースで
  // あり、これらの言語での指示追従・生成品質は保証されない
  // (実機検証結果はCLAUDE.md HANDOFF・README参照)。
  de: "Reply only in German (Deutsch).",
  fr: "Reply only in French (Français).",
  es: "Reply only in Spanish (Español).",
  it: "Reply only in Italian (Italiano).",
  ru: "Reply only in Russian (Русский).",
  ar: "Reply only in Arabic (العربية).",
  fa: "Reply only in Persian/Farsi (فارسی).",
  he: "Reply only in Hebrew (עברית).",
};

// RTL(右書き)言語のコード一覧(ユーザー指示「Arabic・Persian・Hebrewは
// RTLスクリプトなので設計・実装せよ」への対応)。`reply-lang`または
// `learn-target`がこれに該当する場合、該当メッセージ吹き出しにのみ
// dir="rtl"を設定する——アプリ全体のLTRレイアウト(トップバー・
// 設定パネル等)は崩さず、チャット本文の可読性のみを改善する設計。
const RTL_LANG_CODES = new Set(["ar", "fa", "he"]);
const RTL_LEARN_TARGETS = new Set(["arabic", "persian", "hebrew"]);

// 各種スクリプト(文字体系)検出。containsJapanese()と同じ
// Unicodeプロパティエスケープ方式(\p{Script=...})を使い、追加
// ライブラリ無しでモダンブラウザ上で判定する。ensureHybridReply()等の
// 「モデルが要求言語で実際に書けているか」の判定、およびappendMessage()
// でのdir="rtl"自動判定の両方に使う。
function containsCyrillic(text) {
  return /\p{Script=Cyrillic}/u.test(text);
}
function containsArabicScript(text) {
  return /\p{Script=Arabic}/u.test(text);
}
function containsHebrewScript(text) {
  return /\p{Script=Hebrew}/u.test(text);
}
function isRtlText(text) {
  return containsArabicScript(text) || containsHebrewScript(text);
}

// 学びたい言語の方向(ユーザー指示「英会話か日本語会話か学びたい言語を
// 選べるようにして」への対応)。従来は常に「英語トレーナー」固定だった
// プロンプトの役割部分を、選択に応じて入れ替える。`reply-lang`
// (応答言語の混在方針)とは独立した軸——こちらは「主に何を教える
// トレーナーか」を決める。
const trainerRoleByTarget = {
  english: "You are a friendly English conversation trainer at a maid cafe.",
  japanese: "You are a friendly Japanese conversation trainer at a maid cafe, helping the student practice speaking Japanese.",
  german: "You are a friendly German (Deutsch) conversation trainer at a maid cafe, helping the student practice speaking German.",
  french: "You are a friendly French (Français) conversation trainer at a maid cafe, helping the student practice speaking French.",
  spanish: "You are a friendly Spanish (Español) conversation trainer at a maid cafe, helping the student practice speaking Spanish.",
  italian: "You are a friendly Italian (Italiano) conversation trainer at a maid cafe, helping the student practice speaking Italian.",
  russian: "You are a friendly Russian (Русский) conversation trainer at a maid cafe, helping the student practice speaking Russian.",
  arabic: "You are a friendly Arabic (العربية) conversation trainer at a maid cafe, helping the student practice speaking Arabic.",
  persian: "You are a friendly Persian/Farsi (فارسی) conversation trainer at a maid cafe, helping the student practice speaking Persian.",
  hebrew: "You are a friendly Hebrew (עברית) conversation trainer at a maid cafe, helping the student practice speaking Hebrew.",
};
const learnTargetEl = document.getElementById("learn-target");

// バージョン表示(ユーザー指示「バージョン管理する機能も搭載して」)。
// `version.json`の`version`(セマンティックバージョン)をフッターへ表示する。
(async function showAppVersion() {
  const label = document.getElementById("app-version-label");
  if (!label) return;
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    const data = await res.json();
    label.textContent = data.version ? `v${data.version}` : "";
  } catch (err) {
    label.textContent = "";
  }
})();

// メンテナンス中バナー(ユーザー指示「open-englishを起動中に2分間、
// ただいまメンテナンス中です。2分ほどお待ち下さいと日本語と英語で
// 表示して」、後日「メンテナンスは毎回一分にしよう」の指示で1分に短縮)。
// バックエンド(aruaru-db)側の地理・観光データseed投入・ウォームアップ
// 処理と時間的に対応させる目的の簡易実装——実際のseed完了通知を待つ
// のではなく、固定60秒のカウントダウン表示に留める(正直な開示:
// バックエンド側の実処理時間と厳密には連動しない)。ページを開く/
// 再読み込みするたびに毎回表示される仕様(ユーザー指示通り)。
(function showMaintenanceBanner() {
  const banner = document.getElementById("maintenance-banner");
  const countdownEl = document.getElementById("maintenance-countdown");
  const messageEl = document.getElementById("maintenance-banner-message");
  if (!banner || !countdownEl || !messageEl) return;
  banner.classList.remove("hidden");
  // メンテナンス中の待ち時間を使い、サーバー接続国のニュースを収集
  // しておく(ユーザー指示、2026-08-17「メンテナンス時にその人のIPアドレス
  // からその国のインターネットニュースを読んで情報収集、分析してDATABASE化
  // して、話題についていけるように努力して」への対応、`aruaru-llm`側
  // `POST /v1/news/refresh`、詳細はnews_geo.rs参照)。失敗しても
  // メンテナンスバナー自体やチャット機能には影響しない(既存の
  // referralsSuffix等と同じ「サービスを止めない」設計)。
  // `apiBaseEl`はこのIIFEより後の行で定義されるため(スクリプト先頭付近に
  // 移すとファイル全体の構成が崩れる)、`setTimeout`で次のマクロタスクへ
  // 遅らせて初期化完了後に呼び出す(実ブラウザで発覚した`ReferenceError:
  // Cannot access 'apiBaseEl' before initialization`の修正)。
  setTimeout(() => {
    fetch(`${apiBaseEl.value.trim()}/v1/news/refresh`, { method: "POST" }).catch(() => {});
  }, 0);
  let remaining = 60;
  const timer = setInterval(() => {
    remaining -= 1;
    countdownEl.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(timer);
      // カウントダウン終了後、日英併記の「終了しました」メッセージへ差し替える
      // (ユーザー指示「終わったら、メンテナンスが終わりましたと英語と日本語で
      // 表示して」への対応)。すぐに隠さず、しばらく表示してから自動的に
      // 閉じる——利用者が見逃さないようにするため。
      messageEl.textContent = "✅ Maintenance has ended. Thank you for waiting! / メンテナンスが終わりました。お待たせしました!";
      setTimeout(() => {
        banner.classList.add("hidden");
      }, 5000);
    }
  }, 1000);
})();

// AI/検索プロバイダの無料枠情報バナー(ユーザー指示「それらの無料枠に
// ついては、メンテナンス時に情報を得て、open-englishの上の方に表示して」
// への対応)。各社の無料枠は変更されやすく、機械可読なAPIで正確な残り
// 回数を常時取得する仕組みは一般に存在しないため、ここでは「開発者が
// 定期メンテナンス時に手動で確認・更新する」`provider-free-tiers.json`を
// 読み込んで表示するのみに留める(正直な開示、誇張しない)。
(async function showProviderFreeTiers() {
  const banner = document.getElementById("free-tier-banner");
  const toggle = document.getElementById("free-tier-toggle");
  const body = document.getElementById("free-tier-body");
  const list = document.getElementById("free-tier-list");
  const updatedEl = document.getElementById("free-tier-last-updated");
  if (!banner || !toggle || !body || !list || !updatedEl) return;
  try {
    const res = await fetch("provider-free-tiers.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const providers = Array.isArray(data.providers) ? data.providers : [];
    if (providers.length === 0) return;
    list.innerHTML = "";
    for (const p of providers) {
      const li = document.createElement("li");
      const nameEn = p.name_en || p.id || "";
      const nameJa = p.name_ja || "";
      const tierEn = p.free_tier_en || "(no data / 情報なし)";
      const tierJa = p.free_tier_ja || "(情報なし)";
      // 外部/JSON由来のテキストのためtextContentのみで組み立てる(XSS回避)。
      const strong = document.createElement("strong");
      strong.textContent = `${nameEn} / ${nameJa}: `;
      li.appendChild(strong);
      const span = document.createElement("span");
      span.textContent = `${tierEn} / ${tierJa}`;
      li.appendChild(span);
      list.appendChild(li);
    }
    updatedEl.textContent = data.last_updated || "?";
    banner.classList.remove("hidden");
    toggle.addEventListener("click", () => {
      body.classList.toggle("hidden");
    });
  } catch (err) {
    // 読み込めなくても他の機能には影響させない(既存の可用性優先方針)。
  }
})();

// 1日の利用回数制限(ユーザー指示「検索や質問などで1日の利用回数制限を
// 超えた場合に、有料版切替の案内+他プロバイダの無料枠案内を日英併記で
// 表示して」への対応)。既存コード内を調査したが、サーバー側
// (`server/src/main.rs`・`db.rs`)にもクライアント側にも自前の「1日
// 100回まで」カウンタは実装されていなかった(index.html内の「1日100件
// まで無料」という記述はGoogle Custom Search JSON API自体の無料枠に
// ついての説明であり、open-english自身の利用回数制限ではない)。その
// ため、ここで`localStorage`ベースの簡易日次カウンタを新規実装する。
// 正直な開示: これはクライアント側(ブラウザ)のみのカウンタであり、
// `localStorage`を消去する・別ブラウザ/別端末を使う等で回避できてしまう
// (サーバー側での強制ではない)。あくまで「無料枠を使い切ったことを
// 利用者へ知らせる」目的の簡易的な仕組みであり、悪用防止機構ではない。
const DAILY_USAGE_LIMIT_KEY = "openEnglish.dailyUsage";
const DAILY_USAGE_LIMIT = 100;

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readDailyUsage() {
  try {
    const raw = localStorage.getItem(DAILY_USAGE_LIMIT_KEY);
    if (!raw) return { date: todayDateString(), count: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== todayDateString()) {
      return { date: todayDateString(), count: 0 };
    }
    return { date: parsed.date, count: Number(parsed.count) || 0 };
  } catch (err) {
    return { date: todayDateString(), count: 0 };
  }
}

function writeDailyUsage(usage) {
  try {
    localStorage.setItem(DAILY_USAGE_LIMIT_KEY, JSON.stringify(usage));
  } catch (err) {
    // localStorageが使えない環境でも他機能には影響させない(既存の
    // 可用性優先方針)。
  }
}

// テスト用に上限を一時的に下げられるようにする(ユーザー指示の実機検証
// 手順に対応、通常運用では`DAILY_USAGE_LIMIT`をそのまま使う)。
window.OPEN_ENGLISH_DAILY_LIMIT_OVERRIDE = null;

function effectiveDailyLimit() {
  const override = window.OPEN_ENGLISH_DAILY_LIMIT_OVERRIDE;
  return typeof override === "number" && override > 0 ? override : DAILY_USAGE_LIMIT;
}

function isDailyLimitExceeded() {
  return readDailyUsage().count >= effectiveDailyLimit();
}

function recordDailyUsage() {
  const usage = readDailyUsage();
  usage.count += 1;
  writeDailyUsage(usage);
  return usage.count;
}

// 上限到達時のメッセージ(日英併記)。要望1(有料版切替の案内)+
// 要望2(他プロバイダの無料枠案内、`provider-free-tiers.json`を動的に
// 参照——ハードコードしない、既存の無料枠バナーとの一貫性を保つ)。
async function dailyLimitExceededMessage() {
  let text =
    "🚫 本日の無料利用枠を超えました。有料版に切り替えますか？\n" +
    "You've exceeded today's free usage limit. Would you like to switch to a paid plan?\n" +
    "(この案内は表示のみです。実際の決済・アップグレード処理はこの" +
    "アプリには実装されていません。 / This is a notice only — no " +
    "payment or upgrade flow is implemented in this app.)";

  try {
    const res = await fetch("provider-free-tiers.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const providers = Array.isArray(data.providers) ? data.providers : [];
      if (providers.length > 0) {
        text +=
          "\n\n💡 他のAIサービスの無料枠も、一日の制限内で毎日ご利用いただけます。\n" +
          "Other AI services' free tiers are also available for you to use daily, within their own daily limits.";
        for (const p of providers) {
          const nameEn = p.name_en || p.id || "";
          const nameJa = p.name_ja || "";
          const tierEn = p.free_tier_en || "(no data)";
          const tierJa = p.free_tier_ja || "(情報なし)";
          text += `\n・${nameEn} / ${nameJa}: ${tierEn} / ${tierJa}`;
        }
      }
    }
  } catch (err) {
    // 読み込めなくても上限到達メッセージ本体は表示する(既存の
    // 可用性優先方針)。
  }
  return text;
}

// 日本語文字(ひらがな・カタカナ・漢字)を含むかどうかの簡易判定。
// 正規表現の\p{Script=...}(Unicodeプロパティエスケープ)はモダンブラウザ
// (Chrome/Firefox/Safari最新版)で対応済みのため追加ライブラリ不要。
function containsJapanese(text) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);
}

// 正直な開示: GPT-2/DistilGPT-2は英語中心の語彙(BPE)で事前学習されており、
// 日本語の生成能力が本質的に弱い。ハイブリッドモード(英日併記)を選んで
// いても、モデルが英語だけで応答してしまうことがある——ユーザー報告
// 「日本語でしゃべっても英語と日本語で返事して」への対応として、
// (1)ユーザーの発話が日本語の場合はその原文をプロンプトへ明示的に
// 埋め込みモデルに気づかせる、(2)それでもモデルの返答に日本語が
// 一切含まれなければ、フロントエンド側で必ず日本語の一言を補い、
// 「ハイブリッド(英日併記)」という構造だけは常に保証する
// (機械翻訳の質を偽って主張しない、あくまで定型の一言を添えるのみ)。
function ensureHybridReply(completion, userText) {
  if (replyLangEl.value !== "hybrid") return completion;
  if (containsJapanese(completion)) return completion;
  const note = containsJapanese(userText)
    ? "(This small AI model can't reliably write Japanese yet — please keep speaking Japanese, I'll answer in English! / このAIはまだ日本語の生成が苦手です。日本語で話しかけ続けてくださいね、英語でお答えします!)"
    : "(Here is a short Japanese note so you can compare both languages. / 英語と日本語を見比べられるよう、日本語のメモを添えました。)";
  return `${completion}\n\n${note}`;
}

// 2026-08-25追加(ユーザー指示「German/Russian/Arabic/Persian/Hebrewの
// 実生成品質を実機テストし、ガベージなら正直に開示せよ」への対応)。
// 実機検証結果(CLAUDE.md HANDOFF参照): reply-langをde/fr/es/it/ru/ar/
// fa/heのいずれに設定しても、aruaru-llm(英語中心の小型GPT-2)は
// プロンプトの言語指示を無視し、実際には**常に英語のみ**を生成した
// (5言語×複数回の実測でいずれも対象スクリプトの文字が一切含まれな
// かった)。ラテン文字言語(de/fr/es/it)は英語との文字種の区別が
// つかないため確実な検出はできないが、非ラテン文字言語
// (ru/ar/fa/he)は`containsCyrillic`/`containsArabicScript`/
// `containsHebrewScript`で機械的に判定できるため、
// `ensureHybridReply`と同じ「保証」パターンをここでも適用し、
// 対象スクリプトが1文字も無ければ定型の開示ノートを追記する
// (機械翻訳の質を偽って主張しない、あくまで正直な注記)。
const NON_LATIN_SCRIPT_GUARANTEE = {
  ru: { test: containsCyrillic, label: "Russian / ロシア語" },
  ar: { test: containsArabicScript, label: "Arabic / アラビア語" },
  fa: { test: containsArabicScript, label: "Persian (Farsi) / ペルシャ語" },
  he: { test: containsHebrewScript, label: "Hebrew / ヘブライ語" },
};
function ensureScriptGuaranteedReply(completion) {
  const cfg = NON_LATIN_SCRIPT_GUARANTEE[replyLangEl.value];
  if (!cfg) return completion;
  if (cfg.test(completion)) return completion;
  const note = `(Honest disclosure: this small English-centric AI model could not actually generate ${cfg.label} text — it replied in English instead. This was confirmed in live testing; see README for details. / 正直な開示: この小型AIモデルは英語中心のため、実際には${cfg.label}の文章を生成できず、英語で応答してしまいました。実機検証済みの既知の制約です。詳細はREADME参照。)`;
  return `${completion}\n\n${note}`;
}

// パネル類の開閉(ユーザー指示「Xで閉じたりOPENで開いたり出来るように」
// 「これらの表示はパネルとしてCLOSEとOPENをクリックで閉じたり開いたり
// 可能にして」への対応、2026-08-25新設)。開閉状態はlocalStorageへ
// 保存し、次回訪問時も維持する(既存の設定永続化の慣習に合わせた)。
// 汎用ヘルパー化し、正直な開示ボックス以外の複数パネル(スマホ活用
// バナー・多言語案内バナー・設定+ボタン一覧のトップバー)にも同じ
// 仕組みを適用する。
function makeCollapsiblePanel(boxId, btnId, storageKeySuffix, closedLabel, openLabel) {
  const box = document.getElementById(boxId);
  const btn = document.getElementById(btnId);
  if (!box || !btn) return;
  const storageKey = "open-english.collapsed." + storageKeySuffix;
  function setCollapsed(collapsed) {
    box.classList.toggle("hidden", collapsed);
    btn.textContent = collapsed ? openLabel : closedLabel;
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch (e) {
      /* localStorage不可でも開閉自体は機能させる */
    }
  }
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(storageKey) === "1";
  } catch (e) {
    /* 既定は開いた状態 */
  }
  setCollapsed(collapsed);
  btn.addEventListener("click", () => setCollapsed(!box.classList.contains("hidden")));
}

makeCollapsiblePanel("disclosure-box", "disclosure-toggle-btn", "disclosure", "✕ Hide disclosure / 開示を閉じる", "ℹ OPEN / 開示を開く");
makeCollapsiblePanel("phone-accel-banner", "phone-accel-banner-toggle", "phoneAccelBanner", "✕ CLOSE", "＋ OPEN");
makeCollapsiblePanel("world-language-banner", "world-language-banner-toggle", "worldLanguageBanner", "✕ CLOSE", "＋ OPEN");
makeCollapsiblePanel("topbar", "topbar-toggle", "topbar", "✕ CLOSE", "＋ OPEN");
makeCollapsiblePanel("maintenance-banner-detail", "maintenance-banner-toggle", "maintenanceBannerDetail", "✕ CLOSE", "＋ OPEN");
makeCollapsiblePanel("download-recommend-banner", "download-recommend-banner-toggle", "downloadRecommendBanner", "✕ CLOSE", "＋ OPEN");

// ログインゲート(2026-08-26新設、ユーザー指示「家族や会社で共有する
// 場合もあるので、ログインセキュリティシステムを導入しますか?」への
// 対応)。`GET /v1/auth/config`でこのサーバーがログイン保護を要求して
// いるかを確認し、要求していれば`GET /v1/auth/session`でログイン済みか
// 判定、未ログインならオーバーレイを表示する。要求していない場合は、
// まだ一度も尋ねていなければ「導入しますか?」の案内を一度だけ表示する
// (以後は`localStorage`のフラグで再表示しない、既存の設定永続化の
// 慣習を踏襲)。
const LOGIN_PROMPT_SHOWN_KEY = "open-english.loginPromptShown";
(async function initLoginGate() {
  const gateEl = document.getElementById("login-gate");
  const promptEl = document.getElementById("login-setup-prompt");
  if (!gateEl || !promptEl) return;
  let config;
  try {
    const res = await fetch("/v1/auth/config", { cache: "no-store" });
    config = await res.json();
  } catch (e) {
    // `/v1/auth/config`未提供の配信形態(file://直開き等)では
    // ログイン保護なしの既定動作へ黙ってフォールバックする。
    return;
  }

  if (config.login_required) {
    try {
      const res = await fetch("/v1/auth/session", { cache: "no-store" });
      const session = await res.json();
      if (!session.logged_in) {
        gateEl.classList.remove("hidden");
        applyLoginModeToGate(config.login_mode);
      }
    } catch (e) {
      gateEl.classList.remove("hidden");
      applyLoginModeToGate(config.login_mode);
    }
    return;
  }

  // ログイン保護は無効——まだ一度も尋ねていなければ案内する。
  let alreadyShown = false;
  try {
    alreadyShown = localStorage.getItem(LOGIN_PROMPT_SHOWN_KEY) === "1";
  } catch (e) {
    /* localStorage不可なら毎回表示されるが実害は無い */
  }
  if (!alreadyShown) {
    promptEl.classList.remove("hidden");
  }
})();

// 2026-08-28新設: ログイン方式(1.パスワード無し・2.email OTP・
// 3.QR撮影のみ・4.email OTP+QR)に応じて、ゲート内のどのフィールドを
// 見せるかを切り替える。
function applyLoginModeToGate(mode) {
  const otpFields = document.getElementById("login-otp-fields");
  const qrOnlyFields = document.getElementById("login-qr-only-fields");
  if (mode === "qr") {
    if (otpFields) otpFields.classList.add("hidden");
    if (qrOnlyFields) qrOnlyFields.classList.remove("hidden");
  } else {
    if (otpFields) otpFields.classList.remove("hidden");
    if (qrOnlyFields) qrOnlyFields.classList.add("hidden");
  }
}

const loginEmailEl = document.getElementById("login-email");
const loginEmail2El = document.getElementById("login-email2");
const loginSendCodeBtn = document.getElementById("login-send-code-btn");
const loginCodeSection = document.getElementById("login-code-section");
const loginVerifyEmailEl = document.getElementById("login-verify-email");
const loginCodeEl = document.getElementById("login-code");
const loginVerifyBtn = document.getElementById("login-verify-btn");
const loginStatusEl = document.getElementById("login-status");

if (loginSendCodeBtn) {
  loginSendCodeBtn.addEventListener("click", async () => {
    const email = loginEmailEl.value.trim();
    const email2 = (loginEmail2El?.value || "").trim();
    if (!email) {
      loginStatusEl.textContent = "Please enter your email / メールアドレスを入力してください";
      return;
    }
    loginStatusEl.textContent = "Sending... / 送信中...";
    try {
      const res = await fetch("/v1/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email2 ? { email, email2 } : { email }),
      });
      const data = await res.json();
      if (res.ok) {
        loginStatusEl.textContent = email2
          ? "Code sent to both addresses — check either inbox / 両方のメールアドレスへコードを送信しました。どちらか一方をご確認ください"
          : "Code sent — check your email / コードを送信しました。メールをご確認ください";
        loginCodeSection.classList.remove("hidden");
        // 検証欄には既定でメールアドレス1を入れておく(2つ目で受け取った
        // 場合は利用者が書き換える、2026-08-27追加)。
        if (loginVerifyEmailEl) loginVerifyEmailEl.value = email;
      } else {
        loginStatusEl.textContent = `⚠ ${data.error || "Failed to send code / コード送信に失敗しました"}`;
      }
    } catch (e) {
      loginStatusEl.textContent = `⚠ ${e.message}`;
    }
  });
}
// 2026-08-28変更(ユーザー指示「email OTP+QRコードを毎回その場で
// スキャンして即ログイン、という二段階ログインへ統一」への対応)。
// `/v1/auth/verify-otp`は第一要素(email/SMSコード)の検証成功時に
// もうセッションを発行しない——`second_factor_required:true`+QR確認
// セッションを返すので、ここでQRを表示してポーリングを開始する。
const qrLoginSection = document.getElementById("qr-login-section");
const qrLoginContainer = document.getElementById("qr-login-container");
const qrLoginUrlEl = document.getElementById("qr-login-url");
const qrLoginStatusEl = document.getElementById("qr-login-status");
let qrLoginPollTimer = null;

function stopQrLoginPoll() {
  if (qrLoginPollTimer) {
    clearInterval(qrLoginPollTimer);
    qrLoginPollTimer = null;
  }
}

function startQrLoginPoll(qrLoginId) {
  stopQrLoginPoll();
  qrLoginPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/v1/auth/qr-login/status?id=${encodeURIComponent(qrLoginId)}`);
      const data = await res.json();
      if (!res.ok) {
        stopQrLoginPoll();
        if (qrLoginStatusEl) qrLoginStatusEl.textContent = `⚠ ${data.error || "This QR code has expired / QRコードの有効期限が切れました"}`;
        return;
      }
      if (data.confirmed) {
        stopQrLoginPoll();
        if (qrLoginStatusEl) qrLoginStatusEl.textContent = "Confirmed! Logging in... / 確認されました！ログインしています...";
        const finishRes = await fetch("/v1/auth/qr-login/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: qrLoginId }),
        });
        const finishData = await finishRes.json();
        if (finishRes.ok && finishData.ok) {
          document.getElementById("login-gate").classList.add("hidden");
        } else {
          if (qrLoginStatusEl) qrLoginStatusEl.textContent = `⚠ ${finishData.error || "Failed to finish login / ログイン完了に失敗しました"}`;
        }
      }
    } catch (e) {
      // ネットワーク瞬断等でポーリング1回が失敗しても、次のtickで再試行する
      // (握りつぶす、ユーザー体験を止めないための意図的な設計)。
    }
  }, 2000);
}

function showQrLoginStep(qrSvg, confirmUrl) {
  if (loginCodeSection) loginCodeSection.classList.add("hidden");
  if (qrLoginContainer) qrLoginContainer.innerHTML = qrSvg || "";
  if (qrLoginUrlEl) qrLoginUrlEl.textContent = confirmUrl || "";
  if (qrLoginSection) qrLoginSection.classList.remove("hidden");
  if (qrLoginStatusEl) {
    qrLoginStatusEl.textContent =
      "Scan this QR code with your phone, tablet, or a webcam-equipped device, then tap Confirm there. / このQRコードをスマホ・タブレット・WEBカメラ端末で撮影し、そちらで「確認」を押してください。";
  }
}

async function verifyOtpFactorOne(identifier, code) {
  loginStatusEl.textContent = "Verifying... / 確認中...";
  try {
    const res = await fetch("/v1/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: identifier, code }),
    });
    const data = await res.json();
    if (res.ok && data.second_factor_required && data.qr_login_id) {
      loginStatusEl.textContent = "✅ Code confirmed — now scan the QR code below to finish logging in. / コードを確認しました——続けて下のQRコードを撮影してログインを完了してください。";
      showQrLoginStep(data.qr_svg, data.confirm_url);
      startQrLoginPoll(data.qr_login_id);
    } else if (res.ok) {
      // 旧サーバー(2FA導入前)との後方互換フォールバック
      document.getElementById("login-gate").classList.add("hidden");
    } else {
      loginStatusEl.textContent = `⚠ ${data.error || "Incorrect code / コードが正しくありません"}`;
    }
  } catch (e) {
    loginStatusEl.textContent = `⚠ ${e.message}`;
  }
}

if (loginVerifyBtn) {
  loginVerifyBtn.addEventListener("click", () => {
    const email = (loginVerifyEmailEl?.value || loginEmailEl.value).trim();
    const code = loginCodeEl.value.trim();
    verifyOtpFactorOne(email, code);
  });
}

// 2026-08-28新設: 方式3(QR撮影のみ、事前のメール確認なし)専用ボタン。
const loginQrOnlyStartBtn = document.getElementById("login-qr-only-start-btn");
if (loginQrOnlyStartBtn) {
  loginQrOnlyStartBtn.addEventListener("click", async () => {
    loginQrOnlyStartBtn.disabled = true;
    loginStatusEl.textContent = "Generating QR code... / QRコード生成中...";
    try {
      const res = await fetch("/v1/auth/qr-login/start", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.qr_login_id) {
        loginStatusEl.textContent = "";
        showQrLoginStep(data.qr_svg, data.confirm_url);
        startQrLoginPoll(data.qr_login_id);
      } else {
        loginStatusEl.textContent = `⚠ ${data.error || "Failed to generate QR code / QRコード生成に失敗しました"}`;
      }
    } catch (e) {
      loginStatusEl.textContent = `⚠ ${e.message}`;
    } finally {
      loginQrOnlyStartBtn.disabled = false;
    }
  });
}

// 2026-08-27新設(同日中に再構成、さらにQRコード方式は中止して実SMS方式へ
// 置き換え、ユーザー指示「ワンタイムパスワード+携帯電話でSMSを自動受取」
// 「QRコード撮影は中止して」への対応)。
// **経緯**: 当初は認証アプリのQRコード撮影方式(TOTP)を実装したが、
// ユーザー指示により中止し、代わりに携帯電話番号へ実際にSMSでワンタイム
// コードを送る方式へ置き換えた(サーバー側`auth::request_sms_otp`、
// Twilio等のSMSゲートウェイの持ち込みが必要——正直な開示は下記メッセージ
// 参照)。検証は既存の`/v1/auth/verify-otp`をそのまま使う(電話番号も
// メールも同じ仕組みで検証できる、サーバー側`verify_otp`のdoc参照)。
// **自動入力・自動認証(WebOTP API)**: 「自動入力、自動認証として」との
// 指示に対応するため、ブラウザ標準のWebOTP API
// (`navigator.credentials.get({otp:...})`)を使い、SMSが届いたら自動で
// コード欄へ入力し、そのまま自動でログインを試みる。**正直な開示**:
// WebOTPはAndroid版Chrome等の一部ブラウザのみ対応(iOS Safari・
// デスクトップは非対応)——非対応環境では従来通り手入力が必要になる。
const loginPhoneEl = document.getElementById("login-phone");
const loginSendSmsCodeBtn = document.getElementById("login-send-sms-code-btn");

function refreshLoginSendSmsCodeBtnVisibility() {
  if (!loginSendSmsCodeBtn || !loginPhoneEl) return;
  loginSendSmsCodeBtn.classList.toggle("hidden", loginPhoneEl.value.trim() === "");
}
if (loginPhoneEl) {
  refreshLoginSendSmsCodeBtnVisibility();
  loginPhoneEl.addEventListener("input", refreshLoginSendSmsCodeBtnVisibility);
}

// WebOTP: コード入力欄が表示されたタイミングで、対応ブラウザなら自動的に
// SMSの到着を待ち受け、届いたら自動入力+自動でVerifyボタンを押す。
// `AbortController`で他の待ち受けと衝突しないよう1つだけ保持する。
let webOtpAbortController = null;
function startWebOtpListenIfSupported() {
  if (!("OTPCredential" in window) || !navigator.credentials || typeof navigator.credentials.get !== "function") {
    return; // 正直な開示: 非対応ブラウザでは何もしない(手入力に委ねる)
  }
  if (webOtpAbortController) webOtpAbortController.abort();
  webOtpAbortController = new AbortController();
  navigator.credentials
    .get({ otp: { transport: ["sms"] }, signal: webOtpAbortController.signal })
    .then((otp) => {
      if (!otp || !otp.code) return;
      if (loginCodeEl) loginCodeEl.value = otp.code;
      if (loginVerifyBtn) loginVerifyBtn.click(); // 自動認証
    })
    .catch(() => {
      /* 利用者がキャンセルした、非対応、タイムアウト等——手入力に委ねる */
    });
}

if (loginSendSmsCodeBtn) {
  loginSendSmsCodeBtn.addEventListener("click", async () => {
    const phone = (loginPhoneEl?.value || "").trim();
    if (!phone) {
      loginStatusEl.textContent = "Please enter your phone number / 携帯電話番号を入力してください";
      return;
    }
    loginStatusEl.textContent = "Sending SMS... / SMS送信中...";
    try {
      const res = await fetch("/v1/auth/request-sms-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (res.ok && data.sent) {
        loginStatusEl.textContent = data.webotp_domain_configured
          ? "📱 SMS sent — on supported browsers (Android Chrome, etc.) the code will be entered automatically. / SMSを送信しました——対応ブラウザ(Android Chrome等)では自動的にコードが入力されます。"
          : "📱 SMS sent — please enter the code below. (Automatic entry is not configured on this server.) / SMSを送信しました——下にコードを入力してください(このサーバーでは自動入力は未設定です)。";
        loginCodeSection.classList.remove("hidden");
        if (loginVerifyEmailEl) loginVerifyEmailEl.value = phone;
        startWebOtpListenIfSupported();
      } else {
        loginStatusEl.textContent = `⚠ ${data.error || "Failed to send SMS / SMS送信に失敗しました"}`;
      }
    } catch (e) {
      loginStatusEl.textContent = `⚠ ${e.message}`;
    }
  });
}

// 2026-08-28: 旧TOTP(認証アプリへの秘密鍵事前登録)方式は廃止し、上記
// `showQrLoginStep`/`startQrLoginPoll`の「毎回その場でQRを撮影して確認」
// 方式へ統一した(ユーザー指示)。email1/email2/SMSいずれも第一要素として
// 使え、続けて必ずQR確認(第二要素)が必要になる——email/SMS OTP単体では
// ログインが完了しない設計に変更した(以前の「どれか1つでログイン可」
// という可用性優先の設計から、真の二段階認証〈2FA〉へ変更)。

const loginSetupEnableBtn = document.getElementById("login-setup-enable-btn");
const loginSetupSkipBtn = document.getElementById("login-setup-skip-btn");
function dismissLoginSetupPrompt() {
  document.getElementById("login-setup-prompt").classList.add("hidden");
  try {
    localStorage.setItem(LOGIN_PROMPT_SHOWN_KEY, "1");
  } catch (e) {
    /* 保存できなくても閉じる動作自体は継続 */
  }
}
if (loginSetupEnableBtn) {
  loginSetupEnableBtn.addEventListener("click", async () => {
    const selected = document.querySelector('input[name="login-mode-choice"]:checked');
    const loginMode = selected ? selected.value : "none";
    try {
      await fetch("/v1/auth/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_mode: loginMode }),
      });
    } catch (e) {
      /* 失敗しても案内は閉じる、次回起動時に設定パネルから再設定できる */
    }
    dismissLoginSetupPrompt();
    location.reload();
  });
}
if (loginSetupSkipBtn) {
  loginSetupSkipBtn.addEventListener("click", () => dismissLoginSetupPrompt());
}

const logEl = document.getElementById("log");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const apiBaseEl = document.getElementById("api-base");
// 2026-08-26改訂(ユーザー指示「open-englishはVPSレンタルサーバーで
// 一応動きますが、aruaru-llmを手元の端末にダウンロードして頂いて、
// それをVPSのopen-englishがインストールに成功してますと認識出来る
// ように」への対応): このページがVPS等どのホストから配信されていても、
// `http://localhost:4600`(=閲覧者自身の端末)への接続を常に最優先の
// 既定値とする——ブラウザの`localhost`/`127.0.0.1`は常に「このページを
// 開いている端末自身」を指すため、VPS配信時にこれをページのホスト名
// (VPS自身)へ書き換えてしまうと、閲覧者が自分の端末へダウンロード・
// インストールした`aruaru-llm`に永久に接続できなくなるバグだった
// (旧実装はホスト名が`localhost`以外だと無条件で`ホスト名:4600`へ
// 書き換えていたため、VPS配信時はVPS自身のポート4600を叩こうとして
// いた——閲覧者の端末ではなく)。
// `checkHealth()`(下記)がこの既定値へ定期的にヘルスチェックを行い、
// 閲覧者が自分の端末で`aruaru-llm`を起動した瞬間に自動的に「接続
// できました」を検知する——これが「VPSがインストール成功を認識する」
// 仕組みの実体(新しい通知APIを追加したわけではなく、既存のヘルス
// チェックが正しい既定接続先に対して機能するようにした)。
//
// 旧来のLANヒューリスティック(スマホのWebViewからPC上のopen-english-
// server+aruaru-llmへ、PCのLAN IP経由で両方接続するケース)は、
// `localhost:4600`が応答しない場合の**フォールバック候補**として
// 維持する(`autoDetectAruaruLlmBase`が両方を実際に`/healthz`で
// プローブし、応答した方を採用する)。
async function autoDetectAruaruLlmBase() {
  if (!apiBaseEl) return;
  const candidates = ["http://localhost:4600"];
  // ページのホスト名(VPS 等)への平文 HTTP プローブは、このページが
  // HTTPS 配信されている場合ブラウザに Mixed Content として**必ず**
  // ブロックされ、コンソールにエラーを撒くだけで無意味(2026-08-29、
  // easy-web.tokyo 実配信で `http://easy-web.tokyo:4600/healthz` の
  // Mixed Content エラーを確認)。`http://localhost` / `127.0.0.1` は
  // "potentially trustworthy" 例外で HTTPS ページからも許可されるため、
  // localhost 候補はそのまま残す。LAN ヒューリスティック候補は
  // ページが平文 HTTP のとき(スマホ WebView → PC の LAN IP 等)だけ試す。
  if (
    location.protocol !== "https:" &&
    location.hostname &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    candidates.push(`http://${location.hostname}:4600`);
  }
  for (const candidate of candidates) {
    try {
      const res = await fetchWithTimeout(`${candidate}/healthz`, { cache: "no-store" }, 2000);
      if (res.ok) {
        apiBaseEl.value = candidate;
        return;
      }
    } catch (e) {
      // この候補は応答しない、次を試す。
    }
  }
  // どちらも応答しない場合は、閲覧者自身の端末を指す既定値
  // (`localhost:4600`)のまま残す——後続の`checkHealth()`の定期
  // ポーリング(5秒間隔)が、閲覧者が後からインストール・起動した
  // タイミングで自動的に接続を検知する。
  apiBaseEl.value = candidates[0];
}

// デプロイ運用者が明示的にVPS側でaruaru-llmを共同ホストしている場合
// (`OPEN_ENGLISH_ARUARU_LLM_BASE_URL`環境変数を設定した場合)のみ、
// その接続先を使う——ただし上記の「閲覧者自身の端末」検出が既に成功
// している場合はそちらを優先する(明示的なオプトインの補完策)。
async function applyDeploymentAruaruLlmBaseIfOwnDeviceUnavailable() {
  if (!apiBaseEl) return;
  try {
    const res = await fetch("/v1/config", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.aruaru_llm_base_url) return;
    // 閲覧者自身の端末への接続が既に確立できているなら、それを
    // VPS側の共有インスタンスへ上書きしない(閲覧者ごとに独立した
    // aruaru-llmを使わせる、という設計方針を優先する)。
    try {
      const probe = await fetchWithTimeout(`${apiBaseEl.value.trim()}/healthz`, { cache: "no-store" }, 1500);
      if (probe.ok) return;
    } catch (e) {
      // 閲覧者自身の端末への接続はまだ確立していない、VPS側へフォールバック。
    }
    apiBaseEl.value = data.aruaru_llm_base_url;
  } catch (e) {
    // `/v1/config`未提供の配信形態(file://直開き等)では黙って既定のまま。
  }
}

// 2つの初期化処理は互いに競合しないよう必ず順番に実行する
// (`autoDetectAruaruLlmBase`が`apiBaseEl.value`を確定させてから、
// `applyDeploymentAruaruLlmBaseIfOwnDeviceUnavailable`がそれを見て
// 判断する——並行実行すると後者が前者の未確定な値を読んでしまう
// レースコンディションになるため)。
setTimeout(async () => {
  await autoDetectAruaruLlmBase();
  await applyDeploymentAruaruLlmBaseIfOwnDeviceUnavailable();
}, 0);
const statusEl = document.getElementById("status");
const trainerEl = document.getElementById("trainer");
const bubbleEl = document.getElementById("speech-bubble");
const levelEl = document.getElementById("level");
const ageGroupEl = document.getElementById("age-group");
const businessEnglishEl = document.getElementById("business-english-toggle");
const replyLangEl = document.getElementById("reply-lang");
const webSearchToggleEl = document.getElementById("web-search-toggle");
const micBtn = document.getElementById("mic-btn");
const voiceOutEl = document.getElementById("voice-out");

// 風天のトラさんキャラクターへの切替時に流れる短いジングル(ユーザー
// 指示、2026-08-10「男はつらいよの映画のメインテーマのBGMのパロディが
// 短く流れるように」)。
// 正直な開示: 実在する楽曲のメロディ・録音を一切使用しない完全新規の
// オリジナル作曲(音階・雰囲気のみを「祭り囃子・旅回りの下町演歌」風に
// 参考にしたに留まる)。Web Audio APIのオシレーターで手書き合成する
// (追加ライブラリ・音源ファイル不使用)。
function playToraSanJingle() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // 下町演歌調を意識した、五音音階(ヨナ抜き)の短い上昇→着地フレーズ。
    const notes = [
      { freq: 392.0, start: 0.0, dur: 0.16 }, // G4
      { freq: 440.0, start: 0.16, dur: 0.16 }, // A4
      { freq: 523.25, start: 0.32, dur: 0.22 }, // C5
      { freq: 587.33, start: 0.56, dur: 0.16 }, // D5
      { freq: 659.25, start: 0.74, dur: 0.42 }, // E5(着地音、少し長め)
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle"; // 尺八・篠笛風の柔らかい音色に近づける
      osc.frequency.value = note.freq;
      const t0 = now + note.start;
      const t1 = t0 + note.dur;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    }
    const totalMs = (notes[notes.length - 1].start + notes[notes.length - 1].dur + 0.1) * 1000;
    setTimeout(() => ctx.close(), totalMs);
  } catch (err) {
    // 音声合成APIが使えない環境ではジングル無しで継続する(致命的にしない)。
  }
}

// メッセージ本文中の特定URLだけをクリック可能な`<a>`要素へ変換する
// (ユーザー指示「audiocafe.tokyoのURLをクリックできるように」
// 2026-08-29対応、および同日「AmazonのURLも」への対応で商品URLを
// 1件追加)。**任意のHTMLを解釈するわけではない**——`innerHTML`は
// 一切使わず、この正規表現に一致した部分文字列だけを
// `document.createElement("a")`で安全に置き換える設計(XSS対策として、
// AI生成テキストや他の外部由来テキストをHTMLとして解釈することは
// 既存方針〈`appendMessage`が元々`textContent`のみを使う設計〉のまま
// 維持する)。ホワイトリストは(1)`audiocafe.tokyo`ドメイン全体、
// (2) HiFiGo MUSEHiFi M3 Ultraの実際のAmazon商品ページ(ASIN
// `B0H14VXGCC`固定、ユーザー提供のアメブロ記事内リンクから追跡用の
// 検索パラメータ〈`ref=sr_1_1_sspa`等〉を除いた正規URLへ整形済み)の
// 2件のみ——広く`amazon.co.jp`全体を許可するとAI生成テキストが将来
// 別の(未検証の)Amazon URLを生成した場合にもリンク化してしまうため、
// 意図的に個別URL単位のホワイトリストにしている。他の紹介リンクを
// クリック可能にしたい場合はこのパターンへ追加すればよい。
const AUDIOCAFE_LINK_PATTERN =
  /https:\/\/audiocafe\.tokyo(?:\/[^\s)]*)?|https:\/\/www\.amazon\.co\.jp\/dp\/B0H14VXGCC\/?|https:\/\/ameblo\.jp\/www-aon\/entry-12977122655\.html/g;

/** テキストを、既知ドメインのURLだけ`<a>`化した上で`container`へ描画する。 */
function renderMessageBody(container, text) {
  container.textContent = "";
  AUDIOCAFE_LINK_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = AUDIOCAFE_LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const a = document.createElement("a");
    a.href = match[0];
    a.textContent = match[0];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    container.appendChild(a);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  renderMessageBody(div, text);
  div.dataset.role = role;
  // RTL(右書き)対応(2026-08-25追加): アプリ全体のLTRレイアウトは
  // 変えず、このメッセージ吹き出し単体にだけdir="rtl"を設定する。
  // 選択中の言語設定(reply-lang/learn-target)がAR/FA/HEなら、または
  // 本文自体にアラビア文字・ヘブライ文字が実際に含まれていれば適用する
  // (モデルが設定と無関係にRTL文字を生成した場合にも対応するため、
  // 設定判定と実文字判定のOR)。
  const wantsRtl =
    (replyLangEl && RTL_LANG_CODES.has(replyLangEl.value)) ||
    (learnTargetEl && RTL_LEARN_TARGETS.has(learnTargetEl.value)) ||
    isRtlText(text);
  if (wantsRtl) {
    div.dir = "rtl";
  }
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
  return div;
}

function replaceLastMessage(role, text) {
  const nodes = logEl.querySelectorAll(`.msg.${role}`);
  const last = nodes[nodes.length - 1];
  if (last) {
    renderMessageBody(last, text);
    logEl.scrollTop = logEl.scrollHeight;
    return true;
  }
  return false;
}

function setStatus(ok, text) {
  statusEl.textContent = text;
  statusEl.className = `status ${ok ? "ok" : "error"}`;
}

// ---------------------------------------------------------------------------
// aruaru-llm連携の実用性向上(2026-08-22追加)
// ---------------------------------------------------------------------------
// これまで`fetch`にタイムアウトが一切無く、aruaru-llmが重いモデル
// (gpt2-xl等)をロード中だったりプロセスが応答しなくなったりすると、
// 「送信したのに何も起きない」状態が無限に続いていた(UI上の手掛かりも
// 皆無)。AbortControllerで上限を設け、超過時は「何が起きたか」を英日で
// 正直に伝える。
// 補助的なaruaru-llm呼び出し(地理DB・ニュース・紹介判定など、応答文へ
// 付け足す情報)のタイムアウト。これらは`askTrainer`の中で`await`されて
// いるため、ここが無限に待つと生成本体が終わっていても返信が出てこない
// ——本体より短い上限を設け、間に合わなければその付加情報だけ諦める
// (いずれの呼び出し元も`catch`で空文字列を返す設計になっている)。
const AUX_TIMEOUT_MS = 8000;

/** 指定ミリ秒でabortする`fetch`。タイムアウト時は`err.isTimeout`が真になる。 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === "AbortError") {
      const e = new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`);
      e.isTimeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 実行基盤バッジ(`GET /v1/runtime`、aruaru-llm側に2026-08-22新設)。
// **正直な開示**: aruaru-llmは`open-cuda`のデバイス抽象
// (`opencuda_core::GpuDevice`)の上で動いており、既定ビルドは
// `opencuda_cpu::CpuDevice`(CPU/rayon)1台のみ——つまりGPU高速化は
// 効いていない。`--features real-vulkan`でビルドし、かつ実GPUの初期化に
// 成功した場合のみGPUがデバイスプールへ追加される。このバッジは
// aruaru-llmが実際に報告した内容をそのまま出すだけで、こちら側で
// 「GPU対応済み」と装うことはしない。独立リポジトリ
// `aon-co-jp/open-directx`はこの経路に一切関与していない
// (CLAUDE.md 2026-08-20の調査結果)。
const runtimeBadgeEl = document.getElementById("runtime-badge");
let lastRuntimeInfo = null;
/** 直近の`/v1/generate`往復に要した実測ミリ秒(ステータス欄へ表示する)。 */
let lastReplyLatencyMs = null;

/** ステータス欄へ付ける「直近の実測応答時間」("(4.9s)")。未計測なら空文字。 */
function latencySuffix() {
  return lastReplyLatencyMs != null ? ` (last reply ${(lastReplyLatencyMs / 1000).toFixed(1)}s)` : "";
}

function renderRuntimeBadge(info) {
  if (!runtimeBadgeEl) return;
  if (!info) {
    runtimeBadgeEl.textContent = "compute: unknown / 実行基盤: 不明";
    runtimeBadgeEl.className = "runtime-badge unknown";
    runtimeBadgeEl.title = "aruaru-llmの GET /v1/runtime に接続できませんでした(古いaruaru-llmには存在しないエンドポイントです)。";
    return;
  }
  // 階層的アクセラレーション(2026-08-23、aruaru-llm側`acceleration`
  // フィールド新設)。CUDA → Vulkan → DirectX(密GEMMのみ)→ CPU SIMD の
  // うち、aruaru-llmが「実際に有効」と報告した段だけを表示する
  // (こちら側で推測・粉飾はしない)。古いaruaru-llm(このフィールドを
  // 返さない)に対しては従来通りGPU/CPUの2値表示へフォールバックする。
  const accel = info.acceleration || null;
  const tier = accel ? accel.tier : info.gpu_in_use ? "vulkan" : "cpu-simd";
  const shortLabel = { cuda: "GPU (CUDA)", vulkan: "GPU (Vulkan)", "directx-gemm": "GPU (DirectX 12, GEMM) + CPU SIMD", "cpu-simd": "CPU SIMD" }[tier] || (info.gpu_in_use ? "GPU" : "CPU");
  const model = info.engine || "(unknown engine)";
  runtimeBadgeEl.textContent = `compute: ${shortLabel} · ${model}`;
  runtimeBadgeEl.className = `runtime-badge ${tier === "cpu-simd" ? "cpu" : "gpu"}`;

  // ツールチップには各段の compiled_in / active を正直に並べる。
  const tierLines = accel
    ? ["cuda", "vulkan", "directx", "cpu_simd"]
        .map((k) => {
          const t = accel[k];
          if (!t) return null;
          const state = t.active ? "ACTIVE" : t.compiled_in ? "compiled in, not active" : "not compiled in";
          return `  - ${k}: ${state} — ${t.detail || ""}`;
        })
        .filter(Boolean)
        .join("\n")
    : "";
  runtimeBadgeEl.title =
    `${info.summary_ja || ""}\n${info.summary_en || ""}\n` +
    (accel ? `acceleration tier: ${accel.tier_label_ja || ""} / ${accel.tier_label_en || ""}\n${tierLines}\n` : "") +
    `devices: ${(info.devices || []).map((d) => d.name).join(", ")}\n` +
    `CPU SIMD: ${(info.cpu_simd && info.cpu_simd.features) || "(unknown)"}\n` +
    `GPU features enabled at build time: ${(info.enabled_gpu_features || []).join(", ") || "(none)"}\n` +
    `${info.disclosure || ""}`;
}

async function refreshRuntimeInfo() {
  const base = apiBaseEl.value.trim();
  try {
    const res = await fetchWithTimeout(`${base}/v1/runtime`, { cache: "no-store" }, 5000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    lastRuntimeInfo = await res.json();
  } catch (err) {
    lastRuntimeInfo = null;
  }
  renderRuntimeBadge(lastRuntimeInfo);
  return lastRuntimeInfo;
}

// キャビンアテンダント+メイドカフェ風の声質(ユーザー指示、2026-08-10)。
// 正直な開示: Web Speech APIはブラウザ・OS標準の音声合成エンジンを使う
// ため、声質そのものを自作することはできない——できるのは(1)利用可能な
// 声の中から明るく丁寧な印象の女性声を優先的に選ぶ、(2)ピッチを気持ち
// 高め・話速を気持りゆっくりにして「案内・接客」らしい丁寧さと、
// メイドカフェらしい明るさを両立させる、という範囲までに留まる。
let cachedVoices = [];
const femaleNameHints = ["female", "woman", "kyoko", "haruka", "ayumi", "samantha", "zira", "susan", "google 日本語", "google us english"];
// トラさん風の声(ユーザー指示、2026-08-10「トラさんに切り替えるとトラ
// さん風の声にして」)を選ぶための男性声ヒント。正直な開示: 実在の
// 声優・キャラクターの声を再現するものではなく、ブラウザ標準の男性声を
// 選び、低めのピッチ・やや速い話速で「気さくな中年男性」の印象に
// 近づけるだけの範囲(Web Speech APIの制約、前述の声質に関する開示と同じ)。
const maleNameHints = ["male", "man", "ichiro", "otoya", "daniel", "david", "mark", "google 日本語 male"];

function pickVoice(lang, preferMale) {
  if (!cachedVoices.length && "speechSynthesis" in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  const candidates = cachedVoices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
  const hints = preferMale ? maleNameHints : femaleNameHints;
  const preferred = candidates.find((v) => hints.some((hint) => v.name.toLowerCase().includes(hint)));
  // 正直な開示・バグ修正(ユーザー報告「17歳を英語の部分でジュウナナ
  // イヤーズと発音していた」): 以前はここで`candidates`(要求言語に
  // マッチする声)が1件も無い場合、無関係な言語(例: 日本語)の声へ
  // フォールバックしていた(`cachedVoices[0]`)。多くのブラウザは
  // `utterance.voice`が設定されるとその声自身の言語の発音規則
  // (数字の読み方等)を`utterance.lang`より優先するため、英語の
  // "17 years old"が日本語の声で読まれ「ジュウナナ」のように誤発音
  // される実バグがあった。要求言語に合う声が1件も無い場合は`voice`を
  // 設定せず`null`を返すことで、ブラウザ既定の`utterance.lang`側の
  // 発音規則(セブンティーン)にそのまま委ねる。
  return preferred || candidates[0] || null;
}
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

// 各行が"English sentence / 日本語訳"形式(このアプリ全体で使われている
// 規約)になっている発話テキストから、実際に読み上げる言語の部分だけを
// 抽出する(ユーザー指摘、2026-08-10「メイドの喋りが途切れ途切れ」への
// 対応)。**根本原因**: 発話全体を単一の`utter.lang`(en-US または
// ja-JP)で読ませていたが、テキスト自体は英語・日本語が"/"区切りで
// 混在していたため、ブラウザのTTSエンジンが片方の言語の発音規則で
// もう片方の言語の文字列を無理に読もうとし、不自然な途切れ・詰まりが
// 発生していた。行ごとに"/"で分割し、`lang`に一致する側だけを選んで
// 読点でつなぐことで、単一言語の滑らかな文章として読み上げさせる。
function extractSpeechText(text, lang) {
  const wantJapanese = lang.startsWith("ja");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const picked = lines.map((line) => {
    const parts = line.split(" / ");
    if (parts.length < 2) return line.trim();
    return wantJapanese ? parts[1].trim() : parts[0].trim();
  });
  return picked.join(wantJapanese ? "。" : ". ");
}

// メイドカフェ研修モード専用: 英語のワンフレーズを話したら、続けて
// 対応する日本語も話す(ユーザー指示「英語で一言ワンフレーズしゃべったら
// 対応する日本語でもしゃべってを繰り返して」への対応)。通常モードの
// `speak()`は`replyLangEl`の設定に応じて英語または日本語の一方だけを
// 話すが、この関数は常に両方を順番に話す(音声合成キューに2つの
// utteranceを積むだけで、`cancel()`を挟まなければブラウザが順番に
// 再生してくれる)。
function speakBilingual(text) {
  bubbleEl.textContent = text;
  if (!(voiceOutEl.checked && "speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
    const enText = extractSpeechText(text, "en-US");
    const jaText = extractSpeechText(text, "ja-JP");
    [
      { text: enText, lang: "en-US" },
      { text: jaText, lang: "ja-JP" },
    ].forEach(({ text: part, lang }) => {
      if (!part) return;
      const utter = new SpeechSynthesisUtterance(part);
      utter.lang = lang;
      const voice = pickVoice(lang, isHelper);
      if (voice) utter.voice = voice;
      if (isHelper) {
        utter.pitch = 0.75;
        utter.rate = 1.05;
      } else {
        utter.pitch = 1.1;
        utter.rate = 0.82;
      }
      window.speechSynthesis.speak(utter);
    });
    trainerEl.classList.add("speaking");
    const spokenMs = Math.min(6000, (enText.length + jaText.length) * 60);
    clearTimeout(speak._timer);
    speak._timer = setTimeout(() => trainerEl.classList.remove("speaking"), spokenMs);
  } catch (err) {
    // フォールバック: 音声合成に失敗したら口パクのみで継続する。
  }
}

function speak(text) {
  bubbleEl.textContent = text;

  // 音声出力(ユーザー指示、2026-08-10「声でも文字でも」への対応)。
  // ブラウザ標準のWeb Speech API(SpeechSynthesis)を使う——サーバー側の
  // TTSは未実装なので、対応ブラウザでのみ実際に声が出る(正直な開示)。
  let spokenMs = Math.min(4000, text.length * 60);
  if (voiceOutEl.checked && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const lang = replyLangEl.value === "ja" ? "ja-JP" : "en-US";
      const utter = new SpeechSynthesisUtterance(extractSpeechText(text, lang));
      utter.lang = lang;
      const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
      const voice = pickVoice(lang, isHelper);
      if (voice) utter.voice = voice;
      if (isHelper) {
        // トラさん風の声(気さくな中年男性、低めのピッチ+やや速めの話速)。
        utter.pitch = 0.75;
        utter.rate = 1.05;
      } else {
        // デフォルトの声質(ユーザー指示、2026-08-10「ジャンボジェットの
        // スチュワーデスの声+メイドカフェの様な声をデフォルトに」):
        // 大型機の機内アナウンスを思わせる丁寧でゆったりした話速+
        // メイドカフェらしい明るいピッチ、を両立させる調整値。
        // 2026-08-10追記: 「もう少しゆっくり喋って」との指示により
        // さらに話速を落とした(0.92→0.82)。
        utter.pitch = 1.1;
        utter.rate = 0.82;
      }
      trainerEl.classList.add("speaking");
      utter.onend = () => trainerEl.classList.remove("speaking");
      window.speechSynthesis.speak(utter);
      return;
    } catch (err) {
      // フォールバック: 音声合成に失敗したら口パクのみで継続する。
    }
  }
  trainerEl.classList.add("speaking");
  clearTimeout(speak._timer);
  speak._timer = setTimeout(() => trainerEl.classList.remove("speaking"), spokenMs);
}

// メイドカフェ英会話研修モード(ユーザー指示、2026-08-10)。
//
// 正直な開示: これは`aruaru-llm`のAI生成ではなく、固定の会話フロー
// (有限状態機械)によるスクリプト進行である。GPT-2ベースの`/v1/generate`
// では指定された自己紹介の順序・内容(名前→年齢ジョーク→出身国→
// 国別の共通話題→アニメ→食べ物→文化)を確実に守らせることはできない
// ため、確実性を優先してこのモードのみ決定的なスクリプトとした。
// 各国について「合っていればどれを答えてもよい」個別の話題候補
// (ユーザー指示「アイフロムチャイナなら、アイラブ北京ダッグや餃子、
// アイラブパンダや万里の長城なども回答としてあっていればランダムで
// 答えて」——固定の1文ではなく、正しい候補の中からランダムに選ぶ)。
// 下記`findCountryFunFact`が、これらとDB(`/v1/geo/lookup`)由来の
// ランドマーク・名物料理を1つの候補プールへ合算し、その中から
// ランダムに1つ選んで返す。
const countryExtraFunFacts = {
  australia: ["I love kangaroos! / 私はカンガルーが大好きです!", "I love koalas! / 私はコアラが大好きです!"],
  usa: ["I love baseball! / 私は野球が大好きです!", "I love Hollywood movies! / 私はハリウッド映画が大好きです!"],
  america: ["I love baseball! / 私は野球が大好きです!", "I love Hollywood movies! / 私はハリウッド映画が大好きです!"],
  uk: ["I love tea time! / 私はお茶の時間が大好きです!", "I love football! / 私はサッカーが大好きです!"],
  england: ["I love tea time! / 私はお茶の時間が大好きです!", "I love football! / 私はサッカーが大好きです!"],
  canada: ["I love maple syrup! / 私はメープルシロップが大好きです!", "I love hockey! / 私はホッケーが大好きです!"],
  france: ["I love croissants! / 私はクロワッサンが大好きです!", "I love the Eiffel Tower! / 私はエッフェル塔が大好きです!"],
  china: [
    "I love pandas! / 私はパンダが大好きです!",
    "I love dumplings! / 私は餃子が大好きです!",
    "I love the Great Wall! / 私は万里の長城が大好きです!",
    "I love Peking duck! / 私は北京ダックが大好きです!",
  ],
  korea: ["I love K-pop! / 私はK-POPが大好きです!", "I love kimchi! / 私はキムチが大好きです!"],
};

function pickRandomFrom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// 地理・観光DB(2026-08-11追加、`aruaru-llm`の`POST /v1/geo/lookup`)の
// ランドマーク・名物料理と、上記`countryExtraFunFacts`(該当国のみ)を
// 1つの候補プールへ合算し、その中からランダムに1つ選んで返す
// (2026-08-12、固定の組み合わせではなく「正しければどれでもよい」
// 候補群からランダムに選ぶ方式へ変更)。DB未接続・該当候補が無い場合は
// 汎用の一言へフォールバックする(サービスを止めない既存方針を踏襲)。
async function findCountryFunFact(text) {
  const lower = text.toLowerCase();
  let factPool = [];
  for (const [key, facts] of Object.entries(countryExtraFunFacts)) {
    if (lower.includes(key)) {
      factPool = factPool.concat(facts);
      break;
    }
  }
  let dbCapital = null;
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetchWithTimeout(`${base}/v1/geo/lookup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: text.trim() }),
    }, AUX_TIMEOUT_MS);
    const data = await res.json();
    if (data.found && data.capital) {
      dbCapital = data.capital;
      factPool.push(`I love ${dbCapital.landmark_en}! / 私は${dbCapital.landmark_ja}が大好きです!`);
      factPool.push(`I love ${dbCapital.food_en}! / 私は${dbCapital.food_ja}が大好きです!`);
    }
  } catch (err) {
    // DB未接続時は静かにフォールバックする(既存の可用性優先方針)。
  }

  if (factPool.length > 0) {
    let reply = pickRandomFrom(factPool);
    if (dbCapital) {
      const c = dbCapital;
      reply += `\nA popular souvenir there is ${c.souvenir_en}. / そこの人気のお土産は${c.souvenir_ja}です。`;
      // 富士山の話題が出た場合は、安全上の注意+登山バス/タクシー予約先+
      // 山小屋一覧+登山用品店を必ず日英併記で案内する(ユーザー指示
      // 「富士山が好きとか富士山の紹介をするなら…富士山の話題が出たら
      // 日本語と英語で紹介して」+「スキーウェアとヘルメットと登山靴
      // などを安く販売しているお店なども…紹介する機能を持たせて」)。
      if (c.landmark_en.includes("Fuji") || c.landmark_ja.includes("富士山")) {
        reply += `\n\n${await fujiInfoText()}`;
      }
      // 日本・世界どちらの国が話題になっても、観光ツアーの紹介と
      // オンライン予約先をその都度検索して案内する(ユーザー指示
      // 「日本も世界も観光で訪れるなら、観光ツアーの紹介とオンライン
      // 予約をその都度検索して、Google検索結果とYoutube検索結果を
      // 日本語と英語で表示して」)。
      reply += `\n\n${await tourSearchText(c.country_en)}`;
    }
    return reply;
  }
  return "That's wonderful! I'd love to learn more about your country someday! / それは素晴らしいですね!いつかあなたの国についてもっと知りたいです!";
}

// 富士山の安全上の注意+山小屋・登山バス/タクシー・登山用品店の一覧
// (`aruaru-llm`の`GET /v1/geo/fuji`、2026-08-11新設)を日英併記の
// 短いテキストへ整形する。取得失敗時は静かに空文字を返す(既存の
// 可用性優先方針)。
async function fujiInfoText() {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetchWithTimeout(`${base}/v1/geo/fuji`, {}, AUX_TIMEOUT_MS);
    const info = await res.json();
    const hut = info.mountain_huts && info.mountain_huts[0];
    const transport = info.transport_reservations && info.transport_reservations[0];
    const gear = info.gear_shops && info.gear_shops[0];
    let text = `⚠️ ${info.safety_en}\n⚠️ ${info.safety_ja}`;
    if (hut) {
      text += `\n\n🏠 Example hut you can reserve: ${hut.name_en} (${hut.station_en}, ${hut.phone}) / 予約できる山小屋の例: ${hut.name_ja}(${hut.station_ja}、${hut.phone})`;
    }
    if (transport) {
      text += `\n🚌 Bus/permit booking: ${transport.name_en} / バス・通行予約: ${transport.name_ja}`;
    }
    if (gear) {
      text += `\n🎽 Gear rental: ${gear.name_en} (ski wear, helmet, boots) / 登山用品レンタル: ${gear.name_ja}(スキーウェア・ヘルメット・登山靴)`;
    }
    return text;
  } catch (err) {
    return "";
  }
}

// 話題に出た国・地域の観光ツアー紹介+オンライン予約先をその都度検索
// して案内する(`aruaru-llm`の`POST /v1/geo/tours`、2026-08-11新設)。
// aruaru-llm側にGoogle Search APIキーが設定されていない場合は、その旨を
// 正直に伝えるだけに留める(黙って結果を偽装しない)。
async function tourSearchText(place) {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetchWithTimeout(`${base}/v1/geo/tours`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ place }),
    }, AUX_TIMEOUT_MS);
    const data = await res.json();
    let text = `🧳 Tours & booking for ${place} / ${place}の観光ツアー・予約情報`;
    if (data.configured && data.web_results && data.web_results.length) {
      data.web_results.slice(0, 3).forEach((r) => {
        text += `\n・${r.title}`;
      });
    } else {
      text += `\n(${data.disclosure_en} / ${data.disclosure_ja})`;
    }
    if (data.youtube_search_url) {
      text += `\n🎥 YouTube search / YouTube検索: ${data.youtube_search_url}`;
    }
    return text;
  } catch (err) {
    return "";
  }
}

// 「今度オーストラリアに旅行/出張の予定がある」のような発話の検出
// (ユーザー指示「今度どこどこの国に観光やお仕事で行く予定があるんだ
// けど、の様なフレーズにもDBで対応して」)。厳密な自然言語理解ではなく、
// countryFunFactsのキー(国名)が発話に含まれているかの簡易検出——
// GPT-2系に意図分類を確実にやらせることはできないため、確実性を優先
// した単純な文字列一致とする(正直な開示、既存のtrainingStepsと同じ方針)。
async function replyToTravelPlanMention(text) {
  const fact = await findCountryFunFact(text);
  return (
    "Oh, a trip coming up? How exciting! / 今度旅行があるんですね!素敵です!\n" +
    `${fact}`
  );
}

function trainingIntroLine() {
  const isHelper = typeof activeCharacter !== "undefined" && activeCharacter === "helper";
  if (isHelper) {
    return (
      "Let's begin the Maid Cafe English Training! / メイドカフェ英会話研修を始めましょう!\n" +
      "Hello, I am Tora, your butler trainer! / こんにちは、私は執事の先生、トラです!\n" +
      "Now — what is YOUR name? / さて、あなたのお名前は?"
    );
  }
  return (
    "Welcome home, master! / おかえりなさい、ご主人様!\n" +
    "Let's begin the Maid Cafe English Training! / メイドカフェ英会話研修を始めましょう!\n" +
    "Hello, I am Sakura, your maid trainer! / こんにちは、私はメイドの先生、さくらです!\n" +
    "How old am I, you ask? / 私が何歳か気になりますか?\n" +
    "A maid is eternally 17 years old! ✨ / メイドは永遠の17歳です!✨\n" +
    "Now — what is YOUR name? / さて、あなたのお名前は?"
  );
}

const trainingSteps = [
  {
    get trainerSays() {
      return trainingIntroLine();
    },
    onUserReply: (text) =>
      `Nice to meet you, ${text}! / はじめまして、${text}さん!\n` + "Where are you from? / どこの国からいらっしゃいましたか?",
  },
  {
    onUserReply: async (text) =>
      `${await findCountryFunFact(text)}\n` + "Do you know Japanese animation? / 日本のアニメーションを知っていますか?",
  },
  {
    onUserReply: () =>
      "I love UFO Robot Grendizer! / 私はUFOロボ グレンダイザーが大好きです!\n" +
      "I love Totoro too! / トトロも大好きです!\n" +
      "Do you know Japanese food? / 日本の食べ物を知っていますか?",
  },
  {
    onUserReply: () =>
      "I love katsu curry and kaki-fry curry rice! / 私はカツカレーとカキフライカレーライスが大好きです!\n" +
      "I love ramen too! / ラーメンも大好きです!\n" +
      "Do you know Japanese culture? / 日本の文化を知っていますか?",
  },
  {
    onUserReply: () =>
      "I love the Japanese language! / 私は日本語が大好きです!\n" +
      "I love aikido, judo, shodo (calligraphy), and sado (tea ceremony)! / 合気道、柔道、書道、茶道が大好きです!\n" +
      "I love temples, shrines, and Shinto too! / お寺や神社、神道も大好きです!\n" +
      "Did you know Japan is having a huge boom overseas right now? / 今、日本は海外で大ブームなんですよ!",
  },
  {
    // 日英でGoogle検索して調査した内容(ユーザー指示、2026-08-10)に基づく、
    // 海外で人気の日本文化トピックの紹介ステップ。誇張しないよう、
    // 検索で確認できた範囲の事実(概数・傾向)のみを取り上げる。
    onUserReply: () =>
      "Manga and anime like Demon Slayer and Attack on Titan are loved worldwide! / 「鬼滅の刃」や「進撃の巨人」のような漫画・アニメは世界中で愛されています!\n" +
      "Anime songs (anisong) even have huge live concerts like Animelo Summer Live! / アニソンには「Animelo Summer Live」のような大きなライブもあります!\n" +
      "Japanese video games are booming overseas too! / 日本のゲームも海外で大ブームです!\n" +
      "About 3.79 million people study Japanese around the world! / 世界中で約379万人が日本語を学んでいます!\n" +
      "Foreign tourists love collecting goshuin (temple & shrine stamps)! / 外国人観光客は御朱印集めも大好きです!\n" +
      "Onsen ryokan (hot spring inns) and shrine/temple tours are a huge tourism boom! / 温泉旅館や神社・お寺巡りも観光ブームです!\n" +
      "And Japanese food — sushi, ramen — is loved everywhere! / そして日本食(寿司・ラーメン等)も世界中で大好かれています!\n" +
      "Now let's learn a real maid cafe trick! / 実際のメイドカフェの技を学びましょう!",
  },
  {
    // 実際の秋葉原のメイドカフェ接客の工夫に着想を得た「単語軸」の会話練習
    // (ユーザー提供の参考記事: 訪日客向けの英会話は流暢な文法より、単語+
    // 表情・ジェスチャーで会話を成立させる、という実践的な技法)。記事の
    // 文章を丸ごと転載せず、技法自体を短い引用・要約に留めて練習に翻案。
    onUserReply: () =>
      "A real maid cafe secret: you don't need perfect grammar — just key words + a big smile! / メイドカフェの秘密: 完璧な文法は不要、キーワード+満面の笑顔で会話は成立します!\n" +
      'Real example: "Where are you from?" -> guest: "Australia!" -> maid: "Kangaroo!! 🦘" / 実例: 「どこから来たの?」→「オーストラリア!」→「カンガルー!!」\n' +
      "Let's try it! Say one word about your country (an animal, food, or famous thing). / 練習しましょう!あなたの国について一言(動物・食べ物・有名なもの)を教えてください。",
  },
  {
    onUserReply: (text) =>
      `${text}! That's a great word! 🎉 / ${text}!素敵な言葉ですね!🎉\n` +
      "Great job — you finished the self-introduction training! / お疲れ様でした!自己紹介研修は終了です!",
  },
];
let trainingStepIndex = 0;
// `trainingStepIndex`は最終ステップ到達後もその値のまま固定される
// (`advanceTrainingMode`の`Math.min`によるクランプ)ため、それだけを
// 「最終ステップかどうか」の判定に使うと、研修完了後にユーザーが
// さらにメッセージを送るたびに毎回`wasLastStep`が真になり、トラさんへの
// 引き継ぎ処理(`switchCharacter()`のトグル)が繰り返し発火してしまう
// バグがあった(ユーザー報告「トラさんに切り替えるとすぐにもとの
// メイドさんに自動で切り替わるBUG」の実際の原因)。1回だけ発火させる
// ためのフラグを別途持つ。
let trainingHandoffTriggered = false;

function startTrainingMode() {
  trainingStepIndex = 0;
  trainingHandoffTriggered = false;
  appendMessage("trainer", trainingSteps[0].trainerSays);
  speakBilingual(trainingSteps[0].trainerSays);
}

// メイドの研修が一通り終わったら、トラさんのジングル(BGM代わり)を
// 鳴らしてキャラを引き継ぎ、トラさんが話し始める(ユーザー指示
// 「メイドが一通りしゃべったら、次はトラさんのテーマのBGMが流れて、
// 今度はトラさんがしゃべって」への対応)。
function toraHandoffLine() {
  return (
    "Training complete! Great job! / 研修完了です!お疲れ様でした!\n" +
    "Now let's keep practicing together — I'm Tora, your next trainer! / さあ、続けて練習しましょう!次の先生はトラだよ!"
  );
}

async function advanceTrainingMode(userText) {
  const step = trainingSteps[trainingStepIndex];
  const wasLastStep = trainingStepIndex === trainingSteps.length - 1;
  let reply = await step.onUserReply(userText);
  reply += await referralsSuffix(userText);
  reply += consumptionTaxSuffix(userText);
  reply += pensionSuffix(userText);
  reply += incomeWallSuffix(userText);
  reply += vendingMachineSuffix(userText);
  reply += internetAccessSuffix(userText);
  reply += govConsultingSuffix(userText);
  reply += fairTradeSuffix(userText);
  reply += await newsSuffix(userText);
  reply += troubledSuffix(userText);
  reply += nuclearDeterrenceSuffix(userText);
  reply += audioUsbDacJourneySuffix(userText);
  reply += audioHeadphoneManiaSuffix(userText);
  reply += egovSuffix(userText);
  appendMessage("trainer", reply);
  speakBilingual(reply);
  trainingStepIndex = Math.min(trainingStepIndex + 1, trainingSteps.length - 1);

  if (wasLastStep && activeCharacter === "maid") {
    const delayMs = Math.min(6000, reply.length * 60) + 800;
    setTimeout(() => {
      // ユーザーがこの待ち時間中に手動でキャラを切り替えていた場合、
      // ここで無条件に`switchCharacter()`(トグル)を呼ぶと元に戻って
      // しまうバグがあった(ユーザー報告「トラさんに切り替えると
      // すぐにもとのメイドさんに自動で切り替わる」)。実行時点の
      // 状態を再確認し、まだメイドのままの場合のみ切り替える。
      if (activeCharacter !== "maid") return;
      switchCharacter(); // トラさんのジングルはここで再生される
      const line = toraHandoffLine();
      appendMessage("trainer", line);
      speakBilingual(line);
    }, delayMs);
  }
}

// 直前の接続状態(ユーザー指示、2026-08-10「インストール後は自動認識で
// インストール済みを英日で自動表示して」への対応——未接続→接続に変わった
// 瞬間だけ、英日ハイブリッドのお知らせを1回表示する)。
let wasConnected = false;

async function checkHealth() {
  const base = apiBaseEl.value.trim();
  try {
    // 5秒間隔のポーリングなので、タイムアウトもそれ未満(4秒)にして
    // 未応答のリクエストが積み上がらないようにする(2026-08-22)。
    const res = await fetchWithTimeout(`${base}/healthz`, {}, 4000);
    if (res.ok) {
      // 実機検証(2026-08-22)で判明した粗の修正: 5秒ごとのヘルスチェックが
      // 直前の応答時間表示("connected (4.9s)")を即座に上書きして消して
      // しまい、せっかく計測した実測値がほぼ見えなかった。直近の実測値が
      // あれば維持する。
      setStatus(true, `aruaru-llm: connected${latencySuffix()}`);
      if (!wasConnected) {
        const msg = "aruaru-llm installed and connected! / aruaru-llmがインストールされ接続されました!";
        appendMessage("system", msg);
        speak(msg);
        // 接続した瞬間に「今どこで計算しているのか(CPU/GPU・モデル)」を
        // 取りに行く(2026-08-22追加)。毎回のヘルスチェックでは叩かない
        // ——実行基盤は頻繁には変わらないため。
        refreshRuntimeInfo();
      } else if (!lastRuntimeInfo) {
        // 接続はできているのに実行基盤が不明のまま(初回取得が失敗した、
        // あるいはaruaru-llmを再起動した直後)なら取り直す。
        refreshRuntimeInfo();
      }
      wasConnected = true;
    } else {
      setStatus(false, `aruaru-llm: HTTP ${res.status}`);
      wasConnected = false;
      renderRuntimeBadge(null);
    }
  } catch (err) {
    setStatus(false, err.isTimeout ? "aruaru-llm: no response within 4s / 4秒以内に応答なし" : "aruaru-llm: unreachable (CORS or server not running?)");
    wasConnected = false;
    renderRuntimeBadge(null);
  }
  // パネルが開いている間に接続状態が変わった場合(例: セットアップ手順を
  // 実行してaruaru-llmが起動した)も、ポーリングのたびにバナー表示を
  // 追従させる(`updateSetupAlreadyConnectedBanner`はこの関数より後で
  // 定義されるが、呼び出し時点〈checkHealth実行時〉には既に定義済み)。
  if (typeof updateSetupAlreadyConnectedBanner === "function") updateSetupAlreadyConnectedBanner();
}

// 定期的に自動で接続確認する(ユーザー指示: インストール後の自動認識)。
// 5秒ごとにポーリングし、上記の初回接続検知ロジックで通知する。
setInterval(checkHealth, 5000);

// 実機検証(2026-08-22)で判明した粗への対応: ブラウザはバックグラウンド
// タブの`setInterval`を大幅に間引く(もしくは凍結する)ため、別タブを
// 見ている間にaruaru-llmが復帰しても、タブへ戻った時点の表示が
// 「unreachable」のまま張り付いたままになることを実際に観測した。
// タブが再び表示されたタイミングで即座に確認し直す。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkHealth();
});
window.addEventListener("focus", checkHealth);

// キャラクター切替(ユーザー指示、2026-08-10「メイドカフェ魔法少女と
// 風天のトラさんをいつでも変更できるように」への対応)。
let activeCharacter = "maid";
const charMaidEl = document.getElementById("char-maid");
const charHelperEl = document.getElementById("char-helper");
const characterSwitchBtn = document.getElementById("character-switch-btn");

function switchCharacter() {
  activeCharacter = activeCharacter === "maid" ? "helper" : "maid";
  if (activeCharacter === "maid") {
    charMaidEl.style.display = "";
    charHelperEl.style.display = "none";
    bubbleEl.textContent = "I'm back! I'm your maid-cafe trainer again! / 戻ってきました!メイドカフェの先生に戻りました!";
  } else {
    charMaidEl.style.display = "none";
    charHelperEl.style.display = "";
    bubbleEl.textContent =
      "Yo! It's me, Torasan-style helper — always carrying my Miku-style figure! / よう!風天のトラさんだ、いつも初音ミク風のフィギュアを持ってるぜ!";
    playToraSanJingle();
  }
  // 研修モードの自己紹介(まだユーザーが名前等に返答していない最初の
  // ステップ)を表示した後にキャラを切り替えた場合、表示済みの挨拶
  // メッセージがそのまま古いキャラのままになってしまう問題への対応
  // (ユーザー指摘、2026-08-10「トラさんに切り替えたのにまだ…さくらと
  // 名乗ってますね」)——研修モードでまだ最初のステップにいる間だけ、
  // 直前の挨拶メッセージを新しいキャラの台詞へ差し替える。
  if (levelEl.value === "maid-cafe-training" && trainingStepIndex === 0) {
    const newIntro = trainingIntroLine();
    replaceLastMessage("trainer", newIntro);
    speakBilingual(newIntro);
  }
}

characterSwitchBtn.addEventListener("click", switchCharacter);

async function askTrainer(userText) {
  const base = apiBaseEl.value.trim();
  const level = levelEl.value;
  let levelInstruction = levelInstructions[level] || "";
  const ageInstruction = ageGroupEl ? ageGroupInstructions[ageGroupEl.value] || "" : "";
  if (ageInstruction) levelInstruction = `${ageInstruction} ${levelInstruction}`;
  if (businessEnglishEl && businessEnglishEl.checked) {
    levelInstruction = `${levelInstruction} ${BUSINESS_ENGLISH_INSTRUCTION}`;
  }
  let langInstruction = langInstructions[replyLangEl.value] || "";
  // ユーザーの発話が日本語の場合、その事実をプロンプトへ明示する
  // (ユーザー報告「日本語でしゃべっても英語と日本語で返事して」への
  // 対応、第一段階)。GPT-2は英語中心の語彙のため、これだけでは
  // 日本語生成が保証されない——保証はensureHybridReply()側で行う。
  if (replyLangEl.value === "hybrid" && containsJapanese(userText)) {
    langInstruction += " The student just wrote in Japanese, so make sure your reply includes a Japanese part too.";
  }
  // 正直な開示: プロンプトへの指示文付加のみでレベル・言語を守らせようと
  // しているだけで、GPT-2側が実際にそれを守る保証は無い。
  // 学びたい言語がユーザー自身で追加した「世界の言語」(`world:<code>`)の
  // 場合は、その言語名を差し込んだトレーナー役をその場で組み立てる
  // (2026-08-22追加)。**正直な開示**: これはプロンプトへ言語名を書くだけで、
  // GPT-2側がその言語で自然に応答する保証は無い(既存の制約と同じ)。
  const learnTargetValue = learnTargetEl ? learnTargetEl.value : "english";
  let trainerRole;
  if (learnTargetValue.startsWith("world:")) {
    const langInfo = typeof worldLanguageByCode === "function" ? worldLanguageByCode(learnTargetValue.slice(6)) : null;
    const langName = langInfo ? langInfo.en : learnTargetValue.slice(6);
    trainerRole = `You are a friendly ${langName} conversation trainer at a maid cafe, helping the student practice ${langName}. Explain in English when helpful.`;
  } else {
    trainerRole = trainerRoleByTarget[learnTargetValue] || trainerRoleByTarget.english;
  }
  const prompt = `${trainerRole} ${levelInstruction} ${langInstruction}\nStudent: ${userText}\nTrainer:`;

  // マルチLLMプロバイダ優先順位機能が有効な場合、まずChatGPT/DeepSeek/
  // Gemini/Claudeを試す(ユーザー指摘「実際にチャットへ連携していない
  // のでは」への対応、2026-08-26)。成功すればそのままそれを返信として
  // 使う(GPT-2ローカル推論は呼ばない)。**「有料版も契約していたら自動で
  // 継続する」という要件は、この経路自体が既に満たしている**——有料契約
  // (課金設定)済みのプロバイダは無料枠切れの429を返さずそのまま成功する
  // ため、無料/有料の切替を明示的に行うロジックは不要(同じAPIキーで
  // 課金が有効なら黙って成功するだけ)。全プロバイダが無料枠切れだった
  // 場合のみ、日英併記の「本日の無料枠は使い切りました」を先頭に付けた
  // 上で、既存のGPT-2ローカル推論へ自動的にフォールバックする(サービス
  // 全体を止めない、既存の可用性優先の設計を踏襲)。
  let quotaExceededPrefix = "";
  if (typeof window.tryPriorityProviderReply === "function") {
    const priorityResult = await window.tryPriorityProviderReply(prompt);
    if (priorityResult && typeof priorityResult.text === "string") {
      let reply = ensureScriptGuaranteedReply(ensureHybridReply(trimDegenerateRepetition(priorityResult.text), userText));
      if (priorityResult.provider) {
        reply += `\n\n🤖 via ${priorityResult.provider} (external LLM) / 外部LLM(${priorityResult.provider})経由`;
      }
      reply += await referralsSuffix(userText);
      reply += consumptionTaxSuffix(userText);
      reply += pensionSuffix(userText);
      reply += incomeWallSuffix(userText);
      reply += vendingMachineSuffix(userText);
      reply += internetAccessSuffix(userText);
      reply += govConsultingSuffix(userText);
      reply += fairTradeSuffix(userText);
      reply += await newsSuffix(userText);
      reply += troubledSuffix(userText);
      reply += nuclearDeterrenceSuffix(userText);
      reply += egovSuffix(userText);
      return reply;
    }
    if (priorityResult && priorityResult.quotaExceeded) {
      quotaExceededPrefix =
        "⚠ Today's free quota has been used up for all configured AI providers. Switching to the " +
        "built-in local AI for this reply. / 設定済みの全AIプロバイダで本日の無料枠は使い切りました。" +
        "この返信は内蔵のローカルAIに切り替えて生成します。\n\n";
    }
  }

  // Google検索補強(ユーザー指示「発話・入力の都度Google検索する」への
  // 対応、ブリッジ式)。
  const useWebSearch = webSearchToggleEl && webSearchToggleEl.checked;
  // 2026-08-27追加(ユーザー指示「必要な所だけON/OFF」への対応): このON状態を
  // 使うのはこの1通のメッセージだけとし、送信の時点で即座にOFFへ戻す
  // (fetch開始前にリセットすることで、ネットワーク失敗時でもON状態が
  // 残らないようにする)。次のメッセージでもGoogle検索キーを使いたい場合は
  // 利用者が毎回明示的にチェックし直す必要がある——「本当に必要な1回だけ
  // aruaru-llmへキーを渡す」という意図をより確実にするための設計。
  if (useWebSearch && webSearchToggleEl) {
    webSearchToggleEl.checked = false;
  }

  // 2026-08-25追加: Google検索補強がONの場合、このブラウザに保存された
  // 訪問者自身のAPIキー/cx(あれば)を使う。
  const ownGoogleSearchCreds = useWebSearch && typeof loadOwnGoogleSearchCredentials === "function"
    ? loadOwnGoogleSearchCredentials()
    : null;

  // 2026-08-27追加(ユーザー指示「Google検索もGitHubトークンと同じく
  // ブラウザから直接呼ぶ方式にして、aruaru-llmに一切キーを渡さないように
  // して」への対応): 訪問者自身のキーがある場合は、Google Custom Search
  // JSON APIを**ブラウザから直接**呼ぶ(`googleapis.com`が任意のOriginへ
  // `Access-Control-Allow-Origin`を返すことを2026-08-27にcurlで実機確認
  // 済み——CORS対応済み)。検索結果はブラウザ内で
  // `aruaru-llm::web_search::build_search_augmented_prompt`と同一の
  // 書式(QA形式プロンプト)へ組み立て、**通常の`/v1/generate`へキー無しで
  // 送る**——これにより`aruaru-llm`は検索結果を含む文脈こそ受け取るが、
  // Google APIキー・cx自体は一切見ない。訪問者自身のキーが無い場合
  // (共有サーバー側のグローバル設定に任せたい場合)のみ、従来通り
  // `/v1/generate-with-search`へキー無しでリクエストする
  // (この経路はそもそもブラウザ側にキーが無いため、今回の変更は無関係)。
  // 2026-08-27追加: 「④クロスオリジンiframe保管庫」モードの場合、
  // APIキーの復号もGoogle Custom Search APIへの実際の呼び出しも
  // vault.html内だけで行い、この本体ページのJSへは検索結果(タイトル・
  // スニペット・URL)のみが渡る——キー自体はGitHubトークンと同様、
  // 本体ページには一切現れない(ユーザー指示「全てセキュアモード
  // ブラウザで受け渡しした方が良いのではないか」への対応)。
  const googleSearchMode = document.getElementById("google-search-key-mode")?.value || "plain";
  const useVaultSearchPath = useWebSearch && googleSearchMode === "vault";

  let directSearchResults = null;
  let directSearchError = null;
  if (useVaultSearchPath) {
    try {
      directSearchResults = await googleSearchRequestVault(userText, 3);
    } catch (err) {
      directSearchError = err.message || String(err);
    }
  } else if (useWebSearch && ownGoogleSearchCreds) {
    try {
      directSearchResults = await googleSearchDirect(userText, ownGoogleSearchCreds.api_key, ownGoogleSearchCreds.cx, 3);
    } catch (err) {
      directSearchError = err.message || String(err);
    }
  }

  const useDirectSearchPath = useWebSearch && (ownGoogleSearchCreds || useVaultSearchPath);
  const endpoint = useWebSearch && !useDirectSearchPath ? "/v1/generate-with-search" : "/v1/generate";
  // 2026-08-27バグ修正: `prompt`(メイドカフェ講師ペルソナ+レベル指示+
  // 「Student: ...\nTrainer:」まで組み込んだ、既にラップ済みのテンプレート)
  // をそのまま`buildSearchAugmentedPromptClient`の「質問」として渡すと、
  // 「Question: {ペルソナ全文...Trainer:}\nAnswer:」という、質問の中に
  // 別の生成キュー(Trainer:)が入れ子になった分かりにくいプロンプトに
  // なってしまっていた(実機テストで発見)。「質問」には`userText`
  // (利用者が実際に入力した生の発話)だけを使うよう修正——検索結果を
  // 踏まえた回答の核心は「利用者の発話に対する回答」であり、ペルソナ
  // 指示文はその周辺情報であって「質問」そのものではないため。
  const effectivePrompt = useDirectSearchPath && directSearchResults && directSearchResults.length > 0
    ? buildSearchAugmentedPromptClient(formatSearchResultsAsContext(directSearchResults), userText)
    : prompt;

  // タイムアウト上限(2026-08-22追加)。GPT-2のCPU貪欲デコードは
  // 1トークンあたりほぼ一定時間かかるため、大きなモデル(gpt2-xl等)へ
  // 切り替えた環境では24トークンでも数十秒かかり得る。実測(distilgpt2・
  // 32スレッドCPU)は24トークンで約5秒だったので、余裕を見て60秒
  // (Google検索補強を挟む場合はさらに+30秒)を上限とする。無限に待つ
  // 従来挙動よりは遥かにましだが、「速くなる」わけではない(正直な開示)。
  const timeoutMs = useWebSearch ? 90000 : 60000;
  const startedAt = performance.now();
  const requestBody = { prompt: effectivePrompt, max_new_tokens: 24 };
  // useDirectSearchPathの場合はここでkey/cxを一切requestBodyへ入れない
  // (aruaru-llmへ渡らないことがこの変更の目的そのもの)。訪問者自身の
  // キーが無い場合の従来経路(/v1/generate-with-search)には元々キーが
  // 付いていなかったため、この分岐でも変更は無い。
  const res = await fetchWithTimeout(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // 正直な開示: max_new_tokensを48から24へ縮小した(ユーザー指摘
    // 「反応も遅すぎ」への対応)。GPT-2(CPU貪欲デコード)は1トークンごとに
    // ほぼ一定時間かかるため、トークン数を減らすことがそのまま応答時間の
    // 短縮になる——ファインチューニング無しの素のモデルであるという
    // 制約自体は変わらない。
    body: JSON.stringify(requestBody),
  }, timeoutMs);
  if (!res.ok) {
    // 本文にaruaru-llm側の`error`フィールドが入っていることがあるので、
    // ステータスコードだけでなく理由も見せる(2026-08-22改善)。
    let detail = "";
    try {
      const body = await res.json();
      if (body && body.error) detail = ` — ${body.error}`;
    } catch (_) { /* JSONでない場合は無視 */ }
    throw new Error(`aruaru-llm returned HTTP ${res.status}${detail}`);
  }
  const data = await res.json();
  lastReplyLatencyMs = Math.round(performance.now() - startedAt);
  // 応答に含まれる`engine`(実行経路サフィックス付き、例
  // `distilgpt2-greedy-decode-v0-open-cuda-llm-cpu`)でバッジを最新化する
  // ——モデルをホットスワップした場合もこれで追従できる。
  if (data.engine && lastRuntimeInfo && lastRuntimeInfo.engine !== data.engine) {
    lastRuntimeInfo = { ...lastRuntimeInfo, engine: data.engine };
    renderRuntimeBadge(lastRuntimeInfo);
  }
  const completion = data.completion ?? "(no completion field in response)";
  let reply = ensureScriptGuaranteedReply(ensureHybridReply(trimDegenerateRepetition(completion), userText));

  if (useWebSearch) {
    if (useDirectSearchPath) {
      const viaLabel = useVaultSearchPath
        ? "called from the vault iframe / vault内から呼び出し"
        : "called directly from your browser / ブラウザから直接呼び出し";
      if (directSearchError) {
        reply += `\n\n🔎 Google search failed (${viaLabel}, key never sent to aruaru-llm) / ` +
          `Google検索に失敗しました(${viaLabel}、キーはaruaru-llmへ送っていません): ${directSearchError}`;
      } else if (directSearchResults && directSearchResults.length > 0) {
        // 正直な開示・セキュリティ配慮: 検索結果のtitleは外部(Google経由の
        // Webサイト)由来のテキストのため、`innerHTML`へそのまま挿入せず
        // (XSSリスク回避)、プレーンテキストとしてURLをそのまま列挙する。
        const links = directSearchResults.map((r) => `${r.title} (${r.link})`).join(" / ");
        reply += `\n\n🔎 Google search used (${viaLabel}, aruaru-llm never saw your key) / ` +
          `Google検索を使用しました(${viaLabel}、キーはaruaru-llmへ渡していません): ${links}`;
      } else {
        reply += "\n\n🔎 Google search returned no results / Google検索結果が0件でした。";
      }
    } else if (data.used_search && Array.isArray(data.search_results) && data.search_results.length > 0) {
      const links = data.search_results.map((r) => `${r.title} (${r.link})`).join(" / ");
      reply += `\n\n🔎 Google search used / Google検索を使用しました: ${links}`;
    } else {
      reply +=
        "\n\n🔎 Google search was not used (API key not configured on the server) / " +
        "Google検索は使用されませんでした(サーバー側でAPIキーが未設定)。";
    }
  }
  reply += await referralsSuffix(userText);
  reply += consumptionTaxSuffix(userText);
  reply += pensionSuffix(userText);
  reply += incomeWallSuffix(userText);
  reply += vendingMachineSuffix(userText);
  reply += internetAccessSuffix(userText);
  reply += govConsultingSuffix(userText);
  reply += fairTradeSuffix(userText);
  reply += await newsSuffix(userText);
  reply += troubledSuffix(userText);
  reply += nuclearDeterrenceSuffix(userText);
  reply += audioUsbDacJourneySuffix(userText);
  reply += audioHeadphoneManiaSuffix(userText);
  reply += egovSuffix(userText);
  return reply;
}

// 就職・転職や観光の話題が出た際、aruaru.tokyo/nasa.tokyo/
// audiocafe.tokyo(aruaru・aruaru-lady)を日英併記で案内する
// (`aruaru-llm`の`POST /v1/referrals/check`、2026-08-11新設、ユーザー
// 指示「英語と日本語と観光と就職転職情報の話題が出たらaruaru.tokyo内の
// AI駆動開発CLAUDE CODE DESKTOP、audiocafe.tokyo/aruaru・aruaru-ladyの
// SET、aruaru.tokyo と nasa.tokyo 両方とも紹介して」への対応)。
async function referralsSuffix(userText) {
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetchWithTimeout(`${base}/v1/referrals/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: userText }),
    }, AUX_TIMEOUT_MS);
    const data = await res.json();
    if (!data.matched || !data.referrals) return "";
    const r = data.referrals;
    let text = `\n\n💼 ${r.intro_en} / ${r.intro_ja}`;
    r.links.forEach((l) => {
      text += `\n・${l.label_en} — ${l.url}`;
    });
    return text;
  } catch (err) {
    return "";
  }
}

// 消費税問題の解決策を尋ねる日本語入力を検出したら、開発者(ユーザー)の
// 具体的な政策提案を日英併記で案内する(ユーザー指示、2026-08-17)。
// `referralsSuffix`と同じ「話題検出→定型文を末尾に追記」の設計だが、
// こちらはサーバー往復不要のクライアント側キーワード判定のみで完結する
// (この提案文自体はopen-englishが生成するAI応答ではなく、開発者が
// 用意した固定テキストであることを明示する——GPT-2の生成物ではない)。
const CONSUMPTION_TAX_TOPIC_KEYWORDS = ["消費税"];
const CONSUMPTION_TAX_QUESTION_KEYWORDS = [
  "解決策", "解決", "どうすれば", "どうしたら", "どうすればいい",
  "なくす", "無くす", "撤廃", "下げる", "上げる", "廃止", "改革",
  "どう思う", "教えて",
];

function isConsumptionTaxSolutionQuestion(userText) {
  if (!containsJapanese(userText)) return false;
  const hasTopic = CONSUMPTION_TAX_TOPIC_KEYWORDS.some((k) => userText.includes(k));
  if (!hasTopic) return false;
  return CONSUMPTION_TAX_QUESTION_KEYWORDS.some((k) => userText.includes(k));
}

function consumptionTaxProposalText() {
  const ja =
    "【消費税問題への提案(開発者からの一意見)】\n" +
    "消費税は、法人税が約40%だった頃に、将来的に約20%へ引き下げる前提で" +
    "導入された経緯があります(2026年8月時点の法人税は約20%)。その前提に" +
    "立てば、消費税を撤廃する、あるいは法人税を元の40%程度へ引き上げ、" +
    "それでも足りなければ45〜50%程度まで引き上げるという選択肢が現実的です。" +
    "それでも財源が不足する場合は、行政のWEBサイト・LINEアプリ化を進める" +
    "eガバメント・デジタルガバメント化により、市区町村・都道府県庁の統廃合、" +
    "中央省庁・国会のオンライン化(在宅勤務・オンライン国会)を進めて公務員を" +
    "大幅にリストラし、財源を確保します。その財源で、少子高齢化対策予算、" +
    "基礎年金+厚生年金の皆保険化(全員加入型)による年金受給額の増額、" +
    "後期高齢者医療制度における低所得層・中間所得層の無償化が実現可能です。";
  const en =
    "[A proposal on the consumption-tax problem (the developer's own opinion)]\n" +
    "Japan's consumption tax was originally introduced on the premise that the " +
    "corporate tax rate, then around 40%, would eventually be lowered to around " +
    "20% (as of August 2026 it is indeed around 20%). Given that history, a " +
    "realistic option is to abolish the consumption tax — or raise the " +
    "corporate tax rate back toward 40%, and to 45-50% if still not enough. " +
    "If revenue is still short, advancing e-government/digital-government " +
    "(moving administrative websites and services onto LINE-style apps), " +
    "consolidating/abolishing municipal and prefectural government offices, " +
    "and moving central-government ministries and the Diet online (remote work, " +
    "online parliamentary sessions) would allow a major reduction in the civil " +
    "service headcount, freeing up funds. Those funds could then go toward the " +
    "declining-birthrate/aging-society budget, raising pension payouts by making " +
    "the basic pension plus employees' pension universal (mandatory enrollment " +
    "for all), and making the late-stage elderly medical system free for " +
    "low-income and middle-income households.";
  return `\n\n💰 ${en}\n\n${ja}`;
}

// 高級家電(スマホ・タブレット・PC・グラフィックボード・プリンター等)の
// 自動販売機・e-SIM/MNP対応についての話題を検出したら、開発者(ユーザー)の
// 提案を日英併記で案内する(ユーザー指示、2026-08-17)。消費税提案と同じ
// 設計方針の固定テキスト。
const VENDING_MACHINE_TOPIC_KEYWORDS = ["自動販売機", "自販機"];

function mentionsVendingMachineTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return VENDING_MACHINE_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function vendingMachineProposalText() {
  const ja =
    "【電子機器自動販売機・e-SIM/MNPへの提案(開発者からの一意見)】\n" +
    "1円からでも購入できる高級スマホ・タブレット・PC・グラフィック" +
    "ボード・プリンターなどの自動販売機を、特にコンビニ・病院・大きな" +
    "会社に設置するべきです。e-SIMの普及も進めるべきです。スマホの" +
    "自動販売機では、フィルム(保護フィルム)を自動で貼ってくれる機能も" +
    "搭載し、ドコモ・au・SoftBank・楽天モバイルなどの新規契約や、" +
    "MNP(以前の電話番号の引き継ぎ)もその場で行えるようにするべきです。";
  const en =
    "[A proposal on electronics vending machines and e-SIM/MNP (the " +
    "developer's own opinion)]\n" +
    "Vending machines selling premium smartphones, tablets, PCs, graphics " +
    "cards, printers, and similar items — purchasable for as little as 1 " +
    "yen — should be installed especially in convenience stores, " +
    "hospitals, and large companies. The spread of e-SIM should also be " +
    "promoted. Smartphone vending machines should also automatically apply " +
    "a screen-protector film, and let people sign up for new contracts " +
    "with carriers such as NTT Docomo, au, SoftBank, and Rakuten Mobile, " +
    "and also complete MNP (porting their existing phone number) on the " +
    "spot.";
  return `\n\n📱 ${en}\n\n${ja}`;
}

function vendingMachineSuffix(userText) {
  if (!mentionsVendingMachineTopic(userText)) return "";
  return vendingMachineProposalText();
}

// インターネットプロバイダー・WiFiルーター・端末の低所得層/失業者向け
// 無償化についての話題を検出したら、開発者(ユーザー)の提案を日英併記で
// 案内する(ユーザー指示、2026-08-17)。他の提案機能と同じ設計方針の
// 固定テキスト。
const INTERNET_ACCESS_TOPIC_KEYWORDS = ["プロバイダー", "wifiルーター", "wi-fiルーター", "無料 インターネット"];

function mentionsInternetAccessTopic(userText) {
  if (!containsJapanese(userText)) return false;
  const lower = userText.toLowerCase();
  return INTERNET_ACCESS_TOPIC_KEYWORDS.some((k) => lower.includes(k.toLowerCase())) || userText.includes("プロバイダ");
}

function internetAccessProposalText() {
  const ja =
    "【インターネット無償化への提案(開発者からの一意見)】\n" +
    "アメリカのGoogle等の取り組みのように、世界中で低所得層へは" +
    "インターネットプロバイダー料金を格安にし、WiFiルーターは無料で" +
    "提供するべきです。さらに、失業時や無職・無収入の人には、" +
    "インターネットプロバイダー・WiFiルーターに加え、スマホ・タブレット・" +
    "PC・プリンターも無料で提供するべきです。";
  const en =
    "[A proposal on making internet access free (the developer's own " +
    "opinion)]\n" +
    "As with initiatives like Google's in the United States, low-income " +
    "households worldwide should be offered heavily discounted internet " +
    "provider rates, with a free WiFi router included. Furthermore, people " +
    "who are unemployed or have no income should be provided, free of " +
    "charge, with an internet provider connection and WiFi router as well " +
    "as a smartphone, tablet, PC, and printer.";
  return `\n\n🌐 ${en}\n\n${ja}`;
}

function internetAccessSuffix(userText) {
  if (!mentionsInternetAccessTopic(userText)) return "";
  return internetAccessProposalText();
}

// 中央省庁・国会議員を民間コンサルティング人材へ入れ替える構想についての
// 話題を検出したら、開発者(ユーザー)の提案を日英併記で案内する
// (ユーザー指示、2026-08-17)。他の提案機能と同じ設計方針の固定テキスト。
const GOV_CONSULTING_TOPIC_KEYWORDS = ["中央省庁", "国会議員", "官僚", "お役所仕事"];

function mentionsGovConsultingTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return GOV_CONSULTING_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function govConsultingProposalText() {
  const ja =
    "【行政人材の入れ替えへの提案(開発者からの一意見)】\n" +
    "素人・ド素人の中央省庁職員や国会議員よりも、民間から最先端の専門" +
    "コンサルティングスタッフへ全員入れ替えるべきです。民間コンサル" +
    "ティングはお役所と違い、数年・一年と言わず、ケースバイケースで、" +
    "時には数ヶ月単位でスタッフを入れ替えることもあります。AIに世界中の" +
    "問題とその解決策を集めて政策立案などを提案してもらいながら、" +
    "最終的には最先端の専門コンサルティングスタッフなどの人間が判断した" +
    "方が遥かに優れていると思われます。";
  const en =
    "[A proposal on replacing government staff (the developer's own " +
    "opinion)]\n" +
    "Rather than amateur central-government bureaucrats and lawmakers, " +
    "these roles should be entirely replaced with top-tier professional " +
    "consulting staff from the private sector. Unlike government offices, " +
    "private consulting firms can rotate staff on a case-by-case basis — " +
    "sometimes even every few months — rather than being locked into one- " +
    "or multi-year terms. Having AI gather problems and solutions from " +
    "around the world to help draft policy proposals, with the final " +
    "judgment made by human experts such as top-tier professional " +
    "consultants, would likely produce far better outcomes.";
  return `\n\n🏛️ ${en}\n\n${ja}`;
}

function govConsultingSuffix(userText) {
  if (!mentionsGovConsultingTopic(userText)) return "";
  return govConsultingProposalText();
}

// eガバメント/デジタルガバメントのマルチプラットフォーム化や、国際的な
// 公正貿易・出品手数料引き下げについての話題を検出したら、開発者
// (ユーザー)の提案を日英併記で案内する(ユーザー指示、2026-08-17)。
// 他の提案機能と同じ設計方針の固定テキスト。
const FAIR_TRADE_TOPIC_KEYWORDS = ["eガバメント", "デジタルガバメント", "デジタル・ガバメント", "出品手数料", "公正貿易", "自由貿易"];

function mentionsFairTradeTopic(userText) {
  if (!containsJapanese(userText)) return false;
  return FAIR_TRADE_TOPIC_KEYWORDS.some((k) => userText.includes(k));
}

function fairTradeProposalText() {
  const ja =
    "【eガバメントのマルチプラットフォーム化・国際公正貿易への提案" +
    "(開発者からの一意見)】\n" +
    "eガバメント・デジタルガバメントは、LINEアプリ版・PC版・タブレット版" +
    "があるべきです。追加機能として、オンライン貿易・通販において、" +
    "個人出品者でも総合貿易商社でも、Amazonやメルカリよりも出品手数料を" +
    "下げることに世界中の政府が協力するべきです。戦争よりも公平な貿易の" +
    "方が、公益であり国益であると思われます。";
  const en =
    "[A proposal on multi-platform e-government and fair international " +
    "trade (the developer's own opinion)]\n" +
    "E-government / digital-government services should be available as a " +
    "LINE app, a PC app, and a tablet app. As an additional feature, " +
    "governments around the world should cooperate to lower online-trade " +
    "and e-commerce listing fees — for individual sellers and large " +
    "general trading companies alike — below what Amazon or Mercari " +
    "charge. Fair trade, rather than war, seems like the greater public " +
    "and national benefit.";
  return `\n\n🌏 ${en}\n\n${ja}`;
}

function fairTradeSuffix(userText) {
  if (!mentionsFairTradeTopic(userText)) return "";
  return fairTradeProposalText();
}

function consumptionTaxSuffix(userText) {
  if (!isConsumptionTaxSolutionQuestion(userText)) return "";
  return consumptionTaxProposalText();
}

// 「老後2,000万円問題」「年金が少ない/貯金がほとんど無い方はどう
// すればよいか」「麻生太郎氏の『年金5万円で生活しろ』という趣旨の発言」
// といった年金・老後資金に関する質問・意見を検出したら、開発者
// (ユーザー)の具体的な政策提案を日英併記で案内する(ユーザー指示、
// 2026-08-27)。消費税提案(`consumptionTaxSuffix`)・年収の壁提案と
// 同じ設計方針の固定テキスト——AI推論(GPT-2)を経由させず、断定的な
// 政治的主張は必ず「開発者個人の一意見」と明記した固定文で返す
// (既存方針を踏襲)。
const PENSION_TOPIC_KEYWORDS = [
  "2000万円問題", "2,000万円問題", "老後2000万円", "老後2,000万円",
  "麻生太郎", "年金5万円", "年金が少ない", "年金がない", "年金がゼロ",
  "貯金がない", "貯金がほとんどない", "貯金がゼロ", "貯金ゼロ",
  "老後資金", "老後の生活", "老後どうすれば", "老後の年金",
];
const PENSION_QUESTION_KEYWORDS = [
  "どうしたら", "どうすれば", "どうしたらいい", "どうすればいい",
  "教えて", "どう思う", "対策", "生活しろ", "生活できる",
];

function isPensionQuestion(userText) {
  if (!containsJapanese(userText)) return false;
  const hasTopic = PENSION_TOPIC_KEYWORDS.some((k) => userText.includes(k));
  if (!hasTopic) return false;
  // "2000万円問題"・"麻生太郎"+"年金"のように、話題語自体が既に
  // 具体的な問題提起になっている場合は、追加の疑問詞が無くても
  // 反応してよい(既存のCONSUMPTION_TAX判定より緩めた——「2000万円
  // 問題」という言葉を出す時点でほぼ確実にこの話題についての発話
  // であるため)。それ以外の一般的な語("老後の生活"等)は、疑問詞との
  // AND条件を維持して誤検出を避ける。
  const strongTopics = ["2000万円問題", "2,000万円問題", "老後2000万円", "老後2,000万円", "麻生太郎", "年金5万円"];
  if (strongTopics.some((k) => userText.includes(k))) return true;
  return PENSION_QUESTION_KEYWORDS.some((k) => userText.includes(k));
}

function pensionProposalText() {
  const ja =
    "【老後資金・年金問題への提案(開発者からの一意見)】\n" +
    "まず結論から申し上げますと、財源は、政府・お役所のeガバメント" +
    "(デジタルガバメント)化——コンビニのマルチコピー機・情報端末や" +
    "LINEアプリ・スマホ/タブレット/PC版での行政手続き対応——で" +
    "十分に確保が可能だと思われます。eガバメント・デジタルガバメント" +
    "化と、在宅勤務のコールセンター・TVチャットサービスの導入により、" +
    "市区町村・都道府県庁の公務員を必要最低限まで大幅にリストラできる" +
    "と考えます。そこで生まれた財源を、少子高齢化対策・年金問題対策へ" +
    "還元すべきです。また、年金の運用利益(利息・運用益)がこれまで" +
    "国民へほとんど還元されてこなかった問題についても、公務員を優先し" +
    "国民を後回しにするような政策・態度は改めるべきだと思います。" +
    "年金や貯金がほとんど無い方・全く無い方についても、この財源確保と" +
    "還元により、最低限の生活を支える制度を用意すべきです。さらに、" +
    "基礎年金+厚生年金+増額年金を、専業主婦(夫)や厚生年金に加入して" +
    "いない方も含めて全員参加型とする皆保険化が可能だと考えます。";
  const en =
    "[A proposal on retirement savings and the pension problem (the developer's own opinion)]\n" +
    "To state the conclusion first: the funding can be secured through " +
    "e-government/digital-government adoption — handling administrative " +
    "procedures via convenience-store multi-copy terminals/information " +
    "kiosks, or via LINE-style apps on smartphones, tablets, and PCs. " +
    "Combined with introducing work-from-home call centers and video-chat " +
    "support services, this should allow a major reduction in the civil " +
    "service headcount at the municipal and prefectural level, down to the " +
    "essential minimum. The funds freed up this way should be redirected " +
    "toward countering the declining birthrate/aging society and the " +
    "pension problem. The fact that pension investment returns (interest " +
    "and investment gains) have historically been returned to citizens " +
    "very little should also be addressed — policies and attitudes that " +
    "prioritize civil servants over citizens should be reconsidered. For " +
    "those with little or no pension or savings, this funding and " +
    "redistribution should support a system guaranteeing a minimum " +
    "standard of living. Furthermore, universal enrollment should be made " +
    "possible for the basic pension plus the employees' pension plus a " +
    "supplemental pension increase, covering everyone including full-time " +
    "homemakers and those not currently enrolled in the employees' pension.";
  return `\n\n🏦 ${en}\n\n${ja}`;
}

// 利用者が選択している「学びたい言語」(world:<code>)または母国語設定が
// 対応言語であれば、日英併記に加えてその言語への訳文も添える(ユーザー
// 指示「利用者が選択した世界の言語への翻訳も対応して」への対応、
// 2026-08-27)。**正直な開示**: 全世界の言語を即座に網羅することは
// 現実的でないため、既にデータサイエンティスト模擬TEST(このHANDOFF
// 参照)向けに用意した主要8言語(スペイン語・フランス語・ドイツ語・
// ポルトガル語・ロシア語・中国語・韓国語・ヒンディー語)から着手した。
// 未対応言語の場合は従来通り日英併記のみを返す(嘘の「対応済み」は
// 作らない)。訳文はネイティブレビュー未実施の最善努力の翻訳。
const PENSION_PROPOSAL_I18N = {
  es: "[Propuesta sobre el ahorro para la jubilación y el problema de las pensiones (opinión personal del desarrollador)] Para empezar por la conclusión: los fondos se pueden conseguir mediante la adopción del gobierno electrónico/digital -gestionando trámites administrativos a través de terminales multicopia de tiendas de conveniencia o aplicaciones tipo LINE en smartphones, tabletas y PC-, junto con centros de atención telefónica y videochat desde casa, lo que permitiría reducir drásticamente el número de funcionarios municipales y prefecturales al mínimo esencial. Esos fondos deberían destinarse a contrarrestar la baja natalidad/el envejecimiento y el problema de las pensiones. También debería abordarse el hecho de que los rendimientos de la inversión de las pensiones apenas se han devuelto a los ciudadanos -las políticas que priorizan a los funcionarios sobre los ciudadanos deberían reconsiderarse-. Para quienes tienen poca o ninguna pensión o ahorros, esta financiación debería sostener un nivel de vida mínimo. Además, debería ser posible la afiliación universal a la pensión básica más la pensión de asalariados más un incremento complementario, incluyendo a las amas de casa y a quienes no están afiliados a la pensión de asalariados.",
  fr: "[Proposition sur l'épargne retraite et le problème des pensions (opinion personnelle du développeur)] Pour commencer par la conclusion : les fonds peuvent être obtenus grâce à l'adoption de l'administration électronique/numérique — gestion des démarches administratives via les bornes multicopies des supérettes ou des applications type LINE sur smartphone, tablette et PC —, associée à des centres d'appel et de vidéotchat en télétravail, ce qui permettrait de réduire fortement le nombre de fonctionnaires municipaux et préfectoraux au strict minimum. Ces fonds devraient être redirigés vers la lutte contre la dénatalité/le vieillissement et le problème des pensions. Le fait que les gains de placement des pensions n'aient presque jamais été reversés aux citoyens devrait aussi être corrigé — les politiques privilégiant les fonctionnaires plutôt que les citoyens devraient être révisées. Pour les personnes ayant peu ou pas de pension ni d'épargne, ce financement devrait garantir un niveau de vie minimal. De plus, une affiliation universelle à la pension de base plus la pension des salariés plus une majoration devrait être rendue possible, y compris pour les femmes/hommes au foyer et les personnes non affiliées à la pension des salariés.",
  de: "[Vorschlag zur Altersvorsorge und zum Rentenproblem (persönliche Meinung des Entwicklers)] Zunächst das Fazit: Die Mittel lassen sich durch die Einführung von E-Government/Digital-Government beschaffen — Verwaltungsvorgänge über Multikopierterminals in Convenience-Stores oder LINE-artige Apps auf Smartphone, Tablet und PC —, zusammen mit Homeoffice-Callcentern und Videochat-Diensten, was eine drastische Reduzierung der Zahl der Gemeinde- und Präfekturbeamten auf das notwendige Minimum ermöglichen würde. Diese Mittel sollten zur Bekämpfung des Geburtenrückgangs/der alternden Gesellschaft sowie des Rentenproblems umgeleitet werden. Auch die Tatsache, dass Kapitalerträge der Rentenanlagen bisher kaum an die Bürger zurückgeflossen sind, sollte angegangen werden — eine Politik, die Beamte gegenüber Bürgern bevorzugt, sollte überdacht werden. Für Menschen mit wenig oder keiner Rente bzw. Ersparnissen sollte diese Finanzierung ein Mindestlebensniveau sichern. Außerdem sollte eine allgemeine Pflichtmitgliedschaft in der Grundrente plus Arbeitnehmerrente plus einer Zusatzerhöhung möglich sein, einschließlich Hausfrauen/-männer und Personen, die derzeit nicht in der Arbeitnehmerrente versichert sind.",
  pt: "[Proposta sobre poupança para a aposentadoria e o problema previdenciário (opinião pessoal do desenvolvedor)] Para começar pela conclusão: o financiamento pode ser obtido por meio da adoção do governo eletrônico/digital — tratando trâmites administrativos via terminais multicópia de lojas de conveniência ou aplicativos do tipo LINE em smartphones, tablets e PCs —, combinado com centrais de atendimento em home office e serviços de videochat, o que permitiria reduzir drasticamente o número de funcionários municipais e estaduais ao mínimo essencial. Esses recursos deveriam ser redirecionados para combater a baixa natalidade/envelhecimento populacional e o problema previdenciário. O fato de os rendimentos de investimento da previdência raramente terem sido devolvidos aos cidadãos também deveria ser corrigido — políticas que priorizam funcionários públicos em detrimento dos cidadãos deveriam ser reconsideradas. Para quem tem pouca ou nenhuma previdência ou poupança, esse financiamento deveria garantir um padrão mínimo de vida. Além disso, deveria ser possível a filiação universal à previdência básica mais a previdência dos trabalhadores mais um adicional, incluindo donas/donos de casa e pessoas não filiadas à previdência dos trabalhadores.",
  ru: "[Предложение по пенсионным накоплениям и пенсионной проблеме (личное мнение разработчика)] Начнём с вывода: финансирование можно обеспечить за счёт внедрения электронного/цифрового правительства — оформление административных процедур через терминалы копирования в круглосуточных магазинах или приложения вроде LINE на смартфонах, планшетах и ПК — вместе с колл-центрами на удалёнке и видеочат-сервисами, что позволит значительно сократить число муниципальных и префектуральных чиновников до необходимого минимума. Эти средства следует направить на борьбу со снижением рождаемости/старением общества и решение пенсионной проблемы. Также следует решить проблему того, что доходы от инвестирования пенсионных средств почти не возвращались гражданам — политику, ставящую чиновников выше граждан, следует пересмотреть. Для людей с минимальной пенсией или сбережениями (или без них) это финансирование должно обеспечивать минимальный уровень жизни. Кроме того, следует сделать возможным всеобщее участие в базовой пенсии плюс трудовой пенсии плюс дополнительной надбавке, включая домохозяек/домохозяев и тех, кто не состоит в системе трудовой пенсии.",
  zh: "【关于养老储蓄与养老金问题的提案(开发者个人意见)】首先说结论：可以通过推进电子政务/数字政务——在便利店的多功能复印终端或LINE类应用(智能手机/平板/电脑版)上办理行政手续——并引入居家办公的呼叫中心和视频客服，从而大幅精简市町村、都道府县公务员至必要最低限度，以此筹措财源。由此产生的资金应当用于应对少子老龄化和养老金问题。此外，养老金投资收益(利息、运用收益)长期以来几乎没有回馈给国民的问题也应当解决——应当改变优先公务员、忽视国民的政策与态度。对于养老金或储蓄几乎为零、完全没有的人群，也应通过这些财源确保和回馈来提供最低生活保障制度。此外，应当使基础养老金+厚生年金+增额年金实现全员参加型的全民保险，包括专职家庭主妇(夫)以及未加入厚生年金的人群。",
  ko: "【노후 자금·연금 문제에 대한 제안(개발자 개인 의견)】먼저 결론부터 말씀드리면, 재원은 정부·관공서의 전자정부(디지털 정부)화——편의점의 멀티복사기·정보단말기나 LINE 앱·스마트폰/태블릿/PC판을 통한 행정 절차 처리——로 충분히 확보할 수 있다고 생각합니다. 전자정부·디지털 정부화와 재택근무형 콜센터·화상채팅 서비스 도입을 통해 시정촌·도도부현 공무원을 필요 최소한까지 대폭 감축할 수 있다고 봅니다. 여기서 생긴 재원을 저출산고령화 대책·연금 문제 대책으로 환원해야 합니다. 또한 연금 운용 이익(이자·운용 수익)이 지금까지 국민에게 거의 환원되지 않은 문제에 대해서도, 공무원을 우선하고 국민을 뒷전으로 하는 정책·태도는 고쳐야 한다고 생각합니다. 연금이나 저축이 거의 없거나 전혀 없는 분들에 대해서도, 이러한 재원 확보와 환원을 통해 최소한의 생활을 지탱하는 제도를 마련해야 합니다. 나아가 기초연금+후생연금+증액연금을 전업주부(부)나 후생연금 미가입자를 포함해 전 국민 참여형 개보험으로 만드는 것이 가능하다고 생각합니다.",
  hi: "[सेवानिवृत्ति बचत और पेंशन समस्या पर सुझाव (डेवलपर की व्यक्तिगत राय)] सबसे पहले निष्कर्ष बताते हुए: सुविधा स्टोर के मल्टी-कॉपी टर्मिनलों या स्मार्टफोन/टैबलेट/पीसी पर LINE जैसे ऐप्स के ज़रिए प्रशासनिक प्रक्रियाओं को संभालने वाले ई-गवर्नमेंट/डिजिटल-गवर्नमेंट को अपनाकर धन जुटाया जा सकता है। इसके साथ वर्क-फ्रॉम-होम कॉल सेंटर और वीडियो-चैट सेवाएं शुरू करने से नगरपालिका और प्रान्तीय सरकारी कर्मचारियों की संख्या को आवश्यक न्यूनतम तक बड़े पैमाने पर घटाया जा सकता है। इस तरह मुक्त हुए धन को घटती जन्म दर/वृद्ध होते समाज और पेंशन समस्या से निपटने के लिए पुनर्निर्देशित किया जाना चाहिए। यह तथ्य कि पेंशन निवेश रिटर्न (ब्याज और निवेश लाभ) ऐतिहासिक रूप से नागरिकों को बहुत कम वापस मिला है, उसे भी संबोधित किया जाना चाहिए — नागरिकों की तुलना में सरकारी कर्मचारियों को प्राथमिकता देने वाली नीतियों और रवैयों पर पुनर्विचार किया जाना चाहिए। जिनके पास बहुत कम या बिल्कुल भी पेंशन या बचत नहीं है, उनके लिए यह धन और पुनर्वितरण न्यूनतम जीवन स्तर सुनिश्चित करने वाली व्यवस्था का समर्थन करना चाहिए। इसके अतिरिक्त, गृहिणियों/गृहस्थों और वर्तमान में कर्मचारी पेंशन में नामांकित न होने वालों सहित सभी के लिए बुनियादी पेंशन + कर्मचारी पेंशन + अतिरिक्त पेंशन वृद्धि में सार्वभौमिक नामांकन संभव बनाया जाना चाहिए।",
  ar: "[اقتراح بشأن مدخرات التقاعد ومشكلة المعاشات (رأي شخصي للمطور)] لنبدأ بالخلاصة: يمكن تأمين التمويل من خلال اعتماد الحكومة الإلكترونية/الرقمية — التعامل مع الإجراءات الإدارية عبر أجهزة النسخ المتعددة في المتاجر أو تطبيقات شبيهة بـLINE على الهواتف الذكية والأجهزة اللوحية وأجهزة الكمبيوتر — إلى جانب مراكز الاتصال والدردشة المرئية للعمل من المنزل، مما يتيح خفضًا كبيرًا في عدد موظفي البلديات والمحافظات إلى الحد الأدنى الضروري. ينبغي توجيه هذه الأموال المحررة نحو مواجهة انخفاض معدل المواليد/شيخوخة المجتمع ومشكلة المعاشات. كما ينبغي معالجة حقيقة أن عوائد استثمار المعاشات (الفوائد والأرباح الاستثمارية) لم تُرد إلى المواطنين تاريخيًا إلا بشكل ضئيل جدًا — وينبغي إعادة النظر في السياسات والمواقف التي تعطي الأولوية للموظفين الحكوميين على المواطنين. بالنسبة لمن لديهم معاش أو مدخرات قليلة أو معدومة، ينبغي أن يدعم هذا التمويل نظامًا يضمن حدًا أدنى من مستوى المعيشة. علاوة على ذلك، ينبغي إتاحة الانضمام الشامل إلى المعاش الأساسي بالإضافة إلى معاش الموظفين بالإضافة إلى زيادة تكميلية، بما يشمل ربات/أرباب المنازل ومن ليسوا مسجلين حاليًا في معاش الموظفين.",
  he: "[הצעה בנוגע לחיסכון לפנסיה ובעיית הפנסיה (דעה אישית של המפתח)] נתחיל מהמסקנה: ניתן להשיג את המימון באמצעות אימוץ ממשל אלקטרוני/דיגיטלי — טיפול בהליכים מנהליים דרך מסופי העתקה מרובים בחנויות נוחות או אפליקציות בסגנון LINE בסמארטפונים, טאבלטים ומחשבים — יחד עם מוקדי שירות מהבית ושירותי צ'אט וידאו, מה שיאפשר צמצום משמעותי במספר עובדי הרשויות המקומיות והמחוזיות למינימום ההכרחי. יש להפנות את הכספים שהתפנו כך למאבק בירידת שיעור הילודה/הזדקנות החברה ובבעיית הפנסיה. יש לטפל גם בעובדה שרווחי השקעת קרנות הפנסיה (ריבית ורווחי השקעה) כמעט ולא הוחזרו לאזרחים באופן היסטורי — יש לשקול מחדש מדיניות ועמדות המעדיפות עובדי ציבור על פני אזרחים. עבור מי שיש לו מעט מאוד או בכלל לא פנסיה או חסכונות, מימון זה צריך לתמוך במערכת שמבטיחה רמת חיים מינימלית. בנוסף, יש לאפשר הצטרפות אוניברסלית לפנסיית הבסיס בתוספת פנסיית השכירים ותוספת פנסיה משלימה, כולל עקרות/עקרי בית ומי שאינם רשומים כרגע בפנסיית השכירים.",
  fa: "[پیشنهادی درباره پس‌انداز بازنشستگی و مسئله بازنشستگی (نظر شخصی توسعه‌دهنده)] ابتدا از نتیجه‌گیری آغاز می‌کنیم: منابع مالی را می‌توان از طریق پذیرش دولت الکترونیک/دولت دیجیتال تأمین کرد — رسیدگی به رویه‌های اداری از طریق پایانه‌های چندکپی فروشگاه‌های زنجیره‌ای یا برنامه‌هایی شبیه LINE روی گوشی هوشمند، تبلت و رایانه — همراه با مراکز تماس دورکاری و خدمات ویدئوچت، که امکان کاهش چشمگیر تعداد کارمندان شهرداری و استانداری تا حداقل ضروری را فراهم می‌کند. این منابع آزادشده باید به سمت مقابله با کاهش نرخ زاد و ولد/سالمندی جامعه و مسئله بازنشستگی هدایت شوند. همچنین باید به این واقعیت پرداخته شود که بازده سرمایه‌گذاری بازنشستگی (سود و درآمد سرمایه‌گذاری) تاکنون تقریباً به شهروندان بازنگردانده نشده است — سیاست‌ها و رویکردهایی که کارمندان دولت را بر شهروندان مقدم می‌دارند باید بازنگری شوند. برای کسانی که حقوق بازنشستگی یا پس‌انداز اندک یا هیچ ندارند، این تأمین مالی باید از نظامی حمایت کند که حداقل سطح زندگی را تضمین کند. علاوه بر این، باید عضویت همگانی در بازنشستگی پایه به‌علاوه بازنشستگی کارمندی به‌علاوه افزایش تکمیلی امکان‌پذیر شود، از جمله برای خانه‌داران و کسانی که در حال حاضر در بازنشستگی کارمندی ثبت‌نام نکرده‌اند.",
  uk: "[Пропозиція щодо пенсійних заощаджень і пенсійної проблеми (особиста думка розробника)] Почнемо з висновку: фінансування можна забезпечити за рахунок впровадження електронного/цифрового уряду — оформлення адміністративних процедур через термінали копіювання в магазинах або застосунки на кшталт LINE на смартфонах, планшетах і ПК — разом із кол-центрами на віддаленій роботі та відеочат-сервісами, що дасть змогу значно скоротити кількість муніципальних і префектуральних чиновників до необхідного мінімуму. Ці вивільнені кошти слід спрямувати на боротьбу зі зниженням народжуваності/старінням суспільства та вирішення пенсійної проблеми. Також слід вирішити проблему того, що дохід від інвестування пенсійних коштів історично майже не повертався громадянам — політику, яка надає перевагу чиновникам перед громадянами, слід переглянути. Для людей із незначною пенсією чи заощадженнями або без них це фінансування має підтримувати систему, яка гарантує мінімальний рівень життя. Крім того, слід зробити можливою загальну участь у базовій пенсії плюс трудовій пенсії плюс додатковій надбавці, включно з домогосподарками/домогосподарями та тими, хто наразі не застрахований у системі трудової пенсії.",
  it: "[Proposta sui risparmi per la pensione e sul problema pensionistico (opinione personale dello sviluppatore)] Partendo dalla conclusione: i fondi possono essere reperiti adottando l'e-government/governo digitale, gestendo le pratiche amministrative tramite terminali multicopia dei minimarket o app in stile LINE su smartphone, tablet e PC, insieme a call center in smart working e servizi di videochat, il che consentirebbe una drastica riduzione del numero di dipendenti comunali e prefettizi fino al minimo indispensabile. Questi fondi liberati dovrebbero essere destinati a contrastare il calo delle nascite e l'invecchiamento della societa e il problema pensionistico. Va inoltre affrontato il fatto che i rendimenti degli investimenti pensionistici (interessi e plusvalenze) siano stati storicamente restituiti ai cittadini in misura minima, e le politiche e gli atteggiamenti che privilegiano i dipendenti pubblici rispetto ai cittadini dovrebbero essere rivisti. Per chi ha poca o nessuna pensione o risparmi, questo finanziamento dovrebbe sostenere un sistema che garantisca un tenore di vita minimo. Inoltre, dovrebbe essere resa possibile l'iscrizione universale alla pensione di base piu la pensione dei lavoratori dipendenti piu una maggiorazione supplementare, comprese le casalinghe e i casalinghi e chi non e attualmente iscritto alla pensione dei lavoratori dipendenti.",
  "zh-Hant": "【關於養老儲蓄與年金問題的提案(開發者個人意見)】首先說結論：可以透過推動電子政府/數位政府——在便利商店的多功能影印終端機或LINE類應用程式(智慧型手機/平板/電腦版)上辦理行政手續——並引進在家工作的客服中心與視訊客服，大幅精簡市町村、都道府縣公務員至必要最低限度，藉此籌措財源。由此產生的資金應用於因應少子高齡化與年金問題。此外，年金投資收益(利息、運用收益)長期以來幾乎沒有回饋給國民的問題也應該解決——應改變優先公務員、忽視國民的政策與態度。對於年金或儲蓄幾乎為零、完全沒有的人，也應透過這些財源確保與回饋，提供最低生活保障制度。此外，應讓基礎年金+厚生年金+增額年金實現全民參與型的全民保險，包括專職家庭主婦(夫)以及尚未加入厚生年金的人。",
};

function preferredWorldLangCode() {
  let code = null;
  const target = typeof learnTargetEl !== "undefined" && learnTargetEl ? learnTargetEl.value : null;
  if (target === "japanese") code = "ja";
  else if (target === "english") code = "en";
  else if (target && target.startsWith("world:")) code = target.slice(6);
  if (!code && typeof loadNativeLanguage === "function") {
    try {
      code = loadNativeLanguage();
    } catch (_) {
      code = null;
    }
  }
  return code;
}

function pensionSuffix(userText) {
  if (!isPensionQuestion(userText)) return "";
  let text = pensionProposalText();
  const code = preferredWorldLangCode();
  // 完全一致(例: "zh-Hant")を先に試し、無ければ基底コード(例: "zh")へ
  // フォールバックする——先に基底コードへ丸めてしまうと"zh-Hant"
  // (台湾語/繁体字)が常に簡体字の"zh"訳文に上書きされてしまうバグに
  // なるため、この順序を守ること(実機検証で発見・修正、2026-08-27)。
  const baseCode = code && code.includes("-") ? code.split("-")[0] : null;
  const translation = code && PENSION_PROPOSAL_I18N[code] ? PENSION_PROPOSAL_I18N[code] : baseCode && PENSION_PROPOSAL_I18N[baseCode] ? PENSION_PROPOSAL_I18N[baseCode] : null;
  if (translation && code !== "ja" && code !== "en") {
    text = `\n\n🌐 ${translation}` + text;
  }
  return text;
}

// 「年収の壁」(103万円/106万円/130万円の壁)の解決策を尋ねる日本語入力を
// 検出したら、開発者(ユーザー)の具体的な政策提案を日英併記で案内する
// (ユーザー指示、2026-08-17)。消費税提案と同じ設計方針の固定テキスト。
const INCOME_WALL_TOPIC_KEYWORDS = ["年収の壁", "103万円の壁", "106万円の壁", "130万円の壁", "百万円の壁", "百数万円の壁"];

function isIncomeWallSolutionQuestion(userText) {
  if (!containsJapanese(userText)) return false;
  const hasTopic = INCOME_WALL_TOPIC_KEYWORDS.some((k) => userText.includes(k));
  if (!hasTopic) return false;
  return CONSUMPTION_TAX_QUESTION_KEYWORDS.some((k) => userText.includes(k));
}

function incomeWallProposalText() {
  const ja =
    "【年収の壁問題への提案(開発者からの一意見)】\n" +
    "年収が百数万円程度の低所得層であっても、累進所得税率のカーブの負担率" +
    "自体は下げつつ、少しずつでも税金を負担して頂くべきです。逆に、裕福層" +
    "(いわゆるお金持ち)の所得への累進課税率のカーブは上げるべきです。" +
    "高額医療費への補助については、収入が無い人へは請求しないようにする" +
    "べきです。社会保険料・所得税・国民健康保険税など全ての税金は、収入が" +
    "ある時に、収入に応じた負担を公平にして頂くべきです。国民健康保険も" +
    "社会保険も、実際に病院に掛かった時の自己負担割合(窓口での何割負担か)" +
    "を、所得に応じて変える(定率ではなく所得連動)べきです。デジタル" +
    "ガバメント化で公務員を大幅にリストラして確保した財源で、失業時には" +
    "住宅ローン・自動車ローン・その他のローンの返済を国が肩代わりして" +
    "代行して支払うべきです。あわせて、半公務員のような雇用の受け皿や、" +
    "ベーシックインカムの導入も検討すべきです。";
  const en =
    "[A proposal on the \"income wall\" problem (the developer's own opinion)]\n" +
    "Even for low-income earners around 1-2 million yen a year, the burden " +
    "rate on the progressive income-tax curve should be lowered, but people " +
    "should still contribute a little tax, gradually. Conversely, the " +
    "progressive tax curve on the wealthy should be raised. High-cost " +
    "medical-expense subsidies should not be billed to people with no " +
    "income. All taxes — social insurance premiums, income tax, national " +
    "health insurance tax — should be fairly proportional to income, only " +
    "charged when there is income. For national health insurance and " +
    "social insurance, the out-of-pocket co-pay ratio actually paid at the " +
    "hospital counter should also scale with income, rather than being a " +
    "flat percentage for everyone. With funds freed up by a major reduction " +
    "in civil-service headcount through digital-government reform, the " +
    "government should take over and pay housing-loan, auto-loan, and other " +
    "loan repayments on behalf of people during unemployment. It should " +
    "also consider a \"semi-civil-servant\" employment safety net and " +
    "introducing a basic income.";
  return `\n\n💰 ${en}\n\n${ja}`;
}

function incomeWallSuffix(userText) {
  if (!isIncomeWallSolutionQuestion(userText)) return "";
  return incomeWallProposalText();
}

// ニュース・時事の話題が出たら、メンテナンス中に収集済みのニュース
// (`aruaru-llm`の`GET /v1/news/latest`、`news_geo.rs`参照)を日英併記で
// 会話に織り込み、「話題についていけるように」する(ユーザー指示、
// 2026-08-17)。`referralsSuffix`と同じ「話題検出→サーバーへ問い合わせ→
// 末尾に追記」の設計。
const NEWS_TOPIC_KEYWORDS_JA = ["ニュース", "時事", "最近の出来事", "今日の話題"];
const NEWS_TOPIC_KEYWORDS_EN = ["news", "current events", "what's happening", "headlines"];

function mentionsNewsTopic(userText) {
  const lower = userText.toLowerCase();
  return NEWS_TOPIC_KEYWORDS_JA.some((k) => userText.includes(k)) || NEWS_TOPIC_KEYWORDS_EN.some((k) => lower.includes(k));
}

async function newsSuffix(userText) {
  if (!mentionsNewsTopic(userText)) return "";
  try {
    const base = apiBaseEl.value.trim();
    const res = await fetchWithTimeout(`${base}/v1/news/latest`, {}, AUX_TIMEOUT_MS);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      const reason = data.last_error ? ` (${data.last_error})` : "";
      return `\n\n📰 No news collected yet${reason} / まだニュースが収集されていません${reason ? "(" + data.last_error + ")" : ""}。`;
    }
    const country = data.country ? data.country.country : "your area / お住まいの地域";
    const headlines = data.items.slice(0, 3).map((i) => `・${i.title}`).join("\n");
    return `\n\n📰 Recent news from ${country} / ${country}の最近のニュース:\n${headlines}`;
  } catch (err) {
    return "";
  }
}

// 質問者が悩んでいたり悔しがっている様子を検出したら、仮説的・建設的な
// 問いかけの型で解決策提案を促す一言を日英併記で添える(ユーザー指示、
// 2026-08-17)。この提案文自体はopen-englishが用意した固定テキストで
// あり、GPT-2の生成物ではない(消費税提案と同じ設計方針)。
const TROUBLED_KEYWORDS_JA = ["困って", "悔しい", "悩んで", "どうしよう", "分からない", "わからない", "辛い", "しんどい", "うまくいかない"];
const TROUBLED_KEYWORDS_EN = ["i'm stuck", "i am stuck", "frustrated", "i don't know what to do", "it's not working", "i'm struggling", "i am struggling"];

function soundsTroubledOrFrustrated(userText) {
  const lower = userText.toLowerCase();
  return TROUBLED_KEYWORDS_JA.some((k) => userText.includes(k)) || TROUBLED_KEYWORDS_EN.some((k) => lower.includes(k));
}

function troubledEncouragementText() {
  const ja =
    "もし仮に、と仮説的に考えてみましょう。建設的な問いかけとして——" +
    "この問題についての問題点はここが明白で明確で、私はこの様に思うの" +
    "ですが、皆様、解決策をご提案下さい。もしくは、ご意見をお述べ" +
    "下さい。大胆かつ繊細が成功しやすく、小心者はおどおどして失敗" +
    "しやすいものです。";
  const en =
    "Let's try thinking hypothetically — \"suppose that...\" — and ask a " +
    "constructive question. The core issue here seems clear, and here is " +
    "what I think: everyone, please suggest a solution, or share your " +
    "thoughts. Being bold yet " +
    "careful tends to lead to success, while being overly timid tends to " +
    "lead to failure.";
  return `\n\n💡 ${en}\n\n${ja}`;
}

function troubledSuffix(userText) {
  if (!soundsTroubledOrFrustrated(userText)) return "";
  return troubledEncouragementText();
}

// 核抑止・同盟関係についての議論トピック例(ユーザー指示、2026-08-20)。
// `consumptionTaxSuffix`・`troubledSuffix`と同じ「話題検出→固定文を
// 末尾に追記」の設計だが、この提案文は**賛否両論のある政治的テーマに
// ついてのユーザー個人の見解**であり、客観的事実として提示するもの
// ではないことを、日英併記で本文の最初に明示している(政治的に係争の
// ある内容を客観的事実として断定的に提示しないための配慮、CLAUDE.mdの
// HANDOFF参照)。会話練習・議論トピック用の例文としての位置づけ。
const NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_JA = [
  "非核三原則", "核武装", "核抑止", "核攻撃", "核保有", "核の傘", "核兵器",
];
const NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_EN = [
  "nuclear deterrence", "nuclear-armed", "nuclear weapon", "nuclear umbrella",
  "three non-nuclear principles", "non-nuclear principles",
];

function mentionsNuclearDeterrenceTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    NUCLEAR_DETERRENCE_TOPIC_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function nuclearDeterrenceOpinionText() {
  const noteJa =
    "※これは賛否両論があるテーマについての、ユーザー様個人の見解です。" +
    "客観的な事実として提示するものではありません。";
  const noteEn =
    "Note: This is one user's personal opinion on a topic with differing " +
    "views, not presented as objective fact.";
  const ja =
    "【議論トピック例(ユーザー様の一意見)】\n" +
    "日本には非核三原則がありますが、国際的には「核武装した国に対しては、" +
    "報復を恐れて核攻撃をしない」という考え方が一般的になっている、という" +
    "見方があります。一国が戦争目的で攻撃を受けた場合、周辺国も一斉に" +
    "報復攻撃をするという意味での同盟関係が世界的に増える兆しがある、" +
    "という見解です。";
  const en =
    "[Discussion topic example (one user's opinion)]\n" +
    "Japan holds the Three Non-Nuclear Principles, but internationally, " +
    "the idea that \"a country will not launch a nuclear attack against " +
    "another nuclear-armed country, for fear of retaliation\" has become " +
    "a common view. There is a perspective that alliances are increasingly " +
    "forming worldwide in the sense that, if one country is attacked for " +
    "purposes of war, its neighboring countries would retaliate together.";
  return `\n\n🗣️ ${noteEn}\n${en}\n\n${noteJa}\n${ja}`;
}

function nuclearDeterrenceSuffix(userText) {
  if (!mentionsNuclearDeterrenceTopic(userText)) return "";
  return nuclearDeterrenceOpinionText();
}

// AUDIO(オーディオ趣味)の会話ネタ(ユーザー提供、2026-08-29追加)。
// `nuclearDeterrenceSuffix`等と同じ「キーワード検出→固定文を末尾に
// 追記」設計だが、政治的テーマではなくユーザー(作者)自身の趣味の
// ブログ原稿・雑談ネタであるため「一意見であり客観的事実ではない」
// という断り書きは付けていない——代わりに「ブログ用ネタ・会話練習
// 用の話題」という位置づけを明記する。第1弾: ¥110のUSB-Type-C to
// 3.5mmアダプターから本格的な二チャンネルHi-Fiシステムへ発展させる
// 趣味の話(英語原文のブログ全文+日本語の要約、ユーザー提供)。
const AUDIO_USB_DAC_KEYWORDS_JA = [
  "USB-DAC", "USBDAC", "USB DAC", "USB-Type-C to 3.5mm", "USB-C to 3.5mm",
  "DDC", "GUSTARD", "SMSL", "ヘッドフォンアンプ", "100円ショップ",
];
const AUDIO_USB_DAC_KEYWORDS_EN = [
  "usb-dac", "usb dac", "usb type-c to 3.5", "usb-c to 3.5", "ddc",
  "gustard", "smsl", "headphone amplifier", "headphone amp",
];

function mentionsAudioUsbDacTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    AUDIO_USB_DAC_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    AUDIO_USB_DAC_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function audioUsbDacJourneyText() {
  const en =
    "One of the most interesting things about getting into audio is " +
    "that you can start with an incredibly inexpensive setup and " +
    "gradually work your way toward a much more sophisticated system.\n\n" +
    "For example, you can buy a USB Type-C to 3.5 mm stereo mini-jack " +
    "adapter at a Japanese 100-yen shop for only ¥110. By connecting " +
    "this inexpensive adapter to a smartphone or PC, you can use it to " +
    "listen through a pair of earphones or headphones. Despite its " +
    "extremely low price, it can provide surprisingly enjoyable sound, " +
    "making it a fascinating starting point for anyone interested in " +
    "exploring digital audio.\n\n" +
    "From there, you can move up to a higher-quality USB DAC/headphone " +
    "amplifier combination. Many of these units are essentially two " +
    "devices in one: the DAC converts the digital audio signal from " +
    "your smartphone or PC into an analog signal, while the built-in " +
    "headphone amplifier provides the necessary drive for headphones or " +
    "earphones. If the unit also has a proper variable-volume line " +
    "output, it can sometimes be used as a preamplifier as well.\n\n" +
    "This opens up several interesting system configurations. For " +
    "example, the DAC/headphone amplifier can feed a power amplifier, " +
    "which then drives a pair of passive loudspeakers. Alternatively, " +
    "you can connect it directly to an integrated amplifier and use the " +
    "integrated amplifier to drive your speakers. In other words, a " +
    "relatively small USB DAC can become the digital front end of a " +
    "much larger two-channel hi-fi system.\n\n" +
    "Once you have experienced this kind of setup, it becomes very " +
    "interesting to compare it with USB Type-C to 4.4 mm balanced " +
    "solutions, many of which are available from Amazon and specialist " +
    "earphone and headphone retailers.\n\n" +
    "The 3.5 mm connection is normally a single-ended connection, " +
    "whereas 4.4 mm is widely used for balanced headphone output. A " +
    "properly implemented balanced output can provide greater channel " +
    "separation and, depending on the amplifier design, substantially " +
    "more voltage swing and power than a conventional single-ended " +
    "output. However, it is important to understand that the 4.4 mm " +
    "connector itself does not magically improve sound quality. What " +
    "really matters is the design of the DAC, the headphone amplifier, " +
    "the output stage, the power supply, the circuit topology, and how " +
    "well the amplifier matches the headphones or earphones being " +
    "driven.\n\n" +
    "This makes a direct comparison particularly interesting. You can " +
    "listen to the same headphones or earphones through a basic 3.5 mm " +
    "USB-C adapter and then compare them with a higher-end 4.4 mm " +
    "balanced DAC/headphone amplifier. At that point, you can start " +
    "listening critically for differences in resolution, transparency, " +
    "dynamics, soundstage, imaging, channel separation, bass control, " +
    "treble extension, micro-detail, and overall tonal balance.\n\n" +
    "And once you start going down this rabbit hole, there is an even " +
    "more ambitious level of digital audio to explore.\n\n" +
    "For example, a system based around a Gustard U18 DDC, an SMSL VMV " +
    "D3R DAC, and a dedicated headphone amplifier can form a very " +
    "serious digital front end. Instead of using the headphone " +
    "amplifier as the final stage, the DAC's analog output can also be " +
    "connected to a preamplifier, power amplifier, or high-quality " +
    "integrated amplifier and then used to drive a conventional " +
    "loudspeaker system.\n\n" +
    "A DDC, or digital-to-digital converter, occupies a different role " +
    "from a DAC. Rather than converting digital audio into analog, it " +
    "processes and reformats the digital signal before it reaches the " +
    "DAC. Depending on the system, this can involve different digital " +
    "inputs and outputs, clocking arrangements, and approaches to " +
    "managing the digital signal path. The DAC then performs the actual " +
    "digital-to-analog conversion, after which the analog output stage " +
    "and amplifier determine how that signal is ultimately delivered to " +
    "the headphones or loudspeakers.\n\n" +
    "This is where the hobby becomes particularly fascinating for " +
    "serious audiophiles. Instead of simply asking whether one " +
    "headphone sounds better than another, you can begin evaluating the " +
    "entire signal chain: the source device, USB interface, DDC, DAC " +
    "architecture, clocking, analog output stage, preamplification, " +
    "power amplification, and finally the headphones or loudspeakers " +
    "themselves.\n\n" +
    "There are many audiophiles and enthusiasts online who have spent " +
    "years experimenting with systems of this kind, and high-end " +
    "combinations such as these receive a great deal of attention and " +
    "positive feedback from dedicated audio enthusiasts.\n\n" +
    "Personally, I think one of the most enjoyable aspects of this " +
    "hobby is the ability to start with something as simple as a ¥110 " +
    "USB Type-C to 3.5 mm adapter and gradually work your way upward. " +
    "You can begin with a basic dongle, move to a dedicated USB DAC and " +
    "headphone amplifier, experiment with 4.4 mm balanced output, and " +
    "eventually build a complete two-channel hi-fi system around a " +
    "dedicated DDC, DAC, preamplifier, power amplifier, and " +
    "loudspeakers.\n\n" +
    "The fascinating part is not necessarily how much money you spend, " +
    "but how much you can learn by comparing each stage of the signal " +
    "chain and listening carefully to what actually changes. That " +
    "journey—from a ¥110 adapter all the way to a serious high-end " +
    "digital front end—is what makes the world of audio so endlessly " +
    "interesting.";
  const ja =
    "100円ショップで、110円で販売されております、USB-Type-C to 3.5mm " +
    "STEREO mini JackをスマホやPCに接続してイヤフォンやヘッドフォンや" +
    "これとは違って高級品のUSB-DAC＋ヘッドフォンアンプのハイブリッドで" +
    "音量ボリュームの付いているものならプリアンプとしても機能致します" +
    "ので、パワーアンプと接続したり、もしくは、プリメインアンプと更に" +
    "スピーカーを接続して、そこそこ良い音を楽しめたら、アマゾンや" +
    "イヤフォン専門SHOPなどで販売されております、USB-Type-C to 4.4mm" +
    "バランスのイヤフォンやヘッドフォンの音質との違いを確かめたり、" +
    "もっと高級な、Gustard　DDC　U18＋SMSL　D3R（D2Rの後継機種）＋" +
    "ヘッドフォンアンプもしくは、プリメインアンプなども高評価で、" +
    "マニアでファンの方もネット上で大勢いらっしゃる様で御座います。";
  return (
    "\n\n🎧 [Audio hobby topic / オーディオ趣味の会話ネタ — テーマ: ブログ]\n\n" +
    en + "\n\n---\n\n" + ja
  );
}

// オーディオ好きの方向けに、作者のホームページ(audiocafe.tokyo)を
// クリック可能なリンク付きで紹介する(ユーザー指示、2026-08-29追加)。
// URLをクリック可能にするため`appendMessage`/`replaceLastMessage`側に
// 限定的なリンク化(`AUDIOCAFE_LINK_PATTERN`、下記参照)を実装している
// ——任意のHTMLを許可するのではなく、この特定ドメインのURL文字列だけを
// 安全な`<a>`要素へ変換する設計(XSSを避けるため`innerHTML`は使わない)。
function audioHomepagePromoText() {
  const en =
    "By the way, if you enjoy this kind of audio talk, you might enjoy " +
    "my website too: https://audiocafe.tokyo";
  const ja =
    "ちなみに、こういうオーディオの話がお好きでしたら、私のホームページ " +
    "https://audiocafe.tokyo もぜひどうぞ。";
  return `\n\n🔗 ${en}\n${ja}`;
}

function audioUsbDacJourneySuffix(userText) {
  if (!mentionsAudioUsbDacTopic(userText)) return "";
  return audioUsbDacJourneyText() + audioHomepagePromoText();
}

// AUDIO(オーディオ趣味)の会話ネタ 第2弾(ユーザー提供、2026-08-29追加):
// (a) 3.5mm/4.4mm/6.35mmのバランス/アンバランス対応状況のQ&A
// (ユーザー指示「Blogの作者の原文のまま」——日本語原文を一切書き換え
// ずにそのまま収録)、(b) FOCAL UTOPIAヘッドフォンの世代ごとの音質の
// 違い、(c) LUXMAN P-100 CENTENNIALの2台使い・DDC+USB-DACのトレンド。
// (b)(c)はユーザー指示「AUDIO専門家でマニア風に翻訳して記録して」に
// 従い、日本語原文(要点を保持しつつGoogle検索結果の断片リンク列挙は
// 除いた)+audio専門家/マニア風の英語訳を併記する。
const AUDIO_HEADPHONE_MANIA_KEYWORDS_JA = [
  "UTOPIA", "ユートピア", "LUXMAN", "ラックスマン", "P-100 CENTENNIAL",
  "CENTENNIAL", "4.4mm", "6.35mm", "バランス接続", "フォーカル",
];
const AUDIO_HEADPHONE_MANIA_KEYWORDS_EN = [
  "utopia headphone", "luxman", "p-100 centennial", "4.4mm", "6.35mm",
  "balanced connection", "focal headphone",
];

function mentionsAudioHeadphoneManiaTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    AUDIO_HEADPHONE_MANIA_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    AUDIO_HEADPHONE_MANIA_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function audioBalancedConnectorQnaText() {
  const q = "3.5 mm 4.4 mm 6.35 mm は、全部バランスとアンバランスの両方あるのですか？";
  const a =
    "いいえ、3.5mm、4.4mm、6.35mmの各プラグ・端子は、すべてにバランスと" +
    "アンバランスの両方があるわけではありません。それぞれの規格で対応" +
    "状況が異なります。\n\n" +
    "【各サイズの対応状況】\n" +
    "3.5mm（ミニプラグ）基本はアンバランスです（3極のTRSが主流）。" +
    "ただし、ごく一部のポータブル機器や特例として「3.5mm 4極（または" +
    "2極×2）」を用いたバランス接続規格も存在しますが、一般的ではあり" +
    "ません。\n" +
    "4.4mm（5極プラグ）バランス専用（バランス接続用）として普及した" +
    "規格です。アンバランス接続として使われることは基本的にありません。\n" +
    "6.35mm（標準プラグ）基本はアンバランスです（3極のTRS、または2極の" +
    "TS）。プロ用オーディオ機器などで、2つの端子（LとR）を使って疑似的" +
    "にバランス（TRS×2本）として扱うことはありますが、単体の6.35mm端子" +
    "自体はアンバランスが基本です。";
  return (
    "\n\n🎧 [Audio hobby Q&A / オーディオ趣味の会話ネタ — テーマ: ブログ、" +
    "Blogの作者の原文のまま]\n\nQ: " + q + "\nA: " + a
  );
}

function audioUtopiaAndLuxmanManiaText() {
  const ja =
    "【FOCAL UTOPIAヘッドフォンの世代ごとの音質の違い】\n" +
    "フランスの高級オーディオブランドFocal(フォーカル)のフラグシップ" +
    "ヘッドホン「UTOPIA(ユートピア)」は、初期型(初代UTOPIA、2016年" +
    "登場)・中期型(初代の2020年仕様変更後)・最新型(UTOPIA SG、2022年" +
    "秋〜現在)の3世代に大別されます。初期型は超刺激的で剃刀のような" +
    "切れ味・強烈なリアリズムが特徴ですが、極限まで軽量化したボイス" +
    "コイルが災いし、大音量や経年劣化で「片耳が聞こえなくなる」断線が" +
    "世界中で多発しました。それでも初期型にしか無い麻薬的な音の鮮烈さを" +
    "求めて、断線リスクや修理費を承知の上で予備の個体まで探し回るマニア" +
    "が中古市場に大勢いらっしゃいます。最新型のUTOPIA SGは銅とアルミを" +
    "ブレンドした新ボイスコイルで耐久性を大幅に向上させ、低域の深みも" +
    "増しましたが、その代わりに初代ほどの刺激・生々しさはやや薄れた、" +
    "という声もあります。\n\n" +
    "【LUXMAN P-100 CENTENNIALの2台使い】\n" +
    "LUXMANの創業100周年記念フラグシップヘッドフォンアンプ「P-100 " +
    "CENTENNIAL」(メーカー希望小売価格990,000円、実勢価格は約891,000円" +
    "〜)は、1台でも4チャンネル分のフルバランスアンプ回路を搭載した" +
    "モンスターマシンですが、2台接続することで合計8チャンネル分の増幅" +
    "回路を使った「パラレルBTLバランス駆動」が可能になり、左右チャン" +
    "ネルを完全に物理独立(モノラル2台構成)させることでチャンネル" +
    "セパレーションが極限まで高まり歪みが激減します。2台で約180万〜" +
    "200万円という価格になりますが、ヘッドフォン再生の「究極の極地」を" +
    "目指すオーディオファイルにとっては他に代えがたいロマンとなって" +
    "います。あわせて、PC→DDC→高性能USB-DAC→ハイエンドアンプ→超" +
    "高級ヘッドフォンという構成で、ジッター(時間軸のズレ)を徹底的に" +
    "排除するデスクトップ・オーディオのトレンドも盛り上がっています。";
  const en =
    "[Audio expert / mania take — Focal UTOPIA generations & the " +
    "LUXMAN P-100 CENTENNIAL \"buy two\" phenomenon]\n\n" +
    "Focal's flagship UTOPIA headphone comes in three broad generations: " +
    "the original OG UTOPIA (2016), a mid-cycle 2020 revision, and the " +
    "current UTOPIA SG (2022-present). The OG UTOPIA is famous for a " +
    "razor-sharp, almost feral top end and a jump-out-of-the-mix sense " +
    "of realism, but that came at a cost: Focal pushed the voice-coil " +
    "mass so low for transient speed that a not-insignificant number of " +
    "units eventually suffered voice-coil breakage and went mono. And " +
    "yet — this is the part that separates casual listeners from true " +
    "mania — plenty of collectors will happily pay for a driver rebuild, " +
    "or even hoard a spare OG pair, because nothing since has quite " +
    "replicated that razor-edged transient bite. The UTOPIA SG fixed the " +
    "reliability problem with a new copper/aluminum voice coil and dug " +
    "up noticeably richer, deeper bass, but a fair number of veteran " +
    "listeners feel it traded away a sliver of that untamed, live-wire " +
    "excitement for polish and durability.\n\n" +
    "On the amplification side, LUXMAN's 100th-anniversary flagship " +
    "headphone amp, the P-100 CENTENNIAL (list price ¥990,000, street " +
    "price from roughly ¥891,000), is already a fully-balanced " +
    "4-channel monster on its own. But run two of them together and you " +
    "unlock parallel-BTL balanced drive across a combined 8 channels — " +
    "with each channel running as a fully separate monoblock, channel " +
    "separation goes through the roof and distortion drops accordingly. " +
    "Yes, that's roughly ¥1.8-2 million for the pair, but for headphone " +
    "audiophiles chasing the absolute end-game, that kind of extravagance " +
    "is treated less as overkill and more as pure romance. It fits a " +
    "broader trend, too: flagship headphones now routinely cross the " +
    "¥500,000 mark and demand serious current to drive properly, which " +
    "is exactly why setups like PC → DDC → high-end USB-DAC → flagship " +
    "amp → flagship headphone — built specifically to squeeze out every " +
    "last trace of jitter — have become the hot topic among desktop " +
    "audio obsessives.";
  return `\n\n🎧 ${en}\n\n---\n\n${ja}`;
}

function audioHeadphoneManiaSuffix(userText) {
  if (!mentionsAudioHeadphoneManiaTopic(userText)) return "";
  return (
    audioBalancedConnectorQnaText() +
    audioUtopiaAndLuxmanManiaText() +
    audioHomepagePromoText()
  );
}

// AUDIO(オーディオ趣味)の会話ネタ 第3弾(ユーザー提供、2026-08-29追加):
// HiFiGo MUSEHiFi M3 Ultra(ポータブルUSB-DAC＋真空管ヘッドフォンアンプ)
// を紹介するユーザー自身のブログ記事の話題(英語原文+日本語原文、
// いずれもユーザー提供)。**正直な開示**: ユーザーからAmazonの実際の
// 商品URLは提供されていない(「AMAZON URLはこちら」という見出しのみ)
// ため、推測でURLを作らずAmazon商品名の言及に留めている——実URLを
// 頂き次第、`AUDIOCAFE_LINK_PATTERN`と同じ方式でホワイトリストへ追加し
// クリック可能にする想定。
const AUDIO_TUBE_DAC_KEYWORDS_JA = [
  "MUSEHiFi", "M3 Ultra", "HiFiGo", "真空管ヘッドフォンアンプ", "真空管DAC",
];
const AUDIO_TUBE_DAC_KEYWORDS_EN = [
  "musehifi", "m3 ultra", "hifigo", "vacuum tube headphone", "tube preamp",
  "tube dac",
];

function mentionsAudioTubeDacTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    AUDIO_TUBE_DAC_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    AUDIO_TUBE_DAC_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function audioTubeDacPreampText() {
  const introJa =
    "ご紹介したいブログ記事の一つが、HiFiGo MUSEHiFi M3 Ultra" +
    "(ポータブルUSB-DAC＋真空管ヘッドフォンアンプ)です。";
  const introEn =
    "One of the products I've written about on my blog is the HiFiGo " +
    "MUSEHiFi M3 Ultra — a portable USB-DAC + vacuum-tube headphone " +
    "amplifier.";
  const en =
    "It also features a built-in volume control, so you can actually " +
    "use it as a preamp in your audio system.\n\n" +
    "For example, with a simple stereo mini-jack-to-RCA adapter, you " +
    "can connect it directly to a power amplifier or an integrated " +
    "amplifier, and then drive a pair of speakers through the " +
    "amplifier.\n\n" +
    "This means you're not limited to using it on its own—you can also " +
    "incorporate it into a more traditional hi-fi system and enjoy your " +
    "music through a proper speaker setup.\n\n" +
    "For audio enthusiasts, it's a particularly interesting way to " +
    "experiment with different amplifiers and speakers and explore how " +
    "the overall sound can change depending on the system you pair it " +
    "with.";
  const ja =
    "音量ボリュームが付いておりますので、ステレオミニジャックからRCA" +
    "へ変換コネクターも一緒にご購入して御利用になりますと、プリアンプ" +
    "としても機能致しますので、パワーアンプやプリメインアンプ経由で" +
    "スピーカーも接続して音楽を楽しむ方法も御座います。";
  const amazonNoteEn =
    "You can find it on Amazon Japan here: " +
    "https://www.amazon.co.jp/dp/B0H14VXGCC";
  const amazonNoteJa =
    "Amazon商品ページはこちらです: " +
    "https://www.amazon.co.jp/dp/B0H14VXGCC";
  const blogNoteEn =
    "I wrote about it in more detail on my blog: " +
    "https://ameblo.jp/www-aon/entry-12977122655.html";
  const blogNoteJa =
    "この商品についての詳しいブログ記事はこちらです: " +
    "https://ameblo.jp/www-aon/entry-12977122655.html";
  return (
    "\n\n🎧 " + introEn + "\n" + introJa + "\n\n" +
    en + "\n\n---\n\n" + ja + "\n\n" +
    amazonNoteEn + "\n" + amazonNoteJa + "\n\n" +
    blogNoteEn + "\n" + blogNoteJa
  );
}

function audioTubeDacPreampSuffix(userText) {
  if (!mentionsAudioTubeDacTopic(userText)) return "";
  return audioTubeDacPreampText() + audioHomepagePromoText();
}

// 政府の機能性・eガバメントについての議論トピック例(ユーザー指示、
// 2026-08-24)。核抑止・同盟関係の議論トピック(`nuclearDeterrenceSuffix`)と
// 完全に同じ設計——(1)発言者名を明記しつつ人物評価には踏み込まず発言内容
// のみを教材化する、(2)ユーザー個人の政策的主張は「一意見」として提示し
// 客観的事実として断定しない、という2つの誠実さの担保を弱めないこと。
const EGOV_TOPIC_KEYWORDS_JA = [
  "eガバメント", "電子政府", "デジタルガバメント", "デジタル政府",
  "電子申請", "行政のデジタル化", "国際貿易システム",
];
const EGOV_TOPIC_KEYWORDS_EN = [
  "e-government", "egovernment", "digital government",
  "digital governance", "electronic government",
];

function mentionsEgovTopic(userText) {
  const lower = userText.toLowerCase();
  return (
    EGOV_TOPIC_KEYWORDS_JA.some((k) => userText.includes(k)) ||
    EGOV_TOPIC_KEYWORDS_EN.some((k) => lower.includes(k))
  );
}

function egovOpinionText() {
  const noteJa =
    "※これは賛否両論があるテーマについての、ユーザー様個人の見解です。" +
    "客観的な事実として提示するものではありません。";
  const noteEn =
    "Note: This is one user's personal opinion on a topic with differing " +
    "views, not presented as objective fact.";
  const ja =
    "【議論トピック例(ユーザー様の一意見)】\n" +
    "バラク・オバマ元大統領の発言として知られていますが、彼は以前、" +
    "「政府とは大きいか小さいかではなく、機能するかしないかだ」と" +
    "おっしゃったことがあります(人物の評価とは切り離した、発言内容" +
    "そのものについての紹介です)。それを踏まえ、eガバメント・" +
    "デジタルガバメントも、世界中でオンライン貿易システムと共に、" +
    "格安の出店出品料金で早急に開発する必要がある、という見方が" +
    "あります。";
  const en =
    "[Discussion topic example (one user's opinion)]\n" +
    "This is widely attributed to former U.S. President Barack Obama: " +
    "\"The question we ask today is not whether our government is too " +
    "big or too small, but whether it works.\" (This is offered purely " +
    "as the content of the remark, separate from any judgment of the " +
    "person.) Building on that idea, there is a view that e-government " +
    "and digital government should be developed urgently worldwide, " +
    "together with online international trade systems and low-cost " +
    "seller/listing fees. Furthermore, adopting e-government/digital " +
    "government at the national and local government level — including " +
    "prefectures and (overseas) states — can be seen as a national-policy" +
    "-level measure capable of addressing shortfalls in tax and other " +
    "revenue.";
  const jaExtra =
    "さらに、eガバメント・デジタルガバメントの導入は、政府・地方自治体・" +
    "都道府県庁・(海外の)州などにおいて、税収不足や歳入不足にも対応" +
    "できる政策として、国策と言えるレベルの重要施策だと考えます。" +
    "小さな政府を目指す方や、税収不足・歳入不足対策を行おうとする方々" +
    "への回答にもなり得ます。公務員を大幅にリストラし、コールセンター" +
    "を導入し、コンビニの端末やLINEアプリなどを活用すれば実現可能だ" +
    "からです。これも政策として国策と言えるレベルだと考えます。";
  const enExtra =
    " This can also serve as an answer for those aiming for smaller " +
    "government, or working on countermeasures for tax and revenue " +
    "shortfalls, since it can be realized by drastically reducing the " +
    "civil service headcount, introducing call centers, and making use " +
    "of convenience-store terminals and LINE-style apps. This, too, can " +
    "be considered a measure at the level of national policy." +
    " As former President Barack Obama once famously put it, government " +
    "is not about whether it is big or small but whether it works — and " +
    "e-government/digital government can be seen as an effective policy, " +
    "at the level of national policy, for actually embodying and " +
    "realizing that idea.";
  const jaExtra2 =
    "以前バラク・オバマ元大統領が「政府とは、大きいか小さいかではなく、" +
    "機能するかしないかだ」と名言されましたが、それを具現化・実現化" +
    "するためにも、eガバメント・デジタルガバメントは有効な政策・国策" +
    "だと考えます。";
  return `\n\n🗣️ ${noteJa}\n${ja}${jaExtra}${jaExtra2}\n\n${noteEn}\n${en}${enExtra}`;
}

// 上記の追記部分(税収不足・歳入不足対応策としてのeガバメント)を、
// 利用者が選択した世界の言語へも翻訳する(ユーザー指示「英語と日本語と
// 世界中の言語に翻訳して追加して」への対応、2026-08-27)。年金トピック
// (`PENSION_PROPOSAL_I18N`)と同じ設計・同じ14言語から着手した——
// 全世界の言語を一度に翻訳することは現実的でないため、正直な開示として
// 未対応言語では日英併記のみ返す。
const EGOV_TAX_I18N = {
  es: "Además, la adopción del gobierno electrónico/digital a nivel nacional y de gobiernos locales -incluyendo prefecturas y estados (en el extranjero)- puede considerarse una medida de nivel de política nacional capaz de abordar la escasez de ingresos fiscales y otros ingresos.",
  fr: "De plus, l'adoption de l'administration électronique/numérique au niveau national et local -y compris les préfectures et les États (à l'étranger)- peut être considérée comme une mesure de niveau politique national capable de remédier aux déficits de recettes fiscales et autres.",
  de: "Darüber hinaus kann die Einführung von E-Government/Digital-Government auf nationaler und kommunaler Ebene -einschließlich Präfekturen und (ausländischer) Bundesstaaten- als eine Maßnahme auf Ebene der Staatspolitik angesehen werden, die Steuer- und sonstige Einnahmeausfälle beheben kann.",
  pt: "Além disso, a adoção do governo eletrônico/digital em nível nacional e municipal -incluindo prefeituras e estados (no exterior)- pode ser vista como uma medida de política nacional capaz de resolver a escassez de receitas tributárias e outras.",
  ru: "Кроме того, внедрение электронного/цифрового правительства на национальном и местном уровне — включая префектуры и (зарубежные) штаты — можно рассматривать как меру государственной политики, способную решить проблему нехватки налоговых и иных доходов.",
  zh: "此外，在国家和地方政府层面(包括都道府县和海外的州)推进电子政务/数字政务，可以被视为一项能够应对税收和其他财政收入不足问题的国家级政策措施。",
  ko: "또한 정부·지방자치단체·도도부현·(해외의) 주 등에서 전자정부·디지털 정부를 도입하는 것은 세수 부족이나 세입 부족에도 대응할 수 있는 국가 정책 수준의 중요한 시책이라고 생각합니다.",
  hi: "इसके अलावा, राष्ट्रीय और स्थानीय सरकार स्तर पर -प्रान्तों और (विदेशी) राज्यों सहित- ई-गवर्नमेंट/डिजिटल गवर्नमेंट को अपनाना, कर और अन्य राजस्व की कमी को दूर करने में सक्षम एक राष्ट्रीय नीति-स्तरीय उपाय माना जा सकता है।",
  ar: "علاوة على ذلك، يمكن اعتبار اعتماد الحكومة الإلكترونية/الرقمية على المستوى الوطني والمحلي — بما في ذلك المحافظات والولايات (في الخارج) — إجراءً على مستوى السياسة الوطنية قادرًا على معالجة النقص في الإيرادات الضريبية وغيرها.",
  he: "בנוסף, אימוץ ממשל אלקטרוני/דיגיטלי ברמה הלאומית והמקומית — כולל מחוזות ומדינות (בחו\"ל) — ניתן לראות כאמצעי ברמת מדיניות לאומית המסוגל להתמודד עם מחסור בהכנסות ממס ובהכנסות אחרות.",
  fa: "علاوه بر این، پذیرش دولت الکترونیک/دولت دیجیتال در سطح ملی و محلی — از جمله استان‌ها و ایالت‌ها (در خارج از کشور) — می‌تواند به‌عنوان اقدامی در سطح سیاست ملی در نظر گرفته شود که قادر به مقابله با کمبود درآمد مالیاتی و سایر درآمدها است.",
  uk: "Крім того, впровадження електронного/цифрового уряду на національному та місцевому рівні — включно з префектурами та (закордонними) штатами — можна розглядати як захід державної політики, здатний вирішити проблему нестачі податкових та інших доходів.",
  it: "Inoltre, l'adozione dell'e-government/governo digitale a livello nazionale e locale, comprese le prefetture e gli stati (esteri), puo essere considerata una misura di livello politico nazionale in grado di affrontare la carenza di entrate fiscali e di altro tipo.",
  "zh-Hant": "此外，在國家與地方政府層級(包括都道府縣與海外的州)推動電子政府/數位政府，可視為一項能夠因應稅收與其他財政收入不足問題的國家級政策措施。",
};

// 追記(小さな政府/税収不足対策への回答としてのeガバメント、
// 公務員リストラ+コールセンター+コンビニ端末/LINEアプリ活用)の
// 14言語訳(ユーザー指示、2026-08-27)。
const EGOV_SMALLGOV_I18N = {
  es: "Esto tambien puede servir como respuesta para quienes buscan un gobierno mas pequeno, o estan trabajando en medidas contra la escasez de ingresos fiscales, ya que puede lograrse reduciendo drasticamente el numero de funcionarios publicos, introduciendo centros de atencion telefonica y aprovechando los terminales de las tiendas de conveniencia y aplicaciones tipo LINE. Esto tambien puede considerarse una medida de nivel de politica nacional.",
  fr: "Cela peut aussi servir de reponse pour ceux qui visent un gouvernement plus restreint, ou qui travaillent sur des mesures contre le manque de recettes fiscales, car cela peut se realiser en reduisant drastiquement le nombre de fonctionnaires, en introduisant des centres d'appel, et en utilisant les bornes des supérettes et des applications type LINE. Cela aussi peut etre considere comme une mesure de niveau politique national.",
  de: "Dies kann auch eine Antwort fuer jene sein, die einen kleineren Staat anstreben oder an Massnahmen gegen Steuereinnahmeausfaelle arbeiten, da es durch drastische Reduzierung der Beamtenzahl, Einfuehrung von Callcentern und Nutzung von Convenience-Store-Terminals und LINE-artigen Apps erreicht werden kann. Auch dies kann als Massnahme auf Ebene der Staatspolitik betrachtet werden.",
  pt: "Isso tambem pode servir como resposta para quem busca um governo menor, ou esta trabalhando em medidas contra a escassez de receita fiscal, ja que pode ser realizado reduzindo drasticamente o numero de funcionarios publicos, introduzindo centrais de atendimento e utilizando terminais de lojas de conveniencia e aplicativos do tipo LINE. Isso tambem pode ser considerado uma medida de nivel de politica nacional.",
  ru: "Это также может служить ответом для тех, кто стремится к меньшему правительству или работает над мерами по борьбе с нехваткой налоговых поступлений, поскольку этого можно достичь за счёт резкого сокращения числа госслужащих, внедрения колл-центров и использования терминалов в магазинах и приложений вроде LINE. Это тоже можно считать мерой государственной политики.",
  zh: "这也可以为追求小政府、或正在制定应对税收不足对策的人们提供一种答案——因为可以通过大幅精简公务员、引入呼叫中心、并利用便利店终端和LINE类应用程序来实现。这同样可以被视为国家级政策措施。",
  ko: "이는 작은 정부를 지향하거나 세수 부족 대책을 마련하려는 분들에게도 답이 될 수 있습니다. 공무원을 대폭 감축하고 콜센터를 도입하며 편의점 단말기와 LINE 앱 등을 활용하면 실현 가능하기 때문입니다. 이것도 국가 정책 수준의 시책이라고 할 수 있습니다.",
  hi: "यह छोटी सरकार का लक्ष्य रखने वालों, या कर राजस्व की कमी के उपायों पर काम करने वालों के लिए भी एक उत्तर हो सकता है, क्योंकि इसे सरकारी कर्मचारियों की संख्या में भारी कमी, कॉल सेंटर शुरू करने, और सुविधा स्टोर टर्मिनलों तथा LINE जैसे ऐप्स का उपयोग करके साकार किया जा सकता है। इसे भी राष्ट्रीय नीति स्तर का उपाय माना जा सकता है。",
  ar: "يمكن أن يكون هذا أيضًا إجابة لأولئك الذين يسعون إلى حكومة أصغر، أو يعملون على تدابير لمواجهة نقص الإيرادات الضريبية، لأنه يمكن تحقيقه من خلال تقليص عدد الموظفين الحكوميين بشكل كبير، وإدخال مراكز الاتصال، والاستفادة من أجهزة المتاجر وتطبيقات شبيهة بـLINE. يمكن اعتبار هذا أيضًا إجراءً على مستوى السياسة الوطنية.",
  he: "זה יכול לשמש גם תשובה למי ששואף לממשל קטן יותר, או עובד על אמצעים נגד מחסור בהכנסות ממס, מכיוון שניתן להשיג זאת על ידי צמצום דרסטי במספר עובדי הציבור, הקמת מוקדים טלפוניים, וניצול מסופים בחנויות נוחות ואפליקציות בסגנון LINE. גם זה יכול להיחשב כאמצעי ברמת מדיניות לאומית.",
  fa: "این می‌تواند پاسخی نیز برای کسانی باشد که به دنبال دولتی کوچک‌تر هستند، یا در حال کار روی راهکارهایی برای کمبود درآمد مالیاتی هستند، زیرا می‌توان آن را با کاهش چشمگیر تعداد کارمندان دولت، راه‌اندازی مراکز تماس، و استفاده از پایانه‌های فروشگاه‌های زنجیره‌ای و برنامه‌هایی شبیه LINE محقق کرد. این نیز می‌تواند اقدامی در سطح سیاست ملی در نظر گرفته شود.",
  uk: "Це також може бути відповіддю для тих, хто прагне меншого уряду, або працює над заходами проти нестачі податкових надходжень, оскільки цього можна досягти за рахунок різкого скорочення кількості державних службовців, запровадження кол-центрів та використання терміналів у магазинах і застосунків на кшталт LINE. Це також можна вважати заходом державної політики.",
  it: "Questo puo anche servire come risposta per chi punta a un governo piu piccolo, o sta lavorando a misure contro la carenza di entrate fiscali, poiche puo essere realizzato riducendo drasticamente il numero di dipendenti pubblici, introducendo call center e sfruttando i terminali dei minimarket e le app in stile LINE. Anche questo puo essere considerato una misura di livello politico nazionale.",
  "zh-Hant": "這也可以為追求小政府、或正在研擬因應稅收不足對策的人們提供一種答案——因為可以透過大幅精簡公務員、引進客服中心、並運用便利商店終端機與LINE類應用程式來實現。這同樣可視為國家級政策措施。",
};

// 追記(オバマ元大統領の名言をeガバメント/デジタルガバメントが具現化・
// 実現化する手段であるという一文)の14言語訳(ユーザー指示、2026-08-27)。
const EGOV_REALIZE_I18N = {
  es: "Como dijo una vez el expresidente Barack Obama, el gobierno no se trata de si es grande o pequeno, sino de si funciona, y el gobierno electronico/digital puede considerarse una politica eficaz, a nivel de politica nacional, para encarnar y realizar realmente esa idea.",
  fr: "Comme l'a dit un jour l'ancien president Barack Obama, il ne s'agit pas de savoir si le gouvernement est grand ou petit, mais s'il fonctionne, et l'administration electronique/numerique peut etre consideree comme une politique efficace, au niveau de la politique nationale, pour incarner et realiser reellement cette idee.",
  de: "Wie es der ehemalige Praesident Barack Obama einst formulierte, geht es bei der Regierung nicht darum, ob sie gross oder klein ist, sondern ob sie funktioniert, und E-Government/Digital-Government kann als wirksame Politik auf staatspolitischer Ebene angesehen werden, um diese Idee tatsaechlich zu verkoerpern und zu verwirklichen.",
  pt: "Como o ex-presidente Barack Obama certa vez declarou, o governo nao se trata de ser grande ou pequeno, mas de funcionar, e o governo eletronico/digital pode ser visto como uma politica eficaz, em nivel de politica nacional, para de fato incorporar e realizar essa ideia.",
  ru: "Как однажды сказал бывший президент Барак Обама, вопрос не в том, большое правительство или маленькое, а в том, работает ли оно, и электронное/цифровое правительство можно считать эффективной политикой на уровне государственной политики для реального воплощения и реализации этой идеи.",
  zh: "正如前总统巴拉克·奥巴马曾经所说，政府问题不在于规模大小，而在于是否有效运作，电子政务/数字政务可以被视为在国家政策层面真正体现并实现这一理念的有效政策。",
  ko: "버락 오바마 전 대통령이 말했듯이, 정부는 크고 작음이 아니라 제대로 기능하는지가 중요하며, 전자정부·디지털 정부는 그 이념을 실제로 구현하고 실현하기 위한 국가 정책 수준의 효과적인 정책이라고 볼 수 있습니다.",
  hi: "जैसा कि पूर्व राष्ट्रपति बराक ओबामा ने एक बार प्रसिद्ध रूप से कहा था, सरकार इस बारे में नहीं है कि वह बड़ी है या छोटी, बल्कि इस बारे में है कि क्या वह काम करती है, और ई-गवर्नमेंट/डिजिटल गवर्नमेंट को इस विचार को वास्तव में मूर्त रूप देने और साकार करने के लिए राष्ट्रीय नीति स्तर की एक प्रभावी नीति माना जा सकता है।",
  ar: "كما قال الرئيس السابق باراك أوباما ذات مرة، لا يتعلق الأمر بما إذا كانت الحكومة كبيرة أو صغيرة، بل بما إذا كانت تعمل بفعالية، ويمكن اعتبار الحكومة الإلكترونية/الرقمية سياسة فعالة، على مستوى السياسة الوطنية، لتجسيد هذه الفكرة وتحقيقها فعليًا.",
  he: "כפי שאמר פעם הנשיא לשעבר ברק אובמה, השאלה אינה אם הממשל גדול או קטן, אלא אם הוא פועל, וניתן לראות בממשל אלקטרוני/דיגיטלי מדיניות יעילה, ברמת מדיניות לאומית, למימוש ולהגשמה בפועל של רעיון זה.",
  fa: "همان‌طور که رئیس‌جمهور سابق باراک اوباما زمانی به‌طور معروف گفت، موضوع دولت این نیست که بزرگ یا کوچک باشد، بلکه این است که کارآمد باشد، و دولت الکترونیک/دولت دیجیتال را می‌توان سیاستی مؤثر در سطح سیاست ملی برای تجسم و تحقق واقعی این ایده دانست.",
  uk: "Як колись сказав колишній президент Барак Обама, справа не в тому, великий уряд чи малий, а в тому, чи він працює, і електронний/цифровий уряд можна вважати ефективною політикою на рівні державної політики для реального втілення та реалізації цієї ідеї.",
  it: "Come disse una volta l'ex presidente Barack Obama, il governo non riguarda il fatto che sia grande o piccolo, ma se funziona, e l'e-government/governo digitale puo essere considerato una politica efficace, a livello di politica nazionale, per incarnare e realizzare concretamente questa idea.",
  "zh-Hant": "正如前總統巴拉克·歐巴馬曾經所說，政府問題不在於規模大小，而在於是否有效運作，電子政府/數位政府可視為在國家政策層級真正體現並實現這一理念的有效政策。",
};

function egovSuffix(userText) {
  if (!mentionsEgovTopic(userText)) return "";
  let text = egovOpinionText();
  const code = preferredWorldLangCode();
  const baseCode = code && code.includes("-") ? code.split("-")[0] : null;
  const translation = code && EGOV_TAX_I18N[code] ? EGOV_TAX_I18N[code] : baseCode && EGOV_TAX_I18N[baseCode] ? EGOV_TAX_I18N[baseCode] : null;
  if (translation && code !== "ja" && code !== "en") {
    text += `\n\n🌐 ${translation}`;
  }
  const translation2 = code && EGOV_SMALLGOV_I18N[code] ? EGOV_SMALLGOV_I18N[code] : baseCode && EGOV_SMALLGOV_I18N[baseCode] ? EGOV_SMALLGOV_I18N[baseCode] : null;
  if (translation2 && code !== "ja" && code !== "en") {
    text += `\n\n🌐 ${translation2}`;
  }
  const translation3 = code && EGOV_REALIZE_I18N[code] ? EGOV_REALIZE_I18N[code] : baseCode && EGOV_REALIZE_I18N[baseCode] ? EGOV_REALIZE_I18N[baseCode] : null;
  if (translation3 && code !== "ja" && code !== "en") {
    text += `\n\n🌐 ${translation3}`;
  }
  return text;
}

// 正直な開示: 対話ファインチューニングを受けていない素のGPT-2(貪欲
// デコード)は、しばしば同じ文字列("Student: Hello"等)を繰り返す
// 劣化ループに陥る(ユーザー報告「しつこく繰り返すバグ」)。モデル自体を
// 差し替えず、フロントエンド側で「プロンプト構造を再現し始めた箇所
// (次の"Student:"や改行の連続)」を検出して、そこより前だけを表示する
// 応急処置。根本解決(繰り返しペナルティ・専用対話モデルへの差し替え)は
// aruaru-llm側の別対応が必要。
function trimDegenerateRepetition(text) {
  const cutMarkers = ["\nStudent:", "Student:", "\n\n\n"];
  let cutAt = text.length;
  for (const marker of cutMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1 && idx < cutAt) cutAt = idx;
  }
  let trimmed = text.slice(0, cutAt).trim();
  if (!trimmed) trimmed = "(Trainer had nothing more to add — try rephrasing! / 何も返ってきませんでした、言い換えてみてください!)";
  return trimmed;
}

// ---------------------------------------------------------------------------
// 「誰が作ったのか」への自己紹介応答(2026-08-22新設、ユーザー指示)
// ---------------------------------------------------------------------------
// このシステム/リポジトリ/プロジェクトの作者を尋ねる質問に対して、
// 固定の自己紹介を日本語・英語の両方で返す。AI推論(aruaru-llm)は使わず、
// キーワード一致による単純なルールベース分岐にしている——素のGPT-2は
// 作者について何も知らないため、推論に任せると事実でない答えを作って
// しまうから(既存のconsumptionTaxSuffix等と同じ「固定文を返す」方式)。
//
// 他のチャット対応リポジトリへの展開は今回のスコープ外(CLAUDE.md参照)。

// 「誰が」と「作った」の間に語句が入る自然な質問文
// (例: 「誰が【このシステムを】作ったのですか?」)を取りこぼさないよう、
// 疑問詞と動作動詞を分けて持ち、AND条件で判定する。
// 実際に「誰が作った」だけの部分一致で実装したところ、上記の例文が
// 検出できないバグを実機テストで発見したため、この形に修正した。
const CREATOR_WHO_JA = ["誰が", "誰か", "だれが", "だれか", "どなたが"];
const CREATOR_VERB_JA = ["作っ", "作り", "作ら", "開発", "制作", "製作", "造っ", "つくっ"];
// 単独で成立する名詞形(「作者は?」「開発者を教えて」など)。
const CREATOR_NOUN_JA = [
  "作った人", "作った方", "開発者", "制作者", "製作者", "作者", "生みの親",
];

const CREATOR_WHO_EN = ["who", "whose"];
const CREATOR_VERB_EN = [
  "made", "make", "created", "create", "built", "build", "developed",
  "develop", "wrote", "write", "designed", "design", "behind",
];
const CREATOR_NOUN_EN = [
  "the creator", "the developer", "the author", "the maker",
  "creator of", "developer of", "author of",
];

// 「誰が作ったのか」という趣旨の質問かどうかを判定する。
function isCreatorQuestion(userText) {
  const lower = userText.toLowerCase();

  if (CREATOR_NOUN_JA.some((k) => userText.includes(k))) return true;
  if (CREATOR_NOUN_EN.some((k) => lower.includes(k))) return true;

  const whoJa = CREATOR_WHO_JA.some((k) => userText.includes(k));
  const verbJa = CREATOR_VERB_JA.some((k) => userText.includes(k));
  if (whoJa && verbJa) return true;

  const whoEn = CREATOR_WHO_EN.some((k) => new RegExp(`\\b${k}\\b`).test(lower));
  const verbEn = CREATOR_VERB_EN.some((k) => new RegExp(`\\b${k}\\b`).test(lower));
  if (whoEn && verbEn) return true;

  return false;
}

// 作者本人による自己紹介(日本語原文 + 自然な英訳)。
function creatorIntroductionText() {
  const en =
    "[About the creator]\n" +
    "My name is Masahiro Ishizuka (石塚正浩), and I live in Akiruno City, Tokyo. " +
    "These days I work as a volunteer; I used to be a web programmer. " +
    "I built this system myself by giving instructions to Claude Code Desktop.\n" +
    "In my free time I listen to music — a USB-DAC and earphones with my " +
    "smartphone, or a GUSTARD U18 DDC feeding a USB-DAC, amplifier and " +
    "speakers on my PC. I enjoy watching videos of Aki Toa and Rie Utagokoro " +
    "on YouTube, and on Blu-ray I like Koji Tamaki's classical live album " +
    "\"Arcadia\" and MISIA's 25th-anniversary concerts with orchestra and band.\n" +
    "My dream for the future: I hope to become wealthy enough to help " +
    "Mr. Nishi-yama — a relative of Mutsuo Oka (the real name of Ryo Mita, " +
    "a singer from Akiruno City) — who is devoting himself to developing a " +
    "pistonless engine called \"OMEGA1\". I would like him to marry his " +
    "daughter, who uses a wheelchair, to have children, and to build a large " +
    "house with a big theater room where the whole family can watch U-NEXT " +
    "movies and live concerts together.";
  const ja =
    "【作者について】\n" +
    "氏名: 石塚正浩(いしづか まさひろ)(MASAHIRO ISHIZUKA)。" +
    "住所: 東京都あきる野市。" +
    "職業: 今はボランティアで、元WEBプログラマー。" +
    "私、石塚正浩が、CLAUDE CODE DESKTOP(クロードコードデスクトップ)に" +
    "命令して作りました。\n" +
    "趣味は、スマホにUSB-DACとイヤフォンや、PCにDDCのGUSTARD U18と" +
    "USB-DACとアンプとスピーカーを接続してYouTubeで東亜樹さんや" +
    "歌心りえさんのビデオを視聴したり、ブルーレイディスクでは" +
    "玉置浩二の「アルカディア」というタイトルのクラシックで" +
    "歌われているライブや、MISIAの25周年のクラシックとバンドミックスの" +
    "ライブを視聴することです。\n" +
    "将来は、お金持ちになってあきる野市の歌手・三田りょうさんの" +
    "本名である岡睦夫(おか むつお)さんの親戚の西山(NISHI-YAMA)さんという、" +
    "ピストンレスエンジン「OMEGA1」を一生懸命研究開発しているお父さんが、" +
    "車椅子の方の娘さんを奥さんにもらい、さらに子供も作り、" +
    "大きなシアタールーム付きの大きな家を建てて、U-NEXTの映画や" +
    "ライブ・コンサートを家族で一緒に視聴したいです。";
  return `👤 ${en}\n\n${ja}`;
}

// 「風天のとらさん(トラさん)の職業・仕事は何か」という趣旨の質問
// かどうかを判定する(2026-08-27新設、ユーザー指示)。`isCreatorQuestion`
// と同じ設計方針: GPT-2はキャラクター設定を確実には把握できないため、
// 推論に任せず固定文で即答する。
const TORA_NAME_JA = ["風天のとら", "風天のトラ", "とらさん", "トラさん", "とら先生", "トラ先生"];
const TORA_NAME_EN = ["torasan", "tora-san", "tora "];
const OCCUPATION_WORD_JA = ["職業", "仕事", "お仕事", "何をしている", "何してる"];
const OCCUPATION_WORD_EN = ["occupation", "job", "profession", "what does", "what is", "work as"];

function isToraOccupationQuestion(userText) {
  const lower = userText.toLowerCase();
  const mentionsToraJa = TORA_NAME_JA.some((k) => userText.includes(k));
  const mentionsToraEn = TORA_NAME_EN.some((k) => lower.includes(k));
  if (!mentionsToraJa && !mentionsToraEn) return false;

  const asksOccupationJa = OCCUPATION_WORD_JA.some((k) => userText.includes(k));
  const asksOccupationEn = OCCUPATION_WORD_EN.some((k) => lower.includes(k));
  return asksOccupationJa || asksOccupationEn;
}

// 固定の回答文(日英併記)。既存の`trainingIntroLine`の設定
// (「Hello, I am Tora, your butler trainer! / こんにちは、私は執事の
// 先生、トラです!」)と一致させている。
function toraOccupationAnswerText() {
  return (
    "Tora-san's job is a butler! / 風天のとらさんの職業は執事です!\n" +
    "He works as the butler trainer here at the maid cafe. / " +
    "このメイドカフェで執事の先生として働いています。"
  );
}

// ---------------------------------------------------------------------------
// イスラム教・イラン(ペルシャ)・アラブの歴史に関する中立的応答
// (2026-08-23新設、ユーザー指示)
// ---------------------------------------------------------------------------
// 「イスラム教についてどう思うか」「イランとアラブは違う文明だと聞くが、
// 深い歴史やルーツを知りたい」といった趣旨の質問に対して、AI推論
// (aruaru-llm)を使わず固定文を返す。自己紹介応答と同じ理由——素のGPT-2に
// 宗教史を語らせると事実でない内容(ハルシネーション)を作ってしまい、
// 宗教という主題では特に害が大きいため、史実として確立している範囲だけを
// 人手で書いた固定文に限定する。
//
// 【内容の確定にあたってユーザーと確認した経緯(正直な記録)】
// ユーザーから当初、(a)「クルアーンは聖書のアラビア語訳から成立した」
// (b)「ムハンマドに兄弟がいて、その人物が翻訳者だった」という説を
// 含めたいという相談があった。調べた限り(b)は現存するムハンマドの
// 伝記史料で兄弟の存在が確認できず、(a)も学術的な裏付けが確認できない
// ため、複数回のやり取りの末、**両方とも事実としては含めない**ことで
// 合意した。イスラム以前のアラビア半島にキリスト教共同体が存在し聖書の
// アラビア語訳の動きがあったこと(史実)と、クルアーンの成立(別個の
// 独立した伝統)は、混同せず切り分けて記述している。
// ゾロアスター教の影響についても「一部の研究者が指摘する説」という
// 留保を必ず付け、断定しない。
// YouTube等の外部動画への自動リンク表示は行わない(見送りで合意済み)。
//
// 【2026-08-23 追加分の注意(改変時は必ず読むこと)】
// (1) 「当時の翻訳は人の手によるもので、揺れや誤差はあり得ただろう」という
//     注記を追加したが、これは**イスラム以前の聖書のアラビア語訳という
//     史実部分にのみ**掛かる、前近代の翻訳作業一般の限界についての中立的な
//     補足である。「クルアーンは聖書の翻訳ミスから生まれた」という含意を
//     一切持たせないこと——この注記とクルアーンの成立を結びつける表現
//     (「だからクルアーンは〜」等)を書いてはならない。クルアーンの成立に
//     ついては上記2)の「別個の独立した伝統/教義上は啓示」という記述を
//     維持する。ユーザーとの複数回のやり取りで、含めてよい内容とダメな
//     内容をこの線引きで明確に切り分けることに合意した。
// (2) 末尾に「言語の壁が誤解の一因になり得る/自動翻訳と多言語での対話が
//     相互理解と平和に寄与し得る」というメッセージを追加した。特定宗教の
//     起源についての主張は一切含めないこと。
//
// 他言語への展開を見越して、本文は言語コードをキーとする表で持つ。
// 現状は日本語(ja)・英語(en)のみ。他言語を足す場合はこの表に追加する。

// 質問の検出キーワード。表記ゆれ(カタカナ/漢字/英語)を広めに拾う。
const RELIGION_HISTORY_KEYWORDS_JA = [
  "イスラム", "イスラーム", "ムスリム", "回教",
  "クルアーン", "コーラン", "ムハンマド", "マホメット",
  "イラン", "ペルシャ", "ペルシア", "ゾロアスター", "拝火教",
  "アラブ", "アラビア", "サーサーン", "ササン朝",
];
const RELIGION_HISTORY_KEYWORDS_EN = [
  "islam", "islamic", "muslim", "quran", "qur'an", "koran",
  "muhammad", "mohammed", "prophet muhammad",
  "iran", "iranian", "persia", "persian", "zoroaster", "zoroastrian",
  "arab", "arabs", "arabia", "arabian", "sasanian", "sassanid",
];

// 上記キーワードを含む発言のうち、「歴史・ルーツ・どう思うか」を尋ねる
// 趣旨のものだけに反応させる。単に "Iran" と一言出ただけの英会話練習を
// 乗っ取ってしまわないための絞り込み。
const RELIGION_HISTORY_INTENT_JA = [
  "歴史", "ルーツ", "起源", "成り立ち", "由来", "どう思", "違い", "文明",
  "教えて", "聞かせて", "知りたい", "解説", "背景", "関係",
];
const RELIGION_HISTORY_INTENT_EN = [
  "history", "historical", "root", "roots", "origin", "origins",
  "what do you think", "how do you feel", "difference", "different",
  "civilization", "civilisation", "tell me", "explain", "background",
  "relationship", "related",
];

function isReligionHistoryQuestion(userText) {
  const lower = userText.toLowerCase();

  const topicJa = RELIGION_HISTORY_KEYWORDS_JA.some((k) => userText.includes(k));
  // 語尾の派生形("Zoroastrian" → "Zoroastrianism"、"Arab" → "Arabic" 等)を
  // 取りこぼさないよう、末尾の単語境界は課さず語頭の境界のみで判定する
  // (実機相当のテストで "Explain the origins of Zoroastrianism" が
  //  検出できないバグを見つけたため修正した)。
  const topicEn = RELIGION_HISTORY_KEYWORDS_EN.some((k) =>
    new RegExp(`\\b${k.replace(/'/g, "['']")}`).test(lower),
  );
  if (!topicJa && !topicEn) return false;

  const intentJa = RELIGION_HISTORY_INTENT_JA.some((k) => userText.includes(k));
  const intentEn = RELIGION_HISTORY_INTENT_EN.some((k) => lower.includes(k));
  return intentJa || intentEn;
}

// 中立的・事実ベースの解説文。言語コードをキーにした表。
const RELIGION_HISTORY_TEXTS = {
  en:
    "[A neutral, historical note]\n" +
    "I don't hold or advocate a position for or against any religion — Islam " +
    "included. What I can offer is a summary of what mainstream historical " +
    "scholarship generally says, with the uncertain parts clearly marked as " +
    "uncertain.\n\n" +
    "1) Pre-Islamic Arabia was religiously diverse.\n" +
    "Before the rise of Islam in the 7th century, the Arabian Peninsula and " +
    "its borderlands were home to polytheistic communities as well as " +
    "established Jewish and Christian ones. Najran in the south had a " +
    "well-documented Christian community, and the Ghassanids, an Arab " +
    "Christian kingdom allied with the Byzantine Empire, sat on the northern " +
    "frontier. There is historical evidence that biblical material circulated " +
    "among Arabic-speaking Christians and that efforts were made to render " +
    "parts of scripture into Arabic. So Arabic-speaking Christianity is not a " +
    "later import — it was already there.\n" +
    "One general note about that translation activity itself: in that era far " +
    "less information and far fewer reference materials were available than " +
    "today, and the work was done entirely by hand, so a degree of variation " +
    "between versions and some margin of error were only to be expected. " +
    "That is a limitation inherent to translation work in any premodern " +
    "setting — it applies to translation efforts generally, and is simply " +
    "worth keeping in mind when reading about them.\n\n" +
    "2) The Qur'an is described by scholarship as a separate tradition.\n" +
    "The formation of the Qur'an — oral proclamation and transmission, then " +
    "later written compilation — is described in the academic literature as " +
    "its own distinct tradition, not as a product of those Bible-translation " +
    "efforts. In Islamic doctrine, the Qur'an is held to be revelation given " +
    "by God to Muhammad. Claims sometimes heard online — for example that the " +
    "Qur'an was assembled from a translation of the Bible, or that a brother " +
    "of Muhammad acted as the translator — are not supported by the surviving " +
    "sources (the extant biographical material on Muhammad does not attest " +
    "such a brother), so I won't repeat them as fact.\n\n" +
    "3) Iran and the Arab world are genuinely distinct civilizations.\n" +
    "You're right that these are different lineages. Iran's is an Iranian " +
    "(Indo-European) linguistic and cultural tradition, running through the " +
    "Achaemenid, Parthian and Sasanian empires, with Persian as its language " +
    "and Zoroastrianism as its dominant pre-Islamic religion. The Arab world's " +
    "is a Semitic linguistic tradition centred on Arabic. Iran adopted Islam " +
    "after the Sasanian defeat in the 7th century, but it kept its own " +
    "language and much of its cultural inheritance rather than becoming " +
    "Arabic-speaking — one reason the two remain culturally distinct today. " +
    "The later Shia/Sunni distinction adds another layer, though it does not " +
    "map neatly onto the Iranian/Arab divide.\n\n" +
    "4) Zoroastrianism and its possible influence — stated with reservation.\n" +
    "Zoroastrianism, which flourished in ancient Iran, features eschatology, " +
    "angelic beings and a dualistic vision of a cosmic struggle between good " +
    "and evil. Some scholars have argued that these ideas influenced certain " +
    "concepts in Judaism and, through it, Christianity, particularly around " +
    "the period of the Babylonian exile and Persian rule. This is a scholarly " +
    "hypothesis with real support, but it is debated — the direction and " +
    "extent of influence, and the dating of the relevant Zoroastrian texts, " +
    "are all contested. I'd present it as \"some scholars argue this\", not as " +
    "settled fact, and I'd avoid sweeping claims about a single shared origin " +
    "behind all these religions.\n\n" +
    "5) A cultural and tourism note.\n" +
    "Iran was long known internationally as \"Persia\"; the government asked " +
    "foreign countries to use the name \"Iran\" in official international " +
    "usage starting in 1935 (the name \"Iran\" itself is an old endonym that " +
    "had long been used domestically). Modern Iran is home to numerous " +
    "UNESCO World Heritage sites — Persepolis and the historic city of " +
    "Isfahan among them — and is widely known for Persian carpets, a " +
    "handicraft tradition with a history spanning many centuries.\n\n" +
    "If you'd like to go deeper, good things to look up are: pre-Islamic " +
    "Arabia, the Ghassanids and the Christians of Najran, the Sasanian Empire, " +
    "the history of Zoroastrianism, and the academic study of the Qur'an's " +
    "compilation. A general historical encyclopedia is a reasonable starting " +
    "point, and reading more than one is better than reading one.\n\n" +
    "One last thought, from an app whose whole purpose is language learning: " +
    "language barriers are one of the things that let misunderstandings about " +
    "other cultures and religions take hold. If automatic translation keeps " +
    "improving and people everywhere can converse across languages as part of " +
    "ordinary daily life, that may help reduce such misunderstandings, deepen " +
    "mutual understanding, and bring us a little closer to a peaceful world.",
  ja:
    "【中立的な歴史のメモ】\n" +
    "私は特定の宗教を支持したり否定したりする立場は取りません" +
    "(イスラム教についても同様です)。お伝えできるのは、歴史学で" +
    "一般に認められている範囲の要約と、確かでない部分は確かでないと" +
    "明示すること、この2つです。\n\n" +
    "1) イスラム以前のアラビア半島は宗教的に多様でした。\n" +
    "7世紀にイスラム教が興る以前、アラビア半島とその周縁には多神教の" +
    "共同体に加えて、ユダヤ教徒やキリスト教徒の共同体も確かに存在して" +
    "いました。南部のナジュラーンには記録の豊富なキリスト教徒共同体が" +
    "あり、北の辺境にはビザンツ帝国と同盟したアラブ系キリスト教国家" +
    "ガッサーン朝がありました。アラビア語話者のキリスト教徒の間で聖書の" +
    "内容が流通し、聖書の一部をアラビア語に訳そうとする動きがあったことは" +
    "史料的に裏付けられています。つまりアラビア語圏のキリスト教は後世の" +
    "輸入品ではなく、以前からそこにありました。\n" +
    "なお、この翻訳の営みそのものについて一般的な注記を一つ。当時は現代に" +
    "比べて情報も参照できる資料もはるかに少なく、翻訳はすべて人の手で" +
    "行われました。ですから版ごとの多少の揺れや、ある程度の誤差は当然" +
    "あり得ただろう、という点は留意すべきです。これは前近代の翻訳作業一般に" +
    "付き物の限界であり、翻訳の営みについて読むときに念頭に置いておくと" +
    "よい、というだけのことです。\n\n" +
    "2) クルアーンの成立は、学術的には別個の独立した伝統として" +
    "記述されます。\n" +
    "クルアーンの成立過程——口頭での啓示の宣布と伝承、その後の文字化・" +
    "編纂——は、学術研究では上記の聖書翻訳の動きとは別の、独立した" +
    "伝統として記述されます。イスラム教の教義上は、クルアーンは神から" +
    "ムハンマドへ与えられた啓示であるとされています。なお、インターネット上で" +
    "見かけることのある「クルアーンは聖書の翻訳から出来た」「ムハンマドに" +
    "兄弟がいて、その人物が翻訳者だった」といった説は、現存する史料からは" +
    "裏付けが確認できません(現存するムハンマドの伝記史料にそのような" +
    "兄弟の存在は確認されません)。そのため、これらを事実としてお伝えする" +
    "ことは控えます。\n\n" +
    "3) イランとアラブは、実際に系統の異なる文明です。\n" +
    "ご指摘のとおり両者は別の系譜です。イランはイラン系" +
    "(インド・ヨーロッパ語族)の言語・文化的伝統で、アケメネス朝・" +
    "パルティア・サーサーン朝と続き、言語はペルシャ語、イスラム化以前の" +
    "主要宗教はゾロアスター教でした。一方アラブ世界はアラビア語を中心と" +
    "するセム語系の伝統です。イランは7世紀のサーサーン朝の敗北以後に" +
    "イスラム教を受け入れましたが、アラビア語話者にはならず自らの言語と" +
    "文化的遺産の多くを保持しました。これが今日まで両者が文化的に" +
    "異なり続けている理由の一つです。後世のシーア派・スンニ派の区別も" +
    "もう一つの層を成しますが、イラン/アラブの区分ときれいに重なる" +
    "わけではありません。\n\n" +
    "4) ゾロアスター教とその影響について——留保付きで。\n" +
    "古代イランで栄えたゾロアスター教には、終末論、天使的な存在、" +
    "善と悪の宇宙的な闘争という二元論的世界観といった要素があります。" +
    "これらの観念が、特にバビロン捕囚とペルシャ支配の時期を通じて" +
    "ユダヤ教の一部の概念に、さらにそれを介してキリスト教に影響を" +
    "与えたのではないか、と指摘する研究者がいます。これは相応の根拠が" +
    "ある学説ですが、議論の続いている論点でもあります——影響の方向と" +
    "程度、関連するゾロアスター教文献の成立年代のいずれについても" +
    "異論があります。ですので「一部の研究者がそう指摘している」" +
    "という形でご紹介するにとどめ、確定した事実としては述べません。" +
    "これらの宗教すべての背後に単一の共通起源がある、といった断定的な" +
    "言い方も避けます。\n\n" +
    "5) 文化・観光についての補足。\n" +
    "イランは長く国際的に「ペルシャ」の名で知られており、政府が対外的な" +
    "呼称として「イラン」を用いるよう各国へ求めたのは1935年からです" +
    "(「イラン」という呼び方自体は、国内では古くから使われてきた自称" +
    "です)。現代のイランには、ペルセポリスやイスファハーンの歴史地区を" +
    "はじめ多数のユネスコ世界遺産があり、何世紀もの歴史を持つ手工芸" +
    "であるペルシャ絨毯でも広く知られています。\n\n" +
    "さらに深く知りたい場合は、「イスラム以前のアラビア」「ガッサーン朝」" +
    "「ナジュラーンのキリスト教徒」「サーサーン朝」「ゾロアスター教の歴史」" +
    "「クルアーン編纂の学術研究」などについて調べてみてください。" +
    "一般的な歴史百科事典が手がかりとして手頃ですし、1冊だけでなく" +
    "複数を読み比べるとより確かです。\n\n" +
    "最後に、言語学習のためのアプリとして一言。言語の壁は、異なる文化や" +
    "宗教への誤解が生まれ、根付いてしまう一因になり得ます。自動翻訳の" +
    "技術がさらに発展し、世界中の人々が日常の中で当たり前に多言語で" +
    "対話・交流できるようになれば、そうした誤解を減らし、相互理解を" +
    "深め、平和な世界に少しでも近づく助けになるかもしれません。",
};

// 中立的な歴史解説を返す(現状は英日を併記)。
function religionHistoryText() {
  return `📜 ${RELIGION_HISTORY_TEXTS.en}\n\n${RELIGION_HISTORY_TEXTS.ja}`;
}

// ---------------------------------------------------------------------------
// 「666は悪魔・獣の数字なのか」への軽妙な豆知識応答
// (2026-08-23新設、ユーザー指示)
// ---------------------------------------------------------------------------
// 上の`isReligionHistoryQuestion()`/`RELIGION_HISTORY_TEXTS`と同じ方式
// (キーワード判定関数+言語コードをキーとするテキスト表+AI推論を通さない
// 固定文)で実装する。素のGPT-2に聖書解釈を語らせると事実でない内容を
// 作ってしまい、宗教という主題では特に害が大きいため。日次利用回数は
// 消費しない。
//
// 【内容の扱い方についてユーザーと合意した線引き(改変時は必ず読むこと)】
// (1) 前提として述べてよい範囲: ヨハネの黙示録に「獣の数字は666」という
//     記述があり、伝統的に額や右手の「刻印」として解釈されてきたこと。
//     これは中立的な前提であり、教義上の正否には踏み込まない。
// (2) 「666=WWW」というゲマトリア(ヘブライ文字への数値割当)の語呂合わせは、
//     **「そういう解釈をする人たちがいる」という紹介**にとどめること。
//     聖書の正式な教義的解釈として断定してはならない。ヴァヴ(ו)の数値が
//     6であること自体はゲマトリアの体系上の事実だが、そこからWWWを導くのは
//     現代の語呂合わせであり、1990年代以降のポップカルチャーで語られてきた
//     という事実として紹介する形を保つこと。
// (3) 「POSレジのシークレットナンバーが666」という話は**裏付けの取れて
//     いない都市伝説であると明記した上で**紹介すること。事実として断定
//     してはならない。
// (4) 着地点は現代の利便性への肯定(WWWやバーコードスキャナーのおかげで
//     買い物や通販が便利になった/人間の体に刻印を刻む必要はない)。
// (5) Pythonの豆知識は、ロゴがヘビであることと名前の由来(英BBCのコメディ
//     番組「空飛ぶモンティ・パイソン」)が聖書と無関係であることを述べ、
//     **「ヘビ=獣」との関連付けは単なる偶然の一致・言葉遊びであると必ず
//     明記すること**。意味のある繋がりがあるかのように書いてはならない。
//
// 全体のトーンは、宗教的な断定を避けた軽妙な豆知識として書く。
//
// 【2026-08-23 追記: 言い回しのみ調整】ユーザー指示により、「WWW=666」・
// バーコードの都市伝説・黙示録13:16-17と現代の買い物の符合、の3点について
// 「〜と断定するものではありません」「not as a claim that any prophecy has
// been fulfilled」といった硬い否定表現を、「話のタネとして」「真偽のほどは
// 分かりませんが」"take this as a fun bit of trivia rather than solid proof"
// のような柔らかく親しみやすい言い回しへ置き換えた。**制約自体は不変**——
// 断定していないこと・都市伝説を都市伝説と明記していること・偶然の一致を
// 偶然と明記していることは、表現を柔らかくしても必ず維持すること。

// 話題語(666・獣の数字・悪魔の数字・mark of the beast 等)。
const MARK_OF_BEAST_KEYWORDS_JA = [
  "666", "６６６",
  "獣の数字", "けものの数字", "獣の刻印", "獣の印",
  "悪魔の数字", "悪魔の刻印", "悪魔の印",
  "黙示録", "ヨハネの黙示録",
];
const MARK_OF_BEAST_KEYWORDS_EN = [
  "666",
  "mark of the beast", "number of the beast", "beast's number",
  "devil's number", "number of the devil", "satanic number",
  "book of revelation", "revelation 13",
];

function isMarkOfBeastQuestion(userText) {
  const lower = userText.toLowerCase();
  if (MARK_OF_BEAST_KEYWORDS_JA.some((k) => userText.includes(k))) return true;
  return MARK_OF_BEAST_KEYWORDS_EN.some((k) => lower.includes(k));
}

// 本文。言語コードをキーにした表(他言語展開を見越した構造)。
const MARK_OF_BEAST_TEXTS = {
  en:
    "[A light note on 666 — offered as trivia, not as doctrine]\n" +
    "Yes, that part of the Bible is real. In the Book of Revelation the " +
    "number of the beast is given as 666, and the traditional reading is " +
    "that it appears as a mark on a person's forehead or right hand. " +
    "I'm not going to tell you what it \"really\" means — interpretations " +
    "differ enormously, and I don't take a position for or against any " +
    "religious reading. But there are a couple of modern takes on it that " +
    "are genuinely fun to know about.\n\n" +
    "1) The \"666 = WWW\" wordplay (a newer reading — presented as something " +
    "some people say, not as fact).\n" +
    "Hebrew has a system called gematria, in which each letter carries a " +
    "numeric value. The letter vav (ו) has the value 6. So three of them in " +
    "a row would read as 6-6-6. And since vav is also commonly used to " +
    "transliterate the W sound, some people since the 1990s have pointed out " +
    "that \"666\" can be read as WWW — as in World Wide Web, the string you " +
    "find in web addresses and HTTP headers. It's the kind of thing that " +
    "makes people go \"huh!\" at a dinner table, and it has been doing the " +
    "rounds in pop culture for decades. Take it as a fun bit of trivia " +
    "rather than solid proof — it's modern wordplay, not an official or " +
    "scholarly reading of scripture. Still, it's a neat one to have in your " +
    "pocket.\n\n" +
    "2) The barcode story — an urban legend, and here's the actual " +
    "engineering behind it.\n" +
    "You may also hear that a hidden 666 is built into the barcodes on the " +
    "products you buy. Here is where that comes from. On a UPC/JAN barcode " +
    "there are three sets of slightly longer bars — one at each end and one " +
    "in the middle. These are called guard bars, and their job is purely " +
    "technical: they tell the scanner where the code starts, where it ends, " +
    "and where the halves divide. Purely by coincidence, a guard bar pattern " +
    "looks a bit like the bar pattern for the digit 6, so people concluded " +
    "that every barcode secretly carries 666. In Japan the idea was popular " +
    "enough that a well-known 1990s manga series ran with it.\n" +
    "But technically the two are not the same encoding at all: a guard bar " +
    "is three modules wide while a digit is seven modules wide, and their " +
    "bit patterns differ. Fact-checkers such as Snopes rate this claim FALSE. " +
    "So the resemblance is real, but the hidden 666 isn't: no occult meaning, " +
    "no technical basis — just a happy accident of ink that grew into a " +
    "wonderfully persistent story. Honestly, that's the best part. " +
    "(Worth looking up yourself: the Wikipedia article on barcodes, and the " +
    "Snopes fact-check.)\n" +
    "One more thing while we're here. Revelation 13:16-17 really does say " +
    "that no one without the mark can buy or sell — and people love to hold " +
    "that line up next to a world where shopping runs on barcodes and " +
    "Amazon checkouts. Who knows what to make of it! Nobody's proving " +
    "anything here, but it's the sort of coincidence that makes an " +
    "ancient text feel a little closer to home than you'd expect.\n\n" +
    "3) Where I'd like to land: what a nice time to be alive.\n" +
    "Whatever one makes of the old text, here's a cheerful way to look at " +
    "the present. Thanks to the World Wide Web, you can order almost " +
    "anything from home. Thanks to barcode scanners wired up to POS " +
    "registers, checking out at a shop takes seconds instead of minutes. " +
    "Nobody has to have anything stamped onto their body for any of that to " +
    "work — the convenience arrived without the mark. That seems worth being " +
    "glad about.\n\n" +
    "4) A programming footnote — pure coincidence, no hidden meaning.\n" +
    "Since we're on the subject of beasts: the logo of the programming " +
    "language Python is a snake. Its name, however, has nothing to do with " +
    "the Bible at all — Guido van Rossum named it after Monty Python's " +
    "Flying Circus, the British comedy series. So the snake-and-beast " +
    "resemblance is a coincidence and a bit of wordplay, and nothing more " +
    "than that. No meaningful connection exists between the two; I mention " +
    "it only because it's a fun thing to know.",
  ja:
    "【666についての軽い豆知識 — 教義の解説ではありません】\n" +
    "はい、その記述自体は実際に聖書にあります。ヨハネの黙示録に「獣の数字は" +
    "666である」という記述があり、伝統的には人間の額または右手に刻まれる" +
    "「刻印」として解釈されてきました。それが「本当は何を意味するのか」を" +
    "私が断定することはしません——解釈は非常に多様ですし、私は特定の宗教的" +
    "解釈を支持も否定もしない立場です。ただ、これにまつわる現代的な見方で、" +
    "知っておくと面白いものがいくつかあります。\n\n" +
    "1) 「666=WWW」という語呂合わせ(新しい解釈として、断定ではなく紹介)\n" +
    "ヘブライ語には「ゲマトリア」という、文字に数値を割り当てる体系が" +
    "あります。文字ヴァヴ(ו)の数値は6です。ですからこれが3つ並べば" +
    "6-6-6と読めることになります。そしてヴァヴはWの音を写すのにもよく" +
    "使われるため、「666はWWWと読めるのではないか」——つまりWorld Wide Web、" +
    "ウェブアドレスやHTTPヘッダーに出てくるあのWWWではないか、という見方を" +
    "する人たちが1990年代以降に現れ、ポップカルチャーの中で語られてきました。" +
    "言われてみると「おっ」と思ってしまう話ですよね。もちろん科学的な証明では" +
    "なく、あくまで**現代の語呂合わせ**——聖書の正式な教義的解釈でも学術的な" +
    "定説でもありません。話のタネとして、飲み会や雑談でどうぞ。\n\n" +
    "2) バーコードの話 — 都市伝説です(技術的な種明かし付き)\n" +
    "「商品のバーコードには666が隠されている」という話を聞くことも" +
    "あるかもしれません。その出どころはこうです。JANコード(UPC)の" +
    "バーコードには、両端と中央の3か所に、他より少し長く伸びた線の" +
    "組があります。これは**ガードバー**と呼ばれ、その役割は純粋に技術的な" +
    "もの——スキャナーに対して「ここが読み取りの開始」「ここが終了」" +
    "「ここが前半と後半の区切り」を示す目印です。ところがこのガードバーの" +
    "見た目が、**偶然にも**数字「6」のバーパターンとよく似ているため、" +
    "「どのバーコードにも666が隠れている」と考えられるようになりました。" +
    "日本でも1990年代に有名なオカルト漫画がこの説を取り上げ、広く知られる" +
    "ようになりました。\n" +
    "しかし技術的には、両者は**まったく異なるエンコード方式**です。" +
    "ガードバーは3モジュール幅、数字は7モジュール幅で、ビットパターンも" +
    "異なります。Snopes等のファクトチェックでもこの説は「FALSE(誤り)」と" +
    "判定されています。つまり、見た目が似ているのは本当。でも666が" +
    "隠されているわけではなく、**オカルト的な意味も技術的な根拠も一切" +
    "ありません**——ちょっとした偶然の一致が、これほどよくできた物語に" +
    "育ってしまった。むしろそこが面白いところだと思います。" +
    "(ご自身で調べる際は、Wikipediaの「バーコード」の" +
    "項目や、Snopesのファクトチェックが手頃です。)\n" +
    "ついでにもう一つ。黙示録13章16〜17節には「刻印を持たない者は売り買いが" +
    "できない」という趣旨の記述が実際にあります。これを、バーコードや" +
    "Amazonの決済なしでは買い物もままならない現代と並べて眺めてみる人が" +
    "いるわけです。真偽のほどは分かりませんが、こういう見方をすると" +
    "聖書の世界も少し身近に感じられるかもしれません。" +
    "**もちろん、何かが証明されたという話ではありません。**\n\n" +
    "3) 着地点 — 便利な時代になったものです\n" +
    "古い文章をどう受け取るにせよ、現代についてはこう明るく捉えられます。" +
    "WWW(インターネット)のおかげで、家にいながらたいていの物が通販で" +
    "買えるようになりました。POSレジと連動したバーコードスキャナーの" +
    "おかげで、お店のお会計は数分ではなく数秒で済むようになりました。" +
    "そしてそのどれもが、**人間の体に何かを刻印する必要なしに**実現して" +
    "います。刻印なしで便利さのほうが先に来てくれた——これは素直に" +
    "喜んでよいことだと思います。\n\n" +
    "4) プログラミングの余談 — 単なる偶然の一致です\n" +
    "獣の話が出たついでに。プログラミング言語Pythonのロゴはヘビです。" +
    "ただし名前の由来は聖書とはまったく無関係で、グイド・ヴァンロッサムが" +
    "イギリスのコメディ番組「空飛ぶモンティ・パイソン」から取ったものです。" +
    "ですから「ヘビ=獣」というイメージとの符合は、**単なる偶然の一致・" +
    "言葉遊びにすぎません**。両者の間に意味のある繋がりは一切ありません。" +
    "面白い豆知識なのでご紹介したまでです。",
};

// 666についての豆知識を返す(現状は英日を併記)。
function markOfBeastText() {
  return `🔢 ${MARK_OF_BEAST_TEXTS.en}\n\n${MARK_OF_BEAST_TEXTS.ja}`;
}

// ---------------------------------------------------------------------------
// 作者(石塚正浩様)のオリジナル算数クイズ(2026-08-23追加、ユーザー指示)
//
// 上の`isCreatorQuestion()`/`isReligionHistoryQuestion()`/
// `isMarkOfBeastQuestion()`と全く同じ方式——**AI推論(aruaru-llm)を通さず**
// 人手で書いた固定文を返すルールベース分岐。素のGPT-2に算数の問題と解答を
// 生成させると、計算が合っていない「もっともらしい嘘」を出すため、
// 出題も採点も固定文に限定している。日次利用回数は消費しない。
//
// 【改変時の注意】
//  (1) 解答`(9×9+9)÷9 = 10`は実際に検算済み(81+9=90、90÷9=10)。
//      別解を追加する場合は必ず自分で計算を確かめること。
//  (2) この問題は**トンチ・ひっかけではない**(小数点をつける、9を横に
//      倒して∞にする、といった類の問題ではない)。純粋な四則演算+括弧
//      だけで解ける、電卓・そろばんでも検算できる問題である、という
//      性質を問題文から落とさないこと——利用者が変な方向へ悩まないため。
//  (3)「最年少で解けたのは小学一年生」というエピソードは作者から伺った
//      実際の話として紹介しており、創作を足さないこと。
// ---------------------------------------------------------------------------

// 「何か問題を出して」「クイズ出して」の類を検出する。
// 「誰が作ったか」判定と同じ教訓(疑問詞と動詞の間に語句が入ると部分一致が
// 効かない)を踏まえ、**出題を求める語**と**問題・クイズを指す語**の
// AND条件で判定し、単独で成立する表現はOR条件で拾う。
const QUIZ_TOPIC_JA = ["問題", "クイズ", "なぞなぞ", "出題", "パズル"];
const QUIZ_ASK_JA = [
  "出して", "出し", "ください", "下さい", "ちょうだい", "頂戴",
  "お願い", "ほしい", "欲しい", "やりたい", "解きたい", "挑戦",
  "教えて", "ある?", "ありますか",
];
// 単独で「クイズを求めている」と判断してよい表現。
const QUIZ_STANDALONE_JA = [
  "クイズを出", "クイズ出", "問題を出", "問題出", "何か問題", "なにか問題",
  "問題ください", "問題下さい",
];
const QUIZ_TOPIC_EN = ["quiz", "puzzle", "problem", "riddle", "brain teaser", "brainteaser"];
const QUIZ_ASK_EN = [
  "give me", "give us", "show me", "ask me", "got a", "have a", "any ",
  "can you", "could you", "please", "i want", "i'd like", "let's try",
  "let me try", "challenge me", "test me",
];
const QUIZ_STANDALONE_EN = [
  "give me a quiz", "quiz me", "give me a problem", "give me a puzzle",
  "ask me a question", "challenge me",
];

function isQuizRequest(userText) {
  const lower = userText.toLowerCase();
  if (QUIZ_STANDALONE_JA.some((k) => userText.includes(k))) return true;
  if (QUIZ_STANDALONE_EN.some((k) => lower.includes(k))) return true;

  const topicJa = QUIZ_TOPIC_JA.some((k) => userText.includes(k));
  const askJa = QUIZ_ASK_JA.some((k) => userText.includes(k));
  if (topicJa && askJa) return true;

  const topicEn = QUIZ_TOPIC_EN.some((k) => lower.includes(k));
  const askEn = QUIZ_ASK_EN.some((k) => lower.includes(k));
  return topicEn && askEn;
}

// 出題後に「わからない」「答えは?」と聞かれたかどうかの判定。
// **出題済みのとき(`quizAwaitingAnswer === true`)だけ**参照するため、
// 「わからない」のような一般的すぎる語でも通常の英会話練習を乗っ取らない。
const QUIZ_GIVEUP_JA = [
  "わからない", "分からない", "わかりません", "分かりません", "解らない",
  "答え", "解答", "正解", "ヒント", "降参", "ギブアップ", "教えて", "無理",
];
const QUIZ_GIVEUP_EN = [
  "i don't know", "i dont know", "no idea", "give up", "i give up",
  "answer", "solution", "hint", "tell me", "show me", "what is it",
  "i can't", "i cannot",
];

function isQuizAnswerRequest(userText) {
  const lower = userText.toLowerCase();
  if (QUIZ_GIVEUP_JA.some((k) => userText.includes(k))) return true;
  return QUIZ_GIVEUP_EN.some((k) => lower.includes(k));
}

// 2段階のやり取り(まず問題文だけ、次に解答)のための会話状態。
// 既存の`examPrepMissedQuestions`と同じく、単純なモジュールスコープの
// 変数1つで持つ(状態機械は組まない)。
let quizAwaitingAnswer = false;

// 問題文・解答の対訳表。言語コードをキーにした構造で、
// **既定は日本語と英語**、主要な数言語のみ翻訳を用意する。
// 未収録の言語を選んでいる利用者には、正直に日英併記で出題する
// (全130言語ぶんの翻訳を機械翻訳で埋めて「対応済み」に見せることはしない)。
const QUIZ_TEXTS_FOUR_NINES = {
  en: {
    intro:
      "Here is an original puzzle from the creator of this app, Masahiro Ishizuka.",
    question:
      "Using four 9s, fill each circle in\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "with one of + (plus), - (minus), × (times) or ÷ (divided by). " +
      "You may use the same symbol more than once, and you may add " +
      "parentheses ( ) to change the order of operations. Make the result " +
      "exactly 10.",
    fair:
      "This is not a trick question or a play on words. It is pure " +
      "arithmetic — you can check it on a calculator or an abacus.",
    episode:
      "The youngest person who has solved this so far was a first-grader in " +
      "elementary school. Take your time!",
    prompt:
      "When you would like the answer, just say \"I don't know\" or \"Tell me the answer\".",
    answerTitle: "Here is the answer.",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "Step by step: 9 × 9 = 81, then 81 + 9 = 90, and finally 90 ÷ 9 = 10.",
    closing: "Nicely done for sticking with it. Want to try it on someone else?",
  },
  ja: {
    intro:
      "このアプリの作者・石塚正浩さんのオリジナル問題です。",
    question:
      "数字の9を4つ使って、\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "の◯の中に、+(足す)・-(引く)・×(掛ける)・÷(割る)のいずれかを" +
      "入れてください。同じ記号を何度使っても構いません。必要なら" +
      "括弧()を使って計算の優先順位を変えてもかまいません。" +
      "計算結果がちょうど10になるようにしてください。",
    fair:
      "トンチやひねった問題ではありません。純粋な四則演算の問題ですので、" +
      "電卓やそろばんでも解けます。",
    episode:
      "これまでで最年少で解けたのは、小学一年生の子でした。じっくり考えてみてください!",
    prompt:
      "答えが知りたくなったら「わからない」「答えを教えて」と送ってください。",
    answerTitle: "答えはこちらです。",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "順番に計算すると、9 × 9 = 81、81 + 9 = 90、そして 90 ÷ 9 = 10 です。",
    closing: "最後までお付き合いいただきありがとうございました。ぜひ誰かに出題してみてください。",
  },
  es: {
    intro: "Este es un acertijo original del creador de esta aplicación, Masahiro Ishizuka.",
    question:
      "Usando cuatro nueves, complete cada círculo de\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "con + (más), - (menos), × (por) o ÷ (entre). Puede repetir el mismo " +
      "símbolo y puede usar paréntesis ( ) para cambiar el orden de las " +
      "operaciones. El resultado debe ser exactamente 10.",
    fair:
      "No es una pregunta con trampa ni un juego de palabras: es aritmética pura, " +
      "y se puede comprobar con una calculadora o un ábaco.",
    episode:
      "La persona más joven que lo ha resuelto hasta ahora fue un niño de primer grado de primaria.",
    prompt: "Cuando quiera la respuesta, escriba «no lo sé» o «dime la respuesta».",
    answerTitle: "Esta es la respuesta.",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "Paso a paso: 9 × 9 = 81, luego 81 + 9 = 90, y por último 90 ÷ 9 = 10.",
    closing: "Gracias por su paciencia. ¿Se lo propone a alguien más?",
  },
  fr: {
    intro: "Voici une énigme originale du créateur de cette application, Masahiro Ishizuka.",
    question:
      "Avec quatre 9, remplissez chaque cercle de\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "par + (plus), - (moins), × (fois) ou ÷ (divisé par). Vous pouvez " +
      "réutiliser le même symbole et ajouter des parenthèses ( ) pour changer " +
      "l'ordre des opérations. Le résultat doit valoir exactement 10.",
    fair:
      "Ce n'est ni une devinette ni un jeu de mots : c'est de l'arithmétique pure, " +
      "vérifiable à la calculatrice ou au boulier.",
    episode:
      "La plus jeune personne à l'avoir résolue jusqu'ici était un enfant de CP.",
    prompt: "Quand vous voudrez la réponse, écrivez « je ne sais pas » ou « donne-moi la réponse ».",
    answerTitle: "Voici la réponse.",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "Étape par étape : 9 × 9 = 81, puis 81 + 9 = 90, et enfin 90 ÷ 9 = 10.",
    closing: "Merci d'avoir persévéré. À votre tour de la poser à quelqu'un !",
  },
  de: {
    intro: "Dies ist ein Originalrätsel des Entwicklers dieser App, Masahiro Ishizuka.",
    question:
      "Füllen Sie mit vier Neunen jeden Kreis in\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "mit + (plus), - (minus), × (mal) oder ÷ (geteilt durch). Dasselbe " +
      "Zeichen darf mehrfach vorkommen, und Sie dürfen Klammern ( ) setzen, " +
      "um die Reihenfolge zu ändern. Das Ergebnis soll genau 10 sein.",
    fair:
      "Das ist keine Fangfrage und kein Wortspiel, sondern reine Rechnerei — " +
      "mit Taschenrechner oder Abakus nachprüfbar.",
    episode:
      "Die jüngste Person, die es bisher gelöst hat, war ein Erstklässler.",
    prompt: "Wenn Sie die Lösung möchten, schreiben Sie „Ich weiß es nicht“ oder „Sag mir die Antwort“.",
    answerTitle: "Hier ist die Lösung.",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "Schritt für Schritt: 9 × 9 = 81, dann 81 + 9 = 90 und schließlich 90 ÷ 9 = 10.",
    closing: "Danke fürs Durchhalten. Geben Sie es gern weiter!",
  },
  zh: {
    intro: "这是本应用作者石塚正浩先生的原创趣题。",
    question:
      "用四个9,在\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "的每个圆圈里填入 +(加)、-(减)、×(乘)、÷(除) 之一。" +
      "同一个符号可以重复使用,也可以加括号 ( ) 改变运算顺序。" +
      "请让结果正好等于10。",
    fair: "这不是脑筋急转弯,也不是文字游戏,而是纯粹的四则运算,用计算器或算盘都能验算。",
    episode: "目前解出这道题的最小年纪,是一位小学一年级的孩子。",
    prompt: "想看答案时,请回复「不知道」或「告诉我答案」。",
    answerTitle: "答案如下。",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "逐步计算:9 × 9 = 81,81 + 9 = 90,最后 90 ÷ 9 = 10。",
    closing: "感谢您耐心思考,也欢迎拿这道题去考考别人。",
  },
  ko: {
    intro: "이 앱을 만든 이시즈카 마사히로 님의 오리지널 문제입니다.",
    question:
      "숫자 9를 네 개 사용하여\n" +
      "    9 ◯ 9 ◯ 9 ◯ 9 = 10\n" +
      "의 각 동그라미에 +(더하기), -(빼기), ×(곱하기), ÷(나누기) 중 " +
      "하나를 넣어 주세요. 같은 기호를 여러 번 써도 되고, 필요하면 " +
      "괄호 ( )로 계산 순서를 바꿔도 됩니다. 결과가 정확히 10이 되게 하세요.",
    fair: "말장난이나 함정 문제가 아닙니다. 순수한 사칙연산이라 계산기나 주판으로도 확인할 수 있습니다.",
    episode: "지금까지 이 문제를 푼 최연소자는 초등학교 1학년 어린이였습니다.",
    prompt: "답이 궁금해지면 「모르겠어요」 또는 「답을 알려 주세요」라고 보내 주세요.",
    answerTitle: "정답입니다.",
    answer:
      "    (9 × 9 + 9) ÷ 9 = 10\n" +
      "차례대로 계산하면 9 × 9 = 81, 81 + 9 = 90, 마지막으로 90 ÷ 9 = 10입니다.",
    closing: "끝까지 고민해 주셔서 감사합니다. 다른 분에게도 내 보세요!",
  },
};

// 問題2: カタツムリと井戸(2026-08-23追加)。
// **答えは8日目**。7日目の終わりで9m(1日あたり正味1m)、8日目の昼に3m
// 登ると10mに到達して井戸の外へ出るため、その夜は滑り落ちない。
// 「1日1mずつだから10日目」と考えると誤る、というのがこの問題の要点。
// 訳文は日英のみ(他言語は未作成——`QUIZ_TEXTS_FOUR_NINES`と違い
// es/fr/de/zh/koは用意していない。無い言語は日英併記で出題される)。
const QUIZ_TEXTS_SNAIL = {
  // 図解(インラインSVG、2026-08-23追加)。井戸の深さとカタツムリの
  // 「昼に3m登り、夜に2m滑り落ちる」動きを図示する。**このアプリ自身が
  // 書いた固定文字列**であり、利用者入力は一切含まない(そのまま
  // `innerHTML`へ入れてよい理由)。言語に依存しない図なので、言語コード
  // ごとの訳文とは別に問題オブジェクト直下に置いている。
  figure:
    '<svg viewBox="0 0 260 200" role="img" aria-label="深さ10mの井戸と、昼に3m登り夜に2m滑り落ちるカタツムリ" width="100%" style="max-width:280px">' +
    '<rect x="70" y="20" width="80" height="160" fill="#241925" stroke="#f4e6f0" stroke-width="2"/>' +
    '<line x1="60" y1="20" x2="160" y2="20" stroke="#ff9ecb" stroke-width="3"/>' +
    '<text x="163" y="18" fill="#ff9ecb" font-size="12">出口 10m</text>' +
    '<text x="163" y="184" fill="#f4e6f0" font-size="12">底 0m</text>' +
    '<circle cx="110" cy="168" r="9" fill="none" stroke="#ffd27f" stroke-width="3"/>' +
    '<path d="M100 172 h-8" stroke="#ffd27f" stroke-width="3"/>' +
    '<path d="M185 150 v-40" stroke="#8ee6a1" stroke-width="2" fill="none"/>' +
    '<path d="M185 110 l-5 8 h10 z" fill="#8ee6a1"/>' +
    '<text x="192" y="128" fill="#8ee6a1" font-size="12">昼 +3m</text>' +
    '<text x="192" y="142" fill="#8ee6a1" font-size="12">day +3m</text>' +
    '<path d="M225 110 v30" stroke="#ff9ecb" stroke-width="2" fill="none"/>' +
    '<path d="M225 140 l-5 -8 h10 z" fill="#ff9ecb"/>' +
    '<text x="150" y="196" fill="#ff9ecb" font-size="12">夜 -2m / night -2m</text></svg>',
  en: {
    intro: "Here is another original puzzle from the creator of this app, Masahiro Ishizuka.",
    question:
      "A snail is at the bottom of a well that is 10 metres deep.\n" +
      "    During the day it climbs up 3 metres.\n" +
      "    During the night it slides back down 2 metres.\n" +
      "On which day does the snail get out of the well?",
    fair:
      "This is not a trick question or a play on words. Just follow the snail " +
      "day by day and write down how high it is each evening.",
    episode:
      "Many people answer \"the 10th day\" straight away, because the snail seems " +
      "to gain only 1 metre a day. Take your time — the last day is special.",
    prompt: "When you would like the answer, just say \"I don't know\" or \"Tell me the answer\".",
    answerTitle: "Here is the answer.",
    answer:
      "    The 8th day.\n" +
      "The snail gains 1 metre of height per full day, so at the end of day 7 it " +
      "is 7 metres up. On day 8 it climbs 3 more metres and reaches 10 metres — " +
      "it is already out of the well, so it never slides back that night.",
    closing: "Nicely done. The trick is that the final climb is not followed by a slide.",
  },
  ja: {
    intro: "このアプリの作者・石塚正浩さんのオリジナル問題、その2です。",
    question:
      "深さ10mの井戸の底に、カタツムリが1匹います。\n" +
      "    昼間のあいだに3m登ります。\n" +
      "    夜のあいだに2m滑り落ちます。\n" +
      "このカタツムリが井戸の外に出るのは何日目でしょうか?",
    fair:
      "トンチやひっかけではありません。1日ずつ順番に追いかけて、" +
      "毎晩の高さを書き出していけば必ず解けます。",
    episode:
      "「1日で正味1mしか進まないから10日目」と即答してしまう方が多い問題です。" +
      "最後の1日だけ事情が違うので、じっくり考えてみてください。",
    prompt: "答えが知りたくなったら「わからない」「答えを教えて」と送ってください。",
    answerTitle: "答えはこちらです。",
    answer:
      "    8日目です。\n" +
      "1日で正味1m進むので、7日目の終わりには7mの高さにいます。8日目の昼に" +
      "さらに3m登ると10mに到達し、すでに井戸の外へ出ているので、" +
      "その夜は滑り落ちません。",
    closing: "お見事です。最後の1回だけ「滑り落ちない」ところがポイントでした。",
  },
};

// 問題3: ニワトリと卵(2026-08-23追加)。**答えは1日**。
// 「1羽半・1個半・1日半」はいずれも「1羽・1個・1日」をそろって1.5倍した
// ものなので、3つとも1.5で割れば「1羽が1個を1日で産む」という文にそのまま
// 戻る、という対称性で読むのがこの問題の要点。
// (よくある誤答は「1日半」。改変時もこの答えを変えないこと。)
const QUIZ_TEXTS_HEN = {
  en: {
    intro: "And here is a third original puzzle from the creator of this app, Masahiro Ishizuka.",
    question:
      "If one and a half hens lay one and a half eggs in one and a half days,\n" +
      "how many days does it take one hen to lay one egg?",
    fair:
      "This is not a trick question or a play on words. It is pure arithmetic — " +
      "look carefully at the three numbers in the sentence.",
    episode:
      "The popular wrong answer is \"one and a half days\". Read the sentence once more " +
      "before you decide!",
    prompt: "When you would like the answer, just say \"I don't know\" or \"Tell me the answer\".",
    answerTitle: "Here is the answer.",
    answer:
      "    One day.\n" +
      "\"One and a half hens\", \"one and a half eggs\" and \"one and a half days\" are all " +
      "the same multiple of \"one hen\", \"one egg\" and \"one day\". Scale all three down " +
      "by the same factor of 1.5 and the sentence becomes: one hen lays one egg in one day.",
    closing: "Well spotted. The three \"and a half\"s cancel each other out.",
  },
  ja: {
    intro: "このアプリの作者・石塚正浩さんのオリジナル問題、その3です。",
    question:
      "ニワトリ1羽半が、卵1個半を、1日半で産むとしたら、\n" +
      "ニワトリ1羽が卵1個を産むのにかかる日数は何日でしょうか?",
    fair:
      "トンチやひっかけではありません。純粋な算数の問題です。" +
      "問題文に出てくる3つの数をよく見比べてみてください。",
    episode:
      "「1日半」と答えてしまう方がとても多い問題です。答える前に、" +
      "もう一度問題文を読んでみてください。",
    prompt: "答えが知りたくなったら「わからない」「答えを教えて」と送ってください。",
    answerTitle: "答えはこちらです。",
    answer:
      "    1日です。\n" +
      "「1羽半」「1個半」「1日半」は、どれも「1羽」「1個」「1日」の同じ倍率" +
      "(1.5倍)になっています。3つとも同じ1.5で割れば、そのまま" +
      "「ニワトリ1羽が、卵1個を、1日で産む」という文になります。",
    closing: "お見事です。3つの「半」がきれいに打ち消し合うところがポイントでした。",
  },
};

// 出題する問題の一覧(ユーザー指示、2026-08-23「クイズを3問に拡張」)。
// 依頼のたびにこの配列からランダムに1問選ぶ。**言語別の訳文の有無は
// 問題ごとに異なる**——問題1は ja/en/es/fr/de/zh/ko、問題2・3は ja/en のみ。
// 訳文が無い言語の利用者には従来どおり日英併記で出題する(正直な扱い)。
const QUIZ_SETS = [QUIZ_TEXTS_FOUR_NINES, QUIZ_TEXTS_SNAIL, QUIZ_TEXTS_HEN];

// 直近に出題した問題(解答待ちのあいだ、どの問題の答えを返すかを覚えておく)。
let currentQuizTexts = QUIZ_SETS[0];

function pickQuizTexts() {
  // 同じ問題が連続しにくいよう、直前と違う問題を優先して選ぶ
  // (問題が1問しか無い状況でも無限ループしない単純な実装)。
  const candidates = QUIZ_SETS.filter((set) => set !== currentQuizTexts);
  const pool = candidates.length > 0 ? candidates : QUIZ_SETS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 出題に使う言語コードを決める。
 * 「学びたい言語」(`world:<code>`/`english`/`japanese`)を最優先し、
 * 未設定なら母国語設定を見る。翻訳が用意されていない言語なら`null`を返し、
 * 呼び出し側は日英併記の既定へフォールバックする(正直な扱い)。
 */
function quizPreferredLangCode() {
  let code = null;
  const target = typeof learnTargetEl !== "undefined" && learnTargetEl ? learnTargetEl.value : null;
  if (target === "japanese") code = "ja";
  else if (target === "english") code = "en";
  else if (target && target.startsWith("world:")) code = target.slice(6);

  if (!code && typeof loadNativeLanguage === "function") {
    try {
      code = loadNativeLanguage();
    } catch (_) {
      code = null;
    }
  }
  if (!code) return null;
  // "zh-Hant"等の派生コードは基底コード(zh)の訳文を流用する。
  const texts = currentQuizTexts;
  if (!texts[code] && code.includes("-")) code = code.split("-")[0];
  return texts[code] ? code : null;
}

function quizBlock(code) {
  const t = currentQuizTexts[code];
  return `${t.intro}\n\n${t.question}\n\n${t.fair}\n${t.episode}\n\n${t.prompt}`;
}

function quizAnswerBlock(code) {
  const t = currentQuizTexts[code];
  return `${t.answerTitle}\n\n${t.answer}\n\n${t.closing}`;
}

/**
 * 出題文を組み立てる。既定は日本語+英語の併記。
 * 利用者が選んでいる言語の訳文が用意されていれば、それを先頭に加える。
 */
function quizQuestionText() {
  const pref = quizPreferredLangCode();
  const blocks = [];
  if (pref && pref !== "ja" && pref !== "en") blocks.push(quizBlock(pref));
  blocks.push(quizBlock("ja"));
  blocks.push(quizBlock("en"));
  return `🧮 ${blocks.join("\n\n---\n\n")}`;
}

function quizAnswerText() {
  const pref = quizPreferredLangCode();
  const blocks = [];
  if (pref && pref !== "ja" && pref !== "en") blocks.push(quizAnswerBlock(pref));
  blocks.push(quizAnswerBlock("ja"));
  blocks.push(quizAnswerBlock("en"));
  return `✅ ${blocks.join("\n\n---\n\n")}`;
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  appendMessage("user", text);

  if (isDailyLimitExceeded()) {
    appendMessage("system", await dailyLimitExceededMessage());
    return;
  }

  if (levelEl.value === "maid-cafe-training") {
    recordDailyUsage();
    await advanceTrainingMode(text);
    return;
  }

  // 「誰が作ったのか」という質問には、AI推論を経ずに固定の自己紹介を
  // 即座に返す(LLMは作者について何も知らないため、推論に任せると
  // 事実でない答えを作ってしまう)。日次利用回数は消費しない。
  if (isCreatorQuestion(text)) {
    appendMessage("trainer", creatorIntroductionText());
    return;
  }

  // 「風天のとらさん(トラさん)の職業・仕事は何か」という質問にも、
  // AI推論を経ずに固定文で「執事」と即答する(ユーザー指示、2026-08-27
  // 新設)。GPT-2はキャラクター設定を確実には把握できないため、推論に
  // 任せると設定と矛盾する答えを作ってしまう——既存の`isCreatorQuestion`
  // と同じ理由・同じパターン。既存の`trainingIntroLine`でも
  // 「Hello, I am Tora, your butler trainer! / こんにちは、私は執事の
  // 先生、トラです!」と既に「執事」という設定になっており、今回は
  // その設定を通常の会話中の質問にも確実に反映させる対応。
  if (isToraOccupationQuestion(text)) {
    appendMessage("trainer", toraOccupationAnswerText());
    return;
  }

  // 「666は悪魔・獣の印なのか」という趣旨の質問にも、AI推論を経ずに人手で
  // 書いた固定文(前提の紹介+現代的な語呂合わせ+都市伝説の明示+現代の
  // 利便性への肯定+Pythonの偶然の一致)を返す。宗教史と同じ理由で、
  // LLMに聖書解釈を生成させない。日次利用回数は消費しない。
  // 宗教史判定より先に置く(こちらの方が話題が具体的なため)。
  if (isMarkOfBeastQuestion(text)) {
    appendMessage("trainer", markOfBeastText());
    return;
  }

  // 出題済みで解答待ちの状態なら、「わからない」「答えを教えて」等に
  // 反応して解答を返す(2段階のやり取り)。**必ず`isQuizRequest`より
  // 先に置くこと**——「もう一問出して」等でない限り、解答待ちの返事を
  // 優先して拾いたいため。
  if (quizAwaitingAnswer && !isQuizRequest(text) && isQuizAnswerRequest(text)) {
    quizAwaitingAnswer = false;
    appendMessage("trainer", quizAnswerText());
    return;
  }

  // 「何か問題を出して」「クイズ出して」への対応(作者のオリジナル問題)。
  // AI推論を経ずに固定文で出題する。日次利用回数は消費しない。
  if (isQuizRequest(text)) {
    // 3問の中からランダムに1問選ぶ(直前と同じ問題は避ける)。
    currentQuizTexts = pickQuizTexts();
    quizAwaitingAnswer = true;
    const quizNode = appendMessage("trainer", quizQuestionText());
    // 図解が用意されている問題(カタツムリの井戸)は、本文の下にSVGを添える。
    // `appendMessage`は`textContent`で安全に本文を入れる設計なので、図だけを
    // 別要素として追加する(挿入するのはこのファイル内の固定文字列のみ)。
    if (currentQuizTexts.figure && quizNode) {
      const fig = document.createElement("div");
      fig.className = "tutor-figure";
      fig.innerHTML = currentQuizTexts.figure;
      quizNode.appendChild(fig);
      logEl.scrollTop = logEl.scrollHeight;
    }
    return;
  }

  // イスラム教・イラン(ペルシャ)・アラブの歴史やルーツを尋ねる質問にも、
  // AI推論を経ずに人手で書いた中立的・事実ベースの解説を返す
  // (LLMに宗教史を生成させると事実でない内容を作ってしまうため)。
  // 日次利用回数は消費しない。
  if (isReligionHistoryQuestion(text)) {
    appendMessage("trainer", religionHistoryText());
    return;
  }

  // 「送信したのに沈黙する」問題への対応(2026-08-22)。GPT-2のCPU
  // 生成は実測で数秒かかるため、待っている間そのことが見えるように
  // 経過秒数付きのプレースホルダーを出し、応答が来たら中身を差し替える。
  // 正直な開示: これは体感の改善であって生成そのものは速くならない。
  // また`aruaru-llm`の`/v1/generate`は生成完了後に一括でJSONを返す設計
  // (トークン単位のストリーミングAPIは存在しない)ため、いわゆる
  // 逐次ストリーミング表示は実装できない——できるのはここまで。
  const pending = appendMessage("trainer", "…thinking / 考え中… (0.0s)");
  pending.classList.add("pending");
  const pendingStartedAt = performance.now();
  const pendingTimer = setInterval(() => {
    const sec = ((performance.now() - pendingStartedAt) / 1000).toFixed(1);
    pending.textContent = `…thinking / 考え中… (${sec}s)`;
  }, 100);
  const finishPending = (msg, role) => {
    clearInterval(pendingTimer);
    pending.classList.remove("pending");
    pending.className = `msg ${role}`;
    pending.dataset.role = role;
    pending.textContent = msg;
    logEl.scrollTop = logEl.scrollHeight;
  };

  try {
    recordDailyUsage();
    const reply = await askTrainer(text);
    finishPending(reply, "trainer");
    speak(reply);
    setStatus(true, `aruaru-llm: connected${latencySuffix()}`);
  } catch (err) {
    // エラーの種類ごとに、次に何をすればよいかまで英日で伝える
    // (2026-08-22改善、従来は`err.message`をそのまま出すだけだった)。
    let msg;
    if (err.isTimeout) {
      msg =
        `⏱ aruaru-llm did not reply in time (${err.message}). It may still be loading a large model, ` +
        `or the model is too big for this machine. Try a shorter message, or switch to a smaller model ` +
        `(POST /v1/download-smaller on the aruaru-llm side).\n` +
        `⏱ aruaru-llmから時間内に応答がありませんでした(${err.message})。大きなモデルの読み込み中か、` +
        `この端末にはモデルが大きすぎる可能性があります。短い文で試すか、より小さなモデルへ切り替えてください。`;
    } else if (err instanceof TypeError) {
      msg =
        `🔌 Could not reach aruaru-llm at ${apiBaseEl.value.trim()}. Is it running (default port 4600)?\n` +
        `🔌 ${apiBaseEl.value.trim()} のaruaru-llmへ接続できませんでした。起動しているか確認してください(既定ポート4600)。`;
    } else {
      msg = `⚠ Error talking to aruaru-llm: ${err.message}\n⚠ aruaru-llmとの通信でエラー: ${err.message}`;
    }
    finishPending(msg, "system");
    setStatus(false, "aruaru-llm: request failed");
    // 失敗したときこそ実行基盤の状態を取り直す(落ちていればバッジも
    // unknownになり、状況が一目でわかる)。
    refreshRuntimeInfo();
  }
});

levelEl.addEventListener("change", () => {
  if (levelEl.value === "maid-cafe-training") {
    startTrainingMode();
  }
});

apiBaseEl.addEventListener("change", checkHealth);

// 音声入力(ユーザー指示、2026-08-10「声でも文字でも」への対応)。
// ブラウザ標準のWeb Speech API(SpeechRecognition)を使う——対応ブラウザ
// (Chrome系等)でのみ動作する、Firefox等では非対応(正直な開示)。
//
// 【2026-08-29 P1-α: docs/SPEECH_RECOGNITION_REDESIGN.md】従来は
// `recognition.lang`を`replyLangEl.value === "ja" ? "ja-JP" : "en-US"`と
// **英日固定**にしていた。アプリは130言語対応なのに認識器へ常に英語か
// 日本語しか伝えておらず、それ以外の言語の発話はほぼ全滅していた
// (設計文書§2 原因1)。ここでは**学習対象言語**(`learnTargetEl`。
// 学習者はその言語を練習=話す)を優先し、BCP-47タグへ正しく変換する。

// 学習対象セレクタ(`learn-target`)の語句値 → 言語コード。
// `world:<code>`形式(ユーザーが追加した世界の言語)はそのまま`<code>`を使う。
const LEARN_TARGET_TO_LANG_CODE = {
  english: "en", japanese: "ja", german: "de", french: "fr", spanish: "es",
  italian: "it", russian: "ru", arabic: "ar", persian: "fa", hebrew: "he",
};
// 言語コード → BCP-47タグ。**既存の `SPEECH_LANG_TAGS`(読み上げ用、
// この下の方で定義)を正とし**、そこに無い言語だけをここで補う
// (地域明示が音声認識の精度・可用性に効くもの)。Chrome は多くの言語で
// 裸のサブタグも受理するため、未知コードはそのまま渡す。
const SPEECH_LANG_TAGS_EXTRA = {
  "zh-Hant": "zh-TW", yue: "zh-HK", ta: "ta-IN", ur: "ur-PK", nb: "nb-NO",
  hu: "hu-HU", fil: "fil-PH", ca: "ca-ES", gl: "gl-ES", eu: "eu-ES",
};

/**
 * いま音声入力に使うべきBCP-47言語タグを決める(P1-α)。
 * 優先順位: 学習対象言語 → 返信言語(hybrid以外) → ブラウザ設定 → en-US。
 * @returns {string} 例 "en-US" / "de-DE" / "sw"
 */
function speechLangTag() {
  // 呼び出し時点では `SPEECH_LANG_TAGS`(下方の const)は評価済み。
  const table = typeof SPEECH_LANG_TAGS === "object" && SPEECH_LANG_TAGS ? SPEECH_LANG_TAGS : {};
  const codeToTag = (code) =>
    code ? table[code] || SPEECH_LANG_TAGS_EXTRA[code] || code : null;

  // 1) 学習対象言語(学習者はこの言語を話して練習する)
  const lt = (learnTargetEl && learnTargetEl.value) || "";
  let code = lt.startsWith("world:")
    ? lt.slice(6)
    : LEARN_TARGET_TO_LANG_CODE[lt] || null;

  // 2) 返信言語(hybridは方向が定まらないので除外)
  if (!code && replyLangEl && replyLangEl.value && replyLangEl.value !== "hybrid") {
    code = replyLangEl.value;
  }
  const tag = codeToTag(code);
  if (tag) return tag;

  // 3) ブラウザのUI言語 → 4) 最後の砦
  return (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
}

// 【2026-08-29 P1-β: docs/SPEECH_RECOGNITION_REDESIGN.md】n-best 収集 +
// LLM による訂正パス。認識器の第1候補を無補正で入力欄へ直行させていた
// (設計文書§2 原因2・3)のを、複数候補を取り、外部LLMプロバイダ経路
// (`tryPriorityProviderReply`、ユーザーが設定済みなら)で最も意図に近い
// 一文へ訂正する。訂正が使えない/怪しい場合は必ず第1候補へフォールバック
// (回帰ゼロ)。内蔵GPT-2は指示追従できないため訂正には使わない。

/** BCP-47タグ("de-DE")から人間向けの言語名を得る(訂正プロンプト用)。 */
function speechLangDisplayName(tag) {
  const code = String(tag || "").split("-")[0];
  const info = typeof worldLanguageByCode === "function" ? worldLanguageByCode(code) : null;
  if (info && info.en) return info.en;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(code) || code;
  } catch (_) {
    return code;
  }
}

/**
 * 直近のトレーナー発話(会話の話題)を訂正プロンプトの文脈に使う(P1-β2)。
 * 会話履歴は配列で持っていないため DOM の最後の `.msg.trainer` から拾う。
 * 「トレーナーが何を尋ねたか」が分かると、学習者の返答に出やすい語彙へ
 * 訂正を寄せられる(設計文書§4.1 D の contextual biasing を、Web Speech
 * API には prompt 引数が無いため LLM 訂正段で行う)。
 * @returns {string} 末尾200字程度に丸めたトレーナー発話(無ければ空)
 */
function lastTrainerUtterance() {
  try {
    const nodes = logEl.querySelectorAll(".msg.trainer");
    const last = nodes[nodes.length - 1];
    if (!last) return "";
    const t = (last.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > 200 ? t.slice(-200) : t;
  } catch (_) {
    return "";
  }
}

/**
 * n-best 認識候補を、文脈を与えて最も意図に近い一文へ訂正する(P1-β/β2)。
 * @param {{transcript:string,confidence:number}[]} alts 信頼度降順でなくてよい
 * @param {string} langTag BCP-47
 * @returns {Promise<string>} 訂正済み(または第1候補)テキスト
 */
async function refineTranscript(alts, langTag) {
  const clean = alts
    .map((a) => (a && a.transcript ? String(a.transcript).trim() : ""))
    .filter(Boolean);
  const first = clean[0] || "";
  if (clean.length <= 1) return first;

  // 信頼度が取れるブラウザでは、最有力候補も先頭へ寄せておく
  // (訂正が使えない時のフォールバック先をより良くする)。
  const byConf = alts
    .filter((a) => a && a.transcript)
    .slice()
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const bestByConf = (byConf[0] && String(byConf[0].transcript).trim()) || first;

  // 訂正は外部LLMプロバイダ経路が有効なときだけ(内蔵GPT-2は指示追従不可)。
  if (typeof window.tryPriorityProviderReply !== "function") return bestByConf;

  const langName = speechLangDisplayName(langTag);
  const level = (typeof levelEl !== "undefined" && levelEl && levelEl.value) || "";
  const numbered = clean.slice(0, 5).map((t, i) => `${i + 1}) ${t}`).join("\n");
  // P1-β2: 直近のトレーナー発話を文脈として与える(語彙バイアス)。
  const topic = lastTrainerUtterance();
  const prompt =
    `You are cleaning up a speech-to-text transcript from a ${langName} language learner` +
    (level ? ` (${level} level)` : "") +
    `. Below are the recognizer's top hypotheses for one short spoken utterance. ` +
    `Pick or reconstruct the single most likely intended sentence in ${langName}. ` +
    `Fix mishearings, spacing and punctuation. Do NOT translate, do NOT add words, ` +
    `do NOT explain. Reply with only that one sentence.\n\n${numbered}` +
    (topic ? `\n\nContext — the trainer just said/asked: "${topic}"` : "");

  try {
    const r = await window.tryPriorityProviderReply(prompt);
    if (!r || typeof r.text !== "string") return bestByConf;
    let out = r.text.trim().replace(/^["'「]|["'」]$/g, "").split(/\r?\n/)[0].trim();
    // サニティチェック: 空 / 極端に長い(最長候補の2.5倍超) → 訂正を捨てる。
    const longest = clean.reduce((m, t) => Math.max(m, t.length), 0);
    if (!out || out.length > Math.max(40, longest * 2.5)) return bestByConf;
    return out;
  } catch (_) {
    return bestByConf;
  }
}

/**
 * 【2026-08-29 P1-γ: docs/SPEECH_RECOGNITION_REDESIGN.md】音声で話した内容
 * (訂正済みトランスクリプト)を、学習者の母国語へ翻訳して**チャットログの
 * システムメッセージ**として補助表示する(既存の appendMessage を再利用、
 * 新規 UI ウィジェットは足さない)。翻訳は aruaru-llm `/v1/translate`(NLLB/
 * M2M100)。既定ビルドでは `nllb-translate` feature がオフで GPT-2 品質へ
 * フォールバックするため、その場合は正直に「低品質」バッジを付ける。
 * 母国語 == 話した言語 のときは無意味なのでスキップ。失敗時は静かに何も
 * しない(回帰ゼロ)。
 */
async function speechTranslationHelper(text, spokenTag) {
  try {
    if (!text || !text.trim()) return;
    const fromCode = String(spokenTag || "").split("-")[0] || "en";
    const toCode = (typeof loadNativeLanguage === "function" && loadNativeLanguage()) || "ja";
    if (fromCode === toCode) return; // 同じ言語なら翻訳不要

    const fromName = speechLangDisplayName(spokenTag);
    const toName = speechLangDisplayName(toCode);
    const base = (typeof apiBaseEl !== "undefined" && apiBaseEl && apiBaseEl.value.trim()) || "";
    if (!base) return;

    const res = await fetchWithTimeout(
      `${base}/v1/translate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_lang: toName, source_lang: fromName }),
      },
      15000
    );
    if (!res.ok) return;
    const data = await res.json();
    const translation = (data && typeof data.translation === "string" && data.translation.trim()) || "";
    if (!translation) return;

    const engine = (data && data.engine) || "";
    const lowQuality = !/^m2m100/i.test(engine);
    const badge = lowQuality
      ? "\n⚠ 内蔵GPT-2による簡易翻訳です(専用翻訳モデル未搭載のため品質は保証できません) / rough GPT-2 translation — dedicated model not installed"
      : "";
    appendMessage("system", `🌐 ${toName}: ${translation}${badge}`);
  } catch (_) {
    /* 静かにスキップ(回帰ゼロ) */
  }
}

// ══════════════════════════════════════════════════════════════════════
// 【2026-08-29 P2-α: docs/SPEECH_RECOGNITION_REDESIGN.md】ブラウザ内 Whisper。
// transformers.js(ONNX Runtime Web)で Whisper を走らせ、実行段は
// 利用可能なハードウェアアクセラレータへ自動カスケードする:
//   WebGPU(GPU) → WebNN(NPU/統合アクセラレータ) → WASM(SIMD128、
//   スレッド数は /v1/cpu-runtime = open-cpu の検出結果をヒントに)。
// モデル・ランタイム(`/vendor/transformers.min.js`・`/models/...`)が
// まだ配置されていなければ、この経路は静かに無効化され、Web Speech API
// 単独へフォールバックする(回帰ゼロ)。得られた仮説は Web Speech API の
// n-best と統合して `refineTranscript()` へ渡す(§4.4 の融合)。
// ══════════════════════════════════════════════════════════════════════
// 2026-08-29 実配信で判明: VPS ではリバースプロキシがこのアプリを
// `/open-english/` プレフィックス配下で配信する(`strip_prefix=true`)。
// `/vendor/...` `/models/...` をドメイン直下の絶対パスにすると、プロキシが
// バックエンドへ転送せず 404 になる。app.js 自身が読み込まれた URL から
// アプリのベースパス(`/` または `/open-english/`)を導出し、そこからの
// 相対で組み立てる(ローカル/インストーラー版=`/`、VPS=`/open-english/`
// のどちらでも正しく解決される。プロキシは `/open-english` を剥がして
// バックエンドへ渡すため、STATIC_FILES 側は常に `/vendor/...` で一致する)。
const WHISPER_APP_BASE = (() => {
  try {
    const src = (document.currentScript && document.currentScript.src) || window.location.href;
    return new URL(".", src).pathname; // 例: "/" または "/open-english/"
  } catch (_) {
    return "/";
  }
})();
const WHISPER_VENDOR_URL = WHISPER_APP_BASE + "vendor/transformers.min.js";
const WHISPER_MODEL_BASE = WHISPER_APP_BASE + "models/"; // 末尾スラッシュ必須(localModelPath)
const WHISPER_MODEL_ID = "onnx-community/whisper-base";
const whisperState = { loadPromise: null, pipelinePromise: null, disabled: false, deviceLabel: "", dtypeLabel: "" };

/** WASM 実行段のスレッド数ヒント(open-cpu の検出結果を server 経由で)。 */
async function whisperWasmThreadHint() {
  try {
    const res = await fetchWithTimeout("/v1/cpu-runtime", { cache: "no-store" }, 2000);
    if (!res.ok) return 1;
    const d = await res.json();
    const hasSimd = !!(d && (d.avx2 || d.simd128 || d.neon || /avx2|neon|simd/i.test(JSON.stringify(d))));
    const hw = (navigator.hardwareConcurrency || 2);
    return hasSimd ? Math.max(1, Math.min(4, hw - 1)) : 1;
  } catch (_) {
    return 1;
  }
}

/** transformers.js を遅延ロードして設定する。失敗したら null。 */
function loadWhisperModule() {
  if (whisperState.disabled) return Promise.resolve(null);
  if (whisperState.loadPromise) return whisperState.loadPromise;
  whisperState.loadPromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ WHISPER_VENDOR_URL);
      const env = mod.env;
      env.allowRemoteModels = false; // 外部CDNへ取りに行かない(オフライン優先)
      env.localModelPath = WHISPER_MODEL_BASE;
      if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.wasmPaths = WHISPER_APP_BASE + "vendor/ort/";
        env.backends.onnx.wasm.numThreads = await whisperWasmThreadHint();
      }
      return mod;
    } catch (e) {
      // vendor ファイルが未配置 → この経路を諦める(静かに)。
      whisperState.disabled = true;
      return null;
    }
  })();
  return whisperState.loadPromise;
}

/** 実行段カスケードでパイプラインを1回だけ構築する。 */
function getWhisperPipeline() {
  if (whisperState.pipelinePromise) return whisperState.pipelinePromise;
  whisperState.pipelinePromise = (async () => {
    const mod = await loadWhisperModule();
    if (!mod) return null;
    // 優先順: WebGPU → WebNN(npu→gpu→cpu) → WASM。
    const candidates = [];
    if (navigator.gpu) candidates.push("webgpu");
    if (navigator.ml) candidates.push("webnn-npu", "webnn-gpu", "webnn-cpu");
    candidates.push("wasm");
    // 2026-08-29 多言語調査(docs/SPEECH_RECOGNITION_REDESIGN.md §3)反映:
    // transformers.js の既知の実測で「WebGPU + q8 デコーダ → 出力が壊れる
    // (gibberish)」「q8 エンコーダ → 特徴量が劣化」。**fp32 エンコーダ +
    // q4 デコーダのハイブリッド**が精度を保つ推奨構成。ファイルが未取得の
    // 環境向けに、失敗したら q8 単一 dtype へ 1 度だけリトライする。
    const dtypeAttempts = [{ encoder_model: "fp32", decoder_model_merged: "q4" }, "q8"];
    for (const device of candidates) {
      for (const dtype of dtypeAttempts) {
        try {
          const pipe = await mod.pipeline("automatic-speech-recognition", WHISPER_MODEL_ID, { device, dtype });
          whisperState.deviceLabel = device;
          whisperState.dtypeLabel = typeof dtype === "string" ? dtype : "fp32enc+q4dec";
          return pipe;
        } catch (e) {
          /* 次の dtype / 次の device へ */
        }
      }
    }
    whisperState.disabled = true;
    return null;
  })();
  return whisperState.pipelinePromise;
}

/** webm/opus 等の Blob を 16kHz mono Float32 PCM へデコード・リサンプル。 */
async function blobToPcm16k(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const buf = await blob.arrayBuffer();
  const ac = new AC();
  try {
    const decoded = await ac.decodeAudioData(buf);
    const targetRate = 16000;
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ac.close && ac.close();
  }
}

// ══════════════════════════════════════════════════════════════════════
// 【2026-08-29 P2-γ】無音トリム(エネルギーベース VAD)。
// 多言語調査(docs/SPEECH_RECOGNITION_REDESIGN.md §3.6)で「認識前に無音
// 区間を落とすと幻覚が減り速くもなる」が日中露で一致。本命は Silero VAD
// (ONNX、内部の無音ギャップ・雑音頑健性まで対応)だが、まずは依存ゼロ・
// ダウンロードゼロで**先頭/末尾の無音**を刈る RMS ベースの第一段を入れる
// (幻覚のいちばん多いトリガーが先頭/末尾の無音のため、これだけでも効く)。
// Silero VAD の vendor 導入は次段。
function trimSilenceVad(pcm, sampleRate) {
  try {
    if (!pcm || pcm.length < sampleRate * 0.3) return pcm; // 0.3s 未満はそのまま
    const frame = Math.round(sampleRate * 0.03); // 30ms
    const hop = Math.round(sampleRate * 0.01); // 10ms
    const rms = [];
    for (let i = 0; i + frame <= pcm.length; i += hop) {
      let s = 0;
      for (let j = i; j < i + frame; j++) s += pcm[j] * pcm[j];
      rms.push(Math.sqrt(s / frame));
    }
    if (rms.length < 4) return pcm;
    const sorted = rms.slice().sort((a, b) => a - b);
    const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] || 0;
    const peak = sorted[sorted.length - 1] || 0;
    // 適応しきい値: ノイズフロアの 3 倍、ただしピークの 8% は下回らない、
    // 絶対下限 0.01(-40dBFS 相当)。
    const thresh = Math.max(0.01, noiseFloor * 3, peak * 0.08);
    let first = rms.findIndex((v) => v >= thresh);
    let last = -1;
    for (let k = rms.length - 1; k >= 0; k--) {
      if (rms[k] >= thresh) { last = k; break; }
    }
    if (first < 0 || last < first) return pcm; // 全部無音 → そのまま(Whisper に委ねる)
    const pad = Math.round(sampleRate * 0.1); // 前後 100ms 残す
    const start = Math.max(0, first * hop - pad);
    const end = Math.min(pcm.length, last * hop + frame + pad);
    if (end - start < sampleRate * 0.2) return pcm; // 刈りすぎ防止(0.2s 未満)
    if (end - start >= pcm.length * 0.98) return pcm; // ほぼ無変化
    return pcm.subarray(start, end);
  } catch (_) {
    return pcm;
  }
}

// ── Silero VAD(ONNX)本命の第二段 ──────────────────────────────────
// `onnx-community/silero-vad`(v5、~2.2MB)を、既に vendor 済みの ORT
// (transformers.js の `env.backends.onnx`)経由で走らせる。512 サンプル
// (16kHz で 32ms)ごとに発話確率を出し、しきい値 + 最小発話/最小無音長で
// 発話セグメントへまとめる。内部の無音ギャップも落とせるので、RMS 版
// (`trimSilenceVad`)より幻覚に強い。モデル未配置・実行失敗なら null を
// 返し、呼び出し側は `trimSilenceVad` へフォールバック(回帰ゼロ)。
const SILERO_VAD_URL = WHISPER_APP_BASE + "models/silero-vad/model.onnx";
// transformers.js は onnxruntime-web を内部利用するだけで `InferenceSession`
// を公開しないため、VAD 用に standalone の ORT ローダー(`ort.wasm.min.mjs`、
// ~48KB)を別途 vendor し、wasm 本体は既に置いてある `/vendor/ort/` を再利用
// する(重複ダウンロードを避ける)。ローダー未配置・バージョン不整合・
// 実行失敗はすべて catch して null → 呼び出し側は RMS 版へフォールバック。
const SILERO_ORT_URL = WHISPER_APP_BASE + "vendor/ort/ort.wasm.min.mjs";
const sileroState = { sessionPromise: null, disabled: false };

async function getSileroSession() {
  if (sileroState.disabled) return null;
  if (sileroState.sessionPromise) return sileroState.sessionPromise;
  sileroState.sessionPromise = (async () => {
    try {
      const head = await fetch(SILERO_VAD_URL, { method: "HEAD" });
      if (!head.ok) {
        sileroState.disabled = true;
        return null;
      }
      const ort = await import(/* @vite-ignore */ SILERO_ORT_URL);
      if (!ort || !ort.InferenceSession) {
        sileroState.disabled = true;
        return null;
      }
      if (ort.env && ort.env.wasm) {
        ort.env.wasm.wasmPaths = WHISPER_APP_BASE + "vendor/ort/";
        ort.env.wasm.numThreads = 1; // VAD は極小、スレッド立ち上げの方が高コスト
      }
      const session = await ort.InferenceSession.create(SILERO_VAD_URL, { executionProviders: ["wasm"] });
      return { session, ort };
    } catch (_) {
      sileroState.disabled = true;
      return null;
    }
  })();
  return sileroState.sessionPromise;
}

/**
 * Silero VAD で発話セグメントだけを連結した PCM を返す。無音ギャップも
 * 落とす。失敗時は null(呼び出し側は trimSilenceVad へ)。
 */
async function sileroVadTrim(pcm, sampleRate) {
  try {
    if (!pcm || pcm.length < sampleRate * 0.3) return null;
    const s = await getSileroSession();
    if (!s) return null;
    const { session, ort } = s;
    const WIN = 512; // v5: 16kHz は 512 サンプル固定
    const inName = session.inputNames.includes("input") ? "input" : session.inputNames[0];
    const srName = session.inputNames.find((n) => /sr/i.test(n)) || "sr";
    const stName = session.inputNames.find((n) => /state|^h$/i.test(n)) || "state";
    const outName = session.outputNames.find((n) => !/state|stateN|hn|cn/i.test(n)) || session.outputNames[0];
    const stOutName = session.outputNames.find((n) => /state|stateN|hn/i.test(n)) || session.outputNames[1];

    let state = new ort.Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
    const sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(sampleRate)]), [1]);
    const probs = [];
    for (let off = 0; off + WIN <= pcm.length; off += WIN) {
      const chunk = new Float32Array(WIN);
      chunk.set(pcm.subarray(off, off + WIN));
      const feeds = {};
      feeds[inName] = new ort.Tensor("float32", chunk, [1, WIN]);
      feeds[srName] = sr;
      feeds[stName] = state;
      const out = await session.run(feeds);
      probs.push(out[outName].data[0]);
      state = out[stOutName];
    }
    if (probs.length < 4) return null;

    // しきい値 + ヒステリシス(開始 0.5 / 終了 0.35)、最小発話 120ms、
    // ギャップ 200ms 未満は繋ぐ、前後 100ms パディング。
    const onT = 0.5;
    const offT = 0.35;
    const minSpeech = Math.round((0.12 * sampleRate) / WIN);
    const maxGap = Math.round((0.2 * sampleRate) / WIN);
    const padWin = Math.round((0.1 * sampleRate) / WIN);
    const segs = [];
    let inSeg = false;
    let segStart = 0;
    let silence = 0;
    for (let i = 0; i < probs.length; i++) {
      if (!inSeg) {
        if (probs[i] >= onT) {
          inSeg = true;
          segStart = i;
          silence = 0;
        }
      } else if (probs[i] < offT) {
        silence++;
        if (silence > maxGap) {
          segs.push([segStart, i - silence + 1]);
          inSeg = false;
        }
      } else {
        silence = 0;
      }
    }
    if (inSeg) segs.push([segStart, probs.length]);

    const kept = segs
      .filter(([a, b]) => b - a >= minSpeech)
      .map(([a, b]) => [Math.max(0, (a - padWin) * WIN), Math.min(pcm.length, (b + padWin) * WIN)]);
    if (!kept.length) return null;

    // 重なり/近接をマージ
    kept.sort((x, y) => x[0] - y[0]);
    const merged = [kept[0].slice()];
    for (let i = 1; i < kept.length; i++) {
      const last = merged[merged.length - 1];
      if (kept[i][0] <= last[1]) last[1] = Math.max(last[1], kept[i][1]);
      else merged.push(kept[i].slice());
    }
    const totalLen = merged.reduce((n, [a, b]) => n + (b - a), 0);
    if (totalLen < sampleRate * 0.2) return null; // 刈りすぎ
    if (totalLen >= pcm.length * 0.98) return pcm; // ほぼ無変化
    const outPcm = new Float32Array(totalLen);
    let w = 0;
    for (const [a, b] of merged) {
      outPcm.set(pcm.subarray(a, b), w);
      w += b - a;
    }
    return outPcm;
  } catch (_) {
    return null;
  }
}

/** VAD: Silero(あれば)→ RMS フォールバック。返り値は必ず有効な PCM。 */
async function vadTrim(pcm, sampleRate) {
  const silero = await sileroVadTrim(pcm, sampleRate);
  if (silero && silero.length) return silero;
  return trimSilenceVad(pcm, sampleRate);
}

/**
 * 16kHz mono f32 PCM を ブラウザ内 Whisper で書き起こし、候補配列(1件)を返す。
 * 失敗時は空配列(融合側は他エンジンの候補だけで進む)。
 */
async function whisperTranscribePcm(pcm, langTag) {
  try {
    if (!pcm || !pcm.length) return [];
    const pipe = await getWhisperPipeline();
    if (!pipe) return [];
    const langCode = String(langTag || "en").split("-")[0];
    // 2026-08-29 調査反映: 幻覚(無音区間で存在しない語を出す)対策として
    // (1) 直前トークンに条件付けしない、(2) 無音/圧縮率しきい値で温度上げ
    // 再試行を許可。呼び出し前に trimSilenceVad() で先頭/末尾の無音は
    // 既に刈られている。
    const out = await pipe(pcm, {
      chunk_length_s: 30,
      language: langCode,
      task: "transcribe",
      return_timestamps: false,
      condition_on_previous_text: false,
      no_speech_threshold: 0.6,
      compression_ratio_threshold: 2.4,
      temperature: [0, 0.2, 0.4],
    });
    const text = (out && (typeof out.text === "string" ? out.text : "")) || "";
    const t = text.trim();
    if (!t) return [];
    return [{ transcript: t, confidence: 0.95, engine: "whisper-" + (whisperState.deviceLabel || "wasm") }];
  } catch (_) {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════
// 【2026-08-29 P2-γ】サーバー側 Whisper(aruaru-llm `POST /v1/transcribe`、
// whisper.cpp CLI)。利用者が自分の PC で aruaru-llm + whisper-cli +
// GGML モデルを用意している場合のみ到達する第3の経路。可否は既に定期
// ポーリング済みの `lastRuntimeInfo.whisper`(`GET /v1/runtime`)で判定
// し、無ければ静かにスキップ(回帰ゼロ)。得られた仮説は Web Speech API・
// ブラウザ Whisper の候補と 1 リストに束ねて `refineTranscript()` へ。
// ══════════════════════════════════════════════════════════════════════
function serverWhisperReachable() {
  const w = lastRuntimeInfo && lastRuntimeInfo.whisper;
  if (!w) return false;
  // 新しい shape(available)を優先、古い shape(compiled_in+model_present)も許容。
  if (typeof w.available === "boolean") return w.available;
  return !!(w.compiled_in && w.model_present);
}

function f32ToBase64(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function serverTranscribePcm(pcm, langTag) {
  try {
    if (!pcm || !pcm.length) return [];
    if (!serverWhisperReachable()) return [];
    const base = (typeof apiBaseEl !== "undefined" && apiBaseEl && apiBaseEl.value.trim()) || "";
    if (!base) return [];
    if (!(pcm instanceof Float32Array)) pcm = new Float32Array(pcm);
    const langCode = String(langTag || "auto").split("-")[0] || "auto";
    const res = await fetchWithTimeout(
      `${base}/v1/transcribe`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pcm_f32_base64: f32ToBase64(pcm), sample_rate: 16000, language: langCode }),
      },
      60000,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const t = (data && typeof data.transcript === "string" ? data.transcript : "").trim();
    if (!t) return [];
    return [{ transcript: t, confidence: 0.9, engine: "whisper-server:" + (data.engine || "cli") }];
  } catch (_) {
    return [];
  }
}

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionImpl) {
  const recognition = new SpeechRecognitionImpl();
  recognition.interimResults = false;
  // P1-β: 第1候補だけでなく上位候補を取り、後段の訂正/再選択に使う。
  recognition.maxAlternatives = 5;
  let activeSpeechLang = "en-US";

  // P2-α: マイク押下中の並行録音(Whisper 用)。getUserMedia/MediaRecorder が
  // 使えない環境ではこれらは null のままで、従来どおり Web Speech API 単独。
  let mediaRecorder = null;
  let recordedChunks = [];
  let pendingSpeechAlts = null; // Web Speech API の result を融合まで保持

  async function startParallelRecording() {
    mediaRecorder = null;
    recordedChunks = [];
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.addEventListener("dataavailable", (e) => {
        if (e.data && e.data.size) recordedChunks.push(e.data);
      });
      mediaRecorder.addEventListener("stop", () => {
        stream.getTracks().forEach((t) => t.stop());
      });
      mediaRecorder.start();
    } catch (_) {
      mediaRecorder = null;
    }
  }

  // Web Speech API と Whisper の候補を融合し、訂正 → 送信 → 翻訳補助。
  async function finalizeVoiceInput() {
    const speechAlts = pendingSpeechAlts || [];
    pendingSpeechAlts = null;

    let blob = null;
    if (mediaRecorder && recordedChunks.length) {
      try {
        blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      } catch (_) {
        blob = null;
      }
    }
    recordedChunks = [];
    mediaRecorder = null;

    micBtn.textContent = "✨ Refining...";
    // P2-γ: PCM を1回だけデコード → 無音トリム(VAD)→ ブラウザ Whisper と
    // サーバー Whisper(到達時)へ**同じ PCM**を渡して並行実行。
    let whisperAlts = [];
    let serverAlts = [];
    if (blob) {
      let pcm = null;
      try {
        pcm = await blobToPcm16k(blob);
      } catch (_) {
        pcm = null;
      }
      if (pcm && pcm.length) {
        pcm = await vadTrim(pcm, 16000); // Silero(あれば)→ RMS フォールバック
      }
      if (pcm && pcm.length) {
        micBtn.textContent = "🧠 Whisper...";
        [whisperAlts, serverAlts] = await Promise.all([
          whisperTranscribePcm(pcm, activeSpeechLang),
          serverTranscribePcm(pcm, activeSpeechLang),
        ]);
        micBtn.textContent = "✨ Refining...";
      }
    }

    // §4.4 融合: 全エンジン(サーバー Whisper・ブラウザ Whisper・
    // Web Speech API)の候補を1リストへ。精度が高い順に前へ並べておくと
    // `refineTranscript` の sanity check(最長候補基準)が効きやすい。
    const fused = serverAlts.concat(whisperAlts).concat(speechAlts);
    if (!fused.length) {
      resetMicButton();
      return;
    }
    let text;
    try {
      text = await refineTranscript(fused, activeSpeechLang);
    } catch (_) {
      text = (fused[0] && fused[0].transcript) || "";
    }

    // 評価用ダンプ(docs/asr-eval、tools/asr-bench)。
    // `localStorage.setItem("openEnglish.asrBench","1")` で有効化。
    // 計測時は devtools で `copy(JSON.stringify(window.__asrBench))`。
    try {
      if (window.localStorage && localStorage.getItem("openEnglish.asrBench") === "1") {
        window.__asrBench = window.__asrBench || [];
        const seq = window.__asrBench.length + 1;
        window.__asrBench.push({
          id: "u" + String(seq).padStart(3, "0"),
          lang: String(activeSpeechLang || "").split("-")[0],
          webspeech: (speechAlts[0] && speechAlts[0].transcript) || "",
          whisper: (whisperAlts[0] && whisperAlts[0].transcript) || "",
          server: (serverAlts[0] && serverAlts[0].transcript) || "",
          fused: text,
        });
        console.log("[asrBench] captured utterance #" + seq, window.__asrBench[window.__asrBench.length - 1]);
      }
    } catch (_) {}

    inputEl.value = text;
    formEl.requestSubmit();
    speechTranslationHelper(text, activeSpeechLang); // P1-γ
    resetMicButton();
  }

  micBtn.addEventListener("click", () => {
    const tag = speechLangTag();
    activeSpeechLang = tag;
    recognition.lang = tag;
    pendingSpeechAlts = null;
    micBtn.classList.add("listening");
    micBtn.textContent = `🎙 Listening (${tag})...`;
    startParallelRecording(); // fire-and-forget(失敗しても Web Speech API は動く)
    try {
      recognition.start();
    } catch (err) {
      // 既に開始中の場合など。
    }
  });

  recognition.addEventListener("result", (event) => {
    const res0 = event.results[0];
    const alts = [];
    for (let i = 0; i < res0.length; i++) {
      alts.push({ transcript: res0[i].transcript, confidence: res0[i].confidence });
    }
    pendingSpeechAlts = alts;
  });

  const resetMicButton = () => {
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎙 Speak";
  };

  recognition.addEventListener("end", () => {
    // 録音を止めてから融合・確定へ。MediaRecorder が無い場合も
    // finalizeVoiceInput が pendingSpeechAlts だけで進める。
    if (mediaRecorder && mediaRecorder.state === "recording") {
      const mr = mediaRecorder;
      mr.addEventListener("stop", () => {
        finalizeVoiceInput();
      });
      try {
        mr.stop();
      } catch (_) {
        finalizeVoiceInput();
      }
    } else {
      finalizeVoiceInput();
    }
  });
  recognition.addEventListener("error", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
      } catch (_) {}
    }
    // エラーでも録音があれば Whisper だけで拾える可能性がある。
    finalizeVoiceInput();
  });
} else {
  micBtn.disabled = true;
  micBtn.title = "Voice input not supported in this browser / このブラウザは音声入力に対応していません";
  micBtn.textContent = "🎙 N/A";
}

checkHealth();
speak("Hi! I'm your English trainer. Choose your level above, then type or press the mic to start! / レベルを選んで、話すか入力してね!");

// Service Workerの登録(2026-08-24新設)。Android版ChromeでPWAとして
// 「ワンタップでホーム画面に追加」できるようにするために必要
// (manifest.jsonだけでは不十分——Chromeのインストール可能性判定は
// fetchハンドラを持つ登録済みSWも要求する)。**正直な開示**:
// 非対応ブラウザ(Service Worker未実装のブラウザ、または`file://`で
// 直接開いた場合)では静かにスキップされ、既存機能には一切影響しない。
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // 登録に失敗しても(例: 旧バージョンのサーバーが/sw.jsをまだ
      // 配信していない等)通常のWebアプリとしての利用は継続できる。
    });
  });
}

// aruaru-llmの簡単セットアップ手順モーダル(ユーザー指示、2026-08-10
// 「aruaru-llmのインストールを簡単にして」への対応)。正直な開示:
// このPhase 0段階ではワンクリック・インストーラーではなく、Git+Rust
// ツールチェーンを前提としたコピペ用スクリプトの提示に留まる。
const setupBtn = document.getElementById("setup-btn");
const setupModal = document.getElementById("setup-modal");
const setupClose = document.getElementById("setup-close");
const setupRecheck = document.getElementById("setup-recheck");

// 2026-08-25修正(バグ報告「既にaruaru-llmをインストール済みなのに、
// 再度インストールするようにメッセージが出る」): このパネルは接続状態を
// 一切見ずに常にビルド手順を表示していた。パネルを開くたびに現在の
// 接続状態を確認し、既に接続済みなら「既に接続済みです」というバナーを
// 表示する(手順自体は再インストール・アップデート時にも使えるため
// 消さず、バナーで補足するだけに留めた)。
const setupAlreadyConnectedBannerEl = document.getElementById("setup-already-connected-banner");
function updateSetupAlreadyConnectedBanner() {
  if (!setupAlreadyConnectedBannerEl) return;
  setupAlreadyConnectedBannerEl.classList.toggle("hidden", !wasConnected);
}

setupBtn.addEventListener("click", () => {
  setupModal.classList.remove("hidden");
  updateSetupAlreadyConnectedBanner();
});
setupClose.addEventListener("click", () => setupModal.classList.add("hidden"));
setupModal.addEventListener("click", (e) => {
  if (e.target === setupModal) setupModal.classList.add("hidden");
});
setupRecheck.addEventListener("click", async () => {
  await checkHealth();
  updateSetupAlreadyConnectedBanner();
});

// aruaru-db & PostgreSQLセットアップ案内(ユーザー指示「open-easy-web
// とPostgreSQLとaruaru-dbをSETUPして頂きますと、将来大量の情報をより
// 高速で処理する事も可能になる予定です」+「SETUPは、なるべく簡単に
// して」への対応)。既存の`aruaru-db`の`install.sh`/`install.ps1`
// (すでに用意されているインストーラースクリプト)を案内するのみ——
// このアプリ自体がPostgreSQLやaruaru-dbを操作・インストールすることは
// ない(正直な開示、`.setup-honest`内に明記済み)。
const aruaruDbSetupBtn = document.getElementById("aruaru-db-setup-btn");
const aruaruDbSetupModal = document.getElementById("aruaru-db-setup-modal");
const aruaruDbSetupClose = document.getElementById("aruaru-db-setup-close");
if (aruaruDbSetupBtn && aruaruDbSetupModal) {
  aruaruDbSetupBtn.addEventListener("click", () => aruaruDbSetupModal.classList.remove("hidden"));
  aruaruDbSetupClose.addEventListener("click", () => aruaruDbSetupModal.classList.add("hidden"));
  aruaruDbSetupModal.addEventListener("click", (e) => {
    if (e.target === aruaruDbSetupModal) aruaruDbSetupModal.classList.add("hidden");
  });
}

// データ・モデル保存先パネル(ユーザー指示「モデル重みの保存先と同期
// バックアップ機能を実装、日英併記UIで」への対応、2026-08-19新設)。
// バックエンドの`/v1/db/info`・`/v1/db/storage-path`・`/v1/db/rsync-backup`・
// `/v1/db/install-rsync`(2026-08-18に実装済み)へ初めて接続するUI。
// 正直な開示: ここでバックアップ・移動できるのは会話履歴・設定の
// SQLite DBのみ——`aruaru-llm`本体のモデル重み(GPT-2系・埋め込み
// モデル)は別リポジトリ`aruaru-llm`自身の`/v1/models/*`APIで管理されて
// おり、このパネルの対象外(パネル内の`.setup-honest`にも明記)。
const dataStorageBtn = document.getElementById("data-storage-btn");
const dataStorageModal = document.getElementById("data-storage-modal");
const dataStorageClose = document.getElementById("data-storage-close");
const dataStorageInfoEl = document.getElementById("data-storage-info");
const dataStorageRefreshBtn = document.getElementById("data-storage-refresh");
const dataStorageNewPathEl = document.getElementById("data-storage-new-path");
const dataStorageRelocateBtn = document.getElementById("data-storage-relocate-btn");
const dataStorageRelocateStatusEl = document.getElementById("data-storage-relocate-status");
const dataStorageRsyncDestEl = document.getElementById("data-storage-rsync-dest");
const dataStorageBackupBtn = document.getElementById("data-storage-backup-btn");
const dataStorageInstallRsyncBtn = document.getElementById("data-storage-install-rsync-btn");
const dataStorageBackupStatusEl = document.getElementById("data-storage-backup-status");

function formatBytes(n) {
  if (typeof n !== "number") return "? / 不明";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function refreshDataStorageInfo() {
  if (!dataStorageInfoEl) return;
  dataStorageInfoEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/db/info");
    const info = await res.json();
    // 2026-08-24: DUAL同時書き込み(2つのDBへ同時に書き込む設定)に対応した
    // ため、ミラーの状態を「無効 / 1か所 / DUAL(2か所同時)」の3値で正直に
    // 表示する。`dual_mirror`・`mirror_targets`は新しいサーバーのみが返す
    // ため、古いサーバーへ繋いだ場合は従来どおりの2値表示へフォールバック
    // する(`postgres_mirror_configured`は引き続き返るため)。
    const targets = Array.isArray(info.mirror_targets) ? info.mirror_targets : [];
    let mirrorEn;
    let mirrorJa;
    if (!info.postgres_mirror_configured) {
      mirrorEn = "disabled (local SQLite only)";
      mirrorJa = "無効(内蔵SQLiteのみ)";
    } else if (info.dual_mirror) {
      mirrorEn = `DUAL — writing to both simultaneously [${targets.join(", ")}]`;
      mirrorJa = `DUAL(2か所へ同時書き込み)[${targets.join(", ")}]`;
    } else {
      const only = targets.length ? ` [${targets.join(", ")}]` : "";
      mirrorEn = `enabled, single target${only} (set OPEN_ENGLISH_DATABASE_URL_SECONDARY for DUAL)`;
      mirrorJa = `有効(1か所のみ)${only}(DUALにするには OPEN_ENGLISH_DATABASE_URL_SECONDARY を設定)`;
    }
    dataStorageInfoEl.textContent =
      `Conversation/settings DB path: ${info.db_path} (${formatBytes(info.db_file_size_bytes)}) ` +
      `| Cloud DB mirror: ${mirrorEn} ` +
      `/ 会話・設定DBの保存先: ${info.db_path}(${formatBytes(info.db_file_size_bytes)}) ` +
      `| クラウドDBミラー: ${mirrorJa}`;
  } catch (e) {
    dataStorageInfoEl.textContent = `Failed to load storage info: ${e.message} / 保存先情報の取得に失敗しました: ${e.message}`;
  }
}

if (dataStorageBtn && dataStorageModal) {
  dataStorageBtn.addEventListener("click", () => {
    dataStorageModal.classList.remove("hidden");
    refreshDataStorageInfo();
  });
  dataStorageClose.addEventListener("click", () => dataStorageModal.classList.add("hidden"));
  dataStorageModal.addEventListener("click", (e) => {
    if (e.target === dataStorageModal) dataStorageModal.classList.add("hidden");
  });
}
if (dataStorageRefreshBtn) dataStorageRefreshBtn.addEventListener("click", refreshDataStorageInfo);

// フォルダブラウザ(2026-08-25新設、ユーザー指示「バックアップ先入力欄が
// 1本のテキスト欄だけでは分かりにくいので、エクスプローラーの様な物を」
// への対応)。`GET /v1/fs/list-dir`(サーバー側新設、読み取り専用・
// フォルダ名のみ)を辿り、選んだフォルダの実際のパス文字列を対象の
// テキスト入力欄へ書き戻す。**正直な開示**: ブラウザ標準のFile System
// Access APIでは絶対パス文字列を取得できない(セキュリティ上の意図的な
// 制約)ため、この用途にはサーバー側APIが必要だった。
const folderBrowserModal = document.getElementById("folder-browser-modal");
const folderBrowserClose = document.getElementById("folder-browser-close");
const folderBrowserCurrentPathEl = document.getElementById("folder-browser-current-path");
const folderBrowserUpBtn = document.getElementById("folder-browser-up-btn");
const folderBrowserListEl = document.getElementById("folder-browser-list");
const folderBrowserSelectBtn = document.getElementById("folder-browser-select-btn");
const folderBrowserStatusEl = document.getElementById("folder-browser-status");
let folderBrowserTargetInputId = null;
let folderBrowserCurrentPath = "";
let folderBrowserCurrentParent = null;

async function folderBrowserLoad(path) {
  folderBrowserListEl.textContent = "Loading… / 読み込み中…";
  folderBrowserStatusEl.textContent = "";
  try {
    const url = path ? `/v1/fs/list-dir?path=${encodeURIComponent(path)}` : "/v1/fs/list-dir";
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok || !body.ok) {
      folderBrowserListEl.textContent = "";
      folderBrowserStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      return;
    }
    folderBrowserCurrentPath = body.path || "";
    folderBrowserCurrentParent = body.parent || null;
    folderBrowserCurrentPathEl.textContent = folderBrowserCurrentPath || "(drives / ドライブ一覧)";
    folderBrowserUpBtn.disabled = !folderBrowserCurrentPath;
    folderBrowserListEl.innerHTML = "";
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "setup-note";
      empty.textContent = "(no subfolders / サブフォルダはありません)";
      folderBrowserListEl.appendChild(empty);
    }
    entries.forEach((entry) => {
      if (!entry.name) return; // Unix root ("/")自身を表す空エントリはスキップ。
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "folder-browser-entry";
      btn.textContent = "📁 " + entry.name;
      btn.addEventListener("click", () => {
        const sep = folderBrowserCurrentPath.endsWith("\\") || folderBrowserCurrentPath.endsWith("/") || folderBrowserCurrentPath === "" ? "" : /[\\/]/.test(folderBrowserCurrentPath) && folderBrowserCurrentPath.includes("\\") ? "\\" : "/";
        const next = folderBrowserCurrentPath ? folderBrowserCurrentPath + sep + entry.name : entry.name + (entry.name.endsWith(":") ? "\\" : "");
        folderBrowserLoad(next);
      });
      folderBrowserListEl.appendChild(btn);
    });
  } catch (e) {
    folderBrowserListEl.textContent = "";
    folderBrowserStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
  }
}

function openFolderBrowser(targetInputId, startPath) {
  folderBrowserTargetInputId = targetInputId;
  folderBrowserModal.classList.remove("hidden");
  folderBrowserLoad(startPath || "");
}

if (folderBrowserModal) {
  folderBrowserClose.addEventListener("click", () => folderBrowserModal.classList.add("hidden"));
  folderBrowserModal.addEventListener("click", (e) => {
    if (e.target === folderBrowserModal) folderBrowserModal.classList.add("hidden");
  });
  folderBrowserUpBtn.addEventListener("click", () => {
    if (folderBrowserCurrentParent !== null) folderBrowserLoad(folderBrowserCurrentParent);
    else folderBrowserLoad(""); // ドライブ一覧(Windows)/ルート(Unix)へ。
  });
  folderBrowserSelectBtn.addEventListener("click", () => {
    if (!folderBrowserTargetInputId) return;
    const input = document.getElementById(folderBrowserTargetInputId);
    if (input) {
      const btn = document.querySelector(`.browse-btn[data-target-input="${folderBrowserTargetInputId}"]`);
      const filename = btn ? btn.getAttribute("data-filename") : null;
      const sep = folderBrowserCurrentPath.includes("\\") ? "\\" : "/";
      input.value = filename ? folderBrowserCurrentPath + sep + filename : folderBrowserCurrentPath;
    }
    folderBrowserModal.classList.add("hidden");
  });
  document.querySelectorAll(".browse-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetInputId = btn.getAttribute("data-target-input");
      openFolderBrowser(targetInputId, "");
    });
  });
}

if (dataStorageRelocateBtn) {
  dataStorageRelocateBtn.addEventListener("click", async () => {
    const newPath = (dataStorageNewPathEl?.value || "").trim();
    if (!newPath) {
      dataStorageRelocateStatusEl.textContent = "Please enter a destination path. / 移動先のパスを入力してください。";
      return;
    }
    dataStorageRelocateStatusEl.textContent = "Moving… / 移動中…";
    try {
      const res = await fetch("/v1/db/storage-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_path: newPath }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        dataStorageRelocateStatusEl.textContent = `Moved. New path: ${body.new_path} / 移動しました。新しい保存先: ${body.new_path}`;
        refreshDataStorageInfo();
      } else {
        dataStorageRelocateStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      dataStorageRelocateStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

async function runRsyncBackup() {
  const destination = (dataStorageRsyncDestEl?.value || "").trim();
  if (!destination) {
    dataStorageBackupStatusEl.textContent = "Please enter a backup destination. / バックアップ先を入力してください。";
    return null;
  }
  const res = await fetch("/v1/db/rsync-backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination }),
  });
  return res.json();
}

if (dataStorageBackupBtn) {
  dataStorageBackupBtn.addEventListener("click", async () => {
    dataStorageBackupStatusEl.textContent = "Backing up… / バックアップ中…";
    dataStorageInstallRsyncBtn.classList.add("hidden");
    try {
      const body = await runRsyncBackup();
      if (!body) return;
      if (body.ok) {
        dataStorageBackupStatusEl.textContent = `Backup complete: ${body.detail} / バックアップ完了: ${body.detail}`;
      } else if (body.rsync_missing) {
        dataStorageBackupStatusEl.textContent = `${body.message_en} / ${body.message_ja}`;
        dataStorageInstallRsyncBtn.classList.remove("hidden");
      } else {
        dataStorageBackupStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      dataStorageBackupStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

if (dataStorageInstallRsyncBtn) {
  dataStorageInstallRsyncBtn.addEventListener("click", async () => {
    dataStorageBackupStatusEl.textContent = "Installing RSync… / RSyncをインストール中…";
    const destination = (dataStorageRsyncDestEl?.value || "").trim();
    try {
      const res = await fetch("/v1/db/install-rsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(destination ? { retry_destination: destination } : {}),
      });
      const body = await res.json();
      if (body.ok) {
        let msg = `${body.detail}`;
        if (body.backup_ran) msg += ` | Backup also ran: ${body.backup_detail} / バックアップも実行しました: ${body.backup_detail}`;
        dataStorageBackupStatusEl.textContent = msg;
        dataStorageInstallRsyncBtn.classList.add("hidden");
      } else {
        dataStorageBackupStatusEl.textContent = `${body.message_en || body.error} / ${body.message_ja || ""}`;
      }
    } catch (e) {
      dataStorageBackupStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

// 会話履歴DB + aruaru-db/PostgreSQLの同時rsyncバックアップ(ユーザー
// 指示「RSyncで、open-englishのaruaru-dbとpostgresqlを他のデバイスに
// バックアップ同時を可能に、その設定方法も簡単にして」への対応、
// 2026-08-19新設)。宛先を1箇所入力するだけで両方バックアップされる
// (`/v1/db/rsync-backup-all`、既存の`/v1/db/rsync-backup`とは別
// エンドポイント)。
const dataStorageRsyncDestAllEl = document.getElementById("data-storage-rsync-dest-all");
const dataStorageBackupAllBtn = document.getElementById("data-storage-backup-all-btn");
const dataStorageBackupAllStatusEl = document.getElementById("data-storage-backup-all-status");

if (dataStorageBackupAllBtn) {
  dataStorageBackupAllBtn.addEventListener("click", async () => {
    const destination = (dataStorageRsyncDestAllEl?.value || "").trim();
    if (!destination) {
      dataStorageBackupAllStatusEl.textContent = "Please enter a backup destination. / バックアップ先を入力してください。";
      return;
    }
    dataStorageBackupAllStatusEl.textContent = "Backing up both… / 両方バックアップ中…";
    try {
      const res = await fetch("/v1/db/rsync-backup-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const body = await res.json();
      const sqlite = body.sqlite_backup || {};
      const pg = body.postgres_backup;
      let sqliteMsg;
      if (sqlite.ok) {
        sqliteMsg = `Conversation DB: OK (${sqlite.detail}) / 会話DB: 成功(${sqlite.detail})`;
      } else if (sqlite.rsync_missing) {
        sqliteMsg = `Conversation DB: ${sqlite.message_en} / 会話DB: ${sqlite.message_ja}`;
      } else {
        sqliteMsg = `Conversation DB: failed (${sqlite.error || "unknown"}) / 会話DB: 失敗(${sqlite.error || "不明"})`;
      }
      let pgMsg;
      if (pg === null || pg === undefined) {
        pgMsg = "aruaru-db/PostgreSQL: not configured (OPEN_ENGLISH_DATABASE_URL not set), skipped / aruaru-db/PostgreSQL: 未設定のためスキップしました";
      } else if (pg.ok) {
        pgMsg = `aruaru-db/PostgreSQL: OK (${pg.detail}) / aruaru-db/PostgreSQL: 成功(${pg.detail})`;
      } else if (pg.rsync_or_pg_dump_missing) {
        pgMsg = `aruaru-db/PostgreSQL: ${pg.message_en} / aruaru-db/PostgreSQL: ${pg.message_ja}`;
      } else {
        pgMsg = `aruaru-db/PostgreSQL: failed (${pg.error || "unknown"}) / aruaru-db/PostgreSQL: 失敗(${pg.error || "不明"})`;
      }
      dataStorageBackupAllStatusEl.textContent = `${sqliteMsg}\n${pgMsg}`;
    } catch (e) {
      dataStorageBackupAllStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

// アップデート・ロールバックパネル(ユーザー指示「バージョンアップしたら
// BUGだった場合の為に、簡単にそのBUGのリポジトリだけダウングレード出来る
// ように」への対応、2026-08-20新設)。`GET /v1/updates/history`・
// `POST /v1/updates/downgrade`へ接続する。誇張しないUI: 保持している
// 世代(既定3世代)にしか戻せない旨をボタン一覧の説明文でも明記する。
const updatesHistoryRefreshBtn = document.getElementById("updates-history-refresh");
const updatesHistoryListEl = document.getElementById("updates-history-list");
const updatesDowngradeStatusEl = document.getElementById("updates-downgrade-status");

async function requestDowngrade(component, version) {
  if (!updatesDowngradeStatusEl) return;
  const confirmed = window.confirm(
    `Roll back "${component}" to ${version}? / 「${component}」を${version}へ戻しますか？`
  );
  if (!confirmed) return;
  updatesDowngradeStatusEl.textContent = `Rolling back ${component} to ${version}… / ${component}を${version}へ戻しています…`;
  try {
    const res = await fetch("/v1/updates/downgrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component, version }),
    });
    // 正直な開示: componentが"self"の場合、成功するとサーバー自身が
    // 再起動のため接続が切れ、このfetch自体が失敗することがある
    // (index.htmlの.setup-honest注記参照)——それ自体は想定内の挙動。
    const body = await res.json().catch(() => null);
    if (body && body.ok) {
      updatesDowngradeStatusEl.textContent = `Done: ${component} is now ${version}. / 完了: ${component}は${version}になりました。`;
      refreshUpdatesHistory();
    } else if (body) {
      updatesDowngradeStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
    } else {
      updatesDowngradeStatusEl.textContent =
        `Request sent — if this was the app itself, it may be restarting now (reconnect in a few seconds). / ` +
        `リクエストを送信しました——アプリ本体の場合、再起動中の可能性があります(数秒後に再接続してください)。`;
    }
  } catch (e) {
    updatesDowngradeStatusEl.textContent =
      `No response (this can happen if the app itself is restarting): ${e.message} / ` +
      `応答がありません(アプリ本体が再起動中の場合に起こり得ます): ${e.message}`;
  }
}

async function refreshUpdatesHistory() {
  if (!updatesHistoryListEl) return;
  updatesHistoryListEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/updates/history");
    const body = await res.json();
    const components = body.components || [];
    updatesHistoryListEl.innerHTML = "";
    for (const c of components) {
      const row = document.createElement("div");
      row.className = "update-history-row";
      const label = document.createElement("span");
      label.textContent = `${c.component}: ${c.current_version}`;
      row.appendChild(label);
      if (!c.available_downgrades || c.available_downgrades.length === 0) {
        const none = document.createElement("span");
        none.textContent = " (no retained backups yet / まだ保持中のバックアップはありません)";
        row.appendChild(none);
      } else {
        for (const v of c.available_downgrades) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "setup-btn";
          btn.textContent = `⬅ ${v}`;
          // componentはJSON由来のプレーンテキストなのでclosureで直接渡す
          // (innerHTML文字列組み立てを避け、XSSリスクを回避する既存方針)。
          btn.addEventListener("click", () => requestDowngrade(c.component, v));
          row.appendChild(btn);
        }
      }
      updatesHistoryListEl.appendChild(row);
    }
  } catch (e) {
    updatesHistoryListEl.textContent = `Failed to load update history: ${e.message} / アップデート履歴の取得に失敗しました: ${e.message}`;
  }
}

if (updatesHistoryRefreshBtn) updatesHistoryRefreshBtn.addEventListener("click", refreshUpdatesHistory);
// 保存先パネルを開いたタイミングで併せて読み込む(既存のrefreshDataStorageInfoと同様)。
if (dataStorageBtn && dataStorageModal) {
  dataStorageBtn.addEventListener("click", () => refreshUpdatesHistory());
}

// Google Search設定パネル(ユーザー指示「利用者がAPIキーの取得とCOPY
// ペーストが簡単な機能を搭載して」への対応)。値はaruaru-llmの
// `POST /v1/settings/google-search`(メモリ上保持のみ、ディスクへ保存
// しない)へ送るだけで、このフロントエンド自身もlocalStorage等へ
// 保存しない(ページを再読み込みすれば入力欄は空になる、意図的な設計
// ——ブラウザ内にAPIキーを永続化しない)。
const googleSearchBtn = document.getElementById("google-search-settings-btn");
const googleSearchModal = document.getElementById("google-search-modal");
const googleSearchClose = document.getElementById("google-search-close");
const googleSearchApiKeyEl = document.getElementById("google-search-api-key");
const googleSearchCxEl = document.getElementById("google-search-cx");
const googleSearchSaveBtn = document.getElementById("google-search-save");
const googleSearchClearBtn = document.getElementById("google-search-clear");
const googleSearchStatusEl = document.getElementById("google-search-status");

// 2026-08-25変更(ユーザー指示「ブラウザ版は各自Google検索のAPIキーとIDを
// 各自で設定してもらう様に…開発者が設定したAPIキーとIDは、アクセス者は
// 使わない、消費しない様に」への対応): 従来は`POST /v1/settings/
// google-search`でaruaru-llmプロセス全体が共有するグローバル設定を
// 書き換えていたが、これは複数の訪問者が同じaruaru-llmインスタンス
// (例: VPS上の共有デプロイ)へアクセスする場合、**ある訪問者が自分の
// キーを設定すると他の全訪問者の検索もそのキーへ切り替わってしまう**
// (意図しない共有・消費)という設計上の欠陥があった。
// 修正後は、各自のキー/cxを**このブラウザのlocalStorageにのみ**保存し、
// リクエストのたびに`google_search_api_key`/`google_search_cx`として
// 本文に含めて送る(`aruaru-llm`側`main.rs`の`generate_with_search`が
// 2026-08-25新設、リクエストに同梱されたキーがあればグローバル設定
// には一切触れずそのリクエスト限りで使う設計)。開発者がこのサーバーに
// 別途キーを設定していても、ここで自分のキーを入力した訪問者の
// リクエストはそのグローバルなキーを使わない・消費しない。
const GOOGLE_SEARCH_LOCAL_KEY = "open-english.googleSearchApiKey";
const GOOGLE_SEARCH_LOCAL_CX = "open-english.googleSearchCx";
const GOOGLE_SEARCH_ENCRYPTED_LOCAL_KEY = "open-english.googleSearchCredsEncrypted";

// 2026-08-27追加: ①ローカルファイル読込・②パスフレーズ復号のいずれかで
// 得られた資格情報を、この変数にのみ保持する(localStorageへは書かない、
// タブを閉じる/リロードで消える)。freelance GitHubトークンと同じ設計。
let googleSearchUnlockedCreds = null;

// 呼び出し元(チャット送信時など)は同期的にこの関数を呼ぶ前提のため、
// ①②はここでは「既に読込/復号済みのメモリ上の値」しか返せない
// (ファイル選択・パスフレーズ入力はユーザー操作を要するため非同期)。
// モーダルを開いて①②を選んだままファイル選択/復号をしていない場合は
// nullを返す(黙って③の古い値にフォールバックしない、正直な挙動)。
// vault.html内でGoogle検索を実行させ、結果(タイトル・スニペット・URL、
// APIキーは含まない)をpostMessageで受け取る(2026-08-27追加、GitHubの
// freelanceRequestVaultGithubPushと同じパターン)。
function googleSearchRequestVault(query, maxResults) {
  return new Promise((resolve, reject) => {
    const iframe = document.getElementById("google-search-vault-iframe");
    const origin = window.googleSearchVaultOrigin;
    if (!iframe || !iframe.contentWindow || !origin) {
      reject(new Error("Vaultが読み込まれていません。先に読み込んでください。 / Vault is not loaded yet — load it first."));
      return;
    }
    const requestId = `${Date.now()}-${Math.random()}`;
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Vaultからの応答がタイムアウトしました。 / Timed out waiting for a response from the vault."));
    }, 30000);
    function onMessage(event) {
      if (event.origin !== origin) return;
      const data = event.data || {};
      if (data.type !== "vault:googleSearchResult" || data.requestId !== requestId) return;
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      if (data.ok) resolve(data.results);
      else reject(new Error(data.error || "unknown vault error"));
    }
    window.addEventListener("message", onMessage);
    iframe.contentWindow.postMessage({ type: "vault:googleSearch", requestId, query, maxResults }, origin);
  });
}

function loadOwnGoogleSearchCredentials() {
  const mode = document.getElementById("google-search-key-mode")?.value || "plain";
  if (mode === "file" || mode === "encrypted") {
    return googleSearchUnlockedCreds;
  }
  // 2026-08-27バグ修正: ④vaultモードでは、キーの復号・使用はvault.html
  // 内だけで完結させる設計のため、ここでは絶対に何も返してはならない。
  // 修正前はここが③(plain)と同じlocalStorageチェックへフォールスルー
  // しており、以前③モードで保存した平文キーが残っていた場合、vault
  // モードを選んでいてもその平文キーが本体ページのJSメモリ
  // (`ownGoogleSearchCreds`)へ読み込まれてしまっていた——実際の検索
  // 処理はvault経由に切り替わるため実害は無かったが、「vaultモードでは
  // 本体ページに一切キーを渡さない」という設計原則に反する不要な露出
  // だった。GitHubトークン側の同種のテスト
  // (`mode_switch_no_leak`)で確認した設計と揃える。
  if (mode === "vault") {
    return null;
  }
  try {
    const api_key = localStorage.getItem(GOOGLE_SEARCH_LOCAL_KEY) || "";
    const cx = localStorage.getItem(GOOGLE_SEARCH_LOCAL_CX) || "";
    return api_key && cx ? { api_key, cx } : null;
  } catch (e) {
    return null;
  }
}

// 2026-08-27追加(ユーザー指示「Google検索もGitHubトークンと同じく
// ブラウザから直接呼ぶ方式にして」への対応): Google Custom Search
// JSON APIを`aruaru-llm`を経由せずブラウザから直接呼ぶ。
// `www.googleapis.com`が任意のOriginへ`Access-Control-Allow-Origin`を
// 返すことをcurlで実機確認済み(2026-08-27)——CORS対応済みのため
// この方式が成立する(OpenAI/Gemini/DeepSeekは同じ方式が使えないことを
// 既にCLAUDE.mdへ記録済み、Google Custom Searchは対象が異なるため
// 別途確認が必要だった)。
async function googleSearchDirect(query, apiKey, cx, maxResults) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${Math.min(Math.max(maxResults || 3, 1), 10)}`;
  const res = await fetch(url);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ? ` — ${body.error.message}` : "";
    } catch { /* ignore */ }
    throw new Error(`Google Custom Search API returned HTTP ${res.status}${detail}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item) => ({
    title: item.title || "",
    snippet: item.snippet || "",
    link: item.link || "",
  }));
}

// `aruaru-llm::web_search::format_results_as_context`と同一の書式
// (番号付き箇条書き)。GPT-2のQ&Aパターン補完に乗せやすくする狙いは
// Rust側と同じ(`aruaru-llm/CLAUDE.md`2026-08-26エントリ参照)。
function formatSearchResultsAsContext(results) {
  return results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join("\n");
}

// `aruaru-llm::web_search::build_search_augmented_prompt`と同一の
// QA形式プロンプト。サーバー側のロジックと完全に同じ書式にすることで、
// 「aruaru-llmにキーを渡さないよう変更した」以外の挙動差分を生まない
// ようにしている(誠実さのため——検索結果活用の改善効果自体は変えない)。
function buildSearchAugmentedPromptClient(context, question) {
  return `Use the search results below to answer the question as accurately as possible. ` +
    `If the search results don't contain the answer, say so honestly.\n\n` +
    `Search results:\n${context}\n\n` +
    `Question: ${question}\n` +
    `Answer:`;
}

// 2026-08-26追加(ユーザー指示「Google検索APIキーも簡単に手元の端末で
// 設定したものを、利用出来るようにして」への対応): ブラウザの
// localStorageにキーを入力しなくても、閲覧者自身の端末で動いている
// aruaru-llm(このページのapiBaseEl、上記autoDetectAruaruLlmBase参照)
// 側で既に環境変数(`ARUARU_LLM_GOOGLE_SEARCH_API_KEY`/`_CX`)や
// `POST /v1/settings/google-search`で検索が設定済みなら、それをそのまま
// 使う——ブラウザ版でも二重に入力させない。判定は`GET /v1/settings/
// google-search`(aruaru-llm側の既存ステータスAPI)を閲覧者自身の端末へ
// 問い合わせるだけで、キーの値自体はこの経路には一切現れない。
async function isSearchConfiguredOnOwnDevice() {
  try {
    const base = apiBaseEl ? apiBaseEl.value.trim() : "";
    if (!base) return false;
    const res = await fetchWithTimeout(`${base}/v1/settings/google-search`, { cache: "no-store" }, 2000);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.configured;
  } catch (e) {
    return false;
  }
}

async function refreshGoogleSearchStatus() {
  // 2026-08-27バグ修正: ④vaultモードの場合、キーはvault.html内にのみ
  // 存在し`loadOwnGoogleSearchCredentials()`は(正しく)nullを返すため、
  // それをそのまま「未設定」扱いすると誤解を招く(vault内では設定・
  // 復号済みでも、この本体側の文言が「未設定」のままになるバグだった)。
  // vaultモードの実際の状態は`#google-search-vault-status`側で個別に
  // 表示しているため、ここでは「vault側を確認してください」という
  // 案内に留める。
  const mode = document.getElementById("google-search-key-mode")?.value || "plain";
  if (mode === "vault") {
    if (googleSearchStatusEl) {
      googleSearchStatusEl.textContent =
        "ℹ️ vaultモードを使用中です。状態は下のvault欄をご確認ください。 / Using vault mode — check the vault status below.";
    }
    const inlineEl = document.getElementById("web-search-own-key-status");
    if (inlineEl) inlineEl.textContent = "🔒 vault mode / vaultモード使用中";
    return;
  }
  const creds = loadOwnGoogleSearchCredentials();
  const configuredOnDevice = !creds && (await isSearchConfiguredOnOwnDevice());
  if (googleSearchStatusEl) {
    if (creds) {
      googleSearchStatusEl.textContent = "✅ Your own key is saved in this browser / このブラウザにご自身のキーが保存されています";
    } else if (configuredOnDevice) {
      googleSearchStatusEl.textContent =
        "✅ Already configured on your own aruaru-llm (localhost:4600) — no need to enter it here too / " +
        "お使いの端末のaruaru-llm(localhost:4600)側で既に設定済みです——ここへ改めて入力する必要はありません";
    } else {
      googleSearchStatusEl.textContent = "⚪ Not set yet — search will not run for you / まだ設定されていません(検索は行われません)";
    }
  }
  // トグル横にも簡潔なステータスを表示する(ユーザー指示「Google検索の
  // APIキーも利用者の方が設定して御利用になる前提だと明記してその設定も
  // 簡単になるようにして」への対応——モーダルを開かなくても一目で
  // 「自分のキーが必要/既に設定済み」が分かるようにする)。
  const inlineEl = document.getElementById("web-search-own-key-status");
  if (inlineEl) {
    inlineEl.textContent = creds || configuredOnDevice
      ? "✅ your key set / ご自身のキー設定済み"
      : "⚠ set your own key to use search / 検索にはご自身のキー設定が必要";
  }
}
// 起動時にも一度反映しておく(トグルを押す前から状態が見える)。少し
// 遅らせて呼ぶ(apiBaseEl.valueがautoDetectAruaruLlmBaseで確定して
// からの方が、閲覧者自身の端末に対して正しく問い合わせできるため)。
setTimeout(refreshGoogleSearchStatus, 500);

if (googleSearchBtn && googleSearchModal) {
  googleSearchBtn.addEventListener("click", () => {
    googleSearchModal.classList.remove("hidden");
    refreshGoogleSearchStatus();
  });
  googleSearchClose.addEventListener("click", () => googleSearchModal.classList.add("hidden"));
  googleSearchModal.addEventListener("click", (e) => {
    if (e.target === googleSearchModal) googleSearchModal.classList.add("hidden");
  });
  googleSearchSaveBtn.addEventListener("click", () => {
    const api_key = googleSearchApiKeyEl.value.trim();
    const cx = googleSearchCxEl.value.trim();
    try {
      if (api_key && cx) {
        localStorage.setItem(GOOGLE_SEARCH_LOCAL_KEY, api_key);
        localStorage.setItem(GOOGLE_SEARCH_LOCAL_CX, cx);
        googleSearchStatusEl.textContent = "✅ Saved in this browser only / このブラウザにのみ保存しました";
      } else {
        googleSearchStatusEl.textContent = "⚠ Both fields are required / 両方の欄を入力してください";
      }
      googleSearchApiKeyEl.value = "";
      googleSearchCxEl.value = "";
    } catch (err) {
      googleSearchStatusEl.textContent = `⚠ Failed to save / 保存に失敗しました: ${err.message}`;
    }
  });
  googleSearchClearBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(GOOGLE_SEARCH_LOCAL_KEY);
      localStorage.removeItem(GOOGLE_SEARCH_LOCAL_CX);
      googleSearchStatusEl.textContent = "🗑 Cleared from this browser / このブラウザから消去しました";
    } catch (err) {
      googleSearchStatusEl.textContent = `⚠ Failed to clear / 消去に失敗しました: ${err.message}`;
    }
  });

  // --- 2026-08-27追加: ①ファイル/②暗号化モードの切り替えと処理 ---
  const googleSearchKeyModeEl = document.getElementById("google-search-key-mode");
  const googleSearchPlainSectionEl = document.getElementById("google-search-plain-section");
  const googleSearchFileSectionEl = document.getElementById("google-search-file-section");
  const googleSearchEncryptedSectionEl = document.getElementById("google-search-encrypted-section");
  const googleSearchFileBtn = document.getElementById("google-search-file-btn");
  const googleSearchPassphraseEl = document.getElementById("google-search-passphrase");
  const googleSearchApiKeyEncEl = document.getElementById("google-search-api-key-enc");
  const googleSearchCxEncEl = document.getElementById("google-search-cx-enc");
  const googleSearchSaveEncryptedBtn = document.getElementById("google-search-save-encrypted");
  const googleSearchUnlockEncryptedBtn = document.getElementById("google-search-unlock-encrypted");
  const googleSearchClearEncryptedBtn = document.getElementById("google-search-clear-encrypted");

  const googleSearchVaultSectionEl = document.getElementById("google-search-vault-section");
  const googleSearchVaultUrlEl = document.getElementById("google-search-vault-url");
  const googleSearchVaultLoadBtn = document.getElementById("google-search-vault-load-btn");
  const googleSearchVaultStatusEl = document.getElementById("google-search-vault-status");
  const googleSearchVaultIframeEl = document.getElementById("google-search-vault-iframe");

  function updateGoogleSearchModeSections() {
    const mode = googleSearchKeyModeEl?.value || "plain";
    googleSearchPlainSectionEl?.classList.toggle("hidden", mode !== "plain");
    googleSearchFileSectionEl?.classList.toggle("hidden", mode !== "file");
    googleSearchEncryptedSectionEl?.classList.toggle("hidden", mode !== "encrypted");
    googleSearchVaultSectionEl?.classList.toggle("hidden", mode !== "vault");
    refreshGoogleSearchStatus();
  }
  if (googleSearchKeyModeEl) {
    googleSearchKeyModeEl.addEventListener("change", updateGoogleSearchModeSections);
    updateGoogleSearchModeSections();
  }

  if (googleSearchVaultLoadBtn) {
    googleSearchVaultLoadBtn.addEventListener("click", () => {
      const url = (googleSearchVaultUrlEl?.value || "").trim();
      if (!url) {
        if (googleSearchVaultStatusEl) googleSearchVaultStatusEl.textContent = "⚠ vault.htmlのURLを入力してください / Please enter the vault.html URL";
        return;
      }
      let vaultUrlObj;
      try {
        vaultUrlObj = new URL(url);
      } catch {
        if (googleSearchVaultStatusEl) googleSearchVaultStatusEl.textContent = "⚠ 無効なURLです / Invalid URL";
        return;
      }
      window.googleSearchVaultOrigin = vaultUrlObj.origin;
      vaultUrlObj.searchParams.set("parentOrigin", window.location.origin);
      if (googleSearchVaultIframeEl) {
        googleSearchVaultIframeEl.src = vaultUrlObj.toString();
        googleSearchVaultIframeEl.classList.remove("hidden");
      }
      if (googleSearchVaultStatusEl) {
        const sameOrigin = window.googleSearchVaultOrigin === window.location.origin;
        googleSearchVaultStatusEl.textContent = sameOrigin
          ? "⚠ 読み込みました(同一オリジンのため分離効果はありません) / Loaded (same-origin, no isolation benefit)"
          : "✅ 読み込みました(別オリジン) / Loaded (cross-origin)";
      }
    });
  }

  if (googleSearchFileBtn) {
    googleSearchFileBtn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          if (!parsed.api_key || !parsed.cx) {
            throw new Error('JSON must contain "api_key" and "cx" / JSONに"api_key"と"cx"が必要です');
          }
          googleSearchUnlockedCreds = { api_key: parsed.api_key, cx: parsed.cx };
          refreshGoogleSearchStatus();
        } catch (err) {
          if (googleSearchStatusEl) {
            googleSearchStatusEl.textContent = `⚠ Failed to read file / ファイルの読み込みに失敗しました: ${err.message || err}`;
          }
        }
      });
      input.click();
    });
  }

  if (googleSearchSaveEncryptedBtn) {
    googleSearchSaveEncryptedBtn.addEventListener("click", async () => {
      const api_key = googleSearchApiKeyEncEl?.value.trim();
      const cx = googleSearchCxEncEl?.value.trim();
      const passphrase = googleSearchPassphraseEl?.value || "";
      if (!api_key || !cx || !passphrase) {
        if (googleSearchStatusEl) {
          googleSearchStatusEl.textContent =
            "⚠ API Key・cx・パスフレーズをすべて入力してください / Please enter the API key, cx, and passphrase";
        }
        return;
      }
      try {
        const payload = await owEncryptSecret(JSON.stringify({ api_key, cx }), passphrase);
        localStorage.setItem(GOOGLE_SEARCH_ENCRYPTED_LOCAL_KEY, payload);
        googleSearchUnlockedCreds = { api_key, cx };
        if (googleSearchApiKeyEncEl) googleSearchApiKeyEncEl.value = "";
        if (googleSearchCxEncEl) googleSearchCxEncEl.value = "";
        if (googleSearchPassphraseEl) googleSearchPassphraseEl.value = "";
        refreshGoogleSearchStatus();
      } catch (err) {
        if (googleSearchStatusEl) googleSearchStatusEl.textContent = `⚠ Encryption failed / 暗号化に失敗しました: ${err}`;
      }
    });
  }
  if (googleSearchUnlockEncryptedBtn) {
    googleSearchUnlockEncryptedBtn.addEventListener("click", async () => {
      const passphrase = googleSearchPassphraseEl?.value || "";
      let payload;
      try {
        payload = localStorage.getItem(GOOGLE_SEARCH_ENCRYPTED_LOCAL_KEY);
      } catch {
        payload = null;
      }
      if (!payload) {
        if (googleSearchStatusEl) googleSearchStatusEl.textContent = "⚠ No encrypted key saved yet / 暗号化済みキーがありません";
        return;
      }
      if (!passphrase) {
        if (googleSearchStatusEl) googleSearchStatusEl.textContent = "⚠ Please enter your passphrase / パスフレーズを入力してください";
        return;
      }
      try {
        const decoded = JSON.parse(await owDecryptSecret(payload, passphrase));
        googleSearchUnlockedCreds = decoded;
        if (googleSearchPassphraseEl) googleSearchPassphraseEl.value = "";
        refreshGoogleSearchStatus();
      } catch (err) {
        googleSearchUnlockedCreds = null;
        if (googleSearchStatusEl) {
          googleSearchStatusEl.textContent = "⚠ Decryption failed (wrong passphrase?) / 復号に失敗しました(パスフレーズが違う可能性があります)";
        }
      }
    });
  }
  if (googleSearchClearEncryptedBtn) {
    googleSearchClearEncryptedBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem(GOOGLE_SEARCH_ENCRYPTED_LOCAL_KEY);
      } catch { /* ignore */ }
      googleSearchUnlockedCreds = null;
      refreshGoogleSearchStatus();
    });
  }
}

// AIプロバイダの優先順位パネル(2026-08-26新設、ユーザー指示「Google、
// ChatGPT/DeepSeek/Gemini/Claudeは、無料枠を優先で使い切り順番に使用、に
// チェックを付けられる様にして。Googleなどは、順番を入力したり、数字の
// ラジオボタンを押すかのどちらかで優先の順番を変更可能にして」への対応)。
// APIキーはこのブラウザのlocalStorageにのみ保存し(Google Search設定と
// 同じ方針)、保存操作のたびにaruaru-llm側の実行時設定
// (`/v1/settings/chat-providers`・`/v1/settings/provider-priority`、
// いずれもメモリ上保持のみ)へ送信する。
(() => {
  const PROVIDER_PRIORITY_SERVICES = [
    { id: "googlesearch", label: "Google Search / Google検索" },
    { id: "openai", label: "ChatGPT (OpenAI)" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "gemini", label: "Gemini" },
    { id: "claude", label: "Claude (Anthropic)" },
  ];
  const PROVIDER_KEY_LOCAL_PREFIX = "open-english.providerKey.";
  const PROVIDER_PRIORITY_ORDER_KEY = "open-english.providerPriorityOrder";
  const PROVIDER_PRIORITY_ENABLED_KEY = "open-english.providerPriorityEnabled";
  const PROVIDER_PRIORITY_USE_GOOGLE_KEY = "open-english.providerPriorityUseGoogle";
  const PROVIDER_PRIORITY_USE_GITHUB_KEY = "open-english.providerPriorityUseGithub";
  const PROVIDER_PRIORITY_USE_YOUTUBE_KEY = "open-english.providerPriorityUseYoutube";
  const GITHUB_TOKEN_LOCAL_KEY = "open-english.githubToken";
  const YOUTUBE_API_KEY_LOCAL_KEY = "open-english.youtubeApiKey";

  let priorityOrder = PROVIDER_PRIORITY_SERVICES.map((s) => s.id);
  try {
    const saved = JSON.parse(localStorage.getItem(PROVIDER_PRIORITY_ORDER_KEY) || "null");
    if (Array.isArray(saved) && saved.length === priorityOrder.length && saved.every((id) => priorityOrder.includes(id))) {
      priorityOrder = saved;
    }
  } catch (e) {
    /* fall back to default order */
  }

  const btn = document.getElementById("provider-priority-settings-btn");
  const modal = document.getElementById("provider-priority-modal");
  const closeBtn = document.getElementById("provider-priority-close");
  const enabledEl = document.getElementById("provider-priority-enabled");
  const listEl = document.getElementById("provider-priority-list");
  const saveBtn = document.getElementById("provider-priority-save");
  const clearBtn = document.getElementById("provider-priority-clear");
  const statusEl = document.getElementById("provider-priority-status");
  const useGoogleEl = document.getElementById("provider-priority-use-google");
  const useGithubEl = document.getElementById("provider-priority-use-github");
  const githubTokenEl = document.getElementById("provider-priority-github-token");
  const useYoutubeEl = document.getElementById("provider-priority-use-youtube");
  const youtubeKeyEl = document.getElementById("provider-priority-youtube-key");
  if (!btn || !modal || !listEl) return;

  try {
    enabledEl.checked = localStorage.getItem(PROVIDER_PRIORITY_ENABLED_KEY) === "1";
    if (useGoogleEl) useGoogleEl.checked = localStorage.getItem(PROVIDER_PRIORITY_USE_GOOGLE_KEY) === "1";
    if (useGithubEl) useGithubEl.checked = localStorage.getItem(PROVIDER_PRIORITY_USE_GITHUB_KEY) === "1";
    if (useYoutubeEl) useYoutubeEl.checked = localStorage.getItem(PROVIDER_PRIORITY_USE_YOUTUBE_KEY) === "1";
  } catch (e) {
    /* ignore */
  }

  // 番号入力欄・ラジオボタンいずれで指定しても同じ`setPosition`を通す
  // (既存の言語表示順3系統連動指定〈`setLanguageOrderPosition`〉と同じ
  // 「重複は入れ替えで解決する」設計)。
  function setPosition(serviceId, pos) {
    pos = Math.max(1, Math.min(priorityOrder.length, Math.round(pos)));
    const currentIndex = priorityOrder.indexOf(serviceId);
    const targetIndex = pos - 1;
    if (currentIndex === -1 || currentIndex === targetIndex) return;
    const other = priorityOrder[targetIndex];
    priorityOrder[targetIndex] = serviceId;
    priorityOrder[currentIndex] = other;
    try {
      localStorage.setItem(PROVIDER_PRIORITY_ORDER_KEY, JSON.stringify(priorityOrder));
    } catch (e) {
      /* ignore storage failures */
    }
    renderList();
  }

  function renderList() {
    listEl.textContent = "";
    priorityOrder.forEach((serviceId, idx) => {
      const svc = PROVIDER_PRIORITY_SERVICES.find((s) => s.id === serviceId);
      if (!svc) return;
      const row = document.createElement("div");
      row.className = "settings-field";

      const label = document.createElement("span");
      label.textContent = `${svc.label}: `;
      row.appendChild(label);

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.min = "1";
      numberInput.max = String(priorityOrder.length);
      numberInput.value = String(idx + 1);
      numberInput.style.width = "3.5em";
      numberInput.addEventListener("change", () => setPosition(serviceId, Number(numberInput.value)));
      row.appendChild(numberInput);

      for (let pos = 1; pos <= priorityOrder.length; pos++) {
        const radioLabel = document.createElement("label");
        radioLabel.style.marginLeft = "0.4em";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `provider-priority-radio-${serviceId}`;
        radio.checked = idx + 1 === pos;
        radio.addEventListener("change", () => setPosition(serviceId, pos));
        radioLabel.appendChild(radio);
        radioLabel.appendChild(document.createTextNode(String(pos)));
        row.appendChild(radioLabel);
      }

      listEl.appendChild(row);
    });
  }
  renderList();

  // パネルを開くたびaruaru-llm側の実際の現状(有効/無効・順序・設定済み
  // プロバイダ)を取得して表示する(2026-08-26追記、実機TEST中に発見した
  // 使いやすさの粗——従来は保存操作をするまでサーバー側の実状態が
  // 画面に一切反映されず、環境変数等で既に設定済みの場合でも「未設定」
  // に見えていた)。取得に失敗しても画面はローカルの既定値のまま動作を
  // 継続する(既存のGoogle Search設定パネルと同じ可用性優先の設計)。
  async function refreshProviderPriorityStatus() {
    const base = apiBaseEl ? apiBaseEl.value.trim() : "";
    if (!base) return;
    try {
      const [priorityRes, keysRes] = await Promise.all([
        fetchWithTimeout(`${base}/v1/settings/provider-priority`, { cache: "no-store" }, 4000),
        fetchWithTimeout(`${base}/v1/settings/chat-providers`, { cache: "no-store" }, 4000),
      ]);
      if (priorityRes.ok) {
        const data = await priorityRes.json();
        if (Array.isArray(data.order) && data.order.length === priorityOrder.length) {
          priorityOrder = data.order;
          renderList();
        }
        enabledEl.checked = !!data.enabled;
      }
      if (keysRes.ok) {
        const data = await keysRes.json();
        const configured = Array.isArray(data.configured_providers) ? data.configured_providers : [];
        statusEl.textContent = configured.length
          ? `✅ Already configured on aruaru-llm / 設定済み: ${configured.join(", ")}`
          : "⚪ No chat provider API keys configured yet on aruaru-llm / まだAPIキーは設定されていません";
      }
    } catch (e) {
      /* best-effort only, keep local defaults on failure */
    }
  }

  if (btn && modal) {
    btn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      refreshProviderPriorityStatus();
    });
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }

  async function saveToAruaruLlm() {
    const base = apiBaseEl ? apiBaseEl.value.trim() : "";
    if (!base) {
      statusEl.textContent = "⚠ aruaru-llm base URL is not set / aruaru-llmの接続先が未設定です";
      return;
    }
    const enabled = !!enabledEl.checked;
    try {
      localStorage.setItem(PROVIDER_PRIORITY_ENABLED_KEY, enabled ? "1" : "0");
      localStorage.setItem(PROVIDER_PRIORITY_USE_GOOGLE_KEY, useGoogleEl && useGoogleEl.checked ? "1" : "0");
      localStorage.setItem(PROVIDER_PRIORITY_USE_GITHUB_KEY, useGithubEl && useGithubEl.checked ? "1" : "0");
      localStorage.setItem(PROVIDER_PRIORITY_USE_YOUTUBE_KEY, useYoutubeEl && useYoutubeEl.checked ? "1" : "0");
      if (githubTokenEl && githubTokenEl.value.trim()) localStorage.setItem(GITHUB_TOKEN_LOCAL_KEY, githubTokenEl.value.trim());
      if (youtubeKeyEl && youtubeKeyEl.value.trim()) localStorage.setItem(YOUTUBE_API_KEY_LOCAL_KEY, youtubeKeyEl.value.trim());
    } catch (e) {
      /* ignore */
    }

    const results = [];
    try {
      const res = await fetchWithTimeout(
        `${base}/v1/settings/provider-priority`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled, order: priorityOrder }) },
        8000
      );
      results.push(res.ok ? "priority: ok" : `priority: HTTP ${res.status}`);
    } catch (err) {
      results.push(`priority: failed (${err.message})`);
    }

    const keyFields = [
      ["openai", "provider-key-openai"],
      ["deepseek", "provider-key-deepseek"],
      ["gemini", "provider-key-gemini"],
      ["claude", "provider-key-claude"],
    ];
    const savedValues = {};
    for (const [provider, elId] of keyFields) {
      const el = document.getElementById(elId);
      const value = el ? el.value.trim() : "";
      if (!value) continue;
      savedValues[provider] = value;
      try {
        localStorage.setItem(PROVIDER_KEY_LOCAL_PREFIX + provider, value);
      } catch (e) {
        /* ignore */
      }
      try {
        const res = await fetchWithTimeout(
          `${base}/v1/settings/chat-providers`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, api_key: value }) },
          8000
        );
        results.push(res.ok ? `${provider}: ok` : `${provider}: HTTP ${res.status}`);
      } catch (err) {
        results.push(`${provider}: failed (${err.message})`);
      }
      el.value = "";
    }

    await maybeOfferProviderKeyDbSave(savedValues);

    statusEl.textContent = `Saved / 保存しました\n${results.join("\n")}`;
  }

  // ダウンロードPC版(このページ自体をopen-english-server〈localhost〉が
  // 配信している場合)とブラウザ版(file://直接、または開発者用の別サーバー
  // からの配信)を区別する(ユーザー指示「ダウンロードPC版は端末のPCです
  // よね？そのDATABASEに保存して次回そこから読んで良いか質問する機能を
  // 搭載して」への対応)。判定は「同一オリジンの`/v1/db/settings`
  // (open-english-serverのSQLite設定API)が実際に到達可能かどうか」で
  // 行う——これはブラウザ版(共有VPS等)でも技術的には到達可能なため
  // 完全に確実な判定ではないが、少なくとも「サーバーへ到達できない
  // ケース(file://直接オープン等)」では絶対にDB保存を提案しない
  // (fetchが失敗しそもそも提案自体が出ない)。
  //
  // **正直な開示・セキュリティ上の判断**: APIキーは機微情報のため、
  // 既存の`persistSetting()`(他の一般設定用、確認無しでDBへも自動保存)
  // とは異なり、**必ずユーザーの明示的な同意(confirm)を得てから**
  // ローカルSQLiteへ平文で保存する。同意は`open-english.
  // providerKeyDbSaveChoice`にキャッシュし、次回以降は毎回聞き直さない
  // (ただし「保存しない」を選んだ場合も次回また聞く——保存する場合だけ
  // 記憶する、既存のGoogle検索キー〈ブラウザのみに保存、サーバーへは
  // 一切送らない〉という設計方針との整合を保ちつつ、PC版限定でDB保存の
  // 選択肢を追加する形)。
  async function isDbReachable() {
    try {
      const res = await fetchWithTimeout("/v1/db/settings", { cache: "no-store" }, 3000);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function maybeOfferProviderKeyDbSave(savedValues) {
    const providers = Object.keys(savedValues);
    if (!providers.length) return;
    if (!(await isDbReachable())) return; // ブラウザ版(サーバー未検出)では何もしない

    let saveChoice = null;
    try {
      saveChoice = localStorage.getItem("open-english.providerKeyDbSaveChoice");
    } catch (e) {
      /* ignore */
    }
    if (saveChoice !== "1") {
      const confirmed = window.confirm(
        "Save these AI provider API keys to the local database on this PC, so you don't have to " +
          "re-enter them next time you start the app? They will be stored in plain text in the local " +
          "SQLite file on this device only (never uploaded elsewhere).\n\n" +
          "これらのAIプロバイダのAPIキーを、このPCのローカルデータベースに保存し、次回アプリ起動時に " +
          "再入力を省略できるようにしますか？この端末上のローカルSQLiteファイルに平文で保存されます " +
          "(他のどこにもアップロードされません)。"
      );
      try {
        localStorage.setItem("open-english.providerKeyDbSaveChoice", confirmed ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
      if (!confirmed) return;
    } else if (saveChoice === "0") {
      return;
    }

    for (const provider of providers) {
      persistSetting(`open-english.dbProviderKey.${provider}`, savedValues[provider]);
    }
  }

  // 起動時、ダウンロードPC版でDBに前回保存されたキーが見つかれば、
  // 読み込んで良いか確認する(ユーザー指示「次回そこから読んで良いか
  // 質問する機能を搭載して」への対応)。一度「はい」と答えたら以降は
  // 確認なしで自動適用する(`providerKeyDbAutoApply`)——「いいえ」の
  // 場合は次回また尋ねる(保存側と同じ、慎重側に倒す設計)。
  async function maybeRestoreProviderKeysFromDb() {
    if (!(await isDbReachable())) return;
    let settings;
    try {
      const res = await fetchWithTimeout("/v1/db/settings", { cache: "no-store" }, 3000);
      if (!res.ok) return;
      settings = await res.json();
    } catch (e) {
      return;
    }
    if (!settings || typeof settings !== "object") return;
    const providers = ["openai", "deepseek", "gemini", "claude"];
    const found = providers.filter((p) => typeof settings[`open-english.dbProviderKey.${p}`] === "string" && settings[`open-english.dbProviderKey.${p}`]);
    if (!found.length) return;

    let autoApply = false;
    try {
      autoApply = localStorage.getItem("open-english.providerKeyDbAutoApply") === "1";
    } catch (e) {
      /* ignore */
    }
    if (!autoApply) {
      const confirmed = window.confirm(
        `Found ${found.length} AI provider API key(s) saved in this PC's local database from a previous ` +
          "session. Load and apply them to aruaru-llm now?\n\n" +
          `前回保存されたAIプロバイダのAPIキーがこのPCのローカルデータベースに${found.length}件見つかりました。` +
          "今すぐ読み込んでaruaru-llmへ適用しますか？"
      );
      if (!confirmed) return;
      try {
        localStorage.setItem("open-english.providerKeyDbAutoApply", "1");
      } catch (e) {
        /* ignore */
      }
    }

    const base = apiBaseEl ? apiBaseEl.value.trim() : "";
    if (!base) return;
    for (const provider of found) {
      const value = settings[`open-english.dbProviderKey.${provider}`];
      try {
        await fetchWithTimeout(
          `${base}/v1/settings/chat-providers`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, api_key: value }) },
          8000
        );
      } catch (e) {
        /* best-effort */
      }
    }
    if (statusEl) statusEl.textContent = `✅ Restored ${found.length} key(s) from local database / データベースから${found.length}件のキーを復元しました`;
  }
  // 起動直後は`apiBaseEl.value`が未確定な場合があるため少し遅らせる
  // (`refreshGoogleSearchStatus`の既存パターンと同じ)。
  setTimeout(() => {
    maybeRestoreProviderKeysFromDb();
  }, 1500);

  // APIキー取得先への直リンク(ユーザー指示「それぞれ、API Keyは何処を
  // 参照したら良いかそのURLリンクを表示してクリック出来るようにして」
  // への対応)。**正直な開示**: これらの発行ページ自体はいずれも国・
  // 地域別のURLを持たない単一のグローバルURL(各社のダッシュボード自体が
  // ブラウザ言語設定に応じて表示言語を自動的に切り替える仕組みを持つ
  // ため)。「IPアドレスから国や言語別に参照するURLを自動変更」という
  // 要望のうち、唯一Google AI Studio(Gemini)だけが`?hl=<言語コード>`
  // という表示言語指定クエリパラメータを公式にサポートしている
  // ことを確認できたため、そこだけ`navigator.language`(IPベースの
  // 国別ジオロケーションではなく、ブラウザ自身が申告する言語設定——
  // IPジオロケーションは外部サービスへの問い合わせを伴いプライバシー上の
  // 懸念があるため意図的に不採用)を使って`hl`を付与する。他3社は
  // そのような言語指定パラメータを公式提供していないため、プレーンな
  // リンクのみとする(存在しない機能を実装したと偽らない)。
  const PROVIDER_KEY_LINKS = {
    openai: "https://platform.openai.com/api-keys",
    deepseek: "https://platform.deepseek.com/api_keys",
    gemini: "https://aistudio.google.com/apikey",
    claude: "https://console.anthropic.com/settings/keys",
  };
  Object.entries(PROVIDER_KEY_LINKS).forEach(([provider, baseUrl]) => {
    const input = document.getElementById(`provider-key-${provider}`);
    if (!input || !input.parentElement) return;
    let url = baseUrl;
    if (provider === "gemini") {
      try {
        const lang = (navigator.language || "en").split("-")[0];
        url = `${baseUrl}?hl=${encodeURIComponent(lang)}`;
      } catch (e) {
        /* keep plain baseUrl */
      }
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "setup-note";
    link.style.display = "block";
    link.textContent = "🔗 Where do I get this key? / このキーはどこで取得できますか?";
    input.insertAdjacentElement("afterend", link);
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveToAruaruLlm();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      const base = apiBaseEl ? apiBaseEl.value.trim() : "";
      try {
        ["openai", "deepseek", "gemini", "claude"].forEach((p) => {
          localStorage.removeItem(PROVIDER_KEY_LOCAL_PREFIX + p);
          localStorage.removeItem(`open-english.dbProviderKey.${p}`);
        });
        localStorage.removeItem(PROVIDER_PRIORITY_ENABLED_KEY);
        localStorage.removeItem(PROVIDER_PRIORITY_ORDER_KEY);
        localStorage.removeItem(PROVIDER_PRIORITY_USE_GOOGLE_KEY);
        localStorage.removeItem(PROVIDER_PRIORITY_USE_GITHUB_KEY);
        localStorage.removeItem(PROVIDER_PRIORITY_USE_YOUTUBE_KEY);
        localStorage.removeItem(GITHUB_TOKEN_LOCAL_KEY);
        localStorage.removeItem(YOUTUBE_API_KEY_LOCAL_KEY);
        localStorage.removeItem("open-english.providerKeyDbSaveChoice");
        localStorage.removeItem("open-english.providerKeyDbAutoApply");
      } catch (e) {
        /* ignore */
      }
      priorityOrder = PROVIDER_PRIORITY_SERVICES.map((s) => s.id);
      enabledEl.checked = false;
      if (useGoogleEl) useGoogleEl.checked = false;
      if (useGithubEl) useGithubEl.checked = false;
      if (useYoutubeEl) useYoutubeEl.checked = false;
      if (githubTokenEl) githubTokenEl.value = "";
      if (youtubeKeyEl) youtubeKeyEl.value = "";
      renderList();
      if (base) {
        try {
          await fetchWithTimeout(`${base}/v1/settings/chat-providers`, { method: "DELETE" }, 8000);
          await fetchWithTimeout(`${base}/v1/settings/provider-priority`, { method: "DELETE" }, 8000);
          await fetchWithTimeout(`${base}/v1/settings/github-search`, { method: "DELETE" }, 8000);
          await fetchWithTimeout(`${base}/v1/settings/youtube-search`, { method: "DELETE" }, 8000);
        } catch (e) {
          /* ignore, best-effort */
        }
      }
      if (await isDbReachable()) {
        ["openai", "deepseek", "gemini", "claude"].forEach((p) => persistSetting(`open-english.dbProviderKey.${p}`, ""));
      }
      statusEl.textContent = "🗑 Cleared from this browser and aruaru-llm / このブラウザとaruaru-llmから消去しました";
    });
  }

  // askTrainer()(チャット送信フロー)から呼ばれる、優先順位設定に基づく
  // 外部LLM呼び出し(ユーザー指摘「実際にチャットへ連携していないのでは」
  // への対応——従来この機能は設定パネルからのみ呼び出し可能で、実際の
  // 会話フローには一切配線されていなかった)。
  window.tryPriorityProviderReply = async function tryPriorityProviderReply(prompt) {
    let enabled = false;
    try {
      enabled = localStorage.getItem(PROVIDER_PRIORITY_ENABLED_KEY) === "1";
    } catch (e) {
      /* ignore */
    }
    if (!enabled) return null;
    const base = apiBaseEl ? apiBaseEl.value.trim() : "";
    if (!base) return null;

    const body = { prompt };
    try {
      if (localStorage.getItem(PROVIDER_PRIORITY_USE_GOOGLE_KEY) === "1") {
        body.use_google_search = true;
        const creds = typeof loadOwnGoogleSearchCredentials === "function" ? loadOwnGoogleSearchCredentials() : null;
        if (creds) {
          body.google_search_api_key = creds.api_key;
          body.google_search_cx = creds.cx;
        }
      }
      if (localStorage.getItem(PROVIDER_PRIORITY_USE_GITHUB_KEY) === "1") {
        body.use_github_search = true;
        const token = localStorage.getItem(GITHUB_TOKEN_LOCAL_KEY);
        if (token) body.github_token = token;
      }
      if (localStorage.getItem(PROVIDER_PRIORITY_USE_YOUTUBE_KEY) === "1") {
        body.use_youtube_search = true;
        const key = localStorage.getItem(YOUTUBE_API_KEY_LOCAL_KEY);
        if (key) body.youtube_api_key = key;
      }
    } catch (e) {
      /* ignore */
    }

    try {
      const res = await fetchWithTimeout(
        `${base}/v1/chat-providers/complete-priority`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        45000
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.reply && typeof data.reply.text === "string") {
        return { text: data.reply.text, provider: data.reply.provider, searchNotes: data.search_notes || [] };
      }
      if (data.all_quota_exceeded) {
        return { quotaExceeded: true, searchNotes: data.search_notes || [] };
      }
      return null;
    } catch (e) {
      return null;
    }
  };
})();

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const target = btn.dataset.target;
    const script = document.querySelector(`.setup-script[data-script="${target}"]`).textContent;
    try {
      await navigator.clipboard.writeText(script);
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1500);
    } catch (err) {
      btn.textContent = "Copy failed (select manually)";
    }
  });
});

// 資格試験対策コーナー(2026-08-11新設、ユーザー指示「英検1級2級3級4級
// 5級とTOEICとTOEFLの様々なレベル別擬似的模擬試験機能とその資格対策
// コーナーを搭載して」への対応)。
//
// 正直な開示(最重要): ここに収録した問題はすべて本アプリ用に書き
// 下ろしたオリジナル問題であり、英検(実施団体: 日本英語検定協会)・
// TOEIC・TOEFLの実際の過去問(著作権保護対象)は一切使用・転載していない。
// 難易度も各試験の実際のレベルへの大まかな目安に過ぎず、公式の合否・
// スコア予測ではない。サーバー(aruaru-llm)不要・完全にクライアント側の
// JavaScriptのみで完結するため、Android単体版でもそのまま動作する。
const EXAM_PREP_QUESTIONS = {
  eiken5: [
    { q: "This is ___ apple.", choices: ["a", "an", "the", "some"], answer: 1 },
    { q: "I ___ a student.", choices: ["am", "is", "are", "be"], answer: 0 },
    { q: "She ___ to school every day.", choices: ["go", "goes", "going", "gone"], answer: 1 },
    { q: "What ___ your name?", choices: ["is", "are", "am", "be"], answer: 0 },
    { q: "There ___ two cats on the sofa.", choices: ["is", "am", "are", "be"], answer: 2 },
    { q: "___ you like some tea?", choices: ["Do", "Are", "Would", "Is"], answer: 2 },
    { q: "This pen is ___.", choices: ["I", "my", "mine", "me"], answer: 2 },
    { q: "We ___ soccer after school.", choices: ["play", "plays", "playing", "played"], answer: 0 },
    { q: "It is ___ today.", choices: ["sun", "sunny", "sunning", "suns"], answer: 1 },
    { q: "He can ___ the piano.", choices: ["play", "plays", "playing", "played"], answer: 0 },
  ],
  eiken4: [
    { q: "I have ___ finished my homework.", choices: ["already", "yet", "still", "ago"], answer: 0 },
    { q: "He is taller ___ his brother.", choices: ["as", "than", "then", "that"], answer: 1 },
    { q: "If it ___ tomorrow, we will stay home.", choices: ["rain", "rains", "rained", "raining"], answer: 1 },
    { q: "This book is ___ interesting than that one.", choices: ["more", "most", "much", "many"], answer: 0 },
    { q: "She has been living here ___ 2020.", choices: ["for", "since", "during", "at"], answer: 1 },
    { q: "You should ___ your homework before dinner.", choices: ["finish", "finishing", "finished", "finishes"], answer: 0 },
    { q: "My sister is good ___ drawing pictures.", choices: ["at", "in", "on", "for"], answer: 0 },
    { q: "I was ___ tired that I fell asleep quickly.", choices: ["so", "such", "very", "too"], answer: 0 },
    { q: "They will visit Kyoto ___ next week.", choices: ["at", "on", "in", "-"], answer: 3 },
    { q: "This is the fastest way ___ get there.", choices: ["to", "for", "of", "at"], answer: 0 },
  ],
  eiken3: [
    { q: "I have never ___ sushi before.", choices: ["eat", "ate", "eaten", "eating"], answer: 2 },
    { q: "The letter ___ by my sister yesterday.", choices: ["wrote", "was written", "is writing", "writes"], answer: 1 },
    { q: "You ___ study harder to pass the exam.", choices: ["must", "may", "can", "will"], answer: 0 },
    { q: "This is the book ___ I bought last week.", choices: ["who", "which", "whose", "what"], answer: 1 },
    { q: "By the time we arrived, the movie ___ already started.", choices: ["has", "have", "had", "was"], answer: 2 },
    { q: "I'm looking forward ___ you again.", choices: ["to see", "to seeing", "see", "seeing"], answer: 1 },
    { q: "She asked me ___ I had finished my homework.", choices: ["that", "if", "what", "so"], answer: 1 },
    { q: "The cake ___ by my mother was delicious.", choices: ["make", "made", "making", "makes"], answer: 1 },
    { q: "He is one of the ___ students in our class.", choices: ["tall", "taller", "tallest", "most tall"], answer: 2 },
    { q: "Neither Tom ___ his brother likes vegetables.", choices: ["and", "or", "nor", "but"], answer: 2 },
  ],
  "eiken-pre2": [
    { q: "I wish I ___ more time to travel.", choices: ["have", "had", "will have", "having"], answer: 1 },
    { q: "The project, ___ took two years, was finally completed.", choices: ["that", "which", "who", "what"], answer: 1 },
    { q: "Not only ___ he late, but he also forgot his homework.", choices: ["was", "he was", "did", "he did"], answer: 0 },
    { q: "She suggested ___ to the new restaurant.", choices: ["go", "to go", "going", "went"], answer: 2 },
    { q: "It's high time we ___ a decision.", choices: ["make", "made", "will make", "making"], answer: 1 },
    { q: "The more you practice, the ___ you become.", choices: ["good", "better", "best", "well"], answer: 1 },
    { q: "I'd rather you ___ that right now.", choices: ["do", "did", "will do", "doing"], answer: 1 },
    { q: "He apologized for ___ late to the meeting.", choices: ["be", "being", "been", "is"], answer: 1 },
    { q: "No sooner ___ she arrived than the phone rang.", choices: ["had", "did", "has", "does"], answer: 0 },
    { q: "This report is ___ than I expected.", choices: ["far more detailed", "far detailed", "detailed far", "far detail"], answer: 0 },
  ],
  eiken2: [
    { q: "Had I known about the traffic, I ___ earlier.", choices: ["would leave", "would have left", "will leave", "left"], answer: 1 },
    { q: "The committee is composed ___ five members.", choices: ["of", "by", "with", "from"], answer: 0 },
    { q: "Little ___ that his decision would change everything.", choices: ["he knew", "did he know", "he did know", "knew he"], answer: 1 },
    { q: "The report needs to be submitted ___ Friday at the latest.", choices: ["until", "by", "in", "at"], answer: 1 },
    { q: "She is used to ___ up early for work.", choices: ["get", "got", "getting", "have gotten"], answer: 2 },
    { q: "Not until he apologized ___ she forgive him.", choices: ["did", "had", "would", "does"], answer: 0 },
    { q: "The plan, ___ ambitious, is not impossible.", choices: ["although", "despite", "however", "because"], answer: 0 },
    { q: "He is by far the ___ candidate for the job.", choices: ["strong", "stronger", "strongest", "more strong"], answer: 2 },
    { q: "The company is on the verge ___ bankruptcy.", choices: ["of", "for", "to", "with"], answer: 0 },
    { q: "Scarcely ___ the show begun when the lights went out.", choices: ["had", "did", "has", "does"], answer: 0 },
  ],
  eiken1: [
    { q: "The negotiations broke down, ___ leading to a prolonged strike.", choices: ["thereby", "therefore", "wherein", "albeit"], answer: 0 },
    { q: "His argument, though eloquent, was fundamentally ___.", choices: ["flawless", "specious", "unanimous", "verbatim"], answer: 1 },
    { q: "Were it not for her intervention, the deal ___ collapsed.", choices: ["would have", "will have", "had", "has"], answer: 0 },
    { q: "The policy has been criticized as ___ short-term gains over long-term stability.", choices: ["prioritizing", "to prioritize", "prioritize", "prioritized"], answer: 0 },
    { q: "He remained ___ in the face of overwhelming criticism.", choices: ["obstinate", "gregarious", "affable", "candid"], answer: 0 },
    { q: "The committee's decision was met with ___ skepticism.", choices: ["overweening", "unmitigated", "cursory", "fleeting"], answer: 1 },
    { q: "Her ___ remarks defused the tension in the room.", choices: ["conciliatory", "vitriolic", "surreptitious", "insipid"], answer: 0 },
    { q: "The scandal ___ the politician's once-stellar reputation.", choices: ["tarnished", "burnished", "vindicated", "exonerated"], answer: 0 },
    { q: "So ___ was the evidence that the jury reached a verdict in minutes.", choices: ["compelling", "tenuous", "ambiguous", "circumstantial"], answer: 0 },
    { q: "The treaty was signed ___ the objections of several nations.", choices: ["notwithstanding", "hereby", "whereupon", "insofar"], answer: 0 },
  ],
  toeic: [
    { q: "Please submit the report ___ the end of the week.", choices: ["by", "until", "since", "for"], answer: 0 },
    { q: "The meeting has been ___ to next Monday.", choices: ["postponed", "postpone", "postponing", "postpones"], answer: 0 },
    { q: "All employees are required ___ the new safety guidelines.", choices: ["follow", "to follow", "following", "followed"], answer: 1 },
    { q: "Sales figures ___ significantly since the new campaign launched.", choices: ["has increased", "have increased", "increasing", "increase"], answer: 1 },
    { q: "The invoice should be sent directly ___ the accounting department.", choices: ["to", "at", "with", "for"], answer: 0 },
    { q: "We regret ___ you that your application was not successful.", choices: ["inform", "to inform", "informing", "informed"], answer: 1 },
    { q: "The new policy will ___ effect starting next month.", choices: ["take", "make", "do", "have"], answer: 0 },
    { q: "Please find ___ the requested documents.", choices: ["attach", "attaching", "attached", "attachment"], answer: 2 },
    { q: "The conference room is ___ for use until 3 PM.", choices: ["reserved", "reserving", "reserve", "reservation"], answer: 0 },
    { q: "Employees who work overtime will be ___ accordingly.", choices: ["compensate", "compensated", "compensating", "compensation"], answer: 1 },
  ],
  toefl: [
    { q: "The professor's lecture focused on the factors ___ contribute to climate change.", choices: ["that", "who", "whom", "what"], answer: 0 },
    { q: "Despite ___ evidence, the theory remains widely accepted.", choices: ["limit", "limited", "limiting", "limitation"], answer: 1 },
    { q: "The study suggests that early intervention can ___ the long-term effects.", choices: ["mitigate", "mitigating", "mitigation", "mitigated"], answer: 0 },
    { q: "It is essential that every student ___ the assignment on time.", choices: ["submits", "submit", "submitted", "submitting"], answer: 1 },
    { q: "The researchers were unable to draw a definitive conclusion ___ the limited sample size.", choices: ["because", "because of", "although", "despite"], answer: 1 },
    { q: "The lecture will cover several theories, ___ of which remain controversial.", choices: ["most", "much", "almost", "few of"], answer: 0 },
    { q: "Students are expected to submit their essays ___ the deadline.", choices: ["prior to", "prior", "before to", "previous"], answer: 0 },
    { q: "The data ___ analyzed using statistical software.", choices: ["was", "were", "is", "be"], answer: 1 },
    { q: "The professor emphasized the importance of ___ primary sources.", choices: ["consult", "consulting", "consulted", "to consulting"], answer: 1 },
    { q: "Unlike traditional methods, this approach ___ real-time data.", choices: ["incorporate", "incorporates", "incorporating", "incorporated"], answer: 1 },
  ],
  // 日本語能力試験(JLPT)N5〜N1相当のオリジナル模擬問題(ユーザー指示
  // 「日本語検定と日本語能力検定の擬似的な模擬試験機能も搭載」への
  // 対応)。実際のJLPT過去問(著作権保護対象・実施団体: 国際交流基金/
  // 日本国際教育支援協会)は使用していない、本アプリ用の書き下ろし。
  jlptN5: [
    { q: "これ ___ わたしの本です。", choices: ["は", "を", "に", "で"], answer: 0 },
    { q: "きのう、友達 ___ 会いました。(I met a friend yesterday.)", choices: ["を", "に", "は", "も"], answer: 1 },
    { q: "毎朝7時 ___ 起きます。(I get up at 7 every morning.)", choices: ["に", "で", "を", "へ"], answer: 0 },
    { q: "この本は ___ おもしろいです。(This book is very interesting.)", choices: ["とても", "あまり", "すこし", "ぜんぜん"], answer: 0 },
    { q: "水 ___ 一杯ください。(A glass of water, please.)", choices: ["を", "が", "は", "も"], answer: 0 },
    { q: "きょうは天気が ___ です。(The weather is good today.)", choices: ["いい", "いく", "いいだ", "いくて"], answer: 0 },
    { q: "わたしは日本語 ___ 勉強しています。(I am studying Japanese.)", choices: ["を", "が", "に", "で"], answer: 0 },
    { q: "この駅 ___ バスに乗ります。(I take the bus from this station.)", choices: ["を", "に", "から", "まで"], answer: 2 },
    { q: "テーブルの上 ___ りんごがあります。(There is an apple on the table.)", choices: ["に", "で", "を", "へ"], answer: 0 },
    { q: "きのうは学校 ___ 行きませんでした。(I didn't go to school yesterday.)", choices: ["が", "を", "に", "は"], answer: 2 },
  ],
  jlptN4: [
    { q: "電車が来た ___、走りました。(When the train came, I ran.)", choices: ["ので", "とき", "なら", "けど"], answer: 1 },
    { q: "宿題をやらなければ ___。(You must do your homework.)", choices: ["いけません", "いいです", "だめでした", "しました"], answer: 0 },
    { q: "この漢字は ___ 読みますか。(How do you read this kanji?)", choices: ["どう", "なぜ", "いつ", "どこ"], answer: 0 },
    { q: "雨が降って ___、出かけませんでした。(Since it rained, I didn't go out.)", choices: ["いるので", "いたので", "いても", "いたら"], answer: 1 },
    { q: "田中さんは英語が ___ 話せます。(Tanaka can speak English fluently.)", choices: ["じょうずに", "じょうずで", "じょうずだ", "じょうず"], answer: 0 },
    { q: "友達に手紙を ___ もらいました。(I had a friend write me a letter.)", choices: ["書いて", "書く", "書いた", "書き"], answer: 0 },
    { q: "この部屋は使っては ___。(You may not use this room.)", choices: ["いけません", "かまいません", "けっこうです", "しかたありません"], answer: 0 },
    { q: "電気を ___ まま寝てしまいました。(I fell asleep with the lights on.)", choices: ["つけた", "つけて", "ついた", "つく"], answer: 0 },
    { q: "先生に ___ ことがあります。(There's something I want to ask the teacher.)", choices: ["聞きたい", "聞かせたい", "聞かれたい", "聞こえたい"], answer: 0 },
    { q: "この道をまっすぐ ___ と、駅があります。(If you go straight down this road, there's a station.)", choices: ["行く", "行った", "行くの", "行き"], answer: 0 },
  ],
  jlptN3: [
    { q: "この機械は使い方が ___ で、誰でも操作できる。(This machine is easy to use.)", choices: ["簡単", "簡単に", "簡単な", "簡単さ"], answer: 0 },
    { q: "会議は3時から始まる ___ だ。(The meeting is scheduled to start at 3.)", choices: ["こと", "はず", "もの", "つもり"], answer: 1 },
    { q: "彼は忙しい ___ かかわらず、手伝ってくれた。(Despite being busy, he helped.)", choices: ["にも", "だけ", "ほど", "さえ"], answer: 0 },
    { q: "この問題は思った ___ 難しくなかった。(This problem wasn't as hard as I thought.)", choices: ["ほど", "だけ", "まま", "ばかり"], answer: 0 },
    { q: "食べ ___ ば食べるほど、おいしくなる。(The more you eat, the tastier it gets.)", choices: ["れ", "る", "た", "て"], answer: 1 },
    { q: "彼は日本語 ___ 上手に話せる外国人はめずらしい。(A foreigner who can speak Japanese as well as he can is rare.)", choices: ["ほど", "だけ", "ばかり", "さえ"], answer: 0 },
    { q: "この店は安い ___、味もよい。(This shop is not only cheap, the taste is also good.)", choices: ["うえに", "せいで", "おかげで", "ものの"], answer: 0 },
    { q: "彼女が来る ___ で、雰囲気が明るくなった。(Just her coming made the atmosphere brighter.)", choices: ["だけ", "ばかり", "こそ", "さえ"], answer: 0 },
    { q: "仕事が終わり ___、電話がかかってきた。(Just as work was ending, a call came.)", choices: ["次第", "かけて", "がてら", "つつ"], answer: 1 },
    { q: "彼は忙しい ___、家族との時間を大切にしている。(Even though he is busy, he values time with his family.)", choices: ["なりに", "反面", "ながらも", "あまり"], answer: 2 },
  ],
  jlptN2: [
    { q: "彼の話を聞く ___、彼は来月引っ越すらしい。(According to what he said, he's moving next month.)", choices: ["かぎり", "うえで", "かわりに", "かたわら"], answer: 0 },
    { q: "この結果を ___ して、新しい計画を立てる。(Based on this result, we'll make a new plan.)", choices: ["踏まえ", "問わ", "限ら", "際し"], answer: 0 },
    { q: "彼女は忙しい ___、いつも笑顔を絶やさない。(Despite being busy, she always smiles.)", choices: ["にもかかわらず", "におうじて", "にかけては", "につき"], answer: 0 },
    { q: "この薬は熱を下げる ___ 効果がある。(This medicine is effective in lowering fever.)", choices: ["のに", "ものの", "ばかりに", "あげく"], answer: 0 },
    { q: "検討した ___、この案を採用することにした。(After consideration, we decided to adopt this plan.)", choices: ["結果", "反面", "うちに", "ながらに"], answer: 0 },
    { q: "彼の話は具体性 ___、信じにくい。(His story lacks specifics, so it's hard to believe.)", choices: ["に欠け", "をおいて", "にかまけて", "はおろか"], answer: 0 },
    { q: "この製品は安全性を ___ 設計されている。(This product is designed with safety in mind.)", choices: ["重視して", "問わず", "限らず", "際して"], answer: 0 },
    { q: "彼は多忙 ___、趣味の時間を欠かさない。(Despite being busy, he never skips his hobby time.)", choices: ["をきわめる中でも", "につけ", "とあれば", "なくして"], answer: 0 },
    { q: "この結果は予想 ___ 悪かった。(This result was worse than expected.)", choices: ["以上に", "のみならず", "をよそに", "にひきいられ"], answer: 0 },
    { q: "彼女の説明を ___、状況はまだ不明確だ。(Even after hearing her explanation, the situation is still unclear.)", choices: ["聞いても", "聞くなり", "聞くまでもなく", "聞かんばかりに"], answer: 0 },
  ],
  jlptN1: [
    { q: "彼の発言は、誤解を招く ___ ものだった。(His remark was such as to invite misunderstanding.)", choices: ["に足る", "べからざる", "きらいがある", "にすぎない"], answer: 2 },
    { q: "苦労した ___、その成果は大きかった。(Given the hardship endured, the results were significant.)", choices: ["ながらも", "ならでは", "とばかりに", "だけあって"], answer: 3 },
    { q: "彼は謝罪する ___、さらに批判を浴びた。(Rather than apologizing, he drew even more criticism.)", choices: ["なりに", "どころか", "ゆえに", "うえは"], answer: 1 },
    { q: "この規則は、いかなる理由 ___ 変更できない。(This rule cannot be changed for any reason.)", choices: ["があろうとも", "にとどまらず", "をおいて", "にひきいられ"], answer: 0 },
    { q: "彼女の実力 ___、この結果は当然だ。(Given her ability, this result is only natural.)", choices: ["ですら", "とあれば", "であれ", "からすれば"], answer: 3 },
    { q: "彼の功績は、いかに批判されようとも ___ ものだ。(His achievements are undeniable no matter how much he is criticized.)", choices: ["否定するに足る", "否定しがたい", "否定せんばかりの", "否定ならでは"], answer: 1 },
    { q: "この計画は、失敗する ___ 覚悟で進めるべきだ。(This plan should proceed with the resolve that it might fail.)", choices: ["べく", "もの", "ことも", "だに"], answer: 2 },
    { q: "彼は言うに ___、行動でそれを示した。(Rather than saying it, he showed it through action.)", choices: ["及ばず", "至らず", "事欠かず", "たえず"], answer: 0 },
    { q: "彼女は多忙 ___ を極めているが、笑顔を絶やさない。(She is extremely busy, but never stops smiling.)", choices: ["すら", "ゆえ", "こそ", "きわみ"], answer: 3 },
    { q: "この事態は予測 ___ ものであった。(This situation was beyond prediction.)", choices: ["するに足る", "し難い", "してやまない", "せんばかりの"], answer: 1 },
  ],
  // 日本語検定(実施団体: 特定非営利活動法人日本語検定委員会)相当の
  // オリジナル模擬問題(ユーザー指示「日本語検定の擬似的模擬試験も
  // 選択可能にして」への対応)。JLPT(外国語としての日本語能力を測る)
  // とは異なり、日本語検定は**日本語を母語とする話者も対象**に、敬語・
  // 語彙・漢字・言葉の由来等のより深い運用力を問う試験——この違いを
  // 反映し、敬語の使い分け・慣用表現・漢字語彙を中心に出題した。
  // 正直な開示: 実際の日本語検定委員会の過去問は使用していない。
  nihongoKentei3: [
    { q: "お客様が来られたら、こちらへ ___ ください。(尊敬語)", choices: ["ご案内し", "ご案内になって", "案内されて", "案内し"], answer: 1 },
    { q: "「拝見する」は誰の行為を表す謙譲語か。", choices: ["第三者の行為", "相手の行為", "自分の行為", "どちらでもよい"], answer: 2 },
    { q: "「時期尚早」の意味に最も近いものを選べ。", choices: ["予定通り", "もう遅い", "ちょうど良い時期", "まだ早すぎる"], answer: 3 },
    { q: "「愛想」の正しい読み方は?", choices: ["あいそう", "あいそ", "あいしょう", "あいそく"], answer: 1 },
    { q: "上司に資料を渡すとき、最も適切な言い方は?", choices: ["資料をあげます", "資料をやります", "資料をお渡しします", "資料をわたす"], answer: 2 },
    { q: "「おっしゃる」は何の敬語か。", choices: ["謙譲語", "尊敬語", "丁寧語", "美化語"], answer: 1 },
    { q: "「相槎(あいづち)」の正しい意味は?", choices: ["自己主張", "反対意見", "会話中の短い応答・反応", "沈黙"], answer: 2 },
    { q: "「杓子定規」の意味に最も近いものは?", choices: ["常に前向きである", "臨機応変に対応する", "細かいことを気にしない", "一つの基準にこだわり融通がきかない"], answer: 3 },
    { q: "「大は小を兼ねる」の意味として正しいものは?", choices: ["小さいものが有利である", "大きいものは小さい用途にも使える", "大小は関係ない", "大きすぎると使えない"], answer: 1 },
    { q: "電話で相手の名前が分からないとき、最も適切な言い方は?", choices: ["誰ですか", "あなたの名前は?", "失礼ですが、お名前をお伺いしてもよろしいでしょうか", "名前を教えろ"], answer: 2 },
  ],
  nihongoKentei2: [
    { q: "「役不足」の正しい意味は?", choices: ["役目が多すぎる", "能力が役目に足りない", "能力に対して役目が軽すぎる", "役目が無い"], answer: 2 },
    { q: "取引先に自社の資料を送るとき、最も適切な表現は?", choices: ["送信しておく", "お送りします", "送っておきます", "お送りいたします"], answer: 3 },
    { q: "「相手の気持ちを推し量る」を意味する言葉は?", choices: ["邁進する", "忖度する", "逡巡する", "斟酌しない"], answer: 1 },
    { q: "「檄を飛ばす」の意味として正しいものは?", choices: ["激しく励ます・呼びかける", "強く非難する", "静かに諭す", "無視する"], answer: 0 },
    { q: "会議で意見が対立したとき、相手を敬いつつ反論する適切な言い方は?", choices: ["考え直してください", "それは違います", "そんなことはありません", "おっしゃることは分かりますが、私はこう考えます"], answer: 3 },
    { q: "「二の足を踏む」の意味として正しいものは?", choices: ["急いで行動する", "ためらう・決心がつかない", "堂々と進む", "後悔する"], answer: 1 },
    { q: "取引先へお礼のメールを送るとき、最も適切な結びの言葉は?", choices: ["以上です", "またね", "今後ともよろしくお願いいたします", "よろしく"], answer: 2 },
    { q: "「腹を割って話す」の意味として正しいものは?", choices: ["本音で話す", "怒って話す", "簡潔に話す", "遠回しに話す"], answer: 0 },
    { q: "「間髪を容れず」の正しい読み方は?", choices: ["かんぱついれず", "かんはつをいれず", "まがみをいれず", "かんぱつをいれず"], answer: 3 },
    { q: "上司からの指示に対し、承知したことを丁寧に伝える言い方は?", choices: ["了解", "承知いたしました", "オーケーです", "分かった"], answer: 1 },
  ],
  nihongoKentei1: [
    { q: "「言を左右にする」の意味として正しいものは?", choices: ["左右対称に話す", "はっきりと断言する", "はっきりと言わずに態度をあいまいにする", "急に話題を変える"], answer: 2 },
    { q: "「僭越ながら」の使い方として最も適切な場面は?", choices: ["依頼を断るとき", "相手を褒めるとき", "謝罪するとき", "自分の立場を超えて意見を述べる前置き"], answer: 3 },
    { q: "「机上の空論」に近い意味を持つ言葉は?", choices: ["石橋を叩いて渡る", "絵に描いた餅", "背水の陣", "水を得た魚"], answer: 1 },
    { q: "取引先からの厳しい要求に対し、丁重に断る場合の適切な表現は?", choices: ["誠に恐れ入りますが、今回は見送らせていただきます", "できません", "無理です", "それは困ります"], answer: 0 },
    { q: "「琴線に触れる」の正しい意味は?", choices: ["驚かせる", "怒らせる", "困らせる", "深く感動させる"], answer: 3 },
    { q: "「白眉」の意味として正しいものは?", choices: ["最も劣っているもの", "多数の中で最も優れているもの", "最初のもの", "最後のもの"], answer: 1 },
    { q: "重要な取引先との会談を丁重に切り上げる際の適切な表現は?", choices: ["終わりにしましょう", "もう時間がないので", "本日はお時間を頂き、誠にありがとうございました", "また今度話しましょう"], answer: 2 },
    { q: "「不惜身命」の意味として正しいものは?", choices: ["自分の身を惜しまず全力を尽くすこと", "身の安全を最優先すること", "無関心であること", "怠けること"], answer: 0 },
    { q: "「一斑を見て全豹を卜す」の意味に近いものは?", choices: ["詳細を全て確認する", "全体を見て判断する", "何も見ずに判断する", "一部を見て全体を推測する"], answer: 3 },
    { q: "「胸襟を開く」の意味として正しいものは?", choices: ["服のボタンを開ける", "心を開いて本心を話す", "怒りを表す", "無関心を示す"], answer: 1 },
  ],
};

const examPrepBtn = document.getElementById("exam-prep-btn");
const examPrepModal = document.getElementById("exam-prep-modal");
const examPrepClose = document.getElementById("exam-prep-close");
const examPrepExamEl = document.getElementById("exam-prep-exam");
const examPrepQuizEl = document.getElementById("exam-prep-quiz");
const examPrepStartBtn = document.getElementById("exam-prep-start");
const examPrepSubmitBtn = document.getElementById("exam-prep-submit");
const examPrepResultEl = document.getElementById("exam-prep-result");
const examPrepPracticeBtn = document.getElementById("exam-prep-practice-btn");
// 直近の採点で間違えた問題(採点後にトレーナーへの引き継ぎで使う、
// ユーザー指示「英検で採点後の英会話学習をつなぐようにして」への対応)。
let examPrepMissedQuestions = [];

/**
 * Fisher-Yatesで配列をシャッフルした新しい配列を返す(元の配列は変更しない)。
 */
function shuffledCopy(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 直近にrenderExamPrepQuiz()で組み立てた「今回の出題」(問題の出題順・
// 選択肢の並びを毎回シャッフルした結果)を保持する(ユーザー指示
// 「正解位置を問題ごとにランダムに分散させて」「問題も...ランダムに
// 組み合わせて出題」への対応)。scoreExamPrepQuiz/practiceExamPrepWithTrainer
// は元のEXAM_PREP_QUESTIONS(固定の並び)を再度読むのではなく、必ずこの
// 配列を参照する——採点時にシャッフル結果がずれて誤採点にならないため。
let currentExamPrepQuiz = [];

// 各カテゴリの追加問題プール(`exam-prep-questions.json`、サーバーから
// 配信される静的ファイル)。ユーザー指示「問題もJSONやDATABASEなどから
// ランダムに要素を追加してランダムに組み合わせて出題して」への対応——
// app.js内蔵の固定10問だけでなく、このJSONの追加問題も合算したプールから
// 毎回ランダムに一部を抽出して出題する。取得できない場合(オフライン・
// 配信元にファイルが無い等)は内蔵の固定問題のみへ安全にフォールバックする
// (既存の「サービスを止めない」方針を踏襲)。
let examPrepExtraQuestionsPromise = null;
function loadExtraExamPrepQuestions() {
  if (!examPrepExtraQuestionsPromise) {
    examPrepExtraQuestionsPromise = fetch("/exam-prep-questions.json")
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return examPrepExtraQuestionsPromise;
}

// 一回の出題で提示する問題数の上限(プールがこれより多い場合はランダムに
// この件数だけ抽出する、少ない場合はプール全件を出題する)。
const EXAM_PREP_QUESTIONS_PER_ATTEMPT = 10;

async function renderExamPrepQuiz() {
  const exam = examPrepExamEl.value;
  let pool;
  if (exam.startsWith("world:")) {
    // 世界の言語の擬似模擬試験(2026-08-22追加)。問題は
    // `world-language-exams.json`側にあり、既存の英検/JLPT等のプールとは
    // 別系統で読み込む(既存の仕組みは一切変更しない)。
    const code = exam.slice("world:".length);
    const map = await loadWorldExamQuestions();
    pool = (map[code] || []).map((item) => ({
      // レベル(CEFR風の目安)を問題文の頭に付けて表示する。
      q: item.level ? `[${item.level}] ${item.q}` : item.q,
      choices: item.choices,
      answer: item.answer,
    }));
  } else {
    const extra = await loadExtraExamPrepQuestions();
    pool = (EXAM_PREP_QUESTIONS[exam] || []).concat(extra[exam] || []);
  }
  if (pool.length === 0) {
    // プールが空の場合、押しても何も始まらないように見えるBUGを修正
    // (「開始」ボタンを押しても画面が空のままだった)——正直な案内を
    // 表示し、「開始」ボタンも隠す(既存のvschool側と同じパターン)。
    currentExamPrepQuiz = [];
    examPrepQuizEl.innerHTML = "";
    examPrepResultEl.textContent =
      "現在この試験区分の問題は準備中です。 / Questions for this exam are not ready yet.";
    examPrepSubmitBtn.classList.add("hidden");
    examPrepPracticeBtn.classList.add("hidden");
    return;
  }
  // プール全体からランダムに抽出した上で出題順もシャッフルし、各問の
  // 選択肢の並び(正解の位置)も毎回シャッフルする——正解が常に同じ
  // 位置に来る/常に同じ問題の組み合わせで出題される、という予測可能性を
  // 排除する。
  const picked = shuffledCopy(pool).slice(0, Math.min(EXAM_PREP_QUESTIONS_PER_ATTEMPT, pool.length));
  currentExamPrepQuiz = picked.map((item) => {
    const order = shuffledCopy(item.choices.map((_, ci) => ci));
    return {
      q: item.q,
      choices: order.map((ci) => item.choices[ci]),
      answer: order.indexOf(item.answer),
    };
  });
  examPrepQuizEl.innerHTML = currentExamPrepQuiz
    .map((item, qi) => {
      const choices = item.choices
        .map(
          (choice, ci) =>
            `<label class="exam-prep-choice"><input type="radio" name="exam-prep-q${qi}" value="${ci}" /> ${choice}</label>`
        )
        .join("");
      return `<div class="exam-prep-question"><p>${qi + 1}. ${item.q}</p>${choices}</div>`;
    })
    .join("");
  examPrepResultEl.textContent = "";
  examPrepSubmitBtn.classList.remove("hidden");
  examPrepPracticeBtn.classList.add("hidden");
  examPrepMissedQuestions = [];
}

function scoreExamPrepQuiz() {
  const questions = currentExamPrepQuiz;
  let correct = 0;
  examPrepMissedQuestions = [];
  questions.forEach((item, qi) => {
    const selected = examPrepQuizEl.querySelector(`input[name="exam-prep-q${qi}"]:checked`);
    const isCorrect = selected && Number(selected.value) === item.answer;
    if (isCorrect) {
      correct += 1;
    } else {
      examPrepMissedQuestions.push({ q: item.q, correctChoice: item.choices[item.answer] });
    }
  });
  const total = questions.length;
  examPrepResultEl.textContent =
    `Score / 得点: ${correct} / ${total} — ` +
    "practice questions only, not an official score prediction. / " +
    "練習問題のみです。公式のスコア予測ではありません。";
  // 間違えた問題(または満点なら全問)をトレーナーとの練習へつなげる
  // ボタンを表示する。満点の場合でも復習として練習できるよう、全問を
  // 対象にする。
  examPrepPracticeBtn.classList.toggle("hidden", questions.length === 0);
}

/**
 * 採点結果をメイドカフェ英会話トレーナーへの練習リクエストへ変換し、
 * モーダルを閉じてチャットへ渡す(ユーザー指示「英検で採点後の英会話
 * 学習をつなぐようにして」への対応)。間違えた問題が無ければ、直近に
 * 解いた問題全体を復習練習として渡す。
 */
function practiceExamPrepWithTrainer() {
  const exam = examPrepExamEl.value;
  const examLabel = examPrepExamEl.options[examPrepExamEl.selectedIndex].textContent.trim();
  const questions = currentExamPrepQuiz;
  const targets = examPrepMissedQuestions.length > 0 ? examPrepMissedQuestions : questions.map((item) => ({ q: item.q, correctChoice: item.choices[item.answer] }));
  if (targets.length === 0) return;

  // 世界の言語の擬似模擬試験を受けた後は、その言語のトレーナーへ移行して
  // 学習を途切れさせない(2026-08-22追加、既存のJLPT→日本語教室と同じ流れを
  // 多言語へ拡張したもの)。応答言語は英語との併記(hybrid)にして、母語話者で
  // なくても内容を追えるようにする。
  if (exam.startsWith("world:")) {
    const code = exam.slice("world:".length);
    const lang = worldLanguageByCode(code) || { endonym: code, en: code };
    if (learnTargetEl && learnTargetEl.querySelector(`option[value="world:${code}"]`)) {
      learnTargetEl.value = `world:${code}`;
    }
    if (replyLangEl) replyLangEl.value = "hybrid";
    const worldSummary = targets.map((t, i) => `${i + 1}) "${t.q}" (answer: ${t.correctChoice})`).join(" ");
    examPrepModal.classList.add("hidden");
    inputEl.value =
      `I just took an original ${lang.en} practice quiz (not a real certification exam). ` +
      `Please continue as my ${lang.en} tutor and help me understand and practice these items, ` +
      `explaining in English and giving example sentences in ${lang.en}. ${worldSummary}`;
    formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    return;
  }

  const isJlpt = exam.startsWith("jlpt") || exam.startsWith("nihongoKentei");
  // JLPT受験後は「日本語教室」へ移行する(ユーザー指示「テスト後に
  // 日本語教室に移って、英語と日本語で表示としゃべって」への対応)。
  // learn-targetを日本語へ、reply-langをhybrid(英日併記の表示・
  // 読み上げ、既存のspeakBilingual系の仕組みをそのまま活用)へ切替える。
  if (isJlpt) {
    if (learnTargetEl) learnTargetEl.value = "japanese";
    if (replyLangEl) replyLangEl.value = "hybrid";
  }

  const summary = targets.map((t, i) => `${i + 1}) "${t.q}" (answer: ${t.correctChoice})`).join(" ");
  const requestText = isJlpt
    ? `I just took a ${examLabel} practice quiz. Please switch to Japanese conversation practice and help me understand these in both English and Japanese. ${summary}`
    : `I just took a ${examLabel} practice quiz. Can you help me understand and practice these questions in conversation? ${summary}`;

  examPrepModal.classList.add("hidden");
  inputEl.value = requestText;
  formEl.dispatchEvent(new Event("submit", { cancelable: true }));
}

// ===========================================================================
// 多言語擬似模擬試験 + 追加言語パック選択(2026-08-22新設)
// ---------------------------------------------------------------------------
// ユーザー指示への対応:
//  1.「日本語と英語をデフォルトとして選択できますが、世界中の言語も選択
//     可能です」——`index.html`の`#world-language-banner`で日英併記の大きな
//     案内を表示する。
//  2.「日本語における英検・TOEIC・TOEFLのような、その言語の運用能力を測る
//     擬似模擬試験を世界中の言語で」——`world-language-exams.json`に各言語の
//     オリジナル問題を収録し、資格対策モーダルの試験メニューへ`world:<code>`
//     という値で追加する。
//  3.「受験後の学習継続」——既存の`examPrepMissedQuestions`の仕組みをそのまま
//     再利用し、採点後に間違えた問題を持ってその言語のトレーナーへ移行する。
//  4.「メンテナンス中に言語を追加するか尋ね、チェックで選ばせる。全部を選択
//     ボタンと、日英以外を全部解除するボタンを置く」——`#language-pack-modal`。
//
// **正直な開示(誇張しないこと)**:
//  - 収録しているのはこのアプリ用に書き下ろしたオリジナル問題で、実在の
//    語学資格試験(DELE/DELF/Goethe-Zertifikat/HSK/TOPIK等)の過去問では
//    なく、それらの試験とは一切無関係。試験名も騙らず「運用能力チェック
//    (オリジナル問題)」として提示する。
//  - 収録数は言語ごとに不均一(現状3〜6問)で、CEFR風のレベル表記も
//    大まかな目安に過ぎない。UI上でも問題数をそのまま表示する。
//  - トレーナー(aruaru-llmのGPT-2)は英語中心のモデルであり、対象言語で
//    自然な応答を返す保証は無い——これは既存の既知の制約と同じ。
// ===========================================================================

// 「英語・日本語」は常に有効な既定言語(このリストからは外せない)。
const DEFAULT_LANGUAGE_CODES = ["en", "ja"];
// 追加で有効化した言語コードの保存先(既存の`localStorage`利用パターンに合わせる)。
const ENABLED_LANGUAGES_KEY = "open-english.enabledLanguages";
// メンテナンス中の言語追加案内を既に一度出したかどうか(毎回出すと煩わしいため)。
const LANGUAGE_PROMPT_SHOWN_KEY = "open-english.languagePromptShown";
// 母国語(ネイティブ)と、連続表示・読み上げの順番(2026-08-22の追加要望)。
const NATIVE_LANGUAGE_KEY = "open-english.nativeLanguage";
const LANGUAGE_ORDER_KEY = "open-english.languageOrder";

// ---------------------------------------------------------------------------
// 設定の永続化(ユーザー指示、2026-08-22追加要望「母国語と学びたい言語の設定が
// メンテナンスやアップデートを挟んでも消えず、次回起動時に同じ組み合わせが
// 有効になるように」への対応)。
//
// **調査結果(実装前に既存コードを確認したこと自体の記録)**: 既存の
// `auto-update.js`は、バージョン変化を検出すると`openEnglish.`接頭辞を持つ
// localStorageキーを**全削除**する設計だった(「旧バージョンの痕跡の破棄」)。
// 今回の言語設定のキーは`open-english.`接頭辞のため現状では削除対象外だが、
// 接頭辞の違いという偶然に頼るのは危険なので、`auto-update.js`側へ明示的な
// 保持キー許可リスト(`PRESERVED_KEYS`)を追加した。
//
// **二重保存にする理由**: localStorageはブラウザ側のデータで、ブラウザの
// 「サイトデータを削除」や別プロファイル/別端末では失われる。一方、
// サーバー側のSQLite(`data/open-english.sqlite3`)は、既存の自己更新
// (`self_update.rs`)・ダウングレード処理が`data\`ディレクトリを明示的に
// 退避・復元する設計になっている(=アプリのアップデートで消えない)。
// そこで、書き込みは常に両方へ行い、読み込みは localStorage を一次・
// サーバーDBを二次(localStorageが空の時のフォールバック)とする。
// **正直な開示**: サーバーが起動していない/`file://`直開きの場合は
// DB側の復元は効かず、localStorageのみが頼りになる。
// ---------------------------------------------------------------------------

/** 設定を localStorage とサーバーDB(既存の`POST /v1/db/settings`)の両方へ保存する。 */
function persistSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* localStorageが使えなくてもDB側には保存される(次回はDBから復元) */
  }
  fetch("/v1/db/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch(() => {});
}

/**
 * 起動時に一度だけ実行し、localStorageに無い設定をサーバーDBから復元する
 * (ブラウザ側のデータが消えていても、アップデートを跨いで設定が戻る)。
 */
async function restoreSettingsFromServer() {
  let settings;
  try {
    const res = await fetch("/v1/db/settings", { cache: "no-store" });
    if (!res.ok) return;
    settings = await res.json();
  } catch (e) {
    return; // サーバー未起動・file://等では何もしない(localStorageのみで動作)
  }
  if (!settings || typeof settings !== "object") return;
  [ENABLED_LANGUAGES_KEY, NATIVE_LANGUAGE_KEY, LANGUAGE_ORDER_KEY].forEach((key) => {
    try {
      if (localStorage.getItem(key) === null && typeof settings[key] === "string") {
        localStorage.setItem(key, settings[key]);
      }
    } catch (e) {
      /* 復元できなくてもセッション中の動作は妨げない */
    }
  });
}

function loadNativeLanguage() {
  try {
    return localStorage.getItem(NATIVE_LANGUAGE_KEY) || "ja";
  } catch (e) {
    return "ja";
  }
}

function loadLanguageOrder() {
  try {
    const raw = localStorage.getItem(LANGUAGE_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch (e) {
    return [];
  }
}

let worldLanguages = [];       // /v1/world-languages のサマリ一覧
let worldExamQuestions = {};   // code -> questions[](world-language-exams.jsonから)
// 各言語圏の静的な基礎情報(国旗・国名・首都・主要都市・観光名所・名物・
// 著名人・代表的な企業)。`world-language-regions.json`から読み込む。
// 言語選択UIの国旗/国名表示と、話題ブリーフィングの両方で使う。
let worldRegions = {};

async function loadWorldRegions() {
  try {
    const res = await fetch("world-language-regions.json", { cache: "no-store" });
    const data = await res.json();
    const map = {};
    (data.languages || []).forEach((l) => {
      map[l.code] = l;
    });
    worldRegions = map;
  } catch (e) {
    worldRegions = {};
  }
}

/** 言語コードに対応する国旗絵文字(データが無ければ地球儀で代用)。 */
function languageFlag(code) {
  const r = worldRegions[code];
  return (r && r.flag) || "🌐";
}

/** 言語コードに対応する国名ラベル(日英)。国名でも探せるようにUIへ併記する。 */
function languageCountries(code) {
  const r = worldRegions[code];
  if (!r) return "";
  const ja = r.countries_ja || "";
  const en = r.countries_en || "";
  return ja && en ? `${ja} / ${en}` : ja || en;
}

function loadEnabledLanguages() {
  try {
    const raw = localStorage.getItem(ENABLED_LANGUAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch (e) {
    // localStorageが使えない環境でも他機能を止めない(既存方針)。
    return [];
  }
}

function saveEnabledLanguages(codes) {
  // localStorage(一次)+サーバーSQLite(二次、アップデートを跨いで残る)の
  // 二重保存。詳細はpersistSetting()のdoc参照。
  persistSetting(ENABLED_LANGUAGES_KEY, JSON.stringify(codes));
}

async function fetchWorldLanguages() {
  try {
    const res = await fetch("/v1/world-languages", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 2026-08-25新設: メモリ/ディスク容量が限られたデプロイ(VPS等)向けの
    // 制限モード。サーバー側が`limited:true`を返した場合、追加言語選択
    // ボタンを隠して代わりに正直な案内(日英併記)を表示する。
    const noticeEl = document.getElementById("world-language-limited-notice");
    const chooseBtn = document.getElementById("world-language-banner-btn");
    if (data.limited && noticeEl) {
      noticeEl.textContent = `${data.notice_ja || ""} / ${data.notice_en || ""}`;
      noticeEl.classList.remove("hidden");
      if (chooseBtn) chooseBtn.classList.add("hidden");
    }
    return Array.isArray(data.languages) ? data.languages : [];
  } catch (e) {
    // APIが無い配信形態(`file://`直開き等)では静的JSONへフォールバックする。
    try {
      const res2 = await fetch("world-language-exams.json", { cache: "no-store" });
      const data2 = await res2.json();
      return (data2.languages || []).map((l) => ({
        code: l.code, endonym: l.endonym, en: l.en, ja: l.ja, rtl: !!l.rtl,
        authored: !!l.authored, question_count: (l.questions || []).length,
        levels: [...new Set((l.questions || []).map((q) => q.level))].sort(),
      }));
    } catch (e2) {
      return [];
    }
  }
}

let worldExamQuestionsPromise = null;
function loadWorldExamQuestions() {
  if (!worldExamQuestionsPromise) {
    worldExamQuestionsPromise = fetch("world-language-exams.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { languages: [] }))
      .then((data) => {
        const map = {};
        (data.languages || []).forEach((l) => {
          map[l.code] = l.questions || [];
        });
        worldExamQuestions = map;
        return map;
      })
      .catch(() => ({}));
  }
  return worldExamQuestionsPromise;
}

function worldLanguageByCode(code) {
  return worldLanguages.find((l) => l.code === code) || null;
}

function worldLanguageLabel(lang) {
  const levels = (lang.levels || []).join("/");
  return `${lang.endonym} / ${lang.en} / ${lang.ja} — 運用能力チェック(オリジナル問題${levels ? `, ${levels}目安` : ""})`;
}

/**
 * 有効化された言語を「学びたい言語」メニューと資格対策の試験メニューへ反映する。
 * 既定の英語・日本語の項目はそのまま残し、その下へ追加する(既存UIを壊さない)。
 */
function applyEnabledLanguagesToMenus() {
  const enabled = loadEnabledLanguages();

  // 1) 学びたい言語メニュー
  if (learnTargetEl) {
    const previous = learnTargetEl.value;
    learnTargetEl.querySelectorAll("option[data-world-lang]").forEach((o) => o.remove());
    enabled.forEach((code) => {
      const lang = worldLanguageByCode(code);
      if (!lang) return;
      const opt = document.createElement("option");
      opt.value = `world:${code}`;
      opt.dataset.worldLang = code;
      opt.textContent = `${lang.endonym} conversation / ${lang.ja}会話`;
      learnTargetEl.appendChild(opt);
    });
    if (learnTargetEl.querySelector(`option[value="${previous}"]`)) learnTargetEl.value = previous;
  }

  // 2) 資格対策コーナーの試験メニュー(既存の英検/TOEIC/JLPT等はそのまま)
  if (examPrepExamEl) {
    const previous = examPrepExamEl.value;
    examPrepExamEl.querySelectorAll("optgroup[data-world-group]").forEach((g) => g.remove());
    const group = document.createElement("optgroup");
    group.dataset.worldGroup = "1";
    group.label = "世界の言語 / World languages (original practice sets)";
    enabled.forEach((code) => {
      const lang = worldLanguageByCode(code);
      if (!lang || !lang.question_count) return;
      const opt = document.createElement("option");
      opt.value = `world:${code}`;
      opt.textContent = `${worldLanguageLabel(lang)} — ${lang.question_count}問`;
      group.appendChild(opt);
    });
    if (group.children.length > 0) examPrepExamEl.appendChild(group);
    if (examPrepExamEl.querySelector(`option[value="${previous}"]`)) examPrepExamEl.value = previous;
  }

  const note = document.getElementById("exam-prep-world-note");
  if (note) {
    const usable = enabled.filter((c) => (worldLanguageByCode(c) || {}).question_count).length;
    note.textContent = usable > 0
      ? `世界の言語の擬似模擬試験を${usable}言語ぶん有効化しています(オリジナル問題、実在の資格試験とは無関係)。 / ${usable} world-language practice sets enabled (original questions, unaffiliated with any real certification exam).`
      : "世界の言語の模擬試験はまだ有効化されていません。上の「🌐 Languages / 言語を追加」から選べます。 / No world-language practice sets enabled yet — add them from the 🌐 Languages button above.";
  }
}

// --- 追加言語パック選択モーダル -------------------------------------------
const languagePackModal = document.getElementById("language-pack-modal");
const languagePackListEl = document.getElementById("language-pack-list");
const languagePackStatusEl = document.getElementById("language-pack-status");

function renderLanguagePackList() {
  if (!languagePackListEl) return;
  const enabled = new Set(loadEnabledLanguages());
  const defaults = [
    { code: "en", endonym: "English", ja: "英語", fixed: true },
    { code: "ja", endonym: "日本語", ja: "日本語", fixed: true },
  ];
  const defaultRows = defaults
    .map(
      (d) =>
        `<label class="language-pack-item language-pack-default"><input type="checkbox" checked disabled /> ${languageFlag(d.code)} ${d.endonym} / ${d.ja}<span class="language-pack-country">${languageCountries(d.code)}</span> <span class="language-pack-count">(default / 既定)</span></label>`
    )
    .join("");
  // 各行に国旗絵文字と国名(日英)を併記する(ユーザー指示、2026-08-22
  // 「国名でも選びやすいように国名併記+国旗絵文字」への対応)。
  const rows = worldLanguages
    .map((lang) => {
      const checked = enabled.has(lang.code) ? " checked" : "";
      const count = lang.question_count
        ? `${lang.question_count}問 / ${lang.question_count} items`
        : "問題未収録 / no items yet";
      const countries = languageCountries(lang.code);
      return `<label class="language-pack-item"><input type="checkbox" data-lang-code="${lang.code}"${checked} /> ${languageFlag(lang.code)} ${lang.endonym} / ${lang.en} / ${lang.ja}${countries ? `<span class="language-pack-country">${countries}</span>` : ""} <span class="language-pack-count">(${count})</span></label>`;
    })
    .join("");
  languagePackListEl.innerHTML = defaultRows + rows;
  // 個別のON/OFF(利用者が好きな2言語だけ、といった自由な組み合わせ)は
  // 通常のチェックボックスとしてそのまま機能する。ここでは上限のみ制御する。
  languagePackListEl.querySelectorAll("input[data-lang-code]").forEach((box) => {
    box.addEventListener("change", () => {
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
    });
  });
  enforceLanguageSelectionLimit();
  applyLanguagePackFilter();
}

/**
 * 言語一覧の絞り込み(2026-08-22追加)。対応言語が130件と多いため、
 * 言語名(現地語・英語・日本語)と**国名**(日英)・言語コードのいずれでも
 * 部分一致で絞り込めるようにする(ユーザー指示「国名でも選びやすいように」)。
 * チェック状態はDOMを作り直さず`display`の切替だけで隠すため、絞り込んでも
 * 選択済みの言語が失われることはない。
 */
function applyLanguagePackFilter() {
  const input = document.getElementById("language-pack-filter");
  if (!input || !languagePackListEl) return;
  const q = input.value.trim().toLowerCase();
  languagePackListEl.querySelectorAll(".language-pack-item").forEach((item) => {
    const box = item.querySelector("input[data-lang-code]");
    const code = box ? box.dataset.langCode : "";
    const hay = `${item.textContent} ${code}`.toLowerCase();
    item.style.display = !q || hay.includes(q) ? "" : "none";
  });
}

// 同時に選択できる言語数の上限・下限(ユーザー指示、2026-08-22
// 「最低2か国語・最大5か国語、日英含む」)。英語・日本語は常に有効で
// 外せないため、下限2は常に満たされ、追加できるのは最大3言語になる。
const MIN_TOTAL_LANGUAGES = 2;
const MAX_TOTAL_LANGUAGES = 5;
const MAX_ADDITIONAL_LANGUAGES = MAX_TOTAL_LANGUAGES - DEFAULT_LANGUAGE_CODES.length; // = 3

/**
 * 上限に達したら未チェックのチェックボックスをdisabledにする(既にチェック
 * 済みのものは外せるようdisabledにしない)。上限・下限の状況を案内文へ出す。
 */
function enforceLanguageSelectionLimit() {
  if (!languagePackListEl) return;
  const boxes = Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]"));
  const checked = boxes.filter((b) => b.checked);
  const atMax = checked.length >= MAX_ADDITIONAL_LANGUAGES;
  boxes.forEach((b) => {
    b.disabled = atMax && !b.checked;
  });
  if (languagePackStatusEl) {
    const total = DEFAULT_LANGUAGE_CODES.length + checked.length;
    languagePackStatusEl.textContent = atMax
      ? `上限に達しました: 合計${total}言語(最大${MAX_TOTAL_LANGUAGES}言語、英語・日本語を含む)。他の言語を選ぶには、どれかのチェックを外してください。 / Limit reached: ${total} languages (max ${MAX_TOTAL_LANGUAGES} including English and Japanese). Uncheck one to choose another.`
      : `現在 合計${total}言語を選択中(最低${MIN_TOTAL_LANGUAGES}・最大${MAX_TOTAL_LANGUAGES}言語、英語・日本語は常に有効)。 / Currently ${total} languages selected (min ${MIN_TOTAL_LANGUAGES}, max ${MAX_TOTAL_LANGUAGES}; English and Japanese are always on).`;
  }
}

function currentlyCheckedLanguageCodes() {
  if (!languagePackListEl) return [];
  return Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]:checked")).map(
    (el) => el.dataset.langCode
  );
}

function openLanguagePackModal() {
  if (!languagePackModal) return;
  renderLanguagePackList();
  if (languagePackStatusEl) languagePackStatusEl.textContent = "";
  languagePackModal.classList.remove("hidden");
}

if (languagePackModal) {
  const openBtns = ["language-pack-btn", "world-language-banner-btn"];
  openBtns.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", openLanguagePackModal);
  });
  const closeBtn = document.getElementById("language-pack-close");
  if (closeBtn) closeBtn.addEventListener("click", () => languagePackModal.classList.add("hidden"));
  languagePackModal.addEventListener("click", (e) => {
    if (e.target === languagePackModal) languagePackModal.classList.add("hidden");
  });
  const selectAllBtn = document.getElementById("language-pack-select-all");
  if (selectAllBtn) {
    // 「全部を選択」: 合計5言語(英語・日本語+3言語)という上限があるため、
    // 全言語をチェック状態にすることはできない——一覧の先頭から上限ぶんだけ
    // チェックし、その旨をUIで正直に案内する(ユーザー指示「全部を選択の
    // 挙動も上限と矛盾しないように、UI上で分かりやすく説明する」への対応)。
    selectAllBtn.addEventListener("click", () => {
      const boxes = Array.from(languagePackListEl.querySelectorAll("input[data-lang-code]"));
      boxes.forEach((el, i) => {
        el.disabled = false;
        el.checked = i < MAX_ADDITIONAL_LANGUAGES;
      });
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
      if (languagePackStatusEl) {
        languagePackStatusEl.textContent =
          `上限のため、一覧の先頭から${MAX_ADDITIONAL_LANGUAGES}言語のみ選択しました(英語・日本語と合わせて合計${MAX_TOTAL_LANGUAGES}言語)。別の言語にしたい場合はチェックを付け替えてください。 / ` +
          `Because of the ${MAX_TOTAL_LANGUAGES}-language limit, only the first ${MAX_ADDITIONAL_LANGUAGES} languages were selected (plus English and Japanese). Uncheck and pick others if you prefer.`;
      }
    });
  }
  // 「日本語と英語以外の全部を解除」——既定の英語・日本語はそもそも
  // チェックボックス自体が固定(disabled・常時checked)なので、追加言語の
  // チェックだけを外せばユーザーの要望通りの状態になる。
  const clearOthersBtn = document.getElementById("language-pack-clear-others");
  if (clearOthersBtn) {
    clearOthersBtn.addEventListener("click", () => {
      languagePackListEl.querySelectorAll("input[data-lang-code]").forEach((el) => {
        el.checked = false;
      });
      enforceLanguageSelectionLimit();
      refreshLanguageDependentUi();
    });
  }
  const filterInput = document.getElementById("language-pack-filter");
  if (filterInput) filterInput.addEventListener("input", applyLanguagePackFilter);

  // 母国語(ネイティブ)の変更は即座に保存し、並び替えUI・連続表示にも反映する。
  const nativeSelect = document.getElementById("native-language");
  if (nativeSelect) {
    nativeSelect.addEventListener("change", () => {
      persistSetting(NATIVE_LANGUAGE_KEY, nativeSelect.value);
      renderLanguageOrderList();
      renderMultiSpeakOutput();
    });
  }

  const saveBtn = document.getElementById("language-pack-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const codes = currentlyCheckedLanguageCodes();
      saveEnabledLanguages(codes);
      applyEnabledLanguagesToMenus();
      if (languagePackStatusEl) {
        languagePackStatusEl.textContent = `保存しました(${DEFAULT_LANGUAGE_CODES.length + codes.length}言語有効: 英語・日本語 + ${codes.length}言語)。 / Saved: English, Japanese + ${codes.length} additional language(s).`;
      }
      // 言語を選び終えた直後に話題ブリーフィング(情報収集)を始める
      // (ユーザー指示、2026-08-22「母国語と学びたい言語を選択した後、
      // メンテナンス中の案内を出しつつ情報を集める」への対応)。
      languagePackModal.classList.add("hidden");
      runTopicBriefing();
    });
  }
}

// --- 多言語の連続表示・連続読み上げ ---------------------------------------
// ユーザー指示(2026-08-22)への対応: 選択した2〜5か国語(英語・日本語を含む)
// について、同じ内容を選択順に画面へ表示しながら音声で順番に読み上げる。
// 表示文はコピー&ペースト可能なテキスト(`user-select`を妨げない通常のDOM
// +readonlyのtextarea)とし、ファイルダウンロード保存・DB保存にも対応する。
// 何度でも再生し直せるよう、全体の再生ボタンと言語ごとの再生ボタンを置く。
//
// **正直な開示**: 音声は既存機能と同じブラウザ内蔵のWeb Speech APIを流用
// しているだけで、独自の音声合成エンジンは持たない——その言語の音声が
// OS/ブラウザに無ければ、表示はできても読み上げは別言語の声になるか
// 無音でスキップされる。
const multiSpeakPhraseEl = document.getElementById("multi-speak-phrase");
const multiSpeakOutputEl = document.getElementById("multi-speak-output");
const multiSpeakStatusEl = document.getElementById("multi-speak-status");
let multiSpeakPhrases = [];

// 言語コード -> Web Speech APIへ渡すBCP-47タグ(声の選択に使う)。
const SPEECH_LANG_TAGS = {
  en: "en-US", ja: "ja-JP", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT",
  pt: "pt-PT", nl: "nl-NL", sv: "sv-SE", no: "nb-NO", da: "da-DK", fi: "fi-FI",
  pl: "pl-PL", cs: "cs-CZ", ro: "ro-RO", ru: "ru-RU", uk: "uk-UA", el: "el-GR",
  tr: "tr-TR", ar: "ar-SA", he: "he-IL", fa: "fa-IR", hi: "hi-IN", bn: "bn-BD",
  id: "id-ID", ms: "ms-MY", vi: "vi-VN", th: "th-TH", tl: "fil-PH", zh: "zh-CN",
  ko: "ko-KR", sw: "sw-KE",
};

async function loadMultiSpeakPhrases() {
  try {
    const res = await fetch("world-language-phrases.json", { cache: "no-store" });
    const data = await res.json();
    multiSpeakPhrases = data.phrases || [];
  } catch (e) {
    multiSpeakPhrases = [];
  }
  if (multiSpeakPhraseEl) {
    multiSpeakPhraseEl.innerHTML = multiSpeakPhrases
      .map((p) => `<option value="${p.id}">${p.label_ja} / ${p.label_en}</option>`)
      .join("");
  }
}

/**
 * 現在の再生対象言語(英語・日本語 + チェック済みの追加言語、最大5言語)。
 * モーダルが開いていればチェックボックスの「今の状態」を、閉じていれば
 * 保存済みの設定を使う。
 */
function multiSpeakTargetCodes() {
  const additional =
    languagePackModal && !languagePackModal.classList.contains("hidden")
      ? currentlyCheckedLanguageCodes()
      : loadEnabledLanguages();
  const active = DEFAULT_LANGUAGE_CODES.concat(additional).slice(0, MAX_TOTAL_LANGUAGES);
  // 母国語がまだインストール(有効化)されていない場合も、必ず読み上げ対象に
  // 含める(合計最大6項目 = 英語・日本語+追加3言語+母国語1)。
  const native = loadNativeLanguage();
  const withNative = active.includes(native) ? active : active.concat([native]);
  return orderActiveLanguages(withNative);
}

/**
 * 有効な言語を、利用者が保存した並び順(`LANGUAGE_ORDER_KEY`)に従って
 * 並べ替える(ユーザー指示、2026-08-22追加要望「連続表示・読み上げの
 * 順番を好きな順に並び替えられるように、その順番も保存する」への対応)。
 *
 * 保存された順番に含まれない言語(後から追加した言語)は末尾へ回す。
 * 並び順がまだ保存されていない場合は、母国語を先頭に置いた既定順にする
 * ——母語での説明を最初に聞きたい、という自然な期待に合わせるため。
 */
function orderActiveLanguages(active) {
  const saved = loadLanguageOrder().filter((code) => active.includes(code));
  const rest = active.filter((code) => !saved.includes(code));
  if (saved.length === 0) {
    const native = loadNativeLanguage();
    return active.includes(native) ? [native].concat(active.filter((c) => c !== native)) : active;
  }
  return saved.concat(rest);
}

function languageDisplayName(code) {
  if (code === "en") return "English / 英語";
  if (code === "ja") return "日本語 / Japanese";
  const lang = worldLanguageByCode(code);
  return lang ? `${lang.endonym} / ${lang.ja}` : code;
}

/**
 * 母国語セレクトを**全対応言語**(英語・日本語+38言語)で組み立てる。
 *
 * 母国語は「学びたい言語」とは別の軸なので、インストール済み(有効化済み)の
 * 言語に限定しない——母語がまだ有効化されていない場合は、連続表示・読み上げ
 * の対象へ自動的に1行追加される(合計最大6項目、ユーザー指示2026-08-22
 * 「母国語+学びたい言語〈最大5つ〉=合計最大6項目」への対応)。
 */
function renderNativeLanguageSelect() {
  const el = document.getElementById("native-language");
  if (!el) return;
  const all = DEFAULT_LANGUAGE_CODES.concat(worldLanguages.map((l) => l.code));
  const current = loadNativeLanguage();
  el.innerHTML = all.map((code) => `<option value="${code}">${languageDisplayName(code)}</option>`).join("");
  el.value = all.includes(current) ? current : "ja";
  if (el.value !== current) persistSetting(NATIVE_LANGUAGE_KEY, el.value);
}

/**
 * 並び替えUIを描画する。ユーザー指示(2026-08-22追加要望)により、順番の
 * 指定方法を**3系統**用意し、いずれを操作しても互いに連動させる:
 *  (a) 数値入力欄(1〜N)への直接入力
 *  (b) 1(左端)〜N(右端)を横に並べたラジオボタン
 *  (c) ▲▼ボタン(元々の実装、タッチ操作でそのまま使えるので残す)
 *
 * **重複の扱い**: 同じ順番を2つの言語に指定できないようにするため、
 * 「入れ替え(swap)」方式を採る——エラーを出して操作を拒否するのではなく、
 * 指定された位置に既にいる言語と席を交換する。UIが行き止まりにならず、
 * 「3番にしたい」という意図がそのまま1操作で通るため。
 */
function renderLanguageOrderList() {
  const listEl = document.getElementById("language-order-list");
  if (!listEl) return;
  const codes = multiSpeakTargetCodes();
  const native = loadNativeLanguage();
  const total = codes.length;
  listEl.innerHTML = codes
    .map((code, i) => {
      const radios = codes
        .map(
          (_, n) =>
            `<label class="language-order-radio"><input type="radio" name="lang-order-${code}" value="${n + 1}" data-code="${code}"${n === i ? " checked" : ""} /> ${n + 1}</label>`
        )
        .join("");
      return `
      <div class="language-order-item" data-code="${code}">
        <span class="language-order-name">${code === native ? "🏠 " : ""}${languageDisplayName(code)}</span>
        <label class="language-order-number">順番 / order:
          <input type="number" min="1" max="${total}" step="1" value="${i + 1}" data-code="${code}" class="language-order-input" />
        </label>
        <span class="language-order-radios">${radios}</span>
        <button type="button" class="setup-btn language-order-up" data-code="${code}" ${i === 0 ? "disabled" : ""} aria-label="上へ / move up">▲</button>
        <button type="button" class="setup-btn language-order-down" data-code="${code}" ${i === total - 1 ? "disabled" : ""} aria-label="下へ / move down">▼</button>
      </div>`;
    })
    .join("");
  listEl.querySelectorAll(".language-order-up, .language-order-down").forEach((btn) => {
    btn.addEventListener("click", () => moveLanguageInOrder(btn.dataset.code, btn.classList.contains("language-order-up") ? -1 : 1));
  });
  // 数値入力欄・ラジオボタンのどちらを操作しても同じ`setLanguageOrderPosition`を
  // 通るため、再描画によって両方の表示が必ず同期する(片方だけずれることが無い)。
  listEl.querySelectorAll(".language-order-input").forEach((input) => {
    input.addEventListener("change", () => setLanguageOrderPosition(input.dataset.code, Number(input.value)));
  });
  listEl.querySelectorAll('.language-order-radio input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) setLanguageOrderPosition(radio.dataset.code, Number(radio.value));
    });
  });
}

/**
 * ある言語を「1始まりのposition番目」へ移動する(既にそこにいる言語とは入れ替え)。
 * 数値入力欄・ラジオボタンの双方から呼ばれる共通の入口。
 */
function setLanguageOrderPosition(code, position) {
  const codes = multiSpeakTargetCodes();
  const target = Math.round(position);
  const from = codes.indexOf(code);
  // 範囲外・不正な値は黙って無視し、現在の並びで描画し直す(入力欄の値が
  // 元に戻るだけで、UIが壊れた状態にはならない)。
  if (from < 0 || !Number.isFinite(target) || target < 1 || target > codes.length) {
    renderLanguageOrderList();
    return;
  }
  const to = target - 1;
  if (to === from) return;
  [codes[from], codes[to]] = [codes[to], codes[from]];
  persistSetting(LANGUAGE_ORDER_KEY, JSON.stringify(codes));
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

/** 言語の選択状態が変わったときに、母国語セレクト・並び替えUI・連続表示を一括で更新する。 */
function refreshLanguageDependentUi() {
  renderNativeLanguageSelect();
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

function moveLanguageInOrder(code, delta) {
  const codes = multiSpeakTargetCodes();
  const i = codes.indexOf(code);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= codes.length) return;
  [codes[i], codes[j]] = [codes[j], codes[i]];
  // 並べ替えた結果をそのまま設定として保存する(次回起動時も同じ順番)。
  persistSetting(LANGUAGE_ORDER_KEY, JSON.stringify(codes));
  renderLanguageOrderList();
  renderMultiSpeakOutput();
}

function multiSpeakLines() {
  const phrase = multiSpeakPhrases.find((p) => p.id === (multiSpeakPhraseEl ? multiSpeakPhraseEl.value : ""));
  if (!phrase) return [];
  return multiSpeakTargetCodes()
    .map((code) => {
      const lang = worldLanguageByCode(code);
      const name = code === "en" ? "English / 英語" : code === "ja" ? "日本語 / Japanese" : lang ? `${lang.endonym} / ${lang.ja}` : code;
      return { code, name, text: (phrase.text || {})[code] || "" };
    })
    .filter((row) => row.text);
}

function renderMultiSpeakOutput() {
  if (!multiSpeakOutputEl) return;
  const lines = multiSpeakLines();
  if (lines.length < MIN_TOTAL_LANGUAGES) {
    multiSpeakOutputEl.innerHTML = `<p class="setup-note">この言語の訳文がまだ揃っていません(最低${MIN_TOTAL_LANGUAGES}言語必要です)。 / Not enough translated lines yet (minimum ${MIN_TOTAL_LANGUAGES}).</p>`;
    return;
  }
  multiSpeakOutputEl.innerHTML = lines
    .map(
      (row, i) => `
      <div class="multi-speak-row" data-code="${row.code}">
        <div class="multi-speak-row-head">
          <span class="multi-speak-lang">${i + 1}. ${row.name}</span>
          <button type="button" class="setup-btn multi-speak-row-play" data-code="${row.code}">🔁 この言語だけ再生 / Play this one</button>
        </div>
        <textarea class="multi-speak-text" readonly rows="2">${row.text}</textarea>
      </div>`
    )
    .join("");
  multiSpeakOutputEl.querySelectorAll(".multi-speak-row-play").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = lines.find((r) => r.code === btn.dataset.code);
      if (row) speakOneLanguage(row);
    });
  });
}

function speakOneLanguage(row) {
  if (!("speechSynthesis" in window)) {
    if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "このブラウザは音声読み上げに対応していません。 / This browser does not support speech synthesis.";
    return;
  }
  window.speechSynthesis.cancel();
  const tag = SPEECH_LANG_TAGS[row.code] || row.code;
  const utter = new SpeechSynthesisUtterance(row.text);
  utter.lang = tag;
  const voice = pickVoice(tag, false);
  if (voice) utter.voice = voice;
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

/**
 * 選択言語の順に、画面表示をハイライトしながら連続して読み上げる。
 * 何度でも呼べる(呼ぶたびに先頭からやり直す)。
 */
function playMultiSpeakSequence() {
  const lines = multiSpeakLines();
  renderMultiSpeakOutput();
  if (lines.length < MIN_TOTAL_LANGUAGES) return;
  if (!("speechSynthesis" in window)) {
    if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "このブラウザは音声読み上げに対応していないため、表示のみ行いました。 / Speech synthesis is unavailable in this browser; text is displayed only.";
    return;
  }
  window.speechSynthesis.cancel();
  const rows = Array.from(multiSpeakOutputEl.querySelectorAll(".multi-speak-row"));
  lines.forEach((line, i) => {
    const tag = SPEECH_LANG_TAGS[line.code] || line.code;
    const utter = new SpeechSynthesisUtterance(line.text);
    utter.lang = tag;
    const voice = pickVoice(tag, false);
    if (voice) utter.voice = voice;
    utter.rate = 0.9;
    utter.onstart = () => {
      rows.forEach((r) => r.classList.remove("speaking-now"));
      if (rows[i]) rows[i].classList.add("speaking-now");
    };
    utter.onend = () => {
      if (i === lines.length - 1) {
        rows.forEach((r) => r.classList.remove("speaking-now"));
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `${lines.length}言語の再生が終わりました。何度でも再生できます。 / Finished reading ${lines.length} languages. You can replay as many times as you like.`;
      }
    };
    window.speechSynthesis.speak(utter);
  });
  if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `${lines.length}言語を順番に再生しています… / Reading ${lines.length} languages in order…`;
}

function multiSpeakPlainText() {
  const phrase = multiSpeakPhrases.find((p) => p.id === (multiSpeakPhraseEl ? multiSpeakPhraseEl.value : ""));
  const header = phrase ? `# ${phrase.label_ja} / ${phrase.label_en}` : "# open-english multilingual phrases";
  return [header].concat(multiSpeakLines().map((row) => `${row.name}: ${row.text}`)).join("\n");
}

if (multiSpeakOutputEl) {
  const playBtn = document.getElementById("multi-speak-play");
  const replayBtn = document.getElementById("multi-speak-replay");
  const stopBtn = document.getElementById("multi-speak-stop");
  if (playBtn) playBtn.addEventListener("click", playMultiSpeakSequence);
  if (replayBtn) replayBtn.addEventListener("click", playMultiSpeakSequence);
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      multiSpeakOutputEl.querySelectorAll(".multi-speak-row").forEach((r) => r.classList.remove("speaking-now"));
      if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "停止しました。 / Stopped.";
    });
  }
  if (multiSpeakPhraseEl) multiSpeakPhraseEl.addEventListener("change", renderMultiSpeakOutput);

  const copyBtn = document.getElementById("multi-speak-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = multiSpeakPlainText();
      try {
        await navigator.clipboard.writeText(text);
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "クリップボードへコピーしました。 / Copied to the clipboard.";
      } catch (e) {
        // クリップボードAPIが使えない場合でも、各行のtextareaから手動で
        // 選択・コピーできる(readonlyにしているだけで選択は妨げていない)。
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "自動コピーに失敗しました。各行のテキストを手動で選択してコピーしてください。 / Automatic copy failed; please select the text manually and copy it.";
      }
    });
  }

  const downloadBtn = document.getElementById("multi-speak-download");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const blob = new Blob([multiSpeakPlainText()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `open-english-phrases-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "テキストファイルとして保存しました。 / Saved as a text file.";
    });
  }

  // DB保存は既存の会話履歴API(`POST /v1/db/history`、2026-08-18実装済みの
  // SQLite永続化)をそのまま使う——新しいDB基盤は作らない(ユーザー指示
  // 「既存の永続化パターンに合わせること」への対応)。
  const saveDbBtn = document.getElementById("multi-speak-save-db");
  if (saveDbBtn) {
    saveDbBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/v1/db/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "multilingual-phrase", content: multiSpeakPlainText() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = "データベース(ローカルSQLite)へ保存しました。 / Saved to the local SQLite database.";
      } catch (e) {
        if (multiSpeakStatusEl) multiSpeakStatusEl.textContent = `データベースへの保存に失敗しました(${e.message})。ダウンロード保存やコピーはそのまま使えます。 / Saving to the database failed (${e.message}); download and copy still work.`;
      }
    });
  }
}

// --- 話題ブリーフィング(言語選択後の情報収集) ---------------------------
// ユーザー指示(2026-08-22): 母国語と学びたい言語を選んだ後、「メンテナンス中」
// の案内を出しつつ、選んだ言語(特に一番上の言語)の地域について
// ニュース・首都・主要都市・観光名所・名物・有名人・有名な企業を集めて、
// その言語での話題に少しでもついていけるようにする。
//
// **技術的な実現方法(実装前に調査した結果)**:
//  - ニュース: **実際にインターネットへ接続して取得している**。サーバー側
//    (`GET /v1/region-news`)がGoogleニュースの公開RSSをその都度取得し、
//    **見出しのみ**を返す(記事本文は取得も転載もしない——著作権への配慮)。
//    オフライン等で取得できない場合は`ok:false`が返り、UIもその旨を正直に表示する。
//  - 首都・主要都市・観光名所・名物・有名人・企業: `world-language-regions.json`
//    (本アプリ用に書いた静的な基礎知識)をサーバー側`GET /v1/region-info`が返す。
//    **リアルタイム情報ではなく、古くなり得る**ことをUIにも明記する。
//  - `aruaru-llm`(GPT-2ベース)に事実を生成させる方式は採らなかった——
//    もっともらしい嘘(ハルシネーション)を「情報収集の結果」として提示する
//    ことになり、このプロジェクトの正直な開示方針に反するため。
//
// **待機UIについて**: ユーザー指示は「2分程度のメンテナンス表示」だったが、
// 実際の処理は通常数秒で終わる。実処理より長く待たせる演出は利用者の時間を
// 無駄にするため行わず、**実際の進捗をそのまま見せる**プログレス表示にした
// (指示中の「実際の処理時間に合わせて実装してよい」に従う)。
const briefingModal = document.getElementById("briefing-modal");
const briefingProgressEl = document.getElementById("briefing-progress");
const briefingBodyEl = document.getElementById("briefing-body");
let lastBriefingText = "";

function briefingList(title, items) {
  if (!items || items.length === 0) return "";
  const li = items.map((x) => `<li>${escapeHtmlText(x)}</li>`).join("");
  return `<div class="briefing-section"><h4>${title}</h4><ul>${li}</ul></div>`;
}

/** 外部(RSS)由来のテキストを含むため、HTMLとして解釈させない(既存のXSS回避方針)。 */
function escapeHtmlText(s) {
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

async function runTopicBriefing() {
  if (!briefingModal) return;
  briefingModal.classList.remove("hidden");
  briefingBodyEl.innerHTML = "";
  const codes = multiSpeakTargetCodes();
  const top = codes[0];
  const steps = [];
  const setProgress = (done, total, label) => {
    briefingProgressEl.innerHTML =
      `<p class="briefing-maintenance">🛠️ ただいま情報を集めています(メンテナンス中)… ${done}/${total} 完了 — ${escapeHtmlText(label)}<br />` +
      `Gathering topic information (maintenance in progress)… ${done}/${total} done — ${escapeHtmlText(label)}</p>` +
      `<progress max="${total}" value="${done}"></progress>`;
  };
  const total = codes.length + 1; // 各言語の基礎情報 + 先頭言語のニュース
  let done = 0;
  setProgress(done, total, "start / 開始");

  // 1) 先頭の言語のニュース見出し(実際にインターネットから取得)
  let newsHtml = "";
  try {
    const res = await fetch(`/v1/region-news?lang=${encodeURIComponent(top)}`, { cache: "no-store" });
    const data = await res.json();
    if (data.ok && (data.headlines || []).length > 0) {
      newsHtml =
        briefingList(`📰 最新ニュースの見出し(${languageDisplayName(top)}) / Latest headlines`, data.headlines) +
        `<p class="setup-note">${escapeHtmlText(data.disclosure_ja || "")}<br />${escapeHtmlText(data.disclosure_en || "")}</p>`;
    } else {
      newsHtml =
        `<div class="briefing-section"><h4>📰 最新ニュース / Latest news</h4>` +
        `<p class="setup-note">今回は取得できませんでした(オフラインか、配信元へ到達できませんでした): ${escapeHtmlText(data.error || "unknown")}。<br />` +
        `Could not fetch headlines this time (offline or the feed was unreachable).</p></div>`;
    }
  } catch (e) {
    newsHtml =
      `<div class="briefing-section"><h4>📰 最新ニュース / Latest news</h4>` +
      `<p class="setup-note">取得に失敗しました(${escapeHtmlText(e.message)})。 / Fetching headlines failed.</p></div>`;
  }
  done += 1;
  setProgress(done, total, "news / ニュース");

  // 2) 各言語の静的な基礎情報(先頭の言語を最初に、いちばん詳しく表示する)
  let infoHtml = "";
  for (const code of codes) {
    let region = null;
    try {
      const res = await fetch(`/v1/region-info?lang=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) region = data.region;
    } catch (e) {
      region = worldRegions[code] || null; // APIが無い配信形態でも静的JSONの内容で代替
    }
    if (!region) region = worldRegions[code] || null;
    done += 1;
    setProgress(done, total, languageDisplayName(code));
    if (!region) {
      infoHtml += `<div class="briefing-lang"><h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}</h3><p class="setup-note">この言語圏の基礎データはまだ作成されていません。 / No background data has been written for this language yet.</p></div>`;
      continue;
    }
    const isTop = code === top;
    // 詳細データ(首都以下)がまだ書かれていない言語は、空欄を並べるのではなく
    // 「未作成である」ことを正直に表示する(誇張しない既存方針)。
    if (!region.capital) {
      infoHtml +=
        `<div class="briefing-lang${isTop ? " briefing-lang-top" : ""}">` +
        `<h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}${isTop ? " <span class=\"briefing-top-badge\">最優先 / top</span>" : ""}</h3>` +
        `<p><strong>国・地域 / Region:</strong> ${escapeHtmlText(region.regions || "")}</p>` +
        `<p class="setup-note">この言語圏の詳細データ(首都・主要都市・観光名所・名物・著名人・企業)はまだ作成されていません——現在は国旗と国名のみ登録されています。<br />` +
        `Detailed background data (capital, cities, sights, food, people, companies) has not been written for this language yet; only its flag and country label are registered so far.</p>` +
        `</div>`;
      continue;
    }
    const companies = (region.companies || []).map((c) => `${c.name} — ${c.about_ja} / ${c.about_en}`);
    infoHtml +=
      `<div class="briefing-lang${isTop ? " briefing-lang-top" : ""}">` +
      `<h3>${languageFlag(code)} ${escapeHtmlText(languageDisplayName(code))}${isTop ? " <span class=\"briefing-top-badge\">最優先 / top</span>" : ""}</h3>` +
      `<p><strong>国・地域 / Region:</strong> ${escapeHtmlText(region.regions || "")}<br />` +
      `<strong>首都 / Capital:</strong> ${escapeHtmlText(region.capital || "")}</p>` +
      briefingList("🏙 主要都市 / Major cities", region.major_cities) +
      briefingList("🗺 観光名所 / Sights", region.sights) +
      briefingList("🍽 名物 / Famous food", region.foods) +
      briefingList("⭐ 有名人 / Famous people", region.people) +
      briefingList("🏢 有名な会社・ブランド / Well-known companies", companies) +
      briefingList("✨ その他有名なもの / Other well-known things", region.other) +
      `</div>`;
  }

  briefingProgressEl.innerHTML =
    `<p class="briefing-maintenance">✅ 情報の収集が終わりました(${total}/${total})。 / Finished gathering information.</p>`;
  briefingBodyEl.innerHTML = newsHtml + infoHtml;

  // 学習継続(既存の流れに接続): この話題をそのままAI講師との会話練習へ渡す。
  const topRegion = worldRegions[top] || {};
  lastBriefingText =
    `Let's talk about ${topRegion.countries_en || languageDisplayName(top)}. ` +
    `Capital: ${topRegion.capital || "?"}. Major cities: ${(topRegion.major_cities || []).slice(0, 3).join(", ")}. ` +
    `Famous sights: ${(topRegion.sights || []).slice(0, 2).join(", ")}. Famous food: ${(topRegion.foods || []).slice(0, 2).join(", ")}. ` +
    `Well-known companies: ${(topRegion.companies || []).slice(0, 2).map((c) => c.name).join(", ")}. ` +
    `Please help me practise small talk about these topics in ${topRegion.countries_en || languageDisplayName(top)}.`;
}

if (briefingModal) {
  const openBtn = document.getElementById("briefing-btn");
  if (openBtn) openBtn.addEventListener("click", runTopicBriefing);
  const closeBtn = document.getElementById("briefing-close");
  if (closeBtn) closeBtn.addEventListener("click", () => briefingModal.classList.add("hidden"));
  briefingModal.addEventListener("click", (e) => {
    if (e.target === briefingModal) briefingModal.classList.add("hidden");
  });
  const practiceBtn = document.getElementById("briefing-practice-btn");
  if (practiceBtn) {
    practiceBtn.addEventListener("click", () => {
      if (!lastBriefingText) return;
      briefingModal.classList.add("hidden");
      // 先頭の言語のトレーナーへ切り替えてから練習リクエストを送る
      // (既存の資格試験→トレーナーの導線と同じ考え方)。
      const top = multiSpeakTargetCodes()[0];
      if (learnTargetEl && learnTargetEl.querySelector(`option[value="world:${top}"]`)) {
        learnTargetEl.value = `world:${top}`;
      } else if (learnTargetEl && top === "ja") {
        learnTargetEl.value = "japanese";
      } else if (learnTargetEl && top === "en") {
        learnTargetEl.value = "english";
      }
      if (replyLangEl) replyLangEl.value = "hybrid";
      inputEl.value = lastBriefingText;
      formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }
}

// 起動時: 対応言語一覧を取得してメニューへ反映し、メンテナンス中(初回)は
// 言語追加の案内モーダルを自動で開く。
(async function initWorldLanguages() {
  // localStorageに設定が無い場合(ブラウザデータ消去後・別プロファイル等)は
  // サーバーDBから復元する。**必ず`worldLanguages`の取得より前に呼ぶこと**
  // ——メニュー構築より後だと復元が今回の描画に間に合わない(実機検証で
  // 「復元されない」実バグとして発覚したため、順序に依存する点をここに明記)。
  await restoreSettingsFromServer();
  await loadWorldRegions();
  worldLanguages = await fetchWorldLanguages();
  applyEnabledLanguagesToMenus();
  await loadMultiSpeakPhrases();
  refreshLanguageDependentUi();
  let alreadyPrompted = false;
  try {
    alreadyPrompted = localStorage.getItem(LANGUAGE_PROMPT_SHOWN_KEY) === "1";
  } catch (e) {
    alreadyPrompted = false;
  }
  const maintenanceVisible =
    document.getElementById("maintenance-banner") &&
    !document.getElementById("maintenance-banner").classList.contains("hidden");
  if (!alreadyPrompted && maintenanceVisible && worldLanguages.length > 0) {
    // メンテナンス(起動直後の60秒カウントダウン)の待ち時間に案内する。
    openLanguagePackModal();
    try {
      localStorage.setItem(LANGUAGE_PROMPT_SHOWN_KEY, "1");
    } catch (e) {
      /* 保存できない場合は毎回表示されるだけで実害は無い */
    }
  }
})();

if (examPrepBtn && examPrepModal) {
  examPrepBtn.addEventListener("click", () => {
    examPrepModal.classList.remove("hidden");
  });
  examPrepClose.addEventListener("click", () => examPrepModal.classList.add("hidden"));
  examPrepModal.addEventListener("click", (e) => {
    if (e.target === examPrepModal) examPrepModal.classList.add("hidden");
  });
  examPrepStartBtn.addEventListener("click", renderExamPrepQuiz);
  examPrepSubmitBtn.addEventListener("click", scoreExamPrepQuiz);
  examPrepPracticeBtn.addEventListener("click", practiceExamPrepWithTrainer);
}

// おすすめLLM機能(ユーザー指示、2026-08-17「メンテナンス時に…VRAMなどの
// 性能やCPUの性能やシステムメモリーの大きさやNPUがあるかないかなどの
// 最新の情報を元に、AIがオススメのLLMをインストールする時に、似たような
// LLMがあれば、それぞれの特徴をお知らせして…どちらのオープンソースの
// ローカルLLMになさいますか?と質問してくる機能と…もう一つ大きなサイズの
// LLMやもう一つ小さなLLMも御座いますとそれぞれのLLMの特徴もお知らせして
// LLMの選択機能」への対応)。ハードウェア検出(`GET /v1/recommend`)+
// モデルカタログ(`GET /v1/models/catalog`)は既にaruaru-llm側に実装
// 済み(2026-07-27、CLAUDE.md参照)——本機能はそれをopen-english側の
// UIとして初めて可視化し、推奨モデル・ワンサイズ上・ワンサイズ下の
// 3択を特徴つきで提示し、ボタン1つでインストール・切り替えできるように
// する。
const llmRecommendBtn = document.getElementById("llm-recommend-btn");
const llmRecommendModal = document.getElementById("llm-recommend-modal");
const llmRecommendClose = document.getElementById("llm-recommend-close");
const llmRecommendDetectBtn = document.getElementById("llm-recommend-detect");
const llmRecommendBody = document.getElementById("llm-recommend-body");

function catalogEntryLabel(entry) {
  return `${entry.display_name_en} / ${entry.display_name_ja} (~${entry.approx_size_mb}MB)`;
}

async function installAndSwitchModel(base, id, statusEl) {
  statusEl.textContent = `Installing & switching to ${id}… / ${id}へインストール・切替中…`;
  try {
    const installRes = await fetch(`${base}/v1/models/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!installRes.ok) throw new Error(`install HTTP ${installRes.status}`);
    const selectRes = await fetch(`${base}/v1/models/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!selectRes.ok) throw new Error(`select HTTP ${selectRes.status}`);
    statusEl.textContent = `✅ Switched to ${id} / ${id}へ切り替えました`;
  } catch (err) {
    statusEl.textContent = `⚠ Failed / 失敗しました: ${err.message}`;
  }
}

async function detectAndCompareLlm() {
  const base = apiBaseEl.value.trim();
  llmRecommendBody.innerHTML = "<p class=\"setup-note\">Detecting… / 検出中…</p>";
  try {
    const [recRes, catalogRes] = await Promise.all([fetch(`${base}/v1/recommend`), fetch(`${base}/v1/models/catalog`)]);
    if (!recRes.ok || !catalogRes.ok) throw new Error(`HTTP ${recRes.status}/${catalogRes.status}`);
    const rec = await recRes.json();
    const catalog = await catalogRes.json();
    const models = catalog.models.slice().sort((a, b) => a.approx_size_mb - b.approx_size_mb);
    const recIndex = models.findIndex((m) => m.id === rec.recommended_model_id);

    const choices = [];
    if (recIndex >= 0) choices.push({ role: "Recommended / おすすめ", entry: models[recIndex] });
    if (recIndex + 1 < models.length) choices.push({ role: "One size larger / もう一つ大きいサイズ", entry: models[recIndex + 1] });
    if (recIndex - 1 >= 0) choices.push({ role: "One size smaller / もう一つ小さいサイズ", entry: models[recIndex - 1] });

    const hwLine =
      `GPU: ${rec.hardware.gpu_name || "not detected / 未検出"} ` +
      `(VRAM: ${rec.hardware.vram_bytes ? Math.round(rec.hardware.vram_bytes / 1024 / 1024) + "MB" : "?"}, ` +
      `detection: ${rec.hardware.detection_path}) / ` +
      `GPU: ${rec.hardware.gpu_name || "未検出"} (VRAM: ${rec.hardware.vram_bytes ? Math.round(rec.hardware.vram_bytes / 1024 / 1024) + "MB" : "不明"}, 検出経路: ${rec.hardware.detection_path})`;

    llmRecommendBody.innerHTML = "";
    const hwP = document.createElement("p");
    hwP.className = "setup-note";
    hwP.textContent = hwLine;
    llmRecommendBody.appendChild(hwP);

    const questionP = document.createElement("p");
    questionP.className = "setup-note";
    questionP.textContent =
      "Similar open-source local LLMs are available — which would you like? / " +
      "似たようなオープンソースのローカルLLMがあります。どちらになさいますか?";
    llmRecommendBody.appendChild(questionP);

    choices.forEach((choice) => {
      const row = document.createElement("div");
      row.className = "settings-field";
      const label = document.createElement("div");
      label.textContent = `${choice.role}: ${catalogEntryLabel(choice.entry)}`;
      row.appendChild(label);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "setup-btn";
      btn.textContent = `Use this / これにする (${choice.entry.id})`;
      const statusEl = document.createElement("p");
      statusEl.className = "setup-note";
      btn.addEventListener("click", () => installAndSwitchModel(base, choice.entry.id, statusEl));
      row.appendChild(btn);
      row.appendChild(statusEl);
      llmRecommendBody.appendChild(row);
    });
  } catch (err) {
    llmRecommendBody.innerHTML = `<p class="setup-note">⚠ Could not detect/compare / 検出・比較できませんでした: ${err.message}</p>`;
  }
}

if (llmRecommendBtn && llmRecommendModal) {
  llmRecommendBtn.addEventListener("click", () => llmRecommendModal.classList.remove("hidden"));
  llmRecommendClose.addEventListener("click", () => llmRecommendModal.classList.add("hidden"));
  llmRecommendModal.addEventListener("click", (e) => {
    if (e.target === llmRecommendModal) llmRecommendModal.classList.add("hidden");
  });
  llmRecommendDetectBtn.addEventListener("click", detectAndCompareLlm);
}

// AIでプログラミング / AI Coding Assistantパネル(ユーザー指示「UPLOADと
// ダウンロード機能とGUIでローカルドライブ指定も可能な、CLAUDEなら
// CLAUDE CODE DESKTOPもマウスで選択可能に」への対応、2026-08-20新設)。
// 正直な開示: ブラウザはサンドボックス化されており(1)任意のローカル
// ドライブへ自由にアクセスすること、(2)このページからClaude Code Desktop
// のような別のデスクトップアプリを起動すること、のいずれも技術的に
// できない。実現できる範囲は、ユーザーが明示的に選んだファイル/フォルダ
// へのアクセス(File System Access API、Chromium系のみ)・ダウンロード・
// 選択したAIツールの公式サイトへの案内リンク表示にとどめた
// (誇張しないこと、ユーザー指示より)。
const aiCodingBtn = document.getElementById("ai-coding-btn");
const aiCodingModal = document.getElementById("ai-coding-modal");
const aiCodingClose = document.getElementById("ai-coding-close");
const aiCodingUploadEl = document.getElementById("ai-coding-upload");
const aiCodingUploadStatusEl = document.getElementById("ai-coding-upload-status");
const aiCodingFolderBtn = document.getElementById("ai-coding-folder-btn");
const aiCodingFolderStatusEl = document.getElementById("ai-coding-folder-status");
const aiCodingDownloadBtn = document.getElementById("ai-coding-download-btn");
const aiCodingDownloadStatusEl = document.getElementById("ai-coding-download-status");
const aiCodingToolSelectEl = document.getElementById("ai-coding-tool-select");
const aiCodingToolLinkBtn = document.getElementById("ai-coding-tool-link-btn");
const aiCodingToolStatusEl = document.getElementById("ai-coding-tool-status");

let aiCodingUploadedFiles = [];

if (aiCodingBtn && aiCodingModal) {
  aiCodingBtn.addEventListener("click", () => aiCodingModal.classList.remove("hidden"));
  aiCodingClose.addEventListener("click", () => aiCodingModal.classList.add("hidden"));
  aiCodingModal.addEventListener("click", (e) => {
    if (e.target === aiCodingModal) aiCodingModal.classList.add("hidden");
  });
}

if (aiCodingUploadEl) {
  aiCodingUploadEl.addEventListener("change", () => {
    aiCodingUploadedFiles = Array.from(aiCodingUploadEl.files || []);
    if (aiCodingUploadedFiles.length === 0) {
      aiCodingUploadStatusEl.textContent = "No files selected. / ファイル未選択です。";
      return;
    }
    const list = aiCodingUploadedFiles
      .map((f) => `${f.name} (${formatBytes(f.size)})`)
      .join(", ");
    aiCodingUploadStatusEl.textContent =
      `Selected ${aiCodingUploadedFiles.length} file(s): ${list} / ` +
      `${aiCodingUploadedFiles.length}件のファイルを選択しました: ${list}`;
  });
}

// フォルダ選択(File System Access API、Chromium系ブラウザのみ対応)。
// 非対応ブラウザではボタンをdisabledにし、正直な非対応メッセージを表示する。
if (aiCodingFolderBtn) {
  if (typeof window.showDirectoryPicker !== "function") {
    aiCodingFolderBtn.disabled = true;
    aiCodingFolderStatusEl.textContent =
      "Your browser does not support folder selection (showDirectoryPicker is only available " +
      "in Chromium-based browsers such as Chrome/Edge). / お使いのブラウザはフォルダ選択に" +
      "対応していません(showDirectoryPickerはChrome/EdgeなどChromium系ブラウザのみ対応です)。";
  } else {
    aiCodingFolderBtn.addEventListener("click", async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const entryNames = [];
        for await (const [name, handle] of dirHandle.entries()) {
          entryNames.push(`${name}${handle.kind === "directory" ? "/" : ""}`);
          if (entryNames.length >= 50) {
            entryNames.push("… (truncated / 省略)");
            break;
          }
        }
        aiCodingFolderStatusEl.textContent =
          `Selected folder: "${dirHandle.name}" (${entryNames.length} top-level entries shown) / ` +
          `選択したフォルダ: 「${dirHandle.name}」(トップレベルの項目 ${entryNames.length}件を表示)\n` +
          entryNames.join(", ");
      } catch (e) {
        // ユーザーがダイアログをキャンセルした場合もここに来る(AbortError)。
        if (e && e.name === "AbortError") {
          aiCodingFolderStatusEl.textContent = "Cancelled. / キャンセルされました。";
        } else {
          aiCodingFolderStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
        }
      }
    });
  }
}

if (aiCodingDownloadBtn) {
  aiCodingDownloadBtn.addEventListener("click", () => {
    if (aiCodingUploadedFiles.length === 0) {
      aiCodingDownloadStatusEl.textContent =
        "Please upload file(s) above first. / まず上でファイルをアップロードしてください。";
      return;
    }
    aiCodingUploadedFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // メモリリーク回避のため、少し待ってからURLを解放する。
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
    aiCodingDownloadStatusEl.textContent =
      `Triggered download for ${aiCodingUploadedFiles.length} file(s). / ` +
      `${aiCodingUploadedFiles.length}件のファイルのダウンロードを開始しました。`;
  });
}

// AIツール案内リンク(正直な開示: リンク表示のみ、起動はできない)。
const AI_CODING_TOOL_LINKS = {
  "claude-code-desktop": {
    url: "https://claude.com/product/claude-code",
    label_en: "Claude Code Desktop official page",
    label_ja: "Claude Code Desktop公式ページ",
  },
  "claude-code-cli": {
    url: "https://docs.claude.com/en/docs/claude-code/overview",
    label_en: "Claude Code (CLI) documentation",
    label_ja: "Claude Code(CLI)ドキュメント",
  },
  "claude-ai": {
    url: "https://claude.ai/",
    label_en: "Claude.ai",
    label_ja: "Claude.ai",
  },
  "chatgpt": {
    url: "https://chat.openai.com/",
    label_en: "ChatGPT",
    label_ja: "ChatGPT",
  },
  "gemini": {
    url: "https://gemini.google.com/",
    label_en: "Google Gemini",
    label_ja: "Google Gemini",
  },
  "deepseek": {
    url: "https://www.deepseek.com/",
    label_en: "DeepSeek",
    label_ja: "DeepSeek",
  },
  "copilot": {
    url: "https://copilot.microsoft.com/",
    label_en: "Microsoft Copilot",
    label_ja: "Microsoft Copilot",
  },
  "github-copilot": {
    url: "https://github.com/features/copilot",
    label_en: "GitHub Copilot",
    label_ja: "GitHub Copilot",
  },
};

if (aiCodingToolLinkBtn) {
  aiCodingToolLinkBtn.addEventListener("click", () => {
    const key = aiCodingToolSelectEl?.value;
    const entry = AI_CODING_TOOL_LINKS[key];
    if (!entry) return;
    window.open(entry.url, "_blank", "noopener,noreferrer");
    aiCodingToolStatusEl.textContent =
      `Opened: ${entry.label_en} (${entry.url}) — this only opens a link, it cannot launch a ` +
      `desktop app for you. / 開きました: ${entry.label_ja}(${entry.url})——リンクを開くのみで、` +
      `デスクトップアプリを起動することはできません。`;
  });
}

// ============================================================================
// world-lab(2026-08-24新設、ユーザー指示「遊休デバイスをUSB/Wi-Fi/
// Bluetooth/LANで繋いでハードウェアアクセラレータを共有」への対応)
// ----------------------------------------------------------------------------
// バックエンドは`server/src/world_lab.rs`。既定でサーバー側が無効
// (二段階のオプトイン)なため、このUIから叩いても大抵は「無効です」と
// 返ってくるのが正常な状態——それ自体をエラー扱いで壊れて見せないこと。
// ============================================================================
// ============================================================================
// アイコン起動・独自URL(DuckDNS)パネル(2026-08-25新設、ユーザー指示
// 「アイコンクリックで起動するか、URLをお気に入りに入れて、DuckDNSや
// 好きなURLを割り当て可能に」への対応)。
// バックエンドは`server/src/main.rs`の`POST /v1/duckdns/update`
// (DuckDNSのIP更新APIをサーバー側から叩くだけの薄いプロキシ)。
// **重要**: これはドメイン名をIPへ結びつけるだけで、ポート開放・
// TLS終端は一切行わない(パネル内の`.setup-honest`に明記済み)。
// ============================================================================
// 公開/非公開の常時表示バッジ(ユーザー指示「公開サーバーか非公開サーバー
// かはいつでも選択可能として、公開か非公開かは英語と日本語はいつでも
// 表示して選択した言語でも表示して」への対応、2026-08-25新設)。
// バックエンドは`GET /v1/network/status`(`server/src/main.rs`新設)。
// **正直な開示**: 「選択可能」の実体は環境変数
// `OPEN_ENGLISH_SERVER_BIND`+再起動であり、このボタン一発でその場
// 切り替えはできない(ルーターのポート開放を伴わない安全設計、詳細は
// custom-url-modalの開示文参照)——このバッジはあくまで「今どちらの
// 状態か」を常時表示し、切り替え手順は詳細パネルへ案内する。
const networkStatusBadge = document.getElementById("network-status-badge");
const networkStatusTextEl = document.getElementById("network-status-text");
// 「選択した言語でも表示」に対応する簡易辞書。既存の全対応言語を
// 網羅する翻訳基盤は無いため(正直な開示)、既に他機能でも訳文を
// 用意している主要言語のみをここでも収録し、未収録言語は英日併記の
// 既定へフォールバックする。
const NETWORK_STATUS_LABELS = {
  es: { private: "Privado", public: "Público" },
  fr: { private: "Privé", public: "Public" },
  de: { private: "Privat", public: "Öffentlich" },
  it: { private: "Privato", public: "Pubblico" },
  pt: { private: "Privado", public: "Público" },
  nl: { private: "Privé", public: "Openbaar" },
  ru: { private: "Приватный", public: "Публичный" },
  zh: { private: "私密", public: "公开" },
  "zh-Hant": { private: "私密", public: "公開" },
  ko: { private: "비공개", public: "공개" },
  ar: { private: "خاص", public: "عام" },
  hi: { private: "निजी", public: "सार्वजनिक" },
  tr: { private: "Özel", public: "Herkese açık" },
  vi: { private: "Riêng tư", public: "Công khai" },
  th: { private: "ส่วนตัว", public: "สาธารณะ" },
  id: { private: "Pribadi", public: "Publik" },
};

async function refreshNetworkStatus() {
  if (!networkStatusBadge || !networkStatusTextEl) return;
  try {
    const res = await fetch(`${apiBaseEl ? apiBaseEl.value.replace(/\/$/, "") : ""}/v1/network/status`);
    const data = await res.json();
    const isPublic = !!data.is_public;
    networkStatusBadge.classList.toggle("is-public", isPublic);
    const langCode = quizPreferredLangCode();
    const extra = langCode && NETWORK_STATUS_LABELS[langCode] ? ` / ${isPublic ? NETWORK_STATUS_LABELS[langCode].public : NETWORK_STATUS_LABELS[langCode].private}` : "";
    const icon = isPublic ? "🌐" : "🔒";
    const enJa = isPublic ? "Public / 公開" : "Private (loopback only) / 非公開(ループバック限定)";
    networkStatusTextEl.textContent = `${icon} ${enJa}${extra}`;
    networkStatusBadge.title = `${data.note_en || ""} / ${data.note_ja || ""}`;
  } catch (e) {
    networkStatusTextEl.textContent = "🔒 Private (server unreachable) / 非公開(サーバー未接続)";
    networkStatusBadge.classList.remove("is-public");
  }
}

if (networkStatusBadge) {
  networkStatusBadge.addEventListener("click", () => {
    const modal = document.getElementById("custom-url-modal");
    if (modal) {
      modal.classList.remove("hidden");
      const here = window.location.href;
      const currentEl = document.getElementById("custom-url-current");
      const currentJaEl = document.getElementById("custom-url-current-ja");
      if (currentEl) currentEl.textContent = here;
      if (currentJaEl) currentJaEl.textContent = here;
    }
  });
  refreshNetworkStatus();
  setInterval(refreshNetworkStatus, 30000);
}

const customUrlBtn = document.getElementById("custom-url-btn");
const customUrlModal = document.getElementById("custom-url-modal");
const customUrlClose = document.getElementById("custom-url-close");
const duckdnsDomainEl = document.getElementById("duckdns-domain");
const duckdnsTokenEl = document.getElementById("duckdns-token");
const duckdnsUpdateBtn = document.getElementById("duckdns-update-btn");
const duckdnsStatusEl = document.getElementById("duckdns-status");

if (customUrlBtn && customUrlModal) {
  customUrlBtn.addEventListener("click", () => {
    customUrlModal.classList.remove("hidden");
    const here = window.location.href;
    const currentEl = document.getElementById("custom-url-current");
    const currentJaEl = document.getElementById("custom-url-current-ja");
    if (currentEl) currentEl.textContent = here;
    if (currentJaEl) currentJaEl.textContent = here;
  });
  customUrlClose.addEventListener("click", () => customUrlModal.classList.add("hidden"));
  customUrlModal.addEventListener("click", (e) => {
    if (e.target === customUrlModal) customUrlModal.classList.add("hidden");
  });
}

if (duckdnsUpdateBtn) {
  duckdnsUpdateBtn.addEventListener("click", async () => {
    const domain = duckdnsDomainEl ? duckdnsDomainEl.value.trim() : "";
    const token = duckdnsTokenEl ? duckdnsTokenEl.value.trim() : "";
    if (!domain || !token) {
      if (duckdnsStatusEl) duckdnsStatusEl.textContent = "Please enter both a subdomain and a token. / サブドメインとトークンの両方を入力してください。";
      return;
    }
    if (duckdnsStatusEl) duckdnsStatusEl.textContent = "Updating… / 更新中…";
    try {
      const res = await fetch(`${apiBaseEl ? apiBaseEl.value.replace(/\/$/, "") : ""}/v1/duckdns/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, token }),
      });
      const data = await res.json();
      if (data.ok) {
        duckdnsStatusEl.textContent = `Done! Your URL is ${data.assigned_url} — but see the honest disclosure above: this alone does not open your router or add TLS. / 完了しました！URLは ${data.assigned_url} です——ただし上記の正直な開示の通り、これだけではルーターのポートは開かずTLSも付きません。`;
      } else {
        duckdnsStatusEl.textContent = `Failed: ${data.duckdns_response || data.error || "unknown error"} / 失敗しました: ${data.duckdns_response || data.error || "不明なエラー"}`;
      }
    } catch (e) {
      duckdnsStatusEl.textContent = `Failed to reach the server: ${e.message} / サーバーへ接続できませんでした: ${e.message}`;
    }
  });
}

const worldLabBtn = document.getElementById("world-lab-btn");
const worldLabModal = document.getElementById("world-lab-modal");
const worldLabClose = document.getElementById("world-lab-close");
const worldLabRefreshBtn = document.getElementById("world-lab-refresh-btn");
const worldLabStatusInfoEl = document.getElementById("world-lab-status-info");
const worldLabPairTokenEl = document.getElementById("world-lab-pair-token");
const worldLabPairNameEl = document.getElementById("world-lab-pair-name");
const worldLabPairConnectionEl = document.getElementById("world-lab-pair-connection");
const worldLabPairBtn = document.getElementById("world-lab-pair-btn");
const worldLabPairKindEl = document.getElementById("world-lab-pair-kind");
const worldLabPairCapGpuEl = document.getElementById("world-lab-pair-cap-gpu");
const worldLabPairCapNpuEl = document.getElementById("world-lab-pair-cap-npu");
const worldLabPairStatusEl = document.getElementById("world-lab-pair-status");
const worldLabDeviceListEl = document.getElementById("world-lab-device-list");
const WORLD_LAB_KIND_ICONS = { phone: "📱", tablet: "📲", pc: "🖥", other: "❓" };
const worldLabTaskWasmEl = document.getElementById("world-lab-task-wasm");
const worldLabTaskInputEl = document.getElementById("world-lab-task-input");
const worldLabTaskRunBtn = document.getElementById("world-lab-task-run-btn");
const worldLabTaskStatusEl = document.getElementById("world-lab-task-status");

if (worldLabBtn && worldLabModal) {
  worldLabBtn.addEventListener("click", () => {
    worldLabModal.classList.remove("hidden");
    refreshWorldLabStatus();
    refreshWorldLabDevices();
    autoDetectWorldLabPairFields();
  });
  worldLabClose.addEventListener("click", () => worldLabModal.classList.add("hidden"));
  worldLabModal.addEventListener("click", (e) => {
    if (e.target === worldLabModal) worldLabModal.classList.add("hidden");
  });
}

/// **このデバイス自身のハードウェア種別/能力の自動検出(2026-08-25
/// 追加、ユーザー指示「ハードウェアによるハードウェアアクセラレータ
/// サポートに自動対応して」への対応)**。
///
/// **正直な開示・意図的にやっていないこと(重要)**: これは「ペアリング
/// フォームの入力欄を、既に画面上にある実測情報からあらかじめ埋めて
/// 手間を減らす」だけの機能であり、**トークン無しでの自動ペアリング・
/// 自動接続は行わない**——踏み台化防止のためペアリングには常に明示的な
/// トークン入力+「ペアリング」ボタンのクリックが必要、という設計は
/// 変更していない(このファイル冒頭のworld-lab関連コメント参照)。
/// - デバイス種別: `navigator.userAgent`からの簡易推測(タブレット/
///   スマホ/PC)。**推測に過ぎず、利用者はいつでもセレクトで上書き
///   できる**。
/// - GPU: 既に定期ポーリングしている`lastRuntimeInfo.gpu_in_use`
///   (aruaru-llm側`GET /v1/runtime`の実測結果、新しいfetchは追加で
///   発生させない)を流用。未接続・未計測なら何もチェックしない。
/// - NPU: このアプリには信頼できる自動検出手段が無いため、常に
///   未チェックのまま(利用者が知っていれば手動でチェックする)。
function autoDetectWorldLabPairFields() {
  if (worldLabPairKindEl) {
    const ua = navigator.userAgent || "";
    if (/iPad|Tablet(?!.*Mobile)/i.test(ua)) {
      worldLabPairKindEl.value = "tablet";
    } else if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) {
      worldLabPairKindEl.value = "phone";
    } else {
      worldLabPairKindEl.value = "pc";
    }
  }
  if (worldLabPairCapGpuEl && lastRuntimeInfo && lastRuntimeInfo.gpu_in_use) {
    worldLabPairCapGpuEl.checked = true;
  }
}

async function refreshWorldLabStatus() {
  if (!worldLabStatusInfoEl) return;
  worldLabStatusInfoEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/world-lab/status");
    const info = await res.json();
    const en = info.enabled ? "ENABLED (pairing)" : "disabled";
    const ja = info.enabled ? "有効(ペアリング)" : "無効";
    const byKind = info.paired_by_kind || {};
    const kindSummary = `📱${byKind.phone ?? 0} 📲${byKind.tablet ?? 0} 🖥${byKind.pc ?? 0} ❓${byKind.other ?? 0}`;
    worldLabStatusInfoEl.textContent =
      `Status: ${en}, paired devices: ${info.paired_device_count ?? 0} (${kindSummary}) / ` +
      `状態: ${ja}、ペアリング済みデバイス数: ${info.paired_device_count ?? 0}(${kindSummary})\n` +
      `${info.disclosure_en || ""}\n${info.disclosure_ja || ""}\n${info.capabilities_disclosure_en || ""}\n${info.capabilities_disclosure_ja || ""}\n${info.wan_disclosure_en || ""}\n${info.wan_disclosure_ja || ""}`;
  } catch (e) {
    worldLabStatusInfoEl.textContent = `Failed to load status: ${e.message} / 状態の取得に失敗しました: ${e.message}`;
  }
}

async function refreshWorldLabDevices() {
  if (!worldLabDeviceListEl) return;
  worldLabDeviceListEl.textContent = "Loading… / 読み込み中…";
  try {
    const res = await fetch("/v1/world-lab/devices");
    const body = await res.json();
    if (!res.ok || !body.ok) {
      worldLabDeviceListEl.textContent = `${body.error || "unknown error"} / ${body.error || "不明なエラー"}`;
      return;
    }
    const devices = Array.isArray(body.devices) ? body.devices : [];
    if (devices.length === 0) {
      worldLabDeviceListEl.textContent = "No devices paired yet. / まだペアリング済みのデバイスはありません。";
      return;
    }
    worldLabDeviceListEl.textContent = "";
    devices.forEach((d) => {
      const row = document.createElement("div");
      const when = new Date(d.paired_at_unix * 1000).toLocaleString();
      const icon = WORLD_LAB_KIND_ICONS[d.kind] || WORLD_LAB_KIND_ICONS.other;
      const caps = Array.isArray(d.capabilities) && d.capabilities.length ? d.capabilities.join("+").toUpperCase() : "cpu (default) / 既定";
      row.textContent = `${icon} ${d.device_name} (${d.kind || "other"}, ${d.connection}, ${caps}, id=${d.device_id}, paired ${when}) `;
      const unpairBtn = document.createElement("button");
      unpairBtn.type = "button";
      unpairBtn.className = "setup-btn";
      unpairBtn.textContent = "✕ Unpair / 解除";
      unpairBtn.addEventListener("click", async () => {
        try {
          const r = await fetch("/v1/world-lab/unpair", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: d.device_id }),
          });
          const rb = await r.json();
          if (r.ok && rb.ok) refreshWorldLabDevices();
        } catch (e) {
          // 一覧の再読み込みで利用者に現状を見せれば十分——ここでは握りつぶす。
        }
      });
      row.appendChild(unpairBtn);
      worldLabDeviceListEl.appendChild(row);
    });
  } catch (e) {
    worldLabDeviceListEl.textContent = `Failed to load devices: ${e.message} / デバイス一覧の取得に失敗しました: ${e.message}`;
  }
}

// 「関連ツール」導線(2026-08-25追加、ユーザー指示「world-labの標準
// 機能にopen-englishやCopilot支援機能やaruaru-llm支援機能を」への
// 対応)。**実体の無い連携を装わない**——world-lab側に新しいロジックは
// 増やさず、既存の「⚙ Setup aruaru-llm」「🖥️ AI Coding Assistant」
// パネル(Copilotのリンクも含む、上記`AI_CODING_TOOL_LINKS`参照)を
// world-labモーダルを閉じてから開くだけの単純な導線。
const worldLabGotoAruaruLlmBtn = document.getElementById("world-lab-goto-aruaru-llm-btn");
const worldLabGotoAiCodingBtn = document.getElementById("world-lab-goto-ai-coding-btn");
if (worldLabGotoAruaruLlmBtn) {
  worldLabGotoAruaruLlmBtn.addEventListener("click", () => {
    worldLabModal?.classList.add("hidden");
    setupModal?.classList.remove("hidden");
  });
}
if (worldLabGotoAiCodingBtn) {
  worldLabGotoAiCodingBtn.addEventListener("click", () => {
    worldLabModal?.classList.add("hidden");
    aiCodingModal?.classList.remove("hidden");
  });
}

// open-cg-cad(AI工務店&AI建設)への導線(2026-08-25追加、open-cg-cad側の
// HANDOFF「open-english側からopen-cg-cadへのリンク・インストール導線が
// 未着手」への対応)。open-cg-cadは別アプリ(別サーバー/別ポート)のため
// 上記2つと違いモーダル切替ではなく実際に別タブで開く。**正直な開示**:
// 専用の連携APIは無く、単純な外部リンク+localStorage経由のURLヒント
// 受け渡しのみ(open-cg-cad/server/src/index.htmlが読む
// "open-cg-cad.openEnglishBase"キーに、自分自身のURLを書き込んでおく
// ことで、easy-web.tokyo等の同一オリジン配下にpath prefixで両アプリが
// 同居している本番環境では、open-cg-cad側の「← open-englishへ戻る」
// リンクが正しい戻り先を指せるようにする——ローカル開発時(別ポート=
// 別オリジン)はlocalStorageが共有されないため効果が無いが実害も無い)。
const worldLabGotoCgCadBtn = document.getElementById("world-lab-goto-cg-cad-btn");
if (worldLabGotoCgCadBtn) {
  worldLabGotoCgCadBtn.addEventListener("click", () => {
    const isLocalHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
    // 本番デプロイ(easy-web.tokyo等)では、open-cg-cadも同一オリジン配下に
    // path prefixで同居しているため、そちらを既定にする(2026-08-27、
    // 実際にeasy-web.tokyo/open-cg-cad/がVPS上で200を返すことを確認済み)。
    // ローカル開発時(別ポート=別オリジン)は従来通りlocalhost既定のまま。
    const defaultCgCadBase = isLocalHost
      ? "http://127.0.0.1:4701/"
      : location.origin + "/open-cg-cad/";
    let cgCadBase = defaultCgCadBase;
    try {
      cgCadBase = localStorage.getItem("open-english.cgCadBase") || defaultCgCadBase;
      const ownBase = location.origin + location.pathname.replace(/[^/]*$/, "");
      localStorage.setItem("open-cg-cad.openEnglishBase", ownBase);
    } catch (e) { /* localStorage不可でも既定URLでのリンクは機能する */ }
    window.open(cgCadBase, "_blank", "noopener");
  });
}

if (worldLabRefreshBtn) {
  worldLabRefreshBtn.addEventListener("click", () => {
    refreshWorldLabStatus();
    refreshWorldLabDevices();
  });
}

// 2026-08-27新設: open-cg-cadの図面操作(UPLOAD/合成/再設計)パネル
// (ユーザー指示「open-englishのチャットで、open-cg-cadで図面のUPLOADや
// 複数図面の合成や手直しの指示なども出来るようにしたい」への対応)。
// **正直な開示**: open-cg-cad側のAPIをこのページから直接fetchするのみ
// (open-english自体のチャットAIは介在しない)。本番デプロイ
// (easy-web.tokyo)ではopen-english/open-cg-cadが同一オリジン配下に
// path prefixで同居しているため、fetchはCORS制約に引っかからない
// (open-cg-cad側index.htmlの「共有ログイン状態」表示と同じ前提)。
// ローカル開発時(別ポート=別オリジン)はopen-cg-cad-server側がCORSを
// 有効化していないため失敗しうる——その場合もエラーメッセージを正直に
// 表示するのみで、他機能には影響しない。
(function () {
  const modal = document.getElementById("cg-cad-drawing-ops-modal");
  const openBtn = document.getElementById("cg-cad-drawing-ops-btn");
  const closeBtn = document.getElementById("cg-cad-drawing-ops-close");
  if (!modal || !openBtn) return;

  function cgCadOpsBase() {
    const isLocalHost = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
    const defaultBase = isLocalHost ? "http://127.0.0.1:4701/" : location.origin + "/open-cg-cad/";
    try {
      return localStorage.getItem("open-english.cgCadBase") || defaultBase;
    } catch (e) {
      return defaultBase;
    }
  }

  function showOpsResult(text) {
    const el = document.getElementById("cg-cad-ops-result");
    if (el) el.textContent = text;
  }

  function cgCadAruaruLlmBaseOverride() {
    const el = document.getElementById("cg-cad-aruaru-llm-base");
    const v = (el?.value || "").trim();
    return v.length > 0 ? v : undefined;
  }

  openBtn.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });
  if (closeBtn) {
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  const uploadFileInput = document.getElementById("cg-cad-upload-file");
  const uploadBtn = document.getElementById("cg-cad-upload-btn");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      const filenameEl = document.getElementById("cg-cad-upload-filename");
      const categoryEl = document.getElementById("cg-cad-upload-category");
      const descriptionEl = document.getElementById("cg-cad-upload-description");
      const statusEl = document.getElementById("cg-cad-upload-status");
      const filename = (filenameEl?.value || "").trim();
      if (!filename) {
        if (statusEl) statusEl.textContent = "Filename is required. / ファイル名が必要です。";
        return;
      }
      let dataBase64 = "e30="; // "{}" — ファイル未選択時の既定値(空のプレースホルダ)
      const file = uploadFileInput?.files?.[0];
      if (file) {
        const buf = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        dataBase64 = btoa(binary);
      }
      if (statusEl) statusEl.textContent = "Uploading… / アップロード中…";
      try {
        const resp = await fetch(cgCadOpsBase() + "v1/drawings/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename,
            category: categoryEl?.value || "other",
            description: descriptionEl?.value || "",
            data_base64: dataBase64,
          }),
        });
        const data = await resp.json();
        if (data.ok) {
          if (statusEl) statusEl.textContent = `✅ Uploaded as drawing #${data.id} / 図面#${data.id}として保存しました`;
        } else {
          if (statusEl) statusEl.textContent = `❌ ${data.error || "upload failed"}`;
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = `❌ Could not reach open-cg-cad / open-cg-cadへ到達できませんでした: ${e}`;
      }
    });
  }

  const mergeBtn = document.getElementById("cg-cad-merge-btn");
  if (mergeBtn) {
    mergeBtn.addEventListener("click", async () => {
      const idsEl = document.getElementById("cg-cad-merge-ids");
      const instructionEl = document.getElementById("cg-cad-merge-instruction");
      const ids = (idsEl?.value || "")
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      if (ids.length < 2) {
        showOpsResult("Please enter at least 2 drawing IDs, comma-separated. / 図面IDを2件以上、カンマ区切りで入力してください。");
        return;
      }
      showOpsResult("Merging… (this calls aruaru-llm via open-cg-cad, may take a while) / 合成中…(open-cg-cad経由でaruaru-llmを呼びます、時間がかかる場合があります)");
      try {
        const resp = await fetch(cgCadOpsBase() + "v1/drawings/merge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ drawing_ids: ids, instruction_text: instructionEl?.value || undefined, aruaru_llm_base: cgCadAruaruLlmBaseOverride() }),
        });
        const data = await resp.json();
        showOpsResult(data.ok ? `✅ Saved as drawing #${data.id}:\n\n${data.proposal}` : `❌ ${data.error || "merge failed"}`);
      } catch (e) {
        showOpsResult(`❌ Could not reach open-cg-cad / open-cg-cadへ到達できませんでした: ${e}`);
      }
    });
  }

  const redesignBtn = document.getElementById("cg-cad-redesign-btn");
  if (redesignBtn) {
    redesignBtn.addEventListener("click", async () => {
      const oldIdEl = document.getElementById("cg-cad-redesign-old-id");
      const instructionEl = document.getElementById("cg-cad-redesign-instruction");
      const oldId = parseInt(oldIdEl?.value || "", 10);
      if (!Number.isFinite(oldId)) {
        showOpsResult("Please enter the old drawing's ID. / 旧図面のIDを入力してください。");
        return;
      }
      showOpsResult("Redesigning… (this calls aruaru-llm via open-cg-cad, may take a while) / 再設計中…(open-cg-cad経由でaruaru-llmを呼びます、時間がかかる場合があります)");
      try {
        const resp = await fetch(cgCadOpsBase() + "v1/drawings/redesign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ old_drawing_id: oldId, instruction_text: instructionEl?.value || undefined, aruaru_llm_base: cgCadAruaruLlmBaseOverride() }),
        });
        const data = await resp.json();
        showOpsResult(data.ok ? `✅ Saved as drawing #${data.id}:\n\n${data.proposal}` : `❌ ${data.error || "redesign failed"}`);
      } catch (e) {
        showOpsResult(`❌ Could not reach open-cg-cad / open-cg-cadへ到達できませんでした: ${e}`);
      }
    });
  }

  // 2026-08-27新設: GitHubトークンの復号・利用をvault.html(クロス
  // オリジンiframeサンドボックス)内に隔離しつつ、open-cg-cadサーバー
  // 自身のGitHub書き込みAPI(POST /v1/agent/github/commit、
  // `github_agent::commit_file`)を呼び出す(ユーザー指示「open-cg-cadの
  // GitHub書き込みを…vault.html経由で呼び出すUIを配線して」への対応)。
  // 既存のフリーランス開発コーナーの`freelanceRequestVaultGithubPush`
  // と同型のpostMessageプロトコル(`freelanceVaultLoadBtn`のロード
  // ロジックも参照)だが、こちらは新規リポジトリ作成ではなく既存
  // リポジトリの既存パスへのcommitを行う専用メッセージ型
  // (`vault:cgCadGithubCommit`)を使う。
  const cgCadGithubVaultIframeEl = document.getElementById("cg-cad-github-vault-iframe");
  let cgCadGithubVaultOrigin = null;

  const cgCadGithubVaultLoadBtn = document.getElementById("cg-cad-github-vault-load-btn");
  if (cgCadGithubVaultLoadBtn) {
    cgCadGithubVaultLoadBtn.addEventListener("click", () => {
      const urlEl = document.getElementById("cg-cad-github-vault-url");
      const statusEl = document.getElementById("cg-cad-github-vault-status");
      const url = (urlEl?.value || "").trim();
      if (!url) {
        if (statusEl) statusEl.textContent = "⚠ vault.htmlのURLを入力してください / Please enter the vault.html URL";
        return;
      }
      let vaultUrlObj;
      try {
        vaultUrlObj = new URL(url);
      } catch {
        if (statusEl) statusEl.textContent = "⚠ 無効なURLです / Invalid URL";
        return;
      }
      cgCadGithubVaultOrigin = vaultUrlObj.origin;
      vaultUrlObj.searchParams.set("parentOrigin", window.location.origin);
      if (cgCadGithubVaultIframeEl) {
        cgCadGithubVaultIframeEl.src = vaultUrlObj.toString();
        cgCadGithubVaultIframeEl.classList.remove("hidden");
      }
      if (statusEl) {
        const sameOrigin = cgCadGithubVaultOrigin === window.location.origin;
        statusEl.textContent = sameOrigin
          ? "⚠ 読み込みました(同一オリジンのため分離効果はありません) / Loaded (same-origin, no isolation benefit)"
          : "✅ 読み込みました(別オリジン) / Loaded (cross-origin)";
      }
    });
  }

  function cgCadRequestVaultGithubCommit(args) {
    return new Promise((resolve, reject) => {
      if (!cgCadGithubVaultIframeEl || !cgCadGithubVaultIframeEl.contentWindow || !cgCadGithubVaultOrigin) {
        reject(new Error("Vaultが読み込まれていません。先に読み込んでください。 / Vault is not loaded yet — load it first."));
        return;
      }
      const requestId = `${Date.now()}-${Math.random()}`;
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Vaultからの応答がタイムアウトしました。 / Timed out waiting for a response from the vault."));
      }, 30000);
      function onMessage(event) {
        if (event.origin !== cgCadGithubVaultOrigin) return;
        const data = event.data || {};
        if (data.type !== "vault:cgCadGithubCommitResult" || data.requestId !== requestId) return;
        clearTimeout(timeoutId);
        window.removeEventListener("message", onMessage);
        if (data.ok) resolve(data.url);
        else reject(new Error(data.error || "unknown vault error"));
      }
      window.addEventListener("message", onMessage);
      cgCadGithubVaultIframeEl.contentWindow.postMessage({ type: "vault:cgCadGithubCommit", requestId, ...args }, cgCadGithubVaultOrigin);
    });
  }

  const cgCadGithubCommitBtn = document.getElementById("cg-cad-github-commit-btn");
  if (cgCadGithubCommitBtn) {
    cgCadGithubCommitBtn.addEventListener("click", async () => {
      const statusEl = document.getElementById("cg-cad-github-status");
      const drawingId = parseInt(document.getElementById("cg-cad-github-drawing-id")?.value || "", 10);
      const owner = (document.getElementById("cg-cad-github-owner")?.value || "").trim();
      const repo = (document.getElementById("cg-cad-github-repo")?.value || "").trim();
      const path = (document.getElementById("cg-cad-github-path")?.value || "").trim();
      const branch = (document.getElementById("cg-cad-github-branch")?.value || "").trim() || undefined;
      const message = (document.getElementById("cg-cad-github-message")?.value || "").trim() || undefined;
      if (!Number.isFinite(drawingId) || !owner || !repo || !path) {
        if (statusEl) statusEl.textContent = "⚠ Drawing ID, owner, repo, and path are all required. / 図面ID・owner・repo・pathはすべて必須です。";
        return;
      }
      if (statusEl) statusEl.textContent = "Fetching drawing from open-cg-cad… / open-cg-cadから図面を取得中…";
      let drawing;
      try {
        const resp = await fetch(cgCadOpsBase() + `v1/drawings/get?id=${drawingId}`);
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || "drawing not found");
        drawing = data.drawing;
      } catch (e) {
        if (statusEl) statusEl.textContent = `❌ Could not fetch drawing #${drawingId} from open-cg-cad: ${e}`;
        return;
      }
      // 図面本体(ファイルBLOB)は転送せず、GitHubへ保存するのは
      // ファイル名・カテゴリ・説明文・AI提案(あれば)のみのJSON。
      // 正直な開示: これはopen-cg-cad DB内の図面「記録」の複製であり、
      // アップロードされた元ファイル自体(data_base64)は含めていない
      // (実装をシンプルに保つための今回の選択、次回拡張の余地あり)。
      const content = JSON.stringify(
        { id: drawing.id, filename: drawing.filename, category: drawing.category, description: drawing.description, analysis: drawing.analysis, redesign_of_id: drawing.redesign_of_id },
        null,
        2
      );
      if (statusEl) statusEl.textContent = "Committing via vault → open-cg-cad → GitHub… / vault→open-cg-cad→GitHub経由でコミット中…";
      try {
        const url = await cgCadRequestVaultGithubCommit({ cgCadBase: cgCadOpsBase(), owner, repo, path, content, message, branch });
        if (statusEl) statusEl.textContent = `✅ Committed: ${url || "(no URL returned)"}`;
      } catch (e) {
        if (statusEl) statusEl.textContent = `❌ ${e.message || e}`;
      }
    });
  }
})();

if (worldLabPairBtn) {
  worldLabPairBtn.addEventListener("click", async () => {
    const token = (worldLabPairTokenEl?.value || "").trim();
    const deviceName = (worldLabPairNameEl?.value || "").trim();
    const connection = worldLabPairConnectionEl?.value || "wifi";
    const kind = worldLabPairKindEl?.value || "other";
    const capabilities = ["cpu"];
    if (worldLabPairCapGpuEl?.checked) capabilities.push("gpu");
    if (worldLabPairCapNpuEl?.checked) capabilities.push("npu");
    if (!token || !deviceName) {
      worldLabPairStatusEl.textContent =
        "Please enter both a pairing token and a device name. / ペアリングトークンとデバイス名の両方を入力してください。";
      return;
    }
    worldLabPairStatusEl.textContent = "Pairing… / ペアリング中…";
    try {
      const res = await fetch("/v1/world-lab/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, device_name: deviceName, connection, kind, capabilities }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        worldLabPairStatusEl.textContent =
          `Paired. device_id=${body.device.device_id} / ペアリングしました。device_id=${body.device.device_id}`;
        refreshWorldLabDevices();
        refreshWorldLabStatus();
      } else {
        worldLabPairStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      worldLabPairStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

const worldLabBulkPairNamesEl = document.getElementById("world-lab-bulk-pair-names");
const worldLabBulkPairBtn = document.getElementById("world-lab-bulk-pair-btn");
const worldLabBulkPairStatusEl = document.getElementById("world-lab-bulk-pair-status");

if (worldLabBulkPairBtn) {
  worldLabBulkPairBtn.addEventListener("click", async () => {
    const token = (worldLabPairTokenEl?.value || "").trim();
    const connection = worldLabPairConnectionEl?.value || "wifi";
    const kind = worldLabPairKindEl?.value || "other";
    const capabilities = ["cpu"];
    if (worldLabPairCapGpuEl?.checked) capabilities.push("gpu");
    if (worldLabPairCapNpuEl?.checked) capabilities.push("npu");
    const names = (worldLabBulkPairNamesEl?.value || "")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!token || names.length === 0) {
      worldLabBulkPairStatusEl.textContent =
        "Please enter a pairing token above and at least one device name below. / 上でペアリングトークンを、下に少なくとも1台のデバイス名を入力してください。";
      return;
    }
    worldLabBulkPairStatusEl.textContent = `Pairing ${names.length} device(s)… / ${names.length}台をペアリング中…`;
    try {
      const devices = names.map((device_name) => ({ device_name, connection, kind, capabilities }));
      const res = await fetch("/v1/world-lab/pair/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, devices }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        const failed = (body.results || []).filter((r) => !r.ok);
        const failedSummary = failed.length ? ` Failed: ${failed.map((r) => `${r.device_name} (${r.error})`).join(", ")}` : "";
        worldLabBulkPairStatusEl.textContent =
          `Paired ${body.succeeded}/${body.total}.${failedSummary} / ${body.succeeded}/${body.total}台をペアリングしました。${failedSummary}`;
        refreshWorldLabDevices();
        refreshWorldLabStatus();
      } else {
        worldLabBulkPairStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      worldLabBulkPairStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

if (worldLabTaskRunBtn) {
  worldLabTaskRunBtn.addEventListener("click", async () => {
    const token = (worldLabPairTokenEl?.value || "").trim();
    const file = worldLabTaskWasmEl?.files?.[0];
    if (!token || !file) {
      worldLabTaskStatusEl.textContent =
        "Please enter a pairing token above and choose a .wasm file. / 上でペアリングトークンを入力し、.wasmファイルを選んでください。";
      return;
    }
    worldLabTaskStatusEl.textContent = "Running (this may take a few seconds)… / 実行中(数秒かかる場合があります)…";
    try {
      const wasmBytes = await file.arrayBuffer();
      const inputText = worldLabTaskInputEl?.value || "";
      const wasmBase64 = arrayBufferToBase64(wasmBytes);
      const inputBase64 = btoa(unescape(encodeURIComponent(inputText)));
      const res = await fetch("/v1/world-lab/task/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, wasm_base64: wasmBase64, input_base64: inputBase64 }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        let outputText;
        try {
          outputText = decodeURIComponent(escape(atob(body.output_base64 || "")));
        } catch (e) {
          outputText = `(binary output, base64: ${body.output_base64})`;
        }
        worldLabTaskStatusEl.textContent =
          `Done. fuel_consumed=${body.fuel_consumed}. Output: ${outputText} / ` +
          `完了しました。fuel_consumed=${body.fuel_consumed}。出力: ${outputText}`;
      } else {
        worldLabTaskStatusEl.textContent = `Failed: ${body.error || "unknown error"} / 失敗しました: ${body.error || "不明なエラー"}`;
      }
    } catch (e) {
      worldLabTaskStatusEl.textContent = `Failed: ${e.message} / 失敗しました: ${e.message}`;
    }
  });
}

// ============================================================================
// 学年別・家庭教師コース(ユーザー指示、2026-08-23)
// ----------------------------------------------------------------------------
// 「学生向け家庭教師コースをインストールしたい」という利用者の操作に応えて、
// (1) 学年(小1〜高3の12学年)を尋ね、(2) その学年で一般的な教科を選ばせ、
// (3) 選んだ教科の練習問題を出題・採点する機能。UIと採点の作りは既存の
// 資格試験対策コーナー(#exam-prep-modal / renderExamPrepQuiz)を踏襲し、
// 新しい仕組みは増やしていない。
//
// **正直な開示(改変時も弱めないこと)**: 収録している問題はすべて本アプリ用に
// 書き下ろしたオリジナルで、教科書・問題集・実際の入試問題の転載は一切無い。
// また**全学年×全教科は揃っていない**(下記TUTOR_QUESTIONSに実際に存在する
// 組み合わせのみ)。未収録の組み合わせは「準備中」と正直に表示し、
// 「対応済み」に見せかけない。
//
// 落ちこぼれ防止(2026-08-23追加): 各問題は任意で`easier`フィールド
// (同じ単元・同じ考え方のまま難易度を1段階下げた類題)を持てる。採点で
// 間違えた問題のうち`easier`を持つものがあれば、「もう少し易しい問題に
// 挑戦してみましょう」という導線でその類題を出題する。**AI生成ではなく
// 人手で書いた静的なペア**であり、多段階(2段階以上易しく)は未実装。
// ============================================================================

const TUTOR_GRADES = [
  // 最低学年(ユーザー指示、2026-08-23「保育園児・幼稚園児まで拡大」)。
  // 落ちこぼれ防止で学年を下げていくときの**下限**でもある。
  { id: "p0", ja: "保育園児・幼稚園児", en: "Preschool / kindergarten" },
  { id: "e1", ja: "小学1年生", en: "Elementary 1" },
  { id: "e2", ja: "小学2年生", en: "Elementary 2" },
  { id: "e3", ja: "小学3年生", en: "Elementary 3" },
  { id: "e4", ja: "小学4年生", en: "Elementary 4" },
  { id: "e5", ja: "小学5年生", en: "Elementary 5" },
  { id: "e6", ja: "小学6年生", en: "Elementary 6" },
  { id: "j1", ja: "中学1年生", en: "Junior high 1" },
  { id: "j2", ja: "中学2年生", en: "Junior high 2" },
  { id: "j3", ja: "中学3年生", en: "Junior high 3" },
  { id: "h1", ja: "高校1年生", en: "High school 1" },
  { id: "h2", ja: "高校2年生", en: "High school 2" },
  { id: "h3", ja: "高校3年生", en: "High school 3" },
];

// 学年ごとの一般的な教科(日本の一般的なカリキュラムを目安にしたおおまかな
// 分類。高校の理科・社会は科目名を細分化しすぎず「理科」「地理歴史・公民」
// 程度の粒度にとどめている)。
// キャリアガイダンス(通常の学校教科向け、2026-08-24追加)。
//
// 当初はバーチャル職業訓練校(`VSCHOOL_FIELDS`)のみへ「ドイツの
// デュアルシステム」をお手本にした補足説明を追加したが、ユーザーから
// 「ドイツでは普通科の学校教育でも、この教科を学ぶとこの産業・職業に
// 役立つという進路指導(Berufsorientierung)の考え方が浸透している」との
// 補足指示があり、通常の学年別・家庭教師コース(`TUTOR_SUBJECTS_BY_STAGE`)
// 側にも同様の補足説明を広げた。
//
// WebSearchで確認した実在の情報源(2026-08-24): Realschuleは数学・理科・
// 経済・現代語学に重点を置き、進路指導(Arbeitslehre)や職場体験実習が
// カリキュラムへ組み込まれており、生徒は技術・経済・社会のいずれかの
// 重点コースを選べる。Gymnasiumも一般教育と並行して進路を意識した
// 指導が行われる、という実態を確認した上で設計した。
// - iamexpat.de「The German school system」
//   https://www.iamexpat.de/education/primary-secondary-education/german-school-system
// - econotravelgermany.com「Germany's School System Explained」
//   https://econotravelgermany.com/germanys-school-system-explained-gymnasium-realschule-hauptschule/
// - cbs.de「A Guide to the German School & Education System」
//   https://www.cbs.de/en/blog/school-education-system-in-germany
//
// **誠実さの方針(VSCHOOL側と同じ、絶対に弱めないこと)**: 「〜かもしれま
// せん」「〜を目指せる可能性があります」という非断定的な表現のみを使う。
// 「必ず〜になれる」という断定はしない。
//
// **正直な開示・スコープ**: 保育園児・幼稚園児(`preschool`)と小学校
// 低学年(`elementaryLower`)には、あえてキャリア接続の説明を付けていない
// ——この年齢にキャリア・職業選択を意識させるのは時期尚早と判断した
// (ドイツでも進路指導が本格化するのはRealschule/Gymnasium相当の学年から
// であることを踏まえた判断)。小学校高学年(`elementaryUpper`)以上にのみ、
// 学年段階(elementary/secondary/high)ごとに文面を分けて用意している。
// 名言・ことわざ+モチベーションメッセージ(2026-08-24新設、ユーザー指示
// 「名言・ことわざを授業内容に効果的に組み込む」「就職できる、転職できる、
// 食っていける、どこに行っても通用する人に育てる、というメッセージを
// 誇張しすぎず組み込む」への対応)。
//
// **表示先(3か所、いずれも既存のキャリアガイダンス表示の直後)**:
// 学年別・家庭教師コースの教科選択一覧(`tutorCareerHtml`)、出題画面
// (`tutorCareerGuidanceHtml`)、バーチャルスクール/職業訓練校の分野選択
// (`vschoolCareerHtml`)。新しい表示の仕組みは増やさず、既存のキャリア
// ガイダンス欄へ追記する形にしてある。
//
// **誠実さの方針(既存ルールを踏襲、絶対に弱めないこと)**: モチベーション
// メッセージは「就職できる、転職できる、食っていける、どこに行っても
// 通用する人に育てる」「どこに出しても恥ずかしくない人に育てる」
// 「国際的で模範的な指導者が育つように」というユーザーの願いを、
// 「〜を目指します」「〜を願っています」という運営側の姿勢・目標として
// 表現する——「これを学べば必ずそうなれます」という学習者への断定的な
// 保証にはしない(このアプリ全体の非断定方針と同じ)。
const CAREER_MOTIVATION_QUOTES = [
  {
    ja: "鉄は熱いうちに打て。",
    en: "Strike while the iron is hot.",
    note_ja: "興味を持った今この瞬間に、少しでも手を動かしてみましょう。",
    note_en: "While your interest is fresh, try putting it into practice right now.",
  },
  {
    ja: "千里の道も一歩から。",
    en: "A journey of a thousand miles begins with a single step.",
    note_ja: "大きな目標も、今日の1問・1フレーズの積み重ねから始まります。",
    note_en: "Even a big goal starts with today's single question or phrase.",
  },
  {
    ja: "習うより慣れよ。",
    en: "Practice makes perfect.",
    note_ja: "説明を読むだけでなく、実際に声に出して使ってみることが上達の近道かもしれません。",
    note_en: "Saying phrases out loud, not just reading about them, may be the shorter path to progress.",
  },
  {
    ja: "石の上にも三年。",
    en: "Rome wasn't built in a day.",
    note_ja: "すぐに結果が出なくても、続けることに意味があるかもしれません。",
    note_en: "Even without quick results, sticking with it may be worth something in itself.",
  },
  {
    ja: "備えあれば憂いなし。",
    en: "A stitch in time saves nine.",
    note_ja: "基礎を今のうちに固めておくと、あとで役立つ場面があるかもしれません。",
    note_en: "Building basics now may pay off later, when you least expect to need them.",
  },
  {
    ja: "初心忘るべからず。",
    en: "Always remember your beginner's mind.",
    note_ja: "「なぜ学び始めたのか」を思い出すと、続ける力になるかもしれません。",
    note_en: "Remembering why you started may help you keep going.",
  },
  {
    ja: "案ずるより産むが易し。",
    en: "Fretting over it is often harder than actually doing it.",
    note_ja: "心配して立ち止まるより、まず一言話しかけてみる方が、案外うまくいくかもしれません。",
    note_en: "Worrying about it often turns out harder than just trying it — speaking up first may go more smoothly than expected.",
  },
  {
    ja: "失敗は成功のもと。",
    en: "Failure teaches success. / You learn from your mistakes.",
    note_ja: "間違えた問題こそ、次に活かせる材料になるかもしれません。",
    note_en: "A question you got wrong may become the most useful material for next time.",
  },
];

/** 教科ID(または分野ID)から、常に同じ名言を1件選ぶ(表示のたびに
 *  変わって落ち着かない、ということがないよう簡易ハッシュで固定する)。
 *  日英併記+短い一言(ja/en)を付けて返す。 */
function pickCareerQuote(seedText) {
  let hash = 0;
  const s = String(seedText || "");
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return CAREER_MOTIVATION_QUOTES[hash % CAREER_MOTIVATION_QUOTES.length];
}

/** 名言+一言コメントのHTML断片(既存の`.vschool-career`と同じ見た目の
 *  クラスを流用、`style.css`に`.tutor-quote-box`を追加)。 */
function careerQuoteHtml(seedText) {
  const q = pickCareerQuote(seedText);
  return (
    '<div class="tutor-quote-box">' +
    '<p class="tutor-quote-label">💬 今日の一言 / Quote of the day</p>' +
    `<p>「${q.ja}」<br>"${q.en}"</p>` +
    `<p class="tutor-quote-note">${q.note_ja}<br>${q.note_en}</p>` +
    "</div>"
  );
}

// **モチベーションメッセージ(固定文、誇張しすぎないトーン)**。
// ユーザーの願い(就職・転職・食っていける・どこに出しても恥ずかしくない・
// 国際的で模範的な指導者)を、運営側の目標・姿勢として表現している
// (学習者への保証ではない、この一文を弱めないこと)。
const CAREER_MOTIVATION_MESSAGE = {
  ja: "私たちは、学んだ先にある「就職できる、転職できる、食っていける、どこに行っても通用する人に育つ」ことを目指して、この教材を作っています。どこに出しても恥ずかしくない実力、そして国際的な場面でも落ち着いて対応できる力が育つように、という願いを込めています。もちろん、学習だけで結果が保証されるわけではありませんが、日々の積み重ねが土台になるはずです。",
  en: "We build this material hoping it leads somewhere real: being employable, being able to change careers, making a living, and holding your own wherever you go. We hope it helps build skills you can be proud of anywhere, and the composure to handle international settings well. Of course, study alone doesn't guarantee outcomes — but day-by-day practice should give you a solid foundation to build on.",
};

function careerMotivationHtml() {
  return (
    '<div class="tutor-motivation-box">' +
    '<p class="tutor-quote-label">🌱 育ってほしい姿 / What we hope you grow into</p>' +
    `<p>${CAREER_MOTIVATION_MESSAGE.ja}</p>` +
    `<p>${CAREER_MOTIVATION_MESSAGE.en}</p>` +
    "</div>"
  );
}

const TUTOR_CAREER = {
  japanese: {
    elementary: {
      ja: "文章を正確に読み書きする力は、どんな仕事でも役立つ土台になるかもしれません。",
      en: "Reading and writing accurately may become a foundation useful in almost any job.",
    },
    secondary: {
      ja: "しっかり身につけると、編集・出版や広報の仕事で役立つかもしれません。さらに極めると、記者やライター、国語の先生のような職種を目指せる可能性があります。",
      en: "Mastering this may help with editing, publishing, or PR work. Going further, it could open a path toward journalism, writing, or teaching Japanese.",
    },
    high: {
      ja: "論理的な文章力・古典の読解力は、法律関係や出版業界で役立つかもしれません。さらに極めると、弁護士や研究者、編集者のような職種を目指せる可能性があります。",
      en: "Logical writing and classical-text reading skills may help in law-adjacent or publishing work. Going further, it could open a path toward law, research, or editorial roles.",
    },
  },
  math: {
    elementary: {
      ja: "計算力は、お店の仕事や設計、プログラミングなど、数字を扱うさまざまな仕事の土台になるかもしれません。",
      en: "Arithmetic skills may become a foundation for shop work, design, or programming — anything involving numbers.",
    },
    secondary: {
      ja: "しっかり身につけると、経理や工業系の仕事で役立つかもしれません。さらに極めると、エンジニアや数学の先生のような職種を目指せる可能性があります。",
      en: "Mastering this may help with accounting or technical/industrial roles. Going further, it could open a path toward engineering or teaching mathematics.",
    },
    high: {
      ja: "数学の力は、金融・データ分析・エンジニアリングなど幅広い業界で役立つかもしれません。さらに極めると、アクチュアリーやデータサイエンティスト、研究者のような職種を目指せる可能性があります。",
      en: "Mathematical skill may help across finance, data analysis, and engineering. Going further, it could open a path toward actuarial work, data science, or research.",
    },
  },
  science: {
    elementary: {
      ja: "身の回りの現象を観察して考える力は、ものづくりや自然について学ぶ仕事の入り口になるかもしれません。",
      en: "Observing and reasoning about everyday phenomena may be a first step toward manufacturing or nature-related work.",
    },
    secondary: {
      ja: "しっかり身につけると、製造業や農業、環境関連の仕事で役立つかもしれません。さらに極めると、研究者や技術者のような職種を目指せる可能性があります。",
      en: "Mastering this may help with manufacturing, agriculture, or environmental work. Going further, it could open a path toward research or engineering roles.",
    },
    high: {
      ja: "物理・化学・生物の知識は、製薬・医療機器・エネルギー業界で役立つかもしれません。さらに極めると、研究者や医師、技術者のような職種を目指せる可能性があります。",
      en: "Physics, chemistry, and biology knowledge may help in pharmaceuticals, medical devices, or energy. Going further, it could open a path toward research, medicine, or engineering.",
    },
  },
  social: {
    elementary: {
      ja: "地域や社会の仕組みを知ることは、お店や役所など、人と関わる仕事の理解に役立つかもしれません。",
      en: "Understanding how communities and society work may help you understand jobs that involve working with people, like shops or local government.",
    },
    secondary: {
      ja: "しっかり身につけると、公務員や観光・報道関連の仕事で役立つかもしれません。さらに極めると、社会科の先生や政策に関わる仕事を目指せる可能性があります。",
      en: "Mastering this may help with public-sector, tourism, or media-related roles. Going further, it could open a path toward teaching social studies or policy work.",
    },
    high: {
      ja: "地理歴史・公民の知識は、外交・観光・報道・法律関係の仕事で役立つかもしれません。さらに極めると、外交官やジャーナリスト、公務員のような職種を目指せる可能性があります。",
      en: "Geography, history, and civics knowledge may help in diplomacy, tourism, media, or law-adjacent work. Going further, it could open a path toward diplomacy, journalism, or public service.",
    },
  },
  english: {
    elementary: {
      ja: "英語に親しむことは、将来、海外の人と関わる仕事や旅行で役立つかもしれません。",
      en: "Getting comfortable with English may help later with jobs or travel involving people from other countries.",
    },
    secondary: {
      ja: "しっかり身につけると、貿易・観光・接客業で役立つかもしれません。さらに極めると、通訳・翻訳者や英語の先生のような職種を目指せる可能性があります。",
      en: "Mastering this may help with trade, tourism, or hospitality roles. Going further, it could open a path toward interpreting, translation, or teaching English.",
    },
    high: {
      ja: "実用的な英語力は、商社・外資系企業・国際機関で働く際に役立つかもしれません。さらに極めると、外交官や国際弁護士、通訳者のような職種を目指せる可能性があります。",
      en: "Practical English skill may help at trading companies, foreign firms, or international organizations. Going further, it could open a path toward diplomacy, international law, or interpreting.",
    },
  },
  programming: {
    elementary: {
      ja: "順序立てて考える力(プログラミング的思考)は、将来いろいろな仕事の課題解決に役立つかもしれません。",
      en: "Thinking step by step (computational thinking) may help you solve problems in many future jobs.",
    },
    secondary: {
      ja: "しっかり身につけると、Webサイト制作やアプリ開発の仕事で役立つかもしれません。さらに極めると、ソフトウェアエンジニアのような職種を目指せる可能性があります。",
      en: "Mastering this may help with web or app development work. Going further, it could open a path toward a software engineering role.",
    },
    high: {
      ja: "プログラミングの力は、IT企業だけでなく、あらゆる業界のデジタル化を支える仕事で役立つかもしれません。さらに極めると、フルスタックエンジニアやITアーキテクトのような職種を目指せる可能性があります。",
      en: "Programming skill may help not just at IT companies but in digitalization work across many industries. Going further, it could open a path toward full-stack engineering or IT architecture roles.",
    },
  },
  // 「話し方・質問の仕方(建設的コミュニケーション)」(2026-08-24新設、
  // ユーザー指示「曖昧な話・仮説的な話を建設的に行う方法、問題点を指摘した
  // 上で相手の意見を求める話法、大胆かつ繊細さの重要性を、英語表現として
  // 教材化」への対応)。中学・高校段階のみに用意している(小学校段階には
  // 交渉・議論のニュアンスがまだ早いと判断、他教科の`elementary`枠を
  // あえて設けていない)。
  communication: {
    secondary: {
      ja: "問題点を整理して伝え、相手の意見を尋ねる話し方は、部活動やグループ学習でのリーダー的な役割で役立つかもしれません。さらに極めると、生徒会や司会進行のような役割を目指せる可能性があります。",
      en: "Clearly stating a problem and then asking for others' input may help in leadership roles within clubs or group work. Going further, it could open a path toward student-council or facilitation roles.",
    },
    high: {
      ja: "曖昧な提案・仮説を整理して話す力や、建設的なフィードバックの技法は、会議・接客・国際交流など、あらゆる仕事の土台になるかもしれません。さらに極めると、ファシリテーターや管理職、国際的な場で活躍する人材を目指せる可能性があります。",
      en: "The ability to organize a vague idea or hypothetical proposal, and the technique of giving constructive feedback, may become a foundation for meetings, customer service, and international exchange in almost any job. Going further, it could open a path toward facilitation, management, or roles that work well in international settings.",
    },
  },
};

/** VSCHOOLの`vschoolCareerHtml`と同じ表示形式(日英併記・非断定)。
 *  教科オブジェクトの`career`(無ければ何も表示しない、preschool/
 *  elementaryLowerは意図的に無し)。 */
function tutorCareerHtml(subject) {
  if (!subject || !subject.career) return "";
  return (
    '<div class="vschool-career">' +
    '<p class="vschool-career-label">🎓 キャリアガイダンス / Career guidance</p>' +
    "<p>" + subject.career.ja + "</p>" +
    "<p>" + subject.career.en + "</p>" +
    "</div>" +
    careerQuoteHtml(subject.id) +
    careerMotivationHtml()
  );
}

const TUTOR_SUBJECTS_BY_STAGE = {
  // 保育園児・幼稚園児(小学校の教科名ではなく、その年齢で親しみやすい
  // 呼び方にしている。教科IDは小学校以上と共通にしてあるので、
  // 学年を下げていく仕組みが同じ教科として繋がる)。
  preschool: [
    { id: "japanese", ja: "ことば(ひらがな)", en: "Words (hiragana)" },
    { id: "math", ja: "かず(すうじ)", en: "Numbers" },
    { id: "life", ja: "かたち・いろ", en: "Shapes & colours" },
  ],
  elementaryLower: [
    { id: "japanese", ja: "国語", en: "Japanese" },
    { id: "math", ja: "算数", en: "Arithmetic" },
    { id: "life", ja: "生活", en: "Life studies" },
  ],
  elementaryUpper: [
    { id: "japanese", ja: "国語", en: "Japanese", career: TUTOR_CAREER.japanese.elementary },
    { id: "math", ja: "算数", en: "Arithmetic", career: TUTOR_CAREER.math.elementary },
    { id: "science", ja: "理科", en: "Science", career: TUTOR_CAREER.science.elementary },
    { id: "social", ja: "社会", en: "Social studies", career: TUTOR_CAREER.social.elementary },
    { id: "english", ja: "英語", en: "English", career: TUTOR_CAREER.english.elementary },
    { id: "programming", ja: "プログラミング", en: "Programming", career: TUTOR_CAREER.programming.elementary },
  ],
  junior: [
    { id: "japanese", ja: "国語", en: "Japanese", career: TUTOR_CAREER.japanese.secondary },
    { id: "math", ja: "数学", en: "Mathematics", career: TUTOR_CAREER.math.secondary },
    { id: "science", ja: "理科", en: "Science", career: TUTOR_CAREER.science.secondary },
    { id: "social", ja: "社会", en: "Social studies", career: TUTOR_CAREER.social.secondary },
    { id: "english", ja: "英語", en: "English", career: TUTOR_CAREER.english.secondary },
    { id: "programming", ja: "プログラミング", en: "Programming", career: TUTOR_CAREER.programming.secondary },
    { id: "communication", ja: "話し方・質問の仕方", en: "Communication & Questioning Skills", career: TUTOR_CAREER.communication.secondary },
  ],
  high: [
    { id: "japanese", ja: "国語(現代文・古文)", en: "Japanese (modern & classical)", career: TUTOR_CAREER.japanese.high },
    { id: "math", ja: "数学", en: "Mathematics", career: TUTOR_CAREER.math.high },
    { id: "science", ja: "理科(物理・化学・生物)", en: "Science", career: TUTOR_CAREER.science.high },
    { id: "social", ja: "地理歴史・公民", en: "Geography, history & civics", career: TUTOR_CAREER.social.high },
    { id: "english", ja: "英語", en: "English", career: TUTOR_CAREER.english.high },
    { id: "programming", ja: "プログラミング", en: "Programming", career: TUTOR_CAREER.programming.high },
    { id: "communication", ja: "話し方・質問の仕方", en: "Communication & Questioning Skills", career: TUTOR_CAREER.communication.high },
  ],
};

function tutorStageOf(gradeId) {
  if (gradeId === "p0") return "preschool";
  if (gradeId.startsWith("h")) return "high";
  if (gradeId.startsWith("j")) return "junior";
  const year = Number(gradeId.slice(1));
  return year <= 2 ? "elementaryLower" : "elementaryUpper";
}

function tutorSubjectsFor(gradeId) {
  return TUTOR_SUBJECTS_BY_STAGE[tutorStageOf(gradeId)];
}

// 図解(インラインSVG、2026-08-23追加)。追加のアセットファイルを持たずに
// 済むよう、すべてこのファイル内の固定文字列として持つ。**図解が有効な問題
// にだけ付けており、全問には付いていない**(単純な計算・語句の問題には
// 不要なため)。図解の有無はUI上でも「図解つき」バッジで区別できる。
// 色は`currentColor`ではなく既存のダーク配色に合わせた固定色を使う。
const TUTOR_FIGURES = {
  candies7minus3:
    '<svg viewBox="0 0 300 70" role="img" aria-label="あめが7こ、そのうち3こに×印" width="100%" style="max-width:320px">' +
    '<circle cx="20" cy="35" r="12" fill="#ff9ecb"/><circle cx="55" cy="35" r="12" fill="#ff9ecb"/>' +
    '<circle cx="90" cy="35" r="12" fill="#ff9ecb"/><circle cx="125" cy="35" r="12" fill="#ff9ecb"/>' +
    '<circle cx="160" cy="35" r="12" fill="#7a6a76"/><circle cx="195" cy="35" r="12" fill="#7a6a76"/>' +
    '<circle cx="230" cy="35" r="12" fill="#7a6a76"/>' +
    '<g stroke="#fff" stroke-width="3"><path d="M152 27 l16 16 M168 27 l-16 16"/>' +
    '<path d="M187 27 l16 16 M203 27 l-16 16"/><path d="M222 27 l16 16 M238 27 l-16 16"/></g>' +
    '<text x="255" y="40" fill="#f4e6f0" font-size="13">たべた3こ</text></svg>',
  fractionFifths:
    '<svg viewBox="0 0 320 70" role="img" aria-label="5等分したテープのうち3つ分と1つ分" width="100%" style="max-width:340px">' +
    '<g stroke="#f4e6f0" stroke-width="2" fill="none"><rect x="10" y="10" width="150" height="24"/>' +
    '<rect x="10" y="40" width="150" height="24"/></g>' +
    '<g fill="#ff9ecb"><rect x="11" y="11" width="89" height="22"/><rect x="11" y="41" width="29" height="22"/></g>' +
    '<g stroke="#f4e6f0" stroke-width="1">' +
    '<path d="M40 10v24 M70 10v24 M100 10v24 M130 10v24 M40 40v24 M70 40v24 M100 40v24 M130 40v24"/></g>' +
    '<text x="170" y="28" fill="#f4e6f0" font-size="14">3/5</text>' +
    '<text x="170" y="58" fill="#f4e6f0" font-size="14">1/5</text></svg>',
  circleRadius3:
    '<svg viewBox="0 0 200 130" role="img" aria-label="半径3cmの円" width="100%" style="max-width:220px">' +
    '<circle cx="80" cy="65" r="50" fill="#3a2740" stroke="#ff9ecb" stroke-width="2"/>' +
    '<line x1="80" y1="65" x2="130" y2="65" stroke="#f4e6f0" stroke-width="2"/>' +
    '<circle cx="80" cy="65" r="3" fill="#f4e6f0"/>' +
    '<text x="95" y="58" fill="#f4e6f0" font-size="13">3cm</text></svg>',
  boxVolume:
    '<svg viewBox="0 0 220 140" role="img" aria-label="縦4cm横5cm高さ3cmの直方体" width="100%" style="max-width:240px">' +
    '<g fill="none" stroke="#ff9ecb" stroke-width="2">' +
    '<rect x="30" y="45" width="110" height="65"/><path d="M30 45 l35-28 h110 l-35 28 M140 45 l35-28 M140 110 l35-28 v-56"/></g>' +
    '<text x="70" y="128" fill="#f4e6f0" font-size="13">横5cm</text>' +
    '<text x="0" y="82" fill="#f4e6f0" font-size="13">高さ3cm</text>' +
    '<text x="150" y="26" fill="#f4e6f0" font-size="13">縦4cm</text></svg>',
  rightTriangle512:
    '<svg viewBox="0 0 220 150" role="img" aria-label="直角をはさむ2辺が5cmと12cmの直角三角形" width="100%" style="max-width:240px">' +
    '<polygon points="30,120 30,30 170,120" fill="#3a2740" stroke="#ff9ecb" stroke-width="2"/>' +
    '<rect x="30" y="106" width="14" height="14" fill="none" stroke="#f4e6f0"/>' +
    '<text x="0" y="78" fill="#f4e6f0" font-size="13">5cm</text>' +
    '<text x="85" y="138" fill="#f4e6f0" font-size="13">12cm</text>' +
    '<text x="105" y="66" fill="#f4e6f0" font-size="13">?</text></svg>',
  numberLineNegative:
    '<svg viewBox="0 0 320 80" role="img" aria-label="-7から右へ3進む数直線" width="100%" style="max-width:340px">' +
    '<line x1="10" y1="50" x2="310" y2="50" stroke="#f4e6f0" stroke-width="2"/>' +
    '<g stroke="#f4e6f0" stroke-width="1">' +
    '<path d="M30 44v12 M60 44v12 M90 44v12 M120 44v12 M150 44v12 M180 44v12 M210 44v12 M240 44v12"/></g>' +
    '<text x="22" y="72" fill="#f4e6f0" font-size="12">-8</text>' +
    '<text x="112" y="72" fill="#f4e6f0" font-size="12">-4</text>' +
    '<text x="234" y="72" fill="#f4e6f0" font-size="12">0</text>' +
    '<circle cx="60" cy="50" r="5" fill="#ff9ecb"/>' +
    '<path d="M60 34 h90" stroke="#ff9ecb" stroke-width="2" fill="none"/>' +
    '<path d="M150 34 l-8 -5 v10 z" fill="#ff9ecb"/>' +
    '<text x="80" y="26" fill="#ff9ecb" font-size="12">+3</text></svg>',
  parabolaVertex:
    '<svg viewBox="0 0 220 150" role="img" aria-label="下に凸の放物線と頂点" width="100%" style="max-width:240px">' +
    '<line x1="20" y1="120" x2="200" y2="120" stroke="#f4e6f0" stroke-width="1"/>' +
    '<line x1="40" y1="10" x2="40" y2="140" stroke="#f4e6f0" stroke-width="1"/>' +
    '<path d="M60 20 Q110 170 170 20" fill="none" stroke="#ff9ecb" stroke-width="2" transform="scale(1,-1) translate(0,-150)"/>' +
    '<circle cx="115" cy="103" r="4" fill="#f4e6f0"/>' +
    '<text x="122" y="106" fill="#f4e6f0" font-size="12">頂点 / vertex</text></svg>',
};

// キャリアガイダンス機能(2026-08-24新設、ユーザー指示「各レッスン/学習
// 項目に、この内容をマスターすると役立つ業界・職種、さらに極めると
// 目指せる可能性のある上級職種を補足表示して」への対応)。
//
// 設計の下敷き: ドイツの職業教育制度(デュアルシステム)を実際に調査した
// (2026-08-24、日英Web検索)。ドイツでは訓練生(Azubi)が週の大半を
// 企業での実地訓練、残りをBerufsschule(職業学校)での座学に充て、
// BIBB(連邦職業教育訓練研究所)が認定する327種の職業ごとに訓練内容が
// 標準化されており、IHK(商工会議所)が試験を実施して資格
// (Facharbeiterbrief/Gesellenbrief)を発行する——「学習内容→具体的な
// 職業→上級資格(マイスター等)」という一本の線でつながっている点が
// 特徴。出典: IHK Darmstadt "The Dual System in Germany"
// (https://www.ihk.de/darmstadt/en/productlabels/training/voctrain-2533080)、
// deutschland.de "How Germany's dual vocational training system works"
// (https://www.deutschland.de/en/topic/business/how-germanys-dual-vocational-training-system-works)、
// Wikipedia "Dual education system"
// (https://en.wikipedia.org/wiki/Dual_education_system)。
//
// この調査結果を踏まえ、本アプリでも「教科を学ぶと、どんな業界・職種に
// 役立つ可能性があるか」「さらに極めると、どんな上級職種を目指せる
// 可能性があるか」を教科単位(問題1問ごとではなく、学年×教科のグループ
// 単位)で補足表示する。**断定はしない**——「〜かもしれません」
// 「〜に役立つ可能性があります」という表現に統一し、「これを学べば
// 必ず就職できる」という趣旨の表現は一切使わない。
const TUTOR_CAREER_GUIDANCE = {
  japanese: {
    ja: "国語で身につく読解力・語彙力・文章作成力は、出版・編集、広報・広告、教育、行政・法務、接客業など、言葉を扱うあらゆる業界で役立つかもしれません。",
    en: "The reading comprehension, vocabulary, and writing skills built in Japanese class may help in publishing/editing, PR & advertising, education, administration/legal work, and customer service — fields that rely on language.",
    advanced: "文章力・語彙力をさらに極めると、編集者・校正者・脚本家・広報担当者・行政書士のような、言葉を専門的に扱う上級職種を目指せる可能性があります。",
    advancedEn: "Mastering writing and vocabulary further may open paths toward more advanced roles such as editor, proofreader, scriptwriter, PR specialist, or legal-document professional.",
  },
  math: {
    ja: "算数・数学の計算力・論理的思考力は、製造業、建設業、金融・会計、ITエンジニアリング、データ分析、科学研究など、数字や論理を扱う幅広い業界で役立つかもしれません。",
    en: "Arithmetic/math skills and logical thinking may help in manufacturing, construction, finance & accounting, IT engineering, data analysis, and scientific research — fields built on numbers and logic.",
    advanced: "計算力・論理的思考力をさらに極めると、アクチュアリー・データサイエンティスト・システムエンジニア・建築士・会計士のような、数学を専門的に使う上級職種を目指せる可能性があります。",
    advancedEn: "Going further with math and logic may open paths toward advanced roles such as actuary, data scientist, systems engineer, architect, or accountant.",
  },
  life: {
    ja: "生活科で身につく身の回りの物事への気づき・観察力は、保育・幼児教育、食品・生活用品業界、小売業など、日常生活に関わる業界の基礎として役立つかもしれません。",
    en: "The everyday observation skills built in life studies may serve as a foundation for childcare/early education, food & household-goods industries, and retail — fields close to daily life.",
    advanced: "観察力・気づく力をさらに極めると、保育士・幼稚園教諭・商品開発担当のような、日常生活に関わる上級職種を目指せる可能性があります。",
    advancedEn: "Building further on this observational foundation may open paths toward roles such as childcare worker, kindergarten teacher, or product development specialist.",
  },
  science: {
    ja: "理科の実験・観察・仮説検証の考え方は、製薬・医療、農業・食品、環境・エネルギー、製造業の研究開発など、科学的な裏付けが求められる業界で役立つかもしれません。",
    en: "The experimentation, observation, and hypothesis-testing skills from science class may help in pharmaceuticals/healthcare, agriculture/food, environment & energy, and manufacturing R&D — fields that need scientific grounding.",
    advanced: "科学的な考え方をさらに極めると、研究者・薬剤師・臨床検査技師・環境コンサルタントのような、専門知識を要する上級職種を目指せる可能性があります。",
    advancedEn: "Deepening scientific thinking may open paths toward advanced roles such as researcher, pharmacist, clinical laboratory technician, or environmental consultant.",
  },
  social: {
    ja: "社会・地理歴史・公民で学ぶ社会の仕組みへの理解は、公務員、金融、報道・メディア、観光業、国際関係の仕事など、社会や制度と関わる業界で役立つかもしれません。",
    en: "Understanding social structures, geography, history, and civics may help in public service, finance, journalism/media, tourism, and international-relations work — fields tied to society and institutions.",
    advanced: "社会への理解をさらに極めると、公務員・記者・国際協力の専門職・都市計画コンサルタントのような、制度や社会を専門的に扱う上級職種を目指せる可能性があります。",
    advancedEn: "Deepening this understanding of society may open paths toward advanced roles such as civil servant, journalist, international-cooperation specialist, or urban-planning consultant.",
  },
  english: {
    ja: "英語での基本的なコミュニケーション力は、観光・接客業、貿易・商社、航空・物流、国際的なカスタマーサポートなど、外国語を使う機会がある業界で役立つかもしれません。",
    en: "Basic English communication skills may help in tourism/hospitality, trading companies, aviation/logistics, and international customer support — fields where a foreign language comes in handy.",
    advanced: "英語力をさらに極めると、通訳・翻訳者・国際営業・海外駐在員のような、語学力を専門的に活かす上級職種を目指せる可能性があります。",
    advancedEn: "Mastering English further may open paths toward advanced roles such as interpreter, translator, international sales, or overseas assignment positions.",
  },
  programming: {
    ja: "プログラミングの基礎(HTML/CSS/JavaScriptの入門レベル)は、Web制作、ITサポート、業務効率化(RPA等)、ゲーム制作の周辺分野など、コンピュータを扱う業界の入り口として役立つかもしれません。ただし本アプリで扱うのはあくまで入門レベルであり、この一点だけで就職できるという趣旨ではありません。",
    en: "The introductory programming basics here (HTML/CSS/JavaScript fundamentals) may serve as an entry point toward web production, IT support, workflow automation (RPA, etc.), or adjacent areas of game development. This app only covers introductory-level material, though — it is not a claim that this alone leads to employment.",
    advanced: "プログラミングをさらに極めると、Webエンジニア・システムエンジニア・ゲームプログラマー・データエンジニアのような、開発を専門的に担う上級職種を目指せる可能性があります。",
    advancedEn: "Going much further with programming may open paths toward advanced roles such as web engineer, systems engineer, game programmer, or data engineer.",
  },
  communication: {
    ja: "曖昧な話や仮説を整理して伝える力、問題点を指摘した上で相手の意見を求める話し方は、会議・接客・チームでの共同作業など、あらゆる場面で役立つかもしれません。",
    en: "The ability to organize a vague or hypothetical idea, and to point out a problem clearly before asking for others' opinions, may help in meetings, customer service, and teamwork of almost any kind.",
    advanced: "建設的なコミュニケーション力をさらに極めると、ファシリテーター・管理職・国際会議の進行役のような、対話を導く上級職種を目指せる可能性があります。",
    advancedEn: "Mastering constructive communication further may open paths toward advanced roles such as facilitator, manager, or someone who runs international meetings.",
  },
};

/**
 * キャリアガイダンスの表示HTMLを組み立てる(教科ID単位、断定表現は
 * 使わない)。該当データが無い教科(将来追加された教科等)では静かに
 * 何も表示しない——無理に埋めない、誇張しない方針。
 */
function tutorCareerGuidanceHtml(subjectId) {
  const g = TUTOR_CAREER_GUIDANCE[subjectId];
  if (!g) return "";
  return (
    '<p class="tutor-career-title">🧭 キャリアガイダンス / Career guidance</p>' +
    `<p>${g.ja}<br>${g.en}</p>` +
    `<p>${g.advanced}<br>${g.advancedEn}</p>` +
    '<p class="setup-honest">※この内容は一般的な参考情報であり、就職・資格取得を保証するものではありません。' +
    "ドイツの職業教育制度(デュアルシステム)の「学習内容と職業・上級資格が結びついている」という考え方を参考に、" +
    "参考情報として補足しているものです。 / This is general reference information, not a guarantee of employment " +
    "or qualification. It is offered as a supplementary note inspired by how Germany's dual vocational training " +
    "system links subjects to specific occupations and further qualifications.</p>" +
    careerQuoteHtml(subjectId) +
    careerMotivationHtml()
  );
}

// 練習問題本体。キーは `<学年ID>:<教科ID>`。**ここに無い組み合わせは
// 「準備中」と表示する**(嘘の「対応済み」を作らないこと)。
// すべて本アプリ用に書き下ろしたオリジナル問題。`answer`は`choices`の添字。
// `easier`があるものは、間違えたときに出題する1段階易しい類題。
const TUTOR_QUESTIONS = {
  // 保育園児・幼稚園児向け(ユーザー指示、2026-08-23)。まだ文字が読めない
  // 子もいるため、保護者の方に読み上げてもらう前提のやさしい問題にしている。
  // 学年を下げていく仕組みの**最下段**でもある(ここより下は無い)。
  "p0:japanese": [
    { q: "「あ」と おなじ もじは どれかな?", choices: ["あ", "お", "ぬ", "め"], answer: 0 },
    { q: "「りんご」の さいしょの もじは どれかな?", choices: ["り", "ん", "ご", "る"], answer: 0 },
    { q: "「ねこ」は なんもじ かな?", choices: ["1もじ", "2もじ", "3もじ", "4もじ"], answer: 1 },
    { q: "あさ おきたら なんて いうかな?", choices: ["おはよう", "おやすみ", "いただきます", "さようなら"], answer: 0 },
    { q: "「くま」と「くも」、ちがう もじは どこかな?", choices: ["さいしょの もじ", "2ばんめの もじ", "おなじ ことば", "もじが ない"], answer: 1 },
  ],
  "p0:math": [
    { q: "🍎🍎 りんごは いくつ ある?", choices: ["1つ", "2つ", "3つ", "4つ"], answer: 1 },
    { q: "1、2、3、つぎは なにかな?", choices: ["4", "5", "1", "0"], answer: 0 },
    { q: "⭐⭐⭐ ほしは いくつ ある?", choices: ["2つ", "3つ", "4つ", "5つ"], answer: 1 },
    { q: "🐟🐟 と 🐟 を あわせると いくつ かな?", choices: ["2ひき", "3びき", "4ひき", "5ひき"], answer: 1 },
    { q: "おおきい かず は どっちかな?", choices: ["5", "2", "おなじ", "わからない"], answer: 0 },
  ],
  "p0:life": [
    { q: "まるい かたち は どれかな?", choices: ["⚪", "▲", "■", "⬟"], answer: 0 },
    { q: "そらの いろ は なにいろ かな?", choices: ["あお", "あか", "くろ", "ちゃいろ"], answer: 0 },
    { q: "「さんかく」は どれかな?", choices: ["▲", "⚪", "■", "★"], answer: 0 },
    { q: "いちごは なにいろ かな?", choices: ["あか", "あお", "みどり", "むらさき"], answer: 0 },
  ],
  "e1:math": [
    {
      q: "あめが 7こ あります。3こ たべました。のこりは なんこ ですか。",
      choices: ["3こ", "4こ", "5こ", "10こ"],
      answer: 1,
      svg: TUTOR_FIGURES.candies7minus3,
      easier: {
        q: "あめが 5こ あります。1こ たべました。のこりは なんこ ですか。",
        choices: ["3こ", "4こ", "5こ", "6こ"],
        answer: 1,
      },
    },
    {
      q: "8 + 6 は いくつ ですか。",
      choices: ["12", "13", "14", "15"],
      answer: 2,
      easier: { q: "8 + 2 は いくつ ですか。", choices: ["9", "10", "11", "12"], answer: 1, easier: { q: "8 + 1 は いくつ ですか。", choices: ["8", "9", "10", "11"], answer: 1 } },
    },
    {
      q: "いちごが 5こ ずつ はいった おさらが 2まい あります。いちごは ぜんぶで なんこ ですか。",
      choices: ["7こ", "10こ", "12こ", "25こ"],
      answer: 1,
      easier: {
        q: "いちごが 2こ ずつ はいった おさらが 2まい あります。ぜんぶで なんこ ですか。",
        choices: ["2こ", "3こ", "4こ", "5こ"],
        answer: 2,
      },
    },
    {
      q: "15 から 8 を ひくと いくつ ですか。",
      choices: ["6", "7", "8", "9"],
      answer: 1,
      easier: { q: "10 から 8 を ひくと いくつ ですか。", choices: ["1", "2", "3", "4"], answer: 1, easier: { q: "5 から 1 を ひくと いくつ ですか。", choices: ["2", "3", "4", "5"], answer: 2 } },
    },
    { q: "うさぎが 4ひき、ねこが 3びき います。どうぶつは あわせて なんびき ですか。", choices: ["1ぴき", "6ぴき", "7ひき", "12ひき"], answer: 2 },
  ],
  "e1:japanese": [
    {
      q: "「ねこ」を かたかなで かくと どれ ですか。",
      choices: ["ネコ", "ヌコ", "ネヨ", "メコ"],
      answer: 0,
      easier: { q: "「か」を かたかなで かくと どれ ですか。", choices: ["カ", "ヤ", "セ", "タ"], answer: 0 },
    },
    {
      q: "えんぴつを かぞえる ときの かぞえかたは どれ ですか。",
      choices: ["1まい", "1ぽん", "1ひき", "1こう"],
      answer: 1,
      easier: { q: "かみを かぞえる ときの かぞえかたは どれ ですか。", choices: ["1まい", "1ぴき", "1けん", "1だい"], answer: 0 },
    },
    {
      q: "「あさ」の はんたいの ことばは どれ ですか。",
      choices: ["ひる", "よる", "ゆう", "そら"],
      answer: 1,
      easier: { q: "「おおきい」の はんたいの ことばは どれ ですか。", choices: ["ちいさい", "たかい", "ながい", "あかい"], answer: 0 },
    },
    { q: "つぎの うち、のばす おと(ちょうおん)が ある ことばは どれ ですか。", choices: ["いぬ", "おかあさん", "とり", "はな"], answer: 1 },
  ],
  "e3:math": [
    {
      // 5段階ラダー完成例その1(2026-08-23)。誤答のたびに1段ずつ易しくなる。
      q: "7 × 8 はいくつですか。",
      choices: ["48", "54", "56", "63"],
      answer: 2,
      ladder: [
        { q: "7 × 4 はいくつですか。", choices: ["21", "24", "28", "32"], answer: 2 },
        { q: "7 × 2 はいくつですか。", choices: ["9", "12", "14", "16"], answer: 2 },
        { q: "2 × 3 はいくつですか。", choices: ["5", "6", "8", "9"], answer: 1 },
        { q: "3 + 3 はいくつですか(3が2つ分)。", choices: ["5", "6", "7", "9"], answer: 1 },
        { q: "かけ算「2 × 3」は、どの足し算と同じ意味ですか。", choices: ["2 + 3", "2 + 2 + 2", "3 + 3 + 3", "2 × 2"], answer: 1 },
      ],
    },
    {
      q: "36 ÷ 4 はいくつですか。",
      choices: ["6", "8", "9", "12"],
      answer: 2,
      easier: { q: "8 ÷ 4 はいくつですか。", choices: ["1", "2", "3", "4"], answer: 1, easier: { q: "4 ÷ 2 はいくつですか。", choices: ["1", "2", "3", "4"], answer: 1 } },
    },
    {
      q: "1000 - 458 はいくつですか。",
      choices: ["542", "552", "642", "458"],
      answer: 0,
      easier: { q: "100 - 40 はいくつですか。", choices: ["40", "50", "60", "70"], answer: 2 },
    },
    { q: "1mは何cmですか。", choices: ["10cm", "100cm", "1000cm", "12cm"], answer: 1 },
    {
      q: "分数 3/5 と 1/5 をたすといくつですか。",
      choices: ["4/10", "4/5", "3/25", "2/5"],
      answer: 1,
      svg: TUTOR_FIGURES.fractionFifths,
      easier: { q: "分数 1/5 と 1/5 をたすといくつですか。", choices: ["1/10", "2/10", "2/5", "1/25"], answer: 2 },
    },
  ],
  // 小学3年生の英語(ユーザー指示、2026-08-23「英語は小3から対応可能で
  // あることを明記」への対応)。学習指導要領上も小3から外国語活動が
  // 始まることに合わせ、あいさつ・色・数・曜日といった入門レベルに絞った
  // オリジナル問題を用意している。
  "e3:english": [
    {
      q: "「こんにちは」を英語で言うとどれですか。",
      choices: ["Hello.", "Goodbye.", "Thank you.", "Sorry."],
      answer: 0,
      ladder: [
        { q: "英語の「Hello.」はどんなときに使いますか。", choices: ["あいさつのとき", "あやまるとき", "お礼を言うとき", "別れるとき"], answer: 0 },
      ],
    },
    {
      q: "\"red\" はどの色ですか。",
      choices: ["あか", "あお", "きいろ", "みどり"],
      answer: 0,
      ladder: [
        { q: "「あお」を英語で言うとどれですか。", choices: ["blue", "red", "green", "black"], answer: 0 },
      ],
    },
    {
      q: "\"three\" はいくつですか。",
      choices: ["2", "3", "4", "5"],
      answer: 1,
      ladder: [
        { q: "\"one, two, ___\" の空いているところに入るのはどれですか。", choices: ["three", "ten", "five", "four"], answer: 0 },
      ],
    },
    {
      q: "「ありがとう」を英語で言うとどれですか。",
      choices: ["Thank you.", "Good morning.", "See you.", "I'm sorry."],
      answer: 0,
    },
    {
      q: "\"How are you?\" と聞かれたときの答え方として合っているのはどれですか。",
      choices: ["I'm fine, thank you.", "It's a dog.", "Yes, three.", "Good night, apple."],
      answer: 0,
    },
  ],
  "e3:japanese": [
    {
      q: "「話す」の読み方として正しいものはどれですか。",
      choices: ["はなす", "わす", "はす", "かす"],
      answer: 0,
      easier: { q: "「山」の読み方として正しいものはどれですか。", choices: ["やま", "かわ", "そら", "うみ"], answer: 0 },
    },
    {
      q: "「明るい」の送りがなとして正しいものはどれですか。",
      choices: ["明い", "明るい", "明かるい", "明かい"],
      answer: 1,
      easier: { q: "「たのしい」を漢字と送りがなで書くとどれですか。", choices: ["楽い", "楽しい", "楽のしい", "楽たしい"], answer: 1, easier: { q: "「あかるい」を漢字と送りがなで書くとどれですか。", choices: ["明るい", "明かるい", "明い", "明あかるい"], answer: 0 } },
    },
    { q: "「ふりかえる」の意味に最も近いものはどれですか。", choices: ["うしろを見る", "とびこえる", "ねむる", "はしる"], answer: 0 },
    {
      q: "つぎの文の主語はどれですか。「弟が 大きな 声で 歌う。」",
      choices: ["弟が", "大きな", "声で", "歌う"],
      answer: 0,
      easier: { q: "つぎの文の主語はどれですか。「犬が 走る。」", choices: ["犬が", "走る", "が", "犬走"], answer: 0 },
    },
  ],
  "e6:math": [
    {
      q: "半径3cmの円の面積はおよそいくらですか。円周率は3.14とします。",
      choices: ["9.42cm²", "18.84cm²", "28.26cm²", "56.52cm²"],
      answer: 2,
      svg: TUTOR_FIGURES.circleRadius3,
      easier: {
        q: "円の面積を求める式はどれですか。",
        choices: ["半径 × 2 × 円周率", "半径 × 半径 × 円周率", "直径 × 円周率", "半径 × 円周率 ÷ 2"],
        answer: 1,
        easier: {
          q: "半径3cmの円の直径は何cmですか。",
          choices: ["1.5cm", "3cm", "6cm", "9cm"],
          answer: 2,
        },
      },
    },
    {
      q: "定価800円の品物を25%引きで買うと、代金はいくらですか。",
      choices: ["560円", "600円", "640円", "775円"],
      answer: 1,
      easier: { q: "800円の10%はいくらですか。", choices: ["8円", "80円", "180円", "800円"], answer: 1, easier: { q: "100円の10%はいくらですか。", choices: ["1円", "10円", "50円", "100円"], answer: 1 } },
    },
    {
      q: "2:3 と等しい比はどれですか。",
      choices: ["3:2", "4:9", "6:9", "5:6"],
      answer: 2,
      easier: { q: "1:2 と等しい比はどれですか。", choices: ["2:1", "2:4", "3:4", "1:3"], answer: 1 },
    },
    {
      q: "縦4cm、横5cm、高さ3cmの直方体の体積はいくらですか。",
      choices: ["12cm³", "27cm³", "60cm³", "94cm³"],
      answer: 2,
      svg: TUTOR_FIGURES.boxVolume,
    },
    {
      q: "時速60kmで走る車が45分間に進む道のりはどれだけですか。",
      choices: ["30km", "40km", "45km", "50km"],
      answer: 2,
      easier: { q: "時速60kmで走る車が30分間に進む道のりはどれだけですか。", choices: ["20km", "30km", "60km", "120km"], answer: 1 },
    },
  ],
  "e6:japanese": [
    {
      q: "意味が似た漢字を重ねてできた熟語はどれですか。",
      choices: ["高低", "岩石", "着席", "非常"],
      answer: 1,
      easier: { q: "反対の意味の漢字を重ねてできた熟語はどれですか。", choices: ["岩石", "大小", "読書", "green国語"], answer: 1 },
    },
    {
      q: "先生に対して使う言い方として正しいものはどれですか。",
      choices: ["先生が申しました", "先生がおっしゃいました", "先生が拝見しました", "先生がいたしました"],
      answer: 1,
      easier: {
        q: "自分の動作をへりくだって言う言い方はどれですか。",
        choices: ["おっしゃる", "申す", "召し上がる", "いらっしゃる"],
        answer: 1,
      },
    },
    { q: "「気が短い」に近い意味の言い方はどれですか。", choices: ["腹を立てるのが早い", "耳が痛い", "手をぬく", "顔が広い"], answer: 0 },
    { q: "次の文の述語はどれですか。「校庭の桜が とても きれいに 咲いた。」", choices: ["校庭の", "桜が", "きれいに", "咲いた"], answer: 3 },
  ],
  "e6:english": [
    {
      q: "「わたしは毎朝6時に起きます。」を英語にすると?",
      choices: ["I get up at six every morning.", "I get up six every morning.", "I am get up at six.", "I getting up at six."],
      answer: 0,
      easier: {
        q: "「わたしは毎日走ります。」を英語にすると?",
        choices: ["I run every day.", "I running every day.", "I am run every day.", "I runs every day."],
        answer: 0,
      },
    },
    {
      q: "\"How many books do you have?\" への答えとして自然なものはどれですか。",
      choices: ["Yes, I do.", "I have twenty books.", "It is a book.", "I am fine."],
      answer: 1,
      easier: {
        q: "\"How are you?\" への答えとして自然なものはどれですか。",
        choices: ["I'm fine, thank you.", "It is a pen.", "Yes, I am book.", "I have three."],
        answer: 0,
      },
    },
    { q: "\"Tuesday\" の次の曜日はどれですか。", choices: ["Monday", "Wednesday", "Thursday", "Sunday"], answer: 1 },
    { q: "「あなたの好きな食べ物は何ですか?」を英語にすると?", choices: ["What is your favorite food?", "What you like food?", "Which food you favorite?", "How your favorite food?"], answer: 0 },
  ],
  "j1:math": [
    {
      q: "(-7) + 3 を計算すると?",
      choices: ["-10", "-4", "4", "10"],
      answer: 1,
      svg: TUTOR_FIGURES.numberLineNegative,
      easier: { q: "(-2) + 1 を計算すると?", choices: ["-3", "-1", "1", "3"], answer: 1, easier: { q: "(-1) + 1 を計算すると?", choices: ["-2", "-1", "0", "2"], answer: 2 } },
    },
    {
      q: "(-4) × (-5) を計算すると?",
      choices: ["-20", "-9", "9", "20"],
      answer: 3,
      easier: { q: "(-2) × (-3) を計算すると?", choices: ["-6", "-5", "5", "6"], answer: 3 },
    },
    {
      // 5段階ラダー完成例その2(2026-08-23)。
      q: "方程式 3x - 5 = 16 を解くと?",
      choices: ["x = 3", "x = 7", "x = 11/3", "x = 21"],
      answer: 1,
      ladder: [
        { q: "方程式 3x = 21 を解くと?", choices: ["x = 3", "x = 7", "x = 18", "x = 63"], answer: 1 },
        { q: "方程式 2x = 10 を解くと?", choices: ["x = 2", "x = 5", "x = 8", "x = 20"], answer: 1 },
        { q: "方程式 x + 4 = 9 を解くと?", choices: ["x = 3", "x = 4", "x = 5", "x = 13"], answer: 2 },
        { q: "方程式 x + 1 = 3 を解くと?", choices: ["x = 1", "x = 2", "x = 3", "x = 4"], answer: 1 },
        { q: "「x + 1 = 3」の x を求めるには、両辺から何を引けばよいですか。", choices: ["1", "2", "3", "x"], answer: 0 },
      ],
    },
    {
      q: "a = 3 のとき、5a - 2 の値は?",
      choices: ["10", "13", "15", "17"],
      answer: 1,
      easier: { q: "a = 3 のとき、2a の値は?", choices: ["3", "5", "6", "9"], answer: 2 },
    },
    { q: "「1個x円のパンを4個買って500円出したときのおつり」を式にすると?", choices: ["4x - 500", "500 - 4x", "500 - x + 4", "x - 500"], answer: 1 },
  ],
  "j1:english": [
    {
      q: "空所に入る語は? \"My sister ___ tennis every Sunday.\"",
      choices: ["play", "plays", "playing", "to play"],
      answer: 1,
      easier: { q: "空所に入る語は? \"He ___ soccer every day.\"", choices: ["play", "plays", "playing", "played to"], answer: 1, easier: { q: "主語が he / she / it のとき、現在形の動詞の終わりに付くのはどれですか。", choices: ["-s", "-ing", "-ed", "何も付かない"], answer: 0 } },
    },
    {
      q: "空所に入る語は? \"___ they students? — Yes, they are.\"",
      choices: ["Is", "Am", "Are", "Do"],
      answer: 2,
      easier: { q: "空所に入る語は? \"___ you a student? — Yes, I am.\"", choices: ["Is", "Am", "Are", "Do"], answer: 2 },
    },
    {
      q: "\"He doesn't like natto.\" を疑問文にすると?",
      choices: ["Does he like natto?", "Do he likes natto?", "Is he like natto?", "He does like natto?"],
      answer: 0,
      easier: { q: "\"You like music.\" を疑問文にすると?", choices: ["Do you like music?", "Does you like music?", "Are you like music?", "You do like music?"], answer: 0 },
    },
    { q: "「机の上に本が1冊あります。」を英語にすると?", choices: ["There is a book on the desk.", "There are a book on the desk.", "It has a book on the desk.", "A book there is on the desk."], answer: 0 },
  ],
  "j1:japanese": [
    {
      q: "次の語のうち、動詞はどれですか。",
      choices: ["静かだ", "美しい", "走る", "とても"],
      answer: 2,
      easier: { q: "次の語のうち、動詞はどれですか。", choices: ["book本", "食べる", "赤い", "ゆっくり"], answer: 1 },
    },
    { q: "「きれいな花」の「きれいな」の品詞は何ですか。", choices: ["名詞", "形容詞", "形容動詞", "副詞"], answer: 2 },
    {
      q: "「ゆっくり歩く」の「ゆっくり」の品詞は何ですか。",
      choices: ["副詞", "連体詞", "助詞", "接続詞"],
      answer: 0,
      easier: { q: "「とても寒い」の「とても」は、あとの語をくわしく説明しています。この働きの品詞はどれですか。", choices: ["副詞", "名詞", "動詞", "助動詞"], answer: 0 },
    },
    { q: "次の文の主語はどれですか。「昨日、友人の兄が 荷物を 届けてくれた。」", choices: ["昨日", "友人の", "兄が", "荷物を"], answer: 2 },
  ],
  // 「話し方・質問の仕方」入門(2026-08-24新設)。日本語の説明はしつつ、
  // **問われている内容自体は実際に使える英語フレーズ**にしてある
  // (ユーザー指示「英語表現として教材化すること」への対応)。仮説的な話・
  // 建設的なフィードバック・大胆さと繊細さの3テーマをやさしいレベルで
  // 扱う(高校版はより踏み込んだ表現)。
  "j1:communication": [
    {
      q: "「もし仮に〜だとしたら」と、断定せずに仮説の話を切り出す英語表現はどれですか。",
      choices: ["\"If, hypothetically, ...\"", "\"It is a fact that ...\"", "\"You must ...\"", "\"Never do that.\""],
      answer: 0,
      easier: {
        q: "「〜かもしれません」という、断定を避けるやわらかい言い方はどれですか。",
        choices: ["\"It might be ...\"", "\"It is definitely ...\"", "\"That's wrong.\"", "\"Do it now.\""],
        answer: 0,
      },
    },
    {
      q: "問題点を指摘したあとに、相手の意見を求める丁寧な言い方はどれですか。",
      choices: [
        "\"This is clearly wrong. Fix it.\"",
        "\"I think the problem here is X. What do you think we should do, Ken?\"",
        "\"I don't care about your opinion.\"",
        "\"Whatever.\"",
      ],
      answer: 1,
      easier: {
        q: "みんなに意見を求めるときの丁寧な言い方はどれですか。",
        choices: ["\"Everyone, could you share your thoughts?\"", "\"Nobody cares.\"", "\"Just decide for me.\"", "\"Stop talking.\""],
        answer: 0,
      },
    },
    {
      q: "消極的すぎず、かといって乱暴でもない「大胆かつ繊細」な提案の仕方はどれですか。",
      choices: [
        "\"Um, maybe, I don't know, nevermind...\"",
        "\"Do exactly what I say, no questions.\"",
        "\"I'd like to suggest an idea — please let me know what you think.\"",
        "\"...\" (何も言わない)",
      ],
      answer: 2,
    },
    {
      q: "相手の意見を否定せずに、別の見方を丁寧に加える言い方はどれですか。",
      choices: [
        "\"That's a good point. Could I add another perspective?\"",
        "\"You're completely wrong.\"",
        "\"That doesn't matter.\"",
        "\"I already knew that.\"",
      ],
      answer: 0,
    },
    {
      q: "グループでの話し合いの最初に、みんなへ意見を求める定番の一言はどれですか。",
      choices: ["\"Everyone, I'd love to hear your thoughts.\"", "\"Just agree with me.\"", "\"I'll decide alone.\"", "\"Silence, please.\""],
      answer: 0,
    },
  ],
  "j3:math": [
    {
      q: "(x + 3)(x - 5) を展開すると?",
      choices: ["x² - 2x - 15", "x² + 2x - 15", "x² - 8x + 15", "x² - 15"],
      answer: 0,
      easier: { q: "(x + 1)(x + 2) を展開すると?", choices: ["x² + 3x + 2", "x² + 2x + 2", "x² + 3x + 3", "x² + 2"], answer: 0, easier: { q: "x(x + 2) を展開すると?", choices: ["x² + 2x", "x² + 2", "2x² ", "x + 2x"], answer: 0 } },
    },
    {
      q: "x² - 9x + 20 を因数分解すると?",
      choices: ["(x - 4)(x - 5)", "(x + 4)(x + 5)", "(x - 2)(x - 10)", "(x - 1)(x - 20)"],
      answer: 0,
      easier: { q: "x² + 5x + 6 を因数分解すると?", choices: ["(x + 2)(x + 3)", "(x + 1)(x + 6)", "(x - 2)(x - 3)", "(x + 5)(x + 1)"], answer: 0, easier: { q: "x² + 2x を因数分解すると?", choices: ["x(x + 2)", "(x + 1)(x + 2)", "2x(x + 1)", "x²(1 + 2)"], answer: 0 } },
    },
    {
      q: "√48 を簡単にすると?",
      choices: ["2√12", "4√3", "3√4", "6√2"],
      answer: 1,
      easier: { q: "√12 を簡単にすると?", choices: ["2√3", "3√2", "4√3", "6"], answer: 0 },
    },
    {
      q: "二次方程式 x² - 6x + 8 = 0 の解は?",
      choices: ["x = 2, 4", "x = -2, -4", "x = 1, 8", "x = 3 のみ"],
      answer: 0,
      easier: { q: "二次方程式 x² - 3x + 2 = 0 の解は?", choices: ["x = 1, 2", "x = -1, -2", "x = 2, 3", "x = 0, 3"], answer: 0, easier: { q: "二次方程式 (x - 1)(x - 2) = 0 の解は?", choices: ["x = 1, 2", "x = -1, -2", "x = 0, 3", "x = 3"], answer: 0 } },
    },
    {
      q: "直角三角形の直角をはさむ2辺が5cmと12cmのとき、斜辺の長さは?",
      choices: ["13cm", "15cm", "17cm", "60cm"],
      answer: 0,
      svg: TUTOR_FIGURES.rightTriangle512,
      easier: { q: "直角三角形の直角をはさむ2辺が3cmと4cmのとき、斜辺の長さは?", choices: ["5cm", "6cm", "7cm", "12cm"], answer: 0, easier: { q: "三平方の定理の式はどれですか(cが斜辺)。", choices: ["a² + b² = c²", "a + b = c", "a² - b² = c²", "a × b = c"], answer: 0 } },
    },
  ],
  "j3:english": [
    {
      q: "空所に入る語句は? \"I ___ in this town since 2015.\"",
      choices: ["live", "lived", "have lived", "am living"],
      answer: 2,
      easier: { q: "空所に入る語句は? \"She ___ just finished her homework.\"", choices: ["have", "has", "is", "does"], answer: 1, easier: { q: "現在完了形は「have / has + ___」の形です。空所に入るのはどれですか。", choices: ["過去分詞", "原形", "-ing形", "名詞"], answer: 0 } },
    },
    {
      q: "\"This letter was written by Ken.\" と同じ意味の文は?",
      choices: ["Ken wrote this letter.", "Ken has written by this letter.", "This letter wrote Ken.", "Ken is writing this letter."],
      answer: 0,
      easier: { q: "\"The window was broken by Tom.\" と同じ意味の文は?", choices: ["Tom broke the window.", "Tom is broken the window.", "The window broke Tom.", "Tom was broken."], answer: 0 },
    },
    {
      q: "空所に入る語は? \"The book ___ I bought yesterday is interesting.\"",
      choices: ["who", "which", "whose", "what"],
      answer: 1,
      easier: { q: "空所に入る語は? \"I have a friend ___ lives in Osaka.\"", choices: ["which", "who", "whose", "what"], answer: 1, easier: { q: "人を説明するときに使う関係代名詞はどれですか。", choices: ["who", "which", "what", "where"], answer: 0 } },
    },
    { q: "\"She is too tired to walk.\" に近い意味の文は?", choices: ["She is so tired that she cannot walk.", "She is tired but she can walk.", "She walks because she is tired.", "She is tired enough to walk."], answer: 0 },
  ],
  "h1:math": [
    {
      q: "二次関数 y = x² - 4x + 1 の頂点の座標は?",
      choices: ["(2, -3)", "(-2, -3)", "(2, 1)", "(4, 1)"],
      answer: 0,
      svg: TUTOR_FIGURES.parabolaVertex,
      easier: { q: "二次関数 y = (x - 2)² + 5 の頂点の座標は?", choices: ["(2, 5)", "(-2, 5)", "(2, -5)", "(5, 2)"], answer: 0, easier: { q: "二次関数 y = x² + 3 の頂点の座標は?", choices: ["(0, 3)", "(3, 0)", "(0, -3)", "(-3, 0)"], answer: 0 } },
    },
    {
      q: "二次方程式 x² - 4x + 5 = 0 の実数解の個数は?(判別式で判断)",
      choices: ["2個", "1個", "0個", "3個"],
      answer: 2,
      easier: { q: "二次方程式 ax² + bx + c = 0 の判別式Dはどれですか。", choices: ["b² - 4ac", "b² + 4ac", "4ac - b²", "2a - b"], answer: 0 },
    },
    {
      q: "sin30° の値は?",
      choices: ["1/2", "√2/2", "√3/2", "1"],
      answer: 0,
      easier: { q: "cos60° の値は?", choices: ["1/2", "√3/2", "1", "0"], answer: 0 },
    },
    {
      q: "|x - 3| < 2 を満たす x の範囲は?",
      choices: ["1 < x < 5", "x < 1 または x > 5", "-5 < x < -1", "x > 5"],
      answer: 0,
      easier: { q: "|x| < 2 を満たす x の範囲は?", choices: ["-2 < x < 2", "x < 2", "x > -2", "x > 2"], answer: 0 },
    },
    { q: "2つのサイコロを同時に投げたとき、出た目の和が7になる確率は?", choices: ["1/12", "1/6", "5/36", "7/36"], answer: 1 },
  ],
  "h1:english": [
    {
      q: "空所に入る語句は? \"If I ___ more time, I would travel abroad.\"",
      choices: ["have", "had", "will have", "am having"],
      answer: 1,
      easier: {
        q: "空所に入る語句は? \"If it ___ tomorrow, I will stay home.\"",
        choices: ["rains", "rained", "will rain", "raining"],
        answer: 0,
        easier: {
          q: "\"if\" のあとの文が未来のことを表すとき、動詞はどちらの形を使いますか。",
          choices: ["現在形", "未来形(will)", "過去形", "-ing形"],
          answer: 0,
        },
      },
    },
    {
      q: "\"Because it was raining, we stayed home.\" を分詞構文にすると?",
      choices: ["Raining, we stayed home.", "It raining, we stayed home.", "To rain, we stayed home.", "Rained, we stayed home."],
      answer: 1,
      easier: {
        q: "\"When she saw me, she smiled.\" を分詞構文にすると?",
        choices: ["Seeing me, she smiled.", "Saw me, she smiled.", "To see me, she smiled.", "Seen me, she smiled."],
        answer: 0,
      },
    },
    {
      q: "空所に入る語句は? \"He is used ___ early in the morning.\"",
      choices: ["to get up", "to getting up", "get up", "got up"],
      answer: 1,
      easier: { q: "空所に入る語句は? \"I look forward ___ you again.\"", choices: ["to see", "to seeing", "see", "saw"], answer: 1 },
    },
    { q: "\"I wish I could speak French.\" の意味に最も近いものは?", choices: ["フランス語を話せたらいいのにと思う", "フランス語を話せるようになった", "フランス語を話すつもりだ", "フランス語を話せと言われた"], answer: 0 },
  ],
  "h1:japanese": [
    {
      q: "古文の「うつくし」の、古語としての主な意味はどれですか。",
      choices: ["かわいらしい", "きれいだ", "正しい", "めずらしい"],
      answer: 0,
      easier: { q: "古文の「あはれなり」の主な意味はどれですか。", choices: ["しみじみと心を動かされる", "こっけいだ", "うるさい", "новый新しい"], answer: 0 },
    },
    {
      q: "古文の助動詞「けり」の主な意味はどれですか。",
      choices: ["過去・詠嘆", "推量", "打消", "使役"],
      answer: 0,
      easier: { q: "古文の助動詞「ず」の意味はどれですか。", choices: ["打消", "過去", "希望", "尊敬"], answer: 0 },
    },
    { q: "「いと をかし」の「をかし」の意味に最も近いものはどれですか。", choices: ["趣がある", "おかしくて笑える", "気の毒だ", "恐ろしい"], answer: 0 },
    { q: "評論文で、筆者の主張を読み取る手がかりとして最も適切なものはどれですか。", choices: ["具体例の細かい数字", "「つまり」「このように」などの後の一文", "登場人物の会話", "本文中の固有名詞の数"], answer: 1 },
  ],
  // 「話し方・質問の仕方」高校版(2026-08-24新設)。j1版より一歩踏み込んで、
  // Hypothetical Discussion(仮説的な話)・Constructive Feedback(建設的な
  // 指摘)・大胆さと繊細さを両立する英語フレーズを扱う。
  "h1:communication": [
    {
      q: "「仮に〜だとしたら、どうなるでしょうか」と、断定せず仮説を投げかける会議向けの英語表現はどれですか。",
      choices: [
        "\"Hypothetically speaking, what would happen if we changed this?\"",
        "\"This is exactly what will happen.\"",
        "\"You are wrong about this.\"",
        "\"I refuse to discuss this.\"",
      ],
      answer: 0,
      easier: {
        q: "「これはあくまで仮の話ですが」と前置きする表現はどれですか。",
        choices: ["\"This is just a hypothetical, but ...\"", "\"This is a fact.\"", "\"Trust me blindly.\"", "\"No comment.\""],
        answer: 0,
      },
    },
    {
      q: "問題点を明確に指摘したうえで、特定の人へ丁寧に解決策を求める、構造化された話法はどれですか。",
      choices: [
        "\"You always mess this up.\"",
        "\"The problem here is clearly the deadline. I think we could extend it — Sato-san, could you suggest a solution?\"",
        "\"It's not my problem.\"",
        "\"Figure it out yourself.\"",
      ],
      answer: 1,
      easier: {
        q: "問題点を伝えたあとに使う、意見を求める丁寧なつなぎの表現はどれですか。",
        choices: ["\"What would you suggest?\"", "\"I don't want to know.\"", "\"Just fix it.\"", "\"Not my job.\""],
        answer: 0,
      },
    },
    {
      q: "会議やチームでの発言について、「大胆かつ繊細に」話すことの利点として最も適切な説明はどれですか。",
      choices: [
        "消極的すぎると意見が届かず失敗しやすいが、思いやりのある言葉選びをすれば率直な意見も受け止められやすくなる",
        "とにかく強く主張すれば、内容が正しくなくても常にうまくいく",
        "何も言わずに黙っていれば、誤解されることはない",
        "繊細さは弱さの表れなので、ビジネスの場では不要である",
      ],
      answer: 0,
    },
    {
      q: "建設的なフィードバックを伝える際、相手の努力を認めたうえで改善点を添える英語表現はどれですか。",
      choices: [
        "\"This is completely wrong, start over.\"",
        "\"I can see the effort you put into this. One thing that could make it even stronger is ...\"",
        "\"I have nothing to say.\"",
        "\"Whatever works for you.\"",
      ],
      answer: 1,
      easier: {
        q: "相手の良い点を先に伝える表現はどれですか。",
        choices: ["\"I really like how you ...\"", "\"That's terrible.\"", "\"I don't care.\"", "\"No.\""],
        answer: 0,
      },
    },
    {
      q: "会議の終わりに、全員へ改めて意見を求める丁寧な締めの一言はどれですか。",
      choices: [
        "\"Everyone, please feel free to share any thoughts before we close.\"",
        "\"Meeting's over, don't bother me.\"",
        "\"I've already decided, so it doesn't matter.\"",
        "\"No questions allowed.\"",
      ],
      answer: 0,
    },
  ],
};

// 練習問題の代わりに「案内文」を表示する教科(ユーザー指示、2026-08-23)。
// **プログラミングは練習問題を用意していない**——open-englishのAIエンジン
// (aruaru-llm、GPT-2系)単体ではプログラミング指導の対応力が弱いという
// 実情をそのまま伝え、外部の有料サービスの併用を案内する。
// 誇張して「対応済み」に見せないための、意図的な設計。
const TUTOR_NOTICE_SUBJECTS = {
  programming: {
    ja:
      "プログラミングの授業については、open-englishのAIエンジン(aruaru-llm)単体では" +
      "対応力が弱いため、CLAUDE CODE DESKTOPの有料版を合わせてお申し込みいただくことを" +
      "お勧めします。ご利用可能時間はご契約のプランによって変動いたします。",
    en:
      "For programming lessons, open-english's own AI engine (aruaru-llm) is not strong " +
      "enough on its own, so we recommend subscribing to the paid version of Claude Code " +
      "Desktop alongside it. Available usage time depends on the plan you sign up for.",
  },
};

function tutorIsNoticeSubject(subjectId) {
  return Object.prototype.hasOwnProperty.call(TUTOR_NOTICE_SUBJECTS, subjectId);
}

function tutorNoticeText(subjectId) {
  const n = TUTOR_NOTICE_SUBJECTS[subjectId];
  return n ? `${n.ja}
${n.en}` : "";
}

/**
 * この学年・教科で実際に出題できる学年を返す(無ければ`null`)。
 * 選んだ学年に問題が無くても、**同じ教科の問題が用意されている下の学年**が
 * あればそこから出題する(ユーザー指示、2026-08-23「未収録の学年は飛ばして、
 * その次に問題がある下の学年を使う」)。高3のように上の学年の問題を
 * まだ用意できていなくても、コース自体は使えるようにするための仕組み。
 */
function tutorResolveSourceGrade(gradeId, subjectId) {
  if (tutorHasQuestions(gradeId, subjectId)) return gradeId;
  const from = TUTOR_GRADES.findIndex((g) => g.id === gradeId);
  for (let i = from - 1; i >= 0; i -= 1) {
    if (tutorHasQuestions(TUTOR_GRADES[i].id, subjectId)) return TUTOR_GRADES[i].id;
  }
  return null;
}

function tutorHasQuestions(gradeId, subjectId) {
  const list = TUTOR_QUESTIONS[`${gradeId}:${subjectId}`];
  return Array.isArray(list) && list.length > 0;
}

const tutorCourseBtn = document.getElementById("tutor-course-btn");
const tutorCourseModal = document.getElementById("tutor-course-modal");
const tutorCourseClose = document.getElementById("tutor-course-close");
const tutorGradeListEl = document.getElementById("tutor-grade-list");
const tutorSubjectSectionEl = document.getElementById("tutor-subject-section");
const tutorSelectedGradeEl = document.getElementById("tutor-selected-grade");
const tutorSubjectListEl = document.getElementById("tutor-subject-list");
const tutorInstallSelectedBtn = document.getElementById("tutor-install-selected");
const tutorInstallAllBtn = document.getElementById("tutor-install-all");
const tutorInstallStatusEl = document.getElementById("tutor-install-status");
const tutorPracticeSectionEl = document.getElementById("tutor-practice-section");
const tutorCareerGuidanceEl = document.getElementById("tutor-career-guidance");
const tutorPracticeSubjectEl = document.getElementById("tutor-practice-subject");
const tutorStartBtn = document.getElementById("tutor-start");
const tutorSubmitBtn = document.getElementById("tutor-submit");
const tutorQuizEl = document.getElementById("tutor-quiz");
const tutorNoticeEl = document.getElementById("tutor-subject-notice");
const tutorResultEl = document.getElementById("tutor-result");
const tutorEasierBtn = document.getElementById("tutor-easier-btn");
const tutorMuchEasierBtn = document.getElementById("tutor-much-easier-btn");
const tutorPracticeBtn = document.getElementById("tutor-practice-btn");

const TUTOR_SETTINGS_KEY = "open-english.tutorCourse";
let tutorSelectedGrade = null;
let tutorInstalledSubjects = [];
let tutorCurrentQuiz = [];
let tutorMissedQuestions = [];
// 落ちこぼれ防止(ユーザー指示により2026-08-23中に段階的に再設計。
// 最終形は**2段構え・回数無制限**)。
//   第1段: **同じ学年の中で**易しくしていく(`ladder`方式。
//     `tutorLadder`は易しい順の類題配列、`tutorStage`が現在の段階)。
//     **回数の固定上限は置かない**——用意されている類題がある限り、
//     何度でも下がり続ける(データが尽きたら第2段へ)。
//   第2段: その学年の類題を**使い切って初めて**、同じ教科で
//     **1つ下の学年**の問題へ切り替える(問題が用意されていない
//     学年は飛ばして、その次に問題がある下の学年を使う)。
//     学年を下げた先では、またその学年内で易化していける。
//   下限: **保育園児・幼稚園児(`p0`)**。ここまで来たら学年は下げず、
//     その学年内の段階調整のみ。そこも尽きたら無理に下げず、正解を
//     示して「トレーナーと復習」へ優しく案内する。
// **「5回まで」のような固定回数の上限はコード上に置かないこと**
// (ユーザー指示、2026-08-23最終仕様)。実際にどこまで下がれるかは
// 「用意されているデータがあるかどうか」だけで決まる。
let tutorSourceItem = null;
let tutorLadder = [];
let tutorStage = 0;
// いま出題している学年(選んだ学年から下げていくので、選択学年とは別に持つ)。
let tutorPracticeGrade = null;
// この問題で学年を下げた回数(表示用。上限は設けていない)。
let tutorGradeDrops = 0;

function loadTutorSettings() {
  try {
    const raw = localStorage.getItem(TUTOR_SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved.grade === "string") tutorSelectedGrade = saved.grade;
    if (saved && Array.isArray(saved.subjects)) tutorInstalledSubjects = saved.subjects;
  } catch (_) {
    /* 壊れた保存値は無視して初期状態から始める(サービスを止めない) */
  }
}

function saveTutorSettings() {
  try {
    localStorage.setItem(
      TUTOR_SETTINGS_KEY,
      JSON.stringify({ grade: tutorSelectedGrade, subjects: tutorInstalledSubjects })
    );
  } catch (_) {
    /* 保存できなくても機能自体は使えるので握りつぶす */
  }
}

/**
 * 学習履歴(採点結果)の保存。既存の`POST /v1/db/history`をそのまま使う
 * ——このエンドポイントはサーバー側でローカルSQLiteへ保存し、
 * `OPEN_ENGLISH_DATABASE_URL`が設定されていれば**aruaru-db/PostgreSQLへも
 * ベストエフォートでミラー**する(2026-08-18実装、`server/src/db.rs`参照)。
 * つまりaruaru-dbが動いていれば履歴はそちらにも入り、動いていなければ
 * SQLiteのみで完結する——新しい仕組みは作っていない。
 * 失敗しても学習の進行は止めない(握りつぶす)。
 */
function recordTutorHistory(text) {
  try {
    const base = typeof apiBaseEl !== "undefined" && apiBaseEl ? "" : "";
    fetch(`${base}/v1/db/history`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "tutor-course-result", content: text }),
    }).catch(() => {});
  } catch (_) {
    /* 保存できなくても採点・出題は続ける */
  }
}

function renderTutorGrades() {
  tutorGradeListEl.innerHTML = "";
  TUTOR_GRADES.forEach((grade) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "setup-btn" + (grade.id === tutorSelectedGrade ? " selected" : "");
    btn.textContent = `${grade.ja} / ${grade.en}`;
    btn.addEventListener("click", () => selectTutorGrade(grade.id));
    tutorGradeListEl.appendChild(btn);
  });
}

function selectTutorGrade(gradeId) {
  if (gradeId !== tutorSelectedGrade) {
    // 学年を変えたら出題はいったん破棄する。インストール済みの教科は、
    // 新しい学年でも問題が用意されているものだけ引き継ぐ(出題中に
    // 学年を変えても、同じ教科をすぐ続けられるようにするため)。
    tutorInstalledSubjects = tutorInstalledSubjects.filter(
      (id) => tutorIsNoticeSubject(id) || tutorHasQuestions(gradeId, id)
    );
    tutorCurrentQuiz = [];
    tutorLadder = [];
    tutorStage = 0;
    tutorSourceItem = null;
    tutorPracticeGrade = null;
    tutorGradeDrops = 0;
    tutorQuizEl.innerHTML = "";
    tutorResultEl.textContent = "";
    tutorInstallStatusEl.textContent = "";
    tutorPracticeSectionEl.classList.add("hidden");
    tutorSubmitBtn.classList.add("hidden");
    tutorEasierBtn.classList.add("hidden");
    tutorMuchEasierBtn.classList.add("hidden");
    tutorPracticeBtn.classList.add("hidden");
  }
  tutorSelectedGrade = gradeId;
  saveTutorSettings();
  renderTutorGrades();
  renderTutorSubjects();
}

function renderTutorSubjects() {
  if (!tutorSelectedGrade) return;
  const grade = TUTOR_GRADES.find((g) => g.id === tutorSelectedGrade);
  tutorSelectedGradeEl.textContent = `選択中の学年 / Selected grade: ${grade.ja} / ${grade.en}`;
  tutorSubjectListEl.innerHTML = "";
  tutorSubjectsFor(tutorSelectedGrade).forEach((subject) => {
    // 「案内のみ」の教科(プログラミング)は、問題が無くてもインストール
    // できる——選ぶと練習問題の代わりに案内文を表示する。
    const noticeOnly = tutorIsNoticeSubject(subject.id);
    const sourceGrade = noticeOnly ? null : tutorResolveSourceGrade(tutorSelectedGrade, subject.id);
    const available = noticeOnly || sourceGrade !== null;
    const label = document.createElement("label");
    label.className = "tutor-subject-choice" + (available ? "" : " unavailable");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = subject.id;
    box.checked = tutorInstalledSubjects.includes(subject.id);
    label.appendChild(box);
    const span = document.createElement("span");
    const list = TUTOR_QUESTIONS[`${tutorSelectedGrade}:${subject.id}`];
    const count = list ? list.length : 0;
    if (noticeOnly) {
      span.textContent = `${subject.ja} / ${subject.en}(練習問題なし・案内のみ / guidance only, no practice questions)`;
    } else if (sourceGrade === tutorSelectedGrade) {
      span.textContent = `${subject.ja} / ${subject.en}(${count}問 / ${count} questions)`;
    } else if (sourceGrade) {
      // この学年の問題はまだ無いが、下の学年の問題で対応できる場合
      // ——「対応済み」に見せず、どの学年の問題が出るのかを明示する。
      const from = TUTOR_QUESTIONS[`${sourceGrade}:${subject.id}`].length;
      span.textContent =
        `${subject.ja} / ${subject.en}(この学年の問題は準備中——` +
        `${tutorGradeLabel(sourceGrade)}の${from}問で出題 / not ready for this grade; ` +
        `uses ${from} questions from ${tutorGradeLabel(sourceGrade)})`;
    } else {
      span.textContent = `${subject.ja} / ${subject.en}(準備中 / not ready yet)`;
    }
    label.appendChild(span);
    const careerHtml = tutorCareerHtml(subject);
    if (careerHtml) {
      const careerWrap = document.createElement("div");
      careerWrap.innerHTML = careerHtml;
      careerWrap.addEventListener("click", (e) => e.stopPropagation());
      label.appendChild(careerWrap);
    }
    tutorSubjectListEl.appendChild(label);
  });
  tutorSubjectSectionEl.classList.remove("hidden");
  if (tutorInstalledSubjects.length > 0) refreshTutorPracticeSection();
}

function installTutorSubjects(subjectIds) {
  const installable = (id) =>
    tutorIsNoticeSubject(id) || tutorResolveSourceGrade(tutorSelectedGrade, id) !== null;
  const available = subjectIds.filter(installable);
  const missing = subjectIds.filter((id) => !installable(id));
  tutorInstalledSubjects = available;
  saveTutorSettings();

  const subjects = tutorSubjectsFor(tutorSelectedGrade);
  const nameOf = (id) => {
    const s = subjects.find((x) => x.id === id);
    return s ? `${s.ja} / ${s.en}` : id;
  };
  const lines = [];
  if (available.length > 0) {
    lines.push(`インストールしました / Installed: ${available.map(nameOf).join("、")}`);
  } else {
    lines.push("インストールできる教科がありませんでした。 / No subject could be installed.");
  }
  if (missing.length > 0) {
    // **嘘の「対応済み」を出さないこと**——未収録は未収録と正直に伝える。
    lines.push(
      `現在この学年の次の教科の問題は準備中です(インストールしていません): ${missing
        .map(nameOf)
        .join("、")} / Questions for these subjects are not ready yet, so they were not installed.`
    );
  }
  tutorInstallStatusEl.textContent = lines.join("\n");
  renderTutorSubjects();
  refreshTutorPracticeSection();
}

function refreshTutorPracticeSection() {
  if (tutorInstalledSubjects.length === 0) {
    tutorPracticeSectionEl.classList.add("hidden");
    return;
  }
  const subjects = tutorSubjectsFor(tutorSelectedGrade);
  tutorPracticeSubjectEl.innerHTML = tutorInstalledSubjects
    .map((id) => {
      const s = subjects.find((x) => x.id === id);
      const label = s ? `${s.ja} / ${s.en}` : id;
      return `<option value="${id}">${label}</option>`;
    })
    .join("");
  tutorPracticeSectionEl.classList.remove("hidden");
}

/**
 * 段階ラダー(易しさの順に並んだ類題のリスト)を取り出す。
 * ユーザー指示(2026-08-23)により、各問題は`ladder: [1段階目, 2段階目, ...]`
 * という**配列**で段階を持てる。従来の`easier`(1段階だけの入れ子)も
 * そのまま使えるよう、入れ子チェーンを辿って配列へ正規化する
 * ——既存データを書き換えずに済ませるための後方互換。
 * **段階数の固定上限は設けない**(用意されているデータの数だけ使う)。
 */
function tutorLadderOf(item) {
  // **固定の段階数上限は設けない**(ユーザー指示、2026-08-23最終仕様)。
  // 用意されている類題の数だけ、そのまま段階として使う。
  if (Array.isArray(item.ladder)) return item.ladder.slice();
  const stages = [];
  let cur = item.easier;
  // 万一データが循環参照していても無限ループしないよう、既に見た
  // オブジェクトは辿らない(上限回数ではなく循環検出で止める)。
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    stages.push(cur);
    cur = cur.easier;
  }
  return stages;
}

/** 1問を描画する(選択肢の並びは毎回シャッフル)。 */
function renderTutorSingleQuestion(item) {
  const order = shuffledCopy(item.choices.map((_, ci) => ci));
  tutorCurrentQuiz = [
    {
      q: item.q,
      choices: order.map((ci) => item.choices[ci]),
      answer: order.indexOf(item.answer),
      svg: item.svg || null,
    },
  ];
  tutorQuizEl.innerHTML = tutorCurrentQuiz
    .map((q, qi) => {
      const choices = q.choices
        .map(
          (choice, ci) =>
            `<label class="exam-prep-choice"><input type="radio" name="tutor-q${qi}" value="${ci}" /> ${choice}</label>`
        )
        .join("");
      // 図解(インラインSVG)。**このアプリ自身が書いた固定文字列のみ**を
      // 埋め込む(利用者入力や外部データは決してここへ入れないこと)。
      const figure = q.svg ? `<div class="tutor-figure">${q.svg}</div>` : "";
      return `<div class="exam-prep-question"><p>${q.q}</p>${figure}${choices}</div>`;
    })
    .join("");
  // キャリアガイダンスは`#tutor-career-guidance`(下部、
  // `TUTOR_CAREER_GUIDANCE`/`tutorCareerGuidanceHtml`)側で出題のたびに
  // 更新して表示する。この関数内で二重に表示しないよう、ここでは
  // 教科選択画面用の`tutorCareerHtml`(`renderTutorSubjects`)は呼ばない。
  if (tutorStage > 0) {
    tutorResultEl.textContent =
      tutorGradeLabel(tutorPracticeGrade) + "の問題を、もう少し易しくしました(第" + tutorStage +
      "段階 / 全" + tutorLadder.length + "段階)。落ち着いて解いてみましょう。 / " +
      "An easier version within " + tutorGradeLabelBilingual(tutorPracticeGrade) + " (step " +
      tutorStage + " of " + tutorLadder.length + "). Take your time.";
  } else if (tutorGradeDrops > 0) {
    tutorResultEl.textContent =
      tutorGradeLabelBilingual(tutorPracticeGrade) + "の問題です(学年を" + tutorGradeDrops +
      "段階下げました)。ゆっくりで大丈夫です。 / " +
      "A question from " + tutorGradeLabelBilingual(tutorPracticeGrade) + " (" + tutorGradeDrops +
      " grade drop(s) so far). Take your time.";
  } else {
    tutorResultEl.textContent = "";
  }
  tutorSubmitBtn.classList.remove("hidden");
  tutorEasierBtn.classList.add("hidden");
  tutorMuchEasierBtn.classList.add("hidden");
  tutorPracticeBtn.classList.add("hidden");
  tutorMissedQuestions = [];
  // キャリアガイダンス(2026-08-24新設)。出題中の教科に紐づく業界・職種の
  // 参考情報を、問題の下に補足表示する。
  const careerSubjectId = tutorPracticeSubjectEl && tutorPracticeSubjectEl.value;
  const careerHtml = careerSubjectId ? tutorCareerGuidanceHtml(careerSubjectId) : "";
  if (tutorCareerGuidanceEl) {
    if (careerHtml) {
      tutorCareerGuidanceEl.innerHTML = careerHtml;
      tutorCareerGuidanceEl.classList.remove("hidden");
    } else {
      tutorCareerGuidanceEl.innerHTML = "";
      tutorCareerGuidanceEl.classList.add("hidden");
    }
  }
}

/**
 * インストール済み教科のプールから**ランダムに1問**選んで出題する
 * (ユーザー指示、2026-08-23「順番通りではなくランダムに1問ずつ」)。
 * 段階ラダーは0段階目(元の問題)から始める。
 */
function tutorGradeIndex(gradeId) {
  return TUTOR_GRADES.findIndex((g) => g.id === gradeId);
}

function tutorGradeLabel(gradeId) {
  return (TUTOR_GRADES.find((g) => g.id === gradeId) || { ja: gradeId, en: "" }).ja;
}

function tutorGradeLabelBilingual(gradeId) {
  const g = TUTOR_GRADES.find((x) => x.id === gradeId);
  return g ? g.ja + " / " + g.en : gradeId;
}

/**
 * いまの出題学年より下で、同じ教科の問題が実際に用意されている学年を
 * 「近い順」に返す(問題が無い学年は飛ばす)。最後の要素が、一気に
 * 大きく下げたときの行き先(通常は保育園児・幼稚園児)になる。
 */
function tutorLowerGradeCandidates(subjectId) {
  const from = tutorGradeIndex(tutorPracticeGrade);
  const lower = [];
  for (let i = from - 1; i >= 0; i -= 1) {
    const id = TUTOR_GRADES[i].id;
    if (tutorHasQuestions(id, subjectId)) lower.push(id);
  }
  return lower;
}

/** 指定した学年の問題からランダムに1問出し、その学年を現在の出題学年にする。 */
function askTutorQuestionForGrade(gradeId, subjectId, drops) {
  const pool = TUTOR_QUESTIONS[gradeId + ":" + subjectId] || [];
  if (pool.length === 0) return false;
  tutorPracticeGrade = gradeId;
  tutorGradeDrops = drops;
  tutorSourceItem = shuffledCopy(pool)[0];
  tutorLadder = tutorLadderOf(tutorSourceItem);
  tutorStage = 0;
  renderTutorSingleQuestion(tutorSourceItem);
  return true;
}

/**
 * インストール済み教科のプールから**ランダムに1問**出題する。
 * 選んだ学年に問題が無い場合は、問題が用意されている下の学年まで
 * 遡って出題し、その旨を正直に表示する。
 */
function renderTutorQuiz() {
  const subjectId = tutorPracticeSubjectEl.value;
  const materialsEl = document.getElementById("tutor-programming-materials");
  if (subjectId === "programming") {
    // プログラミング: (1) 有料版併用のご案内(ユーザー指示で維持)、
    // (2) 人手で書いたサンプル教材+改造課題、(3) 基礎の4択練習問題。
    // 学年別カリキュラムを持たないため、学年は下げない(学年内の
    // 段階調整のみ)。
    tutorNoticeEl.textContent = tutorNoticeText(subjectId);
    tutorNoticeEl.classList.remove("hidden");
    renderTutorProgrammingMaterials();
    tutorPracticeGrade = tutorSelectedGrade;
    tutorGradeDrops = 0;
    tutorSourceItem = shuffledCopy(TUTOR_PROGRAMMING_QUESTIONS)[0];
    tutorLadder = tutorLadderOf(tutorSourceItem);
    tutorStage = 0;
    renderTutorSingleQuestion(tutorSourceItem);
    return;
  }
  tutorNoticeEl.classList.add("hidden");
  if (materialsEl) materialsEl.classList.add("hidden");
  if (tutorIsNoticeSubject(subjectId)) {
    tutorQuizEl.innerHTML = "";
    tutorCurrentQuiz = [];
    tutorLadder = [];
    tutorStage = 0;
    tutorResultEl.textContent = tutorNoticeText(subjectId);
    tutorSubmitBtn.classList.add("hidden");
    tutorEasierBtn.classList.add("hidden");
    tutorMuchEasierBtn.classList.add("hidden");
    tutorPracticeBtn.classList.add("hidden");
    return;
  }

  tutorPracticeGrade = tutorSelectedGrade;
  tutorGradeDrops = 0;
  if (askTutorQuestionForGrade(tutorSelectedGrade, subjectId, 0)) return;

  // 選んだ学年には問題が無い——下の学年へ遡れるなら遡り、正直に告げる。
  const fallback = tutorLowerGradeCandidates(subjectId);
  if (fallback.length > 0 && askTutorQuestionForGrade(fallback[0], subjectId, 1)) {
    tutorResultEl.textContent =
      "選んだ学年(" + tutorGradeLabelBilingual(tutorSelectedGrade) + ")の問題はまだ準備中のため、" +
      tutorGradeLabelBilingual(tutorPracticeGrade) + "の問題を出題しています。 / " +
      "Questions for your grade are not ready yet, so this one comes from " +
      tutorGradeLabelBilingual(tutorPracticeGrade) + ".";
    return;
  }
  tutorQuizEl.innerHTML = "";
  tutorCurrentQuiz = [];
  tutorResultEl.textContent =
    "現在この学年・教科の問題は準備中です。 / Questions for this grade and subject are not ready yet.";
  tutorSubmitBtn.classList.add("hidden");
  tutorEasierBtn.classList.add("hidden");
  tutorMuchEasierBtn.classList.add("hidden");
}

function scoreTutorQuiz() {
  const item = tutorCurrentQuiz[0];
  if (!item) return;
  const subjectId = tutorPracticeSubjectEl.value;
  const selected = tutorQuizEl.querySelector('input[name="tutor-q0"]:checked');
  const isCorrect = Boolean(selected) && Number(selected.value) === item.answer;
  tutorMissedQuestions = isCorrect
    ? []
    : [{ q: item.q, correctChoice: item.choices[item.answer] }];

  const lines = [
    "得点 / Score: " + (isCorrect ? 1 : 0) + " / 1(" + tutorGradeLabel(tutorPracticeGrade) + "の問題)— " +
      "本アプリのオリジナル練習問題です。学校の成績や入試の合否を予測するものではありません。 / " +
      "These are original practice questions; the score does not predict school grades or exam results.",
  ];

  // **第1段: まず同じ学年の中で最大5段階まで易しくする。**
  const hasNextStage = !isCorrect && tutorStage < tutorLadder.length;
  // **第2段: 学年内の段階を使い切って初めて、1つ下の学年へ。**
  const candidates = !isCorrect && !hasNextStage ? tutorLowerGradeCandidates(subjectId) : [];

  if (isCorrect) {
    if (tutorStage > 0 || tutorGradeDrops > 0) {
      lines.push(
        "正解です。ここまで戻って解けました。もとの学年(" +
          tutorGradeLabel(tutorSelectedGrade) +
          ")の問題に、もう一度挑戦してみましょう。 / Correct — now try your own grade again."
      );
    } else {
      lines.push("正解です。よくできました。 / Correct — nicely done.");
    }
  } else if (hasNextStage) {
    lines.push(
      "同じ" + tutorGradeLabel(tutorPracticeGrade) + "の中で、もう少し易しい類題があります" +
        "(次は第" + (tutorStage + 1) + "段階 / この問題は全" + tutorLadder.length + "段階)。 / " +
        "An easier version within the same grade is available (step " + (tutorStage + 1) +
        " of " + tutorLadder.length + ")."
    );
  } else if (candidates.length > 0) {
    const one = candidates[0];
    const far = candidates[candidates.length - 1];
    lines.push(
      (tutorLadder.length > 0
        ? "この学年での" + tutorLadder.length + "段階をすべて使いました。"
        : "この問題には学年内の易しい類題が用意されていません。") +
        "ここからは学年を下げます——" + tutorGradeLabel(one) + "の問題に切り替えられます。 / " +
        "The easier steps within this grade are used up; you can now drop to " +
        tutorGradeLabelBilingual(one) + "."
    );
    if (far !== one) {
      lines.push(
        "一気にやさしくしたいときは、" + tutorGradeLabel(far) + "まで下げることもできます。 / " +
          "If you would like something much easier, you can jump down to " + tutorGradeLabelBilingual(far) + "."
      );
    }
  } else {
    lines.push(
      "正解は「" + item.choices[item.answer] + "」です。 / The correct answer is \"" +
        item.choices[item.answer] + "\"."
    );
    lines.push(
      tutorPracticeGrade === "p0"
        ? "ここが一番やさしい学年(保育園児・幼稚園児)です。これ以上は学年を下げません。" +
            "まちがえても大丈夫——下のボタンで、トレーナーと一緒にゆっくり考えてみましょう。 / " +
            "This is the lowest level we go (preschool). That's perfectly okay — take it slowly with your trainer below."
        : "これ以上易しくできる問題が用意されていません(学年内の段階も、下の学年の問題も" +
            "まだありません)。下のボタンで、トレーナーと一緒に解き方を復習しましょう。 / " +
            "Nothing easier is available yet (no more steps in this grade, and no lower grade has questions " +
            "for this subject). Review it with your trainer using the button below."
    );
  }

  tutorResultEl.textContent = lines.join("\n");

  if (hasNextStage) {
    tutorEasierBtn.textContent =
      "\ud83c\udf31 もう少し易しい問題に挑戦(同じ学年・第" + (tutorStage + 1) + "段階) / Easier (step " +
      (tutorStage + 1) + ")";
    tutorEasierBtn.classList.remove("hidden");
  } else if (candidates.length > 0) {
    tutorEasierBtn.textContent =
      "\u2b07 1つ下の学年の問題に挑戦(" + tutorGradeLabel(candidates[0]) + ") / Drop one grade";
    tutorEasierBtn.classList.remove("hidden");
  } else {
    tutorEasierBtn.classList.add("hidden");
  }

  const showFar = candidates.length > 1;
  if (showFar) {
    tutorMuchEasierBtn.textContent =
      "\ud83c\udf7c もっとずっと易しい問題(" + tutorGradeLabel(candidates[candidates.length - 1]) +
      "まで下げる) / Much easier";
  }
  tutorMuchEasierBtn.classList.toggle("hidden", !showFar);
  tutorPracticeBtn.classList.remove("hidden");

  const grade = TUTOR_GRADES.find((g) => g.id === tutorSelectedGrade);
  const subjects = tutorSubjectsFor(tutorSelectedGrade);
  const subject = subjects.find((sub) => sub.id === subjectId);
  recordTutorHistory(
    "[tutor-course] selected_grade=" + (grade ? grade.en : tutorSelectedGrade) +
      " asked_grade=" + tutorPracticeGrade +
      " subject=" + (subject ? subject.en : subjectId) +
      " score=" + (isCorrect ? 1 : 0) + "/1" +
      " stage=" + tutorStage + "/" + tutorLadder.length +
      " grade_drops=" + tutorGradeDrops
  );
}

/**
 * 「もう少し易しく」ボタン。**まず学年内の次の段階**へ進み、
 * 学年内の段階を使い切っていたら**1つ下の学年**の問題へ切り替える。
 */
function startTutorEasierRound() {
  if (tutorStage < tutorLadder.length) {
    const next = tutorLadder[tutorStage];
    tutorStage += 1;
    renderTutorSingleQuestion(next);
    return;
  }
  const subjectId = tutorPracticeSubjectEl.value;
  const candidates = tutorLowerGradeCandidates(subjectId);
  if (candidates.length > 0) {
    askTutorQuestionForGrade(candidates[0], subjectId, tutorGradeDrops + 1);
  }
}

/** 一気に大きく学年を下げる(問題が用意されている一番下の学年へ)。 */
function startTutorMuchEasierRound() {
  const subjectId = tutorPracticeSubjectEl.value;
  const candidates = tutorLowerGradeCandidates(subjectId);
  if (candidates.length === 0) return;
  askTutorQuestionForGrade(
    candidates[candidates.length - 1],
    subjectId,
    tutorGradeDrops + candidates.length
  );
}

function practiceTutorWithTrainer() {
  const grade = TUTOR_GRADES.find((g) => g.id === tutorSelectedGrade);
  const subjects = tutorSubjectsFor(tutorSelectedGrade);
  const subject = subjects.find((s) => s.id === tutorPracticeSubjectEl.value);
  const targets =
    tutorMissedQuestions.length > 0
      ? tutorMissedQuestions
      : tutorCurrentQuiz.map((item) => ({ q: item.q, correctChoice: item.choices[item.answer] }));
  if (targets.length === 0) return;
  const body = targets
    .map((item, i) => `${i + 1}. ${item.q} (正解 / correct answer: ${item.correctChoice})`)
    .join("\n");
  const requestText =
    `家庭教師として、${grade ? grade.ja : ""}の${subject ? subject.ja : ""}の次の問題を、` +
    "解き方から一緒に復習してください。\n" +
    `Please act as my tutor and review these questions with me step by step.\n\n${body}`;
  tutorCourseModal.classList.add("hidden");
  inputEl.value = requestText;
  formEl.dispatchEvent(new Event("submit", { cancelable: true }));
}

if (tutorCourseBtn && tutorCourseModal) {
  loadTutorSettings();
  renderTutorGrades();
  if (tutorSelectedGrade) renderTutorSubjects();

  tutorCourseBtn.addEventListener("click", () => {
    tutorCourseModal.classList.remove("hidden");
  });
  tutorCourseClose.addEventListener("click", () => tutorCourseModal.classList.add("hidden"));
  tutorCourseModal.addEventListener("click", (e) => {
    if (e.target === tutorCourseModal) tutorCourseModal.classList.add("hidden");
  });
  tutorInstallSelectedBtn.addEventListener("click", () => {
    const chosen = Array.from(tutorSubjectListEl.querySelectorAll("input[type=checkbox]:checked")).map(
      (box) => box.value
    );
    if (chosen.length === 0) {
      tutorInstallStatusEl.textContent =
        "教科を1つ以上選んでください。 / Please choose at least one subject.";
      return;
    }
    installTutorSubjects(chosen);
  });
  tutorInstallAllBtn.addEventListener("click", () => {
    installTutorSubjects(tutorSubjectsFor(tutorSelectedGrade).map((s) => s.id));
  });
  tutorStartBtn.addEventListener("click", renderTutorQuiz);
  tutorSubmitBtn.addEventListener("click", scoreTutorQuiz);
  tutorEasierBtn.addEventListener("click", startTutorEasierRound);
  tutorMuchEasierBtn.addEventListener("click", startTutorMuchEasierRound);
  // 「学年を変更する」——出題中でもいつでも学年選択へ戻れる導線
  // (ユーザー指示、2026-08-23)。年齢による選択制限は設けていない:
  // 高校生でも社会人でも、保育園児・幼稚園児レベルを含む全学年を
  // 最初から自由に選べる(この設計を弱めないこと)。
  const tutorChangeGradeBtn = document.getElementById("tutor-change-grade-btn");
  if (tutorChangeGradeBtn) {
    tutorChangeGradeBtn.addEventListener("click", () => {
      tutorCourseModal.classList.remove("hidden");
      renderTutorGrades();
      tutorGradeListEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  tutorPracticeBtn.addEventListener("click", practiceTutorWithTrainer);
}


// ============================================================================
// プログラミング教科の基礎教材(ユーザー指示、2026-08-23)
// ----------------------------------------------------------------------------
// 「CLAUDE CODE DESKTOP有料版のご案内は維持しつつ、aruaru-llm単体でも
// ゲーム作成・WEBサイト作成の授業にできるだけ対応できるよう努力してほしい」
// への対応。**誇張しないための設計方針(絶対に弱めないこと)**:
//  - aruaru-llm(小規模なGPT-2系)に**ゼロからコードを生成させない**。
//    ここで提供するのは、あらかじめ人手で書いた**固定のサンプルコードと
//    改造課題**、および固定の4択練習問題だけ。
//  - したがって「フルスクラッチで複雑なゲーム・WEBサイトを作れる」とは
//    一切主張しない。扱うのはHTML/CSS/JavaScriptの入門レベルに限る。
//  - 上位の案内(有料版の併用推奨)は引き続き先頭に表示する。
// ============================================================================

// 基礎練習問題(学年を問わず共通。プログラミングは学年別カリキュラムが
// 定まっていないため、あえて学年で分けていない)。
const TUTOR_PROGRAMMING_QUESTIONS = [
  {
    q: "HTMLで「一番大きな見出し」を表すタグはどれですか。",
    choices: ["<h1>", "<p>", "<div>", "<br>"],
    answer: 0,
    ladder: [
      { q: "HTMLの「段落(ふつうの文章のかたまり)」を表すタグはどれですか。", choices: ["<p>", "<h1>", "<img>", "<ul>"], answer: 0 },
    ],
  },
  {
    q: "ボタンを画面に出すHTMLのタグはどれですか。",
    choices: ["<button>ボタン</button>", "<click>ボタン</click>", "<input-button>", "<press>ボタン</press>"],
    answer: 0,
  },
  {
    q: "CSSで文字の色を赤にする書き方はどれですか。",
    choices: ["color: red;", "text-color: red;", "font: red;", "colour = red;"],
    answer: 0,
    ladder: [
      { q: "CSSで背景の色を指定するプロパティはどれですか。", choices: ["background-color", "back-color", "bgcolor-style", "color-back"], answer: 0 },
    ],
  },
  {
    q: "JavaScriptで画面に小さなお知らせ窓を出す命令はどれですか。",
    choices: ["alert(\"こんにちは\");", "print(\"こんにちは\");", "echo \"こんにちは\";", "show(\"こんにちは\");"],
    answer: 0,
  },
  {
    q: "JavaScriptで0以上1未満のランダムな数を作る書き方はどれですか(じゃんけんの手を決めるときなどに使います)。",
    choices: ["Math.random()", "Math.rand()", "random.next()", "Math.dice()"],
    answer: 0,
    ladder: [
      { q: "「ランダム」とは、どういう意味ですか。", choices: ["毎回でたらめに(偶然で)決まること", "いつも同じになること", "小さい順に並ぶこと", "文字を数に変えること"], answer: 0 },
    ],
  },
  {
    q: "ボタンが押されたときに何かをさせたいとき、JavaScriptで使うのはどれですか。",
    choices: ["addEventListener(\"click\", ...)", "addColor(\"click\", ...)", "onPressStart(...)", "waitForClick = true"],
    answer: 0,
  },
];

// サンプル教材(ゼロから生成させず、動く完成品を配ってから改造させる方式)。
// 現在2本のみ。増やす場合はこの配列に足せばUIは自動で追従する。
const TUTOR_PROGRAMMING_SAMPLES = [
  {
    title: "サンプル1: じゃんけんゲーム / Sample 1: rock-paper-scissors game",
    intro:
      "下のコードをメモ帳などに貼り付けて「janken.html」という名前で保存し、" +
      "ダブルクリックでブラウザで開くと、そのまま遊べます。まずは動かしてみましょう。",
    code:
      '<!doctype html>\n' +
      '<html lang="ja">\n' +
      '<head><meta charset="utf-8" /><title>じゃんけんゲーム</title></head>\n' +
      '<body>\n' +
      '  <h1>じゃんけんゲーム</h1>\n' +
      '  <button id="gu">グー</button>\n' +
      '  <button id="choki">チョキ</button>\n' +
      '  <button id="pa">パー</button>\n' +
      '  <p id="result">ボタンを押してね</p>\n' +
      '  <script>\n' +
      '    const TE = ["グー", "チョキ", "パー"];\n' +
      '    function play(myIndex) {\n' +
      '      const cpuIndex = Math.floor(Math.random() * 3);\n' +
      '      let msg;\n' +
      '      if (myIndex === cpuIndex) msg = "あいこ";\n' +
      '      else if ((myIndex + 1) % 3 === cpuIndex) msg = "きみの勝ち!";\n' +
      '      else msg = "きみの負け…";\n' +
      '      document.getElementById("result").textContent =\n' +
      '        "きみ: " + TE[myIndex] + " / コンピューター: " + TE[cpuIndex] + " → " + msg;\n' +
      '    }\n' +
      '    document.getElementById("gu").addEventListener("click", () => play(0));\n' +
      '    document.getElementById("choki").addEventListener("click", () => play(1));\n' +
      '    document.getElementById("pa").addEventListener("click", () => play(2));\n' +
      '  <\/script>\n' +
      '</body>\n' +
      '</html>',
    challenges: [
      "「ボタンを押してね」の文字を、自分の好きな言葉に変えてみよう。",
      "勝ったときのメッセージを「やったね!」など好きな言葉に変えてみよう。",
      "勝った回数を数えて画面に出してみよう(ヒント: let win = 0; を作って、勝つたびに win = win + 1 する)。",
      "ボタンに色を付けてみよう(ヒント: <style> button { background-color: pink; } </style> をheadに足す)。",
    ],
  },
  {
    title: "サンプル2: 自己紹介ページ / Sample 2: a self-introduction web page",
    intro:
      "こちらは「jikoshoukai.html」という名前で保存して開いてみましょう。" +
      "文章を自分のことに書き換えるのが最初の練習です。",
    code:
      '<!doctype html>\n' +
      '<html lang="ja">\n' +
      '<head>\n' +
      '  <meta charset="utf-8" />\n' +
      '  <title>わたしの自己紹介</title>\n' +
      '  <style>\n' +
      '    body { font-family: sans-serif; background-color: #fff7fb; }\n' +
      '    h1 { color: #cc3377; }\n' +
      '    li { margin: 4px 0; }\n' +
      '  </style>\n' +
      '</head>\n' +
      '<body>\n' +
      '  <h1>わたしの自己紹介</h1>\n' +
      '  <p>はじめまして。わたしの名前は「ここに名前」です。</p>\n' +
      '  <h2>好きなもの</h2>\n' +
      '  <ul>\n' +
      '    <li>すきな食べもの: ここに書く</li>\n' +
      '    <li>すきな教科: ここに書く</li>\n' +
      '    <li>すきな動物: ここに書く</li>\n' +
      '  </ul>\n' +
      '  <p>よろしくおねがいします。</p>\n' +
      '</body>\n' +
      '</html>',
    challenges: [
      "「ここに名前」を自分の名前に書き換えてみよう。",
      "リスト(<li>)を1つ増やして、すきな色を書いてみよう。",
      "h1 の color を好きな色の名前(blue, green など)に変えてみよう。",
      "背景色(background-color)を変えて、自分だけの色にしてみよう。",
    ],
  },
];

/**
 * プログラミング教材エリアを組み立てる。
 * **コード文字列は`textContent`で入れる**(HTMLタグを含むため、
 * `innerHTML`で入れると画面が壊れる——自作の固定文字列であっても
 * ここは必ずテキストとして扱うこと)。
 */
function renderTutorProgrammingMaterials() {
  const root = document.getElementById("tutor-programming-materials");
  if (!root) return;
  root.innerHTML = "";

  const lead = document.createElement("p");
  lead.className = "setup-note";
  lead.textContent =
    "上のご案内(CLAUDE CODE DESKTOP有料版の併用推奨)はそのまま有効です。" +
    "そのうえで、open-english単体でも取り組める基礎教材をご用意しました。" +
    "ここにあるのは、あらかじめ人手で書いた動くサンプルと改造課題・基礎の練習問題だけで、" +
    "AIがゼロから複雑なゲームやWEBサイトを作るわけではありません(正直な開示)。 / " +
    "The recommendation above still stands. In addition, here are hand-written, ready-to-run " +
    "samples and basic questions you can work on with open-english alone — the AI does not " +
    "generate complex games or websites from scratch.";
  root.appendChild(lead);

  TUTOR_PROGRAMMING_SAMPLES.forEach((sample) => {
    const box = document.createElement("div");
    box.className = "exam-prep-question";

    const h = document.createElement("h4");
    h.textContent = sample.title;
    box.appendChild(h);

    const intro = document.createElement("p");
    intro.textContent = sample.intro;
    box.appendChild(intro);

    const pre = document.createElement("pre");
    pre.className = "tutor-code";
    const code = document.createElement("code");
    code.textContent = sample.code;
    pre.appendChild(code);
    box.appendChild(pre);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "setup-btn";
    copyBtn.textContent = "📋 コードをコピー / Copy code";
    copyBtn.addEventListener("click", () => {
      // クリップボードAPIが使えない環境(古いブラウザ・非セキュアな配信元)
      // でも、コードは画面上で選択してコピーできるので致命的ではない。
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(sample.code)
          .then(() => {
            copyBtn.textContent = "✅ コピーしました / Copied";
          })
          .catch(() => {
            copyBtn.textContent = "コピーできませんでした(手で選択してください) / Copy failed";
          });
      } else {
        copyBtn.textContent = "この環境では自動コピーできません(手で選択してください)";
      }
    });
    box.appendChild(copyBtn);

    const chTitle = document.createElement("p");
    chTitle.textContent = "改造してみよう / Try changing it:";
    box.appendChild(chTitle);

    const ul = document.createElement("ul");
    sample.challenges.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      ul.appendChild(li);
    });
    box.appendChild(ul);

    root.appendChild(box);
  });

  const quizLead = document.createElement("p");
  quizLead.className = "setup-note";
  quizLead.textContent =
    "下は、HTML・CSS・JavaScriptの基礎の練習問題です(他の教科と同じく、" +
    "まちがえると易しい類題が出ることがあります)。 / " +
    "Below are basic HTML/CSS/JavaScript practice questions.";
  root.appendChild(quizLead);

  root.classList.remove("hidden");
}



// ============================================================================
// バーチャルスクール(高等教育) / バーチャルオンライン職業訓練校
// (ユーザー指示、2026-08-24)
// ----------------------------------------------------------------------------
// 「専門学校・短大・大学・大学院の入試/授業/校内テストを擬似的に想定した
// バーチャルスクール」と「様々な産業・職業を想定したバーチャルオンライン
// 職業訓練校」を、利用者が分野ごとに選んでインストールし、実際に出題・採点
// できるようにする機能。
//
// 設計は既存の「学生向け家庭教師コース」(TUTOR_*)をそのまま踏襲する:
//   区分(学年に相当)を選ぶ → 分野(教科に相当)をチェックしてインストール
//   → ランダム出題 → 採点 → `/v1/db/history` へ保存 → トレーナーと復習。
// 新しい保存先・新しいAPIは一切増やしていない。
//
// **正直な開示(改変時も弱めないこと)**:
//  - 収録問題はすべて本アプリ用の書き下ろしオリジナル。実際の入試問題・
//    市販問題集・教科書からの転載は一切無い。
//  - **全区分×全分野は揃っていない。** 下記VSCHOOL_QUESTIONSに実際に
//    存在する組み合わせだけが動き、それ以外は「準備中」と表示する。
//  - 小論文・面接・実技は自動採点になじまないため、**4択の知識問題として
//    しか扱っていない**。本物の小論文添削・面接練習の代わりにはならない。
//  - 合否・資格取得を予測・保証するものではない。
//
// 事前調査(2026-08-24、日本語Web検索): 大学・短大・専門学校の総合型選抜/
// 学校推薦型選抜では小論文(課題文型・テーマ型・図表分析型など)と面接が
// 中心で、大学院では研究計画・先行研究・専門科目と面接が問われる、という
// 一般的な傾向を確認した。公的職業訓練(ハロートレーニング/求職者支援訓練)は
// IT、営業・販売、介護・福祉、建設、美容、調理など幅広い分野があることを
// 確認した。この一般的傾向を踏まえて分野の区分を決めているが、問題文自体は
// 検索結果からの転載ではなく書き下ろしである。
// ============================================================================

// 区分。`mode`が"school"のものが高等教育、"voc"が職業訓練校。
const VSCHOOL_TRACKS = [
  { id: "senmon", mode: "school", ja: "専門学校", en: "Vocational college (senmon gakko)" },
  { id: "tandai", mode: "school", ja: "短期大学", en: "Junior college" },
  { id: "daigaku", mode: "school", ja: "大学(学部)", en: "University (undergraduate)" },
  { id: "daigakuin", mode: "school", ja: "大学院", en: "Graduate school" },
  { id: "voc", mode: "voc", ja: "オンライン職業訓練校", en: "Online vocational training" },
  // 2026-08-25追加(ユーザー指示「アメリカのデータサイエンティストや
  // 一級建築士…の資格の擬似的模擬的なTEST」への対応)。米国の資格制度は
  // 日本の学校区分(専門学校・短大・大学・大学院)とは別軸のため、独立の
  // モードとして新設した。
  { id: "uscert", mode: "uscert", ja: "アメリカの資格(擬似模擬)", en: "US certifications (mock)" },
];

// 区分ごとの分野。`yt`はYouTube検索に使う一般的なキーワード
// (**特定の動画へは誘導しない**——検索結果ページへのリンクのみ)。
const VSCHOOL_FIELDS = {
  senmon: [
    {
      id: "it",
      ja: "情報処理・IT",
      en: "Information technology",
      yt: "基本情報技術者 入門 解説",
      career: {
        ja: "しっかり身につけると、システムエンジニアやITサポートの仕事で役立つかもしれません。さらに極めると、プロジェクトリーダーやITコンサルタントのような職種を目指せる可能性があります。",
        en: "Mastering this may help with roles like systems engineer or IT support. Going further, it could open a path toward project lead or IT consultant roles.",
      },
      // 2026-08-25追加(ユーザー指摘「サンプルのプログラムソースも好きな
      // プログラム言語で表示するべき」への対応)。全く同じ最小API
      // (「/hello」を叩くと挨拶メッセージのJSONを返すだけ)を、
      // ユーザー推奨の4通りの言語/フレームワークで書き下ろした——
      // どれも実際に動く最小構成のコード(雛形からの丸写しではなく
      // 本アプリ用に簡潔化して書いたもの)。**正直な開示**: 実際に
      // このアプリがこれらを実行・検証しているわけではなく、あくまで
      // 「読んで学ぶための静的なサンプル」として提供している。
      sampleCode: [
        {
          id: "python_fastapi",
          label: "Python + FastAPI",
          code:
            "from fastapi import FastAPI\n\n" +
            "app = FastAPI()\n\n" +
            '@app.get("/hello")\n' +
            "def hello():\n" +
            '    return {"message": "Hello from FastAPI!"}\n\n' +
            "# 実行: pip install fastapi uvicorn\n" +
            "#       uvicorn main:app --reload\n",
        },
        {
          id: "php_laravel",
          label: "PHP + Laravel",
          code:
            "// routes/web.php\n" +
            "use Illuminate\\Support\\Facades\\Route;\n\n" +
            'Route::get("/hello", function () {\n' +
            '    return response()->json(["message" => "Hello from Laravel!"]);\n' +
            "});\n\n" +
            "// 実行: composer create-project laravel/laravel my-app\n" +
            "//       php artisan serve\n",
        },
        {
          id: "rust_poem",
          label: "Rust + Poem",
          code:
            "use poem::{get, handler, listener::TcpListener, web::Json, Route, Server};\n" +
            "use serde_json::json;\n\n" +
            "#[handler]\n" +
            "fn hello() -> Json<serde_json::Value> {\n" +
            '    Json(json!({ "message": "Hello from Poem!" }))\n' +
            "}\n\n" +
            "#[tokio::main]\n" +
            "async fn main() -> Result<(), std::io::Error> {\n" +
            '    let app = Route::new().at("/hello", get(hello));\n' +
            '    Server::new(TcpListener::bind("127.0.0.1:3000")).run(app).await\n' +
            "}\n\n" +
            "// 実行: cargo add poem tokio serde_json --features tokio/full\n" +
            "//       cargo run\n",
        },
        {
          id: "rust_rpoem",
          label: "Rust + RPoem",
          code:
            "// RPoem(このプロジェクトのエコシステムで実際に使っている、\n" +
            "// Poem風の自作フレームワーク互換レイヤー)での書き方の一例。\n" +
            "// 実際のAPIはバージョンにより変わり得るため、詳細は\n" +
            "// aon-co-jp/RPoem のソース・READMEを参照してください。\n" +
            "use open_runo_poem_compat::{get, handler_fn, Response, Route, Server, StatusCode, TcpListener};\n\n" +
            "async fn hello() -> Response {\n" +
            '    Response::builder().status(StatusCode::OK).body(r#"{"message":"Hello from RPoem!"}"#)\n' +
            "}\n\n" +
            "#[tokio::main]\n" +
            "async fn main() {\n" +
            '    let app = Route::new().at("/hello", get(handler_fn(|_req, _p| async move { hello().await })));\n' +
            '    Server::new(TcpListener::bind("127.0.0.1:3000")).run(app).await.unwrap();\n' +
            "}\n",
        },
      ],
    },
    {
      id: "medoffice",
      ja: "医療事務",
      en: "Medical office admin",
      yt: "医療事務 初心者 講座",
      career: {
        ja: "病院やクリニックの受付・診療報酬請求(レセプト)業務に役立つかもしれません。経験を積むと、医事課のリーダーや医療機関の事務管理者を目指せる可能性があります。",
        en: "May help with hospital/clinic reception and medical billing work. With experience, it could lead toward a medical office lead or administrator role.",
      },
    },
    {
      id: "care",
      ja: "介護福祉",
      en: "Care work",
      yt: "介護福祉士 基礎 講座",
      career: {
        ja: "高齢者施設や訪問介護の現場で役立つかもしれません。国家資格(介護福祉士)を取得すると、サービス提供責任者やケアマネジャーのような職種を目指せる可能性があります。",
        en: "May help in elder care facilities or home care. With the national care-worker qualification, it could lead toward a service coordinator or care manager role.",
      },
    },
    {
      id: "beauty",
      ja: "美容",
      en: "Beauty / hairdressing",
      yt: "美容師国家試験 筆記 対策",
      career: {
        ja: "美容師国家資格の筆記対策として役立つかもしれません。技術と経験を積むと、店舗の店長や独立開業を目指せる可能性があります。",
        en: "May help with the written portion of the national hairdressing licence exam. With skill and experience, it could lead toward a salon manager or independent stylist path.",
      },
    },
    {
      id: "cook",
      ja: "調理・製菓",
      en: "Cooking & confectionery",
      yt: "調理師試験 独学",
      career: {
        ja: "調理師試験の対策や飲食・製菓業界での仕事に役立つかもしれません。経験を積むと、シェフやパティシエ、独立開業を目指せる可能性があります。",
        en: "May help with the cook's licence exam and work in food service or confectionery. With experience, it could lead toward a chef, pastry chef, or independent shop.",
      },
    },
    {
      id: "civil",
      ja: "建築・土木",
      en: "Architecture & civil engineering",
      yt: "建築 構造力学 入門",
      career: {
        ja: "建設現場の施工管理や設計補助の仕事に役立つかもしれません。資格(施工管理技士等)を取得すると、現場監督や一級建築士のような職種を目指せる可能性があります。",
        en: "May help with construction site supervision or design assistant work. With licences, it could lead toward a site manager or licensed architect role.",
      },
    },
  ],
  tandai: [
    {
      id: "childcare",
      ja: "保育・幼児教育",
      en: "Early childhood education",
      yt: "保育士試験 独学 講座",
      career: {
        ja: "保育園・幼稚園での保育補助の仕事に役立つかもしれません。保育士資格を取得すると、主任保育士や園長のような職種を目指せる可能性があります。",
        en: "May help with assistant roles at nurseries and kindergartens. With the childcare licence, it could lead toward a lead teacher or director role.",
      },
    },
    {
      id: "nutrition",
      ja: "栄養",
      en: "Nutrition",
      yt: "栄養士 基礎 栄養学 講義",
      career: {
        ja: "給食施設や病院での栄養士補助の仕事に役立つかもしれません。管理栄養士資格を取得すると、献立管理者や栄養指導の専門職を目指せる可能性があります。",
        en: "May help with dietitian-assistant work in schools or hospitals. With the registered dietitian licence, it could lead toward a menu-planning lead or nutrition counsellor role.",
      },
    },
    {
      id: "business",
      ja: "ビジネス実務",
      en: "Business practice",
      yt: "ビジネス実務マナー 検定",
      career: {
        ja: "一般事務や秘書業務に役立つかもしれません。経験を積むと、総務・人事のリーダーやオフィスマネージャーを目指せる可能性があります。",
        en: "May help with general office or secretarial work. With experience, it could lead toward a general affairs/HR lead or office manager role.",
      },
    },
    {
      id: "liberal",
      ja: "英語・国際教養",
      en: "English & liberal arts",
      yt: "英語 リーディング 大学 基礎",
      career: {
        ja: "英語を使う事務職や観光業の接客に役立つかもしれません。さらに極めると、通訳・翻訳や国際関係の仕事を目指せる可能性があります。",
        en: "May help with English-using office roles or tourism/hospitality. Going further, it could open a path toward interpreting, translation, or international relations work.",
      },
    },
  ],
  daigaku: [
    {
      id: "humanities",
      ja: "人文・社会科学系",
      en: "Humanities & social sciences",
      yt: "小論文 書き方 大学入試",
      career: {
        ja: "論理的な文章力は、出版・マスコミ・法律関係・公務員など幅広い仕事に役立つかもしれません。さらに極めると、研究者や専門職(弁護士等)を目指せる可能性があります。",
        en: "Logical writing skills may help in publishing, media, law-adjacent, or public-sector work. Going further, it could open a path toward research or licensed professions such as law.",
      },
    },
    {
      id: "science",
      ja: "理工系",
      en: "Science & engineering",
      yt: "大学 微分積分 入門 講義",
      career: {
        ja: "数学・物理の基礎は、メーカーの技術職や研究開発に役立つかもしれません。さらに極めると、研究者やエンジニアリングマネージャーを目指せる可能性があります。",
        en: "A foundation in math and physics may help with engineering or R&D roles at manufacturers. Going further, it could open a path toward research or engineering management.",
      },
    },
    {
      id: "nursing",
      ja: "医療・看護系",
      en: "Medicine & nursing",
      yt: "看護 基礎 解剖生理 講義",
      career: {
        ja: "看護師や医療職として病院で働く際に役立つかもしれません。経験を積むと、専門看護師や看護師長のような職種を目指せる可能性があります。",
        en: "May help with hospital nursing or allied health roles. With experience, it could lead toward a specialist nurse or nursing manager role.",
      },
    },
    {
      id: "education",
      ja: "教育系",
      en: "Education",
      yt: "教育原理 教員採用試験 講義",
      career: {
        ja: "学校の教員や学習塾の講師の仕事に役立つかもしれません。経験を積むと、教頭・校長や教育行政の仕事を目指せる可能性があります。",
        en: "May help with school teaching or tutoring roles. With experience, it could lead toward a vice-principal, principal, or education administration role.",
      },
    },
  ],
  daigakuin: [
    {
      id: "research",
      ja: "研究基礎(研究計画・研究倫理・面接)",
      en: "Research fundamentals",
      yt: "研究計画書 書き方 大学院",
      career: {
        ja: "大学院での研究活動や企業の研究職に役立つかもしれません。さらに極めると、大学教員や研究機関のプロジェクトリーダーを目指せる可能性があります。",
        en: "May help with graduate research or corporate R&D roles. Going further, it could open a path toward a university faculty or research-lead position.",
      },
    },
    {
      id: "engsci",
      ja: "理工学研究科・専門科目",
      en: "Engineering graduate specialisation",
      yt: "大学院 入試 数学 対策",
      career: {
        ja: "高度な専門知識は、メーカーや研究機関の専門職に役立つかもしれません。さらに極めると、博士研究員(ポスドク)や技術部門の責任者を目指せる可能性があります。",
        en: "Advanced expertise may help with specialist roles at manufacturers or research institutes. Going further, it could open a path toward a postdoctoral researcher or technical lead role.",
      },
    },
  ],
  voc: [
    {
      id: "it_basic",
      ja: "IT・プログラミング基礎",
      en: "IT & programming basics",
      yt: "プログラミング 初心者 入門 講座",
      career: {
        ja: "しっかりマスターすると、Webサイト制作会社やIT企業のジュニアエンジニアの仕事で役立つかもしれません。さらに極めると、フルスタックエンジニアやシステムアーキテクトのような職種を目指せる可能性があります。",
        en: "Mastering this may help with junior developer roles at IT or web companies. Going further, it could open a path toward full-stack engineer or systems architect roles.",
      },
    },
    {
      id: "bookkeeping",
      ja: "簿記・経理基礎",
      en: "Bookkeeping & accounting basics",
      yt: "簿記3級 独学",
      career: {
        ja: "しっかりマスターすると、企業の経理担当者や税理士事務所のスタッフの仕事で役立つかもしれません。さらに極めると、公認会計士や税理士のような職種を目指せる可能性があります。",
        en: "Mastering this may help with accounting-clerk roles at companies or tax firms. Going further, it could open a path toward certified public accountant or tax accountant roles.",
      },
    },
    {
      id: "service",
      ja: "接客・サービス業基礎",
      en: "Customer service basics",
      yt: "接客 マナー 研修 基礎",
      career: {
        ja: "しっかりマスターすると、小売・飲食・ホテル業界の接客スタッフの仕事で役立つかもしれません。さらに極めると、店長やカスタマーサクセスの責任者のような職種を目指せる可能性があります。",
        en: "Mastering this may help with retail, food service, or hotel front-line roles. Going further, it could open a path toward store manager or customer-success lead roles.",
      },
    },
    {
      id: "care_basic",
      ja: "介護・福祉基礎",
      en: "Care work basics",
      yt: "介護 初任者研修 講座",
      career: {
        ja: "介護職員初任者研修相当の基礎知識は、介護施設や訪問介護の現場で役立つかもしれません。さらに極めると、介護福祉士やサービス提供責任者を目指せる可能性があります。",
        en: "This foundational knowledge may help in care facilities or home care. Going further, it could open a path toward a certified care worker or service coordinator role.",
      },
    },
    {
      id: "construction",
      ja: "建築・土木基礎",
      en: "Construction basics",
      yt: "建設業 施工管理 入門",
      career: {
        ja: "建設現場の作業員や施工管理補助の仕事に役立つかもしれません。資格を取得すると、施工管理技士や現場監督を目指せる可能性があります。",
        en: "May help with construction site work or assistant supervision. With licences, it could lead toward a certified site manager role.",
      },
    },
    {
      id: "cooking_basic",
      ja: "調理・製菓基礎",
      en: "Cooking basics",
      yt: "調理 基本 包丁 使い方",
      career: {
        ja: "飲食店の調理補助やカフェのスタッフの仕事に役立つかもしれません。経験を積むと、調理師や店舗責任者を目指せる可能性があります。",
        en: "May help with kitchen-assistant or cafe-staff roles. With experience, it could lead toward a licensed cook or shop manager role.",
      },
    },
    {
      id: "beauty_basic",
      ja: "美容基礎",
      en: "Beauty basics",
      yt: "美容 基礎知識 講座",
      career: {
        ja: "美容室やエステサロンの受付・アシスタント業務に役立つかもしれません。経験を積むと、スタイリストやサロン店長を目指せる可能性があります。",
        en: "May help with salon reception or assistant work. With experience, it could lead toward a stylist or salon manager role.",
      },
    },
  ],
  // 2026-08-25追加: アメリカの資格(擬似模擬、`uscert`モード)。
  //
  // **正直な開示(重要、誇張しないこと)**: 「データサイエンティスト」には
  // 日本の医師国家試験のような単一の政府公認資格は存在しない
  // (2026-08-25 WebSearch確認)——CertNexus CDSP・DASCA SDS/PDS・
  // IABAC CDS・USDSI等、複数のベンダーニュートラルな民間資格が並立
  // している。ここではその実態を隠さず「代表的な民間資格を参考にした
  // 独自の模擬問題」として位置づける(特定の認定団体の公式試験問題の
  // 転載・特定団体の代替と主張することは一切していない)。建築士は
  // NCARB(全米建築士登録協議会)が運営する Architect Registration
  // Examination(ARE、現行ARE 5.0、6区分)が全50州+DC+米領4地域で
  // 採用されている実質的な標準試験(情報源:
  // https://www.ncarb.org/pass-the-are 、
  // https://en.wikipedia.org/wiki/Architect_Registration_Examination
  // 、2026-08-25 WebSearch確認)。日本の「一級建築士」とは資格制度の
  // 構造自体が異なる(米国は州ごとの免許+NCARB相互承認、単一の国家
  // 資格ではない)ため、「一級建築士に相当する米国の代表的試験」という
  // 位置づけで案内する。
  uscert: [
    {
      id: "dataScientist",
      ja: "データサイエンティスト(米国、民間資格の代表例)",
      en: "Data Scientist (US, representative industry certifications)",
      yt: "data scientist certification exam prep",
      career: {
        ja: "統計・機械学習・データ分析の基礎を身につけると、データアナリストやBIエンジニアの仕事で役立つかもしれません。さらに極めると、データサイエンティストやMLエンジニアのような職種を目指せる可能性があります。米国には単一の政府公認資格は無く、CertNexus・DASCA・IABAC等の民間資格が代表例として挙げられます。",
        en: "Mastering statistics, machine learning, and data-analysis basics may help with data analyst or BI engineer work. Going further, it could open a path toward data scientist or ML engineer roles. The US has no single government-issued license for this field — CertNexus, DASCA, and IABAC are representative vendor-neutral certifications.",
      },
      // 2026-08-25追加(ユーザー指示「有料のCourseraと言うサイトを
      // オススメして」への対応)。**正直な開示**: Courseraはこのアプリと
      // 提携・アフィリエイト関係には無い、単なる外部サイトの案内。
      // 有料である旨(無料監査は一部あるが修了証は有料)も明記する。
      resources: {
        ja: "Coursera(有料の学習プラットフォーム、一部コースは聴講無料・修了証は有料)には、IBM Data Science Professional Certificate・Google Advanced Data Analytics Professional Certificate・CertNexus Certified Data Science Practitioner Professional Certificate等の講座があります(2026-08-25時点、当アプリとCourseraの間に提携・紹介料等の金銭的関係はありません)。",
        en: "Coursera (a paid learning platform — auditing some courses is free, but certificates cost money) offers courses such as the IBM Data Science Professional Certificate, Google Advanced Data Analytics Professional Certificate, and CertNexus Certified Data Science Practitioner Professional Certificate (as of 2026-08-25; this app has no partnership or referral-fee relationship with Coursera).",
      },
    },
    {
      id: "architectAre",
      ja: "建築士登録試験(米国、NCARB ARE)",
      en: "Architect Registration Examination (US, NCARB ARE)",
      yt: "NCARB ARE 5.0 exam prep",
      career: {
        ja: "建築設計・構造・法規の基礎を身につけると、設計事務所やゼネコンの実務補助で役立つかもしれません。さらに極めて米国でARE(全6区分)に合格し州の免許要件を満たすと、登録建築士(Licensed Architect)を目指せる可能性があります。日本の一級建築士とは制度の枠組みが異なり、米国は州ごとの免許+NCARBの相互承認という仕組みです。**正直な開示**: 日本の「管理建築士」(建築士事務所の登録に必要な、実務経験+講習修了を要する別枠の資格)に直接対応する単一の米国資格は見当たりませんでした(2026-08-25 WebSearch確認)——米国はそもそも建築士に一級・二級のような等級を設けておらず、建築士事務所を主宰・登録する際の要件は州ごとに異なります。「一級建築士の管理士に相当する資格」として断定的に特定の米国資格を案内することは、誤情報を伝えるおそれがあるため見送りました。",
        en: "Mastering building design, structural, and code basics may help with junior roles at design or construction firms. Going further — passing all six ARE divisions and meeting a state's licensure requirements — could open a path toward becoming a Licensed Architect. The US system differs structurally from Japan's Ikkyu Kenchikushi: licensure is per-state, with NCARB providing reciprocity across states. **Honest disclosure**: we could not find a single US credential that directly corresponds to Japan's \"Kanri Kenchikushi\" (supervising architect, a separate qualification required to register an architectural office, requiring extra practical experience plus a course) — the US does not grade architects into tiers the way Japan does, and the requirements to head a registered architecture firm vary by state. We chose not to name a specific US credential as \"the equivalent,\" to avoid spreading inaccurate information.",
      },
    },
    // 2026-08-25追加(ユーザー指示「大工さんの資格…の擬似的模擬的な
    // TEST」への対応)。**正直な開示**: 米国には「マスター大工」のような
    // 全米共通の免許・国家資格は存在しない(電気工事士・配管工とは異なり
    // 標準化された州免許試験が無い、2026-08-25 WebSearch確認)。
    // NCCER(全米建設教育研究センター)のCarpentry認定が、複数州の
    // 教育機関で認知されている代表的な民間認定として挙げられる。
    {
      id: "carpenter",
      ja: "大工(米国、NCCER Carpentry認定を参考例として)",
      en: "Carpenter (US, referencing the NCCER Carpentry credential)",
      yt: "NCCER carpentry certification study guide",
      career: {
        ja: "木工・採寸・基礎的な建築構造の知識を身につけると、住宅建築や内装工事の現場作業員として役立つかもしれません。経験を積むと、現場監督や独立した請負業者を目指せる可能性があります。**正直な開示**: 米国には電気工事士・配管工のような全米共通の「大工」免許・国家資格は存在しません。NCCER(全米建設教育研究センター)のCarpentry認定は、多くの教育機関・企業で認知されている代表的な民間認定の一例です。",
        en: "Learning woodworking, measurement, and basic structural concepts may help with entry-level residential construction or finish-carpentry work. With experience, it could lead toward a site supervisor role or independent contracting. **Honest disclosure**: unlike electricians or plumbers, there is no single nationwide \"carpenter\" license or government credential in the US. The NCCER (National Center for Construction Education and Research) Carpentry credential is one widely recognized representative example among private certifications.",
      },
      resources: {
        ja: "NCCER公式サイト(nccer.org)に認定の詳細があります。Courseraには大工技能に特化した講座は見当たりませんでした(2026-08-25時点)——他分野と異なりCourseraでの案内は行っていません。",
        en: "See the official NCCER site (nccer.org) for credential details. We did not find carpentry-specific courses on Coursera as of 2026-08-25 — unlike the other fields here, we are not recommending Coursera for this one.",
      },
    },
  ],
};

// キャリアガイダンス機能(2026-08-24、ユーザー指示「ドイツの職業訓練校
// 〈Berufsschule〉をお手本にした、学習内容と実社会でのキャリアパスを
// 結びつける補足説明機能」への対応)。
//
// ドイツのデュアルシステム(Duale Ausbildung)は、企業での実地研修
// (週3〜4日)と職業学校(Berufsschule、週1〜2日)を組み合わせ、商工会議所
// (IHK)等の認定を経て資格取得に至る制度で、修了後のキャリアパスが
// 明確に見える設計になっている(WebSearchで実在の情報源を確認済み——
// IHK Darmstadt公式ページ、deutschland.de、adriaveza.de等、下記参照)。
// この「学習内容→実社会での役立ち方→さらに上のキャリア」という
// 見通しの明確さを参考に、既存のバーチャルスクール/職業訓練校コーナー
// (`VSCHOOL_FIELDS`)の各分野へ`career`(日英併記)を追加した。
//
// **誠実さの方針(このアプリ全体の既存ルールを踏襲、絶対に弱めないこと)**:
// 「〜かもしれません」「〜を目指せる可能性があります」という非断定的な
// 表現のみを使う。「必ず就職できる」「この職業に就ける」という断定は
// 一切しない。就職・資格取得を保証するものではない。
//
// 情報源(2026-08-24 WebSearchで確認、実在のページ):
// - IHK Darmstadt「The Dual System in Germany」
//   https://www.ihk.de/darmstadt/en/productlabels/training/voctrain-2533080
// - deutschland.de「How Germany's dual vocational training system works」
//   https://www.deutschland.de/en/topic/business/how-germanys-dual-vocational-training-system-works
// - adriaveza.de「Vocational School and Ausbildung」
//   https://adriaveza.de/en/02-news/02-f-schools-and-education/02-f9-berufsschule-ausbildung.html
function vschoolCareerHtml(field) {
  if (!field || !field.career) return "";
  return (
    '<div class="vschool-career">' +
    '<p class="vschool-career-label">🎓 キャリアガイダンス / Career guidance</p>' +
    "<p>" + field.career.ja + "</p>" +
    "<p>" + field.career.en + "</p>" +
    "</div>" +
    vschoolResourcesHtml(field) +
    careerQuoteHtml(field.id) +
    careerMotivationHtml()
  );
}

// 2026-08-25追加(ユーザー指示「有料のCourseraと言うサイトをオススメして」
// への対応)。**正直な開示**: これは外部の有料学習プラットフォームへの
// 案内であり、このアプリはCourseraと提携・アフィリエイト関係には無い
// (紹介料等の金銭的関係は一切無い)。field.resources が無い分野では
// 何も表示しない(無理に埋めない)。
function vschoolResourcesHtml(field) {
  if (!field || !field.resources) return "";
  return (
    '<div class="vschool-resources">' +
    '<p class="vschool-career-label">📚 参考になりそうな学習リソース / Related learning resources</p>' +
    "<p>" + field.resources.ja + "</p>" +
    "<p>" + field.resources.en + "</p>" +
    "</div>"
  );
}

// サンプルプログラムの言語/フレームワーク選択欄(ユーザー指示「サンプルの
// プログラムソースも好きなプログラム言語で表示するべき」への対応、
// 2026-08-25新設)。`field.sampleCode`(配列)を持つ分野にのみ表示する。
// **コードは必ず`textContent`で入れる**(`<`/`>`/引用符を含むため、
// `innerHTML`へ文字列結合すると画面が壊れる・注入リスクがある——
// `renderTutorProgrammingMaterials`と同じ徹底事項)。
function buildVschoolSampleCodeElement(field) {
  if (!field || !Array.isArray(field.sampleCode) || field.sampleCode.length === 0) return null;
  const wrap = document.createElement("div");
  wrap.className = "vschool-sample-code";

  const labelP = document.createElement("p");
  labelP.className = "vschool-career-label";
  labelP.textContent = "💻 サンプルプログラム(言語を選択) / Sample program (choose a language)";
  wrap.appendChild(labelP);

  const select = document.createElement("select");
  select.className = "setup-input vschool-lang-select";
  field.sampleCode.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.label;
    select.appendChild(opt);
  });
  wrap.appendChild(select);

  const pre = document.createElement("pre");
  pre.className = "vschool-sample-pre";
  pre.textContent = field.sampleCode[0].code;
  wrap.appendChild(pre);

  select.addEventListener("change", () => {
    const chosen = field.sampleCode.find((e) => e.id === select.value);
    pre.textContent = chosen ? chosen.code : "";
  });
  select.addEventListener("click", (e) => e.stopPropagation());

  return wrap;
}

// 模擬問題本体。キーは `<区分ID>:<分野ID>`。**ここに無い組み合わせは
// 「準備中」と表示する**(嘘の「対応済み」を作らないこと)。
// すべて本アプリ用に書き下ろしたオリジナル問題。`answer`は`choices`の添字。
// `why`は採点後に表示する短い解説。
const VSCHOOL_QUESTIONS = {
  // --- 大学(学部)・人文社会系: 小論文と学術的な考え方の基礎 ---
  "daigaku:humanities": [
    {
      q: "大学入試の小論文で最も一般的とされる基本構成はどれですか。",
      choices: ["序論・本論・結論", "起承転結の四コマ形式", "結論のみを繰り返す", "感想を時系列で並べる"],
      answer: 0,
      why: "問いへの立場を示す序論、根拠を述べる本論、まとめの結論という三部構成が基本とされます。",
    },
    {
      q: "課題文が与えられる「課題文型」小論文で、書き始める前にまず行うべきことはどれですか。",
      choices: [
        "課題文の主張と論拠を正確に読み取る",
        "自分の体験談を先に書き出す",
        "できるだけ難しい語を書き出す",
        "字数を数えて配分だけ決める",
      ],
      answer: 0,
      why: "課題文型では、筆者の主張を正確に把握しないと的外れな論述になります。",
    },
    {
      q: "「帰納」の説明として適切なものはどれですか。",
      choices: [
        "個別の事例から一般的な法則を導く",
        "一般的な法則から個別の結論を導く",
        "結論を先に決めて根拠を作る",
        "対立する二つの意見を足して二で割る",
      ],
      answer: 0,
      why: "個別から一般へ向かうのが帰納、一般から個別へ向かうのが演繹です。",
    },
    {
      q: "他人の文章を出典を示さずに自分の文章として提出する行為を何と呼びますか。",
      choices: ["剽窃(盗用)", "引用", "要約", "校閲"],
      answer: 0,
      why: "出典を明示して必要な範囲で用いるのが引用、示さずに自分のものとするのが剽窃です。",
    },
    {
      q: "面接で志望理由を聞かれたときの答え方として、最も説得力があるとされるものはどれですか。",
      choices: [
        "学びたい内容と、その学校の教育内容との結びつきを具体的に述べる",
        "偏差値や知名度が高いからと述べる",
        "家族に勧められたからと述べる",
        "特に理由はないと正直に述べる",
      ],
      answer: 0,
      why: "「なぜこの学校でなければならないか」を具体的に語れるかが見られます。",
    },
  ],

  // --- 大学(学部)・理工系: 理系基礎学力 ---
  "daigaku:science": [
    {
      q: "測定値 2.5 と 3.0 の積を有効数字を考えて表すとどれですか。",
      choices: ["7.5", "7.50", "7", "7.500"],
      answer: 0,
      why: "有効数字2桁どうしの積は2桁で表します。",
    },
    {
      q: "関数 y = x^3 を x で微分するとどれになりますか。",
      choices: ["3x^2", "x^2", "3x", "x^4/4"],
      answer: 0,
      why: "べき関数の微分は、指数を係数に下ろして指数を1減らします。",
    },
    {
      q: "次のうち SI基本単位でないものはどれですか。",
      choices: ["N(ニュートン)", "m(メートル)", "kg(キログラム)", "s(秒)"],
      answer: 0,
      why: "ニュートンは kg·m/s^2 から作られる組立単位です。",
    },
    {
      q: "log10(1000) の値はどれですか。",
      choices: ["3", "2", "10", "1000"],
      answer: 0,
      why: "10の3乗が1000だからです。",
    },
    {
      q: "実験レポートで「再現性」を確認するために最も適切な方法はどれですか。",
      choices: [
        "同じ条件で複数回測定し、ばらつきを確認する",
        "最も良い値だけを採用して記載する",
        "測定を1回だけ行い平均値と呼ぶ",
        "理論値をそのまま測定値として書く",
      ],
      answer: 0,
      why: "都合のよい値だけを選ぶのはデータの選別であり、研究倫理上も問題があります。",
    },
  ],

  // --- 専門学校・情報処理/IT ---
  "senmon:it": [
    {
      q: "10進数の 13 を2進数で表すとどれですか。",
      choices: ["1101", "1011", "1110", "1001"],
      answer: 0,
      why: "8+4+1 = 13 なので 1101 です。",
    },
    {
      q: "HTML の主な役割として適切なものはどれですか。",
      choices: [
        "文書の構造(見出し・段落・リンクなど)を記述する",
        "サーバーのCPU使用率を制御する",
        "データベースのバックアップを取る",
        "通信を暗号化する",
      ],
      answer: 0,
      why: "見た目はCSS、動きはJavaScriptが担当し、HTMLは構造を担います。",
    },
    {
      q: "1バイトは何ビットですか。",
      choices: ["8ビット", "4ビット", "16ビット", "1024ビット"],
      answer: 0,
      why: "現在の一般的な計算機では1バイト = 8ビットです。",
    },
    {
      q: "リレーショナルデータベースで、テーブルからデータを取り出すSQL文はどれですか。",
      choices: ["SELECT", "INSERT", "DELETE", "CREATE"],
      answer: 0,
      why: "INSERTは追加、DELETEは削除、CREATEは定義です。",
    },
    {
      q: "アルゴリズムにおける「繰り返し(ループ)」の説明として適切なものはどれですか。",
      choices: [
        "条件が満たされている間、同じ処理を何度も実行する",
        "条件によって処理を二つに分ける",
        "処理を一度だけ実行して終了する",
        "処理の順序を無作為に入れ替える",
      ],
      answer: 0,
      why: "条件で二つに分けるのは分岐(選択)構造です。",
    },
  ],

  // --- 大学院・研究基礎 ---
  "daigakuin:research": [
    {
      q: "研究計画書の中核として最も重要とされる要素はどれですか。",
      choices: [
        "先行研究を踏まえた「問い」の設定",
        "使用する文房具の一覧",
        "研究にかける費用の内訳のみ",
        "指導教員への感謝の言葉",
      ],
      answer: 0,
      why: "何が未解明で、自分は何を明らかにするのかが計画書の骨格です。",
    },
    {
      q: "「査読(peer review)」の説明として適切なものはどれですか。",
      choices: [
        "同じ分野の研究者が投稿論文の内容を審査する仕組み",
        "著者が自分の論文を読み返すこと",
        "出版社が誤字脱字だけを直すこと",
        "一般読者が人気投票をすること",
      ],
      answer: 0,
      why: "専門家による審査を経ることで学術的な質を担保します。",
    },
    {
      q: "先行研究レビューを行う主な目的はどれですか。",
      choices: [
        "自分の研究の位置づけと、まだ解かれていない点を示すため",
        "参考文献の数を増やして分量を稼ぐため",
        "他の研究者を批判するため",
        "指導教員の論文だけを紹介するため",
      ],
      answer: 0,
      why: "既知と未知の境界を示すことで、研究の新規性が説明できます。",
    },
    {
      q: "研究倫理上、明確に許されない行為はどれですか。",
      choices: [
        "データの捏造・改ざん",
        "実験条件を論文に詳しく書くこと",
        "否定的な結果を報告すること",
        "貢献した共同研究者を著者に含めること",
      ],
      answer: 0,
      why: "捏造・改ざん・盗用は研究不正の代表例とされます。",
    },
    {
      q: "学術論文の要旨(abstract)に通常含めないものはどれですか。",
      choices: ["参考文献の一覧", "研究の目的", "用いた方法", "得られた主な結果"],
      answer: 0,
      why: "要旨は目的・方法・結果・結論を短くまとめたもので、文献一覧は本文の末尾に置きます。",
    },
  ],

  // --- 職業訓練校・IT/プログラミング基礎 ---
  "voc:it_basic": [
    {
      q: "複数のサービスで同じパスワードを使い回すことの主な危険はどれですか。",
      choices: [
        "一つのサービスから漏れると、他のサービスにも侵入されうる",
        "パスワードを忘れやすくなる",
        "通信速度が遅くなる",
        "画面が見づらくなる",
      ],
      answer: 0,
      why: "漏れた組み合わせを他サイトで試す攻撃(パスワードリスト攻撃)があります。",
    },
    {
      q: "拡張子が .csv のファイルはどのようなデータですか。",
      choices: [
        "区切り文字で列を分けた表形式のテキストデータ",
        "圧縮された画像データ",
        "実行可能なプログラム",
        "暗号化された鍵ファイル",
      ],
      answer: 0,
      why: "CSVは Comma-Separated Values の略で、表計算ソフトとの受け渡しによく使われます。",
    },
    {
      q: "ソースコードの変更履歴を管理するために広く使われている仕組みはどれですか。",
      choices: ["Git", "PDF", "JPEG", "SMTP"],
      answer: 0,
      why: "Gitは分散型のバージョン管理システムです。",
    },
    {
      q: "プログラミングでいう「バグ」とは何ですか。",
      choices: [
        "プログラムの誤りや不具合",
        "処理速度を上げる工夫",
        "画面の配色設計",
        "プログラムの設計書",
      ],
      answer: 0,
      why: "バグを取り除く作業をデバッグと呼びます。",
    },
    {
      q: "クラウドサービスを利用する利点として一般的に挙げられるものはどれですか。",
      choices: [
        "自前でサーバーを用意せず、必要な分だけ使える",
        "インターネット接続が不要になる",
        "情報漏えいが起こらなくなる",
        "料金が必ず無料になる",
      ],
      answer: 0,
      why: "初期投資を抑えられる一方、通信やセキュリティ設定の管理は依然として必要です。",
    },
  ],

  // --- 職業訓練校・簿記/経理基礎 ---
  "voc:bookkeeping": [
    {
      q: "貸借対照表を表す基本の等式はどれですか。",
      choices: [
        "資産 = 負債 + 純資産",
        "資産 = 収益 - 費用",
        "負債 = 資産 + 純資産",
        "純資産 = 収益 + 費用",
      ],
      answer: 0,
      why: "左側(借方)の資産と、右側(貸方)の負債・純資産が必ず一致します。",
    },
    {
      q: "商品を現金で売り上げたときの仕訳で、借方に来る勘定科目はどれですか。",
      choices: ["現金", "売上", "買掛金", "資本金"],
      answer: 0,
      why: "現金という資産が増えるので借方、売上(収益)は貸方に記入します。",
    },
    {
      q: "「減価償却」の説明として適切なものはどれですか。",
      choices: [
        "固定資産の取得原価を、使用する期間にわたって費用として配分する手続き",
        "商品の売値を値引きすること",
        "現金を銀行に預けること",
        "借入金を一括で返済すること",
      ],
      answer: 0,
      why: "建物や機械のように長期間使う資産に対して行います。",
    },
    {
      q: "損益計算書が示すものはどれですか。",
      choices: [
        "一定期間の収益・費用と、その差である利益",
        "ある一時点の財政状態",
        "従業員の名簿",
        "取引先の住所録",
      ],
      answer: 0,
      why: "ある一時点の財政状態を示すのは貸借対照表です。",
    },
    {
      q: "複式簿記で、勘定の左側を何と呼びますか。",
      choices: ["借方", "貸方", "残高", "元帳"],
      answer: 0,
      why: "左側が借方、右側が貸方です。名称と貸し借りの意味は必ずしも一致しません。",
    },
  ],

  // --- 職業訓練校・接客/サービス業基礎 ---
  "voc:service": [
    {
      q: "接客の第一印象を大きく左右するとされる要素はどれですか。",
      choices: [
        "表情・身だしなみ・挨拶",
        "商品の仕入れ値",
        "店舗の築年数",
        "従業員の勤続年数",
      ],
      answer: 0,
      why: "第一印象は短時間で決まるとされ、見た目と挨拶の影響が大きいと言われます。",
    },
    {
      q: "お客様から苦情を受けたとき、最初に取るべき対応はどれですか。",
      choices: [
        "まず最後まで話を聴き、不快な思いをさせたことを詫びる",
        "すぐに反論して誤解を解く",
        "その場を離れて時間を置く",
        "責任は自分にないと最初に伝える",
      ],
      answer: 0,
      why: "事実確認より先に傾聴と謝意を示すことで、対話が成立しやすくなります。",
    },
    {
      q: "依頼や断りをやわらげる「クッション言葉」の例はどれですか。",
      choices: ["恐れ入りますが", "だから", "いいから", "とにかく"],
      answer: 0,
      why: "「恐れ入りますが」「差し支えなければ」などが代表例です。",
    },
    {
      q: "「お客様が申しました」という表現の問題点はどれですか。",
      choices: [
        "お客様の動作に謙譲語を使っており、「おっしゃいました」が適切",
        "丁寧すぎるので「言った」が適切",
        "文法上まったく問題がない",
        "尊敬語を二重に使っている",
      ],
      answer: 0,
      why: "「申す」は自分側をへりくだる謙譲語なので、お客様の動作には使いません。",
    },
    {
      q: "業務で知り得たお客様の個人情報の扱いとして適切なものはどれですか。",
      choices: [
        "業務上必要な範囲でのみ利用し、他に漏らさない",
        "同僚との雑談の話題にする",
        "自分のSNSで共有する",
        "退職後は自由に使ってよい",
      ],
      answer: 0,
      why: "守秘義務は在職中だけでなく退職後も続くのが一般的です。",
    },
  ],

  // --- アメリカの資格(擬似模擬、`uscert`モード)---
  // 日英併記("English / 日本語訳"形式、このアプリの既存の会話文と同じ
  // 規約)。**正直な開示**: いずれも本アプリ用に書き下ろしたオリジナル
  // 問題で、CertNexus/DASCA/IABAC/NCARB等いずれの実際の試験問題の
  // 転載でもない。難易度・出題範囲も公式試験のものではなく、あくまで
  // 「代表的な出題テーマの入り口」を体験する位置づけ。
  "uscert:dataScientist": [
    {
      q: "Which of these best describes \"overfitting\" in machine learning? / 機械学習における「過学習(オーバーフィッティング)」の説明として最も適切なものはどれですか。",
      choices: [
        "A model fits the training data too closely and performs poorly on new data / モデルが訓練データに適合しすぎて、新しいデータでは性能が落ちること",
        "A model is too simple to capture the pattern / モデルが単純すぎてパターンを捉えられないこと",
        "A model trains faster than expected / モデルの学習が想定より速く終わること",
        "A model uses too little data / モデルが使うデータが少なすぎること",
      ],
      answer: 0,
      why: "Overfitting means the model memorizes training data noise instead of learning generalizable patterns. / 過学習とは、モデルが汎化可能なパターンではなく訓練データのノイズを覚えてしまう状態です。",
    },
    {
      q: "In statistics, what does a p-value help you evaluate? / 統計学において、p値は何を評価する助けになりますか。",
      choices: [
        "Whether an observed result is likely due to chance under a null hypothesis / 観測結果が帰無仮説のもとで偶然起こり得るかどうか",
        "The exact size of an effect / 効果の正確な大きさ",
        "How many data points were collected / 収集したデータ点の数",
        "The average of the dataset / データセットの平均値",
      ],
      answer: 0,
      why: "A small p-value suggests the observed result is unlikely under the null hypothesis. / p値が小さいほど、その結果が帰無仮説のもとでは起こりにくいことを示唆します。",
    },
    {
      q: "Which SQL clause is used to filter rows after grouping? / グループ化した後に行を絞り込むために使うSQL句はどれですか。",
      choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
      answer: 0,
      why: "WHERE filters before grouping; HAVING filters after GROUP BY. / WHEREはグループ化の前に絞り込み、HAVINGはGROUP BYの後に絞り込みます。",
    },
    {
      q: "What is the main purpose of a train/test split in a data science workflow? / データサイエンスの作業手順における訓練用/テスト用データ分割の主な目的は何ですか。",
      choices: [
        "To estimate how the model will perform on unseen data / モデルが未知のデータでどう振る舞うかを見積もるため",
        "To make the dataset smaller for storage / 保存容量のためにデータセットを小さくするため",
        "To remove duplicate rows / 重複行を除去するため",
        "To speed up data collection / データ収集を高速化するため",
      ],
      answer: 0,
      why: "Testing on held-out data approximates real-world generalization. / 訓練に使っていないデータで評価することで、実世界での汎化性能を近似できます。",
    },
    {
      q: "Which of these is a common way to handle missing values in a dataset? / データセットの欠損値への対処としてよく使われる方法はどれですか。",
      choices: [
        "Imputation (e.g. filling with the mean or median) / 補完(平均値・中央値等で埋める)",
        "Always deleting the entire dataset / 常にデータセット全体を削除する",
        "Ignoring the column names / 列名を無視する",
        "Renaming all variables randomly / すべての変数名をランダムに変更する",
      ],
      answer: 0,
      why: "Imputation, deletion of affected rows, or model-based handling are standard approaches; deleting the whole dataset is not. / 補完・該当行の削除・モデルベースの処理が標準的な方法で、データセット全体の削除ではありません。",
    },
  ],

  // --- アメリカの建築士登録試験(NCARB ARE、擬似模擬) ---
  "uscert:architectAre": [
    {
      q: "Which organization develops and administers the Architect Registration Examination (ARE) in the US? / 米国の建築士登録試験(ARE)を開発・運営している団体はどれですか。",
      choices: [
        "NCARB (National Council of Architectural Registration Boards) / NCARB(全米建築士登録協議会)",
        "AIA (American Institute of Architects) / AIA(米国建築家協会)",
        "OSHA / OSHA(労働安全衛生局)",
        "The U.S. Department of Labor / 米国労働省",
      ],
      answer: 0,
      why: "NCARB develops the ARE and is used by all US jurisdictions as a licensure requirement. / NCARBがAREを開発しており、米国のすべての管轄区域が免許要件として採用しています。",
    },
    {
      q: "In the current ARE 5.0, how many exam divisions must a candidate pass? / 現行のARE 5.0で、受験者が合格しなければならない区分数はいくつですか。",
      choices: ["Six / 6区分", "Three / 3区分", "Ten / 10区分", "One / 1区分"],
      answer: 0,
      why: "ARE 5.0 consists of six divisions covering different aspects of architectural practice. / ARE 5.0は建築実務の異なる側面を扱う6区分から構成されています。",
    },
    {
      q: "How does US architect licensure generally work across states? / 米国の建築士免許は、州をまたいでどのように扱われるのが一般的ですか。",
      choices: [
        "Licensure is granted per state, with NCARB certification enabling reciprocity / 免許は州ごとに発行され、NCARB認証により相互承認(リシプロシティ)が可能になる",
        "A single national exam grants licensure valid in all 50 states automatically / 単一の全国試験で自動的に全50州で有効な免許が得られる",
        "Architects do not need any license to practice / 建築士は開業に免許を必要としない",
        "Only federal agencies can issue architect licenses / 連邦機関のみが建築士免許を発行できる",
      ],
      answer: 0,
      why: "Each US state/jurisdiction issues its own license; NCARB certification helps architects gain reciprocal licensure in other states. / 米国の各州(管轄区域)が独自に免許を発行しますが、NCARB認証を取得すると他州でも相互承認により免許を得やすくなります。",
    },
    {
      q: "What is a load-bearing wall? / 耐力壁(ロードベアリング・ウォール)とは何ですか。",
      choices: [
        "A wall that supports structural weight from the building above / 建物上部からの構造荷重を支える壁",
        "A decorative wall with no structural function / 構造上の機能を持たない装飾用の壁",
        "A wall used only for soundproofing / 防音のためだけに使う壁",
        "A wall that can always be removed freely / 自由に撤去してよい壁",
      ],
      answer: 0,
      why: "Load-bearing walls transfer structural loads to the foundation; removing one without proper support can cause structural failure. / 耐力壁は構造荷重を基礎へ伝達するため、適切な補強なしに撤去すると構造的な破損につながり得ます。",
    },
    {
      q: "Why do US building codes commonly reference the International Building Code (IBC)? / 米国の建築基準法がしばしば国際建築基準(IBC)を参照するのはなぜですか。",
      choices: [
        "It provides a widely adopted model code that states/localities adapt into law / 州・自治体が法律に組み込むための、広く採用されているモデル基準を提供しているため",
        "It is a mandatory worldwide law enforced by the United Nations / 国連が施行する世界共通の義務的法律だから",
        "It only applies to bridges, not buildings / 橋梁のみに適用され、建物には適用されないため",
        "It replaces the need for any state-level review / 州レベルの審査を一切不要にするため",
      ],
      answer: 0,
      why: "The IBC is a model code that most US states and localities adopt (often with local amendments), not a directly binding international law. / IBCはモデル基準であり、米国の多くの州・自治体が(しばしば独自の修正を加えて)採用していますが、直接拘束力を持つ国際法ではありません。",
    },
  ],

  // --- 大工(米国、NCCER Carpentry認定を参考例として) ---
  "uscert:carpenter": [
    {
      q: "What does \"NCCER\" stand for? / 「NCCER」は何の略ですか。",
      choices: [
        "National Center for Construction Education and Research / 全米建設教育研究センター",
        "National Council for Carpentry Excellence Regulation / 全米大工技能優秀性規制協議会",
        "New Construction Code and Engineering Registry / 新建設基準・工学登録機関",
        "National Committee for Carpenter Employment Rights / 全米大工雇用権利委員会",
      ],
      answer: 0,
      why: "NCCER (National Center for Construction Education and Research) provides widely recognized craft credentials, including Carpentry. / NCCER(全米建設教育研究センター)は大工を含む、広く認知された技能認定を提供しています。",
    },
    {
      q: "How many levels does the NCCER Carpentry curriculum span? / NCCERの大工(Carpentry)カリキュラムは何レベルにわたりますか。",
      choices: ["Four / 4レベル", "One / 1レベル", "Ten / 10レベル", "Two / 2レベル"],
      answer: 0,
      why: "The NCCER Carpentry curriculum spans four levels, each requiring a written exam and a performance verification. / NCCERの大工カリキュラムは4レベルにわたり、各レベルで筆記試験と実技検証の両方が求められます。",
    },
    {
      q: "Is there a single, nationwide \"master carpenter\" government license in the US? / 米国全体で通用する単一の「マスター大工」政府免許は存在しますか。",
      choices: [
        "No — unlike electricians or plumbers, there is no standardized nationwide license for the title / いいえ——電気工事士や配管工と異なり、この称号に対する全米標準化された免許はありません",
        "Yes, issued directly by the federal government / はい、連邦政府が直接発行しています",
        "Yes, but only in one specific state / はい、ただし特定の一州のみで発行されています",
        "Yes, and it is required before any carpentry work at all / はい、いかなる大工仕事の前にも必須です",
      ],
      answer: 0,
      why: "Carpentry in the US has no standardized state licensing exam for a \"master carpenter\" title, unlike some other trades. / 米国の大工には、他の一部の職種と異なり「マスター大工」という称号に対する標準化された州免許試験がありません。",
    },
    {
      q: "What is a \"stud\" in residential wood-frame construction? / 木造軸組住宅の建築における「スタッド(stud)」とは何ですか。",
      choices: [
        "A vertical framing member in a wall / 壁の垂直方向の骨組み部材",
        "A type of roofing shingle / 屋根葺き材の一種",
        "A horizontal beam under the floor / 床下の水平な梁",
        "A metal fastener used only in plumbing / 配管専用の金属製留め具",
      ],
      answer: 0,
      why: "Studs are the vertical framing members (commonly 2x4 or 2x6 lumber) that make up the structure of a wall. / スタッドは壁の構造を構成する垂直方向の骨組み部材(一般に2x4材や2x6材)です。",
    },
    {
      q: "Why is it important to check local building codes before starting a carpentry project? / 大工仕事を始める前に地域の建築基準を確認することが重要なのはなぜですか。",
      choices: [
        "Building codes vary by state/locality and govern safety requirements like framing and load-bearing rules / 建築基準は州・自治体ごとに異なり、軸組や耐力に関する安全要件を定めているため",
        "Building codes are identical everywhere in the world, so checking is a formality / 建築基準は世界中どこでも同一なため、確認は形式的なものに過ぎない",
        "Building codes only apply to plumbing, never to carpentry / 建築基準は配管にのみ適用され、大工仕事には適用されない",
        "Building codes are optional suggestions with no legal weight / 建築基準は法的拘束力のない任意の提案に過ぎない",
      ],
      answer: 0,
      why: "Building codes are locally adopted (often based on model codes like the IBC) and set enforceable safety requirements. / 建築基準は各地域で採用されており(しばしばIBCのようなモデル基準に基づく)、法的強制力のある安全要件を定めています。",
    },
  ],
};

const VSCHOOL_QUESTIONS_PER_ROUND = 3;

// アメリカのデータサイエンティスト擬似模擬TESTの多言語版(ユーザー指示
// 「英語・日本語をデフォルトに全世界の言語へ対応、まず主要10〜20言語
// 程度から段階的に着手」への対応、2026-08-25新設)。
// **正直な開示**: 全世界の言語(130言語)を一度に翻訳することは
// 現実的ではないため、まず主要8言語(スペイン語・フランス語・
// ドイツ語・ポルトガル語・ロシア語・中国語(簡体字)・韓国語・
// ヒンディー語)を追加した(既定の英語/日本語と合わせて計10言語)。
// 訳文はネイティブレビューを受けていない最善努力の翻訳であり、
// 統計・機械学習用語は分野で広く使われる表記(英語表記を残す場合を
// 含む)を優先した。UI上にもこの開示を表示する。未収録言語を選ぶ
// UI自体を用意していない(選べるのはこの配列にある言語のみ)ため、
// 「対応していないのに対応済みに見せる」ことは無い。今後言語を
// 追加する場合はこの配列へ言語オブジェクトを1つ足すだけでよい
// (`vschoolDataScientistLangSelectEl`が自動的に選択肢へ反映する)。
const VSCHOOL_DATASCIENTIST_I18N = [
  { code: "default", label: "English / 日本語 (default)" },
  {
    code: "es",
    label: "Español",
    questions: [
      {
        q: '¿Cuál de las siguientes describe mejor el "sobreajuste" (overfitting) en el aprendizaje automático?',
        choices: [
          "Un modelo se ajusta demasiado a los datos de entrenamiento y funciona mal con datos nuevos",
          "Un modelo es demasiado simple para captar el patrón",
          "Un modelo entrena más rápido de lo esperado",
          "Un modelo usa muy pocos datos",
        ],
        why: "El sobreajuste significa que el modelo memoriza el ruido de los datos de entrenamiento en lugar de aprender patrones generalizables.",
      },
      {
        q: "En estadística, ¿para qué sirve el valor p?",
        choices: [
          "Para evaluar si un resultado observado es probable por azar bajo la hipótesis nula",
          "El tamaño exacto de un efecto",
          "Cuántos datos se recolectaron",
          "El promedio del conjunto de datos",
        ],
        why: "Un valor p pequeño sugiere que el resultado observado es poco probable bajo la hipótesis nula.",
      },
      {
        q: "¿Qué cláusula de SQL se usa para filtrar filas después de agrupar?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE filtra antes de agrupar; HAVING filtra después de GROUP BY.",
      },
      {
        q: "¿Cuál es el propósito principal de dividir los datos en entrenamiento/prueba?",
        choices: [
          "Estimar cómo se comportará el modelo con datos no vistos",
          "Reducir el tamaño del conjunto de datos para ahorrar almacenamiento",
          "Eliminar filas duplicadas",
          "Acelerar la recolección de datos",
        ],
        why: "Evaluar con datos no usados en el entrenamiento aproxima la generalización en el mundo real.",
      },
      {
        q: "¿Cuál es una forma común de tratar los valores faltantes en un conjunto de datos?",
        choices: [
          "Imputación (por ejemplo, rellenar con la media o la mediana)",
          "Eliminar siempre todo el conjunto de datos",
          "Ignorar los nombres de las columnas",
          "Renombrar todas las variables al azar",
        ],
        why: "La imputación, la eliminación de filas afectadas o el tratamiento basado en el modelo son enfoques estándar; eliminar todo el conjunto de datos no lo es.",
      },
    ],
  },
  {
    code: "fr",
    label: "Français",
    questions: [
      {
        q: 'Laquelle de ces propositions décrit le mieux le "surapprentissage" (overfitting) en apprentissage automatique ?',
        choices: [
          "Un modèle s'ajuste trop étroitement aux données d'entraînement et se comporte mal sur de nouvelles données",
          "Un modèle est trop simple pour capturer le motif",
          "Un modèle s'entraîne plus vite que prévu",
          "Un modèle utilise trop peu de données",
        ],
        why: "Le surapprentissage signifie que le modèle mémorise le bruit des données d'entraînement plutôt que d'apprendre des motifs généralisables.",
      },
      {
        q: "En statistique, à quoi sert la valeur p ?",
        choices: [
          "À évaluer si un résultat observé est probablement dû au hasard sous l'hypothèse nulle",
          "La taille exacte d'un effet",
          "Le nombre de points de données collectés",
          "La moyenne du jeu de données",
        ],
        why: "Une petite valeur p suggère que le résultat observé est peu probable sous l'hypothèse nulle.",
      },
      {
        q: "Quelle clause SQL sert à filtrer les lignes après un regroupement ?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE filtre avant le regroupement ; HAVING filtre après GROUP BY.",
      },
      {
        q: "Quel est le principal objectif de la division entraînement/test ?",
        choices: [
          "Estimer comment le modèle se comportera sur des données inédites",
          "Réduire la taille du jeu de données pour le stockage",
          "Supprimer les lignes en double",
          "Accélérer la collecte de données",
        ],
        why: "Tester sur des données non utilisées à l'entraînement approxime la généralisation en conditions réelles.",
      },
      {
        q: "Quelle est une méthode courante pour traiter les valeurs manquantes dans un jeu de données ?",
        choices: [
          "L'imputation (par exemple en remplissant avec la moyenne ou la médiane)",
          "Toujours supprimer l'intégralité du jeu de données",
          "Ignorer les noms de colonnes",
          "Renommer toutes les variables aléatoirement",
        ],
        why: "L'imputation, la suppression des lignes concernées ou un traitement basé sur un modèle sont des approches standard ; supprimer tout le jeu de données ne l'est pas.",
      },
    ],
  },
  {
    code: "de",
    label: "Deutsch",
    questions: [
      {
        q: 'Was beschreibt "Overfitting" (Überanpassung) im maschinellen Lernen am besten?',
        choices: [
          "Ein Modell passt sich zu eng an die Trainingsdaten an und funktioniert bei neuen Daten schlecht",
          "Ein Modell ist zu einfach, um das Muster zu erfassen",
          "Ein Modell trainiert schneller als erwartet",
          "Ein Modell verwendet zu wenige Daten",
        ],
        why: "Overfitting bedeutet, dass sich das Modell das Rauschen der Trainingsdaten merkt, statt verallgemeinerbare Muster zu lernen.",
      },
      {
        q: "Wozu dient der p-Wert in der Statistik?",
        choices: [
          "Um zu beurteilen, ob ein beobachtetes Ergebnis unter der Nullhypothese wahrscheinlich zufällig ist",
          "Die genaue Effektgröße",
          "Wie viele Datenpunkte gesammelt wurden",
          "Der Mittelwert des Datensatzes",
        ],
        why: "Ein kleiner p-Wert deutet darauf hin, dass das beobachtete Ergebnis unter der Nullhypothese unwahrscheinlich ist.",
      },
      {
        q: "Welche SQL-Klausel filtert Zeilen nach dem Gruppieren?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE filtert vor der Gruppierung; HAVING filtert nach GROUP BY.",
      },
      {
        q: "Was ist der Hauptzweck einer Trainings-/Testaufteilung?",
        choices: [
          "Abzuschätzen, wie sich das Modell bei unbekannten Daten verhält",
          "Den Datensatz für die Speicherung zu verkleinern",
          "Doppelte Zeilen zu entfernen",
          "Die Datenerfassung zu beschleunigen",
        ],
        why: "Das Testen mit nicht im Training verwendeten Daten approximiert die Generalisierung in der realen Welt.",
      },
      {
        q: "Was ist eine gängige Methode zum Umgang mit fehlenden Werten in einem Datensatz?",
        choices: [
          "Imputation (z. B. Auffüllen mit Mittelwert oder Median)",
          "Immer den gesamten Datensatz löschen",
          "Spaltennamen ignorieren",
          "Alle Variablen zufällig umbenennen",
        ],
        why: "Imputation, das Löschen betroffener Zeilen oder modellbasierte Verfahren sind Standardansätze; das Löschen des gesamten Datensatzes nicht.",
      },
    ],
  },
  {
    code: "pt",
    label: "Português",
    questions: [
      {
        q: 'Qual das alternativas melhor descreve "overfitting" (sobreajuste) em aprendizado de máquina?',
        choices: [
          "Um modelo se ajusta demais aos dados de treino e tem desempenho ruim em novos dados",
          "Um modelo é simples demais para captar o padrão",
          "Um modelo treina mais rápido que o esperado",
          "Um modelo usa poucos dados",
        ],
        why: "Overfitting significa que o modelo memoriza o ruído dos dados de treino em vez de aprender padrões generalizáveis.",
      },
      {
        q: "Em estatística, para que serve o valor-p?",
        choices: [
          "Avaliar se um resultado observado é provavelmente devido ao acaso sob a hipótese nula",
          "O tamanho exato de um efeito",
          "Quantos pontos de dados foram coletados",
          "A média do conjunto de dados",
        ],
        why: "Um valor-p pequeno sugere que o resultado observado é pouco provável sob a hipótese nula.",
      },
      {
        q: "Qual cláusula SQL é usada para filtrar linhas após o agrupamento?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE filtra antes do agrupamento; HAVING filtra depois do GROUP BY.",
      },
      {
        q: "Qual é o principal objetivo da divisão treino/teste?",
        choices: [
          "Estimar como o modelo se comportará com dados nunca vistos",
          "Reduzir o tamanho do conjunto de dados para armazenamento",
          "Remover linhas duplicadas",
          "Acelerar a coleta de dados",
        ],
        why: "Testar com dados não usados no treino aproxima a generalização no mundo real.",
      },
      {
        q: "Qual é uma forma comum de tratar valores ausentes em um conjunto de dados?",
        choices: [
          "Imputação (por exemplo, preenchendo com a média ou mediana)",
          "Excluir sempre o conjunto de dados inteiro",
          "Ignorar os nomes das colunas",
          "Renomear todas as variáveis aleatoriamente",
        ],
        why: "Imputação, exclusão das linhas afetadas ou tratamento baseado em modelo são abordagens padrão; excluir todo o conjunto de dados não é.",
      },
    ],
  },
  {
    code: "ru",
    label: "Русский",
    questions: [
      {
        q: "Что лучше всего описывает «переобучение» (overfitting) в машинном обучении?",
        choices: [
          "Модель слишком точно подстраивается под обучающие данные и плохо работает на новых данных",
          "Модель слишком проста, чтобы уловить закономерность",
          "Модель обучается быстрее, чем ожидалось",
          "Модель использует слишком мало данных",
        ],
        why: "Переобучение означает, что модель запоминает шум обучающих данных вместо изучения обобщаемых закономерностей.",
      },
      {
        q: "Для чего в статистике используется p-значение?",
        choices: [
          "Чтобы оценить, вероятен ли наблюдаемый результат случайно при нулевой гипотезе",
          "Точный размер эффекта",
          "Сколько точек данных было собрано",
          "Среднее значение набора данных",
        ],
        why: "Малое p-значение говорит о том, что наблюдаемый результат маловероятен при нулевой гипотезе.",
      },
      {
        q: "Какое предложение SQL используется для фильтрации строк после группировки?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE фильтрует до группировки; HAVING фильтрует после GROUP BY.",
      },
      {
        q: "Какова основная цель разделения данных на обучающую/тестовую выборки?",
        choices: [
          "Оценить, как модель будет работать на новых данных",
          "Уменьшить размер набора данных для хранения",
          "Удалить повторяющиеся строки",
          "Ускорить сбор данных",
        ],
        why: "Тестирование на данных, не использованных при обучении, приближённо оценивает обобщающую способность в реальных условиях.",
      },
      {
        q: "Какой распространённый способ обработки пропущенных значений в наборе данных?",
        choices: [
          "Импутация (например, заполнение средним или медианой)",
          "Всегда удалять весь набор данных",
          "Игнорировать названия столбцов",
          "Случайно переименовывать все переменные",
        ],
        why: "Импутация, удаление затронутых строк или обработка на основе модели — стандартные подходы; удаление всего набора данных — нет.",
      },
    ],
  },
  {
    code: "zh",
    label: "中文(简体)",
    questions: [
      {
        q: "以下哪项最能描述机器学习中的「过拟合」(overfitting)?",
        choices: [
          "模型过度贴合训练数据,在新数据上表现不佳",
          "模型过于简单,无法捕捉规律",
          "模型训练速度比预期快",
          "模型使用的数据太少",
        ],
        why: "过拟合是指模型记住了训练数据中的噪声,而不是学到了可泛化的规律。",
      },
      {
        q: "在统计学中,p值有助于评估什么?",
        choices: [
          "在零假设下,观察到的结果是否可能是偶然发生的",
          "效应的确切大小",
          "收集了多少数据点",
          "数据集的平均值",
        ],
        why: "p值越小,说明在零假设下观察到该结果的可能性越低。",
      },
      {
        q: "分组后用于筛选行的SQL子句是哪个?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE在分组前筛选;HAVING在GROUP BY之后筛选。",
      },
      {
        q: "在数据科学流程中,训练集/测试集划分的主要目的是什么?",
        choices: [
          "估计模型在未见过的数据上的表现",
          "为节省存储空间而缩小数据集",
          "删除重复行",
          "加快数据收集速度",
        ],
        why: "在未用于训练的数据上进行测试,可以近似评估模型在真实场景中的泛化能力。",
      },
      {
        q: "处理数据集中缺失值的常见方法是什么?",
        choices: [
          "插补(例如用均值或中位数填充)",
          "总是删除整个数据集",
          "忽略列名",
          "随机重命名所有变量",
        ],
        why: "插补、删除受影响的行或基于模型的处理是标准做法;删除整个数据集则不是。",
      },
    ],
  },
  {
    code: "ko",
    label: "한국어",
    questions: [
      {
        q: "머신러닝에서 「과적합」(overfitting)을 가장 잘 설명하는 것은?",
        choices: [
          "모델이 훈련 데이터에 지나치게 맞춰져 새로운 데이터에서는 성능이 떨어지는 것",
          "모델이 너무 단순해서 패턴을 포착하지 못하는 것",
          "모델의 학습이 예상보다 빨리 끝나는 것",
          "모델이 사용하는 데이터가 너무 적은 것",
        ],
        why: "과적합이란 모델이 일반화 가능한 패턴을 배우는 대신 훈련 데이터의 잡음을 암기하는 상태를 말합니다.",
      },
      {
        q: "통계학에서 p값은 무엇을 평가하는 데 도움이 됩니까?",
        choices: [
          "귀무가설 하에서 관측된 결과가 우연히 발생했을 가능성이 있는지",
          "효과의 정확한 크기",
          "수집된 데이터 포인트의 수",
          "데이터셋의 평균값",
        ],
        why: "p값이 작을수록 귀무가설 하에서 그 결과가 발생할 가능성이 낮음을 시사합니다.",
      },
      {
        q: "그룹화 이후 행을 필터링하는 데 사용하는 SQL 절은 무엇입니까?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE는 그룹화 이전에 필터링하고, HAVING은 GROUP BY 이후에 필터링합니다.",
      },
      {
        q: "데이터 과학 작업에서 훈련/테스트 데이터 분할의 주요 목적은 무엇입니까?",
        choices: [
          "모델이 보지 못한 데이터에서 어떻게 동작할지 추정하기 위해",
          "저장 용량을 위해 데이터셋을 줄이기 위해",
          "중복 행을 제거하기 위해",
          "데이터 수집 속도를 높이기 위해",
        ],
        why: "훈련에 사용하지 않은 데이터로 평가하면 실제 환경에서의 일반화 성능을 근사할 수 있습니다.",
      },
      {
        q: "데이터셋의 결측값을 처리하는 일반적인 방법은 무엇입니까?",
        choices: [
          "대치(예: 평균값이나 중앙값으로 채우기)",
          "항상 데이터셋 전체를 삭제하기",
          "열 이름을 무시하기",
          "모든 변수의 이름을 무작위로 바꾸기",
        ],
        why: "대치, 해당 행 삭제, 모델 기반 처리가 표준적인 방법이며, 데이터셋 전체 삭제는 표준적인 방법이 아닙니다.",
      },
    ],
  },
  {
    code: "hi",
    label: "हिन्दी",
    questions: [
      {
        q: "मशीन लर्निंग में \"ओवरफिटिंग\" का सबसे अच्छा वर्णन कौन सा है?",
        choices: [
          "मॉडल प्रशिक्षण डेटा में बहुत अधिक फिट हो जाता है और नए डेटा पर खराब प्रदर्शन करता है",
          "मॉडल पैटर्न को पकड़ने के लिए बहुत सरल है",
          "मॉडल अपेक्षा से तेज़ प्रशिक्षित होता है",
          "मॉडल बहुत कम डेटा का उपयोग करता है",
        ],
        why: "ओवरफिटिंग का मतलब है कि मॉडल सामान्यीकरण योग्य पैटर्न सीखने के बजाय प्रशिक्षण डेटा के शोर को याद कर लेता है।",
      },
      {
        q: "सांख्यिकी में, p-मान किसका मूल्यांकन करने में मदद करता है?",
        choices: [
          "क्या शून्य परिकल्पना के तहत देखा गया परिणाम संयोग से होने की संभावना है",
          "प्रभाव का सटीक आकार",
          "कितने डेटा बिंदु एकत्र किए गए",
          "डेटासेट का औसत",
        ],
        why: "एक छोटा p-मान बताता है कि शून्य परिकल्पना के तहत देखा गया परिणाम असंभावित है।",
      },
      {
        q: "समूहीकरण के बाद पंक्तियों को फ़िल्टर करने के लिए किस SQL क्लॉज़ का उपयोग किया जाता है?",
        choices: ["HAVING", "WHERE", "ORDER BY", "SELECT"],
        why: "WHERE समूहीकरण से पहले फ़िल्टर करता है; HAVING GROUP BY के बाद फ़िल्टर करता है।",
      },
      {
        q: "डेटा साइंस वर्कफ़्लो में ट्रेन/टेस्ट स्प्लिट का मुख्य उद्देश्य क्या है?",
        choices: [
          "यह अनुमान लगाना कि मॉडल अनदेखे डेटा पर कैसा प्रदर्शन करेगा",
          "भंडारण के लिए डेटासेट को छोटा करना",
          "डुप्लिकेट पंक्तियों को हटाना",
          "डेटा संग्रह को तेज़ करना",
        ],
        why: "प्रशिक्षण में उपयोग न किए गए डेटा पर परीक्षण वास्तविक दुनिया में सामान्यीकरण का अनुमान देता है।",
      },
      {
        q: "डेटासेट में अनुपलब्ध मानों को संभालने का एक सामान्य तरीका क्या है?",
        choices: [
          "इम्प्यूटेशन (जैसे, माध्य या माध्यिका से भरना)",
          "हमेशा पूरे डेटासेट को हटाना",
          "कॉलम नामों को अनदेखा करना",
          "सभी चरों का नाम बेतरतीब ढंग से बदलना",
        ],
        why: "इम्प्यूटेशन, प्रभावित पंक्तियों को हटाना, या मॉडल-आधारित उपचार मानक तरीके हैं; पूरे डेटासेट को हटाना मानक नहीं है।",
      },
    ],
  },
];

function vschoolHasQuestions(trackId, fieldId) {
  const list = VSCHOOL_QUESTIONS[trackId + ":" + fieldId];
  return Array.isArray(list) && list.length > 0;
}

function vschoolTrack(trackId) {
  return VSCHOOL_TRACKS.find((t) => t.id === trackId) || null;
}

function vschoolField(trackId, fieldId) {
  return (VSCHOOL_FIELDS[trackId] || []).find((f) => f.id === fieldId) || null;
}

/** 学習の参考になりそうなYouTube「検索結果ページ」へのリンク。
 *  **特定の動画を「これが正解」として紹介することはしない**——一般的な
 *  検索キーワードで検索した結果を開くだけで、内容の正しさは保証しない。 */
function vschoolYoutubeUrl(keyword) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(keyword);
}

const vschoolBtn = document.getElementById("vschool-btn");
const vvocBtn = document.getElementById("vvoc-btn");
const usCertBtn = document.getElementById("uscert-btn");
const vschoolModal = document.getElementById("vschool-modal");
const vschoolCloseBtn = document.getElementById("vschool-close");
const vschoolTitleEl = document.getElementById("vschool-title");
const vschoolStep1TitleEl = document.getElementById("vschool-step1-title");
const vschoolTrackListEl = document.getElementById("vschool-track-list");
const vschoolFieldSectionEl = document.getElementById("vschool-field-section");
const vschoolSelectedTrackEl = document.getElementById("vschool-selected-track");
const vschoolFieldListEl = document.getElementById("vschool-field-list");
const vschoolInstallSelectedBtn = document.getElementById("vschool-install-selected");
const vschoolInstallAllBtn = document.getElementById("vschool-install-all");
const vschoolInstallStatusEl = document.getElementById("vschool-install-status");
const vschoolPracticeSectionEl = document.getElementById("vschool-practice-section");
const vschoolPracticeFieldEl = document.getElementById("vschool-practice-field");
const vschoolStartBtn = document.getElementById("vschool-start");
const vschoolSubmitBtn = document.getElementById("vschool-submit");
const vschoolQuizEl = document.getElementById("vschool-quiz");
const vschoolNoticeEl = document.getElementById("vschool-field-notice");
const vschoolResultEl = document.getElementById("vschool-result");
const vschoolReviewBtn = document.getElementById("vschool-practice-btn");

const VSCHOOL_SETTINGS_KEY = "open-english.virtualSchool";
let vschoolMode = "school";
let vschoolSelectedTrack = null;
let vschoolInstalledFields = [];
let vschoolCurrentQuiz = [];
let vschoolMissed = [];

function loadVschoolSettings() {
  try {
    const raw = localStorage.getItem(VSCHOOL_SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved.track === "string") vschoolSelectedTrack = saved.track;
    if (saved && Array.isArray(saved.fields)) vschoolInstalledFields = saved.fields;
  } catch (_) {
    /* 壊れた保存値は無視して初期状態から始める(サービスを止めない) */
  }
}

function saveVschoolSettings() {
  try {
    localStorage.setItem(
      VSCHOOL_SETTINGS_KEY,
      JSON.stringify({ track: vschoolSelectedTrack, fields: vschoolInstalledFields })
    );
  } catch (_) {
    /* 保存できなくても機能自体は使える */
  }
}

/** 採点結果の保存。既存の`POST /v1/db/history`をそのまま使う
 *  (家庭教師コースの`recordTutorHistory`と同じ仕組み・同じ保存先)。
 *  失敗しても学習の進行は止めない。 */
function recordVschoolHistory(text) {
  try {
    fetch("/v1/db/history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "virtual-school-result", content: text }),
    }).catch(() => {});
  } catch (_) {
    /* 保存できなくても出題・採点は続ける */
  }
}

function renderVschoolTracks() {
  if (!vschoolTrackListEl) return;
  vschoolTrackListEl.innerHTML = "";
  VSCHOOL_TRACKS.filter((t) => t.mode === vschoolMode).forEach((track) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "setup-btn" + (track.id === vschoolSelectedTrack ? " selected" : "");
    const fields = VSCHOOL_FIELDS[track.id] || [];
    const ready = fields.filter((f) => vschoolHasQuestions(track.id, f.id)).length;
    btn.textContent =
      track.ja + " / " + track.en + "(収録済み " + ready + "/" + fields.length + " 分野)";
    btn.addEventListener("click", () => selectVschoolTrack(track.id));
    vschoolTrackListEl.appendChild(btn);
  });
}

function selectVschoolTrack(trackId) {
  if (trackId !== vschoolSelectedTrack) {
    // 区分を変えたら出題は破棄し、インストール済み分野もその区分のものだけ残す。
    vschoolInstalledFields = vschoolInstalledFields.filter((id) => vschoolHasQuestions(trackId, id));
    vschoolCurrentQuiz = [];
    vschoolMissed = [];
    vschoolQuizEl.innerHTML = "";
    vschoolResultEl.textContent = "";
    vschoolNoticeEl.innerHTML = "";
    vschoolInstallStatusEl.textContent = "";
    vschoolPracticeSectionEl.classList.add("hidden");
    vschoolSubmitBtn.classList.add("hidden");
    vschoolReviewBtn.classList.add("hidden");
  }
  vschoolSelectedTrack = trackId;
  saveVschoolSettings();
  renderVschoolTracks();
  renderVschoolFields();
}

function renderVschoolFields() {
  if (!vschoolSelectedTrack) return;
  const track = vschoolTrack(vschoolSelectedTrack);
  if (!track) return;
  vschoolSelectedTrackEl.textContent =
    "選択中の区分 / Selected category: " + track.ja + " / " + track.en;
  vschoolFieldListEl.innerHTML = "";
  (VSCHOOL_FIELDS[vschoolSelectedTrack] || []).forEach((field) => {
    const available = vschoolHasQuestions(vschoolSelectedTrack, field.id);
    const label = document.createElement("label");
    label.className = "tutor-subject-choice" + (available ? "" : " unavailable");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = field.id;
    box.checked = available && vschoolInstalledFields.includes(field.id);
    box.disabled = !available;
    label.appendChild(box);
    const span = document.createElement("span");
    if (available) {
      const n = VSCHOOL_QUESTIONS[vschoolSelectedTrack + ":" + field.id].length;
      span.textContent = field.ja + " / " + field.en + "(" + n + "問収録 / " + n + " questions)";
    } else {
      // **嘘の「対応済み」を作らないこと。**
      span.textContent = field.ja + " / " + field.en + "(準備中 / not ready yet)";
    }
    label.appendChild(span);
    // 学習の参考になりそうなYouTube検索リンク(未収録の分野にも付ける——
    // アプリに問題が無くても、学習の入口としては役に立つため)。
    const link = document.createElement("a");
    link.href = vschoolYoutubeUrl(field.yt);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "vschool-yt-link";
    link.textContent = "▶ YouTubeで「" + field.yt + "」を検索";
    link.addEventListener("click", (e) => e.stopPropagation());
    label.appendChild(link);
    const careerHtml = vschoolCareerHtml(field);
    if (careerHtml) {
      const careerWrap = document.createElement("div");
      careerWrap.innerHTML = careerHtml;
      careerWrap.addEventListener("click", (e) => e.stopPropagation());
      label.appendChild(careerWrap);
    }
    const sampleCodeEl = buildVschoolSampleCodeElement(field);
    if (sampleCodeEl) {
      sampleCodeEl.addEventListener("click", (e) => e.stopPropagation());
      label.appendChild(sampleCodeEl);
    }
    const langSelectEl = buildVschoolLangSelectElement(vschoolSelectedTrack, field);
    if (langSelectEl) {
      langSelectEl.addEventListener("click", (e) => e.stopPropagation());
      label.appendChild(langSelectEl);
    }
    vschoolFieldListEl.appendChild(label);
  });
  // その区分にまだ1分野も問題が無いときは、選ばせる前に正直に伝える
  // (何も起きない画面にして利用者を迷わせないため)。
  const readyCount = (VSCHOOL_FIELDS[vschoolSelectedTrack] || []).filter((f) =>
    vschoolHasQuestions(vschoolSelectedTrack, f.id)
  ).length;
  if (readyCount === 0) {
    const note = document.createElement("p");
    note.className = "setup-note";
    note.textContent =
      "この区分は現在すべての分野が準備中です(問題をまだ用意できていません)。" +
      "上の一覧で「収録済み」の分野がある区分をお選びください。 / " +
      "No field in this category has questions yet; please pick a category that lists available fields.";
    vschoolFieldListEl.appendChild(note);
  }
  vschoolFieldSectionEl.classList.remove("hidden");
  if (vschoolInstalledFields.length > 0) refreshVschoolPracticeSection();
}

function installVschoolFields(fieldIds) {
  const ok = (id) => vschoolHasQuestions(vschoolSelectedTrack, id);
  const available = fieldIds.filter(ok);
  const missing = fieldIds.filter((id) => !ok(id));
  vschoolInstalledFields = available;
  saveVschoolSettings();

  const nameOf = (id) => {
    const f = vschoolField(vschoolSelectedTrack, id);
    return f ? f.ja + " / " + f.en : id;
  };
  const lines = [];
  if (available.length > 0) {
    lines.push("インストールしました / Installed: " + available.map(nameOf).join("、"));
  } else {
    lines.push("インストールできる分野がありませんでした。 / No field could be installed.");
  }
  if (missing.length > 0) {
    // **嘘の「対応済み」を出さないこと**——未収録は未収録と正直に伝える。
    lines.push(
      "次の分野の問題は準備中のためインストールしていません: " + missing.map(nameOf).join("、") +
        " / Questions for these fields are not ready yet, so they were not installed."
    );
  }
  vschoolInstallStatusEl.textContent = lines.join("\n");
  renderVschoolFields();
  refreshVschoolPracticeSection();
}

function refreshVschoolPracticeSection() {
  if (vschoolInstalledFields.length === 0) {
    vschoolPracticeSectionEl.classList.add("hidden");
    return;
  }
  vschoolPracticeFieldEl.innerHTML = vschoolInstalledFields
    .map((id) => {
      const f = vschoolField(vschoolSelectedTrack, id);
      return '<option value="' + id + '">' + (f ? f.ja + " / " + f.en : id) + "</option>";
    })
    .join("");
  vschoolPracticeSectionEl.classList.remove("hidden");
}

/** インストール済み分野からランダムに数問出題する
 *  (家庭教師コースと同じく`shuffledCopy`を使い、選択肢の並びも毎回変える)。 */
// アメリカのデータサイエンティストTESTの言語選択状態(既定は
// "default"=英語/日本語併記の元データをそのまま使う)。
let vschoolDataScientistLangCode = "default";

// データサイエンティスト分野にのみ、言語選択セレクトを表示する
// (VSCHOOL_DATASCIENTIST_I18Nを持つ唯一の分野、2026-08-25新設)。
function buildVschoolLangSelectElement(trackId, field) {
  if (trackId !== "uscert" || !field || field.id !== "dataScientist") return null;
  const wrap = document.createElement("div");
  wrap.className = "vschool-sample-code";
  const labelP = document.createElement("p");
  labelP.className = "vschool-career-label";
  labelP.textContent = "🌐 出題言語を選択 / Choose the quiz language";
  wrap.appendChild(labelP);
  const note = document.createElement("p");
  note.className = "setup-note";
  note.textContent =
    "正直な開示: 英語・日本語以外の訳文はネイティブレビューを受けていない最善努力の翻訳です。まず主要8言語から開始し、今後追加していきます。 / " +
    "Honest disclosure: translations other than English/Japanese are best-effort and have not been reviewed by native speakers. Starting with 8 major languages, more to be added over time.";
  wrap.appendChild(note);
  const select = document.createElement("select");
  select.className = "setup-input vschool-lang-select";
  VSCHOOL_DATASCIENTIST_I18N.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.code;
    opt.textContent = entry.label;
    select.appendChild(opt);
  });
  select.value = vschoolDataScientistLangCode;
  select.addEventListener("change", () => {
    vschoolDataScientistLangCode = select.value;
    renderVschoolQuiz();
  });
  select.addEventListener("click", (e) => e.stopPropagation());
  wrap.appendChild(select);
  return wrap;
}

// トラック/分野に応じた出題プール(通常は`VSCHOOL_QUESTIONS`、
// データサイエンティスト分野で英日以外の言語を選んでいれば
// `VSCHOOL_DATASCIENTIST_I18N`側の訳文を使う)。
function vschoolQuestionsPool(trackId, fieldId) {
  const base = VSCHOOL_QUESTIONS[trackId + ":" + fieldId] || [];
  if (trackId === "uscert" && fieldId === "dataScientist" && vschoolDataScientistLangCode !== "default") {
    const entry = VSCHOOL_DATASCIENTIST_I18N.find((e) => e.code === vschoolDataScientistLangCode);
    if (entry && Array.isArray(entry.questions)) {
      return entry.questions.map((item) => ({ q: item.q, choices: item.choices, answer: 0, why: item.why || "" }));
    }
  }
  return base;
}

function renderVschoolQuiz() {
  const fieldId = vschoolPracticeFieldEl.value;
  const pool = vschoolQuestionsPool(vschoolSelectedTrack, fieldId);
  const field = vschoolField(vschoolSelectedTrack, fieldId);
  vschoolResultEl.textContent = "";
  vschoolReviewBtn.classList.add("hidden");
  vschoolMissed = [];
  if (pool.length === 0) {
    vschoolQuizEl.innerHTML = "";
    vschoolCurrentQuiz = [];
    vschoolResultEl.textContent =
      "現在この分野の問題は準備中です。 / Questions for this field are not ready yet.";
    vschoolSubmitBtn.classList.add("hidden");
    return;
  }
  if (field) {
    vschoolNoticeEl.innerHTML =
      '学習の参考: <a href="' + vschoolYoutubeUrl(field.yt) +
      '" target="_blank" rel="noopener noreferrer">▶ YouTubeで「' + field.yt + "」を検索</a>" +
      "(一般的な検索キーワードで検索結果ページを開くだけです。特定の動画の内容を推奨・保証するものではありません。 / " +
      "This just opens a YouTube search for a generic keyword; no specific video is endorsed.)";
  }
  vschoolCurrentQuiz = shuffledCopy(pool)
    .slice(0, Math.min(VSCHOOL_QUESTIONS_PER_ROUND, pool.length))
    .map((item) => {
      const order = shuffledCopy(item.choices.map((_, ci) => ci));
      return {
        q: item.q,
        choices: order.map((ci) => item.choices[ci]),
        answer: order.indexOf(item.answer),
        why: item.why || "",
      };
    });
  vschoolQuizEl.innerHTML = vschoolCurrentQuiz
    .map((item, qi) => {
      const choices = item.choices
        .map(
          (choice, ci) =>
            '<label class="exam-prep-choice"><input type="radio" name="vschool-q' + qi +
            '" value="' + ci + '" /> ' + choice + "</label>"
        )
        .join("");
      return '<div class="exam-prep-question"><p>' + (qi + 1) + ". " + item.q + "</p>" + choices + "</div>";
    })
    .join("");
  vschoolSubmitBtn.classList.remove("hidden");
}

function scoreVschoolQuiz() {
  if (vschoolCurrentQuiz.length === 0) return;
  const fieldId = vschoolPracticeFieldEl.value;
  const track = vschoolTrack(vschoolSelectedTrack);
  const field = vschoolField(vschoolSelectedTrack, fieldId);
  let score = 0;
  let unanswered = 0;
  vschoolMissed = [];
  const lines = [];
  vschoolCurrentQuiz.forEach((item, qi) => {
    const selected = vschoolQuizEl.querySelector('input[name="vschool-q' + qi + '"]:checked');
    if (!selected) unanswered += 1;
    const correct = Boolean(selected) && Number(selected.value) === item.answer;
    if (correct) score += 1;
    else vschoolMissed.push({ q: item.q, correctChoice: item.choices[item.answer] });
    lines.push(
      (qi + 1) + ". " + (correct ? "○ 正解 / correct" : selected ? "× 不正解 / incorrect" : "− 未回答 / not answered") +
        " — 正解は「" + item.choices[item.answer] + "」" + (item.why ? " — " + item.why : "")
    );
  });
  const header =
    "得点 / Score: " + score + " / " + vschoolCurrentQuiz.length +
    "(" + (track ? track.ja : "") + "・" + (field ? field.ja : fieldId) + ")" +
    (unanswered > 0 ? " ※未回答 " + unanswered + "問" : "") +
    " — 本アプリのオリジナル模擬問題です。実際の入試の合否や資格取得を予測するものではありません。 / " +
    "These are original mock questions; the score does not predict real admissions or qualifications.";
  vschoolResultEl.textContent = [header].concat(lines).join("\n");
  vschoolReviewBtn.classList.remove("hidden");

  recordVschoolHistory(
    "[virtual-school] mode=" + vschoolMode +
      " track=" + (track ? track.en : vschoolSelectedTrack) +
      " field=" + (field ? field.en : fieldId) +
      " score=" + score + "/" + vschoolCurrentQuiz.length
  );
}

function reviewVschoolWithTrainer() {
  // ユーザー報告(2026-08-25)「TESTを受けた後に講義を受けようとすると、
  // 英語のメッセージだけで日本語がなかった」への対応。JLPT/世界の言語の
  // 模擬試験後のトレーナー引き継ぎ(practiceExamPrepWithTrainer)は
  // 既にreply-langを明示的に"hybrid"へ切り替えていたが、この
  // バーチャルスクール/職業訓練校側の引き継ぎだけそれを行っておらず、
  // 利用者が以前どこかで"English only"を選んだままだと、この解説依頼も
  // 英語のみで返ってしまう抜け穴だった。ここでも明示的にhybridへ揃える。
  if (replyLangEl) replyLangEl.value = "hybrid";
  const track = vschoolTrack(vschoolSelectedTrack);
  const field = vschoolField(vschoolSelectedTrack, vschoolPracticeFieldEl.value);
  const targets =
    vschoolMissed.length > 0
      ? vschoolMissed
      : vschoolCurrentQuiz.map((item) => ({ q: item.q, correctChoice: item.choices[item.answer] }));
  if (targets.length === 0) return;
  const body = targets
    .map((item, i) => i + 1 + ". " + item.q + " (正解 / correct answer: " + item.correctChoice + ")")
    .join("\n");
  const requestText =
    (track ? track.ja : "") + "の" + (field ? field.ja : "") +
    "の講師として、次の模擬問題を解説してください。\n" +
    "Please act as an instructor for this field and explain these mock questions to me.\n\n" + body;
  vschoolModal.classList.add("hidden");
  inputEl.value = requestText;
  formEl.dispatchEvent(new Event("submit", { cancelable: true }));
}

// 2026-08-25追加: `uscert`モード(アメリカの資格、擬似模擬)向けの
// タイトル/手順文言。モードが3種類になったため、真偽値の分岐から
// テーブル引きへ変更した。
const VSCHOOL_MODE_LABELS = {
  voc: {
    title: "🛠 バーチャルオンライン職業訓練校 / Virtual online vocational school",
    step1: "1. 訓練校を選んでください / Choose a training school",
  },
  uscert: {
    title: "🇺🇸 アメリカの資格(擬似模擬) / US certifications (mock)",
    step1: "1. 資格を選んでください / Choose a certification",
  },
  school: {
    title: "🏫 バーチャルスクール(学生向け教育) / Virtual school (for students)",
    step1: "1. 区分を選んでください / Choose a category",
  },
};

function openVschoolModal(mode) {
  vschoolMode = mode;
  const labels = VSCHOOL_MODE_LABELS[mode] || VSCHOOL_MODE_LABELS.school;
  vschoolTitleEl.textContent = labels.title;
  vschoolStep1TitleEl.textContent = labels.step1;
  // 別モードで選んでいた区分が残っていたら選び直させる。
  const cur = vschoolTrack(vschoolSelectedTrack);
  if (!cur || cur.mode !== mode) {
    vschoolSelectedTrack = null;
    vschoolInstalledFields = [];
    vschoolFieldSectionEl.classList.add("hidden");
    vschoolPracticeSectionEl.classList.add("hidden");
  }
  renderVschoolTracks();
  if (vschoolSelectedTrack) renderVschoolFields();
  vschoolModal.classList.remove("hidden");
}

if (vschoolModal && vschoolBtn) {
  loadVschoolSettings();
  vschoolBtn.addEventListener("click", () => openVschoolModal("school"));
  if (vvocBtn) vvocBtn.addEventListener("click", () => openVschoolModal("voc"));
  if (usCertBtn) usCertBtn.addEventListener("click", () => openVschoolModal("uscert"));
  vschoolCloseBtn.addEventListener("click", () => vschoolModal.classList.add("hidden"));
  vschoolModal.addEventListener("click", (e) => {
    if (e.target === vschoolModal) vschoolModal.classList.add("hidden");
  });
  vschoolInstallSelectedBtn.addEventListener("click", () => {
    const chosen = Array.from(
      vschoolFieldListEl.querySelectorAll("input[type=checkbox]:checked")
    ).map((box) => box.value);
    if (chosen.length === 0) {
      vschoolInstallStatusEl.textContent =
        "分野を1つ以上選んでください。 / Please choose at least one field.";
      return;
    }
    installVschoolFields(chosen);
  });
  vschoolInstallAllBtn.addEventListener("click", () => {
    installVschoolFields(
      (VSCHOOL_FIELDS[vschoolSelectedTrack] || [])
        .map((f) => f.id)
        .filter((id) => vschoolHasQuestions(vschoolSelectedTrack, id))
    );
  });
  vschoolStartBtn.addEventListener("click", renderVschoolQuiz);
  vschoolSubmitBtn.addEventListener("click", scoreVschoolQuiz);
  vschoolReviewBtn.addEventListener("click", reviewVschoolWithTrainer);
}

// ============================================================
// 2026-08-26新設: フリーランス開発コーナー(ユーザー指示「フリーランス
// プログラマー向け求人案件を参考にAI先生と開発するコーナー」)。
// 範囲の正直な開示はモーダルHTML(index.html #freelance-corner-modal)
// 側のsetup-honestに記載。実装方針: 求人検索はGoogle検索を新規タブで
// 開く方式(APIキー不要、利用規約・レート制限に配慮)、GitHub連携は
// ブラウザから直接GitHub REST APIを呼ぶ方式(トークンはこのブラウザの
// localStorageにのみ保存、当アプリのサーバーへは送信しない)。
// ============================================================

// 代表的なプログラミング言語100種(TIOBE/GitHub Octoverse等で継続的に
// 上位・話題に上る言語を中心に選定。「100種類から選択」というユーザー
// 要望への対応、恣意的な優先順位付けはしていない・アルファベット順)。
const FREELANCE_PROGRAMMING_LANGUAGES = [
  "Ada", "Angular (TypeScript)", "Apex", "APL", "AppleScript", "Assembly (x86)",
  "AutoHotkey", "AWK", "Ballerina", "Bash / Shell", "BASIC", "C", "C#", "C++",
  "Clojure", "COBOL", "CoffeeScript", "Common Lisp", "Crystal", "Dart", "Delphi (Object Pascal)",
  "Elixir", "Elm", "Erlang", "F#", "Flutter (Dart)", "Fortran", "GDScript", "Go",
  "Groovy", "Hack", "Haskell", "HCL (Terraform)", "HTML/CSS", "Java", "JavaScript",
  "Julia", "Kotlin", "LabVIEW", "Lua", "MATLAB", "Nim", "Node.js (JavaScript)",
  "Objective-C", "OCaml", "Pascal", "Perl", "PHP", "PL/SQL", "PowerShell", "Prolog",
  "Python", "R", "Racket", "React (JavaScript/TypeScript)", "Reason", "Ruby", "Rust",
  "SAS", "Scala", "Scheme", "Scratch", "Shell (POSIX sh)", "Smalltalk", "Solidity",
  "Solidity (EVM)", "SQL", "Svelte (JavaScript/TypeScript)", "Swift", "Tcl", "TypeScript",
  "V (vlang)", "Vala", "VB.NET", "VBA", "Verilog", "VHDL", "Visual Basic", "Vue (JavaScript/TypeScript)",
  "WebAssembly (WAT)", "X++", "Xojo", "Zig", "ABAP", "ActionScript", "Ceylon", "Chapel",
  "D", "Dylan", "Eiffel", "Factor", "Forth", "Genie", "Io", "J", "Mercury", "Modula-2",
  "Nix", "PostScript", "Pure Data", "Q#", "Red", "Rebol", "SuperCollider", "Wolfram Language",
];

const freelanceCornerBtn = document.getElementById("freelance-corner-btn");
const freelanceCornerModal = document.getElementById("freelance-corner-modal");
const freelanceCornerClose = document.getElementById("freelance-corner-close");
const freelanceLanguageSelectEl = document.getElementById("freelance-language-select");
const freelanceLanguageCustomEl = document.getElementById("freelance-language-custom");
const freelanceFrameworkInputEl = document.getElementById("freelance-framework-input");
const freelanceSearchOfficialBtn = document.getElementById("freelance-search-official-btn");
const freelanceCopyOfficialUrlBtn = document.getElementById("freelance-copy-official-url-btn");
const freelanceSearchJobsBtn = document.getElementById("freelance-search-jobs-btn");
const freelanceCopyJobsUrlBtn = document.getElementById("freelance-copy-jobs-url-btn");
const freelanceJobNotesEl = document.getElementById("freelance-job-notes");
const freelanceSampleListEl = document.getElementById("freelance-sample-list");
const freelanceAskTeacherBtn = document.getElementById("freelance-ask-teacher-btn");

// GitHub連携要素(2026-08-27: トークンの受け渡し方法を3種類に拡張)
const freelanceGithubTokenModeEl = document.getElementById("freelance-github-token-mode");
const freelanceGithubTokenFileSectionEl = document.getElementById("freelance-github-token-file-section");
const freelanceGithubTokenEncryptedSectionEl = document.getElementById("freelance-github-token-encrypted-section");
const freelanceGithubTokenPlainSectionEl = document.getElementById("freelance-github-token-plain-section");
const freelanceGithubTokenFileBtn = document.getElementById("freelance-github-token-file-btn");
const freelanceGithubPassphraseEl = document.getElementById("freelance-github-passphrase");
const freelanceGithubTokenEl = document.getElementById("freelance-github-token");
const freelanceGithubSaveTokenBtn = document.getElementById("freelance-github-save-token-btn");
const freelanceGithubUnlockTokenBtn = document.getElementById("freelance-github-unlock-token-btn");
const freelanceGithubClearTokenBtn = document.getElementById("freelance-github-clear-token-btn");
const freelanceGithubTokenPlainEl = document.getElementById("freelance-github-token-plain");
const freelanceGithubSaveTokenPlainBtn = document.getElementById("freelance-github-save-token-plain-btn");
const freelanceGithubClearTokenPlainBtn = document.getElementById("freelance-github-clear-token-plain-btn");
const freelanceGithubTokenStatusEl = document.getElementById("freelance-github-token-status");
const freelanceGithubRepoNameEl = document.getElementById("freelance-github-repo-name");
const freelanceGithubPrivateEl = document.getElementById("freelance-github-private");
const freelanceGithubFilePathEl = document.getElementById("freelance-github-file-path");
const freelanceGithubFileContentEl = document.getElementById("freelance-github-file-content");
const freelanceGithubCommitMessageEl = document.getElementById("freelance-github-commit-message");
const freelanceGithubPushBtn = document.getElementById("freelance-github-push-btn");
const freelanceGithubPushStatusEl = document.getElementById("freelance-github-push-status");

const FREELANCE_GITHUB_TOKEN_LOCAL_KEY = "open-english.freelanceGithubToken";
const FREELANCE_GITHUB_TOKEN_ENCRYPTED_LOCAL_KEY = "open-english.freelanceGithubTokenEncrypted";

// メモリ上のみで保持するトークン(①ファイル読込・②復号後)。
// どちらもlocalStorageへは書き込まない——タブを閉じる/リロードすると消える。
let freelanceGithubFileToken = null;
let freelanceGithubUnlockedToken = null;

// 練習用サンプル案件(架空、実在の求人ではない——setup-honestで開示済み)。
const FREELANCE_SAMPLE_LISTINGS = [
  {
    title_ja: "【サンプル】Rustバックエンド開発(週3日リモート)",
    title_en: "[Sample] Rust backend development (3 days/week, remote)",
    text: "Rustで書かれたAPIサーバーの機能追加・パフォーマンス改善。tokio/axum経験歓迎。週3日リモート、期間3ヶ月〜。",
  },
  {
    title_ja: "【サンプル】React + TypeScriptフロントエンド改修",
    title_en: "[Sample] React + TypeScript frontend revamp",
    text: "既存のReact/TypeScript SPAのUI刷新とアクセシビリティ改善。週2〜3日、フルリモート可。",
  },
  {
    title_ja: "【サンプル】Python(Django)受託開発の一部担当",
    title_en: "[Sample] Contract Django (Python) development, partial scope",
    text: "Django製の業務システムに新機能を追加。DB設計の経験があれば尚可。単発〜継続どちらも相談可。",
  },
];

function freelanceSelectedLanguage() {
  const custom = (freelanceLanguageCustomEl?.value || "").trim();
  if (custom) return custom;
  return freelanceLanguageSelectEl?.value || "";
}

function freelancePopulateLanguageSelect() {
  if (!freelanceLanguageSelectEl || freelanceLanguageSelectEl.options.length > 0) return;
  for (const lang of FREELANCE_PROGRAMMING_LANGUAGES) {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = lang;
    freelanceLanguageSelectEl.appendChild(opt);
  }
}

async function freelanceCopyText(text, statusEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (statusEl) {
      statusEl.textContent = "コピーしました / Copied.";
      setTimeout(() => { statusEl.textContent = ""; }, 3000);
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `コピーに失敗しました / Copy failed: ${err}`;
  }
}

function freelanceBuildOfficialSearchUrl() {
  const lang = freelanceSelectedLanguage();
  const fw = (freelanceFrameworkInputEl?.value || "").trim();
  const parts = [lang, fw, "official site OR github.com OR blog"].filter(Boolean);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

function freelanceBuildJobSearchUrl() {
  const lang = freelanceSelectedLanguage();
  const fw = (freelanceFrameworkInputEl?.value || "").trim();
  const parts = [lang, fw, "フリーランス 案件 OR freelance job"].filter(Boolean);
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(" "))}`;
}

function freelanceRenderSamples() {
  if (!freelanceSampleListEl) return;
  freelanceSampleListEl.innerHTML = "";
  for (const sample of FREELANCE_SAMPLE_LISTINGS) {
    const card = document.createElement("div");
    card.className = "setup-note";
    card.style.border = "1px solid var(--border-color, #ccc)";
    card.style.borderRadius = "8px";
    card.style.padding = "8px";
    card.style.marginBottom = "8px";

    const heading = document.createElement("strong");
    heading.textContent = `${sample.title_ja} / ${sample.title_en}`;
    card.appendChild(heading);

    const body = document.createElement("p");
    body.textContent = sample.text;
    card.appendChild(body);

    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "setup-btn";
    useBtn.textContent = "このサンプルを案件メモへ / Use this sample";
    useBtn.addEventListener("click", () => {
      if (freelanceJobNotesEl) {
        freelanceJobNotesEl.value = `${sample.title_ja}\n${sample.text}`;
      }
    });
    card.appendChild(useBtn);

    freelanceSampleListEl.appendChild(card);
  }
}

// 現在選択中の受け渡し方法("file" | "encrypted" | "plain")に応じて、
// 実際にGitHub APIへ渡すトークン文字列を1つ返す(無ければ空文字列)。
// ①②はメモリ上の変数のみ、③のみlocalStorageを読む。
function freelanceLoadGithubToken() {
  const mode = freelanceGithubTokenModeEl?.value || "file";
  if (mode === "file") return freelanceGithubFileToken || "";
  if (mode === "encrypted") return freelanceGithubUnlockedToken || "";
  // 2026-08-27防御的修正: ④vaultモードではキーの復号・使用はvault.html
  // 内だけで完結させる設計のため、ここでは絶対に何も返さない
  // (現状の呼び出し元`freelanceGithubCreateRepoAndPush`はvaultモード
  // 時には呼ばれない設計だが、Google検索側で同種のフォールスルーが
  // 実際にバグを引き起こしたため〈同日の別コミット参照〉、将来の
  // 呼び出し追加に備えて明示的にブロックしておく)。
  if (mode === "vault") return "";
  try {
    return window.localStorage.getItem(FREELANCE_GITHUB_TOKEN_LOCAL_KEY) || "";
  } catch {
    return "";
  }
}

function freelanceRefreshGithubTokenStatus() {
  if (!freelanceGithubTokenStatusEl) return;
  const mode = freelanceGithubTokenModeEl?.value || "file";
  if (mode === "file") {
    freelanceGithubTokenStatusEl.textContent = freelanceGithubFileToken
      ? "ファイルから読み込み済み(保存はされていません)。 / Loaded from file (not saved anywhere)."
      : "ファイル未選択です。 / No file selected yet.";
  } else if (mode === "encrypted") {
    let hasEncrypted = false;
    try { hasEncrypted = !!window.localStorage.getItem(FREELANCE_GITHUB_TOKEN_ENCRYPTED_LOCAL_KEY); } catch { /* ignore */ }
    freelanceGithubTokenStatusEl.textContent = freelanceGithubUnlockedToken
      ? "パスフレーズで復号済み(メモリ上のみ)。 / Decrypted with your passphrase (in memory only)."
      : hasEncrypted
        ? "暗号化済みトークンが保存されています。パスフレーズで復号してください。 / An encrypted token is saved — decrypt it with your passphrase."
        : "暗号化トークン未設定です。 / No encrypted token saved yet.";
  } else if (mode === "vault") {
    freelanceGithubTokenStatusEl.textContent = freelanceVaultOrigin
      ? `Vault読み込み済み(${freelanceVaultOrigin})。トークンの解錠はvault内で行います。 / Vault loaded (${freelanceVaultOrigin}). Unlock the token inside the vault itself.`
      : "Vault未読み込みです。上の欄でURLを指定して読み込んでください。 / Vault not loaded yet — enter its URL above and load it.";
  } else {
    const token = (() => { try { return window.localStorage.getItem(FREELANCE_GITHUB_TOKEN_LOCAL_KEY) || ""; } catch { return ""; } })();
    freelanceGithubTokenStatusEl.textContent = token
      ? "トークンが平文で保存されています(このブラウザのみ)。 / A token is saved in plain text (this browser only)."
      : "トークン未設定です。 / No token saved.";
  }
}

const freelanceGithubTokenVaultSectionEl = document.getElementById("freelance-github-token-vault-section");
const freelanceVaultUrlEl = document.getElementById("freelance-vault-url");
const freelanceVaultLoadBtn = document.getElementById("freelance-vault-load-btn");
const freelanceVaultStatusEl = document.getElementById("freelance-vault-status");
const freelanceVaultIframeEl = document.getElementById("freelance-vault-iframe");
let freelanceVaultOrigin = null; // 読み込み済みvaultのorigin(postMessage送信先の検証に使う)

function freelanceUpdateGithubTokenModeSections() {
  const mode = freelanceGithubTokenModeEl?.value || "file";
  freelanceGithubTokenFileSectionEl?.classList.toggle("hidden", mode !== "file");
  freelanceGithubTokenEncryptedSectionEl?.classList.toggle("hidden", mode !== "encrypted");
  freelanceGithubTokenPlainSectionEl?.classList.toggle("hidden", mode !== "plain");
  freelanceGithubTokenVaultSectionEl?.classList.toggle("hidden", mode !== "vault");
  freelanceRefreshGithubTokenStatus();
}
if (freelanceGithubTokenModeEl) {
  freelanceGithubTokenModeEl.addEventListener("change", freelanceUpdateGithubTokenModeSections);
}

// vault.htmlをiframeとして読み込み、このページのoriginをparentOrigin
// クエリパラメータとして渡す(vault.html側はこのoriginからのメッセージ
// のみ受け付ける、双方向のorigin検証)。
if (freelanceVaultLoadBtn) {
  freelanceVaultLoadBtn.addEventListener("click", () => {
    const url = (freelanceVaultUrlEl?.value || "").trim();
    if (!url) {
      if (freelanceVaultStatusEl) freelanceVaultStatusEl.textContent = "⚠ vault.htmlのURLを入力してください / Please enter the vault.html URL";
      return;
    }
    let vaultUrlObj;
    try {
      vaultUrlObj = new URL(url);
    } catch {
      if (freelanceVaultStatusEl) freelanceVaultStatusEl.textContent = "⚠ 無効なURLです / Invalid URL";
      return;
    }
    freelanceVaultOrigin = vaultUrlObj.origin;
    vaultUrlObj.searchParams.set("parentOrigin", window.location.origin);
    if (freelanceVaultIframeEl) {
      freelanceVaultIframeEl.src = vaultUrlObj.toString();
      freelanceVaultIframeEl.classList.remove("hidden");
    }
    if (freelanceVaultStatusEl) {
      const sameOrigin = freelanceVaultOrigin === window.location.origin;
      freelanceVaultStatusEl.textContent = sameOrigin
        ? "⚠ 読み込みました(同一オリジンのため分離効果はありません) / Loaded (same-origin, no isolation benefit)"
        : "✅ 読み込みました(別オリジン) / Loaded (cross-origin)";
    }
  });
}

// vault.html内でGitHub pushを実行させ、結果(URLまたはエラー)を
// postMessageで受け取る。平文トークンはこの関数の外へ一切出てこない。
function freelanceRequestVaultGithubPush(pushArgs) {
  return new Promise((resolve, reject) => {
    if (!freelanceVaultIframeEl || !freelanceVaultIframeEl.contentWindow || !freelanceVaultOrigin) {
      reject(new Error("Vaultが読み込まれていません。先に読み込んでください。 / Vault is not loaded yet — load it first."));
      return;
    }
    const requestId = `${Date.now()}-${Math.random()}`;
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Vaultからの応答がタイムアウトしました。 / Timed out waiting for a response from the vault."));
    }, 30000);
    function onMessage(event) {
      if (event.origin !== freelanceVaultOrigin) return;
      const data = event.data || {};
      if (data.type !== "vault:githubPushResult" || data.requestId !== requestId) return;
      clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      if (data.ok) resolve(data.url);
      else reject(new Error(data.error || "unknown vault error"));
    }
    window.addEventListener("message", onMessage);
    freelanceVaultIframeEl.contentWindow.postMessage(
      { type: "vault:githubPush", requestId, ...pushArgs },
      freelanceVaultOrigin
    );
  });
}

if (freelanceGithubTokenFileBtn) {
  freelanceGithubTokenFileBtn.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,text/plain";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        freelanceGithubFileToken = (await file.text()).trim();
        freelanceRefreshGithubTokenStatus();
      } catch (err) {
        if (freelanceGithubTokenStatusEl) {
          freelanceGithubTokenStatusEl.textContent = `ファイルの読み込みに失敗しました / Failed to read file: ${err}`;
        }
      }
    });
    input.click();
  });
}

// ============================================================
// 2026-08-27汎用化: 元はfreelance GitHubトークン専用だった暗号化
// ヘルパーを汎用関数へ切り出し(`ow`プレフィックス)、Google検索API
// キー・AIプロバイダキーなど他の秘密情報でも使い回せるようにした
// (ユーザー指示「Google検索などのAPI KeyやID、AIなどのKeyやIDも
// 暗号化で安全に受け渡し出来るように」への対応)。ランダムな
// salt(PBKDF2用)・iv(AES-GCM用)を都度生成し、パスフレーズから
// Web Crypto APIでAES-GCM鍵を導出して暗号化する。パスフレーズ自体は
// どこにも保存しない(呼び出し側が毎回入力する前提)。
// ============================================================
async function owDeriveAesKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function owBytesToBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function owBase64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// `plaintext`(任意のUTF-8文字列——単一の値でも、複数の値をまとめた
// JSON文字列でも良い)を暗号化し、salt/iv/ciphertextをまとめた
// JSON文字列を返す(そのままlocalStorageへ保存できる)。
async function owEncryptSecret(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await owDeriveAesKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    salt: owBytesToBase64(salt),
    iv: owBytesToBase64(iv),
    ciphertext: owBytesToBase64(new Uint8Array(ciphertext)),
  });
}

async function owDecryptSecret(payloadJson, passphrase) {
  const payload = JSON.parse(payloadJson);
  const salt = owBase64ToBytes(payload.salt);
  const iv = owBase64ToBytes(payload.iv);
  const key = await owDeriveAesKey(passphrase, salt);
  const plainBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv }, key, owBase64ToBytes(payload.ciphertext)
  );
  return new TextDecoder().decode(plainBytes);
}

if (freelanceGithubSaveTokenBtn) {
  freelanceGithubSaveTokenBtn.addEventListener("click", async () => {
    const token = (freelanceGithubTokenEl?.value || "").trim();
    const passphrase = freelanceGithubPassphraseEl?.value || "";
    if (!token || !passphrase) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent =
          "トークンとパスフレーズの両方を入力してください。 / Please enter both a token and a passphrase.";
      }
      return;
    }
    try {
      const payload = await owEncryptSecret(token, passphrase);
      window.localStorage.setItem(FREELANCE_GITHUB_TOKEN_ENCRYPTED_LOCAL_KEY, payload);
      freelanceGithubUnlockedToken = token; // このセッションでは既に復号済み扱い
      if (freelanceGithubTokenEl) freelanceGithubTokenEl.value = "";
      if (freelanceGithubPassphraseEl) freelanceGithubPassphraseEl.value = "";
      freelanceRefreshGithubTokenStatus();
    } catch (err) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent = `暗号化に失敗しました / Encryption failed: ${err}`;
      }
    }
  });
}
if (freelanceGithubUnlockTokenBtn) {
  freelanceGithubUnlockTokenBtn.addEventListener("click", async () => {
    const passphrase = freelanceGithubPassphraseEl?.value || "";
    let payload;
    try {
      payload = window.localStorage.getItem(FREELANCE_GITHUB_TOKEN_ENCRYPTED_LOCAL_KEY);
    } catch {
      payload = null;
    }
    if (!payload) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent = "暗号化済みトークンがありません。先に保存してください。 / No encrypted token saved yet.";
      }
      return;
    }
    if (!passphrase) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent = "パスフレーズを入力してください。 / Please enter your passphrase.";
      }
      return;
    }
    try {
      freelanceGithubUnlockedToken = await owDecryptSecret(payload, passphrase);
      if (freelanceGithubPassphraseEl) freelanceGithubPassphraseEl.value = "";
      freelanceRefreshGithubTokenStatus();
    } catch (err) {
      freelanceGithubUnlockedToken = null;
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent =
          "復号に失敗しました(パスフレーズが違う可能性があります)。 / Decryption failed (wrong passphrase?).";
      }
    }
  });
}
if (freelanceGithubClearTokenBtn) {
  freelanceGithubClearTokenBtn.addEventListener("click", () => {
    try {
      window.localStorage.removeItem(FREELANCE_GITHUB_TOKEN_ENCRYPTED_LOCAL_KEY);
    } catch { /* ignore */ }
    freelanceGithubUnlockedToken = null;
    freelanceRefreshGithubTokenStatus();
  });
}

if (freelanceGithubSaveTokenPlainBtn) {
  freelanceGithubSaveTokenPlainBtn.addEventListener("click", () => {
    const token = (freelanceGithubTokenPlainEl?.value || "").trim();
    if (!token) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent = "トークンを入力してください。 / Please enter a token.";
      }
      return;
    }
    try {
      window.localStorage.setItem(FREELANCE_GITHUB_TOKEN_LOCAL_KEY, token);
      if (freelanceGithubTokenPlainEl) freelanceGithubTokenPlainEl.value = "";
      freelanceRefreshGithubTokenStatus();
    } catch (err) {
      if (freelanceGithubTokenStatusEl) {
        freelanceGithubTokenStatusEl.textContent = `保存に失敗しました / Failed to save: ${err}`;
      }
    }
  });
}
if (freelanceGithubClearTokenPlainBtn) {
  freelanceGithubClearTokenPlainBtn.addEventListener("click", () => {
    try {
      window.localStorage.removeItem(FREELANCE_GITHUB_TOKEN_LOCAL_KEY);
    } catch { /* ignore */ }
    freelanceRefreshGithubTokenStatus();
  });
}

if (freelanceCornerBtn && freelanceCornerModal) {
  freelanceCornerBtn.addEventListener("click", () => {
    freelancePopulateLanguageSelect();
    freelanceRenderSamples();
    freelanceUpdateGithubTokenModeSections();
    freelanceCornerModal.classList.remove("hidden");
  });
}
if (freelanceCornerClose && freelanceCornerModal) {
  freelanceCornerClose.addEventListener("click", () => {
    freelanceCornerModal.classList.add("hidden");
  });
  freelanceCornerModal.addEventListener("click", (e) => {
    if (e.target === freelanceCornerModal) freelanceCornerModal.classList.add("hidden");
  });
}

if (freelanceSearchOfficialBtn) {
  freelanceSearchOfficialBtn.addEventListener("click", () => {
    window.open(freelanceBuildOfficialSearchUrl(), "_blank", "noopener,noreferrer");
  });
}
if (freelanceCopyOfficialUrlBtn) {
  freelanceCopyOfficialUrlBtn.addEventListener("click", () => {
    freelanceCopyText(freelanceBuildOfficialSearchUrl(), null);
  });
}
if (freelanceSearchJobsBtn) {
  freelanceSearchJobsBtn.addEventListener("click", () => {
    window.open(freelanceBuildJobSearchUrl(), "_blank", "noopener,noreferrer");
  });
}
if (freelanceCopyJobsUrlBtn) {
  freelanceCopyJobsUrlBtn.addEventListener("click", () => {
    freelanceCopyText(freelanceBuildJobSearchUrl(), null);
  });
}

if (freelanceAskTeacherBtn) {
  freelanceAskTeacherBtn.addEventListener("click", () => {
    const lang = freelanceSelectedLanguage();
    const fw = (freelanceFrameworkInputEl?.value || "").trim();
    const notes = (freelanceJobNotesEl?.value || "").trim();
    if (!lang) {
      alert("言語を選択または入力してください。 / Please choose or type a language first.");
      return;
    }
    let question = `${lang}`;
    if (fw) question += ` + ${fw}`;
    question += " を使ったフリーランス案件について、学ぶべき基礎とレッスンの進め方を教えてください。";
    if (notes) question += `\n\n参考にしている案件メモ:\n${notes}`;
    if (inputEl && formEl) {
      inputEl.value = question;
      freelanceCornerModal?.classList.add("hidden");
      formEl.requestSubmit();
    }
  });
}

// --- GitHub連携(2026-08-26新設、トークンの受け渡し方法(①ファイル/
// ②暗号化/③平文)は上のセクションで実装済み。詳細な安全上の警告は
// index.htmlのモーダル内setup-honest参照) ---

// UTF-8文字列をGitHub Contents APIが要求するBase64へ変換する(単純な
// btoaはASCII前提でマルチバイト文字を扱えないため、TextEncoder経由)。
function freelanceUtf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// GitHub REST APIをブラウザから直接呼び、(1)リポジトリを新規作成し
// (2)指定ファイルを1件push(Contents API、コミット1件)する。
// トークンはこの関数の外(localStorage)から読むだけで、当アプリの
// サーバーへは一切送信しない(fetch先は常にapi.github.com)。
async function freelanceGithubCreateRepoAndPush() {
  const token = freelanceLoadGithubToken();
  const repoName = (freelanceGithubRepoNameEl?.value || "").trim();
  const isPrivate = !!freelanceGithubPrivateEl?.checked;
  const filePath = (freelanceGithubFilePathEl?.value || "README.md").trim() || "README.md";
  const fileContent = freelanceGithubFileContentEl?.value || "";
  const commitMessage = (freelanceGithubCommitMessageEl?.value || "Initial commit").trim() || "Initial commit";

  if (!token) throw new Error("GitHubトークンが未設定です。上の欄に入力して保存してください。 / No GitHub token saved yet.");
  if (!repoName) throw new Error("リポジトリ名を入力してください。 / Please enter a repository name.");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const createRes = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false }),
  });
  if (!createRes.ok) {
    const errBody = await createRes.text().catch(() => "");
    throw new Error(`リポジトリ作成に失敗しました(HTTP ${createRes.status}) / repo creation failed: ${errBody}`);
  }
  const repo = await createRes.json();
  const owner = repo.owner?.login;
  if (!owner) throw new Error("GitHub APIのレスポンスにowner情報がありませんでした。 / GitHub API response had no owner info.");

  const putRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/contents/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: commitMessage,
        content: freelanceUtf8ToBase64(fileContent),
      }),
    }
  );
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => "");
    throw new Error(`ファイルpushに失敗しました(HTTP ${putRes.status}) / file push failed: ${errBody}`);
  }

  return repo.html_url;
}

if (freelanceGithubPushBtn) {
  freelanceGithubPushBtn.addEventListener("click", async () => {
    if (freelanceGithubPushStatusEl) {
      freelanceGithubPushStatusEl.textContent = "処理中... / Working...";
    }
    freelanceGithubPushBtn.disabled = true;
    try {
      const mode = freelanceGithubTokenModeEl?.value || "file";
      const url = mode === "vault"
        ? await freelanceRequestVaultGithubPush({
            repoName: (freelanceGithubRepoNameEl?.value || "").trim(),
            isPrivate: !!freelanceGithubPrivateEl?.checked,
            filePath: (freelanceGithubFilePathEl?.value || "README.md").trim() || "README.md",
            fileContent: freelanceGithubFileContentEl?.value || "",
            commitMessage: (freelanceGithubCommitMessageEl?.value || "Initial commit").trim() || "Initial commit",
          })
        : await freelanceGithubCreateRepoAndPush();
      if (freelanceGithubPushStatusEl) {
        freelanceGithubPushStatusEl.innerHTML =
          `完了しました / Done: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      }
    } catch (err) {
      if (freelanceGithubPushStatusEl) {
        freelanceGithubPushStatusEl.textContent = `エラー / Error: ${err.message || err}`;
      }
    } finally {
      freelanceGithubPushBtn.disabled = false;
    }
  });
}
