"use client"

import { clx } from "@medusajs/ui"
import {
  Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Move,
  Crop, Download, PanelsRightOpen, PanelsRightClose, Circle, Square, Triangle, Slash, Plus
} from "lucide-react"
import React, { useRef, useState, type CSSProperties } from "react"
import type { Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

const glass = "backdrop-blur-md bg-white/70 border border-black/10 shadow-xl rounded-none"
const btn = "px-2 py-2 border text-[11px] uppercase tracking-wide rounded-none hover:bg-black hover:text-white transition"
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
  selectedType,
  setObjectColor,
  setStrokeWidth,
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
  selectedType: "image"|"shape"|"text"|"stroke"|null
  setObjectColor: (hex: string)=>void
  setStrokeWidth: (w: number)=>void
}) {
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState<{x:number;y:number}>({ x: 20, y: 120 })
  const drag = useRef<{dx:number;dy:number}|null>(null)

  const dragStart = (e: React.MouseEvent) => {
    if (isMobile) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    window.addEventListener("mousemove", dragMove)
    window.addEventListener("mouseup", dragEnd)
  }
  const dragMove = (e: MouseEvent) => {
    if (!drag.current) return
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
  }
  const dragEnd = () => {
    drag.current = null
    window.removeEventListener("mousemove", dragMove)
    window.removeEventListener("mouseup", dragEnd)
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const Panel = (
    <div
      className={clx(glass, "fixed z-40 p-3 w-[360px] max-w-[94vw]")}
      style={isMobile ? undefined : ({ left: pos.x, top: pos.y } as CSSProperties)}
    >
      <div className="flex items-center justify-between mb-2" onMouseDown={dragStart}>
        <div className="cursor-grab active:cursor-grabbing text-[11px] uppercase tracking-wide">Tools</div>
        {!isMobile && (
          <button className={btn} onClick={toggleLayers}>
            {layersOpen ? <PanelsRightClose className={ico}/> : <PanelsRightOpen className={ico}/>}
          </button>
        )}
        <button className={btn} onClick={()=>setOpen((s)=>!s)}>{open? "Close":"Open"}</button>
      </div>

      {open && (
        <div className="space-y-3">
          {/* primary row */}
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")}><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")}><Eraser className={ico}/></button>
            <button className={clx(btn, tool==="text" && "bg-black text-white")}  onClick={onAddText}><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")}><Shapes className={ico}/></button>
            <button className={clx(btn)} onClick={()=>fileRef.current?.click()}><ImageIcon className={ico}/></button>
            <button className={clx(btn, tool==="crop" && "bg-black text-white")} onClick={()=> (isCropping ? cancelCrop() : startCrop())}><Crop className={ico}/></button>
          </div>

          {/* brush controls */}
          {(tool==="brush" || tool==="erase") && (
            <div>
              <div className="text-[11px] uppercase mb-1">Brush size: {brushSize}px</div>
              <input
                type="range" min={1} max={64} value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                className="w-full h-[2px] bg-black appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
              />
              <div className="text-[11px] uppercase mt-2 mb-1">Brush color</div>
              <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
            </div>
          )}

          {/* object controls (для shape/text/stroke) */}
          {selectedType && selectedType !== "image" && (
            <div>
              <div className="text-[11px] uppercase mt-1 mb-1">Object color</div>
              <input type="color" onChange={(e)=>setObjectColor(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
              {selectedType === "stroke" && (
                <div className="mt-2">
                  <div className="text-[11px] uppercase mb-1">Stroke width</div>
                  <input type="range" min={1} max={64} defaultValue={8} onChange={(e)=>setStrokeWidth(parseInt(e.target.value))}
                    className="w-full h-[2px] bg-black appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                    [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"/>
                </div>
              )}
            </div>
          )}

          {/* shape picker */}
          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={clx(btn, shapeKind==="circle" && "bg-black text-white")}   onClick={()=>{setShapeKind("circle");   onAddShape("circle")}}><Circle className={ico}/></button>
              <button className={clx(btn, shapeKind==="square" && "bg-black text-white")}   onClick={()=>{setShapeKind("square");   onAddShape("square")}}><Square className={ico}/></button>
              <button className={clx(btn, shapeKind==="triangle" && "bg-black text-white")} onClick={()=>{setShapeKind("triangle"); onAddShape("triangle")}}><Triangle className={ico}/></button>
              <button className={clx(btn, shapeKind==="cross" && "bg-black text-white")}    onClick={()=>{setShapeKind("cross");    onAddShape("cross")}}><Plus className={ico} /></button>
              <button className={clx(btn, shapeKind==="line" && "bg-black text-white")}     onClick={()=>{setShapeKind("line");     onAddShape("line")}}><Slash className={ico}/></button>
            </div>
          )}

          {/* side + export */}
          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront}><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}><Download className={ico}/></button>
          </div>

          {/* crop actions */}
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

  return (
    <>
      {/* mobile Create */}
      {isMobile && !open && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
          <button className="px-6 py-3 bg-black text-white border rounded-none" onClick={()=>setOpen(true)}>Create</button>
        </div>
      )}
      {isMobile ? Panel : <div className="hidden md:block">{Panel}</div>}
    </>
  )
}
