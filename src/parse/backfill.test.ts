import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runBackfill } from "./backfill";
import { createFixtureHistorySource } from "./fixtureHistorySource";
import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";

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
