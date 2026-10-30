import { describe, expect, test } from "vitest";
import { errors } from "telegram";
import { createGramjsHistorySource, type GramjsHistoryClient } from "./gramjsHistorySource";
import { UnresolvableChannelError } from "./historySource";
import type { RawMessage } from "./historySource";

/** The sleeps the adapter asked for, in order — the pacing/flood-wait record. */
const recordingSleep = (): { sleeps: number[]; sleep: (ms: number) => Promise<void> } => {
  const sleeps: number[] = [];
  return { sleeps, sleep: (ms) => (sleeps.push(ms), Promise.resolve()) };
};

/** A GramJS `Api.Message` for a channel post, built from plain fields exactly as the wire serves them. */
const gramjsPost = (fields: {
  readonly id: number;
  readonly date: number;
  readonly channelId?: bigint;
  readonly text?: string;
  readonly views?: number;
  readonly forwards?: number;
  readonly editDate?: number;
  readonly fwdFrom?: Record<string, unknown>;
  readonly mediaClassName?: string;
  readonly groupedId?: bigint;
}): unknown => ({
  className: "Message",
  id: fields.id,
  peerId: { className: "PeerChannel", channelId: fields.channelId ?? 2109884710n },
  date: fields.date,
  message: fields.text,
  views: fields.views,
  forwards: fields.forwards,
  editDate: fields.editDate,
  fwdFrom: fields.fwdFrom,
  media: fields.mediaClassName === undefined ? undefined : { className: fields.mediaClassName },
  groupedId: fields.groupedId,
});

/** A client double standing in for the GramJS TelegramClient at the adapter's boundary. */
interface FakeClient extends GramjsHistoryClient {
  /** Pages served per getMessages call, newest message first. */
  pages: readonly unknown[][];
  /** The params of every getMessages call, in call order. */
  calls: { readonly peer: unknown; readonly params: { limit: number; offsetId?: number } }[];
  /** The @username of every getEntity call, in call order. */
  resolved: string[];
}

const fakeClient = (pages: readonly unknown[][]): FakeClient => {
  const client: FakeClient = {
    pages,
    calls: [],
    resolved: [],
    getEntity: (peer) => {
      client.resolved.push(peer);
      return Promise.resolve({ className: "Channel", id: 2109884710n });
    },
    getMessages: (peer, params) => {
      client.calls.push({ peer, params });
      return Promise.resolve(pages[client.calls.length - 1] ?? []);
    },
  };
  return client;
};

describe("the GramJS adapter", () => {
  test("shapes a GramJS channel page into raw messages", async () => {
    const client = fakeClient([
      [
        gramjsPost({
          id: 55,
          date: 1704463200,
          channelId: 2109884710n,
          text: "Reposting an old classic on queue dynamics.",
          views: 800,
          forwards: 3,
          editDate: 1704464000,
          fwdFrom: { from_name: "Old Book Signals" },
          groupedId: 71000000012345n,
        }),
        gramjsPost({ id: 54, date: 1704376800, mediaClassName: "MessageMediaPhoto" }),
        gramjsPost({ id: 53, date: 1704290400 }),
      ],
    ]);
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    const page = await source.fetchPage("@microstructure_daily");

    const expected: readonly RawMessage[] = [
      {
        id: 55,
        channelId: 2109884710,
        date: 1704463200,
        editDate: 1704464000,
        text: "Reposting an old classic on queue dynamics.",
        views: 800,
        forwards: 3,
        fwdFrom: { from_name: "Old Book Signals" },
        media: null,
        groupedId: 71000000012345,
      },
      {
        id: 54,
        channelId: 2109884710,
        date: 1704376800,
        editDate: null,
        text: "",
        views: null,
        forwards: null,
        fwdFrom: null,
        media: { className: "MessageMediaPhoto" },
        groupedId: null,
      },
      {
        id: 53,
        channelId: 2109884710,
        date: 1704290400,
        editDate: null,
        text: "",
        views: null,
        forwards: null,
        fwdFrom: null,
        media: null,
        groupedId: null,
      },
    ];
    expect(page.rawMessages).toEqual(expected);
    // A page smaller than the requested size means the channel bottom was reached.
    expect(page.hasMore).toBe(false);
  });

  test("requests the handle, a full page, and the resume offset from the client", async () => {
    const client = fakeClient([[gramjsPost({ id: 50, date: 1704463200 })]]);
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    await source.fetchPage("@microstructure_daily", 51);

    expect(client.resolved).toEqual(["@microstructure_daily"]);
    expect(client.calls).toEqual([
      {
        peer: { className: "Channel", id: 2109884710n },
        params: { limit: 100, offsetId: 51 },
      },
    ]);
  });

  test("omits the offset on the first (newest) page request", async () => {
    const client = fakeClient([[gramjsPost({ id: 99, date: 1704463200 })]]);
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    await source.fetchPage("@microstructure_daily");

    expect(client.calls[0]?.params).toEqual({ limit: 100 });
  });

  test("reports hasMore when the page is full, so the runner keeps paging", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      gramjsPost({ id: 100 - index, date: 1704463200 + index }),
    );
    const client = fakeClient([fullPage]);
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    const page = await source.fetchPage("@microstructure_daily");

    expect(page.rawMessages).toHaveLength(100);
    expect(page.hasMore).toBe(true);
  });

  test("raises UnresolvableChannelError when Telegram refuses the handle", async () => {
    const client = fakeClient([]);
    client.getEntity = () =>
      Promise.reject(new errors.RPCError("CHANNEL_PRIVATE", undefined as never));
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    await expect(source.fetchPage("@vanishing_act")).rejects.toMatchObject({
      name: "UnresolvableChannelError",
      channel: "@vanishing_act",
    });
    // A refused handle never reaches the history endpoint.
    expect(client.calls).toEqual([]);
  });

  test("raises UnresolvableChannelError for a username the account has never seen", async () => {
    const client = fakeClient([]);
    client.getEntity = () =>
      Promise.reject(new Error("Could not find the input entity for '@never_heard_of'."));
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    await expect(source.fetchPage("@never_heard_of")).rejects.toBeInstanceOf(
      UnresolvableChannelError,
    );
  });

  test("propagates transient failures instead of calling them unresolvable", async () => {
    const client = fakeClient([]);
    client.getEntity = () => Promise.reject(new Error("disconnect timed out"));
    const source = createGramjsHistorySource({ client, sleep: () => Promise.resolve() });

    await expect(source.fetchPage("@microstructure_daily")).rejects.toThrow(
      "disconnect timed out",
    );
  });

  test("paces sustained fetching at ~1 request per second", async () => {
    const client = fakeClient([[gramjsPost({ id: 50, date: 1704463200 })]]);
    const { sleeps, sleep } = recordingSleep();
    const source = createGramjsHistorySource({ client, sleep });

    await source.fetchPage("@microstructure_daily");
    await source.fetchPage("@microstructure_daily", 50);
    await source.fetchPage("@microstructure_daily", 49);

    // The first request is immediate; every later request waits the pace.
    expect(sleeps).toEqual([1000, 1000]);
  });

  test("sleeps out a flood-wait and retries the same page", async () => {
    const client = fakeClient([[gramjsPost({ id: 50, date: 1704463200 })]]);
    let attempts = 0;
    client.getMessages = () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new errors.FloodWaitError({ capture: "31", request: undefined }));
      }
      return Promise.resolve([gramjsPost({ id: 50, date: 1704463200 })]);
    };
    const { sleeps, sleep } = recordingSleep();
    const source = createGramjsHistorySource({ client, sleep });

    const page = await source.fetchPage("@microstructure_daily");

    // The demanded 31 seconds are slept, then the page is fetched whole.
    expect(sleeps).toEqual([31000]);
    expect(attempts).toBe(2);
    expect(page.rawMessages.map((raw) => raw.id)).toEqual([50]);
  });

  test("keeps honoring flood-waits until Telegram lets the page through", async () => {
    const client = fakeClient([]);
    let attempts = 0;
    client.getMessages = () => {
      attempts += 1;
      if (attempts <= 2) {
        return Promise.reject(new errors.FloodWaitError({ capture: "9", request: undefined }));
      }
      return Promise.resolve([]);
    };
    const { sleeps, sleep } = recordingSleep();
    const source = createGramjsHistorySource({ client, sleep });

    await source.fetchPage("@microstructure_daily");

    expect(sleeps).toEqual([9000, 9000]);
    expect(attempts).toBe(3);
  });
});
