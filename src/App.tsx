import JSZip from "jszip";
import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Arrangement, CropRect, buildCropRects, createEvenCuts } from "./cropLayout";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

type CropPreview = CropRect & {
  url: string;
  blob: Blob;
  filename: string;
};

type LoadedImage = {
  file: File;
  url: string;
  element: HTMLImageElement;
  width: number;
  height: number;
};

type SizePreset = {
  label: string;
  width: number;
  height: number;
};

const sizePresets: SizePreset[] = [
  { label: "1086 x 1448", width: 1086, height: 1448 },
  { label: "3 x 4", width: 3, height: 4 },
  { label: "1 x 1", width: 1, height: 1 },
  { label: "4 x 3", width: 4, height: 3 },
  { label: "9 x 16", width: 9, height: 16 },
  { label: "16 x 9", width: 16, height: 9 },
];

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [count, setCount] = useState(4);
  const [targetWidth, setTargetWidth] = useState(1086);
  const [targetHeight, setTargetHeight] = useState(1448);
  const [arrangement, setArrangement] = useState<Arrangement>("vertical");
  const [cuts, setCuts] = useState(() => createEvenCuts(4));
  const [filenamePrefix, setFilenamePrefix] = useState("comic-panel");
  const [previews, setPreviews] = useState<CropPreview[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState("上传图片后会自动识别原图尺寸，并填入目标宽高。你也可以拖动预览里的分割线微调每一格。");

  const targetSize = useMemo(() => {
    if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
      return null;
    }

    return { width: targetWidth, height: targetHeight };
  }, [targetHeight, targetWidth]);

  useEffect(() => {
    setCuts(createEvenCuts(count));
  }, [arrangement, count]);

  const cropRects = useMemo(() => {
    if (!image || !targetSize) {
      return [];
    }

    return buildCropRects({
      imageWidth: image.width,
      imageHeight: image.height,
      count,
      arrangement,
      aspectRatio: targetSize.width / targetSize.height,
      targetSize,
      cuts,
    });
  }, [arrangement, count, cuts, image, targetSize]);

  useEffect(() => {
    if (!image || !targetSize) {
      setPreviews((current) => revokePreviews(current));
      if (!targetSize) {
        setMessage("目标宽高必须是大于 0 的数字。");
      }
      return;
    }

    let cancelled = false;
    setIsExporting(true);

    renderCrops(image, cropRects, filenamePrefix)
      .then((nextPreviews) => {
        if (cancelled) {
          revokePreviews(nextPreviews);
          return;
        }

        setPreviews((current) => revokePreviews(current, nextPreviews));
        setMessage(`已生成 ${nextPreviews.length} 个完整格子。可以拖动黄色分割线单独调整某一根线。`);
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "裁剪失败，请换一张图片重试。");
      })
      .finally(() => {
        if (!cancelled) {
          setIsExporting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cropRects, filenamePrefix, image, targetSize]);

  useEffect(() => {
    return () => {
      if (image) {
        URL.revokeObjectURL(image.url);
      }
      revokePreviews(previews);
    };
  }, [image, previews]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const loaded = await loadImage(file);
      setImage((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous.url);
        }
        return loaded;
      });
      setTargetWidth(loaded.width);
      setTargetHeight(loaded.height);
      setCuts(createEvenCuts(count));
      setFilenamePrefix(file.name.replace(/\.[^.]+$/, "") || "comic-panel");
      setMessage(`已识别原图尺寸 ${loaded.width} x ${loaded.height}，并填入目标宽高。`);
    } catch {
      setMessage("图片读取失败，请上传 PNG、JPG、WEBP 等常见图片格式。");
    }
  }

  async function downloadZip() {
    if (previews.length === 0) {
      return;
    }

    setIsExporting(true);

    try {
      const zip = new JSZip();
      previews.forEach((preview) => zip.file(preview.filename, preview.blob));
      const filename = `${sanitizeFilename(filenamePrefix || "comic-panels")}.zip`;
      const blob = await zip.generateAsync({ type: "blob" });
      const savedPath = await saveZipBlob(blob, filename);

      if (savedPath) {
        setMessage(`批量下载已保存到：${savedPath}`);
      } else {
        setMessage("已取消批量下载。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? `批量下载失败：${error.message}` : "批量下载失败，请重试。");
    } finally {
      setIsExporting(false);
    }
  }

  function applyPreset(preset: SizePreset) {
    setTargetWidth(preset.width);
    setTargetHeight(preset.height);
  }

  function moveCut(index: number, value: number) {
    const minGap = 0.01;
    setCuts((current) => {
      const next = current.length === count + 1 ? [...current] : createEvenCuts(count);
      const lower = next[index - 1] + minGap;
      const upper = next[index + 1] - minGap;
      next[index] = clamp(value, lower, upper);
      return next;
    });
  }

  return (
    <main className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,#f6d88a_0,#f4efe4_32%,#d7eadb_100%)] px-4 py-6 text-stone-900 sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(23,33,27,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(23,33,27,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <section className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <header className="grid gap-5 rounded-[2rem] border border-emerald-950/10 bg-emerald-950 px-6 py-7 text-amber-50 shadow-2xl shadow-emerald-950/20 sm:px-8 lg:grid-cols-[1.4fr_.8fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-amber-200/80">Comic Slicer</p>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl">漫画格子裁剪器</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-emerald-50/80">
              上传连续漫画，自动识别尺寸并按格数切分。需要微调时，直接拖动预览里的黄色分割线，每根线都能独立移动。
            </p>
          </div>
          <div className="rounded-3xl bg-amber-100/10 p-5 text-sm leading-7 text-amber-50/80">
            <strong className="block text-lg text-amber-100">分割线逻辑</strong>
            拖动某一根内部线只改变相邻两格大小，不会重新平均其他分割线。点击“重置分割线”可恢复等分。
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <aside className="paper-card rounded-[2rem] p-5 sm:p-6">
            <div className="space-y-5">
              <label className="block">
                <span className="control-label">上传漫画图片</span>
                <input className="control-input mt-2" type="file" accept="image/*" onChange={handleFileChange} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="control-label">漫画格数</span>
                  <input
                    className="control-input mt-2"
                    min={1}
                    max={60}
                    type="number"
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value) || 1)}
                  />
                </label>
                <label>
                  <span className="control-label">排列方向</span>
                  <select className="control-input mt-2" value={arrangement} onChange={(event) => setArrangement(event.target.value as Arrangement)}>
                    <option value="vertical">上下排列</option>
                    <option value="horizontal">左右排列</option>
                  </select>
                </label>
              </div>

              <div>
                <span className="control-label">目标导出尺寸</span>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input className="control-input" min={1} type="number" value={targetWidth} onChange={(event) => setTargetWidth(Number(event.target.value) || 0)} />
                  <span className="font-black text-stone-500">x</span>
                  <input className="control-input" min={1} type="number" value={targetHeight} onChange={(event) => setTargetHeight(Number(event.target.value) || 0)} />
                </div>
                <p className="mt-2 text-xs leading-5 text-stone-500">上传图片会自动填入原图尺寸；也可以手动改成 1086 x 1448。</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {sizePresets.map((preset) => (
                  <button className="secondary-button !px-3 !py-2 text-sm" key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                    {preset.label}
                  </button>
                ))}
              </div>

              <button className="secondary-button w-full" type="button" onClick={() => setCuts(createEvenCuts(count))}>
                重置分割线为等分
              </button>

              <label className="block">
                <span className="control-label">导出文件名前缀</span>
                <input className="control-input mt-2" value={filenamePrefix} onChange={(event) => setFilenamePrefix(event.target.value)} />
              </label>

              <button className="primary-button w-full" disabled={previews.length === 0 || isExporting} type="button" onClick={downloadZip}>
                {isExporting ? "正在处理..." : `选择位置并批量保存 ${previews.length || ""} 个格子`}
              </button>

              <p className="rounded-2xl bg-stone-900 px-4 py-3 text-sm leading-6 text-amber-50">{message}</p>
            </div>
          </aside>

          <section className="grid gap-6">
            <div className="paper-card rounded-[2rem] p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black">裁剪区域预览</h2>
                {image && (
                  <span className="rounded-full bg-emerald-900 px-3 py-1 text-sm font-bold text-amber-50">
                    原图 {image.width} x {image.height} / 目标 {targetWidth} x {targetHeight}
                  </span>
                )}
              </div>
              <div className="relative grid min-h-[260px] place-items-center overflow-hidden rounded-3xl border border-dashed border-stone-300 bg-stone-100/80 p-3">
                {image ? <SourcePreview arrangement={arrangement} cuts={cuts} image={image} onMoveCut={moveCut} rects={cropRects} /> : <EmptyState />}
              </div>
            </div>

            <div className="paper-card rounded-[2rem] p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black">单格结果</h2>
                  <p className="text-sm text-stone-600">预览图和下载文件会按目标尺寸输出；微调分割线后会自动重新生成。</p>
                </div>
              </div>
              {previews.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {previews.map((preview) => (
                    <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" key={preview.filename}>
                      <img className="h-64 w-full bg-stone-100 object-contain" src={preview.url} alt={`第 ${preview.index} 格预览`} />
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-black">第 {preview.index} 格</p>
                          <p className="text-xs text-stone-500">导出 {Math.round(preview.outputWidth)} x {Math.round(preview.outputHeight)}</p>
                          <p className="text-xs text-stone-400">源图 {Math.round(preview.width)} x {Math.round(preview.height)}</p>
                        </div>
                        <button className="secondary-button" type="button" onClick={() => triggerDownload(preview.url, preview.filename)}>
                          下载
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-stone-300 bg-white/60 text-center text-stone-500">
                  上传图片后，这里会显示裁剪出的每一个漫画格。
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SourcePreview({
  arrangement,
  cuts,
  image,
  onMoveCut,
  rects,
}: {
  arrangement: Arrangement;
  cuts: number[];
  image: LoadedImage;
  onMoveCut: (index: number, value: number) => void;
  rects: CropRect[];
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const page = getPageBounds(rects);

  function updateCutFromPointer(event: PointerEvent<HTMLElement>, index: number) {
    const element = imageRef.current;
    if (!element || !page) {
      return;
    }

    const box = element.getBoundingClientRect();
    const imagePosition = arrangement === "vertical" ? ((event.clientY - box.top) / box.height) * image.height : ((event.clientX - box.left) / box.width) * image.width;
    const pageStart = arrangement === "vertical" ? page.y : page.x;
    const pageSize = arrangement === "vertical" ? page.height : page.width;
    onMoveCut(index, (imagePosition - pageStart) / pageSize);
  }

  return (
    <div className="relative max-h-[680px] max-w-full touch-none">
      <img ref={imageRef} className="block max-h-[680px] max-w-full select-none rounded-2xl object-contain" src={image.url} alt="原始漫画" draggable={false} />
      {rects.map((rect) => (
        <div
          className="pointer-events-none absolute border-2 border-amber-300 bg-amber-300/10 shadow-[0_0_0_9999px_rgba(0,0,0,.10)]"
          key={rect.index}
          style={{
            left: `${(rect.x / image.width) * 100}%`,
            top: `${(rect.y / image.height) * 100}%`,
            width: `${(rect.width / image.width) * 100}%`,
            height: `${(rect.height / image.height) * 100}%`,
          }}
        >
          <span className="absolute left-2 top-2 rounded-full bg-emerald-950 px-2 py-1 text-xs font-black text-amber-50">{rect.index}</span>
        </div>
      ))}
      {page && cuts.slice(1, -1).map((cut, offset) => {
        const index = offset + 1;
        const linePosition = arrangement === "vertical" ? ((page.y + page.height * cut) / image.height) * 100 : ((page.x + page.width * cut) / image.width) * 100;
        const crossStart = arrangement === "vertical" ? (page.x / image.width) * 100 : (page.y / image.height) * 100;
        const crossSize = arrangement === "vertical" ? (page.width / image.width) * 100 : (page.height / image.height) * 100;

        return (
          <button
            aria-label={`拖动第 ${index} 根分割线`}
            className={`absolute z-20 rounded-full bg-amber-300 shadow-lg shadow-amber-950/30 outline-none ring-4 ring-emerald-950/20 transition ${arrangement === "vertical" ? "h-2 -translate-y-1/2 cursor-ns-resize" : "w-2 -translate-x-1/2 cursor-ew-resize"} ${draggingIndex === index ? "scale-110 bg-orange-400" : "hover:bg-orange-300"}`}
            key={index}
            onPointerDown={(event) => {
              setDraggingIndex(index);
              event.currentTarget.setPointerCapture(event.pointerId);
              updateCutFromPointer(event, index);
            }}
            onPointerMove={(event) => {
              if (draggingIndex === index) {
                updateCutFromPointer(event, index);
              }
            }}
            onPointerUp={(event) => {
              setDraggingIndex(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            style={arrangement === "vertical" ? { left: `${crossStart}%`, top: `${linePosition}%`, width: `${crossSize}%` } : { left: `${linePosition}%`, top: `${crossStart}%`, height: `${crossSize}%` }}
            type="button"
          >
            <span className={`absolute rounded-full bg-emerald-950 text-[10px] font-black leading-5 text-amber-50 ${arrangement === "vertical" ? "left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2" : "left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2"}`}>
              {index}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function getPageBounds(rects: CropRect[]) {
  if (rects.length === 0) {
    return null;
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function EmptyState() {
  return (
    <div className="max-w-sm text-center">
      <p className="text-5xl font-black text-emerald-900/20">+</p>
      <p className="mt-2 font-bold text-stone-600">等待上传漫画图片</p>
      <p className="mt-2 text-sm leading-6 text-stone-500">支持一张长图中包含 2 格、4 格或更多格子的漫画。</p>
    </div>
  );
}

function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new Image();

    element.onload = () => {
      resolve({ file, url, element, width: element.naturalWidth, height: element.naturalHeight });
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image failed to load"));
    };
    element.src = url;
  });
}

async function renderCrops(image: LoadedImage, rects: CropRect[], prefix: string): Promise<CropPreview[]> {
  return Promise.all(
    rects.map(async (rect) => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.outputWidth));
      canvas.height = Math.max(1, Math.round(rect.outputHeight));
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("当前环境不支持 Canvas 裁剪。");
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.element, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas);
      const filename = `${sanitizeFilename(prefix || "comic-panel")}-${String(rect.index).padStart(2, "0")}.png`;

      return { ...rect, blob, filename, url: URL.createObjectURL(blob) };
    }),
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片导出失败。"));
      }
    }, "image/png");
  });
}

function revokePreviews(current: CropPreview[], keep: CropPreview[] = []): CropPreview[] {
  const keepUrls = new Set(keep.map((preview) => preview.url));
  current.forEach((preview) => {
    if (!keepUrls.has(preview.url)) {
      URL.revokeObjectURL(preview.url);
    }
  });
  return keep;
}

async function saveZipBlob(blob: Blob, filename: string): Promise<string | null> {
  if (window.__TAURI_INTERNALS__) {
    const [{ save }, { writeFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
    const path = await save({
      defaultPath: filename,
      filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
    });

    if (!path) {
      return null;
    }

    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return path;
  }

  triggerDownload(URL.createObjectURL(blob), filename, true);
  return "浏览器默认下载目录";
}

function triggerDownload(url: string, filename: string, revokeAfterClick = false) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (revokeAfterClick) {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "comic-panel";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}