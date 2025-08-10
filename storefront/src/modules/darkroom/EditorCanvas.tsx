"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Transformer, Rect, Group } from "react-konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"

// Базовый размер «печать»-холста
const BASE_W = 2000
const BASE_H = 2600
const EXPORT_PIXEL_RATIO = 3

type Side = "front" | "back"
type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten"

const BLENDS: Blend[] = ["source-over", "multiply", "screen", "overlay", "darken", "lighten"]

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
  blend: Blend
  z: number
}

type Stroke = {
  color: string
  size: number
  points: number[]
  mode: "draw" | "erase" // erase = destination-out
}

export default function EditorCanvas() {
  // мокапы
  const [mockFront] = useImage("/mockups/MOCAP_FRONT.png", "anonymous")
  const [mockBack] = useImage("/mockups/MOCAP_BACK.png", "anonymous")

  const [side, setSide] = useState<Side>("front")

  // слои по сторонам
  const [frontImgs, setFrontImgs] = useState<DraggableImg[]>([])
  const [backImgs, setBackImgs] = useState<DraggableImg[]>([])
  const [frontStrokes, setFrontStrokes] = useState<Stroke[]>([])
  const [backStrokes, setBackStrokes] = useState<Stroke[]>([])

  // ui / режимы
  const [mode, setMode] = useState<"move" | "brush" | "erase" | "crop">("brush")
  const [brushColor, setBrushColor] = useState("#111111")
  const [brushSize, setBrushSize] = useState(8)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(!isMobile)

  // crop
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [isCropping, setIsCropping] = useState(false)

  const stageRef = useRef<any>(null)
  const trRef = useRef<any>(null)

  // текущие по стороне
  const imgs = side === "front" ? frontImgs : backImgs
  const setImgs = side === "front" ? setFrontImgs : setBackImgs
  const strokes = side === "front" ? frontStrokes : backStrokes
  const setStrokes = side === "front" ? setFrontStrokes : setBackStrokes
  const mock = side === "front" ? mockFront : mockBack

  // адаптивные размеры: строго по центру, без искажений
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = isMobile ? 68 : 92
    const padSide = isMobile ? 16 : 24
    const maxW = vw - padSide * 2
    const maxH = vh - padTop - 24
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: Math.round(BASE_W * s), viewH: Math.round(BASE_H * s), scale: s }
  }, [])

  // блокируем пинч/скролл над канвой на мобиле (можно рисовать)
  useEffect(() => {
    if (!isMobile) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    document.addEventListener("touchmove", prevent, { passive: false })
    document.addEventListener("gesturestart", prevent as any, { passive: false } as any)
    document.addEventListener("gesturechange", prevent as any, { passive: false } as any)
    document.addEventListener("gestureend", prevent as any, { passive: false } as any)
    return () => {
      document.removeEventListener("touchmove", prevent)
      document.removeEventListener("gesturestart", prevent as any)
      document.removeEventListener("gesturechange", prevent as any)
      document.removeEventListener("gestureend", prevent as any)
    }
  }, [])

  // трансформер
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

  // преобразование координат
  const clientToCanvas = useCallback(
    (p: { x: number; y: number }) => ({ x: p.x / scale, y: p.y / scale }),
    [scale]
  )

  // добавление изображения
  const addImageFromFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const im = new Image()
        im.crossOrigin = "anonymous"
        im.onload = () => {
          const maxW = BASE_W * 0.6
          const maxH = BASE_H * 0.6
          const k = Math.min(maxW / im.width, maxH / im.height, 1)
          const id = `${Date.now()}`
          const z = (imgs[imgs.length - 1]?.z ?? 0) + 1
          const newImg: DraggableImg = {
            id,
            image: im,
            x: (BASE_W - im.width * k) / 2,
            y: (BASE_H - im.height * k) / 2,
            width: im.width * k,
            height: im.height * k,
            rotation: 0,
            opacity: 1,
            blend: "source-over",
            z,
          }
          setImgs((p) => [...p, newImg].sort((a, b) => a.z - b.z))
          setSelectedId(id)
          setMode("move")
        }
        im.src = reader.result as string
      }
      reader.readAsDataURL(file)
    },
    [imgs, setImgs]
  )

  // поинтеры
  const onPointerDown = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedId(null)
      if (mode === "crop") setCropRect(null)
    }

    if (mode === "brush" || mode === "erase") {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setIsDrawing(true)
      setStrokes((prev) => [
        ...prev,
        { color: brushColor, size: brushSize, points: [x, y], mode: mode === "erase" ? "erase" : "draw" },
      ])
    }

    if (mode === "crop") {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const { x, y } = clientToCanvas(pos)
      setIsCropping(true)
      setCropRect({ x, y, w: 0, h: 0 })
    }
  }

  const onPointerMove = () => {
    if ((mode === "brush" || mode === "erase") && isDrawing) {
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

  // Crop apply — корректная геометрия + пересечение с выбранным изображением
  const applyCrop = () => {
    if (!selectedId || !cropRect) return
    const sel = imgs.find((i) => i.id === selectedId)
    if (!sel) return

    // нормализуем рамку
    const rx = Math.min(cropRect.x, cropRect.x + cropRect.w)
    const ry = Math.min(cropRect.y, cropRect.y + cropRect.h)
    const rw = Math.abs(cropRect.w)
    const rh = Math.abs(cropRect.h)

    // пересечение рамки с изображением в координатах канвы
    const ix1 = sel.x
    const iy1 = sel.y
    const ix2 = sel.x + sel.width
    const iy2 = sel.y + sel.height
    const cx1 = Math.max(ix1, rx)
    const cy1 = Math.max(iy1, ry)
    const cx2 = Math.min(ix2, rx + rw)
    const cy2 = Math.min(iy2, ry + rh)
    if (cx2 <= cx1 || cy2 <= cy1) {
      // нет пересечения
      setCropRect(null)
      return
    }
    // переводим в локальные координаты изображения
    const crop = { x: cx1 - sel.x, y: cy1 - sel.y, width: cx2 - cx1, height: cy2 - cy1 }

    setImgs((prev) => prev.map((it) => (it.id === selectedId ? { ...it, crop } : it)))
    setCropRect(null)
  }
  const cancelCrop = () => setCropRect(null)

  // Blend shortcuts + z-order
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // delete
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault()
        setImgs((p) => p.filter((i) => i.id !== selectedId))
        setSelectedId(null)
        return
      }
      // copy / paste / duplicate
      if (meta && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "x") && selectedId) {
        e.preventDefault()
        const src = imgs.find((i) => i.id === selectedId)
        if (!src) return
        ;(window as any).__clip = src
      }
      if (meta && e.key.toLowerCase() === "v" && (window as any).__clip) {
        e.preventDefault()
        const src: DraggableImg = (window as any).__clip
        const id = `${Date.now()}`
        const z = (imgs[imgs.length - 1]?.z ?? 0) + 1
        const copy: DraggableImg = { ...src, id, x: src.x + 20, y: src.y + 20, z }
        setImgs((p) => [...p, copy].sort((a, b) => a.z - b.z))
        setSelectedId(id)
      }
      if (meta && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault()
        const src = imgs.find((i) => i.id === selectedId)
        if (!src) return
        const id = `${Date.now()}`
        const z = (imgs[imgs.length - 1]?.z ?? 0) + 1
        const copy: DraggableImg = { ...src, id, x: src.x + 20, y: src.y + 20, z }
        setImgs((p) => [...p, copy].sort((a, b) => a.z - b.z))
        setSelectedId(id)
      }

      // z-order
      if (selectedId && (e.key === "[" || e.key === "]")) {
        e.preventDefault()
        setImgs((prev) => {
          const arr = [...prev]
          const idx = arr.findIndex((i) => i.id === selectedId)
          if (idx === -1) return prev
          if (e.key === "]" && idx < arr.length - 1) {
            const [it] = arr.splice(idx, 1)
            arr.splice(idx + 1, 0, it)
          }
          if (e.key === "[" && idx > 0) {
            const [it] = arr.splice(idx, 1)
            arr.splice(idx - 1, 0, it)
          }
          // перенумеруем z
          arr.forEach((it, i) => (it.z = i))
          return arr
        })
      }

      // blend cycle
      if (selectedId && e.shiftKey && (e.key === "+" || e.key === "_" || e.key === "=" || e.key === "-")) {
        e.preventDefault()
        setImgs((prev) =>
          prev.map((it) => {
            if (it.id !== selectedId) return it
            const idx = BLENDS.indexOf(it.blend)
            const next = e.key === "-" || e.key === "_" ? (idx - 1 + BLENDS.length) % BLENDS.length : (idx + 1) % BLENDS.length
            return { ...it, blend: BLENDS[next] }
          })
        )
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [imgs, selectedId, setImgs])

  // экспорт по стороне
  const exportPNG = (target: Side) => {
    const prev = side
    setSide(target)
    requestAnimationFrame(() => {
      const uri = stageRef.current.toDataURL({ pixelRatio: EXPORT_PIXEL_RATIO })
      const a = document.createElement("a")
      a.href = uri
      a.download = `darkroom-${target}.png`
      a.click()
      setSide(prev)
    })
  }

  return (
    <div className="w-full min-h-[calc(100vh-64px)] flex flex-col items-center">
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
            {mock && <KImage image={mock} width={BASE_W} height={BASE_H} />}
            {imgs
              .slice()
              .sort((a, b) => a.z - b.z)
              .map((it) => (
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
                  globalCompositeOperation={it.blend}
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

            {strokes.map((s, i) => (
              <Line
                key={i}
                points={s.points}
                stroke={s.mode === "erase" ? "#000" : s.color}
                strokeWidth={s.size}
                lineCap="round"
                lineJoin="round"
                tension={0.4}
                globalCompositeOperation={s.mode === "erase" ? "destination-out" : "source-over"}
              />
            ))}

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

            {selectedId && mode !== "brush" && mode !== "erase" && <Transformer ref={trRef} rotateEnabled={true} />}
          </Layer>
        </Stage>
      </div>

      <Toolbar
        open={toolsOpen}
        onOpenChange={setToolsOpen}
        side={side}
        onSideChange={setSide}
        mode={mode}
        onModeChange={setMode}
        brushColor={brushColor}
        onBrushColor={setBrushColor}
        brushSize={brushSize}
        onBrushSize={setBrushSize}
        onAddImage={addImageFromFile}
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
          const id = `${Date.now()}`
          const z = (imgs[imgs.length - 1]?.z ?? 0) + 1
          const copy: DraggableImg = { ...src, id, x: src.x + 20, y: src.y + 20, z }
          setImgs((p) => [...p, copy].sort((a, b) => a.z - b.z))
          setSelectedId(id)
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
