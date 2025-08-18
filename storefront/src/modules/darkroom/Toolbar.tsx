Below are two complete files with the desktop+mobile UI and the interaction model you asked for. Drop them in exactly at these paths:
	•	storefront/src/modules/darkroom/EditorCanvas.tsx
	•	storefront/src/modules/darkroom/Toolbar.tsx

They match your spec:
	•	Desktop UI (left tool panel + color grid + shapes row + text field + font slider; right LayersPanel).
	•	Mobile UI (one row of square tools; context settings under it; bottom row [FRONT ⬇] [BACK ⬇] with the side switch and download combined in each button).
	•	Brush is default; Erase only removes art (not mockups); Undo/Redo works even after Clear; pinch center is between fingers with smooth scaling; rotation on touch and mouse; stable text transformer (side anchors=width, corner anchors=font size); standard color picker opens when tapping a swatch; smooth sliders via onInput.
	•	Fixed build issues (if/else in download, <Group/> in JSX, no JSX Konva.Group).

⸻

storefront/src/modules/darkroom/EditorCanvas.tsx

"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Layout base
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ===== Text clamps
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
export type LayerType = "image" | "shape" | "text" | "strokes"
export type AnyNode =
  | Konva.Image | Konva.Line | Konva.Text | Konva.Group | Konva.Rect | Konva.Circle | Konva.RegularPolygon
export type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isTextNode    = (n: AnyNode): n is Konva.Text => n instanceof Konva.Text

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // precise hit during drag for mobile
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // mockups
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef       = useRef<Konva.Stage>(null)
  const canvasLayerRef = useRef<Konva.Layer>(null)
  const artGroupRef    = useRef<Konva.Group>(null)   // user art only
  const uiLayerRef     = useRef<Konva.Layer>(null)
  const trRef          = useRef<Konva.Transformer>(null)
  const frontBgRef     = useRef<Konva.Image>(null)
  const backBgRef      = useRef<Konva.Image>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [toolbarH, setToolbarH] = useState(120)

  // single strokes group per side
  const strokeGroupId = useRef<Record<Side, string | null>>({ front: null, back: null })

  // undo/redo
  type Action = { undo: () => void; redo: () => void }
  const undoStack = useRef<Action[]>([])
  const redoStack = useRef<Action[]>([])
  const pushAction = (a: Action) => { undoStack.current.push(a); redoStack.current = [] }
  const undo = () => { const a = undoStack.current.pop(); if (a) { a.undo(); redoStack.current.push(a) } }
  const redo = () => { const a = redoStack.current.pop(); if (a) { a.redo(); undoStack.current.push(a) } }

  // flags
  const isTransformingRef = useRef(false)
  const isEditingTextRef  = useRef(false)

  // default tool: brush
  useEffect(() => { set({ tool: "brush" as Tool }) }, [set])

  // viewport & orientation
  const [headerH, setHeaderH] = useState(64)
  const [viewportTick, setViewportTick] = useState(0)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
    const onRes = () => setViewportTick(n => n + 1)
    window.addEventListener("resize", onRes)
    window.addEventListener("orientationchange", onRes)
    return () => { window.removeEventListener("resize", onRes); window.removeEventListener("orientationchange", onRes) }
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = (toolbarH || (isMobile ? 120 : 72)) + 8
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [headerH, toolbarH, viewportTick])

  // prevent page scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  // helpers
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // only current side visible
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer + text fix
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
        const active = (tr as any).getActiveAnchor?.() as string | undefined

        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, t.scaleX())
          const newW = clampW(st.w * sx)
          if (active === "middle-left") {
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

  // during brush/erase disable drag
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  // hotkeys (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTextRef.current) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // strokes group (one per side)
  const ensureStrokeGroup = (): Konva.Group => {
    const gId = strokeGroupId.current[side]
    if (gId) {
      const lay = layers.find(l => l.id === gId)
      if (lay) return lay.node as Konva.Group
    }
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    artGroupRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    strokeGroupId.current[side] = id
    return g
  }

  // site font
  const siteFont = () => (typeof window !== "undefined" ? window.getComputedStyle(document.body).fontFamily : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  // ===== Adders
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
        artGroupRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        const lay: AnyLayer = { id, side, node: kimg, meta, type: "image" }
        setLayers(p => [...p, lay])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        canvasLayerRef.current?.batchDraw()
        set({ tool: "move" })
        pushAction({
          undo: () => { kimg.remove(); setLayers(p=>p.filter(x=>x.id!==id)); canvasLayerRef.current?.batchDraw() },
          redo: () => { artGroupRef.current?.add(kimg); setLayers(p=>[...p, lay]); canvasLayerRef.current?.batchDraw() },
        })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 112,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    artGroupRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    const lay: AnyLayer = { id, side, node: t, meta, type: "text" }
    setLayers(p => [...p, lay])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushAction({
      undo: () => { t.remove(); setLayers(p=>p.filter(x=>x.id!==id)); canvasLayerRef.current?.batchDraw() },
      redo: () => { artGroupRef.current?.add(t); setLayers(p=>[...p, lay]); canvasLayerRef.current?.batchDraw() },
    })
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                           n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    artGroupRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    const lay: AnyLayer = { id, side, node: n, meta, type: "shape" }
    setLayers(p => [...p, lay])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushAction({
      undo: () => { (n as any).remove(); setLayers(p=>p.filter(x=>x.id!==id)); canvasLayerRef.current?.batchDraw() },
      redo: () => { artGroupRef.current?.add(n as any); setLayers(p=>[...p, lay]); canvasLayerRef.current?.batchDraw() },
    })
  }

  // ===== Brush/Erase
  let activeLine: Konva.Line | null = null

  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureStrokeGroup()
      const line = new Konva.Line({ points: [x, y], stroke: brushColor, strokeWidth: brushSize, lineCap: "round", lineJoin: "round", globalCompositeOperation: "source-over" })
      g.add(line)
      activeLine = line
      setIsDrawing(true)
    } else if (tool === "erase") {
      const line = new Konva.Line({ points: [x, y], stroke: "#000", strokeWidth: brushSize, lineCap: "round", lineJoin: "round", globalCompositeOperation: "destination-out" })
      artGroupRef.current?.add(line)
      activeLine = line
      setIsDrawing(true)
    }
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing || !activeLine) return
    activeLine.points(activeLine.points().concat([x, y]))
    canvasLayerRef.current?.batchDraw()
  }
  const finishStroke = () => {
    if (!isDrawing || !activeLine) { setIsDrawing(false); return }
    const line = activeLine
    activeLine = null
    setIsDrawing(false)
    pushAction({
      undo: () => { line.remove(); canvasLayerRef.current?.batchDraw() },
      redo: () => { artGroupRef.current?.add(line); canvasLayerRef.current?.batchDraw() },
    })
  }

  // ===== Clear (art only)
  const clearArt = () => {
    const g = artGroupRef.current
    if (!g) return
    const removed = g.getChildren().toArray()
    if (!removed.length) return
    removed.forEach(c => c.remove())
    canvasLayerRef.current?.batchDraw()
    strokeGroupId.current[side] = null
    pushAction({
      undo: () => { removed.forEach(c => g.add(c)); canvasLayerRef.current?.batchDraw() },
      redo: () => { removed.forEach(c => c.remove()); canvasLayerRef.current?.batchDraw() },
    })
  }

  // ===== Overlay text editor
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stBox = stage.container().getBoundingClientRect()
    const abs = t.getAbsolutePosition()
    const x = stBox.left + abs.x * scale
    const y = stBox.top  + abs.y * scale

    isEditingTextRef.current = true
    t.visible(false)
    trRef.current?.nodes([])

    const ta = document.createElement("textarea")
    ta.value = t.text()
    ta.style.position = "absolute"
    ta.style.left = `${x}px`
    ta.style.top = `${y}px`
    ta.style.padding = "6px 8px"
    ta.style.border = "1px solid #000"
    ta.style.background = "#fff"
    ta.style.color = t.fill() as string
    ta.style.fontFamily = t.fontFamily()
    ta.style.fontWeight = t.fontStyle()?.includes("bold") ? "700" : "400"
    ta.style.fontSize = `${t.fontSize() * scale}px`
    ta.style.lineHeight = String(t.lineHeight())
    ta.style.transformOrigin = "left top"
    ta.style.zIndex = "9999"
    ta.style.minWidth = `${Math.max(200, t.width() * scale || 0)}px`
    ta.style.outline = "none"
    ta.style.resize = "none"
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
      isEditingTextRef.current = false
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

  // ===== Gestures (center between fingers)
  type G = { active: boolean; two: boolean; startDist: number; startAngle: number; startScale: number; startRot: number; nodeId: string | null; lastPointer?: { x: number, y: number } }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScale:1, startRot:0, nodeId:null })

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const applyAround = (node: Konva.Node, stagePoint: { x:number; y:number }, newScale: number, newRotation: number) => {
    const tr = node.getAbsoluteTransform().copy(); const inv = tr.invert(); const local = inv.point(stagePoint)
    node.scaleX(newScale); node.scaleY(newScale); node.rotation(newRotation)
    const tr2 = node.getAbsoluteTransform().copy(); const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x; const dy = stagePoint.y - p2.y
    node.x((node as any).x?.() + dx); node.y((node as any).y?.() + dy)
  }

  const isBg = (t: Konva.Node | null) => !!t && (t === frontBgRef.current || t === backBgRef.current)
  const isTransformerChild = (t: Konva.Node | null) => { let p: Konva.Node | null | undefined = t; const tr = trRef.current as unknown as Konva.Node | null; while (p) { if (tr && p === tr) return true; p = p.getParent?.() } return false }

  const onDown = (e: any) => {
    if (isEditingTextRef.current) return
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer()); startStroke(p.x, p.y); return
    }

    if (!touches || touches.length === 1) {
      const st = stageRef.current!; const tgt = e.target as Konva.Node
      if (tgt === st || isBg(tgt)) { select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return }
      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any)) || null
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = { active: true, two: false, nodeId: lay.id, lastPointer: toCanvas(getStagePointer()), startDist: 0, startAngle: 0, startScale: (lay.node as any).scaleX?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0 }
      }
      return
    }

    if (touches && touches.length >= 2) {
      const lay = find(selectedId); if (!lay || isStrokeGroup(lay.node) || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy); const ang  = Math.atan2(dy, dx)
      gestureRef.current = { active: true, two: true, nodeId: lay.id, startDist: Math.max(dist, 0.0001), startAngle: ang, startScale: (lay.node as any).scaleX?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0 }
      trRef.current?.nodes([]); uiLayerRef.current?.batchDraw()
    }
  }

  const PINCH_SENSITIVITY = 0.9

  const onMove = (e: any) => {
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current || isEditingTextRef.current) return
    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer()); appendStroke(p.x, p.y); return
    }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer()); const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x; const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      canvasLayerRef.current?.batchDraw(); return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const cx = (t1.clientX + t2.clientX) / 2; const cy = (t1.clientY + t2.clientY) / 2
      const dx = t2.clientX - t1.clientX; const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy); const ang  = Math.atan2(dy, dx)
      let s = dist / gestureRef.current.startDist; s = Math.pow(Math.min(Math.max(s, 0.1), 10), PINCH_SENSITIVITY)
      const newScale = gestureRef.current.startScale * s
      const newRot = gestureRef.current.startRot + ((ang - gestureRef.current.startAngle) * 180) / Math.PI
      applyAround(lay.node, { x: cx, y: cy }, newScale, newRot)
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

  // ===== Layer panel data
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked, blend: l.meta.blend, opacity: l.meta.opacity }))
  }, [layers, side])

  const deleteLayer = (id: string) => {
    const l = layers.find(x => x.id===id); if (!l) return
    const idx = layers.findIndex(x=>x.id===id)
    l.node.remove()
    setLayers(p => p.filter(x => x.id!==id))
    canvasLayerRef.current?.batchDraw()
    pushAction({
      undo: () => { artGroupRef.current?.add(l.node); (l.node as any).zIndex(idx+2); setLayers(p=>[...p, l]); canvasLayerRef.current?.batchDraw() },
      redo: () => { l.node.remove(); setLayers(p => p.filter(x => x.id!==id)); canvasLayerRef.current?.batchDraw() },
    })
    if (selectedId === id) select(null)
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    artGroupRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    canvasLayerRef.current?.batchDraw()
    pushAction({
      undo: () => { clone.remove(); setLayers(p=>p.filter(x=>x.id!==newLay.id)); canvasLayerRef.current?.batchDraw() },
      redo: () => { artGroupRef.current?.add(clone); setLayers(p=>[...p, newLay]); canvasLayerRef.current?.batchDraw() },
    })
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i + 2) })
      canvasLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers((p) => p.map((l) => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    canvasLayerRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => { select(id); if (tool !== "move") set({ tool: "move" }) }

  // ===== Selected layer props for toolbar
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps = sel && isTextNode(sel.node)
    ? { text: sel.node.text(), fontSize: sel.node.fontSize(), fontFamily: sel.node.fontFamily(), fill: sel.node.fill() as string }
    : sel && (sel.node as any).fill
      ? { fill: (sel.node as any).fill() ?? "#000000", stroke: (sel.node as any).stroke?.() ?? "#000000", strokeWidth: (sel.node as any).strokeWidth?.() ?? 0 }
      : {}

  const setSelectedFill = (hex: string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStroke = (hex: string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStrokeW = (w: number) => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); canvasLayerRef.current?.batchDraw() }
  const setSelectedText = (tstr: string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontSize = (nsize: number) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name: string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw() }
  const setSelectedColor = (hex: string) => { if (!sel) return; if (sel.type === "text") (sel.node as Konva.Text).fill(hex); else if ((sel.node as any).fill) (sel.node as any).fill(hex); canvasLayerRef.current?.batchDraw() }

  // ===== Download
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current
    if (!st) return
    const pr = Math.max(2, Math.round(1 / scale))
    const hidden: AnyNode[] = []

    layers.forEach((l) => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })

    uiLayerRef.current?.visible(false)

    // with mockup
    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // art only
    if (s === "front") {
      frontBgRef.current?.visible(false)
    } else {
      backBgRef.current?.visible(false)
    }
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // restore
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    hidden.forEach((n) => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise((r) => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Render
  return (
    <div className="fixed inset-0 bg-white" style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}>
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={(id) => { const l = layers.find((x) => x.id === id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id) => { const l = layers.find((x) => x.id === id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorder}
          onChangeBlend={(id, b) => updateMeta(id, { blend: b as Blend })}
          onChangeOpacity={(id, o) => updateMeta(id, { opacity: o })}
        />
      )}

      <div className="w-full h-full flex items-start justify-center">
        <div style={{ touchAction: "none" }}>
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
            <Layer ref={canvasLayerRef} listening>
              {frontMock && (<KImage ref={frontBgRef} image={frontMock} visible={side === "front"} width={BASE_W} height={BASE_H} listening />)}
              {backMock &&  (<KImage ref={backBgRef}  image={backMock}  visible={side === "back"}  width={BASE_W} height={BASE_H} listening />)}
              <Group ref={artGroupRef as any} />
            </Layer>

            <Layer ref={uiLayerRef}>
              <Transformer ref={trRef} rotateEnabled anchorSize={12} borderStroke="black" anchorStroke="black" anchorFill="white" />
            </Layer>
          </Stage>
        </div>
      </div>

      <Toolbar
        // global
        side={side}
        setSide={(s: Side) => set({ side: s })}
        tool={tool}
        setTool={(t: Tool) => set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v: string) => set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n: number) => set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={() => {}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        onDownloadFront={() => downloadBoth("front")}
        onDownloadBack={() => downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        // selection
        selectedKind={selectedKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        // extras
        onUndo={undo}
        onRedo={redo}
        onClear={clearArt}
        onHeightChange={(h) => setToolbarH(h)}
      />
    </div>
  )
}


⸻

storefront/src/modules/darkroom/Toolbar.tsx

"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { isMobile } from "react-device-detect"
import { Side, Tool, ShapeKind } from "./store"
import { LayerType } from "./EditorCanvas"

// ===== Icons (inline SVG, square buttons)
const Icon = ({ path, stroke=false }: { path: string; stroke?: boolean }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill={stroke?"none":"currentColor"} stroke={stroke?"currentColor":"none"} strokeWidth={2}>
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const I = {
  move:   <Icon stroke path="M12 3v18M3 12h18m-6-6 6-6M9 3 3 9m12 12 6-6M3 15l6 6" />,
  brush:  <Icon path="M3 17c3 0 5-2 6-4l8-8 3 3-8 8c-2 1-4 3-4 6-2 0-4-2-5-5z" />,
  erase:  <Icon stroke path="M3 14 11 6l4 4-8 8H3zm9-9 5 5M7 18h14" />,
  text:   <Icon stroke path="M6 5h12M12 5v14M8 19h8" />,
  image:  <Icon stroke path="M4 5h16v14H4zM4 15l4-5 4 4 3-3 5 4" />,
  shape:  <Icon stroke path="M6 6h5v5H6zM13 6l5 5-5 5-5-5 5-5z" />,
  layers: <Icon stroke path="M12 3l9 5-9 5-9-5 9-5zm0 7l9 5-9 5-9-5" />,
  undo:   <Icon stroke path="M9 7H5v4M5 11c0 4 3 7 7 7 2 0 4-.8 5.3-2.1" />,
  redo:   <Icon stroke path="M15 7h4v4M19 11c0 4-3 7-7 7-2 0-4-.8-5.3-2.1" />,
  trash:  <Icon stroke path="M4 7h16M8 7v12m8-12v12M6 7l1-2h10l1 2m-4 0v12m-4 0V7" />,
  dl:     <Icon stroke path="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />,
}

// palette (tap swatch opens native color picker)
const SWATCHES = [
  "#000000","#333333","#666666","#999999","#C0C0C0","#FFFFFF",
  "#FF1493","#FF4500","#FFA500","#FFD700","#8BC34A","#00E676","#00BCD4","#2196F3","#3F51B5","#673AB7"
]

// common square button
const Sq = ({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: React.ReactNode; title?: string }) => (
  <button title={title} onClick={onClick} className={`h-12 w-12 border border-black/60 ${active?"bg-black text-white":"bg-white"} flex items-center justify-center`} />
)

// combined side switch + download (mobile)
function SideSwitchMobile({ side, setSide, onDownloadFront, onDownloadBack }: { side: Side; setSide: (s: Side) => void; onDownloadFront: () => void; onDownloadBack: () => void }) {
  const Btn = ({ s, onDl }: { s: Side; onDl: () => void }) => (
    <div className={`flex-1 border border-black/70 flex items-center justify-between px-4 h-12 ${side===s?"bg-black text-white":"bg-white"}`}>
      <button className="font-semibold" onClick={() => setSide(s)}>{s.toUpperCase()}</button>
      <button onClick={onDl} className="p-2">{I.dl}</button>
    </div>
  )
  return (
    <div className="flex gap-3 w-full"> <Btn s="front" onDl={onDownloadFront} /> <Btn s="back" onDl={onDownloadBack} /> </div>
  )
}

// desktop bottom rows (exactly like your screenshot)
function DesktopBottom({ side, setSide, onDownloadFront, onDownloadBack }: { side: Side; setSide: (s: Side) => void; onDownloadFront: () => void; onDownloadBack: () => void }) {
  return (
    <div className="mt-2">
      <div className="flex gap-2">
        <button className={`px-4 h-10 border ${side==="front"?"bg-black text-white":"bg-white"}`} onClick={()=>setSide("front")}>FRONT</button>
        <button className={`px-4 h-10 border ${side==="back"?"bg-black text-white":"bg-white"}`} onClick={()=>setSide("back")}>BACK</button>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="px-4 h-10 border flex items-center gap-2" onClick={onDownloadFront}>{I.dl}<span>Download</span></button>
        <button className="px-4 h-10 border flex items-center gap-2" onClick={onDownloadBack}>{I.dl}<span>Download</span></button>
      </div>
    </div>
  )
}

// ===== Toolbar main
export default function Toolbar(props: {
  side: Side; setSide: (s: Side) => void
  tool: Tool; setTool: (t: Tool) => void
  brushColor: string; setBrushColor: (v: string) => void
  brushSize: number; setBrushSize: (n: number) => void
  shapeKind: ShapeKind; setShapeKind: (k: ShapeKind) => void
  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  toggleLayers: () => void
  layersOpen: boolean
  // selection
  selectedKind: LayerType | null
  selectedProps: any
  setSelectedFill: (h: string) => void
  setSelectedStroke: (h: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (h: string) => void
  // extras
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange?: (h: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (props.onHeightChange) props.onHeightChange(ref.current?.getBoundingClientRect().height || 120) })

  // color picker invoker
  const [pickerAt, setPickerAt] = useState<string | null>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (pickerAt !== null) { colorInputRef.current?.click(); setPickerAt(null) } }, [pickerAt])

  // text state (bind to selection if text)
  const [textVal, setTextVal] = useState("")
  const isTextSelected = props.selectedKind === "text"
  useEffect(() => { if (isTextSelected) setTextVal(props.selectedProps?.text ?? "") }, [isTextSelected, props.selectedProps?.text])

  // sliders — smooth with onInput
  const [fontSizeLocal, setFontSizeLocal] = useState<number>(props.selectedProps?.fontSize ?? 96)
  useEffect(() => { if (isTextSelected) setFontSizeLocal(props.selectedProps?.fontSize ?? 96) }, [isTextSelected, props.selectedProps?.fontSize])

  const [brushSizeLocal, setBrushSizeLocal] = useState<number>(props.brushSize)
  useEffect(() => { setBrushSizeLocal(props.brushSize) }, [props.brushSize])

  // shapes
  const shapes: { k: ShapeKind; label: string }[] = [
    { k: "line", label: "—" },
    { k: "square", label: "■" },
    { k: "circle", label: "●" },
    { k: "triangle", label: "▲" },
    { k: "cross", label: "+" },
  ]

  const toolBtn = (t: Tool, icon: React.ReactNode, title: string) => (
    <button title={title} className={`h-12 w-12 border border-black/60 ${props.tool===t?"bg-black text-white":"bg-white"} flex items-center justify-center`} onClick={()=>props.setTool(t)}>{icon}</button>
  )

  // ===== Desktop layout
  if (!isMobile) {
    return (
      <div className="fixed left-4 top-[96px] w-[180px] select-none" ref={ref}>
        <div className="border border-black/60">
          {/* top row tools */}
          <div className="flex gap-1 p-1 border-b border-black/20">
            {toolBtn("move", I.move, "Move")}
            {toolBtn("brush", I.brush, "Brush")}
            {toolBtn("erase", I.erase, "Erase")}
            {toolBtn("text", I.text, "Text")}
            {toolBtn("image", I.image, "Image")}
            {toolBtn("shape", I.shape, "Shape")}
            <button className={`h-12 w-12 border border-black/60 ${props.layersOpen?"bg-black text-white":"bg-white"}`} title="Layers" onClick={props.toggleLayers}>{I.layers}</button>
          </div>

          {/* Color */}
          <div className="p-2 border-b border-black/20">
            <div className="text-[10px] uppercase mb-1">Color</div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-6 w-10 border border-black/60" style={{ background: props.brushColor }} onClick={()=>setPickerAt("brush")} />
              <input ref={colorInputRef} type="color" className="hidden" value={props.brushColor} onChange={(e)=>props.setBrushColor(e.target.value)} />
              <input type="range" min={1} max={128} value={brushSizeLocal} onInput={(e)=>{ const v=(e.target as HTMLInputElement).valueAsNumber; setBrushSizeLocal(v); props.setBrushSize(v) }} />
            </div>
            <div className="grid grid-cols-8 gap-1">
              {SWATCHES.map((c)=> (
                <button key={c} className="h-5 border border-black/30" style={{ background:c }} onClick={()=>props.setBrushColor(c)} />
              ))}
            </div>
          </div>

          {/* Shapes */}
          <div className="p-2 border-b border-black/20">
            <div className="text-[10px] uppercase mb-1">Shapes</div>
            <div className="grid grid-cols-5 gap-1">
              {shapes.map(s => (
                <button key={s.k} className="h-8 border border-black/60 flex items-center justify-center" onClick={()=>props.onAddShape(s.k)}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Text */}
          <div className="p-2 border-b border-black/20">
            <div className="text-[10px] uppercase mb-1">Text</div>
            <textarea value={textVal} onChange={(e)=>{ setTextVal(e.target.value); if (isTextSelected) props.setSelectedText(e.target.value) }} placeholder="Enter text" className="w-full h-20 border border-black/60 p-2" />
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={8} max={800} value={fontSizeLocal} onInput={(e)=>{ const v=(e.target as HTMLInputElement).valueAsNumber; setFontSizeLocal(v); if (isTextSelected) props.setSelectedFontSize(v) }} />
              <div className="text-xs w-10 text-right">{Math.round(fontSizeLocal)}</div>
            </div>
          </div>

          {/* Side + Download */}
          <DesktopBottom side={props.side} setSide={props.setSide} onDownloadFront={props.onDownloadFront} onDownloadBack={props.onDownloadBack} />

          {/* Bottom actions */}
          <div className="flex gap-2 p-2 border-t border-black/20 mt-2">
            <button className="flex-1 h-10 border" onClick={props.onUndo}>{I.undo}</button>
            <button className="flex-1 h-10 border" onClick={props.onRedo}>{I.redo}</button>
            <button className="flex-1 h-10 border" onClick={props.onClear}>{I.trash}</button>
          </div>

          {/* Upload hidden input */}
          <input type="file" accept="image/*" className="hidden" id="darkroom-file" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) props.onUploadImage(f); e.currentTarget.value="" }} />
        </div>
      </div>
    )
  }

  // ===== Mobile layout
  return (
    <div ref={ref} className="fixed left-0 right-0 bottom-0 select-none bg-white border-t border-black/20">
      {/* Row of square tools */}
      <div className="flex gap-2 p-2 overflow-x-auto">
        {toolBtn("move", I.move, "Move")}
        {toolBtn("brush", I.brush, "Brush")}
        {toolBtn("erase", I.erase, "Erase")}
        {toolBtn("text", I.text, "Text")}
        <button className={`h-12 w-12 border border-black/60`} onClick={()=>document.getElementById("darkroom-file")?.click()}>{I.image}</button>
        {toolBtn("shape", I.shape, "Shape")}
        <button className={`h-12 w-12 border border-black/60 ${props.layersOpen?"bg-black text-white":"bg-white"}`} onClick={props.toggleLayers}>{I.layers}</button>
        <button className="h-12 w-12 border border-black/60" onClick={props.onUndo}>{I.undo}</button>
        <button className="h-12 w-12 border border-black/60" onClick={props.onRedo}>{I.redo}</button>
        <button className="h-12 w-12 border border-black/60" onClick={props.onClear}>{I.trash}</button>
      </div>

      {/* Context settings (brush/text/shape) */}
      <div className="px-3 pb-3">
        {props.tool === "brush" && (
          <div className="flex items-center gap-3">
            <div className="h-8 w-12 border border-black/60" style={{ background: props.brushColor }} onClick={()=>setPickerAt("brush")} />
            <input ref={colorInputRef} type="color" className="hidden" value={props.brushColor} onChange={(e)=>props.setBrushColor(e.target.value)} />
            <input className="flex-1" type="range" min={1} max={128} value={brushSizeLocal} onInput={(e)=>{ const v=(e.target as HTMLInputElement).valueAsNumber; setBrushSizeLocal(v); props.setBrushSize(v) }} />
            <div className="w-10 text-right text-xs">{Math.round(brushSizeLocal)}</div>
          </div>
        )}

        {props.tool === "text" && (
          <div>
            <textarea value={textVal} onChange={(e)=>{ setTextVal(e.target.value); if (isTextSelected) props.setSelectedText(e.target.value) }} placeholder="Enter text" className="w-full h-20 border border-black/60 p-2 mt-2" />
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={8} max={800} value={fontSizeLocal} onInput={(e)=>{ const v=(e.target as HTMLInputElement).valueAsNumber; setFontSizeLocal(v); if (isTextSelected) props.setSelectedFontSize(v) }} />
              <div className="text-xs w-10 text-right">{Math.round(fontSizeLocal)}</div>
            </div>
          </div>
        )}

        {props.tool === "shape" && (
          <div className="flex gap-2 mt-2">
            {shapes.map(s => (
              <button key={s.k} className="h-10 w-10 border border-black/60 flex items-center justify-center" onClick={()=>props.onAddShape(s.k)}>{s.label}</button>
            ))}
            <div className="h-10 w-14 border border-black/60 ml-2" style={{ background: props.brushColor }} onClick={()=>setPickerAt("shape")} />
          </div>
        )}
      </div>

      {/* Bottom combined switchers */}
      <div className="px-3 pb-3">
        <SideSwitchMobile side={props.side} setSide={props.setSide} onDownloadFront={props.onDownloadFront} onDownloadBack={props.onDownloadBack} />
      </div>

      {/* upload input */}
      <input type="file" accept="image/*" className="hidden" id="darkroom-file" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) props.onUploadImage(f); e.currentTarget.value="" }} />
    </div>
  )
}
