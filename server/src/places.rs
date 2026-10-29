//! 世界の首都・主な都市・有名な観光名所の「索引用の名簿」(2026-10-29新設)。
//!
//! ニュースを保存するとき、本文(見出し・要約)に、ここにある地名が出てくれば、自動で「地名のキー」
//! (`place:paris` など)を付ける。質問のときは、同じ名簿で地名を見つけ、そのキーで記事を引く。
//! 日本語名と英語名を対応させてあるので、「パリ」と聞いても、英語の記事(Paris)が見つかる。
//!
//! 載せるのは、名前・種類・所在(国や都市)という、誰でも確認できる事実だけ。歴史・人口・入場料のような、
//! 変わる数字や確認が要る内容は載せない(それはニュース記事や、検索の結果で確認する)。

pub struct Place {
    pub ja: &'static str,
    pub en: &'static str,
    /// "capital"(首都) / "city"(主な都市) / "landmark"(名所)
    pub kind: &'static str,
    pub loc_ja: &'static str,
    pub loc_en: &'static str,
}

const fn p(ja: &'static str, en: &'static str, kind: &'static str, loc_ja: &'static str, loc_en: &'static str) -> Place {
    Place { ja, en, kind, loc_ja, loc_en }
}

pub const PLACES: &[Place] = &[
    // 首都
    p("東京", "Tokyo", "capital", "日本", "Japan"),
    p("北京", "Beijing", "capital", "中国", "China"),
    p("ソウル", "Seoul", "capital", "韓国", "South Korea"),
    p("平壌", "Pyongyang", "capital", "北朝鮮", "North Korea"),
    p("台北", "Taipei", "city", "台湾", "Taiwan"),
    p("バンコク", "Bangkok", "capital", "タイ", "Thailand"),
    p("ハノイ", "Hanoi", "capital", "ベトナム", "Vietnam"),
    p("マニラ", "Manila", "capital", "フィリピン", "the Philippines"),
    p("ジャカルタ", "Jakarta", "capital", "インドネシア", "Indonesia"),
    p("シンガポール", "Singapore", "capital", "シンガポール", "Singapore"),
    p("クアラルンプール", "Kuala Lumpur", "capital", "マレーシア", "Malaysia"),
    p("ニューデリー", "New Delhi", "capital", "インド", "India"),
    p("イスラマバード", "Islamabad", "capital", "パキスタン", "Pakistan"),
    p("ダッカ", "Dhaka", "capital", "バングラデシュ", "Bangladesh"),
    p("カトマンズ", "Kathmandu", "capital", "ネパール", "Nepal"),
    p("テヘラン", "Tehran", "capital", "イラン", "Iran"),
    p("バグダッド", "Baghdad", "capital", "イラク", "Iraq"),
    p("リヤド", "Riyadh", "capital", "サウジアラビア", "Saudi Arabia"),
    p("アブダビ", "Abu Dhabi", "capital", "アラブ首長国連邦", "the United Arab Emirates"),
    p("ドーハ", "Doha", "capital", "カタール", "Qatar"),
    p("アンカラ", "Ankara", "capital", "トルコ", "Turkey"),
    p("キーウ", "Kyiv", "capital", "ウクライナ", "Ukraine"),
    p("モスクワ", "Moscow", "capital", "ロシア", "Russia"),
    p("ワルシャワ", "Warsaw", "capital", "ポーランド", "Poland"),
    p("ベルリン", "Berlin", "capital", "ドイツ", "Germany"),
    p("パリ", "Paris", "capital", "フランス", "France"),
    p("ロンドン", "London", "capital", "イギリス", "the United Kingdom"),
    p("ローマ", "Rome", "capital", "イタリア", "Italy"),
    p("マドリード", "Madrid", "capital", "スペイン", "Spain"),
    p("リスボン", "Lisbon", "capital", "ポルトガル", "Portugal"),
    p("ブリュッセル", "Brussels", "capital", "ベルギー", "Belgium"),
    p("アムステルダム", "Amsterdam", "capital", "オランダ", "the Netherlands"),
    p("ウィーン", "Vienna", "capital", "オーストリア", "Austria"),
    p("ベルン", "Bern", "capital", "スイス", "Switzerland"),
    p("アテネ", "Athens", "capital", "ギリシャ", "Greece"),
    p("ストックホルム", "Stockholm", "capital", "スウェーデン", "Sweden"),
    p("オスロ", "Oslo", "capital", "ノルウェー", "Norway"),
    p("コペンハーゲン", "Copenhagen", "capital", "デンマーク", "Denmark"),
    p("ヘルシンキ", "Helsinki", "capital", "フィンランド", "Finland"),
    p("プラハ", "Prague", "capital", "チェコ", "Czechia"),
    p("ブダペスト", "Budapest", "capital", "ハンガリー", "Hungary"),
    p("ワシントン", "Washington", "capital", "アメリカ", "the United States"),
    p("オタワ", "Ottawa", "capital", "カナダ", "Canada"),
    p("メキシコシティ", "Mexico City", "capital", "メキシコ", "Mexico"),
    p("ブラジリア", "Brasilia", "capital", "ブラジル", "Brazil"),
    p("ブエノスアイレス", "Buenos Aires", "capital", "アルゼンチン", "Argentina"),
    p("サンティアゴ", "Santiago", "capital", "チリ", "Chile"),
    p("ボゴタ", "Bogota", "capital", "コロンビア", "Colombia"),
    p("キャンベラ", "Canberra", "capital", "オーストラリア", "Australia"),
    p("ウェリントン", "Wellington", "capital", "ニュージーランド", "New Zealand"),
    p("カイロ", "Cairo", "capital", "エジプト", "Egypt"),
    p("ナイロビ", "Nairobi", "capital", "ケニア", "Kenya"),
    p("アディスアベバ", "Addis Ababa", "capital", "エチオピア", "Ethiopia"),
    p("アブジャ", "Abuja", "capital", "ナイジェリア", "Nigeria"),
    // 主な都市
    p("ニューヨーク", "New York", "city", "アメリカ", "the United States"),
    p("ロサンゼルス", "Los Angeles", "city", "アメリカ", "the United States"),
    p("サンフランシスコ", "San Francisco", "city", "アメリカ", "the United States"),
    p("シカゴ", "Chicago", "city", "アメリカ", "the United States"),
    p("トロント", "Toronto", "city", "カナダ", "Canada"),
    p("シドニー", "Sydney", "city", "オーストラリア", "Australia"),
    p("メルボルン", "Melbourne", "city", "オーストラリア", "Australia"),
    p("上海", "Shanghai", "city", "中国", "China"),
    p("香港", "Hong Kong", "city", "中国", "China"),
    p("大阪", "Osaka", "city", "日本", "Japan"),
    p("京都", "Kyoto", "city", "日本", "Japan"),
    p("横浜", "Yokohama", "city", "日本", "Japan"),
    p("名古屋", "Nagoya", "city", "日本", "Japan"),
    p("札幌", "Sapporo", "city", "日本", "Japan"),
    p("福岡", "Fukuoka", "city", "日本", "Japan"),
    p("広島", "Hiroshima", "city", "日本", "Japan"),
    p("長崎", "Nagasaki", "city", "日本", "Japan"),
    p("イスタンブール", "Istanbul", "city", "トルコ", "Turkey"),
    p("ドバイ", "Dubai", "city", "アラブ首長国連邦", "the United Arab Emirates"),
    p("ムンバイ", "Mumbai", "city", "インド", "India"),
    p("バルセロナ", "Barcelona", "city", "スペイン", "Spain"),
    p("ミラノ", "Milan", "city", "イタリア", "Italy"),
    p("ベネチア", "Venice", "city", "イタリア", "Italy"),
    p("サンパウロ", "Sao Paulo", "city", "ブラジル", "Brazil"),
    p("リオデジャネイロ", "Rio de Janeiro", "city", "ブラジル", "Brazil"),
    p("テルアビブ", "Tel Aviv", "city", "イスラエル", "Israel"),
    p("エルサレム", "Jerusalem", "city", "中東", "the Middle East"),
    // 名所
    p("エッフェル塔", "Eiffel Tower", "landmark", "フランス・パリ", "Paris, France"),
    p("ルーブル美術館", "Louvre", "landmark", "フランス・パリ", "Paris, France"),
    p("自由の女神", "Statue of Liberty", "landmark", "アメリカ・ニューヨーク", "New York, the United States"),
    p("ビッグ・ベン", "Big Ben", "landmark", "イギリス・ロンドン", "London, the United Kingdom"),
    p("バッキンガム宮殿", "Buckingham Palace", "landmark", "イギリス・ロンドン", "London, the United Kingdom"),
    p("コロッセオ", "Colosseum", "landmark", "イタリア・ローマ", "Rome, Italy"),
    p("ピサの斜塔", "Leaning Tower of Pisa", "landmark", "イタリア・ピサ", "Pisa, Italy"),
    p("万里の長城", "Great Wall", "landmark", "中国", "China"),
    p("紫禁城", "Forbidden City", "landmark", "中国・北京", "Beijing, China"),
    p("タージ・マハル", "Taj Mahal", "landmark", "インド・アグラ", "Agra, India"),
    p("マチュピチュ", "Machu Picchu", "landmark", "ペルー", "Peru"),
    p("ピラミッド", "Pyramids", "landmark", "エジプト・ギザ", "Giza, Egypt"),
    p("アンコールワット", "Angkor Wat", "landmark", "カンボジア", "Cambodia"),
    p("サグラダ・ファミリア", "Sagrada Familia", "landmark", "スペイン・バルセロナ", "Barcelona, Spain"),
    p("アクロポリス", "Acropolis", "landmark", "ギリシャ・アテネ", "Athens, Greece"),
    p("ブルジュ・ハリファ", "Burj Khalifa", "landmark", "アラブ首長国連邦・ドバイ", "Dubai, the United Arab Emirates"),
    p("ペトラ", "Petra", "landmark", "ヨルダン", "Jordan"),
    p("グランドキャニオン", "Grand Canyon", "landmark", "アメリカ", "the United States"),
    p("ナイアガラの滝", "Niagara Falls", "landmark", "アメリカ・カナダ国境", "the US-Canada border"),
    p("ゴールデンゲートブリッジ", "Golden Gate Bridge", "landmark", "アメリカ・サンフランシスコ", "San Francisco, the United States"),
    p("シドニー・オペラハウス", "Sydney Opera House", "landmark", "オーストラリア・シドニー", "Sydney, Australia"),
    p("コルコバードのキリスト像", "Christ the Redeemer", "landmark", "ブラジル・リオデジャネイロ", "Rio de Janeiro, Brazil"),
    p("アヤソフィア", "Hagia Sophia", "landmark", "トルコ・イスタンブール", "Istanbul, Turkey"),
    p("ブランデンブルク門", "Brandenburg Gate", "landmark", "ドイツ・ベルリン", "Berlin, Germany"),
    p("富士山", "Mount Fuji", "landmark", "日本", "Japan"),
    p("東京タワー", "Tokyo Tower", "landmark", "日本・東京", "Tokyo, Japan"),
    p("東京スカイツリー", "Tokyo Skytree", "landmark", "日本・東京", "Tokyo, Japan"),
    p("浅草寺", "Senso-ji", "landmark", "日本・東京", "Tokyo, Japan"),
    p("清水寺", "Kiyomizu-dera", "landmark", "日本・京都", "Kyoto, Japan"),
    p("金閣寺", "Kinkaku-ji", "landmark", "日本・京都", "Kyoto, Japan"),
    p("伏見稲荷大社", "Fushimi Inari", "landmark", "日本・京都", "Kyoto, Japan"),
    p("姫路城", "Himeji Castle", "landmark", "日本・兵庫", "Hyogo, Japan"),
    p("厳島神社", "Itsukushima", "landmark", "日本・広島", "Hiroshima, Japan"),
];

fn is_katakana(c: char) -> bool {
    matches!(c as u32, 0x30A0..=0x30FF) || c == 'ー'
}

/// 英名を、英数字の切れ目(単語の境界)で探す。("Rome" が "Jerome" に当たらないように)
fn contains_word(hay_lower: &str, needle_lower: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = hay_lower[from..].find(needle_lower) {
        let s = from + pos;
        let e = s + needle_lower.len();
        let before_ok = hay_lower[..s].chars().next_back().map_or(true, |c| !c.is_alphanumeric());
        let after_ok = hay_lower[e..].chars().next().map_or(true, |c| !c.is_alphanumeric());
        if before_ok && after_ok {
            return true;
        }
        from = s + needle_lower.chars().next().map_or(1, |c| c.len_utf8());
        if from >= hay_lower.len() {
            break;
        }
    }
    false
}

/// 日本語名を探す。カタカナの名前は、前後がカタカナのとき(別の言葉の一部)は除く。
fn contains_ja(hay: &str, name: &str) -> bool {
    let kata_head = name.chars().next().map_or(false, is_katakana);
    let kata_tail = name.chars().next_back().map_or(false, is_katakana);
    let mut from = 0;
    while let Some(pos) = hay[from..].find(name) {
        let s = from + pos;
        let e = s + name.len();
        let before_ok = !kata_head || hay[..s].chars().next_back().map_or(true, |c| !is_katakana(c));
        let after_ok = !kata_tail || hay[e..].chars().next().map_or(true, |c| !is_katakana(c));
        if before_ok && after_ok {
            return true;
        }
        from = s + name.chars().next().map_or(1, |c| c.len_utf8());
        if from >= hay.len() {
            break;
        }
    }
    false
}

/// 文章の中にある地名(日本語名・英名のどちらでも)を、名簿から探す。
pub fn find(text: &str) -> Vec<&'static Place> {
    let lower = text.to_lowercase();
    PLACES.iter().filter(|pl| contains_ja(text, pl.ja) || contains_word(&lower, &pl.en.to_lowercase())).collect()
}

/// 索引用のキー(`place:paris`)。
pub fn key(pl: &Place) -> String {
    format!("place:{}", pl.en.to_lowercase())
}

/// 質問に地名があれば、地名カード(日本語, 英語)を返す。
pub fn card(q: &str) -> Option<(String, String)> {
    let found = find(q);
    if found.is_empty() {
        return None;
    }
    let mut ja = String::from("📍 地名の索引(名簿にある、確認できる事実だけです)");
    let mut en = String::from("📍 Place index (only plainly verifiable facts)");
    for pl in found.iter().take(4) {
        let (kj, ke) = match pl.kind {
            "capital" => ("の首都", "the capital of"),
            "landmark" => ("にある名所", "a landmark in"),
            _ => ("の主な都市", "a major city in"),
        };
        match pl.kind {
            "capital" => {
                ja.push_str(&format!("\n・{}({}): {}{}", pl.ja, pl.en, pl.loc_ja, kj));
                en.push_str(&format!("\n- {} ({}): {} {}", pl.en, pl.ja, ke, pl.loc_en));
            }
            "landmark" => {
                ja.push_str(&format!("\n・{}({}): {}{}", pl.ja, pl.en, pl.loc_ja, kj));
                en.push_str(&format!("\n- {} ({}): {} {}", pl.en, pl.ja, ke, pl.loc_en));
            }
            _ => {
                ja.push_str(&format!("\n・{}({}): {}{}", pl.ja, pl.en, pl.loc_ja, kj));
                en.push_str(&format!("\n- {} ({}): {} {}", pl.en, pl.ja, ke, pl.loc_en));
            }
        }
    }
    Some((ja, en))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_ja_and_en_names_with_boundaries() {
        assert!(find("パリの観光名所を教えて").iter().any(|p| p.en == "Paris"));
        assert!(find("Visit Paris in spring").iter().any(|p| p.ja == "パリ"));
        assert!(find("Jerome said hello").is_empty()); // Rome は Jerome の一部
        assert!(find("パリティ検査").is_empty()); // パリ は別のカタカナ語の一部
        assert!(find("京都のお寺").iter().any(|p| p.en == "Kyoto"));
        assert!(find("東京タワー").iter().any(|p| p.en == "Tokyo Tower"));
    }

    #[test]
    fn card_describes_capital_city_and_landmark() {
        let (ja, en) = card("エッフェル塔").unwrap();
        assert!(ja.contains("フランス・パリ") && en.contains("Paris, France"));
        assert!(card("今日の天気").is_none());
    }
}
