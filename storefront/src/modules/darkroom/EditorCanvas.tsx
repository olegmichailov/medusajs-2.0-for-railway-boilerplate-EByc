"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Group, Rect, Transformer, Text as KText } from "react-konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"

type Side = "front" | "back"
type Blend = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"

type BrushStroke = {
  id: string
  color: string
  size: number
  points: number[]
  mode: "brush" | "erase"
}

type PrimitiveKind = "rect" | "circle" | "triangle" | "cross" | "line"

type Primitive = {
  id: string
  kind: PrimitiveKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  fill: string
  stroke?: string
  strokeWidth?: number
  blend: Blend
  raster?: number // 0..1 — сила «растра»
}

type PlacedImage = {
  id: string
  image: HTMLImageElement
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  blend: Blend
  crop?: { x: number; y: number; w: number; h: number }
  raster?: number // 0..1
}

type TextBlock = {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  fontFamily: string
  fill: string
  rotation: number
  opacity: number
  blend: Blend
}

type DesignState = {
  strokes: BrushStroke[]
  images: PlacedImage[]
  primitives: Primitive[]
  texts: TextBlock[]
}

const newDesign = (): DesignState => ({
  strokes: [],
  images: [],
  primitives: [],
  texts: [],
})

const PINK = "#ff2d9a" // «emo» розовый по умолчанию

// Базовый высокорезовый холст (печатный)
const CANVAS_WIDTH = 2000
const CANVAS_HEIGHT = 2600

// Отображение: аккуратно вписываем в экран
const DISPLAY_MAX_W = 980
const DISPLAY_MAX_H = isMobile ? 720 : 820

function fit(w: number, h: number, maxW: number, maxH: number) {
  const k = Math.min(maxW / w, maxH / h)
  return { w: Math.round(w * k), h: Math.round(h * k), k }
}

// Псевдо-растр (имитация): используем Konva фильтр Pixelate + немного контраста/градаций.
// Это быстрая замена настоящему halftone-shader’у (можно внедрить позже).
import Konva from "konva"
const ensureFilters = () => {
  // Конва уже имеет Pixelate/Contrast/Grayscale
}

const EditorCanvas: React.FC = () => {
  ensureFilters()

  const [side, setSide] = useState<Side>("front")
  const [front, setFront] = useState<DesignState>(newDesign)
  const [back, setBack] = useState<DesignState>(newDesign)

  const design = side === "front" ? front : back
  const setDesign = side === "front" ? setFront : setBack

  const [mode, setMode] = useState<"move" | "brush" | "erase" | "crop" | "text" | "primitive">("brush")
  const [brushColor, setBrushColor] = useState(PINK)
  const [brushSize, setBrushSize] = useState(8)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<"image" | "primitive" | "text" | null>(null)

  const [mockFront] = useImage("/mockups/MOCAP_FRONT.png")
  const [mockBack] = useImage("/mockups/MOCAP_BACK.png")

  const stageRef = useRef<any>(null)
  const trRef = useRef<any>(null)
  const cropRectRef = useRef<any>(null)

  // размеры под экран
  const { displayW, displayH, scale } = useMemo(() => {
    const { w, h, k } = fit(CANVAS_WIDTH, CANVAS_HEIGHT, DISPLAY_MAX_W, DISPLAY_MAX_H)
    return { displayW: w, displayH: h, scale: k }
  }, [])

  // ------- Добавление изображений
  const handleAddImage = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = CANVAS_WIDTH * 0.6
        const k = Math.min(maxW / img.width, 1)
        const w = Math.round(img.width * k)
        const h = Math.round(img.height * k)
        const item: PlacedImage = {
          id: "img_" + Date.now(),
          image: img,
          x: (CANVAS_WIDTH - w) / 2,
          y: (CANVAS_HEIGHT - h) / 2,
          w,
          h,
          rotation: 0,
          opacity: 1,
          blend: "normal",
        }
        setDesign((d) => ({ ...d, images: [...d.images, item] }))
        setActiveId(item.id)
        setActiveType("image")
        setMode("move")
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }, [setDesign])

  // ------- Примитивы
  const addPrimitive = (kind: PrimitiveKind) => {
    const w = 600
    const h = kind === "line" ? 4 : 400
    const p: Primitive = {
      id: "pr_" + Date.now(),
      kind,
      x: (CANVAS_WIDTH - w) / 2,
      y: (CANVAS_HEIGHT - h) / 2,
      w,
      h,
      rotation: 0,
      opacity: 1,
      fill: "#000",
      stroke: undefined,
      strokeWidth: 0,
      blend: "normal",
      raster: 0,
    }
    setDesign((d) => ({ ...d, primitives: [...d.primitives, p] }))
    setActiveId(p.id)
    setActiveType("primitive")
    setMode("move")
  }

  // ------- Текст
  const addText = (initial = "Text") => {
    const t: TextBlock = {
      id: "tx_" + Date.now(),
      text: initial,
      x: CANVAS_WIDTH / 2 - 200,
      y: CANVAS_HEIGHT / 2 - 40,
      fontSize: 72,
      fontFamily: "Arial, Helvetica, sans-serif",
      fill: "#000",
      rotation: 0,
      opacity: 1,
      blend: "normal",
    }
    setDesign((d) => ({ ...d, texts: [...d.texts, t] }))
    setActiveId(t.id)
    setActiveType("text")
    setMode("move")
  }

  // ------- Рисование кистью/ластиком
  const [isDrawing, setIsDrawing] = useState(false)
  const startDraw = () => {
    if (!(mode === "brush" || mode === "erase")) return
    const pos = stageRef.current.getPointerPosition()
    if (!pos) return
    const sx = pos.x / scale
    const sy = pos.y / scale
    const stroke: BrushStroke = {
      id: "st_" + Date.now(),
      color: brushColor,
      size: brushSize,
      points: [sx, sy],
      mode: mode === "erase" ? "erase" : "brush",
    }
    setDesign((d) => ({ ...d, strokes: [...d.strokes, stroke] }))
    setIsDrawing(true)
  }
  const moveDraw = () => {
    if (!isDrawing) return
    const pos = stageRef.current.getPointerPosition()
    if (!pos) return
    const sx = pos.x / scale
    const sy = pos.y / scale
    setDesign((d) => {
      const last = d.strokes[d.strokes.length - 1]
      if (!last) return d
      last.points = [...last.points, sx, sy]
      return { ...d, strokes: [...d.strokes.slice(0, -1), last] }
    })
  }
  const endDraw = () => setIsDrawing(false)

  // ------- Выбор + трансформер
  useEffect(() => {
    if (!trRef.current || !activeId) return
    const stage = stageRef.current as any
    const node = stage.findOne("#" + activeId)
    if (node) {
      trRef.current.nodes([node])
      trRef.current.getLayer().batchDraw()
    }
  }, [activeId, design])

  // ------- Клавиатурные шорткаты
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeId) return

      const removeActive = () => {
        setDesign((d) => ({
          ...d,
          images: d.images.filter((x) => x.id !== activeId),
          primitives: d.primitives.filter((x) => x.id !== activeId),
          texts: d.texts.filter((x) => x.id !== activeId),
        }))
        setActiveId(null)
        setActiveType(null)
      }

      const dupActive = () => {
        setDesign((d) => {
          const im = d.images.find((x) => x.id === activeId)
          if (im) {
            const du: PlacedImage = { ...im, id: "img_" + Date.now(), x: im.x + 30, y: im.y + 30 }
            return { ...d, images: [...d.images, du] }
          }
          const pr = d.primitives.find((x) => x.id === activeId)
          if (pr) {
            const du: Primitive = { ...pr, id: "pr_" + Date.now(), x: pr.x + 30, y: pr.y + 30 }
            return { ...d, primitives: [...d.primitives, du] }
          }
          const tx = d.texts.find((x) => x.id === activeId)
          if (tx) {
            const du: TextBlock = { ...tx, id: "tx_" + Date.now(), x: tx.x + 30, y: tx.y + 30 }
            return { ...d, texts: [...d.texts, du] }
          }
          return d
        })
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        removeActive()
      }
      // Cmd/Ctrl + D → duplicate
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault()
        dupActive()
      }
      // [ / ] — порядок слоёв
      if (e.key === "[" || e.key === "]") {
        e.preventDefault()
        setDesign((d) => {
          const allIds = [
            ...d.images.map((x) => x.id),
            ...d.primitives.map((x) => x.id),
            ...d.texts.map((x) => x.id),
          ]
          if (!allIds.includes(activeId)) return d
          // переносим только внутри своей коллекции
          const bump = <T extends { id: string }>(arr: T[], dir: "down" | "up"): T[] => {
            const i = arr.findIndex((x) => x.id === activeId)
            if (i < 0) return arr
            if (dir === "up" && i < arr.length - 1) {
              const a = arr.slice()
              ;[a[i], a[i + 1]] = [a[i + 1], a[i]]
              return a
            }
            if (dir === "down" && i > 0) {
              const a = arr.slice()
              ;[a[i], a[i - 1]] = [a[i - 1], a[i]]
              return a
            }
            return arr
          }
          if (d.images.some((x) => x.id === activeId))
            return { ...d, images: bump(d.images, e.key === "]" ? "up" : "down") }
          if (d.primitives.some((x) => x.id === activeId))
            return { ...d, primitives: bump(d.primitives, e.key === "]" ? "up" : "down") }
          if (d.texts.some((x) => x.id === activeId))
            return { ...d, texts: bump(d.texts, e.key === "]" ? "up" : "down") }
          return d
        })
      }
      // Shift +/- — смена blend
      if (e.shiftKey && (e.key === "+" || e.key === "_")) {
        e.preventDefault()
        const order: Blend[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten"]
        setDesign((d) => {
          const step = e.key === "+" ? 1 : -1
          const mutateBlend = <T extends { id: string; blend: Blend }>(arr: T[]) =>
            arr.map((x) =>
              x.id !== activeId
                ? x
                : { ...x, blend: order[(order.indexOf(x.blend) + step + order.length) % order.length] }
            )
          if (d.images.some((x) => x.id === activeId)) return { ...d, images: mutateBlend(d.images) }
          if (d.primitives.some((x) => x.id === activeId)) return { ...d, primitives: mutateBlend(d.primitives) }
          if (d.texts.some((x) => x.id === activeId)) return { ...d, texts: mutateBlend(d.texts) }
          return d
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeId, setDesign])

  // ------- Кроп
  const [cropping, setCropping] = useState(false)
  const startCrop = () => {
    if (activeType !== "image" || !activeId) return
    setCropping(true)
  }
  const applyCrop = () => {
    if (!cropping || activeType !== "image" || !activeId) return
    const rect = cropRectRef.current as any
    if (!rect) return
    const { x, y, width, height } = rect.getClientRect()
    // в координатах сцены → в координаты печатного холста
    const cx = x / scale
    const cy = y / scale
    const cw = width / scale
    const ch = height / scale
    setDesign((d) => {
      const images = d.images.map((im) => {
        if (im.id !== activeId) return im
        // переносим обрезку в локальные координаты картинки
        const cropX = Math.max(0, cx - im.x)
        const cropY = Math.max(0, cy - im.y)
        const cropW = Math.max(1, Math.min(cw, im.w - cropX))
        const cropH = Math.max(1, Math.min(ch, im.h - cropY))
        const out: PlacedImage = {
          ...im,
          crop: { x: cropX, y: cropY, w: cropW, h: cropH },
          // и сдвинем картинку так, чтобы обрезанный прямоугольник остался на месте
          x: im.x + cropX,
          y: im.y + cropY,
          w: cropW,
          h: cropH,
        }
        return out
      })
      return { ...d, images }
    })
    setCropping(false)
    setActiveId(null)
    setActiveType(null)
  }
  const cancelCrop = () => setCropping(false)

  // ------- Экспорт
  const downloadSide = (which: Side) => {
    const stage = stageRef.current as any
    if (!stage) return
    // рендерим текущую сторону: временно подменим state
    const prev = side
    setSide(which)
    requestAnimationFrame(() => {
      const uri = stage.toDataURL({ pixelRatio: 2 }) // ~ 4000 x 5200
      const a = document.createElement("a")
      a.href = uri
      a.download = `darkroom-${which}.png`
      a.click()
      setSide(prev)
    })
  }

  // ------- Рендер
  const bg = side === "front" ? mockFront : mockBack

  return (
    <div className="w-screen h-[calc(100vh-64px)] overflow-hidden relative">
      {/* канвас по центру относительно логотипа */}
      <div className="w-full h-full flex items-center justify-center">
        <Stage
          ref={stageRef}
          width={displayW}
          height={displayH}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={startDraw}
          onMousemove={moveDraw}
          onMouseup={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
          draggable={false}
        >
          <Layer>
            {bg && <KImage image={bg} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} perfectDrawEnabled={false} />}
          </Layer>

          {/* основной слой дизайна */}
          <Layer>
            {/* изображения */}
            {design.images.map((im) => {
              const filters: any[] = []
              if ((im.raster || 0) > 0) filters.push(Konva.Filters.Pixelate)
              return (
                <KImage
                  key={im.id}
                  id={im.id}
                  image={im.image}
                  x={im.x}
                  y={im.y}
                  width={im.w}
                  height={im.h}
                  opacity={im.opacity}
                  rotation={im.rotation}
                  draggable={mode === "move" && !cropping}
                  onClick={() => {
                    setActiveId(im.id)
                    setActiveType("image")
                  }}
                  onTap={() => {
                    setActiveId(im.id)
                    setActiveType("image")
                  }}
                  globalCompositeOperation={im.blend}
                  crop={
                    im.crop
                      ? { x: im.crop.x, y: im.crop.y, width: im.crop.w, height: im.crop.h }
                      : undefined
                  }
                  filters={filters}
                  pixelSize={Math.max(1, Math.round((im.raster || 0) * 12))}
                />
              )
            })}

            {/* примитивы */}
            {design.primitives.map((p) => {
              const common = {
                key: p.id,
                id: p.id,
                x: p.x,
                y: p.y,
                opacity: p.opacity,
                rotation: p.rotation,
                draggable: mode === "move",
                onClick: () => {
                  setActiveId(p.id)
                  setActiveType("primitive")
                },
                onTap: () => {
                  setActiveId(p.id)
                  setActiveType("primitive")
                },
                globalCompositeOperation: p.blend as any,
              } as any

              if (p.kind === "rect" || p.kind === "cross") {
                return (
                  <Group {...common}>
                    <Rect width={p.w} height={p.h} fill={p.kind === "rect" ? p.fill : undefined} />
                    {p.kind === "cross" && (
                      <>
                        <Rect x={p.w / 2 - p.w * 0.05} width={p.w * 0.1} height={p.h} fill={p.fill} />
                        <Rect y={p.h / 2 - p.h * 0.05} width={p.w} height={p.h * 0.1} fill={p.fill} />
                      </>
                    )}
                  </Group>
                )
              }
              if (p.kind === "circle") {
                return (
                  <Group {...common}>
                    <Rect width={p.w} height={p.h} cornerRadius={Math.min(p.w, p.h) / 2} fill={p.fill} />
                  </Group>
                )
              }
              if (p.kind === "triangle") {
                // делаем как прямоугольник + clip
                return (
                  <Group
                    {...common}
                    clipFunc={(ctx) => {
                      ctx.beginPath()
                      ctx.moveTo(0, p.h)
                      ctx.lineTo(p.w / 2, 0)
                      ctx.lineTo(p.w, p.h)
                      ctx.closePath()
                    }}
                  >
                    <Rect width={p.w} height={p.h} fill={p.fill} />
                  </Group>
                )
              }
              // линия
              return (
                <Group {...common}>
                  <Rect y={(p.h - (p.strokeWidth || 8)) / 2} width={p.w} height={p.strokeWidth || 8} fill={p.fill} />
                </Group>
              )
            })}

            {/* текст */}
            {design.texts.map((t) => (
              <KText
                key={t.id}
                id={t.id}
                x={t.x}
                y={t.y}
                text={t.text}
                fontSize={t.fontSize}
                fontFamily={t.fontFamily}
                fill={t.fill}
                opacity={t.opacity}
                rotation={t.rotation}
                draggable={mode === "move"}
                onClick={() => {
                  setActiveId(t.id)
                  setActiveType("text")
                }}
                globalCompositeOperation={t.blend as any}
              />
            ))}

            {/* кисти/ластик */}
            {design.strokes.map((s) => (
              <Line
                key={s.id}
                points={s.points}
                stroke={s.mode === "erase" ? "#000" : s.color}
                strokeWidth={s.size}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={s.mode === "erase" ? "destination-out" : "source-over"}
              />
            ))}

            {/* трансформер к текущему объекту */}
            {!!activeId && !cropping && <Transformer ref={trRef} rotateEnabled={true} anchorCornerRadius={0} />}
            {/* прямоугольник кропа */}
            {cropping && (
              <Rect
                ref={cropRectRef}
                x={displayW * 0.2}
                y={displayH * 0.2}
                width={displayW * 0.6}
                height={displayH * 0.6}
                draggable
                stroke="black"
                dash={[8, 8]}
                strokeWidth={1 / scale}
              />
            )}
          </Layer>
        </Stage>
      </div>

      {/* TOOLBAR */}
      <Toolbar
        side={side}
        setSide={setSide}
        mode={mode}
        setMode={setMode}
        brush={{ color: brushColor, setColor: setBrushColor, size: brushSize, setSize: setBrushSize }}
        onAddImage={handleAddImage}
        onAddText={addText}
        onAddPrimitive={addPrimitive}
        onStartCrop={startCrop}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        cropping={cropping}
        active={{ id: activeId, type: activeType }}
        setActive={(_, __) => {}} // выбор делаем кликом на сцене
        onDownloadFront={() => downloadSide("front")}
        onDownloadBack={() => downloadSide("back")}
        design={design}
        setDesign={setDesign}
        accent={PINK}
      />
    </div>
  )
}

export default EditorCanvas
