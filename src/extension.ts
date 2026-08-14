import * as vscode from 'vscode';
import { PlanAnalyzer } from './analyzer';
import { EngineDetector } from './detection';
import { ParserFactory } from './parsers';
import { PlanWebview } from './webview';
import { PlanInputView } from './inputView';
import { ENGINE_NAMES, planTables, sqlDialectMismatch, sqlRelations } from './validate';

export function activate(context: vscode.ExtensionContext): void {
  const inputView = new PlanInputView((input, sql) => visualize(context, input, sql));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('sql-plan-visualizer.input', inputView), vscode.commands.registerCommand('sql-plan-visualizer.visualize', () => run(context)), vscode.commands.registerCommand('sql-plan-visualizer.visualizeFromEditor', () => run(context, true)), vscode.commands.registerCommand('sql-plan-visualizer.focusInput', () => inputView.focus()));
}
async function run(context: vscode.ExtensionContext, fromEditor = false): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selected = fromEditor || editor?.selection.isEmpty === false ? editor?.document.getText(editor.selection) : undefined;
  const input = selected?.trim() || await vscode.window.showInputBox({ prompt: 'Paste your EXPLAIN output', placeHolder: 'EXPLAIN (FORMAT JSON) ...', ignoreFocusOut: true });
  if (!input?.trim()) {return;}
  await visualize(context, input);
}
async function visualize(context: vscode.ExtensionContext, input: string, sql?: string): Promise<void> {
  const detection = new EngineDetector().detect(input);
  if (!detection) { vscode.window.showErrorMessage('Could not detect the database engine. Supported formats: MySQL, PostgreSQL, Oracle and SQLite.'); return; }
  try {
    const parsed = new ParserFactory().create(detection.engine).parse(input, detection);
    const analyzed = new PlanAnalyzer().analyze(parsed, detection);
    if (sql) {
      const rel = sqlRelations(sql);
      const pt = planTables(parsed);
      const tablesMismatch =
        rel.tables.length > 0 &&
        pt.length > 0 &&
        !rel.tables.some((t) => pt.includes(t)) &&
        !rel.aliases.some((a) => pt.includes(a));
      const dialectIssue = sqlDialectMismatch(sql, analyzed.engine.engine);
      const issue = tablesMismatch
        ? `Tables in the SQL (${rel.tables.slice(0, 4).join(', ')}${rel.tables.length > 4 ? ', …' : ''}) are not in the plan (${pt.slice(0, 4).join(', ')}${pt.length > 4 ? ', …' : ''}).`
        : dialectIssue
          ? `The SQL uses ${dialectIssue}, but the plan is ${ENGINE_NAMES[analyzed.engine.engine] ?? analyzed.engine.engine}.`
          : undefined;
      if (issue) {
        const action = await vscode.window.showWarningMessage(
          `The SQL doesn't seem to match this plan. ${issue}`,
          { modal: true },
          'Visualize anyway',
          'Cancel',
        );
        if (action !== 'Visualize anyway') { return; }
      }
    }
    PlanWebview.show(context.extensionUri, analyzed, sql);
  }
  catch (error) { vscode.window.showErrorMessage(`Could not parse the execution plan: ${error instanceof Error ? error.message : String(error)}`); }
}
export function deactivate(): void {}
