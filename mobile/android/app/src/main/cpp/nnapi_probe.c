// NNAPIの加速器(デバイス)を列挙する(2026-09-21新設)。JavaにはこのAPIが無いため、NDKのC APIを
// dlopen/dlsym経由で呼ぶ(minSdk 24のままでも、API 29未満の端末で読み込みに失敗しないように)。
// 返すのはJSON文字列: {"available":bool,"api":..,"devices":[{"name":..,"type":..,"version":..,"feature_level":..}]}
// type: 1=other 2=cpu 3=gpu 4=accelerator(NPU/DSP等)。"nnapi-reference"はAndroid標準のCPU参照実装。
#include <jni.h>
#include <dlfcn.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>

typedef struct ANeuralNetworksDevice ANeuralNetworksDevice;
typedef int (*get_count_t)(uint32_t *);
typedef int (*get_dev_t)(uint32_t, ANeuralNetworksDevice **);
typedef int (*get_name_t)(const ANeuralNetworksDevice *, const char **);
typedef int (*get_type_t)(const ANeuralNetworksDevice *, int32_t *);
typedef int (*get_ver_t)(const ANeuralNetworksDevice *, const char **);
typedef int (*get_feat_t)(const ANeuralNetworksDevice *, int64_t *);

static void append_escaped(char *out, size_t cap, const char *s) {
    size_t n = strlen(out);
    for (; *s && n + 3 < cap; s++) {
        if (*s == '"' || *s == '\\') out[n++] = '\\';
        if ((unsigned char)*s >= 0x20) out[n++] = *s;
    }
    out[n] = 0;
}

JNIEXPORT jstring JNICALL
Java_tokyo_runo_openenglish_NnapiProbe_devicesJson(JNIEnv *env, jclass clazz) {
    (void)clazz;
    char buf[8192];
    buf[0] = 0;
    void *h = dlopen("libneuralnetworks.so", RTLD_NOW);
    if (!h) {
        snprintf(buf, sizeof buf, "{\"available\":false,\"error\":\"libneuralnetworks.so not loadable\",\"devices\":[]}");
        return (*env)->NewStringUTF(env, buf);
    }
    get_count_t get_count = (get_count_t)dlsym(h, "ANeuralNetworks_getDeviceCount");
    get_dev_t get_dev = (get_dev_t)dlsym(h, "ANeuralNetworks_getDevice");
    get_name_t get_name = (get_name_t)dlsym(h, "ANeuralNetworksDevice_getName");
    get_type_t get_type = (get_type_t)dlsym(h, "ANeuralNetworksDevice_getType");
    get_ver_t get_ver = (get_ver_t)dlsym(h, "ANeuralNetworksDevice_getVersion");
    get_feat_t get_feat = (get_feat_t)dlsym(h, "ANeuralNetworksDevice_getFeatureLevel");
    if (!get_count || !get_dev || !get_name) {
        snprintf(buf, sizeof buf, "{\"available\":false,\"error\":\"device enumeration API missing (needs Android 10+)\",\"devices\":[]}");
        return (*env)->NewStringUTF(env, buf);
    }
    uint32_t n = 0;
    get_count(&n);
    strcat(buf, "{\"available\":true,\"devices\":[");
    for (uint32_t i = 0; i < n; i++) {
        ANeuralNetworksDevice *d = NULL;
        if (get_dev(i, &d) != 0 || !d) continue;
        const char *name = "?", *ver = "";
        int32_t type = 0;
        int64_t feat = 0;
        get_name(d, &name);
        if (get_type) get_type(d, &type);
        if (get_ver) get_ver(d, &ver);
        if (get_feat) get_feat(d, &feat);
        if (i) strcat(buf, ",");
        strcat(buf, "{\"name\":\"");
        append_escaped(buf, sizeof buf, name ? name : "?");
        strcat(buf, "\",\"version\":\"");
        append_escaped(buf, sizeof buf, ver ? ver : "");
        char tail[96];
        snprintf(tail, sizeof tail, "\",\"type\":%d,\"feature_level\":%lld}", (int)type, (long long)feat);
        strcat(buf, tail);
    }
    strcat(buf, "]}");
    return (*env)->NewStringUTF(env, buf);
}
