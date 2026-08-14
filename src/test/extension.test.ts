import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Engine, NodeOperation } from '../constants';
import { EngineDetector } from '../detection';
import { ParserFactory } from '../parsers';
import { PlanAnalyzer } from '../analyzer';
import { planTables, sqlDialectMismatch, sqlRelations } from '../validate';

const exampleDir = path.join(__dirname, '..', '..', 'examples');
const EXAMPLES = fs
  .readdirSync(exampleDir)
  .filter((file) => file.endsWith('.json') || file.endsWith('.txt'))
  .sort()
  .map((file) => {
    const base = file.replace(/\.(json|txt)$/, '');
    return { name: base, file, sqlFile: `${base}.sql` };
  });

suite('SQL Plan Visualizer', () => {
  test('detects PostgreSQL JSON and parses its tree', () => {
    const input = JSON.stringify([{ Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 120000, 'Total Cost': 500, Plans: [] } }]);
    const detection = new EngineDetector().detect(input);
    assert.strictEqual(detection?.engine, Engine.PostgreSQL);
    const root = new ParserFactory().create(Engine.PostgreSQL).parse(input, detection!);
    assert.strictEqual(root.operation, NodeOperation.Scan);
    assert.strictEqual(root.estimatedRows, 120000);
    assert.ok(new PlanAnalyzer().analyze(root, detection!).issues.length > 0);
  });
  test('detects MySQL tabular output', () => assert.strictEqual(new EngineDetector().detect('id select_type table type possible_keys key rows Extra\n1 SIMPLE orders ALL idx_customer 250000 Using where')?.engine, Engine.MySQL));
  test('detects SQLite query plan', () => assert.strictEqual(new EngineDetector().detect('EXPLAIN QUERY PLAN\nSCAN orders\nSEARCH users USING INDEX idx_users')?.engine, Engine.SQLite));
  test('detects PostgreSQL text plans, not SQLite', () => assert.strictEqual(new EngineDetector().detect('Sort (cost=18420.50..18489.32 rows=12000 width=96)\n  ->  Hash Join (cost=420.00..16620.11 rows=67200 width=96)\n        ->  Seq Scan on orders o (cost=0.00..12100.00 rows=850000 width=64)\n              Filter: (created_at >= CURRENT_DATE)')?.engine, Engine.PostgreSQL));

  EXAMPLES.forEach((example) => {
    const plan = fs.readFileSync(path.join(exampleDir, example.file), 'utf8');
    const sql = fs.readFileSync(path.join(exampleDir, example.sqlFile), 'utf8');
    const detection = new EngineDetector().detect(plan);
    assert.ok(detection, `${example.name}: engine should be detected`);
    const root = new ParserFactory().create(detection!.engine).parse(plan, detection!);
    test(`${example.name}: SQL matches the plan tables (or aliases)`, () => {
      const pt = planTables(root);
      const rel = sqlRelations(sql);
      assert.ok(rel.tables.length > 0, `${example.name}: SQL tables should be found`);
      assert.ok(pt.length > 0, `${example.name}: plan tables should be found`);
      const overlap = rel.tables.some((t) => pt.includes(t)) || rel.aliases.some((a) => pt.includes(a));
      assert.ok(overlap, `${example.name}: SQL tables/aliases ${JSON.stringify(rel)} should overlap plan tables ${JSON.stringify(pt)}`);
    });
    test(`${example.name}: no false dialect mismatch`, () => {
      assert.strictEqual(sqlDialectMismatch(sql, detection!.engine), null, `${example.name}: native SQL should not look like a foreign dialect`);
    });
  });

  test('dialect mismatch flags PostgreSQL interval in MySQL SQL', () => {
    assert.ok(sqlDialectMismatch("SELECT * FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'", 'mysql'));
    assert.ok(sqlDialectMismatch('SELECT * FROM "orders" WHERE amount::numeric > 5', 'mysql'));
    assert.ok(sqlDialectMismatch('SELECT * FROM `orders` WHERE id = 1', 'postgresql'));
    assert.strictEqual(sqlDialectMismatch('SELECT * FROM orders WHERE d >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)', 'mysql'), null);
    assert.strictEqual(sqlDialectMismatch("SELECT * FROM orders WHERE d >= CURRENT_DATE - INTERVAL '30 days'", 'postgresql'), null);
  });
  test('sqlRelations extracts tables and aliases (including quoted)', () => {
    const rel = sqlRelations('SELECT * FROM customers c JOIN `order` o ON o.customer_id = c.id');
    assert.deepStrictEqual(rel.tables.sort(), ['customers', 'order']);
    assert.deepStrictEqual(rel.aliases.sort(), ['c', 'o']);
    assert.deepStrictEqual(sqlRelations('SELECT 1').tables, []);
  });
  test('PG JSON captures sort key, index cond and filter', () => {
    const plan = fs.readFileSync(path.join(exampleDir, '7-postgresql-json-window.json'), 'utf8');
    const detection = new EngineDetector().detect(plan);
    const root = new ParserFactory().create(detection!.engine).parse(plan, detection!);
    const sort = root.children[0];
    const indexScan = root.children[0].children[0].children[1];
    assert.strictEqual(sort.condition, 'sort key: d.name, e.salary DESC');
    assert.strictEqual(indexScan.condition, 'condition: (department_id = d.id)');
    assert.deepStrictEqual(indexScan.filters, ["(status = 'active'::text)"]);
    assert.strictEqual(indexScan.table, 'employees');
    assert.strictEqual(indexScan.index, 'employees_department_idx');
  });
  test('PG JSON captures extra details (alias, startup cost, row width)', () => {
    const plan = fs.readFileSync(path.join(exampleDir, '7-postgresql-json-window.json'), 'utf8');
    const detection = new EngineDetector().detect(plan);
    const root = new ParserFactory().create(detection!.engine).parse(plan, detection!);
    const seq = root.children[0].children[0].children[0];
    assert.ok(seq.details?.includes('Alias: d'));
    assert.ok(seq.details?.some((line) => line.startsWith('Row width: 40')));
    assert.ok(seq.details?.some((line) => line.startsWith('Startup cost: 0')));
  });
  test('MySQL JSON captures cost breakdown (read/eval/prefix)', () => {
    const plan = fs.readFileSync(path.join(exampleDir, '3-mysql-json.json'), 'utf8');
    const detection = new EngineDetector().detect(plan);
    const root = new ParserFactory().create(Engine.MySQL).parse(plan, detection!);
    const orders = root.children[0].children[0];
    assert.ok(orders.details?.includes('Read cost: 80200'));
    assert.ok(orders.details?.includes('Eval cost: 12000'));
    assert.ok(orders.details?.includes('Prefix cost: 92200'));
  });
});
