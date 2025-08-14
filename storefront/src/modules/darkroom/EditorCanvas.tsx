"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

// ====== БАЗА (как и было)
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"
const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
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

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // ====== ВЬЮПОРТ/МАСШТАБ (поднял полотно выше на мобилке)
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches

  const { viewW, viewH, scale, canvasYPad } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    // На мобилке оставляем больше места снизу под кнопку Create/шторку
    const bottomUI = isMobile ? 120 : 40
    const topUI = isMobile ? 20 : 40
    const maxW = vw - (isMobile ? 16 : 440)
    const maxH = vh - (topUI + bottomUI)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return {
      viewW: BASE_W * s,
      viewH: BASE_H * s,
      scale: s,
      canvasYPad: topUI
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, showLayers])

  // ====== УТИЛИТЫ СЛОЁВ
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // strokes session: всегда рисуем в ОТДЕЛЬНОЙ группе поверх всех, новая сессия при каждом входе в brush
  const [strokeSessionId, setStrokeSessionId] = useState<string | null>(null)
  const startStrokeSession = () => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${Date.now()}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setStrokeSessionId(id)
    return id
  }

  // при смене инструмента на Brush — открываем новую сессию поверх
  useEffect(() => {
    if (tool === "brush") {
      startStrokeSession()
      // кисть не должна двигать объекты
      stageRef.current?.draggable(false)
    } else if (tool === "move") {
      // двигать сцену/узлы разрешаем только в move (узлы — через draggable на самих нодах)
      stageRef.current?.draggable(false) // сцену не двигаем — фиксируем интерфейс
    } else {
      stageRef.current?.draggable(false)
    }
  }, [tool, side])

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ====== ТРАНСФОРМЕР (ДЕСКТОП): всегда виден у выделенного узла, но drag мышью — только в MOVE
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    if (!trRef.current) return

    if (!n || lay?.meta.locked) {
      trRef.current.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    // тянуть/крутить — всегда через хэндлы (любой tool),
    // перемещать мышью — только в MOVE
    const canDragNode = tool === "move" && !isDrawing
    ;(n as any).draggable(canDragNode)

    trRef.current.nodes([n])
    trRef.current.rotateEnabled(true)
    trRef.current.enabledAnchors([
      "top-left","top-right","bottom-left","bottom-right"
    ])
    trRef.current.keepRatio(false)
    trRef.current.boundBoxFunc((oldB, newB) => {
      // не даём уйти в отрицательные размеры
      if (newB.width < 10 || newB.height < 10) return oldB
      return newB
    })
    uiLayerRef.current?.batchDraw()
  }

  useEffect(() => { attachTransformer() }, [selectedId, tool])

  // ====== СОБЫТИЯ ВЫБОРА / СОЗДАНИЯ
  const selectByTarget = (t: any) => {
    // не выбирать фоновый слой
    if (!t || t === stageRef.current) return
    const id = (t as any)._id
    const hit = layers.find(l => l.id === id)
    if (hit) select(hit.id)
  }

  // загрузка картинки (после загрузки — автоматически в MOVE, чтобы не мазать)
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h, listening: true })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        select(id)
        set({ tool: "move" }) // важно: сразу в Move
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // текст — сразу «GMURKUL» caps + жирный
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMURKUL",
      x: BASE_W/2-240, y: BASE_H/2-60,
      fontSize: 96,
      fontStyle: "bold",
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 480, align: "center",
      listening: true,
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ====== BRUSH / ERASE (кисть не двигает объекты; рисуем в текущую stroke-сессию)
  const startStroke = (x: number, y: number, erase = false) => {
    if (!strokeSessionId) startStrokeSession()
    const gLay = layers.find(l => l.id === strokeSessionId)
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return

    const line = new Konva.Line({
      points: [x, y],
      stroke: erase ? "#000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: erase ? "destination-out" : "source-over",
    })
    g.add(line)
    setIsDrawing(true)
  }
  const appendStroke = (x: number, y: number) => {
    const gLay = layers.find(l => l.id === strokeSessionId)
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // ====== ЖЕСТЫ (МОБИЛКА): pinch-zoom + rotate выбранного узла
  const pinchRef = useRef<{
    id: string | null
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
    active: boolean
  }>({ id: null, startDist: 0, startAngle: 0, startScaleX: 1, startScaleY: 1, startRotation: 0, active: false })

  const getTouches = (e: any) => (e.evt.touches ? e.evt.touches : [])
  const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const angle = (a: Touch, b: Touch) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)

  const onTouchStart = (e: any) => {
    const touches = getTouches(e)
    // два пальца → жест трансформации выбранного узла
    if (touches.length === 2) {
      const sel = node(selectedId)
      if (!sel) return
      pinchRef.current = {
        id: selectedId,
        startDist: distance(touches[0], touches[1]),
        startAngle: angle(touches[0], touches[1]),
        startScaleX: (sel as any).scaleX?.() ?? 1,
        startScaleY: (sel as any).scaleY?.() ?? 1,
        startRotation: (sel as any).rotation?.() ?? 0,
        active: true,
      }
      return
    }

    // один палец → в зависимости от инструмента
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) return
    const x = pos.x / scale
    const y = pos.y / scale

    if (tool === "brush") return startStroke(x, y, false)
    if (tool === "erase") return startStroke(x, y, true)

    if (tool === "move") {
      // Не двигаем сцену; выбор по тапу
      const t = e.target as Konva.Node
      selectByTarget(t)
    }
  }

  const onTouchMove = (e: any) => {
    const touches = getTouches(e)
    if (touches.length === 2 && pinchRef.current.active && pinchRef.current.id === selectedId) {
      const sel = node(selectedId) as any
      if (!sel) return
      const newDist = distance(touches[0], touches[1])
      const newAngle = angle(touches[0], touches[1])

      // масштаб
      const k = newDist / Math.max(1, pinchRef.current.startDist)
      sel.scaleX(pinchRef.current.startScaleX * k)
      sel.scaleY(pinchRef.current.startScaleY * k)

      // поворот
      const dA = (newAngle - pinchRef.current.startAngle) * (180 / Math.PI)
      sel.rotation(pinchRef.current.startRotation + dA)

      sel.getLayer()?.batchDraw()
      attachTransformer()
      return
    }

    if (isDrawing && (tool === "brush" || tool === "erase")) {
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      appendStroke(pos.x / scale, pos.y / scale)
    }
  }

  const onTouchEnd = () => {
    if (pinchRef.current.active) {
      pinchRef.current.active = false
      return
    }
    if (isDrawing) finishStroke()
  }

  // ====== МЫШЬ (ДЕСКТОП)
  const onMouseDown = (e: any) => {
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) return
    const x = pos.x / scale
    const y = pos.y / scale

    if (tool === "brush") return startStroke(x, y, false)
    if (tool === "erase") return startStroke(x, y, true)

    if (tool === "move") {
      const t = e.target as Konva.Node
      selectByTarget(t)
    }
  }
  const onMouseMove = () => {
    if (!isDrawing) return
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) return
    appendStroke(pos.x / scale, pos.y / scale)
  }
  const onMouseUp = () => { if (isDrawing) finishStroke() }

  // ====== ПАНЕЛИ / ЛЕЙЕРЫ
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

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      // blend/opacity
      l.node.opacity(meta.opacity)
      ;(l.node as any).globalCompositeOperation = meta.blend
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id: string) => { select(id); attachTransformer() }
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => {
    setLayers(p => p.map(l => l.id!==id ? l : ({ ...l, meta: { ...l.meta, locked: !l.meta.locked } })))
    attachTransformer()
  }
  const onDelete        = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id); l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId===id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // Пересортировка (top..bottom UI → bottom..top в канве)
  const onReorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)

      const orderTopToBottom = current
        .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend   = (id: string, blend: string) => updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) => updateMeta(id, { opacity })

  // ====== РЕНДЕР
  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden">
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k: ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        // crop оставляем как есть — заработает, когда selection/transform стабильны
        startCrop={()=>{}} applyCrop={()=>{}} cancelCrop={()=>{}} isCropping={false}
        onDownloadFront={()=>{/* оставлено как было у вас */}}
        onDownloadBack={()=>{/* оставлено как было у вас */}}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={null}
        selectedProps={{}}
        setSelectedFill={()=>{}}
        setSelectedStroke={()=>{}}
        setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}}
        setSelectedFontSize={()=>{}}
        setSelectedFontFamily={()=>{}}
        setSelectedColor={()=>{}}
        // mobileLayers — ваш существующий проп, если используете мобильную шторку
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend,
          onChangeOpacity,
        }}
      />

      {showLayers && !isMobile && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={onChangeBlend}
          onChangeOpacity={onChangeOpacity}
        />
      )}

      <div
        className="absolute inset-x-0"
        style={{ top: canvasYPad, bottom: 0 }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <Stage
            ref={stageRef}
            width={viewW}
            height={viewH}
            scale={{ x: scale, y: scale }}
            // мышь
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            // тач
            onTouchStart={onTouchStart}
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
              />
              {/* crop-ui оставлен в вашей версии, чтобы не ломать */}
              <Rect visible={false} />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  )
}
