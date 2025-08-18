"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== БАЗА МАКЕТА =====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// Текст — клампы
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

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

const isTextNode = (n: AnyNode): n is Konva.Text => n instanceof Konva.Text

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // точные хиты при драге (мобилка)
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef       = useRef<Konva.Stage>(null)
  const canvasLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef     = useRef<Konva.Layer>(null)
  const trRef          = useRef<Konva.Transformer>(null)
  const frontBgRef     = useRef<Konva.Image>(null)
  const backBgRef      = useRef<Konva.Image>(null)

  // art корни по сторонам + служебные группы
  const artRootRef   = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })
  const strokesRef   = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })
  const eraserRef    = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })

  // состояние
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // жесты
  const isTransformingRef = useRef(false)

  // Undo/Redo per side (снимки artRoot.toJSON())
  const undoRef = useRef<Record<Side, string[]>>({ front: [], back: [] })
  const redoRef = useRef<Record<Side, string[]>>({ front: [], back: [] })
  const HISTORY_MAX = 40

  // ===== Вёрстка/масштаб =====
  const [headerH, setHeaderH] = useState(64)
  const [viewportTick, setViewportTick] = useState(0)
  useLayoutEffect(() => {
    const header = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(header?.getBoundingClientRect().height ?? 64))
    const onRes = () => setViewportTick(x => x + 1)
    window.addEventListener("resize", onRes)
    window.addEventListener("orientationchange", onRes)
    return () => { window.removeEventListener("resize", onRes); window.removeEventListener("orientationchange", onRes) }
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 144 : 80
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [headerH, viewportTick])

  // стоп скролл/зум страницы
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  // ========== helpers ==========
  const baseMeta = (name: string): BaseMeta =>
    ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })

  const metaOf = (n: AnyNode): BaseMeta | null => (n.getAttr("_meta") as BaseMeta) || null

  const safeCache = (n: Konva.Node) => {
    try {
      const r = n.getClientRect({ skipShadow: true, skipStroke: true })
      if (r.width > 0 && r.height > 0) n.cache()
      else n.clearCache()
    } catch { /* ignore */ }
  }

  const setMetaOnNode = (n: AnyNode, meta: BaseMeta) => {
    n.setAttr("_meta", meta)
    ;(n as any).opacity(meta.opacity)
    // ВАЖНО: вызвать сеттер, не перезаписывать метод!
    ;(n as any).globalCompositeOperation(meta.blend as any)
  }

  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // создать artRoot + служебные группы
  useEffect(() => {
    if (!canvasLayerRef.current) return
    const ensureSide = (s: Side) => {
      if (artRootRef.current[s]) return
      const root = new Konva.Group({ x: 0, y: 0, visible: s === side })
      ;(root as any)._isArtRoot = true
      ;(root as any).id(uid())
      canvasLayerRef.current!.add(root)

      const strokes = new Konva.Group()
      ;(strokes as any)._isStrokesGroup = true
      ;(strokes as any).id(uid())
      root.add(strokes)

      const eraser = new Konva.Group()
      ;(eraser as any)._isEraserGroup = true
      ;(eraser as any).id(uid())
      root.add(eraser)

      artRootRef.current[s] = root
      strokesRef.current[s] = strokes
      eraserRef.current[s] = eraser

      safeCache(root)
      canvasLayerRef.current?.batchDraw()
    }
    ensureSide("front")
    ensureSide("back")
  }, [side])

  // показываем только активную сторону (фон + корень арта)
  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    artRootRef.current.front?.visible(side === "front")
    artRootRef.current.back?.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side])

  // слои (UI) ведём как снэпшот детей artRoot (кроме eraser)
  const rebuildLayersFromArt = () => {
    const root = artRootRef.current[side]; if (!root) return
    const items: AnyLayer[] = []
    root.getChildren().forEach((child) => {
      if ((child as any)._isEraserGroup) return
      if ((child as any)._isStrokesGroup) {
        const meta = metaOf(child as any) || baseMeta(`strokes ${seqs.strokes}`)
        setMetaOnNode(child as any, meta)
        items.push({ id: (child as any)._id, side, node: child as any, meta, type: "strokes" })
        return
      }
      const meta = metaOf(child as any) || baseMeta(guessName(child as any))
      setMetaOnNode(child as any, meta)
      const type: LayerType =
        child instanceof Konva.Text ? "text" :
        child instanceof Konva.Image ? "image" : "shape"
      items.push({ id: (child as any)._id, side, node: child as any, meta, type })
    })
    const ordered = items.sort((a, b) => (b.node.zIndex() - a.node.zIndex()))
    setLayers(ordered)
  }

  const guessName = (n: AnyNode) =>
    n instanceof Konva.Text ? `text ${seqs.text}` :
    n instanceof Konva.Image ? `image ${seqs.image}` : `shape ${seqs.shape}`

  // ===== Transformer + текст-фиксы =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textStartRef  = useRef<{w:number; x:number; fs:number} | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || tool !== "move"

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
    ;(n as any).on("transformstart.guard", onStart)
    ;(n as any).on("transformend.guard", onEndT)
    detachGuard.current = () => (n as any).off(".guard")

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const clampW  = (v:number)=>Math.max(TEXT_MIN_W,Math.min(v,TEXT_MAX_W))
      const clampFS = (v:number)=>Math.max(TEXT_MIN_FS,Math.min(v,TEXT_MAX_FS))

      const onStartTxt = () => {
        const t = n as Konva.Text
        textStartRef.current = { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
      }
      const onTransform = () => {
        const t = n as Konva.Text
        const st = textStartRef.current || { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
        const active = (tr as any).getActiveAnchor?.() as string | undefined
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, t.scaleX()); const newW = clampW(st.w * sx)
          if (active === "middle-left") { const right = st.x + st.w; t.width(newW); t.x(right - newW) }
          else { t.width(newW); t.x(st.x) }
          t.scaleX(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY()); const next = clampFS(st.fs * s)
          t.fontSize(next); t.scaleX(1); t.scaleY(1)
        }
        t.getLayer()?.batchDraw()
      }
      const onEnd = () => { onTransform(); textStartRef.current = null }
      ;(n as any).on("transformstart.textfix", onStartTxt)
      ;(n as any).on("transform.textfix", onTransform)
      ;(n as any).on("transformend.textfix", onEnd)
      detachTextFix.current = () => (n as any).off(".textfix")
    } else {
      tr.keepRatio(true)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right"])
    }
    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side, tool])

  // во время brush/erase — отключаем драг
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => { (l.node as any).draggable?.(enable && !l.meta.locked) })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers])

  // ===== хоткеи (desktop) =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName==="TEXTAREA" || ae.isContentEditable)) return

      // Undo/Redo
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="y") { e.preventDefault(); redo(); return }

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay || tool!=="move") return
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      if (e.key === "Backspace"||e.key==="Delete") { e.preventDefault(); pushHistory(); deleteLayer(lay.id); return }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); pushHistory(); duplicateLayer(lay.id); return }
      if (e.key==="ArrowLeft")  (n as any).x((n as any).x()-step)
      if (e.key==="ArrowRight") (n as any).x((n as any).x()+step)
      if (e.key==="ArrowUp")    (n as any).y((n as any).y()-step)
      if (e.key==="ArrowDown")  (n as any).y((n as any).y()+step)
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== История =====
  const snapshot = (s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return ""
    return root.toJSON()
  }
  const restore = (json: string, s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return
    root.getChildren().forEach(c => c.destroy())
    const tmp = Konva.Node.create(json) as Konva.Group
    tmp.getChildren().forEach(c => root.add(c))
    let strokes = root.getChildren().find(c => (c as any)._isStrokesGroup) as Konva.Group | undefined
    let eraser  = root.getChildren().find(c => (c as any)._isEraserGroup)  as Konva.Group | undefined
    if (!strokes) { strokes = new Konva.Group(); (strokes as any)._isStrokesGroup = true; (strokes as any).id(uid()); root.add(strokes) }
    if (!eraser)  { eraser  = new Konva.Group(); (eraser  as any)._isEraserGroup  = true; (eraser  as any).id(uid());  root.add(eraser) }
    strokesRef.current[s] = strokes
    eraserRef.current[s]  = eraser
    safeCache(root)
    rebuildLayersFromArt()
    canvasLayerRef.current?.batchDraw()
    requestAnimationFrame(attachTransformer)
  }
  const pushHistory = (s: Side = side) => {
    const snap = snapshot(s); if (!snap) return
    const stack = undoRef.current[s]
    stack.push(snap)
    if (stack.length > HISTORY_MAX) stack.shift()
    redoRef.current[s] = []
  }
  const pushCurrent = (s: Side = side) => {
    const snap = snapshot(s); if (!snap) return
    const stack = undoRef.current[s]
    stack.push(snap)
    if (stack.length > HISTORY_MAX) stack.shift()
  }
  const undo = (s: Side = side) => {
    const u = undoRef.current[s]; const r = redoRef.current[s]
    if (u.length < 2) return
    const current = u.pop() as string
    const prev = u[u.length-1]
    r.push(current)
    restore(prev, s)
  }
  const redo = (s: Side = side) => {
    const u = undoRef.current[s]; const r = redoRef.current[s]
    const next = r.pop(); if (!next) return
    u.push(next)
    restore(next, s)
  }
  const clearSide = (s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return
    pushHistory(s) // до очистки
    root.getChildren().forEach(c => c.destroy())
    const strokes = new Konva.Group(); (strokes as any)._isStrokesGroup = true; (strokes as any).id(uid()); root.add(strokes)
    const eraser  = new Konva.Group(); (eraser  as any)._isEraserGroup  = true; (eraser  as any).id(uid());  root.add(eraser)
    strokesRef.current[s] = strokes
    eraserRef.current[s]  = eraser
    safeCache(root)
    rebuildLayersFromArt()
    canvasLayerRef.current?.batchDraw()
    pushCurrent(s) // состояние ПОСЛЕ clear (чтобы можно было Redo/Undo)
  }

  // ===== Добавление узлов =====
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const wireSelectable = (n: AnyNode) => {
    const id = (n as any)._id as string
    ;(n as any).on("click tap", () => select(id))
    if (n instanceof Konva.Text) {
      ;(n as any).on("dblclick dbltap", () => startTextOverlayEdit(n))
    }
  }

  const addToRoot = (n: AnyNode, type: LayerType, name?: string) => {
    const root = artRootRef.current[side]!; const eraser = eraserRef.current[side]!
    root.add(n as any)
    eraser.moveToTop()
    ;(n as any).id(uid())
    const meta = baseMeta(name || guessName(n))
    setMetaOnNode(n, meta)
    wireSelectable(n)
    pushHistory()
    rebuildLayersFromArt()
    select((n as any)._id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" as Tool })
  }

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        addToRoot(kimg, "image")
        setSeqs(s => ({ ...s, image: s.image + 1 }))
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96, fontFamily: siteFont(), fontStyle: "bold",
      fill: brushColor, width: 600, align: "center"
    })
    addToRoot(t, "text", `text ${seqs.text}`)
    setSeqs(s => ({ ...s, text: s.text + 1 }))
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    addToRoot(n, "shape", `shape ${seqs.shape}`)
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
  }

  // ===== Глобальный Erase и Brush =====
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureStrokesGroup()
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
      const g = eraserRef.current[side]!
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      recacheArtRoot()
      setIsDrawing(true)
    }
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const group = tool === "brush" ? ensureStrokesGroup() : eraserRef.current[side]!
    const last = group.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    if (tool === "erase") recacheArtRoot()
    canvasLayerRef.current?.batchDraw()
  }
  const finishStroke = () => {
    if (isDrawing) {
      setIsDrawing(false)
      pushHistory()
      rebuildLayersFromArt()
    }
  }
  const ensureStrokesGroup = () => {
    let g = strokesRef.current[side]
    if (!g) {
      g = new Konva.Group()
      ;(g as any)._isStrokesGroup = true
      ;(g as any).id(uid())
      setMetaOnNode(g as any, baseMeta(`strokes ${seqs.strokes}`))
      artRootRef.current[side]!.add(g)
      strokesRef.current[side] = g
      setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    }
    return g
  }
  const recacheArtRoot = () => {
    const root = artRootRef.current[side]; if (!root) return
    root.clearCache(); safeCache(root)
  }

  // ===== Overlay-редактор текста =====
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

    const autoGrow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize)||16)*3) + "px" }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) { t.text(ta.value); pushHistory() }
      ta.remove()
      t.visible(true)
      canvasLayerRef.current?.batchDraw()
      attachTransformer()
    }
    ta.addEventListener("input", autoGrow)
    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
  }

  // ===== Жесты (мягкие) =====
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
    last?: { x: number, y: number }
  }
  const gref = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScale:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const applyAround = (node: Konva.Node, stagePoint: { x:number; y:number }, newScale: number, newRotation: number) => {
    const tr = node.getAbsoluteTransform().copy()
    const inv = tr.invert()
    const local = inv.point(stagePoint)
    node.scaleX(newScale); node.scaleY(newScale); node.rotation(newRotation)
    const tr2 = node.getAbsoluteTransform().copy()
    const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x; const dy = stagePoint.y - p2.y
    node.x((node as any).x?.() + dx); node.y((node as any).y?.() + dy)
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer())
      startStroke(p.x, p.y)
      return
    }

    // 1 палец — выбор/перетаскивание
    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node
      if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
        select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return
      }
      let pnode: Konva.Node | null = tgt
      while (pnode && !pnode.getAttr("_meta")) pnode = pnode.getParent()
      if (pnode) select((pnode as any)._id)

      const lay = find(selectedId)
      if (lay && !lay.meta.locked) {
        gref.current = {
          active: true, two: false, nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.()??0, y: (lay.node as any).y?.()??0 },
          startDist: 0, startAngle: 0, startScale: (lay.node as any).scaleX?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0,
          centerCanvas: toCanvas(getStagePointer())
        }
      }
      return
    }

    // 2 пальца — масштаб/поворот (с сглаживанием)
    if (touches && touches.length >= 2) {
      const lay = find(selectedId); if (!lay || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }
      const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x, dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy); const ang = Math.atan2(dy, dx)
      gref.current = {
        active: true, two: true, nodeId: lay.id,
        startDist: Math.max(dist, 0.0001), startAngle: ang,
        startScale: (lay.node as any).scaleX?.() ?? 1,
        startRot: (lay.node as any).rotation?.() ?? 0,
        startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
        centerCanvas: toCanvas({ x: cx, y: cy })
      }
      trRef.current?.nodes([]); uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current) return

    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer())
      appendStroke(p.x, p.y)
      return
    }

    if (gref.current.active && !gref.current.two) {
      const lay = find(gref.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gref.current.last || p
      const dx = p.x - prev.x, dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gref.current.last = p
      canvasLayerRef.current?.batchDraw()
      return
    }

    if (gref.current.active && gref.current.two && touches && touches.length >= 2) {
      const lay = find(gref.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)

      // сглаживаем масштаб (lerp), ограничиваем диапазон
      let s = dist / gref.current.startDist
      s = Math.min(Math.max(s, 0.2), 5)
      const SMOOTH = 0.25
      const targetScale = gref.current.startScale * s
      const currentScale = (lay.node as any).scaleX?.() ?? gref.current.startScale
      const newScale = currentScale + (targetScale - currentScale) * SMOOTH
      const newRot = gref.current.startRot + (ang - gref.current.startAngle) * (180 / Math.PI)

      const c = gref.current.centerCanvas
      const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      canvasLayerRef.current?.batchDraw()
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    if (gref.current.active) { pushHistory(); rebuildLayersFromArt() }
    gref.current.active = false; gref.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  // ===== API для панелей/toolbar =====
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
    const l = layers.find(x=>x.id===id); if (!l) return
    const meta = { ...l.meta, ...patch }
    setMetaOnNode(l.node, meta)
    l.node.visible(meta.visible)
    l.node.getLayer()?.batchDraw()
    setLayers(prev => prev.map(x => x.id===id ? ({ ...x, meta }) : x))
    pushHistory()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  const deleteLayer = (id: string) => {
    const l = layers.find(x => x.id===id); if (!l) return
    pushHistory()
    l.node.destroy()
    rebuildLayersFromArt()
    if (selectedId === id) select(null)
    canvasLayerRef.current?.batchDraw()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    pushHistory()
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    setMetaOnNode(clone, { ...src.meta, name: src.meta.name+" copy" })
    wireSelectable(clone)
    const root = artRootRef.current[side]!; const eraser = eraserRef.current[side]!
    root.add(clone as any); eraser.moveToTop()
    rebuildLayersFromArt()
    select((clone as any)._id)
    canvasLayerRef.current?.batchDraw()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    const root = artRootRef.current[side]!; if (!root) return
    const src = root.findOne((n)=> (n as any)._id===srcId) as Konva.Node | null
    const dst = root.findOne((n)=> (n as any)._id===destId) as Konva.Node | null
    if (!src || !dst) return
    pushHistory()
    if (place === "before") (src as any).zIndex((dst as any).zIndex())
    else (src as any).zIndex((dst as any).zIndex()+1)
    eraserRef.current[side]?.moveToTop()
    rebuildLayersFromArt()
    requestAnimationFrame(attachTransformer)
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    canvasLayerRef.current?.batchDraw()
  }

  // ===== Скачивание (mockup + art) =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []

    // скрываем другую сторону
    layers.forEach(l => { if (l.side !== s && (l.node as any).visible?.()) { (l.node as any).visible(false); hidden.push(l.node) } })

    uiLayerRef.current?.visible(false)

    // 1) с мокапом
    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) только арт
    if (s === "front") frontBgRef.current?.visible(false)
    else backBgRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // вернуть
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    hidden.forEach(n => (n as any).visible?.(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Render =====
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Desktop-панель слоёв — только на десктопе */}
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
            {/* ЕДИНСТВЕННЫЙ «рисующий» слой: фон + арт */}
            <Layer ref={canvasLayerRef} listening={true}>
              {frontMock && (
                <KImage
                  ref={frontBgRef}
                  image={frontMock}
                  visible={side==="front"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
              {backMock && (
                <KImage
                  ref={backBgRef}
                  image={backMock}
                  visible={side==="back"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
              {/* art roots добавляются императивно */}
            </Layer>

            {/* UI-слой для рамки трансформера */}
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
        // История / очистка
        onUndo={()=>undo()}
        onRedo={()=>redo()}
        onClear={()=>clearSide()}
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
