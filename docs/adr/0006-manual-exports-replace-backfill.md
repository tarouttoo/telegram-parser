# Manual Exports are the data source; MTProto Backfill frozen

The repo's purpose shifted from "backfill channels into a dataset" to
"turn already-exported history into a knowledge base" (thematic notes +
tagged post index). A manual Telegram Desktop export (`result.json`) covers
full history on demand, so the live-fetch machinery — GramJS session,
rate-limit handling, Checkpoints — is redundant for a personal corpus.
We keep the Backfill code frozen (working, but not developed and no longer
the data path); raw Exports are the source of truth for the analysis
pipeline.

## Considered options

- **Keep Backfill as an incremental updater** on top of manual exports —
  rejected: exports are cheap and complete; merging two data paths adds
  complexity with no payoff for a single-user corpus.
- **Delete the parser** — rejected for now: the code works and is cheap to
  keep; delete later if it rots.
