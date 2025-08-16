"use client"

import React, { useEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// общий вид
const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const ico  = "w-5 h-5"
const btn  =
  "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0"

type MobileLayersItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

type MobileLayersProps = {
  items: MobileLayersItem[]
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

type ToolbarProps = {
  side: Side
  setSide: (s: Side) => void

  tool: Tool
  setTool: (t: Tool) => void

  brushColor: string
  setBrushColor: (hex: string) => void

  brushSize: number
  setBrushSize: (n: number) => void

  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void

  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void

  onDownloadFront: () => void
  onDownloadBack: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "image" | "shape" | "text" | "strokes" | null
  selectedProps: {
    text?: string
    fontSize?: number
    fontFamily?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
  }

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  mobileLayers: MobileLayersProps
}

export default function Toolbar(props: ToolbarProps) {
  const {
    side, setSide,
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    mobileLayers,
  } = props

  // =================== DESKTOP ===================
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

    // upload
    const fileRef = useRef<HTMLInputElement>(null)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    // Текст: локальный state + авто-рост до 3 строк
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])
    const taRef = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
      const ta = taRef.current
      if (!ta) return
      ta.style.height = "auto"
      const line = parseFloat(getComputedStyle(ta).fontSize || "16")
      ta.style.height = Math.min(ta.scrollHeight, line * 3) + "px"
    }, [textValue])

    return (
      <div
        className={clx("fixed", open ? "" : "pointer-events-none")}
        style={{ left: pos.x, top: pos.y, zIndex: 40 }}
      >
        <div className={clx("min-w-[280px] p-2", wrap)}>
          {/* header */}
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium select-none cursor-move" onMouseDown={onDragStart}>TOOLS</div>
            <div className="flex items-center gap-1">
              <button
                className={btn}
                title={layersOpen ? "Hide Layers" : "Show Layers"}
                onClick={toggleLayers}
              >
                {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
              </button>
              <button className={btn} onClick={()=>setOpen(o=>!o)}>−</button>
            </div>
          </div>

          {/* tools row */}
          <div className="flex items-center mb-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")} onClick={()=>setTool("move")} title="Move (V)"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush"&& "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush (B)"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase"&& "bg-black text-white")} onClick={()=>setTool("erase")} title="Erase (E)"><Eraser className={ico}/></button>
            <button className={btn} onClick={onAddText} title="Add text"><TypeIcon className={ico}/></button>
            <button className={btn} onClick={()=>onAddShape("square" as ShapeKind)} title="Add shape"><Shapes className={ico}/></button>
            <label className={btn} title="Add image">
              <ImageIcon className={ico}/>
              <input ref={fileRef} onChange={onFile} type="file" accept="image/*" className="hidden"/>
            </label>
          </div>

          {/* paint controls */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="flex items-center gap-2">
              <span className="text-xs">Color</span>
              <input type="color" value={brushColor} onChange={e=>setBrushColor(e.target.value)} className="w-10 h-8 border border-black/20"/>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-xs">Size</span>
              <input type="range" min={1} max={200} value={brushSize} onChange={e=>setBrushSize(parseInt(e.target.value))} className="w-full"/>
            </label>
          </div>

          {/* shape quick */}
          <div className="flex items-center gap-1 mb-2">
            <button className={btn} title="Circle" onClick={()=>onAddShape("circle" as ShapeKind)}><Circle className={ico}/></button>
            <button className={btn} title="Square" onClick={()=>onAddShape("square" as ShapeKind)}><Square className={ico}/></button>
            <button className={btn} title="Triangle" onClick={()=>onAddShape("triangle" as ShapeKind)}><Triangle className={ico}/></button>
            <button className={btn} title="Cross" onClick={()=>onAddShape("cross" as ShapeKind)}><Plus className={ico}/></button>
            <button className={btn} title="Line" onClick={()=>onAddShape("line" as ShapeKind)}><Slash className={ico}/></button>
          </div>

          {/* selection controls */}
          {selectedKind === "text" && (
            <div className="border-t border-black/10 pt-2 mt-2">
              <div className="text-[11px] mb-1 opacity-60">Text</div>
              <textarea
                ref={taRef}
                className="w-full border border-black/30 p-1 outline-none"
                style={{ fontFamily: selectedProps.fontFamily || "inherit" }}
                value={textValue}
                onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
              />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <label className="col-span-2 flex items-center gap-2">
                  <span className="text-xs">Font size</span>
                  <input type="range" min={8} max={800}
                         value={selectedProps.fontSize ?? 96}
                         onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))} className="w-full"/>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs">Color</span>
                  <input type="color" value={selectedProps.fill ?? "#000000"} onChange={e=>setSelectedColor(e.target.value)} className="w-10 h-8 border border-black/20"/>
                </label>
              </div>
            </div>
          )}

          {(selectedKind === "shape" || selectedKind === "image") && (
            <div className="border-t border-black/10 pt-2 mt-2">
              <div className="text-[11px] mb-1 opacity-60">Appearance</div>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-xs">Fill</span>
                  <input type="color" value={selectedProps.fill ?? "#000000"} onChange={e=>setSelectedFill(e.target.value)} className="w-10 h-8 border border-black/20"/>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs">Stroke</span>
                  <input type="color" value={selectedProps.stroke ?? "#000000"} onChange={e=>setSelectedStroke(e.target.value)} className="w-10 h-8 border border-black/20"/>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs">Width</span>
                  <input type="range" min={0} max={100} value={selectedProps.strokeWidth ?? 0} onChange={e=>setSelectedStrokeW(parseInt(e.target.value))}/>
                </label>
              </div>
            </div>
          )}

          {/* sides + download */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className={clx("h-10 border border-black text-white bg-black", side==="front" && "opacity-100")} onClick={()=>setSide("front")}>FRONT</button>
            <button className={clx("h-10 border border-black", side==="back" && "bg-black text-white")} onClick={()=>setSide("back")}>BACK</button>
            <button className="h-10 border border-black flex items-center justify-center gap-2" onClick={onDownloadFront}><Download className={ico}/> Download</button>
            <button className="h-10 border border-black flex items-center justify-center gap-2" onClick={onDownloadBack}><Download className={ico}/> Download</button>
          </div>
        </div>
      </div>
    )
  }

  // =================== MOBILE ===================
  // простой компактный бар + лист слоёв по кнопке
  const [showLayersSheet, setShowLayersSheet] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <>
      {/* bottom bar */}
      <div className="fixed left-0 right-0 bottom-0 p-2 bg-white border-t border-black/10 flex items-center justify-between z-40">
        <div className="flex items-center gap-1">
          <button className={clx(btn, tool==="move"&&"bg-black text-white")} onClick={()=>setTool("move")}><Move className={ico}/></button>
          <button className={clx(btn, tool==="brush"&&"bg-black text-white")} onClick={()=>setTool("brush")}><Brush className={ico}/></button>
          <button className={clx(btn, tool==="erase"&&"bg-black text-white")} onClick={()=>setTool("erase")}><Eraser className={ico}/></button>
          <button className={btn} onClick={onAddText}><TypeIcon className={ico}/></button>
          <label className={btn}>
            <ImageIcon className={ico}/>
            <input ref={fileRef} onChange={onFile} type="file" accept="image/*" className="hidden"/>
          </label>
          <button className={btn} onClick={()=>onAddShape("square" as ShapeKind)}><Shapes className={ico}/></button>
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={brushColor} onChange={e=>setBrushColor(e.target.value)} className="w-10 h-8 border border-black/20"/>
          <input type="range" min={1} max={200} value={brushSize} onChange={e=>setBrushSize(parseInt(e.target.value))}/>
          <button className={btn} onClick={()=>setShowLayersSheet(s=>!s)}>{showLayersSheet ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}</button>
        </div>
      </div>

      {/* layers sheet */}
      {showLayersSheet && (
        <div className="fixed left-0 right-0 bottom-16 p-2 z-40">
          <div className={clx("max-h-[40vh] overflow-auto p-2", wrap)}>
            <div className="text-xs mb-2">Layers</div>
            <div className="space-y-1">
              {mobileLayers.items.map((it)=>(
                <div key={it.id} className="flex items-center justify-between border border-black/10 px-2 py-1">
                  <button className="text-left flex-1" onClick={()=>mobileLayers.onSelect(it.id)}>{it.name}</button>
                  <div className="flex items-center gap-1">
                    <button className={btn} onClick={()=>mobileLayers.onMoveUp(it.id)}><ArrowUp className={ico}/></button>
                    <button className={btn} onClick={()=>mobileLayers.onMoveDown(it.id)}><ArrowDown className={ico}/></button>
                    <button className={btn} onClick={()=>mobileLayers.onDuplicate(it.id)}><Copy className={ico}/></button>
                    <button className={btn} onClick={()=>mobileLayers.onToggleLock(it.id)}>{it.locked ? <Lock className={ico}/> : <Unlock className={ico}/>}</button>
                    <button className={btn} onClick={()=>mobileLayers.onToggleVisible(it.id)}>{it.visible ? <Eye className={ico}/> : <EyeOff className={ico}/>}</button>
                    <button className={btn} onClick={()=>mobileLayers.onDelete(it.id)}><Trash2 className={ico}/></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className={clx("h-10 border border-black text-white bg-black", side==="front" && "opacity-100")} onClick={()=>setSide("front")}>FRONT</button>
              <button className={clx("h-10 border border-black", side==="back" && "bg-black text-white")} onClick={()=>setSide("back")}>BACK</button>
              <button className="h-10 border border-black flex items-center justify-center gap-2" onClick={onDownloadFront}><Download className={ico}/> Download</button>
              <button className="h-10 border border-black flex items-center justify-center gap-2" onClick={onDownloadBack}><Download className={ico}/> Download</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
