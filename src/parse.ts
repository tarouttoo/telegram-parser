#!/usr/bin/env tsx
import { channels } from "./config/channels";
import { microstructureDailyMessages, orderflowFeedMessages } from "./config/fixtureMessages";
import { runBackfill } from "./parse/backfill";
import { bundledHistorySource } from "./parse/fixtureHistorySource";
import type { ChannelHandle } from "./parse/historySource";

/** Directory the per-channel JSONL files are appended into (gitignored). */
const dataDir = "data";

/**
 * Offline walking skeleton of `npm run parse` (issue #3): reads the
 * Channel config and drives the Backfill runner through the
 * HistorySource seam with the bundled fixture source — no Telegram
 * credentials, until the GramJS adapter ticket lands.
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

  const failed: ChannelHandle[] = [];
  for (const channel of selected) {
    try {
      const result = await runBackfill({ source: bundledHistorySource, channel, outDir: dataDir });
      console.log(`${channel}: ${result.postCount} posts → ${result.filePath}`);
    } catch (error) {
      failed.push(channel);
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`${channel}: backfill failed — ${reason}`);
    }
  }
  if (failed.length > 0) {
    console.error(`Done with failures (${failed.join(", ")}); the rest were backfilled.`);
    process.exitCode = 1;
    return;
  }
  console.log("All configured channels are backfilled.");
};

await main();
