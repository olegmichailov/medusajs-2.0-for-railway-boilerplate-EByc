// ===============================================
// storefront/src/modules/darkroom/Toolbar.tsx
// ===============================================
"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { isMobile } from "react-device-detect"
import { Side, Tool, ShapeKind } from "./store"
import { Layers, Move, Brush, Eraser, Type as TypeIcon, Image as ImageIcon, Square, Circle, Triangle, Plus, Undo2, Redo2, Download, Trash2 } from "lucide-react"

// Квадратная кнопка-иконка
function IconButton({ active, title, onClick, children, disabled }: { active?: boolean; title: string; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-12 w-12 border border-black ${active ? "bg-black text-white" : "bg-white text-black"} disabled:opacity-40 flex items-center justify-center`}
      style={{ borderRadius: 0 }}
    >
      {children}
    </button>
  )
}

// Полоска с измерением высоты для padBottom
function UseMeasureHeight({ onChange, targetRef }: { onChange: (h:number)=>void; targetRef: React.RefObject<HTMLDivElement> }) {
  useLayoutEffect(() => {
    const el = targetRef.current
    if (!el) return
    const ro = new ResizeObserver(() => onChange(el.getBoundingClientRect().height))
    ro.observe(el)
    onChange(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [onChange, targetRef])
  return null
}

// Стили для квадратного range (мягкое обновление через onInput)
const RangeCSS = () => (
  <style>{`
  input[type=range].sq { -webkit-appearance:none; appearance:none; width:100%; height:12px; background:#fff; border:1px solid #000; margin:0; padding:0; }
  input[type=range].sq:focus { outline:none }
  input[type=range].sq::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; background:#000; border:1px solid #000; }
  input[type=range].sq::-moz-range-thumb { width:12px; height:12px; background:#000; border:1px solid #000; }
  input[type=color].sw { -webkit-appearance:none; appearance:none; width:28px; height:28px; border:1px solid #000; padding:0; background:transparent; }
  `}</style>
)

export default function Toolbar(props: {
  // глобал
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (v: string) => void
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
  // selection
  selectedKind: "image" | "shape" | "text" | "strokes" | null
  selectedProps: any
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (w: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (n: string) => void
  setSelectedColor: (hex: string) => void
  // доп
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange: (h: number) => void
}) {
  const {
    side, setSide, tool, setTool, brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape, onDownloadFront, onDownloadBack, toggleLayers,
    selectedKind, selectedProps, setSelectedText, setSelectedFontSize, setSelectedColor,
    onUndo, onRedo, onClear, onHeightChange,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // высота — чтобы не перекрывал мокап
  useLayoutEffect(() => { if (rootRef.current) onHeightChange(rootRef.current.getBoundingClientRect().height) }, [onHeightChange])

  // мобилка: одна ровная строка квадратных инструментов, под ней — контекстные сеттинги
  const ToolsRow = (
    <div className="w-full flex items-center gap-2">
      <IconButton title="Move" active={tool==="move"} onClick={()=>setTool("move")}><Move size={18}/></IconButton>
      <IconButton title="Brush" active={tool==="brush"} onClick={()=>setTool("brush")}><Brush size={18}/></IconButton>
      <IconButton title="Erase" active={tool==="erase"} onClick={()=>setTool("erase")}><Eraser size={18}/></IconButton>
      <IconButton title="Text" active={tool==="text"} onClick={()=>{ setTool("text"); onAddText() }}><TypeIcon size={18}/></IconButton>
      <IconButton title="Image" active={tool==="image"} onClick={()=>imageInputRef.current?.click()}><ImageIcon size={18}/></IconButton>
      <input ref={imageInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value="" }} />
      <IconButton title="Shapes" active={tool==="shape"} onClick={()=>setTool("shape")}><Square size={18}/></IconButton>
      <IconButton title="Layers" onClick={toggleLayers}><Layers size={18}/></IconButton>
      <div className="flex-1" />
      <IconButton title="Undo" onClick={onUndo}><Undo2 size={18}/></IconButton>
      <IconButton title="Redo" onClick={onRedo}><Redo2 size={18}/></IconButton>
      <IconButton title="Clear (art only)" onClick={onClear}><Trash2 size={18}/></IconButton>
    </div>
  )

  const ContextRow = (
    <div className="mt-2 w-full">
      {tool === "brush" || tool === "erase" ? (
        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-2 text-[12px]">Size</label>
          <div className="col-span-8">
            <RangeCSS />
            <input
              type="range" min={1} max={256} step={1}
              className="sq w-full"
              value={brushSize}
              onChange={(e)=>setBrushSize(parseInt(e.target.value))}
              onInput={(e)=>setBrushSize(parseInt((e.target as HTMLInputElement).value))}
            />
          </div>
          <button className="col-span-2 h-8 w-full border border-black" title="Color" onClick={()=>colorInputRef.current?.click()} style={{background: brushColor}} />
          <input ref={colorInputRef} className="sw" type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); if (selectedKind) setSelectedColor(e.target.value) }} style={{display:"none"}}/>
        </div>
      ) : tool === "text" && selectedKind === "text" ? (
        <div className="grid grid-cols-12 gap-2 items-center">
          <label className="col-span-2 text-[12px]">Text</label>
          <input className="col-span-7 h-9 border border-black px-2" value={selectedProps?.text ?? ""} onChange={(e)=>props.setSelectedText(e.target.value)} />
          <label className="col-span-1 text-[12px] text-right">Size</label>
          <div className="col-span-2">
            <RangeCSS />
            <input type="range" min={8} max={300} step={1} className="sq w-full"
              value={selectedProps?.fontSize ?? 112}
              onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
              onInput={(e)=>setSelectedFontSize(parseInt((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>
      ) : tool === "shape" ? (
        <div className="flex items-center gap-2">
          <span className="text-[12px]">Shape:</span>
          <IconButton title="Square" onClick={()=>onAddShape("square")}><Square size={16}/></IconButton>
          <IconButton title="Circle" onClick={()=>onAddShape("circle")}><Circle size={16}/></IconButton>
          <IconButton title="Triangle" onClick={()=>onAddShape("triangle")}><Triangle size={16}/></IconButton>
          <IconButton title="Cross" onClick={()=>onAddShape("cross")}><Plus size={16}/></IconButton>
          <div className="flex-1" />
          <button className="h-8 w-8 border border-black" title="Fill color" onClick={()=>colorInputRef.current?.click()} style={{background: brushColor}} />
        </div>
      ) : null}
    </div>
  )

  const BottomRow = (
    <div className="mt-2 w-full flex items-center justify-between">
      <button type="button" className="h-9 px-3 border border-black flex items-center gap-2" onClick={onDownloadFront}>
        <span>FRONT</span><Download size={16}/>
      </button>
      <div className="flex-1" />
      <button type="button" className="h-9 px-3 border border-black flex items-center gap-2" onClick={onDownloadBack}>
        <span>BACK</span><Download size={16}/>
      </button>
    </div>
  )

  // Один и тот же тулбар для мобилки/десктопа, но он компактный и не перекрывает мокап: паддинг учтён сверху
  return (
    <div ref={rootRef} className="fixed inset-x-0 bottom-0 bg-white border-t border-black p-2" style={{ touchAction: "manipulation" }}>
      <UseMeasureHeight onChange={onHeightChange} targetRef={rootRef} />
      {ToolsRow}
      {ContextRow}
      {BottomRow}
    </div>
  )
}
