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
  let cardHeight = 100;
  const gapXFlow = 30;
  const gapV = 52;
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
      totalHeight =
        defaultDimensions.height + (cardHeight - 100) * nodes.length;
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

  const ICONS = {
    scan: "\u25A9",
    "index-scan": "\u25A0",
    join: "\u26D3",
    sort: "\u2195",
    aggregate: "\u03A3",
    filter: "\u229B",
    limit: "\u23EB",
    materialize: "\u25C8",
    other: "\u25CB",
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

  const getOpInfo = (node) => {
    if (node.id === "root" && node.operation === "other") {
      return {
        label: "Result",
        desc: `${plan.totals.nodeCount} operations \u00B7 ${plan.engine.engine}`,
        icon: "\u25C9",
      };
    }
    const base = OP_INFO[node.operation] || OP_INFO.other;
    return { ...base, icon: ICONS[node.operation] || ICONS.other };
  };

  const defs = make("defs");
  const arrow = make("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: "5",
    refY: "5",
    markerWidth: "7",
    markerHeight: "7",
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

      const icon = make("text", { x: "14", y: "27", class: "node-icon" });
      icon.textContent = info.icon;
      g.appendChild(icon);

      const opLabel = make("text", { x: "38", y: "27", class: "operation" });
      opLabel.textContent = info.label.slice(0, 24);
      g.appendChild(opLabel);

      const desc = make("text", { x: "14", y: "48", class: "node-desc" });
      desc.textContent = info.desc.slice(0, 36);
      g.appendChild(desc);

      const resource = make("text", { x: "14", y: "66", class: "resource" });
      resource.textContent = (
        node.table
          ? `\u25A4 ${node.table}${node.index ? ` \u00B7 ${node.index}` : ""}`
          : ""
      ).slice(0, 36);
      g.appendChild(resource);

      const metric = make("text", { x: "14", y: "86", class: "metric" });
      const parts = [
        `${fmt(node.estimatedRows)} rows`,
        `${fmt(node.estimatedCost)} cost`,
      ];
      if (node.actualTime) parts.push(`${node.actualTime.toFixed(1)} ms`);
      if (node.actualRows) parts.push(`${fmt(node.actualRows)} actual`);
      metric.textContent = parts.join("   ");
      g.appendChild(metric);

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
        g.setAttribute("title", explanation);
        g.setAttribute("aria-label", `${info.label}. ${explanation}`);
        g.addEventListener("mouseenter", (event) => {
          tooltip.innerHTML = issues
            .get(node.id)
            .map(
              (issue) =>
                `<div class="tooltip-issue"><strong class="tooltip-${issue.severity}">${issue.severity === "critical" ? "Critical" : "Review"}</strong><span>${issue.message}</span><small>${issue.hint || ""}</small></div>`,
            )
            .join("");
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
      }

      g.addEventListener("click", () => {
        document
          .querySelectorAll(".node")
          .forEach((n) => n.classList.remove("active"));
        g.classList.add("active");
      });
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
  const applyScale = () => {
    svg.style.transform = `scale(${scale})`;
    svg.style.transformOrigin = "top left";
    svg.style.marginLeft = `${Math.max(0, (panel.clientWidth - totalWidth * scale) / 2 / scale)}px`;
    svg.style.marginTop = "0px";
  };

  document.getElementById("zoom-in")?.addEventListener("click", () => {
    scale = Math.min(2, scale + 0.1);
    applyScale();
  });
  document.getElementById("zoom-out")?.addEventListener("click", () => {
    scale = Math.max(0.5, scale - 0.1);
    applyScale();
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
    style.textContent = `.node text{font-family:Arial,sans-serif;fill:#cccccc}.node>rect{fill:#252526;stroke:#454545;stroke-width:1}.node.root>rect{fill:#2d2d30;stroke:#89d185;stroke-width:2}.node.warning>rect{stroke:#e2c08d;stroke-width:2}.node.critical>rect{stroke:#f14c4c;stroke-width:2}.node text.node-icon{font-size:16px;fill:#75beff}.node text.operation{font-size:12px;font-weight:600}.node text.node-desc{font-size:10px;fill:#9d9d9d}.node text.resource{font-size:11px;fill:#75beff}.node text.metric{font-size:10px;fill:#9d9d9d}.node text.flag{font-size:11px;fill:#e2c08d;font-weight:700}.node.critical text.flag{fill:#f14c4c}.node text.flow-label{font-size:8px;fill:#9d9d9d;font-weight:700}.node text.flow-value{font-size:8px;fill:#cccccc}.node .flow-bar-bg{fill:#454545;stroke:none}.node .flow-bar{fill:#75beff;stroke:none}.node .flow-input{fill:#e2c08d}.node .flow-output{fill:#89d185}.edge{fill:none;stroke:#75beff}.flow-particle{fill:#75beff}.flow-label{font-family:Arial,sans-serif;font-size:11px;font-weight:700}.flow-label.entry{fill:#75beff}.flow-label.exit{fill:#89d185}`;
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
    `<div class="stat"><strong>${fmt(plan.totals.estimatedCost)}</strong><span>total cost</span></div>` +
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
    }),
  );

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
  const showFlow = (node) => {
    const group = document.querySelector(`[data-id="${node.id}"]`);
    if (!group) return;
    cancelAnimationFrame(flowAnimation);
    document.querySelectorAll(".node").forEach((item) => {
      item.classList.remove("flow-active");
    });
    group.classList.add("flow-active");
    group.querySelectorAll(".flow-bar,.flow-bar-bg,.flow-label,.flow-value").forEach((child) => child.remove());
    group.querySelector("rect")?.setAttribute("height", "128");
    const metric = group.querySelector(".metric");
    const flow = flowFor(node);
    if (metric)
      metric.textContent = `${flow.inputText} rows in  →  ${fmt(flow.output)} rows out`;
    const inputLabel = make("text", { x: "14", y: "103", class: "flow-label" });
    inputLabel.textContent = "IN";
    const outputLabel = make("text", {
      x: "14",
      y: "118",
      class: "flow-label",
    });
    outputLabel.textContent = "OUT";
    const inputPercent = Math.round((flow.input / maxVolume) * 100);
    const outputPercent = Math.round((flow.output / maxVolume) * 100);
    const inputValue = make("text", {
      x: "224",
      y: "103",
      class: "flow-value",
      "text-anchor": "end",
    });
    inputValue.textContent = `${fmt(flow.input)} rows · ${inputPercent}%`;
    const outputValue = make("text", {
      x: "224",
      y: "118",
      class: "flow-value",
      "text-anchor": "end",
    });
    outputValue.textContent = `${fmt(flow.output)} rows · ${outputPercent}%`;
    const inputBackground = make("rect", {
      x: "38",
      y: "98",
      width: "100",
      height: "5",
      rx: "2.5",
      class: "flow-bar-bg",
    });
    const outputBackground = make("rect", {
      x: "38",
      y: "113",
      width: "100",
      height: "5",
      rx: "2.5",
      class: "flow-bar-bg",
    });
    const inputBar = make("rect", {
      x: "38",
      y: "98",
      width: "0",
      height: "5",
      rx: "2.5",
      class: "flow-bar flow-input",
    });
    const outputBar = make("rect", {
      x: "38",
      y: "113",
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
  document.getElementById("play").addEventListener("click", (event) => {
    if (event.target.dataset.playing === "true") {
      clearInterval(timer);
      event.target.dataset.playing = "false";
      event.target.textContent = "Resume";
      return;
    }
    if (playbackIndex >= executionOrder.length) {
      playbackIndex = 0;
      cardHeight = 100;
      applyLayout(layoutMode);
      render();
      fitToPanel();
    }
    event.target.dataset.playing = "true";
    event.target.textContent = "Pause";
    const step = () => {
      if (playbackIndex >= executionOrder.length) {
        clearInterval(timer);
        event.target.dataset.playing = "false";
        event.target.textContent = "Replay execution";
        return;
      }
      document
        .querySelectorAll(".node")
        .forEach((n) => n.classList.remove("pulse"));
      const current = executionOrder[playbackIndex];
      document
        .querySelector(`[data-id="${current.id}"]`)
        ?.classList.add("pulse");
      showFlow(current);
      playbackIndex += 1;
    };
    step();
    timer = setInterval(step, 1200);
  });

  document.getElementById("reset").addEventListener("click", () => {
    clearInterval(timer);
    const play = document.getElementById("play");
    playbackIndex = 0;
    cardHeight = 100;
    play.dataset.playing = "false";
    play.textContent = "Play execution";
    document
      .querySelectorAll(".node")
      .forEach((n) => n.classList.remove("pulse", "active"));
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
    const panel = svg.parentElement;
    scale =
      layoutMode === "horizontal"
        ? Math.min(
            panel.clientHeight / totalHeight,
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
