#!/usr/bin/env tsx
import { channels } from "./config/channels";
import { bundledHistorySource } from "./parse/fixtureHistorySource";
import { runBackfills } from "./parse/run";

/** Directory the per-channel JSONL files are appended into (gitignored). */
const dataDir = "data";

/**
 * `npm run parse` (issues #3 and #4): reads the Channel config and
 * backfills every requested Channel through the HistorySource seam with
 * the bundled fixture source — no Telegram credentials, until the GramJS
 * adapter ticket lands. Channels are isolated: one that fails (port
 * throws, unresolvable or private handle) is skipped and the rest still
 * complete. Ends with a per-Channel summary and a non-zero exit code iff
 * any Channel failed.
 *
 * Usage: npm run parse [@username]
 */
const main = async (): Promise<void> => {
  const requested = process.argv[2];
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

  const result = await runBackfills({
    source: bundledHistorySource,
    channels: selected,
    outDir: dataDir,
  });

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
