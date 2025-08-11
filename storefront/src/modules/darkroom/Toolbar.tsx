"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Crop, Download,
  Circle, Square, Triangle, Slash, Plus, PanelRightOpen, PanelRightClose } from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"

const wrap = "backdrop-blur bg-white/80 border border-black/10 shadow-xl rounded-none"
const btn  = "px-3 py-3 border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
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
  selectedKind, selectedProps,
  setSelectedFill, setSelectedStroke, setSelectedStrokeW, setSelectedText, setSelectedFontSize
}: {
  side: Side, setSide: (s: Side) => void
  tool: Tool, setTool: (t: Tool) => void
  brushColor: string, setBrushColor: (v: string) => void
  brushSize: number, setBrushSize: (n: number) => void
  shapeKind: ShapeKind, setShapeKind: (k: ShapeKind) => void
  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  startCrop: () => void, applyCrop: () => void, cancelCrop: () => void, isCropping: boolean
  onDownloadFront: () => void, onDownloadBack: () => void
  toggleLayers: () => void, layersOpen: boolean
  selectedKind: "image"|"shape"|"text"|"strokes"|null
  selectedProps: any
  setSelectedFill: (hex:string)=>void
  setSelectedStroke: (hex:string)=>void
  setSelectedStrokeW: (w:number)=>void
  setSelectedText: (t:string)=>void
  setSelectedFontSize: (n:number)=>void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(true)

  return (
    <div className={clx(wrap, "fixed left-6 top-24 z-40 w-[300px] p-3")}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase">Tools</div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={toggleLayers} title="Layers">{layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}</button>
          <button className={btn} onClick={()=>setOpen(!open)}>{open ? "Close" : "Open"}</button>
        </div>
      </div>

      {open && (
        <div className="space-y-3">
          {/* tools row */}
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
            <button className={clx(btn)} onClick={onAddText} title="Text"><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
            <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><Image as ImageIcon className={ico}/></button>
            <button className={clx(btn, tool==="crop" && "bg-black text-white")} onClick={()=> (isCropping ? cancelCrop() : startCrop())} title="Crop"><Crop className={ico}/></button>
          </div>

          {/* brush */}
          {(tool==="brush" || tool==="erase") && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase">Brush {brushSize}px</div>
              <input
                type="range" min={1} max={96} value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value))}
                className="w-full h-[2px] bg-black appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white"
              />
              <div className="flex items-center gap-2">
                <div className="text-[11px] uppercase">Color</div>
                <input type="color" value={brushColor} onChange={(e)=>setBrushColor(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
              </div>
            </div>
          )}

          {/* shapes quick add */}
          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={btn} onClick={()=>onAddShape("circle")} title="Circle"><Circle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("square")} title="Square"><Square className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("cross")} title="Cross"><Plus className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("line")} title="Line"><Slash className={ico}/></button>
            </div>
          )}

          {/* selected context */}
          {selectedKind && (
            <div className="space-y-2 border-t pt-2">
              <div className="text-[11px] uppercase">Selected: {selectedKind}</div>

              {selectedKind === "text" && (
                <div className="space-y-2">
                  <input
                    type="text" defaultValue={selectedProps?.text ?? ""}
                    onBlur={(e)=>setSelectedText(e.target.value)}
                    className="w-full border px-2 py-1 rounded-none text-sm"
                    placeholder="Edit…"
                  />
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Font</div>
                    <input
                      type="range" min={8} max={300}
                      defaultValue={selectedProps?.fontSize ?? 64}
                      onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
                      className="flex-1 h-[2px] bg-black appearance-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                      [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Color</div>
                    <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=>setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                  </div>
                </div>
              )}

              {selectedKind !== "text" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Fill</div>
                    <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=>setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Stroke</div>
                    <input type="color" defaultValue={selectedProps?.stroke ?? "#000000"} onChange={(e)=>setSelectedStroke(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                    <input type="number" min={0} max={50} defaultValue={selectedProps?.strokeWidth ?? 0} onChange={(e)=>setSelectedStrokeW(parseInt(e.target.value))} className="w-16 border px-2 py-1 rounded-none text-sm"/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* sides + export */}
          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} title="Download front"><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}  title="Download back"><Download className={ico}/></button>
          </div>

          {isCropping && (
            <div className="grid grid-cols-2 gap-2">
              <button className={clx(btn, "bg-black text-white")} onClick={applyCrop}>Apply</button>
              <button className={btn} onClick={cancelCrop}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) onUploadImage(f); e.currentTarget.value="" }}/>
    </div>
  )
}

function Image(props: any){ return <ImageIcon {...props}/> }
