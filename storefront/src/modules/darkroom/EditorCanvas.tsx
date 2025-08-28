"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem, PhysicsRole } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/* ====================== Лэйаут ====================== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

/* ====================== Текст ====================== */
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

/* ====================== Физика ====================== */
const WORLD_SCALE = 50
const px2m = (v:number) => v / WORLD_SCALE
const m2px = (v:number) => v * WORLD_SCALE

// устойчивость и «игровость»
const SUBSTEPS = 5                           // больше стабильности
const ROPE_SEG_TARGET = 24                   // короче сегменты — живее
const ROPE_THICK_MIN = 6
const ROPE_ANGLE_LIMIT_DEG = 170             // почти свободно гнётся
const RIGID_DENSITY = 0.6                    // помягче толкается
const RIGID_LIN_DAMP = 1.2
const RIGID_ANG_DAMP = 1.2
const ROPE_DENSITY = 0.35
const ROPE_LIN_DAMP = 1.4
const ROPE_ANG_DAMP = 1.6

/* ====================== Утилиты ====================== */
const uid = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const EPS = 0.25
const DEAD = 0.006

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
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon

type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup  = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isErase   === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

/* ====================== Rapier types (динамический импорт) ====================== */
type RAPIERNS = typeof import("@dimforge/rapier2d-compat")
type RWorld = import("@dimforge/rapier2d-compat").World
type RRigid = import("@dimforge/rapier2d-compat").RigidBody
type RJoint = import("@dimforge/rapier2d-compat").ImpulseJoint

type PhysHandle = {
  role: PhysicsRole
  bodies: RRigid[]
  joints?: RJoint[]
}

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
    const padBottom = isMobile ? 164 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // фикс скролла
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

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
  const [ph, setPh] = useState({
    running: false,
    angleDeg: 90,
    strength: 9.8,
    autoRoles: true,
    gyro: false,
  })

  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
    if (ph.running) resetPhysics()
  }, [side])

  // видимость слоёв
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [layers, side])

  // одноразовый фикс gCO
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
  const trTargetRef   = useRef<Konva.Node | null>(null)
  const textSnapRef   = useRef<{ fs0:number; wrap0:number; cx0:number; cy0:number }|null>(null)
  const captureTextSnap = (t: Konva.Text) => {
    const wrap0 = Math.max(1, t.width() || 1)
    const self  = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, t.height() || 1) }
    const cx0   = Math.round(t.x() + wrap0 / 2)
    const cy0   = Math.round(t.y() + Math.max(1, self.height) / 2)
    textSnapRef.current = { fs0: t.fontSize(), wrap0, cx0, cy0 }
  }

  const clearTransformerBoundBox = () => {
    const tr = trRef.current!
    ;(tr as any).boundBoxFunc((_: any, newBox: any) => newBox)
  }
  const detachAllFromPrevTarget = () => {
    const prev = trTargetRef.current
    if (!prev) return
    ;(prev as any).off(".guard .textsnap .textnorm .phys .transformerSync")
    trTargetRef.current = null
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node as unknown as Konva.Node | undefined
    const disabled = !n || lay?.meta.locked || isStrokeGroup(lay!.node) || isEraseGroup(lay!.node) || tool !== "move"

    detachAllFromPrevTarget()
    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    const tr = trRef.current!
    if (disabled) {
      tr.nodes([])
      clearTransformerBoundBox()
      uiLayerRef.current?.batchDraw()
      return
    }

    tr.nodes([n!])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    ;(n as any).on("transformstart.guard", onStart)
    ;(n as any).on("transformend.guard", onEndT)
    detachGuard.current = () => (n as any).off(".guard")
    trTargetRef.current = n || null

    if (isTextNode(lay!.node)) {
      const t = lay!.node as Konva.Text
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTextStart = () => captureTextSnap(t)
      const onTextEnd   = () => { textSnapRef.current = null; if (ph.running) rebuildOne((t as any).id()) }
      t.on("transformstart.textsnap", onTextStart)
      t.on("transformend.textsnap",   onTextEnd)

      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        const snap = textSnapRef.current
        if (!snap) captureTextSnap(t)
        const s = textSnapRef.current!
        const getActive = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        // ширина
        if (getActive === "middle-left" || getActive === "middle-right") {
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

        // fontSize
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
      clearTransformerBoundBox()
      tr.keepRatio(true)
      ;(n as any).on("transform.transformerSync", () => { if (ph.running) pushNodeToBody((n as any).id()) })
      ;(n as any).on("transformend.transformerSync", () => { if (ph.running) rebuildOne((n as any).id()) })
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // drag lock при brush/erase
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable?.(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  // ===== хоткеи =====
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
    ;(k as any).off?.(".phys .transformerSync .tap .click .dblclick .dbltap")
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
    const stage = stageRef.current!
    const stBox = stage.container().getBoundingClientRect()

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      const vv = typeof window !== "undefined" && (window as any).visualViewport
        ? (window as any).visualViewport as VisualViewport
        : null

      let left = stBox.left + r.x * scale
      let top  = stBox.top  + r.y * scale
      if (vv) { left += vv.offsetLeft; top += vv.offsetTop }

      ta.style.left   = `${left}px`
      ta.style.top    = `${top}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    Object.assign(ta.style, {
      position: "fixed",
      padding: "0",
      margin: "0",
      border: "1px solid #111",
      background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle: t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${((t as any).letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      outline: "none",
      resize: "none",
      transformOrigin: "left top",
      zIndex: "9999",
      caretColor: String(t.fill() || "#000"),
      userSelect: "text",
      textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    place()
    document.body.appendChild(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      if (ph.running) pushNodeToBody((t as any).id())
      requestAnimationFrame(() => { place(); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
    }
    const commit = (apply: boolean) => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      const vv = (window as any).visualViewport as VisualViewport | undefined
      vv?.removeEventListener("resize", place as any)
      vv?.removeEventListener("scroll", place as any)
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => {
        select((t as any).id())
        attachTransformer()
        trRef.current?.nodes([t])
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
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
    const vv = (window as any).visualViewport as VisualViewport | undefined
    vv?.addEventListener("resize", place as any)
    vv?.addEventListener("scroll", place as any)
  }

  /* ====================== Жесты (мобилка) + mouse joint ====================== */
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

  // mouse joint (якорь + джойнт)
  const dragPhysRef = useRef<{anchor: RRigid | null, joint: RJoint | null, target: { id: string, idx: number } | null}>({ anchor: null, joint: null, target: null })

  const ensureAnchor = () => {
    const R = rapierRef.current, w = worldRef.current
    if (!R || !w) return null
    if (dragPhysRef.current.anchor) return dragPhysRef.current.anchor
    const b = (w as any).createRigidBody((R as any).RigidBodyDesc.kinematicPositionBased().setTranslation(0,0))
    dragPhysRef.current.anchor = b
    return b
  }
  const startPhysDrag = (canvasX:number, canvasY:number, lay: AnyLayer) => {
    const R = rapierRef.current, w = worldRef.current
    if (!R || !w) return
    const h = handlesRef.current[lay.id]
    if (!h || h.bodies.length===0) return

    const ax = px2m(canvasX), ay = px2m(canvasY)
    const anchor = ensureAnchor(); if (!anchor) return
    ;(anchor as any).setNextKinematicTranslation?.({ x: ax, y: ay })

    let idx = 0
    if (h.role === "rope") {
      // выбираем ближайший сегмент к курсору
      let best = Infinity, bestIdx = 0
      h.bodies.forEach((b, i) => {
        const t = (b as any).translation()
        const d = Math.hypot(m2px(t.x)-canvasX, m2px(t.y)-canvasY)
        if (d < best) { best = d; bestIdx = i }
      })
      idx = bestIdx
    }

    const target = h.bodies[idx]
    // для чистых colliders тянем напрямую (они сами кинематические)
    if (h.role === "collider") {
      dragPhysRef.current.target = { id: lay.id, idx: 0 }
      dragPhysRef.current.joint = null
      return
    }

    // revolute — свободно вращается, но прицеплен к якорю
    const jd = (R as any).JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 })
    const j = (w as any).createImpulseJoint(jd, anchor, target, true)
    dragPhysRef.current.joint = j
    dragPhysRef.current.target = { id: lay.id, idx }
  }
  const movePhysDrag = (canvasX:number, canvasY:number) => {
    const R = rapierRef.current; if (!R) return
    const anchor = dragPhysRef.current.anchor; if (!anchor) return
    ;(anchor as any).setNextKinematicTranslation?.({ x: px2m(canvasX), y: px2m(canvasY) })
    // colliders — просто двигаем само тело
    const tgt = dragPhysRef.current.target
    if (tgt) {
      const h = handlesRef.current[tgt.id]
      if (h && h.role === "collider" && h.bodies[0]) {
        const b = h.bodies[0]
        ;(b as any).setNextKinematicTranslation?.({ x: px2m(canvasX), y: px2m(canvasY) })
        ;(b as any).setNextKinematicRotation?.(0)
      }
    }
  }
  const endPhysDrag = () => {
    const w = worldRef.current; if (!w) return
    const j = dragPhysRef.current.joint
    if (j) { try { (w as any).removeImpulseJoint(j, true) } catch {} }
    dragPhysRef.current.joint = null
    dragPhysRef.current.target = null
  }

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
    ;(node as any).scaleX?.(newScale)
    ;(node as any).scaleY?.(newScale)
    ;(node as any).rotation?.(newRotation)
    const tr2 = node.getAbsoluteTransform().copy()
    const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x
    const dy = stagePoint.y - p2.y
    ;(node as any).x?.(((node as any).x?.() ?? 0) + dx)
    ;(node as any).y?.(((node as any).y?.() ?? 0) + dy)
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer()); startStroke(p.x, p.y); return
    }

    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      if (tgt === st || isBgTarget(tgt)) {
        select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return
      }

      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)

      if (lay && !lay.meta.locked) {
        // если физика включена — начинаем mouse joint
        if (ph.running && (lay.meta.physRole !== "off" || lay.type === "strokes")) {
          const p = toCanvas(getStagePointer())
          startPhysDrag(p.x, p.y, lay)
          gestureRef.current.active = false // управление берёт joint
          return
        }

        // обычный жест (без физики)
        gestureRef.current = {
          ...gestureRef.current,
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

    if (touches && touches.length >= 2) {
      const lay = find(selectedId)
      if (!lay || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }
      const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2
      const cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      // при включённой физике pinch тоже переводим в mouse-joint (перетаскивание)
      if (ph.running && (lay.meta.physRole !== "off" || lay.type === "strokes")) {
        const p = toCanvas({ x: cx, y: cy })
        startPhysDrag(p.x, p.y, lay)
        gestureRef.current.active = false
        return
      }

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
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer())
      appendStroke(p.x, p.y)
      return
    }

    // mouse joint активен — ведём якорь
    if (ph.running && dragPhysRef.current.target) {
      const p = toCanvas(getStagePointer())
      movePhysDrag(p.x, p.y)
      return
    }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y

      if (lay.type === "strokes") {
        const g = lay.node as Konva.Group
        const line = (g.getChildren().at(0) as Konva.Line | undefined)
        if (line) {
          const pts = [...line.points()]
          for (let i=0;i<pts.length;i+=2) { pts[i] += dx; pts[i+1] += dy }
          line.points(pts)
        }
      } else {
        ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
        ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      }
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
      applyAround(lay.node as any, sp, newScale, newRot)
      artLayerRef.current?.batchDraw()
      if (ph.running) pushNodeToBody(lay.id)
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    if (ph.running) endPhysDrag()
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
    if (ph.running) buildOne(newLay.id)
    bump()
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

  // ===== Скачивание
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

  /* ====================== PHYSICS: Rapier2D ====================== */
  const rapierRef = useRef<RAPIERNS | null>(null)
  const worldRef  = useRef<RWorld | null>(null)
  const handlesRef = useRef<Record<string, PhysHandle>>({})
  const rafRef = useRef<number | null>(null)

  const deg2rad = (d:number) => d * Math.PI / 180
  const rad2deg = (r:number) => r * 180 / Math.PI

  const getRect = (n: AnyNode) =>
    (n as any).getClientRect?.({ skipStroke: false }) ||
    { x:(n as any).x?.()||0, y:(n as any).y?.()||0, width:(n as any).width?.()||0, height:(n as any).height?.()||0 }

  const takeBaseline = (l: AnyLayer) => {
    const n:any = l.node as any
    const base = {
      x: n.x?.() ?? 0, y: n.y?.() ?? 0, rot: n.rotation?.() ?? 0,
      sx: n.scaleX?.() ?? 1, sy: n.scaleY?.() ?? 1
    } as BaseMeta["baseline"]
    if (l.type === "strokes") {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      if (line) base.points = [...line.points()]
    }
    setLayers(p => p.map(x => x.id===l.id ? ({ ...x, meta: { ...x.meta, baseline: base } }) : x))
  }

  const restoreBaseline = (l: AnyLayer) => {
    const b = l.meta.baseline
    if (!b) return
    const n:any = l.node as any
    n.x?.(b.x); n.y?.(b.y); n.rotation?.(b.rot); n.scaleX?.(b.sx); n.scaleY?.(b.sy)
    if (l.type === "strokes" && b.points) {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      if (line) line.points([...b.points])
    }
  }

  const mkRigidDesc = (R:RAPIERNS, dyn:boolean, kinematic=false) => {
    if (kinematic) return (R as any).RigidBodyDesc.kinematicPositionBased()
    const d = dyn ? (R as any).RigidBodyDesc.dynamic() : (R as any).RigidBodyDesc.fixed()
    if (dyn) {
      d.setCcdEnabled(true)
      d.setLinearDamping(RIGID_LIN_DAMP)
      d.setAngularDamping(RIGID_ANG_DAMP)
    }
    return d
  }

  const removeHandle = (id:string) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const h = handlesRef.current[id]; if (!h) return
    try { h.joints?.forEach(j => (w as any).removeImpulseJoint(j, true)) } catch {}
    try { h.bodies.forEach(b => (w as any).removeRigidBody(b)) } catch {}
    delete handlesRef.current[id]
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
      const desc = mkRigidDesc(R, dyn, asKinematic)
        .setTranslation(px2m(cxpx), px2m(cypx))
        .setRotation(deg2rad(angle))
      return (w as any).createRigidBody(desc)
    }

    const addCuboidCollider = (b: RRigid, wpx:number, hpx:number) => {
      const col = (R as any).ColliderDesc
        .cuboid(px2m(wpx/2), px2m(hpx/2))
        .setFriction(0.9)
        .setRestitution(0.0)
        .setDensity(RIGID_DENSITY)
      ;(w as any).createCollider(col, b)
    }

    if (role === "collider" || role === "rigid") {
      const dyn = role === "rigid"
      const isKinematic = role === "collider"

      if (l.node instanceof Konva.Circle) {
        const rpx = (l.node as Konva.Circle).radius()
        const b = mkRB(dyn, l.node.x(), l.node.y(), angleDeg, isKinematic)
        const col = (R as any).ColliderDesc.ball(px2m(rpx))
          .setFriction(0.9).setRestitution(0.0).setDensity(RIGID_DENSITY)
        ;(w as any).createCollider(col, b)
        bodies.push(b)
      } else if (l.node instanceof Konva.RegularPolygon && (l.node as Konva.RegularPolygon).sides() === 3) {
        const r = (l.node as Konva.RegularPolygon).radius()
        const verts:number[] = []
        for (let i=0;i<3;i++) {
          const a = (-Math.PI/2) + i * (2*Math.PI/3)
          verts.push(px2m(Math.cos(a)*r), px2m(Math.sin(a)*r))
        }
        const b = mkRB(dyn, l.node.x(), l.node.y(), angleDeg, isKinematic)
        const col = (R as any).ColliderDesc.convexHull(new Float32Array(verts))!
          .setFriction(0.9).setRestitution(0.0).setDensity(RIGID_DENSITY)
        ;(w as any).createCollider(col, b)
        bodies.push(b)
      } else if (l.node instanceof Konva.Group && (l.node as any).getChildren()?.length===2) {
        const b = mkRB(dyn, cx, cy, angleDeg, isKinematic)
        const children = (l.node as any).getChildren() as Konva.Node[]
        children.forEach(ch => {
          const cr = (ch as any).getClientRect?.({ skipStroke:true }) || {x:0,y:0,width:0,height:0}
          addCuboidCollider(b, cr.width, cr.height)
        })
        bodies.push(b)
      } else if (l.node instanceof Konva.Line && (l.node as Konva.Line).stroke()) {
        const ln = l.node as Konva.Line
        const pts = [...ln.points()]
        const sw = Math.max(1, ln.strokeWidth() || 1)
        if (pts.length >= 4) {
          for (let i=0;i<pts.length-2;i+=2) {
            const x1 = pts[i],   y1 = pts[i+1]
            const x2 = pts[i+2], y2 = pts[i+3]
            const cxSeg = (x1+x2)/2
            const cySeg = (y1+y2)/2
            const len = Math.hypot(x2-x1, y2-y1)
            const ang = Math.atan2(y2-y1, x2-x1)
            const b = mkRB(dyn, cxSeg, cySeg, rad2deg(ang), isKinematic)
            const col = (R as any).ColliderDesc.cuboid(px2m(len/2), px2m(sw/2))
              .setFriction(0.9).setRestitution(0.0).setDensity(RIGID_DENSITY)
            ;(w as any).createCollider(col, b)
            bodies.push(b)
          }
        } else {
          const b = mkRB(dyn, cx, cy, angleDeg, isKinematic)
          addCuboidCollider(b, rect.width, rect.height)
          bodies.push(b)
        }
      } else {
        const b = mkRB(dyn, cx, cy, angleDeg, isKinematic)
        addCuboidCollider(b, rect.width, rect.height)
        bodies.push(b)
      }
    }

    if (role === "rope" && l.type === "strokes") {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      const pts = line ? [...line.points()] : []
      if (pts.length >= 4) {
        const thickness = Math.max(ROPE_THICK_MIN, (line?.strokeWidth()||12))
        const samples: {x:number;y:number}[] = []
        let acc = 0
        let prev = { x: pts[0], y: pts[1] }
        samples.push(prev)
        for (let i=2;i<pts.length;i+=2) {
          const p = { x: pts[i], y: pts[i+1] }
          const d = Math.hypot(p.x - prev.x, p.y - prev.y)
          acc += d
          while (acc >= ROPE_SEG_TARGET) {
            const k = (ROPE_SEG_TARGET - (acc - d)) / d
            samples.push({ x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k })
            acc -= ROPE_SEG_TARGET
          }
          prev = p
        }
        if (samples.length < 2) samples.push(prev)

        for (let i=0; i<samples.length-1; i++) {
          const a = samples[i], b = samples[i+1]
          const cxSeg = (a.x + b.x)/2
          const cySeg = (a.y + b.y)/2
          const len = Math.max(4, Math.hypot(b.x-a.x, b.y-a.y))
          const ang = Math.atan2(b.y-a.y, b.x-a.x)
          const rb = (w as any).createRigidBody(
            (R as any).RigidBodyDesc.dynamic()
              .setTranslation(px2m(cxSeg), px2m(cySeg))
              .setRotation(ang)
              .setCcdEnabled(true)
              .setLinearDamping(ROPE_LIN_DAMP)
              .setAngularDamping(ROPE_ANG_DAMP)
          )
          const col = (R as any).ColliderDesc.cuboid(px2m(len/2), px2m(thickness/2))
            .setFriction(0.9).setRestitution(0.0).setDensity(ROPE_DENSITY)
          ;(w as any).createCollider(col, rb)
          bodies.push(rb)

          if (i>0) {
            const prevB = bodies[bodies.length-2]
            const jd = (R as any).JointData.revolute({ x: -px2m(len/2), y: 0 }, { x: px2m(len/2), y: 0 })
            ;(jd as any).limitsEnabled = true
            ;(jd as any).limits = [deg2rad(-ROPE_ANGLE_LIMIT_DEG), deg2rad(ROPE_ANGLE_LIMIT_DEG)]
            const j = (w as any).createImpulseJoint(jd, prevB, rb, true)
            joints.push(j)
          }
        }
      }
    }

    handlesRef.current[id] = { role, bodies, joints }
  }

  const rebuildOne = (id:string) => {
    const l = layers.find(x=>x.id===id); if (!l) return
    takeBaseline(l)
    buildOne(id)
  }

  const syncFromBodies = (R: RAPIERNS) => {
    Object.entries(handlesRef.current).forEach(([id, h]) => {
      const l = layers.find(x=>x.id===id); if (!l) return
      if ((h.role === "collider" || h.role === "rigid") && h.bodies[0]) {
        const b = h.bodies[0]
        const t = (b as any).translation()
        const ang = ((b as any).rotation()?.angle) ?? ((b as any).rotation() as unknown as number) ?? 0
        const cx = m2px(t.x), cy = m2px(t.y)
        if (Number.isNaN(cx) || Number.isNaN(cy) || Number.isNaN(ang)) return

        if (l.node instanceof Konva.Circle) {
          l.node.absolutePosition({ x: cx, y: cy })
          l.node.rotation(rad2deg(ang))
        } else {
          const rect = getRect(l.node)
          const w = rect.width
          const h = rect.height
          const ox = w / 2
          const oy = h / 2
          const cos = Math.cos(ang)
          const sin = Math.sin(ang)
          const rx = cos * ox - sin * oy
          const ry = sin * ox + cos * oy
          const xw = cx - rx
          const yw = cy - ry
          ;(l.node as any).absolutePosition?.({ x: xw, y: yw })
          ;(l.node as any).rotation?.(rad2deg(ang))
        }
      }
      if (h.role === "rope" && l.type === "strokes") {
        const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
        if (!line) return
        const pts:number[] = []
        h.bodies.forEach((b) => { const p = (b as any).translation(); pts.push(m2px(p.x), m2px(p.y)) })
        if (pts.length>=4) { line.points(pts) }
      }
    })
    artLayerRef.current?.batchDraw()
  }

  const killWorld = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    // удалить текущий mouse-joint
    try { endPhysDrag() } catch {}
    handlesRef.current = {}
    worldRef.current = null
    dragPhysRef.current.anchor = null
  }

  const stepLoop = () => {
    const R = rapierRef.current, w = worldRef.current
    if (!R || !w) return
    for (let i=0;i<SUBSTEPS;i++) (w as any).step()
    syncFromBodies(R)
    rafRef.current = requestAnimationFrame(stepLoop)
  }

  const inferAutoRole = (l: AnyLayer): PhysicsRole =>
    l.type === "strokes" ? "rope"
    : (l.type === "text" || l.type === "image" || l.type === "shape") ? "rigid"
    : "off"

  const buildWalls = (R:RAPIERNS, w:RWorld) => {
    const thick = px2m(40)
    const halfW = px2m(BASE_W/2)
    const halfH = px2m(BASE_H/2)
    const mk = (cx:number, cy:number, hx:number, hy:number) => {
      const rb = (w as any).createRigidBody((R as any).RigidBodyDesc.fixed().setTranslation(cx, cy))
      ;(w as any).createCollider((R as any).ColliderDesc.cuboid(hx, hy).setFriction(0.9).setRestitution(0.01), rb)
    }
    mk(px2m(BASE_W/2), px2m(BASE_H) + thick, halfW, thick)
    mk(px2m(BASE_W/2), -thick,             halfW, thick)
    mk(-thick,                px2m(BASE_H/2), thick, halfH)
    mk(px2m(BASE_W) + thick,  px2m(BASE_H/2), thick, halfH)
  }

  const startPhysics = async () => {
    if (ph.running) return
    if (!rapierRef.current) {
      const mod = await import("@dimforge/rapier2d-compat")
      await (mod as any).init?.()
      rapierRef.current = mod
    }

    if (worldRef.current) {
      setPh(s=>({ ...s, running: true }))
      stepLoop()
      return
    }

    const R = rapierRef.current!
    const a = deg2rad(ph.angleDeg)
    const gx = Math.cos(a) * ph.strength
    const gy = Math.sin(a) * ph.strength
    const world = new (R as any).World({ x: gx, y: gy })
    worldRef.current = world

    buildWalls(R, world)

    const currentSide = side
    layers
      .filter(l=>l.side===currentSide && !l.meta.locked && l.meta.visible)
      .forEach(l=>{
        const roleToUse: PhysicsRole =
          ph.autoRoles && (l.meta.physRole||"off")==="off" ? inferAutoRole(l) : (l.meta.physRole||"off")
        takeBaseline(l)
        buildOne(l.id, roleToUse)
      })

    setPh(s=>({ ...s, running: true }))
    stepLoop()
  }

  const pausePhysics = () => {
    if (!ph.running) return
    setPh(s=>({ ...s, running: false }))
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  const resetPhysics = () => {
    pausePhysics()
    layers.filter(l=>l.side===side).forEach(restoreBaseline)
    killWorld()
    artLayerRef.current?.batchDraw()
  }

  const pushNodeToBody = (id: string) => {
    const R = rapierRef.current, w = worldRef.current
    if (!R || !w) return
    const h = handlesRef.current[id]
    if (!h) return
    const l = layers.find(x => x.id === id)
    if (!l) return

    if (h.role === "rigid" || h.role === "collider") {
      const rect = getRect(l.node)
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      const angDeg = (l.node as any).rotation?.() || 0
      const b = h.bodies[0]; if (!b) return

      if (h.role === "collider") {
        ;(b as any).setNextKinematicTranslation?.({ x: px2m(cx), y: px2m(cy) })
        ;(b as any).setNextKinematicRotation?.(deg2rad(angDeg))
      } else {
        ;(b as any).setTranslation?.({ x: px2m(cx), y: px2m(cy) }, true)
        ;(b as any).setRotation?.(deg2rad(angDeg), true)
      }
      ;(b as any).setLinvel?.({ x: 0, y: 0 }, true)
      ;(b as any).setAngvel?.(0, true)
      ;(b as any).wakeUp?.()
      return
    }

    if (h.role === "rope" && l.type === "strokes") {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      if (!line) return
      const pts = [...line.points()]
      if (pts.length < 4 || h.bodies.length === 0) return
      const want = h.bodies.length
      const raw: { x: number; y: number }[] = []
      for (let i = 0; i < pts.length; i += 2) raw.push({ x: pts[i], y: pts[i + 1] })

      const res: { x: number; y: number }[] = [raw[0]]
      let acc = 0
      const total = raw.reduce((s, p, i) => i ? s + Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) : 0, 0)
      const step = Math.max(1, total / (want))
      for (let i = 1; i < raw.length; i++) {
        const a = raw[i - 1], b = raw[i]
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy)
        let t = 0
        while (acc + (dist - t) >= step && res.length < want) {
          const k = (step - acc + t) / dist
          res.push({ x: a.x + dx * k, y: a.y + dy * k })
          acc = 0
          t = step - t
        }
        acc += dist - t
      }
      while (res.length < want) res.push(raw.at(-1)!)

      res.forEach((p, i) => {
        const b = h.bodies[i]; if (!b) return
        ;(b as any).setTranslation?.({ x: px2m(p.x), y: px2m(p.y) }, true)
        ;(b as any).setLinvel?.({ x: 0, y: 0 }, true)
        ;(b as any).setAngvel?.(0, true)
        ;(b as any).wakeUp?.()
      })
    }
  }

  const applyNewGravity = () => {
    const w = worldRef.current
    if (!w) return
    const a = deg2rad(ph.angleDeg)
    const gx = Math.cos(a) * ph.strength
    const gy = Math.sin(a) * ph.strength
    ;(w as any).gravity = { x: gx, y: gy }
  }

  // --- Gyro
  const gyroOffRef = useRef<null | (() => void)>(null)
  const enableGyro = async () => {
    if (gyroOffRef.current) return
    try {
      const AnyDevOri: any = (window as any).DeviceOrientationEvent
      if (AnyDevOri && typeof AnyDevOri.requestPermission === "function") {
        const res = await AnyDevOri.requestPermission()
        if (res !== "granted") return
      }
    } catch {}
    const onOri = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0
      const gamma = e.gamma ?? 0
      const x = Math.sin((gamma * Math.PI) / 180)
      const y = Math.sin((beta  * Math.PI) / 180)
      const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
      setPh(s => ({ ...s, angleDeg: Math.round(deg) }))
      applyNewGravity()
    }
    window.addEventListener("deviceorientation", onOri, true)
    gyroOffRef.current = () => window.removeEventListener("deviceorientation", onOri, true)
  }
  const disableGyro = () => { gyroOffRef.current?.(); gyroOffRef.current = null }
  useEffect(() => { ph.gyro ? enableGyro() : disableGyro(); return disableGyro }, [ph.gyro])

  useEffect(() => () => { pausePhysics(); killWorld(); disableGyro() }, []) // cleanup

  /* ====================== Explode Text ====================== */
  const explodeSelectedText = () => {
    const l = sel
    if (!l || l.type !== "text" || !(l.node instanceof Konva.Text)) return
    const t = l.node

    const style = {
      fontFamily: t.fontFamily(),
      fontStyle: t.fontStyle(),
      fontSize: t.fontSize(),
      fill: t.fill() as string,
      lineHeight: t.lineHeight() || 1,
      letterSpacing: (t as any).letterSpacing?.() || 0,
      align: t.align() as "left"|"center"|"right",
      width: t.width(),
    }

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    const weight = style.fontStyle?.includes("bold") ? "700" : "400"
    const italic = style.fontStyle?.includes("italic") ? "italic " : ""
    ctx.font = `${italic}${weight} ${style.fontSize}px ${style.fontFamily}`

    const text = t.text()
    const lines = text.split("\n")
    const lineWidths = lines.map(line => ctx.measureText(line).width)

    const baseX = t.x()
    const baseY = t.y()

    let y = baseY
    const newLayers: AnyLayer[] = []

    lines.forEach((line, li) => {
      const lw = lineWidths[li]
      let x = baseX
      if (style.align === "center") x = baseX + (style.width - lw)/2
      if (style.align === "right")  x = baseX + (style.width - lw)

      for (let i=0;i<line.length;i++) {
        const ch = line[i]
        const w = ctx.measureText(ch).width
        if (ch.trim()==="") { x += w + style.letterSpacing; continue }
        const n = new Konva.Text({
          text: ch,
          x: x, y: y,
          fontFamily: style.fontFamily,
          fontStyle: style.fontStyle,
          fontSize: style.fontSize,
          fill: style.fill,
          lineHeight: 1,
          draggable: false,
        })
        ;(n as any).id(uid())
        currentArt().add(n)
        const id = (n as any).id()
        const meta = baseMeta(`char ${ch}`)
        meta.physRole = "rigid"
        const lay: AnyLayer = { id, side, node: n, meta, type: "text" }
        attachCommonHandlers(n, id)
        newLayers.push(lay)
        x += w + style.letterSpacing
      }
      y += style.fontSize * style.lineHeight
    })

    deleteLayer(l.id)
    setLayers(prev => [...prev, ...newLayers])
    if (newLayers[0]) select(newLayers[0].id)
    requestAnimationFrame(attachTransformer)
    artLayerRef.current?.batchDraw()
    if (ph.running) { newLayers.forEach(nl => buildOne(nl.id)) }
  }

  /* ====================== Render ====================== */
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id)=>{ onLayerSelect(id) }}
          onToggleVisible={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorder}
          onChangeBlend={(id, b)=>updateMeta(id,{ blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id,{ opacity: o })}
          onChangePhysicsRole={(id, r)=>updateMeta(id, { physRole: r })}
        />
      )}

      <div className="w-full h-full flex items-start justify-center">
        <div style={{ position:"relative", touchAction:"none", width: viewW, height: viewH }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && <KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />}
              {backMock  && <KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true} />}
            </Layer>

            <Layer ref={artLayerRef} listening={true}>
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
        setSelectedFill={(hex)=>{ 
          const s = sel; if (!s) return
          if (selectedKind === "text") (s.node as Konva.Text).fill(hex)
          else if ((s.node as any).fill) (s.node as any).fill(hex)
          artLayerRef.current?.batchDraw(); 
          if (ph.running && s) rebuildOne(s.id)
          bump()
        }}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedLineHeight={setSelectedLineHeight}
        setSelectedLetterSpacing={setSelectedLetterSpacing}
        setSelectedAlign={setSelectedAlign}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
        mobileTopOffset={padTop}
      />

      {/* ===== Physics panel (desktop) */}
      {!isMobile && (
        <div className="fixed right-4 bottom-4 w-[320px] border border-black bg-white rounded-none shadow-xl p-3 space-y-3 z-50">
          <div className="text-[11px] uppercase tracking-widest">Physics (Rapier2D)</div>

          <div className="flex items-center gap-2">
            {!ph.running ? (
              <button className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white" onClick={startPhysics}>▸ Play</button>
            ) : (
              <button className="h-8 px-3 border border-black bg-black text-white hover:bg-white hover:text-black" onClick={pausePhysics}>■ Pause</button>
            )}
            <button className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white" onClick={resetPhysics}>⟲ Reset</button>
            <button
              className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white ml-auto"
              disabled={!sel || sel.type!=="text" || !(sel.node instanceof Konva.Text)}
              onClick={explodeSelectedText}
              title="Explode selected text to letters"
            >
              ✷ Explode
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ph.autoRoles} onChange={(e)=>setPh(s=>({...s, autoRoles:e.target.checked}))} />
              <span>Auto roles</span>
            </label>
            <label className="flex items-center gap-1 ml-4">
              <input type="checkbox" checked={ph.gyro} onChange={(e)=>setPh(s=>({...s, gyro:e.target.checked}))} />
              <span>Gyro</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs w-10">Dir</div>
            <input type="range" min={0} max={360} step={1}
              value={ph.angleDeg}
              onChange={(e)=>{ const v = parseInt(e.target.value,10); setPh(s=>({...s, angleDeg:v})); applyNewGravity() }}
              className="w-full"
            />
            <div className="w-12 text-xs text-right">{ph.angleDeg}°</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs w-10">Str</div>
            <input type="range" min={0} max={30} step={0.1}
              value={ph.strength}
              onChange={(e)=>{ const v = parseFloat(e.target.value); setPh(s=>({...s, strength:v})); applyNewGravity() }}
              className="w-full"
            />
            <div className="w-12 text-xs text-right">{ph.strength.toFixed(1)}</div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-70">For selected:</span>
            <select
              className="h-8 px-2 border border-black/30 rounded-none flex-1"
              value={(sel?.meta.physRole)||"off"}
              onChange={(e)=> sel && updateMeta(sel.id, { physRole: e.target.value as PhysicsRole })}
            >
              <option value="off">off</option>
              <option value="collider">collider</option>
              <option value="rigid">rigid</option>
              <option value="rope">rope</option>
            </select>
          </div>
        </div>
      )}

      {/* ===== Physics (mobile) — Play/Pause внутри панели */}
      {isMobile && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[88px] z-40 w-[92%] max-w-[520px] border border-black bg-white/95 rounded-none shadow-xl p-2">
          <div className="flex items-center gap-2 text-[12px]">
            <button
              className="h-8 px-3 border border-black bg-white"
              onClick={()=> ph.running ? pausePhysics() : startPhysics()}
            >
              {ph.running ? "■ Pause" : "▸ Play"}
            </button>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={ph.autoRoles} onChange={(e)=>setPh(s=>({...s, autoRoles:e.target.checked}))} />
              Auto roles
            </label>
            <label className="flex items-center gap-1 ml-1">
              <input type="checkbox" checked={ph.gyro} onChange={(e)=>setPh(s=>({...s, gyro:e.target.checked}))} />
              Gyro
            </label>
            <button className="h-8 px-3 border border-black bg-white ml-auto" onClick={resetPhysics}>⟲ Reset</button>
            <button
              className="h-8 px-3 border border-black bg-white"
              disabled={!sel || sel.type!=="text" || !(sel.node instanceof Konva.Text)}
              onClick={explodeSelectedText}
            >
              ✷ Explode
            </button>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2 text-[12px] mb-1"><span className="w-10">Dir</span><span className="flex-1" /></div>
            <input type="range" min={0} max={360} step={1}
              value={ph.angleDeg}
              onChange={(e)=>{ const v=parseInt(e.target.value,10); setPh(s=>({...s, angleDeg:v})); applyNewGravity() }}
              className="w-full"
            />
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2 text-[12px] mb-1"><span className="w-10">Str</span><span className="flex-1" /></div>
            <input type="range" min={0} max={30} step={0.1}
              value={ph.strength}
              onChange={(e)=>{ const v=parseFloat(e.target.value); setPh(s=>({...s, strength:v})); applyNewGravity() }}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  )
}
