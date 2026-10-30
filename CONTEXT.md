# CONTEXT

The agent's map of this repository: what it is, the vocabulary used in
prompts and code, and where deeper material lives. Read the relevant section
before resolving anything substantive; add terms here when you introduce a
new concept.

## What this repo is

**telegram-parser** — a tool that backfills and stores **Posts** from a
configured list of public Telegram **Channels** (HFT-themed) as a dataset.
Messages in discussion chats (comments) are out of scope. The repo runs on the
same infrastructure the template provides: a label-driven agent pipeline
(pi CLI on GitHub Actions). Issues and PRs are worked on by adding trigger
labels (`agent:implement`, `agent:review`, `agent:update-branch`,
`agent:explore`); workflow code lives under `.sandcastle/agent-workflows/`.

## Glossary

- **Trigger label** — a label (`agent:*`) whose addition starts a workflow.
  Removed by the workflow itself when the run begins.
- **Lifecycle label** — a label the pipeline manages on its own:
  `agent:in-progress` while a run is active, `agent:blocked` when a run
  fails (with a failure comment naming the trigger label to re-add).
- **Subject** — the issue or PR a run is about. Concurrency groups are
  keyed per subject so parallel label events queue instead of racing.
- **Draft PR** — the pull request the implement workflow opens against
  `main`, body starting with `Closes #N` for the triggering issue, drafted
  by the implement agent per the `pr` skill and audited (never edited) by
  the review pass.
- **Batch triage** — the explore workflow: one run collects every open
  `agent:explore` issue, the agent plans per-issue effects, and a separate
  apply job validates and applies the plan (issue bodies are untrusted
  input and never enter the shell).
- **Extraction** — the second, structured-output pass a run may take
  (`extraction.md`) to turn free-form agent output into typed JSON.
- **PAT cascade** — label events fired by `GITHUB_TOKEN` never start other
  workflows; `AGENT_PAT` is used where a workflow must trigger another one
  (e.g. implement requesting review).
- **Channel** — a public Telegram channel from the configured list; the
  source of Posts. Referred to by `@username` in config, keyed internally by
  its numeric channel id.
- **Post** — a message published in a Channel (not in a chat). The unit of
  parsed data: date, text, views, forwards, media metadata. Comments left in
  the channel's linked discussion chat are out of scope.
- **Backfill** — the initial full-history fetch of a Channel's Posts, from
  the channel's creation up to now, respecting Telegram rate limits.
- **Spec issue** — a self-contained issue carrying a full feature spec
  (problem, solution, user stories, decisions). It is never handed to the
  implement workflow itself; Tickets reference it as their parent.
- **Ticket** — a vertical-slice issue derived from a Spec issue (as its
  child), sized for one agent run, with explicit blocking edges to other
  Tickets. The unit of work the implement workflow acts on.
- **Ready-for-agent** — triage label from the skills vocabulary marking a
  Ticket approved for agent work. A converter hands it to the implement
  workflow (through the PAT cascade) once every blocking edge is closed.

## Where things live

- `docs/labels.md` — the reference for every label the pipeline uses
  (trigger and lifecycle) and the adopter setup command.
- `docs/triage.md` — how a human feeds work into the pipeline: triageable
  issues, the draft-PR review loop, and acting on explore verdicts.
- `docs/adr/` — architecture decision records. Add one when making a
  non-obvious, hard-to-reverse choice; read the relevant ones before
  changing pipeline behaviour.
- `.sandcastle/CODING_STANDARDS.md` — coding standards the workflow agents
  apply to the host repo; they describe how code in an adopting repo
  should look.
- `README.md` — adopter setup (secrets, labels) and deviations from the
  upstream pipeline this was ported from.
