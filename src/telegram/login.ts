import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { writeAtomically } from "../fs/writeAtomically";

/**
 * Where the persisted GramJS session string lives: next to the data
 * directory in the repo root, gitignored (ADR 0002 — a personal session
 * never leaves the local machine).
 */
const sessionFileName = "telegram.session";

/** The `api_id`/`api_hash` pair from https://my.telegram.org (ADR 0002). */
export interface TelegramCredentials {
  /** The application api id. */
  readonly apiId: number;
  /** The application api hash. */
  readonly apiHash: string;
}

/** Why `npm run parse` could not start a real backfill. */
export const missingCredentialsMessage =
  "TELEGRAM_API_ID and TELEGRAM_API_HASH must be set for the real backfill — " +
  "create an app at https://my.telegram.org and export both (see README, " +
  '"First run"). For an offline run against the bundled fixture source: ' +
  "npm run parse -- --fixture";

/**
 * Read the Telegram credentials from the environment.
 *
 * @param env - the environment to read (`process.env` in production)
 * @returns the credentials, or null when missing or malformed — the run
 *   should fail fast with `missingCredentialsMessage`, not prompt
 */
export const credentialsFromEnv = (env: NodeJS.ProcessEnv): TelegramCredentials | null => {
  const apiId = Number(env.TELEGRAM_API_ID);
  const apiHash = env.TELEGRAM_API_HASH;
  if (!Number.isInteger(apiId) || apiId <= 0) return null;
  if (apiHash === undefined || apiHash === "") return null;
  return { apiId, apiHash };
};

/**
 * Read the persisted session string; a missing file means no login has
 * ever happened on this machine.
 */
const readSessionString = async (): Promise<string> => {
  try {
    return (await readFile(sessionFileName, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
};

/**
 * Connect the GramJS client for a real backfill, reusing the persisted
 * session when there is one and running the one-time interactive login
 * (phone, sent code, optional two-factor password) when there is not.
 * A fresh login is persisted to the session file, so every later run
 * reconnects without prompts. Auth errors (wrong code, expired session)
 * propagate to the caller fail-fast — rerunning restarts the login.
 *
 * @returns the connected client the GramJS adapter drives
 */
export const connectGramjsClient = async (): Promise<TelegramClient> => {
  const credentials = credentialsFromEnv(process.env);
  if (credentials === null) throw new Error(missingCredentialsMessage);

  const savedSession = await readSessionString();
  const session = new StringSession(savedSession);
  const client = new TelegramClient(session, credentials.apiId, credentials.apiHash, {
    connectionRetries: 5,
  });
  // GramJS checks the session's authorization first: an already-logged-in
  // session returns from start() without prompting, so the interactive
  // flow below only runs on the true first login.
  await client.start({
    phoneNumber: async () =>
      prompt("Telegram phone number (international format, e.g. +49170...):"),
    phoneCode: async () => prompt("Login code Telegram sent you:"),
    password: async () => prompt("Two-factor password (empty if none):"),
    onError: (error) => {
      throw error;
    },
  });
  const currentSession = session.save();
  if (currentSession !== savedSession) {
    // Atomic like every other file a crash would make the caller redo
    // work for — a torn session string means the interactive login again.
    await writeAtomically(sessionFileName, `${currentSession}\n`);
  }
  return client;
};

const prompt = async (label: string): Promise<string> => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await readline.question(`${label} `);
  } finally {
    readline.close();
  }
};
