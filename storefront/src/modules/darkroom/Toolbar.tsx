// ============================
// Toolbar.tsx (FINAL)
// ============================
"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Trash2, Layers, AlignLeft, AlignCenter, AlignRight, Wand2, Eye, EyeOff, Lock, Unlock, Copy, ArrowUp, ArrowDown
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

export type FXMethod = "mono" | "duotone" | "dither" | "diffusion"
export type FXShape = "dot" | "square" | "line" | "diamond" | "hex"

export type FXState = {
  method: FXMethod
  shape: FXShape
  cell: number
  gamma: number
  minDot: number
  maxDot: number
  angle: number
  ditherSize: 4 | 8
  diffusion: "floyd" | "atkinson"
  duoA: string
  duoB: string
  angleB: number
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
    fontFamily?: string
    fill?: string
    lineHeight?: number
    letterSpacing?: number
    align?: "left" | "center" | "right"
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
  setSelectedLineHeight: (n: number) => void
  setSelectedLetterSpacing: (n: number) => void
  setSelectedAlign: (a: "left" | "center" | "right") => void

  fx: FXState
  setFX: (patch: Partial<FXState>) => void

  mobileLayers: {
    items: {
      id: string
      name: string
      type: "image" | "shape" | "text" | "strokes" | "erase"
      visible: boolean
      locked: boolean
      blend: string
      opacity: number
    }[]
    selectedId?: string
    onSelect: (id: string) => void
    onToggleVisible: (id: string) => void
    onToggleLock: (id: string) => void
    onDelete: (id: string) => void
    onDuplicate: (id: string) => void
    onMoveUp: (id: string) => void
    onMoveDown: (id: string) => void
  }
  mobileTopOffset?: number
}

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btn  =
  "h-10 px-3 grid place-items-center border border-black text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"
const iconBtn = "w-10 " + btn
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

// чёрный «ползунок»
const Slider = ({
  value, onChange, min=0, max=1, step=0.01, title
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; title?: string }) => {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="w-full" {...inputStop}>
      <div className="h-[2px] bg-black relative">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e)=>onChange(Number(e.target.value))}
          title={title}
          className="absolute inset-0 w-full h-4 opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-black"
          style={{ left: `${pct}%`, transform: "translate(-50%,-50%)" }}
        />
      </div>
    </div>
  )
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
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    setSelectedLineHeight, setSelectedLetterSpacing, setSelectedAlign,
    fx, setFX,
    mobileLayers, mobileTopOffset
  } = props

  // --- hooks ---
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState({ x: 24, y: 120 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
  useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

  const [layersOpenM, setLayersOpenM] = useState(false)

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

  const isDesktop = !isMobile
  const isText = selectedKind === "text"

  // ---------------- DESKTOP ----------------
  if (isDesktop) {
    return (
      <div
        className={clx("fixed", wrap)}
        style={{ left: pos.x, top: pos.y, width: 336 }}
        onMouseDown={(e)=>e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-2 py-1 text-[10px] tracking-widest">TOOLS</div>
          <div className="flex">
            <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); setOpen(!open)}}>
              {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>} 
            </button>
            <button className={iconBtn} onMouseDown={onDragStart}><Move className={ico}/></button>
          </div>
        </div>

        {open && (
          <div className="p-2 space-y-2">
            {/* row 1 — инструменты + Clear + Layers (в одну строку) */}
            <div className="flex flex-wrap items-center gap-0">
              {[
                {t:"move",   icon:<Move className={ico}/>},
                {t:"brush",  icon:<Brush className={ico}/>},
                {t:"erase",  icon:<Eraser className={ico}/>},
                {t:"text",   icon:<TypeIcon className={ico}/>},
                {t:"image",  icon:<ImageIcon className={ico}/>},
                {t:"shape",  icon:<Shapes className={ico}/>},
                {t:"fx",     icon:<Wand2 className={ico}/>},
              ].map((b)=>(
                <button
                  key={b.t}
                  className={clx(iconBtn, (tool===b.t) ? activeBtn : "bg-white")}
                  onClick={(e)=>{ 
                    e.stopPropagation()
                    if (b.t==="image") fileRef.current?.click()
                    else if (b.t==="text") onAddText()
                    else if (b.t==="shape") props.setShapeKind("square")
                    else setTool(b.t as Tool)
                  }}
                  title={b.t.toString()}
                >{b.icon}</button>
              ))}
              <div className="ml-2 flex gap-2">
                <button className={clx(btn, "bg-white")} onClick={(e)=>{e.stopPropagation(); onClear()}} title="Clear all">
                  <Trash2 className={ico}/> Clear
                </button>
                <button className={clx(btn, layersOpen ? activeBtn : "bg-white")} onClick={(e)=>{e.stopPropagation(); toggleLayers()}} title="Layers">
                  <Layers className={ico}/> Layers
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
            </div>

            {/* row 2 — кисть + палитра */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <div className="w-6 h-6 border border-black cursor-pointer" style={{ background: brushColor }} />
              <div className="flex-1">
                <Slider value={brushSize} min={1} max={200} step={1} onChange={setBrushSize} />
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1" {...inputStop}>
              {PALETTE.map((c)=>(
                <button
                  key={c}
                  className={clx("h-5 w-5 border", brushColor===c ? "border-black" : "border-black/40")}
                  style={{ background: c }}
                  onClick={(e)=>{ e.stopPropagation(); setBrushColor(c); if (selectedKind) setSelectedColor(c) }}
                />
              ))}
            </div>

            {/* ===== FX (real-time) ===== */}
            {tool === "fx" && (
              <div className="pt-1 space-y-2">
                <div className="text-[10px] mb-1">Raster / Effects (real-time)</div>

                <label className="text-xs block">Method
                  <select
                    className="w-full border border-black p-1 bg-white text-sm"
                    value={fx.method}
                    onChange={(e)=>props.setFX({ method: e.target.value as FXMethod })}
                    {...inputStop}
                  >
                    <option value="mono">Mono Halftone</option>
                    <option value="duotone">Duotone Halftone</option>
                    <option value="dither">Ordered Dither</option>
                    <option value="diffusion">Error Diffusion</option>
                  </select>
                </label>

                {(fx.method==="mono" || fx.method==="duotone") && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px]">Cell
                        <Slider value={fx.cell} min={3} max={40} step={1} onChange={(v)=>props.setFX({ cell: v })}/>
                      </label>
                      <label className="text-[10px]">Gamma
                        <Slider value={fx.gamma} min={0.3} max={2.2} step={0.05} onChange={(v)=>props.setFX({ gamma: v })}/>
                      </label>
                      <label className="text-[10px]">Min
                        <Slider value={fx.minDot} min={0} max={0.5} step={0.01} onChange={(v)=>props.setFX({ minDot: v })}/>
                      </label>
                      <label className="text-[10px]">Max
                        <Slider value={fx.maxDot} min={0.5} max={1} step={0.01} onChange={(v)=>props.setFX({ maxDot: v })}/>
                      </label>
                    </div>

                    <label className="text-[10px] block">Angle
                      <Slider value={fx.angle} min={-90} max={90} step={1} onChange={(v)=>props.setFX({ angle: v })}/>
                    </label>

                    <label className="text-[10px] block">Shape
                      <select
                        className="w-full border border-black p-1 bg-white text-sm"
                        value={fx.shape}
                        onChange={(e)=>props.setFX({ shape: e.target.value as any })}
                        {...inputStop}
                      >
                        <option value="dot">Dot</option>
                        <option value="square">Square</option>
                        <option value="line">Line</option>
                        <option value="diamond">Diamond</option>
                        <option value="hex">Hex</option>
                      </select>
                    </label>
                  </>
                )}

                {fx.method==="duotone" && (
                  <div className="grid grid-cols-2 gap-2" {...inputStop}>
                    <label className="text-[10px]">Angle B
                      <Slider value={fx.angleB} min={-90} max={90} step={1} onChange={(v)=>props.setFX({ angleB: v })}/>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] w-10">A</div>
                      <div className="w-6 h-6 border border-black" style={{background: fx.duoA}}/>
                      <div className="grid grid-cols-6 gap-1">
                        {PALETTE.slice(0,18).map(c=>(
                          <button key={c} className="w-4 h-4 border border-black/40" style={{background:c}} onClick={()=>props.setFX({ duoA: c })}/>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <div className="text-[10px] w-10">B</div>
                      <div className="w-6 h-6 border border-black" style={{background: fx.duoB}}/>
                      <div className="grid grid-cols-12 gap-1">
                        {PALETTE.slice(0,24).map(c=>(
                          <button key={c} className="w-4 h-4 border border-black/40" style={{background:c}} onClick={()=>props.setFX({ duoB: c })}/>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {fx.method==="dither" && (
                  <label className="text-[10px] block">Matrix
                    <select
                      className="w-full border border-black p-1 bg-white text-sm"
                      value={String(fx.ditherSize)}
                      onChange={(e)=>props.setFX({ ditherSize: parseInt(e.target.value) as 4|8 })}
                      {...inputStop}
                    >
                      <option value="4">4×4 Bayer</option>
                      <option value="8">8×8 Bayer</option>
                    </select>
                  </label>
                )}

                {fx.method==="diffusion" && (
                  <label className="text-[10px] block">Type
                    <select
                      className="w-full border border-black p-1 bg-white text-sm"
                      value={fx.diffusion}
                      onChange={(e)=>props.setFX({ diffusion: e.target.value as "floyd"|"atkinson" })}
                      {...inputStop}
                    >
                      <option value="floyd">Floyd–Steinberg</option>
                      <option value="atkinson">Atkinson</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* ===== обычные режимы: SHAPES + TEXT ===== */}
            {tool !== "fx" && (
              <>
                <div className="pt-1">
                  <div className="text-[10px] mb-1">Shapes</div>
                  <div className="flex">
                    <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
                    <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
                    <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
                    <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
                    <button className={iconBtn} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
                  </div>
                </div>

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
                    <Slider value={Math.round(selectedProps.fontSize ?? 96)} min={8} max={800} step={1} onChange={setSelectedFontSize} />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-[10px] w-16">Line height</div>
                    <Slider value={Number(selectedProps.lineHeight ?? 1)} min={0.6} max={3} step={0.01} onChange={setSelectedLineHeight} />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-[10px] w-16">Letter space</div>
                    <Slider value={Number(selectedProps.letterSpacing ?? 0)} min={-5} max={30} step={0.1} onChange={setSelectedLetterSpacing} />
                  </div>

                  <div className="flex gap-1">
                    <button className={clx(iconBtn, (isText && selectedProps.align==="left") ? activeBtn : "bg-white")} onClick={()=>setSelectedAlign("left")}><AlignLeft className={ico}/></button>
                    <button className={clx(iconBtn, (isText && selectedProps.align==="center") ? activeBtn : "bg-white")} onClick={()=>setSelectedAlign("center")}><AlignCenter className={ico}/></button>
                    <button className={clx(iconBtn, (isText && selectedProps.align==="right") ? activeBtn : "bg-white")} onClick={()=>setSelectedAlign("right")}><AlignRight className={ico}/></button>
                  </div>
                </div>
              </>
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

  // ---------------- MOBILE ----------------
  const mobileButton = (t: Tool | "image" | "shape" | "text" | "fx", icon: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ 
        e.stopPropagation(); 
        if (onPress) return onPress()
        if (t==="image") fileRef.current?.click()
        else if (t==="text") onAddText()
        else if (t==="shape") props.setTool("shape" as Tool)
        else setTool(t as Tool)
      }}
    >
      {icon}
    </button>
  )

  return (
    <>
      {/* Нижняя панель */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 — инструменты + layers */}
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move", <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text", <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}
          {mobileButton("fx", <Wand2 className={ico}/>)}
          <button className={clx("h-12 px-3 border border-black ml-1", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <Layers className={ico}/>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>

        {/* row 2 — кисть / цвета */}
        <div className="px-2 py-1 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="text-[10px]">Color</div>
            <div className="w-6 h-6 border border-black" style={{ background: brushColor }} />
          </div>
          <div className="flex-1"><Slider value={brushSize} min={1} max={200} step={1} onChange={setBrushSize} /></div>
          <div className="grid grid-cols-10 gap-1" {...inputStop}>
            {PALETTE.slice(0,20).map((c)=>(
              <button key={c} className="w-4 h-4 border border-black/40" style={{background:c}} onClick={(e)=>{e.stopPropagation(); setBrushColor(c); if (selectedKind) setSelectedColor(c)}}/>
            ))}
          </div>
        </div>

        {/* row 3 — FX компактно */}
        {props.tool === "fx" && (
          <div className="px-2 py-2 border-t border-black/10 space-y-2">
            <div className="text-[10px]">FX (real-time)</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px]">Method
                <select className="w-full border border-black p-1 bg-white text-sm" value={fx.method} onChange={(e)=>props.setFX({ method: e.target.value as FXMethod })}>
                  <option value="mono">Mono</option>
                  <option value="duotone">Duotone</option>
                  <option value="dither">Dither</option>
                  <option value="diffusion">Diffusion</option>
                </select>
              </label>
              {(fx.method==="mono"||fx.method==="duotone") && (
                <label className="text-[10px]">Cell
                  <Slider value={fx.cell} min={3} max={40} step={1} onChange={(v)=>props.setFX({ cell: v })}/>
                </label>
              )}
            </div>
          </div>
        )}

        {/* row 4 — FRONT/BACK + DL */}
        <div className="px-2 py-1 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={props.onDownloadFront}><Download className={ico}/>DL</button>
            <button className="flex-1 h-10 border border-black bg-white flex items-center justify-center gap-2" onClick={props.onDownloadBack}><Download className={ico}/>DL</button>
          </div>
        </div>
      </div>

      {/* LAYERS DRAWER (mobile) */}
      {layersOpenM && (
        <div className="fixed inset-x-0" style={{ bottom: (mobileTopOffset ?? 64) + 200 }}>
          <div className="mx-2 mb-2 border border-black bg-white/95 max-h-[40vh] overflow-auto">
            {mobileLayers.items.map(l => (
              <div key={l.id} className={clx("flex items-center gap-2 px-2 py-2 border-b border-black/10", mobileLayers.selectedId===l.id && "bg-black text-white")}>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onToggleVisible(l.id)}>{l.visible ? <Eye className={ico}/> : <EyeOff className={ico}/>}</button>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onToggleLock(l.id)}>{l.locked ? <Lock className={ico}/> : <Unlock className={ico}/>}</button>
                <div className="text-xs flex-1" onClick={()=>mobileLayers.onSelect(l.id)}>{l.name}</div>
                <div className="text-[10px] border border-black px-1">{l.type}</div>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onMoveUp(l.id)}><ArrowUp className={ico}/></button>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onMoveDown(l.id)}><ArrowDown className={ico}/></button>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onDuplicate(l.id)}><Copy className={ico}/></button>
                <button className="p-1 border border-black bg-white text-black" onClick={()=>mobileLayers.onDelete(l.id)}><Trash2 className={ico}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}


