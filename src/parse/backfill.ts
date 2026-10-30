import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";
import { toPost } from "./post";
import type { Post } from "./post";

/** Inputs for one channel's Backfill run. */
export interface BackfillOptions {
  /** The history port to pull raw messages through. */
  readonly source: HistorySource;
  /** The `@username` handle to backfill. */
  readonly channel: ChannelHandle;
  /** Directory the channel's JSONL file and the checkpoint state file live in. */
  readonly outDir: string;
}

/** Outcome of one channel's Backfill run. */
export interface BackfillResult {
  /** The `@username` handle that was backfilled. */
  readonly channel: ChannelHandle;
  /** Path of the channel's JSONL file. */
  readonly filePath: string;
  /** Number of Posts fetched and stored by this run (0 for a no-op re-run). */
  readonly postCount: number;
}

/** Persisted resume position of one Channel's Backfill. */
export interface ChannelCheckpoint {
  /**
   * Oldest message id fetched so far — the offset fetching resumes from;
   * null when nothing has been fetched yet.
   */
  readonly lastFetchedId: number | null;
  /** Whether the Channel's history has been fetched down to its oldest Post. */
  readonly complete: boolean;
}

/** Shape of the state file: per-Channel checkpoints keyed by `@username` handle. */
export type CheckpointState = Partial<Record<ChannelHandle, ChannelCheckpoint>>;

const stateFileName = "checkpoint.json";

const jsonlFileName = (channel: ChannelHandle): string => `${channel.slice(1)}.jsonl`;

/** Read the checkpoint state file; a missing file means no Channel has ever run. */
const readState = async (statePath: string): Promise<CheckpointState> => {
  let content: string;
  try {
    content = await readFile(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return JSON.parse(content) as CheckpointState;
};

/**
 * Write a file so a crash cannot leave a torn or empty file behind: serialize
 * into a temp file, then rename it over the target (atomic on the same
 * directory).
 */
const writeAtomically = async (filePath: string, content: string): Promise<void> => {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
};

const serializePosts = (posts: readonly Post[]): string =>
  posts.map((post) => `${JSON.stringify(post)}\n`).join("");

/** Read back the Posts already stored in a channel's JSONL file ([] when absent). */
const readStoredPosts = async (filePath: string): Promise<Post[]> => {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return content
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Post);
};

/** Restore the oldest-to-newest timeline across pages and resumed runs. */
const rewriteChronologically = async (filePath: string): Promise<void> => {
  const stored = await readStoredPosts(filePath);
  stored.sort((a, b) => a.message_id - b.message_id);
  await writeAtomically(filePath, serializePosts(stored));
};

/** Append one page's Posts, oldest to newest, to the channel's JSONL file. */
const appendPosts = async (
  channel: ChannelHandle,
  filePath: string,
  rawMessages: readonly RawMessage[],
): Promise<void> => {
  const posts = rawMessages.map((raw) => toPost(channel, raw));
  posts.sort((a, b) => a.message_id - b.message_id);
  const handle = await open(filePath, "a");
  try {
    await handle.write(serializePosts(posts));
  } finally {
    await handle.close();
  }
};

/**
 * Page through the channel's history from `startId` down to the oldest Post.
 * Each page is appended to the JSONL file and checkpointed before the next
 * page is fetched, so an interrupted run stored everything it fetched.
 *
 * @returns the raw messages fetched by this run and the resulting checkpoint
 */
const fetchAndStorePages = async (
  source: HistorySource,
  channel: ChannelHandle,
  filePath: string,
  statePath: string,
  state: CheckpointState,
  startId: number | null,
): Promise<{ fetched: RawMessage[]; checkpoint: ChannelCheckpoint }> => {
  const fetched: RawMessage[] = [];
  let lastFetchedId = startId;
  let offsetId = startId ?? undefined;
  for (;;) {
    const page = await source.fetchPage(channel, offsetId);
    if (page.rawMessages.length > 0) {
      fetched.push(...page.rawMessages);
      lastFetchedId = Math.min(
        lastFetchedId ?? Number.POSITIVE_INFINITY,
        ...page.rawMessages.map((message) => message.id),
      );
      await appendPosts(channel, filePath, page.rawMessages);
      state[channel] = { lastFetchedId, complete: false };
      await writeAtomically(statePath, `${JSON.stringify(state, null, 2)}\n`);
    }
    if (!page.hasMore || page.rawMessages.length === 0) break;
    offsetId = Math.min(...page.rawMessages.map((message) => message.id));
  }
  return { fetched, checkpoint: { lastFetchedId, complete: true } };
};

/**
 * Backfill one channel through the HistorySource seam and append every
 * Post, oldest to newest, to the channel's JSONL file in `outDir`, keeping
 * a per-channel checkpoint in the `outDir` state file: an interrupted run
 * resumes from the checkpoint's offset instead of refetching, and a
 * completed channel's re-run is a no-op.
 *
 * @param options - the history port, channel handle, and output directory
 * @returns where the Posts were written and how many were stored this run
 */
export const runBackfill = async (options: BackfillOptions): Promise<BackfillResult> => {
  await mkdir(options.outDir, { recursive: true });
  const statePath = join(options.outDir, stateFileName);
  const filePath = join(options.outDir, jsonlFileName(options.channel));
  const state = await readState(statePath);
  const checkpoint = state[options.channel];
  if (checkpoint?.complete === true) {
    return { channel: options.channel, filePath, postCount: 0 };
  }

  const { fetched, checkpoint: finished } = await fetchAndStorePages(
    options.source,
    options.channel,
    filePath,
    statePath,
    state,
    checkpoint?.lastFetchedId ?? null,
  );
  state[options.channel] = finished;
  await writeAtomically(statePath, `${JSON.stringify(state, null, 2)}\n`);
  await rewriteChronologically(filePath);
  return { channel: options.channel, filePath, postCount: fetched.length };
};
