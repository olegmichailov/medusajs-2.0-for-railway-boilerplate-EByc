"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Crop,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash
} from "lucide-react"
import type { ShapeKind, Side } from "./store"

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const btn  = "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-5 h-5"

type MobileLayersProps = {
  items: Array<{
    id: string
    name: string
    type: "image" | "shape" | "text" | "strokes" | "eraser"
    visible: boolean
    locked: boolean
    blend: string
    opacity: number
  }>
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
}

export default function Toolbar({
  side, setSide,
  tool, setTool,
  brushColor, setBrushColor,
  brushSize, setBrushSize,
  textValue, setTextValue,
  shapeKind, setShapeKind,
  onUploadImage, onAddText, onAddShape,
  startCrop, applyCrop, cancelCrop, isCropping,
  onDownloadFront, onDownloadBack,
  toggleLayers, layersOpen,

  // мобилка
  isMobile,
  mobileOpen,
  openMobile,
  closeMobile,
  mobileLayers,
}: {
  side: Side
  setSide: (s: Side) => void
  tool: string
  setTool: (t: string) => void
  brushColor: string
  setBrushColor: (v: string) => void
  brushSize: number
  setBrushSize: (n: number) => void
  textValue: string
  setTextValue: (v: string) => void
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

  isMobile: boolean
  mobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
  mobileLayers: MobileLayersProps
}) {

  // ===== Desktop panel =====
  if (!isMobile) {
    const [open, setOpen] = useState(true)
    const [pos, setPos] = useState({ x: 24, y: 120 })
    const drag = useRef<{ dx: number; dy: number } | null>(null)

    const onDragStart = (e: React.MouseEvent) => {
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
                <input
                  type="range" min={1} max={120} value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                  className="w-full appearance-none h-[3px] bg-black
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                  [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                />
                <div className="text-[11px] uppercase">Color</div>
                <input
                  type="color" value={brushColor}
                  onChange={(e)=> setBrushColor(e.target.value)}
                  className="w-10 h-10 border border-black rounded-none"
                />
              </div>
            )}

            {tool==="shape" && (
              <div className="grid grid-cols-5 gap-2">
                <button className={btn} onClick={()=>onAddShape("circle")}   title="Circle"><Circle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("square")}   title="Square"><Square className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("cross")}    title="Cross"><Plus className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("line")}     title="Line"><Slash className={ico}/></button>
              </div>
            )}

            {tool==="text" && (
              <div className="space-y-2 border-t pt-2">
                <div className="text-[11px] uppercase">Text</div>
                <input
                  type="text"
                  value={textValue}
                  onChange={(e)=> setTextValue(e.target.value)}
                  className="w-full border px-2 py-1 text-sm rounded-none"
                  placeholder="Enter text…"
                />
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

  // ===== Mobile bottom sheet =====
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // lock scroll when sheet open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => { document.body.style.overflow = prev }
    }
  }, [mobileOpen])

  return (
    <>
      {/* Bottom Create */}
      <div className="fixed left-0 right-0 bottom-0 z-40 grid place-items-center pointer-events-none">
        <div className="pointer-events-auto mb-[env(safe-area-inset-bottom,12px)]">
          <button
            className="px-6 h-12 min-w-[160px] bg-black text-white text-sm tracking-wide uppercase rounded-none shadow-lg active:scale-[.98] transition"
            onClick={openMobile}
          >
            Create
          </button>
        </div>
      </div>

      {/* Sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50" onClick={closeMobile}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 right-0 bottom-0 bg-white border-t border-black/10 shadow-2xl rounded-t-[12px]"
            style={{ height: "65vh" }}
            onClick={(e)=>e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <div className="text-[11px] uppercase">Tools</div>
              <button className="px-3 h-9 border text-xs rounded-none" onClick={closeMobile}>Close</button>
            </div>

            <div className="h-[calc(65vh-44px)] overflow-auto px-3 py-2 space-y-3">
              <div className="grid grid-cols-6 gap-2">
                <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
                <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
                <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
                <button className={btn} onClick={onAddText} title="Text"><TypeIcon className={ico}/></button>
                <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
                <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
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
                  <input
                    type="color" value={brushColor}
                    onChange={(e)=> setBrushColor(e.target.value)}
                    className="w-9 h-9 border border-black rounded-none"
                  />
                </div>
              )}

              {tool==="shape" && (
                <div className="grid grid-cols-5 gap-2">
                  <button className={btn} onClick={()=>onAddShape("circle")}   title="Circle"><Circle className={ico}/></button>
                  <button className={btn} onClick={()=>onAddShape("square")}   title="Square"><Square className={ico}/></button>
                  <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
                  <button className={btn} onClick={()=>onAddShape("cross")}    title="Cross"><Plus className={ico}/></button>
                  <button className={btn} onClick={()=>onAddShape("line")}     title="Line"><Slash className={ico}/></button>
                </div>
              )}

              {tool==="text" && (
                <div className="space-y-2">
                  <div className="text-[11px] uppercase">Text</div>
                  <input
                    type="text"
                    value={textValue}
                    onChange={(e)=> setTextValue(e.target.value)}
                    className="w-full border px-2 py-1 text-sm rounded-none"
                    placeholder="Enter text…"
                  />
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
                <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
                <button className={btn} onClick={onDownloadFront} title="Download front"><Download className={ico}/></button>
                <button className={btn} onClick={onDownloadBack}  title="Download back"><Download className={ico}/></button>
              </div>

              {/* Simple layers list on mobile (без DnD, стабильные кнопки) */}
              <div className="mt-3">
                <div className="text-[11px] uppercase mb-1">Layers</div>
                <div className="space-y-2">
                  {mobileLayers.items.map((it) => (
                    <div
                      key={it.id}
                      className={clx(
                        "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none",
                      )}
                      onClick={()=>mobileLayers.onSelect(it.id)}
                    >
                      <div className="text-[11px] flex-1 truncate">{it.name}</div>
                      <button className="w-7 h-7 border text-[10px]" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onChangeOpacity(it.id, Math.min(1, it.opacity + 0.1))}}>＋</button>
                      <button className="w-7 h-7 border text-[10px]" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onChangeOpacity(it.id, Math.max(0.1, it.opacity - 0.1))}}>－</button>
                      <button className="w-7 h-7 border" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onToggleVisible(it.id) }}>{it.visible ? "👁" : "🚫"}</button>
                      <button className="w-7 h-7 border" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onToggleLock(it.id) }}>{it.locked ? "🔒" : "🔓"}</button>
                      <button className="w-7 h-7 border" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onDuplicate(it.id) }}>⧉</button>
                      <button className="w-7 h-7 border" onClick={(e)=>{ e.stopPropagation(); mobileLayers.onDelete(it.id) }}>🗑</button>
                    </div>
                  ))}
                </div>
              </div>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
