"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group as KGroup, Text as KText, Path } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, type Blend, type ShapeKind, type Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = {
  blend: Blend
  opacity: number
  name: string
  visible: boolean
  locked: boolean
}
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type LayerItem = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const tRef = useRef<Konva.Transformer>(null)

  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTfRef   = useRef<Konva.Transformer>(null)
  const [isCropping, setIsCropping] = useState(false)

  const [layers, setLayers] = useState<LayerItem[]>([])
  const strokeGroupId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const [isDrawing, setIsDrawing] = useState(false)

  // responsive viewport
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePanel = showLayers ? 340 : 0
    const maxW = vw - PADDING*2 - sidePanel
    const maxH = vh - PADDING*2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W*s, viewH: BASE_H*s, scale: s }
  }, [showLayers])

  // helper lookups
  const byId = (id: string | null) => id ? (layers.find(l => l.id === id) ?? null) : null
  const nodeById = (id: string | null) => byId(id)?.node ?? null

  // visibility per side
  useEffect(() => {
    layers.forEach(l => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
  }, [side, layers])

  // transformer attach
  const canDrag = (t: string) => !["brush","erase","crop"].includes(t)
  const attachTransformer = () => {
    const lay = byId(selectedId)
    const n = lay?.node
    if (!n || lay?.meta.locked || isDrawing || isCropping) {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
      return
    }
    n.draggable(canDrag(tool))
    tRef.current?.nodes([n])
    tRef.current?.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // apply meta
  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    // Konva exposes setter as a function:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(node as any).globalCompositeOperation(meta.blend)
  }

  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over",
    opacity: 1,
    name,
    visible: true,
    locked: false
  })

  // ===== strokes logic =====
  const ensureStrokeGroup = (): LayerItem => {
    const existingId = strokeGroupId.current[side]
    if (existingId) {
      const found = byId(existingId)
      if (found) return found
    }
    const g = new KGroup({ x: 0, y: 0, draggable: canDrag(tool) })
    // @ts-expect-error
    g.id(uid())
    const meta = baseMeta("strokes")
    applyMeta(g, meta)
    drawLayerRef.current?.add(g)
    const item: LayerItem = { id: (g as any)._id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, item])
    strokeGroupId.current[side] = item.id
    return item
  }

  // when tool changes away from brush -> next time create new strokes group
  useEffect(() => {
    if (!["brush","erase"].includes(tool)) {
      strokeGroupId.current[side] = null
    }
  }, [tool, side])

  const startStroke = (x:number, y:number) => {
    const group = ensureStrokeGroup()
    const line = new Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
      listening: false,
    })
    ;(group.node as KGroup).add(line)
    drawLayerRef.current?.batchDraw()
    setIsDrawing(true)
  }
  const appendStroke = (x:number, y:number) => {
    const group = byId(strokeGroupId.current[side]!)
    if (!group) return
    const last = (group.node as KGroup).children[(group.node as KGroup).children.length - 1] as Line
    if (!last) return
    last.points([...last.points(), x, y])
    drawLayerRef.current?.batchDraw()
  }
  const endStroke = () => {
    setIsDrawing(false)
    // select the group after finishing
    const g = strokeGroupId.current[side]
    if (g) select(g)
  }

  // ===== shapes / text / image =====
  const addShape = (kind: ShapeKind) => {
    let node: AnyNode
    const c = brushColor
    switch (kind) {
      case "circle":
        node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: c })
        break
      case "square":
        node = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: c })
        break
      case "triangle":
        node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 190, fill: c })
        break
      case "line":
        node = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: c, strokeWidth: 12, lineCap:"round" })
        break
      case "cross": {
        const g = new KGroup({ x: BASE_W/2-160, y: BASE_H/2-160 })
        const t = 60
        g.add(new Konva.Rect({ width: 320, height: t, y: 160 - t/2, fill: c }))
        g.add(new Konva.Rect({ width: t, height: 320, x: 160 - t/2, fill: c }))
        node = g
        break
      }
      case "star":
        node = new Konva.Star({ x: BASE_W/2, y: BASE_H/2, numPoints: 5, innerRadius: 70, outerRadius: 160, fill: c })
        break
      case "heart":
        node = new Path({
          x: BASE_W/2-160, y: BASE_H/2-150, scaleX: 1.2, scaleY: 1.2, fill: c,
          data: "M170,30 C130,-10 60,-10 20,30 C-40,90 60,170 170,260 C280,170 380,90 320,30 C280,-10 210,-10 170,30 Z"
        })
        break
      default:
        return
    }
    ;(node as any).id(uid())
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    node.draggable(canDrag(tool))
    drawLayerRef.current?.add(node as any)
    node.on("click tap", () => select((node as any)._id))
    const item: LayerItem = { id: (node as any)._id, side, node, meta, type: "shape" }
    setLayers(p => [...p, item])
    select(item.id)
    drawLayerRef.current?.batchDraw()
  }

  const onAddText = (initial = "Your text") => {
    const node = new KText({
      text: initial,
      x: BASE_W/2-150,
      y: BASE_H/2-40,
      width: 300,
      fontSize: 64,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor,
      align: "center"
    })
    ;(node as any).id(uid())
    const meta = baseMeta("text")
    applyMeta(node, meta)
    node.draggable(canDrag(tool))
    drawLayerRef.current?.add(node)
    node.on("click tap", () => select((node as any)._id))
    const item: LayerItem = { id: (node as any)._id, side, node, meta, type: "text" }
    setLayers(p => [...p, item])
    select(item.id)
    drawLayerRef.current?.batchDraw()
  }

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const max = Math.min(BASE_W, BASE_H) * 0.8
        let { width, height } = img
        if (width > max || height > max) {
          const s = Math.min(max/width, max/height)
          width *= s; height *= s
        }
        const node = new Konva.Image({
          image: img, width, height,
          x: BASE_W/2 - width/2, y: BASE_H/2 - height/2,
        })
        ;(node as any).id(uid())
        const meta = baseMeta("image")
        applyMeta(node, meta)
        node.draggable(canDrag(tool))
        drawLayerRef.current?.add(node)
        node.on("click tap", () => select((node as any)._id))
        const item: LayerItem = { id: (node as any)._id, side, node, meta, type: "image" }
        setLayers(p => [...p, item])
        select(item.id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // reflect brush color into selected text/shape quickly
  useEffect(() => {
    const lay = byId(selectedId); if (!lay) return
    if (lay.type === "text") { (lay.node as KText).fill(brushColor); drawLayerRef.current?.batchDraw() }
    if (lay.type === "shape") {
      // @ts-expect-error
      if (lay.node.fill) (lay.node as any).fill(brushColor)
      else if (lay.node instanceof Konva.Line) (lay.node as Konva.Line).stroke(brushColor)
      drawLayerRef.current?.batchDraw()
    }
  }, [brushColor])

  // ===== crop =====
  const startCrop = () => {
    const n = nodeById(selectedId); if (!n) return
    setIsCropping(true)
    const b = n.getClientRect({ relativeTo: stageRef.current! })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    tRef.current?.nodes([])
    drawLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = nodeById(selectedId); const rect = cropRectRef.current
    if (!n || !rect) { setIsCropping(false); return }
    const s = scale
    const rx = rect.x()/s - n.x()
    const ry = rect.y()/s - n.y()
    const rw = rect.width()/s
    const rh = rect.height()/s

    if (n instanceof Konva.Image) {
      n.crop({ x: rx, y: ry, width: rw, height: rh })
      n.width(rw); n.height(rh)
    } else {
      const g = new KGroup({ x: n.x(), y: n.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      drawLayerRef.current?.add(g)
      n.moveTo(g); n.position({ x: 0, y: 0 })
      const li = byId(selectedId)!
      li.node = g
      applyMeta(g, li.meta)
      select((g as any)._id)
    }
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    drawLayerRef.current?.batchDraw()
  }

  // ===== export (two files: with mock & art-only) =====
  const exportSide = async (s: Side) => {
    const st = stageRef.current!; if (!st) return
    const pr = 1 / st.scaleX()

    // 1) with mock
    const hiddenOther = layers.filter(l => l.side !== s)
    hiddenOther.forEach(l => l.node.visible(false))
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) art-only (hide mock image layer)
    hiddenOther.forEach(l => l.node.visible(false))
    const mockWasVisible: boolean[] = []
    // mock layer is the first layer of background <Layer listening={false}> — we just hide that layer by overlay rectangle trick:
    // simplest: temporarily draw the artwork alone from drawLayerRef
    const dl = drawLayerRef.current!
    const dataNoMock = dl.toDataURL({ pixelRatio: pr })

    // restore
    hiddenOther.forEach(l => l.node.visible(l.meta.visible))
    st.draw()

    // download two files
    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}-mock.png`; a1.click()
    const a2 = document.createElement("a"); a2.href = dataNoMock; a2.download = `darkroom-${s}-art.png`; a2.click()
  }

  // ===== pointer
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool === "brush" || tool === "erase") startStroke(p.x/scale, p.y/scale)
    else if (tool === "text") onAddText()
    else if (tool === "shape") addShape(shapeKind)
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x/scale, p.y/scale)
  }
  const onUp = () => { if (isDrawing) endStroke() }

  // ===== layers panel data =====
  const layerItems = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .map(l => ({
        id: l.id,
        type: l.type,
        name: l.type === "strokes" ? "strokes" : l.meta.name,
        visible: l.meta.visible,
        locked: l.meta.locked,
        blend: l.meta.blend,
        opacity: l.meta.opacity
      }))
  }, [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const next = { ...l.meta, ...patch }
      l.meta = next
      applyMeta(l.node, next)
      l.node.visible(next.visible && l.side === side)
      return { ...l }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onReorder = (dragId: string, overId: string) => {
    if (dragId === overId) return
    const a = byId(dragId)!, b = byId(overId)!
    const aIdx = a.node.zIndex()
    const bIdx = b.node.zIndex()
    if (aIdx < bIdx) {
      for (let i=aIdx;i<bIdx;i++) a.node.moveUp()
    } else {
      for (let i=aIdx;i>bIdx;i--) a.node.moveDown()
    }
    drawLayerRef.current?.batchDraw()
  }

  const onDelete = (id: string) => {
    const l = byId(id); if (!l) return
    l.node.destroy()
    setLayers(prev => prev.filter(x => x.id !== id))
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }

  const onDuplicate = (id: string) => {
    const src = byId(id)!; const clone = src.node.clone()
    ;(clone as any).id(uid())
    clone.x(src.node.x()+20); clone.y(src.node.y()+20)
    drawLayerRef.current?.add(clone)
    const meta = { ...src.meta, name: src.meta.name + " copy" }
    applyMeta(clone, meta)
    const item: LayerItem = { id: (clone as any)._id, side: src.side, node: clone, meta, type: src.type }
    setLayers(p => [...p, item])
    select(item.id)
    drawLayerRef.current?.batchDraw()
  }

  // text editing from toolbar
  const setTextContent = (v: string) => {
    const l = byId(selectedId)
    if (!l || l.type !== "text") return
    ;(l.node as KText).text(v)
    drawLayerRef.current?.batchDraw()
  }
  const setTextFont = (family: string) => {
    const l = byId(selectedId)
    if (!l || l.type !== "text") return
    ;(l.node as KText).fontFamily(family)
    drawLayerRef.current?.batchDraw()
  }
  const setTextSize = (n: number) => {
    const l = byId(selectedId)
    if (!l || l.type !== "text") return
    ;(l.node as KText).fontSize(n)
    drawLayerRef.current?.batchDraw()
  }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        // tools
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={()=>onAddText()}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>exportSide("front")}
        onDownloadBack={()=>exportSide("back")}
        toggleLayers={toggleLayers} layersOpen={showLayers}
        // selected text props
        selectedId={selectedId}
        selectedIsText={byId(selectedId)?.type === "text"}
        setTextContent={setTextContent}
        setTextFont={setTextFont}
        setTextSize={setTextSize}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id)=>select(id)}
          onToggleVisible={(id)=> {
            const l = byId(id)!; updateMeta(id, { visible: !l.meta.visible })
          }}
          onToggleLock={(id)=> {
            const l = byId(id)!; updateMeta(id, { locked: !l.meta.locked })
          }}
          onBlendChange={(id, blend)=> updateMeta(id, { blend })}
          onOpacityChange={(id, v)=> updateMeta(id, { opacity: v })}
          onReorder={onReorder}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
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
          {/* Mock-up (background only, not part of artwork export) */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H}/>}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H}/>}
          </Layer>

          {/* Work layer */}
          <Layer ref={drawLayerRef}>
            <Transformer
              ref={tRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            {/* Crop overlay */}
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable fillEnabled={false}/>
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black"/>
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
