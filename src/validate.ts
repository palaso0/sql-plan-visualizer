import { PlanNode } from './constants';

export const ENGINE_NAMES: Record<string, string> = { mysql: 'MySQL', postgresql: 'PostgreSQL', sqlite: 'SQLite', oracle: 'Oracle', sqlserver: 'SQL Server' };

const ALIAS_STOP = new Set(['on', 'where', 'group', 'order', 'having', 'limit', 'offset', 'as', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'natural', 'join', 'using', 'and', 'or', 'union', 'except', 'intersect']);

export const sqlRelations = (sql: string): { tables: string[]; aliases: string[] } => {
  const tables = new Set<string>();
  const aliases = new Set<string>();
  const re = /\b(?:FROM|JOIN)\s+([^\s;(]+(?:\s+[a-z_]\w*)?(?:\s*,\s*[^\s;(]+(?:\s+[a-z_]\w*)?)*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    m[1].split(',').forEach((item) => {
      const parts = item.trim().split(/\s+/);
      const raw = parts[0].replace(/^['"`\[]+|['"`\]]+$/g, '').split('.').pop();
      if (raw && /^[a-z_][\w]*$/i.test(raw)) { tables.add(raw.toLowerCase()); }
      let idx = 1;
      if (parts[idx] && parts[idx].toLowerCase() === 'as') { idx += 1; }
      const alias = parts[idx];
      if (alias && /^[a-z_]\w*$/i.test(alias) && !ALIAS_STOP.has(alias.toLowerCase())) { aliases.add(alias.toLowerCase()); }
    });
  }
  return { tables: [...tables], aliases: [...aliases] };
};

export const sqlTables = (sql: string): string[] => sqlRelations(sql).tables;

export const planTables = (root: PlanNode): string[] => {
  const tables = new Set<string>();
  const visit = (node: PlanNode): void => {
    if (node.table) { tables.add(node.table.toLowerCase()); }
    node.children.forEach(visit);
  };
  visit(root);
  return [...tables];
};

export const sqlDialectMismatch = (sql: string, engine: string): string | null => {
  const pgStyle = /INTERVAL\s+'[^']*[a-z]/i.test(sql) || /\bILIKE\b/i.test(sql) || /::\s*(?:integer|bigint|text|varchar|numeric|bool|boolean|timestamp|date)\b/i.test(sql);
  const mysqlStyle = /`[\w.]+`/.test(sql) || /\bDATE_(?:SUB|ADD)\s*\(/i.test(sql);
  if (engine === 'mysql' && pgStyle) { return 'PostgreSQL-style syntax (quoted INTERVAL, :: casts or ILIKE)'; }
  if (engine === 'postgresql' && mysqlStyle) { return 'MySQL-style syntax (backticks or DATE_SUB/DATE_ADD)'; }
  return null;
};
