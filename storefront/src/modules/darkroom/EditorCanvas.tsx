// storefront/src/modules/darkroom/EditorCanvas.tsx
"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ==== БАЗА МАКЕТА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MAX_W  = BASE_W

const uid = () => Math.random().toString(36).slice(2)
const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v))
const EPS = 0.25
const DEAD = 0.006

// ==== FX helpers (локальные, без сторонних пакетов) ====
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const luminance = (r: number, g: number, b: number) => clamp01(0.2126*(r/255)+0.7152*(g/255)+0.0722*(b/255))
const createCanvas = (w: number, h: number) => { const c=document.createElement("canvas"); c.width=w; c.height=h; return c }
const mapTone = (t: number, gamma: number, invert: boolean) => { let d = 1 - t; d = Math.pow(d, gamma); if (invert) d = 1 - d; return clamp01(d) }

type FXMethod = "mono" | "dither" | "diffusion" | "duotone"
type FXShape  = "dot" | "square" | "diamond" | "hex" | "line"
type FXState = {
  method: FXMethod
  shape: FXShape
  cell: number
  gamma: number
  minDot: number
  maxDot: number
  angle: number
  ditherSize: 4 | 8
  diffusion: "floyd" | "atkinson"
  duoA: string
  duoB: string
  angleB: number
}
const FX_DEFAULT: FXState = {
  method: "diffusion",
  shape: "dot",
  cell: 8,
  gamma: 1,
  minDot: 0.05,
  maxDot: 0.95,
  angle: 45,
  ditherSize: 8,
  diffusion: "floyd",
  duoA: "#111111",
  duoB: "#FF2A6D",
  angleB: 30,
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: FXShape,
  cx: number, cy: number, cell: number, frac: number, angleRad: number,
  minDot: number, maxDot: number, fill = "#000"
) {
  const a = Math.max(0, Math.min(1, minDot + (maxDot - minDot) * frac))
  if (a <= 0) return
  ctx.save()
  ctx.translate(cx, cy)
  if (shape === "line") ctx.rotate(angleRad)
  ctx.beginPath()
  if (shape === "dot") {
    const r = 0.5 * cell * Math.sqrt(a); ctx.arc(0,0,r,0,Math.PI*2)
  } else if (shape === "square" || shape === "diamond") {
    const s = cell * Math.sqrt(a); if (shape === "diamond") ctx.rotate(Math.PI/4); ctx.rect(-s/2,-s/2,s,s)
  } else if (shape === "hex") {
    const r = 0.55 * cell * Math.sqrt(a)
    for (let i=0;i<6;i++){ const th=(Math.PI/3)*i; const x=r*Math.cos(th), y=r*Math.sin(th); i?ctx.lineTo(x,y):ctx.moveTo(x,y) }
    ctx.closePath()
  } else if (shape === "line") {
    const thickness = Math.max(1, cell * a * 0.8); ctx.rect(-cell/2, -thickness/2, cell, thickness)
  }
  ctx.fillStyle = fill; ctx.fill(); ctx.restore()
}

function halftoneMono(
  dest: CanvasRenderingContext2D,
  srcData: ImageData,
  opt: { cell:number; gamma:number; minDot:number; maxDot:number; angle:number; invert:boolean; shape:FXShape; color?:string }
) {
  const { cell, gamma, minDot, maxDot, angle, invert, shape, color } = opt
  const { width, height, data } = srcData
  const angleRad = (angle * Math.PI) / 180
  dest.clearRect(0, 0, width, height)
  if (color) dest.fillStyle = color

  const lum = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) lum[p] = luminance(data[i], data[i + 1], data[i + 2])

  const cx = width / 2, cy = height / 2
  const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad)

  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const rx = x + cell * 0.5, ry = y + cell * 0.5
      const dx = rx - cx, dy = ry - cy
      const sx = cx + dx * cosA - dy * sinA, sy = cy + dx * sinA + dy * cosA
      const ix = Math.max(0, Math.min(width - 1, sx | 0)), iy = Math.max(0, Math.min(height - 1, sy | 0))
      const t = lum[iy * width + ix]; const frac = mapTone(t, gamma, invert)
      drawShape(dest, shape, rx, ry, cell, frac, angleRad, minDot, maxDot, color || "#000")
    }
  }
}

function duotoneHalftone(
  dest: CanvasRenderingContext2D,
  src: ImageData,
  p: { cell:number; gamma:number; minDot:number; maxDot:number; angle:number; angleB:number; shape:FXShape; colorA:string; colorB:string }
) {
  const A = createCanvas(src.width, src.height)
  const B = createCanvas(src.width, src.height)
  const ctxA = A.getContext("2d", { willReadFrequently: true })!
  const ctxB = B.getContext("2d", { willReadFrequently: true })!
  halftoneMono(ctxA, src, { cell:p.cell, gamma:p.gamma, minDot:p.minDot, maxDot:p.maxDot, angle:p.angle, invert:false, shape:p.shape, color:p.colorA })
  halftoneMono(ctxB, src, { cell:p.cell, gamma:p.gamma, minDot:0, maxDot:p.maxDot*0.85, angle:p.angle + p.angleB, invert:true, shape:p.shape, color:p.colorB })
  dest.clearRect(0,0,src.width,src.height)
  dest.drawImage(A,0,0); dest.drawImage(B,0,0)
}

const BAYER_4 = [ [0,8,2,10], [12,4,14,6], [3,11,1,9], [15,7,13,5] ]
const BAYER_8 = [
  [0,32,8,40,2,34,10,42], [48,16,56,24,50,18,58,26], [12,44,4,36,14,46,6,38], [60,28,52,20,62,30,54,22],
  [3,35,11,43,1,33,9,41], [51,19,59,27,49,17,57,25], [15,47,7,39,13,45,5,37], [63,31,55,23,61,29,53,21]
]
function orderedDither(dest: CanvasRenderingContext2D, src: ImageData, size: 4 | 8) {
  const { width, height, data } = src; const out = dest.getImageData(0, 0, width, height); const odata = out.data; const M = size === 4 ? BAYER_4 : BAYER_8; const N = size; const N2 = N * N
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; const L = luminance(data[i], data[i + 1], data[i + 2]); const threshold = (M[y % N][x % N] + 0.5) / N2; const v = L < threshold ? 0 : 255; odata[i] = odata[i + 1] = odata[i + 2] = v; odata[i + 3] = 255 }
  dest.putImageData(out, 0, 0)
}
function errorDiffusion(dest: CanvasRenderingContext2D, src: ImageData, method: "floyd" | "atkinson") {
  const { width, height, data } = src; const out = dest.getImageData(0, 0, width, height); const buf = new Float32Array(width * height)
  for (let p = 0, i = 0; p < buf.length; p++, i += 4) buf[p] = luminance(data[i], data[i + 1], data[i + 2]) * 255
  const get = (x: number, y: number) => buf[y * width + x]; const set = (x: number, y: number, v: number) => { buf[y * width + x] = v }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = get(x, y), newv = old < 128 ? 0 : 255, err = old - newv; set(x, y, newv)
      if (method === "floyd") {
        if (x + 1 < width) set(x + 1, y, get(x + 1, y) + err * (7 / 16))
        if (x - 1 >= 0 && y + 1 < height) set(x - 1, y + 1, get(x - 1, y + 1) + err * (3 / 16))
        if (y + 1 < height) set(x, y + 1, get(x, y + 1) + err * (5 / 16))
        if (x + 1 < width && y + 1 < height) set(x + 1, y + 1, get(x + 1, y + 1) + err * (1 / 16))
      } else {
        const w = [ [1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8] ] as const
        for (const [dx, dy, k] of w) { const nx = x + dx, ny = y + dy; if (nx>=0&&nx<width&&ny>=0&&ny<height) set(nx, ny, get(nx, ny) + err * k) }
      }
    }
  }
  const odata = out.data; for (let p = 0, i = 0; p < buf.length; p++, i += 4) { const v = buf[p] <= 0 ? 0 : buf[p] >= 255 ? 255 : buf[p]; odata[i] = odata[i + 1] = odata[i + 2] = v; odata[i + 3] = 255 }
  dest.putImageData(out, 0, 0)
}

// ==== ТИПЫ СЛОЁВ ====
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
  const fxLayerRef  = useRef<Konva.Layer>(null)
  const uiLayerRef  = useRef<Konva.Layer>(null)
  const trRef       = useRef<Konva.Transformer>(null)
  const frontBgRef  = useRef<Konva.Image>(null)
  const backBgRef   = useRef<Konva.Image>(null)
  const frontArtRef = useRef<Konva.Group>(null)
  const backArtRef  = useRef<Konva.Group>(null)
  const fxImgRef    = useRef<Konva.Image>(null)

  // FX offscreen
  const fxSrcCanvas = useRef<HTMLCanvasElement | null>(null)
  const fxOutCanvas = useRef<HTMLCanvasElement | null>(null)

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })
  const [uiTick, setUiTick] = useState(0)
  const bump = () => setUiTick(v => (v + 1) | 0)

  const [fx, setFx] = useState<FXState>(FX_DEFAULT)

  // маркер «идёт трансформирование», чтобы не конфликтовать с нашими жестями
  const isTransformingRef = useRef(false)

  // адаптивная вёрстка
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
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
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

  // ===== Transformer / ТЕКСТ — углы=fontSize, бока=wrap =====
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
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move"

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

    // guard на время трансформации
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
  useEffect(() => { attachTransformer() }, [tool])

  // ===== во время brush/erase — отключаем драг =====
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable?.(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers, side])

  // ===== хоткеи =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay) return
      if (tool !== "move") return

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
  }, [selectedId, tool])

  // ===== Brush / Erase =====
  const startStroke = (x: number, y: number) => {
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

  // ===== Overlay-редактор текста =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stBox = stage.container().getBoundingClientRect()

    const prevOpacity = t.opacity()
    t.opacity(0.01)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()

    const place = () => {
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      const left = stBox.left + r.x * scale
      const top  = stBox.top  + r.y * scale
      ta.style.left   = `${left}px`
      ta.style.top    = `${top}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
    }

    Object.assign(ta.style, {
      position: "absolute",
      padding: "0",
      margin: "0",
      border: "1px solid #111",
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
      zIndex: "9999",
      caretColor: String(t.fill() || "#000"),
      userSelect: "text",
      textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    place()
    document.body.appendChild(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => { place(); trRef.current?.forceUpdate(); uiLayerRef.current?.batchDraw() })
    }
    const commit = (apply: boolean) => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey as any)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      requestAnimationFrame(() => {
        select((t as any).id())
        attachTransformer()
        trRef.current?.nodes([t])
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
      })
    }
    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) }
      if (ev.key === "Escape") { ev.preventDefault(); commit(false) }
    }

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
  }

  // ===== Жесты (мобилка) =====
  type G = {
    active: boolean
    two: boolean
    startDist: number
    startAngle: number
    startScaleX: number
    startScaleY: number
    startRot: number
    startPos: { x: number, y: number }
    centerCanvas: { x: number, y: number }
    nodeId: string | null
    lastPointer?: { x: number, y: number }
  }
  const gestureRef = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScaleX:1, startScaleY:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const isBgTarget = (t: Konva.Node | null) =>
    !!t && (t === frontBgRef.current || t === backBgRef.current)

  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches

    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      const p = toCanvas(getStagePointer())
      startStroke(p.x, p.y)
      return
    }

    if (!touches || touches.length === 1) {
      const st = stageRef.current!
      const tgt = e.target as Konva.Node

      if (tgt === st || isBgTarget(tgt)) {
        select(null)
        trRef.current?.nodes([])
        uiLayerRef.current?.batchDraw()
        return
      }

      if (tgt && tgt !== st && tgt.getParent()) {
        const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
        if (found && found.side === side) select(found.id)
      }
      const lay = find(selectedId)
      if (lay && !isStrokeGroup(lay.node) && !lay.meta.locked) {
        gestureRef.current = {
          ...gestureRef.current,
          active: true,
          two: false,
          nodeId: lay.id,
          startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
          lastPointer: toCanvas(getStagePointer()),
          centerCanvas: toCanvas(getStagePointer()),
          startDist: 0, startAngle: 0,
          startScaleX: (lay.node as any).scaleX?.() ?? 1,
          startScaleY: (lay.node as any).scaleY?.() ?? 1,
          startRot: (lay.node as any).rotation?.() ?? 0
        }
      }
      return
    }

    if (touches && touches.length >= 2) {
      const lay = find(selectedId)
      if (!lay || isStrokeGroup(lay.node) || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }
      const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2
      const cy = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)

      gestureRef.current = {
        active: true,
        two: true,
        nodeId: lay.id,
        startDist: Math.max(dist, 0.0001),
        startAngle: ang,
        startScaleX: (lay.node as any).scaleX?.() ?? 1,
        startScaleY: (lay.node as any).scaleY?.() ?? 1,
        startRot: (lay.node as any).rotation?.() ?? 0,
        startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 },
        centerCanvas: toCanvas({ x: cx, y: cy }),
        lastPointer: undefined
      }
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    const touches: TouchList | undefined = e.evt.touches
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return

    if (tool === "brush" || tool === "erase") {
      if (!isDrawing) return
      const p = toCanvas(getStagePointer())
      appendStroke(p.x, p.y)
      return
    }

    if (gestureRef.current.active && !gestureRef.current.two) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer())
      const prev = gestureRef.current.lastPointer || p
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx)
      ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gestureRef.current.lastPointer = p
      artLayerRef.current?.batchDraw()
      if (tool === "fx") scheduleFxRender()
      return
    }

    if (gestureRef.current.active && gestureRef.current.two && touches && touches.length >= 2) {
      const lay = find(gestureRef.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]
      const dx = t2.clientX - t1.clientX
      const dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy)
      const ang  = Math.atan2(dy, dx)
      let s = dist / gestureRef.current.startDist
      s = Math.min(Math.max(s, 0.1), 10)
      const baseScale = gestureRef.current.startScaleX
      const newScale = baseScale * s
      const newRot = gestureRef.current.startRot + (ang - gestureRef.current.startAngle) * (180 / Math.PI)
      ;(lay.node as any).scaleX?.(newScale)
      ;(lay.node as any).scaleY?.(newScale)
      ;(lay.node as any).rotation?.(newRot)
      artLayerRef.current?.batchDraw()
      if (tool === "fx") scheduleFxRender()
    }
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
    gestureRef.current.active = false
    gestureRef.current.two = false
    isTransformingRef.current = false
    requestAnimationFrame(attachTransformer)
  }

  // ===== Layers panel API =====
  const layerItems = useMemo(() => {
    void uiTick
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side, uiTick])

  const deleteLayer = (id: string) => {
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    bump()
    if (tool === "fx") scheduleFxRender()
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
    if (tool === "fx") scheduleFxRender()
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
    requestAnimationFrame(() => { attachTransformer(); bump(); if (tool==="fx") scheduleFxRender() })
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
    if (tool === "fx") scheduleFxRender()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Снимки свойств выбранного узла для Toolbar =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: Math.round(sel.node.fontSize()),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
      lineHeight: sel.node.lineHeight?.(),
      letterSpacing: (sel.node as any).letterSpacing?.(),
      align: sel.node.align?.() as "left"|"center"|"right",
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill?.() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FS, TEXT_MAX_FS)); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedLineHeight = (lh:number)   => { const n = sel?.node as Konva.Text; if (!n) return; n.lineHeight(clamp(lh, 0.5, 3)); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedLetterSpacing = (ls:number)=> { const n = sel?.node as any; if (!n || typeof n.letterSpacing !== "function") return; n.letterSpacing(ls); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }
  const setSelectedAlign = (a:"left"|"center"|"right") => { const n = sel?.node as Konva.Text; if (!n) return; n.align(a); artLayerRef.current?.batchDraw(); bump(); if (tool==="fx") scheduleFxRender() }

  // ===== FX: таргет + рендер =====
  const fxNeedsHidden = () => tool !== "fx"

  const getFxTarget = () => {
    const st = stageRef.current
    if (!st) return null
    const useSelected = !!sel && sel.side === side && sel.meta.visible
    const tgtNode: Konva.Node = useSelected ? sel!.node : currentArt()
    // axis-aligned bbox в координатах stage (без масштабирования Stage)
    const rect = tgtNode.getClientRect({ relativeTo: st, skipShadow: true, skipStroke: true })
    if (!rect || !isFinite(rect.width) || rect.width <= 0 || !isFinite(rect.height) || rect.height <= 0) return null
    return { node: tgtNode, rect }
  }

  const fxRAF = useRef<number | null>(null)
  const scheduleFxRender = () => {
    if (fxNeedsHidden()) { fxLayerRef.current?.visible(false); fxLayerRef.current?.batchDraw(); return }
    if (fxRAF.current) cancelAnimationFrame(fxRAF.current)
    fxRAF.current = requestAnimationFrame(() => renderFxPreview().catch(()=>{}))
  }

  const renderFxPreview = async () => {
    const st = stageRef.current
    const fxImg = fxImgRef.current
    const fxLayer = fxLayerRef.current
    if (!st || !fxImg || !fxLayer) return

    const target = getFxTarget()
    if (!target) { fxLayer.visible(false); fxLayer.batchDraw(); return }

    const { node: tgtNode, rect } = target

    // ограничим размер оффскрина, чтобы не грузить CPU/GPU
    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const maxPreview = 1800
    const w = Math.max(1, Math.min(maxPreview, Math.round(rect.width)))
    const h = Math.max(1, Math.round(rect.height * (w / Math.max(1, rect.width))))

    fxSrcCanvas.current ||= createCanvas(w, h)
    fxOutCanvas.current ||= createCanvas(w, h)
    const src = fxSrcCanvas.current, out = fxOutCanvas.current
    if (src.width !== w || src.height !== h) { src.width = w; src.height = h }
    if (out.width !== w || out.height !== h) { out.width = w; out.height = h }

    // снимок таргета с его текущими трансформами (они "запекаются" внутрь картинки)
    const pixelRatio = Math.max(0.5, (w / Math.max(1, rect.width)) * DPR)
    const imgEl: HTMLImageElement = await new Promise((resolve) => (tgtNode as any).toImage({ pixelRatio, callback: resolve }))

    const sctx = src.getContext("2d", { willReadFrequently: true })!
    sctx.clearRect(0,0,w,h)
    sctx.drawImage(imgEl, 0, 0, w, h)
    const imgData = sctx.getImageData(0, 0, w, h)

    // FX -> out (никаких доп. поворотов! угол — как задан в UI)
    const dctx = out.getContext("2d", { willReadFrequently: true })!
    dctx.clearRect(0,0,w,h)
    if (fx.method === "mono") {
      halftoneMono(dctx, imgData, { cell: fx.cell, gamma: fx.gamma, minDot: fx.minDot, maxDot: fx.maxDot, angle: fx.angle, invert: false, shape: fx.shape })
    } else if (fx.method === "duotone") {
      duotoneHalftone(dctx, imgData, { cell: fx.cell, gamma: fx.gamma, minDot: fx.minDot, maxDot: fx.maxDot, angle: fx.angle, angleB: fx.angleB, shape: fx.shape, colorA: fx.duoA, colorB: fx.duoB })
    } else if (fx.method === "dither") {
      dctx.putImageData(imgData,0,0); orderedDither(dctx, imgData, fx.ditherSize)
    } else if (fx.method === "diffusion") {
      dctx.putImageData(imgData,0,0); errorDiffusion(dctx, imgData, fx.diffusion)
    }

    // позиционирование превью: точное совпадение axis-aligned bbox узла
    fxImg.setAttrs({
      image: out,
      x: rect.x, y: rect.y,
      width: w, height: h,
      offsetX: 0, offsetY: 0,
      rotation: 0,
      scaleX: 1, scaleY: 1,
      listening: false,
    })

    fxLayer.visible(true)
    fxLayer.batchDraw()
  }

  // Перерисовываем FX при любом изменении параметров / tool / выборов
  useEffect(() => { scheduleFxRender() }, [fx, tool, side, selectedId, uiTick])
  // Подписки на движуху выбранного узла — чтобы превью следовало «в ногу»
  useEffect(() => {
    const lay = find(selectedId); if (!lay) { scheduleFxRender(); return }
    const n = lay.node as Konva.Node
    const cb = () => scheduleFxRender()
    n.on("dragmove.fx transform.fx rotate.fx scaleXChange.fx scaleYChange.fx", cb)
    return () => { n.off(".fx") }
  }, [selectedId])

  // ===== Clear All =====
  const clearArt = () => {
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    select(null)
    artLayerRef.current?.batchDraw()
    bump()
    scheduleFxRender()
  }

  // ===== Скачивание (mockup + art) =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    // временно скрываем FX/Transformer для чистого экспорта
    const oldFxVis = fxLayerRef.current?.visible()
    fxLayerRef.current?.visible(false)
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

    // вернуть видимость
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    if (oldFxVis !== undefined) fxLayerRef.current?.visible(oldFxVis)
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
      style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect:"none", userSelect:"none" }}
    >
      {/* Слои — на десктопе */}
      {!isMobile && showLayers && (
        <Toolbar.MobileLayersPanel // если у тебя отдельный компонент — оставь твой
          // заглушка: убери, если используешь свой готовый LayersPanel
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center">
        <div style={{ position:"relative", touchAction:"none", width: viewW, height: viewH }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* Фон */}
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && <KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />}
              {backMock  && <KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true} />}
            </Layer>

            {/* Арт: две группы (front/back) */}
            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            {/* FX-слой поверх арта (live preview) */}
            <Layer ref={fxLayerRef} listening={false} visible={false}>
              <KImage ref={fxImgRef} listening={false}/>
            </Layer>

            {/* UI-слой для рамки трансформера */}
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

      {/* Toolbar */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>{ set({ tool: t }); scheduleFxRender() }}
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
        selectedKind={selectedKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={(hex)=>{ 
          if (!sel) return
          if (selectedKind === "text") (sel.node as Konva.Text).fill(hex)
          else if ((sel.node as any).fill) (sel.node as any).fill(hex)
          artLayerRef.current?.batchDraw(); 
          bump()
          if (tool==="fx") scheduleFxRender()
        }}
        setSelectedLineHeight={setSelectedLineHeight}
        setSelectedLetterSpacing={setSelectedLetterSpacing}
        setSelectedAlign={setSelectedAlign}
        // FX состояние — напрямую из EditorCanvas
        fx={fx}
        setFX={(patch)=>setFx(prev=>({ ...prev, ...patch }))}
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
