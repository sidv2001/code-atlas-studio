declare namespace JSX {
  interface Element {
    readonly fixtureElement?: true;
  }

  interface IntrinsicElements {
    section: { "aria-label"?: string; children?: unknown };
    h2: { children?: unknown };
    p: { children?: unknown };
    ul: { children?: unknown };
    li: { children?: unknown };
    span: { children?: unknown };
  }
}
