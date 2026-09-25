# Research, boundaries, and next questions

Code Atlas Studio starts from a practical review question: *what does this
suggested change touch, and where can I check it myself?* The linked work
informs this first slice; it does not supply an evaluation of our prototype.

## Sources and design choices

| Source | Useful idea | Decision here |
| --- | --- | --- |
| Sillito et al., [*Questions Programmers Ask During Software Evolution Tasks*](https://doi.org/10.1145/1181775.1181779) | Understanding a change involves moving between specific code locations and broader relationships. | Make each selected node lead to a source range and show its neighboring imports. |
| Bragdon et al., [*Code Bubbles*](https://cs.brown.edu/people/spr/codebubbles/CHI-final.pdf) | Flexible spatial views can keep related code context nearby. | Place files and declarations together without requiring users to abandon a readable outline. |
| Wettel et al., [CodeCity report](https://www.inf.usi.ch/faculty/lanza/PUBS/M/Wett2010a.pdf) | Its reported results concern the studied tasks and system. | Use a restrained 2D map; do not cite CodeCity as evidence that 3D would help this interface. |
| [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) | A parser can ground declarations and imports in real source positions. | Extract named exports and static local imports, with one-based line/column ranges. |
| [LSP 3.17 document symbols](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/) | Language servers offer a possible path to other languages. | Keep node kinds and ranges explicit so a later adapter can be tested separately. |
| [React Flow subflows](https://reactflow.dev/learn/layouting/sub-flows) | Parent/child nodes are a useful layout primitive. | Keep the graph format UI-agnostic; the first renderer is plain HTML with SVG import lines. |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Existing dependency tooling is a reference point for larger import graphs. | Show only imports the small extractor resolves, and count omissions. |
| [WAI-ARIA treeview pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) | A true treeview entails arrow-key, focus, and selection behavior. | Use a nested semantic list of native buttons instead; Tab, Enter, and Space work without claiming treeview semantics. |

## Data model and accuracy

`src/types.ts` defines version 1 of the local graph. Each node has an ID,
kind, parent ID, label, and `provenance` (`extracted`, `curated`, or `proposed`).
Extracted files and declarations carry a repository-relative `source` path and
one-based start/end positions; the end position is exclusive. Directory
groupings are curated from paths. The single demo proposal has a description
but no source range. Import edges connect indexed files, retain the location
of the import statement, and are always marked extracted.

The extractor reads `.ts`, `.tsx`, `.mts`, and `.cts` files. It skips declaration
files, known build/vendor directories, and symlinks. It caps input at 160
files, 512 KiB per file, and 4 MiB total, with explicit errors if a cap or
parser check fails. Bare imports (including possible aliases) are counted as
unmapped; unresolved relative imports are listed in `analysis`. The component
label is a PascalCase-plus-JSX heuristic. Calls, dynamic imports, runtime
behavior, and execution coverage are outside this pass.

## Privacy and control

`npm run --silent extract -- path/to/repo` emits JSON to standard output and writes
nothing into the scanned directory. The demo generator writes only
`src/data/demo-atlas.json` from the original MIT fixture. The browser bundles
that fixture's source text for excerpts; it performs no upload or telemetry.
Following a source link navigates to this repository on GitHub. A private
graph can contain filenames and identifiers, so do not commit or publish one
without reviewing it. The tool never asks for agent write access.

## Evaluation roadmap

First, add an opt-in Git comparison that records both revisions and labels
changed lines only when their paths and source versions match. Then accept
coverage only with a traceable test artifact and matching source revision;
absence should remain visible as absence. For larger repositories, test
language-server symbols and dependency tooling against known fixtures before
adding more edge types.

Evaluate with concrete review tasks: locate a declaration, identify an import,
and tell an existing node from a proposal. Measure answer accuracy and time,
record wrong inferences, and ask participants whether the view helped them
choose what to inspect next. Include keyboard-only and screen-reader task
completion. Those outcomes, rather than a visual preference for diagrams,
should determine what to build next.
