"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import LayersPanel, { LayerItem } from "./LayersPanel"
import Toolbar from "./Toolbar"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/** ===== Константы мокапа/базы ===== */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

/** ===== Утилы ===== */
const uid = () => Math.random().toString(36).slice(2)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const noop = () => {}

/** ===== Типы ===== */
type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "line" | "eraser"
type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon

type AnyItem = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

/** ===== Текст: ограничения ===== */
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

/** ===== История (undo/redo) ===== */
type SnapPayload =
  | { kind: "image"; src: string; x: number; y: number; w: number; h: number; rot: number; scaleX: number; scaleY: number }
  | { kind: "text"; text: string; x: number; y: number; width: number; fontSize: number; fontFamily: string; fontStyle?: string; fill: string; lineHeight: number; rot: number; scaleX: number; scaleY: number }
  | { kind: "shape"; shape: "rect"|"circle"|"triangle"|"line"; data: any; rot: number; scaleX: number; scaleY: number }
  | { kind: "line"; points: number[]; stroke: string; strokeWidth: number; gco: GlobalCompositeOperation }

type Snapshot = {
  side: Side
  items: Array<{
    id: string
    side: Side
    type: LayerType
    meta: BaseMeta
    z: number
    payload: SnapPayload
  }>
}

function makeHistory() {
  const undo: Snapshot[] = []
  const redo: Snapshot[] = []
  return {
    push(s: Snapshot) { undo.push(s); redo.length = 0; if (undo.length > 50) undo.shift() },
    popUndo(): Snapshot | null { const s = undo.pop() || null; if (s) redo.push(s); return s },
    popRedo(): Snapshot | null { const s = redo.pop() || null; if (s) undo.push(s); return s },
    clear() { undo.length = 0; redo.length = 0 },
    canUndo() { return undo.length>0 },
    canRedo() { return redo.length>0 }
  }
}

/** ===== Компонент ===== */
export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // Konva хит-тест во время drag (мобилка)
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs слоёв
  const stageRef       = useRef<Konva.Stage>(null)
  const mockupLayerRef = useRef<Konva.Layer>(null)
  const artLayerRef    = useRef<Konva.Layer>(null)
  const uiLayerRef     = useRef<Konva.Layer>(null)
  const trRef          = useRef<Konva.Transformer>(null)
  const frontBgRef     = useRef<Konva.Image>(null)
  const backBgRef      = useRef<Konva.Image>(null)

  // список объектов / eraser-группа
  const [items, setItems] = useState<AnyItem[]>([])
  const eraserGroupRef = useRef<Konva.Group | null>(null)

  // история
  const historyRef = useRef(makeHistory())

  // производительность: только выбранный draggable
  const enforceDraggable = (selId: string | null) => {
    items.forEach(i => { (i.node as any).draggable(Boolean(selId && i.id===selId && !i.meta.locked && tool==="move")) })
  }

  /** ===== Вёрстка и масштаб ===== */
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])
  useEffect(() => {
    const onResize = () => setHeaderH(prev => prev) // триггерим пересчёт
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
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
  }, [headerH, showLayers])

  // блокируем скролл/зум страницы (мобилка)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  /** ===== Показ активной стороны ===== */
  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    items.forEach(i => i.node.visible(i.side===side && i.meta.visible))
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, items, tool, selectedId])

  /** ===== Transformer ===== */
  const attachTransformer = () => {
    const tr = trRef.current; const stage = stageRef.current
    if (!tr || !stage) return
    const sel = items.find(i => i.id === selectedId)
    const n: AnyNode | undefined = sel?.node
    const disabled = !n || sel?.meta.locked || tool!=="move"

    if (disabled) {
      tr.nodes([])
      uiLayerRef.current?.batchDraw()
      enforceDraggable(null)
      return
    }

    // только выбранный draggable
    enforceDraggable(sel!.id)

    tr.nodes([n])
    tr.rotateEnabled(true)

    // для текста — area width на боковых якорях, fontSize на углах
    if (n instanceof Konva.Text) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const t = n
      const start = { w: t.width(), x: t.x(), fs: t.fontSize() }
      const clampW  = (val:number) => Math.max(TEXT_MIN_W,  Math.min(val, TEXT_MAX_W))
      const clampFS = (val:number) => Math.max(TEXT_MIN_FS, Math.min(val, TEXT_MAX_FS))
      const onTransform = () => {
        const active = (tr as any).getActiveAnchor?.() as string | undefined
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, t.scaleX())
          const newW = clampW(start.w * sx)
          if (active === "middle-left") { const right = start.x + start.w; t.width(newW); t.x(right - newW) }
          else { t.width(newW); t.x(start.x) }
          t.scaleX(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY())
          t.fontSize(clampFS(start.fs * s))
          t.scaleX(1); t.scaleY(1)
        }
        t.getLayer()?.batchDraw()
      }
      tr.off(".txtfix")
      tr.on("transform.txtfix", onTransform)
      n.off(".snapend")
      n.on("transformend.snapend dragend.snapend", () => snapshotSafe())
    } else {
      tr.keepRatio(true)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right"])
      tr.off(".txtfix")
      n.off(".snapend")
      n.on("transformend.snapend dragend.snapend", () => snapshotSafe())
    }

    tr.getLayer()?.batchDraw()
  }

  useEffect(() => { attachTransformer() }, [selectedId, tool])

  /** ===== Поиск объекта под курсором ===== */
  const pickAt = (sx:number, sy:number): AnyItem | null => {
    const st = stageRef.current; if (!st) return null
    const hit = st.getIntersection({ x: sx, y: sy }, "Shape")
    if (!hit) return null
    return items.find(i => i.node === hit) ?? null
  }

  /** ===== Eraser-группа всегда сверху ===== */
  const ensureEraserGroup = () => {
    if (!artLayerRef.current) return null
    if (!eraserGroupRef.current) {
      const g = new Konva.Group({ listening: false })
      ;(g as any)._eraser = true
      artLayerRef.current.add(g)
      eraserGroupRef.current = g
    }
    // держим сверху
    const g = eraserGroupRef.current!
    g.zIndex(artLayerRef.current.getChildren().length - 1)
    artLayerRef.current.batchDraw()
    return g
  }

  /** ===== Рисование кистью / ластиком ===== */
  const drawingRef = useRef<null | { line: Konva.Line; tool: "brush" | "erase" }>(null)
  const toCanvas = (p: {x:number;y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const startDraw = (x:number, y:number) => {
    if (!artLayerRef.current) return
    if (tool!=="brush" && tool!=="erase") return
    const isErase = tool==="erase"
    const where = isErase ? ensureEraserGroup()! : artLayerRef.current
    const line = new Konva.Line({
      points: [x,y],
      stroke: isErase ? "#000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: isErase ? "destination-out" : "source-over",
      listening: false,
    })
    where.add(line)
    drawingRef.current = { line, tool: isErase ? "erase" : "brush" }
    artLayerRef.current.batchDraw()
  }

  const moveDraw = (x:number, y:number) => {
    const d = drawingRef.current; if (!d) return
    d.line.points(d.line.points().concat([x,y]))
    artLayerRef.current?.batchDraw()
  }

  const endDraw = () => {
    if (!drawingRef.current) return
    // фиксируем в истории только завершённый мазок
    snapshotSafe()
    drawingRef.current = null
  }

  /** ===== Добавление элементов ===== */
  const baseMeta = (name:string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
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
        const k = new Konva.Image({ image: img, x: BASE_W/2 - w/2, y: BASE_H/2 - h/2, width: w, height: h })
        ;(k as any).id(uid())
        const id = (k as any)._id
        k.on("click tap", () => select(id))
        artLayerRef.current?.add(k)
        setItems(p => [...p, { id, side, node: k, meta: baseMeta("image"), type: "image" }])
        ensureEraserGroup()
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
        snapshotSafe()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      width: 600, align: "center",
      fontSize: 96, fontFamily: siteFont(), fontStyle: "bold",
      fill: brushColor, lineHeight: 1.1,
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => startTextOverlayEdit(t))
    artLayerRef.current?.add(t)
    setItems(p => [...p, { id, side, node: t, meta: baseMeta("text"), type: "text" }])
    ensureEraserGroup()
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    snapshotSafe()
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    n.on("click tap", () => select(id))
    artLayerRef.current?.add(n as any)
    setItems(p => [...p, { id, side, node: n, meta: baseMeta("shape"), type: "shape" }])
    ensureEraserGroup()
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    snapshotSafe()
  }

  /** ===== Удаление/дубликат/порядок ===== */
  const deleteItem = (id: string) => {
    setItems(prev => {
      const it = prev.find(i => i.id===id)
      it?.node.destroy()
      return prev.filter(i => i.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    snapshotSafe()
  }

  const duplicateItem = (id: string) => {
    const src = items.find(i => i.id === id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    artLayerRef.current?.add(clone as any)
    const newId = (clone as any)._id
    setItems(p => [...p, { id: newId, side: src.side, node: clone, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }])
    ensureEraserGroup()
    select(newId)
    artLayerRef.current?.batchDraw()
    snapshotSafe()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    const current = items.filter(i => i.side===side)
    const src = current.find(i => i.id===srcId)
    const dst = current.find(i => i.id===destId)
    if (!src || !dst) return
    const targetZ = place==="before" ? dst.node.zIndex() : dst.node.zIndex()+1
    src.node.zIndex(targetZ)
    ensureEraserGroup()
    artLayerRef.current?.batchDraw()
    snapshotSafe()
  }

  /** ===== Метаданные (visible/lock/blend/opacity) ===== */
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const meta = { ...i.meta, ...patch }
      applyMeta(i.node, meta)
      if (patch.visible !== undefined) i.node.visible(meta.visible && i.side===side)
      return { ...i, meta }
    }))
    artLayerRef.current?.batchDraw()
    snapshotSafe()
  }

  /** ===== Панель слоёв (десктоп) ===== */
  const layerItems: LayerItem[] = useMemo(() => {
    return items
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [items, side])

  /** ===== Текстовый оверлей (официальный подход) ===== */
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
    ta.autocomplete  = "off"
    ta.autocorrect   = "off"
    Object.assign(ta.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      padding: "4px 6px",
      border: "1px solid #000",
      background: "#fff",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      transformOrigin: "left top",
      zIndex: "9999",
      minWidth: `${Math.max(160, t.width() * scale || 0)}px`,
      outline: "none",
      resize: "none",
      boxShadow: "0 2px 8px rgba(0,0,0,.12)",
      maxHeight: "45vh",
      overflow: "auto",
    } as CSSStyleDeclaration)
    document.body.appendChild(ta)
    ta.focus(); ta.select()

    const autoGrow = () => {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize) || 16) * 5) + "px"
    }
    autoGrow()

    const stop = (ev: Event) => ev.stopPropagation()
    ta.addEventListener("pointerdown", stop, { passive: false })
    ta.addEventListener("touchstart", stop, { passive: false })
    ta.addEventListener("wheel", stop as any, { passive: false })

    const commit = (apply:boolean) => {
      if (apply) { t.text(ta.value); snapshotSafe() }
      ta.remove()
      t.visible(true)
      artLayerRef.current?.batchDraw()
      attachTransformer()
    }

    ta.addEventListener("keydown", (ev) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    })
    ta.addEventListener("blur", () => commit(true))
    ta.addEventListener("input", autoGrow)
  }

  /** ===== Глобальные pointer-ивенты ===== */
  const onPointerDown = (e: any) => {
    e.evt?.preventDefault?.()
    const st = stageRef.current; if (!st) return

    // brush/erase
    if (tool==="brush" || tool==="erase") {
      const p = st.getPointerPosition() || { x: 0, y: 0 }
      const c = toCanvas(p)
      startDraw(c.x, c.y)
      return
    }

    // выбор объекта
    const tgt = e.target as Konva.Node
    if (!tgt || tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null)
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    const found = items.find(i => i.node === tgt)
    if (found && found.side === side) {
      select(found.id)
      attachTransformer()
    }
  }

  const onPointerMove = (e: any) => {
    const st = stageRef.current; if (!st) return
    if (!drawingRef.current) return
    const p = st.getPointerPosition() || { x: 0, y: 0 }
    const c = toCanvas(p)
    moveDraw(c.x, c.y)
  }

  const onPointerUp = () => { endDraw() }

  /** ===== CLEAR / внешние события Toolbar ===== */
  const clearActiveSide = () => {
    // чистим ВСЁ на активной стороне, включая eraser
    items.filter(i => i.side===side).forEach(i => i.node.destroy())
    setItems(prev => prev.filter(i => i.side!==side))
    eraserGroupRef.current = null
    artLayerRef.current?.batchDraw()
    select(null)
  }

  useEffect(() => {
    const undoH = () => applySnapshot(historyRef.current.popUndo())
    const redoH = () => applySnapshot(historyRef.current.popRedo())
    const clearH = () => { snapshotSafe(); clearActiveSide() }
    window.addEventListener("darkroom:undo", undoH as any)
    window.addEventListener("darkroom:redo", redoH as any)
    window.addEventListener("darkroom:clear", clearH as any)
    return () => {
      window.removeEventListener("darkroom:undo", undoH as any)
      window.removeEventListener("darkroom:redo", redoH as any)
      window.removeEventListener("darkroom:clear", clearH as any)
    }
  }, [items, side])

  /** ===== Снимки/история ===== */
  const serialize = (): Snapshot => {
    const itemsSnap = items
      .filter(i => i.side===side)
      .map(i => {
        const z = i.node.zIndex()
        let payload: SnapPayload
        if (i.type==="image") {
          const img = i.node as Konva.Image
          const el = img.image() as HTMLImageElement
          const src = el?.src?.startsWith("data:") ? el.src : (() => {
            const c = document.createElement("canvas")
            c.width = el.naturalWidth; c.height = el.naturalHeight
            const ctx = c.getContext("2d")!; ctx.drawImage(el,0,0); return c.toDataURL("image/png")
          })()
          payload = { kind:"image", src, x: (img as any).x(), y:(img as any).y(), w: img.width(), h: img.height(), rot:(img as any).rotation()||0, scaleX:(img as any).scaleX?.()??1, scaleY:(img as any).scaleY?.()??1 }
        } else if (i.type==="text") {
          const t = i.node as Konva.Text
          payload = { kind:"text", text:t.text(), x:t.x(), y:t.y(), width:t.width(), fontSize:t.fontSize(), fontFamily:t.fontFamily(), fontStyle:t.fontStyle(), fill:String(t.fill()||"#000"), lineHeight:t.lineHeight(), rot:t.rotation(), scaleX:(t as any).scaleX?.()??1, scaleY:(t as any).scaleY?.()??1 }
        } else if (i.type==="shape") {
          const n:any = i.node
          if (n instanceof Konva.Rect)      payload={kind:"shape",shape:"rect", data:{ x:n.x(), y:n.y(), width:n.width(), height:n.height(), fill:n.fill() }, rot:n.rotation?.()??0, scaleX:n.scaleX?.()??1, scaleY:n.scaleY?.()??1}
          else if (n instanceof Konva.Circle)payload={kind:"shape",shape:"circle", data:{ x:n.x(), y:n.y(), radius:n.radius(), fill:n.fill() }, rot:n.rotation?.()??0, scaleX:n.scaleX?.()??1, scaleY:n.scaleY?.()??1}
          else if (n instanceof Konva.RegularPolygon && n.sides()===3)
                                              payload={kind:"shape",shape:"triangle", data:{ x:n.x(), y:n.y(), radius:n.radius(), fill:n.fill() }, rot:n.rotation?.()??0, scaleX:n.scaleX?.()??1, scaleY:n.scaleY?.()??1}
          else                                payload={kind:"shape",shape:"line", data:{ points:n.points(), stroke:n.stroke(), strokeWidth:n.strokeWidth() }, rot:n.rotation?.()??0, scaleX:n.scaleX?.()??1, scaleY:n.scaleY?.()??1}
        } else {
          const ln = i.node as Konva.Line
          payload = { kind:"line", points: ln.points(), stroke: ln.stroke() as string, strokeWidth: ln.strokeWidth(), gco: ((ln as any).globalCompositeOperation || "source-over") as GlobalCompositeOperation }
        }
        return { id: i.id, side: i.side, type: i.type, meta: i.meta, z, payload }
      })
    return { side, items: itemsSnap }
  }

  const snapshotSafe = () => {
    // не пушим пустые слепки
    const snap = serialize()
    historyRef.current.push(snap)
  }

  const applySnapshot = (snap: Snapshot | null) => {
    if (!snap) return
    // удалить всё на стороне
    items.filter(i => i.side===side).forEach(i => i.node.destroy())
    setItems(prev => prev.filter(i => i.side!==side))
    eraserGroupRef.current = null
    select(null)

    const toAdd: AnyItem[] = []
    for (const it of snap.items) {
      if (it.side !== side) continue
      let node: AnyNode
      if (it.payload.kind==="image") {
        const img = new window.Image()
        img.crossOrigin="anonymous"
        img.src = it.payload.src
        node = new Konva.Image({ image: img, x: it.payload.x, y: it.payload.y, width: it.payload.w, height: it.payload.h })
        ;(node as any).rotation(it.payload.rot)
        ;(node as any).scaleX(it.payload.scaleX); (node as any).scaleY(it.payload.scaleY)
      } else if (it.payload.kind==="text") {
        const p = it.payload
        node = new Konva.Text({ text:p.text, x:p.x, y:p.y, width:p.width, fontSize:p.fontSize, fontFamily:p.fontFamily, fontStyle:p.fontStyle, fill:p.fill, lineHeight:p.lineHeight, draggable:false })
        ;(node as any).rotation(p.rot)
        ;(node as any).scaleX(p.scaleX); (node as any).scaleY(p.scaleY)
      } else if (it.payload.kind==="shape") {
        const p = it.payload
        if (p.shape==="rect")      node = new Konva.Rect({ ...p.data })
        else if (p.shape==="circle") node = new Konva.Circle({ ...p.data })
        else if (p.shape==="triangle") node = new Konva.RegularPolygon({ ...p.data, sides:3 })
        else node = new Konva.Line({ ...p.data, lineCap:"round", lineJoin:"round" })
        ;(node as any).rotation(p.rot)
        ;(node as any).scaleX(p.scaleX); (node as any).scaleY(p.scaleY)
      } else {
        const p = it.payload
        node = new Konva.Line({ points:p.points, stroke:p.stroke, strokeWidth:p.strokeWidth, lineCap:"round", lineJoin:"round" })
        ;(node as any).globalCompositeOperation = p.gco
      }
      ;(node as any).id(it.id)
      artLayerRef.current?.add(node as any)
      // клики
      if (!(node instanceof Konva.Line && ((node as any).globalCompositeOperation==="destination-out"))) {
        node.on("click tap", () => select(it.id))
        if (node instanceof Konva.Text) node.on("dblclick dbltap", () => startTextOverlayEdit(node as Konva.Text))
      }
      applyMeta(node, it.meta)
      node.visible(it.meta.visible && it.side===side)
      node.zIndex(it.z)
      toAdd.push({ id: it.id, side: it.side, node, meta: it.meta, type: it.type })
    }
    setItems(prev => [...prev.filter(i => i.side!==side), ...toAdd])
    ensureEraserGroup()
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }

  /** ===== selectedProps/сеттеры под Toolbar ===== */
  const sel = items.find(i => i.id===selectedId) || null
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && sel.node instanceof Konva.Text ? {
      text: sel.node.text(),
      fontSize: sel.node.fontSize(),
      fontFamily: sel.node.fontFamily(),
      fill: String(sel.node.fill() ?? "#000"),
    }
    : sel ? (() => {
        const any: any = sel.node
        return {
          fill: typeof any.fill === "function" ? any.fill() : undefined,
          stroke: typeof any.stroke === "function" ? any.stroke() : undefined,
          strokeWidth: typeof any.strokeWidth === "function" ? any.strokeWidth() : undefined,
        }
      })()
    : {}

  const setSelectedFill       = (hex:string) => { if (!sel) return; const any:any = sel.node; if (typeof any.fill==="function") any.fill(hex); artLayerRef.current?.batchDraw(); snapshotSafe() }
  const setSelectedStroke     = (hex:string) => { if (!sel) return; const any:any = sel.node; if (typeof any.stroke==="function") any.stroke(hex); artLayerRef.current?.batchDraw(); snapshotSafe() }
  const setSelectedStrokeW    = (w:number)    => { if (!sel) return; const any:any = sel.node; if (typeof any.strokeWidth==="function") any.strokeWidth(w); artLayerRef.current?.batchDraw(); snapshotSafe() }
  const setSelectedText       = (tstr:string) => { if (sel && sel.node instanceof Konva.Text) { sel.node.text(tstr); artLayerRef.current?.batchDraw() } }
  const setSelectedFontSize   = (nsize:number)=> { if (sel && sel.node instanceof Konva.Text) { sel.node.fontSize(clamp(nsize, TEXT_MIN_FS, TEXT_MAX_FS)); artLayerRef.current?.batchDraw(); snapshotSafe() } }
  const setSelectedFontFamily = (name:string) => { if (sel && sel.node instanceof Konva.Text) { sel.node.fontFamily(name); artLayerRef.current?.batchDraw(); snapshotSafe() } }
  const setSelectedColor      = (hex:string)  => { if (!sel) return; if (sel.node instanceof Konva.Text) sel.node.fill(hex); else { const any:any = sel.node; if (typeof any.fill==="function") any.fill(hex) } ; artLayerRef.current?.batchDraw(); snapshotSafe() }

  /** ===== Render ===== */
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
    >
      {/* десктоп-панель слоёв — НЕ рендерим на мобилке, чтобы не падало */}
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id)=>{ select(id); if (tool!=="move") set({ tool:"move" }); attachTransformer() }}
          onToggleVisible={(id)=>{ const l=items.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id)=>{ const l=items.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteItem}
          onDuplicate={duplicateItem}
          onReorder={reorder}
          onChangeBlend={(id, b)=>updateMeta(id,{ blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id,{ opacity: o })}
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        <Stage
          ref={stageRef}
          width={viewW} height={viewH}
          scale={{ x: scale, y: scale }}
          onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        >
          {/* Мокап */}
          <Layer ref={mockupLayerRef}>
            {frontMock && <KImage ref={frontBgRef} image={frontMock} width={BASE_W} height={BASE_H} visible={side==="front"} listening />}
            {backMock  && <KImage ref={backBgRef}  image={backMock}  width={BASE_W} height={BASE_H} visible={side==="back"}  listening />}
          </Layer>

          {/* Арт (ВСЁ здесь; eraser — отдельная группа вверху) */}
          <Layer ref={artLayerRef} listening />

          {/* UI */}
          <Layer ref={uiLayerRef} listening={false}>
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

      {/* Твой Toolbar (не менял) */}
      <Toolbar
        side={side} setSide={(s: Side)=>{ snapshotSafe(); set({ side: s }) }}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={() => {}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        onDownloadFront={noop}
        onDownloadBack={noop}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind}
        selectedProps={selectedProps as any}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        mobileLayers={{
          items: layerItems,
          onSelect:(id)=>{ select(id); if (tool!=="move") set({ tool:"move" }); attachTransformer() },
          onToggleVisible:(id)=>{ const l=items.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock:(id)=>{ const l=items.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteItem,
          onDuplicate: duplicateItem,
          onChangeBlend:(id,b)=>updateMeta(id,{ blend: b as Blend }),
          onChangeOpacity:(id,o)=>updateMeta(id,{ opacity:o }),
          onMoveUp:(id)=>{ const it = items.find(i=>i.id===id); if(!it) return; it.node.zIndex(it.node.zIndex()+1); ensureEraserGroup(); artLayerRef.current?.batchDraw(); snapshotSafe() },
          onMoveDown:(id)=>{ const it = items.find(i=>i.id===id); if(!it) return; it.node.zIndex(Math.max(0, it.node.zIndex()-1)); ensureEraserGroup(); artLayerRef.current?.batchDraw(); snapshotSafe() },
        }}
      />
    </div>
  )
}
