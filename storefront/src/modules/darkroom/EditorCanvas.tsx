"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ---- Макет ----
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ---- Текст-граничители ----
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

const isSession = (n: AnyNode) => n instanceof Konva.Group && (((n as any)._isStrokes) || ((n as any)._isErase))
const isText    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text
const isRectish = (n: AnyNode) => n instanceof Konva.Image || n instanceof Konva.Rect

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  // мобильная — кисть по умолчанию
  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef        = useRef<Konva.Stage>(null)
  const baseLayerRef    = useRef<Konva.Layer>(null) // фон + art-группы
  const uiLayerRef      = useRef<Konva.Layer>(null)
  const trRef           = useRef<Konva.Transformer>(null)
  const frontBgRef      = useRef<Konva.Image>(null)
  const backBgRef       = useRef<Konva.Image>(null)
  const frontArtRef     = useRef<Konva.Group>(null)
  const backArtRef      = useRef<Konva.Group>(null)

  // состояние
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seq, setSeq] = useState({ image:1, shape:1, text:1, strokes:1, erase:1 })

  // сессии
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef     = useRef<Tool | null>(null)
  const isTransformingRef = useRef(false)

  // вёрстка
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

  // показать только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    if (frontBgRef.current)  frontBgRef.current.visible(side === "front")
    if (backBgRef.current)   backBgRef.current.visible(side === "back")
    if (frontArtRef.current) frontArtRef.current.visible(side === "front")
    if (backArtRef.current)  backArtRef.current.visible(side === "back")
    baseLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ---- Transformer без дрожи ----
  const detachGuards = useRef<(() => void) | null>(null)
  const startBoxRef  = useRef<{ x:number; y:number; w:number; h:number; fs?:number } | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isSession(n) || tool !== "move"

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
      const rect = n.getClientRect({ skipShadow: true, skipStroke: true })
      startBoxRef.current = { x: rect.x, y: rect.y, w: rect.width, h: rect.height, fs: isText(n) ? n.fontSize() : undefined }
    }

    const clamp = (v:number, lo:number, hi:number) => Math.max(lo, Math.min(v, hi))
    const onTransform = () => {
      const sb = startBoxRef.current
      if (!sb) return
      const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

      if (isText(n!)) {
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, n!.scaleX())
          const newW = clamp(sb.w * sx, TEXT_MIN_W, TEXT_MAX_W)
          const dx = sb.w - newW
          if (active === "middle-left") { n!.width(newW); n!.x(n!.x() + dx) }
          else                          { n!.width(newW) }
          n!.scaleX(1)
        } else {
          const s = Math.max(n!.scaleX(), n!.scaleY())
          const nextFS = clamp((sb.fs ?? n!.fontSize()) * s, TEXT_MIN_FS, TEXT_MAX_FS)
          n!.fontSize(nextFS)
          n!.scaleX(1); n!.scaleY(1)
        }
      } else if (isRectish(n!)) {
        const sx = (n! as any).scaleX?.() ?? 1
        const sy = (n! as any).scaleY?.() ?? 1
        let newW = sb.w, newH = sb.h, newX = (n! as any).x?.() ?? 0, newY = (n! as any).y?.() ?? 0

        if (active === "top-left" || active === "top-right" || active === "bottom-left" || active === "bottom-right") {
          // пропорционально
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          newW = Math.max(1, sb.w * s)
          newH = Math.max(1, sb.h * s)
        } else if (active === "middle-left" || active === "middle-right") {
          newW = Math.max(1, sb.w * sx)
        } else if (active === "top-center" || active === "bottom-center") {
          newH = Math.max(1, sb.h * sy)
        }
        const rectNow = n!.getClientRect()
        const dx = newW - rectNow.width
        const dy = newH - rectNow.height
        if (active === "top-left")     { newX = n!.x() - dx; newY = n!.y() - dy }
        if (active === "top-right")    { newY = n!.y() - dy }
        if (active === "bottom-left")  { newX = n!.x() - dx }
        // середины по осям — центр фиксируем с противоположной стороны
        if (active === "middle-left")  { newX = n!.x() - dx }
        if (active === "top-center")   { newY = n!.y() - dy }

        ;(n! as any).width?.(newW)
        ;(n! as any).height?.(newH)
        ;(n! as any).x?.(newX)
        ;(n! as any).y?.(newY)
        ;(n! as any).scaleX?.(1)
        ;(n! as any).scaleY?.(1)
      } else {
        // примитивы — углы пропорционально
        const s = Math.max((n! as any).scaleX?.() ?? 1, (n! as any).scaleY?.() ?? 1)
        if (n! instanceof Konva.Circle) n!.radius(Math.max(1, Math.min(sb.w, sb.h) * 0.5 * s))
        ;(n! as any).scaleX?.(1); (n! as any).scaleY?.(1)
      }
      n!.getLayer()?.batchDraw()
    }

    const onEnd = () => { isTransformingRef.current = false; onTransform(); startBoxRef.current = null }

    n!.on("transformstart.guard", onStart)
    n!.on("transform.guard", onTransform)
    n!.on("transformend.guard", onEnd)
    detachGuards.current = () => n!.off(".guard")

    tr.getLayer()?.batchDraw()
  }

  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // во время рисования — отключаем drag; смена инструмента — закрываем сессии
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isSession(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    if (tool !== "brush") currentStrokeId.current[side] = null
    if (tool !== "erase") currentEraseId.current[side]  = null
  }, [tool, layers, side])

  // ---- Общие обработчики ----
  const attachSelect = (n: AnyNode, id: string) => {
    ;(n as any).on("click tap", () => select(id))
    if (n instanceof Konva.Text) n.on("dblclick dbltap", () => startTextOverlayEdit(n))
  }

  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  // ---- Добавление изображений ----
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
        const meta = baseMeta(`image ${seq.image}`)
        artGroup(side).add(kimg)
        attachSelect(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeq(s => ({ ...s, image: s.image + 1 }))
        select(id)
        baseLayerRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ---- Текст ----
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
    const meta = baseMeta(`text ${seq.text}`)
    artGroup(side).add(t)
    attachSelect(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeq(s => ({ ...s, text: s.text + 1 }))
    select(id)
    baseLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ---- Фигуры ----
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    const id = uid(); (n as any).id?.(id)
    const meta = baseMeta(`shape ${seq.shape}`)
    artGroup(side).add(n as any)
    attachSelect(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeq(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    baseLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ---- Brush/Erase сессии ----
  const ensureStrokeTop = (): Konva.Group => {
    let gid = currentStrokeId.current[side]
    if (gid) return layers.find(l => l.id === gid)!.node as Konva.Group
    const g = new Konva.Group({ x:0, y:0 }); (g as any)._isStrokes = true
    const id = uid(); g.id(id)
    artGroup(side).add(g); g.zIndex(artGroup(side).children.length - 1)
    setLayers(p => [...p, { id, side, node: g, meta: baseMeta(`strokes ${seq.strokes}`), type: "strokes" }])
    setSeq(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return g
  }

  const ensureEraseTop = (): Konva.Group => {
    let gid = currentEraseId.current[side]
    if (gid) return layers.find(l => l.id === gid)!.node as Konva.Group
    const g = new Konva.Group({ x:0, y:0 }); (g as any)._isErase = true
    ;(g as any).globalCompositeOperation = "destination-out"
    const id = uid(); g.id(id)
    artGroup(side).add(g); g.zIndex(artGroup(side).children.length - 1)
    setLayers(p => [...p, { id, side, node: g, meta: baseMeta(`erase ${seq.erase}`), type: "erase" }])
    setSeq(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    return g
  }

  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") { ensureStrokeTop(); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    if (tool === "erase" && lastToolRef.current !== "erase") { ensureEraseTop();  trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    lastToolRef.current = tool
  }, [tool, side])

  // ---- Рисование ----
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureStrokeTop()
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
      })
      g.add(line); setIsDrawing(true)
      return
    }
    if (tool === "erase") {
      const g = ensureEraseTop()
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
    baseLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  // ---- Overlay-редактор текста ----
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
    Object.assign(ta.style, {
      position: "absolute", left: `${x}px`, top: `${y}px`,
      padding: "4px 6px", border: "1px solid #000",
      background: "#fff", color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(), fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontSize: `${t.fontSize() * scale}px`, lineHeight: String(t.lineHeight()),
      transformOrigin: "left top", zIndex: "9999", minWidth: `${Math.max(160, t.width() * scale || 0)}px`,
      outline: "none", resize: "none", boxShadow: "0 2px 8px rgba(0,0,0,.12)"
    } as CSSStyleDeclaration)
    document.body.appendChild(ta)
    ta.focus(); ta.select()

    const autoGrow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 3) + "px" }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) t.text(ta.value)
      ta.remove()
      t.visible(true)
      baseLayerRef.current?.batchDraw()
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

  // ---- Жесты: центр = середина пальцев ----
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScale: number
    startRot: number
    centerCanvas: { x: number, y: number }
    nodeId: string | null
    last?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScale:1, startRot:0, centerCanvas:{x:0,y:0}, nodeId:null })

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
    node.x((node as any).x?.() + (stagePoint.x - p2.x))
    node.y((node as any).y?.() + (stagePoint.y - p2.y))
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformerChild(e.target)) return

    // Рисование
    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(stageRef.current!.getPointerPosition()!)
      if (tool === "brush" && !currentStrokeId.current[side]) ensureStrokeTop()
      if (tool === "erase" && !currentEraseId.current[side])  ensureEraseTop()
      startStroke(p.x, p.y)
      return
    }

    // Один палец — выбор/перетаскивание
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
      if (lay && !isSession(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          active: true, two: false, nodeId: lay.id,
          startDist: 0, startAngle: 0, startScale: (lay.node as any).scaleX?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0,
          centerCanvas: toCanvas(stageRef.current!.getPointerPosition()!),
          last: toCanvas(stageRef.current!.getPointerPosition()!)
        }
      }
      return
    }

    // Два пальца — масштаб/поворот
    if (touches && touches.length >= 2) {
      const lay = find(selectedId)
      if (!lay || isSession(lay.node) || lay.meta.locked) return

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
        startScale: (lay.node as any).scaleX?.() ?? 1,
        startRot: (lay.node as any).rotation?.() ?? 0,
        centerCanvas: toCanvas({ x: cx, y: cy })
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
      const p = toCanvas(stageRef.current!.getPointerPosition()!)
      appendStroke(p.x, p.y)
      return
    }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(stageRef.current!.getPointerPosition()!)
      const prev = gestureRef.current.last || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.last = p
      baseLayerRef.current?.batchDraw()
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

      const s = Math.min(Math.max(dist / gestureRef.current.startDist, 0.1), 10)
      const newScale = gestureRef.current.startScale * s
      const newRot   = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)

      const c = gestureRef.current.centerCanvas
      const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      baseLayerRef.current?.batchDraw()
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  // ---- Слои/мета ----
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .map(l => ({
        id: l.id, name: l.meta.name || l.type, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
      // фактический порядок: индексы в группе
      .sort((a,b) => {
        const na = layers.find(l => l.id===a.id)!.node
        const nb = layers.find(l => l.id===b.id)!.node
        return (nb.getZIndex?.() ?? 0) - (na.getZIndex?.() ?? 0)
      })
  }, [layers, side])

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    baseLayerRef.current?.batchDraw()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    const newId = uid(); (clone as any).id?.(newId)
    artGroup(side).add(clone as any)
    attachSelect(clone, newId)
    setLayers(p => [...p, { id:newId, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }])
    clone.setZIndex(artGroup(side).children.length - 1)
    select(newId)
    baseLayerRef.current?.batchDraw()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    const g = artGroup(side)
    const src = layers.find(l => l.id===srcId)?.node
    const dst = layers.find(l => l.id===destId)?.node
    if (!src || !dst) return
    const dstIndex = dst.getZIndex()
    const newIndex = place === "before" ? dstIndex : dstIndex + 1
    src.setZIndex(newIndex)
    // пересоберём массив (по факту zIndex хранится в node)
    setLayers(p => [...p])
    baseLayerRef.current?.batchDraw()
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      l.node.opacity(meta.opacity)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    baseLayerRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ---- Свойства выделенного для тулбара ----
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isText(sel.node) ? {
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); baseLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); baseLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); baseLayerRef.current?.batchDraw() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); baseLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); baseLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); baseLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") (sel.node as Konva.Text).fill(hex)
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    baseLayerRef.current?.batchDraw()
  }

  const clearArt = () => {
    const g = artGroup(side)
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    baseLayerRef.current?.batchDraw()
  }

  // ---- Скачивание ----
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
      style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}
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
            <Layer ref={baseLayerRef} listening={true}>
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
