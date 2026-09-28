import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { AiTeacherVisualizer } from './aiTeacherVisualizer';

// Thin client only: this extension never processes audio itself. It either
// hands a <audio> element in a Webview to the browser engine bundled with
// VS Code, or forwards file bytes to a locally running AI service
// (open-audio-sr) that the user starts and owns on their own machine.
// このVS Code拡張機能自体は音声処理を一切行わない「薄いクライアント」。
// WebviewのHTML<audio>要素に再生を任せるか、利用者自身が起動する
// ローカルのAIサービス(open-audio-sr)へバイト列を転送するだけ。

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

  if (playerPanel) {
    playerPanel.reveal(vscode.ViewColumn.Beside);
  } else {
    playerPanel = vscode.window.createWebviewPanel(
      'openEnglishCompanionPlayer',
      'open-english Companion Player',
      vscode.ViewColumn.Beside,
      { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.dirname(uri.fsPath))] },
    );
    playerPanel.onDidDispose(() => {
      playerPanel = undefined;
    });
  }

  const audioSrc = playerPanel.webview.asWebviewUri(uri);
  playerPanel.title = path.basename(uri.fsPath);
  playerPanel.webview.html = renderPlayerHtml(audioSrc.toString(), path.basename(uri.fsPath));
}

function renderPlayerHtml(audioSrc: string, fileName: string): string {
  const escapedName = fileName.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem; color: var(--vscode-foreground); }
  audio { width: 100%; margin-top: 0.5rem; }
  h2 { font-size: 1rem; word-break: break-all; }
  p.hint { opacity: 0.7; font-size: 0.85rem; }
</style>
</head>
<body>
  <h2>${escapedName}</h2>
  <audio controls autoplay src="${audioSrc}"></audio>
  <p class="hint">
    Playback only — no audio processing happens in this extension.<br/>
    再生のみ。この拡張機能自体は音声処理を行いません。
  </p>
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
