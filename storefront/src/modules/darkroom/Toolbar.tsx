// ==============================
// File: src/modules/darkroom/Toolbar.tsx
// ==============================
"use client"

import React, { useRef, useState } from "react"
import type { ShapeKind, Side, Tool } from "./store"

// minimal black/white squared UI — no blue, no rounded corners
const btn = "px-2 py-2 border border-black text-[11px] uppercase tracking-wide hover:bg-black hover:text-white transition-colors"
const ico = "w-4 h-4"

// basic svg icons (inline, black only)
const I = {
  Move: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/><path d="M8 6l4-4 4 4M6 8l-4 4 4 4M8 18l4 4 4-4M18 8l4 4-4 4"/></svg>),
  Brush: () => (<svg className={ico} viewBox="0 0 24 24" fill="currentColor"><path d="M20.71 5.63a3 3 0 0 0-4.24 0L7 15.1V19h3.9l9.82-9.82a3 3 0 0 0 0-4.24Z"/></svg>),
  Erase: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7-7-7 7 7 7 7-7Z"/><path d="M22 22H12"/></svg>),
  Text: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M10 20h4"/></svg>),
  Shapes: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><circle cx="17" cy="7" r="4"/><path d="M3 21l7-12 7 12H3Z"/></svg>),
  Image: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14"/><circle cx="8" cy="9" r="2"/><path d="M21 19l-7-7-4 4-2-2-5 5"/></svg>),
  Crop: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2v4H2M18 22v-4h4M6 6h12v12H6z"/></svg>),
  DL: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>),
  Circle: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="7"/></svg>),
  Square: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12"/></svg>),
  Triangle: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5l9 14H3z"/></svg>),
  Line: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20L20 4"/></svg>),
  Cross: () => (<svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M12 4v16"/></svg>),
}

export default function Toolbar({
  side, setSide,
  tool, setTool,
  brushColor, setBrushColor,
  brushSize, setBrushSize,
  shapeKind, setShapeKind,
  onUploadImage, onAddText, onAddShape,
  startCrop, applyCrop, cancelCrop, isCropping,
  onDownloadFront, onDownloadFrontDesign,
  onDownloadBack, onDownloadBackDesign,
  toggleLayers, layersOpen,
  setSelectedFill, setSelectedStroke, setSelectedStrokeW, setSelectedText, setSelectedFontSize,
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
  onDownloadFrontDesign: () => void
  onDownloadBack: () => void
  onDownloadBackDesign: () => void
  toggleLayers: () => void
  layersOpen: boolean
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (w: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(true)

  return (
    <div className="fixed left-6 top-28 z-40 select-none">
      <div className="bg-white/90 backdrop-blur border border-black shadow-xl p-3 w-[260px]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wide">Tools</div>
          <button className={btn} onClick={toggleLayers}>{layersOpen ? "Hide Layers" : "Show Layers"}</button>
        </div>

        {/* row 1: tools */}
        <div className="grid grid-cols-7 gap-2 mb-3">
          <button className={btn + (tool === "move" ? " bg-black text-white" : "")} onClick={() => setTool("move")} title="Move"><I.Move /></button>
          <button className={btn + (tool === "brush" ? " bg-black text-white" : "")} onClick={() => setTool("brush")} title="Brush"><I.Brush /></button>
          <button className={btn + (tool === "erase" ? " bg-black text-white" : "")} onClick={() => setTool("erase")} title="Eraser"><I.Erase /></button>
          <button className={btn} onClick={onAddText} title="Add text"><I.Text /></button>
          <button className={btn + (tool === "shape" ? " bg-black text-white" : "")} onClick={() => setTool("shape")} title="Shapes"><I.Shapes /></button>
          <button className={btn} onClick={() => fileRef.current?.click()} title="Upload image"><I.Image /></button>
          <button className={btn + (isCropping ? " bg-black text-white" : "")} onClick={() => (isCropping ? cancelCrop() : startCrop())} title="Crop"><I.Crop /></button>
        </div>

        {/* brush settings */}
        {(tool === "brush" || tool === "erase") && (
          <div className="mb-3">
            <div className="text-[11px] uppercase mb-1">Brush size: {brushSize}px</div>
            <input type="range" min={1} max={80} value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full"/>
            <div className="text-[11px] uppercase mt-2 mb-1">Color</div>
            <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="border border-black w-10 h-8"/>
          </div>
        )}

        {/* shapes picker — add on click (no auto on stage) */}
        {tool === "shape" && (
          <div className="grid grid-cols-5 gap-2 mb-3">
            <button className={btn} onClick={() => onAddShape("circle")} title="Circle"><I.Circle /></button>
            <button className={btn} onClick={() => onAddShape("square")} title="Square"><I.Square /></button>
            <button className={btn} onClick={() => onAddShape("triangle")} title="Triangle"><I.Triangle /></button>
            <button className={btn} onClick={() => onAddShape("line")} title="Line"><I.Line /></button>
            <button className={btn} onClick={() => onAddShape("cross")} title="Cross"><I.Cross /></button>
          </div>
        )}

        {/* selected object quick props */}
        <div className="space-y-2 mb-3">
          <div className="text-[11px] uppercase">Selected</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Fill</span>
            <input type="color" onChange={(e) => setSelectedFill(e.target.value)} className="border border-black w-10 h-8"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Stroke</span>
            <input type="color" onChange={(e) => setSelectedStroke(e.target.value)} className="border border-black w-10 h-8"/>
            <input type="number" min={0} max={40} defaultValue={0} onChange={(e) => setSelectedStrokeW(parseInt(e.target.value))} className="border border-black w-16 px-1 text-sm"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Text</span>
            <input type="text" placeholder="Edit…" onBlur={(e) => setSelectedText(e.target.value)} className="border border-black flex-1 px-1 text-sm"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">Font</span>
            <input type="range" min={8} max={200} defaultValue={64} onChange={(e) => setSelectedFontSize(parseInt(e.target.value))} className="flex-1"/>
          </div>
        </div>

        {/* sides + export (two files each) */}
        <div className="grid grid-cols-4 gap-2 mb-2">
          <button className={btn + (side === "front" ? " bg-black text-white" : "")} onClick={() => setSide("front")}>Front</button>
          <button className={btn + (side === "back" ? " bg-black text-white" : "")} onClick={() => setSide("back")}>Back</button>
          <button className={btn} onClick={onDownloadFront} title="Download Front with mockup"><I.DL /></button>
          <button className={btn} onClick={onDownloadFrontDesign} title="Download Front design only (alpha)"><I.DL /></button>
          <button className={btn} onClick={onDownloadBack} title="Download Back with mockup"><I.DL /></button>
          <button className={btn} onClick={onDownloadBackDesign} title="Download Back design only (alpha)"><I.DL /></button>
        </div>

        {/* hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); (e.target as HTMLInputElement).value = "" }} />
      </div>
    </div>
  )
}
