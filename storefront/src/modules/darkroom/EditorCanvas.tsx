"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Transformer } from "react-konva";
import useImage from "use-image";
import { useRouter } from "next/navigation";
import { isMobile } from "react-device-detect";

/**
 * ПЕЧАТНЫЙ размер холста (логический/мировой).
 * Пример: 3000x4500 px ~ 20x30 см @ 380 dpi или 30x45 см @ 254 dpi — под мерч с запасом.
 * Можно смело менять под нужную технологию печати.
 */
const CANVAS_WIDTH = 3000;
const CANVAS_HEIGHT = 4500;

/** Видимая высота области рисования на устройстве */
const VIEWPORT_MAX_HEIGHT = isMobile ? 640 : 760;

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

  // mockup front/back (подложка)
  const [mockupType, setMockupType] = useState<"front" | "back">("front");
  const [mockupImage] = useImage(
    mockupType === "front" ? "/mockups/MOCAP_FRONT.png" : "/mockups/MOCAP_BACK.png"
  );

  // слои
  const [images, setImages] = useState<ImgItem[]>([]);
  const [drawings, setDrawings] = useState<DrwLine[]>([]);

  // инструменты
  const [mode, setMode] = useState<"move" | "brush">("brush");
  const [brushColor, setBrushColor] = useState("#d63384");
  const [brushSize, setBrushSize] = useState(8);

  // выбор/трансформ
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [opacity, setOpacity] = useState<number>(1);

  // UI
  const [menuOpen, setMenuOpen] = useState<boolean>(!isMobile);

  // refs
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // текущее рисование
  const drawing = useRef<boolean>(false);

  /**
   * Расчёт скейла s — как вписать печатный холст в контейнер экрана.
   * Stage логически остаётся CANVAS_WIDTH×CANVAS_HEIGHT, но визуально уменьшается s-раз.
   */
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

  // трансформер к выбранной картинке
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

  // загрузка изображения пользователем
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.src = reader.result as string;
      img.onload = () => {
        // начальный размер: 50% ширины макета, фиксируем пропорции
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

  // перевод экранных координат → мировые
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current as any;
      const pos = stage?.getPointerPosition?.();
      if (!pos) return null;

      // Stage отрисован со scale=s и имеет визуальный размер stageSize.w×stageSize.h
      // getPointerPosition уже учитывает offset, но scale нужно «снять»
      const s = stageSize.s;
      return { x: pos.x / s, y: pos.y / s };
    },
    [stageSize.s]
  );

  // рисование
  const onPointerDown = (e: any) => {
    // клик по пустоте снимает выделение
    if (e.target === e.target.getStage()) setSelectedIndex(null);
    if (mode !== "brush") return;
    const wp = toWorld(e.evt.clientX, e.evt.clientY);
    if (!wp) return;
    drawing.current = true;
    setDrawings((prev) => [...prev, { color: brushColor, size: brushSize, points: [wp.x, wp.y] }]);
  };

  const onPointerMove = (e: any) => {
    if (!drawing.current || mode !== "brush") return;
    const wp = toWorld(e.evt.clientX, e.evt.clientY);
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

  // изменение opacity у выбранной картинки
  useEffect(() => {
    if (selectedIndex === null) return;
    setImages((prev) => {
      const arr = [...prev];
      arr[selectedIndex] = { ...arr[selectedIndex], opacity };
      return arr;
    });
  }, [opacity, selectedIndex]);

  // очистка росписи
  const clearDrawing = () => setDrawings([]);

  // экспорт: печатное разрешение
  const handleDownload = async () => {
    const stage = stageRef.current as any;
    if (!stage) return;

    // pixelRatio = 1/s, чтобы итоговый canvas был ровно CANVAS_WIDTH×CANVAS_HEIGHT
    const pixelRatio = 1 / stageSize.s;
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

  return (
    <div className="w-screen h-screen bg-white overflow-hidden flex flex-col lg:flex-row">
      {/* Панель инструментов */}
      <div className={`lg:w-1/2 p-4 ${isMobile ? "absolute z-50 top-0 w-full bg-white" : ""}`}>
        {isMobile && (
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => router.back()} className="text-sm border px-3 py-1">
              Back
            </button>
            <button className="text-sm border px-3 py-1" onClick={() => setMenuOpen((v) => !v)}>
              {menuOpen ? "Hide" : "Create"}
            </button>
          </div>
        )}

        <div className={`${isMobile && !menuOpen ? "hidden" : "block"}`}>
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
            <button className={`border px-3 py-1 ${mockupType === "front" ? "bg-black text-white" : ""}`} onClick={() => setMockupType("front")}>
              Front
            </button>
            <button className={`border px-3 py-1 ${mockupType === "back" ? "bg-black text-white" : ""}`} onClick={() => setMockupType("back")}>
              Back
            </button>
            <button className="border px-3 py-1" onClick={clearDrawing}>
              Clear strokes
            </button>
            <button className="bg-black text-white px-3 py-1" onClick={handleDownload}>
              Download PNG
            </button>
          </div>

          <input type="file" accept="image/*" onChange={handleFileChange} className="mb-3" />

          <label className="block text-xs mb-1">Opacity: {Math.round(opacity * 100)}%</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full mb-2 h-[2px] bg-black appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2
              [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
          />

          <label className="block text-xs mb-1">Brush Size: {brushSize}px</label>
          <input
            type="range"
            min="1"
            max="40"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full mb-2 h-[2px] bg-black appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2
              [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
          />

          <label className="block text-xs mb-1">Brush Color</label>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-8 h-8 border p-0 cursor-pointer"
          />
        </div>
      </div>

      {/* Область рисования */}
      <div className="lg:w-1/2 h-full flex items-center justify-center">
        <div ref={wrapRef} className="w-full flex items-center justify-center" style={{ maxHeight: VIEWPORT_MAX_HEIGHT }}>
          <Stage
            ref={stageRef}
            width={stageSize.w}
            height={stageSize.h}
            scale={{ x: stageSize.s, y: stageSize.s }}
            // Логический размер остаётся CANVAS, визуальный — w×h
            offset={{ x: 0, y: 0 }}
            onMouseDown={onPointerDown}
            onMousemove={onPointerMove}
            onMouseup={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
            style={{ transform: "translateY(-24px)" }}
          >
            <Layer>
              {mockupImage && (
                <KonvaImage image={mockupImage} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} listening={false} />
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
      </div>
    </div>
  );
};

export default EditorCanvas;
