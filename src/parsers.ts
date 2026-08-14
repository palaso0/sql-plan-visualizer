import { DetectionResult, Engine, NodeOperation, PlanNode } from './constants';

export interface PlanParser { parse(input: string, detection: DetectionResult): PlanNode; }
const number = (value: string | undefined): number => Number((value ?? '0').replace(/,/g, '')) || 0;
const node = (id: string, operation: NodeOperation, label: string, values: Partial<PlanNode> = {}): PlanNode => ({ id, operation, label, estimatedRows: 0, estimatedCost: 0, filters: [], children: [], ...values });
const operation = (label: string): NodeOperation => { const value = label.toLowerCase(); if (/join|loop/.test(value)) {return NodeOperation.Join;} if (/sort|filesort|temp b-tree/.test(value)) {return NodeOperation.Sort;} if (/aggregate|group|hash/.test(value)) {return NodeOperation.Aggregate;} if (/filter|where/.test(value)) {return NodeOperation.Filter;} if (/limit/.test(value)) {return NodeOperation.Limit;} if (/index|search/.test(value)) {return NodeOperation.IndexScan;} if (/scan|access/.test(value)) {return NodeOperation.Scan;} return NodeOperation.Other; };
const tableFrom = (label: string): string | undefined => label.match(/(?:on|from|table)\s+([\w.]+)/i)?.[1];

export class MySQLParser implements PlanParser {
  parse(input: string): PlanNode { if (/^[{[]/.test(input.trim())) {return this.json(JSON.parse(input));} return this.text(input); }
  private json(value: Record<string, unknown>): PlanNode { const rootValue = (value.query_block ?? value) as Record<string, unknown>; return this.jsonNode(rootValue, 'root', 'Query'); }
  private jsonNode(value: Record<string, unknown>, id: string, fallback: string): PlanNode {
    const table = value.table as Record<string, unknown> | undefined;
    if (table) {
      const tableCost = table.cost_info as Record<string, unknown> | undefined;
      const label = String(table.access_type ?? 'Table access');
      const inputRows = number(String(table.rows_examined_per_scan ?? '0'));
      const filtered = number(String(table.filtered ?? '100')) / 100;
      const estimatedRows = inputRows ? Math.round(inputRows * filtered) : number(String(table.rows_produced_per_join ?? '0'));
      const details: string[] = [];
      if (tableCost) {
        if (tableCost.read_cost !== undefined) { details.push(`Read cost: ${number(String(tableCost.read_cost))}`); }
        if (tableCost.eval_cost !== undefined) { details.push(`Eval cost: ${number(String(tableCost.eval_cost))}`); }
        if (tableCost.prefix_cost !== undefined) { details.push(`Prefix cost: ${number(String(tableCost.prefix_cost))}`); }
      }
      if (Array.isArray(table.used_key_parts) && table.used_key_parts.length) { details.push(`Index key parts: ${table.used_key_parts.map(String).join(', ')}`); }
      return node(id, /ALL/i.test(label) ? NodeOperation.Scan : NodeOperation.IndexScan, label, {
        table: table.table_name as string | undefined,
        index: table.key as string | undefined,
        possibleKeys: Array.isArray(table.possible_keys) ? table.possible_keys.map(String) : table.possible_keys ? [String(table.possible_keys)] : undefined,
        keyLength: table.key_length as string | undefined,
        ref: Array.isArray(table.ref) ? table.ref.map(String).join(', ') : table.ref as string | undefined,
        filtered: Number(table.filtered) || undefined,
        usedKeyParts: Array.isArray(table.used_key_parts) ? table.used_key_parts.map(String) : undefined,
        estimatedRows,
        inputRows,
        estimatedCost: number(String(tableCost?.prefix_cost ?? tableCost?.read_cost ?? '0')),
        filters: table.attached_condition ? [String(table.attached_condition)] : [],
        details,
        children: []
      });
    }
    const children: PlanNode[] = [];
    const addChild = (child: unknown, childId: string, label: string): void => {
      if (Array.isArray(child)) {
        child.forEach((item, index) => { if (typeof item === 'object' && item !== null) {children.push(this.jsonNode(item as Record<string, unknown>, `${childId}-${index}`, label));} });
      } else if (typeof child === 'object' && child !== null) {
        children.push(this.jsonNode(child as Record<string, unknown>, childId, label));
      }
    };
    if (value.ordering_operation) {addChild(value.ordering_operation, `${id}-sort`, 'Sort');}
    if (value.grouping_operation) {addChild(value.grouping_operation, `${id}-aggregate`, 'Aggregate');}
    if (value.nested_loop) {addChild(value.nested_loop, `${id}-join`, 'Join');}
    if (value.duplicates_removal) {addChild(value.duplicates_removal, `${id}-deduplicate`, 'Aggregate');}
    const costInfo = value.cost_info as Record<string, unknown> | undefined;
    const label = value.ordering_operation ? 'Sort' : value.grouping_operation ? 'Aggregate' : value.nested_loop ? 'Join' : fallback;
    const current = node(id, operation(label), label, {
      estimatedRows: number(String(value.rows_produced_per_join ?? '0')),
      estimatedCost: number(String(costInfo?.query_cost ?? costInfo?.prefix_cost ?? '0')),
      extra: value.using_filesort ? 'using filesort' : undefined,
      children
    });
    if (!current.estimatedRows && children.length) {current.estimatedRows = Math.max(...children.map(child => child.estimatedRows));}
    return current;
  }
  private text(input: string): PlanNode { const rows = input.split(/\r?\n/).filter(line => { const trimmed = line.trim(); return trimmed && !trimmed.startsWith('+') && !/^(id|select_type)/i.test(trimmed) && !/table/i.test(trimmed.slice(0, 30)); }); const children = rows.map((line, index) => { const parts = line.split('|').map(part => part.trim()).filter(part => part && !/^\++$/.test(part)); const table = parts[2] ?? ''; const type = parts[4] ?? ''; const key = parts[6] ?? ''; const rowEst = parts[9] ?? ''; const extra = parts[11] ?? parts.at(-1) ?? ''; const label = [type, table, extra].filter(Boolean).join(' '); const op = type === 'ALL' ? NodeOperation.Scan : /index|ref|range|const|eq_ref/.test(type) ? NodeOperation.IndexScan : operation(label); return node(`node-${index}`, op, label, { table: table !== 'NULL' ? table : undefined, index: key && key !== 'NULL' ? key : undefined, estimatedRows: number(rowEst), estimatedCost: 0, extra: extra !== 'NULL' ? extra : undefined }); }); return node('root', NodeOperation.Other, 'MySQL query', { children: children.length ? children : [node('empty', NodeOperation.Other, 'No plan nodes')] }); }
}
const keyLabel = (value: Record<string, unknown>): string => String(value.node_type ?? value.operation ?? (value.table as Record<string, unknown> | undefined)?.access_type ?? 'Operation');

export class PostgreSQLParser implements PlanParser {
  parse(input: string): PlanNode { if (/^[{[]/.test(input.trim())) { const value = JSON.parse(input) as Array<Record<string, unknown>>; const root = Array.isArray(value) ? value[0]?.Plan ?? value[0] : value; return this.jsonNode(root as Record<string, unknown>, 'root'); } return this.text(input); }
  private jsonNode(value: Record<string, unknown>, id: string): PlanNode {
    const label = String(value['Node Type'] ?? 'Query');
    const children = Array.isArray(value.Plans) ? value.Plans.map((child, i) => this.jsonNode(child as Record<string, unknown>, `${id}-${i}`)) : [];
    const joined = (key: string): string | undefined => { const v = value[key]; if (v === undefined) { return undefined; } return (Array.isArray(v) ? v : [v]).map(String).join(', '); };
    const sortKey = joined('Sort Key');
    const groupKey = joined('Group Key');
    const condition = sortKey ? `sort key: ${sortKey}` : groupKey ? `group key: ${groupKey}` : value['Index Cond'] ? `condition: ${String(value['Index Cond'])}` : value['Hash Cond'] ? `join condition: ${String(value['Hash Cond'])}` : value['Merge Cond'] ? `merge condition: ${String(value['Merge Cond'])}` : undefined;
    const details: string[] = [];
    if (value['Join Type'] !== undefined) { details.push(`Join type: ${String(value['Join Type'])}`); }
    if (value.Alias !== undefined) { details.push(`Alias: ${String(value.Alias)}`); }
    if (value['Startup Cost'] !== undefined) { details.push(`Startup cost: ${number(String(value['Startup Cost']))}`); }
    if (value['Plan Width'] !== undefined) { details.push(`Row width: ${String(value['Plan Width'])} bytes`); }
    if (value['Actual Startup Time'] !== undefined) { details.push(`Actual startup: ${number(String(value['Actual Startup Time']))} ms`); }
    if (value['Actual Loops'] !== undefined) { details.push(`Actual loops: ${number(String(value['Actual Loops']))}`); }
    return node(id, operation(label), label, { table: value['Relation Name'] as string | undefined, index: value['Index Name'] as string | undefined, estimatedRows: number(String(value['Plan Rows'] ?? '0')), estimatedCost: number(String(value['Total Cost'] ?? '0')), actualRows: number(String(value['Actual Rows'] ?? '0')) || undefined, actualTime: number(String(value['Actual Total Time'] ?? '0')) || undefined, filters: [value.Filter, value['Join Filter']].filter(Boolean).map(String), condition, details, children });
  }
  private text(input: string): PlanNode { const lines = input.split(/\r?\n/).filter(line => /(?:->\s*)?(Seq Scan|Index Scan|Bitmap|Nested Loop|Hash Join|Merge Join|Sort|Aggregate|Limit|Gather|Append|Result)/i.test(line)); const children = lines.map((line, index) => { const label = line.replace(/^\s*->\s*/, '').split(/\s{2,}/)[0]; const rows = line.match(/rows=(\d+)/i)?.[1]; const cost = line.match(/cost=[\d.]+\.\.(\d+(?:\.\d+)?)/i)?.[1]; return node(`node-${index}`, operation(label), label, { table: tableFrom(line), estimatedRows: number(rows), estimatedCost: number(cost), filters: line.match(/Filter:\s*(.*)/i)?.[1] ? [line.match(/Filter:\s*(.*)/i)![1]] : [] }); }); return node('root', NodeOperation.Other, 'PostgreSQL query', { children: children.length ? children : [node('empty', NodeOperation.Other, 'No plan nodes')] }); }
}

export class OracleParser implements PlanParser {
  parse(input: string): PlanNode { const lines = input.split(/\r?\n/).filter((line: string) => { const trimmed = line.trim(); if (!trimmed || !trimmed.startsWith('|')) {return false;} if (/^\|\s*Id/i.test(trimmed)) {return false;} if (/^\|\s*[-=]+\s*\|/.test(trimmed)) {return false;} return true; }); const children = lines.map((line: string, i: number) => { const parts = line.split('|').map(part => part.trim()); const op = parts[2] ?? ''; const name = parts[3] ?? ''; const rows = parts[4] ?? ''; const costRaw = (parts[6] ?? '').replace(/\(.*\)/, '').trim() || (parts.at(-1) ?? '').replace(/\(.*\)/, '').trim(); const isJoin = /JOIN/i.test(op); const isSort = /SORT/i.test(op); const isAggregate = /GROUP/i.test(op); const nodeOp = isJoin ? NodeOperation.Join : isSort ? NodeOperation.Sort : isAggregate ? NodeOperation.Aggregate : /INDEX/i.test(op) ? NodeOperation.IndexScan : /TABLE ACCESS|SCAN/i.test(op) ? NodeOperation.Scan : NodeOperation.Other; return node(`node-${i}`, nodeOp, op, { table: name || undefined, estimatedRows: number(rows), estimatedCost: number(costRaw), children: [] }); }); return node('root', NodeOperation.Other, 'Oracle query', { children: children.length ? children : [node('empty', NodeOperation.Other, 'No plan nodes')] }); }
}

export class GenericTextParser implements PlanParser {
  parse(input: string, detection: DetectionResult): PlanNode {
    if (detection.engine === Engine.Oracle) {return new OracleParser().parse(input);} const lines = input.split(/\r?\n/).filter(line => { const trimmed = line.trim(); if (!trimmed) {return false;} if (/^(QUERY PLAN|PLAN_TABLE_OUTPUT|EXPLAIN QUERY PLAN)/i.test(trimmed)) {return false;} if (/^[-+|=\s]+$/.test(trimmed)) {return false;} if (/^(SELECT|FROM|JOIN|WHERE|GROUP|ORDER|HAVING|LIMIT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|SET|VALUES|RETURNING|WITH|UNION|EXCEPT|INTERSECT|ON|USING|AND|OR|NOT|IN|BETWEEN|LIKE|IS|AS|DISTINCT|ALL|INNER|OUTER|LEFT|RIGHT|FULL|CROSS|NATURAL|EXISTS|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|ASC|DESC|BY|OFFSET|FETCH|FOR|LOCK|NOWAIT|SKIP)\b/i.test(trimmed)) {return false;} return /[A-Z]/.test(trimmed) || /scan|search|sort|filter|hash|join|aggregate|limit/i.test(trimmed); }); const children = lines.map((line, i) => { const clean = line.replace(/^[|`+]*\s*--/, '').replace(/^\s*[|`+]\s*/, '').replace(/^\s*\d+\s+/, '').trim(); const scanMatch = clean.match(/(?:SCAN|SEARCH)\s+(\w+)/i); const indexMatch = clean.match(/USING(?:\s+(?:COVERING\s+)?INDEX)?\s+(\w+)/i); const isSort = /TEMP B-TREE|ORDER BY|SORT|filesort/i.test(clean); const op = isSort ? NodeOperation.Sort : /SEARCH/i.test(clean) ? NodeOperation.IndexScan : /SCAN/i.test(clean) ? NodeOperation.Scan : operation(clean); const label = clean.length > 40 ? clean.slice(0, 37) + '...' : clean; return node(`node-${i}`, op, label, { table: scanMatch?.[1], index: indexMatch?.[1], estimatedRows: number(clean.match(/rows?\s*[=:]\s*([\d,]+)/i)?.[1]), estimatedCost: number(clean.match(/cost\s*[=:]\s*([\d,.]+)/i)?.[1]) }); }); return node('root', NodeOperation.Other, `${detection.engine} query`, { children: children.length ? children : [node('empty', NodeOperation.Other, 'No plan nodes')] }); }
}
export class ParserFactory { create(engine: Engine): PlanParser { if (engine === Engine.MySQL) {return new MySQLParser();} if (engine === Engine.PostgreSQL) {return new PostgreSQLParser();} return new GenericTextParser(); } }
