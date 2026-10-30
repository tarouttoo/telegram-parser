import { errors } from "telegram";
import type { ChannelHandle, FwdFrom, HistoryPage, HistorySource, RawMessage } from "./historySource";
import { UnresolvableChannelError } from "./historySource";

/**
 * The slice of the GramJS `TelegramClient` the adapter drives, kept
 * structural so tests can inject a double at the SDK boundary (ADR 0002:
 * the real client is this shape; the real client is what production wires
 * in).
 */
export interface GramjsHistoryClient {
  /**
   * Resolve a `@username` to the peer GramJS requests history for.
   *
   * @param peer - the `@username` handle to resolve
   * @throws GramJS raises RPC errors (`USERNAME_NOT_OCCUPIED`,
   *   `CHANNEL_INVALID`, ...) for handles it cannot resolve — the occupied
   *   username case re-worded into a plain "No user has ... as username"
   *   error — and "Could not find the input entity" when no cached or
   *   resolvable entity exists
   */
  getEntity(peer: string): Promise<unknown>;
  /**
   * Fetch one page of the peer's history, newest message first.
   *
   * @param peer - the resolved entity to read
   * @param params - `limit` (page size) and the exclusive `offsetId` to
   *   page below, exactly as Telegram's history endpoint takes them
   */
  getMessages(
    peer: unknown,
    params: { readonly limit: number; readonly offsetId?: number },
  ): Promise<readonly unknown[]>;
}

/** Inputs for building the GramJS HistorySource. */
export interface GramjsSourceOptions {
  /** The connected GramJS client (or a test double of the same shape). */
  readonly client: GramjsHistoryClient;
  /**
   * Asynchronous sleep, injected so the deliberate pacing and the
   * flood-wait response are observable in tests; production passes a
   * real-timer sleep.
   */
  readonly sleep: (milliseconds: number) => Promise<void>;
}

/**
 * Messages requested per page. This is the Telegram history endpoint's
 * maximum page size, so one `fetchPage` maps to exactly one request —
 * the unit the pacing and flood-wait policy below are expressed in.
 */
const PAGE_SIZE = 100;

/**
 * The deliberate pause between history requests, so a full Backfill
 * sustains ~1 request per second instead of hammering the API (spec
 * issue #6). The pause only applies after the first request: nothing
 * has been sustained yet before it.
 */
const REQUEST_PACE_MS = 1000;

/**
 * The fields of a GramJS channel message the Post mapper consumes, as
 * GramJS delivers them: `bigint` identifiers, absent-when-empty counters,
 * and media typed only by its class name.
 */
interface GramjsMessage {
  readonly id: number;
  readonly peerId?: { readonly channelId?: bigint };
  readonly date: number;
  readonly editDate?: number;
  readonly message?: string;
  readonly views?: number;
  readonly forwards?: number;
  readonly fwdFrom?: Record<string, unknown>;
  readonly media?: { readonly className: string };
  readonly groupedId?: bigint;
}

/**
 * Shape one GramJS message into the raw message the port promises.
 * Every optional wire field falls back to the port's null/empty default;
 * the channel peer is the one field that must be present, since a Post
 * without its channel id would silently corrupt the dataset.
 */
const toRawMessage = (message: unknown): RawMessage => {
  const gramjs = message as GramjsMessage;
  const channelId = Number(gramjs.peerId?.channelId);
  if (!Number.isInteger(channelId)) {
    throw new TypeError(`GramJS message ${gramjs.id} has no channel peer to take its id from`);
  }
  return {
    id: gramjs.id,
    channelId,
    date: gramjs.date,
    editDate: gramjs.editDate ?? null,
    text: gramjs.message ?? "",
    views: gramjs.views ?? null,
    forwards: gramjs.forwards ?? null,
    // The forward header is carried as-is to the JSONL schema, so a class
    // instance is stored through the same lens the fixture source stores
    // plain objects: by serializing its own enumerable fields.
    fwdFrom: (gramjs.fwdFrom ?? null) as FwdFrom | null,
    media: gramjs.media === undefined ? null : { className: gramjs.media.className },
    groupedId: gramjs.groupedId === undefined ? null : Number(gramjs.groupedId),
  };
};

/**
 * The GramJS adapter (ADR 0002): the real `HistorySource` behind the
 * Backfill, speaking MTProto through GramJS. It owns the Telegram-side
 * mechanics only — resolving handles, paging the history endpoint,
 * pacing at ~1 request per second, and honoring flood-waits. All
 * decision logic (the pagination loop, checkpointing, Post mapping)
 * stays behind the seam with the Backfill runner.
 *
 * @param options - the connected client and the sleep to pace with
 */
export const createGramjsHistorySource = (options: GramjsSourceOptions): HistorySource => {
  const { client, sleep } = options;

  /** Whether a history request has already gone out in this process. */
  let hasRequestedHistory = false;
  /** Pause between history requests; the first request is not "sustained" yet. */
  const pace = async (): Promise<void> => {
    if (hasRequestedHistory) await sleep(REQUEST_PACE_MS);
    hasRequestedHistory = true;
  };

  /**
   * Run a Telegram request, honoring flood-waits by sleeping exactly as
   * long as Telegram demands and retrying — the request is not lost, it
   * is early. (GramJS itself auto-sleeps flood-waits under its 60s
   * threshold; this is the deliberate handling of everything above it.)
   */
  const honoringFloodWaits = async <T>(request: () => Promise<T>): Promise<T> => {
    for (;;) {
      try {
        return await request();
      } catch (error) {
        if (!(error instanceof errors.FloodWaitError)) throw error;
        await sleep(error.seconds * 1000);
      }
    }
  };

  return {
    fetchPage: async (channel: ChannelHandle, offsetId?: number): Promise<HistoryPage> => {
      let entity: unknown;
      try {
        entity = await honoringFloodWaits(() => client.getEntity(channel));
      } catch (error) {
        if (isUnresolvable(error)) throw new UnresolvableChannelError(channel);
        throw error;
      }
      await pace();
      // A channel that resolves but cannot be read — private, or the
      // account cannot see it — is refused by the history endpoint, not by
      // resolution, so the port's unresolvable mapping covers this call too.
      let messages: readonly unknown[];
      try {
        messages = await honoringFloodWaits(() =>
          client.getMessages(entity, {
            limit: PAGE_SIZE,
            ...(offsetId === undefined ? {} : { offsetId }),
          }),
        );
      } catch (error) {
        if (isUnresolvable(error)) throw new UnresolvableChannelError(channel);
        throw error;
      }
      return {
        rawMessages: messages.map(toRawMessage),
        // A full page may have older messages below it; a short page
        // reached the channel bottom. (A channel whose history is an
        // exact multiple of the page size costs one extra request that
        // returns an empty page — the runner treats that as the end.)
        hasMore: messages.length === PAGE_SIZE,
      };
    },
  };
};

/**
 * Whether a Telegram failure means "this account cannot read this
 * channel" — it does not exist, is private, or the logged-in account
 * cannot see it — rather than a transient (network) fault that should
 * surface as its own per-channel failure. Covers both requests the
 * adapter makes: handle resolution and the history endpoint (a private
 * channel resolves but is refused there).
 */
const isUnresolvable = (error: unknown): boolean => {
  if (error instanceof errors.RPCError) {
    return UNRESOLVABLE_RPC_ERRORS.has(error.errorMessage);
  }
  if (!(error instanceof Error)) return false;
  return (
    error.message.startsWith("Could not find the input entity") ||
    // GramJS re-words a USERNAME_NOT_OCCUPIED refusal during resolution
    // into this plain error.
    error.message.startsWith("No user has ")
  );
};

/**
 * RPC error messages GramJS raises when a handle cannot be resolved to a
 * readable channel: the username is unoccupied, or the channel is gone
 * or private.
 */
const UNRESOLVABLE_RPC_ERRORS = new Set([
  "USERNAME_NOT_OCCUPIED",
  "CHANNEL_INVALID",
  "CHANNEL_PRIVATE",
  "CHANNEL_PUBLIC_GROUP_NA",
]);
