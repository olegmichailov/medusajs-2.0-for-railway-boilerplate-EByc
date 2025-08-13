"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Rect } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

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
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

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

  // последние «сессии» штрихов по стороне — для логики «каждый раз новая сверху»
  const activeStrokeSession = useRef<Record<Side, string | null>>({ front: null, back: null })

  // авто-скейл сцены. На мобилке держим выше, чтобы не перекрывалось Create-кнопкой
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const bottomPad = vw <= 768 ? 140 : 80
    const topPad    = vw <= 768 ? 40  : 20
    const maxW = vw - (vw <= 768 ? 24 : 440)
    const maxH = vh - topPad - bottomPad
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  /** ---------- ВИДИМОСТЬ ТЕКУЩЕЙ СТОРОНЫ ---------- */
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  /** ---------- ТРАНСФОРМЕР / ВЫДЕЛЕНИЕ ---------- */
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    if (!n || !trRef.current) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    // двигаем только в режиме Move; но ручки трансформера видны всегда у выделенного
    ;(n as any).draggable(tool === "move")
    trRef.current.nodes([n])
    trRef.current.rotationSnaps([0, 90, 180, 270])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool])

  /** ---------- ХОТКЕИ (desktop) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        const src = find(selectedId)!; const clone = src.node.clone()
        clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw()
        return
      }
      if (e.key==="Backspace"||e.key==="Delete") {
        setLayers(p=>{ const l=p.find(x=>x.id===selectedId); l?.node.destroy(); return p.filter(x=>x.id!==selectedId) })
        select(null); drawLayerRef.current?.batchDraw(); return
      }

      if (tool === "move") {
        if (e.key === "ArrowLeft")  { n.x(n.x()-step) }
        if (e.key === "ArrowRight") { n.x(n.x()+step) }
        if (e.key === "ArrowUp")    { n.y(n.y()-step) }
        if (e.key === "ArrowDown")  { n.y(n.y()+step) }
        n.getLayer()?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  /** ---------- СЕССИИ ШТРИХОВ (каждый раз новая сверху) ---------- */
  const beginStrokeSession = () => {
    // новая группа = новая сессия
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${layers.filter(l=>l.side===side && l.type==="strokes").length + 1}`)
    drawLayerRef.current?.add(g)
    // Ставит СЕССИЮ НА ВЕРХ ВСЕГО
    g.moveToTop()
    const lay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, lay])
    activeStrokeSession.current[side] = id
    return g
  }

  const getOrCreateActiveStrokeGroup = (): Konva.Group => {
    const currentId = activeStrokeSession.current[side]
    const existing = layers.find(l => l.id === currentId && l.side === side && l.type === "strokes")
    if (existing) return existing.node as Konva.Group
    return beginStrokeSession()
  }

  /** ---------- КИСТЬ / СТИРАТЕЛЬ ---------- */
  const startStroke = (x: number, y: number) => {
    const g = getOrCreateActiveStrokeGroup()
    g.moveToTop() // рисуем всегда поверх всего
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
    const gId = activeStrokeSession.current[side]
    const gLay = layers.find(l => l.id === gId)?.node as Konva.Group | undefined
    if (!gLay) return
    const last = gLay.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  /** ---------- ИЗОБРАЖЕНИЯ (аплоад) — ВСЕГДА ВПЕРЕД ---------- */
  const onUploadImage = (file: File) => {
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
        drawLayerRef.current?.add(kimg)
        // КАРТИНКА — СРАЗУ НА ВЕРХ ВСЕГО (чтобы не была спрятана под штрихами)
        kimg.moveToTop()
        const newLay: AnyLayer = { id, side, node: kimg, meta, type: "image" }
        setLayers(p => [...p, newLay])
        select(id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  /** ---------- ТЕКСТ / ФИГУРЫ (через интерфейс) ---------- */
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
    drawLayerRef.current?.add(t)
    t.moveToTop()
    const lay: AnyLayer = { id, side, node: t, meta, type: "text" }
    setLayers(p => [...p, lay])
    select(id)
    drawLayerRef.current?.batchDraw()
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
    drawLayerRef.current?.add(n as any)
    ;(n as any).moveToTop()
    const lay: AnyLayer = { id, side, node: n, meta, type: "shape" }
    setLayers(p => [...p, lay])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  /** ---------- КРОП (безопасный) ---------- */
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    const st = stageRef.current; if (!st) return
    const rect = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({
      x: rect.x, y: rect.y, width: rect.width, height: rect.height, visible: true
    })
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
    cancelCrop()
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  /** ---------- ЖЕСТЫ (pinch/rotate) ТОЛЬКО В MOVE ---------- */
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const container = st.container()

    let lastD = 0
    let lastA = 0

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

      if (!lastD) { lastD = dist; lastA = angle; return }
      const scaleBy = dist / lastD
      const deltaA  = (angle - lastA) * 180 / Math.PI

      n.scaleX((n.scaleX() || 1) * scaleBy)
      n.scaleY((n.scaleY() || 1) * scaleBy)
      n.rotation((n.rotation() || 0) + deltaA)

      lastD = dist
      lastA = angle
      n.getLayer()?.batchDraw()
    }

    const reset = () => { lastD = 0; lastA = 0 }

    container.addEventListener("touchmove", onTouchMove, { passive: false })
    container.addEventListener("touchend", reset)
    container.addEventListener("touchcancel", reset)
    return () => {
      container.removeEventListener("touchmove", onTouchMove as any)
      container.removeEventListener("touchend", reset)
      container.removeEventListener("touchcancel", reset)
    }
  }, [tool, selectedId])

  /** ---------- РОУТИНГ ПО ИНПУТАМ МЫШИ/ТАЧА ---------- */
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    const tgt = e.target as Konva.Node
    const clickedEmpty = tgt === stageRef.current
    const p = getPos()

    if (tool==="brush" || tool==="erase") {
      // новая сессия кисти стартует автоматически при первом касании
      startStroke(p.x/scale, p.y/scale)
      return
    }

    if (tool === "move") {
      // выбор по тапу
      const shape = tgt as AnyNode
      const id = (shape as any)?._id
      if (id) select(id)
      return
    }
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  /** ---------- СПИСОК СЛОЁВ (и операции) ---------- */
  const visibleSideItems = useMemo<LayerItem[]>(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse() // top..bottom
      .map(l => ({
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

  const onReorder = (id: string, dir: "up" | "down") => {
    setLayers(prev => {
      const current = prev.filter(l => l.side === side).sort((a,b)=>a.node.zIndex()-b.node.zIndex())
      const others  = prev.filter(l => l.side !== side)

      const idx = current.findIndex(l=>l.id===id)
      if (idx === -1) return prev
      const swapWith = dir === "up" ? idx+1 : idx-1
      if (swapWith < 0 || swapWith >= current.length) return prev

      const arr = [...current]
      const tmp = arr[idx]; arr[idx] = arr[swapWith]; arr[swapWith] = tmp

      // переназначаем точные zIndex bottom..top
      arr.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      // Собираем обратно
      return [...others, ...arr]
    })
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend   = (id: string, blend: string) => updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) => updateMeta(id, { opacity })

  /** ---------- РЕНДЕР ---------- */
  useEffect(() => {
    // блокируем скролл под модалкой/кнопкой, чтобы макет не «ездил»
    const body = document.body
    const prev = body.style.overflow
    body.style.overflow = "hidden"
    return () => { body.style.overflow = prev }
  }, [])

  // выбранного узла всегда можно трансформировать (ручки), но перетаскивание — только в Move
  useEffect(() => { attachTransformer() }, [tool])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={false}
        onDownloadFront={()=>{/* опционально */}}
        onDownloadBack={()=>{/* опционально */}}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={{}}
        setSelectedFill={()=>{}}
        setSelectedStroke={()=>{}}
        setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}}
        setSelectedFontSize={()=>{}}
        setSelectedFontFamily={()=>{}}
        setSelectedColor={()=>{}}
        mobileLayers={{
          items: visibleSideItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onReorder,
        }}
      />

      {showLayers && (
        <LayersPanel
          items={visibleSideItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={onChangeBlend}
          onChangeOpacity={onChangeOpacity}
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
