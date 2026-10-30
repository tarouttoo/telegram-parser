# telegram-parser

A repository for parsing Telegram data, scaffolded from
[agent-pipeline-template](https://github.com/tarouttoo/agent-pipeline-template):
a **label-driven agent pipeline** — you triage issues and PRs by adding
`agent:*` labels, and coding agents run on GitHub Actions — implementing
issues into draft PRs, reviewing PRs, resolving merge conflicts, and
batch-triaging backlogs.

The pipeline is a verbatim port of [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle)
(commit `a53e227250fb51df0ad54155b85fecc1c090c937`, 2026-10-19), with one
deliberate adaptation: **the coding agent is the [pi CLI](https://github.com/earendil-works/pi-coding-agent),
not Claude Code**. See [Deviations from upstream](#deviations-from-upstream).

## Workflows

| Label | Workflow | What happens |
|---|---|---|
| `agent:implement` (issue) | `agent-implement.yml` | Preflight gates (refuses PRD-shaped issues / issues with an open collaborator PR; a child-of-spec Ticket passes and its parent Spec is pulled in as context), then an agent implements on an isolated branch and opens a draft PR that closes the issue, then labels the PR `agent:review`. |
| `agent:implement` (PR) | `agent-implement-pr.yml` | Processes review feedback on an existing PR: replies to threads, addresses inline comments, pushes with a lease. |
| `agent:review` | `agent-review.yml` | Reviews the PR, self-fixes findings on the branch, posts a PR review, replies to threads, marks the PR ready. |
| `agent:update-branch` | `agent-update-branch.yml` | Resolves merge conflicts with `main` (always resolve, never abort) and pushes. |
| `agent:explore` | `agent-explore.yml` | Batch triage: one agent run plans effects for every open `agent:explore` issue; a separate apply job validates the plan and applies it. Supports `workflow_dispatch` dry-run. |
| `ready-for-agent` (issue) | `agent-convert.yml` | Converter (no upstream counterpart): re-evaluates the Ticket when labelled and whenever another issue closes. All blockers closed → swaps the label for `agent:implement` (added with `AGENT_PAT` so the implement workflow actually starts); open blockers → comments naming them and keeps waiting. Blocking edges come from the tracker's native blocked-by relationships, falling back to the body's `## Blocked by` section. |

Every agent run posts a failure comment with a reason and the workflow-run
link, and relabels the subject `agent:blocked`. Retrying means re-adding the
trigger label named in that comment. The `ready-for-agent` converter is the
exception: it runs no agent, so a failed converter run is a plain workflow
failure with no failure comment — retry it by removing and re-adding
`ready-for-agent` on the affected Ticket.

## Adopting this template

This repo was created from the template; what remains of adoption:

1. **Create the labels** the workflows expect — the full reference
   (trigger, lifecycle, and verdict labels, what each one does, and the
   setup command) lives in [`docs/labels.md`](docs/labels.md).

2. **Set the secrets** (repo → Settings → Secrets and variables → Actions):
   - `ZAI_API_KEY` — API key for the pi provider (required by every agent run).
   - `AGENT_PAT` — a personal access token with `contents`, `issues` and
     `pull-requests` write (classic: `repo` scope; workflow-touching changes
     also need the `workflow` scope). Required in practice: label events
     fired by `GITHUB_TOKEN` never start other workflows, so without
     `AGENT_PAT` the automatic `implement → review` cascade silently degrades
     (the review label is added but never fires). The implement checkout also
     prefers `AGENT_PAT` for pushing.
3. **Tune the provider/model** if needed: each workflow sets
   `AGENT_PROVIDER: zai` and `AGENT_MODEL: glm-5.3-flash` in its env. Edit
   the env vars; nothing in code needs to change.
4. **First run**: label a standalone issue `agent:implement` and watch the
   Actions tab. A failure comments on the issue with the reason and labels
   it `agent:blocked`; re-add the trigger label to retry.
5. **Record your one-way doors**: in your repo's agent docs (e.g.
   `CONTEXT.md`), list the changes your project always treats as
   irreversible — schema migrations, anything that ships outward or
   deletes. The review pass reads them when auditing the Merge Danger
   call in the PR body.

Sanity checks after cloning:

```sh
npm install
npm run typecheck
npm test
```

## The parser

The tool this repo exists for lives in `src/`. `npm run parse` backfills
every configured Channel (see `src/config/channels.ts`) through the
`HistorySource` seam, appending one JSONL file per Channel — oldest post
first, one Post per line (schema in `src/parse/post.ts`).
`npm run parse @username` backfills a single configured Channel. Channels
are isolated (issue #4): one that fails — the port throws, or the handle
is unresolvable or private — is skipped and the rest still complete; the
run ends with a per-Channel summary, and the exit code is non-zero if and
only if any Channel failed.

Backfills are resumable (issue #5): each run keeps a per-Channel
checkpoint in `data/checkpoint.json`, written atomically (temp file +
rename) after every fetched page, so a crash can neither corrupt the
state nor lose already-fetched posts. The next run resumes from the
checkpoint's offset instead of refetching, and re-running a completed
Channel is a no-op. If a crash lands between writing a page and
advancing the checkpoint, the resumed run fetches that page once more;
the final chronological rewrite collapses the overlap, so the finished
dataset carries no duplicate Posts.

By default the run goes through the GramJS adapter (issue #6, ADR 0002),
which speaks MTProto under your own Telegram account: it paces sustained
fetching at about one request per second and honors flood-waits by
sleeping exactly as long as Telegram demands. `npm run parse -- --fixture`
runs the bundled fixture source instead — fully offline, writing to
`data/fixture/` so fixture data can never mix with the real dataset
through the shared checkpoint — and needs no credentials; it is for dev
and tests, never for the dataset.

## First run

The real backfill needs a one-time interactive login (ADR 0002 — a bot
cannot read channel history, and the session must be a personal one on
your machine, never in CI):

1. Create an application at <https://my.telegram.org> (API development
   tools) to get an `api_id` and an `api_hash`.
2. Export them in your shell:

   ```sh
   export TELEGRAM_API_ID=123456
   export TELEGRAM_API_HASH=your_api_hash
   ```

3. Run `npm run parse`. The first run asks for your phone number, the
   login code Telegram sends you, and (if enabled) your two-factor
   password, then stores the session in the gitignored
   `telegram.session` file. Every later run reuses that session — no
   prompts.
4. Delete `telegram.session` to log out and start the login over
   (e.g. if Telegram invalidates the session).

Posts land in the gitignored `data/` directory; interrupt the run at any
time and start it again — it resumes from `data/checkpoint.json`.

## Attribution

Pipeline files ported from [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle)
@ `a53e227250fb51df0ad54155b85fecc1c090c937` — © Matt Pocock, MIT.
Template scaffolding — © tarouttoo, MIT. See `LICENSE`.

## Deviations from upstream

Verbatim is the goal; every deviation is listed here.

1. **Runner swap** (the one deliberate adaptation):
   - `claudeAgent()` in `.sandcastle/agent-workflows/shared/common.ts` is
     replaced by `agentFromEnv()`, which runs pi over the provider/model
     named by the `AGENT_PROVIDER`/`AGENT_MODEL` env vars, authenticated
     with `ZAI_API_KEY` (upstream: `sandcastle.claudeCode` with a pinned
     model and `CLAUDE_CODE_OAUTH_TOKEN`).
   - Workflows install pi CLI (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`)
     instead of Claude Code, and pass `ZAI_API_KEY` instead of
     `CLAUDE_CODE_OAUTH_TOKEN`.
   - `node-version` 22 → 24.
2. **`npm run build` step removed in all five workflows** — upstream builds
   the sandcastle package before running workflow code; this template has
   nothing to build (`@ai-hero/sandcastle` is consumed as an npm
   dependency).
3. **Scaffolding is fresh, not upstream's** — upstream's `package.json` /
   `tsconfig.json` cover the sandcastle package itself and never type-check
   its `.sandcastle/` workflow starters; this template does, so it adds a
   `@standard-schema/spec` devDependency (a type-only import used by the
   ported code) and a `tsconfig.json` including `.sandcastle/**/*.ts`.
4. **Agent-drafted PR bodies** — the implement agent drafts the draft-PR
   body per the shipped `.agents/skills/pr/` skill (Summary / Evidence /
   Merge Danger, from mattpocock/skills, itself adapted from Humanlayer's
   show-me) instead of the canned stub; the stub remains only as fallback.
   The `implement-pr` feedback pass refreshes a stale body, and the review
   pass audits the body's claims against the diff but never edits it
   (see `docs/adr/0001-agent-drafted-pr-bodies.md`).
5. **Child-of-spec Tickets are implementable** — the implement preflight
   admits a Ticket whose parent is another issue (upstream refuses any
   sub-issue) and the implement pass pulls the parent Spec in as a
   `PARENT_CONTEXT` prompt arg: upstream's own local parallel-planner
   prompt ("If it has a parent PRD, pull that in too", pinned `a53e227`),
   which its CI workflow never reached because of that refusal. The
   PRD-shaped refusal and every other guardrail are unchanged
   (rationale: `docs/adr/0004-child-of-spec-tickets-implementable.md`).
6. **`docs/agents/` and the `triage-repro` skill restored** — the port
   initially dropped upstream's agent-facing docs; they are carried back
   verbatim, except the right-hand column of the label table in
   [`docs/agents/triage.md`](docs/agents/triage.md), which that file tells
   adopters to fill in: mapped to this repo's labels (`agent:explore`,
   `agent:blocked`, `agent:implement`, `ready-for-human`; `wontfix` closes
   the issue — no label). Note that `docs/agents/adding-an-agent-provider.md`,
   `docs/agents/adding-an-issue-tracker.md` and the reproduction steps in
   `.agents/skills/triage-repro/SKILL.md` describe the upstream sandcastle
   package (`src/`, `sandcastle init`, Docker sandbox); this repo
   consumes the pipeline as an npm dependency, so those references point at
   upstream, not at files in this repo.
7. **The `ready-for-agent` converter** — a sixth workflow,
   `agent-convert.yml`, with no upstream counterpart: Tickets labelled
   `ready-for-agent` (the triage skills' vocabulary, published by
   construction by its `to-spec`/`to-tickets` flow) are handed to the
   implement workflow once their blocking edges are all closed, re-firing on
   `issues: closed` — no schedule. Edges come from the tracker's native
   blocked-by relationships where available, falling back to parsing the
   body's `## Blocked by` section in TypeScript (bodies stay untrusted
   input, never in the shell); the hand-off label is added with `AGENT_PAT`,
   degrading with the same warning explore's apply job emits when only
   `GITHUB_TOKEN` is available (rationale:
   [`docs/adr/0005-ready-for-agent-converter.md`](docs/adr/0005-ready-for-agent-converter.md);
   day-to-day usage: [`docs/triage.md`](docs/triage.md)).
8. **Branch-pushing workflows check out with `AGENT_PAT` when available** —
   `agent-implement`, `agent-implement-pr`, `agent-review` and
   `agent-update-branch` pass `token: ${{ secrets.AGENT_PAT ||
   secrets.GITHUB_TOKEN }}` to `actions/checkout`, so `git push` uses the
   PAT's persisted credentials while the `gh` API calls keep using
   `GITHUB_TOKEN`. Upstream never pushes commits that create or update
   files under `.github/workflows/`; this repo's agents build the pipeline
   itself, and a plain `GITHUB_TOKEN` cannot push such commits — GitHub
   refuses them ("refusing to allow a GitHub App to create or update
   workflow … without `workflows` permission"), and `workflows` is not a
   grantable scope in the Actions `permissions` block, so the token, not
   the permission, is the only lever. (Observed in the template repo:
   review runs on the ready-for-agent converter failed at their final
   "Push branch" step, after the agent had finished, landing the PR
   `agent:blocked`; `agent-implement` was immune only because it already
   checked out with `AGENT_PAT`.) Without `AGENT_PAT` the `GITHUB_TOKEN`
   fallback still pushes everything except workflow-file changes.
   Contract-tested in
   `.sandcastle/agent-workflows/shared/push-permissions.test.ts`.

Prompt and workflow code text is otherwise unchanged from upstream.
