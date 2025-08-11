"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { useDarkroom, ShapeKind, Side } from "./store"
import LayersPanel from "./LayersPanel"
import Toolbar from "./Toolbar"
import { saveState, loadState } from "./persistence"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type Meta = {
  name: string
  blend: GlobalCompositeOperation
  opacity: number
  visible: boolean
  locked: boolean
}
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type Entry = { id:string; side:Side; type:"image"|"shape"|"text"|"strokes"; node:AnyNode; meta:Meta }

export default function EditorCanvas() {
  const { side, set, tool, shapeKind, brushColor, brushSize, selectedId, select,
          fontFamily, fontSize } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const workRef  = useRef<Konva.Layer>(null)
  const tRef     = useRef<Konva.Transformer>(null)

  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTfRef   = useRef<Konva.Transformer>(null)

  const [list, setList] = useState<Entry[]>(() => loadState<Entry[]>([]))
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStrokesId, setCurrentStrokesId] = useState<string|null>(null)

  // autosave
  useEffect(()=>{ saveState(list) }, [list])

  // resize/scale
  const { vw, vh, scale } = useMemo(()=>{
    const W = typeof window!=="undefined" ? window.innerWidth : 1280
    const H = typeof window!=="undefined" ? window.innerHeight: 800
    const s = Math.min((W-420)/BASE_W, (H-160)/BASE_H) // отступы под панели
    return { vw: BASE_W*s, vh: BASE_H*s, scale: s }
  }, [])

  // show only current side
  useEffect(()=>{
    list.forEach(l=> l.node.visible(l.side===side && l.meta.visible))
    workRef.current?.batchDraw()
  }, [side, list])

  // transformer attach
  useEffect(()=>{
    const entry = list.find(l=>l.id===selectedId)
    if (!entry || entry.meta.locked || entry.type==="strokes" || tool==="brush" || tool==="erase") {
      tRef.current?.nodes([])
      workRef.current?.batchDraw()
      return
    }
    entry.node.draggable(true)
    tRef.current?.nodes([entry.node])
    workRef.current?.batchDraw()
  }, [selectedId, list, tool])

  // ——— helpers
  const addEntry = (e:Entry) => {
    setList(p=>[...p, e])
    select(e.id)
    workRef.current?.add(e.node as any)
    workRef.current?.batchDraw()
  }
  const metaFor = (name:string):Meta => ({ name, blend:"source-over", opacity:1, visible:true, locked:false })
  const find = (id:string|null)=> id ? list.find(l=>l.id===id) || null : null

  // ——— Upload image
  const onUploadImage = (file:File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const node = new Konva.Image({
          image: img,
          x: BASE_W/2 - img.width/2,
          y: BASE_H/2 - img.height/2
        })
        node.width(img.width); node.height(img.height)
        ;(node as any).id(uid())
        node.on("click tap",()=>select((node as any)._id))
        addEntry({ id:(node as any)._id, side, type:"image", node, meta: metaFor("image") })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ——— Text
  const onAddText = () => {
    const node = new Konva.Text({
      text: (document.getElementById("darkroom-text-input") as HTMLInputElement | null)?.value || "Your text",
      x: BASE_W/2-120, y: BASE_H/2-24,
      fontSize: fontSize, fontFamily, fill: brushColor
    })
    ;(node as any).id(uid())
    node.on("click tap",()=>select((node as any)._id))
    addEntry({ id:(node as any)._id, side, type:"text", node, meta: metaFor("text") })
  }

  // ——— Shapes (один клик = один объект, без спама)
  const addShape = (kind:ShapeKind) => {
    let node: AnyNode
    if (kind==="circle") node = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind==="square") node = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width:320, height:320, fill: brushColor })
    else if (kind==="triangle") node = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides:3, radius:200, fill: brushColor })
    else if (kind==="line") node = new Konva.Line({ points:[BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 12 })
    else if (kind==="cross") {
      const g = new Konva.Group({ x: BASE_W/2-160, y: BASE_H/2-160 })
      g.add(new Konva.Rect({ width:320, height:60, y:130, fill: brushColor }))
      g.add(new Konva.Rect({ width:60, height:320, x:130, fill: brushColor }))
      node = g
    }
    else if (kind==="star") node = new Konva.Star({ x:BASE_W/2, y:BASE_H/2, numPoints:5, innerRadius:90, outerRadius:180, fill:brushColor })
    else node = new Konva.Path({ data:"M256 464c-88-48-160-120-160-208a160 160 0 11320 0c0 88-72 160-160 208z", // heart
                                 x: BASE_W/2-160, y: BASE_H/2-160, scaleX:0.5, scaleY:0.5, fill: brushColor })
    ;(node as any).id(uid())
    ;(node as any).on("click tap",()=>select((node as any)._id))
    addEntry({ id:(node as any)._id, side, type:"shape", node, meta: metaFor("shape") })
  }

  // ——— Brush / Erase (группировка в слой strokes N)
  const ensureStrokesLayer = () => {
    if (currentStrokesId) return currentStrokesId
    const g = new Konva.Group()
    ;(g as any).id(uid())
    addEntry({ id:(g as any)._id, side, type:"strokes", node:g, meta: metaFor("strokes") })
    setCurrentStrokesId((g as any)._id)
    return (g as any)._id
  }

  const startStroke = (x:number,y:number) => {
    const hostId = ensureStrokesLayer()
    const host = find(hostId)?.node as Konva.Group
    const line = new Konva.Line({
      points:[x,y],
      stroke: tool==="erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap:"round", lineJoin:"round",
      globalCompositeOperation: tool==="erase" ? "destination-out" : "source-over"
    })
    host.add(line)
    setIsDrawing(true)
  }
  const appendStroke = (x:number,y:number) => {
    const hostId = currentStrokesId
    if (!hostId) return
    const host = find(hostId)?.node as Konva.Group
    const last = host?.getChildren().slice(-1)[0] as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x,y]))
    workRef.current?.batchDraw()
  }
  const stopStroke = () => { setIsDrawing(false) }

  // при смене инструмента от Brush/Erase — закрываем текущую группу
  useEffect(()=>{
    if (tool!=="brush" && tool!=="erase") setCurrentStrokesId(null)
  }, [tool])

  // ——— Crop
  const [isCropping, setIsCropping] = useState(false)
  const startCrop = () => {
    const entry = find(selectedId); if (!entry) return
    const st = stageRef.current!
    const rect = entry.node.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: rect.x*scale, y: rect.y*scale, width: rect.width*scale, height: rect.height*scale, visible:true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    setIsCropping(true)
  }
  const applyCrop = () => {
    const entry = find(selectedId); const rect = cropRectRef.current; const st = stageRef.current
    if (!entry || !rect || !st) { setIsCropping(false); return }
    const s = scale
    const rx = rect.x()/s - entry.node.x()
    const ry = rect.y()/s - entry.node.y()
    const rw = rect.width()/s
    const rh = rect.height()/s
    if (entry.node instanceof Konva.Image) {
      entry.node.crop({ x: rx, y: ry, width: rw, height: rh })
      entry.node.width(rw); entry.node.height(rh)
    } else {
      const g = new Konva.Group({ x: entry.node.x(), y: entry.node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      workRef.current?.add(g)
      entry.node.moveTo(g); entry.node.position({ x:0, y:0 }); g.cache()
    }
    cropRectRef.current?.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    workRef.current?.batchDraw()
  }
  const cancelCrop = () => { cropRectRef.current?.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false) }

  // ——— Export (двойной экспорт: mockup + alpha)
  const exportSide = (s:Side) => {
    const st = stageRef.current!; const oldScale = st.scaleX()
    st.scale({x:1,y:1})

    // скрыть чужую сторону
    const hidden:Entry[] = []
    list.forEach(l => {
      if (l.side!==s) { l.node.visible(false); hidden.push(l) }
    })

    // 1) макет с худи
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: 1, mimeType: "image/png" })

    // 2) прозрачный — прячем mockup-слой
    const mockLayer = (st.getLayers()[0]) // первый слой с KImage
    mockLayer.visible(false)
    st.draw()
    const alpha = st.toDataURL({ pixelRatio: 1, mimeType: "image/png" })
    mockLayer.visible(true)

    // вернуть
    hidden.forEach(l=> l.node.visible(l.meta.visible))
    st.scale({x:oldScale,y:oldScale}); st.draw()

    // скачать два файла
    const dl = (data:string, name:string) => {
      const a = document.createElement("a")
      a.href = data; a.download = name; a.click()
    }
    dl(withMock, `darkroom-${s}-mockup.png`)
    dl(alpha,     `darkroom-${s}-alpha.png`)
  }

  // ——— pointer routing
  const getPos = () => stageRef.current?.getPointerPosition() || { x:0, y:0 }
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
  const onUp = () => stopStroke()

  // ——— layer list data
  const items = useMemo(()=> {
    return list
      .filter(l=>l.side===side)
      .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l=>({
        id:l.id,
        name: l.type==="strokes" ? "strokes" : l.type,
        type:l.type,
        blend: (l.node as any).globalCompositeOperation as GlobalCompositeOperation ?? "source-over",
        opacity: l.node.opacity(),
        visible: l.meta.visible,
        locked: l.meta.locked
      }))
  }, [list, side])

  const setBlend = (id:string, blend:GlobalCompositeOperation) => {
    setList(p=>p.map(l=>{
      if (l.id!==id) return l
      ;(l.node as any).globalCompositeOperation = blend
      return l
    }))
    workRef.current?.batchDraw()
  }
  const setOpacity = (id:string, value:number) => {
    setList(p=>p.map(l=>{
      if (l.id!==id) return l
      l.node.opacity(value); return l
    }))
    workRef.current?.batchDraw()
  }
  const toggleVisible = (id:string) => {
    setList(p=>p.map(l=>{
      if (l.id!==id) return l
      l.meta.visible = !l.meta.visible
      l.node.visible(l.meta.visible && l.side===side)
      return l
    }))
    workRef.current?.batchDraw()
  }
  const toggleLock = (id:string) => {
    setList(p=>p.map(l=>{
      if (l.id!==id) return l
      l.meta.locked = !l.meta.locked
      l.node.draggable(!l.meta.locked)
      return l
    }))
  }
  const duplicate = (id:string) => {
    const src = list.find(l=>l.id===id)!; const clone = src.node.clone()
    ;(clone as any).id(uid()); workRef.current?.add(clone)
    setList(p=>[...p, { id:(clone as any)._id, side:src.side, type:src.type, node:clone, meta:{...src.meta, name:src.meta.name+" copy"} }])
    select((clone as any)._id)
    workRef.current?.batchDraw()
  }
  const remove = (id:string) => {
    const l = list.find(x=>x.id===id); l?.node.destroy()
    setList(p=>p.filter(x=>x.id!==id)); if (selectedId===id) select(null)
    workRef.current?.batchDraw()
  }
  const reorder = (srcId:string, dstId:string) => {
    const src = list.find(l=>l.id===srcId)?.node
    const dst = list.find(l=>l.id===dstId)?.node
    if (!src || !dst) return
    const targetIndex = dst.zIndex()
    src.setZIndex(targetIndex)
    workRef.current?.batchDraw()
  }

  // hotkeys (dup/del, up/down)
  useEffect(()=>{
    const onKey = (e:KeyboardEvent) => {
      const node = find(selectedId)?.node; if (!node) return
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicate(selectedId!) }
      if (e.key==="Delete"||e.key==="Backspace") { e.preventDefault(); remove(selectedId!) }
      if (e.key==="]") { node.moveUp(); workRef.current?.batchDraw() }
      if (e.key==="[") { node.moveDown(); workRef.current?.batchDraw() }
    }
    window.addEventListener("keydown", onKey)
    return ()=>window.removeEventListener("keydown", onKey)
  }, [selectedId, list])

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        onDownloadFront={()=>exportSide("front")}
        onDownloadBack={()=>exportSide("back")}
      />

      <LayersPanel
        items={items}
        onBlend={setBlend}
        onOpacity={setOpacity}
        onSelect={(id)=>select(id)}
        selectedId={selectedId}
        onToggleVisible={toggleVisible}
        onToggleLock={toggleLock}
        onDuplicate={duplicate}
        onDelete={remove}
        onReorder={reorder}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={vw} height={vh} scale={{x:scale, y:scale}}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          {/* mockup layer (не трогаем, чтобы экспорт работал) */}
          <Layer listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side==="back"  && backMock  && <KImage image={backMock} width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* work layer */}
          <Layer ref={workRef}>
            <Transformer ref={tRef} rotateEnabled anchorSize={10} />
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} />
          </Layer>
        </Stage>
      </div>

      {/* crop actions — внешность не меняю, кнопок в тулбаре достаточно */}
      { (tool==="crop") && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          <button className="border px-4 py-2 bg-black text-white" onClick={startCrop}>Start crop</button>
          <button className="border px-4 py-2" onClick={applyCrop}>Apply</button>
          <button className="border px-4 py-2" onClick={cancelCrop}>Cancel</button>
        </div>
      )}
    </div>
  )
}
