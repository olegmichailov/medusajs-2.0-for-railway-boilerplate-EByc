"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"|"eraser"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType; orderKey: number }

const uid = () => Math.random().toString(36).slice(2)

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers, mobileSheetOpen
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
  const [order, setOrder] = useState(0)
  const [textValue, setTextValue] = useState("GMURKUL")

  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false

  // Глобально блокируем прокрутку на мобиле — фиксим экран под мокап
  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [isMobile])

  // Запрещаем нативные жесты браузера поверх канвы
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const c = st.container()
    c.style.touchAction = "none"
    c.style.webkitUserSelect = "none"
    c.style.userSelect = "none"
  }, [])

  // Подгон под экран: мокап занимает экран минус кнопка Create. Открытие шторки НЕ влияет на скейл.
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = isMobile ? 6 : 40
    const padBottom = isMobile ? 96 : 100       // ~высота зоны Create
    const maxW = vw - (isMobile ? 12 : 420)     // на десктопе место под панели
    const maxH = vh - padTop - padBottom
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, typeof window !== "undefined" ? window.innerWidth : 0, typeof window !== "undefined" ? window.innerHeight : 0])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // Показываем только слои активной стороны
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // === Transformer: видим на выбранном слое (кроме strokes/eraser). В кисти — виден, но НЕ интерактивен. ===
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    if (!trRef.current) return

    const show =
      !!n && !lay?.meta.locked && lay?.type !== "strokes" && lay?.type !== "eraser"

    if (!show) {
      trRef.current.nodes([])
      trRef.current.listening(false)
      uiLayerRef.current?.batchDraw()
      return
    }

    // Виден всегда на выбранном слое…
    trRef.current.nodes([n!])
    trRef.current.keepRatio(true)
    trRef.current.rotateEnabled(true)

    // …но интерактивен ТОЛЬКО в Move
    const active = tool === "move" && !isDrawing && !isCropping
    trRef.current.listening(active)

    // Ноды таскаем только в Move
    ;(n as any).draggable(tool === "move")

    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, tool, isDrawing, isCropping])

  // Обновляем zIndex по orderKey
  const ensureTopZ = () => {
    const inSide = layers.filter(l => l.side === side).sort((a,b)=>a.orderKey-b.orderKey)
    inSide.forEach((l, i) => (l.node as any).zIndex(i))
    drawLayerRef.current?.batchDraw()
  }
  const pushLayer = (l: AnyLayer) => {
    setLayers(prev => {
      const next = [...prev, l]
      requestAnimationFrame(ensureTopZ)
      return next
    })
  }

  // === Stroke session: новая при каждом повторном входе в Brush (а в рамках одной сессии — сколько угодно штрихов) ===
  const activeStrokeId = useRef<{ front: string|null; back: string|null }>({ front: null, back: null })
  useEffect(() => {
    if (tool !== "brush") {
      activeStrokeId.current.front = null
      activeStrokeId.current.back = null
    }
  }, [tool])

  const ensureStrokeGroup = () => {
    let current = activeStrokeId.current[side]
    if (current) {
      const lay = layers.find(l => l.id === current)
      if (lay) return lay
    }
    const g = new Konva.Group({ x: 0, y: 0, listening: true })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    const layer: AnyLayer = { id, side, node: g, meta, type: "strokes", orderKey: order + 1 }
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(g)
    pushLayer(layer)
    activeStrokeId.current[side] = id
    return layer
  }

  // === Загрузка изображения (переводим в Move) ===
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.85)/img.width, (BASE_H*0.85)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, draggable: true, visible: true, listening: true })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        const layer: AnyLayer = { id, side, node: kimg, meta, type: "image", orderKey: order + 1 }
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        setOrder(o => o + 1)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        pushLayer(layer)
        select(id)
        set({ tool: "move", mobileSheetOpen: false })
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // === Текст (редактирование через поле в тулбаре) ===
  const onAddText = () => {
    const t = new Konva.Text({
      text: (textValue || "GMURKUL").toUpperCase(),
      x: BASE_W/2-240, y: BASE_H/2-48,
      fontSize: 96,
      fontFamily: "Inter, system-ui, -apple-system, Helvetica, Arial, sans-serif",
      fontStyle: "bold",
      fill: brushColor, width: 480, align: "center",
      draggable: true,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    const layer: AnyLayer = { id, side, node: t, meta, type: "text", orderKey: order + 1 }
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => {
      select(id)
      // на мобиле сразу открываем панель редактирования текста
      set({ tool: "text", mobileSheetOpen: true })
    })
    pushLayer(layer)
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // Связываем поле ввода с выбранным текстовым слоем
  useEffect(() => {
    const lay = find(selectedId)
    if (!lay || lay.type !== "text") return
    if (tool !== "text") return
    const t = lay.node as Konva.Text
    const next = (textValue || "GMURKUL").toUpperCase()
    if (t.text() !== next) {
      t.text(next)
      drawLayerRef.current?.batchDraw()
    }
  }, [textValue, tool, selectedId])

  // === Шейпы только из UI ===
  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 180, fill: brushColor, draggable: true })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-180, y: BASE_H/2-180, width: 360, height: 360, fill: brushColor, draggable: true })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 220, fill: brushColor, draggable: true })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-180,y:BASE_H/2-180, draggable: true}); g.add(new Konva.Rect({width:360,height:70,y:145,fill:brushColor})); g.add(new Konva.Rect({width:70,height:360,x:145,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-220, BASE_H/2, BASE_W/2+220, BASE_H/2], stroke: brushColor, strokeWidth: 18, lineCap: "round", draggable: true })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    const layer: AnyLayer = { id, side, node: n, meta, type: "shape", orderKey: order + 1 }
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    setOrder(o => o + 1)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    pushLayer(layer)
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // === Brush / Erase ===
  const stageToCanvas = (p: {x:number;y:number}) => ({ x: p.x / scale, y: p.y / scale })
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const topLayerAt = (absX: number, absY: number) => {
    const candidates = layers
      .filter(l => l.side === side && l.meta.visible && l.type !== "eraser")
      .sort((a,b)=> b.orderKey - a.orderKey)
    for (const l of candidates) {
      const rect = l.node.getClientRect({ relativeTo: stageRef.current! })
      if (absX >= rect.x && absX <= rect.x+rect.width && absY >= rect.y && absY <= rect.y+rect.height) return l
    }
    return null
  }

  const startStroke = (x: number, y: number) => {
    if (tool === "erase") {
      let targetId = selectedId
      if (!targetId) {
        const top = topLayerAt(getPos().x, getPos().y)
        if (top) targetId = top.id
      }
      if (!targetId) return
      const erId = `eraser:${targetId}`
      let er = layers.find(l => l.id === erId)
      if (!er) {
        const g = new Konva.Group({ x: 0, y: 0, listening: true })
        ;(g as any).id(erId)
        const meta = baseMeta(`eraser for ${targetId}`)
        ;(g as any).globalCompositeOperation = "destination-out"
        const base = layers.find(l => l.id === targetId)!
        const layer: AnyLayer = { id: erId, side, node: g, meta, type: "eraser", orderKey: base.orderKey + 0.1 }
        drawLayerRef.current?.add(g)
        pushLayer(layer)
        er = layer
      }
      const gnode = er.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
      })
      gnode.add(line)
      setIsDrawing(true)
      select(erId)
      return
    }

    const gLay = ensureStrokeGroup()
    const g = gLay.node as Konva.Group
    const line = new Konva.Line({
      points: [x, y],
      stroke: brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
    })
    g.add(line)
    setIsDrawing(true)
    select(gLay.id)
  }

  const appendStroke = (x: number, y: number) => {
    const lay = find(selectedId)
    const group =
      (lay?.type === "strokes" || lay?.type === "eraser")
        ? (lay.node as Konva.Group)
        : null
    if (!group) return
    const last = group.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  // События Stage: в кисти рисуем, ничего не двигаем. В Move — наоборот.
  const onDown = (e: any) => {
    if (isCropping) return
    if (tool==="brush" || tool==="erase") {
      e.evt?.preventDefault?.()
      const p = stageToCanvas(getPos())
      startStroke(p.x, p.y)
    }
  }
  const onMove = () => {
    if (isDrawing) {
      const p = stageToCanvas(getPos())
      appendStroke(p.x, p.y)
    }
  }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // === iOS-style multitouch (pinch + rotate) на выбранном НЕ-stroke слое ===
  const pinch = useRef<{
    id: string
    d0: number
    a0: number
    sx: number
    sy: number
    rot: number
    px: number
    py: number
  } | null>(null)

  useEffect(() => {
    if (!isMobile) return
    const stage = stageRef.current
    if (!stage) return

    const container = stage.container()

    const midway = (t0: Touch, t1: Touch) => ({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 })

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length < 2) return
      const lay = find(selectedId)
      if (!lay || lay.type === "strokes" || lay.type === "eraser") return
      ev.preventDefault()

      const t0 = ev.touches[0], t1 = ev.touches[1]
      const dx = t1.clientX - t0.clientX
      const dy = t1.clientY - t0.clientY
      const d0 = Math.hypot(dx, dy)
      const a0 = Math.atan2(dy, dx)
      const n = lay.node as any

      const mid = midway(t0, t1) // экранные координаты центра жеста
      pinch.current = {
        id: lay.id,
        d0, a0,
        sx: n.scaleX?.() ?? 1,
        sy: n.scaleY?.() ?? 1,
        rot: n.rotation?.() ?? 0,
        px: mid.x,
        py: mid.y,
      }
    }

    const onTouchMove = (ev: TouchEvent) => {
      if (!pinch.current) return
      if (ev.touches.length < 2) return
      ev.preventDefault()
      const lay = find(pinch.current.id); if (!lay) return
      const n = lay.node as any

      const t0 = ev.touches[0], t1 = ev.touches[1]
      const dx = t1.clientX - t0.clientX
      const dy = t1.clientY - t0.clientY
      const d1 = Math.hypot(dx, dy)
      const a1 = Math.atan2(dy, dx)
      const sMul = Math.max(0.2, Math.min(5, d1 / pinch.current.d0))
      const rot = pinch.current.rot + ((a1 - pinch.current.a0) * 180) / Math.PI

      // абсолютный центр жеста
      const Pc = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 }

      // переводим экранные координаты в координаты сцены
      const stageAbs = stage.getPointerPosition() // бесполезно для центра, посчитаем вручную
      // Получим абсолютный трансформ родителя
      const parent = n.getParent()
      const parentAbs = parent.getAbsoluteTransform()
      const parentAbsInv = parentAbs.copy().invert()

      // Точка-пивот в координатах родителя (из экранных в локальные родителя):
      const pivotParent = parentAbsInv.point({ x: Pc.x, y: Pc.y })

      // Сохраняем позицию пивота до трансформа:
      const before = n.getAbsoluteTransform().point({ x: 0, y: 0 })

      // Ставим масштаб/поворот (вокруг pivotParent — компенсируем позицию)
      const sx = pinch.current.sx * sMul
      const sy = pinch.current.sy * sMul
      n.scaleX(sx); n.scaleY(sy)
      n.rotation(rot)

      // После смены scale/rotation посчитаем абсолютную позицию origin ноды
      const after = n.getAbsoluteTransform().point({ x: 0, y: 0 })

      // Нам нужно сдвинуть ноду так, чтобы точка pivotParent осталась под пальцами
      // Разница в абсолютных координатах:
      const dxAbs = Pc.x - (after.x + (pivotParent.x - n.x()) * parentAbs.getMatrix()[0])
      const dyAbs = Pc.y - (after.y + (pivotParent.y - n.y()) * parentAbs.getMatrix()[3])

      // Проще: берём абсолютные координаты pivot сейчас и приводим к Pc
      const absNow = n.getAbsoluteTransform().point({ x: pivotParent.x - n.x(), y: pivotParent.y - n.y() })
      const fixAbs = { x: Pc.x - absNow.x, y: Pc.y - absNow.y }
      const fixLocal = parentAbsInv.point({ x: absNow.x + fixAbs.x, y: absNow.y + fixAbs.y })

      // смещение (разность локальных)
      const deltaLocal = { x: fixLocal.x - pivotParent.x, y: fixLocal.y - pivotParent.y }
      n.x(n.x() + deltaLocal.x)
      n.y(n.y() + deltaLocal.y)

      n.getLayer()?.batchDraw()
    }

    const onTouchEnd = () => { pinch.current = null }

    container.addEventListener("touchstart", onTouchStart, { passive: false })
    container.addEventListener("touchmove",  onTouchMove,  { passive: false })
    container.addEventListener("touchend",   onTouchEnd)
    container.addEventListener("touchcancel",onTouchEnd)
    return () => {
      container.removeEventListener("touchstart", onTouchStart as any)
      container.removeEventListener("touchmove",  onTouchMove as any)
      container.removeEventListener("touchend",   onTouchEnd as any)
      container.removeEventListener("touchcancel",onTouchEnd as any)
    }
  }, [isMobile, selectedId, layers])

  // === Панель слоёв (десктоп) ===
  const layerItems: LayerItem[] = React.useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.orderKey - b.orderKey)
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      ;(l.node as any).opacity(meta.opacity ?? l.meta.opacity)
      ;(l.node as any).globalCompositeOperation = meta.blend ?? l.meta.blend
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id: string) => select(id)
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }) }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = (src.node as any).clone()
    clone.x((src.node as any).x()+20); clone.y((src.node as any).y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type, orderKey: order + 1 }
    setOrder(o=>o+1)
    pushLayer(newLay); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)

      const orderTopToBottom = current
        .sort((a,b)=> a.orderKey - b.orderKey)
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { l.orderKey = i + 1; (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  // === Crop (минимально, чтобы не падало) ===
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current
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
    ;(n as Konva.Image).crop({ x: rx, y: ry, width: rw, height: rh })
    ;(n as Konva.Image).width(rw); (n as Konva.Image).height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  return (
    <div
      className="relative w-screen overflow-hidden"
      style={{ height: "100dvh", overscrollBehavior: "contain" }}
    >
      {/* DESKTOP PANELS */}
      {!isMobile && (
        <>
          <Toolbar
            side={side} setSide={(s)=>set({ side: s })}
            tool={tool} setTool={(t)=>set({ tool: t as Tool })}
            brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
            brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
            textValue={textValue} setTextValue={setTextValue}
            shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
            onUploadImage={onUploadImage}
            onAddText={onAddText}
            onAddShape={addShape}
            startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
            onDownloadFront={()=>{/* optional */}}
            onDownloadBack={()=>{/* optional */}}
            toggleLayers={toggleLayers}
            layersOpen={showLayers}
            isMobile={false}
            mobileOpen={false}
            openMobile={()=>{}}
            closeMobile={()=>{}}
            mobileLayers={{
              items: [],
              onSelect: ()=>{},
              onToggleVisible: ()=>{},
              onToggleLock: ()=>{},
              onDelete: ()=>{},
              onDuplicate: ()=>{},
              onChangeBlend: ()=>{},
              onChangeOpacity: ()=>{},
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
              onChangeBlend={(id, blend)=>updateMeta(id,{ blend: blend as Blend })}
              onChangeOpacity={(id, opacity)=>updateMeta(id,{ opacity })}
            />
          )}
        </>
      )}

      {/* STAGE */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
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
              anchorSize={isMobile ? 16 : 12}
              borderStroke="black" anchorStroke="black" anchorFill="white"
            />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={12} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>

      {/* MOBILE SHEET */}
      {isMobile && (
        <Toolbar
          side={side} setSide={(s)=>set({ side: s })}
          tool={tool} setTool={(t)=>set({ tool: t as Tool })}
          brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
          brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
          textValue={textValue} setTextValue={setTextValue}
          shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
          onUploadImage={onUploadImage}
          onAddText={onAddText}
          onAddShape={addShape}
          startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
          onDownloadFront={()=>{/* optional */}}
          onDownloadBack={()=>{/* optional */}}
          toggleLayers={()=>{}}
          layersOpen={false}
          isMobile
          mobileOpen={mobileSheetOpen}
          openMobile={()=>set({ mobileSheetOpen: true })}
          closeMobile={()=>set({ mobileSheetOpen: false })}
          mobileLayers={{
            items: layerItems,
            onSelect: onLayerSelect,
            onToggleVisible,
            onToggleLock,
            onDelete,
            onDuplicate,
            onChangeBlend: (id, blend)=>updateMeta(id,{ blend: blend as Blend }),
            onChangeOpacity: (id, opacity)=>updateMeta(id,{ opacity }),
          }}
        />
      )}
    </div>
  )
}
