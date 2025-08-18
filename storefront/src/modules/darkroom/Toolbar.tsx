
"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { isMobile } from "react-device-detect"
import { ShapeKind, Side, Tool } from "./store"
import type { LayerType } from "./EditorCanvas"

type Props = {
  // global
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (c: string) => void
  brushSize: number
  setBrushSize: (n: number) => void
  shapeKind: ShapeKin"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, Layers,
  RotateCcw, RotateCw
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { useDarkroom } from "./store"
import { isMobile } from "react-device-detect"

// ───────────────── types ─────────────────
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

  // NEW: управление историей / очисткой
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

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  mobileLayers: MobileLayersProps
}

// ───────────────── ui helpers ─────────────────
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

// ───────────────── component ─────────────────
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
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    mobileLayers,
  } = props

  const { selectedId } = useDarkroom()

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

    // текст-инпут локально
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

            {/* row 2 — цвет + size */}
            <div className="flex items-center gap-3">
              <div className="text-[10px] w-8">Color</div>
              <ColorSwatch
                color={brushColor}
                onPick={(hex)=>{ setBrushColor(hex); if (selectedKind) setSelectedColor(hex) }}
              />
              <div className="flex-1">
                <Range
                  value={brushSize} min={1} max={200}
                  onChange={(n)=>setBrushSize(n)}
                />
              </div>
            </div>

            {/* палитра (только десктоп) */}
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
                <div className="flex-1">
                  <Range
                    value={selectedProps.fontSize ?? 96}
                    min={8} max={800}
                    onChange={(n)=>setSelectedFontSize(n)}
                  />
                </div>
                <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
              </div>
            </div>

            {/* row — Undo/Redo/Clear */}
            <div className="flex gap-2">
              <button className={clx("h-9 flex-1 border border-black bg-white flex items-center justify-center gap-2")} onClick={(e)=>{e.stopPropagation(); onUndo()}}>
                <RotateCcw className={ico}/> <span className="text-xs">Назад</span>
              </button>
              <button className={clx("h-9 flex-1 border border-black bg-white flex items-center justify-center gap-2")} onClick={(e)=>{e.stopPropagation(); onRedo()}}>
                <RotateCw className={ico}/> <span className="text-xs">Вперёд</span>
              </button>
              <button className={clx("h-9 flex-1 border border-black bg-white flex items-center justify-center gap-2")} onClick={(e)=>{e.stopPropagation(); onClear()}}>
                <Trash2 className={ico}/> <span className="text-xs">Клир</span>
              </button>
            </div>

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

  // Opacity для текущего выбранного слоя; если нет selectedId — disabled
  const [opacityM, setOpacityM] = useState<number>(100)
  const canOpacity = useMemo(()=>!!selectedId, [selectedId])

  const applyOpacity = (val: number) => {
    setOpacityM(val)
    if (selectedId) {
      const clamped = Math.max(0, Math.min(100, val))
      mobileLayers.onChangeOpacity(selectedId, clamped / 100)
    }
  }

  return (
    <>
      {/* Шторка LAYERS */}
      {layersOpenM && (
        <div className="fixed inset-x-0 bottom-36 z-40 px-3">
          <div className={clx(wrap, "p-2")}>
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

      {/* Нижняя панель — 3 строки, не перекрывают мокап */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 — инструменты + layers + Undo/Redo/Clear */}
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
          <div className="ml-2 flex gap-1">
            <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onUndo()}} title="Назад"><RotateCcw className={ico}/></button>
            <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onRedo()}} title="Вперёд"><RotateCw className={ico}/></button>
            <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onClear()}} title="Клир"><Trash2 className={ico}/></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>

        {/* row 2 — настройки: Color swatch + Size + Opacity (без палитры) */}
        <div className="px-2 py-1 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-[10px]">Color</div>
            <ColorSwatch
              size={32}
              color={brushColor}
              onPick={(hex)=>{ setBrushColor(hex); if (selectedKind) setSelectedColor(hex) }}
            />
          </div>

          <div className="flex items-center gap-2 flex-1">
            <div className="text-[10px] w-10">Size</div>
            <div className="flex-1"><Range value={brushSize} min={1} max={200} onChange={setBrushSize}/></div>
          </div>

          <div className="flex items-center gap-2 flex-1 opacity-100">
            <div className="text-[10px] w-12">Opacity</div>
            <div className="flex-1">
              <Range
                value={opacityM}
                min={0} max={100}
                onChange={applyOpacity}
                disabled={!canOpacity}
              />
            </div>
            <div className="text-[10px] w-8 text-right">{opacityM}</div>
          </div>
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

// ───────────────── small UI pieces ─────────────────

function ColorSwatch({ color, onPick, size = 24 }: { color: string; onPick: (hex: string)=>void; size?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        className="border border-black"
        style={{ width: size, height: size, background: color }}
        onClick={(e)=>{ e.stopPropagation(); ref.current?.click() }}
        title={color}
      />
      <input
        ref={ref}
        type="color"
        value={color}
        onChange={(e)=>onPick(e.target.value)}
        className="hidden"
        {...inputStop}
      />
    </>
  )
}

function Range({
  value, min, max, onChange, disabled
}: {
  value: number; min: number; max: number; onChange: (n:number)=>void; disabled?: boolean
}) {
  const [v, setV] = useState(value)
  useEffect(()=>setV(value), [value])
  return (
    <div className={clx("flex items-center gap-2", disabled && "opacity-50 pointer-events-none")} {...inputStop}>
      <input
        type="range"
        min={min} max={max} step={1}
        value={v}
        onChange={(e)=>{ const n = parseInt(e.target.value); setV(n); onChange(n) }}
        className="w-full"
        style={{ accentColor: "#000" }}
      />
      <div className="w-3 h-3 bg-black" />
    </div>
  )
}
  setShapeKind: (k: ShapeKind) => void
  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  toggleLayers: () => void
  layersOpen: boolean

  // selection (context)
  selectedKind: LayerType | null
  selectedProps: any
  setSelectedFill: (v: string) => void
  setSelectedStroke: (v: string) => void
  setSelectedStrokeW: (v: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (c: string) => void

  // ops
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange: (h: number) => void
}

const squareBtn =
  "inline-flex items-center justify-center w-12 h-12 border border-black/80 bg-white active:scale-[0.98]"

const row = "flex items-center gap-3"
const col = "flex flex-col gap-3"

// desktop palette (like your screenshot)
const DESKTOP_COLORS = [
  "#000000","#353535","#6B6B6B","#9C9C9C","#D2D2D2","#FFFFFF",
  "#FF2B7F","#FF6A00","#FFC400","#FFE600","#7FFF00","#00E4A6",
]

function HiddenPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <button
        className={squareBtn}
        style={{ background: value }}
        aria-label="Color"
        onClick={() => ref.current?.click()}
      />
      <input
        ref={ref}
        type="color"
        className="sr-only"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export default function Toolbar(p: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  // report height to canvas for paddingBottom (mobile)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new (window as any).ResizeObserver((entries: any[]) => {
      const h = Math.ceil(entries[0].contentRect.height)
      p.onHeightChange(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ToolBtn = ({
    t,
    label,
    onClick,
    active,
  }: { t?: Tool; label: string; onClick?: () => void; active?: boolean }) => (
    <button
      className={`${squareBtn} ${active ? "bg-black text-white" : ""}`}
      aria-label={label}
      onClick={onClick || (() => p.setTool(t!) )}
    >
      <span className="text-xs font-bold">{label}</span>
    </button>
  )

  const ShapeBtn = ({ k, label }: { k: ShapeKind; label: string }) => (
    <button
      className={squareBtn}
      aria-label={label}
      onClick={() => { p.setShapeKind(k); p.onAddShape(k) }}
    >
      <span className="text-xs">{label}</span>
    </button>
  )

  const SideBtn = ({ tgt, onDownload }: { tgt: Side; onDownload: () => void }) => {
    const active = p.side === tgt
    return (
      <div className="flex">
        <button
          className={`px-4 h-10 border border-black/80 ${active ? "bg-black text-white" : "bg-white"}`}
          onClick={() => p.setSide(tgt)}
        >
          {tgt.toUpperCase()}
        </button>
        <button
          className="h-10 px-3 border border-l-0 border-black/80 bg-white"
          title="Download"
          onClick={onDownload}
        >
          ⬇
        </button>
      </div>
    )
  }

  const Slider = ({
    min, max, value, onChange, label
  }: { min: number; max: number; value: number; onChange: (v: number)=>void; label: string }) => (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-16">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        className="w-40"
      />
      <span className="tabular-nums w-8 text-right">{value}</span>
    </label>
  )

  // ========== Desktop ==========
  if (!isMobile) {
    return (
      <div
        ref={hostRef}
        className="fixed left-6 top-[120px] w-[200px] bg-white border border-black/10 rounded-sm p-3"
        style={{ zIndex: 20 }}
      >
        <div className={col}>
          <div className={row}>
            <ToolBtn t="move"  label="↔" active={p.tool==="move"} />
            <ToolBtn t="brush" label="✚" active={p.tool==="brush"} />
            <ToolBtn t="erase" label="⌫" active={p.tool==="erase"} />
            <ToolBtn label="T" onClick={p.onAddText} />
            <ToolBtn label="▦" onClick={() => p.toggleLayers()} active={p.layersOpen} />
          </div>

          <div className={row}>
            <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
            {DESKTOP_COLORS.map((c) => (
              <button
                key={c}
                className={`${squareBtn} w-6 h-6`}
                style={{ background: c }}
                onClick={() => p.setBrushColor(c)}
              />
            ))}
          </div>

          <div className={row}>
            <ShapeBtn k="line" label="—" />
            <ShapeBtn k="square" label="□" />
            <ShapeBtn k="circle" label="●" />
            <ShapeBtn k="triangle" label="△" />
            <ShapeBtn k="cross" label="✚" />
          </div>

          <div className="flex flex-col gap-2">
            <input
              placeholder="Enter text"
              className="border border-black/40 px-2 py-1 text-sm"
              value={p.selectedKind==="text" ? (p.selectedProps.text || "") : ""}
              onChange={(e) => p.setSelectedText(e.target.value)}
            />
            <Slider
              min={8} max={180}
              value={Math.round(p.selectedKind==="text" ? (p.selectedProps.fontSize || 96) : 96)}
              onChange={(v) => p.setSelectedFontSize(v)}
              label="Font size"
            />
          </div>

          <div className={row}>
            <SideBtn tgt="front" onDownload={p.onDownloadFront} />
            <SideBtn tgt="back"  onDownload={p.onDownloadBack} />
          </div>

          <div className="flex items-center gap-2">
            <button className={squareBtn} title="Undo" onClick={p.onUndo}>↶</button>
            <button className={squareBtn} title="Redo" onClick={p.onRedo}>↷</button>
            <button className={squareBtn} title="Clear" onClick={p.onClear}>🗑</button>
          </div>

          <Slider
            min={1} max={112}
            value={Math.round(p.brushSize)}
            onChange={p.setBrushSize}
            label="Brush"
          />
        </div>
      </div>
    )
  }

  // ========== Mobile ==========
  const toolRow = (
    <div className="grid grid-cols-10 gap-2">
      <ToolBtn t="move"  label="↔" active={p.tool==="move"} />
      <ToolBtn t="brush" label="✚" active={p.tool==="brush"} />
      <ToolBtn t="erase" label="⌫" active={p.tool==="erase"} />
      <ToolBtn label="T" onClick={p.onAddText} />
      <ToolBtn label="🖼" onClick={() => {
        const i = document.createElement("input")
        i.type = "file"
        i.accept = "image/*"
        i.onchange = () => {
          const f = i.files?.[0]
          if (f) p.onUploadImage(f)
        }
        i.click()
      }} />
      <ToolBtn label="□" onClick={() => p.onAddShape("square")} />
      <ToolBtn label="●" onClick={() => p.onAddShape("circle")} />
      <ToolBtn label="△" onClick={() => p.onAddShape("triangle")} />
      <ToolBtn label="✚" onClick={() => p.onAddShape("cross")} />
      <ToolBtn label="▦" onClick={() => p.toggleLayers()} active={p.layersOpen} />
    </div>
  )

  const contextRow = useMemo(() => {
    if (p.tool === "brush" || p.tool === "erase") {
      return (
        <div className="flex items-center justify-between gap-4">
          <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
          <Slider min={1} max={112} value={Math.round(p.brushSize)} onChange={p.setBrushSize} label="Brush" />
        </div>
      )
    }
    if (p.selectedKind === "text") {
      return (
        <div className="flex flex-col gap-2">
          <input
            className="border border-black/40 px-2 py-1 text-sm"
            placeholder="Enter text"
            value={p.selectedProps.text || ""}
            onChange={(e)=>p.setSelectedText(e.target.value)}
          />
          <Slider
            min={8} max={180}
            value={Math.round(p.selectedProps.fontSize || 96)}
            onChange={p.setSelectedFontSize}
            label="Font size"
          />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2">
        {DESKTOP_COLORS.map((c)=>(
          <button key={c} className="w-6 h-6 border border-black/40" style={{background:c}} onClick={()=>p.setBrushColor(c)}/>
        ))}
        <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
      </div>
    )
  }, [p.tool, p.selectedKind, p.selectedProps, p.brushColor, p.brushSize])

  return (
    <div
      ref={hostRef}
      className="fixed left-0 right-0 bottom-0 bg-white border-t border-black/10 p-3"
      style={{ zIndex: 20 }}
    >
      <div className="flex flex-col gap-3">
        {toolRow}
        {contextRow}
        <div className="flex items-center justify-between gap-3">
          <SideBtn tgt="front" onDownload={p.onDownloadFront} />
          <div className="flex gap-2">
            <button className={squareBtn} onClick={p.onUndo}>↶</button>
            <button className={squareBtn} onClick={p.onRedo}>↷</button>
            <button className={squareBtn} onClick={p.onClear}>🗑</button>
          </div>
          <SideBtn tgt="back" onDownload={p.onDownloadBack} />
        </div>
      </div>
    </div>
  )
}
