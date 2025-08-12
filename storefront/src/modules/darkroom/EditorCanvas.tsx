// ПОЛНЫЙ ФАЙЛ
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

  // стабильный вьюпорт
  const getVH = () => (typeof window !== "undefined" && window.visualViewport?.height) ? window.visualViewport!.height : (typeof window !== "undefined" ? window.innerHeight : 900)
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = getVH()
    const bottomPad = isMobile ? 140 : 40
    const topPad    = isMobile ? 100 : 40
    const maxW = vw - (isMobile ? 24 : 440)
    const maxH = vh - (topPad + bottomPad)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  useLockBodyScroll(mobileOpen)

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // нормализация трансформа
  const normalizeTransform = (target: AnyNode) => {
    const t = target as any
    const sx = t.scaleX?.() ?? 1
    const sy = t.scaleY?.() ?? 1
    try {
      if (t instanceof Konva.Image || t instanceof Konva.Rect) {
        t.width(t.width() * sx)
        t.height(t.height() * sy)
      } else if (t instanceof Konva.Circle) {
        t.radius(t.radius() * Math.max(sx, sy))
      } else if (t instanceof Konva.RegularPolygon) {
        t.radius(t.radius() * Math.max(sx, sy))
      } else if (t instanceof Konva.Line) {
        const pts: number[] = t.points()
        const scaled = pts.map((v: number, i: number) => (i % 2 === 0 ? v * sx : v * sy))
        t.points(scaled)
        t.strokeWidth(t.strokeWidth() * ((sx + sy) / 2))
      } else if (t instanceof Konva.Group) {
        // группам оставляем scale — безопаснее
      }
      t.scaleX?.(1); t.scaleY?.(1)
      t.getLayer()?.batchDraw()
    } catch { /* безопасно глотаем */ }
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n: AnyNode | undefined = lay?.node
    const disabled =
      isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current ||
      tool === "brush" || tool === "erase"

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).listening(true)
    ;(n as any).draggable(true)
    ;(n as any).off(".__tfix")
    ;(n as any).on("transformend.__tfix", () => normalizeTransform(n))

    trRef.current.nodes([n])
    trRef.current.rotationEnabled(true)
    trRef.current.enabledAnchors([
      "top-left","top-center","top-right",
      "middle-left","middle-right",
      "bottom-left","bottom-center","bottom-right",
    ])
    trRef.current.ignoreStroke(false)
    trRef.current.flipEnabled(true)
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // хоткеи (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId) as any
      if (!n) return
      if (tool === "brush" || tool === "erase" || tool === "crop") return

      const arrows = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"]
      if (arrows.includes(e.key)) e.preventDefault()

      const step = e.shiftKey ? 20 : 2
      if (e.key === "ArrowLeft")  n.x(n.x()-step)
      if (e.key === "ArrowRight") n.x(n.x()+step)
      if (e.key === "ArrowUp")    n.y(n.y()-step)
      if (e.key === "ArrowDown")  n.y(n.y()+step)
      if (arrows.includes(e.key)) n.getLayer()?.batchDraw()

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        const clone = n.clone()
        clone.x(n.x()+20); clone.y(n.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const srcLay = find(selectedId)!
        const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: srcLay.side, meta: { ...srcLay.meta, name: srcLay.meta.name+" copy" }, type: srcLay.type }
        setLayers(p=>[...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw()
      }

      if (e.key==="Backspace"||e.key==="Delete") {
        setLayers(p=>{ const l=p.find(x=>x.id===selectedId); l?.node.destroy(); return p.filter(x=>x.id!==selectedId) })
        select(null); drawLayerRef.current?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey as any, { capture: true } as any)
  }, [selectedId, tool])

  // pinch/rotate (mobile)
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    let lastDist = 0
    let lastAngle = 0
    let target: any = null

    const onTouchStart = (e: TouchEvent) => {
      if (tool === "brush" || tool === "erase" || tool === "crop") return
      if (e.touches.length < 2) return
      target = node(selectedId)
      lastDist = 0; lastAngle = 0
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!target) return
      if (e.touches.length < 2) return
      e.preventDefault()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      if (!lastDist) lastDist = dist
      if (!lastAngle) lastAngle = angle
      const scaleBy = dist / lastDist
      const deltaAngle = angle - lastAngle
      try {
        target.scaleX(target.scaleX() * scaleBy)
        target.scaleY(target.scaleY() * scaleBy)
        target.rotation(target.rotation() + (deltaAngle * 180) / Math.PI)
        target.getLayer()?.batchDraw()
      } catch {}
      lastDist = dist
      lastAngle = angle
    }
    const onTouchEnd = () => {
      if (target) normalizeTransform(target)
      target = null; lastDist = 0; lastAngle = 0
    }

    const c = st.container()
    c.addEventListener("touchstart", onTouchStart, { passive: false })
    c.addEventListener("touchmove", onTouchMove, { passive: false })
    c.addEventListener("touchend", onTouchEnd, { passive: false })
    return () => {
      c.removeEventListener("touchstart", onTouchStart as any)
      c.removeEventListener("touchmove", onTouchMove as any)
      c.removeEventListener("touchend", onTouchEnd as any)
    }
  }, [selectedId, tool])

  // brush session сверху
  const ensureStrokesGroupOnTop = useCallback(() => {
    if (activeBrushSessionId) {
      const exist = layers.find(l => l.id === activeBrushSessionId)
      if (exist) return exist
    }
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    beginBrushSession(id)
    requestAnimationFrame(() => {
      (g as any).zIndex((drawLayerRef.current?.getChildren().length || 1) - 1)
      drawLayerRef.current?.batchDraw()
    })
    return newLay
  }, [activeBrushSessionId, layers, side, seqs.strokes, beginBrushSession])

  useEffect(() => {
    if (tool !== "brush" && tool !== "erase") endBrushSession()
    else {
      const ex = ensureStrokesGroupOnTop()
      if (ex) {
        beginBrushSession(ex.id)
        ;(ex.node as any).zIndex((drawLayerRef.current?.getChildren().length || 1) - 1)
        drawLayerRef.current?.batchDraw()
      }
    }
  }, [tool]) // eslint-disable-line

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

  // brush/erase
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

  // crop
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    set({ tool: "crop" as any })
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st! })
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
    const rx = abs.x / s - (n as any).x()
    const ry = abs.y / s - (n as any).y()
    const rw = r.width() / s
    const rh = r.height() / s
    ;(n as any).crop({ x: rx, y: ry, width: rw, height: rh })
    ;(n as any).width(rw); (n as any).height(rh)
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
    await new Promise(r => setTimeout(r, 400))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") {
      startStroke(p.x/scale, p.y/scale)
      return
    }
    const tgt = e.target as Konva.Node
    if (tgt && tgt !== stageRef.current) select(String((tgt as any)._id))
    else select(null)
  }
  const onMove = () => { if (!isCropping && isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

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
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)
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

  const stageStyle: React.CSSProperties = { touchAction: "none", background: "transparent" }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
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
        selectedKind={(find(selectedId)?.type ?? null) as any}
        selectedProps={(find(selectedId)?.type === "text")
          ? { text: ((find(selectedId)?.node as any)?.text?.() ?? ""),
              fontSize: ((find(selectedId)?.node as any)?.fontSize?.() ?? 64),
              fontFamily: ((find(selectedId)?.node as any)?.fontFamily?.() ?? "Inter, system-ui, -apple-system, sans-serif"),
              fill: ((find(selectedId)?.node as any)?.fill?.() ?? "#000000"), }
          : (find(selectedId)?.type === "shape")
          ? { fill: ((find(selectedId)?.node as any)?.fill?.() ?? "#000000"),
              stroke: ((find(selectedId)?.node as any)?.stroke?.() ?? "#000000"),
              strokeWidth: ((find(selectedId)?.node as any)?.strokeWidth?.() ?? 0), }
          : {}
        }
        setSelectedFill={(hex:string)=>{ const sel=node(selectedId) as any; if (sel?.fill) { sel.fill(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStroke={(hex:string)=>{ const sel=node(selectedId) as any; if (sel?.stroke) { sel.stroke(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStrokeW={(w:number)=>{ const sel=node(selectedId) as any; if (sel?.strokeWidth) { sel.strokeWidth(w); drawLayerRef.current?.batchDraw() }}}
        setSelectedText={(t:string)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.text(t); drawLayerRef.current?.batchDraw() }}
        setSelectedFontSize={(n:number)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.fontSize(n); drawLayerRef.current?.batchDraw() }}
        setSelectedFontFamily={(name:string)=>{ const sel=node(selectedId) as Konva.Text; if (!sel) return; sel.fontFamily(name); drawLayerRef.current?.batchDraw() }}
        setSelectedColor={(hex:string)=>{ const sel=node(selectedId) as any; if (!sel) return; if (sel.fill) sel.fill(hex); else if (sel.stroke) sel.stroke(hex); drawLayerRef.current?.batchDraw() }}
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

      {!isMobile && showLayers && (
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
