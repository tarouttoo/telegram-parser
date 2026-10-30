import type { ChannelHandle, FwdFrom, RawMedia, RawMessage } from "./historySource";

/**
 * The stored Post record (spec issue #1 schema). Field names are the
 * stable, documented JSONL contract — snake_case exactly as serialized.
 */
export interface Post {
  /** The channel's `@username` handle. */
  readonly channel: ChannelHandle;
  /** Numeric channel id. */
  readonly channel_id: number;
  /** Message id, unique within the channel. */
  readonly message_id: number;
  /** Publish date, ISO 8601 UTC (second precision). */
  readonly date: string;
  /** Last edit date, ISO 8601 UTC, or null when never edited. */
  readonly edit_date: string | null;
  /** Post text with Telegram markup preserved; empty for media-only posts. */
  readonly text: string;
  /** View count, or null when not reported. */
  readonly views: number | null;
  /** Forward count, or null when not reported. */
  readonly forwards: number | null;
  /** Repost origin metadata, or null for native posts. */
  readonly fwd_from: FwdFrom | null;
  /** Media type (e.g. `photo`), or null for text-only posts. Never a file. */
  readonly media_type: string | null;
  /** Shared album id across a grouped media set, or null outside albums. */
  readonly grouped_id: number | null;
}

const toIso = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");

const mediaTypeOf = (media: RawMedia): string =>
  media.className.replace(/^MessageMedia/, "").toLowerCase();

/**
 * Purely map a raw message onto the Post schema.
 *
 * @param channel - the `@username` handle the message was fetched from
 * @param raw - the raw message as delivered by the HistorySource port
 */
export const toPost = (channel: ChannelHandle, raw: RawMessage): Post => ({
  channel,
  channel_id: raw.channelId,
  message_id: raw.id,
  date: toIso(raw.date),
  edit_date: raw.editDate === null ? null : toIso(raw.editDate),
  text: raw.text,
  views: raw.views,
  forwards: raw.forwards,
  fwd_from: raw.fwdFrom,
  media_type: raw.media === null ? null : mediaTypeOf(raw.media),
  grouped_id: raw.groupedId,
});
