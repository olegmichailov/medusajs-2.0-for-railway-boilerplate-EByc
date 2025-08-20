"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Layers as LayersIcon, X as ClearIcon, GripHorizontal,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2
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
  setSelectedFontFamily?: (f: string) => void
  setSelectedColor: (hex: string) => void
  mobileTopOffset: number
  mobileLayers: MobileLayersProps
}

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  = "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none touch-manipulation"
const activeBtn = "bg-black text-white"

// стопаем ВСЕ указатели на фазе capture, чтобы Stage не перехватывал
const stopAll = {
  onPointerDownCapture: (e: any) => e.stopPropagation(),
  onPointerMoveCapture: (e: any) => e.stopPropagation(),
  onPointerUpCapture:   (e: any) => e.stopPropagation(),
  onTouchStartCapture:  (e: any) => e.stopPropagation(),
  onTouchMoveCapture:   (e: any) => e.stopPropagation(),
  onTouchEndCapture:    (e: any) => e.stopPropagation(),
  onMouseDownCapture:   (e: any) => e.stopPropagation(),
  onMouseMoveCapture:   (e: any) => e.stopPropagation(),
  onMouseUpCapture:     (e: any) => e.stopPropagation(),
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

/* КВАДРАТНЫЕ фейдеры. Трек — тонкая линия строго по центру. 
   На таче — большой 28px бегунок. */
const sliderCss = `
:root{ --thumb:16px; }
@media (hover:none),(pointer:coarse){ :root{ --thumb:28px; } }

input[type="range"].ui{
  -webkit-appearance:none; appearance:none;
  width:100%;
  height:var(--thumb);
  background:transparent;
  color:currentColor; margin:0; padding:0; display:block;
  touch-action:none;
}
input[type="range"].ui::-webkit-slider-runnable-track{ height:0; background:transparent; }
input[type="range"].ui::-moz-range-track{ height:0; background:transparent; }
input[type="range"].ui::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:var(--thumb); height:var(--thumb); background:currentColor; border:0; border-radius:0; margin-top:0; }
input[type="range"].ui::-moz-range-thumb{ width:var(--thumb); height:var(--thumb); background:currentColor; border:0; border-radius:0; }
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

  // =================== DESKTOP (ВЕРНУЛ КАК БЫЛО) ===================
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

    const Track = ({ className }: { className?: string }) =>
      <div className={clx("pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] opacity-80", className)} />

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
                <LayersIcon className={ico}/>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
            </div>

            {/* row 2 — Color + Brush/Eraser size */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
                className="w-6 h-6 border border-black p-0"
                disabled={tool==="erase"}
              />
              <div className="relative flex-1 text-black">
                <input
                  type="range" min={1} max={200} step={1}
                  value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                  onInput={(e:any)=>setBrushSize(parseInt(e.target.value,10))}
                  className="ui"
                />
                <Track className="bg-black" />
              </div>
              <div className="text-xs w-10 text-right">{brushSize}</div>
            </div>

            {/* палитра — ВЕРНУЛ */}
            <div className="grid grid-cols-12 gap-1">
              {PALETTE.map((c)=>(
                <button
                  key={c}
                  className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                  style={{ background: c }}
                  onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (props.selectedKind) props.setSelectedColor(c) }}
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
            {props.selectedKind === "text" && (
              <div className="pt-1 space-y-2">
                <div className="text-[10px]">Text</div>
                <textarea
                  value={props.selectedProps.text ?? ""}
                  onChange={(e)=>{ props.setSelectedText(e.target.value) }}
                  className="w-full h-16 border border-black p-1 text-sm"
                  placeholder="Enter text"
                />
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Font size</div>
                  <div className="relative flex-1 text-black">
                    <input
                      type="range" min={8} max={800} step={1}
                      value={props.selectedProps.fontSize ?? 96}
                      onChange={(e)=>props.setSelectedFontSize(parseInt(e.target.value, 10))}
                      onInput={(e:any)=>props.setSelectedFontSize(parseInt(e.target.value, 10))}
                      className="ui"
                    />
                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
                  </div>
                  <div className="text-xs w-10 text-right">{props.selectedProps.fontSize ?? 96}</div>
                </div>
              </div>
            )}

            {props.selectedKind === "shape" && (
              <div className="pt-1 space-y-2">
                <div className="text-[10px]">Selected shape</div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Fill</div>
                  <input type="color" value={props.selectedProps.fill ?? "#000000"} onChange={(e)=>props.setSelectedFill(e.target.value)} className="w-6 h-6 border border-black"/>
                  <div className="text-[10px] w-12">Stroke</div>
                  <input type="color" value={props.selectedProps.stroke ?? "#000000"} onChange={(e)=>props.setSelectedStroke(e.target.value)} className="w-6 h-6 border border-black"/>
                  <div className="relative flex-1 text-black">
                    <input
                      type="range" min={0} max={64} step={1}
                      value={props.selectedProps.strokeWidth ?? 0}
                      onChange={(e)=>props.setSelectedStrokeW(parseInt(e.target.value, 10))}
                      onInput={(e:any)=>props.setSelectedStrokeW(parseInt(e.target.value, 10))}
                      className="ui"
                    />
                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
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

  // =================== MOBILE (3 строки, всегда есть строка настроек) ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) =>
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool===t ? activeBtn : "bg-white")}
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

  // Строка 2 — контекст. 
  // Если выделен текст — ВСЕГДА показываем font-size, даже если активен move.
  // Для image, чтобы панель не «прыгала», показываем шейпы (как ты просил).
  const SettingsRow = () => {
    if (props.selectedKind === "text") {
      return (
        <div className="px-2 py-1 flex items-center gap-2" {...stopAll}>
          <div className="text-[10px] w-16">Font size</div>
          <div className="relative flex-1 text-black">
            <input
              type="range" min={8} max={800} step={1}
              value={props.selectedProps.fontSize ?? 96}
              onChange={(e)=>props.setSelectedFontSize(parseInt(e.target.value, 10))}
              onInput={(e:any)=>props.setSelectedFontSize(parseInt(e.target.value, 10))}
              className="ui"
            />
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
          </div>
          <div className="text-xs w-10 text-right">{props.selectedProps.fontSize ?? 96}</div>
        </div>
      )
    }

    if (tool === "brush" || tool === "erase") {
      return (
        <div className="px-2 py-1 flex items-center gap-2" {...stopAll}>
          <div className="text-[10px]">Color</div>
          <input
            type="color"
            value={brushColor}
            onChange={(e)=>{ setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
            className="w-9 h-9 border border-black p-0"
            disabled={tool==="erase"}
          />
          <div className="relative flex-1 text-black">
            <input
              type="range" min={1} max={200} step={1}
              value={brushSize}
              onChange={(e)=> setBrushSize(parseInt(e.target.value, 10))}
              onInput={(e:any)=> setBrushSize(parseInt(e.target.value, 10))}
              className="ui"
            />
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black opacity-80" />
          </div>
          <div className="text-xs w-10 text-right">{brushSize}</div>
        </div>
      )
    }

    // shape И image — показываем шейпы (чтобы панель не схлопывалась)
    if (tool === "shape" || tool === "image") {
      return (
        <div className="px-2 py-1" {...stopAll}>
          <div className="text-[10px] mb-1">Add shape</div>
          <div className="flex">
            <button className={btn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
            <button className={btn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
            <button className={btn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
            <button className={btn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
            <button className={btn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
          </div>
        </div>
      )
    }

    // запасной вариант — фиксированная высота, чтобы ничего не прыгало
    return <div className="h-[44px]" {...stopAll}/>
  }

  return (
    <>
      {/* LAYERS шторка (мобайл) */}
      {layersOpenM && (
        <div className="fixed inset-x-0 z-40 px-3 overflow-hidden" style={{ top: mobileTopOffset, bottom: 144 }} {...stopAll}>
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
                  {...stopAll}
                >
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)} title="Select">{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>

                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveUp(l.id)} title="Up">↑</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveDown(l.id)} title="Down">↓</button>

                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onDuplicate(l.id)} title="Duplicate"><Copy className="w-3.5 h-3.5"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleLock(l.id)} title={l.locked?"Unlock":"Lock"}>
                    {l.locked ? <Lock className="w-3.5 h-3.5"/> : <Unlock className="w-3.5 h-3.5"/>}
                  </button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleVisible(l.id)} title={l.visible?"Hide":"Show"}>
                    {l.visible ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>}
                  </button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>mobileLayers.onDelete(l.id)} title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 3 строки интерфейса на мобилке ===== */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10" {...stopAll}>
        <style dangerouslySetInnerHTML={{ __html: sliderCss }} />

        {/* Строка 1: инструменты + слои + clear */}
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move", <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text", <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}
          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <LayersIcon className={ico}/>
          </button>
          <div className="ml-auto flex gap-1">
            <button className="h-12 w-12 grid place-items-center border border-black" onClick={onClear}><ClearIcon className={ico}/></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        </div>

        {/* Строка 2: контекстные настройки — всегда присутствует */}
        <SettingsRow />

        {/* Строка 3: Front + download | Back + download */}
        <div className="px-2 pb-2 grid grid-cols-2 gap-2">
          <div className="flex gap-1">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className="h-10 w-10 border border-black bg-white grid place-items-center" onClick={onDownloadFront}>
              <Download className={ico}/>
            </button>
          </div>
          <div className="flex gap-1">
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
            <button className="h-10 w-10 border border-black bg-white grid place-items-center" onClick={onDownloadBack}>
              <Download className={ico}/>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
