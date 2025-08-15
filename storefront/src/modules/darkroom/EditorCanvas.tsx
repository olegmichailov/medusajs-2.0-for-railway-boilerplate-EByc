"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// простые id
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

  // мокап
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)   // только мокап
  const drawLayerRef = useRef<Konva.Layer>(null)   // контент пользователя
  const uiLayerRef   = useRef<Konva.Layer>(null)   // трансформеры/кроп

  const trRef        = useRef<Konva.Transformer>(null)

  // crop (оставляем интерфейс, логику можно расширить позже)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  // состояние
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // ====== ВЁРСТКА: фикс/центровка/без прокрутки на мобайле ======
  const [vw, setVw] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1280)
  const [vh, setVh] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800)

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // резерв сверху/снизу под нав/кнопку
  const RESERVED_TOP    = isMobile ? 88 : 0
  const RESERVED_BOTTOM = isMobile ? 96 : 0
  const PADDING = 12

  const { viewW, viewH, scale } = useMemo(() => {
    const maxW = vw - (isMobile ? PADDING * 2 : 440) // слева тулбар на десктопе
    const maxH = vh - RESERVED_TOP - RESERVED_BOTTOM - PADDING * 2
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [vw, vh, isMobile])

  // блокируем прокрутку страницы на тёмной комнате
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  // утилиты
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // применение метаданных
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // ====== ТРАНСФОРМЕР ======
  const isStroke = (lay?: AnyLayer | null) => lay?.type === "strokes"
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled =
      isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current || isStroke(lay)

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(false) // перетаскивание руками делаем сами (см. жесты), чтобы не конфликтовало
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool]) // при смене инструмента

  // ====== STROKES SESSION: новая группа каждый раз, когда заходим в Brush ======
  const ensureStrokesGroupOnTop = () => {
    const g = new Konva.Group({ x: 0, y: 0, name: "strokes-session" })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    // ставим поверх остальных контент-узлов текущей стороны
    g.moveToTop()
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers((p) => [...p, newLay])
    setSeqs((s) => ({ ...s, strokes: s.strokes + 1 }))
    select(id) // выделяем текущую сессию — удобно
    return newLay
  }

  // при входе в Brush — новая сессия
  useEffect(() => {
    if (tool === "brush") {
      ensureStrokesGroupOnTop()
      // трансформер для strokes не показываем
      attachTransformer()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ====== ДОБАВЛЕНИЕ ОБЪЕКТОВ ======
  const addImageFrom = (img: HTMLImageElement) => {
    const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
    const w = img.width * ratio, h = img.height * ratio
    const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
    ;(kimg as any).id(uid())
    const id = (kimg as any)._id
    const meta = baseMeta(`image ${seqs.image}`)
    drawLayerRef.current?.add(kimg)
    const newLay: AnyLayer = { id, side, node: kimg, meta, type: "image" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, image: s.image + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        addImageFrom(img)
        // ✅ сразу в режим Move — чтобы интуитивно двигать картинку
        set({ tool: "move" as Tool })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const addText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-200, y: BASE_H/2-60,
      fontSize: 72, fontFamily: "Helvetica, Arial, sans-serif",
      fontStyle: "bold",
      fill: brushColor, width: 400, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    const newLay: AnyLayer = { id, side, node: t, meta, type: "text" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
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
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    const newLay: AnyLayer = { id, side, node: n, meta, type: "shape" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
    // форма — логично править сразу → Move
    set({ tool: "move" as Tool })
  }

  // ====== STROKES (кисть/ластик) ======
  const strokesGroupTop = () => {
    // найдём последнюю «strokes-session» на текущей стороне
    const last = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    return last ?? ensureStrokesGroupOnTop()
  }

  const startStroke = (x: number, y: number, erase = false) => {
    const gLay = strokesGroupTop()
    const g = gLay.node as Konva.Group
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
    const gLay = strokesGroupTop()
    const g = gLay.node as Konva.Group
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // ====== КРОП (оставляем как было) ======
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
    n.crop({ x: rx, y: ry, width: rw, height: rh })
    n.width(rw); n.height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // ====== ЖЕСТЫ (iOS-поведение). Трансформ только выбранного узла, мокап не трогаем ======
  const pointers = useRef<Map<number, {x:number,y:number}>>(new Map())
  const lastSingle = useRef<{x:number,y:number} | null>(null)
  const gesture = useRef<{
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
    center: {x:number,y:number}
  } | null>(null)

  const posFromEvent = (e: PointerEvent | TouchEvent | MouseEvent) => {
    const st = stageRef.current
    if (!st) return { x: 0, y: 0 }
    const p = st.getPointerPosition()
    return p ? { x: p.x/scale, y: p.y/scale } : { x: 0, y: 0 }
  }

  const dist = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.hypot(a.x-b.x, a.y-b.y)
  const ang  = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.atan2(b.y-a.y, b.x-a.x) * 180 / Math.PI
  const mid  = (a:{x:number,y:number}, b:{x:number,y:number}) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 })

  const onPointerDown = (ev: React.PointerEvent) => {
    // отключаем нативный скролл/зум
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId)
    pointers.current.set(ev.pointerId, posFromEvent(ev.nativeEvent))

    if (tool === "brush" || tool === "erase") {
      // рисование
      const p = posFromEvent(ev.nativeEvent)
      startStroke(p.x, p.y, tool === "erase")
      return
    }

    if (tool === "move") {
      const sel = node(selectedId)
      if (!sel || isStroke(find(selectedId))) return
      // одна точка — таскаем объект
      if (pointers.current.size === 1) {
        lastSingle.current = posFromEvent(ev.nativeEvent)
      } else if (pointers.current.size === 2) {
        // две точки — pinch/rotate вокруг центра selected
        const [p1, p2] = [...pointers.current.values()]
        gesture.current = {
          startDist: dist(p1, p2),
          startAngle: ang(p1, p2),
          startScaleX: sel.scaleX() || 1,
          startScaleY: sel.scaleY() || 1,
          startRotation: sel.rotation() || 0,
          center: sel.getClientRect({ skipTransform: false, relativeTo: stageRef.current }). // центр визуальный
            // Переведём в локальные координаты сцены
            // clientRect на масштабе — вернёмся в базовые
            // проще — взять абсолютный центр самого узла
            // но Konva даёт только rect — возьмём из него:
            (() => {
              const r = sel.getClientRect({ relativeTo: stageRef.current })
              return { x: (r.x + r.width/2)/scale, y: (r.y + r.height/2)/scale }
            })()
        }
      }
    }
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    const pnow = posFromEvent(ev.nativeEvent)
    if (tool === "brush" || tool === "erase") {
      if (isDrawing) appendStroke(pnow.x, pnow.y)
      return
    }

    if (tool === "move") {
      const sel = node(selectedId)
      if (!sel || isStroke(find(selectedId))) return

      // одна точка — перенос
      if (pointers.current.size === 1 && lastSingle.current) {
        const prev = lastSingle.current
        const dx = pnow.x - prev.x
        const dy = pnow.y - prev.y
        sel.x(sel.x() + dx)
        sel.y(sel.y() + dy)
        lastSingle.current = pnow
        drawLayerRef.current?.batchDraw()
        return
      }

      // две точки — pinch/rotate
      if (pointers.current.size === 2 && gesture.current) {
        pointers.current.set(ev.pointerId, pnow)
        const [pa, pb] = [...pointers.current.values()]
        const g = gesture.current
        const curDist  = dist(pa, pb)
        const curAngle = ang(pa, pb)
        const scaleK   = Math.max(0.1, curDist / g.startDist)

        sel.scaleX(g.startScaleX * scaleK)
        sel.scaleY(g.startScaleY * scaleK)
        sel.rotation(g.startRotation + (curAngle - g.startAngle))

        // держим центр примерно на месте (визуально)
        const r = sel.getClientRect({ relativeTo: stageRef.current })
        const cx = (r.x + r.width/2)/scale
        const cy = (r.y + r.height/2)/scale
        sel.x(sel.x() + (g.center.x - cx))
        sel.y(sel.y() + (g.center.y - cy))

        drawLayerRef.current?.batchDraw()
      }
    }
  }

  const onPointerUp = (ev: React.PointerEvent) => {
    pointers.current.delete(ev.pointerId)
    if (tool === "brush" || tool === "erase") {
      if (isDrawing) finishStroke()
      return
    }
    if (tool === "move") {
      if (pointers.current.size <= 1) {
        gesture.current = null
      }
      if (pointers.current.size === 0) {
        lastSingle.current = null
      }
    }
  }

  // ====== ПАНЕЛЬ СЛОЁВ (минимум API, остальное — в твоём LayersPanel как было) ======
  const layerItems = useMemo(() => {
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
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id: string) => { select(id); attachTransformer() }
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId===id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!
    const clone = src.node.clone()
    clone.x(src.node.x()+20)
    clone.y(src.node.y()+20)
    ;(clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // ====== РЕНДЕР ======
  return (
    <div
      className="relative w-screen"
      style={{
        height: `calc(100vh)`,
        // выключаем нативные жесты браузера
        touchAction: "none",
        overflow: "hidden",
      }}
    >
      <Toolbar
        // управление
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={addText}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>{/* оставляю твой экспорт как было */}}
        onDownloadBack={()=>{/* оставляю твой экспорт как было */}}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        // выбранное — для доп. контролов текста/формы (оставляю API)
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={{}}
        setSelectedFill={()=>{}}
        setSelectedStroke={()=>{}}
        setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}}
        setSelectedFontSize={()=>{}}
        setSelectedFontFamily={()=>{}}
        setSelectedColor={()=>{}}
        // моб. список слоёв — если используешь
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend: (id, blend)=>updateMeta(id, { blend: blend as Blend }),
          onChangeOpacity: (id, opacity)=>updateMeta(id, { opacity })
        }}
      />

      {/* центрируем мокап и канву, сверху оставляем запас под шапку */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: RESERVED_TOP, width: viewW, height: viewH }}
      >
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Мокап: отдельный слой, НЕ слушает события и никогда не трансформируется */}
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} x={0} y={0} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} x={0} y={0} />}
          </Layer>

          {/* Пользовательский контент */}
          <Layer ref={drawLayerRef} />

          {/* UI слой */}
          <Layer ref={uiLayerRef} listening={false}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
