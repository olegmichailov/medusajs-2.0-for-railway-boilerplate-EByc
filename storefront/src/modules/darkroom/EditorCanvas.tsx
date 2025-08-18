"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/* ================== БАЗА МАКЕТА ================== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

/* ================ КОНСТАНТЫ ТЕКСТА ================ */
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

/* ===================== УТИЛЫ ====================== */
const uid = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const lerp  = (a:number, b:number, t:number) => a + (b - a) * t

/* ==================== ТИПЫ СЛОЁВ =================== */
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

/* ============== ФЛАГ-ХЕЛПЕРЫ ДЛЯ НОД ============== */
const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

/* ================= ИСТОРИЯ (UNDO/REDO) ================ */
/** Снимок, пригодный к полному восстановлению */
type Snapshot = {
  side: Side
  items: Array<{
    id: string
    side: Side
    type: LayerType
    meta: BaseMeta
    z: number
    payload:
      | { kind: "image"; dataURL: string; x: number; y: number; w: number; h: number; rot: number; scale: number }
      | { kind: "text"; text: string; x: number; y: number; width: number; fontSize: number; fontFamily: string; fontStyle?: string; fill: string; lineHeight: number; rot: number; scale: number }
      | { kind: "shape"; shape: "rect"|"circle"|"triangle"|"cross"|"line"; data: any; rot: number; scale: number }
      | { kind: "strokes"; lines: Array<{points:number[]; stroke:string; strokeWidth:number}> }
  }>
}

function makeHistory() {
  const undo: Snapshot[] = []
  const redo: Snapshot[] = []
  return {
    push(s: Snapshot) {
      undo.push(s)
      redo.length = 0
      // ограничим память
      if (undo.length > 40) undo.shift()
    },
    canUndo() { return undo.length > 0 },
    canRedo() { return redo.length > 0 },
    popUndo(): Snapshot | null {
      const s = undo.pop() || null
      if (s) redo.push(s)
      return s
    },
    popRedo(): Snapshot | null {
      const s = redo.pop() || null
      if (s) undo.push(s)
      return s
    },
    clear() { undo.length = 0; redo.length = 0 }
  }
}

/* ================== КОМПОНЕНТ =================== */
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

  // stroke-сессии
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef     = useRef<Tool | null>(null)

  // маркер «идёт трансформирование», чтобы не конфликтовать с нашими жестами
  const isTransformingRef = useRef(false)

  // ======== История ========
  const historyRef = useRef(makeHistory())

  // ======== Вёрстка/масштаб ========
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    // на мобилке нижняя панель 3 ряда = ~144
    const padBottom = isMobile ? 144 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // фикс скролла и «жестов страницы»
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const prevent = (e: TouchEvent) => e.preventDefault()
    // отключаем зум/скролл браузера
    document.addEventListener("gesturestart", prevent as any, { passive: false } as any)
    document.addEventListener("touchmove", prevent, { passive: false })
    if (isMobile) set({ showLayers: false })
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener("gesturestart", prevent as any)
      document.removeEventListener("touchmove", prevent)
    }
  }, [set])

  // ======== Helpers ========
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  /* ================= Transformer ================= */
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
      // критично: выключить драг у всех, включить только у выбранного
      layers.forEach(l => { if (!isStrokeGroup(l.node)) (l.node as any).draggable(false) })
      return
    }

    // только выбранный — draggable
    layers.forEach(l => { if (!isStrokeGroup(l.node)) (l.node as any).draggable(l.id === lay!.id && !lay!.meta.locked) })

    const tr = trRef.current!
    ;(n as any).draggable(true)
    tr.nodes([n])
    tr.rotateEnabled(true)

    // guard на время трансформации
    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      // текст: боковые якоря — ширина; углы — масштаб шрифта
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
        const trInst = trRef.current
        const activeAnchor = (trInst && (trInst as any).getActiveAnchor?.()) as string | undefined

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
  useEffect(() => { attachTransformer() }, [tool])

  // во время brush/erase — отключаем трансформер/драг
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked && l.id===selectedId)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side, selectedId])

  /* ================== Хоткеи ================== */
  const runUndo = () => applySnapshot(historyRef.current.popUndo())
  const runRedo = () => applySnapshot(historyRef.current.popRedo())
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      if ((e.metaKey||e.ctrlKey) && !e.shiftKey && e.key.toLowerCase()==="z") { e.preventDefault(); runUndo(); return }
      if ((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==="z") { e.preventDefault(); runRedo(); return }

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      // duplicate
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); snapshot(); duplicateLayer(lay.id); return }
      // delete
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); snapshot(); deleteLayer(lay.id); return }

      // move
      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      canvasLayerRef.current?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // внешние триггеры от Toolbar (Back/Forward/Clear)
  useEffect(() => {
    const undoH = () => runUndo()
    const redoH = () => runRedo()
    const clearH = () => { snapshot(); clearCurrentSide() }
    window.addEventListener("darkroom:undo", undoH as any)
    window.addEventListener("darkroom:redo", redoH as any)
    window.addEventListener("darkroom:clear", clearH as any)
    return () => {
      window.removeEventListener("darkroom:undo", undoH as any)
      window.removeEventListener("darkroom:redo", redoH as any)
      window.removeEventListener("darkroom:clear", clearH as any)
    }
  }, [])

  /* ============ strokes-группа для кисти ============ */
  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    canvasLayerRef.current?.add(g)
    g.zIndex(canvasLayerRef.current!.children.length - 1)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      snapshot()
      createStrokeGroup()
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    lastToolRef.current = tool
  }, [tool, side])

  // утилита: шрифт сайта из body
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  /* ================ Добавления ================ */
  const onUploadImage = (file: File) => {
    snapshot()
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
        canvasLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
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
    snapshot()
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
      lineHeight: 1.1,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    canvasLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  const onAddShape = (kind: ShapeKind) => {
    snapshot()
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
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  /* ============ ERASE как маска выделенного слоя ============ */
  const ensureWrappedForErase = (l: AnyLayer): Konva.Group => {
    const n = l.node
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
    ;(n as any).x?.(0); (n as any).y?.(0); (n as any).rotation?.(0)
    ;(n as any).scaleX?.(1); (n as any).scaleY?.(1)
    g.add(n as any)

    // переносим blend/opacity на группу
    applyMeta(g as any, l.meta)
    g.cache()

    // обновляем ссылку слоя на новый node
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

  /* ============ Рисование: Brush / Erase ============ */
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

  const finishStroke = () => { if (isDrawing) { setIsDrawing(false); snapshot() } }

  /* ============ Overlay-редактор текста ============ */
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
    ta.autocapitalize = "off"
    ta.autocomplete = "off"
    ta.autocorrect = "off"
    ta.style.position = "fixed"
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
    ta.style.maxHeight = "45vh"
    ta.style.overflow = "auto"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()

    const autoGrow = () => {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 5) + "px"
    }
    autoGrow()

    const commit = (apply: boolean) => {
      if (apply) { t.text(ta.value); snapshot() }
      ta.remove()
      t.visible(true)
      canvasLayerRef.current?.batchDraw()
      attachTransformer()
    }

    const stopProp = (ev: Event) => ev.stopPropagation()
    ta.addEventListener("pointerdown", stopProp, { passive: false })
    ta.addEventListener("touchstart", stopProp, { passive: false })
    ta.addEventListener("wheel", stopProp as any, { passive: false })

    ta.addEventListener("input", autoGrow)
    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
  }

  /* ================== Жесты ================== */
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
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    // рисование
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      // для кисти — гарантируем группу на 1-е касание
      if (tool === "brush" && !currentStrokeId.current[side]) createStrokeGroup()
      startStroke(p.x, p.y)
      return
    }

    // move, 1 палец — выбор/перетаскивание
    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      // клик по пустому — снять выделение
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

    // 2 пальца — масштаб/поворот (сглаженный)
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

    // перенос
    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = {
        x: lerp(prev.x, p.x, 0.6),
        y: lerp(prev.y, p.y, 0.6),
      }
      canvasLayerRef.current?.batchDraw()
      return
    }

    // pinch/rotate
    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      let s = dist / gestureRef.current.startDist
      s = clamp(s, 0.25, 4) // спокойнее
      const smoothS = lerp(1, s, 0.35)

      const baseScale = gestureRef.current.startScale
      const newScale = clamp(baseScale * smoothS, 0.1, 10)
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI) * 0.35 // мягче

      const c = gestureRef.current.centerCanvas
      const sp = { x: c.x * scale, y: c.y * scale }
      applyAround(lay.node, sp, newScale, newRot)
      canvasLayerRef.current?.batchDraw()
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    if (gestureRef.current.active) snapshot()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  /* ======= Данные для панелей/toolbar ======= */
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
  }
  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    canvasLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(canvasLayerRef.current!.children.length - 1)
    canvasLayerRef.current?.batchDraw()
  }
  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    snapshot()
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
      // +1 чтобы фон оставался на дне (z=0 и z=1 заняты картинками фона)
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i + 2) })
      canvasLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    snapshot()
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    canvasLayerRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Снимки свойств выбранного узла для Toolbar =====
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

  const setSelectedFill       = (hex:string) => { snapshot(); const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { snapshot(); const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { snapshot(); const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); canvasLayerRef.current?.batchDraw() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { snapshot(); const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { snapshot(); const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    snapshot()
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    canvasLayerRef.current?.batchDraw()
  }

  /* ================= Скачивание ================= */
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

  /* ================== Clear (текущая сторона) ================== */
  const clearCurrentSide = () => {
    setLayers((prev) => {
      prev.filter(l => l.side === side).forEach(l => l.node.destroy())
      return prev.filter(l => l.side !== side)
    })
    select(null)
    currentStrokeId.current[side] = null
    canvasLayerRef.current?.batchDraw()
  }

  /* =============== Snapshot (история) =============== */
  const serialize = (): Snapshot => {
    const items = layers
      .filter(l => l.side === side)
      .map(l => {
        const z = l.node.zIndex()
        let payload: Snapshot["items"][number]["payload"]
        if (l.type === "image") {
          const img = l.node as Konva.Image
          // вытянуть dataURL из Image
          const el = img.image() as HTMLImageElement
          const dataURL = el?.src?.startsWith("data:") ? el.src : (() => {
            const c = document.createElement("canvas")
            c.width = el.naturalWidth; c.height = el.naturalHeight
            const ctx = c.getContext("2d")!
            ctx.drawImage(el, 0, 0)
            return c.toDataURL("image/png")
          })()
          payload = {
            kind: "image",
            dataURL,
            x: (img as any).x(), y: (img as any).y(),
            w: img.width(), h: img.height(),
            rot: (img as any).rotation?.() ?? 0,
            scale: (img as any).scaleX?.() ?? 1,
          }
        } else if (l.type === "text") {
          const t = l.node as Konva.Text
          payload = {
            kind: "text",
            text: t.text(),
            x: t.x(), y: t.y(), width: t.width(),
            fontSize: t.fontSize(), fontFamily: t.fontFamily(), fontStyle: t.fontStyle(),
            fill: (t.fill() as string) || "#000",
            lineHeight: t.lineHeight(),
            rot: t.rotation(), scale: (t as any).scaleX?.() ?? 1,
          }
        } else if (l.type === "shape") {
          const n = l.node as any
          let shape: "rect"|"circle"|"triangle"|"cross"|"line" = "rect"
          let data: any = {}
          if (n instanceof Konva.Rect)      { shape="rect";     data={ x:n.x(), y:n.y(), width:n.width(), height:n.height(), fill:n.fill() } }
          else if (n instanceof Konva.Circle){ shape="circle";   data={ x:n.x(), y:n.y(), radius:n.radius(), fill:n.fill() } }
          else if (n instanceof Konva.RegularPolygon && n.sides()===3){ shape="triangle"; data={ x:n.x(), y:n.y(), radius:n.radius(), fill:n.fill() } }
          else if (n instanceof Konva.Line) { shape="line";     data={ points:n.points(), stroke:n.stroke(), strokeWidth:n.strokeWidth() } }
          else { shape="cross"; data={ x:n.x(), y:n.y(), fill: (n.getChildren()?.[0] as any)?.fill?.() } }
          payload = { kind:"shape", shape, data, rot: n.rotation?.() ?? 0, scale: n.scaleX?.() ?? 1 }
        } else {
          // strokes
          const g = l.node as Konva.Group
          const lines = g.getChildren().map((ln:any)=>({ points: ln.points(), stroke: ln.stroke(), strokeWidth: ln.strokeWidth() }))
          payload = { kind:"strokes", lines }
        }
        return { id: l.id, side: l.side, type: l.type, meta: l.meta, z, payload }
      })
    return { side, items }
  }

  const snapshot = () => historyRef.current.push(serialize())

  const applySnapshot = (snap: Snapshot | null) => {
    if (!snap) return
    // очистить текущую сторону
    layers.filter(l => l.side === side).forEach(l => l.node.destroy())
    setLayers(prev => prev.filter(l => l.side !== side))
    select(null)

    // восстановить
    const toAdd: AnyLayer[] = []
    for (const item of snap.items) {
      if (item.side !== side) continue
      let node: AnyNode
      const m = item.meta
      if (item.payload.kind === "image") {
        const imgEl = new window.Image()
        imgEl.crossOrigin = "anonymous"
        imgEl.src = item.payload.dataURL
        node = new Konva.Image({ image: imgEl, x: item.payload.x, y: item.payload.y, width: item.payload.w, height: item.payload.h })
        ;(node as any).rotation(item.payload.rot)
        ;(node as any).scaleX(item.payload.scale); (node as any).scaleY(item.payload.scale)
      } else if (item.payload.kind === "text") {
        const p = item.payload
        node = new Konva.Text({
          text: p.text, x: p.x, y: p.y, width: p.width, fontSize: p.fontSize, fontFamily: p.fontFamily, fontStyle: p.fontStyle,
          fill: p.fill, lineHeight: p.lineHeight, draggable: false
        })
        ;(node as any).rotation(p.rot)
        ;(node as any).scaleX(p.scale); (node as any).scaleY(p.scale)
      } else if (item.payload.kind === "shape") {
        const p = item.payload
        if (p.shape==="rect") node = new Konva.Rect({ ...p.data })
        else if (p.shape==="circle") node = new Konva.Circle({ ...p.data })
        else if (p.shape==="triangle") node = new Konva.RegularPolygon({ ...p.data, sides: 3 })
        else if (p.shape==="line") node = new Konva.Line({ ...p.data, lineCap: "round", lineJoin: "round" })
        else { const g=new Konva.Group({x:p.data.x,y:p.data.y}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:p.data.fill})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:p.data.fill})); node=g }
        ;(node as any).rotation(p.rot)
        ;(node as any).scaleX(p.scale); (node as any).scaleY(p.scale)
      } else {
        const g = new Konva.Group({ x:0, y:0 }); (g as any)._isStrokes = true
        for (const ln of item.payload.lines) {
          g.add(new Konva.Line({ points: ln.points, stroke: ln.stroke, strokeWidth: ln.strokeWidth, lineCap:"round", lineJoin:"round" }))
        }
        node = g
      }

      ;(node as any).id(item.id)
      canvasLayerRef.current?.add(node as any)
      applyMeta(node, m)
      node.visible(item.meta.visible && side === item.side)
      node.zIndex(item.z)
      if (!isStrokeGroup(node)) {
        ;(node as any).draggable(false)
        node.on("click tap", () => select(item.id))
        if (node instanceof Konva.Text) node.on("dblclick dbltap", () => startTextOverlayEdit(node as Konva.Text))
      }
      toAdd.push({ id: item.id, side: item.side, node, meta: m, type: item.type })
    }
    setLayers(prev => [...prev.filter(l => l.side !== side), ...toAdd])
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }

  /* ================== Рендер ================== */
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "none", // критично для мобилки
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
          onDelete={(id)=>{ snapshot(); deleteLayer(id) }}
          onDuplicate={(id)=>{ snapshot(); duplicateLayer(id) }}
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
            {/* ЕДИНСТВЕННЫЙ «рисующий» слой: фон + арт */}
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
              {/* все добавляемые ноды кладём в этот же Layer imperatively */}
            </Layer>

            {/* UI-слой для рамки трансформера */}
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

      {/* Toolbar (твой) */}
      <Toolbar
        side={side} setSide={(s: Side)=>{ snapshot(); set({ side: s }) }}
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
        /* Если в твоём Toolbar уже есть кнопки Назад/Вперёд/Клир —
           просто диспатчь window.dispatchEvent(new Event("darkroom:undo")) и т.п. */
      />
    </div>
  )
}
