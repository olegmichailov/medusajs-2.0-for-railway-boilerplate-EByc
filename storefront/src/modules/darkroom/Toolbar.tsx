"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
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

// ТЕКСТ: клампы
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

// сглаживание
const EPS  = 0.25
const DEAD = 0.006
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const uid = () => Math.random().toString(36).slice(2)

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

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // лучшее попадание хитов (мобилка)
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

  // текущая сессия кисти/ластика — закрываем после pointerup (каждый раз новый слой)
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })

  const isTransformingRef = useRef(false)

  // ===== Вёрстка/масштаб =====
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

  // helpers
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

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

  // ===== Transformer / текст — «углы=fontSize, бока=wrap», без строба =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const resetBBoxFunc = () => { const tr = trRef.current; if (tr) (tr as any).boundBoxFunc(null) }

  const makeTextSnap = (t: Konva.Text) => {
    const w0 = Math.max(1, t.width() || 1)
    const self: any = (t as any).getSelfRect?.() || { width: w0, height: Math.max(1, t.height() || 1) }
    const h0 = Math.max(1, (self && typeof self.height === "number") ? self.height : (t.height() || 1))
    const cx0 = t.x() + w0 / 2
    const cy0 = t.y() + h0 / 2
    return { width: w0, height: h0, fs: t.fontSize(), cx: cx0, cy: cy0 }
  }
  const textSnap = useRef<{width:number;height:number;fs:number;cx:number;cy:number}|null>(null)

  const raf = (() => {
    let id: number | null = null
    const q: Array<() => void> = []
    return (fn: () => void) => {
      q.push(fn)
      if (id) return
      id = requestAnimationFrame(() => {
        const tasks = q.splice(0, q.length)
        id = null
        for (const t of tasks) t()
      })
    }
  })()

  const mutateTextKeepingCenter = (t: Konva.Text, mut: () => void) => {
    const wrap0 = Math.max(1, t.width() || 1)
    const r0: any = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, (t.height() || 1)) }
    const cx0 = t.x() + wrap0 / 2
    const cy0 = t.y() + Math.max(1, r0.height) / 2

    mut()

    const wrap1 = Math.max(1, t.width() || 1)
    const r1: any = (t as any).getSelfRect?.() || { width: wrap1, height: Math.max(1, (t.height() || 1)) }
    t.x(Math.round(cx0 - wrap1 / 2))
    t.y(Math.round(cy0 - Math.max(1, r1.height) / 2))
    t.scaleX(1); t.scaleY(1)

    t.getLayer()?.batchDraw()
    raf(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move"

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
    tr.keepRatio(false)
    tr.enabledAnchors([
      "top-left","top-right","bottom-left","bottom-right",
      "middle-left","middle-right","top-center","bottom-center"
    ])

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      const t = n as Konva.Text
      const onTextStart = () => { textSnap.current = makeTextSnap(t) }
      const onTextEnd   = () => { textSnap.current = null }

      n.on("transformstart.textsnap", onTextStart)
      n.on("transformend.textsnap",   onTextEnd)

      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        const snap = textSnap.current || makeTextSnap(t)
        const active = (trRef.current && (trRef.current as any).getActiveAnchor)
          ? (trRef.current as any).getActiveAnchor()
          : undefined

        // боковые — меняем только width (wrap), удерживаем центр
        if (active === "middle-left" || active === "middle-right") {
          const ratioW = newBox.width / Math.max(1e-6, snap.width)
          if (Math.abs(ratioW - 1) < DEAD) return oldBox

          const fsNow = t.fontSize()
          const minW  = Math.max(2, Math.round((fsNow || snap.fs) * 0.45))
          const nextW = clamp(Math.round(snap.width * ratioW), minW, TEXT_MAX_W)

          if (Math.abs((t.width() || 0) - nextW) > EPS) {
            const cx = snap.cx
            t.width(nextW)
            t.x(Math.round(cx - nextW / 2))
          }
          t.scaleX(1); t.scaleY(1)
          t.getLayer()?.batchDraw()
          raf(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
          return oldBox
        }

        // углы/вертикаль — меняем только fontSize
        const ratioW = newBox.width  / Math.max(1e-6, snap.width)
        const ratioH = newBox.height / Math.max(1e-6, snap.height)
        const s = Math.max(ratioW, ratioH)
        if (Math.abs(s - 1) < DEAD) return oldBox

        const nextFS = clamp(Math.round(snap.fs * s), TEXT_MIN_FS, TEXT_MAX_FS)
        if (Math.abs(t.fontSize() - nextFS) > EPS) {
          t.fontSize(nextFS)
          const wrap1 = Math.max(1, t.width() || snap.width)
          const self: any = (t as any).getSelfRect?.() || { width: wrap1, height: Math.max(1, t.height() || snap.height) }
          t.x(Math.round(snap.cx - wrap1/2))
          t.y(Math.round(snap.cy - Math.max(1, self.height)/2))
        }

        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        raf(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
        return oldBox
      })

      const onTextNormalizeEnd = () => {
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        raf(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
      }
      n.on("transformend.textnorm", onTextNormalizeEnd)

      detachTextFix.current = () => { n.off(".textsnap"); n.off(".textnorm") }
    } else {
      // для фигур/картинок нормализуем скейл в размер
      const onTransform = () => {
        const active = (trRef.current && (trRef.current as any).getActiveAnchor)
          ? (trRef.current as any).getActiveAnchor()
          : undefined

        let sx = (n as any).scaleX ? (n as any).scaleX() : 1
        let sy = (n as any).scaleY ? (n as any).scaleY() : 1

        const isCorner = active === "top-left" || active === "top-right" || active === "bottom-left" || active === "bottom-right"
        if (isCorner) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = s; sy = s }

        if (isImgOrRect(n)) {
          const w = (n as any).width ? (n as any).width() : 0
          const h = (n as any).height ? (n as any).height() : 0
          if ((n as any).width)  (n as any).width(Math.max(1, w * sx))
          if ((n as any).height) (n as any).height(Math.max(1, h * sy))
        } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          const r = (n as any).radius ? (n as any).radius() : 0
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          if ((n as any).radius) (n as any).radius(Math.max(1, r * s))
        }

        if ((n as any).scaleX) (n as any).scaleX(1)
        if ((n as any).scaleY) (n as any).scaleY(1)
        n.getLayer()?.batchDraw()
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
        bump()
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

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); if (selectedId) duplicateLayer(selectedId); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); if (selectedId) deleteLayer(selectedId); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if ((n as any).x && (n as any).y) {
        if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
        if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
        if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
        if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
        n.getLayer()?.batchDraw()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== группы кисти/ластика — каждый down = новый слой =====
  const newStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isStrokes = true
    ;(g as any).id(uid()); const id = (g as any).id()
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const lay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, lay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    select(id)
    return lay
  }
  const newEraseGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isErase = true
    ;(g as any).id(uid()); const id = (g as any).id()
    const meta = baseMeta(`erase ${seqs.erase}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const lay: AnyLayer = { id, side, node: g, meta, type: "erase" }
    setLayers(p => [...p, lay])
    setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    select(id)
    return lay
  }

  // утилита: шрифт сайта из body
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
  }

  // ===== Добавление: Image =====
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
        ;(kimg as any).id(uid()); const id = (kimg as any).id()
        const meta = baseMeta(`image ${seqs.image}`)
        currentArt().add(kimg); kimg.zIndex(nextTopZ())
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ===== Добавление: Text =====
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
    ;(t as any).id(uid()); const id = (t as any).id()
    const meta = baseMeta(`text ${seqs.text}`)
    currentArt().add(t); t.zIndex(nextTopZ())
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Добавление: Shape =====
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid()); const id = (n as any).id ? (n as any).id() : uid()
    const meta = baseMeta(`shape ${seqs.shape}`)
    currentArt().add(n as any); if ((n as any).zIndex) (n as any).zIndex(nextTopZ())
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Рисование: Brush / Erase — первый down = новый слой, up = закрыли =====
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const lay = newStrokeGroup()
      currentStrokeId.current[side] = lay.id
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
      artLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const lay = newEraseGroup()
      currentEraseId.current[side] = lay.id
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
      artLayerRef.current?.batchDraw()
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
      artLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const gid = currentEraseId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      artLayerRef.current?.batchDraw()
    }
  }
  const finishStroke = () => {
    setIsDrawing(false)
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
  }

  // ===== Overlay-редактор текста (textarea поверх, iOS keyboard-safe) =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stContainer = stage.container()

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()
    ta.style.position = "fixed"
    ta.style.padding = "0"; ta.style.margin = "0"
    ta.style.border = "1px solid #111"
    ta.style.background = "transparent"
    ta.style.color = String(t.fill() || "#000")
    ta.style.fontFamily = t.fontFamily()
    ta.style.fontWeight = t.fontStyle()?.includes("bold") ? "700" : "400"
    ta.style.fontStyle  = t.fontStyle()?.includes("italic") ? "italic" : "normal"
    ta.style.fontSize   = `${t.fontSize()}px`
    ta.style.lineHeight = String(t.lineHeight())
    ;(ta.style as any).letterSpacing = `${(t as any).letterSpacing?.() ?? 0}px`
    ta.style.whiteSpace = "pre-wrap"
    ta.style.overflow = "hidden"
    ta.style.outline = "none"
    ta.style.resize = "none"
    ta.style.transformOrigin = "left top"
    ta.style.zIndex = "9999"
    ;(ta.style as any).textAlign = (t.align?.() as any) || "left"
    ta.style.caretColor = String(t.fill() || "#000")

    const place = () => {
      const vv = (window as any).visualViewport
      const scaleV  = vv ? vv.scale : 1
      const offsetX = vv ? vv.offsetLeft : 0
      const offsetY = vv ? vv.offsetTop  : 0
      const b = stContainer.getBoundingClientRect()
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      const left = (b.left + r.x * scale - (vv ? vv.pageLeft : 0)) / scaleV
      const top  = (b.top  + r.y * scale - (vv ? vv.pageTop  : 0)) / scaleV
      ta.style.left   = `${left + offsetX}px`
      ta.style.top    = `${top  + offsetY}px`
      ta.style.width  = `${Math.max(2, r.width  * scale / scaleV)}px`
      ta.style.height = `${Math.max(2, r.height * scale / scaleV)}px`
    }

    place()
    document.body.appendChild(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      mutateTextKeepingCenter(t, () => t.text(ta.value))
    }
    const onVV = () => place()

    ;(window as any).visualViewport?.addEventListener?.("resize", onVV)
    ;(window as any).visualViewport?.addEventListener?.("scroll", onVV)

    const cleanup = (apply = true) => {
      (window as any).visualViewport?.removeEventListener?.("resize", onVV)
      (window as any).visualViewport?.removeEventListener?.("scroll", onVV)
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) mutateTextKeepingCenter(t, () => t.text(ta.value))
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => {
        const id = (t as any).id ? (t as any).id() : undefined
        if (id) select(id)
        attachTransformer()
        trRef.current?.nodes([t])
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
        bump()
      })
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
  }

  // ===== Жесты (рисование и drag для сессий) =====
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const onDown = (e: any) => {
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer(); const p = toCanvas(sp)
      startStroke(p.x, p.y); return
    }
    const st = stageRef.current!
    const tgt = e.target as Konva.Node
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return
    }
    if (tgt && tgt !== st && tgt.getParent()) {
      const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
      if (found && found.side === side) select(found.id)
    }
  }
  const onMove = (e: any) => {
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return
    if (!isDrawing) return
    const p = toCanvas(getStagePointer())
    appendStroke(p.x, p.y)
  }
  const onUp = () => { if (isDrawing) finishStroke() }

  // ===== Данные для панелей/toolbar =====
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
    artLayerRef.current?.batchDraw()
    bump()
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
    artLayerRef.current?.batchDraw()
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex && (l.node as any).zIndex(i) })
      artLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); bump() })
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (typeof patch.visible === "boolean") l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    bump()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Свойства выбранного узла для Toolbar =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: Math.round(sel.node.fontSize()),
      lineHeight: sel.node.lineHeight ? sel.node.lineHeight() : 1,
      letterSpacing: (sel.node as any).letterSpacing ? (sel.node as any).letterSpacing() : 0,
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
      align: (sel.node.align?.() as any) || "left"
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill ? (sel.node as any).fill() : "#000000",
      stroke: (sel.node as any).stroke ? (sel.node as any).stroke() : "#000000",
      strokeWidth: (sel.node as any).strokeWidth ? (sel.node as any).strokeWidth() : 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n || !n.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n || typeof n.stroke !== "function") return; n.stroke(hex); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n || typeof n.strokeWidth !== "function") return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); bump() }

  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; mutateTextKeepingCenter(n, () => n.text(tstr)) }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; const fs = clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS); mutateTextKeepingCenter(n, () => n.fontSize(fs)) }
  const setSelectedLineHeight = (lh:number)   => { const n = sel?.node as Konva.Text; if (!n) return; mutateTextKeepingCenter(n, () => n.lineHeight(clamp(lh, 0.5, 3))) }
  const setSelectedLetterSpacing = (ls:number)=> { const n = sel?.node as any; if (!n || typeof n.letterSpacing !== "function") return; mutateTextKeepingCenter(n, () => n.letterSpacing(ls)) }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; mutateTextKeepingCenter(n, () => n.fontFamily(name)) }
  const setSelectedAlign      = (a:"left"|"center"|"right") => { const n = sel?.node as Konva.Text; if (!n) return; mutateTextKeepingCenter(n, () => n.align(a)) }

  const setSelectedColor = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { mutateTextKeepingCenter(sel.node as Konva.Text, () => (sel.node as Konva.Text).fill(hex)) }
    else {
      const n = sel.node as any
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
      } else if (n instanceof Konva.Line) n.stroke(hex)
      else if (typeof n.fill === "function") n.fill(hex)
      artLayerRef.current?.batchDraw(); bump()
    }
  }

  // ===== Clear =====
  const clearArt = () => {
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    artLayerRef.current?.batchDraw()
    bump()
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
        <div style={{ position:"relative", touchAction:"none", width: viewW, height: viewH }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* фон */}
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && <KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />}
              {backMock  && <KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true} />}
            </Layer>

            {/* арт: отдельные группы для каждой стороны */}
            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            {/* UI-слой */}
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
        setSelectedLineHeight={setSelectedLineHeight}
        setSelectedLetterSpacing={setSelectedLetterSpacing}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedAlign={setSelectedAlign}
        setSelectedColor={setSelectedColor}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>updateMeta(id,{ blend: b as Blend }),
          onChangeOpacity: (id, o)=>updateMeta(id,{ opacity: o }),
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
