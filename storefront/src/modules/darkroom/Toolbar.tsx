"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Layers as LayersIcon, X as ClearIcon, GripHorizontal,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, AlignLeft, AlignCenter, AlignRight
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
  selectedProps: {
    text?: string; fontSize?: number; fontFamily?: string; fill?: string; stroke?: string; strokeWidth?: number
    align?: "left"|"center"|"right"; lineHeight?: number; letterSpacing?: number
  }
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily?: (f: string) => void
  setSelectedColor: (hex: string) => void
  setSelectedAlign: (a:"left"|"center"|"right") => void
  setSelectedLineHeight: (n:number) => void
  setSelectedLetterSpacing: (n:number) => void
  mobileTopOffset: number
  mobileLayers: MobileLayersProps
}

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  = "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none touch-manipulation"
const activeBtn = "bg-black text-white"

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

/** палитра для десктопа (как было) */
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

// ===== СВОЙ ГЛАДКИЙ СЛАЙДЕР (без input[type=range]) =====
function SmoothSlider({
  min, max, value, onChange, label, coarse=false,
}:{
  min:number; max:number; value:number; onChange:(n:number)=>void; label?:string; coarse?:boolean;
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const pct = (value-min)/(max-min)

  const setFromEvent = (clientX:number) => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const x = clamp(clientX - r.left, 0, r.width)
    const v = min + (x / r.width) * (max-min)
    onChange(v)
  }

  return (
    <div className="relative h-8 select-none" ref={ref}
      onPointerDown={(e)=>{ setDrag(true); (e.currentTarget as any).setPointerCapture?.(e.pointerId); setFromEvent(e.clientX) }}
      onPointerMove={(e)=>{ if (drag) setFromEvent(e.clientX) }}
      onPointerUp  ={()=> setDrag(false)}
      onPointerCancel={()=> setDrag(false)}
      style={{ touchAction: "none" }}
    >
      {/* трек */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-black/80"/>
      {/* бегунок */}
      <div
        className="absolute top-1/2 -translate-y-1/2 bg-black"
        style={{
          width: coarse ? 28 : 14,
          height: coarse ? 28 : 14,
          left: `calc(${(pct*100).toFixed(4)}% - ${(coarse?28:14)/2}px)`,
        }}
      />
      {label && <div className="absolute right-0 -top-5 text-[10px]">{label}</div>}
    </div>
  )
}

// ==============================

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack, onClear, toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedColor,
    setSelectedAlign, setSelectedLineHeight, setSelectedLetterSpacing,
    mobileTopOffset, mobileLayers,
  } = props

  // =================== DESKTOP (как было) ===================
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

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 280 }}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10" onMouseDown={(e)=>e.stopPropagation()}>
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
          <div className="p-2 space-y-2" {...stopAll}>
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

            {/* row 2 — Color + Brush/Eraser size (аккуратный) */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>{ props.setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
                className="w-6 h-6 border border-black p-0"
                disabled={tool==="erase"}
              />
              <div className="flex-1">
                <SmoothSlider min={1} max={200} value={props.brushSize} onChange={(v)=>props.setBrushSize(Math.max(1, v))}/>
              </div>
              <div className="text-xs w-10 text-right">{props.brushSize|0}</div>
            </div>

            {/* палитра (десктоп — как было) */}
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

            {/* SHAPES вставка (десктоп) */}
            <div className="pt-1">
              <div className="text-[10px] mb-1">Shapes</div>
              <div className="flex">
                <button className={btn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
              </div>
            </div>

            {/* SELECTED TEXT — + выравнивание, line-height, letter-spacing */}
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
                  <div className="flex-1">
                    <SmoothSlider min={8} max={800} value={props.selectedProps.fontSize ?? 96}
                                  onChange={(v)=>props.setSelectedFontSize(Math.max(8, Math.min(800, v)))}/>
                  </div>
                  <div className="text-xs w-10 text-right">{props.selectedProps.fontSize ?? 96}</div>
                </div>

                <div className="flex items-center gap-1">
                  <div className="text-[10px] w-12">Align</div>
                  <button className={clx(btn, (props.selectedProps.align||"left")==="left" ? activeBtn : "bg-white")}  onClick={()=>props.setSelectedAlign("left")}><AlignLeft className={ico}/></button>
                  <button className={clx(btn, (props.selectedProps.align||"left")==="center" ? activeBtn : "bg-white")} onClick={()=>props.setSelectedAlign("center")}><AlignCenter className={ico}/></button>
                  <button className={clx(btn, (props.selectedProps.align||"left")==="right" ? activeBtn : "bg-white")} onClick={()=>props.setSelectedAlign("right")}><AlignRight className={ico}/></button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Line</div>
                  <div className="flex-1"><SmoothSlider min={0.7} max={2.5} value={props.selectedProps.lineHeight ?? 1} onChange={(v)=>props.setSelectedLineHeight(v)}/></div>
                  <div className="text-[10px] w-12 text-right">{(props.selectedProps.lineHeight ?? 1).toFixed(2)}</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[10px] w-12">Letter</div>
                  <div className="flex-1"><SmoothSlider min={-1} max={20} value={props.selectedProps.letterSpacing ?? 0} onChange={(v)=>props.setSelectedLetterSpacing(v)}/></div>
                  <div className="text-[10px] w-12 text-right">{Math.round(props.selectedProps.letterSpacing ?? 0)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // =================== MOBILE (строго 3 строки) ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const tapTool = (t: "move"|"brush"|"erase"|"text"|"image"|"shape") => {
    if (t === "text") { setTool("text"); onAddText(); return }
    if (t === "image") { setTool("image"); requestAnimationFrame(()=> fileRef.current?.click()); return }
    setTool(t as Tool)
  }

  const SettingsRow = () => {
    const fontSize = props.selectedProps.fontSize ?? 96

    if (tool === "brush") {
      return (
        <div className="px-2 py-1 flex items-center gap-2" {...stopAll}>
          <div className="text-[10px]">Color</div>
          <input
            type="color"
            value={props.brushColor}
            onChange={(e)=>{ props.setBrushColor(e.target.value); if (props.selectedKind) props.setSelectedColor(e.target.value) }}
            className="w-8 h-8 border border-black p-0"
          />
          <div className="flex-1">
            <SmoothSlider min={1} max={200} value={props.brushSize} onChange={(v)=> props.setBrushSize(Math.max(1, v))} coarse/>
          </div>
          <div className="text-xs w-10 text-right">{props.brushSize|0}</div>
        </div>
      )
    }

    if (tool === "erase") {
      return (
        <div className="px-2 py-1 flex items-center gap-2" {...stopAll}>
          <div className="text-[10px] w-12">Size</div>
          <div className="flex-1">
            <SmoothSlider min={1} max={200} value={props.brushSize} onChange={(v)=> props.setBrushSize(Math.max(1, v))} coarse/>
          </div>
          <div className="text-xs w-10 text-right">{props.brushSize|0}</div>
        </div>
      )
    }

    if (tool === "text") {
      // левая половина — короткое поле ввода, правая — фейдер размера
      return (
        <div className="px-2 py-1 flex items-center gap-2" {...stopAll}>
          <input
            type="text"
            value={props.selectedProps.text ?? ""}
            onChange={(e)=> props.setSelectedText(e.target.value)}
            placeholder="Text…"
            className="flex-[0_0_45%] h-9 border border-black px-2 text-sm"
          />
          <div className="flex-1">
            <SmoothSlider min={8} max={800} value={fontSize} onChange={(v)=> props.setSelectedFontSize(Math.max(8, Math.min(800, v)))} coarse/>
          </div>
          <div className="text-xs w-10 text-right">{fontSize|0}</div>
        </div>
      )
    }

    if (tool === "image") {
      // показ шейпов, как просил — чтобы не было пустоты; upload не дублируем
      return (
        <div className="px-2 py-1 flex items-center gap-1" {...stopAll}>
          <button className={btn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
          <button className={btn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
          <button className={btn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
          <button className={btn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
          <button className={btn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
        </div>
      )
    }

    // tool === "shape"
    return (
      <div className="px-2 py-1 flex items-center gap-1" {...stopAll}>
        <button className={btn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
        <button className={btn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
        <button className={btn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
        <button className={btn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
        <button className={btn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
      </div>
    )
  }

  return (
    <>
      {/* hidden input — всегда смонтирован */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {/* LAYERS шторка (мобайл) */}
      {layersOpenM && (
        <div className="fixed inset-x-0 z-40 px-3 overflow-hidden" style={{ top: mobileTopOffset, bottom: 144 }} {...stopAll}>
          <div className={clx(wrap, "p-2 h-full flex flex-col")}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2 overflow-auto">
              {props.mobileLayers.items.map((l)=>(
                <div
                  key={l.id}
                  className={clx(
                    "flex items-center gap-2 border border-black px-2 py-1 bg-white",
                    props.mobileLayers.selectedId===l.id ? "bg-black/5 ring-1 ring-black" : ""
                  )}
                  {...stopAll}
                >
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onSelect(l.id)} title="Select">{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>

                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onMoveUp(l.id)} title="Up">↑</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onMoveDown(l.id)} title="Down">↓</button>

                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onDuplicate(l.id)} title="Duplicate"><Copy className="w-3.5 h-3.5"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onToggleLock(l.id)} title={l.locked?"Unlock":"Lock"}>
                    {l.locked ? <Lock className="w-3.5 h-3.5"/> : <Unlock className="w-3.5 h-3.5"/>}
                  </button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>props.mobileLayers.onToggleVisible(l.id)} title={l.visible?"Hide":"Show"}>
                    {l.visible ? <Eye className="w-3.5 h-3.5"/> : <EyeOff className="w-3.5 h-3.5"/>}
                  </button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>props.mobileLayers.onDelete(l.id)} title="Delete"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 1-я строка: TOOLS / LAYERS / CLEAR ===== */}
      <div className="fixed inset-x-0 bottom-[144px] z-50 bg-white/95 border-t border-black/10" {...stopAll}>
        <div className="px-2 py-1 flex items-center gap-1">
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="move" ? activeBtn : "bg-white")}  onClick={()=>tapTool("move")}><Move className={ico}/></button>
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="brush"? activeBtn : "bg-white")} onClick={()=>tapTool("brush")}><Brush className={ico}/></button>
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="erase"? activeBtn : "bg-white")} onClick={()=>tapTool("erase")}><Eraser className={ico}/></button>
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="text" ? activeBtn : "bg-white")}  onClick={()=>tapTool("text")}><TypeIcon className={ico}/></button>
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="image"? activeBtn : "bg-white")} onClick={()=>tapTool("image")}><ImageIcon className={ico}/></button>
          <button className={clx("h-12 w-12 grid place-items-center border border-black rounded-none touch-manipulation", tool==="shape"? activeBtn : "bg-white")} onClick={()=>tapTool("shape")}><Shapes className={ico}/></button>

          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <LayersIcon className={ico}/>
          </button>
          <div className="ml-auto flex gap-1">
            <button className="h-12 w-12 grid place-items-center border border-black" onClick={onClear}><ClearIcon className={ico}/></button>
          </div>
        </div>
      </div>

      {/* ===== 2-я строка: КОНТЕКСТНЫЕ НАСТРОЙКИ ===== */}
      <div className="fixed inset-x-0 bottom-[96px] z-50 bg-white/95 border-t border-black/10" {...stopAll}>
        <SettingsRow />
      </div>

      {/* ===== 3-я строка: FRONT/BACK + download ===== */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10" {...stopAll}>
        <div className="px-2 pb-2 pt-1 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className="h-10 w-12 border border-black bg-white grid place-items-center" onClick={onDownloadFront}><Download className={ico}/></button>
          </div>
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
            <button className="h-10 w-12 border border-black bg-white grid place-items-center" onClick={onDownloadBack}><Download className={ico}/></button>
          </div>
        </div>
      </div>
    </>
  )
}
