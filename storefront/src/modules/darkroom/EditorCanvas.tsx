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

  // ——— Mobile viewport lock (чтобы не «дрожал» экран) ———
  const [vh, setVh] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 800)
  useEffect(() => {
    if (!isMobile) return
    const onResize = () => setVh(window.innerHeight)
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    // на всякий — один тик после открытий/клавы
    const t = setTimeout(onResize, 50)
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize) }
  }, [])

  // ——— Autoscale: десктоп учитывает панель; мобилка — почти весь экран с учётом нижней кнопки ———
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vhRaw = typeof window !== "undefined" ? window.innerHeight : 800
    const realVH = isMobile ? (vh || vhRaw) : vhRaw

    if (isMobile) {
      const bottomBar = 64           // высота кнопки Create + отступы
      const safe = 8                 // небольшой верх/низ запас
      const maxW = vw - 8*2
      const maxH = realVH - bottomBar - safe*2
      const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
      return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
    } else {
      const maxW = vw - 440          // как было, под десктопные панели
      const maxH = vhRaw - 200
      const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
      return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
    }
  }, [showLayers, vh])

  // На мобилке стартуем без Layers-панели (она встроена в шторку)
  useEffect(() => {
    if (isMobile) {
      // спрятать отдельную панель слоёв
      if (showLayers) toggleLayers()
      // запрет системного скролла фона при рисовании
      document.documentElement.classList.add("overflow-hidden", "touch-manipulation")
      return () => {
        document.documentElement.classList.remove("overflow-hidden", "touch-manipulation")
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // show only current side
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // transformer/move
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    const canDragNow = !["brush","erase","crop"].includes(tool)
    ;(n as any).draggable(canDragNow)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // hotkeys (desktop only — на мобилке клавы нет)
  useEffect(() => {
    if (isMobile) return
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        e.preventDefault()
        const src = find(selectedId)!; const clone = src.node.clone()
        clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
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

  // strokes group (per side)
  const ensureStrokesGroup = () => {
    const exist = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    if (exist) return exist
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    return newLay
  }

  // image upload
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

  // text (dblclick inline — на мобилке используем одно нажатие)
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
    t.on(isMobile ? "tap" : "dblclick dbltap", () => inlineEdit(t))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // shapes (создаются только по пустому клику)
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

  // brush / erase
  const startStroke = (x: number, y: number) => {
    const gLay = ensureStrokesGroup()
    const g = gLay.node as Konva.Group
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
  }
  const appendStroke = (x: number, y: number) => {
    const gLay = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // crop (images only)
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

  // export
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

  // pointer routing
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
      if (clickedEmpty) addShape(shapeKind)
    }
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // panel items
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

  // meta updates
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
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // REORDER (оставляем как было; в мобилке reorder через шторку отключён для простоты)
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
      orderTopToBottom.splice(insertAt > orderTopToBottom.length ? orderTopToBottom.length : insertAt, 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { ;(l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })

    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend   = (id: string, blend: string) => updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) => updateMeta(id, { opacity })

  return (
    <div
      className="relative w-screen overflow-hidden"
      style={{ height: isMobile ? `${vh}px` : "calc(100vh - 80px)" }}
    >
      <Toolbar
        // базовые
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
        selectedKind={find(selectedId)?.type ?? null as any}
        selectedProps={
          (find(selectedId)?.type === "text"
            ? { text:(find(selectedId)?.node as any)?.text?.(), fontSize:(find(selectedId)?.node as any)?.fontSize?.(), fontFamily:(find(selectedId)?.node as any)?.fontFamily?.(), fill:(find(selectedId)?.node as any)?.fill?.() ?? "#000000" }
            : find(selectedId)?.type === "shape"
              ? { fill:(find(selectedId)?.node as any)?.fill?.() ?? "#000000", stroke:(find(selectedId)?.node as any)?.stroke?.() ?? "#000000", strokeWidth:(find(selectedId)?.node as any)?.strokeWidth?.() ?? 0 }
              : {}
          )
        }
        setSelectedFill={(hex:string)=>{ const sel=find(selectedId); if (!sel) return; if ((sel.node as any).fill) (sel.node as any).fill(hex); drawLayerRef.current?.batchDraw() }}
        setSelectedStroke={(hex:string)=>{ const sel=find(selectedId); if (!sel) return; if ((sel.node as any).stroke) (sel.node as any).stroke(hex); drawLayerRef.current?.batchDraw() }}
        setSelectedStrokeW={(w:number)=>{ const sel=find(selectedId); if (!sel) return; if ((sel.node as any).strokeWidth) (sel.node as any).strokeWidth(w); drawLayerRef.current?.batchDraw() }}
        setSelectedText={(t:string)=>{ const n=find(selectedId)?.node as Konva.Text; if (!n) return; n.text(t); drawLayerRef.current?.batchDraw() }}
        setSelectedFontSize={(n:number)=>{ const t=find(selectedId)?.node as Konva.Text; if (!t) return; t.fontSize(n); drawLayerRef.current?.batchDraw() }}
        setSelectedFontFamily={(name:string)=>{ const t=find(selectedId)?.node as Konva.Text; if (!t) return; t.fontFamily(name); drawLayerRef.current?.batchDraw() }}
        setSelectedColor={(hex:string)=>{ const sel=find(selectedId); if (!sel) return; if (sel.type==="text") (sel.node as any).fill(hex); else if (sel.type==="shape"){ if ((sel.node as any).fill) (sel.node as any).fill(hex); else if ((sel.node as any).stroke) (sel.node as any).stroke(hex)}; drawLayerRef.current?.batchDraw() }}
        // — мобильный список слоёв внутри шторки —
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

      {/* Отдельная панель слоёв — только ДЕСКТОП */}
      {!isMobile && showLayers && (
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
            <Transformer ref={trRef} rotateEnabled anchorSize={10} borderStroke="black" anchorStroke="black" anchorFill="white" />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
