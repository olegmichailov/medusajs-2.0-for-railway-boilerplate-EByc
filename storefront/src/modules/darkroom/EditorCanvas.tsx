// storefront/src/modules/darkroom/EditorCanvas.tsx
"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ==== БАЗА МАКЕТА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

// ==== ТИПЫ ====
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
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

// ===== История (Undo/Redo) =====
type SnapshotItem = { side: Side; type: LayerType; meta: BaseMeta; json: string }
type Snapshot = { items: SnapshotItem[]; seqs: { image: number; shape: number; text: number; strokes: number } }

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)     // мокап
  const drawLayerRef = useRef<Konva.Layer>(null)     // арт
  const uiLayerRef   = useRef<Konva.Layer>(null)     // рамки/ручки
  const trRef        = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef     = useRef<Tool | null>(null)
  const isTransformingRef = useRef(false)

  // глобальный ластик — отдельная группа на сторону, и как полноценный слой
  const globalEraseGroup = useRef<Record<Side, string | null>>({ front: null, back: null })

  // История
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const maxHistory = 40
  const gestureChangedRef = useRef(false)

  // дефолт: кисть
  useEffect(() => { set({ tool: "brush" }) }, [set])

  // лэйаут
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    // запас под мобильную панель/контекстные сеттинги, чтобы не перекрывать мокап
    const padBottom = isMobile ? 220 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])
  useEffect(() => {
    const cont = stageRef.current?.container()
    const stopWheel = (e: WheelEvent) => { if ((e as any).ctrlKey) e.preventDefault() }
    cont?.addEventListener("wheel", stopWheel, { passive: false })
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener("gesturestart", prevent as any, { passive: false } as any)
    document.addEventListener("gesturechange", prevent as any, { passive: false } as any)
    document.addEventListener("gestureend", prevent as any, { passive: false } as any)
    return () => {
      cont?.removeEventListener("wheel", stopWheel as any)
      document.removeEventListener("gesturestart", prevent as any)
      document.removeEventListener("gesturechange", prevent as any)
      document.removeEventListener("gestureend", prevent as any)
    }
  }, [])

  // helpers
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // показать только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textStartRef  = useRef<{w:number; x:number; fs:number} | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
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

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
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

      const onTransform = () => {
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
      }
      const onEnd = () => { onTransform(); textStartRef.current = null; pushHistory() }

      n.on("transformstart.textfix", onStartTxt)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachTextFix.current = () => { n.off(".textfix") }
    } else {
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])
      n.on("transformend._hist", () => { pushHistory() })
      detachTextFix.current = () => { n.off("transformend._hist") }
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  // ===== хоткеи =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.isContentEditable)) return

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (e.key==="ArrowLeft")  (n as any).x((n as any).x()-step)
      if (e.key==="ArrowRight") (n as any).x((n as any).x()+step)
      if (e.key==="ArrowUp")    (n as any).y((n as any).y()-step)
      if (e.key==="ArrowDown")  (n as any).y((n as any).y()+step)
      n.getLayer()?.batchDraw()
      pushHistory()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== Stroke-группа (brush)
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

  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      if (!currentStrokeId.current[side]) createStrokeGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    lastToolRef.current = tool
  }, [tool, side])

  // ===== Добавление: Image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const src = r.result as string
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        ;(kimg as any).id(uid())
        ;(kimg as any).setAttr("src", src) // нужно для истории/восстановления
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
        set({ tool: "move" })
        pushHistory()
      }
      img.src = src
    }
    r.readAsDataURL(file)
  }

  // ===== Добавление: Text
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: isMobile ? 112 : 96,
      fontFamily: (typeof window !== "undefined"
        ? window.getComputedStyle(document.body).fontFamily
        : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    if (!isMobile) t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushHistory()
  }

  // ===== Добавление: Shape
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
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushHistory()
  }

  // ===== ERASE — простая глобальная резинка по всему арт-слою текущей стороны
  const ensureGlobalErase = (): AnyLayer => {
    const existingId = globalEraseGroup.current[side]
    if (existingId) return layers.find(l => l.id === existingId)! // уже есть

    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    globalEraseGroup.current[side] = id

    const meta: BaseMeta = { ...baseMeta("erase"), locked: true }
    drawLayerRef.current?.add(g)
    g.zIndex(drawLayerRef.current!.children.length - 1)

    const lay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, lay])
    return lay
  }

  // ===== Рисование: Brush / Erase =====
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

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
      return
    }

    if (tool === "erase") {
      const g = ensureGlobalErase().node as Konva.Group
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
      return
    }
    if (tool === "erase") {
      const id = globalEraseGroup.current[side]
      if (!id) return
      const g = find(id)?.node as Konva.Group | undefined
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
    }
  }

  const finishStroke = () => { setIsDrawing(false); pushHistory() }

  // ===== Overlay-редактор текста (десктоп)
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

    const commit = (apply: boolean) => {
      if (apply) { t.text(ta.value); pushHistory() }
      ta.remove()
      t.visible(true)
      drawLayerRef.current?.batchDraw()
      attachTransformer()
    }

    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
  }

  // ===== Жесты =====
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRot: number
    startPos: { x: number, y: number }
    centerCanvas: { x: number, y: number }
    nodeId: string | null
    lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScaleX:1, startScaleY:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

  const applyAround = (node: Konva.Node, stagePoint:{x:number;y:number}, newScale:number, newRotation:number) => {
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

  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer())
      if (tool === "brush" && !currentStrokeId.current[side]) createStrokeGroup()
      startStroke(p.x, p.y)
      return
    }

    gestureChangedRef.current = false

    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      if (tgt === st || tgt.getLayer?.() === bgLayerRef.current) {
        select(null)
        trRef.current?.nodes([])
        uiLayerRef.current?.batchDraw()
        return
      }

      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          ...gestureRef.current,
          active: true,
          two: false,
          nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(getStagePointer()),
          centerCanvas: toCanvas(getStagePointer()),
          startDist: 0, startAngle: 0,
          startScaleX: (lay.node as any).scaleX?.() ?? 1,
          startScaleY: (lay.node as any).scaleY?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

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

      gestureRef.current = {
        active: true, two: true, nodeId: lay.id,
        startDist: Math.max(dist, 0.0001),
        startAngle: ang,
        startScaleX: (lay.node as any).scaleX?.() ?? 1,
        startScaleY: (lay.node as any).scaleY?.() ?? 1,
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
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      drawLayerRef.current?.batchDraw()
      gestureChangedRef.current = true
      return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      let s = dist / gestureRef.current.startDist
      s = Math.min(Math.max(s, 0.1), 10)

      const baseScale = gestureRef.current.startScaleX
      const newScale = baseScale * s
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)

      const c = gestureRef.current.centerCanvas
      const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      drawLayerRef.current?.batchDraw()
      gestureChangedRef.current = true
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    if (gestureChangedRef.current) pushHistory()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  // ===== LayersPanel data =====
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

  // ===== CRUD =====
  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
    pushHistory()
  }
  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    // восстановление image по src, если есть
    if (clone instanceof Konva.Image) {
      const srcData = (src.node as any).attrs?.src
      if (srcData) {
        const img = new window.Image()
        img.crossOrigin = "anonymous"
        img.onload = () => { (clone as Konva.Image).image(img); drawLayerRef.current?.batchDraw() }
        img.src = srcData
        ;(clone as any).setAttr("src", srcData)
      }
    }
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(drawLayerRef.current!.children.length - 1)
    drawLayerRef.current?.batchDraw()
    pushHistory()
  }
  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      const orderTopToBottom = current.slice().sort((a,b)=> a.node.zIndex() - b.node.zIndex()).reverse()

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
    pushHistory()
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
    pushHistory()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Выбранные свойства для Toolbar =====
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

  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); drawLayerRef.current?.batchDraw(); pushHistory() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); drawLayerRef.current?.batchDraw(); pushHistory() }
  const setSelectedFontFamily = (name:string)  => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); drawLayerRef.current?.batchDraw(); pushHistory() }
  const setSelectedColor      = (hex:string)   => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    drawLayerRef.current?.batchDraw()
    pushHistory()
  }

  // ===== Clear / Undo / Redo =====
  const makeSnapshot = (): Snapshot => {
    const items: SnapshotItem[] = layers.map(l => ({ side: l.side, type: l.type, meta: l.meta, json: (l.node as any).toJSON() }))
    return { items, seqs: { ...seqs } }
  }
  const restoreSnapshot = (snap: Snapshot) => {
    // убрать всё
    drawLayerRef.current?.getChildren().forEach(ch => ch.destroy())
    setLayers([])

    const newLayers: AnyLayer[] = []
    for (const it of snap.items) {
      const node = Konva.Node.create(it.json) as AnyNode

      // починить Image из атрибута src
      if (node instanceof Konva.Image) {
        const srcData = (node as any).attrs?.src
        if (srcData) {
          const img = new window.Image()
          img.crossOrigin = "anonymous"
          img.onload = () => { (node as Konva.Image).image(img); drawLayerRef.current?.batchDraw() }
          img.src = srcData
        }
      }

      ;(node as any).id((node as any)._id || uid())
      drawLayerRef.current?.add(node)

      const lay: AnyLayer = { id: (node as any)._id, side: it.side, node: node, meta: { ...it.meta }, type: it.type }
      // клики/редактирование
      ;(node as any).on("click tap", () => select(lay.id))
      if (node instanceof Konva.Text && !isMobile) (node as Konva.Text).on("dblclick dbltap", () => startTextOverlayEdit(node as Konva.Text))
      applyMeta(node, lay.meta)
      newLayers.push(lay)
    }
    setLayers(newLayers)
    setSeqs({ ...snap.seqs })
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }

  const pushHistory = () => {
    redoStack.current = []
    undoStack.current.push(makeSnapshot())
    if (undoStack.current.length > maxHistory) undoStack.current.shift()
  }
  const undo = () => {
    if (undoStack.current.length < 2) return
    const cur = undoStack.current.pop()!
    const prev = undoStack.current[undoStack.current.length - 1]
    redoStack.current.push(cur)
    restoreSnapshot(prev)
  }
  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(next)
    restoreSnapshot(next)
  }

  useEffect(() => { pushHistory() }, []) // первый снап

  const clearSide = () => {
    const ids = layers.filter(l => l.side === side).map(l => l.id)
    ids.forEach(deleteLayer)
    currentStrokeId.current[side] = null
    globalEraseGroup.current[side] = null
    pushHistory()
  }

  // ===== Скачивание
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    // показать мокап
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    // только арт
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // вернуть
    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Render
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        touchAction: "none",
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
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
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          {/* mockup (не стирается) */}
          <Layer ref={bgLayerRef} listening>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* арт */}
          <Layer ref={drawLayerRef} />

          {/* UI */}
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

      {/* Toolbar */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
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
        setSelectedFill={()=>{}}
        setSelectedStroke={()=>{}}
        setSelectedStrokeW={()=>{}}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={()=>{}}
        setSelectedColor={setSelectedColor}
        onUndo={undo}
        onRedo={redo}
        onClear={clearSide}
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
