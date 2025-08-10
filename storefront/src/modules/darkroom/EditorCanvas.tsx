"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Group, Image as KImage, Line, Rect, Text, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { useDarkroom, Blend, Side, ShapeKind } from "./store"
import { isMobile } from "react-device-detect"

// ───── Canvas geometry (большое «печатаемое» полотно + автоскейл под экран)
const BASE_W = 2000
const BASE_H = 2600
const PADDING = 24

// мокапы
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC = "/mockups/MOCAP_BACK.png"

// utils
const uid = () => Math.random().toString(36).slice(2)

type ImgLayer = {
  id: string
  side: Side
  node: Konva.Image
  meta: {
    blend: Blend
    opacity: number
    raster: number
  }
}
type ShapeLayer = {
  id: string
  side: Side
  node: Konva.Shape | Konva.Line
  meta: {
    blend: Blend
    opacity: number
    raster: number
  }
}
type TextLayer = {
  id: string
  side: Side
  node: Konva.Text
  meta: {
    blend: Blend
    opacity: number
    raster: number
  }
}
type StrokeLayer = {
  id: string
  side: Side
  node: Konva.Line
  meta: {
    blend: Blend
    opacity: number
    raster: number
  }
}

type AnyLayer = ImgLayer | ShapeLayer | TextLayer | StrokeLayer

export default function EditorCanvas() {
  const {
    tool, side, showPanel, togglePanel,
    brushSize, brushColor, set, selectedId, select, shapeKind, isCropping
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock] = useImage(BACK_SRC, "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const tRef = useRef<Konva.Transformer>(null)
  const cropRectRef = useRef<Konva.Rect>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // ───── scale stage to screen
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const maxW = vw - PADDING * 2 - (isMobile ? 0 : 340) // место под панель на десктопе
    const maxH = vh - PADDING * 2
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showPanel])

  // ───── helpers
  const activeLayers = useMemo(
    () => layers.filter((l) => l.side === side),
    [layers, side]
  )

  const findNode = (id: string | null) =>
    id ? layers.find((l) => l.id === id)?.node || null : null

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

  useEffect(() => {
    attachTransformer()
  }, [selectedId, layers, side])

  // ───── keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      if (!node) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        // duplicate
        const clone = node.clone()
        clone.x(node.x() + 20)
        clone.y(node.y() + 20)
        const id = uid()
        ;(clone as any).id(id)
        const meta = { ...(layers.find((l) => l.id === selectedId) as AnyLayer).meta }
        const sideNow = side
        setLayers((prev) => [...prev, wrapNodeToLayer(clone, sideNow, meta)])
        select(id)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeSelected()
      } else if (e.key === "[") {
        node.moveDown()
        node.getLayer()?.batchDraw()
      } else if (e.key === "]") {
        node.moveUp()
        node.getLayer()?.batchDraw()
      } else if (e.shiftKey && (e.key === "+" || e.key === "=")) {
        cycleBlend(1)
      } else if (e.shiftKey && e.key === "-") {
        cycleBlend(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side])

  const blends: Blend[] = ["source-over","multiply","screen","overlay","darken","lighten"]
  const cycleBlend = (dir: 1|-1) => {
    const idx = blends.indexOf(getMeta(selectedId)?.blend || "source-over")
    const next = blends[(idx + dir + blends.length) % blends.length]
    setBlend(next)
  }

  // ───── layer helpers
  const baseMeta = (): AnyLayer["meta"] => ({
    blend: "source-over",
    opacity: 1,
    raster: 0,
  })

  const wrapNodeToLayer = (node: Konva.Node, s: Side, meta?: AnyLayer["meta"]): AnyLayer => {
    if (node instanceof Konva.Image) return { id: (node as any)._id || uid(), side: s, node, meta: meta || baseMeta() } as ImgLayer
    if (node instanceof Konva.Text)  return { id: (node as any)._id || uid(), side: s, node, meta: meta || baseMeta() } as TextLayer
    if (node instanceof Konva.Line && (node as Konva.Line).tension() === 0) return { id: (node as any)._id || uid(), side: s, node, meta: meta || baseMeta() } as ShapeLayer
    if (node instanceof Konva.Line) return { id: (node as any)._id || uid(), side: s, node, meta: meta || baseMeta() } as StrokeLayer
    return { id: (node as any)._id || uid(), side: s, node: node as any, meta: meta || baseMeta() } as AnyLayer
  }

  const getMeta = (id: string | null) => {
    if (!id) return undefined
    return layers.find((l) => l.id === id)?.meta
  }

  const applyMetaToNode = (node: Konva.Node, meta: AnyLayer["meta"]) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation(meta.blend)
    // Raster/halftone — используем Pixelate (быстро и стабильно)
    if ((node as any).filters) {
      if (meta.raster > 0) {
        ;(Konva as any).Filters.Pixelate && (node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        ;(node as any).filters([])
      }
    }
    node.getLayer()?.batchDraw()
  }

  const setBlend = (blend: Blend) => {
    if (!selectedId) return
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, blend }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }

  const setOpacity = (val: number) => {
    if (!selectedId) return
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, opacity: val }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }

  const setRaster = (px: number) => {
    if (!selectedId) return
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== selectedId) return l
        const meta = { ...l.meta, raster: px }
        applyMetaToNode(l.node, meta)
        return { ...l, meta }
      })
    )
  }

  const removeSelected = () => {
    if (!selectedId) return
    setLayers((prev) => prev.filter((l) => l.id !== selectedId))
    select(null)
  }

  // ───── image upload
  const onUpload = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const k = new Konva.Image({ image: img, x: 700, y: 700 })
        k.width(img.width)
        k.height(img.height)
        ;(k as any).id(uid())
        const meta = baseMeta()
        applyMetaToNode(k, meta)
        const lay = wrapNodeToLayer(k, side, meta)
        setLayers((prev) => [...prev, lay])
        select(lay.id)
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ───── shapes
  const addShape = (kind: ShapeKind) => {
    let node: Konva.Shape
    switch (kind) {
      case "circle":
        node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 220, fill: "black" })
        break
      case "square":
        node = new Konva.Rect({ x: BASE_W/2-220, y: BASE_H/2-220, width: 440, height: 440, fill: "black" })
        break
      case "triangle":
        node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 260, fill: "black" })
        break
      case "cross":
        node = new Konva.Group({ x: BASE_W/2-200, y: BASE_H/2-200 })
        const r1 = new Konva.Rect({ width: 400, height: 80, fill: "black", y: 160 })
        const r2 = new Konva.Rect({ width: 80, height: 400, fill: "black", x: 160 })
        ;(node as Konva.Group).add(r1); (node as Konva.Group).add(r2)
        break
      case "line":
      default:
        node = new Konva.Line({ points: [BASE_W/2-260, BASE_H/2, BASE_W/2+260, BASE_H/2], stroke: "black", strokeWidth: 20 })
        break
    }
    ;(node as any).id(uid())
    const meta = baseMeta()
    applyMetaToNode(node as any, meta)
    const lay = wrapNodeToLayer(node as any, side, meta)
    setLayers((prev) => [...prev, lay])
    select(lay.id)
    set({ tool: "move" })
  }

  // ───── text
  const addText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-200,
      y: BASE_H/2-40,
      fontSize: 72,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: "black",
    })
    ;(t as any).id(uid())
    const meta = baseMeta()
    applyMetaToNode(t, meta)
    const lay = wrapNodeToLayer(t, side, meta)
    setLayers((prev) => [...prev, lay])
    select(lay.id)
    set({ tool: "move" })
  }

  // ───── brush/erase (как штрихи-слои)
  const startStroke = (pos: Konva.Vector2d) => {
    const line = new Konva.Line({
      points: [pos.x, pos.y],
      stroke: tool === "erase" ? "rgba(255,255,255,1)" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    ;(line as any).id(uid())
    const lay = wrapNodeToLayer(line, side, { ...baseMeta(), blend: "source-over" })
    setLayers((prev) => [...prev, lay])
    select(lay.id)
    setIsDrawing(true)
  }
  const appendStroke = (pos: Konva.Vector2d) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    const pts = node.points().concat([pos.x, pos.y])
    node.points(pts)
    node.getLayer()?.batchDraw()
  }

  // мобильная блокировка скролла во время рисования
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      if (tool === "brush" || tool === "erase") e.preventDefault()
    }
    document.addEventListener("touchmove", prevent, { passive: false })
    return () => document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  // ───── crop: показываем рамку поверх выбранного Image/Text/Shape; применяем к выбранному ноду
  const beginCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    set({ isCropping: true })
    // рамка = границы выделенного нода
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRectRef.current?.position({ x: b.x, y: b.y })
    cropRectRef.current?.size({ width: b.width, height: b.height })
    cropRectRef.current?.visible(true)
    cropRectRef.current?.getLayer()?.batchDraw()
  }

  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRectRef.current
    if (!node || !rect) { set({ isCropping: false }); return }
    const { x, y, width, height } = rect
    // считаем координаты внутри самого нода (учитывая scale stage)
    const s = scale
    const rx = x() / s - node.x()
    const ry = y() / s - node.y()
    const rw = width() / s
    const rh = height() / s

    if (node instanceof Konva.Image) {
      const img = node.image()
      if (img) {
        node.crop({ x: rx, y: ry, width: rw, height: rh })
        node.width(rw)
        node.height(rh)
        node.getLayer()?.batchDraw()
      }
    } else {
      // для фигур/текста — оборачиваем в группу с clip
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      node.x(0); node.y(0)
      const parent = node.getParent()
      parent?.add(g)
      node.moveTo(g)
      g.cache() // для фильтров/бленда
      g.draw()
    }

    rect.visible(false)
    set({ isCropping: false })
    rect.getLayer()?.batchDraw()
  }

  const cancelCrop = () => {
    cropRectRef.current?.visible(false)
    set({ isCropping: false })
    cropRectRef.current?.getLayer()?.batchDraw()
  }

  // ───── export per side
  const exportSide = async (s: Side) => {
    const stage = stageRef.current
    if (!stage) return
    const oldScale = stage.scaleX()
    stage.scale({ x: 1, y: 1 })
    // временно скрыть другой side
    const toHide = layers.filter((l) => l.side !== s)
    toHide.forEach((l) => l.node.visible(false))
    stage.draw()
    const data = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" })
    toHide.forEach((l) => l.node.visible(true))
    stage.scale({ x: oldScale, y: oldScale })
    stage.draw()

    const a = document.createElement("a")
    a.href = data
    a.download = `darkroom-${s}.png`
    a.click()
  }

  // ───── stage pointer routing
  const pointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const down = () => {
    if (isCropping) return
    const p = pointer()
    if (tool === "brush" || tool === "erase") startStroke({ x: p.x / scale, y: p.y / scale })
    else if (tool === "shape") addShape(shapeKind)
    else if (tool === "text") addText()
  }
  const move = () => {
    if (!isDrawing) return
    const p = pointer()
    appendStroke({ x: p.x / scale, y: p.y / scale })
  }
  const up = () => setIsDrawing(false)

  // ───── panel (UI)
  const Panel = (
    <div
      className={`fixed ${isMobile ? "left-0 right-0 bottom-0" : "right-6 top-1/2 -translate-y-1/2 w-[320px]"} 
                  bg-white/70 backdrop-blur md:rounded-xl border border-black/10 shadow-xl p-4 z-50`}
      style={!isMobile ? { cursor: "grab" } : undefined}
    >
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {([
          ["brush","Brush"],
          ["erase","Erase"],
          ["text","Text"],
          ["shape","Shapes"],
          ["image","Image"],
          ["crop","Crop"],
        ] as const).map(([id,label]) => (
          <button
            key={id}
            onClick={() => set({ tool: id as any })}
            className={`px-3 py-2 border text-sm uppercase tracking-wide ${ (tool===id) ? "bg-black text-white" : "bg-white text-black"} `}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tool bodies */}
      {/* Brush / Erase */}
      {(tool==="brush" || tool==="erase") && (
        <div className="space-y-3">
          <div className="text-xs tracking-wide">Brush size: {brushSize}px</div>
          <input type="range" min={1} max={60} value={brushSize}
            onChange={(e)=>set({ brushSize: Number(e.target.value) })}
            className="w-full accent-black"/>
          <div className="text-xs tracking-wide">Brush color</div>
          <input type="color" value={brushColor} onChange={(e)=>set({ brushColor: e.target.value })}
            className="w-10 h-10 border"/>
        </div>
      )}

      {/* Text */}
      {tool==="text" && (
        <div className="space-y-2 text-xs">
          <div>Tap canvas to add “Your text”. Редактируй двойным кликом.</div>
          <button onClick={addText} className="mt-2 w-full border px-3 py-2 bg-black text-white">Add text</button>
        </div>
      )}

      {/* Shapes */}
      {tool==="shape" && (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {(["circle","square","triangle","cross","line"] as ShapeKind[]).map((s)=>(
              <button key={s} onClick={()=>addShape(s)} className="border px-2 py-2 bg-white hover:bg-black hover:text-white text-xs uppercase">{s}</button>
            ))}
          </div>
          <div className="text-xs mt-2">Цвет для новых фигур</div>
          <input type="color" defaultValue="#000000" onChange={(e)=>{/* фигуры создаются чёрными; если нужно — позже сделаем палитру per-shape */}} className="w-8 h-8 border"/>
        </div>
      )}

      {/* Image */}
      {tool==="image" && (
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={(e)=>{
            const f = e.target.files?.[0]; if (f) onUpload(f)
          }}/>
        </div>
      )}

      {/* Crop */}
      {tool==="crop" && (
        <div className="space-y-3 text-xs">
          <div>Выдели слой → Start Crop → потяни ручки → Apply.</div>
          <div className="flex gap-2">
            <button className="border px-3 py-2" onClick={beginCrop}>Start Crop</button>
            <button className="border px-3 py-2" onClick={applyCrop} disabled={!isCropping}>Apply</button>
            <button className="border px-3 py-2" onClick={cancelCrop} disabled={!isCropping}>Cancel</button>
          </div>
        </div>
      )}

      {/* Selected layer controls */}
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
            const n = findNode(selectedId); if (!n) return; const clone = n.clone()
            clone.x(n.x()+20); clone.y(n.y()+20); (clone as any).id(uid())
            const meta = { ...(getMeta(selectedId)!) }
            setLayers((p)=>[...p, wrapNodeToLayer(clone, side, meta)])
          }}>Duplicate</button>
          <button className="border px-2 py-2" onClick={removeSelected}>Delete</button>
          <button className="border px-2 py-2" onClick={()=>setLayers((p)=>p.filter(l=>!(l.side===side && l.kind==="stroke")))}>Clear strokes</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button className="border px-2 py-2" onClick={()=>exportSide("front")}>Download Front</button>
          <button className="border px-2 py-2" onClick={()=>exportSide("back")}>Download Back</button>
        </div>
      </div>

      {isMobile ? (
        <button onClick={togglePanel} className="mt-4 w-full border px-3 py-2 bg-black text-white">Close</button>
      ) : null}
    </div>
  )

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      {/* топовая кнопка на мобиле */}
      {isMobile && !showPanel && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
          <button onClick={togglePanel} className="px-6 py-3 bg-black text-white border">Create</button>
        </div>
      )}
      {/* боковая панель на десктопе */}
      {!isMobile && Panel}
      {isMobile && showPanel && Panel}

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
          {/* Front */}
          <Layer listening={false}>
            {frontMock && side==="front" && (
              <KImage image={frontMock} width={BASE_W} height={BASE_H}/>
            )}
            {backMock && side==="back" && (
              <KImage image={backMock} width={BASE_W} height={BASE_H}/>
            )}
          </Layer>

          {/* рабочий слой — ВСЕ объекты, фильтры/бленды применяются к нодам */}
          <Layer>
            {activeLayers.map((l) => {
              l.node.listening(true)
              l.node.on("click tap", () => select(l.id))
              return <Group key={l.id} ref={(g)=>{ /* noop: ноды уже живут вне React */ }} />
            })}
            {/* фактически ноды уже добавлены напрямую; выше — просто заставляем React перерисовать */}
            <Transformer ref={tRef} rotateEnabled={true} />
            {/* crop-RECT */}
            <Rect ref={cropRectRef} visible={false}
              stroke="black" dash={[6,4]} strokeWidth={2}
              draggable
              dragBoundFunc={(pos)=>({ x: Math.max(0, Math.min(pos.x, BASE_W-20)), y: Math.max(0, Math.min(pos.y, BASE_H-20)) })}
            />
          </Layer>
        </Stage>
      </div>

      {/* переключатель Front/Back под сценой (как в исходнике) */}
      <div className="absolute left-1/2 -translate-x-1/2 top-4 z-30 flex gap-2">
        <button className={`px-3 py-1 border ${side==="front" ? "bg-black text-white" : "bg-white"}`} onClick={()=>set({ side: "front" })}>Front</button>
        <button className={`px-3 py-1 border ${side==="back" ? "bg-black text-white" : "bg-white"}`} onClick={()=>set({ side: "back" })}>Back</button>
      </div>
    </div>
  )
}
