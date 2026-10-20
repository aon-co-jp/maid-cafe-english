package tokyo.runo.openenglish

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleaseVersionTest {
    @Test
    fun comparesNumericallyNotAsStrings() {
        assertTrue(ReleaseVersion.isNewer("v0.8.14", "0.8.9"))
        assertTrue(ReleaseVersion.isNewer("v0.10.0", "0.9.9"))
        assertTrue(ReleaseVersion.isNewer("v1.0.0", "0.99.99"))
        assertFalse(ReleaseVersion.isNewer("v0.8.14", "0.8.14"))
        assertFalse(ReleaseVersion.isNewer("v0.8.13", "0.8.14"))
    }

    @Test
    fun toleratesSuffixesAndUnparseableParts() {
        assertEquals(Triple(0, 8, 14), ReleaseVersion.triple("v0.8.14-debug"))
        assertEquals(Triple(0, 0, 0), ReleaseVersion.triple("nightly"))
        assertFalse(ReleaseVersion.isNewer("nightly", "0.8.14"))
    }

    @Test
    fun newestOfTheTwoSourcesWinsAndTiesPreferTheFirst() {
        assertEquals(0, ReleaseVersion.indexOfNewest(listOf("v0.9.0", "v0.8.14")))
        assertEquals(1, ReleaseVersion.indexOfNewest(listOf("v0.8.14", "v0.9.0")))
        assertEquals(0, ReleaseVersion.indexOfNewest(listOf("v0.8.14", "v0.8.14")))
        assertEquals(0, ReleaseVersion.indexOfNewest(listOf("v0.8.14")))
        assertEquals(-1, ReleaseVersion.indexOfNewest(emptyList()))
    }
}
