"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Layers, AlignLeft, AlignCenter, AlignRight
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
  onClear?: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "image" | "shape" | "text" | "strokes" | "erase" | null
  selectedProps: {
    text?: string
    fontSize?: number      // px (Konva)
    lineHeight?: number    // unitless
    letterSpacing?: number // px (Konva)
    align?: "left" | "center" | "right" | "justify"
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
  setSelectedLineHeight: (v: number) => void
  setSelectedLetterSpacing: (v: number) => void
  setSelectedAlign?: (a: "left" | "center" | "right" | "justify") => void

  mobileLayers: MobileLayersProps
  mobileTopOffset?: number
}

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
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    setSelectedLineHeight, setSelectedLetterSpacing, setSelectedAlign,
    mobileLayers, mobileTopOffset
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

    // локальный state textarea (только для текста)
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    const align = selectedProps.align ?? "left"

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
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
            </div>

            {/* row 2 — цвет + size кисти */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <div className="w-6 h-6 border border-black cursor-pointer" style={{ background: brushColor }} />
              <div className="flex-1">
                <input
                  type="range" min={1} max={200} step={1} value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                  className="w-full"
                  style={{ accentColor: "#000" }}
                  {...inputStop}
                />
              </div>
            </div>

            {/* палитра */}
            <div className="grid grid-cols-12 gap-1" {...inputStop}>
              {PALETTE.map((c)=>(
                <button
                  key={c}
                  className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                  style={{ background: c }}
                  onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (selectedKind) props.setSelectedColor(c) }}
                />
              ))}
            </div>

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

            {/* text props — ТОЛЬКО СЛАЙДЕРЫ + выравнивание */}
            <div className="pt-1 space-y-2">
              <div className="text-[10px]">Text</div>

              <textarea
                value={textValue}
                onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                className="w-full h-16 border border-black p-1 text-sm"
                placeholder="Enter text"
                {...inputStop}
              />

              {/* выравнивание */}
              <div className="flex gap-1">
                <button
                  className={clx(btn, align==="left" ? activeBtn : "bg-white")}
                  onClick={(e)=>{ e.stopPropagation(); props.setSelectedAlign?.("left")}}
                  title="Align left"
                ><AlignLeft className={ico}/></button>
                <button
                  className={clx(btn, align==="center" ? activeBtn : "bg-white")}
                  onClick={(e)=>{ e.stopPropagation(); props.setSelectedAlign?.("center")}}
                  title="Align center"
                ><AlignCenter className={ico}/></button>
                <button
                  className={clx(btn, align==="right" ? activeBtn : "bg-white")}
                  onClick={(e)=>{ e.stopPropagation(); props.setSelectedAlign?.("right")}}
                  title="Align right"
                ><AlignRight className={ico}/></button>
              </div>

              {/* Font size — px */}
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-16">Font size</div>
                <input
                  type="range" min={8} max={800} step={1}
                  value={selectedProps.fontSize ?? 96}
                  onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "#000" }}
                  {...inputStop}
                />
              </div>

              {/* Line height — unitless */}
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-16">Line height</div>
                <input
                  type="range" min={0.6} max={3.0} step={0.01}
                  value={selectedProps.lineHeight ?? 1.0}
                  onChange={(e)=>setSelectedLineHeight(parseFloat(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "#000" }}
                  {...inputStop}
                />
              </div>

              {/* Letter spacing — px (может быть отрицательным) */}
              <div className="flex items-center gap-2">
                <div className="text-[10px] w-16">Letter sp.</div>
                <input
                  type="range" min={-2.0} max={10.0} step={0.1}
                  value={selectedProps.letterSpacing ?? 0}
                  onChange={(e)=>setSelectedLetterSpacing(parseFloat(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: "#000" }}
                  {...inputStop}
                />
              </div>
            </div>

            {/* FRONT/BACK + downloads + CLEAR */}
            <div className="grid grid-cols-2 gap-2">
              <button className={clx("h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
              <button className={clx("h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>BACK</button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}>
                <Download className={ico}/> <span className="text-xs">Download</span>
              </button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}>
                <Download className={ico}/> <span className="text-xs">Download</span>
              </button>
              {onClear && (
                <button className="col-span-2 h-10 border border-black bg-white hover:bg-black hover:text-white" onClick={(e)=>{e.stopPropagation(); onClear()}}>
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // =================== MOBILE ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >
      {icon}
    </button>
  )

  return (
    <>
      {/* LAYERS SHEET */}
      {layersOpenM && (
        <div className="fixed inset-x-0" style={{ bottom: (mobileTopOffset ?? 0) + 36, zIndex: 40 }}>
          <div className={clx(wrap, "m-3 p-2")}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {mobileLayers.items.map((l)=>(
                <div key={l.id} className={clx("flex items-center gap-2 border border-black px-2 py-1 bg-white", mobileLayers.selectedId===l.id && "ring-2 ring-black")}>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)}>{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveUp(l.id)}>▲</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveDown(l.id)}>▼</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onDuplicate(l.id)}>⧉</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleLock(l.id)}>{l.locked?"🔒":"🔓"}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleVisible(l.id)}>{l.visible?"👁":"🚫"}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>mobileLayers.onDelete(l.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель — инструменты + настройки текста */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 — инструменты + layers */}
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>

        {/* row 2 — TEXT sliders */}
        <div className="px-2 py-1 space-y-2">
          {/* выравнивание */}
          <div className="flex gap-1">
            <button className={clx(btn, (selectedProps.align ?? "left")==="left" ? activeBtn : "bg-white")} onClick={()=>props.setSelectedAlign?.("left")}><AlignLeft className={ico}/></button>
            <button className={clx(btn, (selectedProps.align ?? "left")==="center" ? activeBtn : "bg-white")} onClick={()=>props.setSelectedAlign?.("center")}><AlignCenter className={ico}/></button>
            <button className={clx(btn, (selectedProps.align ?? "left")==="right" ? activeBtn : "bg-white")} onClick={()=>props.setSelectedAlign?.("right")}><AlignRight className={ico}/></button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] w-16">Size</div>
            <input type="range" min={8} max={800} step={1}
              value={selectedProps.fontSize ?? 96}
              onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
              className="flex-1" style={{ accentColor: "#000" }} {...inputStop}/>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] w-16">Line</div>
            <input type="range" min={0.6} max={3.0} step={0.01}
              value={selectedProps.lineHeight ?? 1.0}
              onChange={(e)=>setSelectedLineHeight(parseFloat(e.target.value))}
              className="flex-1" style={{ accentColor: "#000" }} {...inputStop}/>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[10px] w-16">Letter</div>
            <input type="range" min={-2.0} max={10.0} step={0.1}
              value={selectedProps.letterSpacing ?? 0}
              onChange={(e)=>setSelectedLetterSpacing(parseFloat(e.target.value))}
              className="flex-1" style={{ accentColor: "#000" }} {...inputStop}/>
          </div>
        </div>

        {/* row 3 — FRONT/BACK + DL + CLEAR */}
        <div className="px-2 py-1 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadFront}><Download className={ico}/>DL</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={onDownloadBack}><Download className={ico}/>DL</button>
          </div>
          {onClear && <button className="col-span-2 h-10 border border-black bg-white" onClick={onClear}>Clear all</button>}
        </div>
      </div>
    </>
  )
}
