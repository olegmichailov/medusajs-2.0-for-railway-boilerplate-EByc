"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; raster: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)   // мокап
  const drawLayerRef = useRef<Konva.Layer>(null)   // арт
  const uiLayerRef   = useRef<Konva.Layer>(null)   // трансформеры/оверлеи

  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // авто-скейл
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const maxW = vw - 440 // место под панели
    const maxH = vh - 200
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показать только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
    // raster пока не включаем — нестабильно
  }

  // ——— Transformer/Move
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    const canDragNow = !["brush","erase","crop"].includes(tool)
    ;(n as any).draggable(canDragNow)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // стрелки для точного позиционирования
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      if (e.key === "ArrowLeft")  { n.x(n.x() - step) }
      if (e.key === "ArrowRight") { n.x(n.x() + step) }
      if (e.key === "ArrowUp")    { n.y(n.y() - step) }
      if (e.key === "ArrowDown")  { n.y(n.y() + step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  // ——— helper: strokes-group для текущей стороны
  const ensureStrokesGroup = () => {
    // ищем последний strokes на этой стороне
    const exist = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    if (exist) return exist
    // создаём новый
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const idx = seqs.strokes
    const meta = baseMeta(`strokes ${idx}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    return newLay
  }

  // ——— Upload image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({
          image: img,
          x: BASE_W/2 - w/2,
          y: BASE_H/2 - h/2,
          width: w,
          height: h,
        })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ——— Text
  const inlineEdit = (t: Konva.Text) => {
    const st = stageRef.current; if (!st) return
    const rect = st.container().getBoundingClientRect()
    const pos = t.getAbsolutePosition(st)
    const area = document.createElement("textarea")
    area.value = t.text()
    Object.assign(area.style, {
      position: "fixed",
      left: `${rect.left + pos.x * scale}px`,
      top: `${rect.top + (pos.y - t.fontSize()) * scale}px`,
      width: `${Math.max(200, t.width() * scale)}px`,
      fontSize: `${t.fontSize() * scale}px`,
      fontFamily: t.fontFamily(),
      color: String(t.fill() || "#000"),
      lineHeight: "1.2",
      border: "1px solid #000",
      background: "white",
      padding: "2px",
      margin: "0",
      zIndex: "9999",
      resize: "none",
    } as CSSStyleDeclaration)
    document.body.appendChild(area)
    area.focus()
    const commit = () => {
      t.text(area.value)
      area.remove()
      drawLayerRef.current?.batchDraw()
    }
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit() }
      if (e.key === "Escape") { e.preventDefault(); commit() }
    })
    area.addEventListener("blur", commit)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2 - 180,
      y: BASE_H/2 - 40,
      fontSize: 64,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor,
      width: 360,
      align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => inlineEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ——— Shapes
  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")    n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")    n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")  n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W/2-160, y: BASE_H/2-160 })
      g.add(new Konva.Rect({ width: 320, height: 60, y: 130, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 320, x: 130, fill: brushColor }))
      n = g
    } else { // line
      n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    }
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ——— Brush / Erase → пишет отдельные Line внутрь общего strokes-Group
  const startStroke = (x: number, y: number) => {
    const g = ensureStrokesGroup().node as Konva.Group
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    g.add(line)
    setIsDrawing(true)
  }
  const appendStroke = (x: number, y: number) => {
    const gLay = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => {
    setIsDrawing(false)
  }

  // ——— Crop (только для Image; для прочих временно выключен)
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = node(selectedId)
    const r = cropRectRef.current
    if (!n || !(n instanceof Konva.Image) || !r) { cancelCrop(); return }
    const s = scale
    const rx = r.x()/s - n.x(), ry = r.y()/s - n.y()
    const rw = r.width()/s, rh = r.height()/s
    n.crop({ x: rx, y: ry, width: rw, height: rh })
    n.width(rw); n.height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // ——— Export: два PNG подряд (mockup + art)
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale)) // нормальное разрешение
    // прячем несоответствующую сторону
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    // 1) с мокапом
    bgLayerRef.current?.visible(true)
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) только арт (прозрачный)
    bgLayerRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // restore
    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    // две загрузки с небольшим интервалом — чтобы браузер не блочил
    const a1 = document.createElement("a")
    a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 400))
    const a2 = document.createElement("a")
    a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ——— pointer
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    if (isCropping) return
    const p = getPos()
    if (tool === "brush" || tool === "erase") {
      startStroke(p.x/scale, p.y/scale)
    } else if (tool === "text") {
      onAddText()
    } else if (tool === "shape") {
      addShape(shapeKind)
    }
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x/scale, p.y/scale)
  }
  const onUp = () => {
    if (isDrawing) finishStroke()
  }

  // ——— список в панель слоёв (верхний в списке — поверх)
  const layerItems = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked }))
  }, [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id: string) => select(id)
  const onToggleVisible = (id: string) => {
    const l = layers.find(x => x.id === id)!; updateMeta(id, { visible: !l.meta.visible })
  }
  const onToggleLock    = (id: string) => {
    const l = layers.find(x => x.id === id)!; (l.node as any).locked = !l.meta.locked
    updateMeta(id, { locked: !l.meta.locked }); attachTransformer()
  }
  const onDelete        = (id: string) => {
    setLayers(p => { const l = p.find(x => x.id === id); l?.node.destroy(); return p.filter(x => x.id !== id) })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id === id)!; const clone = src.node.clone()
    clone.x(src.node.x() + 20); clone.y(src.node.y() + 20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = {
      id: (clone as any)._id, node: clone, side: src.side,
      meta: { ...src.meta, name: src.meta.name + " copy" }, type: src.type
    }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }
  const onMoveUp        = (id: string) => { const n = layers.find(l => l.id === id)?.node; n?.moveUp();  drawLayerRef.current?.batchDraw() }
  const onMoveDown      = (id: string) => { const n = layers.find(l => l.id === id)?.node; n?.moveDown();drawLayerRef.current?.batchDraw() }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
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
          {/* 1. Мокап */}
          <Layer ref={bgLayerRef} listening={false}>
            {side === "front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === "back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* 2. Арт */}
          <Layer ref={drawLayerRef} />

          {/* 3. UI-оверлеи */}
          <Layer ref={uiLayerRef}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
