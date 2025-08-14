"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer, Line, Group, Text as KText } from "react-konva"
import Konva from "konva"
import useImage from "use-image"

import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

/* ----------------------
   Constants & Utilities
-----------------------*/

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image" | "shape" | "text" | "strokes"

type BaseMeta = {
  name: string
  blend: Blend
  opacity: number
  visible: boolean
  locked: boolean
}

type AnyLayer = {
  id: string
  side: Side
  node: AnyNode
  type: LayerType
  meta: BaseMeta
}

/** apply meta to konva node */
const applyMeta = (n: AnyNode, meta: BaseMeta) => {
  n.opacity(meta.opacity)
  ;(n as any).globalCompositeOperation = meta.blend
  n.visible(meta.visible)
}

/** center in client rect */
const getNodeCenterInStage = (st: Konva.Stage, node: AnyNode) => {
  const r = node.getClientRect({ relativeTo: st })
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** convert client (DOM) point to stage coordinates */
const clientToStage = (st: Konva.Stage, clientX: number, clientY: number) => {
  const rect = st.container().getBoundingClientRect()
  const pos = {
    x: (clientX - rect.left) / st.scaleX(),
    y: (clientY - rect.top) / st.scaleY(),
  }
  return pos
}

/* ----------------------
   Component
-----------------------*/

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // Mockups
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // Refs
  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)
  const trRef        = useRef<Konva.Transformer>(null)

  // Local state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [isDrawing, setIsDrawing] = useState(false)

  // --- strokes session control: новый strokes-групп каждый раз, когда возвращаемся к кисти
  const lastToolRef = useRef<string | null>(null)
  const needNewStrokeRef = useRef<Record<Side, boolean>>({ front: true, back: true })
  const activeStrokeGroupId = useRef<Record<Side, string | null>>({ front: null, back: null })

  // --- lock scroll on mobile while editor visible
  useEffect(() => {
    const b = document.body
    const prev = b.style.overflow
    b.style.overflow = "hidden"
    return () => { b.style.overflow = prev }
  }, [])

  // --- Brush by default (both desktop & mobile)
  useEffect(() => {
    set({ tool: "brush" })
  }, [set])

  // --- Stage autoscale and fixed layout
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    // запас под хедер и нижнюю кнопку Create
    const SAFE_TOP = 96
    const SAFE_BOTTOM = 120
    const maxW = vw - 24
    const maxH = Math.max(420, vh - SAFE_TOP - SAFE_BOTTOM)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [])

  // Keep stage scale
  useEffect(() => {
    if (!stageRef.current) return
    stageRef.current.scale({ x: scale, y: scale })
    stageRef.current.width(viewW)
    stageRef.current.height(viewH)
    stageRef.current.batchDraw()
  }, [scale, viewW, viewH])

  // --- Helpers to find/select layers
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const nodeOf = (id: string | null) => find(id)?.node || null

  const baseMeta = (name: string): BaseMeta => ({
    name, blend: "source-over", opacity: 1, visible: true, locked: false
  })

  // --- Attach transformer to current selection (but never for strokes)
  const attachTransformer = () => {
    const st = stageRef.current
    if (!st || !trRef.current) return

    const layer = find(selectedId)
    const n = layer?.node

    if (!n || layer?.type === "strokes" || layer?.meta.locked === true) {
      trRef.current.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    // enable dragging only in Move (и только для не-strokes)
    ;(n as any).draggable(tool === "move")

    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, tool])

  // --- Sync visibility on side change
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // --- tool transitions (для stroke сессий)
  useEffect(() => {
    const prev = lastToolRef.current
    if (prev && prev !== "brush" && tool === "brush") {
      needNewStrokeRef.current[side] = true
    }
    if (prev === "brush" && tool !== "brush") {
      // завершаем текущую сессию
      activeStrokeGroupId.current[side] = null
    }
    lastToolRef.current = tool
  }, [tool, side])

  /* ----------------------
     LAYERS — CRUD & ORDER
  -----------------------*/

  const ensureNewStrokesGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0, listening: true })
    ;(g as any).id(uid())
    const id = (g as any)._id

    const meta = baseMeta(`strokes ${seqs.strokes}`)
    const lay: AnyLayer = { id, side, node: g, type: "strokes", meta }

    drawLayerRef.current?.add(g)
    setLayers((p) => [...p, lay])
    setSeqs((s) => ({ ...s, strokes: s.strokes + 1 }))
    activeStrokeGroupId.current[side] = id
    return lay
  }

  const topStrokesGroupForSide = (): AnyLayer | null => {
    // ищем последний strokes текущей стороны
    const current = [...layers].filter(l => l.side === side && l.type === "strokes")
    if (current.length === 0) return null
    // Topmost — с максимальным zIndex
    const sorted = current.sort((a, b) => a.node.zIndex() - b.node.zIndex())
    return sorted[sorted.length - 1]
  }

  const strokeTargetGroup = () => {
    if (needNewStrokeRef.current[side] || !activeStrokeGroupId.current[side]) {
      needNewStrokeRef.current[side] = false
      return ensureNewStrokesGroup()
    }
    // если есть активная — возвращаем её; если нет — создаём
    const id = activeStrokeGroupId.current[side]
    const lay = layers.find(l => l.id === id)
    return lay ?? ensureNewStrokesGroup()
  }

  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const curr = prev.filter(l => l.side === side)
      const others = prev.filter(l => l.side !== side)

      const orderTopToBottom = curr
        .sort((a, b) => a.node.zIndex() - b.node.zIndex())
        .reverse()

      const sIdx = orderTopToBottom.findIndex(l => l.id === srcId)
      const dIdx = orderTopToBottom.findIndex(l => l.id === destId)
      if (sIdx === -1 || dIdx === -1) return prev

      const [src] = orderTopToBottom.splice(sIdx, 1)
      const insertAt = place === "before" ? dIdx : dIdx + 1
      orderTopToBottom.splice(
        Math.min(insertAt, orderTopToBottom.length),
        0,
        src
      )

      // rebuild bottom..top & set zIndex
      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => (l.node as any).zIndex(i))
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })

    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onToggleVisible = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id === id)
      if (!l) return p
      const meta = { ...l.meta, visible: !l.meta.visible }
      applyMeta(l.node, meta)
      return p.map(x => x.id === id ? { ...x, meta } : x)
    })
    drawLayerRef.current?.batchDraw()
  }

  const onToggleLock = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id === id)
      if (!l) return p
      const meta = { ...l.meta, locked: !l.meta.locked }
      return p.map(x => x.id === id ? { ...x, meta } : x)
    })
    attachTransformer()
  }

  const onDuplicate = (id: string) => {
    const l = layers.find(x => x.id === id)
    if (!l) return
    const clone = l.node.clone()
    clone.x(l.node.x() + 20)
    clone.y(l.node.y() + 20)
    ;(clone as any).id(uid())

    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = {
      id: (clone as any)._id,
      node: clone,
      side: l.side,
      type: l.type,
      meta: { ...l.meta, name: `${l.meta.name} copy` }
    }
    setLayers(p => [...p, newLay])
    select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  const onDelete = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id === id)
      l?.node.destroy()
      return p.filter(x => x.id !== id)
    })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }

  const onChangeBlend = (id: string, blend: string) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, blend: blend as Blend }
      applyMeta(l.node, meta)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onChangeOpacity = (id: string, opacity: number) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, opacity }
      applyMeta(l.node, meta)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  /* ----------------------
     CREATE — Image / Text / Shape
  -----------------------*/

  const handleUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W * 0.9) / img.width, (BASE_H * 0.9) / img.height, 1)
        const w = img.width * ratio
        const h = img.height * ratio

        const kimg = new Konva.Image({
          image: img,
          x: BASE_W / 2 - w / 2,
          y: BASE_H / 2 - h / 2,
          width: w,
          height: h,
          listening: true,
        })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id

        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        setLayers(p => [...p, { id, side, node: kimg, type: "image", meta }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))

        // select and switch to Move (UX)
        select(id)
        set({ tool: "move" })

        // clicks select
        kimg.on("click tap", () => select(id))
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const handleAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W / 2 - 300,
      y: BASE_H / 2 - 60,
      width: 600,
      align: "center",
      fontSize: 96,
      fontStyle: "bold",
      fontFamily: "Grebetika, Helvetica, Arial, sans-serif",
      fill: brushColor,
      listening: true,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id

    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    setLayers(p => [...p, { id, side, node: t, type: "text", meta }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))

    t.on("click tap", () => select(id))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  const handleAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle") {
      n = new Konva.Circle({ x: BASE_W / 2, y: BASE_H / 2, radius: 200, fill: brushColor, listening: true })
    } else if (kind === "square") {
      n = new Konva.Rect({ x: BASE_W / 2 - 200, y: BASE_H / 2 - 200, width: 400, height: 400, fill: brushColor, listening: true })
    } else if (kind === "triangle") {
      n = new Konva.RegularPolygon({ x: BASE_W / 2, y: BASE_H / 2, sides: 3, radius: 240, fill: brushColor, listening: true })
    } else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W / 2 - 200, y: BASE_H / 2 - 200, listening: true })
      g.add(new Konva.Rect({ width: 400, height: 60, y: 170, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 400, x: 170, fill: brushColor }))
      n = g
    } else {
      n = new Konva.Line({
        points: [BASE_W / 2 - 200, BASE_H / 2, BASE_W / 2 + 200, BASE_H / 2],
        stroke: brushColor,
        strokeWidth: 16,
        lineCap: "round",
        listening: true
      })
    }

    ;(n as any).id(uid())
    const id = (n as any)._id

    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n)
    setLayers(p => [...p, { id, side, node: n, type: "shape", meta }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))

    ;(n as any).on("click tap", () => select(id))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  /* ----------------------
     BRUSH / ERASE
  -----------------------*/

  const startStroke = (x: number, y: number) => {
    const gLay = strokeTargetGroup()
    const g = gLay.node as Konva.Group

    // линии внутри stroke-group
    const line = new Konva.Line({
      points: [x, y],
      stroke: brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
      listening: false,
    })
    g.add(line)

    // выбрать этот stroke-group (верхний) — но без хэндлов
    select(gLay.id)
    setIsDrawing(true)
  }

  const appendStroke = (x: number, y: number) => {
    const id = activeStrokeGroupId.current[side]
    const gLay = layers.find(l => l.id === id)
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  /* ----------------------
     TOUCH GESTURES (pinch zoom/rotate)
  -----------------------*/

  const gestureRef = useRef<{
    active: boolean
    ids: number[]
    startDist: number
    startAngle: number
    startScale: number
    startRotation: number
    nodeId: string | null
    centerStart: { x: number; y: number }
  }>({
    active: false,
    ids: [],
    startDist: 0,
    startAngle: 0,
    startScale: 1,
    startRotation: 0,
    nodeId: null,
    centerStart: { x: 0, y: 0 },
  })

  const touchStart = (e: any) => {
    if (!stageRef.current) return

    // для кисти — старт рисования по первому касанию
    if (tool === "brush" || tool === "erase") {
      const t = e.evt.touches?.[0]
      if (!t) return
      e.evt.preventDefault()
      const p = clientToStage(stageRef.current, t.clientX, t.clientY)
      startStroke(p.x, p.y)
      return
    }

    // move/shape/text/image — жесты
    if (e.evt.touches && e.evt.touches.length === 2) {
      e.evt.preventDefault()
      const t1 = e.evt.touches[0]
      const t2 = e.evt.touches[1]
      const p1 = clientToStage(stageRef.current, t1.clientX, t1.clientY)
      const p2 = clientToStage(stageRef.current, t2.clientX, t2.clientY)
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

      const node = nodeOf(selectedId)
      if (!node || find(selectedId)?.type === "strokes") return

      // центр между пальцами
      gestureRef.current.active = true
      gestureRef.current.ids = [t1.identifier, t2.identifier]
      gestureRef.current.startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      gestureRef.current.startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      gestureRef.current.startScale = (node as any).scaleX?.() || 1
      gestureRef.current.startRotation = (node as any).rotation?.() || 0
      gestureRef.current.nodeId = selectedId
      gestureRef.current.centerStart = center

      // переносим origin в центр текущего прямоугольника,
      // чтобы трансформации шли вокруг центра
      const st = stageRef.current
      const cr = node.getClientRect({ relativeTo: st })
      ;(node as any).offsetX(cr.width / (2 * st.scaleX()))
      ;(node as any).offsetY(cr.height / (2 * st.scaleY()))
      ;(node as any).x(cr.x / st.scaleX() + cr.width / (2 * st.scaleX()))
      ;(node as any).y(cr.y / st.scaleY() + cr.height / (2 * st.scaleY()))
      attachTransformer()
    }
  }

  const touchMove = (e: any) => {
    if (!stageRef.current) return

    if (tool === "brush" || tool === "erase") {
      const t = e.evt.touches?.[0]
      if (!t) return
      e.evt.preventDefault()
      const p = clientToStage(stageRef.current, t.clientX, t.clientY)
      appendStroke(p.x, p.y)
      return
    }

    if (gestureRef.current.active && e.evt.touches?.length === 2) {
      e.evt.preventDefault()
      const t1 = e.evt.touches[0]
      const t2 = e.evt.touches[1]
      const p1 = clientToStage(stageRef.current, t1.clientX, t1.clientY)
      const p2 = clientToStage(stageRef.current, t2.clientX, t2.clientY)
      const node = nodeOf(gestureRef.current.nodeId)
      if (!node) return

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const scaleK = dist / (gestureRef.current.startDist || 1)
      const rot = gestureRef.current.startRotation + (angle - gestureRef.current.startAngle) * (180 / Math.PI)

      ;(node as any).scale({ x: gestureRef.current.startScale * scaleK, y: gestureRef.current.startScale * scaleK })
      ;(node as any).rotation(rot)

      // держим центр в центре пальцев
      const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      ;(node as any).x(center.x)
      ;(node as any).y(center.y)

      trRef.current?.getLayer()?.batchDraw()
      drawLayerRef.current?.batchDraw()
    }
  }

  const touchEnd = (e: any) => {
    if (!stageRef.current) return
    if (tool === "brush" || tool === "erase") {
      finishStroke()
      return
    }
    if (e.evt.touches?.length < 2) {
      gestureRef.current.active = false
    }
  }

  /* ----------------------
     MOUSE (desktop)
  -----------------------*/

  const mouseDown = (e: any) => {
    if (!stageRef.current) return
    if (tool === "brush" || tool === "erase") {
      const p = stageRef.current.getPointerPosition()
      if (!p) return
      startStroke(p.x / scale, p.y / scale) // pointerPosition уже масштабирован
    }
  }
  const mouseMove = (e: any) => {
    if (!stageRef.current) return
    if (isDrawing) {
      const p = stageRef.current.getPointerPosition()
      if (!p) return
      appendStroke(p.x / scale, p.y / scale)
    }
  }
  const mouseUp = () => { if (isDrawing) finishStroke() }

  /* ----------------------
     DOWNLOAD (mockup + art)
  -----------------------*/
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current
    if (!st) return

    // Скрываем слои другой стороны
    const hidden: AnyNode[] = []
    layers.forEach(l => {
      if (l.side !== s && l.node.visible()) {
        l.node.visible(false); hidden.push(l.node)
      }
    })
    uiLayerRef.current?.visible(false)

    // 1) mockup
    bgLayerRef.current?.visible(true); st.draw()
    const p1 = st.toDataURL({ pixelRatio: Math.max(2, Math.round(1 / scale)) })

    // 2) art only
    bgLayerRef.current?.visible(false); st.draw()
    const p2 = st.toDataURL({ pixelRatio: Math.max(2, Math.round(1 / scale)) })

    // restore
    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a")
    a1.href = p1
    a1.download = `darkroom-${s}_mockup.png`
    a1.click()
    await new Promise(r => setTimeout(r, 400))
    const a2 = document.createElement("a")
    a2.href = p2
    a2.download = `darkroom-${s}_art.png`
    a2.click()
  }

  /* ----------------------
     Layer list for panel
  -----------------------*/
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a, b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id,
        name: l.meta.name,
        type: l.type,
        visible: l.meta.visible,
        locked: l.meta.locked,
        blend: l.meta.blend,
        opacity: l.meta.opacity
      }))
  }, [layers, side])

  /* ----------------------
     Render
  -----------------------*/

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      {/* TOOLBAR */}
      <Toolbar
        side={side} setSide={(s: Side) => set({ side: s })}
        tool={tool} setTool={(t: any) => set({ tool: t })}
        brushColor={brushColor} setBrushColor={(c: string) => set({ brushColor: c })}
        brushSize={brushSize} setBrushSize={(n: number) => set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k: ShapeKind) => set({ shapeKind: k })}
        onUploadImage={handleUploadImage}
        onAddText={handleAddText}
        onAddShape={handleAddShape}
        startCrop={() => { /* crop оставлен на будущее */ }}
        applyCrop={() => {}}
        cancelCrop={() => {}}
        isCropping={false}
        onDownloadFront={() => downloadBoth("front")}
        onDownloadBack={() => downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={{}}
        setSelectedFill={() => {}}
        setSelectedStroke={() => {}}
        setSelectedStrokeW={() => {}}
        setSelectedText={(v: string) => {
          const n = nodeOf(selectedId) as Konva.Text | null
          if (!n) return
          n.text(v)
          drawLayerRef.current?.batchDraw()
        }}
        setSelectedFontSize={(nsize: number) => {
          const n = nodeOf(selectedId) as Konva.Text | null
          if (!n) return
          n.fontSize(nsize)
          drawLayerRef.current?.batchDraw()
        }}
        setSelectedFontFamily={(f: string) => {
          const n = nodeOf(selectedId) as Konva.Text | null
          if (!n) return
          n.fontFamily(f)
          drawLayerRef.current?.batchDraw()
        }}
        setSelectedColor={(hex: string) => {
          const l = find(selectedId)
          if (!l) return
          if (l.type === "text") (l.node as Konva.Text).fill(hex)
          else if (l.type === "shape") {
            const any = l.node as any
            if (any.fill) any.fill(hex)
            else if (any.stroke) any.stroke(hex)
          }
          drawLayerRef.current?.batchDraw()
        }}
        mobileLayers={{
          items: layerItems,
          onSelect: (id: string) => select(id),
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend,
          onChangeOpacity,
        }}
      />

      {/* LAYERS PANEL (desktop float) */}
      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id) => select(id)}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={onChangeBlend}
          onChangeOpacity={onChangeOpacity}
        />
      )}

      {/* CANVAS */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          ref={stageRef}
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          onMouseDown={mouseDown}
          onMouseMove={mouseMove}
          onMouseUp={mouseUp}
          onTouchStart={touchStart}
          onTouchMove={touchMove}
          onTouchEnd={touchEnd}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side === "front" && frontMock && (
              <KImage image={frontMock} width={BASE_W} height={BASE_H} />
            )}
            {side === "back" && backMock && (
              <KImage image={backMock} width={BASE_W} height={BASE_H} />
            )}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef} listening={false}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
              // хэндлы не отображаются для strokes — это контролим в attachTransformer()
            />
            {/* вспомогательный прямоугольник (при необходимости) */}
            <Rect visible={false} />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
