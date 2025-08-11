"use client"

import React, { useRef, useState } from "react"
import type { ShapeKind, Side, Tool } from "./store"

const btn = "w-8 h-8 border border-black flex items-center justify-center"
const row = "flex items-center gap-2"

const FONT_CHOICES = [
  "Inter, Arial, Helvetica, sans-serif",
  "Arial, Helvetica, sans-serif",
  "Helvetica, Arial, sans-serif",
  "Courier, monospace",
  "Times New Roman, Times, serif",
  "Georgia, serif",
  "Impact, Charcoal, sans-serif",
]

export default function Toolbar({
  tool, setTool,
  brushColor, setBrushColor,
  brushSize, setBrushSize,
  shapeKind, setShapeKind,
  onUploadImage,
  onAddText,
  onTextChange,
  onStartCrop, onApplyCrop, onCancelCrop, isCropping,
  side, setSide,
  onDownloadFront, onDownloadBack,
  toggleLayers
}: {
  tool: Tool
  setTool: (t: Tool)=>void
  brushColor: string
  setBrushColor: (v:string)=>void
  brushSize: number
  setBrushSize: (n:number)=>void
  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind)=>void
  onUploadImage: (f: File)=>void
  onAddText: (text:string, fontFamily:string, fontSize:number)=>void
  onTextChange: (patch: Partial<{ text:string; fontFamily:string; fontSize:number; fill:string }>)=>void
  onStartCrop: ()=>void
  onApplyCrop: ()=>void
  onCancelCrop: ()=>void
  isCropping: boolean
  side: Side
  setSide: (s: Side)=>void
  onDownloadFront: ()=>void
  onDownloadBack: ()=>void
  toggleLayers: ()=>void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [textValue, setTextValue] = useState("Your text")
  const [fontFamily, setFontFamily] = useState(FONT_CHOICES[0])
  const [fontSize, setFontSize] = useState(48)

  return (
    <div className="fixed left-5 top-24 w-[280px] bg-white border border-black/20 shadow-xl p-10 pt-3 pb-3"
         style={{ padding: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide">Tools</div>
        <button className={btn} onClick={toggleLayers} title="Show/Hide layers">≣</button>
      </div>

      {/* tools row (квадратные иконки, ч/б) */}
      <div className={`${row} mb-2`}>
        <button className={`${btn} ${tool==="move"  ? "bg-black text-white" : ""}`}  onClick={()=>setTool("move")}  title="Move">↔</button>
        <button className={`${btn} ${tool==="brush" ? "bg-black text-white" : ""}`}  onClick={()=>setTool("brush")} title="Brush">🖊</button>
        <button className={`${btn} ${tool==="erase" ? "bg-black text-white" : ""}`}  onClick={()=>setTool("erase")} title="Eraser">⌫</button>
        <button className={`${btn} ${tool==="text"  ? "bg-black text-white" : ""}`}  onClick={()=>setTool("text")}  title="Text">T</button>
        <button className={`${btn} ${tool==="shape" ? "bg-black text-white" : ""}`} onClick={()=>setTool("shape")} title="Shapes">▥</button>
        <button className={`${btn}`} onClick={()=>fileRef.current?.click()} title="Image">🖼</button>
        <button className={`${btn} ${tool==="crop" ? "bg-black text-white" : ""}`} onClick={()=> isCropping ? onCancelCrop() : onStartCrop()} title="Crop">✂</button>
      </div>

      {/* shape palette (8 штук, чтобы поровну) */}
      {tool === "shape" && (
        <div className={`${row} mb-2 flex-wrap`}>
          {([
            ["circle","○"],["square","□"],["triangle","△"],["line","／"],
            ["star","★"],["heart","♥"]
          ] as [ShapeKind,string][]).map(([k,label])=>(
            <button key={k} className={`${btn} ${shapeKind===k ? "bg-black text-white" : ""}`} onClick={()=>setShapeKind(k)} title={k}>{label}</button>
          ))}
        </div>
      )}

      {/* brush controls (глобальный цвет и размер остаются всегда) */}
      <div className="mb-2">
        <div className="text-[11px] uppercase mb-1">Brush size: {brushSize}px</div>
        <input type="range" min={1} max={128} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value))} className="w-full"/>
      </div>
      <div className={`${row} mb-3`}>
        <div className="text-[11px] uppercase">Color</div>
        <input type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); onTextChange({ fill: e.target.value }) }} className="w-8 h-8 border border-black"/>
      </div>

      {/* text controls (поле ввода, размер, шрифты) */}
      <div className="mb-3">
        <div className="text-[11px] uppercase mb-1">Selected: text</div>
        <input
          type="text" value={textValue}
          onChange={(e)=>{ setTextValue(e.target.value); onTextChange({ text: e.target.value }) }}
          className="w-full border border-black px-2 py-1"
          placeholder="Edit…"
        />
        <div className={`${row} mt-2`}>
          <div className="text-[11px]">Size</div>
          <input type="range" min={8} max={240} value={fontSize} onChange={(e)=>{ const v=parseInt(e.target.value); setFontSize(v); onTextChange({ fontSize: v }) }} className="flex-1"/>
          <div className="w-8 text-right text-xs">{fontSize}</div>
        </div>
        <select className="w-full border border-black mt-2"
                value={fontFamily}
                onChange={(e)=>{ setFontFamily(e.target.value); onTextChange({ fontFamily: e.target.value }) }}>
          {FONT_CHOICES.map(f => <option key={f} value={f}>{f.split(",")[0]}</option>)}
        </select>
        <div className={`${row} mt-2`}>
          <button className={btn} onClick={()=> onAddText(textValue, fontFamily, fontSize)} title="Add text">＋</button>
        </div>
      </div>

      {/* side + downloads (сдвоенные кнопки) */}
      <div className="mb-2">
        <div className="flex">
          <button className={`flex-1 border border-black px-2 py-2 ${side==="front" ? "bg-black text-white" : ""}`} onClick={()=>setSide("front")}>Front</button>
          <button className="w-10 border border-black" onClick={onDownloadFront} title="Download front">⬇</button>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex">
          <button className={`flex-1 border border-black px-2 py-2 ${side==="back" ? "bg-black text-white" : ""}`} onClick={()=>setSide("back")}>Back</button>
          <button className="w-10 border border-black" onClick={onDownloadBack} title="Download back">⬇</button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value="" }}/>
    </div>
  )
}
