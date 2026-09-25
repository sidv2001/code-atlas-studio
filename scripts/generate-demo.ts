import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AtlasGraph } from "../src/types.ts";
import { extractRepository } from "./extract.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = path.join(repositoryRoot, "examples/parcelboard");

export function createDemoAtlas(): AtlasGraph {
  const graph = extractRepository(fixtureRoot);
  if (!graph.nodes.some((node) => node.id === "module:src/ui")) {
    throw new Error("The original fixture is missing its UI directory.");
  }

  return {
    ...graph,
    repository: {
      name: "Parcelboard (original fixture)",
      sourceBaseUrl:
        "https://github.com/sidv2001/code-atlas-studio/blob/f449d2e07ff0a6532be0067588b361b978c7978e/examples/parcelboard/",
    },
    nodes: [
      ...graph.nodes,
      {
        id: "proposal:delay-forecast",
        kind: "component",
        label: "DelayForecast",
        parentId: "module:src/ui",
        provenance: "proposed",
        description:
          "An idea to discuss: a view of potentially late deliveries. No file or implementation exists.",
      },
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = path.join(repositoryRoot, "src/data/demo-atlas.json");
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(createDemoAtlas(), null, 2)}\n`);
  console.log(`Generated ${path.relative(repositoryRoot, output)} from the original fixture.`);
}
