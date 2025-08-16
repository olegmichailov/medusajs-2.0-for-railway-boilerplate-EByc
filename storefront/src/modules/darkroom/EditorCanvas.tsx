"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Макет / константы
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// Текстовые клампы
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

// ===== Типы
type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyNode =
  | Konva.Image | Konva.Line | Konva.Text | Konva.Group
  | Konva.Rect  | Konva.Circle | Konva.RegularPolygon
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isImageNode   = (n: AnyNode): n is Konva.Image => n instanceof Konva.Image
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind,
          selectedId, select, showLayers, toggleLayers } = useDarkroom()

  // точнее хиты в драге (мобилка)
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокап
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef   = useRef<Konva.Stage>(null)
  const artRef     = useRef<Konva.Layer>(null)
  const uiRef      = useRef<Konva.Layer>(null)
  const trRef      = useRef<Konva.Transformer>(null)
  const frontBgRef = useRef<Konva.Image>(null)
  const backBgRef  = useRef<Konva.Image>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const lastToolRef = useRef<Tool | null>(null)
  const isTransformingRef = useRef(false)

  // верстка/масштаб
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
  }, [headerH])

  // отключаем скролл страницы
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: true }) // список слоёв доступен и на мобилке (через шторку)
    return () => { document.body.style.overflow = prev }
  }, [set])

  // ===== helpers
  const baseMeta = (name: string): BaseMeta =>
    ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })

  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
    if (n instanceof Konva.Group && meta.blend !== "source-over" && !n.isCached()) n.cache()
  }

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    artRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer
  const detachCustom = useRef<(() => void) | null>(null)
  const textStartRef = useRef<{w:number; x:number; fs:number} | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || tool !== "move"

    if (detachCustom.current) { detachCustom.current(); detachCustom.current = null }

    if (disabled) {
      trRef.current?.nodes([])
      uiRef.current?.batchDraw()
      return
    }

    ;(n as any).draggable(true)
    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)

    if (isTextNode(n)) {
      // текст: боковые якоря — ширина; углы — масштаб шрифта
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const clampW  = (val:number) => Math.max(TEXT_MIN_W,  Math.min(val, TEXT_MAX_W))
      const clampFS = (val:number) => Math.max(TEXT_MIN_FS, Math.min(val, TEXT_MAX_FS))
      const onStartTxt = () => {
        const t = n as Konva.Text
        textStartRef.current = { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
      }
      const onTransform = () => {
        const t = n as Konva.Text
        const st = textStartRef.current || { w: t.width() || 0, x: t.x(), fs: t.fontSize() }
        const active = (tr as any).getActiveAnchor?.() as string | undefined
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, t.scaleX())
          const newW = clampW(st.w * sx)
          if (active === "middle-left") {
            const right = st.x + st.w
            t.width(newW); t.x(right - newW)
          } else {
            t.width(newW); t.x(st.x)
          }
          t.scaleX(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY())
          const next = clampFS(st.fs * s)
          t.fontSize(next); t.scaleX(1); t.scaleY(1)
        }
        t.getLayer()?.batchDraw()
      }
      const onEnd = () => { onTransform(); textStartRef.current = null }
      n.on("transformstart.textfix", onStartTxt)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachCustom.current = () => { n.off(".textfix"); n.off(".guard") }
    } else {
      // image/shape: углы пропорционально, боковые/верх-низ — не пропорционально
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])
      const onTransform = () => {
        const sx = (n as any).scaleX?.() ?? 1
        const sy = (n as any).scaleY?.() ?? 1
        const active = (tr as any).getActiveAnchor?.() as string | undefined
        const isCorner = active ? /top|bottom/.test(active) && /left|right/.test(active) : false
        if (isCorner) {
          const s = Math.max(sx, sy)
          ;(n as any).scaleX(s); (n as any).scaleY(s)
        }
        n.getLayer()?.batchDraw()
      }
      n.on("transform.imgshape", onTransform)
      detachCustom.current = () => { n.off(".imgshape"); n.off(".guard") }
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // во время brush/erase — отключаем драг
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiRef.current?.batchDraw() }
  }, [tool, layers, side])

  // хоткеи
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName==="INPUT"||ae.tagName==="TEXTAREA"||ae.isContentEditable)) return

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }
      if (e.key==="ArrowLeft")  (n as any).x((n as any).x()-step)
      if (e.key==="ArrowRight") (n as any).x((n as any).x()+step)
      if (e.key==="ArrowUp")    (n as any).y((n as any).y()-step)
      if (e.key==="ArrowDown")  (n as any).y((n as any).y()+step)
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // strokes-группа
  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    artRef.current?.add(g)
    g.zIndex(artRef.current!.children.length - 1)
    const layer: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, layer])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return layer
  }
  useEffect(() => {
    if (tool === "brush" && lastToolRef.current !== "brush") {
      createStrokeGroup()
      trRef.current?.nodes([])
      uiRef.current?.batchDraw()
    }
    lastToolRef.current = tool
  }, [tool, side])

  // ===== Координаты (единственные определения)
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  // ===== Добавления
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
        artRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "ENTER TEXT",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96, fontFamily: "Helvetica, Arial, sans-serif",
      fontStyle: "bold", fill: brushColor, width: 600, align: "left",
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    artRef.current?.add(t)
    t.on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artRef.current?.batchDraw()
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
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    artRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== ERASE как маска
  const ensureWrappedForErase = (l: AnyLayer): Konva.Group => {
    const n = l.node
    if (n.getParent() !== artRef.current) { // уже в группе
      const g = n.getParent() as Konva.Group
      if (!g.isCached()) g.cache()
      return g
    }
    const g = new Konva.Group({
      x: (n as any).x?.() ?? 0, y: (n as any).y?.() ?? 0,
      rotation: (n as any).rotation?.() ?? 0,
      scaleX: (n as any).scaleX?.() ?? 1, scaleY: (n as any).scaleY?.() ?? 1
    })
    ;(g as any).id(uid())
    artRef.current!.add(g)
    ;(n as any).x?.(0); (n as any).y?.(0); (n as any).rotation?.(0)
    ;(n as any).scaleX?.(1); (n as any).scaleY?.(1)
    g.add(n as any)
    applyMeta(g as any, l.meta)
    g.cache()
    setLayers(p => p.map(it => it.id === l.id ? { ...it, node: g } : it))
    select(l.id)
    return g
  }
  const pickTopAt = (sx: number, sy: number): AnyLayer | null => {
    const st = stageRef.current; if (!st) return null
    const hits = st.getAllIntersections({ x: sx, y: sy })
    for (const raw of hits) {
      if (raw === frontBgRef.current || raw === backBgRef.current) continue
      let n: Konva.Node | null | undefined = raw
      while (n && n !== artRef.current) {
        const l = layers.find(L => L.node === n)
        if (l) {
          if (l.side !== side || !l.meta.visible || l.meta.locked || isStrokeGroup(l.node)) break
          return l
        }
        n = n.getParent?.()
      }
    }
    return null
  }
  const recacheGroup = (g: Konva.Group) => { g.clearCache(); g.cache() }

  // рисование
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      if (!gid) gid = createStrokeGroup().id
      const g = find(gid)!.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y], stroke: brushColor, strokeWidth: brushSize,
        lineCap: "round", lineJoin: "round", globalCompositeOperation: "source-over",
      })
      g.add(line); setIsDrawing(true)
    } else if (tool === "erase") {
      let sel = find(selectedId)
      if (!sel) {
        const sp = stageRef.current?.getPointerPosition()
        if (sp) sel = pickTopAt(sp.x, sp.y)
        if (sel) select(sel.id)
      }
      if (!sel) return
      const g = ensureWrappedForErase(sel)
      const line = new Konva.Line({
        points: [x, y], stroke: "#000", strokeWidth: brushSize,
        lineCap: "round", lineJoin: "round", globalCompositeOperation: "destination-out",
      })
      g.add(line); recacheGroup(g); setIsDrawing(true)
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
      artRef.current?.batchDraw()
    } else if (tool === "erase") {
      const sel = find(selectedId)
      const g = sel ? ensureWrappedForErase(sel) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      if (g) recacheGroup(g)
      artRef.current?.batchDraw()
    }
  }
  const finishStroke = () => setIsDrawing(false)

  // ===== Жесты (drag 1-пальцем/мышью)
  type G = { active: boolean; nodeId: string | null; last?: {x:number;y:number} }
  const gest = useRef<G>({ active:false, nodeId:null })

  const onDown = (e:any) => {
    e.evt?.preventDefault?.()
    if (isTransformingRef.current) return

    if (tool==="brush" || tool==="erase") {
      const p = toCanvas(getStagePointer())
      if (tool==="brush" && !currentStrokeId.current[side]) createStrokeGroup()
      startStroke(p.x, p.y); return
    }

    const st = stageRef.current!, tgt = e.target as Konva.Node
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null); trRef.current?.nodes([]); uiRef.current?.batchDraw(); return
    }

    let p: Konva.Node | null | undefined = tgt
    while (p && p !== artRef.current) {
      const l = layers.find(L => L.node === p)
      if (l && l.side === side) { select(l.id); break }
      p = p.getParent?.()
    }

    const lay = find(selectedId)
    if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
      gest.current = { active:true, nodeId: lay.id, last: toCanvas(getStagePointer()) }
    }
  }
  const onMove = () => {
    if (isTransformingRef.current) return
    if (tool==="brush" || tool==="erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer()); appendStroke(p.x,p.y); return
    }
    if (gest.current.active) {
      const lay = find(gest.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer()); const prev = gest.current.last || p
      const dx = p.x - prev.x, dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0)+dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0)+dy)
      gest.current.last = p; artRef.current?.batchDraw()
    }
  }
  const onUp = () => { if (isDrawing) finishStroke(); gest.current.active=false; requestAnimationFrame(attachTransformer) }

  // ===== CRUD / порядок / метаданные
  const deleteLayer = (id: string) => {
    setLayers(p => { const l=p.find(x=>x.id===id); l?.node.destroy(); return p.filter(x=>x.id!==id) })
    if (selectedId === id) select(null)
    artRef.current?.batchDraw()
  }
  const duplicateLayer = (id: string) => {
    const src = layers.find(l=>l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    artRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(artRef.current!.children.length - 1)
    artRef.current?.batchDraw()
  }
  const reorder = (srcId: string, destId: string, place: "before"|"after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      const orderTopToBottom = current.slice().sort((a,b)=> a.node.zIndex()-b.node.zIndex()).reverse()
      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev
      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)
      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l,i)=>{ (l.node as any).zIndex(i+2) }) // +2: фоны занимают низ
      artRef.current?.batchDraw()
      return [...others, ...bottomToTop]
    })
    select(srcId); requestAnimationFrame(attachTransformer)
  }
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artRef.current?.batchDraw()
  }

  // ===== Список слоёв (данные)
  const layerItems = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type as LayerType,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side])

  const onLayerSelect = (id: string) => { select(id); if (tool!=="move") set({ tool: "move" }) }

  // ===== Свойства выделенного для тулбара
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); artRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); artRef.current?.batchDraw() }
  const setSelectedText       = (t:string)    => { const n = sel?.node as Konva.Text; if (!n) return; n.text(t); artRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); artRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if ((sel.node as any).fill) (sel.node as any).fill(hex)
    artRef.current?.batchDraw()
  }

  // ===== Скачать (mockup+art и art)
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1 / (st.scaleX() || 1)))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiRef.current?.visible(false)

    if (frontBgRef.current) frontBgRef.current.visible(s==="front")
    if (backBgRef.current)  backBgRef.current.visible(s==="back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    if (frontBgRef.current) frontBgRef.current.visible(false)
    if (backBgRef.current)  backBgRef.current.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    if (frontBgRef.current) frontBgRef.current.visible(true)
    if (backBgRef.current)  backBgRef.current.visible(true)
    hidden.forEach(n=>n.visible(true))
    uiRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ====== Desktop LAYERS окно (внутренний компонент)
  const LayersWindow: React.FC = () => {
    const [pos, setPos] = useState({ x: 0, y: 0 })
    useLayoutEffect(() => { setPos({ x: window.innerWidth - 420, y: 140 }) }, [])
    const drag = useRef<{dx:number;dy:number}|null>(null)
    const onDownDrag = (e: React.MouseEvent) => {
      drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      const mv = (ev: MouseEvent) => setPos({ x: ev.clientX - (drag.current?.dx||0), y: ev.clientY - (drag.current?.dy||0) })
      const up = () => { drag.current=null; window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up) }
      window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up)
    }

    return !isMobile && showLayers ? (
      <div className="fixed z-40 w-[360px] border border-black/15 bg-white shadow-xl rounded-none"
           style={{ left: pos.x, top: pos.y }}>
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-2 py-1 text-[10px] tracking-widest">LAYERS</div>
          <button className="px-2 py-1 border-l border-black/10" onMouseDown={onDownDrag}>drag</button>
        </div>
        <div className="p-2 space-y-2">
          {layerItems.map((l)=>(
            <div key={l.id}
                 className={`flex items-center gap-2 border border-black/10 rounded-none px-2 py-2 ${selectedId===l.id?"bg-black/5":"bg-white"}`}
                 draggable
                 onDragStart={(e)=>{ e.dataTransfer.effectAllowed="move" }}
                 onDragOver={(e)=>e.preventDefault()}
                 onDrop={(e)=>{ e.preventDefault(); onLayerSelect(l.id) }}>
              <button className="w-7 h-7 border" onClick={()=>onLayerSelect(l.id)} title="Select">{l.type[0].toUpperCase()}</button>
              <select
                value={l.blend}
                onChange={(e)=>updateMeta(l.id,{ blend: e.target.value as Blend })}
                className="border rounded-none text-[12px]"
              >
                {["source-over","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"].map(b=><option key={b} value={b}>{b}</option>)}
              </select>
              <input type="range" min={0} max={1} step={0.01} value={l.opacity}
                onChange={(e)=>updateMeta(l.id,{ opacity: parseFloat(e.target.value) })}
                className="flex-1 h-[3px] bg-black appearance-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                  [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none" />
              <button className="w-7 h-7 border" onClick={()=>updateMeta(l.id,{ visible: !l.visible })} title={l.visible?"Hide":"Show"}>{l.visible?"👁":"🚫"}</button>
              <button className="w-7 h-7 border" onClick={()=>updateMeta(l.id,{ locked: !l.locked })}  title={l.locked?"Unlock":"Lock"}>{l.locked?"🔓":"🔒"}</button>
              <button className="w-7 h-7 border" onClick={()=>duplicateLayer(l.id)} title="Duplicate">⧉</button>
              <button className="w-7 h-7 border bg-black text-white" onClick={()=>deleteLayer(l.id)} title="Delete">✕</button>
            </div>
          ))}
          {layerItems.length===0 && <div className="text-xs text-black/60">No layers yet.</div>}
        </div>
      </div>
    ) : null
  }

  // ===== Render
  return (
    <div className="fixed inset-0 bg-white"
         style={{ paddingTop: padTop, paddingBottom: padBottom, WebkitUserSelect:"none", userSelect:"none" }}>
      {/* Десктоп: правое окно слоёв */}
      <LayersWindow />

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        {/* touch-action только над Stage, чтобы UI не блокировался */}
        <div style={{ touchAction: "none" }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            <Layer listening={true}>
              {frontMock && <KImage ref={frontBgRef} image={frontMock} width={BASE_W} height={BASE_H} visible={side==="front"} />}
              {backMock  && <KImage ref={backBgRef}  image={backMock}  width={BASE_W} height={BASE_H} visible={side==="back"}  />}
            </Layer>

            <Layer ref={artRef} />

            <Layer ref={uiRef}>
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

      {/* TOOLS: десктоп — плавающее слева; мобилка — 3 полосы + шторка слоёв */}
      <Toolbar
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
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
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() },
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
