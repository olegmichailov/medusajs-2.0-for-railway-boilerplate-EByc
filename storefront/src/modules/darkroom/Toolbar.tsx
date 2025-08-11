"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Crop,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const btn  = "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-5 h-5"

export default function Toolbar({
  side, setSide,
  tool, setTool,
  brushColor, setBrushColor,
  brushSize, setBrushSize,
  shapeKind, setShapeKind,
  onUploadImage, onAddText, onAddShape,
  startCrop, applyCrop, cancelCrop, isCropping,
  onDownloadFront, onDownloadBack,
  toggleLayers, layersOpen,
}: {
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
  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  startCrop: () => void
  applyCrop: () => void
  cancelCrop: () => void
  isCropping: boolean
  onDownloadFront: () => void
  onDownloadBack: () => void
  toggleLayers: () => void
  layersOpen: boolean
}) {
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState({ x: 24, y: 120 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const onDragStart = (e: React.MouseEvent) => {
    if (isMobile) return
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
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <div className={wrap + " fixed z-40 w-[360px] p-3"} style={{ left: pos.x, top: pos.y }}>
      <div className="flex items-center justify-between mb-3" onMouseDown={onDragStart}>
        <div className="text-[11px] uppercase">Tools</div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={toggleLayers} title="Layers">
            {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
          </button>
          <button className={btn} onClick={() => setOpen(!open)} title="Close / Open">{open ? "×" : "≡"}</button>
        </div>
      </div>

      {open && (
        <div className="space-y-3">
          {/* 7 квадратных кнопок-инструментов */}
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
            <button className={btn} onClick={onAddText} title="Text"><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
            <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
            <button className={clx(btn, tool==="crop" && "bg-black text-white")}
              onClick={()=> (isCropping ? cancelCrop() : startCrop())}
              title="Crop"><Crop className={ico}/></button>
          </div>

          {/* параметры кисти */}
          {(tool==="brush" || tool==="erase") && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
              <input
                type="range"
                min={1} max={120}
                value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                className="w-full appearance-none h-[3px] bg-black"
                style={{
                  WebkitAppearance: "none",
                }}
              />
              <div className="text-[11px] uppercase">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>setBrushColor(e.target.value)}
                className="w-10 h-10 border border-black rounded-none"
              />
            </div>
          )}

          {/* выбор фигур */}
          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={btn} onClick={()=>{ setShapeKind("circle");   onAddShape("circle") }} title="Circle"><Circle className={ico}/></button>
              <button className={btn} onClick={()=>{ setShapeKind("square");   onAddShape("square") }} title="Square"><Square className={ico}/></button>
              <button className={btn} onClick={()=>{ setShapeKind("triangle"); onAddShape("triangle") }} title="Triangle"><Triangle className={ico}/></button>
              <button className={btn} onClick={()=>{ setShapeKind("cross");    onAddShape("cross") }} title="Cross"><Plus className={ico}/></button>
              <button className={btn} onClick={()=>{ setShapeKind("line");     onAddShape("line") }} title="Line"><Slash className={ico}/></button>
            </div>
          )}

          {/* стороны + экспорт */}
          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} title="Download front"><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}  title="Download back"><Download className={ico}/></button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
    </div>
  )
}
