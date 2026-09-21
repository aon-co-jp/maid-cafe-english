import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// バージョンの正本は web/version.json(BUILD.md 参照)。
// ここから versionName を読み、versionCode を major*10000+minor*100+patch で導出する。
// `rootProject.projectDir` = mobile/android なので web/version.json は ../../web/version.json。
val clientVersionName: String = run {
    val vf = File(rootProject.projectDir, "../../web/version.json")
    if (vf.exists()) {
        Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(vf.readText())?.groupValues?.getOrNull(1)
    } else null
} ?: "0.0.0"

val clientVersionCode: Int = run {
    val parts = clientVersionName.split(".", "-").mapNotNull { it.toIntOrNull() }
    val maj = parts.getOrElse(0) { 0 }
    val min = parts.getOrElse(1) { 0 }
    val pat = parts.getOrElse(2) { 0 }
    (maj * 10000 + min * 100 + pat).coerceAtLeast(1)
}

android {
    namespace = "tokyo.runo.openenglish"
    compileSdk = 35
    // NNAPI加速器の列挙(src/main/cpp/nnapi_probe.c)用。NDK/CMakeはAGPが未導入なら自動取得する。
    ndkVersion = "27.1.12297006"
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    defaultConfig {
        applicationId = "tokyo.runo.openenglish"
        minSdk = 24
        targetSdk = 35
        versionCode = clientVersionCode
        versionName = clientVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // 2026-08-11追加: 単体動作版(PC/Linux WEBサーバー不要)への対応。
        // 実機のスマホ/タブレットはarm64-v8aが主流、x86_64はエミュレータ
        // 検証用(open-web-server/dream-osの既存パターンと同じ)。
        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }
    }

    // フォームファクタ別ビルド(BUILD.md「mobile/・tablet/」節)。
    // 共通コードは src/main/、差分は src/phone/ src/tablet/。
    flavorDimensions += "formfactor"
    productFlavors {
        create("phone") {
            dimension = "formfactor"
        }
        create("tablet") {
            dimension = "formfactor"
            // タブレット版は別アプリとして併存できるよう applicationId を分ける。
            applicationIdSuffix = ".tablet"
            versionNameSuffix = "-tablet"
        }
    }

    // リリース署名(2026-09-11追加、BUILD.md TODO対応)。CI
    // (open-english/.github/workflows/release.yml の build-android ジョブ)は
    // ANDROID_KEYSTORE_PATH 等の環境変数をエクスポートしてから
    // `assemble*Release` を呼ぶ。ローカル/PR ビルド等でこれらが未設定の
    // 場合は debug 署名へフォールバックする(assemble*Release がビルド
    // 不能にならないようにするための開発時の便宜——ストア配布はしない
    // 前提〈MainActivity.kt の既存の正直な開示のとおり〉なので、
    // 未署名で困ることはない)。
    val releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (releaseKeystorePath != null) {
            create("release") {
                storeFile = file(releaseKeystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseKeystorePath != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    // ネイティブライブラリ(open-english-server)をProcessBuilderで実
    // ファイルパスとして起動する必要があるため、旧来通りインストール時に
    // nativeLibraryDir配下へ展開される動作を明示的に強制する
    // (open-web-server/dream-os Android版と同じ既知の対処)。
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // 2026-08-19追加(ユーザー指示「NNAPI経由でNPU/GPUへ軽量な数値計算を
    // オフロードする最小実装を試みる」への対応、`PhoneAccelWorker.kt`
    // 参照)。TensorFlow Lite + NNAPI Delegateのみを追加(フルの
    // TensorFlow本体は含まない、モデルは同梱していない——ベクトル内積/
    // コサイン類似度程度の軽量計算をNNAPI経由で試すための最小依存)。
    // ビルドが通らない・実機でNNAPIが使えない場合は、コード側が
    // 自動的にCPU(Kotlin標準FloatArray計算)へフォールバックする設計
    // (`PhoneAccelWorker.kt`のコメント参照、NPU活用を偽らない)。
    implementation("org.tensorflow:tensorflow-lite:2.16.1")
    // 2026-09-21追加: NNAPI用の小さなTFLiteモデルを実行時に組み立てるため(`NnapiVectorKernel.kt`)。
    implementation("com.google.flatbuffers:flatbuffers-java:23.5.26")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    // NnApiDelegateクラス自体は`tensorflow-lite`本体に含まれるため
    // `tensorflow-lite-support`は不要(重複namespace警告を避けるため
    // 追加しなかった)。
}

// 2026-09-14追加: `assets/webroot/`(APKへ同梱される静的アセット)が
// `../../web/`(正本、PC/デモ版と共有)から手動cpでしか同期されておらず、
// 同期を忘れたまま`web/`側だけ更新してビルドすると、古いWebコンテンツが
// 実機に配信され続ける実害のあるバグを引き起こしていた(2026-09-14実機
// 検証で、`web/app.js`の修正がAndroid版に一切反映されていない状態を
// 確認して特定)。ビルドのたびに自動でコピーし、手動同期を不要にする。
val syncWebrootFromWeb by tasks.registering(Copy::class) {
    val webDir = File(rootProject.projectDir, "../../web")
    from(webDir) {
        exclude("README.md")
    }
    into(File(projectDir, "src/main/assets/webroot"))
}

tasks.named("preBuild") {
    dependsOn(syncWebrootFromWeb)
}
