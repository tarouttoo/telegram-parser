import type { RawMessage } from "../parse/historySource";

/**
 * Bundled raw-message fixtures standing in for real Telegram history while
 * the GramJS adapter (ADR 0002) is unbuilt: `npm run parse` stays fully
 * offline. Messages are stored newest first, exactly as Telegram serves
 * history pages, and cover every Post flavor: plain, edited, media-only,
 * album, and repost.
 */

/** Fixture history for @microstructure_daily. */
export const microstructureDailyMessages: readonly RawMessage[] = [
  {
    id: 55,
    channelId: 2109884710,
    date: Date.UTC(2024, 0, 5, 15, 0, 0) / 1000,
    editDate: null,
    text: "Reposting an old classic on queue dynamics.",
    views: 800,
    forwards: 3,
    fwdFrom: {
      from_id: { _predicate: "peerChannel", channel_id: 1444444444 },
      from_name: "Old Book Signals",
      date: Date.UTC(2023, 10, 20, 10, 0, 0) / 1000,
      post: 88,
    },
    media: null,
    groupedId: null,
  },
  {
    id: 54,
    channelId: 2109884710,
    date: Date.UTC(2024, 0, 4, 14, 5, 0) / 1000,
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
    date: Date.UTC(2024, 0, 4, 14, 5, 0) / 1000,
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
    date: Date.UTC(2024, 0, 3, 11, 0, 0) / 1000,
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
    date: Date.UTC(2024, 0, 2, 9, 45, 0) / 1000,
    editDate: Date.UTC(2024, 0, 2, 10, 12, 0) / 1000,
    text: "Correction: latency was 380µs, not 480µs.",
    views: 900,
    forwards: 5,
    fwdFrom: null,
    media: null,
    groupedId: null,
  },
  {
    id: 50,
    channelId: 2109884710,
    date: Date.UTC(2024, 0, 1, 9, 30, 0) / 1000,
    editDate: null,
    text: "Order book imbalance spiked 40s before the 10:00 auction.",
    views: 1234,
    forwards: 12,
    fwdFrom: null,
    media: null,
    groupedId: null,
  },
];

/** Fixture history for @orderflow_feed. */
export const orderflowFeedMessages: readonly RawMessage[] = [
  {
    id: 14,
    channelId: 2109884711,
    date: Date.UTC(2024, 0, 8, 8, 15, 0) / 1000,
    editDate: null,
    text: "Queue position is a strategy parameter, not an accident.",
    views: 410,
    forwards: 2,
    fwdFrom: null,
    media: null,
    groupedId: null,
  },
  {
    id: 13,
    channelId: 2109884711,
    date: Date.UTC(2024, 0, 7, 18, 30, 0) / 1000,
    editDate: null,
    text: "https://example.com/microstructure-primer",
    views: 388,
    forwards: null,
    fwdFrom: null,
    media: { className: "MessageMediaWebPage" },
    groupedId: null,
  },
  {
    id: 12,
    channelId: 2109884711,
    date: Date.UTC(2024, 0, 6, 12, 0, 0) / 1000,
    editDate: null,
    text: "Fees went to zero; the race moved to colocation.",
    views: null,
    forwards: null,
    fwdFrom: null,
    media: null,
    groupedId: null,
  },
];
