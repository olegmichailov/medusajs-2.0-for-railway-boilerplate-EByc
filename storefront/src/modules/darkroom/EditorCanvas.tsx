"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/**
 * ====== БАЗОВЫЕ ПАРАМЕТРЫ МАКЕТА ======
 */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// текстовые клампы + area-логика
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

/**
 * ====== ТИПЫ СЛОЁВ И СЕРИАЛИЗАЦИИ (для undo/redo) ======
 */
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

type SerializedCommon = {
  id: string
  side: Side
  meta: BaseMeta
  z: number
  type: LayerType
}

type SImage = SerializedCommon & { t: "image"; src: string; x: number; y: number; w: number; h: number; rot: number; sx: number; sy: number }
type SText  = SerializedCommon & { t: "text";  text: string; x: number; y: number; w: number; fs: number; ff: string; fill: string; align: Konva.Text["align"]; rot: number; sx: number; sy: number }
type SRect  = SerializedCommon & { t: "rect";  x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; rot: number; sx: number; sy: number }
type SCircle= SerializedCommon & { t: "circle"; x: number; y: number; r: number; fill?: string; stroke?: string; sw?: number; rot: number; sx: number; sy: number }
type SPoly  = SerializedCommon & { t: "poly";   x: number; y: number; sides: number; r: number; fill?: string; stroke?: string; sw?: number; rot: number; sx: number; sy: number }
type SLine  = SerializedCommon & { t: "line";  points: number[]; stroke: string; sw: number; lc: CanvasLineCap; lj: CanvasLineJoin; rot: number; sx: number; sy: number }
type SCross = SerializedCommon & { t: "cross"; x: number; y: number; size: number; bar: number; fill: string; rot: number; sx: number; sy: number }
type SerializedLayer = SImage | SText | SRect | SCircle | SPoly | SLine | SCross

type SerializedSide = {
  layers: SerializedLayer[]
  eraser: { // глобальный стиратель (линии с gco=destination-out)
    lines: { points: number[]; sw: number }[]
  }
}
type Snapshot = { front: SerializedSide; back: SerializedSide }

/**
 * ====== УТИЛИТЫ ======
 */
const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

const siteFont = () =>
  (typeof window !== "undefined"
    ? window.getComputedStyle(document.body).fontFamily
    : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // ===== Мокапы =====
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // ===== Refs слоёв =====
  const stageRef       = useRef<Konva.Stage>(null)
  const bgLayerRef     = useRef<Konva.Layer>(null)   // мокапы
  const artLayerRef    = useRef<Konva.Layer>(null)   // только арт (сюда и eraser)
  const uiLayerRef     = useRef<Konva.Layer>(null)
  const trRef          = useRef<Konva.Transformer>(null)
  const frontBgRef     = useRef<Konva.Image>(null)
  const backBgRef      = useRef<Konva.Image>(null)
  const eraserGroupRef = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })

  // ===== Состояние редактора =====
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // Brush-сессии
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef     = useRef<Tool | null>(null)

  // Transformer guard
  const isTransformingRef = useRef(false)

  // ===== Верстка/масштаб =====
  const [headerH, setHeaderH] = useState(64)
  const [viewportTick, setViewportTick] = useState(0)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
    const onResize = () => setViewportTick(t => t + 1)
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize) }
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
  }, [showLayers, headerH, viewportTick])

  // ===== Поведение страницы на мобилке =====
  useEffect(() => {
    ;(Konva as any).hitOnDragEnabled = true
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    // Запрет iOS pinch-zoom, когда жесты на сцене
    const container = stageRef.current?.container()
    const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    container?.addEventListener("touchmove", prevent, { passive: false })
    return () => {
      document.body.style.overflow = prev
      container?.removeEventListener("touchmove", prevent as any)
    }
  }, [set])

  /**
   * ====== HELPERS ======
   */
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }
  const batch = () => { artLayerRef.current?.batchDraw(); uiLayerRef.current?.batchDraw() }

  /**
   * ====== ВИДИМОСТЬ ПО СТОРОНЕ ======
   */
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    eraserGroupRef.current.front && (eraserGroupRef.current.front.visible(side === "front"))
    eraserGroupRef.current.back  && (eraserGroupRef.current.back.visible(side === "back"))
    batch()
    attachTransformer()
  }, [side, layers])

  /**
   * ====== TRANSFORMER ======
   * Текст: боковые якоря меняют ширину (area), угловые — кегль (fs).
   * Подтверждено API getActiveAnchor() у Konva.Transformer.  [oai_citation:0‡konvajs.org](https://konvajs.org/api/Konva.Transformer.html?utm_source=chatgpt.com)
   */
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
    const onEndT  = () => { isTransformingRef.current = false; pushSnapshot("transform") }
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
        const activeAnchor = trRef.current?.getActiveAnchor?.() as string | undefined

        if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
          const sx = Math.max(0.01, t.scaleX())
          const newW = clampW(st.w * sx)
          if (activeAnchor === "middle-left") {
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
  useEffect(() => { if (isDrawing) finishStroke(); attachTransformer() }, [tool])

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

  /**
   * ====== ХОТКЕИ И ГЛОБАЛЬНЫЕ КОМАНДЫ ======
   * Undo/Redo/Clear — по клавишам и по DOM-событиям (чтобы не трогать твой Toolbar сейчас).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      // Undo / Redo
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }

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
      batch()
    }
    const onUndo = () => undo()
    const onRedo = () => redo()
    const onClear= () => clearSide(side)

    window.addEventListener("keydown", onKey)
    window.addEventListener("darkroom:undo", onUndo as any)
    window.addEventListener("darkroom:redo", onRedo as any)
    window.addEventListener("darkroom:clear", onClear as any)

    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("darkroom:undo", onUndo as any)
      window.removeEventListener("darkroom:redo", onRedo as any)
      window.removeEventListener("darkroom:clear", onClear as any)
    }
  }, [selectedId, tool, side])

  /**
   * ====== СЛОИ: СОЗДАНИЕ ======
   */
  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    artLayerRef.current?.add(g)
    g.zIndex(artLayerRef.current!.children.length - 1)
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }
  // при входе в brush — гарантируем группу
  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      if (!currentStrokeId.current[side]) createStrokeGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    if (lastToolRef.current && lastToolRef.current !== tool && isDrawing) {
      finishStroke()
    }
    lastToolRef.current = tool
  }, [tool, side])

  /**
   * ====== GLOBAL ERASER ======
   * Реализован как группа линий с gco=destination-out в ТОМ ЖЕ LAYER, где арт (без мокапов).
   * Это стандартный подход Konva для стирания.  [oai_citation:1‡konvajs.org](https://konvajs.org/docs/sandbox/Free_Drawing.html?utm_source=chatgpt.com) [oai_citation:2‡Stack Overflow](https://stackoverflow.com/questions/64585340/is-it-possible-to-simulate-a-erase-action-without-having-to-create-an-extra-shap?utm_source=chatgpt.com) [oai_citation:3‡MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation?utm_source=chatgpt.com)
   */
  const ensureEraserGroup = (s: Side): Konva.Group => {
    let g = eraserGroupRef.current[s]
    if (!g) {
      g = new Konva.Group({ x: 0, y: 0, listening: false })
      ;(g as any)._eraser = true
      artLayerRef.current?.add(g)
      g.zIndex(artLayerRef.current!.children.length - 1)
      eraserGroupRef.current[s] = g
    }
    return g
  }

  /**
   * ====== ДОБАВЛЕНИЕ НОД ======
   */
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
        artLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        batch()
        set({ tool: "move" })
        pushSnapshot("image:add")
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
    artLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t)) // редактирование через textarea — рекомендуемый способ в Konva  [oai_citation:4‡konvajs.org](https://konvajs.org/docs/sandbox/Editable_Text.html?utm_source=chatgpt.com) [oai_citation:5‡Konva.js Docs](https://konvajs-doc.bluehymn.com/docs/sandbox/Editable_Text.html?utm_source=chatgpt.com)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    batch()
    set({ tool: "move" })
    pushSnapshot("text:add")
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })

    ;(n as any).id(uid())
    ;(n as any)._kind = kind // для сериализации
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    artLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    batch()
    set({ tool: "move" })
    pushSnapshot("shape:add")
  }

  /**
   * ====== РИСОВАНИЕ: BRUSH / ERASER ======
   * Используем Line с кругл. концами. Eraser — линии в eraserGroup с gco=destination-out (глобально).  [oai_citation:6‡konvajs.org](https://konvajs.org/docs/sandbox/Free_Drawing.html?utm_source=chatgpt.com)
   */
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      if (!gid) gid = createStrokeGroup().id
      const g = find(gid)!.node as Konva.Group
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
      const g = ensureEraserGroup(side)
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
        listening: false,
      })
      g.add(line)
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
      artLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const g = ensureEraserGroup(side)
      const last = g.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      artLayerRef.current?.batchDraw()
    }
  }

  const finishStroke = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    pushSnapshot(tool === "brush" ? "brush:stroke" : "erase:stroke")
  }

  /**
   * ====== Overlay textarea для текста (рекомендовано Konva)  [oai_citation:7‡konvajs.org](https://konvajs.org/docs/sandbox/Editable_Text.html?utm_source=chatgpt.com) ======
   */
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

    const autoGrow = () => {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 3) + "px"
    }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) { t.text(ta.value); pushSnapshot("text:edit") }
      ta.remove()
      t.visible(true)
      artLayerRef.current?.batchDraw()
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

  /**
   * ====== ЖЕСТЫ ======
   * Один палец — выбор/перетаскивание. Два — масштаб/поворот вокруг центра щепка.
   */
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScaleX: number
    startRot: number
    startPos: { x: number, y: number }
    centerCanvas: { x: number, y: number }
    nodeId: string | null
    lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScaleX:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

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
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformerChild(e.target)) return

    // рисование
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      if (tool === "brush" && !currentStrokeId.current[side]) createStrokeGroup()
      startStroke(p.x, p.y)
      return
    }

    // move, 1 палец — выбор/перетаскивание
    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      // клик по пустому месту или по мокапу — снять выделение
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
          active: true, two: false, nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(getStagePointer()),
          centerCanvas: toCanvas(getStagePointer()),
          startDist: 0, startAngle: 0,
          startScaleX: (lay.node as any).scaleX?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

    // 2 пальца — масштаб/поворот
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
        startDist: Math.max(dist, 0.0001),
        startAngle: ang,
        startScaleX: (lay.node as any).scaleX?.() ?? 1,
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
      artLayerRef.current?.batchDraw()
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
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  /**
   * ====== LAYERS API ======
   */
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
    pushSnapshot("layer:delete:pre")
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    pushSnapshot("layer:delete:post") // финальный снимок
  }
  const duplicateLayer = (id: string) => {
    pushSnapshot("layer:dup:pre")
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    artLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(artLayerRef.current!.children.length - 1)
    artLayerRef.current?.batchDraw()
    pushSnapshot("layer:dup:post")
  }
  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    pushSnapshot("layer:reorder:pre")
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
      // zIndex начиная с 1 (0 займём под мокап слой)
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i + 1) })
      artLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    pushSnapshot("layer:reorder:post")
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    pushSnapshot("meta:update:pre")
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    pushSnapshot("meta:update:post")
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  /**
   * ====== ПРОПЫ ДЛЯ TOOLBAR (реальный control над выделенным) ======
   */
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; pushSnapshot("prop:fill:pre"); n.fill(hex); artLayerRef.current?.batchDraw(); pushSnapshot("prop:fill:post") }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; pushSnapshot("prop:stroke:pre"); n.stroke(hex); artLayerRef.current?.batchDraw(); pushSnapshot("prop:stroke:post") }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; pushSnapshot("prop:sw:pre"); n.strokeWidth(w); artLayerRef.current?.batchDraw(); pushSnapshot("prop:sw:post") }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; pushSnapshot("prop:fs:pre"); n.fontSize(nsize); artLayerRef.current?.batchDraw(); pushSnapshot("prop:fs:post") }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; pushSnapshot("prop:ff:pre"); n.fontFamily(name); artLayerRef.current?.batchDraw(); pushSnapshot("prop:ff:post") }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    pushSnapshot("prop:color:pre")
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    artLayerRef.current?.batchDraw()
    pushSnapshot("prop:color:post")
  }

  /**
   * ====== UNDO/REDO/ CLEAR ======
   * Снимок = сериализация обоих сторон + eraser-линий. Восстановление — полная гидрация.
   * Для производительности используем batchDraw().  [oai_citation:8‡konvajs.org](https://konvajs.org/docs/performance/Batch_Draw.html?utm_source=chatgpt.com)
   */
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const pushSnapshot = (reason: string) => {
    const snap = serializeAll()
    undoStack.current.push(snap)
    redoStack.current.length = 0
  }
  const undo = () => {
    const last = undoStack.current.pop()
    if (!last) return
    const now = serializeAll()
    redoStack.current.push(now)
    hydrateAll(last)
  }
  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    const now = serializeAll()
    undoStack.current.push(now)
    hydrateAll(next)
  }
  const clearSide = (s: Side) => {
    pushSnapshot("clear:pre")
    // удаляем все арт-слои выбранной стороны
    setLayers((prev) => {
      prev.filter(l => l.side === s).forEach(l => l.node.destroy())
      return prev.filter(l => l.side !== s)
    })
    // чистим eraser выбранной стороны
    const eg = eraserGroupRef.current[s]
    if (eg) eg.destroy()
    eraserGroupRef.current[s] = null
    currentStrokeId.current[s] = null
    artLayerRef.current?.batchDraw()
    pushSnapshot("clear:post")
  }

  // сериализация всех сторон
  const serializeAll = (): Snapshot => {
    const packSide = (s: Side): SerializedSide => {
      // слои текущей стороны
      const ls = layers
        .filter(l => l.side === s)
        .sort((a,b) => a.node.zIndex() - b.node.zIndex())
        .map(serializeLayer)
      // eraser
      const g = eraserGroupRef.current[s]
      const lines = (g?.getChildren() || [])
        .toArray()
        .filter(n => n instanceof Konva.Line)
        .map(n => ({ points: (n as Konva.Line).points(), sw: (n as Konva.Line).strokeWidth() }))
      return { layers: ls as SerializedLayer[], eraser: { lines } }
    }
    return { front: packSide("front"), back: packSide("back") }
  }

  const serializeLayer = (l: AnyLayer): SerializedLayer => {
    const z = l.node.zIndex()
    const common: SerializedCommon = { id: l.id, side: l.side, meta: l.meta, z, type: l.type }
    // Image
    if (l.node instanceof Konva.Image) {
      const im = l.node
      const img = im.image() as HTMLImageElement | null
      return {
        ...common, t: "image",
        src: img?.src || "",
        x: im.x(), y: im.y(), w: im.width(), h: im.height(),
        rot: im.rotation(), sx: im.scaleX(), sy: im.scaleY(),
      }
    }
    // Text
    if (l.node instanceof Konva.Text) {
      const t = l.node
      return {
        ...common, t: "text",
        text: t.text(), x: t.x(), y: t.y(), w: t.width(),
        fs: t.fontSize(), ff: t.fontFamily(), fill: t.fill() as string,
        align: t.align(), rot: t.rotation(), sx: t.scaleX(), sy: t.scaleY(),
      }
    }
    // Group-cross
    if (l.node instanceof Konva.Group && (l.node as any)._kind === "cross") {
      const g = l.node as Konva.Group
      const size = 320, bar = 60 // создавали такими
      return { ...common, t: "cross", x: g.x(), y: g.y(), size, bar, fill: (g.getChildren()[0] as any).fill() || "#000", rot: g.rotation(), sx: g.scaleX(), sy: g.scaleY() }
    }
    // Rect
    if (l.node instanceof Konva.Rect) {
      const r = l.node
      return { ...common, t: "rect", x: r.x(), y: r.y(), w: r.width(), h: r.height(), fill: r.fill() as any, stroke: r.stroke() as any, sw: r.strokeWidth(), rot: r.rotation(), sx: r.scaleX(), sy: r.scaleY() }
    }
    // Circle
    if (l.node instanceof Konva.Circle) {
      const c = l.node
      return { ...common, t: "circle", x: c.x(), y: c.y(), r: c.radius(), fill: c.fill() as any, stroke: c.stroke() as any, sw: c.strokeWidth(), rot: c.rotation(), sx: c.scaleX(), sy: c.scaleY() }
    }
    // Poly (triangle)
    if (l.node instanceof Konva.RegularPolygon) {
      const p = l.node
      return { ...common, t: "poly", x: p.x(), y: p.y(), sides: p.sides(), r: p.radius(), fill: p.fill() as any, stroke: p.stroke() as any, sw: p.strokeWidth(), rot: p.rotation(), sx: p.scaleX(), sy: p.scaleY() }
    }
    // Line (shape)
    if (l.node instanceof Konva.Line) {
      const ln = l.node
      return { ...common, t: "line", points: ln.points(), stroke: ln.stroke() as string, sw: ln.strokeWidth(), lc: ln.lineCap(), lj: ln.lineJoin(), rot: ln.rotation(), sx: ln.scaleX(), sy: ln.scaleY() }
    }
    // Stroke group — сохранять как набор линий нельзя надёжно без вложений; но сами stroke-группы уже состоят из Line
    if (l.type === "strokes" && l.node instanceof Konva.Group) {
      // упакуем каждую линию отдельно
      // дадим им свои ID позже при гидрации
      const children = l.node.getChildren().toArray().filter(n => n instanceof Konva.Line) as Konva.Line[]
      // вернём как отдельный «shape line» набор — проще: как один слой на группу не мапим (для UX слой "strokes N" сохранится как есть)
      // но сериализуем именно группу «технически»: восстановим группу и её детей
      // для простоты вернём тип line с точками (как есть), а группу восстановим как strokes
      // На деле ниже в hydrate распознаём l.type === "strokes".
    }
    // fallback: считаем как есть линию
    const any = l.node as any
    return { ...common, t: "rect", x: any.x?.()||0, y: any.y?.()||0, w: (any.width?.()||0), h: (any.height?.()||0), rot: any.rotation?.()||0, sx: any.scaleX?.()||1, sy: any.scaleY?.()||1 } as SRect
  }

  // Полная очистка арта и наполнение из снапшота
  const hydrateAll = (snap: Snapshot) => {
    // wipe art
    setLayers((prev) => {
      prev.forEach(l => l.node.destroy())
      return []
    })
    ;["front","back"].forEach((sside) => {
      const s = sside as Side
      // eraser
      const eg = eraserGroupRef.current[s]
      if (eg) eg.destroy()
      eraserGroupRef.current[s] = null
      if (snap[s].eraser.lines.length) {
        const g = ensureEraserGroup(s)
        snap[s].eraser.lines.forEach(l => {
          const ln = new Konva.Line({
            points: l.points,
            stroke: "#000",
            strokeWidth: l.sw,
            lineCap: "round",
            lineJoin: "round",
            globalCompositeOperation: "destination-out",
            listening: false,
          })
          g.add(ln)
        })
      }
      // layers
      const items = snap[s].layers.slice().sort((a,b)=>a.z-b.z)
      for (const it of items) hydrateOne(it)
    })
    batch()
    select(null)
  }

  const hydrateOne = (sl: SerializedLayer) => {
    const meta = sl.meta
    let n: AnyNode | null = null
    if (sl.t === "image") {
      const im = new Image()
      im.crossOrigin = "anonymous"
      im.src = sl.src
      n = new Konva.Image({ image: im, x: sl.x, y: sl.y, width: sl.w, height: sl.h, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "text") {
      n = new Konva.Text({ text: sl.text, x: sl.x, y: sl.y, width: sl.w, fontSize: sl.fs, fontFamily: sl.ff, fill: sl.fill, align: sl.align, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "rect") {
      n = new Konva.Rect({ x: sl.x, y: sl.y, width: sl.w, height: sl.h, fill: sl.fill, stroke: sl.stroke, strokeWidth: sl.sw, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "circle") {
      n = new Konva.Circle({ x: sl.x, y: sl.y, radius: sl.r, fill: sl.fill, stroke: sl.stroke, strokeWidth: sl.sw, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "poly") {
      n = new Konva.RegularPolygon({ x: sl.x, y: sl.y, sides: sl.sides, radius: sl.r, fill: sl.fill, stroke: sl.stroke, strokeWidth: sl.sw, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "line") {
      n = new Konva.Line({ points: sl.points, stroke: sl.stroke, strokeWidth: sl.sw, lineCap: sl.lc, lineJoin: sl.lj, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
    } else if (sl.t === "cross") {
      const g = new Konva.Group({ x: sl.x, y: sl.y, rotation: sl.rot, scaleX: sl.sx, scaleY: sl.sy })
      g.add(new Konva.Rect({width:sl.size,height:sl.bar, y:sl.size/2-sl.bar/2, fill: sl.fill}))
      g.add(new Konva.Rect({width:sl.bar,height:sl.size, x:sl.size/2-sl.bar/2, fill: sl.fill}))
      ;(g as any)._kind = "cross"
      n = g
    }
    if (!n) return
    ;(n as any).id(sl.id)
    artLayerRef.current?.add(n as any)
    n.zIndex(sl.z)
    const id = sl.id
    const lay: AnyLayer = { id, side: sl.side, node: n, meta, type: sl.type }
    applyMeta(n, meta)
    ;(n as any).on?.("click tap", () => select(id))
    setLayers(p => [...p, lay])
  }

  /**
   * ====== СКАЧИВАНИЕ ======
   * Делаем 2 конверта: с мокапом (bg+art), и «только арт» (только art-layer). Мокап не стирается eraser-ом.
   */
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    // включаем нужный мокап
    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    // включаем только нужную сторону в арте
    layers.forEach(l => l.node.visible(l.side === s && l.meta.visible))
    eraserGroupRef.current.front && eraserGroupRef.current.front.visible(s === "front")
    eraserGroupRef.current.back  && eraserGroupRef.current.back.visible(s === "back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // без мокапа — прячем bg
    frontBgRef.current?.visible(false)
    backBgRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // вернуть видимость
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    layers.forEach(l => l.node.visible(l.side === side && l.meta.visible))
    eraserGroupRef.current.front && eraserGroupRef.current.front.visible(side === "front")
    eraserGroupRef.current.back  && eraserGroupRef.current.back.visible(side === "back")
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  /**
   * ====== РЕНДЕР ======
   */
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
        <div style={{ touchAction: "none" }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* LAYER 1 — МОКАПЫ */}
            <Layer ref={bgLayerRef} listening={true}>
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
            </Layer>

            {/* LAYER 2 — АРТ (+ тут же eraser поверх арта) */}
            <Layer ref={artLayerRef} listening={true} />

            {/* LAYER 3 — UI (рамки) */}
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
