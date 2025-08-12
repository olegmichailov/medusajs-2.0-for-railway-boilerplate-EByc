"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
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

// — маленький хук, чтобы гасить скролл, когда открыта мобильная шторка
const useLockBodyScroll = (locked: boolean) => {
  useEffect(() => {
    const el = document.documentElement
    const prev = el.style.overflow
    if (locked) el.style.overflow = "hidden"
    return () => { el.style.overflow = prev }
  }, [locked])
}

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, mobileOpen, openMobile, closeMobile,
    activeBrushSessionId, beginBrushSession, endBrushSession
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const containerRef = useRef<HTMLDivElement>(null)
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

  // — размеры холста: на мобилке оставляем место под «Create», Stage не прыгает
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 900
    const bottomPad = isMobile ? 140 : 40
    const topPad    = isMobile ? 120 : 40
    const maxW = vw - (isMobile ? 24 : 440)               // справа под Layers на десктопе
    const maxH = vh - (topPad + bottomPad)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // гасим прокрутку, когда открыта шторка на мобилке
  useLockBodyScroll(mobileOpen)

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // — применяем метаданные слоя к узлу
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // — Transformer/drag: активен только вне Brush/Eraser/Crop и не locked
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current || tool === "brush" || tool === "erase"
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(true)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // — горячие клавиши (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!stageRef.current) return
      const activeTool = tool
      // brush/erase — не двигаем, рисуем
      if (activeTool === "brush" || activeTool === "erase") return

      const n = node(selectedId)
      const isArrow = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)
      if (isArrow) e.preventDefault()

      if (n) {
        const step = e.shiftKey ? 20 : 2
        if (e.key === "ArrowLeft")  { n.x(n.x()-step) }
        if (e.key === "ArrowRight") { n.x(n.x()+step) }
        if (e.key === "ArrowUp")    { n.y(n.y()-step) }
        if (e.key === "ArrowDown")  { n.y(n.y()+step) }
        n.getLayer()?.batchDraw()
      }

      // duplicate
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d" && n) {
        e.preventDefault()
        const src = find(selectedId)!; const clone = src.node.clone()
        clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw()
      }

      // delete
      if (e.key==="Backspace"||e.key==="Delete") {
        setLayers(p=>{ const l=p.find(x=>x.id===selectedId); l?.node.destroy(); return p.filter(x=>x.id!==selectedId) })
        select(null); drawLayerRef.current?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true } as any)
  }, [selectedId, tool])

  // — Pinch/rotate для выделенного узла (только move/shape/text/image)
  useEffect(() => {
    const st = stageRef.current
    if (!st) return

    let lastDist = 0
    let lastAngle = 0
    let target: AnyNode | null = null

    const getTouch = () => st.getPointerPosition()
    const getTouches = () => (st as any).getContent().ownerDocument?.touches

    const handleStart = () => {
      if (tool === "brush" || tool === "erase" || tool === "crop") return
      target = node(selectedId)
    }

    const handleMove = (e: any) => {
      if (!target) return
      const touches = e.evt.touches
      if (!touches || touches.length < 2) return

      const [t1, t2] = [touches[0], touches[1]]
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX)

      if (!lastDist) lastDist = dist
      if (!lastAngle) lastAngle = angle

      const scaleBy = dist / lastDist
      const deltaAngle = angle - lastAngle

      const k = target as any
      k.scaleX(k.scaleX() * scaleBy)
      k.scaleY(k.scaleY() * scaleBy)
      k.rotation(k.rotation() + (deltaAngle * 180) / Math.PI)

      lastDist = dist
      lastAngle = angle
      k.getLayer()?.batchDraw()
      e.evt.preventDefault()
    }

    const handleEnd = () => {
      lastDist = 0; lastAngle = 0; target = null
    }

    st.on("touchstart", handleStart)
    st.on("touchmove", handleMove)
    st.on("touchend", handleEnd)
    return () => {
      st.off("touchstart", handleStart)
      st.off("touchmove", handleMove)
      st.off("touchend", handleEnd)
    }
  }, [selectedId, tool])

  // — strokes group (одна «сессия» на время рисования)
  const ensureStrokesGroupOnTop = useCallback(() => {
    // если есть активная сессия — вернуть её
    if (activeBrushSessionId) {
      const exist = layers.find(l => l.id === activeBrushSessionId)
      if (exist) return exist
    }
    // иначе ищем последний по текущей стороне и типу
    const last = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    if (last) return last

    // вообще нет — создаём
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    beginBrushSession(id)
    // поднять наверх
    requestAnimationFrame(() => {
      (g as any).zIndex((drawLayerRef.current?.getChildren().length || 1) - 1)
      drawLayerRef.current?.batchDraw()
    })
    return newLay
  }, [activeBrushSessionId, layers, side, seqs.strokes, beginBrushSession])

  // при смене инструмента: закрыть сессию кисти
  useEffect(() => {
    if (tool !== "brush" && tool !== "erase") {
      endBrushSession()
    } else {
      // включили кисть — если нет активной сессии, создать поверх
      const ex = ensureStrokesGroupOnTop()
      if (!ex) return
      beginBrushSession(ex.id)
      ;(ex.node as any).zIndex((drawLayerRef.current?.getChildren().length || 1) - 1)
      drawLayerRef.current?.batchDraw()
    }
  }, [tool])

  // image upload
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, draggable: true })
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

  // text (двойной клик — inline)
  const inlineEdit = (t: Konva.Text) => {
    const st = stageRef.current; if (!st) return
    const rect = st.container().getBoundingClientRect()
    const pos = t.getAbsolutePosition(st)
    const area = document.createElement("textarea")
    area.value = t.text()
    Object.assign(area.style, {
      position: "fixed", left: `${rect.left + pos.x * scale}px`,
      top: `${rect.top + (pos.y - t.fontSize()) * scale}px`,
      width: `${Math.max(200, t.width() * scale)}px`,
      fontSize: `${t.fontSize() * scale}px`,
      fontFamily: t.fontFamily(), color: String(t.fill() || "#000"),
      lineHeight: "1.2", border: "1px solid #000", background: "white",
      padding: "2px", margin: "0", zIndex: "9999", resize: "none",
    } as CSSStyleDeclaration)
    document.body.appendChild(area)
    area.focus()
    const commit = () => { t.text(area.value); area.remove(); drawLayerRef.current?.batchDraw() }
    area.addEventListener("keydown", (e) => { if ((e.key==="Enter"&&!e.shiftKey)||e.key==="Escape"){ e.preventDefault(); commit() }})
    area.addEventListener("blur", commit)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-180, y: BASE_H/2-40,
      fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 360, align: "center", draggable: true
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

  // shapes — создаём ТОЛЬКО из UI:
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor, draggable: true })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor, draggable: true })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor, draggable: true })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160, draggable:true}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round", draggable: true })
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

  // brush / erase (всегда поверх, внутри активной сессии)
  const startStroke = (x: number, y: number) => {
    const sess = ensureStrokesGroupOnTop()
    const g = sess.node as Konva.Group
    beginBrushSession(sess.id)

    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    g.add(line)
    ;(g as any).zIndex((drawLayerRef.current?.getChildren().length || 1) - 1)
    drawLayerRef.current?.batchDraw()
    setIsDrawing(true)
  }
  const appendStroke = (x: number, y: number) => {
    const sess = layers.find(l => l.id === activeBrushSessionId)
    const g = sess?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    g.getLayer()?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // crop (images only) — исправлена математика со scale
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    set({ tool: "crop" as any })
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true, draggable: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = node(selectedId)
    const r = cropRectRef.current
    if (!n || !(n instanceof Konva.Image) || !r) { cancelCrop(); return }
    const s = scale
    const abs = r.getAbsolutePosition(stageRef.current!)
    const rx = abs.x / s - n.x()
    const ry = abs.y / s - n.y()
    const rw = r.width() / s
    const rh = r.height() / s
    n.crop({ x: rx, y: ry, width: rw, height: rh })
    n.width(rw); n.height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    set({ tool: "move" as any })
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    set({ tool: "move" as any })
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // экспорт
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    // 1) с мокапом
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) только арт
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 400))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // pointer routing
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") {
      // не двигаем, рисуем поверх
      startStroke(p.x/scale, p.y/scale)
      return
    }
    // выделение
    const tgt = e.target as Konva.Node
    if (tgt && tgt !== stageRef.current) {
      const id = (tgt as any)._id
      select(String(id))
    } else {
      select(null)
    }
  }
  const onMove = () => {
    if (isCropping) return
    if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) }
  }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // список слоёв для панелей
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side])

  // meta updates
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
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // REORDER: desktop drag&drop (только для текущей стороны)
  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)

      const orderTopToBottom = current
        .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(insertAt > orderTopToBottom.length ? orderTopToBottom.length : insertAt, 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { ;(l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend   = (id: string, blend: string) => updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) => updateMeta(id, { opacity })

  // — стили контейнера: Stage не двигается, жесты системы не мешают
  const stageStyle: React.CSSProperties = {
    touchAction: "none", // чтобы iOS не скроллил страницу во время рисования
    background: "transparent",
  }

  return (
    <div ref={containerRef} className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        // tools API
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k: ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={()=>set({ showLayers: !showLayers })}
        layersOpen={showLayers}
        mobileOpen={mobileOpen} openMobile={openMobile} closeMobile={closeMobile}

        // selected props (для панели свойств)
        selectedKind={(find(selectedId)?.type ?? null) as any}
        selectedProps={(find(selectedId)?.type === "text")
          ? {
              text: ((find(selectedId)?.node as any)?.text?.() ?? ""),
              fontSize: ((find(selectedId)?.node as any)?.fontSize?.() ?? 64),
              fontFamily: ((find(selectedId)?.node as any)?.fontFamily?.() ?? "Inter, system-ui, -apple-system, sans-serif"),
              fill: ((find(selectedId)?.node as any)?.fill?.() ?? "#000000"),
            }
          : (find(selectedId)?.type === "shape")
          ? {
              fill: ((find(selectedId)?.node as any)?.fill?.() ?? "#000000"),
              stroke: ((find(selectedId)?.node as any)?.stroke?.() ?? "#000000"),
              strokeWidth: ((find(selectedId)?.node as any)?.strokeWidth?.() ?? 0),
            }
          : {}
        }
        setSelectedFill={(hex:string)=>{ const sel=node(selectedId) as any; if (sel?.fill) { sel.fill(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStroke={(hex:string)=>{ const sel=node(selectedId) as any; if (sel?.stroke) { sel.stroke(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStrokeW={(w:number)=>{ const sel=node(selectedId) as any; if (sel?.strokeWidth) { sel.strokeWidth(w); drawLayerRef.current?.batchDraw() }}}
        setSelectedText={(t:string)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.text(t); drawLayerRef.current?.batchDraw() }}
        setSelectedFontSize={(n:number)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.fontSize(n); drawLayerRef.current?.batchDraw() }}
        setSelectedFontFamily={(name:string)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.fontFamily(name); drawLayerRef.current?.batchDraw() }}
        setSelectedColor={(hex:string)=>{ const sel=node(selectedId) as any; if (!sel) return; if (sel.fill) sel.fill(hex); else if (sel.stroke) sel.stroke(hex); drawLayerRef.current?.batchDraw() }}

        // mobile layers list
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend,
          onChangeOpacity,
        }}
      />

      {/* DESKTOP layers panel */}
      {showLayers && !isMobile && (
        <LayersPanel
          items={layerItems}
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

      {/* Stage */}
      <div className="absolute inset-0 flex items-center justify-center pt-4 md:pt-2 pb-[110px] md:pb-2">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          style={stageStyle}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
            <Transformer ref={trRef} rotateEnabled anchorSize={10} borderStroke="black" anchorStroke="black" anchorFill="white" />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
