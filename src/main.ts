import demoAtlas from "./data/demo-atlas.json";
import { mountAtlas } from "./app.ts";

const sourceModules = import.meta.glob<string>(
  "../examples/parcelboard/src/**/*.{ts,tsx}",
  { query: "?raw", import: "default", eager: true },
);
const sourceTexts = Object.fromEntries(
  Object.entries(sourceModules).map(([file, text]) => [
    file.replace("../examples/parcelboard/", ""),
    text,
  ]),
);
const root = document.getElementById("app");
if (!root) throw new Error("Missing application root.");

try {
  mountAtlas(root, demoAtlas, sourceTexts);
} catch (error) {
  console.error("Unable to display the atlas:", error);
  const title = document.createElement("h1");
  title.textContent = "The atlas could not be displayed.";
  const explanation = document.createElement("p");
  explanation.textContent =
    error instanceof Error ? error.message : "An unexpected error occurred.";
  root.replaceChildren(title, explanation);
}
