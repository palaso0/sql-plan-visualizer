import * as vscode from 'vscode';
import { PlanAnalyzer } from './analyzer';
import { EngineDetector } from './detection';
import { ParserFactory } from './parsers';
import { PlanWebview } from './webview';
import { PlanInputView } from './inputView';

export function activate(context: vscode.ExtensionContext): void {
  const inputView = new PlanInputView(input => visualize(context, input));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('sql-plan-visualizer.input', inputView), vscode.commands.registerCommand('sql-plan-visualizer.visualize', () => run(context)), vscode.commands.registerCommand('sql-plan-visualizer.visualizeFromEditor', () => run(context, true)), vscode.commands.registerCommand('sql-plan-visualizer.focusInput', () => inputView.focus()));
}
async function run(context: vscode.ExtensionContext, fromEditor = false): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selected = fromEditor || editor?.selection.isEmpty === false ? editor?.document.getText(editor.selection) : undefined;
  const input = selected?.trim() || await vscode.window.showInputBox({ prompt: 'Paste your EXPLAIN output', placeHolder: 'EXPLAIN (FORMAT JSON) ...', ignoreFocusOut: true });
  if (!input?.trim()) {return;}
  visualize(context, input);
}
function visualize(context: vscode.ExtensionContext, input: string): void {
  const detection = new EngineDetector().detect(input);
  if (!detection) { vscode.window.showErrorMessage('Could not detect the database engine. Supported formats: MySQL, PostgreSQL, Oracle and SQLite.'); return; }
  try { const parsed = new ParserFactory().create(detection.engine).parse(input, detection); PlanWebview.show(context.extensionUri, new PlanAnalyzer().analyze(parsed, detection)); }
  catch (error) { vscode.window.showErrorMessage(`Could not parse the execution plan: ${error instanceof Error ? error.message : String(error)}`); }
}
export function deactivate(): void {}
