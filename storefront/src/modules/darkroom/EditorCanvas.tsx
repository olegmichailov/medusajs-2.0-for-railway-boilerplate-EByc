"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Transformer, Group, Text as KText } from "react-konva"
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

  // ⇨ активный strokes-слой на сторону, чтобы «сессии» не смешивались
  const activeStrokeId = useRef<{front:string|null;back:string|null}>({front:null, back:null})
  const strokeOpen = useRef<boolean>(tool === "brush")

  // autoscale (+ поднять выше на мобилке)
  const { viewW, viewH, scale, mobileYOffset } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    // оставляем сверху чуть больше свободного, снизу — место под Create
    const bottomReserve = isMobile ? 140 : 60
    const topReserve    = isMobile ? 40  : 60
    const maxW = vw - (isMobile ? 24 : 440)
    const maxH = vh - bottomReserve - topReserve
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return {
      viewW: BASE_W * s,
      viewH: BASE_H * s,
      scale: s,
      mobileYOffset: isMobile ? -28 : 0, // ⇨ приподнимаем макет
    }
  }, [showLayers])

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
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // ⇨ трансформер всегда реагирует на выделение, вне зависимости от инструмента
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    // тянуть объект можно только вне кисти/ластика, но хэндлы показываем всегда
    ;(n as any).draggable(!(tool === "brush" || tool === "erase"))
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // горячие клавиши (возвращены)
  useEffect(() => {
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

  // ⇨ strokes-группа (активная «сессия»). Новая создаётся каждый раз при входе в Brush.
  const ensureActiveStrokesGroup = () => {
    const key = side
    let id = activeStrokeId.current[key]
    let g: Konva.Group | null = null
    if (id) {
      const ex = layers.find(l => l.id === id && l.type==="strokes")
      if (ex) g = ex.node as Konva.Group
    }
    if (!g) {
      g = new Konva.Group({ x: 0, y: 0 })
      ;(g as any).id(uid())
      id = (g as any)._id
      const meta = baseMeta(`strokes ${seqs.strokes}`)
      drawLayerRef.current?.add(g)
      const newLay: AnyLayer = { id: id!, side, node: g, meta, type: "strokes" }
      setLayers(p => [...p, newLay])
      setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
      activeStrokeId.current[key] = id!
    }
    // поднимаем активную группу наверх текущей стороны
    g!.moveToTop()
    return g!
  }

  useEffect(() => {
    if (tool === "brush") {
      strokeOpen.current = true
      ensureActiveStrokesGroup()
    } else if (strokeOpen.current) {
      // закрыли «сессию» кисти
      strokeOpen.current = false
      activeStrokeId.current[side] = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, side])

  // загрузка изображения → сразу Move и селект
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
        // помещаем картинку В ГРУППУ — это важно для eraser по слою
        const g = new Konva.Group()
        g.add(kimg)
        ;(g as any).id(uid())
        const gid = (g as any)._id
        drawLayerRef.current?.add(g)
        g.on("click tap", () => select(gid))
        setLayers(p => [...p, { id: gid, side, node: g, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(gid)
        set({ tool: "move" }) // ⇨ сразу Move
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // текст
  const onAddText = () => {
    const t = new KText({
      text: "GMORKL",
      x: BASE_W/2-180, y: BASE_H/2-40,
      fontSize: 72,
      fontStyle: "bold",
      fontFamily: "Helvetica, Arial, sans-serif",
      fill: brushColor, width: 420, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    const g = new Konva.Group()
    g.add(t)
    ;(g as any).id(uid())
    const gid = (g as any)._id
    drawLayerRef.current?.add(g)
    g.on("click tap", () => select(gid))
    setLayers(p => [...p, { id: gid, side, node: g, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(gid)
    drawLayerRef.current?.batchDraw()
  }

  // shapes — создаём ТОЛЬКО из панели (по пустому клику не добавляем)
  const addShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")       n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")  n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle")n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")   { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                         n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_H/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const meta = baseMeta(`shape ${seqs.shape}`)
    const g = new Konva.Group()
    g.add(n as any)
    ;(g as any).id(uid())
    const gid = (g as any)._id
    drawLayerRef.current?.add(g)
    g.on("click tap", () => select(gid))
    setLayers(p => [...p, { id: gid, side, node: g, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(gid)
    drawLayerRef.current?.batchDraw()
  }

  // BRUSH / ERASE
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureActiveStrokesGroup()
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
      })
      g.add(line).moveToTop()
      setIsDrawing(true)
      return
    }

    if (tool === "erase") {
      // ⇨ ластик по выбранному слою: оборачиваем выбранный объект в группу и рисуем “destination-out” в ней
      const sel = find(selectedId)
      if (!sel) return
      const g = sel.node as Konva.Group // мы уже создаём image/text/shape как Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line).moveToTop()
      setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const key = side
      const id = activeStrokeId.current[key]
      const gLay = layers.find(l => l.id === id)
      const g = gLay?.node as Konva.Group | undefined
      const last = (g?.getChildren() || []).at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const sel = find(selectedId)
      const g = sel?.node as Konva.Group | undefined
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!last) return
      last.points(last.points().concat([x, y]))
      drawLayerRef.current?.batchDraw()
    }
  }
  const finishStroke = () => setIsDrawing(false)

  // CROP как был
  const startCrop = () => {
    const sel = find(selectedId)
    const container = sel?.node
    const n = container && (container as Konva.Group).findOne((c) => c instanceof Konva.Image) as Konva.Image | null
    if (!n) return
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const sel = find(selectedId)
    const container = sel?.node
    const img = container && (container as Konva.Group).findOne((c) => c instanceof Konva.Image) as Konva.Image | null
    const r = cropRectRef.current
    if (!img || !r) { cancelCrop(); return }
    const s = scale
    const rx = r.x()/s - img.x(), ry = r.y()/s - img.y()
    const rw = r.width()/s, rh = r.height()/s
    img.crop({ x: rx, y: ry, width: rw, height: rh })
    img.width(rw); img.height(rh)
    r.visible(false); cropTfRef.current?.nodes([]); setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // выбор/клик: хэндлы переключаются при любом инструменте
  const onStagePointerDown = (e: any) => {
    if (isCropping) return
    // клик по пустоте — не снимаем селект, если кисть/ластик
    const tgt = e.target as Konva.Node
    if (tgt === stageRef.current) {
      if (!(tool === "brush" || tool === "erase")) select(null)
      return
    }
    // клик по любому узлу — подхватываем ближайшую группу (мы их всегда создаём)
    const g = tgt.findAncestor("Group") as Konva.Group | null
    if (g) {
      // запрещаем рисование, если начали манипулировать объектом
      if (tool === "brush" || tool === "erase") return
      select((g as any)._id)
      attachTransformer()
    }
  }

  // жесты (пинч/поворот) — стабильно, без дерганья, вокруг центра объекта
  const gesture = useRef<{
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
  } | null>(null)

  const getAngle = (p1: any, p2: any) => Math.atan2(p2.clientY - p1.clientY, p2.clientX - p1.clientX)
  const getDist  = (p1: any, p2: any) => Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY)

  const onTouchStart = (e: any) => {
    if (tool !== "move") return
    const sel = find(selectedId)?.node
    if (!sel) return
    const touches = e.evt.touches
    if (touches && touches.length === 2) {
      gesture.current = {
        startDist: getDist(touches[0], touches[1]),
        startAngle: getAngle(touches[0], touches[1]),
        startScaleX: (sel as any).scaleX?.() ?? 1,
        startScaleY: (sel as any).scaleY?.() ?? 1,
        startRotation: (sel as any).rotation?.() ?? 0,
      }
    }
  }

  const rafId = useRef<number | null>(null)
  const onTouchMove = (e: any) => {
    if (tool !== "move") return
    const g = find(selectedId)?.node
    if (!g) return
    const touches = e.evt.touches
    if (!touches || touches.length !== 2 || !gesture.current) return

    e.evt.preventDefault()
    const { startDist, startAngle, startScaleX, startScaleY, startRotation } = gesture.current
    const dist  = getDist(touches[0], touches[1])
    const angle = getAngle(touches[0], touches[1])
    const scaleK = dist / startDist
    const rotDeg = (angle - startAngle) * 180 / Math.PI

    // throttle через rAF — без «мигания»
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      ;(g as any).scaleX(startScaleX * scaleK)
      ;(g as any).scaleY(startScaleY * scaleK)
      ;(g as any).rotation(startRotation + rotDeg)
      g.getLayer()?.batchDraw()
      attachTransformer()
    })
  }
  const onTouchEnd = () => { gesture.current = null }

  // pointer routing для кисти/ластика
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = (e: any) => {
    if (isCropping) return
    const p = getPos()
    if (tool==="brush" || tool==="erase") startStroke(p.x/scale, p.y/scale)
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // список слоёв для панелей
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

  const onLayerSelect   = (id: string) => { select(id); attachTransformer() }
  const onToggleVisible = (id: string) => { const l = layers.find(x => x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }
  const onToggleLock    = (id: string) => { const l = layers.find(x => x.id===id)!; (l.node as any).locked = !l.meta.locked; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }
  const onDelete        = (id: string) => { setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) }); if (selectedId===id) select(null); drawLayerRef.current?.batchDraw() }
  const onDuplicate     = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x((src.node as any).x()+20); clone.y((src.node as any).y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // точный reorder
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      return [...others, ...bottomToTop]
    })

    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend   = (id: string, blend: string) => updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) => updateMeta(id, { opacity })

  // выбранные props для панелей
  const sel = find(selectedId)
  const selectedKind: "image"|"shape"|"text"|"strokes"|null =
    sel ? sel.type : null

  const selectedProps =
    sel?.type === "text"
      ? (() => {
          const t = (sel.node as Konva.Group).findOne((n) => n instanceof Konva.Text) as Konva.Text | null
          return {
            text: t?.text() ?? "",
            fontSize: t?.fontSize() ?? 72,
            fontFamily: t?.fontFamily() ?? "Helvetica, Arial, sans-serif",
            fill: (t as any)?.fill?.() ?? "#000000",
          }
        })()
      : sel?.type === "shape"
      ? (() => {
          const any = (sel.node as Konva.Group).getChildren()[0] as any
          return {
            fill: any?.fill?.() ?? "#000000",
            stroke: any?.stroke?.() ?? "#000000",
            strokeWidth: any?.strokeWidth?.() ?? 0,
          }
        })()
      : {}

  const setSelectedFill       = (hex:string) => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const target = g.getChildren()[0] as any
    if (target?.fill) target.fill(hex)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedStroke     = (hex:string) => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const target = g.getChildren()[0] as any
    if (target?.stroke) target.stroke(hex)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedStrokeW    = (w:number)    => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const target = g.getChildren()[0] as any
    if (target?.strokeWidth) target.strokeWidth(w)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedText       = (tval:string) => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const t = g.findOne((n)=>n instanceof Konva.Text) as Konva.Text | null
    if (t) { t.text(tval); drawLayerRef.current?.batchDraw() }
  }
  const setSelectedFontSize   = (n:number)    => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const t = g.findOne((nn)=>nn instanceof Konva.Text) as Konva.Text | null
    if (t) { t.fontSize(n); drawLayerRef.current?.batchDraw() }
  }
  const setSelectedFontFamily = (name:string) => {
    const g = sel?.node as Konva.Group | undefined; if (!g) return
    const t = g.findOne((nn)=>nn instanceof Konva.Text) as Konva.Text | null
    if (t) { t.fontFamily(name); drawLayerRef.current?.batchDraw() }
  }
  const setSelectedColor      = (hex:string)  => {
    if (sel?.type === "text") {
      const g = sel.node as Konva.Group
      const t = g.findOne((nn)=>nn instanceof Konva.Text) as Konva.Text | null
      if (t) t.fill(hex)
    } else if (sel?.type === "shape") {
      const g = sel.node as Konva.Group
      const target = g.getChildren()[0] as any
      if (target?.fill) target.fill(hex)
      else if (target?.stroke) target.stroke(hex)
    }
    drawLayerRef.current?.batchDraw()
  }

  // ⇨ ВАЖНО: общий клик по сцене (селект) и тач-жесты
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.on("mousedown touchstart", onStagePointerDown)
    stage.on("touchstart", onTouchStart)
    stage.on("touchmove", onTouchMove)
    stage.on("touchend", onTouchEnd)
    return () => {
      stage.off("mousedown touchstart", onStagePointerDown)
      stage.off("touchstart", onTouchStart)
      stage.off("touchmove", onTouchMove)
      stage.off("touchend", onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId])

  // ——— UI ———
  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>{/* как было */}}
        onDownloadBack={()=>{/* как было */}}
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
        <div style={{ transform: `translateY(${mobileYOffset}px)` }}>
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
    </div>
  )
}
