# Plain TypeScript dependency injection over Effect in parser code

`.sandcastle/CODING_STANDARDS.md` (ported from upstream sandcastle) asks for
Effect primitives (`FileSystem`, Effect Layers) instead of promises so
dependencies can be injected and errors stay typed. The parser does not
adopt Effect; it uses the `HistorySource` port and plain TypeScript instead.

Why: the parser is a small local CLI whose entire Telegram surface is already
one narrow port — `HistorySource` — designed as the test seam (spec issue #1).
That port delivers the same benefits the standards reach for with Effect
(dependency injection, a single swappable edge, test doubles at the boundary)
without adding a framework dependency the spec's stack list (TypeScript,
GramJS, tsx, vitest) never asked for. The walking-skeleton ticket #3 is also
explicitly minimal; introducing Effect there would front-load a
hard-to-reverse dependency decision this one-seam codebase has not earned
yet. Note the standards are written for sandcastle's own workflow code,
which does run on Effect — they are applied to the parser where they make
sense (JSDoc, deep modules, seam testing, no raw `Error` escaping the
fixture source's input validation).

## Considered options

- **Effect across the parser** — rejected: new dependency and idiom for a
  codebase whose one boundary is already a plain interface; revisit if the
  error-handling surface grows beyond per-channel isolation.
- **Raw promises with mock-heavy tests** — rejected in favor of the seam:
  tests inject a `HistorySource` (the bundled fixture source), never mock
  internals.

## Consequences

Parser code reads as idiomatic TypeScript with async/await and real
filesystem I/O in tests (temp dirs, no fs mocks). The standards' Effect
guidance is intentionally unapplied here; anyone porting the parser into an
Effect-based codebase must re-add the error-channel typing the port
currently expresses as thrown errors caught per channel by the CLI.
