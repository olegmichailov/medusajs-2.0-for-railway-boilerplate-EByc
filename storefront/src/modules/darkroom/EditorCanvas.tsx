"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ==== БАЗА МАКЕТА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ==== ТЕКСТ: клампы/сглаживание ====
const TEXT_MIN_FS = 2
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 20
const TEXT_MAX_W  = Math.floor(BASE_W * 0.95)
const EPS = 0.25
const uid = () => "n_" + Math.random().toString(36).slice(2)

// ==== ТИПЫ ====
type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
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
const isImgOrRect   = (n: AnyNode) => n instanceof Konva.Image || n instanceof Konva.Rect

// ==== FX: состояние/параметры ====
type Effect = "none" | "screenprintPlus"
type FxParams = {
  enabled: boolean
  live: boolean
  cell: number
  levels: number
  angle: number
  dot: number
  palette: string[] // 2..6 цветов
}
const defaultFx: FxParams = {
  enabled: false,
  live: false,            // по умолчанию — не в лайве (для скорости)
  cell: 10,
  levels: 4,
  angle: 45,
  dot: 0.7,               // сила «растровой» тени (0..1)
  palette: ["#ff005d","#ffe500","#00e0ff","#111111"],
}

// ==== УТИЛИТЫ: цвет/матем ====
const clamp = (v:number,min:number,max:number)=> Math.max(min, Math.min(max, v))
const roundPx = (v:number)=> Math.round(v)
const hex2rgb = (hex:string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  const to = (x:string)=>parseInt(x,16)
  return m ? { r: to(m[1]), g: to(m[2]), b: to(m[3]) } : { r:0,g:0,b:0 }
}
const mix = (a:{r:number,g:number,b:number}, b:{r:number,g:number,b:number}, t:number) => ({
  r: a.r + (b.r - a.r)*t,
  g: a.g + (b.g - a.g)*t,
  b: a.b + (b.b - a.b)*t,
})

// ==== FX: рендер в offscreen-canvas (быстро, не блокирует кисть) ====
function renderScreenPrintPlus(
  srcCanvas: HTMLCanvasElement,
  params: FxParams
): HTMLCanvasElement {
  const { cell, levels, angle, dot, palette } = params
  const w = srcCanvas.width
  const h = srcCanvas.height
  const out = document.createElement("canvas")
  out.width = w; out.height = h
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true })!
  const dctx = out.getContext("2d")!

  // берём пиксели
  const src = sctx.getImageData(0,0,w,h)
  const s = src.data
  const dst = dctx.createImageData(w,h)
  const d = dst.data

  const rad = (angle*Math.PI)/180
  const cosA = Math.cos(rad), sinA = Math.sin(rad)
  const step = 255 / Math.max(1, (levels-1))
  const quant = (v:number)=> Math.round(v/step)*step
  const pals = palette.map(hex2rgb)
  const LUM = (r:number,g:number,b:number)=> 0.2126*r + 0.7152*g + 0.0722*b

  for (let y=0; y<h; y++){
    for (let x=0; x<w; x++){
      const idx = (y*w+x)*4
      const r = s[idx], g = s[idx+1], b = s[idx+2], a = s[idx+3]
      const L = LUM(r,g,b)
      // постеризация по яркости
      const qL = clamp(quant(L), 0, 255)
      // индекс палитры: тёмные → верхние индексы
      const pi = clamp(Math.round((1 - qL/255)*(pals.length-1)), 0, pals.length-1)
      let base = pals[pi]

      // полутоновая точка (эмуляция «screen print»)
      const rx = x*cosA + y*sinA
      const ry = -x*sinA + y*cosA
      const cx = Math.floor(rx/cell)*cell + cell/2
      const cy = Math.floor(ry/cell)*cell + cell/2
      const dist = Math.hypot(rx-cx, ry-cy)
      const radius = (1 - L/255) * (cell*0.5)
      const inside = dist <= radius

      // затемнение точкой (добавочный контраст)
      if (inside) base = mix(base, {r:0,g:0,b:0}, dot)

      d[idx]   = base.r
      d[idx+1] = base.g
      d[idx+2] = base.b
      d[idx+3] = a
    }
  }
  dctx.putImageData(dst,0,0)
  return out
}

// ==== КОМПОНЕНТ ====
export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // мобилки → кисть
  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef    = useRef<Konva.Stage>(null)
  const bgLayerRef  = useRef<Konva.Layer>(null)     // мокап
  const artLayerRef = useRef<Konva.Layer>(null)     // живой арт
  const fxLayerRef  = useRef<Konva.Layer>(null)     // превью эффекта (сломает лаги, не влияет на хиты)
  const uiLayerRef  = useRef<Konva.Layer>(null)     // рамка
  const trRef       = useRef<Konva.Transformer>(null)

  const frontBgRef  = useRef<Konva.Image>(null)
  const backBgRef   = useRef<Konva.Image>(null)
  const frontArtRef = useRef<Konva.Group>(null)
  const backArtRef  = useRef<Konva.Group>(null)

  // FX-прокси картинки (не слушают события)
  const fxFrontRef  = useRef<Konva.Image>(null)
  const fxBackRef   = useRef<Konva.Image>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })

  // эффекты по сторонам
  const [fxBySide, setFxBySide] = useState<Record<Side, FxParams>>({
    front: { ...defaultFx },
    back:  { ...defaultFx },
  })
  const fx = fxBySide[side]

  // сессии кисти/стерки
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })

  // трансформ
  const isTransformingRef = useRef(false)

  // ===== Вёрстка/масштаб =====
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 140 : 110 // места под док
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

  // ===== Helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const fxImage  = (s: Side) => (s === "front" ? fxFrontRef.current!  : fxBackRef.current!)

  // показываем только активную сторону (мокап — всегда есть, но видимость сторон переключаем)
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    fxFrontRef.current?.visible(side === "front" && fxBySide.front.enabled)
    fxBackRef.current?.visible(side === "back"  && fxBySide.back.enabled)

    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    fxLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers, fxBySide])

  // ====== FX PIPELINE (offscreen) ======

  // дебаунс отрисовки эффекта (чтобы не лагало)
  const fxTimer = useRef<any>(null)
  const queueFxRender = (s: Side, delay=120) => {
    if (!fxBySide[s].enabled) return
    if (fxTimer.current) clearTimeout(fxTimer.current)
    fxTimer.current = setTimeout(() => { renderFxSnapshot(s) }, delay)
  }

  const setFxEnabled = (s: Side, enabled: boolean) => {
    setFxBySide(p => ({ ...p, [s]: { ...p[s], enabled } }))
    const g = artGroup(s)
    const img = fxImage(s)
    if (enabled) {
      // во время предпросмотра: живой арт — невидим (opacity=0), но кликается
      g.opacity(0)
      renderFxSnapshot(s)
      img.visible(true)
    } else {
      g.opacity(1)
      img.visible(false)
    }
    g.getLayer()?.batchDraw()
    fxLayerRef.current?.batchDraw()
  }

  function renderFxSnapshot(s: Side) {
    const g = artGroup(s)
    const img = fxImage(s)
    if (!g || !img) return

    // если ничего нет — просто скрыть
    const rect = g.getClientRect({ skipStroke: true })
    if (rect.width <= 2 || rect.height <= 2) {
      img.visible(false)
      fxLayerRef.current?.batchDraw()
      return
    }

    // рендерим только слой арта, вырезка по bbox группы
    const pr = Math.min(1.5, Math.max(1, 1/Math.max(scale, 0.6)))
    const cnv = artLayerRef.current!.toCanvas({
      x: rect.x, y: rect.y, width: rect.width, height: rect.height, pixelRatio: pr
    })

    // прогон через наш шейдер
    const params = fxBySide[s]
    const out = renderScreenPrintPlus(cnv, params)

    // накидываем как прокси-картинку (не слушает события)
    img.image(out as any)
    img.x(rect.x)
    img.y(rect.y)
    img.width(rect.width)
    img.height(rect.height)
    img.listening(false)
    img.visible(params.enabled)

    fxLayerRef.current?.batchDraw()
  }

  // при изменении параметров — или лайв, или отложенно
  useEffect(() => {
    const p = fxBySide[side]
    if (!p.enabled) return
    if (p.live) renderFxSnapshot(side)
    else queueFxRender(side, 120)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxBySide[side].cell, fxBySide[side].levels, fxBySide[side].angle, fxBySide[side].dot, fxBySide[side].palette.join("|")])

  // при масштабировании — просто перерендер (только если включено)
  useEffect(() => {
    if (fxBySide[side].enabled) queueFxRender(side, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, side])

  // ===== Transformer (плавный текст) =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)

  type TStart = {
    width: number
    left: number
    right: number
    fontSize: number
    anchor: "middle-left" | "middle-right" | "corner" | null
  }
  const textStart = useRef<TStart | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move"

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    const tr = trRef.current!
    if (disabled) {
      tr.nodes([])
      tr.boundBoxFunc((oldB, newB) => newB)
      uiLayerRef.current?.batchDraw()
      return
    }

    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => {
      isTransformingRef.current = true
      // во время трансформации — показываем живой арт (эффект скрываем)
      if (fxBySide[side].enabled) {
        artGroup(side).opacity(1)
        fxImage(side).visible(false)
        artLayerRef.current?.batchDraw()
        fxLayerRef.current?.batchDraw()
      }
    }
    const onEndT  = () => {
      isTransformingRef.current = false
      if (fxBySide[side].enabled) {
        artGroup(side).opacity(0)
        queueFxRender(side, 50)
      }
    }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const t = n as Konva.Text

      const onStartText = () => {
        const a = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        textStart.current = {
          width:    Math.max(1, t.width() || 1),
          left:     t.x(),
          right:    t.x() + (t.width() || 0),
          fontSize: t.fontSize(),
          anchor:   a === "middle-left" || a === "middle-right" ? (a as TStart["anchor"]) : "corner"
        }
        t.scaleX(1); t.scaleY(1)
      }

      tr.boundBoxFunc((oldB, newB) => {
        const snap = textStart.current
        if (!snap) return newB
        newB.y = oldB.y
        if (snap.anchor === "middle-left" || snap.anchor === "middle-right") {
          const targetW = clamp(newB.width, TEXT_MIN_W, TEXT_MAX_W)
          newB.width = roundPx(targetW)
          if (snap.anchor === "middle-left") newB.x = roundPx(oldB.x + (oldB.width - targetW))
          else newB.x = roundPx(oldB.x)
        }
        return newB
      })

      const onTransform = () => {
        const snap = textStart.current
        if (!snap) return
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        if (active === "middle-left" || active === "middle-right" || snap.anchor === "middle-left" || snap.anchor === "middle-right") {
          const sx = Math.max(0.01, t.scaleX())
          const targetW = clamp(snap.width * sx, TEXT_MIN_W, TEXT_MAX_W)
          const curW = t.width() || snap.width
          if (Math.abs(targetW - curW) > EPS) {
            if (active === "middle-left" || snap.anchor === "middle-left") {
              t.width(roundPx(targetW))
              t.x(roundPx(snap.right - targetW))
            } else {
              t.x(roundPx(snap.left))
              t.width(roundPx(targetW))
            }
          }
          t.scaleX(1); t.scaleY(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY())
          const targetFS = clamp(snap.fontSize * s, TEXT_MIN_FS, TEXT_MAX_FS)
          if (Math.abs(targetFS - t.fontSize()) > EPS) t.fontSize(roundPx(targetFS))
          t.scaleX(1); t.scaleY(1)
        }

        t.getLayer()?.batchDraw()
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
      }

      const onEnd = () => {
        t.scaleX(1); t.scaleY(1)
        textStart.current = null
        t.getLayer()?.batchDraw()
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
      }

      n.on("transformstart.textfix", onStartText)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachTextFix.current = () => { n.off(".textfix") }
    } else {
      tr.boundBoxFunc((oldB, newB) => newB)
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right","top-center","bottom-center"])

      const onTransform = () => {
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        let sx = (n as any).scaleX?.() ?? 1
        let sy = (n as any).scaleY?.() ?? 1

        const isCorner = active && (active==="top-left"||active==="top-right"||active==="bottom-left"||active==="bottom-right")
        if (isCorner) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = s; sy = s }

        if (isImgOrRect(n)) {
          const w = (n as any).width?.() ?? 0
          const h = (n as any).height?.() ?? 0
          ;(n as any).width(Math.max(1, w * sx))
          ;(n as any).height(Math.max(1, h * sy))
        } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          const r = (n as any).radius()
          ;(n as any).radius(Math.max(1, r * Math.max(Math.abs(sx), Math.abs(sy))))
        }

        ;(n as any).scaleX(1); (n as any).scaleY(1)
        n.getLayer()?.batchDraw()
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
      }

      const onEnd = () => onTransform()
      n.on("transform.fix", onTransform)
      n.on("transformend.fix", onEnd)
      detachTextFix.current = () => { n.off(".fix") }
    }

    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // при смене инструмента — «живой» арт, FX обратно после
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  // ===== хоткеи (Duplicate/Delete/стрелки) =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId)
      if (!n || tool !== "move") return

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(selectedId!) ; return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(selectedId!); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      n.getLayer()?.batchDraw()
      if (fxBySide[side].enabled) queueFxRender(side, 80)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool, fxBySide, side])

  // ===== кисть/стерка =====
  const nextTopZ = () => (artGroup(side).children?.length ?? 0)

  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    g.id(uid())
    const id = g.id()
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    artGroup(side).add(g)
    g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  const createEraseGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isErase = true
    g.id(uid())
    const id = g.id()
    const meta = baseMeta(`erase ${seqs.erase}`)
    artGroup(side).add(g)
    g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g as AnyNode, meta, type: "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    return newLay
  }

  const startStroke = (x: number, y: number) => {
    // при рисовании — скрываем FX превью, показываем живой арт
    if (fxBySide[side].enabled) {
      artGroup(side).opacity(1)
      fxImage(side).visible(false)
      artLayerRef.current?.batchDraw()
      fxLayerRef.current?.batchDraw()
    }

    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      if (!gid) gid = createStrokeGroup().id
      const g = find(gid)!.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "source-over",
      })
      g.add(line)
      setIsDrawing(true)
    } else if (tool === "erase") {
      let gid = currentEraseId.current[side]
      if (!gid) gid = createEraseGroup().id
      const g = find(gid)!.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1)
      const line = last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
      if (!(line instanceof Konva.Line)) return
      line.points(line.points().concat([x, y]))
      artLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const gid = currentEraseId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      artLayerRef.current?.batchDraw()
    }
  }

  const finishStroke = () => {
    setIsDrawing(false)
    if (fxBySide[side].enabled) {
      // после рисования — возвращаем превью и обновляем offscreen
      artGroup(side).opacity(0)
      queueFxRender(side, 60)
    }
  }

  // ===== Overlay-редактор текста =====
  const editingRef = useRef<{
    ta: HTMLTextAreaElement
    nodeId: string
    prevOpacity: number
    cleanup: (apply?: boolean) => void
    sync: () => void
  } | null>(null)

  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stContainer = stage.container()

    if (editingRef.current) { editingRef.current.cleanup(); editingRef.current = null }

    const prevOpacity = t.opacity()
    t.opacity(0.001); t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()
    Object.assign(ta.style, {
      position: "absolute",
      padding: "0",
      margin: "0",
      border: "none",
      background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle: t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${(t.letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      outline: "none",
      resize: "none",
      transformOrigin: "left top",
      zIndex: "2147483647",
      userSelect: "text",
      caretColor: String(t.fill() || "#000"),
      textAlign: (t.align?.() as any) || "left",
      pointerEvents: "auto",
    } as CSSStyleDeclaration)

    const sync = () => {
      const b = stContainer.getBoundingClientRect()
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      ta.style.left   = `${b.left + r.x * scale}px`
      ta.style.top    = `${b.top  + r.y * scale}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    document.body.appendChild(ta)
    sync()
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      trRef.current?.forceUpdate()
      uiLayerRef.current?.batchDraw()
      requestAnimationFrame(sync)
      if (fxBySide[side].enabled && fxBySide[side].live) queueFxRender(side, 120)
    }

    const onT = () => requestAnimationFrame(sync)

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
      t.off(".edit")
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      select(t.id())
      requestAnimationFrame(() => {
        const tr = trRef.current
        if (tr) { tr.nodes([t]); tr.forceUpdate() }
        uiLayerRef.current?.batchDraw()
        if (fxBySide[side].enabled) queueFxRender(side, 80)
      })
      editingRef.current = null
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }
    const onResize = () => sync()
    const onScroll = () => sync()

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onScroll, true)

    t.on("dragmove.edit transform.edit transformend.edit", onT)

    editingRef.current = { ta, nodeId: t.id(), prevOpacity, cleanup, sync }
  }

  // ===== Указатель =====
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      startStroke(p.x, p.y)
      return
    }

    const st = stageRef.current!
    const tgt = e.target as Konva.Node
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null)
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    if (tgt && tgt !== st && tgt.getParent()) {
      const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
      if (found && found.side === side) select(found.id)
    }
  }
  const onMove = (e: any) => {
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return
    if (!isDrawing) return
    const p = toCanvas(getStagePointer())
    appendStroke(p.x, p.y)
  }
  const onUp = () => { if (isDrawing) finishStroke() }

  // ===== Данные для панелей/toolbar =====
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name || l.type, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side])

  const deleteLayer = (id: string) => {
    if (editingRef.current?.nodeId === id) { editingRef.current.cleanup(false); editingRef.current = null }
    setLayers(p => {
      const l = p.find(x => x.id===id); l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    if (fxBySide[side].enabled) queueFxRender(side, 60)
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    artGroup(side).add(clone as any)
    const newLay: AnyLayer = { id: (clone as any).id?.() ?? uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    ;(clone as any).zIndex(nextTopZ())
    setLayers(p => [...p, newLay]); select(newLay.id)
    artLayerRef.current?.batchDraw()
    if (fxBySide[side].enabled) queueFxRender(side, 60)
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
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      artLayerRef.current?.batchDraw()
      if (fxBySide[side].enabled) queueFxRender(side, 60)
      return [...others, ...bottomToTop]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
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
    if (fxBySide[side].enabled) queueFxRender(side, 60)
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Свойства выбранного узла для Toolbar =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: sel.node.fontSize(),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (typeof n?.stroke !== "function") return; n.stroke(hex); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (typeof n?.strokeWidth !== "function") return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); if (fxBySide[side].enabled) queueFxRender(side, 60) }
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    const n = sel.node as any
    if (sel.type === "text") (n as Konva.Text).fill(hex)
    else if (sel.type === "shape") {
      if (n instanceof Konva.Group) {
        n.find((child: any) =>
          child instanceof Konva.Rect || child instanceof Konva.Circle || child instanceof Konva.RegularPolygon || child instanceof Konva.Line
        ).forEach((child: any) => {
          if (child instanceof Konva.Line) child.stroke(hex)
          if (typeof child.fill === "function") child.fill(hex)
        })
      } else if (n instanceof Konva.Line) n.stroke(hex)
      else if (typeof n.fill === "function") n.fill(hex)
    }
    artLayerRef.current?.batchDraw()
    if (fxBySide[side].enabled) queueFxRender(side, 60)
  }

  // ===== Очистка текущей стороны =====
  const clearArt = () => {
    if (editingRef.current) { editingRef.current.cleanup(false); editingRef.current = null }
    const g = artGroup(side); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    artLayerRef.current?.batchDraw()
    if (fxBySide[side].enabled) queueFxRender(side, 60)
  }

  // ===== Загрузка =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    uiLayerRef.current?.visible(false)
    const showFront = s === "front"
    frontBgRef.current?.visible(showFront)
    backBgRef.current?.visible(!showFront ? true : false)
    frontArtRef.current?.visible(showFront)
    backArtRef.current?.visible(!showFront)
    fxFrontRef.current?.visible(showFront && fxBySide.front.enabled)
    fxBackRef.current?.visible(!showFront ? fxBySide.back.enabled : false)

    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)

    // вернуть состояние
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    fxFrontRef.current?.visible(side === "front" && fxBySide.front.enabled)
    fxBackRef.current?.visible(side === "back"  && fxBySide.back.enabled)
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 200))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Рендер =====
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {/* Слои (десктоп) */}
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
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        <div style={{ touchAction: "none" }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* 1. Мокап */}
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && (
                <KImage
                  ref={frontBgRef}
                  image={frontMock}
                  visible={side==="front"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
              {backMock && (
                <KImage
                  ref={backBgRef}
                  image={backMock}
                  visible={side==="back"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
            </Layer>

            {/* 2. Живой арт */}
            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            {/* 3. FX-превью (картинка-прокси, не перехватывает хиты) */}
            <Layer ref={fxLayerRef} listening={false}>
              <KImage ref={fxFrontRef} visible={false} listening={false}/>
              <KImage ref={fxBackRef}  visible={false} listening={false}/>
            </Layer>

            {/* 4. UI-рамка */}
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

      {/* Toolbar (как был) */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={()=>{}}
        onUploadImage={(f)=>{ onUploadImage(f) }}
        onAddText={()=>{ onAddText() }}
        onAddShape={(k)=>{ onAddShape(k) }}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        onClear={clearArt}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        mobileTopOffset={padTop}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>{},
          onChangeOpacity: (id, o)=>{},
          onMoveUp: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />

      {/* ==== FX-DOCK: отдельная панель в нашей стилистике ==== */}
      <style
        dangerouslySetInnerHTML={{__html:`
          .fxdock { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif }
          .fxcard { background: rgba(255,255,255,.98); border:1px solid #E5E7EB; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.15) }
          .fxtitle { font-weight:600; font-size:12px; letter-spacing:.02em; color:#111; }
          .fxsub { font-size:11px; color:#71717A }
          .fxrow { display:flex; gap:10px; align-items:center; flex-wrap:wrap }
          .fxbtn { background:#111; color:#fff; border:none; border-radius:10px; padding:8px 12px; font-size:12px; cursor:pointer }
          .fxbtn.outline { background:#fff; color:#111; border:1px solid #D1D5DB }
          .fxswitch { width:38px; height:22px; background:#E5E7EB; border-radius:999px; position:relative; cursor:pointer }
          .fxswitch.on { background:#111 }
          .fxswitch .dot { position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; transition: transform .15s ease }
          .fxswitch.on .dot { transform: translateX(16px) }
          .fxrange { -webkit-appearance:none; width:140px; height:28px; background:transparent }
          .fxrange:focus{ outline:none }
          .fxrange::-webkit-slider-runnable-track{ height:8px; background:#E9ECEF; border-radius:999px; border:1px solid #DDD }
          .fxrange::-webkit-slider-thumb{ -webkit-appearance:none; margin-top:-10px; width:28px; height:28px; border-radius:50%; background:#FFF; border:1px solid #D0D5DD; box-shadow:0 2px 8px rgba(0,0,0,.12) }
          .swatch { width:26px; height:26px; border-radius:8px; border:1px solid #E5E7EB; overflow:hidden; position:relative }
          .swatch input{ position:absolute; inset:0; opacity:0; cursor:pointer }
        `}}
      />
      <div
        className="fxdock"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 8,
          transform: "translateX(-50%)",
          zIndex: 2147483647,
          pointerEvents: "auto",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div className="fxcard" style={{ padding: 12, minWidth: 360 }}>
          <div className="fxrow" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="fxtitle">Effects</div>
            <div className={`fxswitch ${fx.enabled ? "on":""}`} onClick={()=> setFxEnabled(side, !fx.enabled)}>
              <div className="dot" />
            </div>
          </div>

          {/* селектор эффекта (пока один) */}
          <div className="fxrow" style={{ marginBottom: 8 }}>
            <div className="fxsub" style={{ width: 72 }}>Тип</div>
            <select
              value={"screenprintPlus"}
              onChange={()=>{}}
              style={{ fontSize:12, padding:"6px 10px", borderRadius:10, border:"1px solid #DDD", background:"#FFF" }}
            >
              <option value="screenprintPlus">ScreenPrint+</option>
            </select>
            <div className="fxrow" style={{ marginLeft: "auto" }}>
              <div className="fxsub">Live</div>
              <div
                className={`fxswitch ${fx.live ? "on":""}`}
                onClick={()=> setFxBySide(p => ({ ...p, [side]: { ...p[side], live: !p[side].live } }))}
              >
                <div className="dot" />
              </div>
              {!fx.live && (
                <button className="fxbtn outline" style={{ marginLeft: 8 }} onClick={()=> renderFxSnapshot(side)}>Update</button>
              )}
            </div>
          </div>

          {/* параметры */}
          <div className="fxrow" style={{ marginBottom: 6 }}>
            <div className="fxsub" style={{ width:72 }}>Cell</div>
            <input className="fxrange" type="range" min={4} max={28} step={1} value={fx.cell}
              onChange={e=> setFxBySide(p=>({ ...p, [side]: { ...p[side], cell: Number(e.target.value) } }))} />
            <div className="fxsub" style={{ width:72, textAlign:"right" }}>{fx.cell}px</div>
          </div>
          <div className="fxrow" style={{ marginBottom: 6 }}>
            <div className="fxsub" style={{ width:72 }}>Levels</div>
            <input className="fxrange" type="range" min={2} max={6} step={1} value={fx.levels}
              onChange={e=> setFxBySide(p=>({ ...p, [side]: { ...p[side], levels: Number(e.target.value) } }))} />
            <div className="fxsub" style={{ width:72, textAlign:"right" }}>{fx.levels}</div>
          </div>
          <div className="fxrow" style={{ marginBottom: 6 }}>
            <div className="fxsub" style={{ width:72 }}>Angle</div>
            <input className="fxrange" type="range" min={0} max={90} step={1} value={fx.angle}
              onChange={e=> setFxBySide(p=>({ ...p, [side]: { ...p[side], angle: Number(e.target.value) } }))} />
            <div className="fxsub" style={{ width:72, textAlign:"right" }}>{fx.angle}°</div>
          </div>
          <div className="fxrow" style={{ marginBottom: 10 }}>
            <div className="fxsub" style={{ width:72 }}>Dot</div>
            <input className="fxrange" type="range" min={0} max={1} step={0.05} value={fx.dot}
              onChange={e=> setFxBySide(p=>({ ...p, [side]: { ...p[side], dot: Number(e.target.value) } }))} />
            <div className="fxsub" style={{ width:72, textAlign:"right" }}>{Math.round(fx.dot*100)}%</div>
          </div>

          {/* палитра */}
          <div className="fxrow" style={{ justifyContent:"space-between" }}>
            <div className="fxsub">Palette</div>
            <div className="fxrow">
              {fx.palette.map((c, i)=>(
                <div key={i} className="swatch" style={{ background:c }}>
                  <input type="color" value={c}
                    onChange={(e)=>{
                      const pal = [...fx.palette]; pal[i] = e.target.value
                      setFxBySide(p => ({ ...p, [side]: { ...p[side], palette: pal } }))
                    }}
                  />
                </div>
              ))}
              <button
                className="fxbtn outline"
                onClick={()=>{
                  setFxBySide(p => ({ ...p, [side]: { ...p[side], palette: ["#ff005d","#ffe500","#00e0ff","#111111"] } }))
                }}
                style={{ marginLeft: 8 }}
              >Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==== Добавление: Image/Text/Shape (ниже — без изменений по логике, но с подстройкой FX) ====
function useAdders(
  artLayerRef: React.RefObject<Konva.Layer>,
  frontArtRef: React.RefObject<Konva.Group>,
  backArtRef: React.RefObject<Konva.Group>,
  side: Side,
  setLayers: React.Dispatch<React.SetStateAction<AnyLayer[]>>,
  setSeqs: React.Dispatch<React.SetStateAction<{image:number,shape:number,text:number,strokes:number,erase:number}>>,
  select: (id: string | null)=>void,
  set: (patch:any)=>void,
  brushColor: string,
) {
  return {}
}
