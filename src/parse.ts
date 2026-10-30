#!/usr/bin/env tsx
import { channels } from "./config/channels";
import { bundledHistorySource } from "./parse/fixtureHistorySource";
import type { ChannelHandle, HistorySource } from "./parse/historySource";
import { createGramjsHistorySource } from "./parse/gramjsHistorySource";
import { runBackfills } from "./parse/run";
import { connectGramjsClient } from "./telegram/login";
import type { TelegramClient } from "telegram";

/** Directory the per-channel JSONL files are appended into (gitignored). */
const dataDir = "data";
/** Fixture runs land beside it: the fixture dataset and the real one must never mix through the shared checkpoint. */
const fixtureDataDir = "data/fixture";

/** A real-timer sleep: the pacing and flood-wait unit the GramJS adapter pauses with. */
const sleepReal = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * `npm run parse` (issues #3–#6): reads the Channel config and backfills
 * every requested Channel through the HistorySource seam. The default
 * source is the GramJS adapter (ADR 0002): it connects with the persisted
 * local session — running the one-time interactive login on first use —
 * and needs `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` in the environment.
 * `--fixture` runs the bundled fixture source instead: fully offline, into
 * `data/fixture/`, so fixture data can never mix with the real dataset.
 * Channels are isolated: one that fails (port throws, unresolvable or
 * private handle) is skipped and the rest still complete. Ends with a
 * per-Channel summary and a non-zero exit code iff any Channel failed.
 *
 * Usage: npm run parse [--fixture] [@username]
 */
const main = async (): Promise<void> => {
  const arguments_ = process.argv.slice(2);
  const fixtureRequested = arguments_.includes("--fixture");
  const requested = arguments_.find((argument) => argument !== "--fixture");
  if (requested !== undefined && !requested.startsWith("@")) {
    console.error(`Channels are addressed by @username; got "${requested}".`);
    process.exitCode = 1;
    return;
  }
  const selected = channels.filter((channel) => requested === undefined || channel === requested);
  if (requested !== undefined && selected.length === 0) {
    console.error(`${requested} is not configured; configured channels: ${channels.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (fixtureRequested) {
    await runAndSummarize(bundledHistorySource, selected, fixtureDataDir);
    return;
  }

  let client: TelegramClient;
  try {
    client = await connectGramjsClient();
  } catch (error) {
    console.error(`Telegram login failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  try {
    await runAndSummarize(
      createGramjsHistorySource({ client, sleep: sleepReal }),
      selected,
      dataDir,
    );
  } finally {
    await client.disconnect();
  }
};

const runAndSummarize = async (
  source: HistorySource,
  selected: readonly ChannelHandle[],
  outDir: string,
): Promise<void> => {
  const result = await runBackfills({ source, channels: selected, outDir });

  console.log("Backfill summary:");
  for (const outcome of result.outcomes) {
    if (outcome.status === "backfilled") {
      console.log(`  ${outcome.channel}: ${outcome.postCount} posts → ${outcome.filePath}`);
    } else {
      console.error(`  ${outcome.channel}: FAILED — ${outcome.reason}`);
    }
  }
  const backfilled = result.outcomes.filter((outcome) => outcome.status === "backfilled").length;
  const closing = `Backfill finished: ${backfilled} of ${result.outcomes.length} channels backfilled.`;
  if (result.exitCode === 0) console.log(closing);
  else console.error(closing);
  process.exitCode = result.exitCode;
};

await main();
