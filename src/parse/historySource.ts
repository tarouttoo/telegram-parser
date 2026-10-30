/**
 * The single seam all Telegram history flows through (spec issue #1).
 *
 * The Backfill runner only ever sees channel history via this port; the
 * real GramJS adapter (ADR 0002) is one implementation, the bundled
 * fixture source is the other.
 */

/** A Telegram media object, reduced to the class name the mapper needs. */
export interface RawMedia {
  /** GramJS class name, e.g. `MessageMediaPhoto`. */
  readonly className: string;
}

/** Origin metadata of a repost, kept as delivered by the wire. */
export type FwdFrom = Record<string, unknown>;

/**
 * A raw message as delivered by the history port: exactly the fields the
 * Post mapper consumes, shaped like what GramJS yields for channel posts.
 */
export interface RawMessage {
  /** Message id, unique and monotonic within a channel. */
  readonly id: number;
  /** Numeric id of the channel the message was posted in. */
  readonly channelId: number;
  /** Publish date, unix seconds. */
  readonly date: number;
  /** Last edit date, unix seconds, or null when never edited. */
  readonly editDate: number | null;
  /** Post text with Telegram markup preserved; empty for media-only posts. */
  readonly text: string;
  /** View count, or null when the channel does not report views. */
  readonly views: number | null;
  /** Forward count, or null when the channel does not report forwards. */
  readonly forwards: number | null;
  /** Repost origin metadata, or null for native posts. */
  readonly fwdFrom: FwdFrom | null;
  /** Media metadata, or null for text-only posts. */
  readonly media: RawMedia | null;
  /** Shared album id across a grouped media set, or null outside albums. */
  readonly groupedId: number | null;
}

/** One page of channel history, newest message first, as Telegram serves it. */
export interface HistoryPage {
  /** Raw messages of this page, newest first. */
  readonly rawMessages: readonly RawMessage[];
  /** Whether older messages exist below this page. */
  readonly hasMore: boolean;
}

/**
 * A channel's `@username` handle, as written in the config list.
 */
export type ChannelHandle = `@${string}`;

/** The narrow port the Backfill runner pulls channel history through. */
export interface HistorySource {
  /**
   * Fetch one page of a channel's history.
   *
   * @param channel - the `@username` handle to fetch
   * @param offsetId - return only messages with an id below this one;
   *   omitted for the first (newest) page
   */
  fetchPage(channel: ChannelHandle, offsetId?: number): Promise<HistoryPage>;
}
