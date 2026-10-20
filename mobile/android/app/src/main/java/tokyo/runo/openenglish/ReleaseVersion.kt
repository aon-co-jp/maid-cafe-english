package tokyo.runo.openenglish

/**
 * リリースのタグ文字列(`v0.8.14`・`0.8.14`・`v0.9.0-debug`等)の比較。
 *
 * 2026-10-21新設: 更新の確認先を「新しい`maid-cafe-english`+元の`open-english`の両方」にしたため
 * (ユーザー指示「自動更新の参照URLやディレクトリは、元も残して、新しい参照先と両方を一生ずっと残す」)、
 * 両方の最新リリースのうち**数値として新しい版**を選ぶ必要がある。従来の「文字列が違えば通知」では、
 * 片方が古いだけで(例: 入っている版より古い版を)誤って通知してしまう。
 */
object ReleaseVersion {
    /** `(major, minor, patch)`。数字として読めない部分は0(「不明なら新しいとは判断しない」安全側)。 */
    fun triple(raw: String): Triple<Int, Int, Int> {
        val parts = raw.trim().removePrefix("v").removePrefix("V").split('.', '-', '+')
        fun part(i: Int): Int = parts.getOrNull(i)?.takeWhile { it.isDigit() }?.toIntOrNull() ?: 0
        return Triple(part(0), part(1), part(2))
    }

    /** `remote`が`local`より新しければtrue(同じ・古いならfalse)。 */
    fun isNewer(remote: String, local: String): Boolean {
        val r = triple(remote)
        val l = triple(local)
        return when {
            r.first != l.first -> r.first > l.first
            r.second != l.second -> r.second > l.second
            else -> r.third > l.third
        }
    }

    /** 候補のタグのうち一番新しいものの添字。同じなら先頭(=新しい参照先)。空なら-1。 */
    fun indexOfNewest(tags: List<String>): Int {
        var best = -1
        for (i in tags.indices) {
            if (best == -1 || isNewer(tags[i], tags[best])) best = i
        }
        return best
    }
}
