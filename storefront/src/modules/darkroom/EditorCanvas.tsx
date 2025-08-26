"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem, PhysicsRole } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

/* ====================== База лэйаута (НЕ ТРОГАЮ) ====================== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

/* ====================== Текст ====================== */
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

/* ====================== Физика: масштаб ====================== */
const WORLD_SCALE = 50
const px2m = (v:number) => v / WORLD_SCALE
const m2px = (v:number) => v * WORLD_SCALE

/* ====================== Утилиты ====================== */
const uid   = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const EPS   = 0.25
const DEAD  = 0.006

/* ====================== Типы ====================== */
type BaseMeta = {
  blend: Blend
  opacity: number
  name: string
  visible: boolean
  locked: boolean
  physRole?: PhysicsRole
  baseline?: { x:number; y:number; rot:number; sx:number; sy:number; points?: number[] }
}
type LayerType = "image" | "shape" | "text" | "strokes" | "erase"
type AnyNode =
  | Konva.Image | Konva.Line | Konva.Text | Konva.Group
  | Konva.Rect | Konva.Circle | Konva.RegularPolygon

type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup  = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isErase   === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

/* ====================== Rapier types ====================== */
type RAPIERNS = typeof import("@dimforge/rapier2d-compat")
type RWorld   = import("@dimforge/rapier2d-compat").World
type RRigid   = import("@dimforge/rapier2d-compat").RigidBody
type RJoint   = import("@dimforge/rapier2d-compat").ImpulseJoint

type PhysHandle = { role: PhysicsRole; bodies: RRigid[]; joints?: RJoint[] }

/* ====================== Компонент ====================== */
export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef    = useRef<Konva.Stage>(null)
  const bgLayerRef  = useRef<Konva.Layer>(null)
  const artLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef  = useRef<Konva.Layer>(null)
  const trRef       = useRef<Konva.Transformer>(null)
  const frontBgRef  = useRef<Konva.Image>(null)
  const backBgRef   = useRef<Konva.Image>(null)
  const frontArtRef = useRef<Konva.Group>(null)
  const backArtRef  = useRef<Konva.Group>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })
  const [uiTick, setUiTick] = useState(0)
  const bump = () => setUiTick(v => (v + 1) | 0)

  const isTransformingRef = useRef(false)

  /* ===== Масштаб контейнера (Stage — всегда BASE_W × BASE_H) */
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    try {
      const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
      setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
    } catch { /* no-op */ }
  }, [])

  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = 72
    const maxW = vw - 24 - 340 /* под панель справа */
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers, headerH])

  // не лезу в скролл/оверфлоу — никаких скрытий панели автоматически

  // helpers
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false, physRole: "off" })

  const setBlend = (n: AnyNode, blend: Blend) => {
    const node: any = n as any
    if (typeof node.setAttr === "function") { node.setAttr("globalCompositeOperation", blend); return }
    if (typeof node.globalCompositeOperation === "function") { node.globalCompositeOperation(blend); return }
    node.attrs = node.attrs || {}
    node.attrs.globalCompositeOperation = blend
  }

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    ;(n as any).opacity?.(meta.opacity)
    if (!isEraseGroup(n) && !isStrokeGroup(n)) setBlend(n, meta.blend)
  }

  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)

  /* ===== Показ активной стороны (+ reset физики при смене стороны) */
  const [ph, setPh] = useState({ running: false, angleDeg: 90, strength: 9.8, autoRoles: true, gyro: false })

  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
    if (ph.running) resetPhysics()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side])

  // видимость слоёв
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [layers, side])

  // «починка» gCO один раз
  useEffect(() => {
    layers.forEach((l) => {
      const node: any = l.node
      if (!isEraseGroup(node) && !isStrokeGroup(node) && typeof node.globalCompositeOperation !== "function") {
        try { delete node.globalCompositeOperation } catch {}
        setBlend(node, l.meta.blend)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ====================== Transformer / TEXT ====================== */
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textSnapRef   = useRef<{ fs0:number; wrap0:number; cx0:number; cy0:number }|null>(null)
  const captureTextSnap = (t: Konva.Text) => {
    const wrap0 = Math.max(1, t.width() || 1)
    const self  = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, t.height() || 1) }
    const cx0   = Math.round(t.x() + wrap0 / 2)
    const cy0   = Math.round(t.y() + Math.max(1, self.height) / 2)
    textSnapRef.current = { fs0: t.fontSize(), wrap0, cx0, cy0 }
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move"
    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    const tr = trRef.current!
    if (disabled) { tr.nodes([]); uiLayerRef.current?.batchDraw(); return }

    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    ;(n as any).on("transformstart.guard", onStart)
    ;(n as any).on("transformend.guard", onEndT)
    detachGuard.current = () => (n as any).off(".guard")

    if (isTextNode(n)) {
      const t = n as Konva.Text
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right","top-center","bottom-center"])

      const onTextStart = () => captureTextSnap(t)
      const onTextEnd   = () => { textSnapRef.current = null; if (ph.running) rebuildOne((t as any).id()) }
      t.on("transformstart.textsnap", onTextStart)
      t.on("transformend.textsnap",   onTextEnd)

      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        if (!textSnapRef.current) captureTextSnap(t)
        const s = textSnapRef.current!
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        // боковые ручки — меняем ширину (без скейла)
        if (active === "middle-left" || active === "middle-right") {
          const ratioW = newBox.width / Math.max(1e-6, oldBox.width)
          if (Math.abs(ratioW - 1) < DEAD) return oldBox
          const minW = Math.max(2, Math.round((t.fontSize() || s.fs0) * 0.45))
          const nextW = clamp(Math.round(s.wrap0 * ratioW), minW, TEXT_MAX_W)
          if (Math.abs((t.width() || 0) - nextW) > EPS) {
            t.width(nextW); t.x(Math.round(s.cx0 - nextW/2))
          }
          t.scaleX(1); t.scaleY(1)
          t.getLayer()?.batchDraw()
          if (ph.running) pushNodeToBody((t as any).id())
          requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
          return oldBox
        }

        // углы/вертикаль — меняем fontSize (и центр)
        const ratioW = newBox.width  / Math.max(1e-6, oldBox.width)
        const ratioH = newBox.height / Math.max(1e-6, oldBox.height)
        const scaleK = Math.max(ratioW, ratioH)
        if (Math.abs(scaleK - 1) < DEAD) return oldBox

        const nextFS = clamp(Math.round(s.fs0 * scaleK), TEXT_MIN_FS, TEXT_MAX_FS)
        if (Math.abs(t.fontSize() - nextFS) > EPS) {
          t.fontSize(nextFS)
          const self = (t as any).getSelfRect?.() || { width: Math.max(1, t.width() || s.wrap0), height: Math.max(1, t.height() || 1) }
          const nw = Math.max(1, t.width() || self.width)
          const nh = Math.max(1, self.height)
          t.x(Math.round(s.cx0 - nw/2))
          t.y(Math.round(s.cy0 - nh/2))
        }
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        if (ph.running) pushNodeToBody((t as any).id())
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
        return oldBox
      })

      const onTextNormalizeEnd = () => {
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
      }
      t.on("transformend.textnorm", onTextNormalizeEnd)

      detachTextFix.current = () => { t.off(".textsnap"); t.off(".textnorm") }
    } else {
      tr.keepRatio(true)
      ;(n as any).on("transform.transformerSync", () => { if (ph.running) pushNodeToBody((n as any).id()) })
      ;(n as any).on("transformend.transformerSync", () => { if (ph.running) rebuildOne((n as any).id()) })
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // Драг только активному слою, чтобы не «прилипал» предыдущий
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isEraseGroup(l.node)) return
      const isRope = isStrokeGroup(l.node) && (l.meta.physRole === "rope")
      const shouldDrag = enable && !l.meta.locked && l.id === selectedId && (!isStrokeGroup(l.node) || isRope)
      ;(l.node as any).draggable?.(Boolean(shouldDrag))
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    try { stageRef.current?.stopDrag() } catch {}
  }, [tool, layers, side, selectedId])

  /* ====================== Хоткеи (без влияния на вёрстку) ====================== */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId)
      const lay = find(selectedId)

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="t") {
        e.preventDefault()
        set({ tool: "move" as Tool })
        requestAnimationFrame(attachTransformer)
        return
      }

      if (!n || !lay) return
      if (tool !== "move") return

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      ;(n as any).x && (n as any).y && (
        (e.key === "ArrowLeft"  && (n as any).x((n as any).x()-step)),
        (e.key === "ArrowRight" && (n as any).x((n as any).x()+step)),
        (e.key === "ArrowUp"    && (n as any).y((n as any).y()-step)),
        (e.key === "ArrowDown"  && (n as any).y((n as any).y()+step))
      )
      n.getLayer()?.batchDraw()
      if (ph.running) pushNodeToBody(lay.id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool, set, ph.running])

  /* ====================== Brush / Erase ====================== */
  const startStroke = (x: number, y: number) => {
    if (tool !== "brush" && tool !== "erase") return

    const g = new Konva.Group({ x: 0, y: 0 })
    if (tool === "brush") (g as any)._isStrokes = true
    if (tool === "erase") (g as any)._isErase = true
    ;(g as any).id(uid())
    const id = (g as any).id()
    const meta = baseMeta(tool === "brush" ? `strokes ${seqs.strokes}` : `erase ${seqs.erase}`)
    if (tool === "brush") meta.physRole = "rope"
    currentArt().add(g); (g as any).moveToTop()
    const newLay: AnyLayer = { id, side, node: g, meta, type: tool === "brush" ? "strokes" : "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => tool === "brush" ? ({ ...s, strokes: s.strokes + 1 }) : ({ ...s, erase: s.erase + 1 }))
    select(id)

    const line = new Konva.Line({
      points: [x, y, x + 0.01, y + 0.01],
      stroke: tool === "brush" ? brushColor : "#000",
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "brush" ? "source-over" : ("destination-out" as any),
    })
    g.add(line)
    setIsDrawing(true)
    artLayerRef.current?.batchDraw()
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const lay = find(selectedId)
    const g = lay?.node as Konva.Group
    const last = g?.getChildren().at(-1)
    const line = last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
    if (!(line instanceof Konva.Line)) return
    line.points(line.points().concat([x, y]))
    artLayerRef.current?.batchDraw()
  }
  const finishStroke = () => {
    setIsDrawing(false)
    const lay = find(selectedId)
    if (!lay) return
    if (ph.running && lay.meta.physRole === "rope") rebuildOne(lay.id)
  }

  // сайт-шрифт
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
    ;(k as any).on("dragmove.phys", () => { if (ph.running) pushNodeToBody(id) })
    ;(k as any).on("dragend.phys",  () => { if (ph.running) rebuildOne(id) })
    ;(k as any).on("transform.phys", () => { if (ph.running) pushNodeToBody(id) })
    ;(k as any).on("transformend.phys", () => { if (ph.running) rebuildOne(id) })
  }

  /* ====================== Image/Text/Shape ====================== */
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
        const id = (kimg as any).id()
        const meta = baseMeta(`image ${seqs.image}`)
        meta.physRole = "rigid"
        currentArt().add(kimg); (kimg as any).moveToTop()
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
        if (ph.running) buildOne(id)
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
      lineHeight: 1, letterSpacing: 0,
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any).id()
    const meta = baseMeta(`text ${seqs.text}`)
    meta.physRole = "rigid"
    currentArt().add(t); (t as any).moveToTop()
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    if (ph.running) buildOne(id)
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor, draggable: false })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor, draggable: false })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor, draggable: false })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160, draggable:false}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round", draggable:false })
    ;(n as any).id(uid())
    const id = (n as any).id()
    const meta = baseMeta(`shape ${seqs.shape}`)
    meta.physRole = "rigid"
    currentArt().add(n as any); (n as any).moveToTop?.()
    ;(n as any).on("click tap", () => select(id))
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    if (ph.running) buildOne(id)
  }

  /* ====================== Overlay-редактор текста ====================== */
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current
    if (!stage) return
    let stBox: DOMRect
    try { stBox = stage.container().getBoundingClientRect() } catch { return }

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      let r: any
      try { r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true }) } catch { return }
      const vv: any = (window as any)?.visualViewport || null

      let left = stBox.left + r.x * scale
      let top  = stBox.top  + r.y * scale
      if (vv) { left += vv.offsetLeft || 0; top += vv.offsetTop || 0 }

      ta.style.left   = `${left}px`
      ta.style.top    = `${top}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    Object.assign(ta.style as CSSStyleDeclaration, {
      position: "fixed", padding: "0", margin: "0",
      border: "1px solid #111", background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle:  t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${((t as any).letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap", overflow: "hidden", outline: "none", resize: "none",
      transformOrigin: "left top", zIndex: "9999", caretColor: String(t.fill() || "#000"),
      userSelect: "text", textAlign: (t.align?.() as any) || "left",
    })

    place()
    document.body.appendChild(ta)
    ta.focus()
    try { ta.setSelectionRange(ta.value.length, ta.value.length) } catch {}

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      if (ph.running) pushNodeToBody((t as any).id())
      requestAnimationFrame(() => { place(); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
    }
    const commit = (apply: boolean) => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      try {
        const vv = (window as any).visualViewport
        vv?.removeEventListener?.("resize", place as any)
        vv?.removeEventListener?.("scroll", place as any)
      } catch {}
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => {
        select((t as any).id()); attachTransformer()
        trRef.current?.nodes([t]); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw()
        if (ph.running) rebuildOne((t as any).id())
      })
    }
    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    }

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    try {
      const vv = (window as any).visualViewport
      vv?.addEventListener?.("resize", place as any)
      vv?.addEventListener?.("scroll", place as any)
    } catch {}
  }

  /* ====================== Жесты (мобилка) — безопасные ====================== */
  type G = {
    active: boolean; two: boolean; startDist: number; startAngle: number
    startScaleX: number; startScaleY: number; startRot: number
    startPos: { x: number, y: number }
    centerCanvas: { x: number, y: number }
    nodeId: string | null; lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScaleX:1, startScaleY:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })
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
    ;(node as any).scaleX?.(newScale); (node as any).scaleY?.(newScale)
    ;(node as any).rotation?.(newRotation)
    const tr2 = node.getAbsoluteTransform().copy()
    const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x; const dy = stagePoint.y - p2.y
    ;(node as any).x?.(((node as any).x?.() ?? 0) + dx)
    ;(node as any).y?.(((node as any).y?.() ?? 0) + dy)
  }

  const onDown = (e: any) => {
    if (isTransformerChild(e.target)) return
    const touches: TouchList | undefined = e.evt?.touches

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer()); startStroke(p.x, p.y); return
    }

    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node
      if (tgt === st || isBgTarget(tgt)) { select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return }

      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          ...gestureRef.current, active: true, two: false, nodeId: lay.id,
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
        startDist: Math.max(dist, 0.0001), startAngle: ang,
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
    const touches: TouchList | undefined = e.evt?.touches
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
      artLayerRef.current?.batchDraw()
      if (ph.running) pushNodeToBody(lay.id)
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
      artLayerRef.current?.batchDraw()
      if (ph.running) pushNodeToBody(lay.id)
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  /* ====================== Данные для панелей ====================== */
  const layerItems: LayerItem[] = useMemo(() => {
    void uiTick
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
        physRole: l.meta.physRole || "off",
      }))
  }, [layers, side, uiTick])

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    if (ph.running) removeHandle(id)
    bump()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x && (clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y && (clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    currentArt().add(clone as any); (clone as any).moveToTop?.()
    const newLay: AnyLayer = { id: (clone as any).id?.() ?? uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newLay.id)
    setLayers(p => [...p, newLay]); select(newLay.id)
    artLayerRef.current?.batchDraw()
    bump()
    if (ph.running) buildOne(newLay.id)
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex?.(i) })
      artLayerRef.current?.batchDraw()
      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); bump() })
    if (ph.running) pushNodeToBody(srcId)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    if (typeof patch.physRole !== "undefined" && ph.running) rebuildOne(id)
    bump()
  }

  const onLayerSelect = (id: string) => { select(id); if (tool !== "move") set({ tool: "move" }) }

  // ===== Свойства выбранного узла
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: Math.round(sel.node.fontSize()),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
      lineHeight: sel.node.lineHeight?.(),
      letterSpacing: (sel.node as any).letterSpacing?.(),
      align: sel.node.align?.() as "left"|"center"|"right",
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill?.() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS)); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedLineHeight = (lh:number)   => { const n = sel?.node as Konva.Text; if (!n) return; n.lineHeight(clamp(lh, 0.5, 3)); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedLetterSpacing = (ls:number)=> { const n = sel?.node as any; if (!n || typeof n.letterSpacing !== "function") return; n.letterSpacing(ls); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }
  const setSelectedAlign = (a:"left"|"center"|"right") => { const n = sel?.node as Konva.Text; if (!n) return; n.align(a); artLayerRef.current?.batchDraw(); if (ph.running && sel) rebuildOne(sel.id); bump() }

  // ===== Clear All
  const clearArt = () => {
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    select(null)
    artLayerRef.current?.batchDraw()
    if (ph.running) { pausePhysics(); killWorld(); startPhysics() }
    bump()
  }

  // ===== Скачивание (UI не трогаю)
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    uiLayerRef.current?.visible(false)

    const showFront = s === "front"
    frontBgRef.current?.visible(showFront)
    backBgRef.current?.visible(!showFront)
    frontArtRef.current?.visible(showFront)
    backArtRef.current?.visible(!showFront)

    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)

    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  /* ====================== PHYSICS: Rapier2D (ТОЛЬКО ФУНКЦИИ) ====================== */
  const rapierRef  = useRef<RAPIERNS | null>(null)
  const worldRef   = useRef<RWorld  | null>(null)
  const handlesRef = useRef<Record<string, PhysHandle>>({})
  const rafRef     = useRef<number | null>(null)

  const deg2rad = (d:number) => d * Math.PI / 180
  const rad2deg = (r:number) => r * 180 / Math.PI

  const getRect = (n: AnyNode) =>
    (n as any).getClientRect?.({ skipStroke: false }) ||
    { x:(n as any).x?.()||0, y:(n as any).y?.()||0, width:(n as any).width?.()||0, height:(n as any).height?.()||0 }

  const takeBaseline = (l: AnyLayer) => {
    const n:any = l.node as any
    const base = { x: n.x?.() ?? 0, y: n.y?.() ?? 0, rot: n.rotation?.() ?? 0, sx: n.scaleX?.() ?? 1, sy: n.scaleY?.() ?? 1 } as BaseMeta["baseline"]
    if (l.type === "strokes") {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      if (line) base.points = [...line.points()]
    }
    setLayers(p => p.map(x => x.id===l.id ? ({ ...x, meta: { ...x.meta, baseline: base } }) : x))
  }

  const restoreBaseline = (l: AnyLayer) => {
    const b = l.meta.baseline; if (!b) return
    const n:any = l.node as any
    n.x?.(b.x); n.y?.(b.y); n.rotation?.(b.rot); n.scaleX?.(b.sx); n.scaleY?.(b.sy)
    if (l.type === "strokes" && b.points) {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      if (line) line.points([...b.points])
    }
  }

  const mkRigidDesc = (R:RAPIERNS, dyn:boolean, kinematic=false) => {
    if (kinematic) return R.RigidBodyDesc.kinematicPositionBased()
    const d = dyn ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed()
    if (dyn) { d.setCcdEnabled(true); d.setLinearDamping(1.0); d.setAngularDamping(1.0) }
    return d
  }

  const removeHandle = (id:string) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const h = handlesRef.current[id]; if (!h) return
    try { h.joints?.forEach(j => w.removeImpulseJoint(j, true)) } catch {}
    try { h.bodies.forEach(b => w.removeRigidBody(b)) } catch {}
    delete handlesRef.current[id]
  }

  const colliderMaterial = { friction: 0.9, restitution: 0.05 }
  const mkColliderBox = (R:RAPIERNS, w:RWorld, body: RRigid, wpx:number, hpx:number) => {
    const c = R.ColliderDesc.cuboid(px2m(wpx/2), px2m(hpx/2)); c.setFriction(colliderMaterial.friction); c.setRestitution(colliderMaterial.restitution)
    return w.createCollider(c, body)
  }
  const mkColliderBall = (R:RAPIERNS, w:RWorld, body: RRigid, rpx:number) => {
    const c = R.ColliderDesc.ball(px2m(rpx)); c.setFriction(colliderMaterial.friction); c.setRestitution(colliderMaterial.restitution)
    return w.createCollider(c, body)
  }

  const buildBounds = () => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const thick = 200, off = 50
    const edges = [
      { cx: BASE_W/2,          cy: -off - thick/2,      w: BASE_W+thick*2, h: thick },
      { cx: BASE_W/2,          cy: BASE_H+off+thick/2,  w: BASE_W+thick*2, h: thick },
      { cx: -off - thick/2,    cy: BASE_H/2,            w: thick,          h: BASE_H+thick*2 },
      { cx: BASE_W+off+thick/2,cy: BASE_H/2,            w: thick,          h: BASE_H+thick*2 },
    ]
    edges.forEach(e => {
      const rb = w.createRigidBody(mkRigidDesc(R, false).setTranslation(px2m(e.cx), px2m(e.cy)))
      mkColliderBox(R, w, rb, e.w, e.h)
    })
  }

  const localToWorld = (node: Konva.Node, x:number, y:number) => {
    const tr = node.getAbsoluteTransform().copy()
    const p = tr.point({x, y})
    return { x: p.x, y: p.y }
  }

  const buildOne = (id:string, roleOverride?: PhysicsRole) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const l = layers.find(x=>x.id===id); if (!l) return
    const role = roleOverride ?? (l.meta.physRole || "off")
    if (role === "off" || l.type === "erase" || !l.meta.visible || l.meta.locked) return
    removeHandle(id)

    const bodies: RRigid[] = []
    const joints: RJoint[] = []

    const rect = getRect(l.node)
    const cx = rect.x + rect.width/2
    const cy = rect.y + rect.height/2
    const angleDeg = (l.node as any).rotation?.() || 0

    const mkRB = (dyn:boolean, cxpx:number, cypx:number, angle:number, asKinematic=false) => {
      const d = mkRigidDesc(R, dyn, asKinematic).setTranslation(px2m(cxpx), px2m(cypx)).setRotation(deg2rad(angle))
      return w.createRigidBody(d)
    }

    const pushRigidFromNode = () => {
      const isKine = role === "collider"
      const rb = mkRB(!isKine, cx, cy, angleDeg, isKine)
      bodies.push(rb)
      if (l.node instanceof Konva.Circle) {
        const r = (l.node as Konva.Circle).radius() * ((l.node as any).scaleX?.() ?? 1)
        mkColliderBall(R, w, rb, Math.max(2, r))
      } else {
        mkColliderBox(R, w, rb, Math.max(4, rect.width), Math.max(4, rect.height))
      }
    }

    const pushRopeFromStroke = () => {
      const g = l.node as Konva.Group
      const line = g.getChildren().find(ch => ch instanceof Konva.Line) as Konva.Line | undefined
      if (!line) return
      const pts = [...line.points()]
      if (pts.length < 4) return
      const thick = Math.max(6, (line.strokeWidth?.() ?? 10))

      const anchors: {x:number;y:number}[] = []
      let ax = pts[0], ay = pts[1]
      anchors.push(localToWorld(g, ax, ay))
      for (let i=2;i<pts.length;i+=2){
        const bx = pts[i], by = pts[i+1]
        const dx = bx-ax, dy = by-ay
        const len = Math.hypot(dx,dy)
        const step = Math.max(16, thick*0.9)
        const segs = Math.max(1, Math.floor(len/step))
        for (let s=1;s<=segs;s++) {
          const lx = ax + dx*(s/segs), ly = ay + dy*(s/segs)
          anchors.push(localToWorld(g, lx, ly))
        }
        ax = bx; ay = by
      }
      if (anchors.length < 2) return

      const segLen = (p:{x:number;y:number}, q:{x:number;y:number}) => Math.hypot(q.x-p.x, q.y-p.y)
      const ang    = (p:{x:number;y:number}, q:{x:number;y:number}) => Math.atan2(q.y-p.y, q.x-p.x)

      const a0 = anchors[0]
      const aN = anchors[anchors.length-1]
      const rbA = mkRB(false, a0.x, a0.y, 0, true)
      const rbB = mkRB(false, aN.x, aN.y, 0, true)
      bodies.push(rbA)

      let prev: RRigid | null = rbA
      for (let i=0;i<anchors.length-1;i++){
        const p = anchors[i], q = anchors[i+1]
        const cx = (p.x+q.x)/2
        const cy = (p.y+q.y)/2
        const L = Math.max(8, segLen(p,q))
        const a = ang(p,q)
        const seg = mkRB(true, cx, cy, rad2deg(a))
        bodies.push(seg)
        mkColliderBox(R, w, seg, L, thick)

        const A = prev!
        const jointData = R.JointData.revolute({x:0,y:0}, {x:-px2m(L/2), y:0})
        joints.push(w.createImpulseJoint(jointData, A, seg, true))
        prev = seg
      }
      // последний сегмент к rbB
      const lastSeg = bodies[bodies.length-1]
      const lastLen = anchors.length>=2 ? segLen(anchors[anchors.length-2], anchors[anchors.length-1]) : 20
      const j2 = R.JointData.revolute({x:px2m(lastLen/2), y:0}, {x:0,y:0})
      joints.push(w.createImpulseJoint(j2, lastSeg, rbB, true))
      bodies.push(rbB)
    }

    if (role === "rope" && l.type === "strokes") pushRopeFromStroke(); else pushRigidFromNode()
    handlesRef.current[id] = { role, bodies, joints }
  }

  const pushNodeToBody = (id: string) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const h = handlesRef.current[id]; if (!h) return
    const l = layers.find(x=>x.id===id); if (!l) return

    if (h.role === "collider") {
      const rect = getRect(l.node)
      const cx = rect.x + rect.width/2
      const cy = rect.y + rect.height/2
      const ang = (l.node as any).rotation?.() || 0
      const rb = h.bodies[0]
      rb.setNextKinematicTranslation({ x: px2m(cx), y: px2m(cy) })
      rb.setNextKinematicRotation(deg2rad(ang))
      return
    }

    if (h.role === "rope" && l.type === "strokes") {
      const g = l.node as Konva.Group
      const line = g.getChildren().find(ch => ch instanceof Konva.Line) as Konva.Line | undefined
      if (!line) return
      const pts = line.points(); if (pts.length < 4) return
      const [x0,y0] = [pts[0], pts[1]]
      const [x1,y1] = [pts[pts.length-2], pts[pts.length-1]]
      const a = localToWorld(g, x0,y0)
      const b = localToWorld(g, x1,y1)
      const rbA = h.bodies[0]
      const rbB = h.bodies[h.bodies.length-1]
      rbA.setNextKinematicTranslation({ x: px2m(a.x), y: px2m(a.y) })
      rbB.setNextKinematicTranslation({ x: px2m(b.x), y: px2m(b.y) })
      return
    }

    const rect = getRect(l.node)
    const cx = rect.x + rect.width/2
    const cy = rect.y + rect.height/2
    const ang = (l.node as any).rotation?.() || 0
    const rb = h.bodies[0]
    rb.setTranslation({ x: px2m(cx), y: px2m(cy) }, true)
    rb.setRotation(deg2rad(ang), true)
  }

  const rebuildOne = (id:string) => { removeHandle(id); buildOne(id) }

  const ensureRapier = async () => {
    if (!rapierRef.current) {
      const R = await import("@dimforge/rapier2d-compat")
      await R.init()
      rapierRef.current = R
    }
  }

  const startWorld = () => {
    const R = rapierRef.current!; const g = { x: Math.cos(deg2rad(ph.angleDeg)) * ph.strength, y: Math.sin(deg2rad(ph.angleDeg)) * ph.strength }
    const w = new R.World(g); worldRef.current = w
    buildBounds()
    layers.filter(l => l.side === side).forEach(l => { takeBaseline(l); buildOne(l.id) })
  }

  const killWorld = () => {
    const w = worldRef.current; if (!w) return
    try { Object.keys(handlesRef.current).forEach(id => removeHandle(id)) } finally { worldRef.current = null }
  }

  const stepWorld = () => {
    const w = worldRef.current, R = rapierRef.current; if (!w || !R) return
    w.timestep = 1/60
    w.step()

    for (const id of Object.keys(handlesRef.current)){
      const h = handlesRef.current[id]
      const l = layers.find(x=>x.id===id); if (!l) continue
      if (h.role === "collider") continue

      if (h.role === "rope" && l.type === "strokes") {
        const g = l.node as Konva.Group
        const line = g.getChildren().find(ch => ch instanceof Konva.Line) as Konva.Line | undefined
        if (!line) continue
        const inv = g.getAbsoluteTransform().copy().invert()
        const pts:number[] = []
        h.bodies.forEach(rb => {
          const p = rb.translation()
          const wp = { x: m2px(p.x), y: m2px(p.y) }
          const lp = inv.point(wp)
          pts.push(lp.x, lp.y)
        })
        line.points(pts)
        continue
      }

      const dragging = (l.node as any).isDragging?.() || false
      if (dragging || isTransformingRef.current) continue
      const rb = h.bodies[0]
      const p = rb.translation(); const rot = rb.rotation()
      const rect = getRect(l.node)
      const wpx = rect.width, hpx = rect.height
      ;(l.node as any).x?.(m2px(p.x) - wpx/2)
      ;(l.node as any).y?.(m2px(p.y) - hpx/2)
      ;(l.node as any).rotation?.(rad2deg(rot))
    }

    for (const id of Object.keys(handlesRef.current)) {
      const h = handlesRef.current[id]
      if (h.role === "collider" || h.role === "rope") pushNodeToBody(id)
    }

    artLayerRef.current?.batchDraw()
    rafRef.current = requestAnimationFrame(stepWorld)
  }

  const startPhysics = async () => {
    await ensureRapier()
    if (!worldRef.current) startWorld()
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setPh(p => ({...p, running:true}))
    rafRef.current = requestAnimationFrame(stepWorld)
  }
  const pausePhysics = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setPh(p => ({...p, running:false}))
  }
  const resetPhysics = () => {
    pausePhysics()
    layers.filter(l=>l.side===side).forEach(restoreBaseline)
    artLayerRef.current?.batchDraw()
    killWorld()
    setPh(p => ({...p, running:false}))
  }

  /* ====================== Render (вернул как было) ====================== */
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 12px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Toolbar />

        <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 8 }}>
          <Stage
            ref={stageRef as any}
            width={BASE_W}
            height={BASE_H}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onTouchStart={onDown}
            onTouchMove={onMove}
            onTouchEnd={onUp}
          >
            <Layer ref={bgLayerRef as any} listening={false}>
              <KImage ref={frontBgRef as any} image={frontMock} width={BASE_W} height={BASE_H} visible={side==='front'} listening={false} />
              <KImage ref={backBgRef  as any} image={backMock}  width={BASE_W} height={BASE_H} visible={side==='back'}  listening={false} />
            </Layer>

            <Layer ref={artLayerRef as any}>
              <KGroup ref={frontArtRef as any} visible={side==='front'} />
              <KGroup ref={backArtRef  as any} visible={side==='back'}  />
            </Layer>

            <Layer ref={uiLayerRef as any}>
              <Transformer ref={trRef as any} rotateEnabled={true} />
            </Layer>
          </Stage>
        </div>
      </div>

      {showLayers && (
        <div style={{ width: 320 }}>
          <LayersPanel
            items={layerItems}
            selectedId={selectedId}
            onSelect={onLayerSelect}
            onDelete={deleteLayer}
            onDuplicate={duplicateLayer}
            onReorder={reorder}
            onUpdate={updateMeta}
            onAddText={onAddText}
            onAddShape={onAddShape}
            onUploadImage={onUploadImage}
            selectedKind={selectedKind}
            selectedProps={selectedProps as any}
            setSelectedFill={setSelectedFill}
            setSelectedStroke={setSelectedStroke}
            setSelectedStrokeW={setSelectedStrokeW}
            setSelectedText={setSelectedText}
            setSelectedFontSize={setSelectedFontSize}
            setSelectedFontFamily={setSelectedFontFamily}
            setSelectedLineHeight={setSelectedLineHeight}
            setSelectedLetterSpacing={setSelectedLetterSpacing}
            setSelectedAlign={setSelectedAlign}
            physics={{ running: ph.running, start: startPhysics, pause: pausePhysics, reset: resetPhysics }}
          />
        </div>
      )}
    </div>
  )
}
