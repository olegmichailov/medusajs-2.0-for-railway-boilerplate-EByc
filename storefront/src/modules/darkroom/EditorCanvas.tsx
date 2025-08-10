"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Group, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"
import { useDarkroom, type Blend, type ShapeKind, type Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; raster: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: "image"|"shape"|"text"|"stroke" }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const tRef     = useRef<Konva.Transformer>(null)
  const cropRect = useRef<Konva.Rect>(null)
  const cropTf   = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)

  // безопасный авто-скейл (без SSR падений)
  const [{ viewW, viewH, scale }, setViewport] = useState({ viewW: BASE_W, viewH: BASE_H, scale: 1 })
  useEffect(() => {
    const measure = () => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1200
      const vh = typeof window !== "undefined" ? window.innerHeight : 800
      const sidePanel = !isMobile && showLayers ? 320 : 0
      const maxW = vw - PADDING * 2 - sidePanel
      const maxH = vh - PADDING * 2 - 80
      const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
      setViewport({ viewW: BASE_W * s, viewH: BASE_H * s, scale: s })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [showLayers])

  const visLayers = useMemo(()=> layers.filter(l=>l.side===side && l.meta.visible), [layers, side])

  const findNode = (id: string | null) => id ? layers.find(l=>l.id===id)?.node || null : null

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    if ((node as any).filters) {
      if (meta.raster > 0 && (Konva as any).Filters?.Pixelate) {
        (node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        (node as any).filters([])
      }
    }
    node.getLayer()?.batchDraw()
  }
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false })

  // трансформер: показываем ТОЛЬКО у выбранного и не во время рисования/стирания
  const attachTransformer = () => {
    const node = findNode(selectedId)
    const shouldHide = isDrawing || tool==="brush" || tool==="erase" || isCropping
    if (!node || shouldHide) {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
      return
    }
    tRef.current?.nodes([node])
    ;(node as any).draggable(true)
    tRef.current?.getLayer()?.batchDraw()
  }
  useEffect(()=>{ attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // Upload
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const node = new Konva.Image({ image: img, x: BASE_W/2 - img.width/2, y: BASE_H/2 - img.height/2 })
        node.width(img.width); node.height(img.height)
        ;(node as any).id(uid())
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        const id = (node as any)._id
        setLayers(p=>[...p, { id, side, node, meta, type:"image"}])
        select(id)
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // Text (простая версия, как было)
  const onAddText = () => {
    const node = new Konva.Text({
      text: "Text", x: BASE_W/2-100, y: BASE_H/2-30,
      fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor
    })
    ;(node as any).id(uid())
    const meta = baseMeta("Text")
    applyMeta(node, meta)
    const id = (node as any)._id
    setLayers(p=>[...p, { id, side, node, meta, type:"text"}])
    select(id)
    node.on("dblclick dbltap", ()=> {
      const newText = prompt("Edit text:", (node as Konva.Text).text()) ?? (node as Konva.Text).text()
      ;(node as Konva.Text).text(newText)
      node.getLayer()?.batchDraw()
    })
  }

  // Shapes (как раньше, цвет берём из brushColor)
  const addShape = (kind: ShapeKind) => {
    let node: any
    if (kind==="circle")   node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 180, fill: brushColor })
    if (kind==="square")   node = new Konva.Rect({ x: BASE_W/2-180, y: BASE_H/2-180, width: 360, height:360, fill: brushColor })
    if (kind==="triangle") node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 220, fill: brushColor })
    if (kind==="cross") {
      node = new Konva.Group({ x: BASE_W/2-180, y: BASE_H/2-180 })
      const r1 = new Konva.Rect({ width:360, height:70, y:145, fill: brushColor })
      const r2 = new Konva.Rect({ width:70, height:360, x:145, fill: brushColor })
      node.add(r1); node.add(r2)
    }
    if (kind==="line")     node = new Konva.Line({ points:[BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16 })
    ;(node as any).id(uid())
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    const id = (node as any)._id
    setLayers(p=>[...p, { id, side, node, meta, type:"shape"}])
    select(id)
  }

  // Brush / Erase
  const startStroke = (x:number,y:number) => {
    const line = new Konva.Line({
      points: [x,y],
      stroke: tool==="erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool==="erase" ? "destination-out" : "source-over",
    })
    ;(line as any).id(uid())
    const meta = baseMeta("Stroke")
    const id = (line as any)._id
    setLayers(p=>[...p, { id, side, node: line, meta, type:"stroke"}])
    select(id)
    setIsDrawing(true)
  }
  const appendStroke = (x:number,y:number) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    node.points(node.points().concat([x,y])); node.getLayer()?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // Crop
  const startCrop = () => {
    const node = findNode(selectedId); if (!node) return
    setIsCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRect.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropRect.current?.getLayer()?.batchDraw()
    cropTf.current?.nodes([cropRect.current!])
  }
  const applyCrop = () => {
    const node = findNode(selectedId); const rect = cropRect.current
    if (!node || !rect) { setIsCropping(false); return }
    const s = scale
    const rx = rect.x()/s - node.x()
    const ry = rect.y()/s - node.y()
    const rw = rect.width()/s
    const rh = rect.height()/s
    if (node instanceof Konva.Image) {
      node.crop({ x: rx, y: ry, width: rw, height: rh })
      node.width(rw); node.height(rh)
      node.getLayer()?.batchDraw()
    } else {
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      node.x(0); node.y(0)
      const parent = node.getParent()
      parent?.add(g); node.moveTo(g); g.cache(); g.draw()
    }
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    setIsCropping(false)
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    cropRect.current?.getLayer()?.batchDraw()
  }

  // Export — полный холст, независимо от масштаба
  const exportSide = (s: Side) => {
    const st = stageRef.current; if (!st) return
    const hidden: AnyLayer[] = []
    layers.forEach(l=>{ if (l.side !== s) { l.node.visible(false); hidden.push(l) } })
    const prevScale = st.scaleX()
    st.scale({ x: 1, y: 1 })
    st.draw()
    const data = st.toDataURL({ pixelRatio: 1, mimeType: "image/png" })
    hidden.forEach(l=> l.node.visible(l.meta.visible))
    st.scale({ x: prevScale, y: prevScale })
    st.draw()
    const a = document.createElement("a")
    a.href = data; a.download = `darkroom-${s}.png`; a.click()
  }

  // Pointer
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") startStroke(p.x/scale, p.y/scale)
    else if (tool==="text") onAddText()
    else if (tool==="shape") addShape(shapeKind)
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x/scale, p.y/scale)
  }
  const onUp = () => finishStroke()

  // блокируем скролл при рисовании на мобиле
  useEffect(()=>{
    const prevent = (e: TouchEvent) => { if (tool==="brush"||tool==="erase") e.preventDefault() }
    document.addEventListener("touchmove", prevent, { passive: false })
    return ()=>document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side}
        setSide={(s)=>set({ side: s })}
        tool={tool}
        setTool={(t)=>set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={()=>exportSide("front")}
        onDownloadBack={()=>exportSide("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          {/* мокапы — обычной непрозрачности */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H}/>}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H}/>}
          </Layer>

          <Layer>
            {/* привязываем выбор кликом — без отрисовки содержимого (оно в памяти Konva) */}
            {visLayers.map((l)=>(
              <Group key={l.id} onClick={()=> select(l.id)} onTap={()=> select(l.id)} />
            ))}
            <Transformer
              ref={tRef}
              rotateEnabled
              anchorSize={12}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            {/* Crop overlay */}
            <Rect ref={cropRect} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTf} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
