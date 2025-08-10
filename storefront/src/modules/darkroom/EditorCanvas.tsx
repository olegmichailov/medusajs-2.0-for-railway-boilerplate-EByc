"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Transformer, Rect, Group } from "react-konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"

// ——— Константы рендера — полное «печать»-разрешение и адаптивный показ
const BASE_W = 2000
const BASE_H = 2600
const PRINT_PIXEL_RATIO = 3 // итоговый PNG в высоком разрешении

type Side = "front" | "back"

type DraggableImg = {
  id: string
  image: HTMLImageElement
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  crop?: { x: number; y: number; width: number; height: number }
}

type Stroke = { color: string; size: number; points: number[] }

const EditorCanvas = () => {
  // ——— Mockups
  const [mockFront] = useImage("/mockups/MOCAP_FRONT.png", "anonymous")
  const [mockBack] = useImage("/mockups/MOCAP_BACK.png", "anonymous")

  // ——— Текущая сторона
  const [side, setSide] = useState<Side>("front")

  // ——— Слои данных для каждой стороны
  const [frontImgs, setFrontImgs] = useState<DraggableImg[]>([])
  const [backImgs, setBackImgs] = useState<DraggableImg[]>([])
  const [frontStrokes, setFrontStrokes] = useState<Stroke[]>([])
  const [backStrokes, setBackStrokes] = useState<Stroke[]>([])

  // ——— Текущие настройки/режимы
  const [mode, setMode] = useState<"move" | "brush" | "crop">("brush")
  const [brushColor, setBrushColor] = useState("#d63384")
  const [brushSize, setBrushSize] = useState(6)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  // ——— Crop state
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)

  // ——— UI: панель-инструментов (sheet) видимость
  const [toolsOpen, setToolsOpen] = useState(!isMobile)

  // ——— Refs
  const stageRef = useRef<any>(null)
  const trRef = useRef<any>(null)

  // ——— Текущие наборы по стороне
  const imgs = side === "front" ? frontImgs : backImgs
  const setImgs = side === "front" ? setFrontImgs : setBackImgs
  const strokes = side === "front" ? frontStrokes : backStrokes
  const setStrokes = side === "front" ? setFrontStrokes : setBackStrokes
  const mock = side === "front" ? mockFront : mockBack

  // ——— Рассчёт видимого размера канвы по вьюпорту (по центру, без искажений)
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    // оставим место под верхнюю навигацию и нижнюю панель браузера на мобиле
    const padTop = isMobile ? 72 : 96
    const padSide = isMobile ? 16 : 24
    const maxW = vw - padSide * 2
    const maxH = vh - padTop - 24
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: Math.round(BASE_W * s), viewH: Math.round(BASE_H * s), scale: s }
  }, [])

  // ——— Заблокировать жесты страницы, когда рисуем на мобиле
  useEffect(() => {
    if (!isMobile) return
    const prevent = (e: TouchEvent) => {
      if (!stageRef.current) return
      // если палец над конвой — отменяем скролл/пинч
      e.preventDefault()
    }
    document.addEventListener("touchmove", prevent, { passive: false })
    document.addEventListener("gesturestart", prevent, { passive: false } as any)
    document.addEventListener("gesturechange", prevent, { passive: false } as any)
    document.addEventListener("gestureend", prevent, { passive: false } as any)
    return () => {
      document.removeEventListener("touchmove", prevent as any)
      document.removeEventListener("gesturestart", prevent as any)
      document.removeEventListener("gesturechange", prevent as any)
      document.removeEventListener("gestureend", prevent as any)
    }
  }, [])

  // ——— Трансформер к выделенному
  useEffect(() => {
    if (!trRef.current) return
    const layer = stageRef.current?.getLayers?.()[0]
    if (!layer) return
    if (!selectedId) {
      trRef.current.nodes([])
      layer.draw()
      return
    }
    const node = layer.findOne(`#node-${selectedId}`)
    if (node) {
      trRef.current.nodes([node])
      layer.draw()
    }
  }, [selectedId, imgs, side])

  // ——— Помощники
  const clientToCanvas = useCallback(
    (p: { x: number; y: number }) => ({
      x: p.x / scale,
      y: p.y / scale,
    }),
    [scale]
  )

  const addImageFromFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          // начальные размеры с подгонкой под макет
          const maxW = BASE_W * 0.6
          const k = Math.min(maxW / img.width, (BASE_H * 0.6) / img.height, 1)
          const newImg: DraggableImg = {
            id: `${Date.now()}`,
            image: img,
            x: (BASE_W - img.width * k) / 2,
            y: (BASE_H - img.height * k) / 2,
            width: img.width * k,
            height: img.height * k,
            rotation: 0,
            opacity: 1,
          }
          setImgs((prev) => [...prev, newImg])
          setSelectedId(newImg.id)
          setMode("move")
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    },
    [setImgs]
  )

  const onPointerDown = (e: any) => {
    // клик по «пустоте» — снять выделение
    if (e.target === e.target.getStage()) {
      setSelectedId(null)
      if (mode === "crop") setCropRect(null)
      return
    }

    if (mode === "brush") {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setIsDrawing(true)
      setStrokes((prev) => [...prev, { color: brushColor, size: brushSize, points: [x, y] }])
      return
    }

    if (mode === "crop") {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setIsCropping(true)
      setCropRect({ x, y, w: 0, h: 0 })
      return
    }
  }

  const onPointerMove = () => {
    if (mode === "brush" && isDrawing) {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setStrokes((prev) => {
        const last = prev[prev.length - 1]
        last.points = last.points.concat([x, y])
        return [...prev.slice(0, -1), last]
      })
    }

    if (mode === "crop" && isCropping && cropRect) {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setCropRect({ ...cropRect, w: x - cropRect.x, h: y - cropRect.y })
    }
  }

  const onPointerUp = () => {
    setIsDrawing(false)
    if (mode === "crop") setIsCropping(false)
  }

  // ——— Применить/отменить crop
  const applyCrop = () => {
    if (!selectedId || !cropRect) return
    setImgs((prev) =>
      prev.map((it) =>
        it.id === selectedId
          ? {
              ...it,
              crop: {
                x: Math.max(0, Math.min(it.width, cropRect.x - it.x)),
                y: Math.max(0, Math.min(it.height, cropRect.y - it.y)),
                width: Math.max(1, Math.min(it.width, Math.abs(cropRect.w))),
                height: Math.max(1, Math.min(it.height, Math.abs(cropRect.h))),
              },
            }
          : it
      )
    )
    setCropRect(null)
  }
  const cancelCrop = () => setCropRect(null)

  // ——— Горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      // удалить
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault()
        setImgs((prev) => prev.filter((i) => i.id !== selectedId))
        setSelectedId(null)
      }
      // копировать/вставить
      if (meta && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x") && selectedId) {
        e.preventDefault()
        const src = imgs.find((i) => i.id === selectedId)
        if (!src) return
        ;(window as any).__clip = src
      }
      if (meta && e.key.toLowerCase() === "v" && (window as any).__clip) {
        e.preventDefault()
        const src: DraggableImg = (window as any).__clip
        const copy: DraggableImg = {
          ...src,
          id: `${Date.now()}`,
          x: src.x + 20,
          y: src.y + 20,
        }
        setImgs((p) => [...p, copy])
        setSelectedId(copy.id)
      }
      // дублировать
      if (meta && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault()
        const src = imgs.find((i) => i.id === selectedId)
        if (!src) return
        const copy: DraggableImg = { ...src, id: `${Date.now()}`, x: src.x + 20, y: src.y + 20 }
        setImgs((p) => [...p, copy])
        setSelectedId(copy.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [imgs, selectedId, setImgs])

  // ——— Экспорт
  const exportPNG = (targetSide: Side) => {
    const needSide = targetSide
    const s = side
    setSide(needSide)
    // небольшой тик, чтобы слой перерисовался
    requestAnimationFrame(() => {
      const uri = stageRef.current.toDataURL({ pixelRatio: PRINT_PIXEL_RATIO })
      const a = document.createElement("a")
      a.href = uri
      a.download = `darkroom-${needSide}.png`
      a.click()
      setSide(s)
    })
  }

  // ——— Рендер
  return (
    <div className="w-full min-h-[calc(100vh-64px)] flex flex-col items-center">
      {/* Контейнер под мокап — ровно по центру вьюпорта */}
      <div
        className="relative"
        style={{
          width: viewW,
          height: viewH,
          marginTop: isMobile ? 12 : 24,
        }}
      >
        <Stage
          ref={stageRef}
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        >
          <Layer>
            {/* Подложка-мокап текущей стороны */}
            {mock && <KImage image={mock} width={BASE_W} height={BASE_H} />}
            {/* Картинки */}
            {imgs.map((it) => (
              <KImage
                key={it.id}
                id={`node-${it.id}`}
                image={it.image}
                x={it.x}
                y={it.y}
                width={it.width}
                height={it.height}
                rotation={it.rotation}
                opacity={it.opacity}
                crop={it.crop}
                draggable={mode === "move"}
                onClick={() => setSelectedId(it.id)}
                onTap={() => setSelectedId(it.id)}
                onDragEnd={(e) => {
                  const { x, y } = e.target.position()
                  setImgs((p) => p.map((img) => (img.id === it.id ? { ...img, x, y } : img)))
                }}
                onTransformEnd={(e: any) => {
                  const node = e.target
                  const scaleX = node.scaleX()
                  const scaleY = node.scaleY()
                  node.scaleX(1)
                  node.scaleY(1)
                  const next = {
                    x: node.x(),
                    y: node.y(),
                    rotation: node.rotation(),
                    width: Math.max(5, node.width() * scaleX),
                    height: Math.max(5, node.height() * scaleY),
                  }
                  setImgs((p) => p.map((img) => (img.id === it.id ? { ...img, ...next } : img)))
                }}
              />
            ))}

            {/* Рисунки */}
            {strokes.map((s, i) => (
              <Line
                key={i}
                points={s.points}
                stroke={s.color}
                strokeWidth={s.size}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
              />
            ))}

            {/* Crop рамка */}
            {mode === "crop" && cropRect && (
              <Group>
                <Rect
                  x={Math.min(cropRect.x, cropRect.x + cropRect.w)}
                  y={Math.min(cropRect.y, cropRect.y + cropRect.h)}
                  width={Math.abs(cropRect.w)}
                  height={Math.abs(cropRect.h)}
                  stroke="#111"
                  dash={[6, 4]}
                />
              </Group>
            )}

            {/* Трансформер */}
            {selectedId && mode !== "brush" && <Transformer ref={trRef} rotateEnabled={true} />}
          </Layer>
        </Stage>
      </div>

      {/* Панель инструментов: мобайл — снизу sheet по кнопке Create, десктоп — выезжающая сбоку */}
      <Toolbar
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        side={side}
        onSideChange={setSide}
        mode={mode}
        onModeChange={(m) => {
          setMode(m)
          if (m !== "crop") setCropRect(null)
        }}
        brushColor={brushColor}
        onBrushColor={setBrushColor}
        brushSize={brushSize}
        onBrushSize={setBrushSize}
        onAddImage={(file) => addImageFromFile(file)}
        onClearStrokes={() => setStrokes([])}
        onDeleteSelected={() => {
          if (!selectedId) return
          setImgs((p) => p.filter((i) => i.id !== selectedId))
          setSelectedId(null)
        }}
        onDuplicateSelected={() => {
          if (!selectedId) return
          const src = imgs.find((i) => i.id === selectedId)
          if (!src) return
          const copy: DraggableImg = { ...src, id: `${Date.now()}`, x: src.x + 20, y: src.y + 20 }
          setImgs((p) => [...p, copy])
          setSelectedId(copy.id)
        }}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        hasCrop={!!cropRect && !!selectedId}
        onDownloadFront={() => exportPNG("front")}
        onDownloadBack={() => exportPNG("back")}
      />
    </div>
  )
}

export default EditorCanvas
