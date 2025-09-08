// ============================
// EditorCanvas.tsx (FINAL)
// ============================
"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Toolbar, { FXState } from "./Toolbar"
import { nanoid } from "nanoid"

// --- shared types (match your ./store) ---
type Side = "front" | "back"
type Tool = "move" | "brush" | "erase" | "text" | "image" | "shape" | "fx"
type ShapeKind = "square" | "circle" | "triangle" | "cross" | "line"

type Transform = { x: number; y: number; scale: number; rotation: number; flipX?: boolean; flipY?: boolean }

type BaseLayer = {
  id: string
  name: string
  side: Side
  type: "image" | "shape" | "text" | "strokes" | "erase"
  visible: boolean
  locked: boolean
  blend: GlobalCompositeOperation
  opacity: number
  transform: Transform
  fx?: Partial<FXState> & { enabled?: boolean }
}

type ImageLayer = BaseLayer & { type: "image"; bitmap: ImageBitmap | HTMLImageElement; w: number; h: number }

type ShapeLayer = BaseLayer & {
  type: "shape"
  kind: ShapeKind
  w: number
  h: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

type TextLayer = BaseLayer & {
  type: "text"
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  align: "left" | "center" | "right"
  lineHeight: number
  letterSpacing: number
  stroke?: string
  strokeWidth?: number
  measured?: { w: number; h: number }
}

type StrokePoint = { x: number; y: number; p: number }

type StrokesLayer = BaseLayer & {
  type: "strokes" | "erase"
  color: string
  size: number
  points: StrokePoint[]
}

type Layer = ImageLayer | ShapeLayer | TextLayer | StrokesLayer

// --- helpers ---
const DPR = typeof window !== "undefined" ? Math.max(1, Math.min(3, window.devicePixelRatio || 1)) : 1
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function makeDefaultFX(): FXState {
  return {
    method: "mono",
    shape: "dot",
    cell: 8,
    gamma: 1.0,
    minDot: 0.06,
    maxDot: 1,
    angle: 15,
    ditherSize: 4,
    diffusion: "floyd",
    duoA: "#7C3AED",
    duoB: "#22D3EE",
    angleB: -15,
  }
}

const CANVAS_W = 1200
const CANVAS_H = 800

export default function EditorCanvas() {
  // viewport + canvases
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>("move")
  const [side, setSide] = useState<Side>("front")

  // state
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [layersOpen, setLayersOpen] = useState(true)

  // brush
  const [brushColor, setBrushColor] = useState("#000000")
  const [brushSize, setBrushSize] = useState(16)

  // shapes
  const [shapeKind, setShapeKind] = useState<ShapeKind>("square")

  // FX (toolbar drives, we store last patch)
  const [fx, setFX] = useState<FXState>(makeDefaultFX())

  // selected layer derived
  const selected = useMemo(()=> layers.find(l=>l.id===selectedId), [layers, selectedId])

  // ===== Toolbar <-> Editor bindings =====
  const toggleLayers = () => setLayersOpen(v=>!v)

  const onUploadImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await img.decode().catch(()=>{})
    const layer: ImageLayer = {
      id: nanoid(),
      name: file.name || "Image",
      side,
      type: "image",
      bitmap: img,
      w: img.naturalWidth || img.width,
      h: img.naturalHeight || img.height,
      visible: true,
      locked: false,
      blend: "source-over",
      opacity: 1,
      transform: { x: CANVAS_W/2 - (img.width/2), y: CANVAS_H/2 - (img.height/2), scale: 1, rotation: 0 },
      fx: { enabled: false }
    }
    setLayers(ls => [...ls, layer])
    setSelectedId(layer.id)
  }

  const onAddText = () => {
    const layer: TextLayer = {
      id: nanoid(),
      name: "Text",
      side,
      type: "text",
      text: "Your text",
      fontSize: 120,
      fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto",
      fill: "#000000",
      align: "left",
      lineHeight: 1.1,
      letterSpacing: 0,
      visible: true,
      locked: false,
      blend: "source-over",
      opacity: 1,
      transform: { x: CANVAS_W/2 - 200, y: CANVAS_H/2 - 60, scale: 1, rotation: 0 },
    }
    setLayers(ls=>[...ls, layer])
    setSelectedId(layer.id)
  }

  const onAddShape = (k: ShapeKind) => {
    const base: ShapeLayer = {
      id: nanoid(),
      name: k.charAt(0).toUpperCase()+k.slice(1),
      side,
      type: "shape",
      kind: k,
      w: 240,
      h: 240,
      fill: brushColor,
      stroke: "#000000",
      strokeWidth: 0,
      visible: true,
      locked: false,
      blend: "source-over",
      opacity: 1,
      transform: { x: CANVAS_W/2 - 120, y: CANVAS_H/2 - 120, scale: 1, rotation: 0 },
    }
    setLayers(ls=>[...ls, base])
    setSelectedId(base.id)
  }

  const onClear = () => {
    setLayers(ls => ls.filter(l=>l.side !== side))
    setSelectedId(undefined)
  }

  const onDownloadSide = (s: Side) => {
    const c = document.createElement("canvas")
    c.width = CANVAS_W * DPR
    c.height = CANVAS_H * DPR
    const ctx = c.getContext("2d")!
    ctx.scale(DPR, DPR)
    renderAll(ctx, layers.filter(l=>l.side===s))
    const url = c.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = url
    a.download = `design-${s}.png`
    a.click()
  }

  // toolbar selected props setters
  const patchSelected = (fn: (l: Layer)=>Layer) => setLayers(ls => ls.map(l=> l.id===selectedId ? fn(l) : l))

  const setSelectedText = (t: string) => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), text: t}))
  const setSelectedFontSize = (n: number) => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), fontSize: n}))
  const setSelectedFontFamily = (f: string) => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), fontFamily: f}))
  const setSelectedColor = (hex: string) => {
    if (!selected) return
    if (selected.type==="text") patchSelected(l=>({...(l as TextLayer), fill: hex}))
    if (selected.type==="shape") patchSelected(l=>({...(l as ShapeLayer), fill: hex}))
    if (selected.type==="strokes") patchSelected(l=>({...(l as StrokesLayer), color: hex}))
  }
  const setSelectedLineHeight = (n: number) => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), lineHeight: n}))
  const setSelectedLetterSpacing = (n: number) => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), letterSpacing: n}))
  const setSelectedAlign = (a: "left"|"center"|"right") => selected?.type==="text" && patchSelected(l=>({...(l as TextLayer), align: a}))
  const setSelectedFill = (hex: string) => selected?.type==="shape" && patchSelected(l=>({...(l as ShapeLayer), fill: hex}))
  const setSelectedStroke = (hex: string) => selected?.type==="shape" && patchSelected(l=>({...(l as ShapeLayer), stroke: hex}))
  const setSelectedStrokeW = (n: number) => selected?.type==="shape" && patchSelected(l=>({...(l as ShapeLayer), strokeWidth: n}))

  // BUILD mobileLayers info
  const mobileLayers = useMemo(()=>{
    const items = layers
      .filter(l=>l.side===side)
      .slice()
      .map(l=>({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        locked: l.locked,
        blend: l.blend,
        opacity: l.opacity,
      }))
    return {
      items,
      selectedId,
      onSelect: (id: string)=> setSelectedId(id),
      onToggleVisible: (id: string)=> setLayers(ls=>ls.map(l=> l.id===id? {...l, visible: !l.visible}: l)),
      onToggleLock: (id: string)=> setLayers(ls=>ls.map(l=> l.id===id? {...l, locked: !l.locked}: l)),
      onDelete: (id: string)=> setLayers(ls=>ls.filter(l=> l.id!==id)),
      onDuplicate: (id: string)=> setLayers(ls=>{
        const i = ls.findIndex(l=>l.id===id)
        if (i<0) return ls
        const d = { ...ls[i], id: nanoid(), name: ls[i].name + " copy" } as Layer
        return [...ls.slice(0,i+1), d, ...ls.slice(i+1)]
      }),
      onMoveUp: (id: string)=> setLayers(ls=>{
        const idx = ls.findIndex(l=>l.id===id)
        if (idx<ls.length-1) { const copy = ls.slice(); [copy[idx], copy[idx+1]]=[copy[idx+1], copy[idx]]; return copy }
        return ls
      }),
      onMoveDown: (id: string)=> setLayers(ls=>{
        const idx = ls.findIndex(l=>l.id===id)
        if (idx>0) { const copy = ls.slice(); [copy[idx], copy[idx-1]]=[copy[idx-1], copy[idx]]; return copy }
        return ls
      }),
    }
  }, [layers, side, selectedId])

  // ===== Interaction =====
  const dragging = useRef<{ id: string; ox: number; oy: number; startX: number; startY: number }|null>(null)
  const stroking = useRef<boolean>(false)

  const screenToCanvas = (e: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvasRef.current!.width / rect.width) / DPR
    const y = (e.clientY - rect.top) * (canvasRef.current!.height / rect.height) / DPR
    return { x, y }
  }

  const pickTopLayerAt = (x: number, y: number) => {
    const onSide = layers.filter(l=>l.side===side && l.visible)
    for (let i=onSide.length-1; i>=0; i--) {
      const l = onSide[i]
      if (contains(l, x, y)) return l
    }
    return undefined
  }

  function contains(l: Layer, x: number, y: number): boolean {
    const { transform } = l
    const cx = x - transform.x
    const cy = y - transform.y
    const s = transform.scale || 1
    const rot = (transform.rotation||0) * Math.PI/180
    const rx = Math.cos(-rot)*cx - Math.sin(-rot)*cy
    const ry = Math.sin(-rot)*cx + Math.cos(-rot)*cy
    if (l.type==="image") return rx>=0 && ry>=0 && rx<=l.w*s && ry<=l.h*s
    if (l.type==="shape") return rx>=0 && ry>=0 && rx<=l.w*s && ry<=l.h*s
    if (l.type==="text") return rx>=0 && ry>=-l.fontSize && ry<=l.fontSize*2
    if (l.type==="strokes"||l.type==="erase") return true
    return false
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = screenToCanvas(e)
    if (tool==="brush" || tool==="erase") {
      const layer: StrokesLayer = {
        id: nanoid(),
        name: tool==="erase"?"Erase":"Stroke",
        side,
        type: tool==="erase"?"erase":"strokes",
        color: brushColor,
        size: brushSize,
        points: [{x:pos.x,y:pos.y,p:1}],
        visible: true,
        locked: false,
        blend: tool==="erase"?"destination-out":"source-over",
        opacity: 1,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      }
      setLayers(ls=>[...ls, layer])
      setSelectedId(layer.id)
      stroking.current = true
      return
    }

    // selection / move
    const hit = pickTopLayerAt(pos.x, pos.y)
    if (hit) {
      setSelectedId(hit.id)
      if (tool==="move" && !hit.locked) {
        dragging.current = { id: hit.id, ox: pos.x - hit.transform.x, oy: pos.y - hit.transform.y, startX: pos.x, startY: pos.y }
      }
    } else {
      setSelectedId(undefined)
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = screenToCanvas(e)
    if (stroking.current && selected && (selected.type==="strokes" || selected.type==="erase")) {
      setLayers(ls=>ls.map(l=> l.id===selected.id ? ({...l, points: [...(l as StrokesLayer).points, {x:pos.x,y:pos.y,p:1}]}) : l))
      return
    }
    if (dragging.current) {
      const d = dragging.current
      setLayers(ls=>ls.map(l=> l.id===d.id ? ({...l, transform: {...l.transform, x: pos.x - d.ox, y: pos.y - d.oy}} as Layer) : l))
    }
  }

  const onPointerUp = () => {
    dragging.current = null
    stroking.current = false
  }

  // ===== Rendering =====
  useEffect(()=>{
    const c = canvasRef.current!
    const o = overlayRef.current!
    c.width = CANVAS_W * DPR; c.height = CANVAS_H * DPR
    o.width = CANVAS_W * DPR; o.height = CANVAS_H * DPR
    c.style.width = CANVAS_W+"px"; c.style.height = CANVAS_H+"px"
    o.style.width = CANVAS_W+"px"; o.style.height = CANVAS_H+"px"
  }, [])

  const renderAll = useCallback((ctx: CanvasRenderingContext2D, ls: Layer[])=>{
    ctx.save()
    ctx.clearRect(0,0,CANVAS_W, CANVAS_H)
    for (const l of ls) {
      if (!l.visible) continue
      ctx.globalAlpha = l.opacity
      ctx.globalCompositeOperation = l.blend
      ctx.save()
      ctx.translate(l.transform.x, l.transform.y)
      if (l.transform.rotation) ctx.rotate(l.transform.rotation * Math.PI/180)
      const s = l.transform.scale || 1
      if (l.type==="image") drawImageLayer(ctx, l as ImageLayer, s)
      else if (l.type==="shape") drawShapeLayer(ctx, l as ShapeLayer, s)
      else if (l.type==="text") drawTextLayer(ctx, l as TextLayer, s)
      else if (l.type==="strokes" || l.type==="erase") drawStrokeLayer(ctx, l as StrokesLayer)
      ctx.restore()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = "source-over"
    }
    ctx.restore()
  }, [])

  useEffect(()=>{
    const ctx = canvasRef.current!.getContext("2d")!
    ctx.setTransform(DPR,0,0,DPR,0,0)
    renderAll(ctx, layers.filter(l=>l.side===side))
    // overlay (selection box)
    const o = overlayRef.current!.getContext("2d")!
    o.setTransform(DPR,0,0,DPR,0,0)
    o.clearRect(0,0,CANVAS_W,CANVAS_H)
    if (selected) drawSelection(o, selected)
  }, [layers, side, selected])

  function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, s: number) {
    const w = l.w * s, h = l.h * s
    if (l.fx?.enabled) {
      const fxed = applyFXToImage(l.bitmap, w, h, l.fx as FXState)
      if (fxed) ctx.drawImage(fxed, 0, 0, w, h)
      else ctx.drawImage(l.bitmap, 0, 0, w, h)
    } else {
      ctx.drawImage(l.bitmap, 0, 0, w, h)
    }
  }

  function drawShapeLayer(ctx: CanvasRenderingContext2D, l: ShapeLayer, s: number) {
    const w = l.w * s, h = l.h * s
    ctx.save()
    ctx.fillStyle = l.fill
    if (l.strokeWidth && l.strokeWidth>0) { ctx.lineWidth = l.strokeWidth; ctx.strokeStyle = l.stroke || "#000" }
    if (l.kind === "square") {
      ctx.beginPath(); ctx.rect(0,0,w,h); ctx.fill(); if (l.strokeWidth) ctx.stroke()
    } else if (l.kind === "circle") {
      ctx.beginPath(); ctx.ellipse(w/2,h/2, w/2, h/2, 0, 0, Math.PI*2); ctx.fill(); if (l.strokeWidth) ctx.stroke()
    } else if (l.kind === "triangle") {
      ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fill(); if (l.strokeWidth) ctx.stroke()
    } else if (l.kind === "cross") {
      const t = Math.min(w,h)/5
      ctx.beginPath();
      ctx.rect(w/2 - t/2, 0, t, h)
      ctx.rect(0, h/2 - t/2, w, t)
      ctx.fill(); if (l.strokeWidth) ctx.stroke()
    } else if (l.kind === "line") {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.lineWidth = Math.max(2, Math.min(w,h)/20); ctx.strokeStyle = l.fill; ctx.stroke()
    }
    ctx.restore()
  }

  function drawTextLayer(ctx: CanvasRenderingContext2D, l: TextLayer, s: number) {
    ctx.save()
    ctx.font = `${l.fontSize*s}px ${l.fontFamily}`
    ctx.textAlign = l.align as CanvasTextAlign
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = l.fill
    const x = l.align === "left" ? 0 : l.align === "center" ? 0.5*(l.measured?.w||800)*s : (l.measured?.w||800)*s
    const lines = l.text.split(/\n/)
    const lh = l.fontSize * l.lineHeight * s
    for (let i=0;i<lines.length;i++) {
      const tx = l.align === "left" ? 0 : l.align === "center" ? (l.measured?.w||0)/2*s : (l.measured?.w||0)*s
      if (l.stroke && l.strokeWidth) { ctx.lineWidth = l.strokeWidth; ctx.strokeStyle = l.stroke; ctx.strokeText(lines[i], tx, i*lh) }
      ctx.fillText(lines[i], tx, i*lh)
    }
    ctx.restore()
  }

  function drawStrokeLayer(ctx: CanvasRenderingContext2D, l: StrokesLayer) {
    ctx.save()
    ctx.globalCompositeOperation = l.type === "erase" ? "destination-out" : ctx.globalCompositeOperation
    ctx.lineJoin = ctx.lineCap = "round"
    ctx.lineWidth = l.size
    ctx.strokeStyle = l.color
    ctx.beginPath()
    for (let i=1;i<l.points.length;i++) {
      const a = l.points[i-1], b = l.points[i]
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
    ctx.restore()
  }

  function drawSelection(ctx: CanvasRenderingContext2D, l: Layer) {
    ctx.save()
    ctx.translate(l.transform.x, l.transform.y)
    if (l.transform.rotation) ctx.rotate(l.transform.rotation*Math.PI/180)
    ctx.strokeStyle = "#2563EB"
    ctx.setLineDash([6,3])
    ctx.lineWidth = 1
    const box = getLayerBox(l)
    ctx.strokeRect(0,0,box.w,box.h)
    ctx.restore()
  }

  function getLayerBox(l: Layer) { 
    if (l.type==="image") return { w: l.w * (l.transform.scale||1), h: l.h * (l.transform.scale||1) }
    if (l.type==="shape") return { w: l.w * (l.transform.scale||1), h: l.h * (l.transform.scale||1) }
    if (l.type==="text") return { w: Math.max(300, (l.measured?.w||600) * (l.transform.scale||1)), h: l.fontSize*(l.lineHeight)*1.2 * (l.transform.scale||1) }
    return { w: CANVAS_W, h: CANVAS_H }
  }

  // ===== FX pipeline (image only, non‑destructive, real‑time) =====
  function applyFXToImage(src: CanvasImageSource, w: number, h: number, state: FXState): HTMLCanvasElement | null {
    try {
      const off = document.createElement("canvas")
      off.width = Math.max(1, Math.floor(w))
      off.height = Math.max(1, Math.floor(h))
      const ictx = off.getContext("2d")!
      ictx.drawImage(src, 0, 0, off.width, off.height)
      const img = ictx.getImageData(0,0,off.width, off.height)
      const out = ictx.createImageData(off.width, off.height)

      if (state.method === "dither") {
        orderedDither(img, out, state.ditherSize)
      } else if (state.method === "diffusion") {
        diffusionDither(img, out, state.diffusion)
      } else if (state.method === "mono" || state.method === "duotone") {
        halftone(img, out, state)
      }
      ictx.putImageData(out, 0, 0)
      return off
    } catch { return null }
  }

  function lum(r:number,g:number,b:number){ return 0.2126*r + 0.7152*g + 0.0722*b }

  // Ordered Bayer matrices
  const BAYER4 = [
    [0,  8,  2, 10],
    [12, 4, 14, 6],
    [3, 11, 1,  9],
    [15, 7, 13, 5],
  ]
  const BAYER8 = [
    [0,32,8,40,2,34,10,42],
    [48,16,56,24,50,18,58,26],
    [12,44,4,36,14,46,6,38],
    [60,28,52,20,62,30,54,22],
    [3,35,11,43,1,33,9,41],
    [51,19,59,27,49,17,57,25],
    [15,47,7,39,13,45,5,37],
    [63,31,55,23,61,29,53,21],
  ]

  function orderedDither(src: ImageData, out: ImageData, size: 4|8) {
    const M = size===4?BAYER4:BAYER8
    const n = size===4?16:64
    for (let y=0;y<src.height;y++){
      for (let x=0;x<src.width;x++){
        const i = (y*src.width + x)*4
        const v = lum(src.data[i],src.data[i+1],src.data[i+2]) / 255
        const t = (M[y%size][x%size] + 0.5)/n
        const c = v < t ? 0 : 255
        out.data[i]=out.data[i+1]=out.data[i+2]=c; out.data[i+3]=255
      }
    }
  }

  function diffusionDither(src: ImageData, out: ImageData, type: "floyd"|"atkinson"){
    // copy gray
    const w=src.width,h=src.height
    const buf = new Float32Array(w*h)
    for(let i=0;i<w*h;i++){ const j=i*4; buf[i]=lum(src.data[j],src.data[j+1],src.data[j+2]) }
    const get=(x:number,y:number)=> buf[y*w+x]
    const set=(x:number,y:number,v:number)=>{ buf[y*w+x]=v }
    const weights = type==="floyd" ? 
      [[1,0,7/16],[ -1,1,3/16],[0,1,5/16],[1,1,1/16]] :
      [[1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8]]
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const old = get(x,y)
        const newv = old<128?0:255
        const err = old - newv
        out.data[(y*w+x)*4+0]=out.data[(y*w+x)*4+1]=out.data[(y*w+x)*4+2]=newv; out.data[(y*w+x)*4+3]=255
        for(const [dx,dy,wc] of weights){
          const nx=x+dx,ny=y+dy
          if(nx>=0&&nx<w&&ny>=0&&ny<h){ set(nx,ny, clamp(get(nx,ny)+err*wc,0,255) ) }
        }
      }
    }
  }

  function halftone(src: ImageData, out: ImageData, st: FXState) {
    const w = src.width, h=src.height
    // precompute cos/sin for rotation around center to avoid "под углом не совпадает" баг
    const ang = (st.angle||0) * Math.PI/180
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const cx = w/2, cy = h/2
    // helper to sample luminance at rotated grid point -> sample original image nearest-neighbor
    const sample = (gx:number, gy:number) => {
      const rx = ca*(gx-cx) - sa*(gy-cy) + cx
      const ry = sa*(gx-cx) + ca*(gy-cy) + cy
      const ix = Math.max(0, Math.min(w-1, Math.round(rx)))
      const iy = Math.max(0, Math.min(h-1, Math.round(ry)))
      const i = (iy*w+ix)*4
      const g = Math.pow(lum(src.data[i],src.data[i+1],src.data[i+2])/255, st.gamma||1)
      return g
    }
    const cell = Math.max(3, st.cell|0)
    // clear background
    for(let i=0;i<w*h;i++){ out.data[i*4+0]=out.data[i*4+1]=out.data[i*4+2]=255; out.data[i*4+3]=255 }

    const drawDot = (cxp:number, cyp:number, r:number, color:number[])=>{
      const r2=r*r
      const minx=Math.max(0, Math.floor(cxp-r)), maxx=Math.min(w-1, Math.ceil(cxp+r))
      const miny=Math.max(0, Math.floor(cyp-r)), maxy=Math.min(h-1, Math.ceil(cyp+r))
      for(let y=miny;y<=maxy;y++){
        for(let x=minx;x<=maxx;x++){
          const dx=x-cxp, dy=y-cyp
          if(dx*dx+dy*dy<=r2){
            const k=(y*w+x)*4; out.data[k]=color[0]; out.data[k+1]=color[1]; out.data[k+2]=color[2]; out.data[k+3]=255
          }
        }
      }
    }

    const colorA = hexToRgb(st.method==="duotone"? (st.duoA||"#000000") : "#000000")
    const colorB = hexToRgb(st.method==="duotone"? (st.duoB||"#ffffff") : "#ffffff")

    for(let gy=0; gy<h; gy+=cell){
      for(let gx=0; gx<w; gx+=cell){
        const g = sample(gx+cell/2, gy+cell/2) // 0..1
        const t = 1-g // darker -> bigger dot
        const r = clamp(st.minDot + t*(st.maxDot-st.minDot), 0.01, 1) * (cell/2)
        if (st.method==="duotone") {
          // layer A
          drawDot(gx+cell/2, gy+cell/2, r, colorA)
          // layer B at angleB
          if (st.angleB!==undefined) {
            const angB = (st.angleB||0)*Math.PI/180
            const cb = Math.cos(angB), sb = Math.sin(angB)
            const rx = cb*((gx+cell/2)-cx) - sb*((gy+cell/2)-cy) + cx
            const ry = sb*((gx+cell/2)-cx) + cb*((gy+cell/2)-cy) + cy
            drawDot(rx, ry, r*0.9, colorB)
          }
        } else {
          drawDot(gx+cell/2, gy+cell/2, r, colorA)
        }
      }
    }
  }

  function hexToRgb(hex:string): [number,number,number]{
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)!
    return [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)]
  }

  // ===== keyboard shortcuts =====
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return
      if (e.key==='Delete' || e.key==='Backspace') {
        setLayers(ls=>ls.filter(l=>l.id!==selected.id))
      } else if (e.key==='ArrowLeft') {
        patchSelected(l=>({...l, transform:{...l.transform, x:l.transform.x-1}} as Layer))
      } else if (e.key==='ArrowRight') {
        patchSelected(l=>({...l, transform:{...l.transform, x:l.transform.x+1}} as Layer))
      } else if (e.key==='ArrowUp') {
        patchSelected(l=>({...l, transform:{...l.transform, y:l.transform.y-1}} as Layer))
      } else if (e.key==='ArrowDown') {
        patchSelected(l=>({...l, transform:{...l.transform, y:l.transform.y+1}} as Layer))
      } else if (e.key==='[') {
        setLayers(ls=>{
          const i = ls.findIndex(l=>l.id===selected.id); if (i<=0) return ls
          const cp = ls.slice(); [cp[i], cp[i-1]]=[cp[i-1], cp[i]]; return cp
        })
      } else if (e.key===']') {
        setLayers(ls=>{
          const i = ls.findIndex(l=>l.id===selected.id); if (i<0||i>=ls.length-1) return ls
          const cp = ls.slice(); [cp[i], cp[i+1]]=[cp[i+1], cp[i]]; return cp
        })
      } else if (e.key==='+' || e.key==='=') {
        patchSelected(l=>({...l, transform:{...l.transform, scale:(l.transform.scale||1)*1.05}} as Layer))
      } else if (e.key==='-' || e.key==='_') {
        patchSelected(l=>({...l, transform:{...l.transform, scale:(l.transform.scale||1)/1.05}} as Layer))
      } else if (e.key==='r' || e.key==='R') {
        patchSelected(l=>({...l, transform:{...l.transform, rotation: (l.transform.rotation||0)+3}} as Layer))
      }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [selected])

  // ===== connect FX tool to selected image =====
  useEffect(()=>{
    if (tool!=="fx" || !selected) return
    if (selected.type!=="image") return
    patchSelected(l=> ({...l, fx: { ...((l as ImageLayer).fx||{}), ...fx, enabled: true } }) as Layer)
  }, [fx, tool, selectedId])

  // ===== selected props for toolbar =====
  const selectedKind: Layer["type"] | null = selected ? selected.type : null
  const selectedProps = useMemo(()=>{
    if (!selected) return {}
    if (selected.type==="text") {
      const t = selected as TextLayer
      return { text: t.text, fontSize: t.fontSize, fontFamily: t.fontFamily, fill: t.fill, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, align: t.align, stroke: t.stroke, strokeWidth: t.strokeWidth }
    }
    if (selected.type==="shape") {
      const s = selected as ShapeLayer
      return { fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth }
    }
    if (selected.type==="strokes") {
      const s = selected as StrokesLayer
      return { strokeWidth: s.size, stroke: s.color }
    }
    return {}
  }, [selected])

  return (
    <div className="w-full h-[calc(100vh-0px)] grid place-items-center bg-[conic-gradient(at_10%_10%,#fafafa,#fff)]">
      <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
        <canvas ref={canvasRef} className="bg-white border border-black/10 shadow-2xl" 
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}/>
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none"/>
        {/* Toolbar */}
        <Toolbar
          side={side}
          setSide={setSide}
          tool={tool}
          setTool={setTool}
          brushColor={brushColor}
          setBrushColor={setBrushColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          shapeKind={shapeKind}
          setShapeKind={setShapeKind}
          onUploadImage={onUploadImage}
          onAddText={onAddText}
          onAddShape={onAddShape}
          onDownloadFront={()=>onDownloadSide("front")}
          onDownloadBack={()=>onDownloadSide("back")}
          onClear={onClear}
          toggleLayers={toggleLayers}
          layersOpen={layersOpen}
          selectedKind={selectedKind}
          selectedProps={selectedProps as any}
          setSelectedFill={setSelectedFill}
          setSelectedStroke={setSelectedStroke}
          setSelectedStrokeW={setSelectedStrokeW}
          setSelectedText={setSelectedText}
          setSelectedFontSize={setSelectedFontSize}
          setSelectedFontFamily={setSelectedFontFamily}
          setSelectedColor={setSelectedColor}
          setSelectedLineHeight={setSelectedLineHeight}
          setSelectedLetterSpacing={setSelectedLetterSpacing}
          setSelectedAlign={setSelectedAlign}
          fx={fx}
          setFX={(patch)=>setFX(prev=>({ ...prev, ...patch }))}
          mobileLayers={mobileLayers}
          mobileTopOffset={0}
        />
      </div>
    </div>
  )
}
