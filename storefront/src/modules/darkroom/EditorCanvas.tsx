// storefront/src/modules/darkroom/EditorCanvas.tsx
"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Макет мокапа (рабочее поле) =====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ===== Утилиты =====
const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isImageNode   = (n: AnyNode): n is Konva.Image => n instanceof Konva.Image
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // Ссылки на слои/узлы
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
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef = useRef<Tool | null>(null)

  // ===== Фикс хедера: контейнер под хедером, хедер на всю ширину =====
  const [headerH, setHeaderH] = useState(0)
  useEffect(() => {
    const hdr = (document.querySelector("header") ||
      document.querySelector<HTMLElement>("[role=banner]") ||
      document.querySelector<HTMLElement>("[data-site-header]")) as HTMLElement | null
    const measure = () => setHeaderH(hdr ? Math.round(hdr.getBoundingClientRect().height) : (isMobile ? 8 : 64))
    measure()
    const ro = hdr ? new ResizeObserver(measure) : null
    if (hdr && ro) ro.observe(hdr)
    window.addEventListener("resize", measure)
    return () => {
      window.removeEventListener("resize", measure)
      ro?.disconnect()
    }
  }, [])

  // ===== Вёрстка/масштаб под окно =====
  const { viewW, viewH, scale, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padBottom = isMobile ? 120 : 72
    const maxW = vw - 24
    const maxH = Math.max(240, vh - headerH - padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padBottom }
  }, [headerH, showLayers])

  // ===== Отключаем нативные жесты браузера над канвой (важно для iOS) =====
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const el = st.container()
    const prevent = (e: Event) => e.preventDefault()
    el.style.touchAction = "none"
    ;(el.style as any).msTouchAction = "none"
    el.style.webkitUserSelect = "none"
    el.style.userSelect = "none"
    el.addEventListener("touchstart", prevent, { passive: false })
    el.addEventListener("touchmove",  prevent, { passive: false })
    el.addEventListener("touchend",   prevent, { passive: false })
    el.addEventListener("gesturestart", prevent as any, { passive: false } as any)
    el.addEventListener("gesturechange", prevent as any, { passive: false } as any)
    el.addEventListener("gestureend", prevent as any, { passive: false } as any)
    return () => {
      el.removeEventListener("touchstart", prevent)
      el.removeEventListener("touchmove",  prevent)
      el.removeEventListener("touchend",   prevent)
      el.removeEventListener("gesturestart", prevent as any)
      el.removeEventListener("gesturechange", prevent as any)
      el.removeEventListener("gestureend", prevent as any)
    }
  }, [])

  // ===== helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // Показ только активной стороны
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // Трансформер включён только в Move (кроме strokes/locked/crop)
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || tool === "brush" || tool === "erase" || isCropping
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(true)
    trRef.current?.nodes([n])
    trRef.current?.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side, isCropping])
  useEffect(() => { attachTransformer() }, [tool])

  // Горячие клавиши (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault(); duplicateLayer(lay.id); return
      }
      if (e.key==="Backspace"||e.key==="Delete") {
        e.preventDefault(); deleteLayer(lay.id); return
      }
      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== Stroke-сессии =====
  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    g.zIndex(drawLayerRef.current!.children.length - 1)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  // Вход в Brush — новая сессия, убираем трансформер
  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      createStrokeGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    lastToolRef.current = tool
  }, [tool, side])

  // ===== Загрузка изображения =====
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
        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ===== Текст =====
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMURKUL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96, fontFamily: "Grebetika, Helvetica, Arial, sans-serif",
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Shapes =====
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Erase как маска выделенного слоя =====
  const ensureWrappedForErase = (l: AnyLayer): Konva.Group => {
    const n = l.node
    if (n.getParent() !== drawLayerRef.current) {
      return n.getParent() as Konva.Group
    }
    const g = new Konva.Group({
      x: (n as any).x?.() ?? 0, y: (n as any).y?.() ?? 0,
      rotation: (n as any).rotation?.() ?? 0,
      scaleX: (n as any).scaleX?.() ?? 1, scaleY: (n as any).scaleY?.() ?? 1
    })
    ;(g as any).id(uid())
    drawLayerRef.current!.add(g)
    ;(n as any).x?.(0); (n as any).y?.(0); (n as any).rotation?.(0)
    ;(n as any).scaleX?.(1); (n as any).scaleY?.(1)
    g.add(n as any)
    setLayers(p => p.map(it => it.id === l.id ? { ...it, node: g } : it))
    select(l.id)
    return g
  }

  // ===== Brush / Erase рисование =====
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      let gLay = gid ? find(gid) : null
      if (!gLay) gLay = createStrokeGroup()
      const g = gLay!.node as Konva.Group
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
    } else if (tool === "erase") {
      const sel = find(selectedId)
      if (!sel) return
      const g = ensureWrappedForErase(sel)
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const sel = find(selectedId)
      const g = sel ? (ensureWrappedForErase(sel)) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
    }
  }
  const finishStroke = () => setIsDrawing(false)

  // ===== Crop для изображения =====
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !isImageNode(n)) return
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
    if (!n || !isImageNode(n) || !r) { cancelCrop(); return }
    const s = scale
    const rx = r.x()/s - (n as any).x?.()
    const ry = r.y()/s - (n as any).y?.()
    const rw = r.width()/s
    const rh = r.height()/s
    ;(n as Konva.Image).crop({ x: rx, y: ry, width: rw, height: rh })
    ;(n as Konva.Image).width(rw)
    ;(n as Konva.Image).height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // ===== Скачивание (mockup + art) =====
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
    await new Promise(r => setTimeout(r, 320))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Перестановка слоёв (только текущая сторона) =====
  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      const orderTopToBottom = current
        .slice()
        .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev
      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(drawLayerRef.current!.children.length - 1)
    drawLayerRef.current?.batchDraw()
  }

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

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Свойства выбранного узла для Toolbar =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: sel.node.fontSize(),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); drawLayerRef.current?.batchDraw() }
  const setSelectedText       = (t:string)    => { const n = sel?.node as Konva.Text; if (!n) return; n.text(t); drawLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); drawLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); drawLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    drawLayerRef.current?.batchDraw()
  }

  // ===== ЖЕСТЫ (усиленная чувствительность, realtime) =====
  const PINCH_SENS = 1.15
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRot: number
    startPos: { x: number, y: number }
    centerStage: { x: number, y: number }
    nodeId: string | null
    lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({
    active:false, two:false, startDist:0, startAngle:0,
    startScaleX:1, startScaleY:1, startRot:0,
    startPos:{x:0,y:0}, centerStage:{x:0,y:0}, nodeId:null
  })

  const setStageFromEvt = (evt: any) => stageRef.current?.setPointersPositions(evt)
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })
  const clientToStage = (client: {x:number,y:number}) => {
    const st = stageRef.current!; const r = st.container().getBoundingClientRect()
    return { x: client.x - r.left, y: client.y - r.top }
  }

  const applyAround = (node: Konva.Node, stagePoint: { x:number; y:number }, newScale: number, newRotation: number) => {
    const tr = node.getAbsoluteTransform().copy()
    const inv = tr.invert()
    const local = inv.point(stagePoint)

    node.scaleX(newScale)
    node.scaleY(newScale)
    node.rotation(newRotation)

    const tr2 = node.getAbsoluteTransform().copy()
    const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x
    const dy = stagePoint.y - p2.y
    node.x((node as any).x?.() + dx)
    node.y((node as any).y?.() + dy)
  }

  const onDown = (e: any) => {
    setStageFromEvt(e.evt)
    e.evt?.preventDefault?.()
    if (isCropping) return

    const touches: TouchList | undefined = e.evt.touches

    // Рисуем
    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer())
      startStroke(p.x, p.y)
      return
    }

    // Move — 1 палец
    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node
      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }

      const lay = find(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        const p = getStagePointer()
        gestureRef.current = {
          ...gestureRef.current,
          active: true,
          two: false,
          nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(p),
          centerStage: p,
          startDist: 0, startAngle: 0,
          startScaleX: (lay.node as any).scaleX?.() ?? 1,
          startScaleY: (lay.node as any).scaleY?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0,
        }
      }
      return
    }

    // Move — 2 пальца
    if (touches && touches.length >= 2) {
      const lay = find(selectedId)
      if (!lay || isStrokeGroup(lay.node) || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }
      const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2
      const cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      const centerStage = clientToStage({ x: cx, y: cy })

      gestureRef.current = {
        active: true,
        two: true,
        nodeId: lay.id,
        startDist: Math.max(dist, 0.0001),
        startAngle: ang,
        startScaleX: (lay.node as any).scaleX?.() ?? 1,
        startScaleY: (lay.node as any).scaleY?.() ?? 1,
        startRot: (lay.node as any).rotation?.() ?? 0,
        startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
        centerStage,
        lastPointer: undefined,
      }

      trRef.current?.nodes([]) // прячем трансформер
      uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    setStageFromEvt(e.evt)
    if (isCropping) return
    const touches: TouchList | undefined = e.evt.touches

    // Рисуем
    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer())
      appendStroke(p.x, p.y)
      return
    }

    // Move — перетаскивание 1 пальцем
    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      drawLayerRef.current?.batchDraw()
      return
    }

    // Move — pinch+rotate 2 пальца (realtime, повышенная чувствительность)
    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }
      const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2
      const cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      let s = dist / Math.max(gestureRef.current.startDist, 0.0001)
      s = Math.pow(Math.min(Math.max(s, 0.1), 10), PINCH_SENS)
      const baseScale = gestureRef.current.startScaleX
      const newScale = baseScale * s
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)

      const centerStage = clientToStage({ x: cx, y: cy })
      applyAround(lay.node, centerStage, newScale, newRot)
      stageRef.current?.batchDraw()

      // Переинициализация «старта» — чтобы жест был абсолютно плавным
      gestureRef.current.startDist   = dist
      gestureRef.current.startAngle  = ang
      gestureRef.current.startScaleX = newScale
      gestureRef.current.startScaleY = newScale
      gestureRef.current.startRot    = newRot
      gestureRef.current.centerStage = centerStage
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    requestAnimationFrame(attachTransformer)
  }

  // ===== Данные для панелей =====
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

  // ===== Render =====
  return (
    // Контейнер «под хедером»: хедер остаётся наверху и на всю ширину
    <div
      className="fixed left-0 right-0 bottom-0"
      style={{
        top: headerH,
        paddingBottom: padBottom,
        background: "transparent",
        touchAction: "none",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Desktop Layers */}
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorder}
          onChangeBlend={(id, b)=>updateMeta(id,{ blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id,{ opacity: o })}
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
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
              anchorSize={12}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
              enabledAnchors={[
                "top-left","top-right","bottom-left","bottom-right",
                "middle-left","middle-right","top-center","bottom-center"
              ]}
            />
            {/* Crop UI */}
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>

      {/* Toolbar */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>updateMeta(id,{ blend: b as Blend }),
          onChangeOpacity: (id, o)=>updateMeta(id,{ opacity: o }),
          onMoveUp: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
