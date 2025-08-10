"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

// базовая геометрия (hi-res)
const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; raster: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: "image"|"shape"|"text"|"stroke" }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const contentLayerRef = useRef<Konva.Layer>(null)
  const tRef     = useRef<Konva.Transformer>(null)
  const cropRect = useRef<Konva.Rect>(null)
  const cropTf   = useRef<Konva.Transformer>(null)
  const textareaRef = useRef<HTMLTextAreaElement|null>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)

  // Автоскейл под окно и правую панель
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const layersW = showLayers ? 320 : 0
    const maxW = vw - PADDING * 2 - layersW
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // активные (видимые) слои текущей стороны
  const visLayers = useMemo(()=> layers.filter(l=>l.side===side && l.meta.visible), [layers, side])

  const findLayer = (id: string | null) => id ? layers.find(l=>l.id===id) || null : null
  const findNode = (id: string | null) => findLayer(id)?.node || null

  // прикладная мета и фильтры
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
    node.getLayer()?.batchDraw()
  }
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false })

  // ——— Transformer: видим только при MOVE и не в режиме рисования
  const attachTransformer = () => {
    const node = findNode(selectedId)
    const shouldHide = !node || isDrawing || isCropping || tool==="brush" || tool==="erase"
    if (shouldHide) {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
      return
    }
    // drag разрешаем только выбранному и не locked
    const locked = !!findLayer(selectedId!)?.meta.locked
    ;(node as any).draggable(tool==="move" && !locked)
    tRef.current?.nodes([node])
    tRef.current?.getLayer()?.batchDraw()
  }
  useEffect(()=>{ attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // ——— Shortcuts (минимум для продуктивности)
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if ((e.key==="Delete"||e.key==="Backspace") && selectedId) {
        e.preventDefault()
        onDelete(selectedId)
        return
      }
      const node = findNode(selectedId)
      if (!node) return
      const step = e.shiftKey ? 10 : 1
      if (e.key==="ArrowLeft")  { e.preventDefault(); node.x(node.x()-step); node.getLayer()?.batchDraw() }
      if (e.key==="ArrowRight") { e.preventDefault(); node.x(node.x()+step); node.getLayer()?.batchDraw() }
      if (e.key==="ArrowUp")    { e.preventDefault(); node.y(node.y()-step); node.getLayer()?.batchDraw() }
      if (e.key==="ArrowDown")  { e.preventDefault(); node.y(node.y()+step); node.getLayer()?.batchDraw() }
      if (e.key==="]") { node.moveUp(); node.getLayer()?.batchDraw() }
      if (e.key==="[") { node.moveDown(); node.getLayer()?.batchDraw() }
    }
    window.addEventListener("keydown", onKey)
    return ()=>window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side])

  // ——— helpers
  const pushNode = (node: AnyNode, meta: BaseMeta, type: AnyLayer["type"]) => {
    const id = (node as any)._id as string
    contentLayerRef.current?.add(node)
    contentLayerRef.current?.batchDraw()
    setLayers(p=>[...p, { id, side, node, meta, type }])
    select(id)
    set({ tool: "move" }) // после создания — в режим перемещения
  }

  // ——— Upload image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        // адекватный размер
        const maxSize = Math.min(BASE_W, BASE_H) * 0.8
        let w = img.width, h = img.height
        if (w>maxSize || h>maxSize) { const k = Math.min(maxSize/w, maxSize/h); w*=k; h*=k }
        const node = new Konva.Image({ image: img, x: BASE_W/2 - w/2, y: BASE_H/2 - h/2, width: w, height: h })
        ;(node as any).id(uid())
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        node.on("click tap", ()=>select((node as any)._id))
        pushNode(node, meta, "image")
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ——— Text (inline)
  const openInlineEditor = (txt: Konva.Text) => {
    const stage = stageRef.current; if (!stage) return
    closeInlineEditor()
    const area = document.createElement("textarea")
    const rect = stage.container().getBoundingClientRect()
    const abs = txt.getAbsolutePosition(stage)
    Object.assign(area.style, {
      position: "absolute",
      top: `${abs.y * scale + rect.top}px`,
      left: `${abs.x * scale + rect.left}px`,
      width: `${Math.max(txt.width()*scale, 220)}px`,
      fontSize: `${txt.fontSize()*scale}px`,
      fontFamily: txt.fontFamily(),
      lineHeight: "1.2",
      color: String(txt.fill()),
      padding: "6px 8px",
      border: "1px solid #000",
      background: "rgba(255,255,255,0.95)",
      zIndex: "1000",
      outline: "none",
      resize: "none"
    } as CSSStyleDeclaration)
    area.value = txt.text()
    document.body.appendChild(area)
    area.focus()
    const commit = () => {
      txt.text(area.value ?? "")
      txt.getLayer()?.batchDraw()
      closeInlineEditor()
    }
    area.addEventListener("keydown", (e)=>{
      e.stopPropagation()
      if ((e.key==="Enter" && !e.shiftKey) || e.key==="Escape") { e.preventDefault(); commit() }
    })
    area.addEventListener("blur", commit)
    textareaRef.current = area
  }
  const closeInlineEditor = () => {
    textareaRef.current?.remove()
    textareaRef.current = null
  }

  const onAddText = () => {
    const node = new Konva.Text({
      text: "Type…",
      x: BASE_W/2-160, y: BASE_H/2-28,
      fontSize: 56, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 320, align: "center"
    })
    ;(node as any).id(uid())
    node.on("dblclick dbltap", ()=> openInlineEditor(node))
    node.on("click tap", ()=>select((node as any)._id))
    const meta = baseMeta("Text")
    applyMeta(node, meta)
    pushNode(node, meta, "text")
    setTimeout(()=>openInlineEditor(node), 50)
  }

  // ——— Shapes
  const addShape = (kind: ShapeKind) => {
    let node: any
    const s = 140
    if (kind==="circle")   node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: s, fill: brushColor })
    if (kind==="square")   node = new Konva.Rect({ x: BASE_W/2-s, y: BASE_H/2-s, width: s*2, height: s*2, fill: brushColor })
    if (kind==="triangle") node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: s*1.2, fill: brushColor })
    if (kind==="cross") {
      node = new Konva.Group({ x: BASE_W/2-s, y: BASE_H/2-s })
      const t = s*0.35
      node.add(new Konva.Rect({ width:s*2, height:t, y:s-t/2, fill: brushColor }))
      node.add(new Konva.Rect({ width:t, height:s*2, x:s-t/2, fill: brushColor }))
    }
    if (kind==="line")     node = new Konva.Line({ points:[BASE_W/2-s, BASE_H/2, BASE_W/2+s, BASE_H/2], stroke: brushColor, strokeWidth: 8, lineCap:"round" })
    ;(node as any).id(uid())
    node.on("click tap", ()=>select((node as any)._id))
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    pushNode(node, meta, "shape")
  }

  // ——— Brush / Erase (одна «сессия» = один слой)
  const startStroke = (x:number,y:number) => {
    const line = new Konva.Line({
      points: [x,y],
      stroke: tool==="erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool==="erase" ? "destination-out" : "source-over",
      tension: 0.4,
    })
    ;(line as any).id(uid())
    line.on("click tap", ()=>select((line as any)._id))
    const meta = baseMeta("Stroke")
    pushNode(line, meta, "stroke")
    setIsDrawing(true)
  }
  const appendStroke = (x:number,y:number) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    node.points(node.points().concat([x,y]))
    node.getLayer()?.batchDraw()
  }
  const finishStroke = () => { setIsDrawing(false) }

  // ——— Crop
  const startCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    setIsCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRect.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropRect.current?.getLayer()?.batchDraw()
    cropTf.current?.nodes([cropRect.current!])
  }
  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRect.current
    if (!node || !rect) { setIsCropping(false); return }
    const s = scale
    const rx = rect.x()/s - node.x()
    const ry = rect.y()/s - node.y()
    const rw = rect.width()/s
    const rh = rect.height()/s

    if (node instanceof Konva.Image) {
      node.crop({ x: rx, y: ry, width: rw, height: rh })
      node.width(rw); node.height(rh)
      node.getLayer()?.batchDraw()
    } else {
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      node.x(0); node.y(0)
      const parent = node.getParent()
      parent?.add(g); node.moveTo(g); g.cache(); g.draw()
    }
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    setIsCropping(false)
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    cropRect.current?.getLayer()?.batchDraw()
  }

  // ——— Export (в полном размере)
  const exportSide = (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = 1 / st.scaleX() // компенсируем масштаб
    const hidden: AnyLayer[] = []
    layers.forEach(l => { if (l.side!==s) { l.node.visible(false); hidden.push(l) } })
    st.draw()
    const data = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    hidden.forEach(l => l.node.visible(l.meta.visible))
    st.draw()
    const a = document.createElement("a")
    a.href = data; a.download = `darkroom-${s}.png`; a.click()
  }

  // ——— Pointer routing
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e:any) => {
    if (isCropping || textareaRef.current) return
    // правый клик — игнор
    if (e.evt && e.evt.button===2) return
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

  // ——— Мобайл: блокируем скролл во время рисования
  useEffect(()=>{
    const prevent = (e: TouchEvent) => { if (tool==="brush"||tool==="erase") e.preventDefault() }
    document.addEventListener("touchmove", prevent, { passive: false })
    return ()=>document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  // ——— Список для панели
  const layerItems = useMemo(()=> layers
    .filter(l=>l.side===side)
    .map(l=>({ id:l.id, name:l.meta.name, type:l.type, visible:l.meta.visible, locked:l.meta.locked })), [layers, side])

  const updateMeta = (id:string, patch: Partial<BaseMeta>) => {
    setLayers(p=>p.map(l=> l.id===id ? (applyMeta(l.node, {...l.meta, ...patch}), {...l, meta:{...l.meta, ...patch}}) : l))
  }
  const onLayerSelect = (id:string)=> select(id)
  const onToggleVisible = (id:string)=> {
    const l = layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible })
    l.node.visible(!l.meta.visible); l.node.getLayer()?.batchDraw()
  }
  const onToggleLock = (id:string)=> {
    const l = layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked })
    ;(l.node as any).locked = !l.meta.locked
    attachTransformer()
  }
  const onDelete = (id:string)=> { 
    const lay = layers.find(l=>l.id===id)
    lay?.node.destroy()
    contentLayerRef.current?.batchDraw()
    setLayers(p=>p.filter(l=>l.id!==id))
    if (selectedId===id) select(null)
  }
  const duplicateSelected = () => {
    if (!selectedId) return
    const src = layers.find(l=>l.id===selectedId)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    clone.on("click tap", ()=>select((clone as any)._id))
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    contentLayerRef.current?.add(clone)
    contentLayerRef.current?.batchDraw()
    setLayers(p=>[...p, newLay]); select(newLay.id)
  }
  const onMoveUp = (id:string)=> { 
    const node = layers.find(l=>l.id===id)?.node; node?.moveUp(); node?.getLayer()?.batchDraw()
    // синхронизируем массив
    setLayers(p=>{
      const a=[...p]; const i=a.findIndex(x=>x.id===id); if(i<0||i===a.length-1) return p
      const t=a[i]; a[i]=a[i+1]; a[i+1]=t; return a
    })
  }
  const onMoveDown = (id:string)=> { 
    const node = layers.find(l=>l.id===id)?.node; node?.moveDown(); node?.getLayer()?.batchDraw()
    setLayers(p=>{
      const a=[...p]; const i=a.findIndex(x=>x.id===id); if(i<=0) return p
      const t=a[i]; a[i]=a[i-1]; a[i-1]=t; return a
    })
  }

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
          onDuplicate={duplicateSelected}
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
          {/* Макеты */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H}/>}
            {side==="back"  && backMock  && <KImage image={backMock} width={BASE_W} height={BASE_H}/>}
          </Layer>

          {/* Контент (императивные Konva-ноды) */}
          <Layer ref={contentLayerRef} />

          {/* UI-слой: трансформер + crop */}
          <Layer>
            <Transformer
              ref={tRef}
              rotateEnabled={true}
              anchorSize={12}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            <Rect ref={cropRect} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTf} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
