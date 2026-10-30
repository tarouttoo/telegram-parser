import { rename, writeFile } from "node:fs/promises";

/**
 * Write a file so a crash cannot leave a torn or empty file behind:
 * serialize into a temp file, then rename it over the target (atomic on
 * the same directory). Used for every file whose corruption costs the
 * caller real work — the checkpoint state, the JSONL rewrite, the
 * persisted Telegram session.
 *
 * @param filePath - target path, written in place
 * @param content - the full file content
 */
export const writeAtomically = async (filePath: string, content: string): Promise<void> => {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
};
