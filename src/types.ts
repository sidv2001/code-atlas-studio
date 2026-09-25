export type Provenance = "extracted" | "curated" | "proposed";

export type NodeKind =
  | "module"
  | "file"
  | "component"
  | "class"
  | "function"
  | "interface"
  | "type";

export interface Position {
  line: number;
  column: number;
}

export interface SourceRange {
  path: string;
  start: Position;
  end: Position;
}

export interface AtlasNode {
  id: string;
  kind: NodeKind;
  label: string;
  parentId: string | null;
  provenance: Provenance;
  source?: SourceRange;
  description?: string;
}

export interface ImportEdge {
  id: string;
  from: string;
  to: string;
  kind: "imports";
  provenance: "extracted";
  source: SourceRange;
}

export interface UnresolvedImport {
  from: string;
  specifier: string;
  source: SourceRange;
}

export interface AtlasGraph {
  schemaVersion: 1;
  repository: {
    name: string;
    sourceBaseUrl?: string;
  };
  analysis: {
    fileCount: number;
    unmappedBareImports: number;
    unresolvedRelativeImports: UnresolvedImport[];
  };
  nodes: AtlasNode[];
  edges: ImportEdge[];
}
