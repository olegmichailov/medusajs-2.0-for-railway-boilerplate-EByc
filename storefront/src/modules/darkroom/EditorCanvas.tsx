"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer, Group, Line } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

// Базовый размер полотна (под эти png сделаны мокапы)
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"|"eraser"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType; orderKey: number }

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers, mobileSheetOpen
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
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [order, setOrder] = useState(0)
  const [textValue, setTextValue] = useState("GMORKL")

  // mobile pinch state
  const pinch = useRef<{
    id: string
    d0: number
    a0: number
    cx: number
    cy: number
    sx: number
    sy: number
    rot: number
  } | null>(null)

  // Автомасштаб + приподнимаем мокап на мобилке (чтобы не конфликтовал с кнопкой Create)
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false
    return window.innerWidth < 768
  }, [])

  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padBottom = vw < 768 ? 220 : 120
    const padTop = vw < 768 ? 40 : 60
    const maxW = vw - (vw < 768 ? 24 : 440)
    const maxH = vh - padTop - padBottom
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers, mobileSheetOpen])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // видимость слоёв по side
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // Transformer / drag
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    // Хендлы — всегда, drag только в Move/Crop
    const canDragNow = tool === "move" || tool === "crop"
    ;(n as any).draggable(canDragNow)
    trRef.current.nodes([n])
    trRef.current.keepRatio(true)
    trRef.current.rotateEnabled(true)
    trRef.current.anchorSize(isMobile ? 16 : 12)
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, tool, isDrawing, isCropping])

  // ===== Stroke sessions =====
  const activeStrokeId = useRef<{ front: string|null; back: string|null }>({ front: null, back: null })
  useEffect(() => {
    if (tool !== "brush") activeStrokeId.current[side] = null
  }, [tool, side])

  const ensureTopZ = () => {
    const inSide = layers.filter(l => l.side === side).sort((a,b)=>a.orderKey-b.orderKey)
    inSide.forEach((l, i) => (l.node as any).zIndex(i))
    drawLayerRef.current?.batchDraw()
  }
  const pushLayer = (l: AnyLayer) => {
    setLayers(prev => {
      const next = [...prev, l]
      requestAnimationFrame(ensureTopZ)
      return next
    })
  }
  const ensureStrokeGroup = () => {
    const current = activeStrokeId.current[side]
    if (current) {
      const lay = layers.find(l => l.id === current)
      if (lay) return lay
    }
    const g = new Konva.Group({ x: 0, y: 0, listening: true })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    const layer: AnyLayer = { id, side, node: g, meta, type: "strokes", orderKey: order + 1 }
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(g)
    activeStrokeId.current[side] = id
    pushLayer(layer)
    return layer
  }

  // ===== Upload image =====
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.85)/img.width, (BASE_H*0.85)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, draggable: true })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        const layer: AnyLayer = { id, side, node: kimg, meta, type: "image", orderKey: order + 1 }
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        setOrder(o => o + 1)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        pushLayer(layer)
        select(id)
        set({ tool: "move" }) // сразу двигаем/масштабируем
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ===== Text =====
  const onAddText = () => {
    const t = new Konva.Text({
      text: textValue || "GMORKL",
      x: BASE_W/2-240, y: BASE_H/2-48,
      fontSize: 96, fontFamily: "Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif",
      fontStyle: "bold",
      fill: brushColor, width: 480, align: "center",
      draggable: true,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    const layer: AnyLayer = { id, side, node: t, meta, type: "text", orderKey: order + 1 }
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    pushLayer(layer)
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ===== Shapes (только через UI) =====
  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 180, fill: brushColor, draggable: true })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-180, y: BASE_H/2-180, width: 360, height: 360, fill: brushColor, draggable: true })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 220, fill: brushColor, draggable: true })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-180,y:BASE_H/2-180, draggable: true}); g.add(new Konva.Rect({width:360,height:70,y:145,fill:brushColor})); g.add(new Konva.Rect({width:70,height:360,x:145,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-220, BASE_H/2, BASE_W/2+220, BASE_H/2], stroke: brushColor, strokeWidth: 18, lineCap: "round", draggable: true })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    const layer: AnyLayer = { id, side, node: n, meta, type: "shape", orderKey: order + 1 }
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    pushLayer(layer)
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ===== Brush / Erase =====
  const startStroke = (x: number, y: number, absX: number, absY: number) => {
    // Если Erase и выбран слой — рисуем в overlay eraser
    if (tool === "erase") {
      let targetId = selectedId
      if (!targetId) {
        // если не выбран — найдём верхний видимый под курсором
        const top = topLayerAt(absX, absY)
        if (top) targetId = top.id
      }
      if (targetId) {
        const erId = `eraser:${targetId}`
        let er = layers.find(l => l.id === erId)
        if (!er) {
          const g = new Konva.Group({ x: 0, y: 0, listening: true })
          ;(g as any).id(erId)
          const meta = baseMeta(`eraser for ${targetId}`)
          ;(g as any).globalCompositeOperation = "destination-out"
          const base = layers.find(l => l.id === targetId)!
          const layer: AnyLayer = { id: erId, side, node: g, meta, type: "eraser", orderKey: base.orderKey + 0.1 }
          drawLayerRef.current?.add(g)
          pushLayer(layer)
          er = layer
        }
        const gnode = er.node as Konva.Group
        const line = new Konva.Line({
          points: [x, y],
          stroke: "#000",
          strokeWidth: brushSize,
          lineCap: "round",
          lineJoin: "round",
        })
        gnode.add(line)
        setIsDrawing(true)
        select(erId)
        return
      }
    }

    // обычная кисть
    const gLay = ensureStrokeGroup()
    const g = gLay.node as Konva.Group
    const line = new Konva.Line({
      points: [x, y],
      stroke: brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: "source-over",
    })
    g.add(line)
    setIsDrawing(true)
    select(gLay.id)
  }

  const appendStroke = (x: number, y: number) => {
    const lay = find(selectedId)
    const group =
      (lay?.type === "strokes" || lay?.type === "eraser")
        ? (lay.node as Konva.Group)
        : null
    if (!group) return
    const last = group.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  // ===== Crop =====
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current!
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

  // ===== Export =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Utils =====
  const stageToCanvas = (p: {x:number;y:number}) => ({ x: p.x / scale, y: p.y / scale })

  const topLayerAt = (absX: number, absY: number) => {
    // конверт из экранных координат в canvas
    const p = stageToCanvas({ x: absX, y: absY })
    const candidates = layers
      .filter(l => l.side === side && l.meta.visible && l.type !== "eraser")
      .sort((a,b)=> b.orderKey - a.orderKey) // сверху вниз
    for (const l of candidates) {
      const rect = l.node.getClientRect({ relativeTo: stageRef.current! })
      const rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height
      if (absX >= rx && absX <= rx+rw && absY >= ry && absY <= ry+rh) return l
    }
    return null
  }

  // ===== Pointer routing =====
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const onDown = (e: any) => {
    if (isCropping) return
    const tgt = e.target as Konva.Node
    const stPos = getPos()
    const p = stageToCanvas(stPos)

    if (tool==="brush" || tool==="erase") {
      // во время рисования фиксируем body scroll
      document.body.style.overflow = "hidden"
      startStroke(p.x, p.y, stPos.x, stPos.y)
      return
    }
  }
  const onMove = () => {
    if (isDrawing) {
      const st = getPos()
      const p = stageToCanvas(st)
      appendStroke(p.x, p.y)
    }
  }
  const onUp   = () => {
    if (isDrawing) {
      finishStroke()
      document.body.style.overflow = ""
    }
  }

  // ===== Multi-touch pinch/rotate on mobile =====
  useEffect(() => {
    if (!isMobile) return
    const stage = stageRef.current
    if (!stage) return

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length < 2) return
      const n = find(selectedId)?.node
      if (!n) return
      const t0 = ev.touches[0], t1 = ev.touches[1]
      const cx = (t0.clientX + t1.clientX) / 2
      const cy = (t0.clientY + t1.clientY) / 2
      const dx = t1.clientX - t0.clientX
      const dy = t1.clientY - t0.clientY
      const d0 = Math.hypot(dx, dy)
      const a0 = Math.atan2(dy, dx)

      pinch.current = {
        id: find(selectedId)!.id,
        d0,
        a0,
        cx,
        cy,
        sx: (n as any).scaleX?.() ?? 1,
        sy: (n as any).scaleY?.() ?? 1,
        rot: (n as any).rotation?.() ?? 0,
      }

      // запрещаем скролл
      document.body.style.overflow = "hidden"
    }

    const onTouchMove = (ev: TouchEvent) => {
      if (!pinch.current) return
      if (ev.touches.length < 2) return
      const lay = find(pinch.current.id)
      if (!lay) return
      const n = lay.node

      const t0 = ev.touches[0], t1 = ev.touches[1]
      const dx = t1.clientX - t0.clientX
      const dy = t1.clientY - t0.clientY
      const d1 = Math.hypot(dx, dy)
      const a1 = Math.atan2(dy, dx)

      const s = Math.max(0.2, Math.min(5, d1 / pinch.current.d0))
      const rot = pinch.current.rot + ((a1 - pinch.current.a0) * 180) / Math.PI

      // масштаб/поворот относительно центра самого узла
      const bbox = n.getClientRect({ relativeTo: stage })
      const ox = bbox.x + bbox.width / 2
      const oy = bbox.y + bbox.height / 2
      const local = (n as any).toLocal({ x: ox, y: oy }) // центр в локальных координатах
      ;(n as any).offsetX(local.x)
      ;(n as any).offsetY(local.y)

      ;(n as any).scaleX(pinch.current.sx * s)
      ;(n as any).scaleY(pinch.current.sy * s)
      ;(n as any).rotation(rot)
      n.getLayer()?.batchDraw()
    }

    const onTouchEnd = () => {
      pinch.current = null
      document.body.style.overflow = ""
    }

    const container = stage.container()
    container.addEventListener("touchstart", onTouchStart, { passive: true })
    container.addEventListener("touchmove", onTouchMove, { passive: false })
    container.addEventListener("touchend", onTouchEnd)
    container.addEventListener("touchcancel", onTouchEnd)

    return () => {
      container.removeEventListener("touchstart", onTouchStart)
      container.removeEventListener("touchmove", onTouchMove as any)
      container.removeEventListener("touchend", onTouchEnd)
      container.removeEventListener("touchcancel", onTouchEnd)
    }
  }, [isMobile, selectedId, layers])

  // ===== Layers API for panels =====
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.orderKey - b.orderKey)
      .reverse()
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
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      ;(l.node as any).opacity(meta.opacity)
      ;(l.node as any).globalCompositeOperation = meta.blend
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id: string) => select(id)
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }) }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = (src.node as any).clone()
    clone.x((src.node as any).x()+20); clone.y((src.node as any).y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type, orderKey: order + 1 }
    setOrder(o=>o+1)
    pushLayer(newLay); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)

      const orderTopToBottom = current
        .sort((a,b)=> a.orderKey - b.orderKey)
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { l.orderKey = i + 1; (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  // ===== Render =====
  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden" style={{ overscrollBehavior: "contain" }}>
      {/* Desktop floating tools & layers */}
      {!isMobile && (
        <>
          <Toolbar
            side={side} setSide={(s)=>set({ side: s })}
            tool={tool} setTool={(t)=>set({ tool: t as Tool })}
            brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
            brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
            textValue={textValue} setTextValue={setTextValue}
            shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
            onUploadImage={onUploadImage}
            onAddText={onAddText}
            onAddShape={addShape}
            startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
            onDownloadFront={()=>downloadBoth("front")}
            onDownloadBack={()=>downloadBoth("back")}
            toggleLayers={toggleLayers}
            layersOpen={showLayers}
            isMobile={false}
            mobileOpen={false}
            openMobile={()=>{}}
            closeMobile={()=>{}}
            mobileLayers={{
              items: [],
              onSelect: ()=>{},
              onToggleVisible: ()=>{},
              onToggleLock: ()=>{},
              onDelete: ()=>{},
              onDuplicate: ()=>{},
              onChangeBlend: ()=>{},
              onChangeOpacity: ()=>{},
            }}
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
              onReorder={onReorder}
              onChangeBlend={(id, blend)=>updateMeta(id,{ blend: blend as Blend })}
              onChangeOpacity={(id, opacity)=>updateMeta(id,{ opacity })}
            />
          )}
        </>
      )}

      {/* Stage */}
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
            <Transformer ref={trRef} rotateEnabled anchorSize={isMobile ? 16 : 12} borderStroke="black" anchorStroke="black" anchorFill="white" />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={12} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>

      {/* Mobile toolbar as bottom sheet */}
      {isMobile && (
        <Toolbar
          side={side} setSide={(s)=>set({ side: s })}
          tool={tool} setTool={(t)=>set({ tool: t as Tool })}
          brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
          brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
          textValue={textValue} setTextValue={setTextValue}
          shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
          onUploadImage={onUploadImage}
          onAddText={onAddText}
          onAddShape={addShape}
          startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
          onDownloadFront={()=>downloadBoth("front")}
          onDownloadBack={()=>downloadBoth("back")}
          toggleLayers={()=>{}} // на мобилке — в шторке
          layersOpen={false}
          isMobile
          mobileOpen={mobileSheetOpen}
          openMobile={()=>set({ mobileSheetOpen: true })}
          closeMobile={()=>set({ mobileSheetOpen: false })}
          mobileLayers={{
            items: layerItems,
            onSelect: onLayerSelect,
            onToggleVisible,
            onToggleLock,
            onDelete,
            onDuplicate,
            onChangeBlend: (id, blend)=>updateMeta(id,{ blend: blend as Blend }),
            onChangeOpacity: (id, opacity)=>updateMeta(id,{ opacity }),
          }}
        />
      )}
    </div>
  )
}
