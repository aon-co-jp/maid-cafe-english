"""Kokoro-82M(ONNX int8)の日本語音声合成ワーカー(open-english-serverが子プロセスとして常駐させる)。

役割: 日本語の読み(G2P: misaki[ja]+OpenJTalk)→音素→Kokoro ONNX推論→16bit PCM WAV。
HTTP・キュー・同時実行数の制御・タイムアウトは親(`src/kokoro_pool.rs`)が持つ。ここは1リクエストずつ処理するだけ。

プロトコル(標準入出力、1リクエスト1往復):
  入力  1行のJSON  {"id": 1, "text": "...", "voice": "jf_alpha", "speed": 1.0}
  出力  1行のJSON  {"id": 1, "ok": true, "len": N}\\n の直後に、WAV本体のN バイト
        失敗時        {"id": 1, "ok": false, "error": "..."}\\n
  起動直後に {"ready": true}\\n を1行出す(モデルの読み込みが済んだ合図)。
ライブラリがstdoutへ書いても壊れないよう、`print`はstderrへ向け、応答は元のstdoutのバッファへ書く。

使い方: python kokoro_worker.py <モデルのあるフォルダ>
  フォルダに kokoro-v1.0.int8.onnx と voices-v1.0.bin が必要。環境変数 KOKORO_THREADS(既定2)。
ライセンス: Kokoro-82Mの重みはApache-2.0(学習データの注記はモデルカード参照)。
"""
import io
import json
import os
import re
import struct
import sys
import wave

OUT = sys.stdout.buffer
sys.stdout = sys.stderr  # 以降の print / ライブラリの出力は stderr へ

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402
from misaki import ja  # noqa: E402

SAMPLE_RATE = 24000
GAP_SECONDS = 0.12  # 文と文の間の無音
MAX_PHONEME_CHARS = 380  # Kokoroの上限(510トークン)に余裕を持たせる


def split_sentences(text):
    """。！？と改行で文に分け、長すぎる文は読点でさらに分ける。"""
    out = []
    for s in re.split(r"(?<=[。！？!?\n])", text):
        s = s.strip()
        if s:
            out.append(s)
    return out


def phonemes_for(g2p, sentence):
    r = g2p(sentence)
    ph = r[0] if isinstance(r, tuple) else r
    return ph.strip()


def pieces(g2p, sentence):
    """1文を、音素列がMAX_PHONEME_CHARS以下になる断片(読点区切り)へ。"""
    ph = phonemes_for(g2p, sentence)
    if len(ph) <= MAX_PHONEME_CHARS:
        return [ph] if ph else []
    parts, cur = [], ""
    for chunk in re.split(r"(?<=[、,])", sentence):
        trial = cur + chunk
        if cur and len(phonemes_for(g2p, trial)) > MAX_PHONEME_CHARS:
            parts.append(cur)
            cur = chunk
        else:
            cur = trial
    if cur:
        parts.append(cur)
    result = []
    for p in parts:
        q = phonemes_for(g2p, p)
        result.append(q[:MAX_PHONEME_CHARS] if q else "")  # 句読点なしで長い場合は切り詰める
    return [x for x in result if x]


def to_wav(samples):
    pcm = np.clip(samples, -1.0, 1.0)
    pcm = (pcm * 32767.0).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def main():
    model_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    threads = int(os.environ.get("KOKORO_THREADS", "2"))
    so = ort.SessionOptions()
    so.intra_op_num_threads = threads
    sess = ort.InferenceSession(
        os.path.join(model_dir, "kokoro-v1.0.int8.onnx"), sess_options=so, providers=["CPUExecutionProvider"]
    )
    kokoro = Kokoro.from_session(sess, os.path.join(model_dir, "voices-v1.0.bin"))
    g2p = ja.JAG2P()
    # ウォームアップ(最初の1回は遅いので、準備完了の前に済ませる)
    kokoro.create("konnitʃiβa", voice="jf_alpha", speed=1.0, lang="ja", is_phonemes=True)
    OUT.write(b'{"ready": true}\n')
    OUT.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            text = str(req["text"])
            voice = str(req.get("voice", "jf_alpha"))
            speed = float(req.get("speed", 1.0))
            speed = min(max(speed, 0.5), 2.0)
            gap = np.zeros(int(SAMPLE_RATE * GAP_SECONDS), dtype=np.float32)
            chunks = []
            for sentence in split_sentences(text):
                for ph in pieces(g2p, sentence):
                    audio, _sr = kokoro.create(ph, voice=voice, speed=speed, lang="ja", is_phonemes=True)
                    chunks.append(np.asarray(audio, dtype=np.float32))
                    chunks.append(gap)
            if not chunks:
                raise ValueError("no speakable text")
            wav = to_wav(np.concatenate(chunks[:-1]))
            OUT.write(json.dumps({"id": rid, "ok": True, "len": len(wav)}).encode() + b"\n")
            OUT.write(wav)
            OUT.flush()
        except Exception as e:  # noqa: BLE001 - どんな失敗も親へ返し、ワーカーは生き続ける
            OUT.write(json.dumps({"id": rid, "ok": False, "error": f"{type(e).__name__}: {e}"}).encode() + b"\n")
            OUT.flush()


if __name__ == "__main__":
    main()
