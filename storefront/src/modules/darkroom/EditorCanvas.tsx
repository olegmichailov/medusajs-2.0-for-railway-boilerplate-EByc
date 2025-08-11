"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { useDarkroom, type Blend, type ShapeKind, type Side, type Tool } from "./store"
import LayersPanel from "./LayersPanel"
import Toolbar from "./Toolbar"

const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = {
  name: string
  blend: Blend
  opacity: number
  visible: boolean
  locked: boolean
}

type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyLayer = { id: string; side: Side; node: AnyNode; type: LayerType; meta: BaseMeta }

type SavedLayer = {
  id: string
  side: Side
  type: LayerType
  meta: BaseMeta
  payload: any
}

export default function EditorCanvas() {
  const dr = useDarkroom()
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = dr

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const workLayerRef = useRef<Konva.Layer>(null)
  const tRef = useRef<Konva.Transformer>(null)

  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTfRef   = useRef<Konva.Transformer>(null)
  const [isCropping, setIsCropping] = useState(false)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const strokeGroupId = useRef<string | null>(null)
  const shapeClickGuard = useRef(false) // чтобы тач/мышь не давали двойное добавление

  // ========= auto scale (без изменения вида) =========
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : BASE_W
    const vh = typeof window !== "undefined" ? window.innerHeight : BASE_H
    const rightPanel = showLayers ? 340 : 0
    const maxW = vw - rightPanel - PADDING * 2
    const maxH = vh - 120
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s || 1 }
  }, [showLayers])

  // ========= helpers =========
  const findLayer = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const findNode  = (id: string | null) => findLayer(id)?.node || null

  const baseMeta = (name: string): BaseMeta => ({
    name, blend: "source-over", opacity: 1, visible: true, locked: false
  })

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    node.visible(meta.visible)
    node.getLayer()?.batchDraw()
  }

  const canDragNow = () => !isDrawing && !isCropping

  const attachTransformer = () => {
    const lay = findLayer(selectedId)
    const node = lay?.node
    if (!tRef.current) return
    if (!node || lay?.meta.locked || !canDragNow()) {
      tRef.current.nodes([])
      tRef.current.getLayer()?.batchDraw()
      return
    }
    // «Move всегда работает, когда виден трансформер»
    node.draggable(true)
    tRef.current.nodes([node])
    tRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // при смене стороны показываем только нужные
  useEffect(() => {
    layers.forEach(l => l.node.visible(l.side === side && l.meta.visible))
    workLayerRef.current?.batchDraw()
  }, [side, layers])

  // ========= keyboard =========
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      // hotkeys инструментов — без синих, без эффектов
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === "b") set({ tool: "brush" as Tool })
        if (k === "v") set({ tool: "move" as Tool })
        if (k === "e") set({ tool: "erase" as Tool })
        if (k === "t") set({ tool: "text" as Tool })
        if (k === "u") set({ tool: "shape" as Tool })
        if (k === "c") set({ tool: "crop" as Tool })
      }
      if (!node) return
      const step = e.shiftKey ? 10 : 1
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      if (e.key === "ArrowLeft")  node.x(node.x()-step)
      if (e.key === "ArrowRight") node.x(node.x()+step)
      if (e.key === "ArrowUp")    node.y(node.y()-step)
      if (e.key === "ArrowDown")  node.y(node.y()+step)
      node.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  // ========= Image upload =========
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const w = img.width, h = img.height
        const node = new Konva.Image({
          image: img,
          x: (BASE_W - w)/2, y: (BASE_H - h)/2, width: w, height: h,
          listening: true
        })
        ;(node as any).id(uid())
        const id = (node as any)._id
        const meta = baseMeta("image")
        applyMeta(node, meta)
        workLayerRef.current?.add(node)
        setLayers(p => [...p, { id, side, node, type: "image", meta }])
        select(id)
        workLayerRef.current?.batchDraw()
        saveToStorage()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ========= Text =========
  const addText = (text: string, fontFamily: string, fontSize: number, color: string) => {
    const node = new Konva.Text({
      text: text || "Your text",
      x: BASE_W/2 - 200, y: BASE_H/2 - 30,
      width: 400, align: "center",
      fontFamily, fontSize, fill: color, listening: true
    })
    ;(node as any).id(uid())
    const id = (node as any)._id
    const meta = baseMeta("text")
    applyMeta(node, meta)
    workLayerRef.current?.add(node)
    setLayers(p => [...p, { id, side, node, type: "text", meta }])
    select(id)
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }

  const updateSelectedTextProps = (patch: Partial<{ text: string; fontFamily: string; fontSize: number; fill: string }>) => {
    const lay = findLayer(selectedId)
    if (!lay || lay.type !== "text") return
    const t = lay.node as Konva.Text
    if (patch.text !== undefined) t.text(patch.text)
    if (patch.fontFamily !== undefined) t.fontFamily(patch.fontFamily)
    if (patch.fontSize !== undefined) t.fontSize(patch.fontSize)
    if (patch.fill !== undefined) t.fill(patch.fill)
    t.getLayer()?.batchDraw()
    saveToStorage()
  }

  // ========= Shapes =========
  const addShapeAt = (kind: ShapeKind, x: number, y: number, color: string) => {
    let node: AnyNode
    if (kind === "circle") node = new Konva.Circle({ x, y, radius: 120, fill: color })
    else if (kind === "square") node = new Konva.Rect({ x: x-120, y: y-120, width: 240, height:240, fill: color })
    else if (kind === "triangle") node = new Konva.RegularPolygon({ x, y, sides: 3, radius: 140, fill: color })
    else if (kind === "line") node = new Konva.Line({ points: [x-160, y, x+160, y], stroke: color, strokeWidth: 10, lineCap:"butt" })
    else if (kind === "star") node = new Konva.Star({ x, y, numPoints: 5, innerRadius: 60, outerRadius: 120, fill: color })
    else if (kind === "heart") {
      const g = new Konva.Group({ x, y })
      const p = new Konva.Path({
        data: "M 0 50 C 0 0 60 0 60 35 C 60 0 120 0 120 50 C 120 95 60 120 60 160 C 60 120 0 95 0 50 Z",
        fill: color, offsetX: 60, offsetY: 80
      })
      g.add(p); node = g
    } else node = new Konva.Rect({ x: x-120, y: y-120, width: 240, height:240, fill: color })
    ;(node as any).id(uid())
    const id = (node as any)._id
    const meta = baseMeta(kind as string)
    applyMeta(node, meta)
    workLayerRef.current?.add(node as any)
    setLayers(p => [...p, { id, side, node, type: "shape", meta }])
    select(id)
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }

  // ========= Brush / Eraser (сбор штрихов в группу до смены инструмента) =========
  const ensureStrokeGroup = () => {
    if (strokeGroupId.current) {
      const lay = findLayer(strokeGroupId.current)
      if (lay) return lay
    }
    const g = new Konva.Group({ listening: true })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta("strokes")
    applyMeta(g, meta)
    workLayerRef.current?.add(g)
    const lay: AnyLayer = { id, side, node: g, type: "strokes", meta }
    setLayers(p => [...p, lay])
    strokeGroupId.current = id
    return lay
  }

  const startStroke = (x:number, y:number) => {
    const groupLay = ensureStrokeGroup()
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over"
    })
    groupLay.node.add(line)
    workLayerRef.current?.batchDraw()
    setIsDrawing(true)
  }

  const appendStroke = (x:number, y:number) => {
    const g = findLayer(strokeGroupId.current)?.node as Konva.Group
    if (!g) return
    const line = g.children()[g.children().length - 1] as Konva.Line
    const pts = line.points().concat([x,y])
    line.points(pts)
    workLayerRef.current?.batchDraw()
  }

  const finishStroke = () => {
    setIsDrawing(false)
    saveToStorage()
  }

  // при смене инструмента закрываем «сессию» штрихов
  useEffect(() => {
    if (tool !== "brush" && tool !== "erase") {
      strokeGroupId.current = null
    }
  }, [tool])

  // ========= Crop =========
  const [cropTargetId, setCropTargetId] = useState<string | null>(null)
  const beginCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    const st = stageRef.current!
    const box = node.getClientRect({ relativeTo: st })
    const rect = cropRectRef.current!
    rect.position({ x: box.x, y: box.y })
    rect.size({ width: box.width, height: box.height })
    rect.visible(true)
    cropTfRef.current?.nodes([rect])
    setIsCropping(true)
    setCropTargetId(selectedId)
    tRef.current?.nodes([])
    workLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const node = findNode(cropTargetId)
    const rect = cropRectRef.current!
    if (!node || !rect) { cancelCrop(); return }
    const s = scale
    const rx = rect.x()/s - node.x()
    const ry = rect.y()/s - node.y()
    const rw = rect.width()/s
    const rh = rect.height()/s

    if (node instanceof Konva.Image) {
      node.crop({ x: rx, y: ry, width: rw, height: rh })
      node.width(rw); node.height(rh)
    } else {
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      const parent = node.getParent()
      parent?.add(g)
      node.moveTo(g); node.position({ x:0, y:0 })
      g.cache()
    }
    cancelCrop()
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }
  const cancelCrop = () => {
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    setIsCropping(false)
    setCropTargetId(null)
    workLayerRef.current?.batchDraw()
  }

  // ========= Export (двойной файл: mock + art) =========
  const exportSide = async (s: Side) => {
    const stage = stageRef.current!
    const prevScale = stage.scaleX()

    // показать только выбранную сторону
    const hidden: AnyLayer[] = []
    layers.forEach(l => {
      if (l.side !== s) { hidden.push(l); l.node.visible(false) }
      else l.node.visible(l.meta.visible)
    })

    // (1) MOCK — с мокапом
    stage.scale({ x: 1, y: 1 })
    stage.draw()
    const mockData = stage.toDataURL({ pixelRatio: 1/prevScale, mimeType: "image/png" })

    // (2) ART — без мокапа (прозрачный)
    // временно скрываем слой мокапа: это первый Layer в Stage
    const mockLayer = stage.getLayers()[0]
    const wasMockVis = mockLayer.visible()
    mockLayer.visible(false)
    stage.draw()
    const artData = stage.toDataURL({ pixelRatio: 1/prevScale, mimeType: "image/png" })
    mockLayer.visible(wasMockVis)

    // откат видимости
    hidden.forEach(l => l.node.visible(l.meta.visible))
    stage.scale({ x: prevScale, y: prevScale })
    stage.draw()

    const download = (data:string, name:string) => {
      const a = document.createElement("a")
      a.href = data
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    download(mockData, `darkroom-${s}-mock.png`)
    download(artData,  `darkroom-${s}-art.png`)
  }

  // ========= Layers operations =========
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      return { ...l, meta }
    }))
    saveToStorage()
  }

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id === id)
      l?.node.destroy()
      return p.filter(x => x.id !== id)
    })
    if (selectedId === id) select(null)
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }

  const duplicateLayer = (id:string) => {
    const src = layers.find(l => l.id === id); if (!src) return
    const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20)
    ;(clone as any).id(uid())
    workLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id:(clone as any)._id, side: src.side, node: clone, type: src.type, meta: { ...src.meta } }
    setLayers(p => [...p, newLay])
    select(newLay.id)
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }

  const reorderLayers = (dragId:string, overId:string) => {
    if (dragId === overId) return
    const newArr = [...layers]
    const from = newArr.findIndex(l => l.id === dragId)
    const to = newArr.findIndex(l => l.id === overId)
    if (from < 0 || to < 0) return
    const [moved] = newArr.splice(from, 1)
    newArr.splice(to, 0, moved)
    // применяем к Konva zIndex
    newArr.forEach((l, i) => l.node.zIndex(i+10)) // +10 чтобы не залезть на mock-layer
    setLayers(newArr)
    workLayerRef.current?.batchDraw()
    saveToStorage()
  }

  // ========= Persistence =========
  const serialize = (): SavedLayer[] => layers.map(l => {
    if (l.type === "image") {
      const img = (l.node as Konva.Image).image() as HTMLImageElement
      const c = document.createElement("canvas")
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const data = c.toDataURL()
      return { id:l.id, side:l.side, type:l.type, meta:l.meta, payload: { data, x:l.node.x(), y:l.node.y(), w:l.node.width(), h:l.node.height(), rotation:(l.node as any).rotation?.() || 0 } }
    }
    if (l.type === "text") {
      const t = l.node as Konva.Text
      return { id:l.id, side:l.side, type:l.type, meta:l.meta, payload: { text:t.text(), x:t.x(), y:t.y(), fontFamily:t.fontFamily(), fontSize:t.fontSize(), fill:String(t.fill()||"#000"), width:t.width(), rotation:(t as any).rotation?.() || 0 } }
    }
    if (l.type === "shape") {
      const n:any = l.node
      return { id:l.id, side:l.side, type:l.type, meta:l.meta, payload: { attrs: n.getAttrs() } }
    }
    // strokes group
    if (l.type === "strokes") {
      const g = l.node as Konva.Group
      const lines = g.children().map((ch:any)=>({
        points: ch.points(), stroke: ch.stroke(), strokeWidth: ch.strokeWidth(),
        gco: (ch as any).globalCompositeOperation || "source-over"
      }))
      return { id:l.id, side:l.side, type:l.type, meta:l.meta, payload: { x:g.x(), y:g.y(), lines } }
    }
    return { id:l.id, side:l.side, type:l.type, meta:l.meta, payload:{} }
  })

  const deserialize = (arr: SavedLayer[]) => {
    const out: AnyLayer[] = []
    arr.forEach(s => {
      if (s.type === "image") {
        const img = new window.Image()
        img.crossOrigin = "anonymous"
        img.onload = () => { workLayerRef.current?.batchDraw() }
        img.src = s.payload.data
        const node = new Konva.Image({ image: img, x:s.payload.x, y:s.payload.y, width:s.payload.w, height:s.payload.h, rotation: s.payload.rotation })
        ;(node as any).id(s.id)
        const lay: AnyLayer = { id: s.id, side: s.side, node, type: "image", meta: s.meta }
        applyMeta(node, s.meta)
        workLayerRef.current?.add(node)
        out.push(lay)
      } else if (s.type === "text") {
        const node = new Konva.Text({
          text:s.payload.text, x:s.payload.x, y:s.payload.y, width:s.payload.width,
          fontFamily:s.payload.fontFamily, fontSize:s.payload.fontSize,
          fill:s.payload.fill, align:"center", rotation: s.payload.rotation
        })
        ;(node as any).id(s.id)
        const lay: AnyLayer = { id: s.id, side: s.side, node, type: "text", meta: s.meta }
        applyMeta(node, s.meta)
        workLayerRef.current?.add(node)
        out.push(lay)
      } else if (s.type === "shape") {
        const node:any = Konva.Node.create({ attrs: s.payload.attrs })
        ;(node as any).id(s.id)
        const lay: AnyLayer = { id: s.id, side: s.side, node, type: "shape", meta: s.meta }
        applyMeta(node, s.meta)
        workLayerRef.current?.add(node)
        out.push(lay)
      } else if (s.type === "strokes") {
        const g = new Konva.Group({ x:s.payload.x, y:s.payload.y })
        s.payload.lines.forEach((ln:any)=>{
          const line = new Konva.Line({
            points: ln.points, stroke: ln.stroke, strokeWidth: ln.strokeWidth, lineCap:"round", lineJoin:"round"
          })
          ;(line as any).globalCompositeOperation = ln.gco
          g.add(line)
        })
        ;(g as any).id(s.id)
        const lay: AnyLayer = { id: s.id, side: s.side, node: g, type: "strokes", meta: s.meta }
        applyMeta(g, s.meta)
        workLayerRef.current?.add(g)
        out.push(lay)
      }
    })
    // порядок и zIndex
    out.forEach((l, i) => l.node.zIndex(i+10))
    setLayers(out)
    workLayerRef.current?.batchDraw()
  }

  const saveToStorage = () => {
    try {
      const data = {
        layers: serialize(),
        brushColor, brushSize, side
      }
      localStorage.setItem("darkroom_state_v2", JSON.stringify(data))
    } catch {}
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("darkroom_state_v2")
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed.brushColor) set({ brushColor: parsed.brushColor })
      if (parsed.brushSize) set({ brushSize: parsed.brushSize })
      if (parsed.side) set({ side: parsed.side })
      setTimeout(() => deserialize(parsed.layers || []), 0)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { saveToStorage() }, [layers, side])

  // ========= pointer routing =========
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const onDown = (e:any) => {
    if (isCropping) return
    // правый клик — игнор
    if (e.evt?.button === 2) return
    const p = getPos()
    const x = p.x/scale, y = p.y/scale

    if (tool === "brush" || tool === "erase") {
      startStroke(x, y)
      return
    }
    if (tool === "text") {
      addText("Your text", "Inter, Arial, Helvetica, sans-serif", 48, brushColor)
      return
    }
    if (tool === "shape") {
      if (shapeClickGuard.current) return
      shapeClickGuard.current = true
      addShapeAt(shapeKind, x, y, brushColor)
      return
    }
    if (tool === "crop") {
      beginCrop()
      return
    }
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x/scale, p.y/scale)
  }
  const onUp = () => {
    if (isDrawing) finishStroke()
    setTimeout(() => { shapeClickGuard.current = false }, 0)
  }

  // ========= list for LayersPanel (только текущая сторона) =========
  const layerItems = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .map((l, i) => ({
        id: l.id,
        name: l.meta.name || (l.type === "strokes" ? `strokes` : l.type),
        type: l.type,
        blend: l.meta.blend,
        opacity: l.meta.opacity,
        visible: l.meta.visible,
        locked: l.meta.locked,
        z: i
      }))
  }, [layers, side])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden select-none">
      <Toolbar
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor:v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize:n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind:k })}
        onUploadImage={onUploadImage}
        onAddText={(v, ff, fs)=>addText(v, ff, fs, brushColor)}
        onTextChange={(patch)=>updateSelectedTextProps(patch)}
        onStartCrop={beginCrop} onApplyCrop={applyCrop} onCancelCrop={cancelCrop} isCropping={isCropping}
        side={side} setSide={(s)=>set({ side:s })}
        onDownloadFront={()=>exportSide("front")}
        onDownloadBack={()=>exportSide("back")}
        toggleLayers={toggleLayers}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectedId={selectedId}
          onSelect={(id)=>select(id)}
          onToggleVisible={(id)=>updateMeta(id, { visible: !findLayer(id)!.meta.visible })}
          onToggleLock={(id)=>updateMeta(id, { locked: !findLayer(id)!.meta.locked })}
          onBlendChange={(id,blend)=>updateMeta(id, { blend })}
          onOpacityChange={(id,opacity)=>updateMeta(id, { opacity })}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorderLayers}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          onContextMenu={(e)=>e.evt.preventDefault()}
        >
          {/* MOCKUP layer (не участвует в art-export) */}
          <Layer listening={false}>
            {side === "front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === "back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* WORK layer */}
          <Layer ref={workLayerRef}>
            <Transformer
              ref={tRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            {/* crop overlay */}
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
