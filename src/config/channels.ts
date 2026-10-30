import type { ChannelHandle } from "../parse/historySource";

/**
 * The configured list of Channels to backfill (spec issue #1). Add a
 * Channel by appending its `@username` here with a comment saying why it
 * is tracked; no code changes are needed. `npm run parse @username` runs
 * a single one of these instead of the whole list.
 */
export const channels: readonly ChannelHandle[] = [
  // Market-microstructure commentary; the densest post history tracked.
  "@microstructure_daily",
  // Order-flow and latency news; tracked for the engagement counters.
  "@orderflow_feed",
];
