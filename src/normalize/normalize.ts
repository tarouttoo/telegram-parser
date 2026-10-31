/**
 * Normalization of raw Telegram Desktop Exports into the flat post
 * records the analysis pipeline consumes.
 *
 * An Export (`result.json`) holds one source's history: a top-level
 * envelope (name, type, id) plus a `messages` array of heterogeneous
 * records. `message` entries carry content; `service` entries are events
 * (joins, pins, titles) with no knowledge value and are dropped. Text
 * arrives either as a plain string or as a list of markup parts; both
 * flatten to the same plain text.
 */

/** Source metadata from the Export envelope. */
export interface ExportSourceInfo {
  /** Display name as exported (e.g. "Grisha Market Maker"). */
  readonly name: string;
  /** Telegram export type (e.g. `public_channel`, `public_supergroup`). */
  readonly type: string;
  /** Numeric Telegram id of the source. */
  readonly id: number;
}

/**
 * A normalized post record — the stable JSONL contract of
 * `data/normalized/<source>.jsonl`. Field names are snake_case exactly as
 * serialized. `tags` starts empty and is filled by the curated HITL pass.
 */
export interface NormalizedPost {
  /** Source slug this post belongs to (the export directory name). */
  readonly source: string;
  /** Message id, unique within the source. */
  readonly source_message_id: number;
  /** Publish date, ISO 8601 UTC (second precision). */
  readonly date: string;
  /** Author display name, or null for channel posts (authored by the channel itself). */
  readonly author: string | null;
  /** Plain text with markup parts flattened; empty for media-only posts. */
  readonly text: string;
  /** Repost origin display name, or null for native posts. */
  readonly forwarded_from: string | null;
  /** Message id this post replies to, or null when standalone. */
  readonly reply_to: number | null;
  /** Whether the post carries a photo (the photo itself stays in the raw Export). */
  readonly has_photo: boolean;
  /** Whether the post carries a file (catalogued by name, content not analyzed). */
  readonly has_file: boolean;
  /** File name when the post carries a document, else null. */
  readonly file_name: string | null;
  /** Curated topic tags; empty until the HITL pass assigns them. */
  readonly tags: string[];
}

/** A normalized Export: the source envelope plus its post records. */
export interface NormalizedExport {
  readonly source: ExportSourceInfo;
  readonly posts: NormalizedPost[];
}

/** The Export file does not have the Telegram Desktop envelope shape. */
export class ExportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFormatError";
  }
}

const toIso = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Flatten Export text — a string or a (possibly nested) list of markup
 * parts, where a part is a string or `{ type, text }` — into plain text.
 */
const flattenText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).join("");
  if (isRecord(value) && "text" in value) return flattenText(value.text);
  return "";
};

const dateIsoOf = (record: Record<string, unknown>): string => {
  const unixtime = Number(record.date_unixtime);
  if (Number.isInteger(unixtime)) return toIso(unixtime);
  const parsed = Date.parse(String(record.date ?? ""));
  if (Number.isNaN(parsed)) {
    throw new ExportFormatError(`Message ${String(record.id)} has no usable date.`);
  }
  return toIso(parsed / 1000);
};

const postOf = (source: string, record: Record<string, unknown>): NormalizedPost => ({
  source,
  source_message_id: Number(record.id),
  date: dateIsoOf(record),
  author: typeof record.from === "string" ? record.from : null,
  text: flattenText(record.text),
  forwarded_from: typeof record.forwarded_from === "string" ? record.forwarded_from : null,
  reply_to: typeof record.reply_to_message_id === "number" ? record.reply_to_message_id : null,
  has_photo: "photo" in record,
  has_file: "file" in record,
  file_name: typeof record.file_name === "string" ? record.file_name : null,
  tags: [],
});

/**
 * Purely normalize a raw Export into the source envelope plus its post
 * records. Service messages are dropped; every `message` record is kept,
 * including media-only ones (empty text).
 *
 * @param slug - the export directory name; stamped onto every post
 * @param raw - the parsed `result.json` contents
 * @throws ExportFormatError when `raw` lacks the envelope or messages array
 */
export const normalizeExport = (slug: string, raw: unknown): NormalizedExport => {
  if (!isRecord(raw)) {
    throw new ExportFormatError(`Export "${slug}" is not a JSON object.`);
  }
  const messages = raw.messages;
  if (!Array.isArray(messages)) {
    throw new ExportFormatError(`Export "${slug}" has no messages array.`);
  }
  const source: ExportSourceInfo = {
    name: typeof raw.name === "string" ? raw.name : slug,
    type: typeof raw.type === "string" ? raw.type : "unknown",
    id: Number(raw.id),
  };
  const posts = messages
    .filter((message): message is Record<string, unknown> => isRecord(message) && message.type === "message")
    .map((message) => postOf(slug, message));
  return { source, posts };
};
