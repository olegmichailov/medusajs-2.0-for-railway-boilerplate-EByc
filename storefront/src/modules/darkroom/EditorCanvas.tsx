"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ==== БАЗА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// Текст — лимиты
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

// Плавность и защита от дрожи/схлопываний
const EPS  = 0.25
const DEAD = 0.02
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const uid = () => "n_" + Math.random().toString(36).slice(2)

// ==== ТИПЫ ====
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

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup  = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isErase   === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text
const isImgOrRect   = (n: AnyNode) => n instanceof Konva.Image || n instanceof Konva.Rect

const dist = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.hypot(a.x-b.x, a.y-b.y)

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef    = useRef<Konva.Stage>(null)
  const bgLayerRef  = useRef<Konva.Layer>(null)
  const artLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef  = useRef<Konva.Layer>(null)
  const trRef       = useRef<Konva.Transformer>(null)
  const frontBgRef  = useRef<Konva.Image>(null)
  const backBgRef   = useRef<Konva.Image>(null)
  const frontArtRef = useRef<Konva.Group>(null)
  const backArtRef  = useRef<Konva.Group>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })

  // тик UI
  const [uiTick, setUiTick] = useState(0)
  const bump = () => setUiTick(v => (v + 1) | 0)

  // один rAF на пачку операций
  const rafId = useRef<number | null>(null)
  const scheduleUI = () => {
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      trRef.current?.forceUpdate()
      uiLayerRef.current?.batchDraw()
      artLayerRef.current?.batchDraw()
      bump()
    })
  }

  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })
  const isTransformingRef   = useRef(false)
  const isEditingTextRef    = useRef(false)
  const suppressTransformUntil = useRef<number>(0)

  // ===== Вёрстка/масштаб =====
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 2
    const padBottom = isMobile ? 162 : 72
    const maxW = vw - 8
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
    if (cont) cont.style.touchAction = "none"
  }, [])

  // ===== Helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  const findLayerByTargetNode = (tgt: Konva.Node | null): AnyLayer | null => {
    if (!tgt) return null
    let p: Konva.Node | null | undefined = tgt
    while (p) {
      const hit = layers.find(l => l.node === p)
      if (hit) return hit
      p = p.getParent?.()
    }
    return null
  }

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    if (!isEraseGroup(n) && !isStrokeGroup(n)) (n as any).globalCompositeOperation = meta.blend
  }

  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)
  const nextTopZ   = () => (currentArt().children?.length ?? 0)

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer / ТЕКСТ — антискачок
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const resetBBoxFunc = () => { const tr = trRef.current; if (tr) (tr as any).boundBoxFunc(null) }

  const minLetterW = (t: Konva.Text) => {
    try {
      const m = (t as any).measureSize?.("M")
      if (m && typeof m.width === "number" && m.width > 0) return Math.round(m.width)
    } catch {}
    return Math.max(6, Math.round((t.fontSize() || 12) * 0.55))
  }

  type TextSnap = { fs0:number; wrap0:number; cx0:number; cy0:number }
  const textSnapRef = useRef<TextSnap|null>(null)

  const captureTextSnap = (t: Konva.Text): TextSnap => {
    const wrap0 = Math.max(1, t.width() || 1)
    const self  = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, t.height() || 1) }
    const cx0   = Math.round(t.x() + wrap0 / 2)
    const cy0   = Math.round(t.y() + Math.max(1, self.height) / 2)
    return { fs0: t.fontSize(), wrap0, cx0, cy0 }
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const now = performance.now()
    const disabled =
      !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) ||
      tool !== "move" || isEditingTextRef.current || now < suppressTransformUntil.current

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }
    resetBBoxFunc()

    const tr = trRef.current!
    if (disabled) {
      tr.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { if (performance.now() >= suppressTransformUntil.current) isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      const t = n as Konva.Text

      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTextStart = () => { textSnapRef.current = captureTextSnap(t) }
      const onTextEnd   = () => { textSnapRef.current = null }

      t.off(".text-bind")
      t.on("transformstart.text-bind", onTextStart)
      t.on("transformend.text-bind",   onTextEnd)

      ;(tr as any).boundBoxFunc((oldBox: any, newBox: any) => {
        const snap   = textSnapRef.current ?? captureTextSnap(t)
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        const ow = Math.max(1e-6, oldBox.width)
        const oh = Math.max(1e-6, oldBox.height)
        const ratioW = newBox.width  / ow
        const ratioH = newBox.height / oh

        if (active === "middle-left" || active === "middle-right") {
          if (Math.abs(ratioW - 1) < DEAD) return oldBox
          const minW  = Math.max(2, minLetterW(t))
          const nextW = clamp(Math.round(snap.wrap0 * ratioW), minW, TEXT_MAX_W)
          if (Math.abs((t.width() || 0) - nextW) > EPS) {
            t.width(nextW)
            t.x(Math.round(snap.cx0 - nextW / 2))
            // базис обновляем каждый тик — никаких «пружин» при сужении
            textSnapRef.current = { ...snap, wrap0: nextW }
          }
          t.scaleX(1); t.scaleY(1)
          scheduleUI()
          return oldBox
        }

        // Углы/вертикальные — только fontSize, пропорционально
        const s = Math.max(ratioW, ratioH)
        if (Math.abs(s - 1) < DEAD) return oldBox

        const nextFS = clamp(Math.round(snap.fs0 * s), TEXT_MIN_FS, TEXT_MAX_FS)
        if (Math.abs(t.fontSize() - nextFS) > EPS) {
          t.fontSize(nextFS)
          const self = (t as any).getSelfRect?.() || { width: Math.max(1, t.width() || snap.wrap0), height: Math.max(1, (t.height() || 1)) }
          const nw = Math.max(1, t.width() || self.width)
          const nh = Math.max(1, self.height)
          const cx = Math.round(snap.cx0)
          const cy = Math.round(snap.cy0)
          t.x(Math.round(cx - nw/2))
          t.y(Math.round(cy - nh/2))
          // и тут базис обновляем — исчезает «дрожь» при уменьшении
          textSnapRef.current = { fs0: nextFS, wrap0: nw, cx0: cx, cy0: cy }
        }

        t.scaleX(1); t.scaleY(1)
        scheduleUI()
        return oldBox
      })

      const onTextNormalize = () => {
        t.scaleX(1); t.scaleY(1)
        scheduleUI()
      }
      t.on("transformend.text-bind", onTextNormalize)

      detachTextFix.current = () => { t.off(".text-bind") }
    } else {
      // ——— НЕ ТЕКСТ ———
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTransform = () => {
        const active = (trRef.current && (trRef.current as any).getActiveAnchor)
          ? (trRef.current as any).getActiveAnchor()
          : undefined

        let sx = (n as any).scaleX ? (n as any).scaleX() : 1
        let sy = (n as any).scaleY ? (n as any).scaleY() : 1

        const isCorner = active === "top-left" || active === "top-right" || active === "bottom-left" || active === "bottom-right"
        if (isCorner) {
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          sx = s; sy = s
        }

        if (isImgOrRect(n)) {
          const w = (n as any).width ? (n as any).width() : 0
          const h = (n as any).height ? (n as any).height() : 0
          if ((n as any).width)  (n as any).width(Math.max(1, w * sx))
          if ((n as any).height) (n as any).height(Math.max(1, h * sy))
          if ((n as any).scaleX) (n as any).scaleX(1)
          if ((n as any).scaleY) (n as any).scaleY(1)
        } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          const r = (n as any).radius ? (n as any).radius() : 0
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          if ((n as any).radius) (n as any).radius(Math.max(1, r * s))
          if ((n as any).scaleX) (n as any).scaleX(1)
          if ((n as any).scaleY) (n as any).scaleY(1)
        } else if (n instanceof Konva.Group) {
          // нормализуем масштаб группы в реальные размеры детей (крест и т.п.)
          const sfx = Math.abs(sx), sfy = Math.abs(sy)
          if (Math.abs(sfx - 1) > DEAD || Math.abs(sfy - 1) > DEAD) {
            n.getChildren().forEach((child: any) => {
              if (child instanceof Konva.Rect) {
                child.width(Math.max(1, child.width() * sfx))
                child.height(Math.max(1, child.height() * sfy))
                child.x(child.x() * sfx)
                child.y(child.y() * sfy)
              } else if (child instanceof Konva.Circle) {
                const rr = child.radius()
                child.radius(Math.max(1, rr * Math.max(sfx, sfy)))
                child.x(child.x() * sfx)
                child.y(child.y() * sfy)
              } else if (child instanceof Konva.RegularPolygon) {
                const rr = child.radius()
                child.radius(Math.max(1, rr * Math.max(sfx, sfy)))
                child.x(child.x() * sfx)
                child.y(child.y() * sfy)
              } else if (child instanceof Konva.Line) {
                const pts = child.points()
                const next:number[] = []
                for (let i=0;i<pts.length;i+=2) next.push(pts[i]*sfx, pts[i+1]*sfy)
                child.points(next)
                child.x(child.x() * sfx)
                child.y(child.y() * sfy)
                child.strokeWidth(Math.max(0.5, (child.strokeWidth?.() ?? 1) * Math.max(sfx, sfy)))
              }
            })
          }
          if ((n as any).scaleX) (n as any).scaleX(1)
          if ((n as any).scaleY) (n as any).scaleY(1)
        }
        scheduleUI()
      }

      const onEnd = () => onTransform()
      n.on("transform.fix", onTransform)
      n.on("transformend.fix", onEnd)
      detachTextFix.current = () => { n.off(".fix") }
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // во время brush/erase — отключаем драг у остальных
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      if ((l.node as any).draggable) (l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }

    if (tool !== "brush") currentStrokeId.current[side] = null
    if (tool !== "erase") currentEraseId.current[side]  = null
  }, [tool, layers, side])

  // ===== хоткеи =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return
      const n = node(selectedId)
      if (!n || tool !== "move") return

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(selectedId!) ; return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(selectedId!); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      if ((n as any).x && (n as any).y) {
        if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
        if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
        if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
        if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
        scheduleUI()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== Brush / Erase =====
  const ensureStrokeGroup = (): AnyLayer => {
    let gid = currentStrokeId.current[side]
    if (gid) {
      const ex = find(gid)!
      if (ex && ex.node.opacity() < 0.02) { ex.node.opacity(1); ex.meta.opacity = 1; scheduleUI() }
      return ex!
    }
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isStrokes = true
    g.id(uid()); const id = g.id()
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    select(id)
    return newLay
  }

  const ensureEraseGroup = (): AnyLayer => {
    let gid = currentEraseId.current[side]
    if (gid) return find(gid)!
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isErase = true
    g.id(uid()); const id = g.id()
    const meta = baseMeta(`erase ${seqs.erase}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g as AnyNode, meta, type: "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    select(id)
    return newLay
  }

  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
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
        ;(kimg as any).setAttr("src", r.result as string)
        kimg.id(uid()); const id = kimg.id()
        const meta = baseMeta(`image ${seqs.image}`)
        currentArt().add(kimg); kimg.zIndex(nextTopZ())
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        scheduleUI()
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
    t.id(uid()); const id = t.id()
    const meta = baseMeta(`text ${seqs.text}`)
    currentArt().add(t); t.zIndex(nextTopZ())
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    scheduleUI()
    set({ tool: "move" })
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W/2-160, y: BASE_H/2-160 })
      g.add(new Konva.Rect({ width: 320, height: 60, y: 130, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 320, x: 130, fill: brushColor }))
      n = g
    } else {
      n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    }
    ;(n as any).id(uid())
    const id = (n as any).id ? (n as any).id() : uid()
    const meta = baseMeta(`shape ${seqs.shape}`)
    currentArt().add(n as any); if ((n as any).zIndex) (n as any).zIndex(nextTopZ())
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    scheduleUI()
    set({ tool: "move" })
  }

  // ===== Рисование =====
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const lay = ensureStrokeGroup()
      const g = lay.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y, x + 0.01, y + 0.01],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "source-over",
      })
      g.add(line)
      setIsDrawing(true)
      scheduleUI()
    } else if (tool === "erase") {
      const lay = ensureEraseGroup()
      const g = lay.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y, x + 0.01, y + 0.01],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      setIsDrawing(true)
      scheduleUI()
    }
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1)
      const line = last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
      if (!(line instanceof Konva.Line)) return
      line.points(line.points().concat([x, y]))
      scheduleUI()
    } else if (tool === "erase") {
      const gid = currentEraseId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      scheduleUI()
    }
  }
  const finishStroke = () => setIsDrawing(false)

  // ===== Overlay-редактор текста (VisualViewport-safe) =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stContainer = stage.container()

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    scheduleUI()

    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      const rect = stContainer.getBoundingClientRect()
      const vv = (window as any).visualViewport as VisualViewport | undefined
      const offX = vv?.offsetLeft ?? 0
      const offY = vv?.offsetTop  ?? 0
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      ta.style.left   = `${rect.left - offX + r.x * scale}px`
      ta.style.top    = `${rect.top  - offY + r.y * scale}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    const abs = t.getAbsoluteScale()
    Object.assign(ta.style, {
      position: "fixed",
      padding: "0", margin: "0",
      border: "1px solid #111",
      background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle:  t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize:   `${t.fontSize() * abs.y}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${((t as any).letterSpacing?.() ?? 0) * abs.x}px`,
      whiteSpace: "pre-wrap", overflow: "hidden", outline: "none", resize: "none",
      transformOrigin: "left top", zIndex: "9999", userSelect: "text",
      caretColor: String(t.fill() || "#000"),
      textAlign: ((t as any).align?.() as any) || "left",
      WebkitAppearance: "none",
    } as CSSStyleDeclaration)

    stage.listening(false)
    place()
    document.body.appendChild(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    isEditingTextRef.current = true

    const onInput = () => { t.text(ta.value); scheduleUI(); place() }

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      ;(window as any).visualViewport?.removeEventListener?.("resize", place as any)
      ;(window as any).visualViewport?.removeEventListener?.("scroll", place as any)
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      isEditingTextRef.current = false
      stage.listening(true)
      suppressTransformUntil.current = performance.now() + 140
      scheduleUI()
      const id = (t as any).id ? (t as any).id() : undefined
      if (id) select(id)
      resetBBoxFunc(); attachTransformer()
      trRef.current?.nodes([t])
      scheduleUI()
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    ;(window as any).visualViewport?.addEventListener?.("resize", place as any)
    ;(window as any).visualViewport?.addEventListener?.("scroll", place as any)
  }

  // ===== Жесты (mouse)
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const onMouseDown = (e: any) => {
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer(); const p = toCanvas(sp)
      startStroke(p.x, p.y); return
    }
    const st = stageRef.current!
    const tgt = e.target as Konva.Node
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null); trRef.current?.nodes([]); scheduleUI(); return
    }
    const found = findLayerByTargetNode(tgt)
    if (found && found.side === side) select(found.id)
  }
  const onMouseMove = (e: any) => {
    if (isTransformingRef.current || isEditingTextRef.current) return
    if (isTransformerChild(e.target)) return
    if (!isDrawing) return
    const p = toCanvas(getStagePointer())
    appendStroke(p.x, p.y)
  }
  const onMouseUp = () => { if (isDrawing) finishStroke() }

  // ===== МУЛЬТИТАЧ (pinch)
  type PinchSnap = {
    node: AnyNode, isText: boolean, startDist: number, cx0: number, cy0: number
    text?: TextSnap, w0?: number, h0?: number, r0?: number, sx0?: number, sy0?: number
  }
  const pinchRef = useRef<PinchSnap | null>(null)

  const getCanvasPointFromClient = (clientX:number, clientY:number) => {
    const st = stageRef.current
    if (!st) return { x: 0, y: 0 }
    const rect = st.container().getBoundingClientRect()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }
  const getTouchesCanvas = (evt: TouchEvent) => {
    const arr: {x:number,y:number}[] = []
    for (let i=0; i<evt.touches.length; i++) {
      const t = evt.touches.item(i)!
      arr.push(getCanvasPointFromClient(t.clientX, t.clientY))
    }
    return arr
  }

  const onTouchStart = (e: any) => {
    const evt: TouchEvent = e.evt
    if (isEditingTextRef.current) return
    const touches = getTouchesCanvas(evt)

    if (touches.length >= 2 && tool === "move" && selectedId) {
      const n = node(selectedId); if (!n) return
      const a = touches[0], b = touches[1]
      const startDist = dist(a,b)
      const cx0 = (a.x + b.x) / 2
      const cy0 = (a.y + b.y) / 2

      if (isTextNode(n)) {
        pinchRef.current = { node: n, isText: true, startDist, cx0, cy0, text: captureTextSnap(n) }
      } else if (isImgOrRect(n)) {
        const w0 = (n as any).width ? (n as any).width() : 1
        const h0 = (n as any).height ? (n as any).height() : 1
        pinchRef.current = { node: n, isText: false, startDist, cx0, cy0, w0, h0 }
      } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
        const r0 = (n as any).radius ? (n as any).radius() : 1
        pinchRef.current = { node: n, isText: false, startDist, cx0, cy0, r0 }
      } else {
        const sx0 = (n as any).scaleX ? (n as any).scaleX() : 1
        const sy0 = (n as any).scaleY ? (n as any).scaleY() : 1
        pinchRef.current = { node: n, isText: false, startDist, cx0, cy0, sx0, sy0 }
      }
      evt.preventDefault()
      return
    }

    if (touches.length === 1) {
      if (tool === "brush" || tool === "erase") { startStroke(touches[0].x, touches[0].y); return }
      const st = stageRef.current!
      const tgt = e.target as Konva.Node
      if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
        select(null); trRef.current?.nodes([]); scheduleUI(); return
      }
      const found = findLayerByTargetNode(tgt)
      if (found && found.side === side) select(found.id)
    }
  }

  const onTouchMove = (e: any) => {
    const evt: TouchEvent = e.evt
    if (isEditingTextRef.current) return
    const touches = getTouchesCanvas(evt)

    if (pinchRef.current && touches.length >= 2) {
      const a = touches[0], b = touches[1]
      const s = dist(a,b) / Math.max(1e-6, pinchRef.current.startDist)
      const snap = pinchRef.current
      const n = snap.node

      if (snap.isText && isTextNode(n) && snap.text) {
        const nextFS = clamp(Math.round(snap.text.fs0 * s), TEXT_MIN_FS, TEXT_MAX_FS)
        if (Math.abs(n.fontSize() - nextFS) > EPS) {
          n.fontSize(nextFS)
          const self = (n as any).getSelfRect?.() || { width: Math.max(1, n.width() || snap.text.wrap0), height: Math.max(1, (n.height() || 1)) }
          const nw = Math.max(1, n.width() || self.width)
          const nh = Math.max(1, self.height)
          n.x(Math.round(snap.text.cx0 - nw/2))
          n.y(Math.round(snap.text.cy0 - nh/2))
          textSnapRef.current = { ...snap.text, fs0: nextFS, wrap0: nw } // базис обновляем
        }
        n.scaleX(1); n.scaleY(1)
        scheduleUI()
        evt.preventDefault()
        return
      }

      if (isImgOrRect(n) && snap.w0 && snap.h0) {
        const nw = Math.max(1, snap.w0 * s)
        const nh = Math.max(1, snap.h0 * s)
        ;(n as any).width(nw)
        ;(n as any).height(nh)
        ;(n as any).x(Math.round(snap.cx0 - nw/2))
        ;(n as any).y(Math.round(snap.cy0 - nh/2))
        ;(n as any).scaleX && (n as any).scaleX(1)
        ;(n as any).scaleY && (n as any).scaleY(1)
        scheduleUI()
        evt.preventDefault()
        return
      }

      if ((n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) && snap.r0) {
        const nr = Math.max(1, snap.r0 * s)
        ;(n as any).radius(nr)
        ;(n as any).x && (n as any).x(snap.cx0)
        ;(n as any).y && (n as any).y(snap.cy0)
        ;(n as any).scaleX && (n as any).scaleX(1)
        ;(n as any).scaleY && (n as any).scaleY(1)
        scheduleUI()
        evt.preventDefault()
        return
      }

      if ("scaleX" in (n as any)) {
        const sx = (snap.sx0 ?? 1) * s
        const sy = (snap.sy0 ?? 1) * s
        ;(n as any).scaleX(sx)
        ;(n as any).scaleY(sy)
        const bbox = (n as any).getClientRect?.() || { x: (n as any).x?.() ?? 0, y: (n as any).y?.() ?? 0, width: 0, height: 0 }
        const cx = bbox.x + bbox.width / 2
        const cy = bbox.y + bbox.height / 2
        if ((n as any).x && (n as any).y && isFinite(cx) && isFinite(cy)) {
          ;(n as any).x((n as any).x() + (snap.cx0 - cx))
          ;(n as any).y((n as any).y() + (snap.cy0 - cy))
        }
        scheduleUI()
        evt.preventDefault()
        return
      }
    }

    if (!pinchRef.current && touches.length === 1 && isDrawing) {
      const p = touches[0]
      appendStroke(p.x, p.y)
      evt.preventDefault()
    }
  }

  const onTouchEnd = (e: any) => {
    const evt: TouchEvent = e.evt
    if (pinchRef.current && evt.touches.length < 2) pinchRef.current = null
    if (isDrawing && evt.touches.length === 0) finishStroke()
  }

  // ===== Данные для панелей =====
  const layerItems: LayerItem[] = useMemo(() => {
    void uiTick
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name || l.type, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side, uiTick])

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      if (l) l.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    scheduleUI()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    if ((clone as any).x && (src.node as any).x) (clone as any).x((src.node as any).x() + 20)
    if ((clone as any).y && (src.node as any).y) (clone as any).y((src.node as any).y() + 20)
    ;(clone as any).id(uid())
    currentArt().add(clone as any)
    const newLay: AnyLayer = { id: (clone as any).id ? (clone as any).id() : uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newLay.id)
    setLayers(p => [...p, newLay]); select(newLay.id)
    if ((clone as any).zIndex) (clone as any).zIndex(nextTopZ())
    scheduleUI()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      // работаем только со слоями текущей стороны
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      // текущее отображение: top -> bottom
      const topToBottom = current.slice().sort((a,b)=> a.node.zIndex() - b.node.zIndex()).reverse()

      const srcIdx = topToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = topToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const [src] = topToBottom.splice(srcIdx,1)
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      topToBottom.splice(Math.min(Math.max(insertAt,0), topToBottom.length), 0, src)

      // применяем снизу-вверх
      const bottomToTop = [...topToBottom].reverse()
      bottomToTop.forEach((l, i) => { if ((l.node as any).zIndex) (l.node as any).zIndex(i) })
      artLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); scheduleUI() })
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (typeof patch.visible === "boolean") l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    scheduleUI()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Свойства выбранного узла =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: Math.round(sel.node.fontSize()),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill ? (sel.node as any).fill() : "#000000",
      stroke: (sel.node as any).stroke ? (sel.node as any).stroke() : "#000000",
      strokeWidth: (sel.node as any).strokeWidth ? (sel.node as any).strokeWidth() : 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n || !n.fill) return; n.fill(hex); scheduleUI() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n || typeof n.stroke !== "function") return; n.stroke(hex); scheduleUI() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n || typeof n.strokeWidth !== "function") return; n.strokeWidth(w); scheduleUI() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); scheduleUI() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS)); scheduleUI() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); scheduleUI() }

  const setSelectedColor = (hex:string)  => {
    if (!sel) return
    const n = sel.node as any
    if (sel.type === "text") {
      (n as Konva.Text).fill(hex)
    } else if (sel.type === "shape") {
      if (n instanceof Konva.Group) {
        n.find((child: any) =>
          child instanceof Konva.Rect ||
          child instanceof Konva.Circle ||
          child instanceof Konva.RegularPolygon ||
          child instanceof Konva.Line
        ).forEach((child: any) => {
          if (child instanceof Konva.Line) child.stroke(hex)
          if (typeof child.fill === "function") child.fill(hex)
        })
      } else if (n instanceof Konva.Line) {
        n.stroke(hex)
      } else if (typeof n.fill === "function") {
        n.fill(hex)
      }
    }
    scheduleUI()
  }

  // ===== Clear =====
  const clearArt = () => {
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    scheduleUI()
  }

  // ===== Скачивание =====
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

  // ===== Render =====
  return (
    <div className="fixed inset-0 bg-white" style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}>
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

      <div className="w-full h-full flex items-start justify-center">
        <div style={{ position:"relative", touchAction:"none", width: viewW, height: viewH }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
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
          onChangeBlend: (id, b)=>{},
          onChangeOpacity: (id, o)=>{},
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
