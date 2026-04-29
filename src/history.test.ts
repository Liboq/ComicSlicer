import { describe, expect, it } from "vitest";
import { createHistoryEntry, updateHistoryEntry } from "./history";

describe("history helpers", () => {
  it("creates a history entry with the uploaded image and current cut positions", () => {
    const entry = createHistoryEntry({
      id: "first",
      name: "page.png",
      imageUrl: "blob:image",
      imageWidth: 1086,
      imageHeight: 1448,
      targetWidth: 1086,
      targetHeight: 1448,
      count: 4,
      arrangement: "vertical",
      cuts: [0, 0.25, 0.5, 0.75, 1],
      filenamePrefix: "page",
      createdAt: 1000,
    });

    expect(entry).toMatchObject({
      id: "first",
      name: "page.png",
      imageUrl: "blob:image",
      imageWidth: 1086,
      imageHeight: 1448,
      count: 4,
      arrangement: "vertical",
      cuts: [0, 0.25, 0.5, 0.75, 1],
    });
  });

  it("updates only the active history entry and keeps the latest cut positions", () => {
    const first = createHistoryEntry({
      id: "first",
      name: "first.png",
      imageUrl: "blob:first",
      imageWidth: 100,
      imageHeight: 200,
      targetWidth: 100,
      targetHeight: 200,
      count: 2,
      arrangement: "vertical",
      cuts: [0, 0.5, 1],
      filenamePrefix: "first",
      createdAt: 1000,
    });
    const second = createHistoryEntry({
      id: "second",
      name: "second.png",
      imageUrl: "blob:second",
      imageWidth: 200,
      imageHeight: 100,
      targetWidth: 200,
      targetHeight: 100,
      count: 2,
      arrangement: "horizontal",
      cuts: [0, 0.5, 1],
      filenamePrefix: "second",
      createdAt: 2000,
    });

    const updated = updateHistoryEntry([first, second], "first", {
      count: 3,
      cuts: [0, 0.2, 0.7, 1],
      filenamePrefix: "first-edited",
    });

    expect(updated[0]).toMatchObject({
      id: "first",
      count: 3,
      cuts: [0, 0.2, 0.7, 1],
      filenamePrefix: "first-edited",
    });
    expect(updated[1]).toEqual(second);
  });
});
