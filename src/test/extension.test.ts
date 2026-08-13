import * as assert from 'assert';
import { Engine, NodeOperation } from '../constants';
import { EngineDetector } from '../detection';
import { ParserFactory } from '../parsers';
import { PlanAnalyzer } from '../analyzer';

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
});
