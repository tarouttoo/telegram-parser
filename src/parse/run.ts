import type { ChannelHandle, HistorySource } from "./historySource";
import { runBackfill, type BackfillResult } from "./backfill";

/** How one Channel fared in a multi-Channel run. */
export type ChannelOutcome =
  | ({ readonly status: "backfilled" } & BackfillResult)
  | { readonly channel: ChannelHandle; readonly status: "failed"; readonly reason: string };

/** Inputs for a multi-Channel run. */
export interface RunOptions {
  /** The history port to pull raw messages through. */
  readonly source: HistorySource;
  /** The `@username` handles to backfill, in this order. */
  readonly channels: readonly ChannelHandle[];
  /** Directory the per-channel JSONL files are appended into. */
  readonly outDir: string;
}

/** Outcome of a multi-Channel run: one outcome per Channel plus the error policy. */
export interface RunResult {
  /** One outcome per requested Channel, in request order. */
  readonly outcomes: readonly ChannelOutcome[];
  /** `1` when at least one Channel failed, else `0` — the CLI's process exit code. */
  readonly exitCode: 0 | 1;
}

/**
 * Backfill every requested Channel, one at a time in request order,
 * isolating failures: a Channel whose source or storage throws is
 * recorded as `failed` and the remaining Channels still run. The result
 * is the per-Channel summary the run ends with, plus the exit-code
 * policy — non-zero if and only if at least one Channel failed.
 *
 * @param options - the history port, the Channel handles, and the output directory
 */
export const runBackfills = async (options: RunOptions): Promise<RunResult> => {
  const outcomes: ChannelOutcome[] = [];
  for (const channel of options.channels) {
    try {
      const backfilled = await runBackfill({
        source: options.source,
        channel,
        outDir: options.outDir,
      });
      outcomes.push({ status: "backfilled", ...backfilled });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      outcomes.push({ channel, status: "failed", reason });
    }
  }
  const anyFailed = outcomes.some((outcome) => outcome.status === "failed");
  return { outcomes, exitCode: anyFailed ? 1 : 0 };
};
