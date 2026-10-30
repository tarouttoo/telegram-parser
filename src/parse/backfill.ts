import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";
import { toPost } from "./post";

/** Inputs for one channel's Backfill run. */
export interface BackfillOptions {
  /** The history port to pull raw messages through. */
  readonly source: HistorySource;
  /** The `@username` handle to backfill. */
  readonly channel: ChannelHandle;
  /** Directory the channel's JSONL file is appended into. */
  readonly outDir: string;
}

/** Outcome of one channel's Backfill run. */
export interface BackfillResult {
  /** The `@username` handle that was backfilled. */
  readonly channel: ChannelHandle;
  /** Path of the channel's JSONL file. */
  readonly filePath: string;
  /** Number of Posts appended by this run. */
  readonly postCount: number;
}

const jsonlFileName = (channel: ChannelHandle): string => `${channel.slice(1)}.jsonl`;

/**
 * Fetch the channel's full history through the port, page by page, and
 * return every raw message ordered oldest to newest (by message id).
 */
const fetchAll = async (
  source: HistorySource,
  channel: ChannelHandle,
): Promise<RawMessage[]> => {
  const collected: RawMessage[] = [];
  let offsetId: number | undefined;
  for (;;) {
    const page = await source.fetchPage(channel, offsetId);
    collected.push(...page.rawMessages);
    if (!page.hasMore || page.rawMessages.length === 0) break;
    offsetId = Math.min(...page.rawMessages.map((message) => message.id));
  }
  return collected.sort((a, b) => a.id - b.id);
};

/**
 * Backfill one channel through the HistorySource seam and append every
 * Post, oldest to newest, to the channel's JSONL file in `outDir`.
 *
 * @param options - the history port, channel handle, and output directory
 * @returns where the Posts were written and how many were appended
 */
export const runBackfill = async (options: BackfillOptions): Promise<BackfillResult> => {
  const rawMessages = await fetchAll(options.source, options.channel);
  const posts = rawMessages.map((raw) => toPost(options.channel, raw));

  await mkdir(options.outDir, { recursive: true });
  const filePath = join(options.outDir, jsonlFileName(options.channel));
  const handle = await open(filePath, "a");
  try {
    for (const post of posts) {
      await handle.write(`${JSON.stringify(post)}\n`);
    }
  } finally {
    await handle.close();
  }
  return { channel: options.channel, filePath, postCount: posts.length };
};
