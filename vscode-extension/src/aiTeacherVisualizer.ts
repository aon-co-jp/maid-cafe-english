import * as vscode from 'vscode';

// AI先生/生徒の共同編集ビジュアライザ(MVP)。
// AI Teacher / Student collaborative-editing visualizer (MVP).
//
// このモジュールは4種類の装飾(デコレーション)をエディター上に表示するだけで、
// AIモデルの呼び出しや実際の添削判定は一切行わない。「誰がどの範囲を書いたか」
// 「これからAI先生がどこを編集する予定か」「今まさに編集中の場所はどこか」を
// 色分けして可視化する、純粋にUI側のヘルパー。
//
// This module only renders decorations; it never calls an AI model or judges
// text itself. It just visualizes, by color, "who wrote which range",
// "where the AI teacher is about to edit next", and "what is being edited
// right now".

const EDITING_FADE_MS = 2500;

interface DocState {
  teacherRanges: vscode.Range[];
  studentRanges: vscode.Range[];
  announcedRanges: vscode.Range[];
  editingRanges: vscode.Range[];
  editingFadeTimer?: ReturnType<typeof setTimeout>;
}

export class AiTeacherVisualizer implements vscode.Disposable {
  private readonly teacherDecoration: vscode.TextEditorDecorationType;
  private readonly studentDecoration: vscode.TextEditorDecorationType;
  private readonly announceDecoration: vscode.TextEditorDecorationType;
  private readonly editingDecoration: vscode.TextEditorDecorationType;

  private readonly states = new Map<string, DocState>();
  private readonly disposables: vscode.Disposable[] = [];
  private active = false;

  constructor() {
    this.teacherDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(80, 160, 255, 0.18)',
      overviewRulerColor: 'rgba(80, 160, 255, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: { contentText: '', color: 'rgba(80,160,255,0.9)' },
    });
    this.studentDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 80, 80, 0.16)',
      overviewRulerColor: 'rgba(255, 80, 80, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.announceDecoration = vscode.window.createTextEditorDecorationType({
      border: '1px dashed rgba(255, 220, 60, 0.9)',
      backgroundColor: 'rgba(255, 220, 60, 0.08)',
      overviewRulerColor: 'rgba(255, 220, 60, 0.9)',
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      after: {
        contentText: '  ⟵ AI先生が編集予定 / AI teacher will edit here',
        color: 'rgba(255, 220, 60, 0.9)',
        fontStyle: 'italic',
      },
    });
    this.editingDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(90, 220, 140, 0.25)',
      overviewRulerColor: 'rgba(90, 220, 140, 0.9)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
  }

  enable(): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDidChangeTextDocument(e)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.render(editor);
        }
      }),
    );
    if (vscode.window.activeTextEditor) {
      this.render(vscode.window.activeTextEditor);
    }
  }

  disable(): void {
    this.active = false;
    this.disposables.splice(0).forEach((d) => d.dispose());
    for (const state of this.states.values()) {
      if (state.editingFadeTimer) {
        clearTimeout(state.editingFadeTimer);
      }
    }
    this.states.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      this.clearAllDecorations(editor);
    }
  }

  isEnabled(): boolean {
    return this.active;
  }

  /** AI先生が「これからこの範囲を編集する」と予告する。 / AI teacher announces an upcoming edit range. */
  announce(editor: vscode.TextEditor, range: vscode.Range): void {
    const state = this.stateFor(editor.document);
    state.announcedRanges.push(range);
    this.render(editor);
  }

  /**
   * AI先生として指定範囲へテキストを書き込み、教師由来として色分けする。
   * 直前に announce() した範囲があれば予告表示を解除する。
   * Writes text as the AI teacher at the given position/range, tagging the
   * result as teacher-authored. Clears any matching announcement.
   */
  async writeAsTeacher(
    editor: vscode.TextEditor,
    range: vscode.Range,
    text: string,
  ): Promise<void> {
    const doc = editor.document;
    const state = this.stateFor(doc);
    state.announcedRanges = state.announcedRanges.filter((r) => !r.isEqual(range));

    const startOffset = doc.offsetAt(range.start);
    await editor.edit((builder) => builder.replace(range, text));
    const endOffset = startOffset + text.length;
    const newRange = new vscode.Range(doc.positionAt(startOffset), doc.positionAt(endOffset));

    state.teacherRanges = mergeRange(state.teacherRanges, newRange);
    state.studentRanges = subtractRange(state.studentRanges, newRange);
    this.render(editor);
  }

  private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): void {
    if (!this.active || e.contentChanges.length === 0) {
      return;
    }
    const editor = vscode.window.visibleTextEditors.find((ed) => ed.document === e.document);
    if (!editor) {
      return;
    }
    const state = this.stateFor(e.document);

    for (const change of e.contentChanges) {
      const startOffset = change.rangeOffset;
      const endOffset = startOffset + change.text.length;
      const newRange = new vscode.Range(
        e.document.positionAt(startOffset),
        e.document.positionAt(endOffset),
      );

      // このハンドラーはユーザー(生徒)の直接入力を検知するためのもの。
      // writeAsTeacher() 経由の変更はここに来る前に teacherRanges へ登録済みなので、
      // 既に teacher 範囲として記録済みの位置には student 範囲を追加しない。
      const overlapsTeacher = state.teacherRanges.some((r) => r.intersection(newRange) !== undefined);
      if (!overlapsTeacher) {
        state.studentRanges = mergeRange(state.studentRanges, newRange);
      }

      // 予告エリアと重なった変更は、予告の消化として扱う(生徒が先に埋めた場合も含む)。
      state.announcedRanges = state.announcedRanges.filter(
        (r) => r.intersection(change.range) === undefined,
      );

      state.editingRanges = [newRange];
    }

    if (state.editingFadeTimer) {
      clearTimeout(state.editingFadeTimer);
    }
    state.editingFadeTimer = setTimeout(() => {
      state.editingRanges = [];
      this.render(editor);
    }, EDITING_FADE_MS);

    this.render(editor);
  }

  private stateFor(document: vscode.TextDocument): DocState {
    const key = document.uri.toString();
    let state = this.states.get(key);
    if (!state) {
      state = { teacherRanges: [], studentRanges: [], announcedRanges: [], editingRanges: [] };
      this.states.set(key, state);
    }
    return state;
  }

  private render(editor: vscode.TextEditor): void {
    const state = this.states.get(editor.document.uri.toString());
    if (!state) {
      this.clearAllDecorations(editor);
      return;
    }
    editor.setDecorations(this.teacherDecoration, state.teacherRanges);
    editor.setDecorations(this.studentDecoration, state.studentRanges);
    editor.setDecorations(this.announceDecoration, state.announcedRanges);
    editor.setDecorations(this.editingDecoration, state.editingRanges);
  }

  private clearAllDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.teacherDecoration, []);
    editor.setDecorations(this.studentDecoration, []);
    editor.setDecorations(this.announceDecoration, []);
    editor.setDecorations(this.editingDecoration, []);
  }

  dispose(): void {
    this.disable();
    this.teacherDecoration.dispose();
    this.studentDecoration.dispose();
    this.announceDecoration.dispose();
    this.editingDecoration.dispose();
  }
}

function mergeRange(ranges: vscode.Range[], added: vscode.Range): vscode.Range[] {
  return [...ranges.filter((r) => r.intersection(added) === undefined), added];
}

function subtractRange(ranges: vscode.Range[], removed: vscode.Range): vscode.Range[] {
  return ranges.filter((r) => r.intersection(removed) === undefined);
}
