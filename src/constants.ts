export enum Engine { MySQL = 'mysql', PostgreSQL = 'postgresql', Oracle = 'oracle', SQLite = 'sqlite', SQLServer = 'sqlserver' }
export enum NodeOperation { Scan = 'scan', IndexScan = 'index-scan', Join = 'join', Sort = 'sort', Aggregate = 'aggregate', Filter = 'filter', Limit = 'limit', Materialize = 'materialize', Other = 'other' }
export type Severity = 'info' | 'warning' | 'critical';
export interface DetectionResult { engine: Engine; version?: string; confidence: number; format: 'json' | 'text' | 'xml' }
export interface PlanNode { id: string; operation: NodeOperation; label: string; table?: string; index?: string; possibleKeys?: string[]; keyLength?: string; ref?: string; filtered?: number; usedKeyParts?: string[]; estimatedRows: number; inputRows?: number; estimatedCost: number; actualRows?: number; actualTime?: number; planningTime?: number; executionTime?: number; filters: string[]; extra?: string; condition?: string; details?: string[]; children: PlanNode[] }
export interface PlanIssue { nodeId: string; code: string; severity: Severity; message: string; hint?: string }
export interface AnnotatedPlan { root: PlanNode; issues: PlanIssue[]; engine: DetectionResult; totals: { estimatedCost: number; estimatedRows: number; nodeCount: number }; planningTime?: number; executionTime?: number }
