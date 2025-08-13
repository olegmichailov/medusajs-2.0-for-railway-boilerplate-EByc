"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

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
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)

  // под-стек в drawLayer: images / shapes / strokesRoot (всегда поверх)
  const imagesGRef   = useRef<Konva.Group>(null)
  const shapesGRef   = useRef<Konva.Group>(null)
  const strokesRootRef = useRef<Konva.Group>(null)

  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [mobileOpen, setMobileOpen] = useState(false)

  // ====== размеры и отступ «под кнопку Create» на мобиле ======
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const bottomPad = vw <= 768 ? 140 : 80         // место для кнопки Create
    const topPad    = vw <= 768 ? 20  : 0
    const maxW = vw - (vw <= 768 ? 20 : 440)
    const maxH = vh - bottomPad - topPad
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // блок скролла страницы, чтобы мокап «не ездил»
  useEffect(() => {
    const orig = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = orig }
  }, [])
  useEffect(() => {
    // когда открыта шторка — блокируем «протекание» тач-скролла
    const prevent = (e: TouchEvent) => { if (mobileOpen) e.preventDefault() }
    document.addEventListener("touchmove", prevent, { passive: false })
    return () => document.removeEventListener("touchmove", prevent as any)
  }, [mobileOpen])

  // ====== utils ======
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    try {
      n.opacity(meta.opacity)
      ;(n as any).globalCompositeOperation = meta.blend
    } catch {}
  }

  // ====== Transformer: только когда это уместно ======
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    // в режимах brush/erase — не двигаем объекты
    const canDragNow = !["brush","erase","crop"].includes(tool)
    ;(n as any).draggable(canDragNow)
    trRef.current.nodes([n])
    trRef.current.rotationSnaps([0,90,180,270])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // ====== Strokes session сверху ======
  const ensureStrokesSessionTop = () => {
    const root = strokesRootRef.current
    if (!root) return null
    // последняя группа с нужной стороной
    const last = root.getChildren((c:any) => c.getAttr("dr_side") === side).slice(-1)[0] as Konva.Group | undefined
    if (last && (last as any).children && (last as Konva.Group).getChildren().length === 0) {
      return last
    }
    const g = new Konva.Group({ x: 0, y: 0 })
    g.setAttr("dr_kind", "strokes")
    g.setAttr("dr_side", side)
    ;(g as any).id(uid())
    root.add(g)                 // всегда поверх
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    setLayers(p => [...p, { id, side, node: g, meta, type: "strokes" }])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    drawLayerRef.current?.batchDraw()
    return g
  }

  // ====== Upload image — всегда поверх, сразу select ======
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
        imagesGRef.current?.add(kimg)
        // слушатели
        kimg.on("click tap", () => select(id))
        // поднять картинку над существующим, потом вернуть штрихи в самый верх
        imagesGRef.current?.moveToTop()
        strokesRootRef.current?.moveToTop()
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ====== Text (двойной тап/клик — inline) ======
  const inlineEdit = (t: Konva.Text) => {
    const st = stageRef.current; if (!st) return
    const rect = st.container().getBoundingClientRect()
    const pos = t.getAbsolutePosition(st)
    const area = document.createElement("textarea")
    area.value = t.text()
    Object.assign(area.style, {
      position: "fixed", left: `${rect.left + pos.x * scale}px`,
      top: `${rect.top + (pos.y - t.fontSize()) * scale}px`,
      width: `${Math.max(200, t.width() * scale)}px`,
      fontSize: `${t.fontSize() * scale}px`,
      fontFamily: t.fontFamily(), color: String(t.fill() || "#000"),
      lineHeight: "1.2", border: "1px solid #000", background: "white",
      padding: "2px", margin: "0", zIndex: "9999", resize: "none",
    } as CSSStyleDeclaration)
    document.body.appendChild(area)
    area.focus()
    const commit = () => { t.text(area.value); area.remove(); drawLayerRef.current?.batchDraw() }
    area.addEventListener("keydown", (e) => { if ((e.key==="Enter"&&!e.shiftKey)||e.key==="Escape"){ e.preventDefault(); commit() }})
    area.addEventListener("blur", commit)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-180, y: BASE_H/2-40,
      fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 360, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    shapesGRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => inlineEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ====== Shapes — ТОЛЬКО из интерфейса ======
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    shapesGRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ====== Brush / Erase ======
  const startStroke = (x: number, y: number) => {
    const g = ensureStrokesSessionTop()
    if (!g) return
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    g.add(line)
    setIsDrawing(true)
    // штрихи активны в hit-тесте только во время рисования; иначе — кликаем сквозь них
    strokesRootRef.current?.listening(true)
  }
  const appendStroke = (x: number, y: number) => {
    const root = strokesRootRef.current; if (!root) return
    const last = root.getChildren().slice(-1)[0] as Konva.Group | undefined
    const lastLine = last?.getChildren().slice(-1)[0] as Konva.Line | undefined
    if (!lastLine) return
    lastLine.points(lastLine.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => {
    setIsDrawing(false)
    // после окончания — делаем штрихи «прозрачными» для тапа
    strokesRootRef.current?.listening(false)
  }

  // ====== Crop ======
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st || undefined })
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

  // ====== Pointer routing ======
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    if (isCropping) return
    const tgt = e.target as Konva.Node
    const clickedEmpty = tgt === stageRef.current
    const p = getPos()

    if (tool==="brush" || tool==="erase") {
      startStroke(p.x/scale, p.y/scale)
    } else if (tool==="text") {
      if (clickedEmpty) onAddText()
    } else if (tool==="shape") {
      // создаём только из UI
      return
    }
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // ====== Pinch-zoom & rotate для ВЫБРАННОГО узла на мобиле (в режиме Move) ======
  const gestureRef = useRef<{ dist: number; angle: number; startScaleX: number; startScaleY: number; startRot: number } | null>(null)
  const twoPts = (e: TouchEvent) => {
    const [a,b] = [e.touches[0], e.touches[1]]
    const dx = b.clientX - a.clientX
    const dy = b.clientY - a.clientY
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    return { dist, angle }
  }
  useEffect(() => {
    const container = stageRef.current?.container()
    if (!container) return

    const onTS = (ev: TouchEvent) => {
      if (tool !== "move") return
      if (ev.touches.length === 2) {
        ev.preventDefault()
        const n = node(selectedId) as any
        if (!n) return
        const { dist, angle } = twoPts(ev)
        gestureRef.current = {
          dist, angle,
          startScaleX: n.scaleX?.() ?? 1,
          startScaleY: n.scaleY?.() ?? 1,
          startRot:    n.rotation?.() ?? 0,
        }
      }
    }
    const onTM = (ev: TouchEvent) => {
      if (tool !== "move") return
      if (ev.touches.length === 2 && gestureRef.current) {
        ev.preventDefault()
        const n = node(selectedId) as any
        if (!n) return
        const { dist, angle } = twoPts(ev)
        const k = dist / gestureRef.current.dist
        n.scaleX(gestureRef.current.startScaleX * k)
        n.scaleY(gestureRef.current.startScaleY * k)
        const dA = (angle - gestureRef.current.angle) * 180 / Math.PI
        n.rotation(gestureRef.current.startRot + dA)
        n.getLayer()?.batchDraw()
        attachTransformer()
      }
    }
    const onTE = () => { gestureRef.current = null }

    container.addEventListener("touchstart", onTS, { passive: false })
    container.addEventListener("touchmove", onTM,  { passive: false })
    container.addEventListener("touchend",  onTE)
    container.addEventListener("touchcancel", onTE)
    return () => {
      container.removeEventListener("touchstart", onTS as any)
      container.removeEventListener("touchmove", onTM as any)
      container.removeEventListener("touchend", onTE as any)
      container.removeEventListener("touchcancel", onTE as any)
    }
  }, [tool, selectedId, scale])

  // ====== Панель слоёв (мобильная) ======
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

  const onLayerSelect   = (id: string) => select(id)
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = (src.node as any).clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    ;(src.type === "image" ? imagesGRef : shapesGRef).current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // порядок в мобильных слоях — кнопками вверх/вниз (DnD оставим позже)
  const onReorder = (srcId: string, destId: string, place: "before"|"after") => {
    // можно доработать при необходимости; сейчас UI-панель уже работает на кнопках
  }

  // ====== Selected props (для тулбара) ======
  const sel = find(selectedId)
  const selectedKind: "image"|"shape"|"text"|"strokes"|null = sel?.type ?? null
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

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); drawLayerRef.current?.batchDraw() }
  const setSelectedText       = (t:string)    => { const n = sel?.node as Konva.Text; if (!n) return; n.text(t); drawLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (n:number)    => { const t = sel?.node as Konva.Text; if (!t) return; t.fontSize(n); drawLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const t = sel?.node as Konva.Text; if (!t) return; t.fontFamily(name); drawLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) }
    else if (sel.type === "shape") {
      const n = sel.node as any
      if (n.fill) n.fill(hex)
      else if (n.stroke) n.stroke(hex)
    }
    drawLayerRef.current?.batchDraw()
  }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden" style={{ touchAction: "none" }}>
      <Toolbar
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>{/* опционально */}}
        onDownloadBack={()=>{/* опционально */}}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend: (id, blend)=>updateMeta(id, { blend: blend as Blend }),
          onChangeOpacity: (id, opacity)=>updateMeta(id, { opacity }),
        }}
        selectedKind={selectedKind as any}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          {/* BG */}
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* DRAW (внутри — стек групп; штрихи всегда сверху) */}
          <Layer ref={drawLayerRef}>
            <Group ref={imagesGRef} />
            <Group ref={shapesGRef} />
            <Group ref={strokesRootRef} listening={false} />
          </Layer>

          {/* UI */}
          <Layer ref={uiLayerRef}>
            <Transformer ref={trRef} rotateEnabled anchorSize={10} borderStroke="black" anchorStroke="black" anchorFill="white" />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
