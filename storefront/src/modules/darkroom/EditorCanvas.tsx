"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { useDarkroom, Blend, Side, ShapeKind } from "./store"
import { isMobile } from "react-device-detect"

// ---- БАЗОВОЕ ПЕЧАТНОЕ ПОЛОТНО
const BASE_W = 2000
const BASE_H = 2600
const PADDING = 24

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type AnyLayer = {
  id: string
  side: Side
  node: Konva.Node
  meta: {
    blend: Blend
    opacity: number
    raster: number
  }
}

export default function EditorCanvas() {
  const {
    showPanel, togglePanel,
    side, setSide,
    selectedId, select,
    tool, setTool,
    brushSize, brushColor,
    shapeKind,
    isCropping, setCropping,
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock] = useImage(BACK_SRC, "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const workLayerRef = useRef<Konva.Layer>(null)
  const tRef = useRef<Konva.Transformer>(null)
  const cropRectRef = useRef<Konva.Rect>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // ---- Масштаб под экран
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const maxW = vw - PADDING * 2 - (isMobile ? 0 : 340) // справа место под панель
    const maxH = vh - PADDING * 2
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showPanel])

  // ---- Утилиты
  const baseMeta = (): AnyLayer["meta"] => ({ blend: "source-over", opacity: 1, raster: 0 })

  const findNode = (id: string | null) => (id ? layers.find((l) => l.id === id)?.node || null : null)

  const attachTransformer = () => {
    const node = findNode(selectedId)
    if (node && tRef.current) {
      tRef.current.nodes([node])
      tRef.current.getLayer()?.batchDraw()
    } else {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
    }
  }

  const applyMetaToNode = (node: Konva.Node, meta: AnyLayer["meta"]) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    // простой «растр» через Pixelate: быстро и стабильно
    if ((node as any).filters) {
      if (meta.raster > 0) {
        (Konva as any).Filters?.Pixelate && (node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        ;(node as any).filters([])
      }
    }
    node.getLayer()?.batchDraw()
  }

  const addToLayer = (node: Konva.Node, meta = baseMeta()) => {
    const id = uid()
    ;(node as any).id(id)
    node.draggable(true)
    node.on("click tap", () => select(id))
    applyMetaToNode(node, meta)
    workLayerRef.current?.add(node)
    workLayerRef.current?.batchDraw()
    const lay: AnyLayer = { id, side, node, meta }
    setLayers((p) => [...p, lay])
    select(id)
    attachTransformer()
  }

  const removeSelected = () => {
    if (!selectedId) return
    const node = findNode(selectedId)
    node?.destroy()
    workLayerRef.current?.batchDraw()
    setLayers((p) => p.filter((l) => l.id !== selectedId))
    select(null)
  }

  // ---- ВИДИМОСТЬ ПЕРЕД/ЗАД
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side))
    workLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers]) // eslint-disable-line

  // ---- Хоткеи
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      if (!node) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        const clone = node.clone()
        clone.x(node.x() + 20)
        clone.y(node.y() + 20)
        addToLayer(clone, layers.find((l) => l.id === selectedId)?.meta)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeSelected()
      } else if (e.key === "[") {
        node.moveDown(); node.getLayer()?.batchDraw()
      } else if (e.key === "]") {
        node.moveUp(); node.getLayer()?.batchDraw()
      } else if (e.shiftKey && (e.key === "+" || e.key === "=")) {
        cycleBlend(1)
      } else if (e.shiftKey && e.key === "-") {
        cycleBlend(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, layers]) // eslint-disable-line

  const blends: Blend[] = ["source-over", "multiply", "screen", "overlay", "darken", "lighten"]
  const getMeta = (id: string | null) => (id ? layers.find((l) => l.id === id)?.meta : undefined)
  const setBlend = (blend: Blend) => {
    if (!selectedId) return
    setLayers((p) =>
      p.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, blend }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }
  const cycleBlend = (dir: 1 | -1) => {
    const cur = getMeta(selectedId)?.blend || "source-over"
    const idx = blends.indexOf(cur)
    setBlend(blends[(idx + dir + blends.length) % blends.length])
  }
  const setOpacity = (val: number) => {
    if (!selectedId) return
    setLayers((p) =>
      p.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, opacity: val }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }
  const setRaster = (px: number) => {
    if (!selectedId) return
    setLayers((p) =>
      p.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, raster: px }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }

  // ---- Блокировка скролла при рисовании на мобиле
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      if (tool === "brush" || tool === "erase") e.preventDefault()
    }
    document.addEventListener("touchmove", prevent, { passive: false })
    return () => document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  // ---- Tools

  // Image
  const onUploadFile = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const k = new Konva.Image({
          image: img,
          x: BASE_W / 2 - img.width / 2,
          y: BASE_H / 2 - img.height / 2,
        })
        k.width(img.width)
        k.height(img.height)
        addToLayer(k)
        setTool("move")
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // Shapes
  const addShape = (kind: ShapeKind) => {
    let node: Konva.Node
    switch (kind) {
      case "circle":
        node = new Konva.Circle({ x: BASE_W / 2, y: BASE_H / 2, radius: 220, fill: brushColor })
        break
      case "square":
        node = new Konva.Rect({ x: BASE_W / 2 - 220, y: BASE_H / 2 - 220, width: 440, height: 440, fill: brushColor })
        break
      case "triangle":
        node = new Konva.RegularPolygon({ x: BASE_W / 2, y: BASE_H / 2, sides: 3, radius: 260, fill: brushColor })
        break
      case "cross": {
        const g = new Konva.Group({ x: BASE_W / 2 - 200, y: BASE_H / 2 - 200 })
        g.add(new Konva.Rect({ width: 400, height: 80, fill: brushColor, y: 160 }))
        g.add(new Konva.Rect({ width: 80, height: 400, fill: brushColor, x: 160 }))
        node = g
        break
      }
      case "line":
      default:
        node = new Konva.Line({
          points: [BASE_W / 2 - 260, BASE_H / 2, BASE_W / 2 + 260, BASE_H / 2],
          stroke: brushColor,
          strokeWidth: 20,
          lineCap: "square",
        })
        break
    }
    addToLayer(node)
    setTool("move")
  }

  // Text
  const addText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W / 2 - 200,
      y: BASE_H / 2 - 40,
      fontSize: 72,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor,
    })
    addToLayer(t)
    setTool("move")
  }

  // Brush / Erase
  const startStroke = (pos: Konva.Vector2d) => {
    const line = new Konva.Line({
      points: [pos.x, pos.y],
      stroke: tool === "erase" ? "rgba(255,255,255,1)" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    addToLayer(line, { ...baseMeta(), blend: "source-over" })
    setIsDrawing(true)
  }
  const appendStroke = (pos: Konva.Vector2d) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    const pts = node.points().concat([pos.x, pos.y])
    node.points(pts)
    node.getLayer()?.batchDraw()
  }

  // Crop (к подсвеченной ноде)
  const beginCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    setCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRectRef.current?.position({ x: b.x, y: b.y })
    cropRectRef.current?.size({ width: b.width, height: b.height })
    cropRectRef.current?.visible(true)
    cropRectRef.current?.getLayer()?.batchDraw()
  }
  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRectRef.current
    if (!node || !rect) { setCropping(false); return }
    const s = scale
    const rx = rect.x() / s - node.x()
    const ry = rect.y() / s - node.y()
    const rw = rect.width() / s
    const rh = rect.height() / s

    if (node instanceof Konva.Image) {
      node.crop({ x: rx, y: ry, width: rw, height: rh })
      node.width(rw); node.height(rh)
    } else {
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      node.x(0); node.y(0)
      node.moveTo(g)
      workLayerRef.current?.add(g)
      g.add(node)
      g.cache()
    }
    rect.visible(false)
    setCropping(false)
    rect.getLayer()?.batchDraw()
  }
  const cancelCrop = () => {
    cropRectRef.current?.visible(false)
    setCropping(false)
    cropRectRef.current?.getLayer()?.batchDraw()
  }

  // Export PNG в базовом размере
  const exportSide = (s: Side) => {
    const stage = stageRef.current
    if (!stage) return
    const hidden: Konva.Node[] = []
    layers.forEach((l) => {
      if (l.side !== s && l.node.visible()) {
        hidden.push(l.node)
        l.node.visible(false)
      }
    })
    workLayerRef.current?.batchDraw()
    const data = stage.toDataURL({ pixelRatio: 1 / scale, mimeType: "image/png" })
    hidden.forEach((n) => n.visible(true))
    workLayerRef.current?.batchDraw()
    const a = document.createElement("a")
    a.href = data
    a.download = `darkroom-${s}.png`
    a.click()
  }

  // Stage pointers
  const pointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const down = () => {
    if (isCropping) return
    const p = pointer()
    if (!p) return
    const local = { x: p.x / scale, y: p.y / scale }

    if (tool === "brush" || tool === "erase") startStroke(local)
    else if (tool === "text") addText()
    else if (tool === "shape") addShape(shapeKind)
  }
  const move = () => {
    if (!isDrawing) return
    const p = pointer(); if (!p) return
    appendStroke({ x: p.x / scale, y: p.y / scale })
  }
  const up = () => setIsDrawing(false)

  // ---- Панель (компактно)
  const Panel = (
    <div
      className={`fixed ${isMobile ? "left-0 right-0 bottom-0" : "right-6 top-1/2 -translate-y-1/2 w-[320px]"}
                  bg-white/70 backdrop-blur-md border border-black/10 shadow-xl p-4 z-50`}
    >
      {/* инструменты */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          ["move","Move"],
          ["brush","Brush"],
          ["erase","Erase"],
          ["text","Text"],
          ["shape","Shapes"],
          ["image","Image"],
          ["crop","Crop"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTool(id as any)}
            className={`px-3 py-2 border text-xs uppercase tracking-wide ${tool===id ? "bg-black text-white" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* параметры инструмента */}
      {(tool==="brush" || tool==="erase") && (
        <div className="space-y-3">
          <div className="text-xs">Brush size: {brushSize}px</div>
          <input type="range" min={1} max={60} value={brushSize}
                 onChange={(e)=>useDarkroom.getState().setBrushSize(Number(e.target.value))}
                 className="w-full accent-black"/>
          <div className="text-xs">Brush color</div>
          <input type="color" value={brushColor}
                 onChange={(e)=>useDarkroom.getState().setBrushColor(e.target.value)}
                 className="w-8 h-8 border"/>
        </div>
      )}

      {tool==="shape" && (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {(["circle","square","triangle","cross","line"] as ShapeKind[]).map((k)=>(
              <button
                key={k}
                onClick={()=>addShape(k)}
                className="border px-2 py-2 text-xs uppercase hover:bg-black hover:text-white"
              >
                {k}
              </button>
            ))}
          </div>
          <div className="text-xs mt-2">Color</div>
          <input type="color" value={brushColor}
                 onChange={(e)=>useDarkroom.getState().setBrushColor(e.target.value)}
                 className="w-8 h-8 border"/>
        </div>
      )}

      {tool==="image" && (
        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept="image/*"
                 onChange={(e)=>{ const f = e.target.files?.[0]; if (f) onUploadFile(f) }} />
        </div>
      )}

      {tool==="crop" && (
        <div className="space-y-2 text-xs">
          <div>Выбери слой → Start → потяни рамку → Apply.</div>
          <div className="flex gap-2">
            <button className="border px-3 py-2" onClick={beginCrop}>Start</button>
            <button className="border px-3 py-2" onClick={applyCrop} disabled={!isCropping}>Apply</button>
            <button className="border px-3 py-2" onClick={cancelCrop} disabled={!isCropping}>Cancel</button>
          </div>
        </div>
      )}

      {/* выбранный слой */}
      <div className="mt-4 space-y-2">
        <div className="text-xs">Selected opacity</div>
        <input type="range" min={0.1} max={1} step={0.01}
          value={getMeta(selectedId)?.opacity ?? 1}
          onChange={(e)=>setOpacity(Number(e.target.value))}
          className="w-full accent-black"/>
        <div className="text-xs mt-2">Blend</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["source-over","Normal"],
            ["multiply","Multiply"],
            ["screen","Screen"],
            ["overlay","Overlay"],
            ["darken","Darken"],
            ["lighten","Lighten"],
          ].map(([b,label])=>(
            <button key={b} onClick={()=>setBlend(b as Blend)} className="border px-2 py-2 text-xs">{label}</button>
          ))}
        </div>
        <div className="text-xs mt-2">Raster (halftone)</div>
        <input type="range" min={0} max={16} step={1}
          value={getMeta(selectedId)?.raster ?? 0}
          onChange={(e)=>setRaster(Number(e.target.value))}
          className="w-full accent-black"/>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button className="border px-2 py-2" onClick={()=>{
            const n = findNode(selectedId); if (!n) return
            const clone = n.clone()
            clone.x(n.x()+20); clone.y(n.y()+20)
            addToLayer(clone, getMeta(selectedId))
          }}>Duplicate</button>
          <button className="border px-2 py-2" onClick={removeSelected}>Delete</button>
          <button className="border px-2 py-2" onClick={()=>{
            setLayers((prev) => {
              prev.forEach((l) => {
                const isStroke = l.node instanceof Konva.Line && (l.node as Konva.Line).lineCap() === "round"
                if (l.side === side && isStroke) l.node.destroy()
              })
              workLayerRef.current?.batchDraw()
              return prev.filter((l) => !(l.side === side && l.node instanceof Konva.Line && (l.node as Konva.Line).lineCap() === "round"))
            })
          }}>Clear strokes</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="border px-2 py-2" onClick={()=>exportSide("front")}>Download Front</button>
          <button className="border px-2 py-2" onClick={()=>exportSide("back")}>Download Back</button>
        </div>
      </div>

      {isMobile && (
        <button onClick={togglePanel} className="mt-4 w-full border px-3 py-2 bg-black text-white">Close</button>
      )}
    </div>
  )

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      {/* Mobile: плавающая кнопка */}
      {isMobile && !showPanel && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
          <button onClick={togglePanel} className="px-6 py-3 bg-black text-white border">Create</button>
        </div>
      )}
      {/* Desktop: боковая панель всегда, мобайл — по кнопке */}
      {!isMobile && Panel}
      {isMobile && showPanel && Panel}

      {/* Сцена */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onTouchStart={down}
          onTouchMove={move}
          onTouchEnd={up}
        >
          {/* мокап — только текущей стороны */}
          <Layer listening={false}>
            {side === "front" && frontMock && (
              <KImage image={frontMock} width={BASE_W} height={BASE_H} />
            )}
            {side === "back" && backMock && (
              <KImage image={backMock} width={BASE_W} height={BASE_H} />
            )}
          </Layer>

          {/* рабочий слой */}
          <Layer ref={workLayerRef}>
            <Transformer ref={tRef} rotateEnabled />
            <Rect
              ref={cropRectRef}
              visible={false}
              stroke="black"
              dash={[6, 4]}
              strokeWidth={2}
              draggable
              dragBoundFunc={(pos) => ({
                x: Math.max(0, Math.min(pos.x, BASE_W - 20)),
                y: Math.max(0, Math.min(pos.y, BASE_H - 20)),
              })}
            />
          </Layer>
        </Stage>
      </div>

      {/* переключатель Front/Back по центру сверху */}
      <div className="absolute left-1/2 -translate-x-1/2 top-4 z-30 flex gap-2">
        <button
          className={`px-3 py-1 border ${side==="front" ? "bg-black text-white" : "bg-white"}`}
          onClick={()=>setSide("front")}
        >
          Front
        </button>
        <button
          className={`px-3 py-1 border ${side==="back" ? "bg-black text-white" : "bg-white"}`}
          onClick={()=>setSide("back")}
        >
          Back
        </button>
      </div>
    </div>
  )
}
