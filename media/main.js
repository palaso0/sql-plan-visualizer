(() => {
  const vscode = acquireVsCodeApi();
  const plan = window.__PLAN__;
  const svg = document.getElementById("diagram");
  const tooltip = (() => {
    const element = document.createElement("div");
    element.id = "tooltip";
    element.className = "plan-tooltip";
    document.body.appendChild(element);
    return element;
  })();
  const ns = "http://www.w3.org/2000/svg";
  const nodes = plan.nodes;
  const issues = new Map();
  plan.issues.forEach((issue) =>
    issues.set(issue.nodeId, [...(issues.get(issue.nodeId) || []), issue]),
  );

  const childrenOf = (id) => nodes.filter((node) => node.parentId === id);
  const root = nodes.find((node) => !node.parentId);
  const maxDepth = (node) => {
    const kids = childrenOf(node.id);
    if (!kids.length) return 0;
    return 1 + Math.max(...kids.map(maxDepth));
  };
  const flat = root && childrenOf(root.id).length > 0 && maxDepth(root) <= 1;

  const cardWidth = 240;
  let cardHeight = 118;
  const gapXFlow = 30;
  const gapV = 84;
  const gapTree = 60;
  const padding = 60;

  const positions = new Map();
  let totalWidth = 800;
  let totalHeight = 500;
  let ordered = [];
  let entryNodes = [];
  let exitNode = root;
  let layoutMode = "vertical";
  const defaultLayout = "vertical";
  let highlightClauseForNode = () => {};

  if (flat && root) {
    ordered = [...childrenOf(root.id), root];
    entryNodes = [ordered[0]];
    const totalFlowWidth =
      ordered.length * cardWidth + (ordered.length - 1) * gapXFlow;
    const flowHeight = cardHeight + 100;
    ordered.forEach((node, i) => {
      const x = padding + i * (cardWidth + gapXFlow);
      const y = padding + 30;
      positions.set(node.id, { x, y });
    });
    totalWidth = padding * 2 + totalFlowWidth;
    totalHeight = padding * 2 + flowHeight;
  } else if (root) {
    const depth = (node) => {
      let d = 0,
        cur = node;
      while (cur.parentId) {
        d++;
        cur = nodes.find((n) => n.id === cur.parentId) || cur;
      }
      return d;
    };
    const maxD = Math.max(...nodes.map(depth));
    const rows = [];
    nodes.forEach((node) => {
      const d = depth(node);
      const r = maxD - d;
      rows[r] = [...(rows[r] || []), node];
    });
    rows.forEach((row, r) => {
      const rowWidth = row.length * cardWidth + (row.length - 1) * gapTree;
      const startX = Math.max(padding, (totalWidth - rowWidth) / 2);
      row.forEach((node, c) => {
        positions.set(node.id, {
          x: startX + c * (cardWidth + gapTree),
          y: padding + r * (cardHeight + gapV),
        });
      });
    });
    entryNodes = rows[0] || [];
    ordered = nodes;
    totalWidth = Math.max(
      800,
      padding * 2 +
        Math.max(...rows.map((r) => r.length)) * (cardWidth + gapTree),
    );
    totalHeight = padding * 2 + rows.length * (cardHeight + gapV);
  }
  const defaultPositions = new Map(
    [...positions.entries()].map(([id, point]) => [id, { ...point }]),
  );
  const defaultDimensions = { width: totalWidth, height: totalHeight };

  const applyLayout = (mode) => {
    layoutMode = mode;
    if (flat && root) {
      if (mode === "horizontal") {
        ordered.forEach((node, i) =>
          positions.set(node.id, {
            x: padding + i * (cardWidth + gapXFlow),
            y: padding + 30,
          }),
        );
        totalWidth =
          padding * 2 +
          ordered.length * cardWidth +
          (ordered.length - 1) * gapXFlow;
        totalHeight = padding * 2 + cardHeight + 100;
      } else {
        const sources = ordered.slice(0, -1);
        const sourceWidth =
          sources.length * cardWidth +
          Math.max(0, sources.length - 1) * gapXFlow;
        const startX = Math.max(
          padding,
          (sourceWidth + 2 * padding - sourceWidth) / 2,
        );
        sources.forEach((node, i) =>
          positions.set(node.id, {
            x: startX + i * (cardWidth + gapXFlow),
            y: padding + 30,
          }),
        );
        const result = ordered[ordered.length - 1];
        positions.set(result.id, {
          x: startX + Math.max(0, (sourceWidth - cardWidth) / 2),
          y: padding + 30 + cardHeight + 90,
        });
        totalWidth = Math.max(800, sourceWidth + padding * 2);
        totalHeight = padding * 2 + cardHeight * 2 + 120;
      }
    } else if (mode === "horizontal" && root) {
      const depth = (node) => {
        let value = 0,
          current = node;
        while (current.parentId) {
          value++;
          current =
            nodes.find((item) => item.id === current.parentId) || current;
        }
        return value;
      };
      const maxDepthValue = Math.max(...nodes.map(depth));
      const columns = [];
      nodes.forEach((node) => {
        const column = maxDepthValue - depth(node);
        columns[column] = [...(columns[column] || []), node];
      });
      columns.forEach((column, index) =>
        column.forEach((node, row) =>
          positions.set(node.id, {
            x: padding + index * (cardWidth + gapXFlow),
            y: padding + row * (cardHeight + gapV),
          }),
        ),
      );
      totalWidth =
        padding * 2 +
        columns.length * cardWidth +
        Math.max(0, columns.length - 1) * gapXFlow;
      totalHeight =
        padding * 2 +
        Math.max(...columns.map((column) => column.length)) *
          (cardHeight + gapV);
    } else if (mode === "vertical" && root) {
      defaultPositions.forEach((point, id) => positions.set(id, { ...point }));
      totalWidth = defaultDimensions.width;
      totalHeight = defaultDimensions.height;
    }
  };
  applyLayout("vertical");
  let heatMode = "risk";

  const make = (tag, attrs = {}) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };

  const fmt = (v) => {
    if (!v) return "0";
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(Math.round(v));
  };
  const fmtCost = (v) => {
    if (!v) return "0";
    if (v >= 1000000) return `${(v / 1000000).toFixed(2)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(2)}K`;
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  };
  const measure = document.createElement("canvas").getContext("2d");
  const fitTextTo = (text, font, maxWidth) => {
    if (!text) return "";
    measure.font = font;
    if (measure.measureText(text).width <= maxWidth) return text;
    let lo = 1;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measure.measureText(`${text.slice(0, mid)}\u2026`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return `${text.slice(0, lo)}\u2026`;
  };

  const kind = (id) => {
    const current = nodes.find((node) => node.id === id);
    const list = issues.get(id) || [];
    if (heatMode === "cost") {
      const ratio =
        (current?.estimatedCost || 0) / Math.max(1, plan.totals.estimatedCost);
      return ratio >= 0.3 ? "critical" : ratio >= 0.1 ? "warning" : "ok";
    }
    if (heatMode === "rows") {
      const ratio =
        (current?.estimatedRows || 0) / Math.max(1, plan.totals.estimatedRows);
      return ratio >= 0.5 ? "critical" : ratio >= 0.15 ? "warning" : "ok";
    }
    if (list.some((i) => i.severity === "critical")) return "critical";
    if (list.length) return "warning";
    return "ok";
  };

  const ICON_SHAPES = {
    scan: [
      { d: "M3 2.8h10v10.4H3z" },
      { d: "M3 6.2h10" },
      { d: "M6.4 6.2v7M9.7 6.2v7" },
    ],
    "index-scan": [
      { d: "M2.6 2.8h9.4v5.4H2.6z" },
      { d: "M2.6 5.4h9.4" },
      { d: "M4.8 5.4v2.8" },
      { d: "M8.6 10.8a2.2 2.2 0 1 0 4.4 0 2.2 2.2 0 1 0-4.4 0" },
      { d: "M12.4 12.4l1.8 1.8" },
    ],
    join: [
      { d: "M6 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0z" },
      { d: "M2 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0z" },
    ],
    sort: [
      { d: "M5.2 12.8v-7.4" },
      { d: "M3.4 7.2L5.2 5.4l1.8 1.8" },
      { d: "M10.8 3.2v7.4" },
      { d: "M9 8.8L10.8 10.6l1.8-1.8" },
    ],
    aggregate: [
      { d: "M3.2 10.4h2.2v2.9H3.2z", filled: true },
      { d: "M6.9 8.2h2.2v5.1H6.9z", filled: true },
      { d: "M10.6 5.8h2.2v7.5h-2.2z", filled: true },
    ],
    filter: [{ d: "M2.8 3.2h10.4l-3.6 4.6v5H6.4v-5z" }],
    limit: [
      { d: "M3.2 13h9.6" },
      { d: "M8 2.8v8.4" },
      { d: "M5.6 8.4L8 10.8l2.4-2.4" },
    ],
    materialize: [
      { d: "M4 4.6v6.8c0 1.3 1.8 2.2 4 2.2s4-.9 4-2.2V4.6" },
      { d: "M4 4.6c0 1.3 1.8 2.2 4 2.2s4-.9 4-2.2" },
    ],
    other: [
      { d: "M8 2.4l1.2 4.4 4.4 1.2-4.4 1.2L8 13.6l-1.2-4.4L2.4 8l4.4-1.2z", filled: true },
    ],
    result: [
      { d: "M2.6 8a5.4 5.4 0 1 0 10.8 0 5.4 5.4 0 1 0-10.8 0" },
      { d: "M5.6 8.2l1.7 1.7 3.1-3.2" },
    ],
  };
  const appendIcon = (parent, operation, isResult) => {
    const shapes =
      isResult ? ICON_SHAPES.result : ICON_SHAPES[operation] || ICON_SHAPES.other;
    const g = make("g", {
      class: "node-icon",
      transform: "translate(12,13)",
    });
    shapes.forEach((shape) =>
      g.appendChild(
        make("path", {
          d: shape.d,
          ...(shape.filled ? { class: "node-icon-filled" } : {}),
        }),
      ),
    );
    parent.appendChild(g);
  };
    const escapeHtml = (value) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tooltipHtml = (node, info) => {
    const rows = [];
    rows.push(`<div class="tooltip-header">${escapeHtml(info.label)}</div>`);
    rows.push(`<div class="tooltip-desc">${escapeHtml(info.desc)}</div>`);
    const add = (label, value) => {
      if (value !== undefined && value !== "") {
        rows.push(`<div class="tooltip-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`);
      }
    };
    if (
      (node.operation === "scan" || node.operation === "index-scan") &&
      node.label &&
      node.label.length <= 12 &&
      node.label.toLowerCase() !== info.label.toLowerCase()
    ) {
      add("Access", node.label);
    }
    if (node.condition) add("Condition", node.condition);
    if (node.table) add("Table", node.table);
    if (node.index) add("Index", node.index + (node.usedKeyParts?.length ? ` (${node.usedKeyParts.join(", ")})` : ""));
    if (node.possibleKeys?.length) add("Possible keys", node.possibleKeys.join(", "));
    if (node.ref) add("Ref", node.ref);
    if (node.filtered !== undefined) add("Filtered", `${node.filtered}%`);
    if (node.estimatedRows) add("Estimated rows", node.estimatedRows.toLocaleString());
    if (node.estimatedCost) add("Estimated cost", node.estimatedCost.toLocaleString());
    if (node.inputRows) add("Rows examined", node.inputRows.toLocaleString());
    if (node.actualRows) add("Actual rows", node.actualRows.toLocaleString());
    if (node.actualTime) add("Actual time", `${node.actualTime} ms`);
    if (node.filters?.length) add("Filters", node.filters.join(" | "));
    if (node.extra) add("Extra", node.extra);
    if (node.details?.length) {
      rows.push(`<div class="tooltip-section">Details</div>`);
      node.details.forEach((line) => rows.push(`<div class="tooltip-row"><span>${escapeHtml(line)}</span></div>`));
    }
    const issueList = issues.get(node.id);
    if (issueList?.length) {
      rows.push(`<div class="tooltip-section">Attention</div>`);
      issueList.forEach((issue) =>
        rows.push(
          `<div class="tooltip-issue"><strong class="tooltip-${issue.severity}">${issue.severity === "critical" ? "Critical" : "Review"}</strong><span>${escapeHtml(issue.message)}</span><small>${escapeHtml(issue.hint || "")}</small></div>`,
        ),
      );
    }
    return rows.join("");
  };
  const OP_INFO = {
    scan: {
      label: "Sequential Scan",
      desc: "Reads the entire table row by row",
    },
    "index-scan": {
      label: "Index Scan",
      desc: "Reads rows via an index structure",
    },
    join: { label: "Join", desc: "Combines rows from two sources" },
    sort: { label: "Sort", desc: "Orders rows; may use disk space" },
    aggregate: { label: "Aggregate", desc: "Groups or summarizes rows" },
    filter: { label: "Filter", desc: "Applies conditions to remove rows" },
    limit: { label: "Limit", desc: "Restricts the number of output rows" },
    materialize: { label: "Materialize", desc: "Stores intermediate results" },
    other: { label: "Operation", desc: "Executes a database operation" },
  };
  const OP_EXPLAIN = {
    "Seq Scan": { label: "Seq Scan", desc: "Reads the whole table row by row" },
    "Index Scan": { label: "Index Scan", desc: "Looks up rows through an index" },
    "Index Only Scan": { label: "Index Only Scan", desc: "Reads rows directly from the index (covering index)" },
    "Bitmap Heap Scan": { label: "Bitmap Heap Scan", desc: "Reads heap pages listed in a bitmap built from an index" },
    "Bitmap Index Scan": { label: "Bitmap Index Scan", desc: "Builds a bitmap of row locations from an index" },
    "Nested Loop": { label: "Nested Loop", desc: "For each outer row, searches the inner input" },
    "Hash Join": { label: "Hash Join", desc: "Hashes one input and probes it with the other" },
    "Merge Join": { label: "Merge Join", desc: "Sorts both inputs, then merges matching rows" },
    "Hash": { label: "Hash", desc: "Builds an in-memory hash table for a join" },
    "Sort": { label: "Sort", desc: "Orders rows; may spill to disk" },
    "WindowAgg": { label: "Window Aggregate", desc: "Computes window functions (ROW_NUMBER, RANK, COUNT/SUM per row group)" },
    "GroupAggregate": { label: "Group Aggregate", desc: "Groups and aggregates rows after sorting" },
    "HashAggregate": { label: "Hash Aggregate", desc: "Groups and aggregates rows with a hash table" },
    "Aggregate": { label: "Aggregate", desc: "Groups or summarizes rows" },
    "Limit": { label: "Limit", desc: "Stops after N rows" },
    "Gather": { label: "Gather", desc: "Collects rows from parallel workers" },
    "Gather Merge": { label: "Gather Merge", desc: "Collects sorted rows from parallel workers" },
    "Append": { label: "Append", desc: "Combines results from several children (e.g., UNION ALL)" },
    "Result": { label: "Result", desc: "Returns a constant or expression result" },
    "Materialize": { label: "Materialize", desc: "Caches intermediate rows in memory" },
    "Unique": { label: "Unique", desc: "Removes duplicate rows from sorted input" },
    "Memoize": { label: "Memoize", desc: "Caches lookups for repeated keys" },
    "ALL": { label: "Full Scan", desc: "Reads the whole table (no index)" },
    "ref": { label: "Index Lookup", desc: "Looks up rows via a non-unique index" },
    "eq_ref": { label: "Unique Index Lookup", desc: "Looks up one row via a unique index" },
    "const": { label: "Constant Lookup", desc: "Resolves to a constant (one row)" },
    "range": { label: "Index Range", desc: "Scans an index range" },
    "index": { label: "Index Scan", desc: "Reads the whole index (covering)" },
  };

  const getOpInfo = (node) => {
    const explain = OP_EXPLAIN[node.label];
    const base = OP_INFO[node.operation] || OP_INFO.other;
    if (node.id === "root" && node.operation === "other") {
      if (explain) return { label: explain.label, desc: explain.desc };
      return {
        label: "Result",
        desc: `${plan.totals.nodeCount} operations \u00B7 ${plan.engine.engine}`,
      };
    }
    return {
      label: explain ? explain.label : base.label,
      desc: explain ? explain.desc : base.desc,
    };
  };

  const defs = make("defs");
  const arrow = make("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: "5",
    refY: "5",
    markerWidth: "10",
    markerHeight: "10",
    markerUnits: "userSpaceOnUse",
    orient: "auto",
  });
  arrow.appendChild(
    make("path", {
      d: "M 0 0 L 10 5 L 0 10 z",
      fill: "var(--vscode-textLink-foreground, #3794ff)",
    }),
  );
  defs.appendChild(arrow);
  svg.appendChild(defs);
  let edgeCounter = 0;
  const addEdge = (attrs, rows) => {
    const id = `edge-${edgeCounter++}`;
    const path = make("path", { ...attrs, id });
    svg.appendChild(path);
    const ratio = (rows || 1) / Math.max(1, plan.totals.estimatedRows);
    const particles = ratio > 0.35 ? 3 : ratio > 0.1 ? 2 : 1;
    for (let index = 0; index < particles; index++) {
      const particle = make("circle", {
        class: "flow-particle",
        r: ratio > 0.35 ? "3" : "2.5",
      });
      const motion = make("animateMotion", {
        dur: `${1.8 - Math.min(0.5, ratio)}s`,
        repeatCount: "indefinite",
        begin: `${-(index * 0.45)}s`,
      });
      const pathRef = make("mpath", { href: `#${id}` });
      pathRef.setAttributeNS(
        "http://www.w3.org/1999/xlink",
        "xlink:href",
        `#${id}`,
      );
      motion.appendChild(pathRef);
      particle.appendChild(motion);
      svg.appendChild(particle);
    }
  };

  const render = () => {
    cancelAnimationFrame(scrollAnim);
    zoomAnimation?.cancel();
    svg.replaceChildren();
    svg.appendChild(defs);
    svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.style.width = `${totalWidth}px`;
    svg.style.height = `${totalHeight}px`;

    const entry = entryNodes[0];
    const exit = exitNode;

    if (entry) {
      const p = positions.get(entry.id);
      const t = make("text", {
        x: String(p.x),
        y: String(p.y - 16),
        class: "flow-label entry",
        "text-anchor": "start",
      });
      t.textContent = "\u2193 ENTRY \u00B7 data source";
      svg.appendChild(t);
    }
    if (exit && exit.id !== entry?.id) {
      const p = positions.get(exit.id);
      const t = make("text", {
        x: String(p.x),
        y: String(p.y + cardHeight + 20),
        class: "flow-label exit",
        "text-anchor": "start",
      });
      t.textContent = "\u2193 EXIT \u00B7 final result";
      svg.appendChild(t);
    }

    if (flat && layoutMode === "horizontal") {
      for (let i = 0; i < ordered.length - 1; i++) {
        const from = positions.get(ordered[i].id);
        const to = positions.get(ordered[i + 1].id);
        const maxRows = Math.max(1, plan.totals.estimatedRows);
        const strokeW =
          1.5 + Math.min(3, ((ordered[i].estimatedRows || 1) / maxRows) * 3);
        const mx = (from.x + cardWidth + to.x) / 2;
        const my = from.y + cardHeight / 2;
        addEdge(
          {
            class: "edge",
            d: `M ${from.x + cardWidth} ${my} L ${to.x - 8} ${my}`,
            "stroke-width": String(strokeW),
            "marker-end": "url(#arrow)",
            "data-from": ordered[i].id,
            "data-to": ordered[i + 1].id,
          },
          ordered[i].estimatedRows,
        );
      }
    } else {
      nodes
        .filter((node) => node.id !== root?.id && node.parentId)
        .forEach((node) => {
          const from = positions.get(node.id);
          const to = positions.get(node.parentId);
          if (!from || !to) return;
          const vertical = layoutMode === "vertical";
          const fx = vertical ? from.x + cardWidth / 2 : from.x + cardWidth;
          const fy = vertical ? from.y + cardHeight : from.y + cardHeight / 2;
          const tx = vertical ? to.x + cardWidth / 2 : to.x;
          const ty = vertical ? to.y : to.y + cardHeight / 2;
          const midY = (fy + ty) / 2;
          const maxRows = Math.max(1, plan.totals.estimatedRows);
          const strokeW =
            1.5 + Math.min(3, ((node.estimatedRows || 1) / maxRows) * 3);
          addEdge(
            {
              class: "edge",
              d: vertical
                ? `M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty - 8}`
                : `M ${fx} ${fy} C ${midY} ${fy}, ${midY} ${ty}, ${tx} ${ty}`,
              "stroke-width": String(strokeW),
              "marker-end": "url(#arrow)",
              "data-from": node.id,
              "data-to": node.parentId,
            },
            node.estimatedRows,
          );
        });
    }

    ordered.forEach((node) => {
      const p = positions.get(node.id);
      if (!p) return;
      const info = getOpInfo(node);
      const isRoot = node.id === "root";
      const k = kind(node.id);
      const g = make("g", {
        class: `node ${k}${isRoot ? " root" : ""}`,
        transform: `translate(${p.x},${p.y})`,
        "data-id": node.id,
      });
      g.appendChild(
        make("rect", { width: cardWidth, height: cardHeight, rx: "4" }),
      );

      g.setAttribute("aria-label", `${info.label}. ${info.desc}`);

      appendIcon(g, node.operation, isRoot && node.operation === "other");

      const opLabel = make("text", { x: "38", y: "27", class: "operation" });
      opLabel.textContent = fitTextTo(info.label, "600 12px Arial, sans-serif", 190);
      g.appendChild(opLabel);

      if (node.table) {
        const table = make("text", { x: "14", y: "47" });
        const prefix = make("tspan", { class: "node-label" });
        prefix.textContent = "table: ";
        const name = make("tspan", { class: "node-table" });
        name.textContent = fitTextTo(node.table, "600 13px Arial, sans-serif", 196);
        table.appendChild(prefix);
        table.appendChild(name);
        g.appendChild(table);
      } else {
        const desc = make("text", { x: "14", y: "47", class: "node-desc" });
        desc.textContent = fitTextTo(node.condition || info.desc, "10px Arial, sans-serif", 218);
        g.appendChild(desc);
      }

      const detail = make("text", { x: "14", y: "63", class: "node-detail" });
      const detailParts = [];
      if (node.index) detailParts.push(`index ${node.index}`);
      if (node.ref) detailParts.push(`ref ${node.ref}`);
      else if (node.possibleKeys?.length)
        detailParts.push(`possible keys: ${node.possibleKeys.join(", ")}`);
      detail.textContent = fitTextTo(detailParts.join("  "), "10px Arial, sans-serif", 218);
      if (detail.textContent) g.appendChild(detail);

      if (node.condition && node.table) {
        const cond = make("text", { x: "14", y: "79", class: "node-detail" });
        cond.textContent = fitTextTo(node.condition, "10px Arial, sans-serif", 218);
        g.appendChild(cond);
      } else if (node.filtered !== undefined && node.filtered < 100) {
        const filt = make("text", { x: "14", y: "79", class: "node-detail" });
        filt.textContent = `${node.filtered}% filtered`;
        g.appendChild(filt);
      }

      const metric = make("text", { x: "14", y: "95", class: "metric" });
      metric.textContent = fitTextTo(
        `${fmt(node.estimatedRows)} rows   ${fmtCost(node.estimatedCost)} cost`,
        "10px Arial, sans-serif",
        218,
      );
      g.appendChild(metric);
      if (node.actualTime || node.actualRows) {
        const actual = make("text", { x: "14", y: "108", class: "metric" });
        const actualParts = [];
        if (node.actualTime) actualParts.push(`${node.actualTime.toFixed(1)} ms`);
        if (node.actualRows) actualParts.push(`${fmt(node.actualRows)} actual`);
        actual.textContent = actualParts.join("   ");
        g.appendChild(actual);
      }

      if (issues.has(node.id)) {
        const flag = make("text", {
          x: String(cardWidth - 12),
          y: "27",
          class: "flag",
          "text-anchor": "end",
        });
        flag.textContent = `\u26A0 ${issues.get(node.id).length}`;
        g.appendChild(flag);
        const explanation = issues
          .get(node.id)
          .map(
            (issue) =>
              `${issue.severity}: ${issue.message}${issue.hint ? ` ${issue.hint}` : ""}`,
          )
          .join(" | ");
        g.setAttribute("aria-label", `${info.label}. ${explanation}`);
      }

      g.addEventListener("mouseenter", (event) => {
        tooltip.innerHTML = tooltipHtml(node, info);
        tooltip.classList.add("visible");
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY + 14}px`;
      });
      g.addEventListener("mousemove", (event) => {
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY + 14}px`;
      });
      g.addEventListener("mouseleave", () =>
        tooltip.classList.remove("visible"),
      );

      g.addEventListener("click", () => {
        document
          .querySelectorAll(".node")
          .forEach((n) => n.classList.remove("active"));
        g.classList.add("active");
        highlightClauseForNode(node.id);
      });
      g.addEventListener("mouseenter", () => highlightClauseForNode(node.id));
      g.addEventListener("mouseleave", () => clearSqlClauses());
      let drag;
      g.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (panMode) return;
        g.setPointerCapture(event.pointerId);
        drag = {
          x: event.clientX,
          y: event.clientY,
          originX: p.x,
          originY: p.y,
        };
      });
      g.addEventListener("pointermove", (event) => {
        if (!drag) return;
        const nextX = drag.originX + (event.clientX - drag.x) / scale;
        const nextY = drag.originY + (event.clientY - drag.y) / scale;
        g.setAttribute("transform", `translate(${nextX},${nextY})`);
      });
      g.addEventListener("pointerup", (event) => {
        if (!drag) return;
        p.x = drag.originX + (event.clientX - drag.x) / scale;
        p.y = drag.originY + (event.clientY - drag.y) / scale;
        drag = undefined;
        render();
      });
      svg.appendChild(g);
    });
  };

  let scale = 1;
  let zoomAnimation;
  let scrollAnim;
  const currentScale = () => {
    const t = getComputedStyle(svg).transform;
    if (!t || t === "none") return scale;
    return new DOMMatrixReadOnly(t).a;
  };
  const applyScale = () => {
    const margin = Math.max(0, (panel.clientWidth - totalWidth * scale) / 2);
    svg.style.transform = `translate(${margin}px, 0) scale(${scale})`;
    svg.style.transformOrigin = "top left";
    svg.style.marginTop = "0px";
  };
  const zoomTo = (next) => {
    const from = currentScale();
    if (next === from) return;
    cancelAnimationFrame(scrollAnim);
    zoomAnimation?.cancel();
    const viewW = panel.clientWidth;
    const viewH = panel.clientHeight;
    const marginFrom = Math.max(0, (viewW - totalWidth * from) / 2);
    const marginTo = Math.max(0, (viewW - totalWidth * next) / 2);
    const cx = (viewW / 2 - marginFrom + panel.scrollLeft) / from;
    const cy = (viewH / 2 + panel.scrollTop) / from;
    const scrollLeft0 = panel.scrollLeft;
    const scrollTop0 = panel.scrollTop;
    const scrollLeft1 = Math.max(0, marginTo + cx * next - viewW / 2);
    const scrollTop1 = Math.max(0, cy * next - viewH / 2);
    const animation = svg.animate(
      [
        { transform: `translate(${marginFrom}px, 0) scale(${from})` },
        { transform: `translate(${marginTo}px, 0) scale(${next})` },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.645, 0.045, 0.355, 1)",
        fill: "forwards",
      },
    );
    zoomAnimation = animation;
    const duration = 180;
    const start = performance.now();
    const ease = (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      panel.scrollLeft = scrollLeft0 + (scrollLeft1 - scrollLeft0) * e;
      panel.scrollTop = scrollTop0 + (scrollTop1 - scrollTop0) * e;
      if (t < 1) scrollAnim = requestAnimationFrame(step);
    };
    scrollAnim = requestAnimationFrame(step);
    animation.addEventListener(
      "finish",
      () => {
        animation.cancel();
        scale = next;
        applyScale();
        panel.scrollLeft = scrollLeft1;
        panel.scrollTop = scrollTop1;
      },
      { once: true },
    );
  };

  document.getElementById("zoom-in")?.addEventListener("click", () => {
    zoomTo(Math.min(2, scale + 0.1));
  });
  document.getElementById("zoom-out")?.addEventListener("click", () => {
    zoomTo(Math.max(0.5, scale - 0.1));
  });
  document.getElementById("zoom-fit")?.addEventListener("click", fitToPanel);
  const panel = svg.parentElement;
  let panMode = false;
  let panStart;
  const panButton = document.getElementById("pan-toggle");
  panButton?.addEventListener("pointerdown", (event) =>
    event.stopPropagation(),
  );
  panButton?.addEventListener("click", () => {
    panMode = !panMode;
    panButton.classList.toggle("active", panMode);
    panButton.setAttribute("aria-pressed", String(panMode));
    panel.classList.toggle("pan-mode", panMode);
  });
  panel.addEventListener("pointerdown", (event) => {
    if (!panMode) return;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      left: panel.scrollLeft,
      top: panel.scrollTop,
    };
    panel.setPointerCapture(event.pointerId);
  });
  panel.addEventListener("pointermove", (event) => {
    if (!panStart) return;
    panel.scrollLeft = panStart.left - (event.clientX - panStart.x);
    panel.scrollTop = panStart.top - (event.clientY - panStart.y);
  });
  panel.addEventListener("pointerup", () => {
    panStart = undefined;
  });
  document.getElementById("layout")?.addEventListener("change", (event) => {
    applyLayout(event.target.value);
    render();
    fitToPanel();
  });
  document.getElementById("mode")?.addEventListener("change", (event) => {
    heatMode = event.target.value;
    render();
  });
  document.getElementById("export")?.addEventListener("click", () => {
    const clone = svg.cloneNode(true);
    const style = document.createElementNS(ns, "style");
    style.textContent = `.node text{font-family:Arial,sans-serif;fill:#cccccc}.node>rect{fill:#252526;stroke:#454545;stroke-width:1}.node.root>rect{fill:#2d2d30;stroke:#89d185;stroke-width:2}.node.warning>rect{stroke:#e2c08d;stroke-width:2}.node.critical>rect{stroke:#f14c4c;stroke-width:2}.node .node-icon path{fill:none;stroke:#75beff;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}.node .node-icon path.node-icon-filled{fill:#75beff;stroke:none}.node text.operation{font-size:12px;font-weight:600}.node text.node-desc{font-size:10px;fill:#9d9d9d}.node .node-table{font-size:13px;font-weight:600;fill:#75beff}.node .node-label{font-size:10px;fill:#9d9d9d}.node text.node-detail{font-size:10px;fill:#9d9d9d}.node text.metric{font-size:10px;fill:#9d9d9d}.node text.flag{font-size:11px;fill:#e2c08d;font-weight:700}.node.critical text.flag{fill:#f14c4c}.node text.flow-label{font-size:8px;fill:#9d9d9d;font-weight:700}.node text.flow-value{font-size:8px;fill:#cccccc}.node .flow-bar-bg{fill:#454545;stroke:none}.node .flow-bar{fill:#75beff;stroke:none}.node .flow-input{fill:#e2c08d}.node .flow-output{fill:#89d185}.edge{fill:none;stroke:#75beff}.flow-particle{fill:#75beff}.flow-label{font-family:Arial,sans-serif;font-size:11px;font-weight:700}.flow-label.entry{fill:#75beff}.flow-label.exit{fill:#89d185}`;
    clone.insertBefore(style, clone.firstChild);
    clone.removeAttribute("style");
    const bounds = svg.getBBox();
    const margin = 36;
    const exportWidth = Math.ceil(bounds.width + margin * 2);
    const exportHeight = Math.ceil(bounds.height + margin * 2);
    clone.setAttribute(
      "viewBox",
      `${bounds.x - margin} ${bounds.y - margin} ${exportWidth} ${exportHeight}`,
    );
    clone.setAttribute("width", String(exportWidth));
    clone.setAttribute("height", String(exportHeight));
    const source = new XMLSerializer().serializeToString(clone);
    const format = document.getElementById("export-format").value;
    if (format === "svg") {
      vscode.postMessage({
        type: "exportImage",
        data: source,
        extension: "svg",
      });
      return;
    }
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = exportWidth * 2;
      canvas.height = exportHeight * 2;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#1e1e1e";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(2, 2);
      context.drawImage(image, 0, 0, exportWidth, exportHeight);
      const mime = format === "jpg" ? "image/jpeg" : "image/png";
      vscode.postMessage({
        type: "exportImage",
        data: canvas.toDataURL(mime, 0.92),
        extension: format,
      });
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });

  document.getElementById("summary").textContent =
    `${plan.engine.engine}${plan.engine.version ? ` ${plan.engine.version}` : ""} \u00B7 ${plan.totals.nodeCount} operations`;

  document.getElementById("metrics").innerHTML =
    `<div class="stat"><strong>${fmtCost(plan.totals.estimatedCost)}</strong><span>total cost</span></div>` +
    `<div class="stat"><strong>${fmt(plan.totals.estimatedRows)}</strong><span>peak rows</span></div>` +
    `<div class="stat"><strong>${plan.issues.length}</strong><span>warnings</span></div>` +
    `<div class="stat"><strong>${plan.totals.nodeCount}</strong><span>operations</span></div>`;

  const issuePanel = document.getElementById("issues");
  issuePanel.innerHTML = plan.issues.length
    ? plan.issues
        .map(
          (issue) =>
            `<div class="issue" data-target="${issue.nodeId}">` +
            `<div class="issue-line"><i class="severity ${issue.severity}"></i><strong>${issue.message}</strong></div>` +
            `<p>${issue.hint || ""}</p></div>`,
        )
        .join("")
    : '<p class="empty">No high-impact patterns detected.</p>';

  issuePanel.querySelectorAll(".issue").forEach((item) =>
    item.addEventListener("click", () => {
      document
        .querySelectorAll(".node")
        .forEach((n) => n.classList.remove("active"));
      document
        .querySelector(`[data-id="${item.dataset.target}"]`)
        ?.classList.add("active");
      highlightClauseForNode(item.dataset.target);
    }),
  );

  const sqlPanel = document.getElementById("sql-query");
  const clearSqlClauses = () =>
    document
      .querySelectorAll(".sql-clause")
      .forEach((el) => el.classList.remove("active"));
  const SQL_KEYWORDS = new Set(
    "SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL ON GROUP BY HAVING ORDER LIMIT OFFSET AS AND OR NOT IN IS NULL BETWEEN LIKE EXISTS CASE WHEN THEN ELSE END DISTINCT ALL UNION EXCEPT INTERSECT ASC DESC INSERT UPDATE DELETE CREATE ALTER DROP TABLE INDEX VIEW PRIMARY KEY FOREIGN REFERENCES CONSTRAINT COUNT SUM AVG MIN MAX COALESCE CAST INTERVAL CURRENT_DATE CURRENT_TIMESTAMP DATE_SUB DATE_ADD NOW ROUND ABS UPPER LOWER SUBSTRING CONCAT IFNULL NULLIF OVER PARTITION WINDOW WITH RECURSIVE RETURNING VALUES DEFAULT UNIQUE CHECK TRIGGER ROLLUP CUBE FETCH FIRST NEXT ROW ROWS ONLY".split(/\s+/),
  );
  const tokenizeSql = (text) => {
    const tokens = [];
    const re = /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|--[^\n]*|\/\*[\s\S]*?\*\/|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|[()]|[.,;]|[<>=!]+|[-+*/])/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) tokens.push({ type: "plain", text: text.slice(last, m.index), start: last });
      const token = m[0];
      let type = "plain";
      if (token[0] === "'" || token[0] === '"' || token[0] === "`") type = "string";
      else if (token.startsWith("--") || token.startsWith("/*")) type = "comment";
      else if (/^\d/.test(token)) type = "number";
      else if (/^[A-Za-z_]/.test(token)) type = SQL_KEYWORDS.has(token.toUpperCase()) ? "keyword" : "identifier";
      else if (token === "(" || token === ")") type = "paren";
      else if (token === "," || token === "." || token === ";") type = "punct";
      else type = "operator";
      tokens.push({ type, text: token, start: m.index });
      last = re.lastIndex;
    }
    if (last < text.length) tokens.push({ type: "plain", text: text.slice(last), start: last });
    return tokens;
  };
  const appendHighlighted = (parent, text) => {
    tokenizeSql(text).forEach((token) => {
      if (token.type === "plain") parent.appendChild(document.createTextNode(token.text));
      else {
        const span = document.createElement("span");
        span.className = `sql-tok ${token.type}`;
        span.textContent = token.text;
        parent.appendChild(span);
      }
    });
  };
  if (sqlPanel) {
    if (plan.sql) {
      const parseClauseSegments = (sql) => {
        const tokens = tokenizeSql(sql);
        const sig = tokens.filter(
          (t) => t.type === "keyword" || t.type === "paren" || t.type === "punct",
        );
        const segs = [];
        const frames = [{ pending: null, open: 0, parenStart: -1 }];
        const top = () => frames[frames.length - 1];
        const finalize = (frame, end) => {
          if (frame.pending) {
            frame.pending.end = end;
            segs.push(frame.pending);
            frame.pending = null;
          }
        };
        for (let i = 0; i < sig.length; i += 1) {
          const tok = sig[i];
          if (tok.text === "(") {
            const next = sig[i + 1];
            if (next && next.type === "keyword" && /^(SELECT|WITH)$/i.test(next.text)) {
              frames.push({ pending: null, open: 0, parenStart: tok.start });
            } else {
              top().open += 1;
            }
            continue;
          }
          if (tok.text === ")") {
            const frame = top();
            frame.open -= 1;
            if (frame.parenStart >= 0 && frame.open < 0) {
              const inner = { start: frame.parenStart + 1, end: tok.start };
              finalize(frame, tok.start);
              frames.pop();
              const pending = top().pending;
              if (pending) {
                pending.exclusions = pending.exclusions || [];
                pending.exclusions.push(inner);
              }
            }
            continue;
          }
          if (tok.type === "keyword") {
            const word = tok.text.toUpperCase();
            let key;
            let consumed = 0;
            if (word === "GROUP" || word === "ORDER") {
              const next = sig[i + 1];
              if (next && next.type === "keyword" && next.text.toUpperCase() === "BY") {
                key = `${word.toLowerCase()} by`;
                consumed = 1;
              } else {
                continue;
              }
            } else if (/^(SELECT|FROM|WHERE|HAVING|LIMIT|JOIN)$/.test(word)) {
              key = word.toLowerCase();
            } else {
              continue;
            }
            const frame = top();
            if (frame.open > 0) continue;
            let start = tok.start;
            if (key === "join") {
              let j = i - 1;
              while (j >= 0 && sig[j].type === "keyword" && /^(LEFT|RIGHT|INNER|OUTER|FULL|CROSS|NATURAL)$/i.test(sig[j].text)) j -= 1;
              start = sig[j + 1] ? sig[j + 1].start : tok.start;
            }
            finalize(frame, start);
            frame.pending = { key, start, exclusions: [] };
            i += consumed;
            continue;
          }
          if (tok.text === ";" && frames.length === 1 && top().open === 0) {
            finalize(top(), tok.start + 1);
          }
        }
        finalize(top(), sql.length);
        segs.sort((a, b) => a.start - b.start);
        return segs.map((seg) => ({
          key: seg.key,
          start: seg.start,
          end: seg.end,
          full: sql.slice(seg.start, seg.end),
          exclusions: seg.exclusions || [],
        }));
      };

      const segs = parseClauseSegments(plan.sql);
      const segByKey = {};
      segs.forEach((seg, idx) => {
        segByKey[seg.key] = segByKey[seg.key] || [];
        segByKey[seg.key].push(idx);
      });
      const segmentParts = (seg) => {
        const parts = [];
        let cursor = seg.start;
        const ex = [...seg.exclusions].sort((a, b) => a.start - b.start);
        for (const r of ex) {
          if (r.end <= seg.start || r.start >= seg.end) continue;
          if (r.start > cursor) parts.push(plan.sql.slice(cursor, r.start));
          parts.push("\u2026");
          cursor = Math.max(cursor, r.end);
        }
        if (cursor < seg.end) parts.push(plan.sql.slice(cursor, seg.end));
        return parts;
      };
      const formatClause = (seg) => {
        const raw = segmentParts(seg)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!raw) return [];
        const words = raw.split(" ");
        const keyWords = seg.key.split(" ");
        for (let i = 0; i < keyWords.length && i < words.length; i += 1) {
          if (words[i].toLowerCase() === keyWords[i]) words[i] = words[i].toUpperCase();
        }
        const text = words.join(" ");
        if (seg.key === "where" || seg.key === "having") {
          return text.split(/\s+(?=AND\b|OR\b)/i);
        }
        return [text];
      };
      const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordIn = (text, name) => {
        const n = String(name);
        if (!n) return false;
        return new RegExp(`\\b${escapeRegExp(n)}\\b`, "i").test(text);
      };
      const tablesOf = (node, acc = new Set()) => {
        if (node.table) acc.add(node.table);
        (node.children || []).forEach((child) => tablesOf(child, acc));
        return acc;
      };
      const bestForTables = (tables, preferred) => {
        const shortest = (list) => {
          let best;
          for (const i of list) {
            if (best === undefined || segs[i].full.length < segs[best].full.length) best = i;
          }
          return best;
        };
        const preferredMatches = [];
        const otherMatches = [];
        segs.forEach((seg, idx) => {
          let found = false;
          for (const table of tables) {
            if (wordIn(seg.full, table)) {
              found = true;
              break;
            }
          }
          if (!found) return;
          if (preferred.includes(seg.key)) preferredMatches.push(idx);
          else otherMatches.push(idx);
        });
        return shortest(preferredMatches) ?? shortest(otherMatches);
      };
      const segmentForNode = (node) => {
        if (node.id === "root") return segByKey.select ? segByKey.select[0] : undefined;
        const tables = tablesOf(node);
        const firstKey = (key) => (segByKey[key] ? segByKey[key][0] : undefined);
        const firstSelect = () => firstKey("select");
        const op = node.operation;
        if (op === "scan" || op === "index-scan") {
          if (node.table) {
            const idx = bestForTables(new Set([node.table]), ["from", "join", "where", "having"]);
            if (idx !== undefined) return idx;
          }
          return firstKey("from") ?? firstSelect();
        }
        if (op === "join") {
          const idx = bestForTables(tables, ["join", "where"]);
          if (idx !== undefined) return idx;
          return firstKey("join") ?? firstKey("where") ?? firstSelect();
        }
        if (op === "sort") return firstKey("order by") ?? firstKey("group by") ?? firstSelect();
        if (op === "aggregate") return firstKey("group by") ?? firstSelect();
        if (op === "limit") return firstKey("limit");
        if (op === "filter") {
          const idx = bestForTables(tables, ["where", "having"]);
          if (idx !== undefined) return idx;
          return firstKey("where") ?? firstKey("having") ?? firstSelect();
        }
        const idx = bestForTables(tables, []);
        return idx ?? firstSelect();
      };
      const segmentNodes = {};
      const nodeSegment = new Map();
      const highlightNodesFor = (idx, active) => {
        document
          .querySelectorAll(".node")
          .forEach((n) => n.classList.remove("active"));
        if (active) {
          (segmentNodes[idx] || []).forEach((id) =>
            document.querySelector(`[data-id="${id}"]`)?.classList.add("active"),
          );
        }
      };
      const planTables = new Set();
      nodes.forEach((n) => {
        if (n.table) planTables.add(n.table.toLowerCase());
      });
      const sqlTables = new Set();
      const NON_TABLE_WORDS = new Set([
        "from", "join", "on", "using", "as", "and", "or", "cross", "left",
        "right", "inner", "outer", "full", "natural", "asc", "desc",
      ]);
      segs.forEach((seg) => {
        if (seg.key !== "from" && seg.key !== "join") return;
        tokenizeSql(segmentParts(seg).join(" ")).forEach((tok) => {
          const lower = tok.text.toLowerCase();
          if (
            (tok.type === "identifier" || tok.type === "keyword") &&
            !NON_TABLE_WORDS.has(lower)
          ) {
            sqlTables.add(lower);
          } else if (tok.type === "string") {
            const name = tok.text.slice(1, -1).toLowerCase();
            if (/^[a-z_][\w]*$/.test(name)) sqlTables.add(name);
          }
        });
      });
      const sqlTablesList = [...sqlTables];
      const mismatched =
        sqlTablesList.length > 0 &&
        planTables.size > 0 &&
        !sqlTablesList.some((t) => planTables.has(t));

      const sqlSigTokens = tokenizeSql(plan.sql).filter(
        (t) => t.type !== "plain" && t.type !== "comment",
      );
      const hasPgMarker = (() => {
        for (let i = 0; i < sqlSigTokens.length; i += 1) {
          const t = sqlSigTokens[i];
          if (
            t.type === "keyword" &&
            t.text.toUpperCase() === "INTERVAL" &&
            sqlSigTokens[i + 1] &&
            sqlSigTokens[i + 1].type === "string" &&
            /[a-z]/i.test(sqlSigTokens[i + 1].text)
          ) {
            return true;
          }
        }
        return (
          /\bILIKE\b/i.test(plan.sql) ||
          /::\s*(?:integer|bigint|text|varchar|numeric|bool|boolean|timestamp|date)\b/i.test(plan.sql)
        );
      })();
      const hasMySqlMarker =
        sqlSigTokens.some(
          (t) => t.type === "string" && t.text.startsWith("`"),
        ) ||
        sqlSigTokens.some(
          (t) => t.type === "keyword" && /^(DATE_SUB|DATE_ADD)$/i.test(t.text),
        );
      const planEngine = String(plan.engine.engine || "").toUpperCase();
      const dialectIssue =
        planEngine === "MYSQL" && hasPgMarker
          ? "PostgreSQL-style syntax (quoted INTERVAL, :: casts or ILIKE)"
          : planEngine === "POSTGRESQL" && hasMySqlMarker
            ? "MySQL-style syntax (backticks or DATE_SUB/DATE_ADD)"
            : null;

      sqlPanel.textContent = "";
      const hint = document.getElementById("query-hint");
      if (mismatched) {
        if (hint) {
          hint.textContent = `Warning: this SQL doesn't seem to match the plan. Tables in the SQL (${sqlTablesList.slice(0, 4).join(", ")}${sqlTablesList.length > 4 ? "…" : ""}) were not found in the plan (${[...planTables].slice(0, 4).join(", ")}${planTables.size > 4 ? "…" : ""}). Clause highlighting is disabled.`;
          hint.classList.add("warn");
        }
        sqlPanel.appendChild(document.createTextNode(plan.sql));
      } else {
        if (dialectIssue) {
          if (hint) {
            hint.textContent = `Warning: the SQL uses ${dialectIssue}, but the plan is ${planEngine}. Clause highlighting may not reflect the actual plan.`;
            hint.classList.add("warn");
          }
        } else if (hint) {
          hint.textContent = "Hover a clause or plan node to see the mapping.";
        }
        if (!segs.length) {
          sqlPanel.appendChild(document.createTextNode(plan.sql));
        } else {
        segs.forEach((seg, idx) => {
          formatClause(seg).forEach((line) => {
            const span = document.createElement("span");
            span.className = "sql-clause";
            span.dataset.seg = String(idx);
            span.dataset.clause = seg.key;
            span.title = `Show plan nodes for: ${seg.key}`;
            appendHighlighted(span, line);
            span.addEventListener("mouseenter", () => {
              clearSqlClauses();
              span.classList.add("active");
              highlightNodesFor(idx, true);
            });
            span.addEventListener("mouseleave", () => {
              clearSqlClauses();
              highlightNodesFor(idx, false);
            });
            span.addEventListener("click", () => {
              clearSqlClauses();
              span.classList.add("active");
              highlightNodesFor(idx, true);
            });
            sqlPanel.appendChild(span);
            sqlPanel.appendChild(document.createTextNode("\n"));
          });
        });
        nodes.forEach((node) => {
          const idx = segmentForNode(node);
          if (idx !== undefined) {
            nodeSegment.set(node.id, idx);
            if (!segmentNodes[idx]) segmentNodes[idx] = new Set();
            segmentNodes[idx].add(node.id);
          }
        });
      }
      highlightClauseForNode = (nodeId) => {
        const idx = nodeSegment.get(nodeId);
        clearSqlClauses();
        if (idx !== undefined) {
          document
            .querySelectorAll(`.sql-clause[data-seg="${idx}"]`)
            .forEach((el) => el.classList.add("active"));
        }
      };
      }
    } else {
      document.getElementById("query-panel")?.remove();
    }
  }

  const executionOrder = [];
  const collectExecution = (node) => {
    childrenOf(node.id).forEach(collectExecution);
    executionOrder.push(node);
  };
  if (root) collectExecution(root);
  const flowFor = (node) => {
    const input =
      node.inputRows ??
      (node.children.length
        ? Math.max(...node.children.map((child) => child.estimatedRows))
        : node.estimatedRows);
    const inputText = node.operation === "join" && node.children.length > 1
      ? `${fmt(node.children[0].estimatedRows)} outer + ${fmt(node.children[1].estimatedRows)} inner`
      : fmt(input);
    return { input, inputText, output: node.estimatedRows };
  };
  const maxVolume = Math.max(
    1,
    ...nodes.map((node) => Math.max(flowFor(node).input, flowFor(node).output)),
  );
  let flowAnimation;
  const flowHeight = 138;
  const groupPos = (el) => {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(
      (el && el.getAttribute("transform")) || "",
    );
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
  };
  const showFlow = (node) => {
    const group = document.querySelector(`[data-id="${node.id}"]`);
    if (!group) return;
    cancelAnimationFrame(flowAnimation);
    document.querySelectorAll(".node").forEach((item) => {
      item.classList.remove("flow-active");
    });
    group.classList.add("flow-active");
    group.querySelectorAll(".flow-bar,.flow-bar-bg,.flow-label,.flow-value,.metric,.node-detail").forEach((child) => child.remove());
    const rect = group.querySelector("rect");
    rect?.style.setProperty("height", `${flowHeight}px`);
    const pos = groupPos(group);
    if (layoutMode === "vertical" && pos) {
      document.querySelectorAll(`.edge[data-from="${node.id}"]`).forEach((el) => {
        const target = groupPos(document.querySelector(`[data-id="${el.dataset.to}"]`));
        if (!target) return;
        const fx = pos.x + cardWidth / 2;
        const fy = pos.y + flowHeight;
        const tx = target.x + cardWidth / 2;
        const ty = target.y;
        const midY = (fy + ty) / 2;
        el.setAttribute(
          "d",
          `M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty - 8}`,
        );
      });
    }
    if (exitNode && exitNode.id === node.id && pos) {
      document
        .querySelector(".flow-label.exit")
        ?.setAttribute("y", String(pos.y + flowHeight + 20));
    }
    const flow = flowFor(node);
    const flowLine = (y, text) => {
      const el = make("text", { x: "14", y: String(y), class: "metric flow-metric" });
      el.textContent = text;
      group.appendChild(el);
    };
    flowLine(80, `${flow.inputText} rows in`);
    flowLine(92, `→ ${fmt(flow.output)} rows out`);
    const inputLabel = make("text", { x: "14", y: "109", class: "flow-label" });
    inputLabel.textContent = "IN";
    const outputLabel = make("text", {
      x: "14",
      y: "123",
      class: "flow-label",
    });
    outputLabel.textContent = "OUT";
    const inputPercent = Math.round((flow.input / maxVolume) * 100);
    const outputPercent = Math.round((flow.output / maxVolume) * 100);
    const inputValue = make("text", {
      x: "224",
      y: "109",
      class: "flow-value",
      "text-anchor": "end",
    });
    inputValue.textContent = `${fmt(flow.input)} rows · ${inputPercent}%`;
    const outputValue = make("text", {
      x: "224",
      y: "123",
      class: "flow-value",
      "text-anchor": "end",
    });
    outputValue.textContent = `${fmt(flow.output)} rows · ${outputPercent}%`;
    const inputBackground = make("rect", {
      x: "38",
      y: "104",
      width: "100",
      height: "5",
      rx: "2.5",
      class: "flow-bar-bg",
    });
    const outputBackground = make("rect", {
      x: "38",
      y: "118",
      width: "100",
      height: "5",
      rx: "2.5",
      class: "flow-bar-bg",
    });
    const inputBar = make("rect", {
      x: "38",
      y: "104",
      width: "0",
      height: "5",
      rx: "2.5",
      class: "flow-bar flow-input",
    });
    const outputBar = make("rect", {
      x: "38",
      y: "118",
      width: "0",
      height: "5",
      rx: "2.5",
      class: "flow-bar flow-output",
    });
    group.append(
      inputLabel,
      outputLabel,
      inputValue,
      outputValue,
      inputBackground,
      outputBackground,
      inputBar,
      outputBar,
    );
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min(1, (now - start) / 500);
      inputBar.setAttribute(
        "width",
        String(100 * (flow.input / maxVolume) * progress),
      );
      outputBar.setAttribute(
        "width",
        String(100 * (flow.output / maxVolume) * progress),
      );
      if (progress < 1) flowAnimation = requestAnimationFrame(animate);
    };
    flowAnimation = requestAnimationFrame(animate);
  };

  let timer;
  let playbackIndex = 0;
  let playing = false;
  const playButton = document.getElementById("play");
  const pauseButton = document.getElementById("pause");
  const stopButton = document.getElementById("stop");
  const setPlaybackUi = (state) => {
    if (state === "playing") {
      playButton.disabled = true;
      pauseButton.disabled = false;
      stopButton.disabled = false;
    } else if (state === "paused") {
      playButton.disabled = false;
      playButton.textContent = "Resume";
      pauseButton.disabled = true;
      stopButton.disabled = false;
    } else {
      playButton.disabled = false;
      playButton.textContent = "Play execution";
      pauseButton.disabled = true;
      stopButton.disabled = true;
    }
  };
  const playStep = () => {
    if (playbackIndex >= executionOrder.length) {
      clearInterval(timer);
      playing = false;
      setPlaybackUi("idle");
      return;
    }
    document
      .querySelectorAll(".node")
      .forEach((n) => n.classList.remove("pulse"));
    const current = executionOrder[playbackIndex];
    document
      .querySelector(`[data-id="${current.id}"]`)
      ?.classList.add("pulse");
    highlightClauseForNode(current.id);
    showFlow(current);
    playbackIndex += 1;
  };
  const startPlayback = () => {
    if (playbackIndex >= executionOrder.length) {
      playbackIndex = 0;
      cardHeight = 118;
      applyLayout(layoutMode);
      render();
      fitToPanel();
    }
    clearInterval(timer);
    playing = true;
    setPlaybackUi("playing");
    playStep();
    timer = setInterval(playStep, 1200);
  };
  playButton.addEventListener("click", startPlayback);
  pauseButton.addEventListener("click", () => {
    clearInterval(timer);
    playing = false;
    setPlaybackUi("paused");
  });
  stopButton.addEventListener("click", () => {
    clearInterval(timer);
    playing = false;
    playbackIndex = 0;
    cardHeight = 118;
    setPlaybackUi("idle");
    applyLayout(layoutMode);
    render();
    fitToPanel();
  });

  document.getElementById("reset").addEventListener("click", () => {
    clearInterval(timer);
    playing = false;
    playbackIndex = 0;
    cardHeight = 118;
    setPlaybackUi("idle");
    document
      .querySelectorAll(".node")
      .forEach((n) => n.classList.remove("pulse", "active"));
    document
      .querySelectorAll(".sql-clause")
      .forEach((el) => el.classList.remove("active"));
    document
      .querySelectorAll(".flow-bar,.flow-bar-bg")
      .forEach((item) => item.remove());
    layoutMode = defaultLayout;
    document.getElementById("layout").value = defaultLayout;
    if (flat) applyLayout(defaultLayout);
    else {
      defaultPositions.forEach((point, id) => positions.set(id, { ...point }));
      totalWidth = defaultDimensions.width;
      totalHeight = defaultDimensions.height;
    }
    panMode = false;
    panButton?.classList.remove("active");
    panButton?.setAttribute("aria-pressed", "false");
    panel.classList.remove("pan-mode");
    panel.scrollLeft = 0;
    panel.scrollTop = 0;
    render();
    fitToPanel();
  });

  function fitToPanel() {
    cancelAnimationFrame(scrollAnim);
    zoomAnimation?.cancel();
    const panel = svg.parentElement;
    const headerHeight = document.getElementById("query-panel")?.offsetHeight || 0;
    scale =
      layoutMode === "horizontal"
        ? Math.min(
            (panel.clientHeight - headerHeight) / totalHeight,
            panel.clientWidth / totalWidth,
            1,
          )
        : Math.min(panel.clientWidth / totalWidth, 1);
    if (scale < 0.2) scale = 0.2;
    applyScale();
    panel.scrollLeft = 0;
    panel.scrollTop = 0;
  }

  render();
  fitToPanel();
  window.addEventListener("resize", fitToPanel);
})();
