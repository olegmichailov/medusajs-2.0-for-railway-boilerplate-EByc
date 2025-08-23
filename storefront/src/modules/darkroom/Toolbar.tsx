"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, Layers,
  AlignLeft, AlignCenter, AlignRight
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ---------- SquareSlider (квадратный бегунок) ----------
type SliderProps = {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  className?: string
}
const SquareSlider: React.FC<SliderProps> = ({ value, min, max, step = 1, onChange, className }) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)

  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  const posToVal = (clientX: number) => {
    const el = trackRef.current!
    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const raw = min + pct * (max - min)
    const snapped = Math.round(raw / step) * step
    return clamp(snapped)
  }

  const onDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    setDrag(true)
    const x = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX
    onChange(posToVal(x))
  }
  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!drag) return
    const x = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX
    onChange(posToVal(x))
  }
  const onUp = () => setDrag(false)

  useEffect(() => {
    if (!drag) return
    const m = (e: MouseEvent) => onMove(e)
    const t = (e: TouchEvent) => onMove(e)
    window.addEventListener("mousemove", m, { passive: true })
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchmove", t, { passive: true })
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", m)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchmove", t)
      window.removeEventListener("touchend", onUp)
    }
  }, [drag])

  const pct = (value - min) / (max - min)

  return (
    <div
      ref={trackRef}
      className={clx("h-3 w-full border border-black bg-white relative cursor-pointer select-none", className)}
      onMouseDown={onDown}
      onTouchStart={onDown}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="absolute left-0 top-[5px] h-[1px] w-full bg-black/70" />
      <div
        className="absolute top-0 -mt-[2px] h-[11px] w-[11px] bg-black"
        style={{ left: `calc(${(pct * 100).toFixed(3)}% - 5.5px)` }}
      />
    </div>
  )
}

// ---------- Типы ----------
type MobileLayersItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes" | "erase"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}
type MobileLayersProps = {
  items: MobileLayersItem[]
  selectedId?: string
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

type ToolbarProps = {
  side: Side
  setSide: (s: Side) => void

  tool: Tool
  setTool: (t: Tool) => void

  brushColor: string
  setBrushColor: (hex: string) => void

  brushSize: number
  setBrushSize: (n: number) => void

  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void

  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void

  onDownloadFront: () => void
  onDownloadBack: () => void
  onClear: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "image" | "shape" | "text" | "strokes" | "erase" | null
  selectedProps: {
    text?: string
    fontSize?: number
    lineHeight?: number
    letterSpacing?: number
    fontFamily?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
    align?: "left" | "center" | "right"
  }

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void

  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedLineHeight: (n: number) => void
  setSelectedLetterSpacing: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedAlign: (a: "left" | "center" | "right") => void
  setSelectedColor: (hex: string) => void

  mobileLayers: MobileLayersProps
  mobileTopOffset?: number
}

// ---------- UI константы ----------
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

// =======================================================
// DESKTOP
// =======================================================
export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack, onClear,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedLineHeight, setSelectedLetterSpacing, setSelectedFontFamily, setSelectedAlign, setSelectedColor,
    mobileLayers,
  } = props

  const [showColor, setShowColor] = useState(false)

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

    const fileRef = useRef<HTMLInputElement>(null)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div
        className={clx("fixed", wrap)}
        style={{ left: pos.x, top: pos.y, width: 260 }}
        onMouseDown={(e)=>e.stopPropagation()}
      >
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
            {/* row 1 — инструменты + layers + clear */}
            <div className="flex">
              {[
                {t:"move",   icon:<Move className={ico}/>},
                {t:"brush",  icon:<Brush className={ico}/>},
                {t:"erase",  icon:<Eraser className={ico}/>},
                {t:"text",   icon:<TypeIcon className={ico}/>},
                {t:"image",  icon:<ImageIcon className={ico}/>},
                {t:"shape",  icon:<Shapes className={ico}/>},
              ].map((b)=>(
                <button
                  key={b.t}
                  className={clx(btn, tool===b.t ? activeBtn : "bg-white")}
                  onClick={(e)=>{ e.stopPropagation(); if (b.t==="image") fileRef.current?.click(); else if(b.t==="text") onAddText(); else if(b.t==="shape") setTool("shape" as Tool); else setTool(b.t as Tool) }}
                  title={b.t}
                >{b.icon}</button>
              ))}
              <button className={clx(btn, "ml-2 bg-white")} onClick={(e)=>{e.stopPropagation(); onClear()}} title="Clear">
                <Trash2 className={ico}/>
              </button>
              <button className={clx(btn, layersOpen ? activeBtn : "bg-white")} onClick={(e)=>{e.stopPropagation(); toggleLayers()}} title="Layers">
                <Layers className={ico}/>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
            </div>

            {/* row 2 — цвет + размер кисти */}
            <div className="flex items-center gap-3">
              <button
                className="text-[10px] w-8 text-left border border-black px-1 bg-white"
                onClick={()=>setShowColor(v=>!v)}
              >Color</button>
              <div className="w-6 h-6 border border-black cursor-pointer" style={{ background: brushColor }} />
              <div className="flex-1">
                <SquareSlider value={brushSize} min={1} max={200} step={1} onChange={setBrushSize}/>
              </div>
            </div>

            {/* палитра */}
            {showColor && (
              <div className="grid grid-cols-12 gap-1" {...inputStop}>
                {PALETTE.map((c)=>(
                  <button
                    key={c}
                    className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                    style={{ background: c }}
                    onClick={(e)=>{ e.stopPropagation(); setShowColor(false); setBrushColor(c); if (selectedKind) props.setSelectedColor(c) }}
                  />
                ))}
              </div>
            )}

            {/* shapes */}
            <div className="pt-1">
              <div className="text-[10px] mb-1">Shapes</div>
              <div className="flex">
                <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
                <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
                <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
                <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
                <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
              </div>
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
                <div className="text-[10px] w-16">Font size</div>
                <div className="flex-1">
                  <SquareSlider value={selectedProps.fontSize ?? 96} min={8} max={800} step={1}
                    onChange={(v)=>setSelectedFontSize(v)}
                  />
                </div>
                <div className="flex gap-[1px] ml-2">
                  <button className={clx(btn, "w-9 h-9", selectedProps.align==="left" ? activeBtn:"bg-white")} onClick={()=>setSelectedAlign("left")}><AlignLeft className={ico}/></button>
                  <button className={clx(btn, "w-9 h-9", selectedProps.align==="center" ? activeBtn:"bg-white")} onClick={()=>setSelectedAlign("center")}><AlignCenter className={ico}/></button>
                  <button className={clx(btn, "w-9 h-9", selectedProps.align==="right" ? activeBtn:"bg-white")} onClick={()=>setSelectedAlign("right")}><AlignRight className={ico}/></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-16">Line height</div>
                <div className="flex-1">
                  <SquareSlider value={selectedProps.lineHeight ?? 1} min={0.5} max={3} step={0.01} onChange={setSelectedLineHeight}/>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-16">Letter space</div>
                <div className="flex-1">
                  <SquareSlider value={selectedProps.letterSpacing ?? 0} min={-20} max={60} step={0.5} onChange={setSelectedLetterSpacing}/>
                </div>
              </div>
            </div>

            {/* FRONT/BACK + downloads */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex">
                <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
                <button className="h-10 px-2 border border-black bg-white -ml-[1px]" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}>
                  <Download className={ico}/>
                </button>
              </div>
              <div className="flex">
                <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>BACK</button>
                <button className="h-10 px-2 border border-black bg-white -ml-[1px]" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}>
                  <Download className={ico}/>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // =======================================================
  // MOBILE — 3 строки
  // =======================================================
  const [layersOpenM, setLayersOpenM] = useState(false)
  const [showColorM, setShowColorM] = useState(false)

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >
      {icon}
    </button>
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <>
      {/* LAYERS drawer */}
      {layersOpenM && (
        <div className="fixed inset-x-0 bottom-36 z-40 px-3">
          <div className={clx(wrap, "p-2")}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {mobileLayers.items.map((l)=>(
                <div key={l.id} className={clx("flex items-center gap-2 border border-black px-2 py-1 bg-white", mobileLayers.selectedId===l.id && "bg-black/5")}>
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

      {/* ROW 1 — TOOLS + CLEAR + LAYERS */}
      <div className="fixed inset-x-0 bottom-[144px] z-50 bg-white/95 border-t border-black/10">
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move", <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text", <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}
          <div className="flex-1" />
          <button className="h-12 px-3 border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onClear()}}>Clear</button>
          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <Layers className={ico}/>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>
      </div>

      {/* ROW 2 — SETTINGS */}
      <div className="fixed inset-x-0 bottom-[72px] z-50 bg-white/95 border-t border-black/10">
        <div className="px-2 py-2 flex items-center gap-3" {...inputStop}>
          {tool==="brush" || tool==="erase" ? (
            <>
              <div className="text-[10px] w-12">Size</div>
              <div className="flex-1">
                <SquareSlider value={brushSize} min={1} max={200} step={1} onChange={setBrushSize}/>
              </div>
            </>
          ) : tool==="text" ? (
            <>
              <input
                className="w-20 h-9 border border-black px-1 text-sm"
                value={selectedProps.text ?? ""}
                onChange={(e)=>setSelectedText(e.target.value)}
                placeholder="Aa"
              />
              <div className="text-[10px] w-16">Size</div>
              <div className="flex-1">
                <SquareSlider value={selectedProps.fontSize ?? 96} min={8} max={800} step={1} onChange={setSelectedFontSize}/>
              </div>
              <button className={clx("h-9 w-9 border border-black", selectedProps.align==="left"?activeBtn:"bg-white")} onClick={()=>setSelectedAlign("left")}><AlignLeft className="w-3 h-3"/></button>
              <button className={clx("h-9 w-9 border border-black -ml-[1px]", selectedProps.align==="center"?activeBtn:"bg-white")} onClick={()=>setSelectedAlign("center")}><AlignCenter className="w-3 h-3"/></button>
              <button className={clx("h-9 w-9 border border-black -ml-[1px]", selectedProps.align==="right"?activeBtn:"bg-white")} onClick={()=>setSelectedAlign("right")}><AlignRight className="w-3 h-3"/></button>
            </>
          ) : (
            <>
              <button className="text-[10px] border border-black px-2 py-1 bg-white" onClick={()=>setShowColorM(v=>!v)}>Color</button>
              {showColorM && (
                <div className="grid grid-cols-10 gap-1 p-2 border border-black bg-white">
                  {PALETTE.slice(0,20).map((c)=>(
                    <button key={c} className="w-5 h-5 border border-black/40"
                      style={{background:c}}
                      onClick={(e)=>{e.stopPropagation(); setShowColorM(false); setBrushColor(c); if (selectedKind) setSelectedColor(c)}}
                    />
                  ))}
                </div>
              )}
              {(tool==="image" || tool==="shape") && (
                <div className="flex gap-1">
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ROW 3 — FRONT/BACK + DL */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        <div className="px-2 py-2 grid grid-cols-2 gap-2">
          <div className="flex">
            <button className={clx("flex-1 h-10 border border-black rounded-none", props.side==="front"?activeBtn:"bg-white")}
                    onClick={()=>props.setSide("front")}>
              FRONT
            </button>
            <button className="h-10 px-2 border border-black bg-white rounded-none -ml-[1px]"
                    onClick={props.onDownloadFront}>
              <Download className={ico}/>
            </button>
          </div>
          <div className="flex">
            <button className={clx("flex-1 h-10 border border-black rounded-none", props.side==="back"?activeBtn:"bg-white")}
                    onClick={()=>props.setSide("back")}>
              BACK
            </button>
            <button className="h-10 px-2 border border-black bg-white rounded-none -ml-[1px]"
                    onClick={props.onDownloadBack}>
              <Download className={ico}/>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
