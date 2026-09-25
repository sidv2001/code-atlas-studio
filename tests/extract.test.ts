import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { extractRepository } from "../scripts/extract.ts";
import { createDemoAtlas } from "../scripts/generate-demo.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = path.join(repositoryRoot, "examples/parcelboard");
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "code-atlas-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("extracts real file, declaration, and static import ranges from the original fixture", () => {
  const graph = extractRepository(fixtureRoot);
  expect(graph.analysis).toEqual({
    fileCount: 4,
    unmappedBareImports: 0,
    unresolvedRelativeImports: [],
  });
  expect(graph.edges).toHaveLength(5);
  const board = graph.nodes.find((node) => node.label === "DeliveryBoard");
  expect(board).toMatchObject({
    kind: "component",
    provenance: "extracted",
    parentId: "file:src/ui/DeliveryBoard.tsx",
    source: {
      path: "src/ui/DeliveryBoard.tsx",
      start: { line: 5, column: 1 },
      end: { line: 21, column: 2 },
    },
  });
  expect(graph.nodes.find((node) => node.label === "RoutePlanner")).toMatchObject({
    kind: "class",
    provenance: "extracted",
    source: { start: { line: 3, column: 1 } },
  });
  expect(graph.nodes.filter((node) => node.kind === "module")).toHaveLength(3);
  expect(graph.nodes.filter((node) => node.kind === "module").every((node) => node.provenance === "curated")).toBe(true);
  expect(graph.edges.find((edge) => edge.to === "file:src/domain/RoutePlanner.ts")).toMatchObject({
    from: "file:src/ui/DeliveryBoard.tsx",
    provenance: "extracted",
    source: { path: "src/ui/DeliveryBoard.tsx", start: { line: 2, column: 1 } },
  });
});

test("keeps the committed demo reproducible and proposals free of source claims", () => {
  const generated = createDemoAtlas();
  const committed = JSON.parse(readFileSync(path.join(repositoryRoot, "src/data/demo-atlas.json"), "utf8"));
  expect(generated).toEqual(committed);
  const idea = generated.nodes.find((node) => node.id === "proposal:delay-forecast");
  expect(idea).toMatchObject({ provenance: "proposed", kind: "component", parentId: "module:src/ui" });
  expect(idea).not.toHaveProperty("source");
});

test("reports unmapped imports and leaves the input directory untouched", () => {
  const root = temporaryDirectory();
  writeFileSync(
    path.join(root, "Board.tsx"),
    'import "external";\nimport { local } from "./local";\nimport { missing } from "./missing";\nexport const Board = () => <section>{local}</section>;\n',
  );
  writeFileSync(path.join(root, "local.ts"), "export const local = 1;\n");
  const before = readdirSync(root);

  const graph = extractRepository(root);

  expect(readdirSync(root)).toEqual(before);
  expect(graph.analysis.fileCount).toBe(2);
  expect(graph.analysis.unmappedBareImports).toBe(1);
  expect(graph.analysis.unresolvedRelativeImports).toMatchObject([
    {
      from: "file:Board.tsx",
      specifier: "./missing",
      source: { start: { line: 3, column: 1 } },
    },
  ]);
  expect(graph.edges).toMatchObject([
    { from: "file:Board.tsx", to: "file:local.ts", source: { start: { line: 2, column: 1 } } },
  ]);
  expect(graph.nodes.find((node) => node.label === "Board")).toMatchObject({ kind: "component" });
  expect(JSON.stringify(graph)).not.toContain(root);
});

test("does not follow directory symlinks outside the selected root", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  writeFileSync(path.join(root, "entry.ts"), "export function entry() { return 1; }\n");
  writeFileSync(path.join(outside, "outside.ts"), "export function outside() { return 2; }\n");
  symlinkSync(outside, path.join(root, "linked"), "dir");
  expect(extractRepository(root).analysis.fileCount).toBe(1);
});

test("fails explicitly on empty, malformed, and oversized input", () => {
  const root = temporaryDirectory();
  expect(() => extractRepository(root)).toThrow("No TypeScript source files");
  writeFileSync(path.join(root, "entry.ts"), "export function {");
  expect(() => extractRepository(root)).toThrow(/Unable to parse entry\.ts:1:/);
  writeFileSync(path.join(root, "entry.ts"), " ".repeat(512 * 1024 + 1));
  expect(() => extractRepository(root)).toThrow("starter limit");
});
