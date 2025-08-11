"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; raster: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

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

  // shape ghost
  const ghostRef = useRef<Konva.Node|null>(null)

  // prev tool → для новой пачки strokes
  const prevTool = useRef(tool)
  useEffect(()=>{ prevTool.current = tool },[tool])

  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const maxW = vw - 440
    const maxH = vh - 200
    const s = Math.min(maxW/BASE_W, maxH/BASE_H, 1)
    return { viewW: BASE_W*s, viewH: BASE_H*s, scale: s }
  }, [showLayers])

  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side===side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // Transformer
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
  useEffect(()=>{ attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // keyboard: arrows + copy/paste/dup
  const clipboard = useRef<Konva.Node|null>(null)
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      if (e.key==="ArrowLeft")  n.x(n.x()-step)
      if (e.key==="ArrowRight") n.x(n.x()+step)
      if (e.key==="ArrowUp")    n.y(n.y()-step)
      if (e.key==="ArrowDown")  n.y(n.y()+step)
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="c") clipboard.current = n.clone()
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="v" && clipboard.current) {
        const cl = clipboard.current.clone(); (cl as any).id(uid()); cl.x(n.x()+20); cl.y(n.y()+20)
        drawLayerRef.current?.add(cl)
        const src = find(selectedId)!
        const newLay: AnyLayer = { id:(cl as any)._id, node: cl, side: src.side, meta:{...src.meta, name: src.meta.name+" copy"}, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id)
      }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") {
        const cl = n.clone(); (cl as any).id(uid()); cl.x(n.x()+20); cl.y(n.y()+20)
        drawLayerRef.current?.add(cl)
        const src = find(selectedId)!
        const newLay: AnyLayer = { id:(cl as any)._id, node: cl, side: src.side, meta:{...src.meta, name: src.meta.name+" copy"}, type: src.type }
        setLayers(p=>[...p, newLay]); select(newLay.id)
      }
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return ()=>window.removeEventListener("keydown", onKey)
  }, [selectedId])

  // strokes group
  const ensureStrokesGroup = (forceNew=false) => {
    if (!forceNew) {
      const exist = [...layers].reverse().find(l => l.side===side && l.type==="strokes")
      if (exist) return exist
    }
    const g = new Konva.Group({ x:0, y:0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p=>[...p, newLay])
    setSeqs(s=>({ ...s, strokes: s.strokes+1 }))
    return newLay
  }

  // upload image
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2 - w/2, y: BASE_H/2 - h/2, width: w, height: h })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`img ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", ()=>select(id))
        setLayers(p=>[...p, { id, side, node:kimg, meta, type:"image"}])
        setSeqs(s=>({ ...s, image: s.image+1 }))
        select(id)
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // inline text editor
  const inlineEdit = (t: Konva.Text) => {
    const st = stageRef.current; if(!st) return
    const rect = st.container().getBoundingClientRect()
    const pos = t.getAbsolutePosition(st)
    const area = document.createElement("textarea")
    area.value = t.text()
    Object.assign(area.style, {
      position:"fixed", left:`${rect.left + pos.x*scale}px`, top:`${rect.top + (pos.y - t.fontSize())*scale}px`,
      width:`${Math.max(200, t.width()*scale)}px`, fontSize:`${t.fontSize()*scale}px`, fontFamily:t.fontFamily(),
      color:String(t.fill()||"#000"), lineHeight:"1.2", border:"1px solid #000", background:"white", padding:"2px", margin:"0", zIndex:"9999"
    } as CSSStyleDeclaration)
    document.body.appendChild(area)
    area.focus()
    const commit = ()=>{ t.text(area.value); area.remove(); drawLayerRef.current?.batchDraw() }
    area.addEventListener("keydown",(e)=>{ if((e.key==="Enter" && !e.shiftKey) || e.key==="Escape"){ e.preventDefault(); commit() }})
    area.addEventListener("blur", commit)
  }

  // add text (в точку клика)
  const createTextAt = (x:number, y:number) => {
    const t = new Konva.Text({
      text:"Your text", x:x-180, y:y-30, fontSize:64,
      fontFamily:"Inter, system-ui, -apple-system, sans-serif", fill:brushColor, width:360, align:"center"
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", ()=>select(id))
    t.on("dblclick dbltap", ()=>inlineEdit(t))
    setLayers(p=>[...p, { id, side, node:t, meta, type:"text"}])
    setSeqs(s=>({ ...s, text: s.text+1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // shapes
  const buildHeart = (size:number, color:string) => {
    const s = size
    const path = `M ${-0.25*s} ${-0.1*s}
     C ${-0.25*s} ${-0.35*s}, ${0.05*s} ${-0.35*s}, 0 ${-0.1*s}
     C ${0.05*s} ${-0.35*s}, ${0.35*s} ${-0.35*s}, ${0.35*s} ${-0.1*s}
     C ${0.35*s} ${0.2*s}, 0 ${0.35*s}, 0 ${0.45*s}
     C 0 ${0.35*s}, ${-0.35*s} ${0.2*s}, ${-0.25*s} ${-0.1*s} Z`
    const p = new Konva.Path({ data:path, fill: color, x:0, y:0 })
    return p
  }

  const createShapeAt = (kind: ShapeKind, x:number, y:number) => {
    let n: AnyNode
    if (kind==="circle")    n = new Konva.Circle({ x, y, radius: 160, fill: brushColor })
    else if (kind==="square")    n = new Konva.Rect({ x:x-160, y:y-160, width: 320, height: 320, fill: brushColor })
    else if (kind==="triangle")  n = new Konva.RegularPolygon({ x, y, sides:3, radius:200, fill: brushColor })
    else if (kind==="cross") {
      const g = new Konva.Group({ x:x-160, y:y-160 })
      g.add(new Konva.Rect({ width: 320, height: 60, y:130, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 320, x:130, fill: brushColor }))
      n = g
    } else if (kind==="line") {
      n = new Konva.Line({ points: [x-200, y, x+200, y], stroke: brushColor, strokeWidth: 16, lineCap:"round" })
    } else if (kind==="star") {
      n = new Konva.Star({ x, y, numPoints:5, innerRadius:90, outerRadius:180, fill: brushColor })
    } else { // heart
      const g = new Konva.Group({ x, y })
      const heart = buildHeart(420, brushColor)
      heart.offsetX(0); heart.offsetY(150)
      g.add(heart)
      n = g
    }
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", ()=>select(id))
    setLayers(p=>[...p, { id, side, node:n, meta, type:"shape"}])
    setSeqs(s=>({ ...s, shape: s.shape+1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // brush / erase
  const startStroke = (x:number, y:number) => {
    const forceNew = !(prevTool.current==="brush" || prevTool.current==="erase")
    const gLay = ensureStrokesGroup(forceNew)
    const g = gLay.node as Konva.Group
    const line = new Konva.Line({
      points:[x,y], stroke: tool==="erase" ? "#000000" : brushColor, strokeWidth: brushSize,
      lineCap:"round", lineJoin:"round", globalCompositeOperation: tool==="erase" ? "destination-out":"source-over",
    })
    g.add(line); setIsDrawing(true)
  }
  const appendStroke = (x:number, y:number) => {
    const gLay = [...layers].reverse().find(l=>l.side===side && l.type==="strokes")
    const g = gLay?.node as Konva.Group|undefined
    if(!g) return
    const last = g.getChildren().at(-1) as Konva.Line|undefined
    if(!last) return
    last.points(last.points().concat([x,y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = ()=> setIsDrawing(false)

  // crop (только Image)
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
    n.crop({ x:rx, y:ry, width:rw, height:rh }); n.width(rw); n.height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // export (mockup + art)
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if(!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l=>{ if(l.side!==s && l.node.visible()){ l.node.visible(false); hidden.push(l.node) }})
    uiLayerRef.current?.visible(false)
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly  = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true); hidden.forEach(n=>n.visible(true)); uiLayerRef.current?.visible(true); st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r=>setTimeout(r,300))
    const a2 = document.createElement("a"); a2.href = artOnly;  a2.download = `darkroom-${s}_art.png`;    a2.click()
  }

  // — pointer + ghost
  const getPos = () => stageRef.current?.getPointerPosition() || { x:0, y:0 }

  const updateGhost = (x:number, y:number) => {
    // создать/обновить превью выбранного шейпа
    if (!ghostRef.current) {
      let gn: Konva.Node
      const color = brushColor
      if (shapeKind==="circle")   gn = new Konva.Circle({ radius:160, stroke: color, strokeWidth:2, dash:[6,6], opacity:.5 })
      else if (shapeKind==="square")   gn = new Konva.Rect({ width:320, height:320, stroke: color, strokeWidth:2, dash:[6,6], opacity:.5, offsetX:160, offsetY:160 })
      else if (shapeKind==="triangle") gn = new Konva.RegularPolygon({ sides:3, radius:200, stroke: color, strokeWidth:2, dash:[6,6], opacity:.5 })
      else if (shapeKind==="cross") {
        const g = new Konva.Group({ opacity:.5 })
        g.add(new Konva.Rect({ width:320, height:60, y:130, stroke: color, strokeWidth:2, dash:[6,6] }))
        g.add(new Konva.Rect({ width:60, height:320, x:130, stroke: color, strokeWidth:2, dash:[6,6] }))
        gn = g
      } else if (shapeKind==="line") {
        gn = new Konva.Line({ points:[-200,0,200,0], stroke: color, strokeWidth:2, dash:[6,6], opacity:.5 })
      } else if (shapeKind==="star") {
        gn = new Konva.Star({ numPoints:5, innerRadius:90, outerRadius:180, stroke: color, strokeWidth:2, dash:[6,6], opacity:.5 })
      } else {
        const g = new Konva.Group({ opacity:.5 })
        const path = new Konva.Path({ data:"M -105 -24 C -105 -84, -45 -84, 0 -24 C 45 -84, 105 -84, 105 -24 C 105 48, 0 90, 0 120 C 0 90, -105 48, -105 -24 Z",
          stroke: color, strokeWidth:2, dash:[6,6] })
        g.add(path); gn = g
      }
      ghostRef.current = gn
      uiLayerRef.current?.add(gn)
    }
    const gn = ghostRef.current as any
    gn.position({ x, y })
    uiLayerRef.current?.batchDraw()
  }

  // убрать ghost
  const disposeGhost = () => { ghostRef.current?.destroy(); ghostRef.current = null; uiLayerRef.current?.batchDraw() }
  useEffect(()=>{ if(tool!=="shape") disposeGhost() }, [tool, shapeKind])

  const onDown = (e:any) => {
    if (isCropping) return
    const tgt = e.target as Konva.Node
    const clickedEmpty = tgt === stageRef.current
    const p = getPos()
    if (tool==="brush" || tool==="erase") {
      startStroke(p.x/scale, p.y/scale)
    } else if (tool==="text") {
      if (clickedEmpty) createTextAt(p.x/scale, p.y/scale)
    } else if (tool==="shape") {
      if (clickedEmpty) createShapeAt(shapeKind, p.x/scale, p.y/scale)
    }
  }
  const onMove = () => {
    const p = getPos()
    if (isDrawing) {
      appendStroke(p.x/scale, p.y/scale)
    } else if (tool==="shape") {
      updateGhost(p.x/scale, p.y/scale)
    }
  }
  const onUp = () => { if (isDrawing) finishStroke() }

  // layers panel items
  const layerItems = useMemo(()=> {
    return layers
      .filter(l=>l.side===side)
      .sort((a,b)=> a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l=>({ id:l.id, name:l.meta.name, type:l.type, visible:l.meta.visible, locked:l.meta.locked, blend:l.meta.blend, opacity:l.meta.opacity }))
  }, [layers, side])

  const updateMeta = (id:string, patch: Partial<BaseMeta>) => {
    setLayers(p=>p.map(l=>{
      if(l.id!==id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side===side)
      return { ...l, meta }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect   = (id:string)=>select(id)
  const onToggleVisible = (id:string)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible })}
  const onToggleLock    = (id:string)=>{ const l=layers.find(x=>x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id:string)=>{ setLayers(p=>{ const l=p.find(x=>x.id===id); l?.node.destroy(); return p.filter(x=>x.id!==id) }); if(selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id:string)=>{ const src=layers.find(l=>l.id===id)!; const cl=src.node.clone(); (cl as any).id(uid()); cl.x(src.node.x()+20); cl.y(src.node.y()+20); drawLayerRef.current?.add(cl); const nl:AnyLayer={id:(cl as any)._id,node:cl,side:src.side,meta:{...src.meta,name:src.meta.name+" copy"},type:src.type}; setLayers(p=>[...p,nl]); select(nl.id); drawLayerRef.current?.batchDraw() }
  const onReorder       = (srcId:string, destId:string)=>{ const src=layers.find(l=>l.id===srcId)?.node; const dst=layers.find(l=>l.id===destId)?.node; if(!src||!dst) return; src.moveToIndex(dst.index()); drawLayerRef.current?.batchDraw(); setLayers(p=>[...p]) }
  const onChangeBlend   = (id:string, blend:string)=>updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id:string, op:number)=>updateMeta(id, { opacity: op })

  // selected props for toolbar
  const sel = find(selectedId)
  const selectedKind: "image"|"shape"|"text"|"strokes"|null = sel?.type ?? null
  const selectedProps =
    sel?.type==="text" ? {
      text:(sel.node as Konva.Text).text(),
      fontSize:(sel.node as Konva.Text).fontSize(),
      fontFamily:(sel.node as Konva.Text).fontFamily(),
      fill:(sel.node as any).fill?.() ?? "#000000",
    }
    : sel?.type==="shape" ? {
      fill:(sel.node as any).fill?.() ?? "#000000",
      stroke:(sel.node as any).stroke?.() ?? "#000000",
      strokeWidth:(sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string)=>{ if(!sel) return; if((sel.node as any).fill) (sel.node as any).fill(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string)=>{ if(!sel) return; if((sel.node as any).stroke) (sel.node as any).stroke(hex); drawLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)=>{ if(!sel) return; if((sel.node as any).strokeWidth) (sel.node as any).strokeWidth(w); drawLayerRef.current?.batchDraw() }
  const setSelectedText       = (t:string)=>{ const n=sel?.node as Konva.Text; if(!n) return; n.text(t); drawLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (n:number)=>{ const t=sel?.node as Konva.Text; if(!t) return; t.fontSize(n); drawLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string)=>{ const t=sel?.node as Konva.Text; if(!t) return; t.fontFamily(name); drawLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)=>{ if(!sel) return; if(sel.type==="text"){ (sel.node as Konva.Text).fill(hex) } else if(sel.type==="shape"){ if((sel.node as any).fill) (sel.node as any).fill(hex); else if((sel.node as any).stroke) (sel.node as any).stroke(hex) } drawLayerRef.current?.batchDraw() }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s)=>set({side:s})}
        tool={tool} setTool={(t)=>set({tool:t})}
        brushColor={brushColor} setBrushColor={(v)=>set({brushColor:v})}
        brushSize={brushSize} setBrushSize={(n)=>set({brushSize:n})}
        shapeKind={shapeKind} setShapeKind={(k)=>set({shapeKind:k})}
        onUploadImage={onUploadImage}
        onAddText={()=>{/* текст создаётся по клику, см. onDown */}}
        onAddShape={()=>{/* фигуры по клику */}}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
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
        setSelectedColor={setSelectedColor}
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
          onChangeBlend={onChangeBlend}
          onChangeOpacity={onChangeOpacity}
        />
      )}

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
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H}/>}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H}/>}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
            <Transformer ref={trRef} rotateEnabled anchorSize={10} borderStroke="black" anchorStroke="black" anchorFill="white"/>
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black"/>
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
