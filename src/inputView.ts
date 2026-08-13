import * as vscode from 'vscode';

export class PlanInputView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  constructor(private readonly onPlan: (input: string) => void) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:12px 10px;margin:0}h1{font-size:18px;margin:4px 0 7px}p{color:var(--vscode-descriptionForeground);line-height:1.45;font-size:12px;margin:0 0 15px}.hero{border:1px solid var(--vscode-widget-border);border-radius:8px;padding:12px;margin-bottom:12px;background:var(--vscode-editorWidget-background)}textarea{width:100%;height:180px;resize:vertical;box-sizing:border-box;background:var(--vscode-textCodeBlock-background);color:var(--vscode-editor-foreground);border:1px solid var(--vscode-input-border);border-radius:5px;padding:9px;font:12px var(--vscode-editor-font-family);outline:none}textarea:focus{border-color:var(--vscode-focusBorder)}button{width:100%;margin-top:9px;border:0;border-radius:5px;padding:9px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-weight:600;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}.tip{font-size:11px;margin-top:14px}</style></head><body><section class="hero"><h1>SQL Plan Visualizer</h1><p>See what your query is really doing. Paste an EXPLAIN plan and turn it into a clear execution story.</p><textarea id="plan" autofocus placeholder="Paste EXPLAIN output here..."></textarea><button id="visualize">Visualize plan</button></section><p class="tip">Tip: select an EXPLAIN result in the editor and use the database icon in the editor toolbar.</p><script>const vscode=acquireVsCodeApi();const input=document.getElementById('plan');const send=()=>{if(input.value.trim())vscode.postMessage({type:'visualize',input:input.value})};document.getElementById('visualize').addEventListener('click',send);input.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter')send()});</script></body></html>`;
    view.webview.onDidReceiveMessage(message => { if (message.type === 'visualize' && typeof message.input === 'string') {this.onPlan(message.input);} });
  }
  focus(): void { this.view?.show?.(true); }
}
