"use client"

import { isMobile } from "react-device-detect"
import { clx } from "@medusajs/ui"
import {
  Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Move,
  Crop, Download, PanelRightOpen, PanelRightClose,
  Circle as IconCircle, Square as IconSquare, Triangle as IconTriangle, Slash, Plus
} from "lucide-react"
import React, { useRef, useState, type CSSProperties } from "react"
import type { ShapeKind, Side, Tool } from "./store"

const glass = "backdrop-blur-md bg-white/70 border border-black/10 shadow-xl rounded-none"
const btn = "px-2 py-2 border text-[11px] uppercase tracking-wide rounded-none hover:bg-black hover:text-white transition"
const ico = "w-5 h-5"

export default function Toolbar({
  side, setSide,
  tool, setTool,
  brushColor, setBrushColor,   // оставляем для кисти
  brushSize, setBrushSize,
  shapeKind, setShapeKind,
  onUploadImage, onAddText, onAddShape,
  startCrop, applyCrop, cancelCrop, isCropping,
  onDownloadFront, onDownloadBack,
  toggleLayers, layersOpen,

  // контекст выделенного
  selectedKind,
  selectedProps,
  setSelectedFill,
  setSelectedStroke,
  setSelectedStrokeW,
  setSelectedText,
  setSelectedFontSize,
  setSelectedColor,
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

  selectedKind: "image"|"shape"|"text"|"stroke"|null
  selectedProps: any
  setSelectedFill: (hex:string)=>void
  setSelectedStroke: (hex:string)=>void
  setSelectedStrokeW: (w:number)=>void
  setSelectedText: (t:string)=>void
  setSelectedFontSize: (n:number)=>void
  setSelectedColor: (hex:string)=>void
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
          <button className={btn} onClick={toggleLayers} aria-label="Toggle layers">
            {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
          </button>
        )}
        <button className={btn} onClick={()=>setOpen((s)=>!s)}>{open? "Close":"Open"}</button>
      </div>

      {open && (
        <div className="space-y-3">
          {/* верхняя строка инструментов */}
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  aria-label="Move"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} aria-label="Brush"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} aria-label="Erase"><Eraser className={ico}/></button>
            <button className={clx(btn, tool==="text" && "bg-black text-white")}  onClick={onAddText} aria-label="Add text"><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} aria-label="Shapes"><Shapes className={ico}/></button>
            <button className={clx(btn, tool==="image" && "bg-black text-white")} onClick={()=>fileRef.current?.click()} aria-label="Image"><ImageIcon className={ico}/></button>
            <button className={clx(btn, tool==="crop" && "bg-black text-white")}  onClick={()=> (isCropping ? cancelCrop() : startCrop())} aria-label="Crop"><Crop className={ico}/></button>
          </div>

          {/* кисть/ластик */}
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
              <div className="text-[11px] uppercase mt-2 mb-1">Color</div>
              <input
                type="color"
                value={brushColor}
                onChange={(e)=>{ setBrushColor(e.target.value); setSelectedColor(e.target.value) }}
                className="w-8 h-8 p-0 border rounded-none"
              />
            </div>
          )}

          {/* выбор фигуры (не меняем инструмент, только добавляем) */}
          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={clx(btn)} onClick={()=>onAddShape("circle")}   aria-label="Add circle"><IconCircle className={ico}/></button>
              <button className={clx(btn)} onClick={()=>onAddShape("square")}   aria-label="Add square"><IconSquare className={ico}/></button>
              <button className={clx(btn)} onClick={()=>onAddShape("triangle")} aria-label="Add triangle"><IconTriangle className={ico}/></button>
              <button className={clx(btn)} onClick={()=>onAddShape("cross")}    aria-label="Add cross"><Plus className={ico}/></button>
              <button className={clx(btn)} onClick={()=>onAddShape("line")}     aria-label="Add line"><Slash className={ico}/></button>
            </div>
          )}

          {/* КОНТЕКСТ ВЫДЕЛЕННОГО — параметры слоя */}
          {selectedKind && (
            <div className="space-y-2 border-t pt-2">
              <div className="text-[11px] uppercase tracking-wide">Selected</div>

              {selectedKind === "text" && (
                <div className="space-y-2">
                  <input
                    type="text"
                    defaultValue={selectedProps?.text ?? ""}
                    onBlur={(e)=> setSelectedText(e.target.value)}
                    className="w-full border px-2 py-1 text-sm rounded-none"
                    placeholder="Edit text…"
                  />
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Size</div>
                    <input
                      type="range" min={8} max={200}
                      defaultValue={selectedProps?.fontSize ?? 64}
                      onChange={(e)=> setSelectedFontSize(parseInt(e.target.value))}
                      className="flex-1 h-[2px] bg-black appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                        [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Color</div>
                    <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=> setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                  </div>
                </div>
              )}

              {selectedKind === "shape" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Fill</div>
                    <input type="color" defaultValue={selectedProps?.fill ?? "#000000"} onChange={(e)=> setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Stroke</div>
                    <input type="color" defaultValue={selectedProps?.stroke ?? "#000000"} onChange={(e)=> setSelectedStroke(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                    <input type="number" min={0} max={40} defaultValue={selectedProps?.strokeWidth ?? 0} onChange={(e)=> setSelectedStrokeW(parseInt(e.target.value))} className="w-16 border px-2 py-1 text-sm rounded-none"/>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* стороны + экспорт */}
          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} aria-label="Download Front"><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}  aria-label="Download Back"><Download className={ico}/></button>
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
      {isMobile && !open && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-40">
          <button className="px-6 py-3 bg-black text-white border rounded-none" onClick={()=>setOpen(true)}>Create</button>
        </div>
      )}
      {isMobile ? Panel : <div className="hidden md:block">{Panel}</div>}
    </>
  )
}
