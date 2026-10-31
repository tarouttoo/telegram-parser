import { describe, expect, it } from "vitest";

import { ExportFormatError, normalizeExport } from "./normalize";

const envelope = (messages: unknown[]): unknown => ({
  name: "Grisha Market Maker",
  type: "public_channel",
  id: 4465712794,
  messages,
});

describe("normalizeExport", () => {
  it("rejects a non-object export and a missing messages array", () => {
    expect(() => normalizeExport("x", "nope")).toThrow(ExportFormatError);
    expect(() => normalizeExport("x", { name: "x" })).toThrow(ExportFormatError);
  });

  it("drops service messages and keeps posts with the envelope metadata", () => {
    const result = normalizeExport(
      "grisha",
      envelope([
        { id: 1, type: "service", action: "create_channel", date: "2026-08-22T04:09:15" },
        { id: 2, type: "message", date: "2026-08-22T04:10:15", date_unixtime: "1755835815", text: "hi" },
      ]),
    );
    expect(result.source).toEqual({ name: "Grisha Market Maker", type: "public_channel", id: 4465712794 });
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.source_message_id).toBe(2);
  });

  it("flattens markup parts into plain text and defaults tags to empty", () => {
    const result = normalizeExport(
      "grisha",
      envelope([
        {
          id: 7,
          type: "message",
          date: "2026-08-22T04:09:15",
          date_unixtime: "1755835755",
          text: ["plain ", { type: "link", text: "https://x.io" }, [" nested", " parts"]],
        },
      ]),
    );
    expect(result.posts[0]?.text).toBe("plain https://x.io nested parts");
    expect(result.posts[0]?.tags).toEqual([]);
  });

  it("normalizes dates from date_unixtime to ISO UTC", () => {
    const result = normalizeExport(
      "grisha",
      envelope([{ id: 1, type: "message", date: "1970-01-01T00:00:00", date_unixtime: "0", text: "" }]),
    );
    expect(result.posts[0]?.date).toBe("1970-01-01T00:00:00Z");
  });

  it("maps authorship, forwarding, replies and media metadata", () => {
    const result = normalizeExport(
      "hft-underground",
      envelope([
        { id: 1, type: "message", date: "2026-01-22T22:49:01", date_unixtime: "1769122141", from: "Kolya", text: "chat msg" },
        {
          id: 2,
          type: "message",
          date: "2026-01-22T22:50:01",
          date_unixtime: "1769122201",
          text: "",
          photo: "photos/photo_1@01:50:01.jpg",
        },
        {
          id: 3,
          type: "message",
          date: "2026-01-22T22:51:01",
          date_unixtime: "1769122261",
          text: "look",
          forwarded_from: "Grisha Market Maker",
          reply_to_message_id: 1,
          file: "files/report.pdf",
          file_name: "report.pdf",
        },
      ]),
    );
    expect(result.posts[0]?.author).toBe("Kolya");
    expect(result.posts[1]?.author).toBeNull();
    expect(result.posts[1]?.has_photo).toBe(true);
    expect(result.posts[1]?.has_file).toBe(false);
    expect(result.posts[2]?.forwarded_from).toBe("Grisha Market Maker");
    expect(result.posts[2]?.reply_to).toBe(1);
    expect(result.posts[2]?.has_file).toBe(true);
    expect(result.posts[2]?.file_name).toBe("report.pdf");
  });
});
