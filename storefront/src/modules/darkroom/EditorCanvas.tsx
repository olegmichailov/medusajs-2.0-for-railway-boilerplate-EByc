"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/* ================== CONSTANTS ================== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

/* ================== TYPES ================== */
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

/* helpers to detect */
const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

/* ================== EDITOR ================== */
export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // конва: нормальная работа touchmove при драгге
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef        = useRef<Konva.Stage>(null)
  const canvasLayerRef  = useRef<Konva.Layer>(null)   // единый слой: фон + арт
  const uiLayerRef      = useRef<Konva.Layer>(null)
  const trRef           = useRef<Konva.Transformer>(null)
  const frontBgRef      = useRef<Konva.Image>(null)
  const backBgRef       = useRef<Konva.Image>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [, force] = useState(0) // небольшой форс-ререндер для UI с лайв-нодами

  // stroke-сессии
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef = useRef<Tool | null>(null)

  // флаги
  const isTransformingRef = useRef(false)

  // layout / scale
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])
  useEffect(() => {
    const onResize = () => force(x => x + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 4
    const padBottom = isMobile ? 160 : 72 // мобилка — побольше мокап
    const maxW = vw - 16
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // фикс скролла/жестов
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
  const bringToFront = (n: AnyNode) => {
    const layer = canvasLayerRef.current
    if (!layer) return
    // zIndex: 0,1 — фоны; арт начинается с 2
    n.zIndex(layer.children.length - 1)
    layer.batchDraw()
  }

  // только активная сторона видима
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  /* ========== TRANSFORMER: текст без дрожи, клампы, анкер слева/справа ========== */
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || tool !== "move"

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    ;(n as any).draggable(true)

    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)

    // boundBoxFunc: защитим от инверсий/негативных скейлов
    tr.boundBoxFunc((oldBox, newBox) => {
      const min = 5
      const nx = Math.max(newBox.width,  min)
      const ny = Math.max(newBox.height, min)
      return { ...newBox, width: nx, height: ny }
    })

    // guard: чтобы жесты не конфликтовали
    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.off(".guard")
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      n.off(".textfix")

      const clampW  = (val:number) => Math.max(TEXT_MIN_W,  Math.min(val, TEXT_MAX_W))
      const clampFS = (val:number) => Math.max(TEXT_MIN_FS, Math.min(val, TEXT_MAX_FS))

      const onTransform = () => {
        const t = n as Konva.Text
        const activeAnchor = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        // ширина по боковым анкерям
        if (activeAnchor && (activeAnchor.includes("middle-left") || activeAnchor.includes("middle-right"))) {
          const preW = t.width()
          const preX = t.x()
          const preScaleX = t.scaleX()
          const rightEdge = preX + preW * preScaleX

          const nextW = clampW(preW * preScaleX)
          t.width(nextW)
          if (activeAnchor.includes("left")) {
            t.x(rightEdge - nextW)
          } // справа — x не трогаем
          t.scaleX(1)
        } else {
          // угловые — масштаб шрифта
          const s = Math.max(t.scaleX(), t.scaleY())
          const nextFS = clampFS((t.fontSize() || 12) * s)
          t.fontSize(nextFS)
          t.scaleX(1); t.scaleY(1)
        }
        t.getLayer()?.batchDraw()
      }
      const onEnd = () => { onTransform() }

      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
    } else {
      tr.keepRatio(true)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right"])
      n.off(".textfix")
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side, tool])

  // во время brush/erase — отключаем драг
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  /* ========== SHORTCUTS ========== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (e.key === "ArrowLeft")  { (n as any).x(((n as any).x?.() ?? 0)-step) }
      if (e.key === "ArrowRight") { (n as any).x(((n as any).x?.() ?? 0)+step) }
      if (e.key === "ArrowUp")    { (n as any).y(((n as any).y?.() ?? 0)-step) }
      if (e.key === "ArrowDown")  { (n as any).y(((n as any).y?.() ?? 0)+step) }
      n.getLayer()?.batchDraw()
      force(x=>x+1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  /* ========== BRUSH SESSION ========== */
  const finalizeBrushSession = (s: Side) => { currentStrokeId.current[s] = null }
  const createStrokeGroup = (atTop=true): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    canvasLayerRef.current?.add(g)
    if (atTop) bringToFront(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      // закрываем прошлую, создаём новую сверху
      finalizeBrushSession(side)
      createStrokeGroup(true)
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    if (lastToolRef.current === "brush" && tool !== "brush") {
      finalizeBrushSession(side)
    }
    lastToolRef.current = tool
  }, [tool, side])

  /* ========== SITE FONT ========== */
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  /* ========== ADD: IMAGE / TEXT / SHAPE ========== */
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
        ;(kimg as any).setAttr("imageSrc", r.result as string) // для undo/redo восстановления
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        canvasLayerRef.current?.add(kimg)
        bringToFront(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        canvasLayerRef.current?.batchDraw()
        set({ tool: "move" })
        pushHistory()
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
    canvasLayerRef.current?.add(t)
    bringToFront(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushHistory()
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
    canvasLayerRef.current?.add(n as any)
    bringToFront(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
    pushHistory()
  }

  /* ========== ERASE как маска выбранного слоя ========== */
  const ensureWrappedForErase = (l: AnyLayer): Konva.Group => {
    const n = l.node
    // уже в группе
    if (n.getParent() !== canvasLayerRef.current) {
      const g = n.getParent() as Konva.Group
      if (!g.isCached()) g.cache()
      return g
    }
    // создаём группу-обёртку
    const g = new Konva.Group({
      x: (n as any).x?.() ?? 0, y: (n as any).y?.() ?? 0,
      rotation: (n as any).rotation?.() ?? 0,
      scaleX: (n as any).scaleX?.() ?? 1, scaleY: (n as any).scaleY?.() ?? 1
    })
    ;(g as any).id(uid())
    canvasLayerRef.current!.add(g)
    bringToFront(g)
    ;(n as any).x?.(0); (n as any).y?.(0); (n as any).rotation?.(0)
    ;(n as any).scaleX?.(1); (n as any).scaleY?.(1)
    g.add(n as any)
    applyMeta(g as any, l.meta)
    g.cache() // важно для destination-out
    setLayers(p => p.map(it => it.id === l.id ? { ...it, node: g } : it))
    select(l.id)
    return g
  }

  const pickTopAt = (sx: number, sy: number): AnyLayer | null => {
    const st = stageRef.current; if (!st) return null
    const n = st.getIntersection({ x: sx, y: sy }, "Shape")
    if (!n) return null
    const hit = layers.find(l => l.node === n || l.node === (n.getParent() as any))
    return hit ?? null
  }

  const recacheGroup = (g: Konva.Group) => { g.clearCache(); g.cache() }

  /* ========== DRAW / ERASE FLOW ========== */
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      if (!currentStrokeId.current[side]) {
        createStrokeGroup(true)
      }
      const gid = currentStrokeId.current[side]!
      const g = find(gid)!.node as Konva.Group
      bringToFront(g)
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
      let sel = find(selectedId)
      if (!sel) {
        const sp = stageRef.current?.getPointerPosition() || { x: x * scale, y: y * scale }
        sel = pickTopAt(sp.x, sp.y)
        if (sel) select(sel.id)
      }
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
      recacheGroup(g)
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
      canvasLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const sel = find(selectedId)
      const g = sel ? ensureWrappedForErase(sel) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      if (g) recacheGroup(g)
      canvasLayerRef.current?.batchDraw()
    }
  }

  const finishStroke = () => {
    if (isDrawing) {
      setIsDrawing(false)
      if (tool === "brush") pushHistory()
      if (tool === "erase") pushHistory()
    }
  }

  /* ========== TEXT OVERLAY EDITOR ========== */
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
      pushHistory()
    }

    ta.addEventListener("input", autoGrow)
    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
  }

  /* ========== GESTURES (mobile) ========== */
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
    node.x((node as any).x?.() + dx)
    node.y((node as any).y?.() + dy)
  }

  const isBgTarget = (t: Konva.Node | null) =>
    !!t && (t === frontBgRef.current || t === backBgRef.current)

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
    const touches: Touch[] | undefined = (e.evt.touches && Array.from(e.evt.touches)) as any

    if (isTransformerChild(e.target)) return

    // рисование
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      if (tool === "brush" && !currentStrokeId.current[side]) createStrokeGroup(true)
      startStroke(p.x, p.y)
      return
    }

    // 1 палец — выбор/перетаскивание
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
          startScale: (lay.node as any).scaleX?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

    // 2 пальца — масштаб/поворот вокруг центра между пальцами
    if (touches && touches.length >= 2) {
      const pos = Konva.Util.getPointerPositions(stageRef.current!) || []
      if (pos.length < 2) return
      const lay = find(selectedId)
      if (!lay || isStrokeGroup(lay.node) || lay.meta.locked) return

      const p1 = pos[0], p2 = pos[1]
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
      const lay = find(gestureRef.current.nodeId); if (!lay) return
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
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const pos = Konva.Util.getPointerPositions(stageRef.current!) || []
      if (pos.length < 2) return
      const p1 = pos[0], p2 = pos[1]
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      const targetScale = (gestureRef.current.startScale || 1) * (dist / gestureRef.current.startDist)
      // сглаживание, чтобы не «прыгало»
      const currentScale = (lay.node as any).scaleX?.() ?? 1
      const newScale = Math.min(Math.max(currentScale + (targetScale - currentScale) * 0.25, 0.1), 10)
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

  /* ========== PANEL / LAYERS API ========== */
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

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    canvasLayerRef.current?.batchDraw()
    pushHistory()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    canvasLayerRef.current?.add(clone)
    bringToFront(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    canvasLayerRef.current?.batchDraw()
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i + 2) }) // 0..1 фоны
      canvasLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); pushHistory() })
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    canvasLayerRef.current?.batchDraw()
    pushHistory()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
    attachTransformer()
  }

  /* ========== SELECTED PROPS API (для Toolbar) ========== */
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); canvasLayerRef.current?.batchDraw(); force(x=>x+1); pushHistory() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); canvasLayerRef.current?.batchDraw(); force(x=>x+1); pushHistory() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); canvasLayerRef.current?.batchDraw(); force(x=>x+1); pushHistory() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw(); force(x=>x+1) }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw(); force(x=>x+1) }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw(); force(x=>x+1) }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text")      (sel.node as Konva.Text).fill(hex)
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    if ((sel.node as any).strokeWidth?.() > 0 && (sel.node as any).stroke) (sel.node as any).stroke(hex)
    canvasLayerRef.current?.batchDraw()
    force(x=>x+1)
    pushHistory()
  }

  /* ========== UNDO / REDO / CLEAR (сериализация) ========== */
  type SavedStroke = { points:number[]; stroke:string; strokeWidth:number }
  type SavedLayer =
    | { type:"image"; side:Side; meta:BaseMeta; imageSrc:string; x:number;y:number;width:number;height:number; rotation:number; scaleX:number; scaleY:number }
    | { type:"text";  side:Side; meta:BaseMeta; text:string; x:number;y:number;width:number; fontSize:number; fontFamily:string; fontStyle?:string; fill:string; align?:string; rotation?:number }
    | { type:"shape"; side:Side; meta:BaseMeta; kind:ShapeKind; attrs:any }
    | { type:"strokes"; side:Side; meta:BaseMeta; lines:SavedStroke[] }

  const historyRef = useRef<{ undo: SavedLayer[][]; redo: SavedLayer[][] }>({ undo: [], redo: [] })

  const snapshot = (): SavedLayer[] => {
    const out: SavedLayer[] = []
    layers.forEach(l => {
      if (!l.node || !l.meta.visible) {
        // даже скрытые надо бы сохранять, но сейчас — только видимые
      }
      if (l.type === "image") {
        const img = l.node as Konva.Image
        out.push({
          type: "image", side: l.side, meta: l.meta,
          imageSrc: (img as any).getAttr("imageSrc") || "",
          x: img.x(), y: img.y(), width: img.width(), height: img.height(),
          rotation: img.rotation(), scaleX: img.scaleX(), scaleY: img.scaleY()
        })
      } else if (l.type === "text") {
        const t = l.node as Konva.Text
        out.push({
          type:"text", side:l.side, meta:l.meta,
          text: t.text(), x:t.x(), y:t.y(), width:t.width(),
          fontSize: t.fontSize(), fontFamily: t.fontFamily(), fontStyle: t.fontStyle(),
          fill: (t.fill() as string) || "#000", align: t.align(), rotation: t.rotation()
        })
      } else if (l.type === "shape") {
        const n = l.node as any
        const attrs = {
          x: n.x?.(), y: n.y?.(), width: n.width?.(), height: n.height?.(),
          radius: n.radius?.(), points: n.points?.(), sides: n.sides?.(),
          fill: n.fill?.(), stroke: n.stroke?.(), strokeWidth: n.strokeWidth?.(),
          rotation: n.rotation?.(), scaleX: n.scaleX?.(), scaleY: n.scaleY?.()
        }
        // определим kind по типу
        let kind: ShapeKind = "square"
        if (n.className === "Circle") kind = "circle"
        else if (n.className === "RegularPolygon") kind = "triangle"
        else if (n.className === "Line" && n.points?.()?.length===4) kind = "line"
        else if (n.className === "Group") kind = "cross"
        out.push({ type:"shape", side:l.side, meta:l.meta, kind, attrs })
      } else if (l.type === "strokes") {
        const g = l.node as Konva.Group
        const lines = g.getChildren((n)=>n.className==="Line").map((ln:any)=>({
          points: ln.points(), stroke: ln.stroke(), strokeWidth: ln.strokeWidth()
        }))
        out.push({ type:"strokes", side:l.side, meta:l.meta, lines })
      }
    })
    return out
  }

  const restore = (state: SavedLayer[]) => {
    // очистим всё арт (обе стороны)
    setLayers(prev => {
      prev.forEach(l => l.node.destroy())
      return []
    })
    const add = (lay: AnyLayer) => setLayers(p=>[...p, lay])

    state.forEach(s => {
      if (s.side !== "front" && s.side !== "back") return
      if (s.type === "image") {
        const img = new window.Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          const k = new Konva.Image({ image: img, x:s.x, y:s.y, width:s.width, height:s.height, rotation:s.rotation, scaleX:s.scaleX, scaleY:s.scaleY })
          ;(k as any).id(uid()); (k as any).setAttr("imageSrc", s.imageSrc)
          canvasLayerRef.current?.add(k); applyMeta(k as any, s.meta); k.visible(s.meta.visible && s.side===side)
          bringToFront(k)
          const lay: AnyLayer = { id:(k as any)._id, side:s.side, node:k, meta:s.meta, type:"image" }
          k.on("click tap", ()=>select(lay.id))
          add(lay); canvasLayerRef.current?.batchDraw()
        }
        img.src = s.imageSrc
      } else if (s.type === "text") {
        const t = new Konva.Text({
          text:s.text, x:s.x, y:s.y, width:s.width, fontSize:s.fontSize, fontFamily:s.fontFamily,
          fontStyle:s.fontStyle, fill:s.fill, align:s.align, rotation:s.rotation
        })
        ;(t as any).id(uid())
        canvasLayerRef.current?.add(t); applyMeta(t as any, s.meta); t.visible(s.meta.visible && s.side===side)
        bringToFront(t)
        const lay: AnyLayer = { id:(t as any)._id, side:s.side, node:t, meta:s.meta, type:"text" }
        t.on("click tap", ()=>select(lay.id)); t.on("dblclick dbltap", ()=>startTextOverlayEdit(t))
        add(lay)
      } else if (s.type === "shape") {
        let n: AnyNode
        const a = (s as any).attrs || {}
        if (s.kind==="circle")        n = new Konva.Circle(a)
        else if (s.kind==="square")   n = new Konva.Rect(a)
        else if (s.kind==="triangle") n = new Konva.RegularPolygon(a)
        else if (s.kind==="cross")    { const g=new Konva.Group({x:a.x,y:a.y,rotation:a.rotation,scaleX:a.scaleX,scaleY:a.scaleY}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:a.fill})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:a.fill})); n=g }
        else                          n = new Konva.Line(a)
        ;(n as any).id(uid())
        canvasLayerRef.current?.add(n as any); applyMeta(n as any, s.meta); (n as any).visible(s.meta.visible && s.side===side)
        bringToFront(n as any)
        const lay: AnyLayer = { id:(n as any)._id, side:s.side, node:n, meta:s.meta, type:"shape" }
        ;(n as any).on("click tap", ()=>select(lay.id))
        add(lay)
      } else if (s.type === "strokes") {
        const g = new Konva.Group({ x:0, y:0 }); (g as any)._isStrokes = true; (g as any).id(uid())
        s.lines.forEach((ln)=> g.add(new Konva.Line({ points: ln.points, stroke: ln.stroke, strokeWidth: ln.strokeWidth, lineCap:"round", lineJoin:"round" })))
        canvasLayerRef.current?.add(g); applyMeta(g as any, s.meta); g.visible(s.meta.visible && s.side===side)
        bringToFront(g as any)
        const lay: AnyLayer = { id:(g as any)._id, side:s.side, node:g, meta:s.meta, type:"strokes" }
        add(lay)
      }
    })
    canvasLayerRef.current?.batchDraw()
  }

  const pushHistory = () => {
    const snap = snapshot()
    historyRef.current.undo.push(snap)
    historyRef.current.redo = []
  }

  const doUndo = () => {
    const hist = historyRef.current
    if (hist.undo.length === 0) return
    const current = snapshot()
    const prev = hist.undo.pop()!
    hist.redo.push(current)
    restore(prev)
  }
  const doRedo = () => {
    const hist = historyRef.current
    if (hist.redo.length === 0) return
    const current = snapshot()
    const next = hist.redo.pop()!
    hist.undo.push(current)
    restore(next)
  }
  const doClear = () => {
    pushHistory()
    setLayers(p => {
      p.filter(l=>l.side===side).forEach(l => l.node.destroy())
      return p.filter(l=>l.side!==side)
    })
    canvasLayerRef.current?.batchDraw()
  }

  useEffect(() => {
    const u = () => doUndo()
    const r = () => doRedo()
    const c = () => doClear()
    window.addEventListener("darkroom:undo", u as any)
    window.addEventListener("darkroom:redo", r as any)
    window.addEventListener("darkroom:clear", c as any)
    return () => {
      window.removeEventListener("darkroom:undo", u as any)
      window.removeEventListener("darkroom:redo", r as any)
      window.removeEventListener("darkroom:clear", c as any)
    }
  }, [side, layers])

  /* ========== DOWNLOAD (mockup + art) ========== */
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []

    // скрываем другую сторону
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })

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
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  /* ========== RENDER ========== */
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
      {/* Desktop панель слоёв */}
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
              {/* арт-ноды добавляются сюда imperatively */}
            </Layer>

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
