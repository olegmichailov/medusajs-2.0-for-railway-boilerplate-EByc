"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Crop,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Star, Heart, X
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile as isMobileUA } from "react-device-detect"

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const btn  = "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-5 h-5"

export default function Toolbar(props: any) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    shapeKind, setShapeKind,
    onUploadImage, onAddText, onAddShape,
    startCrop, applyCrop, cancelCrop, isCropping,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    isMobileUI = false, // <-- новое
    mobileSheets,       // { toolsOpen, setToolsOpen, layersOpen, setLayersOpen }
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
  } = props

  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState({ x: 24, y: 120 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const onDragStart = (e: React.MouseEvent) => {
    if (isMobileUA || isMobileUI) return
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

  // ——— MOBILE UI
  if (isMobileUI) {
    const { toolsOpen, setToolsOpen, setLayersOpen } = mobileSheets
    return (
      <>
        {/* bottom bar */}
        <div className="fixed z-40 left-0 right-0 bottom-3 px-3 flex items-center justify-between pointer-events-none">
          <button
            className="pointer-events-auto px-4 h-11 border border-black/80 bg-white rounded-none shadow-md"
            onClick={()=>setToolsOpen(true)}
            title="Create"
          >Create</button>
          <div className="flex gap-2 pointer-events-auto">
            <button className="px-4 h-11 border border-black/80 bg-white rounded-none shadow-md" onClick={()=>setLayersOpen(true)}>Layers</button>
            <button className="px-4 h-11 border border-black/80 bg-white rounded-none shadow-md" onClick={onDownloadFront} title="DL front"><Download className="w-4 h-4"/></button>
            <button className="px-4 h-11 border border-black/80 bg-white rounded-none shadow-md" onClick={onDownloadBack}  title="DL back"><Download className="w-4 h-4"/></button>
          </div>
        </div>

        {/* tools sheet */}
        <div className={clx(
          "fixed left-0 right-0 bottom-0 z-40 bg-white/98 border-t border-black/10 shadow-2xl transition-transform duration-200",
          toolsOpen ? "translate-y-0" : "translate-y-full"
        )}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="text-[12px] uppercase tracking-wide">Tools</div>
            <button onClick={()=>setToolsOpen(false)} className="w-9 h-9 grid place-items-center border border-black/60 rounded-none"><X className="w-4 h-4"/></button>
          </div>

          <div className="p-3 space-y-4">
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

            {(tool==="brush" || tool==="erase") && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
                <input
                  type="range" min={1} max={120} value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                  className="w-full appearance-none h-[3px] bg-black
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                  [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                />
                <div className="text-[11px] uppercase">Color</div>
                <input type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); setSelectedColor(e.target.value) }} className="w-10 h-10 border border-black rounded-none"/>
              </div>
            )}

            {tool==="shape" && (
              <div className="grid grid-cols-7 gap-2">
                <button className={btn} onClick={()=>onAddShape("circle")}   title="Circle"><Circle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("square")}   title="Square"><Square className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("cross")}    title="Cross"><Plus className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("line")}     title="Line"><Slash className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("star")}     title="Star"><Star className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("heart")}    title="Heart"><Heart className={ico}/></button>
              </div>
            )}

            {selectedKind === "text" && (
              <div className="space-y-2 border-t pt-2">
                <input type="text" defaultValue={selectedProps?.text ?? ""} onChange={(e)=> setSelectedText(e.target.value)} className="w-full border px-2 py-1 text-sm rounded-none" placeholder="Edit text…"/>
                <div className="flex items-center gap-2">
                  <div className="text-[11px]">Size</div>
                  <input type="range" min={8} max={240} defaultValue={selectedProps?.fontSize ?? 64} onChange={(e)=> setSelectedFontSize(parseInt(e.target.value,10))}
                    className="flex-1 h-[3px] bg-black appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"/>
                  <select defaultValue={selectedProps?.fontFamily ?? "Inter, system-ui, -apple-system, sans-serif"} onChange={(e)=> setSelectedFontFamily(e.target.value)} className="border rounded-none text-sm" title="Font">
                    <option value="Inter, system-ui, -apple-system, sans-serif">Inter</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                    <option value="'Times New Roman', Times, serif">Times</option>
                    <option value="'Courier New', Courier, monospace">Courier</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Impact, Charcoal, sans-serif">Impact</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[11px]">Color</div>
                  <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=> setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                </div>
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        </div>
      </>
    )
  }

  // ——— DESKTOP (как было)
  return (
    <div className={wrap + " fixed z-40 w-[380px] p-3"} style={{ left: pos.x, top: pos.y }}>
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

          {(tool==="brush" || tool==="erase") && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
              <input type="range" min={1} max={120} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                className="w-full appearance-none h-[3px] bg-black
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"/>
              <div className="text-[11px] uppercase">Color</div>
              <input type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); setSelectedColor(e.target.value) }} className="w-10 h-10 border border-black rounded-none"/>
            </div>
          )}

          {tool==="shape" && (
            <div className="grid grid-cols-7 gap-2">
              <button className={btn} onClick={()=>onAddShape("circle")}><Circle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("square")}><Square className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("triangle")}><Triangle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("cross")}><Plus className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("line")}><Slash className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("star")}><Star className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("heart")}><Heart className={ico}/></button>
            </div>
          )}

          {selectedKind === "text" && (
            <div className="space-y-2 border-t pt-2">
              <input type="text" defaultValue={selectedProps?.text ?? ""} onChange={(e)=> setSelectedText(e.target.value)} className="w-full border px-2 py-1 text-sm rounded-none" placeholder="Edit text…"/>
              <div className="flex items-center gap-2">
                <div className="text-[11px]">Size</div>
                <input type="range" min={8} max={240} defaultValue={selectedProps?.fontSize ?? 64} onChange={(e)=> setSelectedFontSize(parseInt(e.target.value,10))}
                  className="flex-1 h-[3px] bg-black appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"/>
                <select defaultValue={selectedProps?.fontFamily ?? "Inter, system-ui, -apple-system, sans-serif"} onChange={(e)=> setSelectedFontFamily(e.target.value)} className="border rounded-none text-sm" title="Font">
                  <option value="Inter, system-ui, -apple-system, sans-serif">Inter</option>
                  <option value="Arial, Helvetica, sans-serif">Arial</option>
                  <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                  <option value="'Times New Roman', Times, serif">Times</option>
                  <option value="'Courier New', Courier, monospace">Courier</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="Impact, Charcoal, sans-serif">Impact</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[11px]">Color</div>
                <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=> setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
              </div>
            </div>
          )}

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
