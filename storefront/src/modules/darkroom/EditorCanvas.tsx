"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"
import { isMobile } from "react-device-detect"

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

  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // Текущая сессия кисти по сторонам (Procreate-подобная логика)
  const [activeStrokeSession, setActiveStrokeSession] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  })

  // фикс высоты на iOS
  useEffect(() => {
    const setVh = () => document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`)
    setVh()
    window.addEventListener("resize", setVh)
    window.addEventListener("orientationchange", setVh)
    return () => {
      window.removeEventListener("resize", setVh)
      window.removeEventListener("orientationchange", setVh)
    }
  }, [])

  // авто-скейл и отступ под кнопку
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vhCss = typeof window !== "undefined"
      ? Number(getComputedStyle(document.documentElement).getPropertyValue("--app-vh").replace("px","")) || window.innerHeight
      : 800
    const sidePanelsW = 520
    const bottomReserve = isMobile ? 140 : 40
    const maxW = Math.max(320, (vw - (isMobile ? 0 : sidePanelsW)))
    const maxH = Math.max(320, (vhCss - bottomReserve))
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [isMobile])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // Трансформер: у кисти/ластика не показываем хэндлы. Для остальных — всегда.
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    if (!trRef.current || !n || lay?.meta.locked || isCropping) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    if (tool === "brush" || tool === "erase") {
      trRef.current.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(true)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isCropping])

  // ------ BRUSH / ERASER: сессионные strokes-слои (как в Procreate) ------
  const ensureStrokeSession = (): { group: Konva.Group; id: string } => {
    const key = side === "front" ? "front" : "back"
    const currentId = activeStrokeSession[key]
    if (currentId) {
      const g = layers.find(l => l.id === currentId)?.node as Konva.Group | undefined
      if (g) return { group: g, id: currentId }
    }

    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))

    // кладём сверху
    const maxZ = Math.max(...drawLayerRef.current!.getChildren().map(c => c.zIndex()))
    g.zIndex(maxZ)

    setActiveStrokeSession(prev => ({ ...prev, [key]: id }))
    return { group: g, id }
  }

  // при смене инструмента с кисти на любой другой — закрываем сессию
  useEffect(() => {
    if (tool === "brush" || tool === "erase") return
    setActiveStrokeSession(prev => ({ ...prev, [side]: null }))
  }, [tool, side])

  const startStroke = (x: number, y: number) => {
    const { group } = ensureStrokeSession()
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    group.add(line)
    setIsDrawing(true)
  }

  const appendStroke = (x: number, y: number) => {
    const key = side === "front" ? "front" : "back"
    const sessionId = activeStrokeSession[key]
    if (!sessionId) return
    const g = layers.find(l => l.id === sessionId)?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    g.getLayer()?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)
  // ----------------------------------------------------------------------

  // upload image
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
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // text
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
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => inlineEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // shapes — создаём ТОЛЬКО из интерфейса
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
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // crop (только для изображений)
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

  // экспорт (2 файла)
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    uiLayerRef.current?.visible(false)
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
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

  // жесты pinch/rotate для выбранного узла (кроме кисти/ластика)
  const gesture = useRef<null | {
    id: string
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
  }>(null)

  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const onDown = (e: any) => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") {
      startStroke(p.x/scale, p.y/scale)
    }
  }
  const onMove = () => {
    if (isDrawing) {
      const p = getPos()
      appendStroke(p.x/scale, p.y/scale)
    }
  }
  const onUp   = () => { if (isDrawing) finishStroke() }

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const allow = tool !== "brush" && tool !== "erase"

    const onTouchStart = (ev: any) => {
      if (!allow || !selectedId) return
      const n = node(selectedId) as any
      if (!n) return
      if (ev.evt.touches?.length === 2) {
        const [t1, t2] = ev.evt.touches
        const dx = (t2.clientX - t1.clientX)
        const dy = (t2.clientY - t1.clientY)
        const dist = Math.hypot(dx, dy)
        const angle = Math.atan2(dy, dx)
        gesture.current = {
          id: selectedId,
          startDist: dist,
          startAngle: angle,
          startScaleX: n.scaleX?.() ?? 1,
          startScaleY: n.scaleY?.() ?? 1,
          startRotation: n.rotation?.() ?? 0,
        }
      }
    }
    const onTouchMove = (ev: any) => {
      if (!allow) return
      const g = gesture.current
      if (!g || !selectedId) return
      if (ev.evt.touches?.length !== 2) return
      const n = node(selectedId) as any
      if (!n) return
      const [t1, t2] = ev.evt.touches
      const dx = (t2.clientX - t1.clientX)
      const dy = (t2.clientY - t1.clientY)
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)

      const scaleMul = dist / g.startDist
      n.scaleX(g.startScaleX * scaleMul)
      n.scaleY(g.startScaleY * scaleMul)
      n.rotation(g.startRotation + (angle - g.startAngle) * (180/Math.PI))
      n.getLayer()?.batchDraw()
      ev.evt.preventDefault()
    }
    const onTouchEnd = () => { gesture.current = null }

    st.on("touchstart", onTouchStart)
    st.on("touchmove",  onTouchMove)
    st.on("touchend",   onTouchEnd)
    return () => {
      st.off("touchstart", onTouchStart)
      st.off("touchmove",  onTouchMove)
      st.off("touchend",   onTouchEnd)
    }
  }, [selectedId, tool])

  // список слоёв
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

  // meta
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
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // REORDER (desktop DnD)
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

  // мобильные стрелки (резерв на случай, если DnD не сработает)
  const moveUp = (id: string) => {
    const list = layerItems
    const idx = list.findIndex(l => l.id === id)
    if (idx <= 0) return
    onReorder(id, list[idx-1].id, "before")
  }
  const moveDown = (id: string) => {
    const list = layerItems
    const idx = list.findIndex(l => l.id === id)
    if (idx === -1 || idx === list.length-1) return
    onReorder(id, list[idx+1].id, "after")
  }

  const onEmptyPointerDown = (e: any) => {
    if (e.target === stageRef.current) select(null)
  }

  return (
    <div className="relative w-screen overflow-hidden" style={{ height: "calc(var(--app-vh, 100vh) - 80px)" }}>
      <Toolbar
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={{}}
        setSelectedFill={()=>{}} setSelectedStroke={()=>{}} setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}} setSelectedFontSize={()=>{}} setSelectedFontFamily={()=>{}} setSelectedColor={()=>{}}
        mobileLayers={{
          items: layerItems.map(l => ({
            id: l.id, name: l.name, type: l.type as any,
            visible: l.visible, locked: l.locked, blend: l.blend, opacity: l.opacity
          })),
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend: (id, b)=>updateMeta(id, { blend: b as Blend }),
          onChangeOpacity: (id, o)=>updateMeta(id, { opacity: o }),
          onReorder, // drag-n-drop
          onMoveUp: moveUp,
          onMoveDown: moveDown,
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
          onChangeBlend={(id, blend)=>updateMeta(id, { blend: blend as Blend })}
          onChangeOpacity={(id, opacity)=>updateMeta(id, { opacity })}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          onPointerDown={onEmptyPointerDown}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer ref={drawLayerRef} />

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
