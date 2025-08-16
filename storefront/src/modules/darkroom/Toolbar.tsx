"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, Layers
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

type MobileLayersItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}
type MobileLayersProps = {
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

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  mobileLayers: MobileLayersProps
}

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  = "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"
const activeBtn = "bg-black text-white"

// общий стоппер, чтобы слайдеры/инпуты не перехватывали жесты сцены
const stop = {
  onPointerDown: (e:any)=>e.stopPropagation(),
  onPointerMove: (e:any)=>e.stopPropagation(),
  onPointerUp:   (e:any)=>e.stopPropagation(),
  onTouchStart:  (e:any)=>e.stopPropagation(),
  onTouchMove:   (e:any)=>e.stopPropagation(),
  onTouchEnd:    (e:any)=>e.stopPropagation(),
  onMouseDown:   (e:any)=>e.stopPropagation(),
  onMouseMove:   (e:any)=>e.stopPropagation(),
  onMouseUp:     (e:any)=>e.stopPropagation(),
}

// плотная плоская палитра — вызывается по нажатию на свотч Color
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

// стили ползунков: толстая дорожка + квадратный «бегунок»
const RangeSkin = () => (
  <style jsx global>{`
    .dr-range {
      -webkit-appearance: none;
      width: 100%;
      height: 6px;
      background: #000;
      outline: none;
    }
    .dr-range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 16px;
      height: 16px;
      background: #fff;
      border: 2px solid #000;
      cursor: pointer;
    }
    .dr-range::-moz-range-thumb {
      width: 16px;
      height: 16px;
      background: #fff;
      border: 2px solid #000;
      cursor: pointer;
    }
  `}</style>
)

// ===================================================================

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedText, setSelectedFontSize, setSelectedColor,
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

    // text input (синхронизация с выделением)
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 260 }} onMouseDown={(e)=>e.stopPropagation()}>
        <RangeSkin/>
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
          <div className="p-2 space-y-3" onMouseDown={(e)=>e.stopPropagation()}>
            {/* row 1 — инструменты + layers */}
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
              <button className={clx(btn, layersOpen ? activeBtn : "bg-white ml-2")} onClick={(e)=>{e.stopPropagation(); toggleLayers()}}>
                <Layers className={ico}/>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...stop}/>
            </div>

            {/* row 2 — контекстные настройки */}
            {tool==="brush" && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="text-[10px] w-10">Color</div>
                  <ColorPopover swatchColor={brushColor} onPick={(c)=>{ setBrushColor(c); if (selectedKind) props.setSelectedColor(c) }}/>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-10">Size</div>
                  <input type="range" min={1} max={200} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                         className="dr-range flex-1" {...stop}/>
                  <div className="text-xs w-10 text-right">{brushSize}</div>
                </div>
              </div>
            )}

            {tool==="text" && (
              <div className="space-y-2">
                <textarea
                  value={textValue}
                  onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                  className="w-full h-16 border border-black p-1 text-sm"
                  placeholder="Enter text"
                  {...stop}
                />
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-16">Font size</div>
                  <input type="range" min={8} max={800} step={1}
                         value={selectedProps.fontSize ?? 96}
                         onChange={(e)=>props.setSelectedFontSize(parseInt(e.target.value))}
                         className="dr-range flex-1" {...stop}/>
                  <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-16">Color</div>
                  <ColorPopover swatchColor={brushColor} onPick={(c)=>{ setBrushColor(c); props.setSelectedColor(c) }}/>
                </div>
              </div>
            )}

            {tool==="shape" && (
              <div className="space-y-1">
                <div className="text-[10px]">Shapes</div>
                <div className="flex">
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
                  <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
                </div>
              </div>
            )}

            {/* row 3 — FRONT/BACK + Downloads */}
            <div className="grid grid-cols-2 gap-2">
              <button className={clx("h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
              <button className={clx("h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>BACK</button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}>
                <Download className={ico}/> <span className="text-xs">Download</span>
              </button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}>
                <Download className={ico}/> <span className="text-xs">Download</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // =================== MOBILE ===================

  const [layersOpenM, setLayersOpenM] = useState(false)
  const [showPalette, setShowPalette] = useState(false) // контекстная палитра (видна только в Brush/Text)

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
      <RangeSkin/>

      {/* Шторка LAYERS */}
      {layersOpenM && (
        <div className="fixed inset-x-0 bottom-36 z-40 px-3" onClick={()=>setLayersOpenM(false)}>
          <div className={clx(wrap, "p-2")} onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {mobileLayers.items.map((l)=>(
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

      {/* Нижняя панель — 3 строки (1: Settings, 2: Tools, 3: Front/Back + DL) */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">

        {/* row 1 — SETTINGS (контекстные, над Tools) */}
        <div className="px-2 py-1 space-y-2">
          {tool==="brush" && (
            <>
              <div className="flex items-center gap-3" {...stop}>
                <div className="text-[10px]">Color</div>
                <button className="w-8 h-8 border border-black" style={{ background: brushColor }} onClick={(e)=>{e.stopPropagation(); setShowPalette(v=>!v)}}/>
                <div className="flex-1">
                  <input type="range" min={1} max={200} step={1} value={brushSize}
                         onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                         className="dr-range w-full" {...stop}/>
                </div>
                <div className="text-xs w-10 text-right">{brushSize}</div>
              </div>
              {showPalette && (
                <FlatPalette onPick={(c)=>{ setShowPalette(false); setBrushColor(c); if (selectedKind) props.setSelectedColor(c) }}/>
              )}
            </>
          )}

          {tool==="text" && (
            <>
              <div className="flex items-center gap-2" {...stop}>
                <textarea
                  value={selectedProps.text ?? ""}
                  onChange={(e)=>setSelectedText(e.target.value)}
                  className="flex-1 h-10 border border-black p-1 text-sm"
                  placeholder="Enter text"
                />
                <button className="w-8 h-8 border border-black" style={{ background: brushColor }} onClick={(e)=>{e.stopPropagation(); setShowPalette(v=>!v)}}/>
              </div>
              <div className="flex items-center gap-2" {...stop}>
                <div className="text-[10px] w-16">Font</div>
                <input type="range" min={8} max={800} step={1}
                       value={selectedProps.fontSize ?? 96}
                       onChange={(e)=>props.setSelectedFontSize(parseInt(e.target.value))}
                       className="dr-range flex-1"/>
                <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
              </div>
              {showPalette && (
                <FlatPalette onPick={(c)=>{ setShowPalette(false); setBrushColor(c); props.setSelectedColor(c) }}/>
              )}
            </>
          )}

          {tool==="shape" && (
            <div className="flex" {...stop}>
              <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
              <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
              <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
              <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
              <button className={btn} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
            </div>
          )}
        </div>

        {/* row 2 — TOOLS */}
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move", <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text", <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}
          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <Layers className={ico}/>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...stop}/>
        </div>

        {/* row 3 — FRONT/BACK + downloads */}
        <div className="px-2 py-1 grid grid-cols-2 gap-2">
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

// ===== вспомогательные UI

function FlatPalette({ onPick }: { onPick: (c:string)=>void }) {
  return (
    <div className="grid grid-cols-12 gap-1 p-1 border border-black bg-white" {...stop}>
      {PALETTE.map((c)=>(
        <button key={c} className="h-5 w-5 border border-black/50" style={{ background: c }}
                onClick={(e)=>{ e.stopPropagation(); onPick(c) }}/>
      ))}
    </div>
  )
}

function ColorPopover({ swatchColor, onPick }:{ swatchColor:string; onPick:(c:string)=>void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" {...stop}>
      <button className="w-6 h-6 border border-black" style={{ background: swatchColor }} onClick={(e)=>{ e.stopPropagation(); setOpen(v=>!v) }}/>
      {open && (
        <div className="absolute z-50 mt-2 left-0">
          <FlatPalette onPick={(c)=>{ onPick(c); setOpen(false) }}/>
        </div>
      )}
    </div>
  )
}
