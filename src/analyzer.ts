import { AnnotatedPlan, NodeOperation, PlanIssue, PlanNode, Severity } from './constants';

export class PlanAnalyzer {
  analyze(root: PlanNode, engine: AnnotatedPlan['engine']): AnnotatedPlan {
    const issues: PlanIssue[] = [];
    let nodeCount = 0;
    let estimatedCost = 0;
    let estimatedRows = 0;
    const visit = (current: PlanNode): void => {
      nodeCount += 1;
      estimatedCost += current.estimatedCost;
      estimatedRows = Math.max(estimatedRows, current.estimatedRows);
      if (current.operation === NodeOperation.Scan && current.estimatedRows >= 100000) {this.add(issues, current, 'large-scan', 'critical', `Full scan of ${current.table ?? 'a relation'} with approximately ${current.estimatedRows.toLocaleString()} rows`, 'Consider a selective index for the filter or join columns.');}
      if (current.operation === NodeOperation.Join && current.estimatedRows >= 10000) {this.add(issues, current, 'large-join', 'critical', 'Join processes a large intermediate result', 'Check join order, predicates and indexes on both sides.');}
      if (current.operation === NodeOperation.Sort) {this.add(issues, current, 'temporary-sort', 'warning', 'Sorting may require temporary storage', 'Consider an index that matches ORDER BY or GROUP BY.');}
      current.filters.forEach(filter => { if (current.operation === NodeOperation.Scan && current.estimatedRows >= 10000) {this.add(issues, current, 'filtered-scan', 'warning', `Filter applied after scanning ${current.table ?? 'the relation'}`, `Review whether an index can support: ${filter}`);} });
      current.children.forEach(visit);
    };
    visit(root);
    return { root, issues, engine, totals: { estimatedCost, estimatedRows, nodeCount } };
  }
  private add(issues: PlanIssue[], node: PlanNode, code: string, severity: Severity, message: string, hint: string): void { if (!issues.some(issue => issue.nodeId === node.id && issue.code === code)) {issues.push({ nodeId: node.id, code, severity, message, hint });} }
}
