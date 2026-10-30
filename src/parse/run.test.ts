import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { bundledHistorySource, createFixtureHistorySource } from "./fixtureHistorySource";
import { UnresolvableChannelError } from "./historySource";
import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";
import { runBackfills } from "./run";

const unix = (iso: string): number => Date.parse(iso) / 1000;

const workDirs: string[] = [];

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "run-"));
  workDirs.push(dir);
  return dir;
};

const rawMessage = (id: number, channelId: number): RawMessage => ({
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

describe("runBackfills through the HistorySource seam", () => {
  test("a Channel whose source fails is skipped; the remaining Channels still complete", async () => {
    const outDir = await tempDir();
    const source = createFixtureHistorySource({
      // @microstructure_daily has no fixture history, so its Backfill fails.
      messagesByChannel: { "@orderflow_feed": [rawMessage(14, 2109884711)] },
      pageSize: 2,
    });

    const result = await runBackfills({
      source,
      channels: ["@microstructure_daily", "@orderflow_feed"],
      outDir,
    });

    expect(result.outcomes).toEqual([
      { channel: "@microstructure_daily", status: "failed", reason: expect.any(String) },
      {
        channel: "@orderflow_feed",
        status: "backfilled",
        filePath: join(outDir, "orderflow_feed.jsonl"),
        postCount: 1,
      },
    ]);
    await expect(readFile(join(outDir, "orderflow_feed.jsonl"), "utf8")).resolves.not.toBe("");
    expect(result.exitCode).toBe(1);
  });

  test("an arbitrary port failure is captured as the reason; earlier Channels still complete", async () => {
    const outDir = await tempDir();
    const source: HistorySource = {
      fetchPage: (channel) =>
        channel === "@microstructure_daily"
          ? Promise.reject(new Error("port exploded"))
          : Promise.resolve({ rawMessages: [], hasMore: false }),
    };

    const result = await runBackfills({
      source,
      channels: ["@orderflow_feed", "@microstructure_daily"],
      outDir,
    });

    expect(result.outcomes).toEqual([
      {
        channel: "@orderflow_feed",
        status: "backfilled",
        filePath: join(outDir, "orderflow_feed.jsonl"),
        postCount: 0,
      },
      { channel: "@microstructure_daily", status: "failed", reason: "port exploded" },
    ]);
    expect(result.exitCode).toBe(1);
  });

  test("a storage failure is captured rather than thrown out of the runner", async () => {
    const blocker = join(await tempDir(), "blocker");
    await writeFile(blocker, "a file, so mkdir below it fails");

    const result = await runBackfills({
      source: bundledHistorySource,
      channels: ["@orderflow_feed"],
      outDir: join(blocker, "data"),
    });

    expect(result.outcomes).toEqual([
      { channel: "@orderflow_feed", status: "failed", reason: expect.any(String) },
    ]);
    expect(result.exitCode).toBe(1);
  });

  test("exit code is zero when every Channel completes", async () => {
    const outDir = await tempDir();
    const source = createFixtureHistorySource({
      messagesByChannel: {
        "@microstructure_daily": [rawMessage(50, 2109884710)],
        "@orderflow_feed": [rawMessage(14, 2109884711)],
      },
      pageSize: 2,
    });

    const result = await runBackfills({
      source,
      channels: ["@microstructure_daily", "@orderflow_feed"],
      outDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.outcomes.every((outcome) => outcome.status === "backfilled")).toBe(true);
  });

  test("an unresolvable or private handle fails with a clear error naming the handle", async () => {
    const source = createFixtureHistorySource({ messagesByChannel: {}, pageSize: 2 });

    const outcome = (
      await runBackfills({ source, channels: ["@ghost_channel"], outDir: await tempDir() })
    ).outcomes[0];

    expect(outcome).toEqual({
      channel: "@ghost_channel",
      status: "failed",
      reason: "@ghost_channel is unresolvable or private",
    });
    await expect(source.fetchPage("@ghost_channel")).rejects.toThrow(UnresolvableChannelError);
  });
});
