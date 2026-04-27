export type Arrangement = "horizontal" | "vertical";

export type TargetSize = {
  width: number;
  height: number;
};

export type CropRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
};

export type CropLayoutInput = {
  imageWidth: number;
  imageHeight: number;
  count: number;
  arrangement: Arrangement;
  aspectRatio: number;
  targetSize?: TargetSize | null;
  cuts?: number[];
};

export function parseAspectRatio(value: string): number {
  const trimmed = value.trim();
  const pair = parseSizePair(trimmed);

  if (pair) {
    return assertPositiveRatio(pair.width / pair.height);
  }

  return assertPositiveRatio(Number(trimmed));
}

export function parseTargetSize(value: string): TargetSize | null {
  return parseSizePair(value.trim());
}

export function buildCropRects(input: CropLayoutInput): CropRect[] {
  const count = Math.max(1, Math.floor(input.count));
  const page = fitPageAspectRatio(input.imageWidth, input.imageHeight, input.aspectRatio);
  const cuts = normalizeCuts(input.cuts, count);
  const outputPageWidth = input.targetSize?.width ?? page.width;
  const outputPageHeight = input.targetSize?.height ?? page.height;

  return Array.from({ length: count }, (_, cellIndex) => {
    const start = cuts[cellIndex];
    const end = cuts[cellIndex + 1];
    const span = end - start;

    if (input.arrangement === "horizontal") {
      return {
        index: cellIndex + 1,
        x: round(page.x + page.width * start),
        y: round(page.y),
        width: round(page.width * span),
        height: round(page.height),
        outputWidth: round(outputPageWidth * span),
        outputHeight: round(outputPageHeight),
      };
    }

    return {
      index: cellIndex + 1,
      x: round(page.x),
      y: round(page.y + page.height * start),
      width: round(page.width),
      height: round(page.height * span),
      outputWidth: round(outputPageWidth),
      outputHeight: round(outputPageHeight * span),
    };
  });
}

export function createEvenCuts(count: number): number[] {
  const safeCount = Math.max(1, Math.floor(count));
  return Array.from({ length: safeCount + 1 }, (_, index) => index / safeCount);
}

function normalizeCuts(cuts: number[] | undefined, count: number): number[] {
  if (!cuts || cuts.length !== count + 1) {
    return createEvenCuts(count);
  }

  const normalized = cuts.map((value) => clamp(Number.isFinite(value) ? value : 0, 0, 1));
  normalized[0] = 0;
  normalized[count] = 1;

  for (let index = 1; index < normalized.length; index += 1) {
    normalized[index] = Math.max(normalized[index], normalized[index - 1]);
  }

  return normalized;
}

function parseSizePair(value: string): TargetSize | null {
  const pair = value.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);

  if (!pair) {
    return null;
  }

  const width = Number(pair[1]);
  const height = Number(pair[2]);
  assertPositiveRatio(width / height);
  return { width, height };
}

function fitPageAspectRatio(imageWidth: number, imageHeight: number, aspectRatio: number) {
  const targetRatio = assertPositiveRatio(aspectRatio);
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > targetRatio) {
    const width = imageHeight * targetRatio;
    return { x: (imageWidth - width) / 2, y: 0, width, height: imageHeight };
  }

  const height = imageWidth / targetRatio;
  return { x: 0, y: (imageHeight - height) / 2, width: imageWidth, height };
}

function assertPositiveRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("请输入有效的目标尺寸或整图宽高比，例如 1086:1448、3:4 或 0.75");
  }

  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}