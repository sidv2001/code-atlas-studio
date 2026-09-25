import { lastSourceLine, parseAtlasGraph, sourceHref } from "./graph.ts";
import type { AtlasGraph, AtlasNode, NodeKind, Provenance, SourceRange } from "./types.ts";

const svgNamespace = "http://www.w3.org/2000/svg";
const kindLabels: Record<NodeKind, string> = {
  module: "Directory group",
  file: "File",
  component: "Component",
  class: "Class",
  function: "Function",
  interface: "Interface",
  type: "Type",
};
const provenanceLabels: Record<Provenance, string> = {
  extracted: "From syntax",
  curated: "Grouped by path",
  proposed: "Proposed only",
};

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(name);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function sourceDescription(source: SourceRange): string {
  const last = lastSourceLine(source);
  return `${source.path} / ${source.start.line}${last === source.start.line ? "" : `-${last}`}`;
}

function sourcePreview(text: string, source: SourceRange, isFile: boolean): HTMLElement {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const firstLine = isFile ? 1 : Math.max(1, source.start.line - 2);
  const lastLine = Math.min(
    lines.length,
    isFile ? 11 : Math.max(firstLine + 8, Math.min(lastSourceLine(source) + 2, firstLine + 11)),
  );
  const preview = element("pre", "source-preview");
  preview.setAttribute("aria-label", `Source excerpt from ${source.path}`);
  const code = element("code");

  for (let line = firstLine; line <= lastLine; line += 1) {
    const row = element("span", "source-line");
    if (line >= source.start.line && line <= lastSourceLine(source)) {
      row.classList.add("source-line--selected");
    }
    const number = element("span", "source-line-number", String(line).padStart(2, " "));
    number.setAttribute("aria-hidden", "true");
    row.append(number, element("span", "source-line-text", lines[line - 1] ?? ""));
    code.append(row);
  }
  preview.append(code);
  return preview;
}

export function mountAtlas(
  root: HTMLElement,
  rawGraph: unknown,
  sourceTexts: Readonly<Record<string, string>>,
): () => void {
  const graph: AtlasGraph = parseAtlasGraph(rawGraph);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const buttons = new Map<string, HTMLButtonElement[]>();
  const fileButtons = new Map<string, HTMLButtonElement>();
  const defaultNode =
    graph.nodes.find((node) => node.kind === "component" && node.provenance === "extracted") ??
    graph.nodes.find((node) => node.kind === "file") ??
    graph.nodes[0];
  const requestedId = new URL(window.location.href).searchParams.get("node");
  let selectedId = requestedId && byId.has(requestedId) ? requestedId : defaultNode.id;

  function children(parentId: string | null): AtlasNode[] {
    return graph.nodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function choice(node: AtlasNode, className: string): HTMLButtonElement {
    const button = element("button", className);
    button.type = "button";
    button.dataset.nodeId = node.id;
    button.setAttribute(
      "aria-label",
      `${node.label}, ${kindLabels[node.kind]}, ${provenanceLabels[node.provenance]}`,
    );
    button.addEventListener("click", () => select(node.id));
    buttons.set(node.id, [...(buttons.get(node.id) ?? []), button]);
    return button;
  }

  const app = element("div", "atlas-app");
  const skip = element("a", "skip-link", "Skip to the architecture outline");
  skip.href = "#architecture-outline";
  app.append(skip);

  const hero = element("header", "hero");
  const brand = element("div", "brand");
  const mark = element("span", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  mark.append(element("span"), element("span"), element("span"));
  brand.append(mark, element("span", "brand-name", "CODE / ATLAS"));
  const eyebrow = element("p", "eyebrow", "A small reading surface for code");
  const title = element("h1", "hero-title", "Find your bearings in the code.");
  const intro = element(
    "p",
    "hero-intro",
    "Trace a tiny delivery-board example from directories to files to declarations. Select anything to see where it came from, and keep a new idea separate from what's already written.",
  );
  const countRow = element("div", "count-row");
  for (const [value, label] of [
    [graph.analysis.fileCount, "source files"],
    [graph.edges.length, "static imports"],
    [graph.nodes.filter((node) => node.provenance === "proposed").length, "proposed idea"],
  ] as const) {
    const count = element("div", "count");
    count.append(element("strong", undefined, String(value)), element("span", undefined, label));
    countRow.append(count);
  }
  const heroCopy = element("div", "hero-copy");
  heroCopy.append(eyebrow, title, intro, countRow);
  const heroCard = element("div", "hero-card");
  heroCard.append(
    element("p", "hero-card-label", "READING KEY / 01"),
    element("p", "hero-card-title", "Follow the evidence."),
    element(
      "p",
      "hero-card-body",
      "Solid cards point to source. The dashed card is a conversation starter. Lines connect files with static local imports.",
    ),
  );
  const heroInner = element("div", "hero-inner");
  heroInner.append(heroCopy, heroCard);
  hero.append(brand, heroInner);

  const main = element("main", "main");
  main.id = "main-content";
  const strip = element("section", "scope-strip");
  strip.setAttribute("aria-label", "Data availability");
  const scope = element("div", "scope-copy");
  scope.append(
    element("span", "scope-dot"),
    element("span", undefined, "Original fixture / TypeScript syntax"),
  );
  const availability = element("div", "availability");
  availability.append(
    element("span", "availability-tag", "Diff: no comparison loaded"),
    element("span", "availability-tag", "Coverage: no data loaded"),
  );
  strip.append(scope, availability);

  const warning = element("p", "analysis-warning");
  const missing = graph.analysis.unresolvedRelativeImports.length;
  const bare = graph.analysis.unmappedBareImports;
  if (missing || bare) {
    warning.textContent = `${missing} relative import${missing === 1 ? "" : "s"} could not be mapped; ${bare} bare import${bare === 1 ? "" : "s"} were left out of the map.`;
    warning.setAttribute("role", "status");
  } else {
    warning.hidden = true;
  }

  const workspace = element("div", "workspace");
  const mapSection = element("section", "map-panel");
  mapSection.setAttribute("aria-labelledby", "map-title");
  const mapTop = element("div", "panel-top");
  const mapTopText = element("div");
  mapTopText.append(
    element("p", "section-index", "01 / THE MAP"),
    element("h2", "panel-title", graph.repository.name),
  );
  mapTopText.querySelector("h2")!.id = "map-title";
  mapTop.append(mapTopText, element("span", "panel-note", "Directory / file / declaration"));

  const stage = element("div", "map-stage");
  stage.setAttribute("role", "group");
  stage.setAttribute("aria-label", "Nested architecture map; press Tab to navigate and Enter or Space to select");
  const connections = document.createElementNS(svgNamespace, "svg");
  connections.classList.add("connections");
  connections.setAttribute("aria-hidden", "true");
  const modules = element("div", "module-grid");

  for (const module of children(null)) {
    const group = element("section", "module-panel");
    group.setAttribute("aria-label", `${module.label} directory group`);
    const groupHeader = element("div", "module-header");
    const groupButton = choice(module, "module-button");
    groupButton.append(
      element("span", "module-index", "DIRECTORY"),
      element("span", "module-name", module.label),
    );
    groupHeader.append(groupButton, element("span", "module-decoration"));
    group.append(groupHeader);

    for (const child of children(module.id)) {
      if (child.kind === "file") {
        const card = element("article", "file-card");
        const fileButton = choice(child, "file-button");
        fileButton.append(
          element("span", "file-extension", child.label.endsWith(".tsx") ? "TSX" : "TS"),
          element("span", "file-name", child.label),
        );
        fileButtons.set(child.id, fileButton);
        card.append(fileButton);
        const symbols = children(child.id);
        if (symbols.length) {
          const symbolList = element("div", "symbol-list");
          for (const symbol of symbols) {
            const symbolButton = choice(symbol, "symbol-button");
            symbolButton.append(
              element("span", "symbol-kind", kindLabels[symbol.kind]),
              element("span", "symbol-name", symbol.label),
            );
            symbolList.append(symbolButton);
          }
          card.append(symbolList);
        }
        group.append(card);
      } else if (child.provenance === "proposed") {
        const idea = element("div", "proposal-card");
        const ideaButton = choice(child, "proposal-button");
        ideaButton.append(
          element("span", "proposal-kicker", "PROPOSED / NO SOURCE"),
          element("span", "proposal-name", child.label),
          element("span", "proposal-kind", `Possible ${kindLabels[child.kind].toLowerCase()}`),
        );
        idea.append(ideaButton);
        group.append(idea);
      }
    }
    modules.append(group);
  }
  stage.append(connections, modules);

  const mapBottom = element("div", "map-bottom");
  const key = element("div", "legend");
  key.append(
    element("span", "legend-item legend-item--source", "Extracted from source"),
    element("span", "legend-item legend-item--group", "Directory grouping"),
    element("span", "legend-item legend-item--idea", "Proposed idea"),
    element("span", "legend-item legend-item--import", "Static import"),
  );
  mapBottom.append(
    key,
    element("p", "map-instruction", "Tab through the map or use the outline. Both select the same detail."),
  );
  mapSection.append(mapTop, stage, mapBottom);

  const rail = element("aside", "side-rail");
  const outline = element("nav", "outline-panel");
  outline.id = "architecture-outline";
  outline.tabIndex = -1;
  outline.setAttribute("aria-label", "Architecture outline");
  outline.append(
    element("p", "section-index", "02 / THE OUTLINE"),
    element("h2", "rail-title", "Browse the structure"),
  );
  function outlineList(parentId: string | null): HTMLUListElement {
    const list = element("ul", parentId === null ? "outline-list" : "outline-children");
    for (const item of children(parentId)) {
      const row = element("li", "outline-item");
      const button = choice(item, "outline-button");
      button.append(
        element("span", "outline-kind", item.provenance === "proposed" ? "Idea" : kindLabels[item.kind]),
        element("span", "outline-label", item.label),
      );
      row.append(button);
      if (children(item.id).length) row.append(outlineList(item.id));
      list.append(row);
    }
    return list;
  }
  outline.append(outlineList(null));

  const details = element("section", "detail-panel");
  details.setAttribute("aria-labelledby", "detail-title");
  const detailBody = element("div", "detail-body");
  const announcement = element("p", "visually-hidden");
  announcement.setAttribute("role", "status");
  details.append(detailBody, announcement);
  rail.append(outline, details);
  workspace.append(mapSection, rail);

  const notice = element("p", "link-notice");
  const staleLinkMessage = "That shared item is not in this fixture. Showing a source declaration instead.";
  if (requestedId && !byId.has(requestedId)) {
    notice.textContent = staleLinkMessage;
    notice.setAttribute("role", "status");
  } else {
    notice.hidden = true;
  }
  const footer = element("footer", "footer");
  footer.append(
    element("span", undefined, "A small, original example for reviewing code with care."),
    element("span", undefined, "Code Atlas Studio / public starter"),
  );
  main.append(strip, warning, notice, workspace);
  app.append(hero, main, footer);
  root.replaceChildren(app);

  function activeFile(item: AtlasNode): string | undefined {
    if (item.kind === "file") return item.id;
    const parent = byId.get(item.parentId ?? "");
    return parent?.kind === "file" ? parent.id : undefined;
  }

  function renderDetails(item: AtlasNode): void {
    const contents = element("div");
    const meta = element("p", "detail-kicker", `03 / INSPECT  -  ${kindLabels[item.kind].toUpperCase()}`);
    const heading = element("h2", "detail-title", item.label);
    heading.id = "detail-title";
    const badge = element("span", `provenance-badge provenance-badge--${item.provenance}`, provenanceLabels[item.provenance]);
    contents.append(meta, heading, badge);

    if (item.description) contents.append(element("p", "detail-description", item.description));
    if (item.kind === "component" && item.provenance === "extracted") {
      contents.append(
        element("p", "detail-hint", "Indexed as a component because its exported PascalCase declaration contains JSX."),
      );
    }
    if (item.kind === "module") {
      const files = children(item.id).filter((child) => child.kind === "file");
      contents.append(element("p", "detail-description", `${files.length} indexed file${files.length === 1 ? "" : "s"} in this directory.`));
    }
    if (item.provenance === "proposed") {
      contents.append(element("p", "proposal-status", "Idea for discussion / no source file"));
    }

    if (item.source) {
      const source = item.source;
      const sourceHeader = element("div", "source-header");
      sourceHeader.append(
        element("h3", "detail-subtitle", "Source location"),
        element("span", "source-location", sourceDescription(source)),
      );
      contents.append(sourceHeader);
      if (graph.repository.sourceBaseUrl) {
        const link = element("a", "source-link", "Open these lines in the repository");
        link.href = sourceHref(graph.repository.sourceBaseUrl, source);
        contents.append(link);
      }
      const text = sourceTexts[source.path];
      if (typeof text === "string") {
        contents.append(sourcePreview(text, source, item.kind === "file"));
      } else {
        contents.append(element("p", "detail-hint", "Source excerpt is unavailable for this graph."));
      }
    }

    const fileId = activeFile(item);
    if (fileId) {
      const imports = graph.edges.filter((edge) => edge.from === fileId || edge.to === fileId);
      const section = element("div", "relationships");
      section.append(
        element("h3", "detail-subtitle", "Static file imports"),
        element(
          "p",
          "detail-hint",
          item.kind === "file"
            ? "Select a related file to follow its import."
            : "These imports belong to the containing file, not necessarily to this declaration.",
        ),
      );
      if (imports.length) {
        const list = element("ul", "relationship-list");
        for (const edge of imports) {
          const outgoing = edge.from === fileId;
          const related = byId.get(outgoing ? edge.to : edge.from)!;
          const row = element("li");
          const link = element("button", "relationship-button");
          link.type = "button";
          link.addEventListener("click", () => select(related.id));
          link.append(
            element("span", "relationship-direction", outgoing ? "IMPORTS" : "IMPORTED BY"),
            element("span", "relationship-target", related.label),
            element("span", "relationship-line", `${edge.source.path}:${edge.source.start.line}`),
          );
          row.append(link);
          list.append(row);
        }
        section.append(list);
      } else {
        section.append(element("p", "detail-hint", "No indexed local imports for this file."));
      }
      contents.append(section);
    }

    detailBody.replaceChildren(contents);
  }

  function drawConnections(): void {
    const bounds = stage.getBoundingClientRect();
    connections.replaceChildren();
    if (!bounds.width || !bounds.height) return;
    connections.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);

    const definitions = document.createElementNS(svgNamespace, "defs");
    const arrow = document.createElementNS(svgNamespace, "marker");
    arrow.setAttribute("id", "import-arrow");
    arrow.setAttribute("viewBox", "0 0 10 10");
    arrow.setAttribute("refX", "8");
    arrow.setAttribute("refY", "5");
    arrow.setAttribute("markerWidth", "7");
    arrow.setAttribute("markerHeight", "7");
    arrow.setAttribute("orient", "auto-start-reverse");
    const arrowHead = document.createElementNS(svgNamespace, "path");
    arrowHead.setAttribute("d", "M 1 1 L 9 5 L 1 9 z");
    arrowHead.setAttribute("fill", "#759799");
    arrow.append(arrowHead);
    definitions.append(arrow);
    connections.append(definitions);

    const fileId = activeFile(byId.get(selectedId)!);
    for (const edge of graph.edges) {
      const from = fileButtons.get(edge.from)?.getBoundingClientRect();
      const to = fileButtons.get(edge.to)?.getBoundingClientRect();
      if (!from || !to) continue;
      const fromX = from.left + from.width / 2;
      const fromY = from.top + from.height / 2;
      const toX = to.left + to.width / 2;
      const toY = to.top + to.height / 2;
      const horizontal = Math.abs(toX - fromX) > Math.min(from.width, to.width) * 0.9;
      let curve: string;
      if (horizontal) {
        const direction = toX >= fromX ? 1 : -1;
        const x1 = (direction > 0 ? from.right : from.left) - bounds.left;
        const x2 = (direction > 0 ? to.left : to.right) - bounds.left;
        const y1 = fromY - bounds.top;
        const y2 = toY - bounds.top;
        const bend = Math.max(30, Math.abs(x2 - x1) * 0.4);
        curve = `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`;
      } else {
        const direction = toY >= fromY ? 1 : -1;
        const x1 = fromX - bounds.left;
        const x2 = toX - bounds.left;
        const y1 = (direction > 0 ? from.bottom : from.top) - bounds.top;
        const y2 = (direction > 0 ? to.top : to.bottom) - bounds.top;
        const bend = Math.max(26, Math.abs(y2 - y1) * 0.4);
        curve = `M ${x1} ${y1} C ${x1} ${y1 + bend * direction}, ${x2} ${y2 - bend * direction}, ${x2} ${y2}`;
      }
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("d", curve);
      path.setAttribute("marker-end", "url(#import-arrow)");
      path.classList.add("connection");
      if (fileId && (edge.from === fileId || edge.to === fileId)) {
        path.classList.add("connection--related");
      }
      connections.append(path);
    }
  }

  function showSelection(): void {
    const item = byId.get(selectedId)!;
    for (const [id, nodeButtons] of buttons) {
      for (const button of nodeButtons) {
        if (id === selectedId) {
          button.setAttribute("aria-current", "true");
        } else {
          button.removeAttribute("aria-current");
        }
      }
    }
    renderDetails(item);
    announcement.textContent = `${item.label} selected. ${kindLabels[item.kind]}. ${provenanceLabels[item.provenance]}.`;
    drawConnections();
  }

  function select(id: string): void {
    if (!byId.has(id)) throw new Error(`Unknown atlas node: ${id}`);
    if (selectedId === id) return;
    selectedId = id;
    notice.hidden = true;
    const url = new URL(window.location.href);
    url.searchParams.set("node", id);
    window.history.pushState(null, "", url);
    showSelection();
  }

  function onPopState(): void {
    const id = new URL(window.location.href).searchParams.get("node");
    selectedId = id && byId.has(id) ? id : defaultNode.id;
    notice.hidden = !id || byId.has(id);
    if (!notice.hidden) notice.textContent = staleLinkMessage;
    showSelection();
  }

  showSelection();
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(drawConnections);
  resizeObserver?.observe(stage);
  window.addEventListener("resize", drawConnections);
  window.addEventListener("popstate", onPopState);
  return () => {
    resizeObserver?.disconnect();
    window.removeEventListener("resize", drawConnections);
    window.removeEventListener("popstate", onPopState);
  };
}
