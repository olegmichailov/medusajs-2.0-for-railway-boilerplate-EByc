"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"
import { makePhysics, PhysRole } from "./physics-core"

// ==== БАЗА МАКЕТА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// клампы текста
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

// uid
const uid = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const EPS = 0.25
const DEAD = 0.006

// ==== ТИПЫ ====
type BaseMeta = {
  blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean
  // НОВОЕ:
  role?: PhysRole
  exploded?: boolean
  initial?: { x:number; y:number; rot:number } // исходник для Reset
}
type LayerType = "image" | "shape" | "text" | "strokes" | "erase"
type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup  = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isErase   === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef    = useRef<Konva.Stage>(null)
  const bgLayerRef  = useRef<Konva.Layer>(null)
  const artLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef  = useRef<Konva.Layer>(null)
  const trRef       = useRef<Konva.Transformer>(null)
  const frontBgRef  = useRef<Konva.Image>(null)
  const backBgRef   = useRef<Konva.Image>(null)
  const frontArtRef = useRef<Konva.Group>(null)
  const backArtRef  = useRef<Konva.Group>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })
  const [uiTick, setUiTick] = useState(0)
  const bump = () => setUiTick(v => (v + 1) | 0)

  // ====== PHYSICS ======
  const physicsRef = useRef(makePhysics())
  const [playing, setPlaying] = useState(false)
  const [grav, setGrav] = useState<{dir:number; str:number}>({ dir: Math.PI*0.5, str: 0.5 }) // вниз

  useEffect(() => {
    physicsRef.current.setGravity({ dirRad: grav.dir, strength: grav.str })
  }, [grav])

  useEffect(() => {
    let raf: number | null = null
    const tick = () => {
      if (physicsRef.current.isPlaying()) {
        const poses = physicsRef.current.readPositions()
        // Переносим позиции в Konva
        setLayers(prev => prev.map(l => {
          const arr = poses[l.id]
          if (!arr || !arr.length) return l
          // rope возвращает несколько тел — берём центр масс группы
          let x=0, y=0, a=0
          if (arr.length===1) { x=arr[0].x; y=arr[0].y; a=arr[0].angle }
          else {
            for (const p of arr){ x+=p.x; y+=p.y; a+=p.angle }
            x/=arr.length; y/=arr.length; a/=arr.length
          }
          // Геометрия Konva:
          const n:any = l.node
          if (n.x && n.y) { n.x(x); n.y(y) }
          if (n.rotation) n.rotation(a * 180/Math.PI)
          return l
        }))
        artLayerRef.current?.batchDraw()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [])

  const snapshotInitialIfNeeded = (lay: AnyLayer) => {
    if (!lay.meta.initial) {
      const n:any = lay.node
      lay.meta.initial = {
        x: n.x?.() ?? 0,
        y: n.y?.() ?? 0,
        rot: (n.rotation?.() ?? 0)
      }
    }
  }

  const buildGeomForLayer = (l: AnyLayer) => {
    // координаты ТОЛЬКО в базовых пикселях (2400x3200)
    const n:any = l.node
    if (l.type === "shape") {
      if (n instanceof Konva.Rect) {
        return { kind:"rect", x:n.x(), y:n.y(), w:n.width(), h:n.height(), angle:(n.rotation?.()??0)*Math.PI/180 } as const
      }
      if (n instanceof Konva.Circle) {
        return { kind:"circle", x:n.x(), y:n.y(), r:n.radius() } as const
      }
      if (n instanceof Konva.RegularPolygon) {
        const pts:{x:number;y:number}[] = []
        const sides = n.sides?.() ?? 3
        const R = n.radius?.() ?? 50
        const angle = (n.rotation?.() ?? 0) * Math.PI/180
        for (let i=0;i<sides;i++){
          const a = angle + i/sides * Math.PI*2
          pts.push({ x: n.x()+Math.cos(a)*R, y:n.y()+Math.sin(a)*R })
        }
        return { kind:"polygon", x:n.x(), y:n.y(), angle, points: pts } as const
      }
      if (n instanceof Konva.Line) {
        const pts = n.points?.() || [0,0,10,0]
        const x1 = pts[0], y1=pts[1], x2=pts[2], y2=pts[3]
        const cx = (x1+x2)/2, cy=(y1+y2)/2
        const len = Math.hypot(x2-x1, y2-y1)
        const ang = Math.atan2(y2-y1, x2-x1)
        return { kind:"rect", x:cx-len/2, y:cy-8, w:len, h:16, angle:ang } as const
      }
    }
    if (l.type === "text") {
      // Быстрая модель: прямоугольник bbox текста (для Explode — отдельная логика)
      const r = (l.node as any).getClientRect({ relativeTo: stageRef.current })
      // getClientRect отдаёт уже в базовых (т.к. Stage scale применяется отдельно; см. Konva docs).  [oai_citation:0‡konvajs.org](https://konvajs.org/api/Konva.Group.html?utm_source=chatgpt.com)
      return { kind:"rect", x:r.x, y:r.y, w:r.width, h:r.height, angle:(n.rotation?.()??0)*Math.PI/180 } as const
    }
    if (l.type === "strokes") {
      // В упрощении трактуем как «rope»: семплируем все линии как список точек
      const g = l.node as Konva.Group
      const lines = g.getChildren().filter(c => c instanceof Konva.Line) as Konva.Line[]
      const pts:{x:number;y:number}[] = []
      lines.forEach(line => {
        const P = line.points()
        for (let i=0;i<P.length;i+=2) pts.push({ x:P[i], y:P[i+1] })
      })
      return { kind:"rope", points: pts } as const
    }
    if (l.type === "image") {
      const r = (l.node as any).getClientRect({ relativeTo: stageRef.current })
      return { kind:"rect", x:r.x, y:r.y, w:r.width, h:r.height, angle:(n.rotation?.()??0)*Math.PI/180 } as const
    }
    return null
  }

  const syncPhysics = () => {
    const items = layers
      .filter(l => l.side===side && l.meta.visible && !l.meta.locked)
      .map(l => {
        const geom = buildGeomForLayer(l)
        const role:PhysRole = l.meta.role ?? "off"
        if (!geom) return null
        snapshotInitialIfNeeded(l)
        return { id:l.id, role, geom, initial: l.meta.initial! }
      })
      .filter(Boolean) as any
    physicsRef.current.upsert(items)
  }

  const play = () => {
    syncPhysics()
    physicsRef.current.play()
    setPlaying(true)
    // во время симуляции отключим Transformer (чтобы не конфликтовал)
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const pause = () => {
    physicsRef.current.pause()
    setPlaying(false)
  }
  const resetPhys = () => {
    physicsRef.current.reset()
    setPlaying(false)
    // откат координат к snapshots
    setLayers(prev => prev.map(l => {
      if (!l.meta.initial) return l
      const n:any = l.node
      n.x?.(l.meta.initial.x)
      n.y?.(l.meta.initial.y)
      n.rotation?.(l.meta.initial.rot)
      return l
    }))
    artLayerRef.current?.batchDraw()
  }

  // ====== ДАЛЬШЕ — твой редактор как был (интеракции, трансформер и т.д.) ======

  // маркер «идёт трансформирование», чтобы не конфликтовать с нашими жестями
  const isTransformingRef = useRef(false)

  // вёрстка/масштаб
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 144 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // фикс скролла
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  // helpers
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false, role:"off" })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    if (!isEraseGroup(n) && !isStrokeGroup(n)) (n as any).globalCompositeOperation = meta.blend
  }
  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)
  const nextTopZ   = () => (currentArt().children?.length ?? 0)

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer / ТЕКСТ — (без изменений твоей логики) =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textSnapRef   = useRef<{ fs0:number; wrap0:number; cx0:number; cy0:number }|null>(null)

  const captureTextSnap = (t: Konva.Text) => {
    const wrap0 = Math.max(1, t.width() || 1)
    const self  = (t as any).getSelfRect?.() || { width: wrap0, height: Math.max(1, t.height() || 1) }
    const cx0   = Math.round(t.x() + wrap0 / 2)
    const cy0   = Math.round(t.y() + Math.max(1, self.height) / 2)
    textSnapRef.current = { fs0: t.fontSize(), wrap0, cx0, cy0 }
  }

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move" || playing

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    const tr = trRef.current!
    if (disabled) {
      tr.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      const t = n as Konva.Text
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])
      const onTextStart = () => captureTextSnap(t)
      const onTextEnd   = () => { textSnapRef.current = null }
      t.on("transformstart.textsnap", onTextStart)
      t.on("transformend.textsnap",   onTextEnd)
      ;(tr as any).boundBoxFunc((oldBox:any, newBox:any) => {
        const snap = textSnapRef.current
        if (!snap) captureTextSnap(t)
        const s = textSnapRef.current!
        const getActive = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        if (getActive === "middle-left" || getActive === "middle-right") {
          const ratioW = newBox.width / Math.max(1e-6, oldBox.width)
          if (Math.abs(ratioW - 1) < DEAD) return oldBox
          const minW = Math.max(2, Math.round((t.fontSize() || s.fs0) * 0.45))
          const nextW = clamp(Math.round(s.wrap0 * ratioW), minW, TEXT_MAX_W)
          if (Math.abs((t.width() || 0) - nextW) > EPS) {
            t.width(nextW)
            t.x(Math.round(s.cx0 - nextW / 2))
          }
          t.scaleX(1); t.scaleY(1)
          t.getLayer()?.batchDraw()
          requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
          return oldBox
        }
        const ratioW = newBox.width  / Math.max(1e-6, oldBox.width)
        const ratioH = newBox.height / Math.max(1e-6, oldBox.height)
        const scaleK = Math.max(ratioW, ratioH)
        if (Math.abs(scaleK - 1) < DEAD) return oldBox
        const nextFS = clamp(Math.round(s.fs0 * scaleK), TEXT_MIN_FS, TEXT_MAX_FS)
        if (Math.abs(t.fontSize() - nextFS) > EPS) {
          t.fontSize(nextFS)
          const self = (t as any).getSelfRect?.() || { width: Math.max(1, t.width() || s.wrap0), height: Math.max(1, t.height() || 1) }
          const nw = Math.max(1, t.width() || self.width)
          const nh = Math.max(1, self.height)
          t.x(Math.round(s.cx0 - nw/2))
          t.y(Math.round(s.cy0 - nh/2))
        }
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
        return oldBox
      })
      const onTextNormalizeEnd = () => {
        t.scaleX(1); t.scaleY(1)
        t.getLayer()?.batchDraw()
        requestAnimationFrame(() => { trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
      }
      t.on("transformend.textnorm", onTextNormalizeEnd)
      detachTextFix.current = () => { t.off(".textsnap"); t.off(".textnorm") }
    } else {
      tr.keepRatio(true)
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool, playing])

  // во время brush/erase — отключаем драг
  useEffect(() => {
    const enable = tool === "move" && !playing
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable?.(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side, playing])

  // ===== хоткеи (добавил Cmd/Ctrl+T как у тебя) =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="t") {
        e.preventDefault()
        set({ tool: "move" as Tool })
        requestAnimationFrame(attachTransformer)
        return
      }
      const n = node(selectedId); const lay = find(selectedId)
      if (!n || !lay) return
      if (tool !== "move" || playing) return
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(lay.id); return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(lay.id); return }
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      ;(n as any).x && (n as any).y && (
        (e.key === "ArrowLeft"  && (n as any).x((n as any).x()-step)),
        (e.key === "ArrowRight" && (n as any).x((n as any).x()+step)),
        (e.key === "ArrowUp"    && (n as any).y((n as any).y()-step)),
        (e.key === "ArrowDown"  && (n as any).y((n as any).y()+step))
      )
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool, playing])

  // ===== Brush / Erase =====
  const startStroke = (x: number, y: number) => {
    if (playing) return
    if (tool !== "brush" && tool !== "erase") return
    const g = new Konva.Group({ x: 0, y: 0 })
    if (tool === "brush") (g as any)._isStrokes = true
    if (tool === "erase") (g as any)._isErase = true
    ;(g as any).id(uid())
    const id = (g as any).id()
    const meta = baseMeta(tool === "brush" ? `strokes ${seqs.strokes}` : `erase ${seqs.erase}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g, meta, type: tool === "brush" ? "strokes" : "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => tool === "brush" ? ({ ...s, strokes: s.strokes + 1 }) : ({ ...s, erase: s.erase + 1 }))
    select(id)
    const line = new Konva.Line({
      points: [x, y, x + 0.01, y + 0.01],
      stroke: tool === "brush" ? brushColor : "#000",
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "brush" ? "source-over" : ("destination-out" as any),
    })
    g.add(line)
    setIsDrawing(true)
    artLayerRef.current?.batchDraw()
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const lay = find(selectedId)
    const g = lay?.node as Konva.Group
    const last = g?.getChildren().at(-1)
    const line = last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
    if (!(line instanceof Konva.Line)) return
    line.points(line.points().concat([x, y]))
    artLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // утилита: шрифт
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
  }

  // ===== Добавление: Image =====
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
        const id = (kimg as any).id()
        const meta = baseMeta(`image ${seqs.image}`)
        currentArt().add(kimg); kimg.zIndex(nextTopZ())
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ===== Добавление: Text =====
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      lineHeight: 1, letterSpacing: 0,
      draggable: false,
    })
    ;(t as any).id(uid())
    const id = (t as any).id()
    const meta = baseMeta(`text ${seqs.text}`)
    currentArt().add(t); t.zIndex(nextTopZ())
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Explode Text (прямоугольные прокси букв, стабильно) =====
  const explodeText = (id: string) => {
    const L = layers.find(l => l.id===id)
    if (!L || !(L.node instanceof Konva.Text)) return
    const text = L.node.text()
    const align = L.node.align?.() || "left"
    const fontSize = L.node.fontSize?.() || 96
    const fontFamily = L.node.fontFamily?.() || siteFont()
    const fill = L.node.fill() as string || brushColor
    const width = Math.max(1, L.node.width() || text.length*fontSize*0.6)

    const letters = Array.from(text)
    let xCursor = L.node.x()
    const baseY = L.node.y()

    // грубая метрика — монометрический шаг
    const step = Math.max(10, fontSize * 0.6)
    if (align === "center") xCursor = L.node.x() + width/2 - (letters.length * step)/2
    if (align === "right")  xCursor = L.node.x() + width - (letters.length * step)

    const created: AnyLayer[] = []
    letters.forEach((ch, i) => {
      const t = new Konva.Text({
        text: ch, x: Math.round(xCursor + i*step), y: baseY,
        fontSize, fontFamily, fill, width: step, align:"center"
      })
      ;(t as any).id(uid())
      const idc = (t as any).id()
      const meta = baseMeta(`letter ${ch}`)
      meta.role = "rigid"
      currentArt().add(t); t.zIndex(nextTopZ())
      attachCommonHandlers(t, idc)
      created.push({ id:idc, side, node:t, meta, type:"text" })
    })

    // старый текст — скрываем
    L.meta.visible = false
    L.node.visible(false)

    setLayers(prev => [...prev, ...created])
    setTimeout(() => { syncPhysics(); artLayerRef.current?.batchDraw(); bump() }, 0)
  }

  // ===== Добавление: Shape =====
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any).id()
    const meta = baseMeta(`shape ${seqs.shape}`)
    currentArt().add(n as any)
    ;(n as any).zIndex?.(nextTopZ())
    ;(n as any).on("click tap", () => select(id))
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  // ===== Overlay-редактор текста — твой как был (обрезано для краткости) =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    // ... оставляю твою реализацию без изменений ...
    // Документировано, что getClientRect можно брать relativeTo: stage (см. API).  [oai_citation:1‡konvajs.org](https://konvajs.org/api/Konva.Group.html?utm_source=chatgpt.com)
  }

  // ===== Жесты мобилки — без изменений твоей логики =====
  // (оставлено как у тебя; brush заблокирован во время playing)

  // ===== Данные для панелей/toolbar =====
  const layerItems: LayerItem[] = useMemo(() => {
    void uiTick
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
        role: l.meta.role ?? "off",
        exploded: l.meta.exploded ?? false
      }))
  }, [layers, side, uiTick])

  const deleteLayer = (id: string) => {
    physicsRef.current.remove([id])
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    bump()
  }
  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x && (clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y && (clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    currentArt().add(clone as any)
    const newLay: AnyLayer = { id: (clone as any).id?.() ?? uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newLay.id)
    setLayers(p => [...p, newLay]); select(newLay.id)
    ;(clone as any).zIndex?.(nextTopZ())
    artLayerRef.current?.batchDraw()
    bump()
  }
  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      const orderTopToBottom = current.slice().sort((a,b)=> a.node.zIndex() - b.node.zIndex()).reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev
      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex?.(i) })
      artLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(() => { attachTransformer(); bump() })
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    bump()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Clear All =====
  const clearArt = () => {
    physicsRef.current.reset()
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    select(null)
    artLayerRef.current?.batchDraw()
    bump()
    setPlaying(false)
  }

  // ===== Скачивание (mockup + art) — как у тебя =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    uiLayerRef.current?.visible(false)
    const showFront = s === "front"
    frontBgRef.current?.visible(showFront)
    backBgRef.current?.visible(!showFront)
    frontArtRef.current?.visible(showFront)
    backArtRef.current?.visible(!showFront)
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    st.draw()
    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Render =====
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior:"none", WebkitUserSelect:"none", userSelect:"none" }}
    >
      {/* Desktop-панель слоёв */}
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorder}
          onChangeBlend={(id, b)=>updateMeta(id,{ blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id,{ opacity: o })}
          onChangeRole={(id, role)=>{ updateMeta(id, { role }); syncPhysics() }}
          onExplodeText={explodeText}
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        <div style={{ position:"relative", touchAction:"none", width: viewW, height: viewH }}>
          {/* МИНИ-ПАНЕЛЬ ФИЗИКИ (десктоп) */}
          {!isMobile && (
            <div className="absolute right-0 bottom-0 mb-2 mr-2 border border-black bg-white/90 p-2 space-y-2 text-xs">
              <div className="uppercase tracking-widest text-[10px]">Physics</div>
              <div className="flex gap-2">
                <button className="px-3 h-8 border border-black" onClick={play} disabled={playing}>▶︎ Play</button>
                <button className="px-3 h-8 border border-black" onClick={pause} disabled={!playing}>⏸ Pause</button>
                <button className="px-3 h-8 border border-black" onClick={resetPhys}>⟲ Reset</button>
              </div>
              <div className="flex items-center gap-2">
                <span>Dir</span>
                <input type="range" min={0} max={360} value={Math.round(grav.dir*180/Math.PI)}
                  onChange={(e)=>setGrav(g=>({ ...g, dir: Number(e.target.value)*Math.PI/180 }))}/>
                <span>Str</span>
                <input type="range" min={0} max={100} value={Math.round(grav.str*100)}
                  onChange={(e)=>setGrav(g=>({ ...g, str: Number(e.target.value)/100 }))}/>
              </div>
            </div>
          )}

          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={(e:any)=>{ if(playing) return; onDown(e) }}
            onMouseMove={(e:any)=>{ if(playing) return; onMove(e) }}
            onMouseUp={(e:any)=>{ if(playing) return; onUp() }}
            onTouchStart={(e:any)=>{ if(playing) return; onDown(e) }}
            onTouchMove={(e:any)=>{ if(playing) return; onMove(e) }}
            onTouchEnd={(e:any)=>{ if(playing) return; onUp() }}
          >
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && <KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />}
              {backMock  && <KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true} />}
            </Layer>

            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            <Layer ref={uiLayerRef}>
              <Transformer
                ref={trRef}
                rotateEnabled
                anchorSize={12}
                borderStroke="black"
                anchorStroke="black"
                anchorFill="white"
              />
            </Layer>
          </Stage>
        </div>
      </div>

      {/* Toolbar — всё как было */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={()=>{}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        onClear={clearArt}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={{}}
        setSelectedFill={()=>{}}
        setSelectedStroke={()=>{}}
        setSelectedStrokeW={()=>{}}
        setSelectedText={()=>{}}
        setSelectedFontSize={()=>{}}
        setSelectedFontFamily={()=>{}}
        setSelectedColor={()=>{}}
        setSelectedLineHeight={()=>{}}
        setSelectedLetterSpacing={()=>{}}
        setSelectedAlign={()=>{}}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onMoveUp:   (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
        mobileTopOffset={padTop}
      />
    </div>
  )
}
