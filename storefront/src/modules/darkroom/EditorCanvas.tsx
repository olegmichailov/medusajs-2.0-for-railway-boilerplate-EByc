"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
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
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  // ======== Вёрстка/фиксация ========
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

  // Блок скролла страницы в редакторе
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [])

  const RESERVED_TOP    = isMobile ? 88 : 0
  const RESERVED_BOTTOM = isMobile ? 112 : 0
  const PADDING = isMobile ? 8 : 24

  const { viewW, viewH, scale } = useMemo(() => {
    const maxW = vw - (isMobile ? PADDING*2 : 520) // слева тулбар на десктопе
    const maxH = vh - RESERVED_TOP - RESERVED_BOTTOM - PADDING*2
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [vw, vh])

  // ======== Утилиты/поиск ========
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null
  const isStroke = (lay?: AnyLayer | null) => lay?.type === "strokes"

  // показываем только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // ======== Трансформер ========
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
    ;(n as any).draggable(false) // таскать будем своими жестами
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, tool, side])

  // ======== Strokes session ========
  const ensureStrokesGroupOnTop = () => {
    const g = new Konva.Group({ x: 0, y: 0, name: "strokes-session" })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    g.moveToTop()
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers((p) => [...p, newLay])
    setSeqs((s) => ({ ...s, strokes: s.strokes + 1 }))
    select(id)
    return newLay
  }

  useEffect(() => {
    if (tool === "brush") {
      ensureStrokesGroupOnTop()
      attachTransformer()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ======== Добавление объектов ========
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
        // сразу Move
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
    set({ tool: "move" as Tool })
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
    set({ tool: "move" as Tool })
  }

  // ======== Brush / Erase ========
  const strokesGroupTop = () => {
    const last = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    return last ?? ensureStrokesGroupOnTop()
  }

  const startStroke = (x: number, y: number, erase = false) => {
    // erase по выделенному слою, strokes — по своей группе
    if (erase) {
      const sel = find(selectedId)
      const target = sel && !isStroke(sel) ? sel.node.getParent() ?? drawLayerRef.current : strokesGroupTop().node
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      ;(target as Konva.Group | Konva.Layer).add(line as any)
    } else {
      const gLay = strokesGroupTop()
      const g = gLay.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
      })
      g.add(line)
    }
    setIsDrawing(true)
  }

  const appendStroke = (x: number, y: number) => {
    const parent = drawLayerRef.current
    if (!parent) return
    // берём последний добавленный Line в верхнем из доступных контейнеров
    const findLastLine = (): Konva.Line | null => {
      // из последнего ребёнка соответствующего контейнера
      const all = parent.getChildren((n)=> n instanceof Konva.Group || n instanceof Konva.Line)
      if (all.length === 0) return null
      // ищем последнюю линию
      for (let i=all.length-1;i>=0;i--) {
        const el = all[i]
        if (el instanceof Konva.Group) {
          const kids = el.getChildren((n)=>n instanceof Konva.Line)
          if (kids.length) return kids[kids.length-1] as Konva.Line
        } else if (el instanceof Konva.Line) {
          return el as Konva.Line
        }
      }
      return null
    }
    const last = findLastLine()
    if (!last) return
    last.points(last.points().concat([x, y]))
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => setIsDrawing(false)

  // ======== Crop (оставляем как есть) ========
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

  // ======== Жесты iOS-стиля (только в Move, только для выбранного) ========
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

  const posFromEvent = () => {
    const st = stageRef.current
    if (!st) return { x: 0, y: 0 }
    const p = st.getPointerPosition()
    return p ? { x: p.x/scale, y: p.y/scale } : { x: 0, y: 0 }
  }
  const dist = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.hypot(a.x-b.x, a.y-b.y)
  const ang  = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.atan2(b.y-a.y, b.x-a.x) * 180 / Math.PI

  const onPointerDown = (ev: React.PointerEvent) => {
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId)
    pointers.current.set(ev.pointerId, posFromEvent())

    if (tool === "brush" || tool === "erase") {
      const p = posFromEvent()
      startStroke(p.x, p.y, tool === "erase")
      return
    }

    if (tool === "move") {
      const sel = node(selectedId)
      if (!sel || isStroke(find(selectedId))) return
      if (pointers.current.size === 1) {
        lastSingle.current = posFromEvent()
      } else if (pointers.current.size === 2) {
        const [p1, p2] = [...pointers.current.values()]
        const r = sel.getClientRect({ relativeTo: stageRef.current })
        const center = { x: (r.x + r.width/2)/scale, y: (r.y + r.height/2)/scale }
        gesture.current = {
          startDist: dist(p1, p2),
          startAngle: ang(p1, p2),
          startScaleX: sel.scaleX() || 1,
          startScaleY: sel.scaleY() || 1,
          startRotation: sel.rotation() || 0,
          center
        }
      }
    }
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    if (tool === "brush" || tool === "erase") {
      if (isDrawing) {
        const p = posFromEvent()
        appendStroke(p.x, p.y)
      }
      return
    }

    if (tool === "move") {
      const sel = node(selectedId)
      if (!sel || isStroke(find(selectedId))) return

      pointers.current.set(ev.pointerId, posFromEvent())

      if (pointers.current.size === 1 && lastSingle.current) {
        const cur = posFromEvent()
        const dx = cur.x - lastSingle.current.x
        const dy = cur.y - lastSingle.current.y
        sel.x(sel.x() + dx)
        sel.y(sel.y() + dy)
        lastSingle.current = cur
        drawLayerRef.current?.batchDraw()
      } else if (pointers.current.size === 2 && gesture.current) {
        const [a, b] = [...pointers.current.values()]
        const g = gesture.current
        const curDist  = dist(a, b)
        const curAngle = ang(a, b)
        const k = Math.max(0.1, curDist / g.startDist)

        sel.scaleX(g.startScaleX * k)
        sel.scaleY(g.startScaleY * k)
        sel.rotation(g.startRotation + (curAngle - g.startAngle))

        // стабилизуем центр
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

  // ======== Слои: список/мета/управление ========
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
    clone.x(src.node.x()+20); clone.y(src.node.y()+20)
    ;(clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // Reorder up/down/DnD
  const reindexCurrentSide = () => {
    const current = layers.filter(l=>l.side===side).sort((a,b)=>a.node.zIndex()-b.node.zIndex())
    current.forEach((l,i)=> (l.node as any).zIndex(i))
    drawLayerRef.current?.batchDraw()
  }
  const moveLayerBefore = (srcId: string, destId: string) => {
    setLayers((prev)=>{
      const list = prev.filter(l=>l.side===side)
      const others = prev.filter(l=>l.side!==side)
      const order = list.sort((a,b)=>a.node.zIndex()-b.node.zIndex())
      const sIdx = order.findIndex(l=>l.id===srcId)
      const dIdx = order.findIndex(l=>l.id===destId)
      if (sIdx<0||dIdx<0) return prev
      const [src] = order.splice(sIdx,1)
      order.splice(dIdx,0,src)
      order.forEach((l,i)=> (l.node as any).zIndex(i))
      return [...others, ...order]
    })
    drawLayerRef.current?.batchDraw()
  }

  const onReorder = (srcId: string, destId: string, place: "before"|"after") => {
    if (place==="before") moveLayerBefore(srcId,destId)
    else {
      // «after» = вставить после → вставляем before следующего
      const list = layerItems
      const idx = list.findIndex(l=>l.id===destId)
      const next = list[idx-1]?.id // потому что layerItems перевёрнут сверху вниз
      if (next) moveLayerBefore(srcId, next)
      else moveLayerBefore(srcId, destId) // край
    }
    select(srcId)
    requestAnimationFrame(reindexCurrentSide)
  }

  const onMoveUp = (id:string) => {
    const list = layerItems
    const i = list.findIndex(l=>l.id===id)
    if (i<=0) return
    onReorder(id, list[i-1].id, "after")
  }
  const onMoveDown = (id:string) => {
    const list = layerItems
    const i = list.findIndex(l=>l.id===id)
    if (i<0 || i===list.length-1) return
    onReorder(id, list[i+1].id, "before")
  }

  return (
    <div
      className="relative w-screen"
      style={{ height: "100vh", touchAction: "none", overflow: "hidden" }}
    >
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k:ShapeKind)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={addText}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>{/* твой экспорт можно вернуть сюда */}}
        onDownloadBack={()=>{/* твой экспорт можно вернуть сюда */}}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        // selected props (двухсторонняя связка)
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={( ()=>{
          const sel = find(selectedId)
          if (!sel) return {}
          if (sel.type==="text") {
            const t = sel.node as Konva.Text
            return {
              text: t.text(),
              fontSize: t.fontSize(),
              fontFamily: t.fontFamily(),
              fill: String(t.fill() ?? "#000000")
            }
          }
          if (sel.type==="shape") {
            const n:any = sel.node
            return {
              fill: n.fill?.() ?? "#000000",
              stroke: n.stroke?.() ?? "#000000",
              strokeWidth: n.strokeWidth?.() ?? 0
            }
          }
          return {}
        })()}
        setSelectedFill={(hex:string)=>{ const sel=find(selectedId); if(sel&&("fill" in (sel.node as any))){ (sel.node as any).fill(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStroke={(hex:string)=>{ const sel=find(selectedId); if(sel&&("stroke" in (sel.node as any))){ (sel.node as any).stroke(hex); drawLayerRef.current?.batchDraw() }}}
        setSelectedStrokeW={(w:number)=>{ const sel=find(selectedId); if(sel&&("strokeWidth" in (sel.node as any))){ (sel.node as any).strokeWidth(w); drawLayerRef.current?.batchDraw() }}}
        setSelectedText={(t:string)=>{ const sel=find(selectedId); if(sel?.type==="text"){ (sel.node as Konva.Text).text(t); drawLayerRef.current?.batchDraw() }}}
        setSelectedFontSize={(n:number)=>{ const sel=find(selectedId); if(sel?.type==="text"){ (sel.node as Konva.Text).fontSize(n); drawLayerRef.current?.batchDraw() }}}
        setSelectedFontFamily={(f:string)=>{ const sel=find(selectedId); if(sel?.type==="text"){ (sel.node as Konva.Text).fontFamily(f); drawLayerRef.current?.batchDraw() }}}
        setSelectedColor={(hex:string)=>{ const sel=find(selectedId); if(!sel) return; if(sel.type==="text"){ (sel.node as Konva.Text).fill(hex) } else { const n:any=sel.node; if(n.fill) n.fill(hex); else if(n.stroke) n.stroke(hex) } ; drawLayerRef.current?.batchDraw() }}
        // mobile layers API для шторки
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

      {/* центрированная сцена */}
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
          {/* Мокап отдельно, не слушает события */}
          <Layer ref={bgLayerRef} listening={false}>
            {side==="front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} x={0} y={0} />}
            {side==="back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} x={0} y={0} />}
          </Layer>

          {/* Пользовательский контент */}
          <Layer ref={drawLayerRef} />

          {/* UI */}
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

      {/* Панель слоёв для десктопа */}
      {!isMobile && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={(id, b)=>updateMeta(id, { blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id, { opacity: o })}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}
    </div>
  )
}
