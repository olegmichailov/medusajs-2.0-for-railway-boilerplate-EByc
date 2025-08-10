"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Move,
  Crop, Download, PanelRightOpen, PanelRightClose,
  Circle as IconCircle, Square as IconSquare, Triangle as IconTriangle, Slash, Plus
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"

const glass = "backdrop-blur-xl bg-white/80 border border-black/10 shadow-2xl rounded-md"
const btn = "px-3 py-3 border text-xs rounded-md hover:bg-black hover:text-white transition"
const ico = "w-5 h-5"

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
  setSide: (s: Side)=>void
  tool: Tool
  setTool: (t: Tool)=>void
  brushColor: string
  setBrushColor: (v: string)=>void
  brushSize: number
  setBrushSize: (n: number)=>void
  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind)=>void
  onUploadImage: (f: File)=>void
  onAddText: ()=>void
  onAddShape: (k: ShapeKind)=>void
  startCrop: ()=>void
  applyCrop: ()=>void
  cancelCrop: ()=>void
  isCropping: boolean
  onDownloadFront: ()=>void
  onDownloadBack: ()=>void
  toggleLayers: ()=>void
  layersOpen: boolean
}) {

  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(true)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <div className={clx(glass, "fixed left-6 top-28 z-40 p-3 w-[290px]")}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide">Tools</div>
        <div className="flex items-center gap-1">
          <button className={btn} onClick={toggleLayers} title="Layers">
            {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
          </button>
          <button className={btn} onClick={()=>setOpen(s=>!s)}>{open? "Close":"Open"}</button>
        </div>
      </div>

      {!open ? null : (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move"  && "bg-black text-white")} onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
            <button className={clx(btn, tool==="text"  && "bg-black text-white")} onClick={onAddText} title="Text"><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
            <button className={btn} onClick={()=>fileRef.current?.click()} title="Upload image"><ImageIcon className={ico}/></button>
            <button className={clx(btn, tool==="crop" && "bg-black text-white")} onClick={()=> (isCropping ? cancelCrop() : startCrop())} title="Crop"><Crop className={ico}/></button>
          </div>

          {(tool==="brush" || tool==="erase") && (
            <div>
              <div className="text-[11px] uppercase mb-1">Brush size: {brushSize}px</div>
              <input
                type="range" min={1} max={64} value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-[11px] uppercase mt-2 mb-1">Color</div>
              <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 p-0 border rounded-md"/>
            </div>
          )}

          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={btn} onClick={()=>{setShapeKind("circle");   onAddShape("circle")}}   title="Circle"><IconCircle className={ico}/></button>
              <button className={btn} onClick={()=>{setShapeKind("square");   onAddShape("square")}}   title="Rectangle"><IconSquare className={ico}/></button>
              <button className={btn} onClick={()=>{setShapeKind("triangle"); onAddShape("triangle")}} title="Triangle"><IconTriangle className={ico}/></button>
              <button className={btn} onClick={()=>{setShapeKind("cross");    onAddShape("cross")}}    title="Cross"><Plus className={ico}/></button>
              <button className={btn} onClick={()=>{setShapeKind("line");     onAddShape("line")}}     title="Line"><Slash className={ico}/></button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back"  && "bg-black text-white")} onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} title="Download Front"><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}  title="Download Back"><Download className={ico}/></button>
          </div>

          {isCropping && (
            <div className="grid grid-cols-2 gap-2">
              <button className={btn+" bg-black text-white"} onClick={applyCrop}>Apply</button>
              <button className={btn} onClick={cancelCrop}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
    </div>
  )
}
