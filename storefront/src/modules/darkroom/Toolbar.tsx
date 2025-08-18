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
