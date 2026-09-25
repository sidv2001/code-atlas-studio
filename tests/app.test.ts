// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import boardText from "../examples/parcelboard/src/ui/DeliveryBoard.tsx?raw";
import { mountAtlas } from "../src/app.ts";
import demo from "../src/data/demo-atlas.json";

let root: HTMLElement;
let dispose: (() => void) | undefined;

function button(id: string, area: string): HTMLButtonElement {
  const selected = root.querySelector(`${area} button[data-node-id="${id}"]`);
  if (!(selected instanceof HTMLButtonElement)) throw new Error(`Missing ${id} in ${area}`);
  return selected;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  root = document.createElement("div");
  document.body.append(root);
  dispose = mountAtlas(root, demo, { "src/ui/DeliveryBoard.tsx": boardText });
});

afterEach(() => {
  dispose?.();
  root.remove();
});

test("keeps the nested map and semantic outline synchronized on selection", () => {
  const classId = "symbol:src/domain/RoutePlanner.ts:52";
  const selected = button(classId, "nav");
  expect(selected.closest("li")?.querySelector("ul")).toBeNull();
  selected.click();

  expect(button(classId, ".map-stage").getAttribute("aria-current")).toBe("true");
  expect(selected.getAttribute("aria-current")).toBe("true");
  expect(root.querySelector("#detail-title")?.textContent).toBe("RoutePlanner");
  expect(window.location.search).toContain("node=");
  expect(root.querySelector(".source-link")?.getAttribute("href")).toContain(
    "src/domain/RoutePlanner.ts#L3-L8",
  );
  expect(root.querySelector('nav[aria-label="Architecture outline"] ul')).not.toBeNull();
});

test("marks the proposed node clearly without offering an invented source", () => {
  const proposal = button("proposal:delay-forecast", ".map-stage");
  proposal.click();

  expect(button("proposal:delay-forecast", "nav").getAttribute("aria-current")).toBe("true");
  expect(root.querySelector(".detail-panel")?.textContent).toContain("Proposed only");
  expect(root.querySelector(".detail-panel")?.textContent).toContain("no source file");
  expect(root.querySelector(".source-link")).toBeNull();
  expect(root.querySelector(".source-preview")).toBeNull();
  expect(root.querySelector(".availability")?.textContent).toContain("Coverage: no data loaded");
  expect(root.querySelector(".availability")?.textContent).toContain("Diff: no comparison loaded");
});

test("opens a bundled source excerpt and follows related files", () => {
  const boardId = "symbol:src/ui/DeliveryBoard.tsx:152";
  button(boardId, "nav").click();
  expect(root.querySelector(".source-preview")?.textContent).toContain("new RoutePlanner()");
  expect(root.querySelector(".source-link")?.getAttribute("href")).toContain(
    "DeliveryBoard.tsx#L5-L21",
  );
  const related = root.querySelector(".relationship-button") as HTMLButtonElement | null;
  expect(related).not.toBeNull();
  related?.click();
  expect(root.querySelector("#detail-title")?.textContent).not.toBe("DeliveryBoard");
  expect(root.querySelectorAll('button[aria-current="true"]')).toHaveLength(2);
});

test("responds to browser history and a stale shared link", () => {
  button("proposal:delay-forecast", "nav").click();
  window.history.replaceState(null, "", "/?node=file%3Asrc%2Fmodel%2Fshipment.ts");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(root.querySelector("#detail-title")?.textContent).toBe("shipment.ts");
  expect(button("file:src/model/shipment.ts", ".map-stage").getAttribute("aria-current")).toBe("true");

  window.history.replaceState(null, "", "/?node=missing");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(root.querySelector(".link-notice")?.textContent).toContain("not in this fixture");
  expect(root.querySelector("#detail-title")?.textContent).toBe("DeliveryBoard");
});
