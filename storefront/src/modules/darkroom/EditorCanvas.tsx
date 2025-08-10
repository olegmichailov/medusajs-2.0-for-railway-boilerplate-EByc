// ==============================
// File: src/modules/darkroom/EditorCanvas.tsx
// ==============================
"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

// Base canvas (hi‑res)
const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

// Types
export type BaseMeta = {
  blend: Blend
  opacity: number
  raster: number
  name: string
  visible: boolean
  locked: boolean
}
export type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
export type LayerType = "image" | "shape" | "text" | "stroke"
export type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

// Local storage key
const LS_KEY = "darkroom_v2_state"

export default function EditorCanvas() {
  const {
    side,
    set,
    tool,
    brushColor,
    brushSize,
    shapeKind,
    selectedId,
    select,
    showLayers,
    toggleLayers,
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock] = useImage(BACK_SRC, "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const mockLayerRef = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const tRef = useRef<Konva.Transformer>(null)
  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTfRef = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const pendingStrokeId = useRef<string | null>(null)

  // Autoscale by viewport and layers panel
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePanel = showLayers ? 320 : 0
    const maxW = vw - PADDING * 2 - sidePanel
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // Helpers
  const findLayer = (id: string | null) => (id ? layers.find((l) => l.id === id) || null : null)
  const findNode = (id: string | null) => findLayer(id)?.node || null

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    if ((node as any).filters) {
      if (meta.raster > 0 && (Konva as any).Filters?.Pixelate) {
        ;(node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        ;(node as any).filters([])
      }
    }
  }
  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over",
    opacity: 1,
    raster: 0,
    name,
    visible: true,
    locked: false,
  })

  // Attach transformer to selection (never during brush/crop)
  const canDrag = (t: string) => !["brush", "erase", "crop"].includes(t)
  const attachTransformer = () => {
    const lay = findLayer(selectedId)
    const node = lay?.node
    if (node && tRef.current && !lay?.meta.locked && lay?.type !== "stroke" && !isDrawing && !isCropping) {
      node.draggable(canDrag(tool))
      tRef.current.nodes([node])
      tRef.current.getLayer()?.batchDraw()
    } else {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
    }
  }
  useEffect(() => {
    attachTransformer()
  }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // Sync visibility per side
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
  }, [side, layers])

  // Shortcuts (duplicate / delete / z-index)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      if (!node) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        const src = layers.find((l) => l.id === selectedId)!
        const clone = node.clone()
        clone.x(node.x() + 20)
        clone.y(node.y() + 20)
        ;(clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const id = (clone as any)._id
        setLayers((p) => [...p, { id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name + " copy" }, type: src.type }])
        select(id)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        setLayers((p) => {
          const l = p.find((x) => x.id === selectedId)
          l?.node.destroy()
          return p.filter((x) => x.id !== selectedId)
        })
        select(null)
        drawLayerRef.current?.batchDraw()
      } else if (e.key === "]") {
        node.moveUp(); node.getLayer()?.batchDraw()
      } else if (e.key === "[") {
        node.moveDown(); node.getLayer()?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, layers, side])

  // Upload image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const node = new Konva.Image({ image: img, x: BASE_W / 2 - img.width / 2, y: BASE_H / 2 - img.height / 2, width: img.width, height: img.height })
        ;(node as any).id(uid())
        node.listening(true)
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        drawLayerRef.current?.add(node)
        node.on("click tap", () => select((node as any)._id))
        const id = (node as any)._id
        setLayers((p) => [...p, { id, side, node, meta, type: "image" }])
        select(id)
        drawLayerRef.current?.batchDraw()
        saveState()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // Inline text editor
  const editTextInline = (textNode: Konva.Text) => {
    const stage = stageRef.current
    if (!stage) return
    const container = stage.container()
    const pos = textNode.absolutePosition()
    const rect = container.getBoundingClientRect()

    const ta = document.createElement("textarea")
    ta.value = textNode.text()
    ta.style.position = "fixed"
    ta.style.left = rect.left + pos.x * scale + "px"
    ta.style.top = rect.top + (pos.y - textNode.fontSize()) * scale + "px"
    ta.style.width = Math.max(200, textNode.width() * scale) + "px"
    ta.style.fontSize = textNode.fontSize() * scale + "px"
    ta.style.fontFamily = textNode.fontFamily()
    ta.style.color = (textNode.fill() as string) || "#000"
    ta.style.padding = "6px"
    ta.style.border = "1px solid #000"
    ta.style.background = "#fff"
    ta.style.zIndex = "9999"

    document.body.appendChild(ta)
    ta.focus()
    const commit = () => {
      textNode.text(ta.value)
      document.body.removeChild(ta)
      drawLayerRef.current?.batchDraw()
      saveState()
    }
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); commit()
      }
    })
    ta.addEventListener("blur", commit)
  }

  // Add text
  const onAddText = () => {
    const node = new Konva.Text({ text: "Your text", x: BASE_W / 2 - 180, y: BASE_H / 2 - 30, fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif", fill: brushColor, width: 400 })
    ;(node as any).id(uid())
    node.listening(true)
    const meta = baseMeta("Text")
    applyMeta(node, meta)
    drawLayerRef.current?.add(node)
    node.on("click tap", () => select((node as any)._id))
    node.on("dblclick dbltap", () => editTextInline(node))
    const id = (node as any)._id
    setLayers((p) => [...p, { id, side, node, meta, type: "text" }])
    select(id)
    drawLayerRef.current?.batchDraw()
    saveState()
  }

  // Add shapes (only via toolbar!)
  const addShape = (kind: ShapeKind) => {
    let node: AnyNode
    if (kind === "circle") node = new Konva.Circle({ x: BASE_W / 2, y: BASE_H / 2, radius: 160, fill: brushColor })
    else if (kind === "square") node = new Konva.Rect({ x: BASE_W / 2 - 160, y: BASE_H / 2 - 160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") node = new Konva.RegularPolygon({ x: BASE_W / 2, y: BASE_H / 2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W / 2 - 160, y: BASE_H / 2 - 160 })
      g.add(new Konva.Rect({ width: 320, height: 70, y: 125, fill: brushColor }))
      g.add(new Konva.Rect({ width: 70, height: 320, x: 125, fill: brushColor }))
      node = g
    } else {
      node = new Konva.Line({ points: [BASE_W / 2 - 200, BASE_H / 2, BASE_W / 2 + 200, BASE_H / 2], stroke: brushColor, strokeWidth: 10, lineCap: "round" })
    }
    ;(node as any).id(uid())
    ;(node as any).listening(true)
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    drawLayerRef.current?.add(node as any)
    ;(node as any).on("click tap", () => select((node as any)._id))
    const id = (node as any)._id
    setLayers((p) => [...p, { id, side, node, meta, type: "shape" }])
    select(id)
    drawLayerRef.current?.batchDraw()
    saveState()
  }

  // Apply brush/erase
  const startStroke = (x: number, y: number) => {
    const line = new Konva.Line({ points: [x, y], stroke: tool === "erase" ? "#ffffff" : brushColor, strokeWidth: brushSize, lineCap: "round", lineJoin: "round", globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over" })
    ;(line as any).id(uid())
    line.listening(true)
    drawLayerRef.current?.add(line)
    const meta = baseMeta("Stroke")
    const id = (line as any)._id
    setLayers((p) => [...p, { id, side, node: line, meta, type: "stroke" }])
    pendingStrokeId.current = id
    setIsDrawing(true)
    // don't select while drawing
  }
  const appendStroke = (x: number, y: number) => {
    const id = pendingStrokeId.current
    const node = findNode(id)
    if (!(node instanceof Konva.Line)) return
    const pts = node.points().concat([x, y])
    node.points(pts)
    drawLayerRef.current?.batchDraw()
  }

  // Crop
  const startCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    setIsCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    tRef.current?.nodes([])
    drawLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRectRef.current
    if (!node || !rect) { setIsCropping(false); return }
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
      drawLayerRef.current?.add(g)
      node.moveTo(g)
      node.position({ x: 0, y: 0 })
      g.cache()
    }
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    setIsCropping(false)
    drawLayerRef.current?.batchDraw()
    saveState()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    drawLayerRef.current?.batchDraw()
  }

  // Export (two variants: with mockup and design-only alpha)
  const download = (dataUrl: string, name: string) => {
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = name
    a.click()
  }
  const exportPNG = (s: Side, { withMock }: { withMock: boolean }) => {
    const st = stageRef.current
    if (!st) return

    // Toggle visibility by side
    const toggled: { node: AnyNode; prev: boolean }[] = []
    layers.forEach((l) => {
      const shouldShow = l.side === s && l.meta.visible
      toggled.push({ node: l.node, prev: l.node.visible() })
      l.node.visible(shouldShow)
    })

    if (mockLayerRef.current) mockLayerRef.current.visible(withMock)

    const pr = 1 / st.scaleX() // render at base resolution
    st.draw()
    const data = st.toDataURL({ mimeType: "image/png", pixelRatio: pr })

    toggled.forEach((t) => t.node.visible(t.prev))
    if (mockLayerRef.current) mockLayerRef.current.visible(true)
    st.draw()

    download(data, `darkroom-${s}${withMock ? "" : "-design"}.png`)
  }

  // Pointer: NO autospawn of shapes; only brush uses pointer
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool === "brush" || tool === "erase") startStroke(p.x / scale, p.y / scale)
    else if (tool === "text") onAddText()
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x / scale, p.y / scale)
  }
  const onUp = () => {
    if (isDrawing && pendingStrokeId.current) {
      select(pendingStrokeId.current)
      pendingStrokeId.current = null
      saveState()
    }
    setIsDrawing(false)
  }

  // Selected object quick props from Toolbar
  const setSelectedFill = (hex: string) => {
    const lay = findLayer(selectedId); if (!lay) return
    if (lay.type === "text") (lay.node as Konva.Text).fill(hex)
    else if ((lay.node as any).fill) (lay.node as any).fill(hex)
    else if (lay.node instanceof Konva.Line) (lay.node as Konva.Line).stroke(hex)
    lay.node.getLayer()?.batchDraw(); saveState()
  }
  const setSelectedStroke = (hex: string) => {
    const lay = findLayer(selectedId); if (!lay) return
    if (lay.node instanceof Konva.Line) (lay.node as Konva.Line).stroke(hex)
    ;(lay.node as any).stroke && (lay.node as any).stroke(hex)
    lay.node.getLayer()?.batchDraw(); saveState()
  }
  const setSelectedStrokeW = (w: number) => {
    const lay = findLayer(selectedId); if (!lay) return
    if (lay.node instanceof Konva.Line) (lay.node as Konva.Line).strokeWidth(w)
    ;(lay.node as any).strokeWidth && (lay.node as any).strokeWidth(w)
    lay.node.getLayer()?.batchDraw(); saveState()
  }
  const setSelectedText = (t: string) => {
    const lay = findLayer(selectedId); if (!lay || lay.type !== "text") return
    ;(lay.node as Konva.Text).text(t); lay.node.getLayer()?.batchDraw(); saveState()
  }
  const setSelectedFontSize = (n: number) => {
    const lay = findLayer(selectedId); if (!lay || lay.type !== "text") return
    ;(lay.node as Konva.Text).fontSize(n); lay.node.getLayer()?.batchDraw(); saveState()
  }

  // Layers panel callbacks
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers((p) => p.map((l) => {
      if (l.id !== id) return l
      const nextMeta = { ...l.meta, ...patch }
      applyMeta(l.node, nextMeta)
      if (patch.visible !== undefined) l.node.visible(nextMeta.visible && l.side === side)
      return { ...l, meta: nextMeta }
    }))
    drawLayerRef.current?.batchDraw(); saveState()
  }
  const onLayerSelect = (id: string) => select(id)
  const onToggleVisible = (id: string) => { const l = layers.find((x) => x.id === id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock = (id: string) => { const l = layers.find((x) => x.id === id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete = (id: string) => {
    setLayers((p) => { const l = p.find((x) => x.id === id); l?.node.destroy(); return p.filter((x) => x.id !== id) })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw(); saveState()
  }
  const onDuplicate = (id: string) => {
    const src = layers.find((l) => l.id === id)!; const clone = src.node.clone(); clone.x(src.node.x() + 20); clone.y(src.node.y() + 20); (clone as any).id(uid()); drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name + " copy" }, type: src.type }
    setLayers((p) => [...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw(); saveState()
  }
  const onMoveUp = (id: string) => { const n = layers.find((l) => l.id === id)?.node; n?.moveUp(); drawLayerRef.current?.batchDraw(); saveState() }
  const onMoveDown = (id: string) => { const n = layers.find((l) => l.id === id)?.node; n?.moveDown(); drawLayerRef.current?.batchDraw(); saveState() }

  // Local persistence (very simple JSON snapshot)
  type SnapshotItem = { id: string; side: Side; type: LayerType; meta: BaseMeta; props: any }
  const snapshot = (): SnapshotItem[] => layers.map((l) => {
    const node = l.node as any
    const props: any = { x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX?.() ?? 1, scaleY: node.scaleY?.() ?? 1 }
    if (l.type === "image") { props.image = node.image()?.src || ""; props.width = node.width(); props.height = node.height(); props.crop = node.crop?.() }
    if (l.type === "text") { props.text = node.text(); props.fontSize = node.fontSize(); props.fontFamily = node.fontFamily(); props.fill = node.fill() }
    if (l.type === "shape") {
      if (node.className === "Circle") { props.kind = "circle"; props.radius = node.radius(); props.fill = node.fill?.() }
      else if (node.className === "Rect") { props.kind = "square"; props.width = node.width(); props.height = node.height(); props.fill = node.fill?.() }
      else if (node.className === "RegularPolygon") { props.kind = "triangle"; props.radius = node.radius(); props.fill = node.fill?.() }
      else if (node.className === "Group") { props.kind = "cross"; props.children = []; props.fill = brushColor }
      else if (node.className === "Line") { props.kind = "line"; props.points = node.points(); props.stroke = node.stroke(); props.strokeWidth = node.strokeWidth() }
    }
    if (l.type === "stroke") { props.points = node.points(); props.stroke = node.stroke(); props.strokeWidth = node.strokeWidth(); props.gco = node.globalCompositeOperation() }
    return { id: l.id, side: l.side, type: l.type, meta: l.meta, props }
  })

  const saveState = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ items: snapshot() })) } catch {}
  }

  const restoreState = async () => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as { items: SnapshotItem[] }
      const restored: AnyLayer[] = []
      for (const it of data.items) {
        let node: AnyNode | null = null
        if (it.type === "image") {
          const img = new window.Image(); img.crossOrigin = "anonymous"; await new Promise<void>((res) => { img.onload = () => res(); img.src = it.props.image })
          node = new Konva.Image({ image: img, x: it.props.x, y: it.props.y, width: it.props.width, height: it.props.height })
          if (it.props.crop) (node as Konva.Image).crop(it.props.crop)
        } else if (it.type === "text") {
          node = new Konva.Text({ text: it.props.text, x: it.props.x, y: it.props.y, fontSize: it.props.fontSize, fontFamily: it.props.fontFamily, fill: it.props.fill, width: 400 })
        } else if (it.type === "shape") {
          switch (it.props.kind) {
            case "circle": node = new Konva.Circle({ x: it.props.x, y: it.props.y, radius: it.props.radius, fill: it.props.fill }); break
            case "square": node = new Konva.Rect({ x: it.props.x, y: it.props.y, width: it.props.width, height: it.props.height, fill: it.props.fill }); break
            case "triangle": node = new Konva.RegularPolygon({ x: it.props.x, y: it.props.y, sides: 3, radius: it.props.radius, fill: it.props.fill }); break
            case "line": node = new Konva.Line({ x: it.props.x, y: it.props.y, points: it.props.points, stroke: it.props.stroke, strokeWidth: it.props.strokeWidth, lineCap: "round" }); break
            case "cross": {
              const g = new Konva.Group({ x: it.props.x, y: it.props.y }); g.add(new Konva.Rect({ width: 320, height: 70, y: 125, fill: it.props.fill })); g.add(new Konva.Rect({ width: 70, height: 320, x: 125, fill: it.props.fill })); node = g; break
            }
          }
        } else if (it.type === "stroke") {
          node = new Konva.Line({ x: it.props.x, y: it.props.y, points: it.props.points, stroke: it.props.stroke, strokeWidth: it.props.strokeWidth, lineCap: "round", lineJoin: "round", globalCompositeOperation: it.props.gco })
        }
        if (!node) continue
        ;(node as any).id(uid())
        drawLayerRef.current?.add(node)
        node.on("click tap", () => select((node as any)._id))
        applyMeta(node, it.meta)
        node.rotation(it.props.rotation || 0)
        node.scaleX?.(it.props.scaleX || 1)
        node.scaleY?.(it.props.scaleY || 1)
        restored.push({ id: (node as any)._id, side: it.side, node, meta: it.meta, type: it.type })
      }
      setLayers(restored)
      drawLayerRef.current?.batchDraw()
    } catch {}
  }

  useEffect(() => { restoreState() }, [])

  // Compose layer list for panel (sorted by zIndex desc)
  const layerItems = useMemo(() => layers.filter((l) => l.side === side).sort((a, b) => a.node.zIndex() - b.node.zIndex()).reverse().map((l) => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked })), [layers, side])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        // core
        side={side}
        setSide={(s) => set({ side: s })}
        tool={tool}
        setTool={(t) => set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v) => set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n) => set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={(k) => set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={() => exportPNG("front", { withMock: true })}
        onDownloadFrontDesign={() => exportPNG("front", { withMock: false })}
        onDownloadBack={() => exportPNG("back", { withMock: true })}
        onDownloadBackDesign={() => exportPNG("back", { withMock: false })}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        // selected props setters
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          {/* mockup layer */}
          <Layer ref={mockLayerRef} listening={false}>
            {side === "front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === "back" && backMock && <KImage image={backMock} width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* content layer */}
          <Layer ref={drawLayerRef}>
            <Transformer ref={tRef} rotateEnabled anchorSize={12} borderStroke="#111" anchorStroke="#111" anchorFill="#fff" />
            {/* crop */}
            <Rect ref={cropRectRef} visible={false} stroke="#111" dash={[6, 4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="#111" anchorStroke="#111" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
