"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Transformer } from "react-konva";
import useImage from "use-image";
import { useRouter } from "next/navigation";
import { isMobile as deviceIsMobile } from "react-device-detect";

/** ПЕЧАТНЫЙ (логический) размер холста */
const CANVAS_WIDTH = 3000;
const CANVAS_HEIGHT = 4500;

/** Макс. видимая высота области рисования */
const VIEWPORT_MAX_HEIGHT = deviceIsMobile ? 640 : 760;

type DrwLine = { color: string; size: number; points: number[] };
type ImgItem = {
  id: string;
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

const EditorCanvas: React.FC = () => {
  const router = useRouter();

  /** mockup-подложка (front/back) */
  const [mockupType, setMockupType] = useState<"front" | "back">("front");
  const [mockupImage] = useImage(
    mockupType === "front" ? "/mockups/MOCAP_FRONT.png" : "/mockups/MOCAP_BACK.png"
  );

  /** пользовательские картинки и мазки */
  const [images, setImages] = useState<ImgItem[]>([]);
  const [drawings, setDrawings] = useState<DrwLine[]>([]);

  /** инструменты */
  const [mode, setMode] = useState<"move" | "brush">("brush");
  const [brushColor, setBrushColor] = useState("#d63384");
  const [brushSize, setBrushSize] = useState(8);

  /** выбор и opacity */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number>(1);

  /** меню: теперь выдвижное и на десктопе, и на мобиле */
  const [menuOpen, setMenuOpen] = useState<boolean>(!deviceIsMobile);

  /** refs */
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef<boolean>(false);

  /** вычисляем масштаб s для вписывания печатного холста в доступную область */
  const [stageSize, setStageSize] = useState<{ w: number; h: number; s: number }>({
    w: CANVAS_WIDTH,
    h: CANVAS_HEIGHT,
    s: 1,
  });

  const recalcScale = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;

    const maxW = el.clientWidth;
    const maxH = Math.min(VIEWPORT_MAX_HEIGHT, window.innerHeight * 0.82);

    const sx = maxW / CANVAS_WIDTH;
    const sy = maxH / CANVAS_HEIGHT;
    const s = Math.min(sx, sy);

    setStageSize({
      w: Math.round(CANVAS_WIDTH * s),
      h: Math.round(CANVAS_HEIGHT * s),
      s,
    });
  }, []);

  useEffect(() => {
    recalcScale();
    window.addEventListener("resize", recalcScale);
    return () => window.removeEventListener("resize", recalcScale);
  }, [recalcScale]);

  /** БЛОКИРУЕМ ЖЕСТЫ/СКРОЛЛ на мобильных во время взаимодействия с канвасом */
  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;

    // Полностью отключаем стандартные жесты в зоне канваса
    root.style.touchAction = "none"; // блокирует панорамирование/пинч/даблтап-зуум
    root.style.overscrollBehavior = "none";

    // iOS Safari: доп. защита от жестов масштабирования
    const prevent = (e: Event) => e.preventDefault();
    root.addEventListener("gesturestart", prevent as any, { passive: false });
    root.addEventListener("gesturechange", prevent as any, { passive: false });
    root.addEventListener("gestureend", prevent as any, { passive: false });

    // и колесо с ctrl (масштаб страницы)
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      root.style.touchAction = "";
      root.style.overscrollBehavior = "";
      root.removeEventListener("gesturestart", prevent as any);
      root.removeEventListener("gesturechange", prevent as any);
      root.removeEventListener("gestureend", prevent as any);
      root.removeEventListener("wheel", onWheel as any);
    };
  }, []);

  /** Transformer привязка к выбранному изображению */
  useEffect(() => {
    if (transformerRef.current && selectedIndex !== null) {
      const node = stageRef.current?.findOne?.(`#img-${selectedIndex}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer().batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [selectedIndex, images.length]);

  /** Загрузка пользовательского изображения */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.src = reader.result as string;
      img.onload = () => {
        // Делаем стартовый размер 50% ширины макета (с сохранением пропорций)
        const initW = CANVAS_WIDTH * 0.5;
        const ratio = img.height / img.width;
        const initH = initW * ratio;

        const item: ImgItem = {
          id: String(Date.now()),
          image: img,
          x: (CANVAS_WIDTH - initW) / 2,
          y: (CANVAS_HEIGHT - initH) / 2,
          width: initW,
          height: initH,
          rotation: 0,
          opacity: 1,
        };
        setImages((prev) => [...prev, item]);
        setSelectedIndex(images.length);
        setMode("move");
      };
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = "";
  };

  /** Перевод экранных координат → мировые (учитываем масштаб s) */
  const toWorld = useCallback(() => {
    const stage = stageRef.current as any;
    const pos = stage?.getPointerPosition?.();
    if (!pos) return null;
    const s = stageSize.s;
    return { x: pos.x / s, y: pos.y / s };
  }, [stageSize.s]);

  /** Рисование */
  const onPointerDown = (e: any) => {
    // клик по пустоте снимает выделение
    if (e.target === e.target.getStage()) setSelectedIndex(null);
    if (mode !== "brush") return;
    const wp = toWorld();
    if (!wp) return;
    drawing.current = true;
    setDrawings((prev) => [...prev, { color: brushColor, size: brushSize, points: [wp.x, wp.y] }]);
  };

  const onPointerMove = () => {
    if (!drawing.current || mode !== "brush") return;
    const wp = toWorld();
    if (!wp) return;
    setDrawings((prev) => {
      const last = prev[prev.length - 1];
      const next = { ...last, points: [...last.points, wp.x, wp.y] };
      return [...prev.slice(0, -1), next];
    });
  };

  const onPointerUp = () => {
    drawing.current = false;
  };

  /** Опасити у выбранной картинки */
  useEffect(() => {
    if (selectedIndex === null) return;
    setImages((prev) => {
      const arr = [...prev];
      arr[selectedIndex] = { ...arr[selectedIndex], opacity };
      return arr;
    });
  }, [opacity, selectedIndex]);

  const clearDrawing = () => setDrawings([]);

  /** Экспорт ровно в печатный размер */
  const handleDownload = async () => {
    const stage = stageRef.current as any;
    if (!stage) return;
    const pixelRatio = 1 / stageSize.s; // даёт CANVAS_WIDTH×CANVAS_HEIGHT
    const canvas: HTMLCanvasElement = await stage.toCanvas({ pixelRatio });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "composition.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  /** Рисуем МОКАП без искажений: fit=contain + центрируем */
  const mockupRect = useMemo(() => {
    if (!mockupImage) return null;
    const iw = mockupImage.width || CANVAS_WIDTH;
    const ih = mockupImage.height || CANVAS_HEIGHT;
    const scale = Math.min(CANVAS_WIDTH / iw, CANVAS_HEIGHT / ih); // contain
    const w = iw * scale;
    const h = ih * scale;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    return { x, y, w, h };
  }, [mockupImage]);

  return (
    <div className="w-screen h-screen bg-white overflow-hidden flex flex-col">
      {/* Панель (выдвижная) — одинаковая логика для мобилы и десктопа */}
      <div className="p-3 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="text-sm border px-3 py-1">
            Back
          </button>
          <span className="text-sm opacity-70">Darkroom</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="text-sm border px-3 py-1"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          >
            {menuOpen ? "Hide panel" : "Show panel"}
          </button>
          <button className="bg-black text-white text-sm px-3 py-1" onClick={handleDownload}>
            Download PNG
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Выдвижная панель инструментов */}
        <aside
          className={`border-r p-4 transition-transform duration-200 ease-out
            ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
          aria-hidden={!menuOpen && window.innerWidth < 1024}
        >
          <div className="flex flex-wrap gap-2 mb-4 text-sm">
            <button
              className={`border px-3 py-1 ${mode === "move" ? "bg-black text-white" : ""}`}
              onClick={() => setMode("move")}
            >
              Move
            </button>
            <button
              className={`border px-3 py-1 ${mode === "brush" ? "bg-black text-white" : ""}`}
              onClick={() => setMode("brush")}
            >
              Brush
            </button>
            <button
              className={`border px-3 py-1 ${mockupType === "front" ? "bg-black text-white" : ""}`}
              onClick={() => setMockupType("front")}
            >
              Front
            </button>
            <button
              className={`border px-3 py-1 ${mockupType === "back" ? "bg-black text-white" : ""}`}
              onClick={() => setMockupType("back")}
            >
              Back
            </button>
            <button className="border px-3 py-1" onClick={clearDrawing}>
              Clear strokes
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs mb-1">Add image</label>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </div>

            <div>
              <label className="block text-xs mb-1">Selected image opacity: {Math.round(opacity * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-[2px] bg-black appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2
                  [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Brush size: {brushSize}px</label>
              <input
                type="range"
                min="1"
                max="40"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full h-[2px] bg-black appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2
                  [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Brush color</label>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-8 h-8 border p-0 cursor-pointer"
              />
            </div>
          </div>
        </aside>

        {/* Область рисования — КАНВАС ПО ЦЕНТРУ */}
        <section className="relative flex items-center justify-center">
          <div
            ref={wrapRef}
            className="w-full h-full flex items-center justify-center select-none"
            style={{
              maxHeight: VIEWPORT_MAX_HEIGHT,
              touchAction: "none",        // жесты off
              overscrollBehavior: "none", // не тянуть страницу
            }}
            // страховка: полностью запрещаем скролл/зум в зоне канваса
            onTouchMove={(e) => e.preventDefault()}
            onWheel={(e) => {
              if ((e as any).ctrlKey) e.preventDefault();
            }}
          >
            <Stage
              ref={stageRef}
              width={stageSize.w}
              height={stageSize.h}
              scale={{ x: stageSize.s, y: stageSize.s }}
              onMouseDown={onPointerDown}
              onMousemove={onPointerMove}
              onMouseup={onPointerUp}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
              style={{ transform: "translateY(-12px)" }}
            >
              <Layer>
                {mockupImage && mockupRect && (
                  <KonvaImage
                    image={mockupImage}
                    x={mockupRect.x}
                    y={mockupRect.y}
                    width={mockupRect.w}
                    height={mockupRect.h}
                    listening={false}
                  />
                )}

                {images.map((img, idx) => (
                  <KonvaImage
                    key={img.id}
                    id={`img-${idx}`}
                    image={img.image}
                    x={img.x}
                    y={img.y}
                    width={img.width}
                    height={img.height}
                    rotation={img.rotation}
                    opacity={img.opacity}
                    draggable={mode === "move"}
                    onClick={() => setSelectedIndex(idx)}
                    onTap={() => setSelectedIndex(idx)}
                    onDragEnd={(e) => {
                      const { x, y } = e.target.position();
                      setImages((prev) => {
                        const arr = [...prev];
                        arr[idx] = { ...arr[idx], x, y };
                        return arr;
                      });
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      const newW = Math.max(10, node.width() * scaleX);
                      const newH = Math.max(10, node.height() * scaleY);
                      setImages((prev) => {
                        const arr = [...prev];
                        arr[idx] = { ...arr[idx], width: newW, height: newH, rotation: node.rotation() };
                        return arr;
                      });
                    }}
                  />
                ))}

                {drawings.map((ln, i) => (
                  <Line
                    key={i}
                    points={ln.points}
                    stroke={ln.color}
                    strokeWidth={ln.size}
                    lineCap="round"
                    lineJoin="round"
                    tension={0}
                    globalCompositeOperation="source-over"
                  />
                ))}

                {selectedIndex !== null && <Transformer ref={transformerRef} rotateEnabled={true} />}
              </Layer>
            </Stage>
          </div>
        </section>
      </div>
    </div>
  );
};

export default EditorCanvas;
