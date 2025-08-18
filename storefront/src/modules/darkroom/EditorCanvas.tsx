"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/* ===================== CONSTANTS ===================== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const HISTORY_LIMIT = 50

/* ===================== TYPES ===================== */
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

type SnapshotStroke = { points: number[]; color: string; width: number; mode: "paint" | "erase" }
type SnapItem =
  | { type: "image"; side: Side; meta: BaseMeta; x:number; y:number; w:number; h:number; rot:number; scale:number; src:string }
  | { type: "text";  side: Side; meta: BaseMeta; x:number; y:number; width:number; fs:number; family:string; style:string; fill:string; text:string; rot:number }
  | { type: "shape-rect"; side: Side; meta: BaseMeta; x:number; y:number; w:number; h:number; fill:string; rot:number; scale:number }
  | { type: "shape-circle"; side: Side; meta: BaseMeta; x:number; y:number; r:number; fill:string; rot:number; scale:number }
  | { type: "shape-triangle"; side: Side; meta: BaseMeta; x:number; y:number; r:number; fill:string; rot:number; scale:number }
  | { type: "shape-line"; side: Side; meta: BaseMeta; points:number[]; stroke:string; strokeWidth:number; rot:number }
  | { type: "strokes"; side: Side; meta: BaseMeta; strokes: SnapshotStroke[] }

const uid = () => Math.random().toString(36).slice(2)

/* ===================== HELPERS ===================== */
const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraserLine  = (n: Konva.Node) => (n as any)._isEraser === true
const isTextNode    = (n: AnyNode): n is Konva.Text => n instanceof Konva.Text

const siteFont = () =>
  (typeof window !== "undefined"
    ? window.getComputedStyle(document.body).fontFamily
    : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

/* ===================== COMPONENT ===================== */
export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // Cрисуемые мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // Основные refs
  const stageRef        = useRef<Konva.Stage>(null)
  const canvasLayerRef  = useRef<Konva.Layer>(null)         // 1 слой на сцене
  const uiLayerRef      = useRef<Konva.Layer>(null)          // UI: трансформер
  const trRef           = useRef<Konva.Transformer>(null)     // рамка трансформера

  // Фоны
  const frontBgRef      = useRef<Konva.Image>(null)
  const backBgRef       = useRef<Konva.Image>(null)

  // Группы «арт» на каждой стороне (внутри одного Layer)
  const artFrontRef     = useRef<Konva.Group>(null)
  const artBackRef      = useRef<Konva.Group>(null)

  // Состояния
  const [layers, setLayers] = useState<AnyLayer[]>([]) // только узлы из art-групп
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef = useRef<Tool | null>(null)
  const isTransformingRef = useRef(false)

  // История
  const history = useRef<{ past: SnapItem[][]; future: SnapItem[][] }>({ past: [], future: [] })

  // Вёрстка/масштаб
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 148 : 72
    const maxW = vw - 16
    // мобилка — даём больше высоты под мокап
    const maxH = vh - (padTop + padBottom) + (isMobile ? 60 : 0)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // Блокируем прокрутку/зум браузера жестами
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const prevent = (e: Event) => e.preventDefault()
    window.addEventListener("gesturestart", prevent as any, { passive: false })
    window.addEventListener("gesturechange", prevent as any, { passive: false })
    window.addEventListener("gestureend", prevent as any, { passive: false })
    window.addEventListener("touchmove", (e) => { if ((e as TouchEvent).scale !== 1) e.preventDefault() }, { passive: false })
    if (isMobile) set({ showLayers: false })
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("gesturestart", prevent as any)
      window.removeEventListener("gesturechange", prevent as any)
      window.removeEventListener("gestureend", prevent as any)
    }
  }, [set])

  /* --------------- helpers --------------- */
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }
  const groupForSide = (s: Side) => (s === "front" ? artFrontRef.current! : artBackRef.current!)
  const activeGroup = () => groupForSide(side)

  const findLayer = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const nodeById  = (id: string | null) => findLayer(id)?.node || null

  /* --------------- init art groups --------------- */
  useEffect(() => {
    // лениво создаём группы арт-контента
    if (!canvasLayerRef.current) return
    if (!artFrontRef.current) {
      const g = new Konva.Group()
      artFrontRef.current = g; canvasLayerRef.current.add(g); g.zIndex(2)
      ;(g as any)._isArt = true; g.cache()
    }
    if (!artBackRef.current) {
      const g = new Konva.Group()
      artBackRef.current = g; canvasLayerRef.current.add(g); g.zIndex(2)
      ;(g as any)._isArt = true; g.cache()
    }
  }, [])

  /* --------------- show only active side --------------- */
  useEffect(() => {
    const show = side === "front"
    frontBgRef.current?.visible(show)
    backBgRef.current?.visible(!show)
    artFrontRef.current?.visible(show)
    artBackRef.current?.visible(!show)
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side])

  /* --------------- Transformer attach --------------- */
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textStartRef  = useRef<{w:number; x:number; fs:number} | null>(null)

  const attachTransformer = () => {
    const lay = findLayer(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || tool !== "move"

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    ;(n as any).draggable(true)
    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)

    // guard на время трансформации
    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false; snapshotPush() }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const onStartTxt = () => {
        const t = n as Konva.Text
        textStartRef.current = { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
      }
      const clampW  = (val:number) => Math.max(TEXT_MIN_W,  Math.min(val, TEXT_MAX_W))
      const clampFS = (val:number) => Math.max(TEXT_MIN_FS, Math.min(val, TEXT_MAX_FS))

      let rafId: number | null = null
      const onTransform = () => {
        if (rafId) return
        rafId = requestAnimationFrame(() => {
          rafId = null
          const t = n as Konva.Text
          const st = textStartRef.current || { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
          const trInst = trRef.current
          const activeAnchor = (trInst && (trInst as any).getActiveAnchor?.()) as string | undefined

          if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
            const sx = Math.max(0.01, t.scaleX())
            const newW = clampW(st.w * sx)
            if (activeAnchor === "middle-left") {
              const right = st.x + st.w
              t.width(newW); t.x(right - newW)
            } else {
              t.width(newW); t.x(st.x)
            }
            t.scaleX(1)
          } else {
            const s = Math.max(t.scaleX(), t.scaleY())
            const next = clampFS(st.fs * s)
            t.fontSize(next)
            t.scaleX(1); t.scaleY(1)
          }
          t.getLayer()?.batchDraw()
        })
      }
      const onEnd = () => { onTransform(); textStartRef.current = null }

      n.on("transformstart.textfix", onStartTxt)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachTextFix.current = () => { n.off(".textfix") }
    } else {
      tr.keepRatio(true)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right"])
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  /* --------------- enable/disable drag by tool --------------- */
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  /* --------------- keyboard shortcuts --------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = nodeById(selectedId)
      const lay = findLayer(selectedId)
      const moveTool = tool === "move"

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z")  { e.preventDefault(); redo(); return }

      if (!moveTool || !n || !lay) return

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  /* ===================== BRUSH SESSIONS ===================== */
  const closeBrushSession = (s: Side = side) => {
    currentStrokeId.current[s] = null
  }

  useEffect(() => {
    if (tool !== "brush" && lastToolRef.current === "brush") {
      closeBrushSession(side)
      snapshotPush()
    }
    lastToolRef.current = tool
  }, [tool, side])

  const createStrokeGroup = (s: Side): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)

    const art = groupForSide(s)
    art.add(g)
    // поверх
    g.zIndex(art.children.length - 1)

    const newLay: AnyLayer = { id, side: s, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(prev => ({ ...prev, strokes: prev.strokes + 1 }))
    currentStrokeId.current[s] = id
    return newLay
  }

  /* ===================== ADD ITEMS ===================== */
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, draggable: false })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)

        const art = activeGroup()
        art.add(kimg)
        // поверх
        kimg.zIndex(art.children.length - 1)

        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        canvasLayerRef.current?.batchDraw()
        set({ tool: "move" })
        closeBrushSession(side)
        snapshotPush()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)

    const art = activeGroup()
    art.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    closeBrushSession(side)
    snapshotPush()
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)

    const art = activeGroup()
    art.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    closeBrushSession(side)
    snapshotPush()
  }

  /* ===================== GLOBAL ERASE & BRUSH ===================== */
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      if (!gid) gid = createStrokeGroup(side).id
      const g = findLayer(gid)!.node as Konva.Group
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
      return
    }

    if (tool === "erase") {
      const art = activeGroup()
      if (!art.isCached()) art.cache()
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      ;(line as any)._isEraser = true
      art.add(line)
      art.clearCache(); art.cache()
      setIsDrawing(true)
      return
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeId.current[side]
      const g = gid ? (findLayer(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      canvasLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const art = activeGroup()
      const last = art?.getChildren().at(-1) as Konva.Line | undefined
      if (!last || !isEraserLine(last)) return
      last.points(last.points().concat([x, y]))
      art.clearCache(); art.cache()
      canvasLayerRef.current?.batchDraw()
    }
  }

  const finishStroke = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    snapshotPush()
  }

  /* ===================== TEXT OVERLAY ===================== */
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stBox = stage.container().getBoundingClientRect()
    const abs = t.getAbsolutePosition()
    const x = stBox.left + abs.x * scale
    const y = stBox.top  + abs.y * scale

    t.visible(false)
    trRef.current?.nodes([])

    const ta = document.createElement("textarea")
    ta.value = t.text()
    ta.style.position = "absolute"
    ta.style.left = `${x}px`
    ta.style.top = `${y}px`
    ta.style.padding = "4px 6px"
    ta.style.border = "1px solid #000"
    ta.style.background = "#fff"
    ta.style.color = t.fill() as string
    ta.style.fontFamily = t.fontFamily()
    ta.style.fontWeight = t.fontStyle()?.includes("bold") ? "700" : "400"
    ta.style.fontSize = `${t.fontSize() * scale}px`
    ta.style.lineHeight = String(t.lineHeight())
    ta.style.transformOrigin = "left top"
    ta.style.zIndex = "9999"
    ta.style.minWidth = `${Math.max(160, t.width() * scale || 0)}px`
    ta.style.outline = "none"
    ta.style.resize = "none"
    ta.style.boxShadow = "0 2px 8px rgba(0,0,0,.12)"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()

    const autoGrow = () => {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 3) + "px"
    }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) t.text(ta.value)
      ta.remove()
      t.visible(true)
      canvasLayerRef.current?.batchDraw()
      attachTransformer()
      snapshotPush()
    }

    ta.addEventListener("input", autoGrow)
    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
  }

  /* ===================== GESTURES (mobile) ===================== */
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScale: number
    startRot: number
    startPos: { x: number, y: number }
    centerCanvas: { x: number, y: number }
    nodeId: string | null
    lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScale:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

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
    ;(node as any).x(((node as any).x?.() ?? 0) + dx)
    ;(node as any).y(((node as any).y?.() ?? 0) + dy)
  }

  const isBgTarget = (t: Konva.Node | null) =>
    !!t && (t === frontBgRef.current || t === backBgRef.current || t === artFrontRef.current || t === artBackRef.current)

  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) {
      if (tr && p === tr) return true
      p = p.getParent?.()
    }
    return false
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    // Рисование
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      if (tool === "brush" && !currentStrokeId.current[side]) createStrokeGroup(side)
      startStroke(p.x, p.y)
      return
    }

    // Move — выбор/перетаскивание
    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      if (tgt === st || isBgTarget(tgt)) {
        select(null)
        trRef.current?.nodes([])
        uiLayerRef.current?.batchDraw()
        return
      }

      if (tgt && tgt !== st && tgt.getParent()) {
        // если попали в потомка strokes-группы — выделяем саму группу
        let found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (!found) {
          const parent = tgt.getParent()
          if (parent && isStrokeGroup(parent as any)) {
            found = layers.find(l => l.node === parent)
          }
        }
        if (found && found.side === side) select(found.id)
      }

      const lay = findLayer(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          active: true,
          two: false,
          nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(getStagePointer()),
          centerCanvas: toCanvas(getStagePointer()),
          startDist: 0, startAngle: 0,
          startScale: (lay.node as any).scaleX?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

    // Pinch/Rotate — 2 пальца
    if (touches && touches.length >= 2) {
      const lay = findLayer(selectedId)
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

      gestureRef.current = {
        active: true,
        two: true,
        nodeId: lay.id,
        startDist: Math.max(dist, 0.0001),
        startAngle: ang,
        startScale: (lay.node as any).scaleX?.() ?? 1,
        startRot: (lay.node as any).rotation?.() ?? 0,
        startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
        centerCanvas: toCanvas({ x: cx, y: cy }),
        lastPointer: undefined
      }
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer())
      appendStroke(p.x, p.y)
      return
    }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = findLayer(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      canvasLayerRef.current?.batchDraw()
      return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = findLayer(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)
      // сглаживание — лёгкая демпфирующая экспонента
      let s = Math.pow(dist / gestureRef.current.startDist, 0.92)
      s = Math.min(Math.max(s, 0.1), 10)

      const newScale = gestureRef.current.startScale * s
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)

      const c = gestureRef.current.centerCanvas
      const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      canvasLayerRef.current?.batchDraw()
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  /* ===================== LAYERS DATA & ACTIONS ===================== */
  const layerItems: LayerItem[] = useMemo(() => {
    const art = activeGroup()
    const topToBottom = art
      ? art.children
          .filter((n) => !isEraserLine(n)) // глобальные линии-ластики не считаем слоями
          .sort((a,b)=> a.zIndex() - b.zIndex())
          .reverse()
      : []

    const records: LayerItem[] = []
    for (const n of topToBottom) {
      const id = (n as any)._id?.toString?.() || ""
      const lay = layers.find(l => l.id === id)
      if (!lay) continue
      records.push({
        id, name: lay.meta.name, type: lay.type,
        visible: lay.meta.visible, locked: lay.meta.locked,
        blend: lay.meta.blend, opacity: lay.meta.opacity,
      })
    }
    return records
  }, [layers, side])

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    activeGroup().add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(activeGroup().children.length - 1)
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    const art = activeGroup(); if (!art) return
    const orderTopToBottom = art.children.filter(n=>!isEraserLine(n)).sort((a,b)=>a.zIndex()-b.zIndex()).reverse()
    const srcIdx = orderTopToBottom.findIndex(n => (n as any)._id?.toString?.() === srcId)
    const dstIdx = orderTopToBottom.findIndex(n => (n as any)._id?.toString?.() === destId)
    if (srcIdx === -1 || dstIdx === -1) return
    const srcNode = orderTopToBottom.splice(srcIdx,1)[0]
    const insertAt = Math.min(place==="before" ? dstIdx : dstIdx+1, orderTopToBottom.length)
    orderTopToBottom.splice(insertAt, 0, srcNode)

    const bottomToTop = [...orderTopToBottom].reverse()
    bottomToTop.forEach((n, i) => { n.zIndex(i + 1) }) // zIndex внутри art-группы (0 оставляем на случай служебных)
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  /* -------- selected props for Toolbar -------- */
  const sel = findLayer(selectedId)
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); canvasLayerRef.current?.batchDraw(); snapshotPush() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); canvasLayerRef.current?.batchDraw(); snapshotPush() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); canvasLayerRef.current?.batchDraw(); snapshotPush() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() /* snapshot в blur/Enter */ }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw(); snapshotPush() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw(); snapshotPush() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    else if ((sel.node as any).stroke) (sel.node as any).stroke(hex)
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  /* ===================== HISTORY (UNDO/REDO) ===================== */
  const snapshot = (): SnapItem[][] => {
    const collect = (s: Side): SnapItem[] => {
      const art = groupForSide(s)
      const items: SnapItem[] = []
      art.children.forEach((n) => {
        if (isEraserLine(n)) return // глобальный эрайзер учтём в strokes с mode:erase ниже
      })

      // Собираем явные слои по нашему реестру:
      const reg = layers.filter(l => l.side===s)
      for (const l of reg) {
        const n = l.node
        if (!l.meta.visible && !n.visible()) {/* визуальная видимость учтём метой */}
        if (l.type === "image") {
          const im = n as Konva.Image
          const a: any = im.attrs
          const src = (im.image() as HTMLImageElement | null)?.src || (a.image?.src ?? "")
          items.push({
            type: "image", side: s, meta: l.meta,
            x: a.x||0, y: a.y||0, w: a.width||im.width(), h: a.height||im.height(),
            rot: a.rotation||0, scale: a.scaleX||1, src
          })
        } else if (l.type === "text") {
          const t = n as Konva.Text
          const a: any = t.attrs
          items.push({
            type: "text", side: s, meta: l.meta, x: a.x||0, y: a.y||0,
            width: t.width(), fs: t.fontSize(), family: t.fontFamily(), style: t.fontStyle()||"normal",
            fill: (t.fill() as string)||"#000", text: t.text(), rot: a.rotation||0
          })
        } else if (l.type === "shape") {
          if (n instanceof Konva.Rect) {
            const a = n.attrs
            items.push({ type:"shape-rect", side:s, meta:l.meta, x:a.x||0, y:a.y||0, w:a.width||0, h:a.height||0, fill:(n.fill() as string)||"#000", rot:a.rotation||0, scale:a.scaleX||1 })
          } else if (n instanceof Konva.Circle) {
            const a = n.attrs
            items.push({ type:"shape-circle", side:s, meta:l.meta, x:a.x||0, y:a.y||0, r:a.radius||0, fill:(n.fill() as string)||"#000", rot:a.rotation||0, scale:a.scaleX||1 })
          } else if (n instanceof Konva.RegularPolygon) {
            const a = n.attrs
            items.push({ type:"shape-triangle", side:s, meta:l.meta, x:a.x||0, y:a.y||0, r:a.radius||0, fill:(n.fill() as string)||"#000", rot:a.rotation||0, scale:a.scaleX||1 })
          } else if (n instanceof Konva.Line) {
            const a = n.attrs
            items.push({ type:"shape-line", side:s, meta:l.meta, points:a.points||[], stroke:a.stroke||"#000", strokeWidth:a.strokeWidth||1, rot:a.rotation||0 })
          }
        } else if (l.type === "strokes") {
          const g = n as Konva.Group
          const strokes: SnapshotStroke[] = []
          g.getChildren().forEach((ln) => {
            const a: any = ln.attrs
            strokes.push({
              points: a.points||[],
              color: a.stroke||"#000",
              width: a.strokeWidth||1,
              mode: (a.globalCompositeOperation === "destination-out") ? "erase" : "paint"
            })
          })
          items.push({ type:"strokes", side:s, meta:l.meta, strokes })
        }
      }

      // Теперь добавим линии-ластики, которые живут прямо в art-group
      const erasers: SnapshotStroke[] = []
      art.children.forEach((n) => {
        if (isEraserLine(n)) {
          const a: any = n.attrs
          erasers.push({ points: a.points||[], color: "#000", width: a.strokeWidth||1, mode: "erase" })
        }
      })
      if (erasers.length) {
        items.push({ type:"strokes", side:s, meta: baseMeta("global erase"), strokes: erasers })
      }
      return items
    }
    return [collect("front"), collect("back")]
  }

  const restore = (snap: SnapItem[][]) => {
    // очистить группы
    const killChildren = (g: Konva.Group) => {
      g.children.forEach((n) => n.destroy())
      g.clearCache(); g.cache()
    }
    killChildren(artFrontRef.current!)
    killChildren(artBackRef.current!)
    setLayers([])

    const addMeta = (node: AnyNode, meta: BaseMeta, s: Side, type: LayerType) => {
      ;(node as any).id(uid())
      const id = (node as any)._id
      const lay: AnyLayer = { id, side: s, node, meta: { ...meta }, type }
      applyMeta(node, meta)
      groupForSide(s).add(node)
      setLayers((p)=>[...p, lay])
    }

    const build = (sideSnap: SnapItem[]) => {
      for (const it of sideSnap) {
        const s = it.side
        if (it.type === "image") {
          const img = new window.Image()
          img.crossOrigin = "anonymous"
          img.onload = () => {
            const k = new Konva.Image({ image: img, x: it.x, y: it.y, width: it.w, height: it.h, rotation: it.rot, scaleX: it.scale, scaleY: it.scale })
            addMeta(k, it.meta, s, "image")
            k.on("click tap", () => select((k as any)._id))
            canvasLayerRef.current?.batchDraw()
          }
          img.src = it.src
        } else if (it.type === "text") {
          const t = new Konva.Text({
            text: it.text, x: it.x, y: it.y, width: it.width,
            fontSize: it.fs, fontFamily: it.family, fontStyle: it.style, fill: it.fill, rotation: it.rot
          })
          addMeta(t, it.meta, s, "text")
          t.on("click tap", () => select((t as any)._id))
          t.on("dblclick dbltap", () => startTextOverlayEdit(t))
        } else if (it.type === "shape-rect") {
          const n = new Konva.Rect({ x: it.x, y: it.y, width: it.w, height: it.h, fill: it.fill, rotation: it.rot, scaleX: it.scale, scaleY: it.scale })
          addMeta(n, it.meta, s, "shape")
          n.on("click tap", () => select((n as any)._id))
        } else if (it.type === "shape-circle") {
          const n = new Konva.Circle({ x: it.x, y: it.y, radius: it.r, fill: it.fill, rotation: it.rot, scaleX: it.scale, scaleY: it.scale })
          addMeta(n, it.meta, s, "shape")
          n.on("click tap", () => select((n as any)._id))
        } else if (it.type === "shape-triangle") {
          const n = new Konva.RegularPolygon({ x: it.x, y: it.y, sides: 3, radius: it.r, fill: it.fill, rotation: it.rot, scaleX: it.scale, scaleY: it.scale })
          addMeta(n, it.meta, s, "shape")
          n.on("click tap", () => select((n as any)._id))
        } else if (it.type === "shape-line") {
          const n = new Konva.Line({ points: it.points, stroke: it.stroke, strokeWidth: it.strokeWidth, lineCap: "round", rotation: it.rot })
          addMeta(n, it.meta, s, "shape")
          n.on("click tap", () => select((n as any)._id))
        } else if (it.type === "strokes") {
          // strokes — либо реальная группа, либо глобальные эрайзеры
          const paints = it.strokes.filter(sv => sv.mode === "paint")
          if (paints.length) {
            const g = new Konva.Group()
            ;(g as any)._isStrokes = true
            paints.forEach((sv) => {
              const l = new Konva.Line({ points: sv.points, stroke: sv.color, strokeWidth: sv.width, lineCap:"round", lineJoin:"round", globalCompositeOperation: "source-over" })
              g.add(l)
            })
            addMeta(g as any, it.meta, s, "strokes")
          }
          const erasers = it.strokes.filter(sv => sv.mode === "erase")
          if (erasers.length) {
            const art = groupForSide(s)
            erasers.forEach((sv) => {
              const l = new Konva.Line({ points: sv.points, stroke:"#000", strokeWidth: sv.width, lineCap:"round", lineJoin:"round", globalCompositeOperation:"destination-out" })
              ;(l as any)._isEraser = true
              art.add(l)
            })
            art.clearCache(); art.cache()
          }
        }
      }
    }

    build(snap[0]) // front
    build(snap[1]) // back

    canvasLayerRef.current?.batchDraw()
  }

  const snapshotPush = () => {
    // ограничиваем частые пуши: ждём animation frame
    requestAnimationFrame(() => {
      const snap = snapshot()
      history.current.past.push(snap)
      if (history.current.past.length > HISTORY_LIMIT) history.current.past.shift()
      history.current.future = []
    })
  }

  const undo = () => {
    const past = history.current.past
    if (!past.length) return
    const current = past.pop()!
    history.current.future.push(snapshot())
    restore(current)
  }

  const redo = () => {
    const fut = history.current.future
    if (!fut.length) return
    const next = fut.pop()!
    history.current.past.push(snapshot())
    restore(next)
  }

  const clearActive = () => {
    const art = activeGroup()
    art.children.forEach(n => n.destroy())
    art.clearCache(); art.cache()
    setLayers(p => p.filter(l => l.side !== side))
    select(null)
    canvasLayerRef.current?.batchDraw()
    snapshotPush()
  }

  /* ===================== DOWNLOADS ===================== */
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    // скрыть неактивную сторону
    const prevFront = artFrontRef.current!.visible()
    const prevBack  = artBackRef.current!.visible()
    artFrontRef.current!.visible(s === "front")
    artBackRef.current!.visible(s === "back")
    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    uiLayerRef.current?.visible(false)
    st.draw()

    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // только арт
    if (s === "front") frontBgRef.current?.visible(false)
    else backBgRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // вернуть
    artFrontRef.current!.visible(prevFront)
    artBackRef.current!.visible(prevBack)
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  /* ===================== RENDER ===================== */
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Desktop-панель слоёв */}
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
        <div style={{ touchAction: "none" }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            <Layer ref={canvasLayerRef} listening>
              {frontMock && (
                <KImage
                  ref={frontBgRef}
                  image={frontMock}
                  visible={side==="front"}
                  width={BASE_W}
                  height={BASE_H}
                  listening
                />
              )}
              {backMock && (
                <KImage
                  ref={backBgRef}
                  image={backMock}
                  visible={side==="back"}
                  width={BASE_W}
                  height={BASE_H}
                  listening
                />
              )}

              {/* Арт-группы обеих сторон */}
              <Konva.Group ref={artFrontRef as any} />
              <Konva.Group ref={artBackRef as any} />
            </Layer>

            {/* UI-слой */}
            <Layer ref={uiLayerRef}>
              <Transformer
                ref={trRef}
                rotateEnabled
                anchorSize={12}
                borderStroke="black"
                anchorStroke="black"
                anchorFill="white"
              />
            </Layer>
          </Stage>
        </div>
      </div>

      {/* Toolbar (твой) */}
      <Toolbar
        side={side} setSide={(s: Side)=>{ set({ side: s }); select(null) }}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={()=>{}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
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
