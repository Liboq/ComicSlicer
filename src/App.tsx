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
  { label: "原图", width: 0, height: 0 },
  { label: "1086 x 1448", width: 1086, height: 1448 },
  { label: "3:4", width: 3, height: 4 },
  { label: "1:1", width: 1, height: 1 },
  { label: "9:16", width: 9, height: 16 },
  { label: "16:9", width: 16, height: 9 },
];

export default function App() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [count, setCount] = useState(4);
  const [targetWidth, setTargetWidth] = useState(1086);
  const [targetHeight, setTargetHeight] = useState(1448);
  const [arrangement, setArrangement] = useState<Arrangement>("vertical");
  const [cuts, setCuts] = useState(() => createEvenCuts(4));
  const [filenamePrefix, setFilenamePrefix] = useState("ComicSlicer_Export");
  const [previews, setPreviews] = useState<CropPreview[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
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
    const timer = window.setTimeout(() => {
      void checkForUpdates(false);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, []);

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
      setFilenamePrefix(file.name.replace(/\.[^.]+$/, "") || "ComicSlicer_Export");
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
      const filename = `${sanitizeFilename(filenamePrefix || "ComicSlicer_Export")}.zip`;
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
    if (preset.width === 0 && preset.height === 0) {
      if (!image) {
        setMessage("请先上传图片，再使用原图尺寸。");
        return;
      }
      setTargetWidth(image.width);
      setTargetHeight(image.height);
      return;
    }

    setTargetWidth(preset.width);
    setTargetHeight(preset.height);
  }

  function changeCount(nextCount: number) {
    setCount(clamp(Math.round(nextCount), 1, 60));
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

  async function checkForUpdates(manual: boolean) {
    if (!window.__TAURI_INTERNALS__) {
      if (manual) {
        setMessage("浏览器预览模式不支持自动更新，请在桌面应用中检查更新。");
      }
      return;
    }

    setIsCheckingUpdate(true);

    try {
      const [{ check }, { relaunch }] = await Promise.all([import("@tauri-apps/plugin-updater"), import("@tauri-apps/plugin-process")]);
      const update = await check();

      if (!update) {
        if (manual) {
          setMessage("当前已经是最新版本。");
        }
        return;
      }

      const shouldInstall = window.confirm(`发现新版本 ${update.version}，是否立即下载并安装？\n\n${update.body ?? ""}`);
      if (!shouldInstall) {
        setMessage(`发现新版本 ${update.version}，已选择稍后更新。`);
        return;
      }

      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            setMessage(`开始下载新版本 ${update.version}...`);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setMessage(`正在下载新版本 ${update.version}：${Math.round((downloaded / contentLength) * 100)}%`);
            }
            break;
          case "Finished":
            setMessage("更新下载完成，正在安装并重启应用...");
            break;
        }
      });

      await relaunch();
    } catch (error) {
      if (manual) {
        setMessage(error instanceof Error ? `检查更新失败：${error.message}` : "检查更新失败，请稍后重试。");
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#F7D989_0,#F6F1E7_24%,#EEF4EC_70%)] px-4 py-6 text-[#1F2723] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <Header />

        <section className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_300px]">
          <aside className="rounded-[28px] bg-white/80 p-5 shadow-[0_18px_45px_rgba(15,61,46,0.12)] backdrop-blur xl:p-6">
            <div className="space-y-7">
              <ControlStep number={1} title="上传漫画">
                <label className="block cursor-pointer rounded-2xl border border-dashed border-[#0F5A43]/25 bg-[#F6F1E7] p-4 transition hover:border-[#F5B82E] hover:bg-[#FFF8E8]">
                  <input className="sr-only" type="file" accept="image/*" onChange={handleFileChange} />
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow">📄</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{image?.file.name ?? "点击选择漫画图片"}</p>
                      <p className="mt-1 text-xs text-black/45">{image ? `${image.width} x ${image.height} px` : "PNG / JPG / WEBP"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${image ? "bg-[#0F5A43] text-white" : "bg-white text-black/45"}`}>
                      {image ? "已加载" : "待上传"}
                    </span>
                  </div>
                </label>
              </ControlStep>

              <ControlStep number={2} title="分割设置">
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm text-black/60">漫画格数</label>
                    <div className="flex h-12 items-center overflow-hidden rounded-2xl border border-black/10 bg-white">
                      <button className="h-full w-12 text-xl text-black/50 hover:bg-[#F6F1E7]" type="button" onClick={() => changeCount(count - 1)}>
                        -
                      </button>
                      <input
                        className="h-full min-w-0 flex-1 bg-transparent text-center font-semibold outline-none"
                        min={1}
                        max={60}
                        type="number"
                        value={count}
                        onChange={(event) => changeCount(Number(event.target.value) || 1)}
                      />
                      <button className="h-full w-12 text-xl text-[#0F5A43] hover:bg-[#F6F1E7]" type="button" onClick={() => changeCount(count + 1)}>
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-black/60">排列方向</label>
                    <div className="grid grid-cols-2 gap-3">
                      <DirectionButton active={arrangement === "vertical"} onClick={() => setArrangement("vertical")}>
                        上下排列
                      </DirectionButton>
                      <DirectionButton active={arrangement === "horizontal"} onClick={() => setArrangement("horizontal")}>
                        左右排列
                      </DirectionButton>
                    </div>
                  </div>
                </div>
              </ControlStep>

              <ControlStep number={3} title="目标导出尺寸">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div>
                    <label className="mb-2 block text-xs text-black/45">宽度</label>
                    <input
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[#F5B82E]"
                      min={1}
                      type="number"
                      value={targetWidth}
                      onChange={(event) => setTargetWidth(Number(event.target.value) || 0)}
                    />
                  </div>
                  <span className="pt-6 text-black/35">x</span>
                  <div>
                    <label className="mb-2 block text-xs text-black/45">高度</label>
                    <input
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm outline-none focus:border-[#F5B82E]"
                      min={1}
                      type="number"
                      value={targetHeight}
                      onChange={(event) => setTargetHeight(Number(event.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {sizePresets.map((preset) => (
                    <button
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-[#F5B82E] hover:text-[#0F5A43]"
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </ControlStep>

              <ControlStep number={4} title="导出设置">
                <input
                  className="mb-4 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#F5B82E]"
                  value={filenamePrefix}
                  onChange={(event) => setFilenamePrefix(event.target.value)}
                />

                <button className="h-16 w-full rounded-2xl bg-[#0F5A43] text-lg font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[#083B2D] disabled:cursor-not-allowed disabled:opacity-45" disabled={previews.length === 0 || isExporting} type="button" onClick={downloadZip}>
                  {isExporting ? "正在处理..." : `一键导出（${previews.length} 张）`}
                </button>
              </ControlStep>

              <div className="grid gap-3">
                <button className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-[#0F5A43] transition hover:border-[#F5B82E]" type="button" onClick={() => setCuts(createEvenCuts(count))}>
                  重置分割线
                </button>
                <button className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-[#0F5A43] transition hover:border-[#F5B82E] disabled:opacity-50" disabled={isCheckingUpdate} type="button" onClick={() => checkForUpdates(true)}>
                  {isCheckingUpdate ? "正在检查更新..." : "检查更新"}
                </button>
              </div>
            </div>
          </aside>

          <section className="rounded-[28px] bg-white/85 p-4 shadow-[0_18px_45px_rgba(15,61,46,0.12)] backdrop-blur sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-2xl font-black">裁剪区域预览</h2>
              {image && (
                <span className="w-fit rounded-full bg-[#0F5A43] px-4 py-2 text-sm font-bold text-white">
                  原图 {image.width} x {image.height} px
                </span>
              )}
            </div>

            <div className="flex min-h-[560px] items-center justify-center rounded-[24px] bg-[#8C8C8C] p-4 sm:min-h-[680px] sm:p-8">
              {image ? <SourcePreview arrangement={arrangement} cuts={cuts} image={image} onMoveCut={moveCut} rects={cropRects} /> : <EmptyCanvas />}
            </div>
          </section>

          <aside className="rounded-[28px] bg-white/80 p-5 shadow-[0_18px_45px_rgba(15,61,46,0.12)] backdrop-blur xl:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black">导出预览</h2>
              <span className="text-sm text-black/45">{previews.length} 张</span>
            </div>

            {previews.length > 0 ? (
              <div className="max-h-[620px] space-y-4 overflow-auto pr-1">
                {previews.map((preview) => (
                  <article className="rounded-2xl border border-black/10 bg-[#F6F1E7] p-3" key={preview.filename}>
                    <div className="flex gap-3">
                      <img className="h-16 w-28 rounded-lg bg-white object-cover" src={preview.url} alt={`Panel ${preview.index}`} />
                      <div className="min-w-0 flex-1 pt-1 text-sm">
                        <p className="font-bold">Panel {String(preview.index).padStart(2, "0")}</p>
                        <p className="mt-1 text-black/45">
                          {Math.round(preview.outputWidth)} x {Math.round(preview.outputHeight)} px
                        </p>
                        <button className="mt-2 text-xs font-bold text-[#0F5A43] hover:text-[#083B2D]" type="button" onClick={() => triggerDownload(preview.url, preview.filename)}>
                          下载单张
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-black/10 bg-[#F6F1E7] p-5 text-center text-sm text-black/45">
                上传图片后，这里会显示每一格的导出预览。
              </div>
            )}

            <div className="mt-6 rounded-2xl bg-[#0F5A43]/10 p-4">
              <p className="font-bold text-[#083B2D]">{previews.length > 0 ? "智能分割完成" : "等待分割"}</p>
              <p className="mt-2 text-sm leading-6 text-black/55">{message}</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Header() {
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#083B2D] to-[#062C22] px-6 py-7 shadow-[0_18px_45px_rgba(15,61,46,0.12)] sm:px-10 sm:py-8">
      <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/10 shadow-inner ring-1 ring-white/15">
            <div className="relative h-12 w-10 rounded-md bg-[#FFF8E8] shadow-lg">
              <div className="absolute left-2 top-2 h-3 w-3 border border-[#083B2D]" />
              <div className="absolute right-2 top-2 h-3 w-3 border border-[#083B2D]" />
              <div className="absolute bottom-2 left-2 h-3 w-3 border border-[#083B2D]" />
              <div className="absolute bottom-2 right-2 h-3 w-3 border border-[#083B2D]" />
              <div className="absolute left-1/2 top-1 h-10 w-[3px] -translate-x-1/2 rounded bg-[#F5B82E] shadow-[0_0_18px_rgba(245,184,46,0.75)]" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold tracking-[0.35em] text-[#F5B82E]">COMIC SLICER</p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">漫画格子裁剪器</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">自动识别漫画分镜，拖拽微调分割线，一键批量导出独立图片。</p>
          </div>
        </div>

        <div className="hidden w-[340px] rounded-3xl bg-white/10 p-6 text-white ring-1 ring-white/10 lg:block">
          <h3 className="mb-2 font-bold text-[#F5B82E]">分割线逻辑</h3>
          <p className="text-sm leading-7 text-white/75">拖动黄色分割线即可调整每个格子的高度，适合长漫画、条漫和多格漫画批量切图。</p>
        </div>
      </div>
    </section>
  );
}

function ControlStep({ children, number, title }: { children: React.ReactNode; number: number; title: string }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0F5A43] text-xs font-bold text-white">{number}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DirectionButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={active ? "rounded-2xl bg-[#0F5A43] py-3 text-sm font-bold text-white shadow" : "rounded-2xl border border-black/10 bg-white py-3 text-sm font-bold text-black/60 transition hover:border-[#F5B82E] hover:text-[#0F5A43]"}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
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
    <div className="relative max-h-[720px] max-w-full touch-none overflow-hidden rounded-xl bg-[#FFF8E8] shadow-2xl ring-4 ring-[#F5B82E]/70">
      <img ref={imageRef} className="block max-h-[720px] max-w-full select-none object-contain" src={image.url} alt="原始漫画" draggable={false} />
      {rects.map((rect) => (
        <div
          className="pointer-events-none absolute border border-[#F5B82E]/80 bg-[#F5B82E]/5"
          key={rect.index}
          style={{
            left: `${(rect.x / image.width) * 100}%`,
            top: `${(rect.y / image.height) * 100}%`,
            width: `${(rect.width / image.width) * 100}%`,
            height: `${(rect.height / image.height) * 100}%`,
          }}
        >
          <span className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#083B2D] text-sm font-bold text-white">{rect.index}</span>
        </div>
      ))}
      {page &&
        cuts.slice(1, -1).map((cut, offset) => {
          const index = offset + 1;
          const linePosition = arrangement === "vertical" ? ((page.y + page.height * cut) / image.height) * 100 : ((page.x + page.width * cut) / image.width) * 100;
          const crossStart = arrangement === "vertical" ? (page.x / image.width) * 100 : (page.y / image.height) * 100;
          const crossSize = arrangement === "vertical" ? (page.width / image.width) * 100 : (page.height / image.height) * 100;

          return (
            <button
              aria-label={`拖动第 ${index} 根分割线`}
              className={`absolute z-20 bg-[#F5B82E] shadow-[0_0_18px_rgba(245,184,46,0.75)] outline-none transition ${arrangement === "vertical" ? "h-[5px] -translate-y-1/2 cursor-ns-resize" : "w-[5px] -translate-x-1/2 cursor-ew-resize"} ${draggingIndex === index ? "scale-110" : "hover:brightness-110"}`}
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
              <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#F5B82E] bg-white shadow-[0_0_18px_rgba(245,184,46,0.75)]" />
              <span className="absolute left-0 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#F5B82E] bg-white shadow-[0_0_18px_rgba(245,184,46,0.75)]" />
              <span className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 translate-x-1/2 rounded-full border-4 border-[#F5B82E] bg-white shadow-[0_0_18px_rgba(245,184,46,0.75)]" />
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

function EmptyCanvas() {
  return (
    <div className="grid min-h-[420px] w-full place-items-center rounded-[24px] border border-dashed border-white/40 bg-black/10 p-8 text-center text-white">
      <div>
        <p className="text-5xl font-black text-white/30">+</p>
        <p className="mt-3 text-lg font-bold">等待上传漫画图片</p>
        <p className="mt-2 text-sm text-white/70">上传后会在这里显示可拖动的裁剪分割线。</p>
      </div>
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
      const filename = `${sanitizeFilename(prefix || "ComicSlicer_Export")}-${String(rect.index).padStart(2, "0")}.png`;

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
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "ComicSlicer_Export";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
