"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

// ——— Hi-res полотно
const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = {
  blend: Blend
  opacity: number
  raster: number
  name: string
  visible: boolean
  locked: boolean
}
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: "image"|"shape"|"text"|"stroke" }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)   // <- рабочий слой
  const tRef         = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)

  // ——— Автоскейл
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePanel = !isMobile && showLayers ? 320 : 0
    const maxW = vw - PADDING * 2 - sidePanel
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // ——— Active per side + синхронизация видимости при смене стороны
  useEffect(() => {
    layers.forEach(l => {
      const shouldBeVisible = l.side === side && l.meta.visible
      l.node.visible(shouldBeVisible)
    })
    drawLayerRef.current?.batchDraw()
  }, [side, layers])

  const findNode = (id: string | null) =>
    id ? layers.find(l => l.id === id)?.node || null : null

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    if ((node as any).filters) {
      if (meta.raster > 0 && (Konva as any).Filters?.Pixelate) {
        (node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        (node as any).filters([])
      }
    }
  }

  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false
  })

  const attachTransformer = () => {
    const node = findNode(selectedId)
    if (node && tRef.current && !(node as any).locked) {
      tRef.current.nodes([node])
      tRef.current.getLayer()?.batchDraw()
    } else {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
    }
  }
  useEffect(()=>{ attachTransformer() }, [selectedId, layers, side])

  // ——— Shortcuts
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      if (!node) return
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        const clone = node.clone()
        clone.x(node.x()+20); clone.y(node.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const src = layers.find(l=>l.id===selectedId)!
        const meta = { ...src.meta, name: src.meta.name+" copy" }
        const id = (clone as any)._id
        setLayers(p=>[...p, { id, node: clone, side: src.side, meta, type: src.type }])
        select(id)
      } else if (e.key==="Delete"||e.key==="Backspace") {
        setLayers(p=>{
          const l = p.find(x=>x.id===selectedId)
          l?.node.destroy()
          return p.filter(x=>x.id!==selectedId)
        })
        select(null)
      } else if (e.key==="]") {
        node.moveUp(); node.getLayer()?.batchDraw()
      } else if (e.key==="[") {
        node.moveDown(); node.getLayer()?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey)
    return ()=>window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side])

  // ——— Upload image (добавляем в drawLayerRef)
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const node = new Konva.Image({
          image: img,
          x: BASE_W/2 - img.width/2,
          y: BASE_H/2 - img.height/2
        })
        node.width(img.width); node.height(img.height)
        ;(node as any).id(uid())
        node.listening(true)
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        drawLayerRef.current?.add(node)
        node.on("click tap", () => select((node as any)._id))
        const id = (node as any)._id
        setLayers(p=>[...p, { id, side, node, meta, type:"image"}])
        select(id)
        // НЕ переключаем инструмент
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ——— Text
  const onAddText = () => {
    const node = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-180, y: BASE_H/2-30,
      fontSize: 64,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor
    })
    ;(node as any).id(uid())
    node.listening(true)
    const meta = baseMeta("Text")
    applyMeta(node, meta)
    drawLayerRef.current?.add(node)
    node.on("click tap", () => select((node as any)._id))
    node.on("dblclick dbltap", ()=>{
      const t = prompt("Edit text:", (node as Konva.Text).text()) ?? (node as Konva.Text).text()
      ;(node as Konva.Text).text(t)
      drawLayerRef.current?.batchDraw()
    })
    const id = (node as any)._id
    setLayers(p=>[...p, { id, side, node, meta, type:"text"}])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ——— Shapes
  const addShape = (kind: ShapeKind) => {
    let node: AnyNode
    if (kind==="circle")   node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 180, fill: brushColor })
    else if (kind==="square")   node = new Konva.Rect({ x: BASE_W/2-180, y: BASE_H/2-180, width: 360, height:360, fill: brushColor })
    else if (kind==="triangle") node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 220, fill: brushColor })
    else if (kind==="cross") {
      const g = new Konva.Group({ x: BASE_W/2-180, y: BASE_H/2-180 })
      const r1 = new Konva.Rect({ width:360, height:70, y:145, fill: brushColor })
      const r2 = new Konva.Rect({ width:70, height:360, x:145, fill: brushColor })
      g.add(r1); g.add(r2)
      node = g
    } else { // line
      node = new Konva.Line({ points:[BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16 })
    }
    ;(node as any).id(uid())
    ;(node as any).listening(true)
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    drawLayerRef.current?.add(node as any)
    ;(node as any).on("click tap", () => select((node as any)._id))
    const id = (node as any)._id
    setLayers(p=>[...p, { id, side, node, meta, type:"shape"}])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ——— Brush / Erase
  const startStroke = (x:number,y:number) => {
    const line = new Konva.Line({
      points: [x,y],
      stroke: tool==="erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool==="erase" ? "destination-out" : "source-over",
    })
    ;(line as any).id(uid())
    line.listening(true)
    drawLayerRef.current?.add(line)
    line.on("click tap", () => select((line as any)._id))
    const meta = baseMeta("Stroke")
    const id = (line as any)._id
    setLayers(p=>[...p, { id, side, node: line, meta, type:"stroke"}])
    select(id)
    setIsDrawing(true)
    drawLayerRef.current?.batchDraw()
  }
  const appendStroke = (x:number,y:number) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    const pts = node.points().concat([x,y])
    node.points(pts)
    drawLayerRef.current?.batchDraw()
  }

  // ——— Crop
  const startCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    setIsCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    drawLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRectRef.current
    if (!node || !rect) { setIsCropping(false); return }
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
      node.x(0); node.y(0)
      node.moveTo(g)
      drawLayerRef.current?.add(g)
      g.add(node)
      g.cache()
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

  // ——— Export per side
  const exportSide = (s: Side) => {
    const st = stageRef.current; if (!st) return
    const oldScale = st.scaleX()
    st.scale({ x: 1, y: 1 })
    const hidden: AnyLayer[] = []
    layers.forEach(l=>{
      if (l.side !== s) { l.node.visible(false); hidden.push(l) }
    })
    st.draw()
    const data = st.toDataURL({ pixelRatio: 1, mimeType: "image/png" })
    hidden.forEach(l=> l.node.visible(l.meta.visible))
    st.scale({ x: oldScale, y: oldScale }); st.draw()

    const a = document.createElement("a")
    a.href = data; a.download = `darkroom-${s}.png`; a.click()
  }

  // ——— Pointer routing
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") startStroke(p.x/scale, p.y/scale)
    else if (tool==="text") onAddText()
    else if (tool==="shape") addShape(shapeKind)
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x/scale, p.y/scale)
  }
  const onUp = () => setIsDrawing(false)

  // ——— Блокируем скролл во время рисования (мобайл)
  useEffect(()=>{
    const prevent = (e: TouchEvent) => { if (tool==="brush"||tool==="erase") e.preventDefault() }
    document.addEventListener("touchmove", prevent, { passive: false })
    return ()=>document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  // ——— Список слоёв для панели
  const layerItems = useMemo(()=> layers
    .filter(l=>l.side===side)
    .map(l=>({ id:l.id, name:l.meta.name, type:l.type, visible:l.meta.visible, locked:l.meta.locked })), [layers, side])

  const updateMeta = (id:string, patch: Partial<BaseMeta>) => {
    setLayers(p=>p.map(l=>{
      if (l.id!==id) return l
      const nextMeta = { ...l.meta, ...patch }
      applyMeta(l.node, nextMeta)
      if (patch.visible !== undefined) l.node.visible(nextMeta.visible && l.side===side)
      return { ...l, meta: nextMeta }
    }))
    drawLayerRef.current?.batchDraw()
  }
  const onLayerSelect   = (id:string)=> select(id)
  const onToggleVisible = (id:string)=> {
    const l = layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible })
  }
  const onToggleLock    = (id:string)=> {
    const l = layers.find(x=>x.id===id)!; (l.node as any).locked = !l.meta.locked
    updateMeta(id, { locked: !l.meta.locked }); attachTransformer()
  }
  const onDelete        = (id:string)=> {
    setLayers(p=>{
      const l = p.find(x=>x.id===id); l?.node.destroy()
      return p.filter(x=>x.id!==id)
    })
    if (selectedId===id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const onDuplicate     = (id:string)=> {
    const src = layers.find(l=>l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p=>[...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }
  const onMoveUp        = (id:string)=> { const n = layers.find(l=>l.id===id)?.node; n?.moveUp(); drawLayerRef.current?.batchDraw() }
  const onMoveDown      = (id:string)=> { const n = layers.find(l=>l.id===id)?.node; n?.moveDown(); drawLayerRef.current?.batchDraw() }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      {/* Toolbar */}
      <Toolbar
        side={side}
        setSide={(s)=>set({ side: s })}
        tool={tool}
        setTool={(t)=>set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={()=>exportSide("front")}
        onDownloadBack={()=>exportSide("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
      />

      {/* Layers panel — десктоп */}
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

      {/* Stage */}
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
          {/* Mock-up слой */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H}/>}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H}/>}
          </Layer>

          {/* Рабочий слой */}
          <Layer ref={drawLayerRef}>
            <Transformer
              ref={tRef}
              rotateEnabled
              anchorSize={12}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            {/* Crop overlay */}
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
