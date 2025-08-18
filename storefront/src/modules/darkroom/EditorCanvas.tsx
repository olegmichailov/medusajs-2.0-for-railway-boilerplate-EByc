storefront/src/modules/darkroom/Toolbar.tsx

"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, Layers,
  RotateCcw, RotateCw, X
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Types =====
export type MobileLayersItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

export type MobileLayersProps = {
  items: MobileLayersItem[]
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

export type ToolbarProps = {
  side: Side
  setSide: (s: Side) => void

  tool: Tool
  setTool: (t: Tool) => void

  brushColor: string
  setBrushColor: (c: string) => void

  brushSize: number
  setBrushSize: (n: number) => void

  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void

  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void

  onDownloadFront: () => void
  onDownloadBack: () => void

  onUndo: () => void
  onRedo: () => void
  onClear: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "image" | "shape" | "text" | "strokes" | null
  selectedProps: {
    text?: string
    fontSize?: number
    fontFamily?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
  }
  selectedOpacity?: number

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void
  setSelectedOpacity: (n: number) => void

  mobileLayers: MobileLayersProps
}

// ===== UI consts =====
const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  =
  "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"

const activeBtn = "bg-black text-white"
const inputStop = {
  onPointerDown: (e: any) => e.stopPropagation(),
  onPointerMove: (e: any) => e.stopPropagation(),
  onPointerUp:   (e: any) => e.stopPropagation(),
  onTouchStart:  (e: any) => e.stopPropagation(),
  onTouchMove:   (e: any) => e.stopPropagation(),
  onTouchEnd:    (e: any) => e.stopPropagation(),
  onMouseDown:   (e: any) => e.stopPropagation(),
  onMouseMove:   (e: any) => e.stopPropagation(),
  onMouseUp:     (e: any) => e.stopPropagation(),
}

const PALETTE = [
  "#000000","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF007A","#FF4D00","#FFB300","#FFD400","#FFE800","#CCFF00",
  "#66FF00","#00FFA8","#00E5FF","#00A3FF","#0066FF","#2B00FF",
  "#8A00FF","#FF00D4","#FF006A","#FF2F2F","#FF7A00","#FFAC00",
  "#FFDF00","#B5E300","#61D836","#22C55E","#10B981","#06B6D4",
  "#0EA5E9","#2563EB","#7C3AED","#C026D3","#E11D48","#8B5CF6",
  "#C084FC","#F472B6","#F59E0B","#F97316","#EA580C","#84CC16",
  "#A3E635","#22D3EE","#38BDF8","#60A5FA","#93C5FD","#FDE047",
]

// Minimal dark slider (track + black square knob)
function Fader({ value, onChange, min=0, max=1, step=0.01 }:{ value:number; onChange:(v:number)=>void; min?:number; max?:number; step?:number }){
  const ref = useRef<HTMLDivElement>(null)
  const pct = ((value - min) / (max - min)) * 100
  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = ref.current?.getBoundingClientRect(); if (!box) return
    const p = (e.clientX - box.left) / box.width
    const raw = min + p * (max - min)
    const quant = Math.round(raw / step) * step
    onChange(Math.min(max, Math.max(min, Number(quant.toFixed(4)))))
  }
  return (
    <div className="w-full flex items-center" {...inputStop}>
      <div ref={ref} className="relative h-2 w-full bg-black/10 border border-black cursor-pointer" onMouseDown={handle} onMouseMove={(e)=>e.buttons===1&&handle(e)}>
        <div className="absolute -top-[3px] h-3 w-3 bg-black" style={{ left: `calc(${pct}% - 6px)` }} />
      </div>
    </div>
  )
}

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    onUndo, onRedo, onClear,
    toggleLayers, layersOpen,
    selectedKind, selectedProps, selectedOpacity,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor, setSelectedOpacity,
    mobileLayers,
  } = props

  // =================== DESKTOP ===================
  if (!isMobile) {
    const [open, setOpen] = useState(true)
    const [pos, setPos] = useState({ x: 24, y: 120 })
    const drag = useRef<{ dx: number; dy: number } | null>(null)

    const onDragStart = (e: React.MouseEvent) => {
      drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      window.addEventListener("mousemove", onDragMove)
      window.addEventListener("mouseup", onDragEnd)
    }
    const onDragMove = (e: MouseEvent) => {
      if (!drag.current) return
      setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
    }
    const onDragEnd = () => {
      drag.current = null
      window.removeEventListener("mousemove", onDragMove)
      window.removeEventListener("mouseup", onDragEnd)
    }

    // upload
    const fileRef = useRef<HTMLInputElement>(null)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    // Текст: локальное значение
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 260 }} onMouseDown={(e)=>e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-2 py-1 text-[10px] tracking-widest">TOOLS</div>
          <div className="flex">
            <button className={btn} onClick={(e)=>{e.stopPropagation(); setOpen(!open)}}>
              {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
            </button>
            <button className={btn} onMouseDown={onDragStart}><Move className={ico}/></button>
          </div>
        </div>

        {open && (
          <div className="p-2 space-y-2">
            {/* row 1 — инструменты + layers + undo/redo/clear */}
            <div className="flex flex-wrap gap-y-1">
              {[
                {t:"move",   icon:<Move className={ico}/>} ,
                {t:"brush",  icon:<Brush className={ico}/>} ,
                {t:"erase",  icon:<Eraser className={ico}/>} ,
                {t:"text",   icon:<TypeIcon className={ico}/>} ,
                {t:"image",  icon:<ImageIcon className={ico}/>} ,
                {t:"shape",  icon:<Shapes className={ico}/>},
              ].map((b)=> (
                <button key={b.t}
                  className={clx(btn, tool===b.t ? activeBtn : "bg-white")}
                  onClick={(e)=>{ e.stopPropagation();
                    if (b.t==="image") fileRef.current?.click();
                    else if (b.t==="text") onAddText();
                    else if (b.t==="shape") setTool("shape" as Tool);
                    else setTool(b.t as Tool)
                  }}
                  title={b.t}
                >{b.icon}</button>
              ))}

              <button className={clx(btn, layersOpen ? activeBtn : "bg-white ml-2")} onClick={(e)=>{e.stopPropagation(); toggleLayers()}}><Layers className={ico}/></button>
              <button className={clx(btn, "bg-white ml-2")} onClick={onUndo} title="Undo"><RotateCcw className={ico}/></button>
              <button className={clx(btn, "bg-white -ml-[1px]")} onClick={onRedo} title="Redo"><RotateCw className={ico}/></button>
              <button className={clx(btn, "bg-white -ml-[1px]")} onClick={onClear} title="Clear"><X className={ico}/></button>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
            </div>

            {/* row 2 — цвет + size + opacity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-8">Color</div>
                <div className="w-6 h-6 border border-black cursor-pointer" style={{ background: brushColor }} />
                <div className="flex-1">
                  <input type="range" min={1} max={200} step={1} value={brushSize}
                    onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                    className="w-full" style={{ accentColor: "#000" }} {...inputStop}/>
                </div>
              </div>

              {/* палитра */}
              <div className="grid grid-cols-12 gap-1" {...inputStop}>
                {PALETTE.map((c)=> (
                  <button key={c}
                    className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                    style={{ background: c }}
                    onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (selectedKind) props.setSelectedColor(c) }}
                  />
                ))}
              </div>

              {/* text props */}
              <div className="pt-1 space-y-2">
                <div className="text-[10px]">Text</div>
                <textarea
                  value={textValue}
                  onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                  className="w-full h-16 border border-black p-1 text-sm"
                  placeholder="Enter text"
                  {...inputStop}
                />
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Font size</div>
                  <input type="range" min={8} max={800} step={1} value={selectedProps.fontSize ?? 96}
                    onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
                    className="flex-1" style={{ accentColor: "#000" }} {...inputStop}/>
                  <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
                </div>
              </div>

              {/* opacity of selected */}
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-12">Opacity</div>
                <input type="range" min={0} max={1} step={0.01} value={selectedOpacity ?? 1}
                  onChange={(e)=>setSelectedOpacity(parseFloat(e.target.value))}
                  className="flex-1" style={{ accentColor: "#000" }} {...inputStop}/>
                <div className="text-xs w-10 text-right">{Math.round(((selectedOpacity ?? 1)*100))}%</div>
              </div>
            </div>

            {/* FRONT/BACK + downloads */}
            <div className="grid grid-cols-2 gap-2">
              <button className={clx("h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
              <button className={clx("h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>BACK</button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}><Download className={ico}/> <span className="text-xs">Download</span></button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}><Download className={ico}/> <span className="text-xs">Download</span></button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // =================== MOBILE ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >{icon}</button>
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation(); const f = e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value = ""
  }

  // color swatch with native picker
  const colorInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {/* LAYERS sheet */}
      {layersOpenM && (
        <div className="fixed inset-x-0 bottom-36 z-40 px-3">
          <div className={clx(wrap, "p-2")}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {mobileLayers.items.map((l)=> (
                <div key={l.id} className="flex items-center gap-2 border border-black px-2 py-1 bg-white">
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)}>{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveUp(l.id)}><ArrowUp className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveDown(l.id)}><ArrowDown className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onDuplicate(l.id)}><Copy className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleLock(l.id)}>{l.locked?<Lock className="w-3 h-3"/>:<Unlock className="w-3 h-3"/>}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleVisible(l.id)}>{l.visible?<Eye className="w-3 h-3"/>:<EyeOff className="w-3 h-3"/>}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>mobileLayers.onDelete(l.id)}><Trash2 className="w-3 h-3"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom panel — 3 rows */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 — tools + layers + undo/redo/clear */}
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move", <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text", <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}

          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}><Layers className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white ml-1" onClick={onUndo}><RotateCcw className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white -ml-[1px]" onClick={onRedo}><RotateCw className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white -ml-[1px]" onClick={onClear}><X className={ico}/></button>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>

        {/* row 2 — ONLY faders + color swatch */}
        <div className="px-2 py-2 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[10px] mb-1">Size</div>
            <Fader value={brushSize} onChange={(v)=>setBrushSize(Math.round(v))} min={1} max={200} step={1} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] mb-1">Opacity</div>
            <Fader value={selectedOpacity ?? 1} onChange={(v)=>setSelectedOpacity(v)} min={0} max={1} step={0.01} />
          </div>
          <button className="h-10 w-10 border border-black" onClick={()=>colorInputRef.current?.click()} style={{ background: brushColor }} />
          <input ref={colorInputRef} type="color" className="hidden" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); if (selectedKind) setSelectedColor(e.target.value) }} />
        </div>

        {/* row 3 — FRONT/BACK + downloads */}
        <div className="px-2 pb-2 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadFront}><Download className={ico}/>DL</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadBack}><Download className={ico}/>DL</button>
          </div>
        </div>
      </div>
    </>
  )
}


⸻

storefront/src/modules/darkroom/EditorCanvas.tsx

"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== БАЗА МАКЕТА =====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// Текст — клампы
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = BASE_W * 0.95

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes"

type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon

type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isTextNode = (n: AnyNode): n is Konva.Text => n instanceof Konva.Text

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select, showLayers, toggleLayers } = useDarkroom()

  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef       = useRef<Konva.Stage>(null)
  const canvasLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef     = useRef<Konva.Layer>(null)
  const trRef          = useRef<Konva.Transformer>(null)
  const frontBgRef     = useRef<Konva.Image>(null)
  const backBgRef      = useRef<Konva.Image>(null)

  const artRootRef   = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })
  const strokesRef   = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })
  const eraserRef    = useRef<Record<Side, Konva.Group | null>>({ front: null, back: null })

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1 })

  const isTransformingRef = useRef(false)

  // Undo/Redo per side (snapshots of artRoot)
  const undoRef = useRef<Record<Side, string[]>>({ front: [], back: [] })
  const redoRef = useRef<Record<Side, string[]>>({ front: [], back: [] })
  const HISTORY_MAX = 40

  // ===== Layout / scale =====
  const [headerH, setHeaderH] = useState(64)
  const [viewportTick, setViewportTick] = useState(0)
  useLayoutEffect(() => {
    const header = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(header?.getBoundingClientRect().height ?? 64))
    const onRes = () => setViewportTick(x => x + 1)
    window.addEventListener("resize", onRes)
    window.addEventListener("orientationchange", onRes)
    // блокируем системный pinch-zoom Safari
    const preventGesture = (e: Event) => e.preventDefault()
    document.addEventListener("gesturestart", preventGesture)
    document.addEventListener("gesturechange", preventGesture)
    document.addEventListener("gestureend", preventGesture)
    return () => {
      window.removeEventListener("resize", onRes)
      window.removeEventListener("orientationchange", onRes)
      document.removeEventListener("gesturestart", preventGesture)
      document.removeEventListener("gesturechange", preventGesture)
      document.removeEventListener("gestureend", preventGesture)
    }
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 144 : 80
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [headerH, viewportTick])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  // ===== helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const metaOf = (n: AnyNode): BaseMeta | null => (n.getAttr("_meta") as BaseMeta) || null
  const setMetaOnNode = (n: AnyNode, meta: BaseMeta) => {
    n.setAttr("_meta", meta)
    n.setAttr("globalCompositeOperation", meta.blend) // важный фикс: НЕ переопределяем метод!
    ;(n as any).opacity(meta.opacity)
  }

  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null

  // create art roots
  useEffect(() => {
    if (!canvasLayerRef.current) return
    const ensureSide = (s: Side) => {
      if (artRootRef.current[s]) return
      const root = new Konva.Group({ x: 0, y: 0, visible: s === side })
      ;(root as any)._isArtRoot = true
      ;(root as any).id(uid())
      canvasLayerRef.current!.add(root)

      const strokes = new Konva.Group()
      ;(strokes as any)._isStrokesGroup = true
      ;(strokes as any).id(uid())
      root.add(strokes)

      const eraser = new Konva.Group()
      ;(eraser as any)._isEraserGroup = true
      ;(eraser as any).id(uid())
      root.add(eraser)

      artRootRef.current[s] = root
      strokesRef.current[s] = strokes
      eraserRef.current[s] = eraser
      canvasLayerRef.current?.batchDraw()
    }
    ensureSide("front"); ensureSide("back")
  }, [])

  useEffect(() => {
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    artRootRef.current.front?.visible(side === "front")
    artRootRef.current.back?.visible(side === "back")
    canvasLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side])

  const rebuildLayersFromArt = () => {
    const root = artRootRef.current[side]; if (!root) return
    const items: AnyLayer[] = []
    root.getChildren().forEach((child) => {
      if ((child as any)._isEraserGroup) return
      if ((child as any)._isStrokesGroup) {
        const meta = metaOf(child as any) || baseMeta(`strokes ${seqs.strokes}`)
        setMetaOnNode(child as any, meta)
        items.push({ id: (child as any)._id, side, node: child as any, meta, type: "strokes" })
        return
      }
      const meta = metaOf(child as any) || baseMeta(guessName(child as any))
      setMetaOnNode(child as any, meta)
      const type: LayerType = child instanceof Konva.Text ? "text" : child instanceof Konva.Image ? "image" : "shape"
      items.push({ id: (child as any)._id, side, node: child as any, meta, type })
    })
    const ordered = items.sort((a,b) => (b.node.zIndex() - a.node.zIndex()))
    setLayers(ordered)
  }

  const guessName = (n: AnyNode) => n instanceof Konva.Text ? `text ${seqs.text}` : n instanceof Konva.Image ? `image ${seqs.image}` : `shape ${seqs.shape}`

  // ===== Transformer =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)
  const textStartRef  = useRef<{w:number; x:number; fs:number} | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || tool !== "move"

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    if (disabled) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return }

    ;(n as any).draggable(true)
    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    ;(n as any).on("transformstart.guard", onStart)
    ;(n as any).on("transformend.guard", onEndT)
    detachGuard.current = () => (n as any).off(".guard")

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right","middle-left","middle-right"])
      const clampW  = (v:number)=>Math.max(TEXT_MIN_W,Math.min(v,TEXT_MAX_W))
      const clampFS = (v:number)=>Math.max(TEXT_MIN_FS,Math.min(v,TEXT_MAX_FS))
      const onStartTxt = () => { const t=n as Konva.Text; textStartRef.current = { w: t.width()||0, x: t.x(), fs: t.fontSize() } }
      const onTransform = () => {
        const t = n as Konva.Text
        const st = textStartRef.current || { w: t.width()||0, x:t.x(), fs:t.fontSize() }
        const active = (tr as any).getActiveAnchor?.() as string | undefined
        if (active === "middle-left" || active === "middle-right") {
          const sx = Math.max(0.01, t.scaleX()); const newW = clampW(st.w * sx)
          if (active === "middle-left") { const right = st.x + st.w; t.width(newW); t.x(right - newW) } else { t.width(newW); t.x(st.x) }
          t.scaleX(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY()); const next = clampFS(st.fs * s)
          t.fontSize(next); t.scaleX(1); t.scaleY(1)
        }
        t.getLayer()?.batchDraw()
      }
      const onEnd = () => { onTransform(); textStartRef.current = null }
      ;(n as any).on("transformstart.textfix", onStartTxt)
      ;(n as any).on("transform.textfix", onTransform)
      ;(n as any).on("transformend.textfix", onEnd)
      detachTextFix.current = () => (n as any).off(".textfix")
    } else {
      tr.keepRatio(true)
      tr.enabledAnchors(["top-left","top-right","bottom-left","bottom-right"])
    }
    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side, tool])

  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => { (l.node as any).draggable?.(enable && !l.meta.locked) })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
  }, [tool, layers])

  // ===== Hotkeys (desktop) =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName==="TEXTAREA" || ae.isContentEditable)) return
      // Undo/Redo
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="y") { e.preventDefault(); redo(); return }

      const n = node(selectedId); if (!n) return
      const lay = find(selectedId); if (!lay || tool!=="move") return
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3
      if (e.key === "Backspace"||e.key==="Delete") { e.preventDefault(); pushHistory(); deleteLayer(lay.id); return }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); pushHistory(); duplicateLayer(lay.id); return }
      if (e.key==="ArrowLeft")  (n as any).x((n as any).x()-step)
      if (e.key==="ArrowRight") (n as any).x((n as any).x()+step)
      if (e.key==="ArrowUp")    (n as any).y((n as any).y()-step)
      if (e.key==="ArrowDown")  (n as any).y((n as any).y()+step)
      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== History =====
  const snapshot = (s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return ""
    return root.toJSON()
  }
  const restore = (json: string, s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return
    root.getChildren().forEach(c => c.destroy())
    const tmp = Konva.Node.create(json) as Konva.Group
    tmp.getChildren().forEach(c => root.add(c))
    // rewire service groups
    let strokes = root.getChildren().find(c => (c as any)._isStrokesGroup) as Konva.Group | undefined
    let eraser  = root.getChildren().find(c => (c as any)._isEraserGroup)  as Konva.Group | undefined
    if (!strokes) { strokes = new Konva.Group(); (strokes as any)._isStrokesGroup = true; (strokes as any).id(uid()); root.add(strokes) }
    if (!eraser)  { eraser  = new Konva.Group(); (eraser  as any)._isEraserGroup  = true; (eraser  as any).id(uid());  root.add(eraser) }
    strokesRef.current[s] = strokes
    eraserRef.current[s]  = eraser
    rebuildLayersFromArt()
    canvasLayerRef.current?.batchDraw()
    requestAnimationFrame(attachTransformer)
  }
  const pushHistory = (s: Side = side) => {
    const snap = snapshot(s); if (!snap) return
    const stack = undoRef.current[s]
    stack.push(snap)
    if (stack.length > HISTORY_MAX) stack.shift()
    redoRef.current[s] = []
  }
  const undo = (s: Side = side) => {
    const u = undoRef.current[s]; const r = redoRef.current[s]
    if (u.length < 2) return
    const current = u.pop() as string
    const prev = u[u.length-1]
    r.push(current)
    restore(prev, s)
  }
  const redo = (s: Side = side) => {
    const u = undoRef.current[s]; const r = redoRef.current[s]
    const next = r.pop(); if (!next) return
    u.push(next)
    restore(next, s)
  }
  const clearSide = (s: Side = side) => {
    const root = artRootRef.current[s]; if (!root) return
    pushHistory(s)
    root.getChildren().forEach((c)=> c.destroy())
    // recreate service groups
    const strokes = new Konva.Group(); (strokes as any)._isStrokesGroup = true; (strokes as any).id(uid())
    const eraser  = new Konva.Group(); (eraser  as any)._isEraserGroup  = true; (eraser  as any).id(uid())
    root.add(strokes); root.add(eraser)
    strokesRef.current[s] = strokes
    eraserRef.current[s]  = eraser
    rebuildLayersFromArt(); select(null)
    canvasLayerRef.current?.batchDraw()
  }

  // ===== Add nodes =====
  const siteFont = () => (typeof window !== "undefined" ? window.getComputedStyle(document.body).fontFamily : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const wireSelectable = (n: AnyNode) => {
    const id = (n as any)._id as string
    ;(n as any).on("click tap", () => select(id))
    if (n instanceof Konva.Text) { ;(n as any).on("dblclick dbltap", () => startTextOverlayEdit(n)) }
  }

  const addToRoot = (n: AnyNode, type: LayerType, name?: string) => {
    const root = artRootRef.current[side]!; const eraser = eraserRef.current[side]!
    root.add(n as any); eraser.moveToTop()
    ;(n as any).id(uid())
    const meta = baseMeta(name || guessName(n))
    setMetaOnNode(n, meta)
    wireSelectable(n)
    pushHistory()
    rebuildLayersFromArt()
    select((n as any)._id)
    canvasLayerRef.current?.batchDraw()
    set({ tool: "move" as Tool })
  }

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        addToRoot(kimg, "image")
        setSeqs(s => ({ ...s, image: s.image + 1 }))
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  const onAddText = () => {
    const t = new Konva.Text({ text: "GMORKL", x: BASE_W/2-300, y: BASE_H/2-60, fontSize: 96, fontFamily: siteFont(), fontStyle: "bold", fill: brushColor, width: 600, align: "center" })
    addToRoot(t, "text", `text ${seqs.text}`)
    setSeqs(s => ({ ...s, text: s.text + 1 }))
  }

  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                           n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    addToRoot(n, "shape", `shape ${seqs.shape}`)
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
  }

  // ===== Global Erase + Brush =====
  const recacheArtRoot = () => {
    const root = artRootRef.current[side]; if (!root) return
    const bbox = root.getClientRect({ skipStroke: true, skipShadow: true })
    if (bbox.width > 0 && bbox.height > 0) {
      root.clearCache()
      root.cache({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height })
    }
  }

  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const g = ensureStrokesGroup()
      const line = new Konva.Line({ points: [x, y], stroke: brushColor, strokeWidth: brushSize, lineCap: "round", lineJoin: "round", globalCompositeOperation: "source-over" })
      g.add(line); setIsDrawing(true)
    } else if (tool === "erase") {
      const g = eraserRef.current[side]!
      const line = new Konva.Line({ points: [x, y], stroke: "#000", strokeWidth: brushSize, lineCap: "round", lineJoin: "round", globalCompositeOperation: "destination-out" })
      g.add(line); recacheArtRoot(); setIsDrawing(true)
    }
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    const group = tool === "brush" ? ensureStrokesGroup() : eraserRef.current[side]!
    const last = group.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    last.points(last.points().concat([x, y]))
    if (tool === "erase") recacheArtRoot()
    canvasLayerRef.current?.batchDraw()
  }
  const finishStroke = () => { if (isDrawing) { setIsDrawing(false); pushHistory(); rebuildLayersFromArt() } }
  const ensureStrokesGroup = () => {
    let g = strokesRef.current[side]
    if (!g) {
      g = new Konva.Group(); (g as any)._isStrokesGroup = true; (g as any).id(uid())
      setMetaOnNode(g as any, baseMeta(`strokes ${seqs.strokes}`))
      artRootRef.current[side]!.add(g); strokesRef.current[side] = g
      setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    }
    return g
  }

  // ===== Text overlay editor =====
  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!; const stBox = stage.container().getBoundingClientRect(); const abs = t.getAbsolutePosition()
    const x = stBox.left + abs.x * scale; const y = stBox.top  + abs.y * scale
    t.visible(false); trRef.current?.nodes([])
    const ta = document.createElement("textarea")
    ta.value = t.text(); ta.style.position = "absolute"; ta.style.left = `${x}px`; ta.style.top = `${y}px`; ta.style.padding = "4px 6px"; ta.style.border = "1px solid #000"; ta.style.background = "#fff"; ta.style.color = t.fill() as string; ta.style.fontFamily = t.fontFamily(); ta.style.fontWeight = t.fontStyle()?.includes("bold") ? "700" : "400"; ta.style.fontSize = `${t.fontSize() * scale}px`; ta.style.lineHeight = String(t.lineHeight()); ta.style.transformOrigin = "left top"; ta.style.zIndex = "9999"; ta.style.minWidth = `${Math.max(160, t.width() * scale || 0)}px`; ta.style.outline = "none"; ta.style.resize = "none"; ta.style.boxShadow = "0 2px 8px rgba(0,0,0,.12)"
    document.body.appendChild(ta); ta.focus(); ta.select()
    const autoGrow = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, (parseFloat(ta.style.fontSize)||16)*3) + "px" }
    autoGrow()
    const commit = (apply: boolean) => { if (apply) { t.text(ta.value); pushHistory() } ta.remove(); t.visible(true); canvasLayerRef.current?.batchDraw(); attachTransformer() }
    ta.addEventListener("input", autoGrow)
    ta.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); commit(true) } if (ev.key === "Escape") { ev.preventDefault(); commit(false) } })
    ta.addEventListener("blur", () => commit(true))
  }

  // ===== Gestures =====
  type G = { active:boolean; two:boolean; startDist:number; startAngle:number; startScale:number; startRot:number; startPos:{x:number;y:number}; centerCanvas:{x:number;y:number}; nodeId:string|null; last?:{x:number;y:number} }
  const gref = useRef<G>({ active:false, two:false, startDist:0, startAngle:0, startScale:1, startRot:0, startPos:{x:0,y:0}, centerCanvas:{x:0,y:0}, nodeId:null })
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })
  const applyAround = (node: Konva.Node, stagePoint: { x:number; y:number }, newScale: number, newRotation: number) => {
    const tr = node.getAbsoluteTransform().copy(); const inv = tr.invert(); const local = inv.point(stagePoint)
    node.scaleX(newScale); node.scaleY(newScale); node.rotation(newRotation)
    const tr2 = node.getAbsoluteTransform().copy(); const p2 = tr2.point(local); const dx = stagePoint.x - p2.x; const dy = stagePoint.y - p2.y
    node.x((node as any).x?.() + dx); node.y((node as any).y?.() + dy)
  }

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    const touches: TouchList | undefined = e.evt.touches
    if (tool === "brush" || tool === "erase") { const p = toCanvas(getStagePointer()); startStroke(p.x, p.y); return }
    if (!touches || touches.length === 1) {
      const st = stageRef.current!; const tgt = e.target as Konva.Node
      if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) { select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return }
      let pnode: Konva.Node | null = tgt; while (pnode && !pnode.getAttr("_meta")) pnode = pnode.getParent(); if (pnode) select((pnode as any)._id)
      const lay = find(selectedId)
      if (lay && !lay.meta.locked) {
        gref.current = { active: true, two: false, nodeId: lay.id, startPos: { x: (lay.node as any).x?.()??0, y: (lay.node as any).y?.()??0 }, startDist: 0, startAngle: 0, startScale: (lay.node as any).scaleX?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0, centerCanvas: toCanvas(getStagePointer()) }
      }
      return
    }
    if (touches && touches.length >= 2) {
      const lay = find(selectedId); if (!lay || lay.meta.locked) return
      const t1 = touches[0], t2 = touches[1]
      const p1 = { x: t1.clientX, y: t1.clientY }; const p2 = { x: t2.clientX, y: t2.clientY }
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2; const dx = p2.x - p1.x, dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy); const ang = Math.atan2(dy, dx)
      gref.current = { active: true, two: true, nodeId: lay.id, startDist: Math.max(dist, 0.0001), startAngle: ang, startScale: (lay.node as any).scaleX?.() ?? 1, startRot: (lay.node as any).rotation?.() ?? 0, startPos: { x: (lay.node as any).x?.() ?? 0, y: (lay.node as any).y?.() ?? 0 }, centerCanvas: toCanvas({ x: cx, y: cy }) }
      trRef.current?.nodes([]); uiLayerRef.current?.batchDraw()
    }
  }

  const onMove = (e: any) => {
    if (isTransformingRef.current) return
    const touches: TouchList | undefined = e.evt.touches
    if (tool === "brush" || tool === "erase") { if (!isDrawing) return; const p = toCanvas(getStagePointer()); appendStroke(p.x, p.y); return }
    if (gref.current.active && !gref.current.two) {
      const lay = find(gref.current.nodeId); if (!lay) return
      const p = toCanvas(getStagePointer()); const prev = gref.current.last || p
      const dx = p.x - prev.x, dy = p.y - prev.y
      ;(lay.node as any).x(((lay.node as any).x?.() ?? 0) + dx); ;(lay.node as any).y(((lay.node as any).y?.() ?? 0) + dy)
      gref.current.last = p; canvasLayerRef.current?.batchDraw(); return
    }
    if (gref.current.active && gref.current.two && touches && touches.length >= 2) {
      const lay = find(gref.current.nodeId); if (!lay) return
      const t1 = touches[0], t2 = touches[1]; const dx = t2.clientX - t1.clientX, dy = t2.clientY - t1.clientY
      const dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)
      let s = dist / gref.current.startDist; s = Math.min(Math.max(s, 0.2), 5)
      const SMOOTH = 0.25
      const targetScale = gref.current.startScale * s
      const currentScale = (lay.node as any).scaleX?.() ?? gref.current.startScale
      const newScale = currentScale + (targetScale - currentScale) * SMOOTH
      const newRot = gref.current.startRot + (ang - gref.current.startAngle) * (180 / Math.PI)
      const c = gref.current.centerCanvas; const sp = { x: c.x * scale, y: c.y * scale }
      const applyAround = (node: Konva.Node, stagePoint: { x:number;y:number }, sc:number, rot:number) => {
        const tr = node.getAbsoluteTransform().copy(); const inv = tr.invert(); const local = inv.point(stagePoint)
        node.scaleX(sc); node.scaleY(sc); node.rotation(rot)
        const tr2 = node.getAbsoluteTransform().copy(); const p2 = tr2.point(local); const dx2 = stagePoint.x - p2.x; const dy2 = stagePoint.y - p2.y
        node.x((node as any).x?.() + dx2); node.y((node as any).y?.() + dy2)
      }
      applyAround(lay.node, sp, newScale, newRot); canvasLayerRef.current?.batchDraw()
    }
  }

  const onUp = () => { if (isDrawing) finishStroke(); if (gref.current.active) { pushHistory(); rebuildLayersFromArt() } gref.current.active = false; gref.current.two = false; isTransformingRef.current = false; requestAnimationFrame(attachTransformer) }

  // ===== Data for layers / toolbar =====
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked, blend: l.meta.blend, opacity: l.meta.opacity }))
  }, [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    const l = layers.find(x=>x.id===id); if (!l) return
    const meta = { ...l.meta, ...patch }
    setMetaOnNode(l.node, meta)
    l.node.visible(meta.visible)
    l.node.getLayer()?.batchDraw()
    setLayers(prev => prev.map(x => x.id===id ? ({ ...x, meta }) : x))
    pushHistory()
  }

  const onLayerSelect = (id: string) => { select(id); if (tool !== "move") set({ tool: "move" }) }

  const deleteLayer = (id: string) => { const l = layers.find(x => x.id===id); if (!l) return; pushHistory(); l.node.destroy(); rebuildLayersFromArt(); if (selectedId === id) select(null); canvasLayerRef.current?.batchDraw() }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    pushHistory()
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x(((src.node as any).x?.() ?? 0) + 20)
    ;(clone as any).y(((src.node as any).y?.() ?? 0) + 20)
    ;(clone as any).id(uid())
    setMetaOnNode(clone, { ...src.meta, name: src.meta.name+" copy" })
    const root = artRootRef.current[side]!; const eraser = eraserRef.current[side]!
    root.add(clone as any); eraser.moveToTop()
    rebuildLayersFromArt(); select((clone as any)._id); canvasLayerRef.current?.batchDraw()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    const root = artRootRef.current[side]!; const src = root.findOne((n)=> (n as any)._id===srcId) as Konva.Node | null; const dst = root.findOne((n)=> (n as any)._id===destId) as Konva.Node | null; if (!src || !dst) return
    pushHistory()
    if (place === "before") (src as any).zIndex((dst as any).zIndex())
    else (src as any).zIndex((dst as any).zIndex()+1)
    eraserRef.current[side]?.moveToTop()
    rebuildLayersFromArt(); requestAnimationFrame(attachTransformer)
  }

  // selected snapshot for Toolbar
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps = sel && isTextNode(sel.node) ? { text: sel.node.text(), fontSize: sel.node.fontSize(), fontFamily: sel.node.fontFamily(), fill: sel.node.fill() as string } : sel && (sel.node as any).fill ? { fill: (sel.node as any).fill() ?? "#000000", stroke: (sel.node as any).stroke?.() ?? "#000000", strokeWidth: (sel.node as any).strokeWidth?.() ?? 0 } : {}
  const selectedOpacity = sel?.meta.opacity ?? 1

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (!n?.stroke) return; n.stroke(hex); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (!n?.strokeWidth) return; n.strokeWidth(w); pushHistory(); canvasLayerRef.current?.batchDraw() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); canvasLayerRef.current?.batchDraw() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); canvasLayerRef.current?.batchDraw() }
  const setSelectedColor      = (hex:string)  => { if (!sel) return; if (sel.type === "text") { (sel.node as Konva.Text).fill(hex) } else if ((sel.node as any).fill) (sel.node as any).fill(hex); canvasLayerRef.current?.batchDraw() }
  const setSelectedOpacity    = (o:number)    => { if (!sel) return; updateMeta(sel.id, { opacity: o }) }

  // ===== Download (mockup + art) =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))
    const hidden: AnyNode[] = []

    ;["front","back"].forEach((sideName) => {
      const ss = sideName as Side
      const root = artRootRef.current[ss]
      if (!root) return
      const visible = ss === s
      root.visible(visible)
      ;(visible ? null : hidden.push(root as any))
    })

    uiLayerRef.current?.visible(false)

    // with mockup
    frontBgRef.current?.visible(s === "front")
    backBgRef.current?.visible(s === "back")
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // art only
    if (s === "front") frontBgRef.current?.visible(false); else backBgRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // restore
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    artRootRef.current.front?.visible(side === "front")
    artRootRef.current.back?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 300))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ===== Render =====
  return (
    <div className="fixed inset-0 bg-white" style={{ paddingTop: padTop, paddingBottom: padBottom, overscrollBehavior: "none", WebkitUserSelect: "none", userSelect: "none" }}>
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

      <div className="w-full h-full flex items-start justify-center">
        <div style={{ touchAction: "none" }}>
          <Stage width={viewW} height={viewH} scale={{ x: scale, y: scale }} ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>
            <Layer ref={canvasLayerRef} listening={true}>
              {frontMock && (<KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />)}
              {backMock && (<KImage ref={backBgRef}  image={backMock}  visible={side==="back"}  width={BASE_W} height={BASE_H} listening={true} />)}
              {/* art roots добавляются imperatively */}
            </Layer>
            <Layer ref={uiLayerRef}>
              <Transformer ref={trRef} rotateEnabled anchorSize={12} borderStroke="black" anchorStroke="black" anchorFill="white" />
            </Layer>
          </Stage>
        </div>
      </div>

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
        onUndo={()=>undo()}
        onRedo={()=>redo()}
        onClear={()=>{ clearSide(); /* после clear можно сразу рисовать */ set({ tool: "brush" as Tool }) }}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind}
        selectedProps={selectedProps as any}
        selectedOpacity={selectedOpacity}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        setSelectedOpacity={setSelectedOpacity}
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>updateMeta(id,{ blend: b as Blend }),
          onChangeOpacity: (id, o)=>updateMeta(id,{ opacity: o }),
          onMoveUp: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}


⸻

Dockerfile (fix)

Твой лог показывает: build OK, а потом контейнер «не стартует». В твоём Dockerfile после npm run build идёт ещё один COPY . /app, который затирает папку .next. Убери финальный COPY или сделай нормальный двух-стейдж.

Ниже — минимальный рабочий одно-стейдж (просто убери последний COPY):

# ...
# build phase
COPY . /app/.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    --mount=type=cache,id=node-cache,target=/app/node_modules/.cache \
    npm run build

# IMPORTANT: no more COPY after build
# runtime
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","run","start"]

Или multi-stage (рекомендуется):

FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./
EXPOSE 3000
CMD ["npm","run","start"]

— В результате next start найдёт собранный .next и контейнер запустится без «Start command invalid».
