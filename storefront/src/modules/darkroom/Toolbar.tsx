"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, Layers as LayersIcon, Undo2, Redo2, Trash2,
  Circle, Square, Triangle, Plus, Slash
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ===== Типы для мобильной панели слоёв =====
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

// ===== Пропсы Toolbar =====
type Props = {
  side: Side
  setSide: (s: Side) => void

  tool: Tool
  setTool: (t: Tool) => void

  brushColor: string
  setBrushColor: (hex: string) => void

  brushSize: number
  setBrushSize: (n: number) => void

  shapeKind: ShapeKind | null
  setShapeKind: (k: ShapeKind | null) => void

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

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  mobileLayers: MobileLayersProps
}

// — единая «плоская» палитра
const PALETTE = [
  "#000000","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF007A","#FF4D00","#FFB300","#FFD400","#66FF00","#00FFA8",
  "#00E5FF","#0066FF","#2B00FF","#8A00FF","#FF00D4","#FF2F2F",
]

// утилиты UI
const ico = "w-5 h-5"
const squareBtn =
  "w-12 h-12 grid place-items-center border border-black bg-white text-black rounded-none select-none active:translate-y-[0.5px]"
const squareBtnActive = "bg-black text-white"
const row = "px-2 py-1"

export default function Toolbar(props: Props) {
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
    setSelectedText, setSelectedFontSize, setSelectedColor,
    mobileLayers,
  } = props

  // ===== DESKTOP =====
  if (!isMobile) {
    // скромная левосторонняя панель, внешне как прежде
    const fileRef = useRef<HTMLInputElement>(null)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    // локальный state для текста
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div className="hidden md:block fixed left-5 top-28 z-30 select-none" style={{ width: 260 }}>
        <div className="bg-white border border-black/20 rounded-none shadow-sm">
          {/* header */}
          <div className="px-3 py-2 border-b border-black/10 flex items-center justify-between">
            <span className="text-[10px] tracking-[0.18em] font-semibold">TOOLS</span>
            <button
              className={`${squareBtn} w-8 h-8`}
              onClick={(e)=>{e.stopPropagation(); toggleLayers()}}
              title="Layers"
            >
              <LayersIcon className="w-4 h-4"/>
            </button>
          </div>

          {/* инструменты */}
          <div className="px-3 py-2 border-b border-black/10">
            <div className="grid grid-cols-6 gap-1">
              <ToolBtn label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}><Move className={ico}/></ToolBtn>
              <ToolBtn label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")}><Brush className={ico}/></ToolBtn>
              <ToolBtn label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")}><Eraser className={ico}/></ToolBtn>
              <ToolBtn label="Text"   onClick={onAddText}><TypeIcon className={ico}/></ToolBtn>
              <ToolBtn label="Image"  onClick={()=>fileRef.current?.click()}><ImageIcon className={ico}/></ToolBtn>
              <ToolBtn label="Shapes" active={tool==="shape"} onClick={()=>setTool("shape")}><Shapes className={ico}/></ToolBtn>
            </div>
          </div>

          {/* контекстные настройки (десктоп) */}
          <DesktopSettings
            tool={tool}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            selectedKind={selectedKind}
            selectedProps={selectedProps}
            setSelectedText={setSelectedText}
            setSelectedFontSize={setSelectedFontSize}
            onAddShape={onAddShape}
          />

          {/* низ: стороны и загрузки */}
          <div className="px-3 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button className={`h-10 border ${side==="front"?"bg-black text-white":"border-black"}`} onClick={()=>setSide("front")}>FRONT</button>
              <button className={`h-10 border ${side==="back" ?"bg-black text-white":"border-black"}`} onClick={()=>setSide("back")}>BACK</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={onDownloadFront}>
                <Download className="w-4 h-4"/> Download
              </button>
              <button className="h-10 border border-black flex items-center justify-center gap-2 bg-white" onClick={onDownloadBack}>
                <Download className="w-4 h-4"/> Download
              </button>
            </div>
          </div>
        </div>

        {/* hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        <SquareSliderStyle/>
      </div>
    )
  }

  // ===== MOBILE =====
  // слои — шторка
  const [layersOpenM, setLayersOpenM] = useState(false)

  // файл для «Image»
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // контекстные настройки (sheet над инструментами)
  const SettingsSheet = (
    <div className="fixed inset-x-0 bottom-[56px] z-40 px-2 pb-1">
      <div className="border border-black bg-white">
        {/* BRUSH */}
        {tool==="brush" && (
          <div className={`${row} space-y-2`}>
            <div className="text-[10px] tracking-widest">BRUSH</div>
            <ColorRow color={brushColor} onPick={(hex)=>{ setBrushColor(hex); if (selectedKind) props.setSelectedColor(hex) }}/>
            <SliderRow label="SIZE" value={brushSize} min={1} max={200} onChange={setBrushSize}/>
          </div>
        )}

        {/* ERASE */}
        {tool==="erase" && (
          <div className={`${row} space-y-2`}>
            <div className="text-[10px] tracking-widest">ERASE</div>
            <SliderRow label="SIZE" value={brushSize} min={1} max={200} onChange={setBrushSize}/>
            <div className="text-[11px] text-black/70">Erases drawing & shapes/text (mockup stays).</div>
          </div>
        )}

        {/* TEXT */}
        {tool==="text" && (
          <div className={`${row} space-y-2`}>
            <div className="text-[10px] tracking-widest">TEXT</div>
            <textarea
              className="w-full h-16 border border-black p-1 text-sm"
              placeholder="Enter text"
              value={selectedProps?.text ?? ""}
              onChange={(e)=>setSelectedText(e.target.value)}
            />
            <SliderRow label="FONT" value={Math.round(selectedProps?.fontSize ?? 112)} min={8} max={800} onChange={setSelectedFontSize}/>
            <ColorRow color={brushColor} onPick={(hex)=>{ setBrushColor(hex); setSelectedColor(hex) }}/>
          </div>
        )}

        {/* SHAPES */}
        {tool==="shape" && (
          <div className={`${row} space-y-2`}>
            <div className="text-[10px] tracking-widest">SHAPES</div>
            <div className="grid grid-cols-5 gap-[2px]">
              <button className={squareBtn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
              <button className={squareBtn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
              <button className={squareBtn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
              <button className={squareBtn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
              <button className={squareBtn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
            </div>
            <ColorRow color={brushColor} onPick={(hex)=>setBrushColor(hex)}/>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* LAYERS sheet */}
      {layersOpenM && (
        <div className="fixed inset-x-0 bottom-[56px] z-40 px-2">
          <div className="border border-black bg-white max-h-64 overflow-auto p-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={`${squareBtn} ${squareBtnActive} w-16`} onClick={()=>setLayersOpenM(false)}>CLOSE</button>
            </div>
            <div className="space-y-2">
              {mobileLayers.items.map((l)=>(
                <div key={l.id} className="flex items-center gap-2 border border-black px-2 py-1 bg-white">
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)}>{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveUp(l.id)}>↑</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveDown(l.id)}>↓</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onDuplicate(l.id)}>⧉</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleLock(l.id)}>{l.locked?"🔒":"🔓"}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleVisible(l.id)}>{l.visible?"👁":"🚫"}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>mobileLayers.onDelete(l.id)}><Trash2 className="w-3 h-3"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONTEXT SETTINGS */}
      {(tool==="brush" || tool==="erase" || tool==="text" || tool==="shape") && SettingsSheet}

      {/* НИЖНЯЯ ПАНЕЛЬ ИНСТРУМЕНТОВ (ПЕРВЫЙ РЯД) */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-black">
        <div className={`${row} flex items-center justify-between gap-[2px]`}>
          <ToolSquare label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}><Move className={ico}/></ToolSquare>
          <ToolSquare label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")}><Brush className={ico}/></ToolSquare>
          <ToolSquare label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")}><Eraser className={ico}/></ToolSquare>
          <ToolSquare label="Text"   active={tool==="text"}  onClick={()=>setTool("text")}><TypeIcon className={ico}/></ToolSquare>
          {/* Image — сразу открываем file picker */}
          <label className={squareBtn} title="Image">
            <ImageIcon className={ico}/>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
          </label>
          <ToolSquare label="Shapes" active={tool==="shape"} onClick={()=>setTool("shape")}><Shapes className={ico}/></ToolSquare>
          <ToolSquare label="Undo"   onClick={onUndo}><Undo2 className={ico}/></ToolSquare>
          <ToolSquare label="Redo"   onClick={onRedo}><Redo2 className={ico}/></ToolSquare>
          <ToolSquare label="Clear"  onClick={onClear}><Trash2 className={ico}/></ToolSquare>
          <ToolSquare label="Layers" active={layersOpenM} onClick={()=>setLayersOpenM(v=>!v)}><LayersIcon className={ico}/></ToolSquare>
        </div>

        {/* ВТОРОЙ РЯД — FRONT/BACK + download в одну строку */}
        <div className={`${row} grid grid-cols-2 gap-2 border-t border-black/20`}>
          <button
            className={`h-10 border ${props.side==="front" ? "bg-black text-white" : "bg-white text-black"} flex items-center justify-between px-3`}
            onClick={()=>setSide("front")}
          >
            <span>FRONT</span>
            <Download className="w-5 h-5" onClick={(e)=>{ e.stopPropagation(); onDownloadFront() }}/>
          </button>
          <button
            className={`h-10 border ${props.side==="back" ? "bg-black text-white" : "bg-white text-black"} flex items-center justify-between px-3`}
            onClick={()=>setSide("back")}
          >
            <span>BACK</span>
            <Download className="w-5 h-5" onClick={(e)=>{ e.stopPropagation(); onDownloadBack() }}/>
          </button>
        </div>
      </div>

      <SquareSliderStyle/>
    </>
  )
}

/* ================= helpers (UI) ================ */

function ToolBtn(props: {label?:string; active?:boolean; onClick:()=>void; children:React.ReactNode}) {
  const { active, onClick, children } = props
  return (
    <button
      className={`${squareBtn} ${active ? squareBtnActive : ""}`}
      onClick={(e)=>{ e.stopPropagation(); onClick() }}
      title={props.label}
    >
      {children}
    </button>
  )
}

function DesktopSettings({
  tool, brushColor, setBrushColor, brushSize, setBrushSize,
  selectedKind, selectedProps, setSelectedText, setSelectedFontSize, onAddShape
}: {
  tool: Tool
  brushColor: string
  setBrushColor: (c:string)=>void
  brushSize: number
  setBrushSize: (n:number)=>void
  selectedKind: Props["selectedKind"]
  selectedProps: Props["selectedProps"]
  setSelectedText: (t:string)=>void
  setSelectedFontSize: (n:number)=>void
  onAddShape: (k: ShapeKind)=>void
}) {
  return (
    <div className="px-3 py-2 border-b border-black/10 space-y-3">
      {tool==="brush" && (
        <>
          <div className="text-[10px] uppercase tracking-wider">Color</div>
          <ColorRow color={brushColor} onPick={setBrushColor}/>
          <SliderRow label="Size" value={brushSize} min={1} max={200} onChange={setBrushSize}/>
        </>
      )}
      {tool==="erase" && (
        <>
          <div className="text-[10px] uppercase tracking-wider">Erase size</div>
          <SliderRow label="Size" value={brushSize} min={1} max={200} onChange={setBrushSize}/>
        </>
      )}
      {tool==="text" && (
        <>
          <div className="text-[10px] uppercase tracking-wider">Text</div>
          <textarea
            placeholder="Enter text"
            className="w-full h-20 resize-none border border-black p-2 text-sm"
            value={selectedKind==="text" ? (selectedProps?.text ?? "") : ""}
            onChange={(e)=>{ if (selectedKind==="text") setSelectedText(e.target.value) }}
          />
          <SliderRow label="Font size" value={selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 112) : 112} min={8} max={800} onChange={setSelectedFontSize}/>
        </>
      )}
      {tool==="shape" && (
        <>
          <div className="text-[10px] uppercase tracking-wider">Shapes</div>
          <div className="grid grid-cols-5 gap-1">
            <button className={squareBtn} onClick={()=>onAddShape("square")}><Square className="w-4 h-4"/></button>
            <button className={squareBtn} onClick={()=>onAddShape("circle")}><Circle className="w-4 h-4"/></button>
            <button className={squareBtn} onClick={()=>onAddShape("triangle")}><Triangle className="w-4 h-4"/></button>
            <button className={squareBtn} onClick={()=>onAddShape("cross")}><Plus className="w-4 h-4"/></button>
            <button className={squareBtn} onClick={()=>onAddShape("line")}><Slash className="w-4 h-4"/></button>
          </div>
        </>
      )}
    </div>
  )
}

function ToolSquare(props:{label?:string; active?:boolean; onClick:()=>void; children:React.ReactNode}) {
  const { active, onClick, children } = props
  return (
    <button
      className={`${squareBtn} ${active ? squareBtnActive : ""}`}
      onClick={(e)=>{ e.stopPropagation(); onClick() }}
      title={props.label}
    >
      {children}
    </button>
  )
}

function ColorRow({ color, onPick }: { color: string; onPick: (hex:string)=>void }) {
  return (
    <div className="grid grid-cols-12 gap-[2px]">
      {PALETTE.map((hex)=>(
        <button
          key={hex}
          className="h-5 border border-black"
          style={{ background: hex }}
          onClick={()=>onPick(hex)}
          title={hex}
        />
      ))}
      <div className="flex items-center gap-2 col-span-12 mt-1">
        <span className="text-[10px] uppercase tracking-wider">Custom</span>
        <input
          type="color"
          value={color}
          onChange={(e)=>onPick(e.target.value)}
          className="w-8 h-5 border border-black"
        />
      </div>
    </div>
  )
}

function SliderRow({ label, value, min, max, onChange }:{
  label: string; value: number; min: number; max: number; onChange: (n:number)=>void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider w-16">{label}</span>
      <input
        type="range"
        min={min} max={max} step={1}
        value={value}
        onChange={(e)=>onChange(parseInt(e.target.value))}
        className="drk-slider flex-1"
      />
      <span className="text-[11px] tabular-nums w-10 text-right">{value}</span>
    </div>
  )
}

/** Квадратные «ручки» слайдера — как в слоях */
function SquareSliderStyle() {
  return (
    <style>{`
      .drk-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 2px;
        background: #d1d5db;
        outline: none;
      }
      .drk-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        background: #000;
        border: 1px solid #000;
        border-radius: 0;
        cursor: pointer;
        margin-top: -6px;
      }
      .drk-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: #000;
        border: 1px solid #000;
        border-radius: 0;
        cursor: pointer;
      }
    `}</style>
  )
}
