import { expect, test } from "vitest";
import demo from "../src/data/demo-atlas.json";
import { lastSourceLine, parseAtlasGraph, sourceHref } from "../src/graph.ts";

test("validates the generated graph and builds an exact source link", () => {
  const graph = parseAtlasGraph(demo);
  const source = graph.nodes.find((node) => node.label === "DeliveryBoard")?.source;
  expect(source).toBeDefined();
  if (!source || !graph.repository.sourceBaseUrl) throw new Error("Expected demo source.");
  expect(lastSourceLine(source)).toBe(21);
  expect(sourceHref(graph.repository.sourceBaseUrl, source)).toBe(
    "https://github.com/sidv2001/code-atlas-studio/blob/main/examples/parcelboard/src/ui/DeliveryBoard.tsx#L5-L21",
  );
  const fileSource = graph.nodes.find((node) => node.label === "DeliveryBoard.tsx")?.source;
  expect(fileSource).toBeDefined();
  if (!fileSource) throw new Error("Expected file source.");
  expect(fileSource.end).toEqual({ line: 22, column: 1 });
  expect(lastSourceLine(fileSource)).toBe(21);
});

test("rejects a proposal masquerading as extracted source", () => {
  const altered = structuredClone(demo);
  altered.nodes.at(-1)!.source = demo.nodes[3].source;
  expect(() => parseAtlasGraph(altered)).toThrow("proposed node");
});

test("rejects missing edge targets and unsafe source paths", () => {
  const brokenTarget = structuredClone(demo);
  brokenTarget.edges[0].to = "file:missing.ts";
  expect(() => parseAtlasGraph(brokenTarget)).toThrow("must connect indexed files");

  const unsafePath = structuredClone(demo);
  unsafePath.edges[0].source.path = "../outside.ts";
  expect(() => parseAtlasGraph(unsafePath)).toThrow("repository-relative");
});

test("rejects non-HTTPS source links", () => {
  const altered = structuredClone(demo);
  altered.repository.sourceBaseUrl = "javascript:alert(1)/";
  expect(() => parseAtlasGraph(altered)).toThrow("plain HTTPS directory URL");
});
