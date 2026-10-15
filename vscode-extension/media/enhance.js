/*
 * open-english Companion — in-webview audio enhancement (Web Audio API).
 * open-english Companion — Webview内の音声強調(Web Audio API)。
 *
 * Honest scope / 正直な範囲: this is classic real-time DSP (filters, EQ, a noise gate and a
 * compressor/limiter), NOT AI denoising. It lowers steady low-level background noise *between*
 * phrases and makes speech clearer and more even; it cannot remove noise that overlaps the voice.
 * For AI-based quality enhancement use the "Enhance Audio Quality" command (local open-audio-sr).
 * 古典的なリアルタイムDSP(フィルタ・EQ・ノイズゲート・コンプレッサ/リミッタ)であり、AIによるノイズ除去ではない。
 * 発話の「間」の一定の小さな背景ノイズを下げ、声を明瞭・均一にするもので、声に重なったノイズは除けない。
 * AIによる高音質化は「音声を高音質化する」コマンド(ローカルのopen-audio-sr)を使う。
 *
 * No VS Code API is used here, so the same file is unit-checked in a plain browser.
 */
(function (root) {
  'use strict';

  // Which stages each preset enables. / プリセットごとに有効にする段。
  var PRESETS = {
    off: { hpf: false, hum: false, eq: false, gate: false, comp: false },
    clarity: { hpf: true, hum: false, eq: true, gate: false, comp: true },
    noise: { hpf: true, hum: true, eq: false, gate: true, comp: true },
    both: { hpf: true, hum: true, eq: true, gate: true, comp: true },
  };

  var GATE_FLOOR_DB = -18; // how far the gate lowers a quiet passage (an expander, not a mute)
  var GATE_HOLD_MS = 140; // keep the gate open this long after the voice drops below the threshold
  var LOOKAHEAD_S = 0.02; // delay on the audio path so the gate is open before a word starts
  var SILENCE_SECONDS = 4; // exact-zero output while playing this long => the source is silenced

  function dbToLin(db) {
    return Math.pow(10, db / 20);
  }

  function biquad(ctx, type, freq, q, gainDb) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    if (gainDb !== undefined) f.gain.value = gainDb;
    return f;
  }

  /**
   * Build the chain between `source` and `destination`.
   * @param {AudioContext} ctx
   * @param {AudioNode} source       e.g. ctx.createMediaElementSource(audioEl)
   * @param {AudioNode} destination  e.g. ctx.destination
   * @param {{preset?:string, gateThresholdDb?:number}} [opts]
   */
  function create(ctx, source, destination, opts) {
    opts = opts || {};
    var preset = PRESETS[opts.preset] ? opts.preset : 'off';
    var gateThresholdDb = typeof opts.gateThresholdDb === 'number' ? opts.gateThresholdDb : -50;

    var hpf = biquad(ctx, 'highpass', 90, 0.707);
    var notch50 = biquad(ctx, 'notch', 50, 30);
    var notch60 = biquad(ctx, 'notch', 60, 30);
    var presence = biquad(ctx, 'peaking', 2800, 1.0, 2.5);
    var air = biquad(ctx, 'highshelf', 7000, 0.707, 1.5);

    // Level detector for the gate: taps the signal *after* the high-pass so rumble can't open it.
    var detector = ctx.createAnalyser();
    detector.fftSize = 1024;
    var lookahead = ctx.createDelay(0.1);
    lookahead.delayTime.value = LOOKAHEAD_S;
    var gateGain = ctx.createGain();

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    // Chrome's DynamicsCompressorNode applies an automatic make-up gain (about +9.5 dB at these
    // settings), so switching a preset on made speech ~11 dB louder. Cancel most of it so the
    // loudness stays close to the original (measured in a browser: see CLAUDE.md in this folder).
    // ブラウザ内蔵のコンプレッサは自動で音量を上げる(この設定で約+9.5dB)ため、相殺して元の音量に近づける。
    var makeup = ctx.createGain();
    makeup.gain.value = dbToLin(-7);
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    // Watches the raw source: if it stays at exact digital zero while playing, it was silenced
    // (for example a cross-origin media element, which Web Audio mutes).
    var inputProbe = ctx.createAnalyser();
    inputProbe.fftSize = 2048;
    var probeBuf = new Float32Array(inputProbe.fftSize);
    var detBuf = new Float32Array(detector.fftSize);

    var lastOpenAt = 0;
    var gateOpen = true;
    var timer = null;
    var silentSince = null;
    var onSilenced = null;
    var isPlaying = function () {
      return true;
    };
    var disposed = false;

    function rewire() {
      var stages = PRESETS[preset];
      var nodes = [source];
      if (stages.hpf) nodes.push(hpf);
      if (stages.hum) nodes.push(notch50, notch60);
      // the gate's level tap sits here, after the high-pass / hum filters
      var tapAfter = nodes[nodes.length - 1];
      if (stages.eq) nodes.push(presence, air);
      if (stages.gate) nodes.push(lookahead, gateGain);
      if (stages.comp) nodes.push(comp, makeup, limiter);
      nodes.push(destination);

      var i;
      for (i = 0; i < nodes.length - 1; i++) {
        try {
          nodes[i].disconnect();
        } catch (e) {}
      }
      try {
        source.disconnect();
      } catch (e) {}
      for (i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      source.connect(inputProbe);
      if (stages.gate) tapAfter.connect(detector);
      gateGain.gain.cancelScheduledValues(ctx.currentTime);
      gateGain.gain.value = 1;
      gateOpen = true;
      lastOpenAt = performance.now();
    }

    function tick() {
      if (disposed) return;
      var stages = PRESETS[preset];
      if (stages.gate) {
        detector.getFloatTimeDomainData(detBuf);
        var sum = 0;
        for (var i = 0; i < detBuf.length; i++) sum += detBuf[i] * detBuf[i];
        var db = 20 * Math.log10(Math.sqrt(sum / detBuf.length) + 1e-9);
        var now = performance.now();
        if (db > gateThresholdDb) lastOpenAt = now;
        var open = now - lastOpenAt < GATE_HOLD_MS;
        if (open !== gateOpen) {
          gateOpen = open;
          gateGain.gain.setTargetAtTime(open ? 1 : dbToLin(GATE_FLOOR_DB), ctx.currentTime, open ? 0.005 : 0.12);
        }
      }
      // silenced-source watchdog
      inputProbe.getFloatTimeDomainData(probeBuf);
      var peak = 0;
      for (var j = 0; j < probeBuf.length; j++) {
        var a = Math.abs(probeBuf[j]);
        if (a > peak) peak = a;
      }
      if (preset !== 'off' && isPlaying() && peak === 0) {
        if (silentSince === null) silentSince = performance.now();
        else if (performance.now() - silentSince > SILENCE_SECONDS * 1000 && onSilenced) {
          var cb = onSilenced;
          onSilenced = null;
          cb();
        }
      } else {
        silentSince = null;
      }
    }

    rewire();
    timer = setInterval(tick, 20);

    return {
      PRESETS: PRESETS,
      setPreset: function (name) {
        if (!PRESETS[name]) return;
        preset = name;
        silentSince = null;
        rewire();
      },
      getPreset: function () {
        return preset;
      },
      setGateThresholdDb: function (db) {
        gateThresholdDb = Math.max(-80, Math.min(-20, Number(db)));
      },
      getGateThresholdDb: function () {
        return gateThresholdDb;
      },
      isGateOpen: function () {
        return gateOpen;
      },
      /** Called once when the source stays at digital zero while `isPlayingFn()` is true. */
      watchForSilence: function (isPlayingFn, callback) {
        isPlaying = isPlayingFn;
        onSilenced = callback;
      },
      dispose: function () {
        disposed = true;
        clearInterval(timer);
      },
    };
  }

  root.OpenEnglishEnhance = { create: create, PRESETS: PRESETS };
})(typeof window !== 'undefined' ? window : globalThis);
