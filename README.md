# Code Atlas Studio

An agent suggests a change in a codebase you barely know. Before accepting it,
you want to find the view it touches, follow its imports, and see the exact
declaration behind a label. Code Atlas Studio is a small, source-linked map for
that moment. It helps a person ask better questions; the decision stays theirs.

The public starter uses **Parcelboard**, an original four-file TypeScript
fixture about delivery status. In this illustrative scenario, someone proposes
a `DelayForecast` view. The map shows the existing `DeliveryBoard`,
`StatusBadge`, `RoutePlanner`, and shipment model inside directory and file
boxes. Select a card or its counterpart in the nested outline to inspect a
source excerpt, line range, and static local imports. `DelayForecast` has a
dashed border and an explicit "Proposed only" label, so an idea cannot be
mistaken for an implemented file.

## Run it locally

Use Node.js 20.19 or newer:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Both the map and outline use ordinary
buttons: Tab moves between items, and Enter or Space selects one. A readable
static map remains in the HTML if JavaScript is disabled; reduced-motion
preferences are respected. Run `npm test` for the extractor, graph, and
interaction checks, or `npm run build` to type-check the fixture and build the
site.

The extractor can also read a small local TypeScript directory and print its
graph to standard output:

```sh
npm run --silent extract -- examples/parcelboard > /tmp/parcelboard-atlas.json
```

It reads source without modifying the selected directory. To regenerate the
committed demo graph from the original fixture, run `npm run extract:demo`.
The browser currently displays that bundled fixture; importing arbitrary
extractor output into the UI is a later step. Keep any graph from private code
outside this repository.

## What this first slice knows

The TypeScript Compiler API indexes named exported declarations, directory
groups, and statically resolved relative imports. A PascalCase exported
declaration containing JSX is labelled a component; that is a syntax-based
hint, not a runtime trace. The source links point to the original fixture in
this repository. Diff and coverage badges say when those inputs are absent,
rather than painting speculative overlays. Nothing in the demo is taken from
an employer or private project.

Next, the map could compare verified Git revisions and accept coverage tied to
the same source version. Those layers should make review more precise without
turning an agent's proposal into authority. The [research, data model, privacy
notes, and evaluation roadmap](docs/research.md) record the rationale and
limits. Original code and fixture are available under the [MIT license](LICENSE).
