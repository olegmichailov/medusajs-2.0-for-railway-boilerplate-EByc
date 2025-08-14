"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
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
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // mockups
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef     = useRef<Konva.Stage>(null)
  const bgLayerRef   = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef   = useRef<Konva.Layer>(null)
  const trRef        = useRef<Konva.Transformer>(null)
  const cropRectRef  = useRef<Konva.Rect>(null)
  const cropTfRef    = useRef<Konva.Transformer>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })
  const [textValue, setTextValue] = useState("GMORKUL")

  // ===== viewport =====
  // На мобиле фиксируем высоту так, чтобы мокап был виден + не перекрывался нижней кнопкой Create.
  // Запас по низу — 80px.
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const bottomPad = 96
    const maxW = vw - 16 // компактно по ширине
    const maxH = vh - bottomPad - 16
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [typeof window !== "undefined" ? window.innerWidth : 0, typeof window !== "undefined" ? window.innerHeight : 0])

  // Заблокировать автоповорот где это возможно (лучшее, что можно в браузере)
  useEffect(() => {
    // не критично, просто пытаемся
    const lock = async () => {
      try {
        // @ts-ignore
        if (screen.orientation && screen.orientation.lock) {
          // @ts-ignore
          await screen.orientation.lock("portrait-primary")
        }
      } catch {}
    }
    lock()
  }, [])

  // utils
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // показываем на сцене только текущую сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  /** Трансформер к выделенному узлу (если не рисуем/не кропим/не locked) */
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current
    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    // разрешаем drag узлу только в инструменте Move
    const canDragNow = tool === "move"
    ;(n as any).draggable(canDragNow)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // ====== hotkeys ======
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = node(selectedId); if (!n) return
      const mod = e.metaKey || e.ctrlKey

      // move by arrows
      const step = e.shiftKey ? 20 : 2
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
        if (mod) {
          // reorder by Ctrl/Cmd + arrows
          if (e.key === "ArrowUp") {
            if (e.shiftKey) bringToFront(selectedId!)
            else bringForward(selectedId!)
          } else if (e.key === "ArrowDown") {
            if (e.shiftKey) sendToBack(selectedId!)
            else sendBackward(selectedId!)
          }
        } else {
          // position move
          e.preventDefault()
          if (e.key === "ArrowLeft")  n.x(n.x()-step)
          if (e.key === "ArrowRight") n.x(n.x()+step)
          if (e.key === "ArrowUp")    n.y(n.y()-step)
          if (e.key === "ArrowDown")  n.y(n.y()+step)
          n.getLayer()?.batchDraw()
        }
      }

      // duplicate
      if (mod && e.key.toLowerCase()==="d") {
        e.preventDefault()
        duplicateLayer(selectedId!)
      }
      // delete
      if (e.key==="Backspace"||e.key==="Delete") {
        e.preventDefault()
        deleteLayer(selectedId!)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, layers])

  // reorder helpers
  const zSortCurrent = () => [...layers.filter(l=>l.side===side)].sort((a,b)=>a.node.zIndex()-b.node.zIndex())
  const bringForward = (id: string) => {
    setLayers(prev => {
      const cur = zSortCurrent()
      const i = cur.findIndex(l=>l.id===id); if (i<0) return prev
      if (i < cur.length-1) {
        const n = cur[i].node; n.zIndex(n.zIndex()+1)
        drawLayerRef.current?.batchDraw()
      }
      return [...prev]
    })
  }
  const sendBackward = (id: string) => {
    setLayers(prev => {
      const cur = zSortCurrent()
      const i = cur.findIndex(l=>l.id===id); if (i<0) return prev
      if (i > 0) {
        const n = cur[i].node; n.zIndex(n.zIndex()-1)
        drawLayerRef.current?.batchDraw()
      }
      return [...prev]
    })
  }
  const bringToFront = (id: string) => {
    setLayers(prev => {
      const cur = zSortCurrent()
      const i = cur.findIndex(l=>l.id===id); if (i<0) return prev
      const n = cur[i].node
      n.zIndex(cur.length-1)
      drawLayerRef.current?.batchDraw()
      return [...prev]
    })
  }
  const sendToBack = (id: string) => {
    setLayers(prev => {
      const cur = zSortCurrent()
      const i = cur.findIndex(l=>l.id===id); if (i<0) return prev
      const n = cur[i].node
      n.zIndex(0)
      drawLayerRef.current?.batchDraw()
      return [...prev]
    })
  }

  // ===== Strokes session logic =====
  const ensureStrokesGroupTop = () => {
    // всегда создаём новую «сессию» штрихов поверх всего остального на текущей стороне
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    // поднять на верх именно по текущей стороне
    const topIndex = drawLayerRef.current?.getChildren((n)=>true).length ?? 1
    g.zIndex(topIndex)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    // выделение не переключаем (хэндлы не мешают рисованию)
    return newLay
  }

  // brush / erase: пишем в последнюю strokes-сессию
  const startStroke = (x: number, y: number) => {
    // если стираем и нет выделения — предупреждение и выходим
    if (tool === "erase") {
      const sel = find(selectedId)
      if (!sel) { toast("Select a layer to erase."); return }
    }

    // берём верхнюю strokes-сессию (если её нет после переключений — создадим новую)
    let gLay = [...layers].reverse().find(l => l.side === side && l.type === "strokes")
    if (!gLay) gLay = ensureStrokesGroupTop()
    const g = gLay.node as Konva.Group

    // сам штрих
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })

    // если Erase — применять как маску к ВЫДЕЛЕННОМУ слою
    if (tool === "erase") {
      const target = node(selectedId) as AnyNode | null
      if (!target) return
      // создаём маску: кладём line в отдельную группу-clip поверх target
      // проще: добавим line в ту же группу strokes (чуть быстрее и уже с destination-out;
      // при этом стираем всё, что под stroke — но UI заранее просит выделять слой)
      // для точной маски на один слой нужна отдельная копия: оставим лёгкую реализацию из-за производительности
    }

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

  // ====== Images / Text / Shapes ======
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
        // сразу в Move, чтобы поправить
        set({ tool: "move" })
        drawLayerRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: textValue || "GMORKUL",
      x: BASE_W/2-200, y: BASE_H/2-60,
      fontSize: 88, fontStyle: "bold",
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor, width: 400, align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

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
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ===== Crop =====
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

  // ===== Export (download mockup + art) =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []
    layers.forEach(l => { if (l.side !== s && l.node.visible()) { l.node.visible(false); hidden.push(l.node) } })
    // вырубим UI
    const uiPrev = uiLayerRef.current?.visible()
    uiLayerRef.current?.visible(false)

    // 1) with mockup
    bgLayerRef.current?.visible(true); st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) art only
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // restore
    bgLayerRef.current?.visible(true)
    hidden.forEach(n => n.visible(true))
    if (uiPrev) uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 350))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Pointer routing (mouse + touch) =====
  const getStageXY = (clientX: number, clientY: number) => {
    const st = stageRef.current; if (!st) return { x: 0, y: 0 }
    const rect = st.container().getBoundingClientRect()
    return { x: (clientX - rect.left)/scale, y: (clientY - rect.top)/scale }
  }

  // ——— Touch gestures (2-finger rotate/zoom around centroid) ———
  const gesture = useRef<{
    active: boolean
    id1: number; id2: number
    p1: {x:number;y:number}; p2: {x:number;y:number}
    startVec: {x:number;y:number}
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRotation: number
    startPos: {x:number;y:number}
    center: {x:number;y:number} // in stage coords
  } | null>(null)

  const vec = (a:{x:number;y:number}, b:{x:number;y:number}) => ({ x: b.x-a.x, y: b.y-a.y })
  const angle = (v:{x:number;y:number}) => Math.atan2(v.y, v.x)
  const length = (v:{x:number;y:number}) => Math.hypot(v.x, v.y)
  const rotateVec = (v:{x:number;y:number}, rad:number) => ({ x: v.x*Math.cos(rad) - v.y*Math.sin(rad), y: v.x*Math.sin(rad) + v.y*Math.cos(rad) })

  const toParentSpace = (pt:{x:number;y:number}, parent: Konva.Container) => {
    const t = parent.getAbsoluteTransform().copy()
    t.invert()
    return t.point(pt)
  }

  const onTouchStart: Konva.KonvaEventListener<TouchEvent> = (e) => {
    const touches = e.evt.touches
    if (touches.length === 2) {
      const sel = find(selectedId)?.node
      if (!sel || (sel as any).draggable() === false) {
        // даже если инструмент не Move — жест 2 пальцами всё равно работает на выделенном узле
      }
      const p1s = getStageXY(touches[0].clientX, touches[0].clientY)
      const p2s = getStageXY(touches[1].clientX, touches[1].clientY)
      const c = { x: (p1s.x+p2s.x)/2, y: (p1s.y+p2s.y)/2 }
      const v0 = vec(p1s, p2s)
      gesture.current = {
        active: true,
        id1: touches[0].identifier, id2: touches[1].identifier,
        p1: p1s, p2: p2s,
        startVec: v0,
        startDist: length(v0),
        startAngle: angle(v0),
        startScaleX: sel ? (sel as any).scaleX?.() ?? 1 : 1,
        startScaleY: sel ? (sel as any).scaleY?.() ?? 1 : 1,
        startRotation: sel ? (sel as any).rotation?.() ?? 0 : 0,
        startPos: sel ? { x: (sel as any).x(), y: (sel as any).y() } : { x:0, y:0 },
        center: c,
      }
      e.evt.preventDefault()
    } else if (touches.length === 1) {
      // одиночным пальцем — классическая логика инструментов
      if (tool==="brush" || tool==="erase") {
        const p = getStageXY(touches[0].clientX, touches[0].clientY)
        startStroke(p.x, p.y)
      }
    }
  }

  const onTouchMove: Konva.KonvaEventListener<TouchEvent> = (e) => {
    const touches = e.evt.touches
    if (gesture.current?.active && touches.length === 2) {
      const sel = node(selectedId)
      if (!sel) return
      const id1 = gesture.current.id1
      const id2 = gesture.current.id2

      const tA = [...touches].find(t=>t.identifier===id1)!
      const tB = [...touches].find(t=>t.identifier===id2)!
      const p1s = getStageXY(tA.clientX, tA.clientY)
      const p2s = getStageXY(tB.clientX, tB.clientY)
      const v = vec(p1s, p2s)
      const dist = length(v)
      const ang = angle(v)

      const scaleMul = dist / (gesture.current.startDist || 1)
      const rotDelta = (ang - gesture.current.startAngle) * 180/Math.PI

      // новая шкала/угол
      const newScaleX = gesture.current.startScaleX * scaleMul
      const newScaleY = gesture.current.startScaleY * scaleMul
      const newRot = gesture.current.startRotation + rotDelta

      // удерживаем центроид (между пальцами) неподвижным в системе родителя node
      const parent = (sel.getParent?.() ?? drawLayerRef.current) as Konva.Container
      const C_parent = toParentSpace({ x: gesture.current.center.x, y: gesture.current.center.y }, parent)
      const pos0 = gesture.current.startPos
      const v0 = { x: C_parent.x - pos0.x, y: C_parent.y - pos0.y }         // вектор от узла к центру в родительских координатах
      const v1 = rotateVec(v0, rotDelta * Math.PI/180)                       // поворот
      const v2 = { x: v1.x * scaleMul, y: v1.y * scaleMul }                 // масштаб
      const pos1 = { x: C_parent.x - v2.x, y: C_parent.y - v2.y }           // новая позиция, чтобы центр совпал

      ;(sel as any).scaleX(newScaleX)
      ;(sel as any).scaleY(newScaleY)
      ;(sel as any).rotation(newRot)
      ;(sel as any).position(pos1)

      attachTransformer()
      drawLayerRef.current?.batchDraw()
      e.evt.preventDefault()
    } else if (!gesture.current?.active && touches.length === 1 && isDrawing) {
      const p = getStageXY(touches[0].clientX, touches[0].clientY)
      appendStroke(p.x, p.y)
      e.evt.preventDefault()
    }
  }

  const onTouchEnd: Konva.KonvaEventListener<TouchEvent> = () => {
    if (gesture.current?.active) gesture.current = null
    if (isDrawing) finishStroke()
  }

  // mouse (desktop): простая версия — не мешаем уже знакомой логике
  const onMouseDown = (e: any) => {
    if (isCropping) return
    if (tool==="brush" || tool==="erase") {
      const p = stageRef.current?.getPointerPosition() || { x:0, y:0 }
      startStroke(p.x/scale, p.y/scale)
    }
  }
  const onMouseMove = () => {
    if (isDrawing) {
      const p = stageRef.current?.getPointerPosition() || { x:0, y:0 }
      appendStroke(p.x/scale, p.y/scale)
    }
  }
  const onMouseUp = () => { if (isDrawing) finishStroke() }

  // panel items for LayersPanel (desktop)
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
  const deleteLayer     = (id: string) => {
    setLayers(p => { const l = p.find(x => x.id===id); l?.node.destroy(); return p.filter(x => x.id!==id) })
    if (selectedId===id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const duplicateLayer  = (id: string) => {
    const src = layers.find(l => l.id===id)!; const clone = src.node.clone()
    clone.x(src.node.x()+20); clone.y(src.node.y()+20); (clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    setLayers(p => [...p, newLay]); select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // REORDER (точное before/after)
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
      orderTopToBottom.splice(
        insertAt > orderTopToBottom.length ? orderTopToBottom.length : insertAt, 0, src
      )

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })

    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  // ====== default tool: Brush ======
  useEffect(() => {
    // по умолчанию — кисть
    if (!tool) set({ tool: "brush" })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ====== UI ======
  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden touch-none select-none">
      {/* TOOLBAR */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n)=>set({ brushSize: n })}
        textValue={textValue} setTextValue={setTextValue}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}

        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}

        startCrop={startCrop} applyCrop={applyCrop} cancelCrop={cancelCrop} isCropping={isCropping}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}

        // моб. шторка слоёв использует эти методы
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>updateMeta(id, { blend: b as Blend }),
          onChangeOpacity: (id, o)=>updateMeta(id, { opacity: o }),
          onReorder,
        }}
      />

      {/* ПАНЕЛЬ СЛОЁВ (desktop) */}
      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={onReorder}
          onChangeBlend={(id, b)=>updateMeta(id, { blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id, { opacity: o })}
        />
      )}

      {/* СЦЕНА */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH} scale={{ x: scale, y: scale }}
          ref={stageRef}
          // мышь (десктоп)
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
          // touch-жесты
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
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
            {/* Crop UI */}
            <Rect ref={cropRectRef} visible={false} stroke="black" dash={[6,4]} strokeWidth={2} draggable />
            <Transformer ref={cropTfRef} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
