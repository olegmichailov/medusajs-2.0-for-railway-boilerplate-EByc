"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group, Text as KText } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

// ---- типы уровня сцены ----
type BaseMeta = {
  blend: Blend
  opacity: number
  name: string
  visible: boolean
  locked: boolean
}
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyNode = Konva.Image | Konva.Line | Konva.Shape | Konva.Group | Konva.Text
type AnyLayer = { id: string; side: Side; type: LayerType; node: AnyNode; meta: BaseMeta }

export default function EditorCanvas() {
  const {
    side, set,
    tool, brushColor, brushSize, shapeKind,
    selectedId, select,
    showLayers, toggleLayers,
  } = useDarkroom()

  // mockups
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)
  const trRef        = useRef<Konva.Transformer>(null)

  // crop (оставлено, но не активируем, пока не нужно)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  // состояние
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // текущая brush-сессия (группа Line'ов); пересоздаём только при ВХОДЕ в инструмент Brush
  const brushSessionRef = useRef<null | { id: string; side: Side }>(null)

  // ---- responsive расчёт области рисования ----
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const isMobile = vw < 768
    // сверху держим хедер, снизу — кнопку Create / safe-area
    const topPad = isMobile ? 100 : 80
    const bottomPad = isMobile ? 140 : 40
    const maxW = vw - (isMobile ? 24 : 440)   // справа остаётся место под панель на десктопе
    const maxH = vh - topPad - bottomPad
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // ---- helpers ----
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  const reattachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const t = trRef.current
    if (!t) return

    // трансформер виден ТОЛЬКО в Move и если слой не залочен
    const canTransform = !!n && lay?.meta.locked !== true && tool === "move"
    t.nodes(canTransform ? [n as Konva.Node] : [])
    t.getLayer()?.batchDraw()

    // перетаскивание объектов отключаем при кисти/ластике
    layers.forEach((l) => (l.node as any).draggable(tool === "move" && !l.meta.locked))
    uiLayerRef.current?.batchDraw()
  }

  useEffect(() => { reattachTransformer() }, [selectedId, tool, side, layers.length])

  // показываем только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
  }, [side, layers])

  // ---- BRUSH SESSION: создаётся поверх при каждом ВХОДЕ в brush ----
  useEffect(() => {
    if (tool !== "brush") {
      brushSessionRef.current = null
      return
    }
    // создаём группу один раз на входе в инструмент
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${layers.filter(l=>l.side===side && l.type==="strokes").length + 1}`)
    drawLayerRef.current?.add(g)
    const lay: AnyLayer = { id, side, type: "strokes", node: g, meta }
    setLayers((prev) => [...prev, lay])
    brushSessionRef.current = { id, side }
    // вверх стека
    ;(g as any).zIndex(drawLayerRef.current?.children?.length ?? 0)
    drawLayerRef.current?.batchDraw()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, side])

  // ---- выбор слоя по клику/тачу ----
  const attachSelectHandlers = (n: AnyNode, id: string) => {
    n.on("mousedown touchstart", (e) => {
      // кисть/ластик не должны забирать событие для move-перетаскивания
      if (tool === "brush" || tool === "erase") return
      select(id)
      e.cancelBubble = true
      reattachTransformer()
    })
  }

  // ---- загрузка изображения ----
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({
          image: img,
          x: BASE_W/2 - w/2,
          y: BASE_H/2 - h/2,
          width: w, height: h,
          draggable: tool === "move",
        })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${layers.filter(l=>l.side===side && l.type==="image").length + 1}`)
        drawLayerRef.current?.add(kimg)
        const lay: AnyLayer = { id, side, node: kimg, meta, type: "image" }
        setLayers((prev) => [...prev, lay])
        attachSelectHandlers(kimg, id)
        select(id)
        set({ tool: "move" }) // <- сразу в Move, чтобы крутить/масштабировать пальцами
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ---- текст ----
  const addText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2 - 240, y: BASE_H/2 - 60,
      width: 480, align: "center",
      fontSize: 96,
      fontFamily: "Grebetika, Inter, system-ui, -apple-system, sans-serif",
      fontStyle: "bold",
      fill: brushColor,
      draggable: tool === "move",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta("text")
    drawLayerRef.current?.add(t)
    const lay: AnyLayer = { id, side, type: "text", node: t, meta }
    setLayers((p) => [...p, lay])
    attachSelectHandlers(t, id)
    select(id)
    set({ tool: "move" })
    drawLayerRef.current?.batchDraw()

    // dblclick/tap для инлайн-редактора
    const editInline = () => {
      const st = stageRef.current
      if (!st) return
      const rect = st.container().getBoundingClientRect()
      const pos = t.getAbsolutePosition(st)
      const area = document.createElement("textarea")
      area.value = t.text()
      Object.assign(area.style, {
        position: "fixed",
        left: `${rect.left + pos.x * scale}px`,
        top: `${rect.top + (pos.y - t.fontSize()) * scale}px`,
        width: `${Math.max(200, t.width() * scale)}px`,
        fontSize: `${t.fontSize() * scale}px`,
        fontFamily: t.fontFamily(),
        fontWeight: "700",
        color: String(t.fill() || "#000"),
        lineHeight: "1.2",
        border: "1px solid #000",
        background: "white",
        padding: "2px",
        margin: "0",
        zIndex: "9999",
        resize: "none",
      } as CSSStyleDeclaration)
      document.body.appendChild(area)
      area.focus()
      const commit = () => { t.text(area.value || "GMORKL"); area.remove(); drawLayerRef.current?.batchDraw() }
      area.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") { e.preventDefault(); commit() }
      })
      area.addEventListener("blur", commit)
    }
    t.on("dblclick dbltap", editInline)
  }

  // ---- шейпы (создаются ТОЛЬКО из тулбара) ----
  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor, draggable: tool==="move" })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor, draggable: tool==="move" })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor, draggable: tool==="move" })
    else if (kind === "cross")   { const g = new Konva.Group({ x: BASE_W/2-160, y: BASE_H/2-160, draggable: tool==="move" }); g.add(new Konva.Rect({ width: 320, height: 60, y: 130, fill: brushColor })); g.add(new Konva.Rect({ width: 60, height: 320, x: 130, fill: brushColor })); n = g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round", draggable: tool==="move" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape`)
    drawLayerRef.current?.add(n as any)
    const lay: AnyLayer = { id, side, node: n, meta, type: "shape" }
    setLayers((p) => [...p, lay])
    attachSelectHandlers(n, id)
    select(id)
    set({ tool: "move" })
    drawLayerRef.current?.batchDraw()
  }

  // ---- рисование (Brush) / ластик (Erase на выделенном слое) ----
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      if (!brushSessionRef.current || brushSessionRef.current.side !== side) return
      const gLay = layers.find(l => l.id === brushSessionRef.current!.id)
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
    } else if (tool === "erase") {
      // стираем только выделенный слой
      const n = node(selectedId)
      if (!n) return
      const layer = n.getLayer() || drawLayerRef.current
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      // размещаем линию над выбранным узлом
      layer?.add(line)
      ;(line as any)._erase_for = n._id
      setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const layer = drawLayerRef.current
    // берём последнюю линию — либо в активной brush-группе, либо в слое (ластик)
    let last: Konva.Line | undefined
    if (tool === "brush") {
      const g = drawLayerRef.current?.findOne(`#${brushSessionRef.current?.id}`) as Konva.Group | undefined
      last = g?.getChildren().at(-1) as Konva.Line | undefined
    } else {
      last = layer?.getChildren().filter(n => n instanceof Konva.Line).at(-1) as Konva.Line | undefined
    }
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  // ---- жесты (pinch / rotate) у ВЫДЕЛЕННОГО узла ----
  const gesture = useRef<null | {
    id: string
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
    offsetX: number
    offsetY: number
  }>(null)

  const getTouchPoints = (evt: TouchEvent) => {
    const rect = stageRef.current!.container().getBoundingClientRect()
    const t1 = evt.touches[0], t2 = evt.touches[1]
    const p1 = { x: (t1.clientX - rect.left) / scale, y: (t1.clientY - rect.top) / scale }
    const p2 = { x: (t2.clientX - rect.left) / scale, y: (t2.clientY - rect.top) / scale }
    return { p1, p2, mid: { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 } }
  }

  const dist = (a: {x:number;y:number}, b:{x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y)
  const angle = (a:{x:number;y:number}, b:{x:number;y:number}) => Math.atan2(b.y-a.y, b.x-a.x) * 180/Math.PI

  const onTouchStart = (e: any) => {
    if (tool !== "move") return // жесты только в Move
    const evt: TouchEvent = e.evt
    if (evt.touches.length === 2) {
      const n = node(selectedId)
      if (!n) return
      evt.preventDefault()
      const { p1, p2, mid } = getTouchPoints(evt)
      const a = dist(p1, p2)
      const ang = angle(p1, p2)

      // зафиксируем offset к середине жеста
      const abs = n.getAbsoluteTransform().copy()
      abs.invert()
      const localMid = abs.point(mid)
      n.offsetX(localMid.x - n.x())
      n.offsetY(localMid.y - n.y())

      gesture.current = {
        id: selectedId!,
        startDist: a,
        startAngle: ang,
        startScaleX: (n as any).scaleX?.() ?? 1,
        startScaleY: (n as any).scaleY?.() ?? 1,
        startRotation: n.rotation(),
        offsetX: n.offsetX(),
        offsetY: n.offsetY(),
      }
    }
  }

  const onTouchMove = (e: any) => {
    const evt: TouchEvent = e.evt
    if (gesture.current && evt.touches.length === 2) {
      evt.preventDefault()
      const g = gesture.current
      const n = node(g.id)
      if (!n) return
      const { p1, p2 } = getTouchPoints(evt)
      const a = dist(p1, p2)
      const ang = angle(p1, p2)

      const scaleFactor = a / g.startDist
      const rot = g.startRotation + (ang - g.startAngle)

      ;(n as any).scaleX(g.startScaleX * scaleFactor)
      ;(n as any).scaleY(g.startScaleY * scaleFactor)
      n.rotation(rot)
      n.getLayer()?.batchDraw()
      reattachTransformer()
    } else if (tool === "brush" || tool === "erase") {
      // кисть/ластик — рисуем
      const p = stageRef.current?.getPointerPosition()
      if (!p) return
      appendStroke(p.x/scale, p.y/scale)
    }
  }

  const onTouchEnd = () => { gesture.current = null; finishStroke() }

  // ---- мышь (desktop) ----
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onMouseDown = (e: any) => {
    if (tool === "brush" || tool === "erase") {
      const p = getPos(); startStroke(p.x/scale, p.y/scale)
    }
  }
  const onMouseMove = () => {
    if (isDrawing) {
      const p = getPos(); appendStroke(p.x/scale, p.y/scale)
    }
  }
  const onMouseUp = () => finishStroke()

  // ---- download (mockup + art) ----
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
    await new Promise(r => setTimeout(r, 400))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ---- панель слоёв (тот же формат что и раньше) ----
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id,
        name: l.meta.name,
        type: l.type,
        visible: l.meta.visible,
        locked: l.meta.locked,
        blend: l.meta.blend,
        opacity: l.meta.opacity,
      }))
  }, [layers, side])

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

  const onToggleVisible = (id: string) => {
    const l = layers.find(x => x.id === id)!; updateMeta(id, { visible: !l.meta.visible })
  }
  const onToggleLock = (id: string) => {
    const l = layers.find(x => x.id === id)!; updateMeta(id, { locked: !l.meta.locked }); reattachTransformer()
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
  const onDuplicate = (id: string) => {
    const src = layers.find(l => l.id === id)!; const clone = src.node.clone() as AnyNode
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); attachSelectHandlers(clone, newLay.id); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // простое reorder (вверх/вниз) через панель
  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers(prev => {
      const cur = prev.filter(l => l.side === side)
      const others = prev.filter(l => l.side !== side)

      const orderTop = cur.sort((a,b)=>a.node.zIndex()-b.node.zIndex()).reverse()
      const si = orderTop.findIndex(l=>l.id===srcId)
      const di = orderTop.findIndex(l=>l.id===destId)
      if (si < 0 || di < 0) return prev

      const [src] = orderTop.splice(si,1)
      const insertAt = place === "before" ? di : di+1
      orderTop.splice(Math.min(insertAt, orderTop.length), 0, src)

      const bottomToTop = [...orderTop].reverse()
      bottomToTop.forEach((l, i) => (l.node as any).zIndex(i))
      drawLayerRef.current?.batchDraw()
      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(reattachTransformer)
  }

  // ---- Selected helpers for Toolbar (как было) ----
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel?.type === "text"  ? {
      text: (sel.node as Konva.Text).text(),
      fontSize: (sel.node as Konva.Text).fontSize(),
      fontFamily: (sel.node as Konva.Text).fontFamily(),
      fill: (sel.node as any).fill?.() ?? "#000000",
    }
    : sel?.type === "shape" ? {
      fill: (sel.node as any).fill?.() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { if (!sel) return; if ((sel.node as any).fill) (sel.node as any).fill(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { if (!sel) return; if ((sel.node as any).stroke) (sel.node as any).stroke(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { if (!sel) return; if ((sel.node as any).strokeWidth) (sel.node as any).strokeWidth(w); drawLayerRef.current?.batchDraw() }
  const setSelectedText       = (t:string)    => { const n = sel?.node as Konva.Text; if (!n) return; n.text(t); drawLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (n:number)    => { const t = sel?.node as Konva.Text; if (!t) return; t.fontSize(n); drawLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const t = sel?.node as Konva.Text; if (!t) return; t.fontFamily(name); drawLayerRef.current?.batchDraw() }

  // ---- UI BLOCK: размечаем сцену ----
  useEffect(() => { reattachTransformer() }, [tool])

  // отключаем нативный скролл, когда открыт мобильный шторка-UI (делается в Toolbar),
  // а здесь дополнительно — при двухпальцевых жестах
  useEffect(() => {
    const el = stageRef.current?.container()
    if (!el) return
    el.style.touchAction = "none" // важный фикс для iOS
  }, [])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={addText}
        onAddShape={addShape}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind as any}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id)=>select(id)}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={(id, blend)=>updateMeta(id, { blend: blend as Blend })}
          onChangeOpacity={(id, opacity)=>updateMeta(id, { opacity })}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          // desktop
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          // mobile
          onTouchStart={(e)=>{ 
            if (tool==="brush"||tool==="erase") {
              const p = stageRef.current?.getPointerPosition(); if (!p) return
              startStroke(p.x/scale, p.y/scale)
            }
            onTouchStart(e)
          }}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
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
              ignoreStroke={false}
              enabledAnchors={["top-left","top-center","top-right","middle-left","middle-right","bottom-left","bottom-center","bottom-right"]}
            />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
