import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runBackfill } from "./backfill";
import { createFixtureHistorySource } from "./fixtureHistorySource";
import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";
import { toPost } from "./post";

const unix = (iso: string): number => Date.parse(iso) / 1000;

const workDirs: string[] = [];

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "backfill-"));
  workDirs.push(dir);
  return dir;
};

const readJsonl = async (filePath: string): Promise<unknown[]> => {
  const content = await readFile(filePath, "utf8");
  return content
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line));
};

describe("runBackfill through the HistorySource seam", () => {
  test("appends every paginated page oldest to newest", async () => {
    const outDir = await tempDir();
    // Stored newest first, exactly as Telegram serves history pages.
    const messages: RawMessage[] = [50, 49, 48, 47, 46].map((id) => ({
      id,
      channelId: 2109884710,
      date: unix("2024-01-01T09:30:00Z") + (id - 50) * 60,
      editDate: null,
      text: `post ${id}`,
      views: null,
      forwards: null,
      fwdFrom: null,
      media: null,
      groupedId: null,
    }));
    const source = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": messages },
      pageSize: 2,
    });

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    const stored = await readJsonl(result.filePath);
    expect(stored).toHaveLength(5);
    expect(stored.map((post) => (post as { message_id: number }).message_id)).toEqual([
      46, 47, 48, 49, 50,
    ]);
  });

  test("maps repost, album, media-only, and edited posts onto the full schema", async () => {
    const outDir = await tempDir();
    const messages: RawMessage[] = [
      {
        id: 55,
        channelId: 2109884710,
        date: unix("2024-01-05T15:00:00Z"),
        editDate: null,
        text: "Reposting an old classic on queue dynamics.",
        views: 800,
        forwards: 3,
        fwdFrom: {
          from_id: { _predicate: "peerChannel", channel_id: 1444444444 },
          from_name: "Old Book Signals",
          date: unix("2023-11-20T10:00:00Z"),
          post: 88,
        },
        media: null,
        groupedId: null,
      },
      {
        id: 54,
        channelId: 2109884710,
        date: unix("2024-01-04T14:05:00Z"),
        editDate: null,
        text: "",
        views: 640,
        forwards: null,
        fwdFrom: null,
        media: { className: "MessageMediaPhoto" },
        groupedId: 71000000012345,
      },
      {
        id: 53,
        channelId: 2109884710,
        date: unix("2024-01-04T14:05:00Z"),
        editDate: null,
        text: "",
        views: 641,
        forwards: null,
        fwdFrom: null,
        media: { className: "MessageMediaPhoto" },
        groupedId: 71000000012345,
      },
      {
        id: 52,
        channelId: 2109884710,
        date: unix("2024-01-03T11:00:00Z"),
        editDate: null,
        text: "",
        views: 512,
        forwards: null,
        fwdFrom: null,
        media: { className: "MessageMediaPhoto" },
        groupedId: null,
      },
      {
        id: 51,
        channelId: 2109884710,
        date: unix("2024-01-02T09:45:00Z"),
        editDate: unix("2024-01-02T10:12:00Z"),
        text: "Correction: latency was 380µs, not 480µs.",
        views: 900,
        forwards: 5,
        fwdFrom: null,
        media: null,
        groupedId: null,
      },
    ];
    const source = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": messages },
      pageSize: 2,
    });

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    expect(await readJsonl(result.filePath)).toEqual([
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 51,
        date: "2024-01-02T09:45:00Z",
        edit_date: "2024-01-02T10:12:00Z",
        text: "Correction: latency was 380µs, not 480µs.",
        views: 900,
        forwards: 5,
        fwd_from: null,
        media_type: null,
        grouped_id: null,
      },
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 52,
        date: "2024-01-03T11:00:00Z",
        edit_date: null,
        text: "",
        views: 512,
        forwards: null,
        fwd_from: null,
        media_type: "photo",
        grouped_id: null,
      },
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 53,
        date: "2024-01-04T14:05:00Z",
        edit_date: null,
        text: "",
        views: 641,
        forwards: null,
        fwd_from: null,
        media_type: "photo",
        grouped_id: 71000000012345,
      },
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 54,
        date: "2024-01-04T14:05:00Z",
        edit_date: null,
        text: "",
        views: 640,
        forwards: null,
        fwd_from: null,
        media_type: "photo",
        grouped_id: 71000000012345,
      },
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 55,
        date: "2024-01-05T15:00:00Z",
        edit_date: null,
        text: "Reposting an old classic on queue dynamics.",
        views: 800,
        forwards: 3,
        fwd_from: {
          from_id: { _predicate: "peerChannel", channel_id: 1444444444 },
          from_name: "Old Book Signals",
          date: 1700474400,
          post: 88,
        },
        media_type: null,
        grouped_id: null,
      },
    ]);
  });

  test("writes one JSONL file per channel", async () => {
    const outDir = await tempDir();
    const messageFor = (id: number, channelId: number): RawMessage => ({
      id,
      channelId,
      date: unix("2024-01-01T09:30:00Z"),
      editDate: null,
      text: `post ${id} of ${channelId}`,
      views: null,
      forwards: null,
      fwdFrom: null,
      media: null,
      groupedId: null,
    });
    const source = createFixtureHistorySource({
      messagesByChannel: {
        "@microstructure_daily": [messageFor(50, 2109884710)],
        "@orderflow_feed": [messageFor(14, 2109884711)],
      },
      pageSize: 2,
    });

    const first = await runBackfill({ source, channel: "@microstructure_daily", outDir });
    const second = await runBackfill({ source, channel: "@orderflow_feed", outDir });

    expect(await readJsonl(first.filePath)).toMatchObject([{ message_id: 50 }]);
    expect(await readJsonl(second.filePath)).toMatchObject([{ message_id: 14 }]);
    expect(first.filePath).not.toBe(second.filePath);
  });

  test("appends Posts after existing file content", async () => {
    const outDir = await tempDir();
    const source = createFixtureHistorySource({
      messagesByChannel: {
        "@microstructure_daily": [
          {
            id: 50,
            channelId: 2109884710,
            date: unix("2024-01-01T09:30:00Z"),
            editDate: null,
            text: "a fresh post",
            views: null,
            forwards: null,
            fwdFrom: null,
            media: null,
            groupedId: null,
          },
        ],
      },
      pageSize: 2,
    });

    await writeFile(join(outDir, "microstructure_daily.jsonl"), "{\"message_id\":49}\n");

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    const stored = await readJsonl(result.filePath);
    expect(stored).toHaveLength(2);
    expect((stored[0] as { message_id: number }).message_id).toBe(49);
    expect((stored[1] as { message_id: number }).message_id).toBe(50);
  });

  test("stops paging when a source reports more history but serves an empty page", async () => {
    const outDir = await tempDir();
    const source: HistorySource = {
      fetchPage: (channel: ChannelHandle, offsetId?: number) =>
        Promise.resolve(
          offsetId === undefined
            ? {
                rawMessages: [
                  {
                    id: 50,
                    channelId: 2109884710,
                    date: unix("2024-01-01T09:30:00Z"),
                    editDate: null,
                    text: "the only post",
                    views: null,
                    forwards: null,
                    fwdFrom: null,
                    media: null,
                    groupedId: null,
                  },
                ],
                hasMore: true,
              }
            : { rawMessages: [], hasMore: true },
        ),
    };

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    expect(result.postCount).toBe(1);
    expect(await readJsonl(result.filePath)).toHaveLength(1);
  });

  test("maps a plain post onto the full Post schema", async () => {
    const outDir = await tempDir();
    const rawMessage: RawMessage = {
      id: 50,
      channelId: 2109884710,
      date: unix("2024-01-01T09:30:00Z"),
      editDate: null,
      text: "Order book imbalance spiked 40s before the 10:00 auction.",
      views: 1234,
      forwards: 12,
      fwdFrom: null,
      media: null,
      groupedId: null,
    };
    const source = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": [rawMessage] },
      pageSize: 2,
    });

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    expect(result).toEqual({
      channel: "@microstructure_daily",
      filePath: join(outDir, "microstructure_daily.jsonl"),
      postCount: 1,
    });
    expect(await readJsonl(result.filePath)).toEqual([
      {
        channel: "@microstructure_daily",
        channel_id: 2109884710,
        message_id: 50,
        date: "2024-01-01T09:30:00Z",
        edit_date: null,
        text: "Order book imbalance spiked 40s before the 10:00 auction.",
        views: 1234,
        forwards: 12,
        fwd_from: null,
        media_type: null,
        grouped_id: null,
      },
    ]);
  });

  test("backfills an empty history into an empty JSONL file", async () => {
    const outDir = await tempDir();
    const source = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": [] },
      pageSize: 2,
    });

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    expect(result.postCount).toBe(0);
    expect(await readFile(result.filePath, "utf8")).toBe("");
  });
});

describe("checkpoint and resume", () => {
  /** Fixture history for ids `oldestId..newestId`, stored newest first as Telegram serves it. */
  const newestFirstHistory = (oldestId: number, newestId: number): RawMessage[] =>
    Array.from({ length: newestId - oldestId + 1 }, (_, index) => {
      const id = newestId - index;
      return {
        id,
        channelId: 2109884710,
        date: unix("2024-01-01T09:30:00Z") + (id - oldestId) * 60,
        editDate: null,
        text: `post ${id}`,
        views: null,
        forwards: null,
        fwdFrom: null,
        media: null,
        groupedId: null,
      };
    });

  test("resumes an interrupted run from the checkpoint without refetching", async () => {
    const outDir = await tempDir();
    const fixture = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": newestFirstHistory(40, 50) },
      pageSize: 2,
    });
    // First run dies mid-paging: the port serves three pages, then blows up.
    let attempts = 0;
    const crashing: HistorySource = {
      fetchPage: (channel, offsetId) => {
        attempts += 1;
        if (attempts > 3) return Promise.reject(new Error("connection reset"));
        return fixture.fetchPage(channel, offsetId);
      },
    };
    await expect(
      runBackfill({ source: crashing, channel: "@microstructure_daily", outDir }),
    ).rejects.toThrow("connection reset");

    // The interrupted run stored its six posts and checkpointed mid-history.
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 45, complete: false },
    });

    // Second run: every fetch starts below the checkpoint, nothing refetched.
    const offsets: (number | undefined)[] = [];
    const resuming: HistorySource = {
      fetchPage: (channel, offsetId) => {
        offsets.push(offsetId);
        return fixture.fetchPage(channel, offsetId);
      },
    };

    const result = await runBackfill({ source: resuming, channel: "@microstructure_daily", outDir });

    expect(offsets).toEqual([45, 43, 41]);
    expect(result.postCount).toBe(5);
    const stored = await readJsonl(join(outDir, "microstructure_daily.jsonl"));
    expect(stored.map((post) => (post as { message_id: number }).message_id)).toEqual([
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    ]);
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 40, complete: true },
    });
  });

  test("re-running a completed channel fetches nothing and leaves the dataset untouched", async () => {
    const outDir = await tempDir();
    const fixture = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": newestFirstHistory(40, 42) },
      pageSize: 2,
    });
    await runBackfill({ source: fixture, channel: "@microstructure_daily", outDir });
    const jsonlPath = join(outDir, "microstructure_daily.jsonl");
    const jsonlBefore = await readFile(jsonlPath, "utf8");
    const stateBefore = await readFile(join(outDir, "checkpoint.json"), "utf8");

    const result = await runBackfill({
      source: { fetchPage: () => Promise.reject(new Error("must not fetch a completed channel")) },
      channel: "@microstructure_daily",
      outDir,
    });

    expect(result.postCount).toBe(0);
    expect(await readFile(jsonlPath, "utf8")).toBe(jsonlBefore);
    expect(await readFile(join(outDir, "checkpoint.json"), "utf8")).toBe(stateBefore);
  });

  test("takes the resume offset from the checkpoint, not from the output file", async () => {
    const outDir = await tempDir();
    const fixture = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": newestFirstHistory(40, 44) },
      pageSize: 2,
    });
    // Hand-crafted mid-history checkpoint with no stored posts behind it: the
    // state file — not the (absent) JSONL — decides where fetching continues.
    await writeFile(
      join(outDir, "checkpoint.json"),
      `${JSON.stringify({
        "@microstructure_daily": { lastFetchedId: 43, complete: false },
      })}\n`,
    );
    const offsets: (number | undefined)[] = [];
    const resuming: HistorySource = {
      fetchPage: (channel, offsetId) => {
        offsets.push(offsetId);
        return fixture.fetchPage(channel, offsetId);
      },
    };

    const result = await runBackfill({ source: resuming, channel: "@microstructure_daily", outDir });

    expect(offsets).toEqual([43, 41]);
    expect(result.postCount).toBe(3);
    const stored = await readJsonl(join(outDir, "microstructure_daily.jsonl"));
    expect(stored.map((post) => (post as { message_id: number }).message_id)).toEqual([40, 41, 42]);
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 40, complete: true },
    });
  });

  test("collapses Posts a crash duplicated across the append and checkpoint gap", async () => {
    const outDir = await tempDir();
    const history = newestFirstHistory(40, 50);
    const rawById = new Map(history.map((message) => [message.id, message]));
    const line = (id: number): string => {
      const raw = rawById.get(id);
      if (raw === undefined) throw new Error(`no fixture message ${id}`);
      return `${JSON.stringify(toPost("@microstructure_daily", raw))}\n`;
    };
    // Crash state between the two steps of a page write: pages (50,49) and
    // (48,47) are already in the JSONL, but only page one's Checkpoint landed,
    // so resuming at 49 fetches 48 and 47 a second time.
    await writeFile(
      join(outDir, "microstructure_daily.jsonl"),
      [49, 50, 47, 48].map(line).join(""),
    );
    await writeFile(
      join(outDir, "checkpoint.json"),
      `${JSON.stringify({
        "@microstructure_daily": { lastFetchedId: 49, complete: false },
      })}\n`,
    );
    const fixture = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": history },
      pageSize: 2,
    });
    const offsets: (number | undefined)[] = [];
    const resuming: HistorySource = {
      fetchPage: (channel, offsetId) => {
        offsets.push(offsetId);
        return fixture.fetchPage(channel, offsetId);
      },
    };

    const result = await runBackfill({ source: resuming, channel: "@microstructure_daily", outDir });

    expect(offsets).toEqual([49, 47, 45, 43, 41]);
    expect(result.postCount).toBe(9);
    const stored = await readJsonl(join(outDir, "microstructure_daily.jsonl"));
    expect(stored.map((post) => (post as { message_id: number }).message_id)).toEqual([
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    ]);
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 40, complete: true },
    });
  });

  test("finishes a run that died after checkpointing the oldest page but before the rewrite", async () => {
    const outDir = await tempDir();
    const fixture = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": newestFirstHistory(40, 50) },
      pageSize: 2,
    });
    // Die on the seventh fetch: all six pages are appended and checkpointed
    // (oldest id 40, incomplete) — the sixth page even claims more history —
    // but the chronological rewrite never ran.
    let attempts = 0;
    const crashing: HistorySource = {
      fetchPage: (channel, offsetId) => {
        attempts += 1;
        if (attempts > 6) return Promise.reject(new Error("connection reset"));
        return fixture.fetchPage(channel, offsetId).then((page) =>
          attempts === 6 ? { ...page, hasMore: true } : page,
        );
      },
    };
    await expect(
      runBackfill({ source: crashing, channel: "@microstructure_daily", outDir }),
    ).rejects.toThrow("connection reset");

    // Resuming needs exactly one fetch below the oldest id to finish, and the
    // file still comes out as one chronological timeline.
    const offsets: (number | undefined)[] = [];
    const resuming: HistorySource = {
      fetchPage: (channel, offsetId) => {
        offsets.push(offsetId);
        return fixture.fetchPage(channel, offsetId);
      },
    };

    const result = await runBackfill({ source: resuming, channel: "@microstructure_daily", outDir });

    expect(offsets).toEqual([40]);
    expect(result.postCount).toBe(0);
    const stored = await readJsonl(join(outDir, "microstructure_daily.jsonl"));
    expect(stored.map((post) => (post as { message_id: number }).message_id)).toEqual([
      40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
    ]);
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 40, complete: true },
    });
  });

  test("records a completed per-channel checkpoint and leaves no temp files behind", async () => {
    const outDir = await tempDir();
    const source = createFixtureHistorySource({
      messagesByChannel: { "@microstructure_daily": newestFirstHistory(40, 50) },
      pageSize: 2,
    });

    const result = await runBackfill({ source, channel: "@microstructure_daily", outDir });

    expect(result.postCount).toBe(11);
    expect(JSON.parse(await readFile(join(outDir, "checkpoint.json"), "utf8"))).toEqual({
      "@microstructure_daily": { lastFetchedId: 40, complete: true },
    });
    const entries = await readdir(outDir);
    expect(entries.filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });
});
