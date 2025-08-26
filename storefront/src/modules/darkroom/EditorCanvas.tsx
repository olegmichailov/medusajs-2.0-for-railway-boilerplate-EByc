/* EditorCanvas.tsx — FINAL */

"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem, PhysicsRole } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== CANVAS BASE =====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ===== TEXT =====
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

// ===== UTILS =====
const uid = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const EPS = 0.25
const DEAD = 0.006
const log = (...a:any[]) => console.log("[PHYS]", ...a)

// ===== TYPES =====
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

// ===== Rapier =====
type RAPIERNS = typeof import("@dimforge/rapier2d-compat")
type RWorld = import("@dimforge/rapier2d-compat").World
type RRigid = import("@dimforge/rapier2d-compat").RigidBody
type RJoint = import("@dimforge/rapier2d-compat").ImpulseJoint

type PhysHandle = { role: PhysicsRole; bodies: RRigid[]; joints?: RJoint[] }

// единицы — пиксели/метры для стабильной интеграции
const WORLD_SCALE = 50 // 50px = 1м
const px2m = (v:number) => v / WORLD_SCALE
const m2px = (v:number) => v * WORLD_SCALE

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // mockups
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

  // layout/scale
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

  // lock scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false, physRole: "off" })
  const setBlend = (n: AnyNode, blend: Blend) => {
    const node: any = n as any
    if (typeof node.setAttr === "function") { node.setAttr("globalCompositeOperation", blend); return }
    if (typeof node.globalCompositeOperation === "function") { node.globalCompositeOperation(blend); return }
    node.attrs = node.attrs || {}; node.attrs.globalCompositeOperation = blend
  }
  const applyMeta = (n: AnyNode, meta: BaseMeta) => { ;(n as any).opacity?.(meta.opacity); if (!isEraseGroup(n) && !isStrokeGroup(n)) setBlend(n, meta.blend) }
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)

  // show active side
  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side])

  // layer visibility
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [layers, side])

  // gCO fix once
  useEffect(() => {
    layers.forEach((l) => {
      const node: any = l.node
      if (!isEraseGroup(node) && !isStrokeGroup(node) && typeof node.globalCompositeOperation !== "function") {
        try { delete node.globalCompositeOperation } catch {}
        setBlend(node, l.meta.blend)
      }
    })
  }, [])

  // ===== Transformer/Text
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
    const disabled = !n || lay?.meta.locked || isEraseGroup(n) || tool !== "move"

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    const tr = trRef.current!
    if (disabled) { tr.nodes([]); uiLayerRef.current?.batchDraw(); return }
    tr.nodes([n]); tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false; lay && pushNodeToBody(lay.id); lay && rebuildOne(lay.id) }
    ;(n as any).on("transformstart.guard", onStart)
    ;(n as any).on("transformend.guard", onEndT)
    detachGuard.current = () => (n as any).off(".guard")

    if (isTextNode(n)) {
      const t = n as Konva.Text
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])
      const onTextStart = () => captureTextSnap(t)
      const onTextEnd   = () => { textSnapRef.current = null; lay && rebuildOne(lay.id) }
      t.on("transformstart.textsnap", onTextStart)
      t.on("transformend.textsnap",   onTextEnd)

      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        const snap = textSnapRef.current
        if (!snap) captureTextSnap(t)
        const s = textSnapRef.current!
        const getActive = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        if (getActive === "middle-left" || getActive === "middle-right") {
          const ratioW = newBox.width / Math.max(1e-6, oldBox.width)
          if (Math.abs(ratioW - 1) < DEAD) return oldBox
          const minW = Math.max(2, Math.round((t.fontSize() || s.fs0) * 0.45))
          const nextW = clamp(Math.round(s.wrap0 * ratioW), minW, TEXT_MAX_W)
          if (Math.abs((t.width() || 0) - nextW) > EPS) { t.width(nextW); t.x(Math.round(s.cx0 - nextW/2)) }
          t.scaleX(1); t.scaleY(1)
          t.getLayer()?.batchDraw()
          requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); lay && pushNodeToBody(lay.id) })
          return oldBox
        }

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
          t.x(Math.round(s.cx0 - nw/2)); t.y(Math.round(s.cy0 - nh/2))
        }
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); lay && pushNodeToBody(lay.id) })
        return oldBox
      })

      detachTextFix.current = () => { t.off(".textsnap") }
    } else { tr.keepRatio(true) }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // ===== Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId)
      const lay = find(selectedId)

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="t") {
        e.preventDefault(); set({ tool: "move" as Tool }); requestAnimationFrame(attachTransformer); return
      }
      if (!n || !lay) return
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }

      if (tool !== "move") return
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      ;(n as any).x && (n as any).y && (
        (e.key === "ArrowLeft"  && (n as any).x((n as any).x()-step)),
        (e.key === "ArrowRight" && (n as any).x((n as any).x()+step)),
        (e.key === "ArrowUp"    && (n as any).y((n as any).y()-step)),
        (e.key === "ArrowDown"  && (n as any).y((n as any).y()+step))
      )
      lay && pushNodeToBody(lay.id)
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool, set])

  // ===== Brush / Erase
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
  const finishStroke = () => { setIsDrawing(false); const l = find(selectedId); if (l && l.meta.physRole === "rope") rebuildOne(l.id) }

  // ===== Fonts
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  // ===== Common handlers
  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
    ;(k as any).draggable?.(true)
    ;(k as any).on("dragmove._phys", () => pushNodeToBody(id, true))
    ;(k as any).on("dragend._phys",  () => { pushNodeToBody(id, true); rebuildOne(id) })
    ;(k as any).on("transform._phys", () => pushNodeToBody(id, true))
    ;(k as any).on("transformend._phys", () => rebuildOne(id))
  }

  // ===== Image/Text/Shape adders
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, draggable:true })
        ;(kimg as any).id(uid())
        const id = (kimg as any).id()
        const meta = baseMeta(`image ${seqs.image}`); meta.physRole = "rigid"
        currentArt().add(kimg); (kimg as any).moveToTop()
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
        maybeAutoBuild(id)
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL", x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96, fontFamily: siteFont(), fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      lineHeight: 1, letterSpacing: 0, draggable: true,
    })
    ;(t as any).id(uid())
    const id = (t as any).id()
    const meta = baseMeta(`text ${seqs.text}`); meta.physRole = "rigid"
    currentArt().add(t); (t as any).moveToTop()
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    maybeAutoBuild(id)
  }
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor, draggable:true })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor, draggable:true })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor, draggable:true })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160, draggable:true}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 20, lineCap: "round", draggable:true })
    ;(n as any).id(uid())
    const id = (n as any).id()
    const meta = baseMeta(`shape ${seqs.shape}`); meta.physRole = "rigid"
    currentArt().add(n as any); (n as any).moveToTop?.()
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    maybeAutoBuild(id)
  }

  // ===== Text overlay editor
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stBox = stage.container().getBoundingClientRect()
    const prevOpacity = t.opacity()
    t.opacity(0.01); t.getLayer()?.batchDraw()
    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      const vv = typeof window !== "undefined" && (window as any).visualViewport
        ? (window as any).visualViewport as VisualViewport : null
      let left = stBox.left + r.x * scale
      let top  = stBox.top  + r.y * scale
      if (vv) { left += vv.offsetLeft; top += vv.offsetTop }
      ta.style.left   = `${left}px`; ta.style.top = `${top}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    Object.assign(ta.style, {
      position: "fixed", padding: "0", margin: "0",
      border: "1px solid #111", background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle: t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()), letterSpacing: `${(t.letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap", overflow: "hidden", outline: "none", resize: "none",
      transformOrigin: "left top", zIndex: "9999", caretColor: String(t.fill() || "#000"),
      userSelect: "text", textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    place(); document.body.appendChild(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length)
    const onInput = () => { t.text(ta.value); t.getLayer()?.batchDraw(); requestAnimationFrame(()=>{ place(); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); pushNodeToBody((t as any).id()) }) }
    const commit = (apply: boolean) => {
      window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true)
      const vv = (window as any).visualViewport as VisualViewport | undefined
      vv?.removeEventListener("resize", place as any); vv?.removeEventListener("scroll", place as any)
      ta.removeEventListener("input", onInput); ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value); ta.remove(); t.opacity(prevOpacity); t.getLayer()?.batchDraw(); rebuildOne((t as any).id())
      requestAnimationFrame(()=>{ select((t as any).id()); attachTransformer(); trRef.current?.nodes([t]); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
    }
    const onKey = (ev: KeyboardEvent) => { ev.stopPropagation(); if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) } if (ev.key === "Escape") { ev.preventDefault(); commit(false) } }
    ta.addEventListener("input", onInput); ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true)
    const vv = (window as any).visualViewport as VisualViewport | undefined
    vv?.addEventListener("resize", place as any); vv?.addEventListener("scroll", place as any)
  }

  // ===== Mobile gestures (drag/pinch) — синк с физикой
  type G = { active: boolean; two: boolean; startDist: number; startAngle: number; startScaleX: number; startScaleY: number; startRot: number; startPos: { x: number, y: number }; centerCanvas: { x: number, y: number }; nodeId: string | null; lastPointer?: { x: number, y: number } }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScaleX:1, startScaleY:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })
  const isBgTarget = (t: Konva.Node | null) => !!t && (t === frontBgRef.current || t === backBgRef.current)
  const isTransformerChild = (t: Konva.Node | null) => { let p: Konva.Node | null | undefined = t; const tr = trRef.current as unknown as Konva.Node | null; while (p) { if (tr && p === tr) return true; p = p.getParent?.() } return false }
  const applyAround = (node: Konva.Node, stagePoint: { x:number; y:number }, newScale: number, newRotation: number) => {
    const tr = node.getAbsoluteTransform().copy(); const inv = tr.invert(); const local = inv.point(stagePoint)
    ;(node as any).scaleX?.(newScale); (node as any).scaleY?.(newScale); (node as any).rotation?.(newRotation)
    const tr2 = node.getAbsoluteTransform().copy(); const p2 = tr2.point(local)
    const dx = stagePoint.x - p2.x; const dy = stagePoint.y - p2.y
    ;(node as any).x?.(((node as any).x?.() ?? 0) + dx); ;(node as any).y?.(((node as any).y?.() ?? 0) + dy)
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") { const p = toCanvas(getStagePointer()); startStroke(p.x, p.y); return }

    if (!touches || touches.length === 1) {
      const st = stageRef.current!; const tgt = e.target as Konva.Node
      if (tgt === st || isBgTarget(tgt)) { select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return }
      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)
      if (lay && !lay.meta.locked) {
        gestureRef.current = { ...gestureRef.current, active: true, two: false, nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(getStagePointer()), centerCanvas: toCanvas(getStagePointer()),
          startDist: 0, startAngle: 0, startScaleX: (lay.node as any).scaleX?.() ?? 1, startScaleY: (lay.node as any).scaleY?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

    if (touches && touches.length >= 2) {
      const lay = find(selectedId); if (!lay || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }, p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x, dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy), ang  = Math.atan2(dy, dx)
      gestureRef.current = { active: true, two: true, nodeId: lay.id, startDist: Math.max(dist, 0.0001), startAngle: ang,
        startScaleX: (lay.node as any).scaleX?.() ?? 1, startScaleY: (lay.node as any).scaleY?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0,
        startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 }, centerCanvas: toCanvas({ x: cx, y: cy }), lastPointer: undefined }
      trRef.current?.nodes([]); uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") { if (!isDrawing) return; const p = toCanvas(getStagePointer()); appendStroke(p.x, p.y); return }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer()); const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x, dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx); ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      pushNodeToBody(lay.id, true)
      artLayerRef.current?.batchDraw()
      return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy), ang  = Math.atan2(dy, dx)
      let s = dist / gestureRef.current.startDist; s = Math.min(Math.max(s, 0.1), 10)
      const baseScale = gestureRef.current.startScaleX
      const newScale = baseScale * s
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)
      const c = gestureRef.current.centerCanvas; const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      pushNodeToBody(lay.id, true)
      artLayerRef.current?.batchDraw()
    }
  }
  const onUp = () => { if (isDrawing) finishStroke(); gestureRef.current.active = false; gestureRef.current.two = false; isTransformingRef.current = false; requestAnimationFrame(attachTransformer) }

  // ===== Layer panel data
  const layerItems: LayerItem[] = useMemo(() => {
    void uiTick
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked, blend: l.meta.blend, opacity: l.meta.opacity, physRole: l.meta.physRole || "off" }))
  }, [layers, side, uiTick])

  const deleteLayer = (id: string) => {
    setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) })
    if (selectedId === id) select(null)
    dropHandle(id)
    artLayerRef.current?.batchDraw()
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
    maybeAutoBuild(newLay.id)
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
      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); bump() })
  }
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }; applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    bump()
    if (typeof patch.physRole !== "undefined") rebuildOne(id)
  }
  const onLayerSelect = (id: string) => { select(id); if (tool !== "move") set({ tool: "move" }) }

  // ===== Selected props editors
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(), fontSize: Math.round(sel.node.fontSize()), fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string, lineHeight: sel.node.lineHeight?.(), letterSpacing: (sel.node as any).letterSpacing?.(), align: sel.node.align?.() as "left"|"center"|"right",
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill?.() ?? "#000000", stroke: (sel.node as any).stroke?.() ?? "#000000", strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    } : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS)); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedLineHeight = (lh:number)   => { const n = sel?.node as Konva.Text; if (!n) return; n.lineHeight(clamp(lh, 0.5, 3)); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedLetterSpacing = (ls:number)=> { const n = sel?.node as any; if (!n || typeof n.letterSpacing !== "function") return; n.letterSpacing(ls); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }
  const setSelectedAlign = (a:"left"|"center"|"right") => { const n = sel?.node as Konva.Text; if (!n) return; n.align(a); artLayerRef.current?.batchDraw(); bump(); if(sel) rebuildOne(sel.id) }

  // ===== Clear
  const clearArt = () => {
    const g = currentArt(); if (!g) return
    g.removeChildren()
    layers.filter(l=>l.side===side).forEach(l=>dropHandle(l.id))
    setLayers(prev => prev.filter(l => l.side !== side))
    select(null)
    artLayerRef.current?.batchDraw()
    bump()
  }

  // ===== Export
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    uiLayerRef.current?.visible(false)
    const showFront = s === "front"
    frontBgRef.current?.visible(showFront); backBgRef.current?.visible(!showFront)
    frontArtRef.current?.visible(showFront); backArtRef.current?.visible(!showFront)
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)
    frontBgRef.current?.visible(side === "front"); backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front"); backArtRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true); st.draw()
    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== PHYSICS (Rapier)
  const rapierRef = useRef<RAPIERNS | null>(null)
  const worldRef  = useRef<RWorld | null>(null)
  const handlesRef = useRef<Record<string, PhysHandle>>({})
  const rafRef = useRef<number | null>(null)
  const [ph, setPh] = useState({ running: false, angleDeg: 90, strength: 12, speed: 0.6, autoRoles: true }) // strength в м/с², speed — множитель «медленности»

  const deg2rad = (d:number) => d * Math.PI / 180
  const rad2deg = (r:number) => r * 180 / Math.PI

  const getSize = (n: AnyNode) => {
    if (n instanceof Konva.Circle) { const r=n.radius(); return { w: r*2, h: r*2 } }
    if (n instanceof Konva.Text) { const self = (n as any).getSelfRect?.() || { width: Math.max(1, n.width()||1), height: Math.max(1, n.height()||1) }; return { w: Math.max(1, n.width() || self.width), h: Math.max(1, self.height) } }
    if (n instanceof Konva.RegularPolygon) { const r=n.radius(); return { w:r*2, h:r*2 } }
    const as:any = n as any
    if (typeof as.width==="function" && typeof as.height==="function") return { w: Math.max(1, as.width()), h: Math.max(1, as.height()) }
    const rect = (n as any).getClientRect?.({ skipStroke: true }) || { width: 1, height: 1 }
    return { w: Math.max(1, rect.width), h: Math.max(1, rect.height) }
  }
  const getCenter = (n: AnyNode) => {
    const rect = (n as any).getClientRect?.({ skipStroke: false }) || { x:(n as any).x?.()||0, y:(n as any).y?.()||0, width:(n as any).width?.()||0, height:(n as any).height?.()||0 }
    return { cx: rect.x + rect.width/2, cy: rect.y + rect.height/2 }
  }

  const mkRigid = (R: RAPIERNS, world:RWorld, dyn:boolean, cx_px:number, cy_px:number, angleDeg:number) => {
    const desc = (dyn ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.fixed())
      .setTranslation(px2m(cx_px), px2m(cy_px))
      .setRotation(deg2rad(angleDeg))
      .setCcdEnabled(true)
      .setLinearDamping(2.2)
      .setAngularDamping(1.6)
    return world.createRigidBody(desc)
  }

  const buildForLayer = (R: RAPIERNS, world: RWorld, l: AnyLayer, roleOverride?: PhysicsRole): PhysHandle | null => {
    const role = roleOverride ?? (l.meta.physRole || "off")
    if (role === "off" || l.type === "erase") return null

    const bodies: RRigid[] = []
    const joints: RJoint[] = []

    if (role === "collider" || role === "rigid") {
      const dyn = role === "rigid"
      if (l.node instanceof Konva.Circle) {
        const rpx = (l.node as Konva.Circle).radius()
        const { cx, cy } = getCenter(l.node)
        const b = mkRigid(R, world, dyn, cx, cy, (l.node.rotation?.()||0))
        world.createCollider(R.ColliderDesc.ball(px2m(rpx)).setDensity(0.8).setFriction(0.6).setRestitution(0.05), b)
        bodies.push(b)
      } else if (l.node instanceof Konva.RegularPolygon) {
        const { cx, cy } = getCenter(l.node)
        const r = l.node.radius()
        const sides = (l.node as Konva.RegularPolygon).sides()
        const verts: number[] = []
        for (let i=0;i<sides;i++) { const ang = (i/sides) * Math.PI*2; verts.push(px2m(Math.cos(ang)*r), px2m(Math.sin(ang)*r)) }
        const b = mkRigid(R, world, dyn, cx, cy, (l.node.rotation?.()||0))
        world.createCollider(R.ColliderDesc.convexHull(new Float32Array(verts))!.setDensity(0.8).setFriction(0.6).setRestitution(0.05), b)
        bodies.push(b)
      } else if (l.node instanceof Konva.Line && l.type==="shape") {
        const ln = l.node as Konva.Line
        const pts = ln.points()
        const x0 = pts[0], y0 = pts[1], x1 = pts[pts.length-2], y1 = pts[pts.length-1]
        const len = Math.max(2, Math.hypot(x1-x0, y1-y0))
        const sw = Math.max(2, (ln.strokeWidth?.()||12))
        const cx = (x0+x1)/2, cy=(y0+y1)/2
        const angle = Math.atan2(y1-y0, x1-x0) * 180/Math.PI
        const b = mkRigid(R, world, dyn, cx, cy, angle + (ln.rotation?.()||0))
        world.createCollider(R.ColliderDesc.cuboid(px2m(len/2), px2m(sw/2)).setDensity(0.8).setFriction(0.6).setRestitution(0.05), b)
        bodies.push(b)
      } else if (l.node instanceof Konva.Group && (l.node as Konva.Group).getChildren().some(ch=>ch instanceof Konva.Rect)) {
        const g = l.node as Konva.Group
        const { cx, cy } = getCenter(g)
        const b = mkRigid(R, world, dyn, cx, cy, (g.rotation?.()||0))
        g.getChildren().forEach(ch=>{
          if (ch instanceof Konva.Rect) {
            const w=(ch.width?.()||1), h=(ch.height?.()||1)
            world.createCollider(R.ColliderDesc.cuboid(px2m(w/2), px2m(h/2)).setDensity(0.8).setFriction(0.6).setRestitution(0.05), b)
          }
        })
        bodies.push(b)
      } else {
        const { w, h } = getSize(l.node)
        const { cx, cy } = getCenter(l.node)
        const b = mkRigid(R, world, dyn, cx, cy, (l.node as any).rotation?.()||0)
        world.createCollider(R.ColliderDesc.cuboid(px2m(w/2), px2m(h/2)).setDensity(0.8).setFriction(0.6).setRestitution(0.05), b)
        bodies.push(b)
      }
    }

    if (role === "rope" && l.type === "strokes") {
      const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
      const pts = line ? [...line.points()] : []
      if (pts.length >= 4) {
        const SEG = 22
        let acc = 0
        const samples: {x:number;y:number}[] = [{ x: pts[0], y: pts[1] }]
        for (let i=2;i<pts.length;i+=2) {
          const x0 = samples.at(-1)!.x, y0 = samples.at(-1)!.y
          const x1 = pts[i], y1 = pts[i+1]
          const dx = x1-x0, dy=y1-y0
          const dist = Math.hypot(dx,dy)
          acc += dist
          if (acc >= SEG) { const k = SEG/dist; samples.push({ x: x0+dx*k, y: y0+dy*k }); acc = 0 }
        }
        const radius_px = Math.max(3, (line?.strokeWidth()||12)/2)
        let prev: RRigid | null = null
        samples.forEach((p) => {
          const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(px2m(p.x), px2m(p.y)).setLinearDamping(2.4).setAngularDamping(1.6).setCcdEnabled(true))
          world.createCollider(R.ColliderDesc.ball(px2m(radius_px)).setDensity(0.5).setFriction(0.5).setRestitution(0.05), b)
          bodies.push(b)
          if (prev) { const joint = R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }); const j = world.createImpulseJoint(joint, prev, b, true); joints.push(j) }
          prev = b
        })
      }
    }

    log("build layer", { id: l.id, type: l.type, role, bodies: bodies.length, joints: joints.length })
    return { role, bodies, joints }
  }

  // push node → body (drag/transform); if hard=true, обнуляем скорости
  const pushNodeToBody = (id: string, hard=false) => {
    const R = rapierRef.current, w = worldRef.current; if (!R||!w) return
    const h = handlesRef.current[id]; if (!h) return
    const l = layers.find(x=>x.id===id); if (!l) return
    if (h.role === "rigid" || h.role === "collider") {
      const b = h.bodies[0]; if (!b) return
      const { cx, cy } = getCenter(l.node)
      b.setTranslation({ x: px2m(cx), y: px2m(cy) }, true)
      b.setRotation(deg2rad((l.node as any).rotation?.()||0), true)
      if (hard) { b.setLinvel({ x: 0, y: 0 }, true); (b as any).setAngvel && (b as any).setAngvel(0, true) }
    }
    if (h.role === "rope" && l.type==="strokes") {
      const g = l.node as Konva.Group
      const prev = (g as any).__prevAbs as {x:number;y:number}|undefined
      const now = g.getAbsolutePosition()
      if (prev) {
        const dx = now.x - prev.x, dy = now.y - prev.y
        h.bodies.forEach(b => {
          const t = b.translation()
          b.setTranslation({ x: t.x + px2m(dx), y: t.y + px2m(dy) }, true)
          b.setLinvel({ x: 0, y: 0 }, true)
        })
      }
      ;(g as any).__prevAbs = now
    }
  }

  // sync bodies → nodes
  const syncFromBodies = (R: RAPIERNS) => {
    Object.entries(handlesRef.current).forEach(([id, h]) => {
      const l = layers.find(x=>x.id===id); if (!l) return
      if (h.role === "collider" || h.role === "rigid") {
        const b = h.bodies[0]; if (!b) return
        const t = b.translation()
        const ang = (b.rotation() as any)?.angle ?? (b.rotation() as unknown as number) ?? 0
        const cx = m2px(t.x), cy = m2px(t.y)
        const { w, h:hh } = getSize(l.node)
        const ox = w/2, oy = hh/2
        const cos = Math.cos(ang), sin = Math.sin(ang)
        const rx = cos * ox - sin * oy
        const ry = sin * ox + cos * oy
        const xw = cx - rx, yw = cy - ry
        ;(l.node as any).absolutePosition?.({ x: xw, y: yw })
        ;(l.node as any).rotation?.(rad2deg(ang))
      }
      if (h.role === "rope" && l.type === "strokes") {
        const line = (l.node as any).getChildren?.().at(0) as Konva.Line | undefined
        if (!line) return
        const pts:number[] = []
        h.bodies.forEach((b) => { const p = b.translation(); pts.push(m2px(p.x), m2px(p.y)) })
        if (pts.length>=4) { line.points(pts) }
      }
    })
    artLayerRef.current?.batchDraw()
  }

  const dropHandle = (id: string) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const h = handlesRef.current[id]; if (!h) return
    h.joints?.forEach(j => w.removeImpulseJoint(j, true))
    h.bodies.forEach(b => w.removeRigidBody(b))
    delete handlesRef.current[id]
  }
  const rebuildOne = (id: string) => {
    const R = rapierRef.current, w = worldRef.current; if (!R || !w) return
    const l = layers.find(x=>x.id===id); if (!l) return
    dropHandle(id)
    const roleToUse: PhysicsRole = ph.autoRoles && (l.meta.physRole||"off")==="off" ? inferAutoRole(l) : (l.meta.physRole||"off")
    if (roleToUse==="off" || !l.meta.visible || l.meta.locked || l.side!==side) return
    const h = buildForLayer(R, w, l, roleToUse); if (h) handlesRef.current[id] = h
  }
  const maybeAutoBuild = (id: string) => { if (ph.running) rebuildOne(id) }

  const stepLoop = () => {
    const R = rapierRef.current, w = worldRef.current
    if (!R || !w) return
    w.step()
    syncFromBodies(R)
    rafRef.current = requestAnimationFrame(stepLoop)
  }

  const inferAutoRole = (l: AnyLayer): PhysicsRole =>
    l.type === "strokes" ? "rope"
    : (l.type === "text" || l.type === "image" || l.type === "shape") ? "rigid"
    : "off"

  const startPhysics = async () => {
    if (ph.running) return
    const mod = await import("@dimforge/rapier2d-compat"); await mod.init()
    rapierRef.current = mod

    const a = (ph.angleDeg*Math.PI)/180
    const gBase = ph.strength * ph.speed // «медленность» — просто делаем слабее ускорение
    const gx = Math.cos(a) * gBase
    const gy = Math.sin(a) * gBase
    const world = new mod.World({ x: gx, y: gy })
    ;(world.integrationParameters as any).dt = 1/60 // стабильный шаг
    worldRef.current = world

    // периметр-стены (ничего не улетает)
    const T = px2m(24)
    const left   = world.createRigidBody(mod.RigidBodyDesc.fixed().setTranslation(px2m(12), px2m(BASE_H/2)))
    const right  = world.createRigidBody(mod.RigidBodyDesc.fixed().setTranslation(px2m(BASE_W-12), px2m(BASE_H/2)))
    const top    = world.createRigidBody(mod.RigidBodyDesc.fixed().setTranslation(px2m(BASE_W/2), px2m(12)))
    const bottom = world.createRigidBody(mod.RigidBodyDesc.fixed().setTranslation(px2m(BASE_W/2), px2m(BASE_H-12)))
    world.createCollider(mod.ColliderDesc.cuboid(T/2, px2m(BASE_H/2)), left)
    world.createCollider(mod.ColliderDesc.cuboid(T/2, px2m(BASE_H/2)), right)
    world.createCollider(mod.ColliderDesc.cuboid(px2m(BASE_W/2), T/2), top)
    world.createCollider(mod.ColliderDesc.cuboid(px2m(BASE_W/2), T/2), bottom)

    // build current side
    layers.filter(l=>l.side===side && !l.meta.locked && l.meta.visible).forEach(l=>{
      const roleToUse: PhysicsRole = ph.autoRoles && (l.meta.physRole||"off")==="off" ? inferAutoRole(l) : (l.meta.physRole||"off")
      const h = buildForLayer(mod, world, l, roleToUse); if (h) handlesRef.current[l.id] = h
      attachCommonHandlers(l.node, l.id) // на всякий
    })

    setPh(s=>({ ...s, running: true }))
    stepLoop()
  }
  const pausePhysics = () => { if (!ph.running) return; setPh(s=>({ ...s, running: false })); if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  const resetPhysics = () => {
    pausePhysics()
    Object.keys(handlesRef.current).forEach(dropHandle)
    handlesRef.current = {}
    worldRef.current = null
    artLayerRef.current?.batchDraw()
  }
  const applyNewGravity = () => {
    const w = worldRef.current; if (!w) return
    const a = (ph.angleDeg*Math.PI)/180
    const gBase = ph.strength * ph.speed
    const gx = Math.cos(a) * gBase
    const gy = Math.sin(a) * gBase
    ;(w as any).gravity = { x: gx, y: gy }
  }

  // auto-attach new/changed while running
  useEffect(() => {
    if (!ph.running) return
    const ids = layers.filter(l=>l.side===side && l.meta.visible && !l.meta.locked).map(l=>l.id)
    ids.forEach(id => { if (!handlesRef.current[id]) rebuildOne(id) })
    Object.keys(handlesRef.current).forEach(id => {
      if (!layers.find(l=>l.id===id && l.side===side && l.meta.visible && !l.meta.locked)) dropHandle(id)
    })
  }, [layers, side, ph.running])

  useEffect(() => () => { pausePhysics(); worldRef.current = null; handlesRef.current = {} }, [])

  // ===== Explode Text
  const explodeSelectedText = () => {
    const l = sel; if (!l || l.type !== "text" || !(l.node instanceof Konva.Text)) return
    const t = l.node
    const style = { fontFamily: t.fontFamily(), fontStyle: t.fontStyle(), fontSize: t.fontSize(), fill: t.fill() as string, lineHeight: t.lineHeight() || 1, letterSpacing: (t as any).letterSpacing?.() || 0, align: t.align() as "left"|"center"|"right", width: t.width() }
    const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d")!
    const weight = style.fontStyle?.includes("bold") ? "700" : "400"; const italic = style.fontStyle?.includes("italic") ? "italic " : ""
    ctx.font = `${italic}${weight} ${style.fontSize}px ${style.fontFamily}`
    const text = t.text(), lines = text.split("\n"); const lineWidths = lines.map(line => ctx.measureText(line).width)
    const baseX = t.x(), baseY = t.y()
    let y = baseY; const newLayers: AnyLayer[] = []
    lines.forEach((line, li) => {
      const lw = lineWidths[li]; let x = baseX
      if (style.align === "center") x = baseX + (style.width - lw)/2
      if (style.align === "right")  x = baseX + (style.width - lw)
      for (let i=0;i<line.length;i++) {
        const ch = line[i]
        const w = ctx.measureText(ch).width
        if (ch.trim()==="") { x += w + style.letterSpacing; continue }
        const n = new Konva.Text({ text: ch, x, y, fontFamily: style.fontFamily, fontStyle: style.fontStyle, fontSize: style.fontSize, fill: style.fill, lineHeight: 1, draggable: true })
        ;(n as any).id(uid()); currentArt().add(n)
        const id = (n as any).id(); const meta = baseMeta(`char ${ch}`); meta.physRole = "rigid"
        const lay: AnyLayer = { id, side, node: n, meta, type: "text" }
        attachCommonHandlers(n, id); newLayers.push(lay); x += w + style.letterSpacing
      }
      y += style.fontSize * style.lineHeight
    })
    deleteLayer(l.id); setLayers(prev => [...prev, ...newLayers]); artLayerRef.current?.batchDraw(); bump(); newLayers.forEach(nl => maybeAutoBuild(nl.id))
  }

  // ===== RENDER
  return (
    <div className="fixed inset-0 bg-white" style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}>
      {!isMobile && showLayers && (
        <div className="max-h-[72vh] overflow-auto">
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
            onChangePhysicsRole={(id, r)=>updateMeta(id, { physRole: r })}
          />
        </div>
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
              <Transformer ref={trRef} rotateEnabled anchorSize={12} borderStroke="black" anchorStroke="black" anchorFill="white" />
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
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={(hex)=>{ const s = sel; if (!s) return; if (selectedKind === "text") (s.node as Konva.Text).fill(hex); else if ((s.node as any).fill) (s.node as any).fill(hex); artLayerRef.current?.batchDraw(); bump(); if (s) rebuildOne(s.id) }}
        setSelectedLineHeight={setSelectedLineHeight}
        setSelectedLetterSpacing={setSelectedLetterSpacing}
        setSelectedAlign={setSelectedAlign}
        mobileLayers={{
          items: layerItems, selectedId: selectedId ?? undefined, onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer, onDuplicate: duplicateLayer,
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
        mobileTopOffset={padTop}
      />

      {/* ===== Physics panel (compact, bw) */}
      <style jsx>{`
        .phys-panel input[type="range"]{ -webkit-appearance:none; appearance:none; width:100%; height:2px; background:#000; outline:none }
        .phys-panel input[type="range"]::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:12px; height:12px; background:#fff; border:1px solid #000; cursor:pointer }
        .phys-panel input[type="range"]::-moz-range-thumb{ width:12px; height:12px; background:#fff; border:1px solid #000; cursor:pointer }
      `}</style>
      <div className={`phys-panel fixed ${!isMobile && showLayers ? "left-6" : "right-6"} bottom-6 z-30 w-[min(560px,calc(100vw-24px))] border border-black bg-white rounded-none shadow-xl p-3 space-y-2`}>
        <div className="text-[11px] uppercase tracking-widest">Physics</div>
        <div className="flex items-center gap-2">
          {!ph.running ? (
            <button className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white" onClick={startPhysics}>▸ Play</button>
          ) : (
            <button className="h-8 px-3 border border-black bg-black text-white hover:bg-white hover:text-black" onClick={pausePhysics}>■ Pause</button>
          )}
          <button className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white" onClick={resetPhysics}>⟲ Reset</button>
          <button className="h-8 px-3 border border-black bg-white hover:bg-black hover:text-white ml-auto"
            disabled={!sel || sel.type!=="text" || !(sel.node instanceof Konva.Text)} onClick={explodeSelectedText} title="Explode selected text">
            ✷ Explode
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs w-10">Dir</div>
          <input type="range" min={0} max={360} step={1} value={ph.angleDeg} onChange={(e)=>{ const v=+e.target.value; setPh(s=>({...s, angleDeg:v})); applyNewGravity() }} className="w-full" />
          <div className="w-10 text-xs text-right">{ph.angleDeg}°</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs w-10">Str</div>
          <input type="range" min={0} max={30} step={0.5} value={ph.strength} onChange={(e)=>{ const v=+e.target.value; setPh(s=>({...s, strength:v})); applyNewGravity() }} className="w-full" />
          <div className="w-12 text-xs text-right">{ph.strength.toFixed(1)}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs w-10">Slow</div>
          <input type="range" min={0.2} max={1} step={0.05} value={ph.speed} onChange={(e)=>{ const v=+e.target.value; setPh(s=>({...s, speed:v})); applyNewGravity() }} className="w-full" />
          <div className="w-12 text-xs text-right">×{ph.speed.toFixed(2)}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="opacity-70">Auto roles</span>
          <input type="checkbox" checked={ph.autoRoles} onChange={(e)=>setPh(s=>({...s, autoRoles:e.target.checked}))} />
          <span className="ml-3 opacity-70">For selected:</span>
          <select className="h-7 px-2 border border-black/30 rounded-none" value={(sel?.meta.physRole)||"off"} onChange={(e)=> sel && updateMeta(sel.id, { physRole: e.target.value as PhysicsRole })}>
            <option value="off">off</option>
            <option value="collider">collider</option>
            <option value="rigid">rigid</option>
            <option value="rope">rope</option>
          </select>
        </div>
      </div>
    </div>
  )
}
