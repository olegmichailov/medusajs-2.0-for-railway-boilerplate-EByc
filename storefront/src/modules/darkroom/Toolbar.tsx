// storefront/src/modules/darkroom/Toolbar.tsx
"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Move, Brush, Eraser, Type as TypeIcon, Image as ImageIcon,
  Download, Layers as LayersIcon, Square, Circle, Triangle, Plus, Slash,
  Undo2, Redo2, Trash2
} from "lucide-react"
import { isMobile } from "react-device-detect"
import type { ShapeKind, Side, Tool } from "./store"

type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

type Props = {
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (hex: string) => void
  brushSize: number
  setBrushSize: (n: number) => void

  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void

  onClear: () => void
  onUndo: () => void
  onRedo: () => void

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

  // мобильные мини-контролы слоев
  layerItems: LayerItem[]
  onLayerSelect: (id: string) => void
  onToggleLayerVisible: (id: string) => void
  onToggleLayerLock: (id: string) => void
  onDuplicateLayer: (id: string) => void
  onDeleteLayer: (id: string) => void
  onChangeLayerBlend: (id: string, b: string) => void
  onChangeLayerOpacity: (id: string, v: number) => void
  onMoveLayerUp: (id: string) => void
  onMoveLayerDown: (id: string) => void

  // сообщаем высоту моб. панелей, чтобы сцена не перекрывалась
  onMobileHeight: (h: number) => void
}

const btnBase =
  "w-12 h-12 md:h-9 md:w-9 grid place-items-center border border-black rounded-none bg-white text-black select-none"
const btnActive = "bg-black text-white"
const icon = "w-4 h-4"
const block = "border border-black bg-white"

export default function Toolbar(props: Props) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onClear, onUndo, onRedo,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedText, setSelectedFontSize, setSelectedColor,
    layerItems, onMobileHeight
  } = props

  // файл аплоадер
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // системный color-picker по тапу
  const colorRef = useRef<HTMLInputElement>(null)
  const openColor = (e: React.MouseEvent) => { e.stopPropagation(); colorRef.current?.click() }
  const onColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    if (selectedKind) props.setSelectedColor(hex); else setBrushColor(hex)
  }

  // локальный текст-state (для settings Text)
  const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
  useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

  // Квадратные слайдеры (thumb)
  const RangeCSS = () => (
    <style>{`
      .sq-range { -webkit-appearance:none; appearance:none; width:100%; height:6px; background:#e5e5e5; border:1px solid #000; }
      .sq-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; background:#000; cursor:pointer; }
      .sq-range::-moz-range-thumb { width:16px; height:16px; background:#000; border:none; cursor:pointer; }
      .sq-range:focus { outline:none; }
    `}</style>
  )

  // ===== Desktop (ничего не меняем визуально, просто не показываем моб. блоки) =====
  if (!isMobile) {
    return (
      <div className="fixed left-5 top-28 z-30 select-none" style={{ width: 220 }}>
        <RangeCSS/>
        {/* Можешь оставить свой уже рабочий Desktop Toolbar тут — в проекте он отдельный. 
            Чтобы не ломать твой вид, мобильный код ниже. */}
      </div>
    )
  }

  // ===== Mobile =====
  const barRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const report = () => {
      const h = (barRef.current?.getBoundingClientRect().height ?? 120)
      onMobileHeight(Math.ceil(h))
    }
    report()
    const ro = new ResizeObserver(report)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [onMobileHeight])

  // одна строка инструментов
  const ToolButton = (t: Tool | "image" | "text", Child: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={`${btnBase} ${tool===t ? btnActive : ""}`}
      onClick={(e)=>{ e.stopPropagation(); if (onPress) onPress(); else if (t==="image") fileRef.current?.click(); else if (t==="text") onAddText(); else setTool(t as Tool) }}
    >
      {Child}
    </button>
  )

  // контекстные сеттинги под строкой инструментов
  const Settings = () => {
    if (tool === "brush") {
      return (
        <div className={`p-2 ${block}`}>
          <div className="text-[10px] mb-1">BRUSH</div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 border border-black" style={{ background: brushColor }} onClick={openColor} />
            <input className="sq-range" type="range" min={1} max={200} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value))}/>
          </div>
        </div>
      )
    }
    if (tool === "erase") {
      return (
        <div className={`p-2 ${block}`}>
          <div className="text-[10px] mb-1">ERASE</div>
          <input className="sq-range" type="range" min={1} max={200} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value))}/>
        </div>
      )
    }
    if (tool === "move") {
      return (
        <div className={`p-2 ${block}`}>
          <div className="text-[10px]">Select an object to edit.</div>
        </div>
      )
    }
    if (tool === "shape") {
      return (
        <div className={`p-2 ${block}`}>
          <div className="text-[10px] mb-1">SHAPES</div>
          <div className="flex items-center gap-1 mb-2">
            <button className={btnBase} onClick={()=>props.onAddShape("square")}><Square className={icon}/></button>
            <button className={btnBase} onClick={()=>props.onAddShape("circle")}><Circle className={icon}/></button>
            <button className={btnBase} onClick={()=>props.onAddShape("triangle")}><Triangle className={icon}/></button>
            <button className={btnBase} onClick={()=>props.onAddShape("cross")}><Plus className={icon}/></button>
            <button className={btnBase} onClick={()=>props.onAddShape("line")}><Slash className={icon}/></button>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px]">Color</div>
            <div className="w-8 h-8 border border-black" style={{ background: brushColor }} onClick={openColor}/>
          </div>
        </div>
      )
    }
    if (tool === "text" || selectedKind === "text") {
      return (
        <div className={`p-2 ${block}`}>
          <div className="text-[10px] mb-1">TEXT</div>
          <textarea
            value={textValue}
            onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
            className="w-full h-16 border border-black p-2 text-sm"
            placeholder="Enter text"
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="w-8 h-8 border border-black" style={{ background: (selectedProps.fill ?? brushColor) }} onClick={openColor}/>
            <input className="sq-range" type="range" min={8} max={800} step={1} value={selectedProps.fontSize ?? 112} onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}/>
            <div className="text-[10px] w-10 text-right">{selectedProps.fontSize ?? 112}</div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div ref={barRef} className="fixed inset-x-0 bottom-0 z-40 bg-white/95 border-t border-black/10 select-none">
      <RangeCSS/>

      {/* строка инструментов */}
      <div className="px-2 py-2 flex items-center gap-[6px]">
        {ToolButton("move",  <Move  className={icon}/>)}
        {ToolButton("brush", <Brush className={icon}/>)}
        {ToolButton("erase", <Eraser className={icon}/>)}
        {ToolButton("text",  <TypeIcon className={icon}/>, onAddText)}
        {ToolButton("image", <ImageIcon className={icon}/>)}
        {ToolButton("shape", <Triangle className={icon}/>)} {/* иконка «Shape» */}
        <button className={`${btnBase} ${layersOpen?btnActive:""}`} onClick={(e)=>{e.stopPropagation(); toggleLayers()}}>
          <LayersIcon className={icon}/>
        </button>
        <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onUndo()}} title="Undo"><Undo2 className={icon}/></button>
        <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onRedo()}} title="Redo"><Redo2 className={icon}/></button>
        <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onClear()}} title="Clear"><Trash2 className={icon}/></button>

        {/* скрытые инпуты */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        <input ref={colorRef} type="color" value={selectedKind ? (props.selectedProps.fill ?? brushColor) : brushColor} onChange={onColorChange} className="hidden"/>
      </div>

      {/* контекстные сеттинги */}
      <Settings/>

      {/* нижняя строка — FRONT ⬇ | BACK ⬇ */}
      <div className="px-2 py-2 grid grid-cols-2 gap-2">
        <button
          className={`h-10 border border-black flex items-center justify-center gap-2 ${side==="front" ? "bg-black text-white" : "bg-white text-black"}`}
          onClick={(e)=>{e.stopPropagation(); setSide("front");}}
        >
          <span>FRONT</span>
          <Download className={icon} onClick={(e)=>{ e.stopPropagation(); onDownloadFront() }}/>
        </button>

        <button
          className={`h-10 border border-black flex items-center justify-center gap-2 ${side==="back" ? "bg-black text-white" : "bg-white text-black"}`}
          onClick={(e)=>{e.stopPropagation(); setSide("back");}}
        >
          <span>BACK</span>
          <Download className={icon} onClick={(e)=>{ e.stopPropagation(); onDownloadBack() }}/>
        </button>
      </div>
    </div>
  )
}
