#!/usr/bin/env tsx
import { mkdir, readFile } from "node:fs/promises";

import { writeAtomically } from "./fs/writeAtomically";
import { ExportFormatError, normalizeExport } from "./normalize/normalize";

/** Raw Telegram Desktop Exports live here, one `<slug>/result.json` per source (gitignored). */
const exportsDir = "data/exports";
/** Normalized per-source post JSONL lands here (gitignored, regenerable). */
const normalizedDir = "data/normalized";

const jsonlOf = (posts: readonly object[]): string =>
  `${posts.map((post) => JSON.stringify(post)).join("\n")}\n`;

const summarize = (slug: string, raw: unknown): string => {
  const { source, posts } = normalizeExport(slug, raw);
  const first = posts[0]?.date ?? "n/a";
  const last = posts.at(-1)?.date ?? "n/a";
  return `${slug}: ${posts.length} posts (${source.name}, ${source.type}) ${first} … ${last} -> ${normalizedDir}/${slug}.jsonl`;
};

/**
 * `npm run normalize -- <slug>...` (ADR 0006): turns each raw Export at
 * `data/exports/<slug>/result.json` into the normalized post JSONL at
 * `data/normalized/<slug>.jsonl`. Sources are isolated: one that fails
 * (missing export, malformed envelope) is skipped and the rest still
 * complete. Ends with a per-source summary and a non-zero exit code iff
 * any source failed.
 *
 * Usage: npm run normalize -- grisha wlsbot02
 */
const main = async (): Promise<void> => {
  const slugs = process.argv.slice(2);
  if (slugs.length === 0) {
    console.error(`Usage: npm run normalize -- <slug>... (export dirs under ${exportsDir}/)`);
    process.exitCode = 1;
    return;
  }
  let failures = 0;
  await mkdir(normalizedDir, { recursive: true });
  for (const slug of slugs) {
    try {
      const raw: unknown = JSON.parse(await readFile(`${exportsDir}/${slug}/result.json`, "utf8"));
      const { posts } = normalizeExport(slug, raw);
      await writeAtomically(`${normalizedDir}/${slug}.jsonl`, jsonlOf(posts));
      console.log(summarize(slug, raw));
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `${slug} failed: ${message}${error instanceof ExportFormatError ? "" : ` (${exportsDir}/${slug}/result.json)`}`,
      );
    }
  }
  if (failures > 0) process.exitCode = 1;
};

await main();
