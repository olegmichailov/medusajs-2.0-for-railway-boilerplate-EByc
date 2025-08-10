"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { isMobile } from "react-device-detect"
import type { ShapeKind, Side, Tool } from "./store"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Crop, Download, PanelRightOpen, PanelRightClose,
  Circle as IconCircle, Square as IconSquare, Triangle as IconTriangle, Slash, Plus
} from "lucide-react"

const panel = "backdrop-blur bg-white/90 border border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-[6px]"
const btn    = "w-10 h-10 grid place-items-center border border-black/20 text-black hover:bg-black hover:text-white transition rounded-[6px]"
const btnOn  = "bg-black text-white"

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
  side: Side; setSide: (s: Side)=>void
  tool: Tool; setTool: (t: Tool)=>void
  brushColor: string; setBrushColor: (v: string)=>void
  brushSize: number; setBrushSize: (n: number)=>void
  shapeKind: ShapeKind; setShapeKind: (k: ShapeKind)=>void
  onUploadImage: (f: File)=>void
  onAddText: ()=>void
  onAddShape: (k: ShapeKind)=>void
  startCrop: ()=>void; applyCrop: ()=>void; cancelCrop: ()=>void; isCropping: boolean
  onDownloadFront: ()=>void; onDownloadBack: ()=>void
  toggleLayers: ()=>void; layersOpen: boolean
}) {
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState({ x: 20, y: 120 })
  const dragging = useRef<{dx:number;dy:number}|null>(null)

  const startDrag = (e: React.MouseEvent) => {
    if (isMobile) return
    dragging.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", stopDrag)
  }
  const onMove = (e: MouseEvent) => {
    if (!dragging.current) return
    setPos({ x: e.clientX - dragging.current.dx, y: e.clientY - dragging.current.dy })
  }
  const stopDrag = () => {
    dragging.current = null
    window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", stopDrag)
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <div
      className={clx(panel, "fixed z-40 p-3 w-[340px]")}
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center justify-between mb-2" onMouseDown={startDrag}>
        <div className="text-[11px] uppercase tracking-wide">Tools</div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={toggleLayers} title="Layers">
            {layersOpen ? <PanelRightClose className="w-5 h-5"/> : <PanelRightOpen className="w-5 h-5"/>}
          </button>
          <button className={btn} onClick={()=>setOpen(s=>!s)}>{open?"Close":"Open"}</button>
        </div>
      </div>

      {!open ? null : (
        <div className="space-y-3">
          {/* инструменты */}
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move"  && btnOn)} onClick={()=>setTool("move")}  title="Move"><Move className="w-5 h-5"/></button>
            <button className={clx(btn, tool==="brush" && btnOn)} onClick={()=>setTool("brush")} title="Brush"><Brush className="w-5 h-5"/></button>
            <button className={clx(btn, tool==="erase" && btnOn)} onClick={()=>setTool("erase")} title="Eraser"><Eraser className="w-5 h-5"/></button>
            <button className={clx(btn, tool==="text"  && btnOn)} onClick={onAddText}         title="Text"><TypeIcon className="w-5 h-5"/></button>
            <button className={clx(btn, tool==="shape" && btnOn)} onClick={()=>setTool("shape")} title="Shapes"><Shapes className="w-5 h-5"/></button>
            <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className="w-5 h-5"/></button>
            <button className={clx(btn, tool==="crop"  && btnOn)} onClick={()=> (isCropping ? cancelCrop() : startCrop())} title="Crop"><Crop className="w-5 h-5"/></button>
          </div>

          {/* кисть */}
          {(tool==="brush" || tool==="erase") && (
            <div>
              <div className="text-[11px] uppercase mb-1">Brush size: {brushSize}px</div>
              <input
                type="range" min={1} max={64} value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-[11px] uppercase mt-2 mb-1">Color</div>
              <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 p-0 border rounded-[6px]"/>
            </div>
          )}

          {/* выбор фигуры (добавление — кликом по пустому холсту) */}
          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={clx(btn, shapeKind==="circle"   && btnOn)} onClick={()=>setShapeKind("circle")}   title="Circle"><IconCircle className="w-5 h-5"/></button>
              <button className={clx(btn, shapeKind==="square"   && btnOn)} onClick={()=>setShapeKind("square")}   title="Rectangle"><IconSquare className="w-5 h-5"/></button>
              <button className={clx(btn, shapeKind==="triangle" && btnOn)} onClick={()=>setShapeKind("triangle")} title="Triangle"><IconTriangle className="w-5 h-5"/></button>
              <button className={clx(btn, shapeKind==="cross"    && btnOn)} onClick={()=>setShapeKind("cross")}    title="Cross"><Plus className="w-5 h-5"/></button>
              <button className={clx(btn, shapeKind==="line"     && btnOn)} onClick={()=>setShapeKind("line")}     title="Line"><Slash className="w-5 h-5"/></button>
            </div>
          )}

          {/* стороны + экспорт */}
          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && btnOn)} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back"  && btnOn)} onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} title="Download Front"><Download className="w-5 h-5"/></button>
            <button className={btn} onClick={onDownloadBack}  title="Download Back"><Download className="w-5 h-5"/></button>
          </div>

          {isCropping && (
            <div className="grid grid-cols-2 gap-2">
              <button className={clx(btn, btnOn)} onClick={applyCrop}>Apply</button>
              <button className={btn} onClick={cancelCrop}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
    </div>
  )
}
