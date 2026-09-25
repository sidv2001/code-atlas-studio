import type {
  AtlasGraph,
  AtlasNode,
  ImportEdge,
  NodeKind,
  Position,
  Provenance,
  SourceRange,
  UnresolvedImport,
} from "./types.ts";

const kinds: readonly NodeKind[] = [
  "module",
  "file",
  "component",
  "class",
  "function",
  "interface",
  "type",
];
const provenances: readonly Provenance[] = ["extracted", "curated", "proposed"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid atlas: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  return value as Record<string, unknown>;
}

function nonempty(value: unknown, name: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${name} must be a nonempty string`);
  return value;
}

function nonnegativeInteger(value: unknown, name: string): number {
  assert(typeof value === "number" && Number.isInteger(value) && value >= 0, `${name} must be a nonnegative integer`);
  return value;
}

function position(value: unknown, name: string): Position {
  const point = record(value, name);
  const line = nonnegativeInteger(point.line, `${name}.line`);
  const column = nonnegativeInteger(point.column, `${name}.column`);
  assert(line > 0 && column > 0, `${name} uses one-based positions`);
  return { line, column };
}

function sourceRange(value: unknown, name: string): SourceRange {
  const input = record(value, name);
  const sourcePath = nonempty(input.path, `${name}.path`);
  assert(
    !sourcePath.startsWith("/") &&
      !sourcePath.includes("\\") &&
      sourcePath.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    `${name}.path must be repository-relative`,
  );
  const start = position(input.start, `${name}.start`);
  const end = position(input.end, `${name}.end`);
  assert(
    end.line > start.line || (end.line === start.line && end.column >= start.column),
    `${name}.end must follow its start`,
  );
  return { path: sourcePath, start, end };
}

function node(value: unknown): AtlasNode {
  const input = record(value, "node");
  const id = nonempty(input.id, "node.id");
  const label = nonempty(input.label, `node ${id}.label`);
  assert(kinds.includes(input.kind as NodeKind), `node ${id} has an unknown kind`);
  assert(provenances.includes(input.provenance as Provenance), `node ${id} has unknown provenance`);
  const kind = input.kind as NodeKind;
  const provenance = input.provenance as Provenance;
  const parentId = input.parentId === null ? null : nonempty(input.parentId, `node ${id}.parentId`);
  const source = input.source === undefined ? undefined : sourceRange(input.source, `node ${id}.source`);
  const description =
    input.description === undefined ? undefined : nonempty(input.description, `node ${id}.description`);

  assert(provenance !== "extracted" || source !== undefined, `extracted node ${id} needs a source range`);
  assert(provenance !== "proposed" || source === undefined, `proposed node ${id} cannot claim source`);
  assert(kind !== "module" || (parentId === null && provenance === "curated" && source === undefined), `module ${id} must be a curated root grouping`);
  assert(
    kind !== "file" || (provenance === "extracted" && source !== undefined && id === `file:${source.path}`),
    `file ${id} must match its extracted source path`,
  );
  return { id, kind, label, parentId, provenance, ...(source && { source }), ...(description && { description }) };
}

function edge(value: unknown): ImportEdge {
  const input = record(value, "edge");
  const id = nonempty(input.id, "edge.id");
  assert(input.kind === "imports" && input.provenance === "extracted", `edge ${id} must be an extracted import`);
  return {
    id,
    kind: "imports",
    provenance: "extracted",
    from: nonempty(input.from, `edge ${id}.from`),
    to: nonempty(input.to, `edge ${id}.to`),
    source: sourceRange(input.source, `edge ${id}.source`),
  };
}

function unresolvedImport(value: unknown): UnresolvedImport {
  const input = record(value, "unresolved import");
  return {
    from: nonempty(input.from, "unresolved import.from"),
    specifier: nonempty(input.specifier, "unresolved import.specifier"),
    source: sourceRange(input.source, "unresolved import.source"),
  };
}

export function parseAtlasGraph(value: unknown): AtlasGraph {
  const input = record(value, "graph");
  assert(input.schemaVersion === 1, "unsupported schema version");
  const repository = record(input.repository, "repository");
  const name = nonempty(repository.name, "repository.name");
  const sourceBaseUrl =
    repository.sourceBaseUrl === undefined
      ? undefined
      : nonempty(repository.sourceBaseUrl, "repository.sourceBaseUrl");
  if (sourceBaseUrl) {
    const url = new URL(sourceBaseUrl);
    assert(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        sourceBaseUrl.endsWith("/"),
      "repository.sourceBaseUrl must be a plain HTTPS directory URL",
    );
  }

  const analysis = record(input.analysis, "analysis");
  const fileCount = nonnegativeInteger(analysis.fileCount, "analysis.fileCount");
  const unmappedBareImports = nonnegativeInteger(analysis.unmappedBareImports, "analysis.unmappedBareImports");
  assert(Array.isArray(analysis.unresolvedRelativeImports), "analysis.unresolvedRelativeImports must be an array");
  const unresolvedRelativeImports = analysis.unresolvedRelativeImports.map(unresolvedImport);
  assert(Array.isArray(input.nodes) && input.nodes.length > 0, "nodes must be a nonempty array");
  assert(Array.isArray(input.edges), "edges must be an array");
  const nodes = input.nodes.map(node);
  const edges = input.edges.map(edge);
  const byId = new Map(nodes.map((item) => [item.id, item]));
  assert(byId.size === nodes.length, "node IDs must be unique");
  assert(new Set(edges.map((item) => item.id)).size === edges.length, "edge IDs must be unique");
  assert(nodes.filter((item) => item.kind === "file").length === fileCount, "file count does not match nodes");

  for (const item of nodes) {
    if (item.kind === "module") continue;
    const parent = byId.get(item.parentId ?? "");
    assert(parent, `node ${item.id} has a missing parent`);
    assert(
      item.kind === "file"
        ? parent.kind === "module"
        : parent.kind === "file" || (item.provenance === "proposed" && parent.kind === "module"),
      `node ${item.id} has an invalid parent kind`,
    );
    if (item.source && parent.kind === "file") {
      assert(item.source.path === parent.source?.path, `node ${item.id} points outside its file`);
    }
  }
  for (const item of edges) {
    const from = byId.get(item.from);
    const to = byId.get(item.to);
    assert(from?.kind === "file" && to?.kind === "file", `edge ${item.id} must connect indexed files`);
    assert(item.source.path === from.source?.path, `edge ${item.id} has the wrong import location`);
  }
  for (const item of unresolvedRelativeImports) {
    const from = byId.get(item.from);
    assert(from?.kind === "file" && item.source.path === from.source?.path, "unresolved import has the wrong file");
  }

  return {
    schemaVersion: 1,
    repository: { name, ...(sourceBaseUrl && { sourceBaseUrl }) },
    analysis: { fileCount, unmappedBareImports, unresolvedRelativeImports },
    nodes,
    edges,
  };
}

export function lastSourceLine(source: SourceRange): number {
  return Math.max(
    source.start.line,
    source.end.line - (source.end.line > source.start.line && source.end.column === 1 ? 1 : 0),
  );
}

export function sourceHref(baseUrl: string, source: SourceRange): string {
  const encodedPath = source.path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(encodedPath, baseUrl);
  const lastLine = lastSourceLine(source);
  url.hash = lastLine === source.start.line ? `L${lastLine}` : `L${source.start.line}-L${lastLine}`;
  return url.href;
}
