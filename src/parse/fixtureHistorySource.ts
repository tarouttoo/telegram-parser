import type { ChannelHandle, HistorySource, RawMessage } from "./historySource";
import { UnresolvableChannelError } from "./historySource";
import {
  microstructureDailyMessages,
  orderflowFeedMessages,
} from "../config/fixtureMessages";

/** Inputs for building a fixture HistorySource. */
export interface FixtureSourceOptions {
  /** The bundled raw messages per `@username` handle, newest first. */
  readonly messagesByChannel: Partial<Record<ChannelHandle, readonly RawMessage[]>>;
  /** How many messages one page serves; small sizes exercise pagination. */
  readonly pageSize: number;
}

const pageOf = (
  messages: readonly RawMessage[],
  offsetId: number | undefined,
  pageSize: number,
): { page: RawMessage[]; hasMore: boolean } => {
  const older = messages
    .filter((message) => offsetId === undefined || message.id < offsetId)
    .sort((a, b) => b.id - a.id);
  return { page: older.slice(0, pageSize), hasMore: older.length > pageSize };
};

/**
 * Build an in-memory HistorySource serving fixture raw messages — the
 * offline test double of the port (spec issue #1). The CLI runs this in
 * place of the real GramJS adapter until that ticket lands.
 *
 * @param options - the messages to serve per channel and the page size
 */
export const createFixtureHistorySource = (options: FixtureSourceOptions): HistorySource => ({
  fetchPage: (channel: ChannelHandle, offsetId?: number) => {
    const messages = options.messagesByChannel[channel];
    if (messages === undefined) {
      // A handle with no fixture history stands in for one Telegram would
      // refuse to resolve (unresolvable or private, ADR 0002).
      return Promise.reject(new UnresolvableChannelError(channel));
    }
    const { page, hasMore } = pageOf(messages, offsetId, options.pageSize);
    return Promise.resolve({ rawMessages: page, hasMore });
  },
});

/**
 * The bundled HistorySource the CLI runs until the real GramJS adapter
 * lands: fixture raw messages for every configured Channel, served two
 * per page so pagination stays exercised in production runs.
 */
export const bundledHistorySource: HistorySource = createFixtureHistorySource({
  messagesByChannel: {
    "@microstructure_daily": microstructureDailyMessages,
    "@orderflow_feed": orderflowFeedMessages,
  },
  pageSize: 2,
});
