"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Rect } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"
import { isMobile } from "react-device-detect"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"
const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)

  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const activeStrokeSession = useRef<Record<Side, string | null>>({ front: null, back: null })

  // --- размеры сцены: мобильный чуть выше (больше нижний паддинг под Create)
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePads = isMobile ? 16 : 440
    const topPad   = isMobile ? 8 : 20
    const bottomPad= isMobile ? 160 : 80   // подняли мокап
    const maxW = vw - sidePads
    const maxH = vh - topPad - bottomPad
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // --- трансформер
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    if (!n || !trRef.current) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(tool === "move")
    trRef.current.nodes([n])
    trRef.current.rotationSnaps([0,90,180,270])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool])

  // --- хоткеи (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        const src = find(selectedId)!; const clone = src.node.clone()
        clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone); clone.moveToTop()
        const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw()
        return
      }
      if (e.key==="Backspace"||e.key==="Delete") {
        setLayers(p=>{ const l=p.find(x=>x.id===selectedId); l?.node.destroy(); return p.filter(x=>x.id!==selectedId) })
        select(null); drawLayerRef.current?.batchDraw(); return
      }
      if (tool === "move") {
        if (e.key === "ArrowLeft")  (n as any).x((n as any).x()-step)
        if (e.key === "ArrowRight") (n as any).x((n as any).x()+step)
        if (e.key === "ArrowUp")    (n as any).y((n as any).y()-step)
        if (e.key === "ArrowDown")  (n as any).y((n as any).y()+step)
        n.getLayer()?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // --- stroke-сессии
  const createStrokeGroup = (s: Side) => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const seq = layers.filter(l=>l.side===s && l.type==="strokes").length + 1
    const meta = baseMeta(`strokes ${seq}`)
    drawLayerRef.current?.add(g)
    g.moveToTop()
    const lay: AnyLayer = { id, side: s, node: g, meta, type: "strokes" }
    setLayers(p => [...p, lay])
    activeStrokeSession.current[s] = id
    return id
  }

  useEffect(() => {
    const isPaint = tool === "brush" || tool === "erase"
    if (!isPaint) {
      activeStrokeSession.current[side] = null
      return
    }
    if (!activeStrokeSession.current[side]) {
      createStrokeGroup(side)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, side])

  const startStroke = (x: number, y: number) => {
    let gId = activeStrokeSession.current[side]
    if (!gId) gId = createStrokeGroup(side)
    const gLay = layers.find(l => l.id === gId)?.node as Konva.Group | undefined
    if (!gLay) return
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    gLay.add(line)
    setIsDrawing(true)
  }
  const appendStroke = (x: number, y: number) => {
    const gId = activeStrokeSession.current[side]
    const gLay = layers.find(l => l.id === gId)?.node as Konva.Group | undefined
    if (!gLay) return
    const last = gLay.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)
  const commitStroke = () => { activeStrokeSession.current[side] = null }

  // --- создание объектов: поверх, завершить stroke, и СРАЗУ Move
  const switchToMove = () => set({ tool: "move" })
  const onUploadImage2 = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${layers.filter(l=>l.side===side && l.type==="image").length + 1}`)
        drawLayerRef.current?.add(kimg); kimg.moveToTop()
        const newLay: AnyLayer = { id, side, node: kimg, meta, type: "image" }
        setLayers(p => [...p, newLay]); select(id)
        drawLayerRef.current?.batchDraw()
        commitStroke()
        switchToMove()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-180, y: BASE_H/2-40,
      fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 360, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${layers.filter(l=>l.side===side && l.type==="text").length + 1}`)
    drawLayerRef.current?.add(t); t.moveToTop()
    const lay: AnyLayer = { id, side, node: t, meta, type: "text" }
    setLayers(p => [...p, lay]); select(id)
    drawLayerRef.current?.batchDraw()
    commitStroke()
    switchToMove()
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${layers.filter(l=>l.side===side && l.type==="shape").length + 1}`)
    drawLayerRef.current?.add(n as any); (n as any).moveToTop()
    const lay: AnyLayer = { id, side, node: n, meta, type: "shape" }
    setLayers(p => [...p, lay]); select(id)
    drawLayerRef.current?.batchDraw()
    commitStroke()
    switchToMove()
  }

  // --- кроп (как было)
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    const st = stageRef.current; if (!st) return
    const rect = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = node(selectedId)
    const r = cropRectRef.current
    if (!n || !(n instanceof Konva.Image) || !r) { cancelCrop(); return }
    const s = scale
    const rx = r.x()/s - (n as any).x(), ry = r.y()/s - (n as any).y()
    const rw = r.width()/s, rh = r.height()/s
    ;(n as Konva.Image).crop({ x: rx, y: ry, width: rw, height: rh })
    ;(n as Konva.Image).width(rw); (n as Konva.Image).height(rh)
    cancelCrop()
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // --- жесты pinch/rotate: вокруг СЕРЕДИНЫ ЖЕСТА, якорим центр
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const container = st.container()
    let lastD = 0
    let lastA = 0
    let pivot: { x: number; y: number } | null = null

    const toStage = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect()
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (tool !== "move") return
      const lay = find(selectedId)
      const n = lay?.node as any
      if (!n) return
      if (e.touches.length !== 2) return
      e.preventDefault()

      const [t1, t2] = [e.touches[0], e.touches[1]]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)

      const midClient = { x: (t1.clientX + t2.clientX)/2, y: (t1.clientY + t2.clientY)/2 }
      const mid = toStage(midClient.x, midClient.y)
      if (!pivot) pivot = mid

      // центр ДО
      const before = n.getClientRect({ relativeTo: st })
      const c0 = { x: before.x + before.width/2, y: before.y + before.height/2 }

      if (!lastD) { lastD = dist; lastA = angle; return }
      const scaleBy = dist / lastD
      const deltaA  = (angle - lastA) * 180 / Math.PI

      // пропорционально
      const sX = n.scaleX() || 1
      n.scaleX(sX * scaleBy)
      n.scaleY(sX * scaleBy)
      n.rotation((n.rotation() || 0) + deltaA)

      // после трансформа — прижимаем центр к pivot (середине пальцев)
      const after = n.getClientRect({ relativeTo: st })
      const c1 = { x: after.x + after.width/2, y: after.y + after.height/2 }
      n.x(n.x() + (pivot.x - c1.x))
      n.y(n.y() + (pivot.y - c1.y))

      lastD = dist
      lastA = angle
      n.getLayer()?.batchDraw()
    }

    const onTouchEnd = () => { lastD = 0; lastA = 0; pivot = null }
    container.addEventListener("touchmove", onTouchMove, { passive: false })
    container.addEventListener("touchend", onTouchEnd)
    container.addEventListener("touchcancel", onTouchEnd)
    return () => {
      container.removeEventListener("touchmove", onTouchMove as any)
      container.removeEventListener("touchend", onTouchEnd)
      container.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [tool, selectedId, layers, scale])

  // --- ввод
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (tool==="brush" || tool==="erase") {
      const p = getPos()
      startStroke(p.x/scale, p.y/scale)
    }
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // --- список слоёв
  const visibleSideItems = React.useMemo(() => {
    const arr = layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
    return arr.map<LayerItem>(l => ({
      id: l.id, name: l.meta.name, type: l.type,
      visible: l.meta.visible, locked: l.meta.locked,
      blend: l.meta.blend, opacity: l.meta.opacity,
    }))
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
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone); clone.moveToTop()
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  const reorderBetween = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers(prev => {
      const current = prev.filter(l => l.side === side).sort((a,b)=>a.node.zIndex()-b.node.zIndex()) // bottom..top
      const others  = prev.filter(l => l.side !== side)
      const top = [...current].reverse() // top..bottom
      const s = top.findIndex(l=>l.id===srcId)
      const d = top.findIndex(l=>l.id===destId)
      if (s === -1 || d === -1) return prev
      const arr = [...top]; const [src] = arr.splice(s,1)
      const idx = Math.max(0, Math.min(arr.length, place === "before" ? d : d + 1))
      arr.splice(idx, 0, src)
      const bottomToTop = arr.reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()
      return [...others, ...bottomToTop]
    })
    requestAnimationFrame(attachTransformer)
  }

  // блокируем прокрутку страницы в редакторе
  useEffect(() => {
    const body = document.body
    const prev = body.style.overflow
    body.style.overflow = "hidden"
    return () => { body.style.overflow = prev }
  }, [])

  useEffect(() => { attachTransformer() }, [tool])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden pb-28 md:pb-0">
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage2}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop} cancelCrop={cancelCrop} isCropping={false}
        onDownloadFront={()=>{}} onDownloadBack={()=>{}}
        toggleLayers={toggleLayers} layersOpen={showLayers}
        selectedKind={find(selectedId)?.type ?? null} selectedProps={{}}
        setSelectedFill={()=>{}} setSelectedStroke={()=>{}} setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}} setSelectedFontSize={()=>{}} setSelectedFontFamily={()=>{}} setSelectedColor={()=>{}}
        mobileLayers={{
          items: visibleSideItems,
          selectedId,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onReorderDrag: reorderBetween,
        }}
      />

      {/* Desktop Layers */}
      {!isMobile && showLayers && (
        <LayersPanel
          items={visibleSideItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={reorderBetween}
          onChangeBlend={(id,blend)=>updateMeta(id,{blend:blend as Blend})}
          onChangeOpacity={(id,op)=>updateMeta(id,{opacity:op})}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black" anchorStroke="black" anchorFill="white"
              enabledAnchors={["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right","top-center","bottom-center"]}
            />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
