"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Layers, X as ClearIcon, GripHorizontal, ArrowUp, ArrowDown, Copy, Trash2,
  Lock, Unlock, Eye, EyeOff
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

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
  side: Side; setSide: (s: Side) => void
  tool: Tool; setTool: (t: Tool) => void
  brushColor: string; setBrushColor: (hex: string) => void
  brushSize: number; setBrushSize: (n: number) => void
  shapeKind: ShapeKind; setShapeKind: (k: ShapeKind) => void
  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  onClear: () => void
  toggleLayers: () => void
  layersOpen: boolean
  selectedKind: "image" | "shape" | "text" | "strokes" | "erase" | null
  selectedProps: { text?: string; fontSize?: number; fontFamily?: string; fill?: string; stroke?: string; strokeWidth?: number }
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void
  mobileTopOffset: number
  mobileLayers: MobileLayersProps
}

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  =
  "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"
const activeBtn = "bg-black text-white"

/** стопим всплытие, чтобы DnD слоёв/канваса не мешал фейдерам */
const stop = {
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

/* унифицированный слайдер: input по центру, трек 3px, квадратный/круглый thumb от текущего цвета */
const sliderCss = `
/* базовые: обязательно выключаем нативный виджет, чтобы не было синего круга */
input[type="range"].ui {
  -webkit-appearance: none; appearance: none;
  height: 18px; line-height: 18px;
  width: 100%;
  background: transparent;
  color: currentColor;
  margin: 0; padding: 0; display: block; vertical-align: middle;
}
/* трек */
input[type="range"].ui::-webkit-slider-runnable-track { height: 3px; background: currentColor; }
input[type="range"].ui::-moz-range-track              { height: 3px; background: currentColor; }
/* квадратный ползунок */
input[type="range"].square::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: currentColor; border-radius: 0; }
input[type="range"].square::-moz-range-thumb     { width: 14px; height: 14px; background: currentColor; border: none; border-radius: 0; }
/* (если нужен круглый — можно добавить класс .round) */
`

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide, tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    onClear, toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    mobileTopOffset, mobileLayers,
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

    // локальный текст state для textarea
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 260 }} onMouseDown={(e)=>e.stopPropagation()}>
        <style dangerouslySetInnerHTML={{ __html: sliderCss }} />

        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-2 py-1 text-[10px] tracking-widest">TOOLS</div>
          <div className="flex">
            <button className={btn} title="Clear" onClick={(e)=>{e.stopPropagation(); onClear()}}><ClearIcon className={ico}/></button>
            <button className={btn} onClick={(e)=>{e.stopPropagation(); setOpen(!open)}}>
              {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
            </button>
            <button className={btn} onMouseDown={onDragStart} title="Drag panel"><GripHorizontal className={ico}/></button>
          </div>
        </div>

        {open && (
          <div className="p-2 space-y-2">
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

            {/* row 2 — Color + Brush/Eraser Size */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) setSelectedColor(e.target.value) }}
                className="w-6 h-6 border border-black p-0"
                {...stop}
                disabled={tool==="erase"}
              />
              <div className="flex-1 text-black flex items-center">
                <input
                  aria-label="Brush size"
                  type="range"
                  min={1}
                  max={200}
                  step={1}
                  value={brushSize}
                  onChange={(e)=>setBrushSize(e.currentTarget.valueAsNumber)}
                  className="ui square"
                  {...stop}
                  style={{}}
                />
              </div>
              <div className="text-xs w-10 text-right">{brushSize}</div>
            </div>

            {/* палитра */}
            <div className="grid grid-cols-12 gap-1" {...stop}>
              {PALETTE.map((c)=>(
                <button
                  key={c}
                  className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                  style={{ background: c }}
                  onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (props.selectedKind) setSelectedColor(c) }}
                />
              ))}
            </div>

            {/* SHAPES */}
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

            {/* SELECTED */}
            {selectedKind === "text" && (
              <div className="pt-1 space-y-2">
                <div className="text-[10px]">Text</div>
                <textarea
                  value={textValue}
                  onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                  className="w-full h-16 border border-black p-1 text-sm"
                  placeholder="Enter text"
                  {...stop}
                />
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Font size</div>
                  <div className="flex-1 text-black flex items-center">
                    <input
                      aria-label="Font size"
                      type="range" min={8} max={800} step={1}
                      value={selectedProps.fontSize ?? 96}
                      onChange={(e)=>setSelectedFontSize(e.currentTarget.valueAsNumber)}
                      className="ui square"
                      {...stop}
                    />
                  </div>
                  <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
                </div>
              </div>
            )}

            {selectedKind === "shape" && (
              <div className="pt-1 space-y-2">
                <div className="text-[10px]">Selected shape</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Fill</div>
                  <input type="color" value={selectedProps.fill ?? "#000000"} onChange={(e)=>setSelectedFill(e.target.value)} className="w-6 h-6 border border-black" {...stop}/>
                  <div className="text-[10px] w-12">Stroke</div>
                  <input type="color" value={selectedProps.stroke ?? "#000000"} onChange={(e)=>setSelectedStroke(e.target.value)} className="w-6 h-6 border border-black" {...stop}/>
                  <div className="flex-1 text-black flex items-center">
                    <input
                      aria-label="Stroke width"
                      type="range" min={0} max={64} step={1}
                      value={selectedProps.strokeWidth ?? 0}
                      onChange={(e)=>setSelectedStrokeW(e.currentTarget.valueAsNumber)}
                      className="ui square"
                      {...stop}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* FRONT/BACK + downloads */}
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

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) =>
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >
      {icon}
    </button>

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const SecondRow = () => {
    if (props.selectedKind === "shape") {
      return (
        <div className="px-2 py-1 flex items-center gap-2">
          <input type="color" value={selectedProps.fill ?? "#000"} onChange={(e)=>props.setSelectedFill(e.target.value)} className="w-8 h-8 border border-black" {...stop}/>
          <input type="color" value={selectedProps.stroke ?? "#000"} onChange={(e)=>props.setSelectedStroke(e.target.value)} className="w-8 h-8 border border-black" {...stop}/>
          <div className="flex-1 text-black flex items-center">
            <input type="range" min={0} max={64} step={1} value={selectedProps.strokeWidth ?? 0} onChange={(e)=>props.setSelectedStrokeW(e.currentTarget.valueAsNumber)} className="ui square" {...stop}/>
          </div>
        </div>
      )
    }

    if (props.selectedKind === "text" || tool === "text") {
      return (
        <div className="px-2 py-1 flex items-center gap-2">
          <input
            value={selectedProps.text ?? ""}
            onChange={(e)=>setSelectedText(e.target.value)}
            placeholder="Text"
            className="flex-1 h-10 border border-black px-2 text-sm"
            {...stop}
          />
          <div className="w-40 text-black flex items-center">
            <input
              type="range" min={8} max={800} step={1}
              value={selectedProps.fontSize ?? 96}
              onChange={(e)=>setSelectedFontSize(e.currentTarget.valueAsNumber)}
              className="ui square"
              {...stop}
            />
          </div>
        </div>
      )
    }

    // Brush / Erase
    return (
      <div className="px-2 py-1 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="text-[10px]">Color</div>
          <input
            type="color"
            value={brushColor}
            onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
            className="w-8 h-8 border border-black p-0"
            {...stop}
            disabled={tool==="erase"}
          />
        </div>
        <div className="flex-1 text-black flex items-center">
          <input
            aria-label="Brush size"
            type="range"
            min={1}
            max={200}
            step={1}
            value={brushSize}
            onChange={(e)=>setBrushSize(e.currentTarget.valueAsNumber)}
            className="ui square"
            {...stop}
          />
        </div>
        <div className="text-xs w-10 text-right">{brushSize}</div>
      </div>
    )
  }

  return (
    <>
      {/* LAYERS шторка */}
      {layersOpenM && (
        <div className="fixed inset-x-0 z-40 px-3 overflow-hidden" style={{ top: mobileTopOffset, bottom: 144 }}>
          <div className={clx(wrap, "p-2 h-full flex flex-col")}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 overflow-auto">
              {mobileLayers.items.map((l)=>(
                <div
                  key={l.id}
                  className={clx(
                    "flex items-center gap-2 border border-black px-2 py-1 bg-white",
                    mobileLayers.selectedId===l.id ? "bg-black/5 ring-1 ring-black" : ""
                  )}
                >
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

      {/* нижняя панель */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 */}
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
          <div className="ml-auto flex gap-1">
            <button className="h-12 w-12 grid place-items-center border border-black" onClick={onClear}><ClearIcon className={ico}/></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...stop}/>
        </div>

        {/* row 2 */}
        <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
        <SecondRow />

        {/* row 3 */}
        <div className="px-2 py-1 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadFront}><Download className={ico}/>DL</button>
          </div>
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadBack}><Download className={ico}/>DL</button>
          </div>
        </div>
      </div>
    </>
  )
}
