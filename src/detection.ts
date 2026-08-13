import { DetectionResult, Engine } from './constants';

const json = (value: string): boolean => { try { JSON.parse(value); return true; } catch { return false; } };
export class EngineDetector {
  detect(input: string): DetectionResult | undefined {
    const value = input.trim();
    if (!value) {return undefined;}
    if (/<ShowPlanXML|ShowPlanXML|ShowPlanRS/i.test(value)) {return { engine: Engine.SQLServer, confidence: 0.99, format: 'xml' };}
    if (json(value)) {
      if (/"query_block"|"nested_loop"|"table_name"/.test(value)) {return { engine: Engine.MySQL, version: this.version(value), confidence: 0.98, format: 'json' };}
      if (/"Node Type"|"Plan"|"Plans"/.test(value)) {return { engine: Engine.PostgreSQL, version: this.version(value), confidence: 0.98, format: 'json' };}
    }
    if (/PLAN_TABLE_OUTPUT|\bDBMS_XPLAN\b|\|\s*Operation\s*\|/i.test(value)) {return { engine: Engine.Oracle, confidence: 0.95, format: 'text' };}
    if (/EXPLAIN QUERY PLAN|\bSCAN\s+\w+|\bSEARCH\s+\w+\s+USING/i.test(value) && !/select_type|key_len/i.test(value)) {return { engine: Engine.SQLite, confidence: 0.9, format: 'text' };}
    if (/select_type|key_len|Using (filesort|temporary)|query_block/i.test(value)) {return { engine: Engine.MySQL, confidence: 0.9, format: 'text' };}
    if (/QUERY PLAN|Seq Scan|Index Scan|Nested Loop|Hash Join|Bitmap Heap Scan/i.test(value)) {return { engine: Engine.PostgreSQL, confidence: 0.82, format: 'text' };}
    return undefined;
  }
  private version(input: string): string | undefined { const match = input.match(/(?:version|Version)[^\d]*(\d+(?:\.\d+)+)/); return match?.[1]; }
}
