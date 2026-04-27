import { describe, expect, it } from "vitest";
import { buildCropRects, parseAspectRatio, parseTargetSize } from "./cropLayout";

describe("parseAspectRatio", () => {
  it("accepts common width:height input", () => {
    expect(parseAspectRatio("1086:1448")).toBeCloseTo(0.75);
    expect(parseAspectRatio("1/2")).toBeCloseTo(0.5);
    expect(parseAspectRatio("0.8")).toBeCloseTo(0.8);
  });
});

describe("parseTargetSize", () => {
  it("treats width:height input as the target export size", () => {
    expect(parseTargetSize("1086:1448")).toEqual({ width: 1086, height: 1448 });
    expect(parseTargetSize("3:4")).toEqual({ width: 3, height: 4 });
  });

  it("does not invent pixel dimensions for decimal-only ratios", () => {
    expect(parseTargetSize("0.75")).toBeNull();
  });
});

describe("buildCropRects", () => {
  it("splits a full horizontal page into equal panels", () => {
    expect(
      buildCropRects({ imageWidth: 1200, imageHeight: 400, count: 3, arrangement: "horizontal", aspectRatio: 3 }),
    ).toEqual([
      { index: 1, x: 0, y: 0, width: 400, height: 400, outputWidth: 400, outputHeight: 400 },
      { index: 2, x: 400, y: 0, width: 400, height: 400, outputWidth: 400, outputHeight: 400 },
      { index: 3, x: 800, y: 0, width: 400, height: 400, outputWidth: 400, outputHeight: 400 },
    ]);
  });

  it("splits a full vertical page into equal panels", () => {
    expect(
      buildCropRects({ imageWidth: 500, imageHeight: 1000, count: 2, arrangement: "vertical", aspectRatio: 0.5 }),
    ).toEqual([
      { index: 1, x: 0, y: 0, width: 500, height: 500, outputWidth: 500, outputHeight: 500 },
      { index: 2, x: 0, y: 500, width: 500, height: 500, outputWidth: 500, outputHeight: 500 },
    ]);
  });

  it("crops the overall page ratio before splitting panels", () => {
    expect(
      buildCropRects({ imageWidth: 1000, imageHeight: 1000, count: 2, arrangement: "vertical", aspectRatio: 0.5 }),
    ).toEqual([
      { index: 1, x: 250, y: 0, width: 500, height: 500, outputWidth: 500, outputHeight: 500 },
      { index: 2, x: 250, y: 500, width: 500, height: 500, outputWidth: 500, outputHeight: 500 },
    ]);
  });

  it("uses 1086:1448 as the complete page ratio, not a single-panel ratio", () => {
    expect(
      buildCropRects({ imageWidth: 1086, imageHeight: 1448, count: 4, arrangement: "vertical", aspectRatio: 1086 / 1448 }),
    ).toEqual([
      { index: 1, x: 0, y: 0, width: 1086, height: 362, outputWidth: 1086, outputHeight: 362 },
      { index: 2, x: 0, y: 362, width: 1086, height: 362, outputWidth: 1086, outputHeight: 362 },
      { index: 3, x: 0, y: 724, width: 1086, height: 362, outputWidth: 1086, outputHeight: 362 },
      { index: 4, x: 0, y: 1086, width: 1086, height: 362, outputWidth: 1086, outputHeight: 362 },
    ]);
  });

  it("exports panels at the selected target size even when the source image is different", () => {
    expect(
      buildCropRects({
        imageWidth: 1024,
        imageHeight: 1536,
        count: 4,
        arrangement: "vertical",
        aspectRatio: 1086 / 1448,
        targetSize: { width: 1086, height: 1448 },
      }),
    ).toEqual([
      { index: 1, x: 0, y: 85.333, width: 1024, height: 341.333, outputWidth: 1086, outputHeight: 362 },
      { index: 2, x: 0, y: 426.667, width: 1024, height: 341.333, outputWidth: 1086, outputHeight: 362 },
      { index: 3, x: 0, y: 768, width: 1024, height: 341.333, outputWidth: 1086, outputHeight: 362 },
      { index: 4, x: 0, y: 1109.333, width: 1024, height: 341.333, outputWidth: 1086, outputHeight: 362 },
    ]);
  });
  it("allows one custom cut line to move without re-spacing the others", () => {
    expect(
      buildCropRects({
        imageWidth: 1000,
        imageHeight: 1000,
        count: 4,
        arrangement: "vertical",
        aspectRatio: 1,
        targetSize: { width: 1000, height: 1000 },
        cuts: [0, 0.2, 0.5, 0.75, 1],
      }),
    ).toEqual([
      { index: 1, x: 0, y: 0, width: 1000, height: 200, outputWidth: 1000, outputHeight: 200 },
      { index: 2, x: 0, y: 200, width: 1000, height: 300, outputWidth: 1000, outputHeight: 300 },
      { index: 3, x: 0, y: 500, width: 1000, height: 250, outputWidth: 1000, outputHeight: 250 },
      { index: 4, x: 0, y: 750, width: 1000, height: 250, outputWidth: 1000, outputHeight: 250 },
    ]);
  });
});