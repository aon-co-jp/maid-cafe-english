import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AiTeacherVisualizer } from './aiTeacherVisualizer';

// Mostly a thin client: AI enhancement is forwarded to a locally running service (open-audio-sr)
// that the user starts and owns. The player additionally offers classic real-time DSP (filters,
// EQ, noise gate, compressor) inside the webview via the Web Audio API (media/enhance.js) — it is
// opt-in (default off) and is not AI denoising.
// 基本は薄いクライアント: AI高音質化は利用者自身が起動するローカルのopen-audio-srへ転送するだけ。
// プレーヤーは加えて、Webview内のWeb Audio API(media/enhance.js)による一般的なリアルタイムDSP
// (フィルタ・EQ・ノイズゲート・コンプレッサ)を任意(既定オフ)で提供する。AIノイズ除去ではない。

const AUDIO_SR_HOST = '127.0.0.1';
const AUDIO_SR_PORT = 4620;

let playerPanel: vscode.WebviewPanel | undefined;

const visualizer = new AiTeacherVisualizer();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('openEnglishCompanion.openPlayer', () => openPlayer(context)),
    vscode.commands.registerCommand('openEnglishCompanion.enhanceAudio', () => enhanceAudio(context)),
    vscode.commands.registerCommand('openEnglishCompanion.toggleAiTeacherView', toggleAiTeacherView),
    vscode.commands.registerCommand('openEnglishCompanion.announceAiTeacherEdit', announceAiTeacherEdit),
    vscode.commands.registerCommand('openEnglishCompanion.writeAsAiTeacher', writeAsAiTeacher),
    visualizer,
  );
}

export function deactivate(): void {
  visualizer.dispose();
}

function toggleAiTeacherView(): void {
  if (visualizer.isEnabled()) {
    visualizer.disable();
    void vscode.window.showInformationMessage(
      'AI Teacher view disabled. / AI先生ビュー(色分け表示)をオフにしました。',
    );
  } else {
    visualizer.enable();
    void vscode.window.showInformationMessage(
      'AI Teacher view enabled — blue = AI teacher, orange = student, dashed yellow = upcoming AI edit, green = editing now. / ' +
        'AI先生ビューをオンにしました — 青=AI先生、オレンジ=生徒、黄色破線=AI先生が編集予定、緑=今編集中。',
    );
  }
}

async function announceAiTeacherEdit(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  if (!visualizer.isEnabled()) {
    visualizer.enable();
  }
  const range = editor.selection.isEmpty
    ? editor.document.lineAt(editor.selection.active.line).range
    : new vscode.Range(editor.selection.start, editor.selection.end);
  visualizer.announce(editor, range);
}

async function writeAsAiTeacher(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const text = await vscode.window.showInputBox({
    prompt: 'Text for the AI teacher to write here / AI先生としてここに書き込むテキスト',
    placeHolder: 'e.g. a correction, a model answer, a hint / 例: 添削・模範解答・ヒント',
  });
  if (text === undefined) {
    return;
  }
  if (!visualizer.isEnabled()) {
    visualizer.enable();
  }
  const range = editor.selection.isEmpty
    ? new vscode.Range(editor.selection.active, editor.selection.active)
    : new vscode.Range(editor.selection.start, editor.selection.end);
  await visualizer.writeAsTeacher(editor, range, text);
}

async function openPlayer(context: vscode.ExtensionContext, fileToLoad?: vscode.Uri): Promise<void> {
  const uri =
    fileToLoad ??
    (
      await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Play / 再生',
        filters: { Audio: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] },
      })
    )?.[0];
  if (!uri) {
    return;
  }

  // A panel's readable folders are fixed when it is created, so re-opening with a file from another
  // folder would fail silently if the old panel were reused. Always start a fresh one.
  // パネルの読み取り可能なフォルダは作成時に固定されるため、別フォルダの音声を開くときは作り直す。
  playerPanel?.dispose();
  playerPanel = vscode.window.createWebviewPanel(
    'openEnglishCompanionPlayer',
    'open-english Companion Player',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.dirname(uri.fsPath)), vscode.Uri.file(path.join(context.extensionPath, 'media'))],
    },
  );
  const thisPanel = playerPanel;
  thisPanel.onDidDispose(() => {
    if (playerPanel === thisPanel) {
      playerPanel = undefined;
    }
  });

  const audioSrc = playerPanel.webview.asWebviewUri(uri);
  playerPanel.title = path.basename(uri.fsPath);
  const enhanceJs = playerPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, "media", "enhance.js")));
  const nonce = crypto.randomBytes(16).toString("hex");
  playerPanel.webview.html = renderPlayerHtml(audioSrc.toString(), path.basename(uri.fsPath), enhanceJs.toString(), playerPanel.webview.cspSource, nonce);
}

function renderPlayerHtml(audioSrc: string, fileName: string, enhanceJsUri: string, cspSource: string, nonce: string): string {
  const escapedName = fileName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${cspSource} blob:; script-src ${cspSource} 'nonce-${nonce}'; style-src 'unsafe-inline';" />
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem; color: var(--vscode-foreground); }
  audio { width: 100%; margin-top: 0.5rem; }
  h2 { font-size: 1rem; word-break: break-all; }
  p.hint { opacity: 0.7; font-size: 0.85rem; }
  fieldset { border: 1px solid var(--vscode-panel-border); margin-top: 1rem; padding: 0.5rem 0.8rem; }
  label { display: block; margin: 0.4rem 0; }
  select, input[type=range] { margin-left: 0.5rem; }
  #status { margin-top: 0.4rem; font-size: 0.85rem; min-height: 1.2em; }
  .gate-on { color: var(--vscode-testing-iconPassed, #3c9); }
  .gate-low { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
  <h2>${escapedName}</h2>
  <audio id="player" controls autoplay src="${audioSrc}"></audio>
  <fieldset>
    <legend>Sound enhancement (real-time) / 音の強調(リアルタイム)</legend>
    <label>Preset / プリセット
      <select id="preset">
        <option value="off">Off (original) / オフ(元の音)</option>
        <option value="clarity">Clarity: low-cut + voice EQ + leveling / 明瞭化: 低域カット+声のEQ+音量の均一化</option>
        <option value="noise">Quiet background: hum filter + noise gate / 背景ノイズ低減: ハム除去+ノイズゲート</option>
        <option value="both">Clarity + quiet background / 明瞭化+背景ノイズ低減</option>
      </select>
    </label>
    <label>Noise gate threshold / ノイズゲートのしきい値: <span id="thrLabel">-50</span> dB
      <input id="thr" type="range" min="-80" max="-20" step="1" value="-50" />
    </label>
    <div id="status"></div>
    <p class="hint">
      Classic DSP (filters, EQ, gate, compressor) — it lowers steady background noise <em>between</em> phrases and makes speech clearer;
      it is not AI denoising and cannot remove noise that overlaps the voice. For AI quality enhancement use
      “Enhance Audio Quality” (local open-audio-sr). If the gate cuts word beginnings, lower the threshold.<br/>
      一般的なDSP(フィルタ・EQ・ゲート・コンプレッサ)で、発話の「間」の一定の背景ノイズを下げ、声を明瞭にします。
      AIによるノイズ除去ではなく、声に重なったノイズは除けません。AIによる高音質化は「音声を高音質化する」(ローカルのopen-audio-sr)を使ってください。
      語頭が切れるときはしきい値を下げてください。
    </p>
  </fieldset>
  <script nonce="${nonce}" src="${enhanceJsUri}"></script>
  <script nonce="${nonce}">
    (function () {
      var audio = document.getElementById('player');
      var presetSel = document.getElementById('preset');
      var thr = document.getElementById('thr');
      var thrLabel = document.getElementById('thrLabel');
      var statusEl = document.getElementById('status');
      var ctx = null, ctl = null, meterTimer = null;
      var src = audio.getAttribute('src');

      // A media element can be routed into Web Audio only once. If that ever leaves the sound muted
      // (the watchdog in enhance.js detects it), replace the element with a fresh one that plays the
      // original, un-routed sound, and keep the position. / 無音化された場合は、素の再生へ戻す。
      function recoverToPlainPlayback() {
        var t = audio.currentTime, wasPlaying = !audio.paused;
        if (meterTimer) clearInterval(meterTimer);
        if (ctl) ctl.dispose();
        var fresh = document.createElement('audio');
        fresh.id = 'player'; fresh.controls = true; fresh.src = src;
        audio.replaceWith(fresh);
        audio = fresh; ctx = null; ctl = null;
        fresh.addEventListener('loadedmetadata', function () {
          fresh.currentTime = t;
          if (wasPlaying) fresh.play();
        });
        presetSel.value = 'off';
        statusEl.textContent = 'Enhancement could not be applied to this file, so the original sound is playing. / この音声には強調を適用できなかったため、元の音で再生しています。';
      }

      function ensureChain() {
        if (ctl) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        var node = ctx.createMediaElementSource(audio);
        ctl = window.OpenEnglishEnhance.create(ctx, node, ctx.destination, { preset: 'off', gateThresholdDb: Number(thr.value) });
        ctl.watchForSilence(function () { return !audio.paused; }, recoverToPlainPlayback);
        meterTimer = setInterval(function () {
          if (!ctl || ctl.getPreset() === 'off') return;
          var p = ctl.getPreset();
          if (p === 'noise' || p === 'both') {
            statusEl.className = ctl.isGateOpen() ? 'gate-on' : 'gate-low';
            statusEl.textContent = ctl.isGateOpen()
              ? 'Gate: open (voice) / ゲート: 開(発話中)'
              : 'Gate: lowering background / ゲート: 背景ノイズを低減中';
          } else {
            statusEl.className = '';
            statusEl.textContent = 'Clarity on / 明瞭化オン';
          }
        }, 150);
      }

      presetSel.addEventListener('change', function () {
        if (presetSel.value === 'off' && !ctl) { statusEl.textContent = ''; return; }
        ensureChain();
        if (ctx.state === 'suspended') ctx.resume();
        ctl.setPreset(presetSel.value);
        if (presetSel.value === 'off') { statusEl.className = ''; statusEl.textContent = 'Original sound / 元の音で再生中'; }
      });
      thr.addEventListener('input', function () {
        thrLabel.textContent = thr.value;
        if (ctl) ctl.setGateThresholdDb(Number(thr.value));
      });
    })();
  </script>
</body>
</html>`;
}

async function enhanceAudio(context: vscode.ExtensionContext): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Enhance / 高音質化',
    filters: { Audio: ['wav', 'mp3', 'm4a', 'ogg', 'flac'] },
  });
  const uri = picked?.[0];
  if (!uri) {
    return;
  }

  const healthy = await checkAudioSrHealth();
  if (!healthy) {
    const openDocs = 'How to start it / 起動方法';
    const choice = await vscode.window.showWarningMessage(
      `open-audio-sr is not running at http://${AUDIO_SR_HOST}:${AUDIO_SR_PORT}. ` +
        `Start it locally first (cargo run --release in the open-audio-sr repo). / ` +
        `ローカルのopen-audio-sr(http://${AUDIO_SR_HOST}:${AUDIO_SR_PORT})が起動していません。` +
        `先にopen-audio-srリポジトリで "cargo run --release" を実行してください。`,
      openDocs,
    );
    if (choice === openDocs) {
      void vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/aon-co-jp/open-audio-sr#3-http%E3%82%B5%E3%83%BC%E3%83%93%E3%82%B9%E3%81%A8%E3%81%97%E3%81%A6%E4%BB%96%E3%83%97%E3%83%AD%E3%82%BB%E3%82%B9%E4%BB%96%E8%A8%80%E8%AA%9E%E3%81%8B%E3%82%89'),
      );
    }
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Enhancing audio via open-audio-sr / open-audio-srで高音質化中…',
      cancellable: false,
    },
    async () => {
      try {
        const inputBytes = await fs.promises.readFile(uri.fsPath);
        const outputBytes = await postSuperResolve(inputBytes);
        const parsed = path.parse(uri.fsPath);
        const outPath = path.join(parsed.dir, `${parsed.name}.enhanced.wav`);
        await fs.promises.writeFile(outPath, outputBytes);

        const openIt = 'Open in player / プレーヤーで開く';
        const result = await vscode.window.showInformationMessage(
          `Done: ${path.basename(outPath)} / 完了しました`,
          openIt,
        );
        if (result === openIt) {
          await openPlayer(context, vscode.Uri.file(outPath));
        }
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Enhancement failed / 高音質化に失敗しました: ${(err as Error).message}`,
        );
      }
    },
  );
}

function checkAudioSrHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: AUDIO_SR_HOST, port: AUDIO_SR_PORT, path: '/healthz', timeout: 1500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function postSuperResolve(inputBytes: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: AUDIO_SR_HOST,
        port: AUDIO_SR_PORT,
        path: '/v1/super_resolve?guidance_scale=3.5&ddim_steps=10',
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': inputBytes.length,
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.write(inputBytes);
    req.end();
  });
}
