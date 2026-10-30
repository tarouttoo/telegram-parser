import { describe, expect, test } from "vitest";
import { credentialsFromEnv } from "./login";

describe("credentialsFromEnv", () => {
  test("accepts a numeric api id with its api hash", () => {
    expect(credentialsFromEnv({ TELEGRAM_API_ID: "12345", TELEGRAM_API_HASH: "abc123" })).toEqual({
      apiId: 12345,
      apiHash: "abc123",
    });
  });

  test("rejects a missing, non-numeric, or non-positive api id", () => {
    expect(credentialsFromEnv({ TELEGRAM_API_HASH: "abc123" })).toBeNull();
    expect(credentialsFromEnv({ TELEGRAM_API_ID: "twelve", TELEGRAM_API_HASH: "abc123" })).toBeNull();
    expect(credentialsFromEnv({ TELEGRAM_API_ID: "0", TELEGRAM_API_HASH: "abc123" })).toBeNull();
  });

  test("rejects a missing or empty api hash", () => {
    expect(credentialsFromEnv({ TELEGRAM_API_ID: "12345" })).toBeNull();
    expect(credentialsFromEnv({ TELEGRAM_API_ID: "12345", TELEGRAM_API_HASH: "" })).toBeNull();
  });
});
