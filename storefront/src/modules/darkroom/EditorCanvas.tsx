"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"
import { isMobile } from "react-device-detect"

/** ---- Константы макета ---- */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

/** Типы слоя */
type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyNode = Konva.Node // (Image | Group | Text | Shape)
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)

  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  /** ---- Размеры: десктоп/мобайл ---- */
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800

    if (isMobile) {
      // место под кнопку Create (56–64px + safe area)
      const reserved = 80
      const maxW = vw - 16
      const maxH = vh - reserved - 16
      const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
      return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
    } else {
      const maxW = vw - 440
      const maxH = vh - 200
      const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
      return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
    }
  }, [showLayers])

  /** Блокируем скролл в мобайл-режиме */
  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  /** Хелперы слоёв/узлов */
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? (layers.find(l => l.id === id) || null) : null
  const node = (id: string | null) => find(id)?.node || null

  /** Показываем только текущую сторону */
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  /** Применение меты к канва-ноде */
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    ;(n as any).opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  /** ---------- Brush-сессии ---------- */
  const brushSessionRef = useRef<{ open: boolean; groupId: string | null }>({ open: false, groupId: null })

  // закрываем сессию при смене инструмента с brush/erase
  useEffect(() => {
    if (tool !== "brush" && tool !== "erase") {
      brushSessionRef.current.open = false
      brushSessionRef.current.groupId = null
    }
  }, [tool])

  const ensureNewStrokesGroupIfNeeded = () => {
    if (tool !== "brush" && tool !== "erase") return null
    // если уже открыта — используем существующую
    if (brushSessionRef.current.open && brushSessionRef.current.groupId) {
      const g = layers.find(l => l.id === brushSessionRef.current.groupId)
      if (g) return g
    }
    // создаём новую strokes-группу СВЕРХУ
    const g = new Konva.Group({ x: 0, y: 0, name: "__strokesGroup" })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    // ставим в самый верх drawLayer
    drawLayerRef.current?.add(g)
    g.moveToTop()

    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))

    brushSessionRef.current.open = true
    brushSessionRef.current.groupId = id
    return newLay
  }

  /** ---------------- Изображения / Текст / Фигуры ---------------- */
  // Upload image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        // Впишем в 90% холста
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        set({ tool: "move" }) // сразу Move, как просил
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // Text
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-360, y: BASE_H/2-72,
      fontSize: 96, fontFamily: "Grebetika, Helvetica, Arial, sans-serif",
      fontStyle: "bold",
      fill: brushColor, width: 720, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // Shapes создаются ТОЛЬКО через UI
  const onAddShape = (kind: ShapeKind) => {
    let n: Konva.Node
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  /** ---------------- Brush / Erase ---------------- */
  const startStroke = (x: number, y: number) => {
    if (tool === "erase") {
      // Стираем ТОЛЬКО у выделенного слоя
      const sel = find(selectedId)
      if (!sel || sel.type === "strokes") return
      // создаём временную группу в drawLayer поверх выделенного, чтобы punch был локальный
      // (упрощённо: линии с destination-out, но мы не трогаем прочие слои, если стираем «над» выделенным)
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      // Добавим линию СРАЗУ над выбранным объектом
      const parent = sel.node.getParent()
      if (!parent) return
      parent.add(line)
      line.moveToTop()
      setIsDrawing(true)
      return
    }

    // Brush: новый strokes-group если нужно
    const gLay = ensureNewStrokesGroupIfNeeded()
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
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
  }

  const appendStroke = (x: number, y: number) => {
    if (tool === "erase") {
      // Последняя линия — в непосредственном родителе выделенного (мы добавили её там)
      const sel = find(selectedId)
      const p = sel?.node.getParent()
      const last = p?.getChildren().at(-1) as Konva.Line | undefined
      if (!last || !(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
      return
    }

    const gLay = brushSessionRef.current.groupId
      ? layers.find(l => l.id === brushSessionRef.current.groupId)
      : null
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  /** ---------------- Crop (оставляем как было — только для Image) ---------------- */
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current
    if (!st) return
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = node(selectedId)
    const r = cropRectRef.current
    if (!n || !(n instanceof Konva.Image) || !r) { cancelCrop(); return }
    const s = scale
    const rx = r.x()/s - n.x(), ry = r.y()/s - n.y()
    const rw = r.width()/s, rh = r.height()/s
    n.crop({ x: rx, y: ry, width: rw, height: rh })
    ;(n as any).width(rw); (n as any).height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  /** ---------------- Reorder слоёв (только внутри текущей стороны) ---------------- */
  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)

      const orderTopToBottom = [...current]
        .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(
        insertAt > orderTopToBottom.length ? orderTopToBottom.length : insertAt,
        0,
        src
      )

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()
      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  /** ---------------- Применение метаданных слоёв ---------------- */
  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  /** ---------------- Выделение и Transformer ---------------- */
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const t = trRef.current
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !t
    if (disabled || lay?.type === "strokes") {
      t?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    // Transformer включён в любом инструменте, кроме активного рисования
    t.nodes([n as any])
    t.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, isDrawing, isCropping])
  // если переключились на инструмент – тоже обновим
  useEffect(() => { attachTransformer() }, [tool])

  /** ---------------- Мобильные жесты (pinch/rotate/pan) ---------------- */
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gestureState = useRef<{
    active: boolean
    center?: { x: number; y: number }
    startDist?: number
    startAngle?: number
    startScale?: { x: number; y: number }
    startRot?: number
    startPos?: { x: number; y: number }
  }>({ active: false })

  const getMid = (p1: {x:number;y:number}, p2:{x:number;y:number}) => ({ x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 })
  const getDist = (p1: {x:number;y:number}, p2:{x:number;y:number}) => Math.hypot(p1.x-p2.x, p1.y-p2.y)
  const getAngle = (p1: {x:number;y:number}, p2:{x:number;y:number}) => Math.atan2(p2.y-p1.y, p2.x-p1.x)

  const onPointerDown = (e: any) => {
    const st = stageRef.current
    if (!st) return
    const pos = st.getPointerPosition()
    if (!pos) return

    // Brush/Eraser: рисуем, ничего не двигаем
    if ((tool === "brush" || tool === "erase") && !isCropping) {
      startStroke(pos.x/scale, pos.y/scale)
      return
    }

    // Move / Shape / Text selection — для мобайла: соберём жест
    const id = (e.evt as PointerEvent).pointerId
    pointers.current.set(id, pos)

    if (pointers.current.size === 1) {
      // пан одним пальцем только в Move
      if (tool === "move") {
        const lay = find(selectedId)
        if (lay && lay.type !== "strokes") {
          gestureState.current.active = true
          gestureState.current.startPos = { x: (lay.node as any).x(), y: (lay.node as any).y() }
        }
      }
    }
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      const lay = find(selectedId)
      if (!lay || lay.type === "strokes") return
      const n = lay.node as any
      gestureState.current.active = true
      gestureState.current.center = getMid(a, b)
      gestureState.current.startDist = getDist(a, b)
      gestureState.current.startAngle = getAngle(a, b)
      gestureState.current.startScale = { x: n.scaleX?.() ?? 1, y: n.scaleY?.() ?? 1 }
      gestureState.current.startRot = n.rotation?.() ?? 0
    }
  }

  const onPointerMove = (e: any) => {
    const st = stageRef.current
    if (!st) return
    const pos = st.getPointerPosition()
    if (!pos) return

    if (isDrawing) {
      appendStroke(pos.x/scale, pos.y/scale)
      return
    }

    const id = (e.evt as PointerEvent).pointerId
    if (pointers.current.has(id)) {
      pointers.current.set(id, pos)
    }

    if (!gestureState.current.active) return

    const lay = find(selectedId)
    if (!lay || lay.type === "strokes") return
    const n = lay.node as any

    if (pointers.current.size === 1 && tool === "move" && gestureState.current.startPos) {
      // pan
      const first = Array.from(pointers.current.values())[0]
      const dx = (first.x - (gestureState.current.center?.x ?? first.x)) / scale
      const dy = (first.y - (gestureState.current.center?.y ?? first.y)) / scale
      n.x(gestureState.current.startPos.x + dx)
      n.y(gestureState.current.startPos.y + dy)
      n.getLayer()?.batchDraw()
      return
    }

    if (pointers.current.size === 2 && gestureState.current.center && gestureState.current.startDist && gestureState.current.startAngle != null && gestureState.current.startScale && gestureState.current.startRot != null) {
      const [p1, p2] = Array.from(pointers.current.values())
      const mid = getMid(p1, p2)
      const dist = getDist(p1, p2)
      const angle = getAngle(p1, p2)

      // масштаб относительно середины пальцев
      const scaleFactor = dist / gestureState.current.startDist
      const sx = gestureState.current.startScale.x * scaleFactor
      const sy = gestureState.current.startScale.y * scaleFactor

      // переводим координаты относительно центра жеста
      const localMid = { x: mid.x/scale, y: mid.y/scale }
      const dx = localMid.x - n.x()
      const dy = localMid.y - n.y()

      n.scaleX(sx); n.scaleY(sy)

      // поворот
      const deltaAngle = (angle - gestureState.current.startAngle) * (180 / Math.PI)
      n.rotation(gestureState.current.startRot + deltaAngle)

      // фиксируем позицию так, чтобы центр жеста оставался около того же места относительно ноды
      n.x(localMid.x - dx)
      n.y(localMid.y - dy)

      n.getLayer()?.batchDraw()
    }
  }

  const onPointerUp = (e: any) => {
    const id = (e.evt as PointerEvent).pointerId
    if (pointers.current.has(id)) {
      pointers.current.delete(id)
    }
    if (isDrawing) {
      finishStroke()
    }
    if (pointers.current.size < 1) {
      gestureState.current = { active: false }
    } else if (pointers.current.size === 1) {
      // остаёмся в пане, центр переопределим на текущий палец
      const first = Array.from(pointers.current.values())[0]
      gestureState.current.center = first
    }
  }

  /** ---------------- Горячие клавиши (десктоп) ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId) as any; if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        // дублирование
        const src = find(selectedId)!; const clone = (src.node as any).clone()
        clone.x(n.x()+20); clone.y(n.y()+20); (clone as any).id(uid())
        drawLayerRef.current?.add(clone)
        const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id); drawLayerRef.current?.batchDraw()
        return
      }
      if (e.key==="Backspace"||e.key==="Delete") {
        setLayers(p=>{ const l=p.find(x=>x.id===selectedId); l?.node.destroy(); return p.filter(x=>x.id!==selectedId) })
        select(null); drawLayerRef.current?.batchDraw(); return
      }
      if (e.key === "ArrowLeft")  { n.x(n.x()-step) }
      if (e.key === "ArrowRight") { n.x(n.x()+step) }
      if (e.key === "ArrowUp")    { n.y(n.y()-step) }
      if (e.key === "ArrowDown")  { n.y(n.y()+step) }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId])

  /** ---------------- Download (mockup + art) ---------------- */
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)

    // 1) with mockup
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) art only
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 350))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  /** ---------------- Маппинг слоёв для панелей ---------------- */
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

  const onLayerSelect   = (id: string) => select(id)
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = (src.node as any).clone()
    clone.x((src.node as any).x()+20); clone.y((src.node as any).y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  /** ---------------- Stage события ---------------- */
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const onDown = (e: any) => {
    if (isCropping) return
    // pointer-версия для мобилки
    if (isMobile) { onPointerDown(e); return }
    const tgt = e.target as Konva.Node
    const clickedEmpty = tgt === stageRef.current

    if (tool==="brush" || tool==="erase") {
      const p = getPos()
      startStroke(p.x/scale, p.y/scale)
    } else if (tool==="text") {
      // текст создаём только из кнопки — здесь ничего
    } else if (tool==="shape") {
      // фигуры создаём только из кнопки — здесь ничего
    }
  }
  const onMove = (e: any) => {
    if (isMobile) { onPointerMove(e); return }
    if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) }
  }
  const onUp   = (e: any) => {
    if (isMobile) { onPointerUp(e); return }
    if (isDrawing) finishStroke()
  }

  /** ---------------- Рендер ---------------- */
  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      {/* DESKTOP: левая панель инструментов + правая панель слоёв */}
      {!isMobile && (
        <>
          <Toolbar
            side={side} setSide={(s: Side)=>set({ side: s })}
            tool={tool} setTool={(t:any)=>set({ tool: t })}
            brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
            brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
            shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
            onUploadImage={onUploadImage}
            onAddText={onAddText}
            onAddShape={onAddShape}
            startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
            onDownloadFront={()=>downloadBoth("front")}
            onDownloadBack={()=>downloadBoth("back")}
            toggleLayers={toggleLayers}
            layersOpen={showLayers}
            selectedKind={find(selectedId)?.type ?? null}
            selectedProps={
              find(selectedId)?.type === "text"  ? {
                text: ((find(selectedId)?.node as any)?.text?.() ?? ""),
                fontSize: ((find(selectedId)?.node as any)?.fontSize?.() ?? 96),
                fontFamily: ((find(selectedId)?.node as any)?.fontFamily?.() ?? "Grebetika, Helvetica, Arial, sans-serif"),
                fill: ((find(selectedId)?.node as any)?.fill?.() ?? brushColor),
              }
              : find(selectedId)?.type === "shape" ? {
                fill: ((find(selectedId)?.node as any)?.fill?.() ?? brushColor),
                stroke: ((find(selectedId)?.node as any)?.stroke?.() ?? "#000000"),
                strokeWidth: ((find(selectedId)?.node as any)?.strokeWidth?.() ?? 0),
              }
              : {}
            }
            setSelectedFill={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.fill) n.fill(hex); n.getLayer()?.batchDraw() }}
            setSelectedStroke={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.stroke) n.stroke(hex); n.getLayer()?.batchDraw() }}
            setSelectedStrokeW={(w:number)=>{ const n = node(selectedId) as any; if (!n) return; if (n.strokeWidth) n.strokeWidth(w); n.getLayer()?.batchDraw() }}
            setSelectedText={(t:string)=>{ const n = node(selectedId) as any; if (!n || !n.text) return; n.text(t); n.getLayer()?.batchDraw() }}
            setSelectedFontSize={(nsize:number)=>{ const n = node(selectedId) as any; if (!n || !n.fontSize) return; n.fontSize(nsize); n.getLayer()?.batchDraw() }}
            setSelectedFontFamily={(name:string)=>{ const n = node(selectedId) as any; if (!n || !n.fontFamily) return; n.fontFamily(name); n.getLayer()?.batchDraw() }}
            setSelectedColor={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.fill) n.fill(hex); else if (n.stroke) n.stroke(hex); n.getLayer()?.batchDraw() }}
            mobileLayers={{
              items: layerItems,
              onSelect: onLayerSelect,
              onToggleVisible,
              onToggleLock,
              onDelete,
              onDuplicate,
              onChangeBlend:(id,blend)=>updateMeta(id,{blend: blend as Blend}),
              onChangeOpacity:(id,op)=>updateMeta(id,{opacity: op}),
              onReorder
            }}
          />
          {showLayers && (
            <LayersPanel
              items={layerItems}
              selectId={selectedId}
              onSelect={onLayerSelect}
              onToggleVisible={onToggleVisible}
              onToggleLock={onToggleLock}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onReorder={onReorder}
              onChangeBlend={(id, blend)=>updateMeta(id, { blend: blend as Blend })}
              onChangeOpacity={(id, opacity)=>updateMeta(id, { opacity })}
            />
          )}
        </>
      )}

      {/* MOBILE: только шторка в Toolbar. Тут ничего лишнего не рендерим. */}
      {isMobile && (
        <Toolbar
          side={side} setSide={(s: Side)=>set({ side: s })}
          tool={tool} setTool={(t:any)=>set({ tool: t })}
          brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
          brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
          shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
          onUploadImage={onUploadImage}
          onAddText={onAddText}
          onAddShape={onAddShape}
          startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
          onDownloadFront={()=>downloadBoth("front")}
          onDownloadBack={()=>downloadBoth("back")}
          toggleLayers={toggleLayers}
          layersOpen={showLayers}
          selectedKind={find(selectedId)?.type ?? null}
          selectedProps={
            find(selectedId)?.type === "text"  ? {
              text: ((find(selectedId)?.node as any)?.text?.() ?? "GMORKL"),
              fontSize: ((find(selectedId)?.node as any)?.fontSize?.() ?? 96),
              fontFamily: ((find(selectedId)?.node as any)?.fontFamily?.() ?? "Grebetika, Helvetica, Arial, sans-serif"),
              fill: ((find(selectedId)?.node as any)?.fill?.() ?? brushColor),
            }
            : find(selectedId)?.type === "shape" ? {
              fill: ((find(selectedId)?.node as any)?.fill?.() ?? brushColor),
              stroke: ((find(selectedId)?.node as any)?.stroke?.() ?? "#000000"),
              strokeWidth: ((find(selectedId)?.node as any)?.strokeWidth?.() ?? 0),
            }
            : {}
          }
          setSelectedFill={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.fill) n.fill(hex); n.getLayer()?.batchDraw() }}
          setSelectedStroke={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.stroke) n.stroke(hex); n.getLayer()?.batchDraw() }}
          setSelectedStrokeW={(w:number)=>{ const n = node(selectedId) as any; if (!n) return; if (n.strokeWidth) n.strokeWidth(w); n.getLayer()?.batchDraw() }}
          setSelectedText={(t:string)=>{ const n = node(selectedId) as any; if (!n || !n.text) return; n.text(t); n.getLayer()?.batchDraw() }}
          setSelectedFontSize={(nsize:number)=>{ const n = node(selectedId) as any; if (!n || !n.fontSize) return; n.fontSize(nsize); n.getLayer()?.batchDraw() }}
          setSelectedFontFamily={(name:string)=>{ const n = node(selectedId) as any; if (!n || !n.fontFamily) return; n.fontFamily(name); n.getLayer()?.batchDraw() }}
          setSelectedColor={(hex:string)=>{ const n = node(selectedId) as any; if (!n) return; if (n.fill) n.fill(hex); else if (n.stroke) n.stroke(hex); n.getLayer()?.batchDraw() }}
          mobileLayers={{
            items: layerItems,
            onSelect: onLayerSelect,
            onToggleVisible,
            onToggleLock,
            onDelete,
            onDuplicate,
            onChangeBlend:(id,blend)=>updateMeta(id,{blend: blend as Blend}),
            onChangeOpacity:(id,op)=>updateMeta(id,{opacity: op}),
            onReorder
          }}
        />
      )}

      {/* Сцена */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          ref={stageRef}
          width={viewW} height={viewH}
          scale={{ x: scale, y: scale }}
          // для iOS жестов
          draggable={false}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          // pointer события (мобайл)
          onPointerDown={isMobile ? onDown : undefined}
          onPointerMove={isMobile ? onMove : undefined}
          onPointerUp={isMobile ? onUp : undefined}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            <Rect
              ref={cropRectRef}
              visible={false}
              stroke="black"
              dash={[6,4]}
              strokeWidth={2}
              draggable
            />
            <Transformer
              ref={cropTfRef}
              rotateEnabled={false}
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
