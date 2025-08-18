"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Макет (канвас макета крупнее на мобилке за счёт максимального масштаба) =====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ===== Ограничители текста =====
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => "n_" + Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes" | "erase"
type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon

type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isSessionGroup = (n: AnyNode) => n instanceof Konva.Group && (((n as any)._isStrokes) || ((n as any)._isErase))
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text
const isImgOrRect   = (n: AnyNode) => n instanceof Konva.Image || n instanceof Konva.Rect || n instanceof Konva.RegularPolygon || n instanceof Konva.Circle

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  // Мобилка — по умолчанию кисть
  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef        = useRef<Konva.Stage>(null)
  const canvasLayerRef  = useRef<Konva.Layer>(null)   // фон + арт-группы
  const uiLayerRef      = useRef<Konva.Layer>(null)
  const trRef           = useRef<Konva.Transformer>(null)
  const frontBgRef      = useRef<Konva.Image>(null)
  const backBgRef       = useRef<Konva.Image>(null)
  const frontArtRef     = useRef<Konva.Group>(null)
  const backArtRef      = useRef<Konva.Group>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })

  // текущие «сессии» (группы) для brush/erase
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef     = useRef<Tool | null>(null)
  const isTransformingRef = useRef(false)

  // ----- Вёрстка -----
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 144 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    // На мобилке позволяем макету занимать больше пространства
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // Показ только активной стороны
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    if (frontBgRef.current)  frontBgRef.current.visible(side === "front")
    if (backBgRef.current)   backBgRef.current.visible(side === "back")
    if (frontArtRef.current) frontArtRef.current.visible(side === "front")
    if (backArtRef.current)  backArtRef.current.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer (без дёрганий) =====
  const detachGuards = useRef<(() => void) | null>(null)
  const startBoxRef  = useRef<{ x:number; y:number; w:number; h:number; fs?:number } | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isSessionGroup(n) || tool !== "move"

    if (detachGuards.current) { detachGuards.current(); detachGuards.current = null }

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)
    tr.keepRatio(false)
    tr.enabledAnchors([
      "top-left","top-right","bottom-left","bottom-right",
      "middle-left","middle-right","top-center","bottom-center"
    ])

    const onStart = () => {
      isTransformingRef.current = true
      if (isTextNode(n)) {
        startBoxRef.current = { x: n.x(), y: n.y(), w: n.width() || 0, h: n.height() || 0, fs: n.fontSize() }
      } else {
        const rect = n.getClientRect()
        startBoxRef.current = { x: (n as any).x?.() ?? rect.x, y: (n as any).y?.() ?? rect.y, w: rect.width, h: rect.height }
      }
    }

    const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(v, hi))
    const onTransform = () => {
      const sb = startBoxRef.current
      if (!sb) return
      const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

      if (isTextNode(n)) {
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, n.scaleX())
          const newW = clamp(sb.w * sx, TEXT_MIN_W, TEXT_MAX_W)
          if (active === "middle-left") { n.width(newW); n.x(sb.x + (sb.w - newW)) }
          else                          { n.width(newW); n.x(sb.x) }
          n.scaleX(1)
        } else {
          const s = Math.max(n.scaleX(), n.scaleY())
          const nextFS = clamp((sb.fs ?? n.fontSize()) * s, TEXT_MIN_FS, TEXT_MAX_FS)
          n.fontSize(nextFS)
          n.scaleX(1); n.scaleY(1)
        }
      } else if (isImgOrRect(n)) {
        let newW = sb.w, newH = sb.h, newX = sb.x, newY = sb.y
        const sx = (n as any).scaleX?.() ?? 1
        const sy = (n as any).scaleY?.() ?? 1
        const corner =
          active === "top-left" || active === "top-right" ||
          active === "bottom-left" || active === "bottom-right"

        if (corner) {
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          newW = Math.max(1, sb.w * s)
          newH = Math.max(1, sb.h * s)
          if (active === "top-left")     { newX = sb.x + (sb.w - newW); newY = sb.y + (sb.h - newH) }
          if (active === "top-right")    { newX = sb.x;                 newY = sb.y + (sb.h - newH) }
          if (active === "bottom-left")  { newX = sb.x + (sb.w - newW); newY = sb.y }
          if (active === "bottom-right") { newX = sb.x;                 newY = sb.y }
        } else if (active === "middle-left" || active === "middle-right") {
          newW = Math.max(1, sb.w * sx)
          if (active === "middle-left") newX = sb.x + (sb.w - newW)
          else                          newX = sb.x
          newH = sb.h
        } else if (active === "top-center" || active === "bottom-center") {
          newH = Math.max(1, sb.h * sy)
          if (active === "top-center")  newY = sb.y + (sb.h - newH)
          else                          newY = sb.y
          newW = sb.w
        }

        ;(n as any).width?.(newW)
        ;(n as any).height?.(newH)
        ;(n as any).x?.(newX)
        ;(n as any).y?.(newY)
        ;(n as any).scaleX?.(1)
        ;(n as any).scaleY?.(1)
      } else {
        // Примитивы: пропорционально по углам
        const sx = (n as any).scaleX?.() ?? 1
        const sy = (n as any).scaleY?.() ?? 1
        const s = Math.max(Math.abs(sx), Math.abs(sy))
        if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          n.radius(Math.max(1, (Math.min(sb.w, sb.h) / 2) * s))
        }
        ;(n as any).scaleX?.(1); (n as any).scaleY?.(1)
      }

      n.getLayer()?.batchDraw()
    }

    const onEnd = () => { isTransformingRef.current = false; onTransform(); startBoxRef.current = null }

    n.on("transformstart.guard", onStart)
    n.on("transform.guard", onTransform)
    n.on("transformend.guard", onEnd)
    detachGuards.current = () => n.off(".guard")

    tr.getLayer()?.batchDraw()
  }

  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // Во время рисования — отключаем drag. При смене инструмента — закрываем сессии.
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isSessionGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    if (tool !== "brush") currentStrokeId.current[side] = null
    if (tool !== "erase") currentEraseId.current[side]  = null
  }, [tool, layers, side])

  // ===== Добавление/сессии =====
  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
  }

  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        const id = uid(); kimg.id(id)
        const meta = baseMeta(`image ${seqs.image}`)
        artGroup(side).add(kimg)
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        canvasLayerRef.current?.batchDraw()
        set({ tool: "move" })
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
    const id = uid(); t.id(id)
    const meta = baseMeta(`text ${seqs.text}`)
    artGroup(side).add(t)
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    const id = uid(); (n as any).id?.(id)
    const meta = baseMeta(`shape ${seqs.shape}`)
    artGroup(side).add(n as any)
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // Brush-сессия: отдельная группа поверх
  const ensureStrokeGroup = (): AnyLayer => {
    let gid = currentStrokeId.current[side]
    if (gid) return layers.find(l => l.id === gid)! as AnyLayer
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isStrokes = true
    const id = uid(); g.id(id)
    artGroup(side).add(g); g.zIndex(artGroup(side).children.length - 1)
    const lay: AnyLayer = { id, side, node: g, meta: baseMeta(`strokes ${seqs.strokes}`), type: "strokes" }
    setLayers(p => [...p, lay]); setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return lay
  }

  // Erase-сессия: глобальная маска поверх (destination-out)
  const ensureEraseGroup = (): AnyLayer => {
    let gid = currentEraseId.current[side]
    if (gid) return layers.find(l => l.id === gid)! as AnyLayer
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isErase = true
    ;(g as any).globalCompositeOperation = "destination-out"
    const id = uid(); g.id(id)
    artGroup(side).add(g); g.zIndex(artGroup(side).children.length - 1)
    const lay: AnyLayer = { id, side, node: g, meta: baseMeta(`erase ${seqs.erase}`), type: "erase" }
    setLayers(p => [...p, lay]); setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    return lay
  }

  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      ensureStrokeGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    if (tool === "erase" && lastToolRef.current !== "erase") {
      ensureEraseGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    lastToolRef.current = tool
  }, [tool, side])

  // ===== Рисование =====
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureStrokeGroup().node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "source-over",
      })
      g.add(line); setIsDrawing(true)
      return
    }
    if (tool === "erase") {
      const g = ensureEraseGroup().node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
      })
      g.add(line); setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const children = artGroup(side).children()
    const top = children[children.length - 1]
    if (!(top instanceof Konva.Group)) return
    const last = top.getChildren().at(-1)
    const line = last instanceof Konva.Line ? last : undefined
    if (!line) return
    line.points(line.points().concat([x, y]))
    canvasLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

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
    ta.focus(); ta.select()

    const autoGrow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 3) + "px" }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) t.text(ta.value)
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

  // ===== Жесты (центр строго между пальцами) =====
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

  const isBgTarget = (t: Konva.Node | null) => !!t && (t === frontBgRef.current || t === backBgRef.current)
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
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
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    // Рисование
    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer())
      if (tool === "brush" && !currentStrokeId.current[side]) ensureStrokeGroup()
      if (tool === "erase" && !currentEraseId.current[side])  ensureEraseGroup()
      startStroke(p.x, p.y)
      return
    }

    // Один палец — выбор/перемещение
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
      if (lay && !isSessionGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          active: true, two: false, nodeId: lay.id,
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

    // Два пальца — масштаб/поворот (центр строго между пальцами)
    if (touches && touches.length >= 2) {
      const lay = find(selectedId)
      if (!lay || isSessionGroup(lay.node) || lay.meta.locked) return

      const rect = stageRef.current!.container().getBoundingClientRect()
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top }
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top }
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
      canvasLayerRef.current?.batchDraw()
      return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return

      const rect = stageRef.current!.container().getBoundingClientRect()
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX - rect.left, y: t1.clientY - rect.top }
      const p2 = { x: t2.clientX - rect.left, y: t2.clientY - rect.top }
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      const rawS = dist / gestureRef.current.startDist
      const s = Math.min(Math.max(rawS, 0.1), 10)

      const baseScale = gestureRef.current.startScaleX
      const newScale = baseScale * s
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

  // ===== Слои/мета =====
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name || l.type, type: l.type,
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
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    const newId = uid(); (clone as any).id?.(newId)
    artGroup(side).add(clone as any)
    const newLay: AnyLayer = { id: newId, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newId)
    setLayers(p => [...p, newLay]); select(newId)
    clone.zIndex(artGroup(side).children.length - 1)
    canvasLayerRef.current?.batchDraw()
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
      canvasLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      l.node.opacity(meta.opacity)
      ;(l.node as any).globalCompositeOperation = meta.blend
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    canvasLayerRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // Свойства выделенного для тулбара
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); canvasLayerRef.current?.batchDraw() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    canvasLayerRef.current?.batchDraw()
  }

  const clearArt = () => {
    const g = artGroup(side)
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    canvasLayerRef.current?.batchDraw()
  }

  // ===== Скачивание =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []

    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    artGroup("front").visible(s === "front")
    artGroup("back").visible(s === "back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    if (s === "front") frontBgRef.current?.visible(false)
    else backBgRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    artGroup("front").visible(side === "front")
    artGroup("back").visible(side === "back")
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 200))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

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
          onChangeBlend={()=>{}}
          onChangeOpacity={()=>{}}
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
              {frontMock && (<KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true}/>)}
              {backMock  && (<KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true}/>)}
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
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
        onClear={clearArt}
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
        mobileTopOffset={padTop}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: ()=>{},
          onChangeOpacity: ()=>{},
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
