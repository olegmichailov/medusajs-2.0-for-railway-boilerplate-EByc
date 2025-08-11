"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import type { ShapeKind, Side, Tool } from "./store"

const glass = "backdrop-blur-md bg-white/80 border border-black/10 shadow-xl"
const btn   = "w-9 h-9 border flex items-center justify-center text-[11px]"

const FONTS = ["Inter", "Courier", "Georgia", "Arial", "Times New Roman", "Helvetica", "Futura"]

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

  selectedId,
  selectedIsText,
  setTextContent, setTextFont, setTextSize,
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

  selectedId: string | null
  selectedIsText: boolean
  setTextContent: (v: string)=>void
  setTextFont: (f: string)=>void
  setTextSize: (n: number)=>void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className={clx(glass, "fixed left-6 top-40 z-40 w-[280px]")}>
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-[11px] uppercase tracking-wide">Tools</div>
        <button className="border px-2 py-1 text-xs" onClick={toggleLayers}>{layersOpen ? "Hide Layers" : "Show Layers"}</button>
      </div>

      <div className="p-3 space-y-3">
        {/* top row */}
        <div className="grid grid-cols-7 gap-2">
          <button className={clx(btn, tool==="move"  && "bg-black text-white")} onClick={()=>setTool("move")} title="Move">⬚</button>
          <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush">🖌</button>
          <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser">⌫</button>
          <button className={clx(btn)} onClick={()=>onAddText()} title="Text">T</button>
          <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes">▢</button>
          <button className={clx(btn)} onClick={()=>fileRef.current?.click()} title="Image">🖼</button>
          <button className={clx(btn, tool==="crop" && "bg-black text-white")} onClick={()=> isCropping ? cancelCrop() : startCrop()} title="Crop">✂</button>
        </div>

        {/* shape palette */}
        {tool==="shape" && (
          <div className="grid grid-cols-7 gap-2">
            {([
              ["circle","◯"],
              ["square","▢"],
              ["triangle","△"],
              ["line","／"],
              ["cross","✚"],
              ["star","★"],
              ["heart","♥"],
            ] as [ShapeKind,string][]).map(([k, label]) => (
              <button key={k} className={btn} onClick={()=>onAddShape(k)} title={k}>{label}</button>
            ))}
          </div>
        )}

        {/* brush */}
        {(tool==="brush" || tool==="erase") && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
            <input
              type="range" min={1} max={160} value={brushSize}
              onChange={(e)=>setBrushSize(parseInt(e.target.value))}
              className="w-full h-[2px] bg-black appearance-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                [&::-webkit-slider-thumb]:bg-black"
            />
            <div className="text-[11px] uppercase">Color</div>
            <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 border"/>
          </div>
        )}

        {/* selected text controls */}
        {selectedIsText && (
          <div className="space-y-2 border-t pt-2">
            <div className="text-[11px] uppercase">Selected: Text</div>
            <input className="w-full border px-2 py-1 text-sm" placeholder="Edit…" onChange={(e)=>setTextContent(e.target.value)}/>
            <div className="flex items-center gap-2">
              <div className="text-xs">Size</div>
              <input type="range" min={8} max={300} defaultValue={64} onChange={(e)=>setTextSize(parseInt(e.target.value))}
                className="flex-1 h-[2px] bg-black appearance-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                  [&::-webkit-slider-thumb]:bg-black"/>
            </div>
            <select className="border px-2 py-1 text-sm w-full" defaultValue="Inter" onChange={(e)=>setTextFont(e.target.value)}>
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}

        {/* front/back + downloads (двойные кнопки) */}
        <div className="space-y-2">
          <div className="flex">
            <button className={clx("flex-1 border px-3 py-2 text-left", side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className="border px-3 py-2" onClick={onDownloadFront} title="Download Front">⬇</button>
          </div>
          <div className="flex">
            <button className={clx("flex-1 border px-3 py-2 text-left", side==="back" && "bg-black text-white")} onClick={()=>setSide("back")}>Back</button>
            <button className="border px-3 py-2" onClick={onDownloadBack} title="Download Back">⬇</button>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value="" }}/>
    </div>
  )
}
