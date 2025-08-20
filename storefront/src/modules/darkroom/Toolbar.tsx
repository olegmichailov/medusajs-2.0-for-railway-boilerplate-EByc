"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Layers, X as ClearIcon, GripHorizontal,
  Copy, ChevronUp, ChevronDown, Eye, EyeOff, Lock, Unlock, Trash2
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
const btn  = "h-10 px-3 grid place-items-center border border-black text-[12px] rounded-none hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"
const activeBtn = "bg-black text-white"

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

// центрированный трек + квадратный бегунок
const sliderCss = `
input[type="range"].ui{
  -webkit-appearance:none; appearance:none;
  width:100%; height:24px; background:transparent; color:currentColor; margin:0; padding:0; display:block;
}
input[type="range"].ui::-webkit-slider-runnable-track{ height:0; background:transparent; }
input[type="range"].ui::-moz-range-track{ height:0; background:transparent; }
input[type="range"].ui::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:14px; height:14px; background:currentColor; border:0; border-radius:0; margin-top:0; }
input[type="range"].ui::-moz-range-thumb{ width:14px; height:14px; background:currentColor; border:0; border-radius:0; }
`

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack, onClear, toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedColor,
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

    // локальный текст state (без сокращений)
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    const Track = ({ className }: { className?: string }) =>
      <div className={clx("pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] opacity-80", className)} />

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 280 }} onMouseDown={(e)=>e.stopPropagation()}>
        <style dangerouslySetInnerHTML={{ __html: sliderCss }} />

        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-3 py-2 text-[11px] tracking-widest">TOOLS</div>
          <div className="flex">
            <button className={btn} title="Clear canvas" onClick={(e)=>{e.stopPropagation(); onClear()}}>
              <ClearIcon className={ico}/> <span className="ml-2">Clear</span>
            </button>
            <button className={btn} onClick={(e)=>{e.stopPropagation(); setOpen(!open)}}>
              {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
              <span className="ml-2">{open ? "Hide" : "Show"}</span>
            </button>
            <button className={btn} onMouseDown={onDragStart} title="Drag panel">
              <GripHorizontal className={ico}/> <span className="ml-2">Move</span>
            </button>
          </div>
        </div>

        {open && (
          <div className="p-3 space-y-3">
            {/* row 1 — инструменты + layers */}
            <div className="grid grid-cols-2 gap-2">
              <button
                className={clx(btn, tool==="move" ? activeBtn : "bg-white")}
                onClick={(e)=>{ e.stopPropagation(); setTool("move") }}
              ><Move className={ico}/> <span className="ml-2">Move</span></button>

              <button
                className={clx(btn, layersOpen ? activeBtn : "bg-white")}
                onClick={(e)=>{e.stopPropagation(); toggleLayers()}}
              ><Layers className={ico}/> <span className="ml-2">Layers</span></button>

              <button
                className={clx(btn, tool==="brush" ? activeBtn : "bg-white")}
                onClick={(e)=>{ e.stopPropagation(); setTool("brush") }}
              ><Brush className={ico}/> <span className="ml-2">Brush</span></button>

              <button
                className={clx(btn, tool==="erase" ? activeBtn : "bg-white")}
                onClick={(e)=>{ e.stopPropagation(); setTool("erase") }}
              ><Eraser className={ico}/> <span className="ml-2">Eraser</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddText() }}
              ><TypeIcon className={ico}/> <span className="ml-2">Add Text</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); fileRef.current?.click() }}
              ><ImageIcon className={ico}/> <span className="ml-2">Add Image</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddShape("square"); }}
              ><Square className={ico}/> <span className="ml-2">Square</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddShape("circle"); }}
              ><Circle className={ico}/> <span className="ml-2">Circle</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddShape("triangle"); }}
              ><Triangle className={ico}/> <span className="ml-2">Triangle</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddShape("cross"); }}
              ><Plus className={ico}/> <span className="ml-2">Cross</span></button>

              <button
                className={btn}
                onClick={(e)=>{ e.stopPropagation(); onAddShape("line"); }}
              ><Slash className={ico}/> <span className="ml-2">Line</span></button>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...stop}/>
            </div>

            {/* row 2 — Color + Brush/Eraser size */}
            <div className="flex items-center gap-3">
              <div className="text-[11px] w-14">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
                className="w-7 h-7 border border-black p-0"
                {...stop}
                disabled={tool==="erase"}
                title="Color"
              />
              <div className="relative flex-1 text-black">
                <input
                  type="range" min={1} max={200} step={1}
                  value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                  className="ui"
                  {...stop}
                />
                <Track className="bg-black" />
              </div>
              <div className="text-xs w-12 text-right">{brushSize}px</div>
            </div>

            {/* палитра */}
            <div className="grid grid-cols-12 gap-1" {...stop}>
              {PALETTE.map((c)=>(
                <button
                  key={c}
                  className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                  style={{ background: c }}
                  onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (props.selectedKind) props.setSelectedColor(c) }}
                  title={c}
                />
              ))}
            </div>

            {/* SELECTED */}
            {selectedKind === "text" && (
              <div className="pt-1 space-y-2">
                <div className="text-[11px]">Text</div>
                <textarea
                  value={textValue}
                  onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                  className="w-full h-16 border border-black p-2 text-sm"
                  placeholder="Enter text"
                  {...stop}
                />
                <div className="flex items-center gap-2">
                  <div className="text-[11px] w-20">Font size</div>
                  <div className="relative flex-1 text-black">
                    <input
                      type="range" min={8} max={800} step={1}
                      value={selectedProps.fontSize ?? 96}
                      onChange={(e)=>setSelectedFontSize(parseInt(e.target.value, 10))}
                      className="ui"
                      {...stop}
                    />
                    <Track className="bg-black" />
                  </div>
                  <div className="text-xs w-12 text-right">{selectedProps.fontSize ?? 96}px</div>
                </div>
              </div>
            )}

            {selectedKind === "shape" && (
              <div className="pt-1 space-y-2">
                <div className="text-[11px]">Selected shape</div>
                <div className="flex items-center gap-2">
                  <div className="text-[11px] w-12">Fill</div>
                  <input type="color" value={selectedProps.fill ?? "#000000"} onChange={(e)=>setSelectedFill(e.target.value)} className="w-7 h-7 border border-black" {...stop}/>
                  <div className="text-[11px] w-12">Stroke</div>
                  <input type="color" value={selectedProps.stroke ?? "#000000"} onChange={(e)=>setSelectedStroke(e.target.value)} className="w-7 h-7 border border-black" {...stop}/>
                  <div className="relative flex-1 text-black">
                    <input
                      type="range" min={0} max={64} step={1}
                      value={selectedProps.strokeWidth ?? 0}
                      onChange={(e)=>setSelectedStrokeW(parseInt(e.target.value, 10))}
                      className="ui"
                      {...stop}
                    />
                    <Track className="bg-black" />
                  </div>
                  <div className="text-xs w-10 text-right">{selectedProps.strokeWidth ?? 0}px</div>
                </div>
              </div>
            )}

            {/* FRONT/BACK + downloads */}
            <div className="grid grid-cols-2 gap-2">
              <button className={clx("h-10 border border-black flex items-center justify-center", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>
                Front
              </button>
              <button className="h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}>
                <Download className={ico}/> <span>Download</span>
              </button>
              <button className={clx("h-10 border border-black flex items-center justify-center", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>
                Back
              </button>
              <button className="h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}>
                <Download className={ico}/> <span>Download</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // =================== MOBILE ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void, label?: string) =>
    <button
      className={clx("h-12 px-3 grid grid-cols-[20px_auto] items-center gap-2 border border-black rounded-none text-sm", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >
      <span className="grid place-items-center"><span className="sr-only">{label}</span>{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
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
          <div className="relative flex-1 text-black">
            <input type="range" min={0} max={64} step={1} value={selectedProps.strokeWidth ?? 0} onChange={(e)=>props.setSelectedStrokeW(parseInt(e.target.value, 10))} className="ui" {...stop}/>
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
          </div>
          <div className="text-xs w-10 text-right">{selectedProps.strokeWidth ?? 0}px</div>
        </div>
      )
    }

    const isTextSelected = props.selectedKind === "text"
    return (
      <div className="px-2 py-1 flex items-center gap-2">
        {!isTextSelected && (
          <>
            <div className="text-[11px]">Color</div>
            <input
              type="color"
              value={brushColor}
              onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
              className="w-8 h-8 border border-black p-0"
              {...stop}
              disabled={tool==="erase"}
            />
          </>
        )}
        <div className="relative flex-1 text-black">
          <input
            type="range" min={1} max={200} step={1}
            value={brushSize}
            onChange={(e)=> setBrushSize(parseInt(e.target.value, 10))}
            className="ui"
            {...stop}
          />
          <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
        </div>
        <div className="text-xs w-12 text-right">{brushSize}px</div>
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
              <div className="text-[11px] tracking-widest">LAYERS</div>
              <button className={clx("px-3 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 overflow-auto">
              {mobileLayers.items.map((l)=>(
                <div
                  key={l.id}
                  className={clx(
                    "flex items-center gap-2 border border-black px-2 py-2 bg-white",
                    mobileLayers.selectedId===l.id ? "bg-black/5 ring-1 ring-black" : ""
                  )}
                >
                  <button className="border border-black px-2 h-8 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)}>
                    {l.type[0].toUpperCase()} <span className="ml-2 text-xs">Select</span>
                  </button>

                  <div className="text-xs flex-1 truncate">{l.name}</div>

                  <button className="border border-black h-8 px-2 grid place-items-center" title="Move up" onClick={()=>mobileLayers.onMoveUp(l.id)}>
                    <ChevronUp className={ico}/><span className="sr-only">Move up</span>
                  </button>
                  <button className="border border-black h-8 px-2 grid place-items-center" title="Move down" onClick={()=>mobileLayers.onMoveDown(l.id)}>
                    <ChevronDown className={ico}/><span className="sr-only">Move down</span>
                  </button>
                  <button className="border border-black h-8 px-2 grid place-items-center" title="Duplicate" onClick={()=>mobileLayers.onDuplicate(l.id)}>
                    <Copy className={ico}/><span className="sr-only">Duplicate</span>
                  </button>
                  <button className="border border-black h-8 px-2 grid place-items-center" title={l.locked?"Unlock":"Lock"} onClick={()=>mobileLayers.onToggleLock(l.id)}>
                    {l.locked ? <Lock className={ico}/> : <Unlock className={ico}/>}
                    <span className="sr-only">{l.locked ? "Unlock" : "Lock"}</span>
                  </button>
                  <button className="border border-black h-8 px-2 grid place-items-center" title={l.visible?"Hide":"Show"} onClick={()=>mobileLayers.onToggleVisible(l.id)}>
                    {l.visible ? <Eye className={ico}/> : <EyeOff className={ico}/>}
                    <span className="sr-only">{l.visible ? "Hide" : "Show"}</span>
                  </button>
                  <button className="border border-black h-8 px-2 grid place-items-center bg-black text-white" title="Delete" onClick={()=>mobileLayers.onDelete(l.id)}>
                    <Trash2 className={ico}/> <span className="sr-only">Delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
        <div className="px-2 py-2 grid grid-cols-2 gap-2">
          {mobileButton("move", <Move className={ico}/>, undefined, "Move")}
          {mobileButton("brush", <Brush className={ico}/>, undefined, "Brush")}
          {mobileButton("erase", <Eraser className={ico}/>, undefined, "Eraser")}
          {mobileButton("text", <TypeIcon className={ico}/>, props.onAddText, "Add Text")}
          {mobileButton("image", <ImageIcon className={ico}/>, undefined, "Add Image")}
          {mobileButton("shape", <Shapes className={ico}/>, undefined, "Shapes")}
          <button className={clx("h-12 px-3 grid grid-cols-[20px_auto] items-center gap-2 border border-black rounded-none text-sm", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <Layers className={ico}/><span>Layers</span>
          </button>
          <button className="h-12 px-3 grid grid-cols-[20px_auto] items-center gap-2 border border-black rounded-none text-sm" onClick={onClear}>
            <ClearIcon className={ico}/><span>Clear</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...stop}/>
        </div>

        <SecondRow />

        <div className="px-2 py-2 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>Front</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadFront}>
              <Download className={ico}/> <span>Download</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>Back</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadBack}>
              <Download className={ico}/> <span>Download</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
