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
const TEXT_MAX_W  = Math.floor(BASE_W * 0.95)

const EPS  = 0.25           // численная стабилизация
const DEAD = 0.006          // «мёртвая зона» против микродрожи
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const uid   = () => "n_" + Math.random().toString(36).slice(2)

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

  // mobile: по умолчанию кисть, и включаем hitOnDrag
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

  // тик UI для синхры
  const [uiTick, setUiTick] = useState(0)
  const bump = () => setUiTick(v => (v + 1) | 0)

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
    const padBottom = isMobile ? 120 : 72
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

  // ===== Helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // НЕ меняем blend у кисти/ластика — только opacity
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

  // ===== Transformer / ТЕКСТ =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const resetBBoxFunc = () => { const tr = trRef.current; if (tr) (tr as any).boundBoxFunc(null) }

  type TextSnap = {
    width0: number
    height0: number
    wrapW0: number
    fs0: number
    cx0: number
    cy0: number
  }
  const textSnap = useRef<TextSnap | null>(null)

  const makeTextSnap = (t: Konva.Text): TextSnap => {
    const w0 = Math.max(1, t.width() || 1) // wrap width
    // безопасно: без ?? с || — чтобы билд не падал
    const r0 = (t as any).getSelfRect && (t as any).getSelfRect()
    const hRaw = r0 && typeof r0.height === "number" ? r0.height : t.height() || 1
    const h0 = Math.max(1, hRaw)
    const cx0 = Math.round(t.x() + w0 / 2)
    const cy0 = Math.round(t.y() + h0 / 2)
    return { width0: w0, height0: h0, wrapW0: w0, fs0: t.fontSize(), cx0, cy0 }
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

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      // ——— ТЕКСТ ———
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTextStart = () => { textSnap.current = makeTextSnap(n) }
      const onTextEnd   = () => { textSnap.current = null }
      n.on("transformstart.textsnap", onTextStart)
      n.on("transformend.textsnap",   onTextEnd)

      // Полностью перехватываем трансформацию (чтобы не было scaleX/scaleY у ноды),
      // и возвращаем oldBox — Konva ничего не меняет сам. Мы сами обновляем fontSize / width.
      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        const t = n as Konva.Text
        const snap = textSnap.current ?? makeTextSnap(t)
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        if (!active) return oldBox

        // боковые — только ширина вокруг центра
        if (active === "middle-left" || active === "middle-right") {
          const ratioW = newBox.width / Math.max(1e-6, snap.width0)
          if (Math.abs(ratioW - 1) < DEAD) return oldBox

          // мягкий минимум: разрешаем сильно сжимать, но без скачка в «одну букву»
          const minW = Math.max(6, Math.round((t.fontSize() || snap.fs0) * 0.2))
          const rawW = Math.round(snap.wrapW0 * ratioW)
          // анти-рывок: ограничим дельту за тик
          const prevW = t.width() || snap.wrapW0
          const targetW = clamp(rawW, minW, TEXT_MAX_W)
          const nextW = Math.abs(targetW - prevW) < 1 ? targetW : prevW + Math.sign(targetW - prevW) * Math.min(Math.abs(targetW - prevW), 24)

          if (Math.abs(prevW - nextW) > EPS) {
            t.width(nextW)
            const cx = snap.cx0
            t.x(Math.round(cx - nextW / 2))
          }
          t.scaleX(1); t.scaleY(1)
          t.getLayer()?.batchDraw()
          requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); bump() })
          return oldBox
        }

        // углы/вертикальные — меняем ТОЛЬКО fontSize от исходного fs0, удерживая центр
        const rw = newBox.width  / Math.max(1e-6, snap.width0)
        const rh = newBox.height / Math.max(1e-6, snap.height0)
        const s  = Math.max(rw, rh)
        if (Math.abs(s - 1) < DEAD) return oldBox

        const prevFS = t.fontSize()
        const rawFS  = Math.round(snap.fs0 * s)
        const nextFS = clamp(rawFS, TEXT_MIN_FS, TEXT_MAX_FS)

        if (Math.abs(prevFS - nextFS) > EPS) {
          t.fontSize(nextFS)

          // пересётр центра
          const r1:any = (t as any).getSelfRect ? (t as any).getSelfRect() : null
          const h1 = r1 && typeof r1.height === "number" ? Math.max(1, r1.height) : Math.max(1, t.height() || snap.height0)
          const w1 = Math.max(1, t.width() || snap.wrapW0)

          t.x(Math.round(snap.cx0 - w1 / 2))
          t.y(Math.round(snap.cy0 - h1 / 2))
        }
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); bump() })
        return oldBox
      })

      // страховка: очистить scale после манипуляций
      const onTextNormalize = () => {
        const t = n as Konva.Text
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); bump() })
      }
      n.on("transformend.textnorm", onTextNormalize)

      detachTextFix.current = () => { n.off(".textsnap"); n.off(".textnorm") }
    } else {
      // ——— НЕ ТЕКСТ ——— (картинки/фигуры)
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTransform = () => {
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        let sx = (n as any).scaleX?.() ?? 1
        let sy = (n as any).scaleY?.() ?? 1
        const isCorner = active && (
          active === "top-left" || active === "top-right" ||
          active === "bottom-left" || active === "bottom-right"
        )
        if (isCorner) {
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          sx = s; sy = s
        }

        if (isImgOrRect(n)) {
          const w = (n as any).width?.() ?? 0
          const h = (n as any).height?.() ?? 0
          ;(n as any).width(Math.max(1, w * sx))
          ;(n as any).height(Math.max(1, h * sy))
        } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          const r = (n as any).radius?.() ?? 0
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          ;(n as any).radius(Math.max(1, r * s))
        } else {
          // для Line/Group — просто нормализуем scale
          ;(n as any).scaleX(Math.max(0.05, Math.abs(sx)))
          ;(n as any).scaleY(Math.max(0.05, Math.abs(sy)))
        }

        ;(n as any).scaleX(1); (n as any).scaleY(1)
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
      ;(l.node as any).draggable(enable && !l.meta.locked)
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

      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== Brush / Erase =====
  const ensureStrokeGroup = (): AnyLayer => {
    let gid = currentStrokeId.current[side]
    if (gid) {
      const ex = find(gid)!
      if (ex && ex.node.opacity() < 0.02) {
        ex.node.opacity(1)
        ex.meta.opacity = 1
        artLayerRef.current?.batchDraw()
        bump()
      }
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
        artLayerRef.current?.batchDraw()
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
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any).id?.() ?? uid()
    const meta = baseMeta(`shape ${seqs.shape}`)
    currentArt().add(n as any); (n as any).zIndex?.(nextTopZ())
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
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
      artLayerRef.current?.batchDraw()
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
  const finishStroke = () => setIsDrawing(false)

  // ===== Overlay-редактор текста =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stContainer = stage.container()

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      const b = stContainer.getBoundingClientRect()
      // client rect относительно Stage (так позиционирует офиц. пример)
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      ta.style.left   = `${b.left + r.x * scale}px`
      ta.style.top    = `${b.top  + r.y * scale}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    const abs = t.getAbsoluteScale()
    Object.assign(ta.style, {
      position: "absolute",
      padding: "0", margin: "0",
      border: "1px solid #111",
      background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle:  t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize:   `${t.fontSize() * abs.y}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${(t.letterSpacing?.() ?? 0) * abs.x}px`,
      whiteSpace: "pre-wrap", overflow: "hidden", outline: "none", resize: "none",
      transformOrigin: "left top", zIndex: "9999", userSelect: "text",
      caretColor: String(t.fill() || "#000"),
      textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    place()
    document.body.appendChild(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => { place(); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw(); bump() })
    }

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      set({ tool: "move" as Tool })
      requestAnimationFrame(() => {
        // остаемся на тексте тем же трансформером (режим текста)
        const id = (t as any).id?.() as string | undefined
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
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
  }

  // ===== Жесты (mobile): пан/пинч/rotate =====
  type TouchPt = { id: number; x: number; y: number }
  const gesRef = useRef<{
    ids: number[]
    startDist: number
    startAng: number
    startMid: {x:number,y:number}
    nodeId: string | null
    nodeType: LayerType | null
    // text
    fs0?: number
    w0?: number
    cx0?: number
    cy0?: number
    // other
    nx0?: number
    ny0?: number
    width0?: number
    height0?: number
    scaleX0?: number
    scaleY0?: number
    rot0?: number
  } | null>(null)

  const dist = (a:TouchPt, b:TouchPt) => Math.hypot(a.x-b.x, a.y-b.y)
  const ang  = (a:TouchPt, b:TouchPt) => Math.atan2(b.y-a.y, b.x-a.x)
  const mid  = (a:TouchPt, b:TouchPt) => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 })

  const stageToCanvas = (p:{x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const parseTouches = (e: any): TouchPt[] => {
    const st = stageRef.current
    if (!st) return []
    const tlist = e?.evt?.touches as TouchList | undefined
    if (!tlist || tlist.length === 0) return []
    const out: TouchPt[] = []
    for (let i=0;i<tlist.length;i++){
      const tp = st.getPointerPosition()
      if (!tp) continue
      out.push({ id: tlist[i].identifier, x: tp.x, y: tp.y })
    }
    return out
  }

  const onTouchStart = (e:any) => {
    if (tool !== "move") return onDown(e) // кисть/ластик работают как раньше
    const pts = parseTouches(e)
    if (pts.length === 0) return

    if (pts.length === 1) {
      // одиночный — просто pan выбранного
      const tgt = e.target as Konva.Node
      const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
      if (found && found.side === side) select(found.id)
      return
    }

    if (pts.length >= 2) {
      const [a,b] = pts
      const m = mid(a,b)
      const st = stageToCanvas(m)

      const tgt = e.target as Konva.Node
      const lay = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any)) || find(selectedId)
      if (!lay || lay.side !== side) return

      const n = lay.node as any
      const snap:any = {}

      if (isTextNode(n)) {
        const r0 = (n as any).getSelfRect && (n as any).getSelfRect()
        const w0 = Math.max(1, n.width() || 1)
        const h0 = r0 && typeof r0.height==="number" ? Math.max(1, r0.height) : Math.max(1, n.height() || 1)
        snap.fs0 = n.fontSize()
        snap.w0  = w0
        snap.cx0 = Math.round(n.x() + w0/2)
        snap.cy0 = Math.round(n.y() + h0/2)
      } else if (isImgOrRect(n)) {
        snap.width0  = n.width?.() ?? 0
        snap.height0 = n.height?.() ?? 0
        snap.nx0 = n.x?.() ?? 0
        snap.ny0 = n.y?.() ?? 0
        snap.rot0 = n.rotation?.() ?? 0
      } else {
        snap.scaleX0 = n.scaleX?.() ?? 1
        snap.scaleY0 = n.scaleY?.() ?? 1
        snap.nx0 = n.x?.() ?? 0
        snap.ny0 = n.y?.() ?? 0
        snap.rot0 = n.rotation?.() ?? 0
      }

      gesRef.current = {
        ids: [a.id, b.id],
        startDist: dist(a,b),
        startAng: ang(a,b),
        startMid: st,
        nodeId: lay.id,
        nodeType: lay.type,
        ...snap
      }
    }
  }

  const onTouchMove = (e:any) => {
    if (tool !== "move") return onMove(e)
    const g = gesRef.current
    const pts = parseTouches(e)
    if (!g || pts.length === 0) return

    if (pts.length === 1) {
      // pan одним пальцем
      const selLay = find(selectedId)
      if (!selLay) return
      const p = stageToCanvas({ x: pts[0].x, y: pts[0].y })
      const n:any = selLay.node
      // просто следуем за пальцем с небольшим демпфированием
      n.x(Math.round(p.x - (n.width?.() ?? 0) / 2))
      n.y(Math.round(p.y - (n.height?.() ?? 0) / 2))
      n.getLayer()?.batchDraw()
      return
    }

    const [a,b] = pts
    const d = Math.max(1e-6, dist(a,b))
    const s = d / Math.max(1e-6, g.startDist)
    const angNow = ang(a,b)
    const dAng   = (angNow - g.startAng) * 180/Math.PI
    const m = mid(a,b)
    const mc = stageToCanvas(m)

    const lay = find(g.nodeId)
    if (!lay) return
    const n:any = lay.node

    if (g.nodeType === "text" && isTextNode(n)) {
      // масштабируем fontSize от fs0, удерживая центр
      const rawFS  = Math.round((g.fs0 || n.fontSize()) * s)
      const nextFS = clamp(rawFS, TEXT_MIN_FS, TEXT_MAX_FS)
      if (Math.abs(nextFS - n.fontSize()) > EPS) {
        n.fontSize(nextFS)
        const r1 = (n as any).getSelfRect && (n as any).getSelfRect()
        const h1 = r1 && typeof r1.height==="number" ? Math.max(1, r1.height) : Math.max(1, n.height() || 1)
        const w1 = Math.max(1, n.width() || (g.w0 || 1))
        const cx = g.cx0 || Math.round(n.x() + w1/2)
        const cy = g.cy0 || Math.round(n.y() + h1/2)
        n.x(Math.round(cx - w1/2))
        n.y(Math.round(cy - h1/2))
      }
      n.rotation(0) // текст не вращаем пинчем
      n.getLayer()?.batchDraw()
    } else if (isImgOrRect(n)) {
      const w0 = g.width0 || (n.width?.() ?? 0)
      const h0 = g.height0 || (n.height?.() ?? 0)
      const nx0 = g.nx0 || (n.x?.() ?? 0)
      const ny0 = g.ny0 || (n.y?.() ?? 0)
      n.width(Math.max(1, w0 * s))
      n.height(Math.max(1, h0 * s))
      // центровка под пальцами
      const cx = g.startMid.x
      const cy = g.startMid.y
      const dw = (n.width() - w0) / 2
      const dh = (n.height() - h0) / 2
      n.x(Math.round(nx0 - dw + (mc.x - cx)))
      n.y(Math.round(ny0 - dh + (mc.y - cy)))
      n.rotation((g.rot0 || 0) + dAng)
      n.getLayer()?.batchDraw()
    } else {
      // прочие (Line/Group/Polygon) — скейлим и крутим
      const sx0 = g.scaleX0 || 1
      const sy0 = g.scaleY0 || 1
      const nx0 = g.nx0 || 0
      const ny0 = g.ny0 || 0
      n.scaleX(Math.max(0.05, sx0 * s))
      n.scaleY(Math.max(0.05, sy0 * s))
      n.rotation((g.rot0 || 0) + dAng)
      const cx = g.startMid.x
      const cy = g.startMid.y
      n.x(Math.round(nx0 + (mc.x - cx)))
      n.y(Math.round(ny0 + (mc.y - cy)))
      n.getLayer()?.batchDraw()
    }
  }

  const onTouchEnd = (e:any) => {
    if (tool !== "move") return onUp()
    const tlist = e?.evt?.touches as TouchList | undefined
    if (!tlist || tlist.length === 0) {
      gesRef.current = null
    }
  }

  // ===== Жесты (мышь/тач общие) =====
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
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    bump()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    currentArt().add(clone as any)
    const newLay: AnyLayer = { id: (clone as any).id?.() ?? uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newLay.id)
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(nextTopZ())
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
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
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    bump()
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
      fill: (sel.node as any).fill() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (typeof n?.stroke !== "function") return; n.stroke(hex); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (typeof n?.strokeWidth !== "function") return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS)); artLayerRef.current?.batchDraw(); bump() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); bump() }

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
    artLayerRef.current?.batchDraw()
    bump()
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
    backBgRef.current?.visible(!showFront ? true : false)
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
    await new Promise(r => setTimeout(r, 200))
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
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
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
          onChangeBlend: (id, _b)=>{},
          onChangeOpacity: (id, _o)=>{},
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
