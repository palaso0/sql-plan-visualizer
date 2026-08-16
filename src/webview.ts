import * as vscode from 'vscode';
import { writeFile } from 'node:fs/promises';
import { AnnotatedPlan, PlanNode } from './constants';

interface BrandIcon { hex: string; path: string }
const simpleIcons = require('simple-icons') as Record<string, BrandIcon>;

export class PlanWebview {
  static show(extensionUri: vscode.Uri, plan: AnnotatedPlan, sql?: string): void {
    const panel = vscode.window.createWebviewPanel('sqlPlanVisualizer', 'SQL Plan Visualizer', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] });
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const resource = (name: string): string => panel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', name)).toString();
    const payload = JSON.stringify({ ...plan, sql, nodes: flatten(plan.root), issues: plan.issues }).replace(/</g, '\\u003c');
    panel.webview.html = html(payload, nonce, resource('main.css'), resource('main.js'), logoFor(plan.engine.engine), panel.webview.cspSource);
    panel.webview.onDidReceiveMessage(async message => {
      if (message.type !== 'exportImage' || typeof message.data !== 'string' || typeof message.extension !== 'string') {return;}
      const extension = message.extension === 'jpg' ? 'jpg' : message.extension === 'svg' ? 'svg' : 'png';
      const target = await vscode.window.showSaveDialog({ saveLabel: 'Export plan', filters: { [extension.toUpperCase()]: [extension] }, defaultUri: vscode.Uri.file(`sql-execution-plan.${extension}`) });
      if (!target) {return;}
      const contents = extension === 'svg' ? Buffer.from(message.data, 'utf8') : Buffer.from(message.data.split(',')[1], 'base64');
      await writeFile(target.fsPath, contents);
      vscode.window.showInformationMessage(`Plan exported to ${target.fsPath}`);
    });
  }
}
const flatten = (root: PlanNode): Array<PlanNode & { parentId?: string }> => { const result: Array<PlanNode & { parentId?: string }> = []; const visit = (node: PlanNode, parentId?: string): void => { result.push({ ...node, parentId }); node.children.forEach(child => visit(child, node.id)); }; visit(root); return result; };
const logoFor = (engine: string): string => { const icons: Record<string, BrandIcon | undefined> = { mysql: simpleIcons.siMysql, postgresql: simpleIcons.siPostgresql, sqlite: simpleIcons.siSqlite }; const icon = icons[engine]; return icon ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#${icon.hex}" d="${icon.path}"/></svg>` : `<span>${engine.slice(0, 2).toUpperCase()}</span>`; };
const html = (payload: string, nonce: string, css: string, js: string, logo: string, cspSource: string): string => `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource}; img-src ${cspSource} data:;"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${css}"></head><body><main><header><div class="brand"><div class="brand-mark">${logo}</div><div><p class="eyebrow">SQL PLAN VISUALIZER</p><div class="title" id="summary">Execution plan</div></div></div><div class="toolbar"><div class="toolbar-group"><button id="play">Play execution</button><button id="pause" class="secondary" disabled>Pause</button><button id="stop" class="secondary" disabled>Stop</button><button id="reset" class="secondary">Reset view</button></div><div class="toolbar-group"><select id="layout" aria-label="Diagram layout"><option value="vertical">Vertical flow</option><option value="horizontal">Horizontal flow</option></select><select id="mode" aria-label="Highlight mode"><option value="risk">Risk heatmap</option><option value="cost">Cost heatmap</option><option value="rows">Rows heatmap</option></select></div><div class="toolbar-group export-group"><select id="export-format" aria-label="Export format"><option value="png">PNG</option><option value="jpg">JPG</option><option value="svg">SVG</option></select><button id="export" class="secondary">Export</button></div><div class="toolbar-group zoom-group"><button id="zoom-out" class="secondary" aria-label="Zoom out">−</button><button id="zoom-in" class="secondary" aria-label="Zoom in">+</button><button id="zoom-fit" class="secondary">Fit</button></div></div></header><div class="stats-bar" id="stats-bar"></div><div class="legend-bar"><span><i></i>Healthy operation</span><span><i class="warn"></i>Review suggested</span><span><i class="critical"></i>High impact</span></div><section class="content"><div class="diagram-panel"><details id="query-panel" class="query-bar" open><summary>SQL query</summary><pre id="sql-query"></pre><div class="query-hint" id="query-hint"></div></details><svg id="diagram" role="img" aria-label="SQL execution plan"></svg><div class="canvas-status">Scroll to move · Use the hand to pan · Drag nodes to reposition</div></div><aside class="sidebar"><section class="section"><h2>Attention points</h2><div id="issues"></div></section></aside></section></main><script nonce="${nonce}">window.__PLAN__=${payload}</script><script nonce="${nonce}" src="${js}"></script></body></html>`;
