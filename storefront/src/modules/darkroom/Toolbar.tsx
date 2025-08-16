"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, MoreHorizontal
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// =================== утилиты ===================
const cx = (...s: (string | false | null | undefined)[]) => s.filter(Boolean).join(" ")
const BLENDS = [
  "source-over","multiply","screen","overlay","lighten","darken",
  "difference","hard-light","soft-light","color-dodge","color-burn","xor"
] as const

const palette = [
  "#000000","#111111","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF1744","#F50057","#D500F9","#651FFF","#3D5AFE","#2979FF","#00B0FF",
  "#00E5FF","#1DE9B6","#00E676","#76FF03","#C6FF00","#FFEA00","#FFC400",
  "#FF9100","#FF3D00","#8D6E63","#795548","#6D4C41","#5D4037","#4E342E"
]

// общий вид
const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const ico  = "w-5 h-5"
const btn  =
  "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0"

// типы для моб. слоёв
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
    const [palOpen, setPalOpen] = useState(false)
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
      const line = parseFloat(getComputedStyle(ta).fontSize || "16") * 1.25
      ta.style.height = Math.min(ta.scrollHeight, line * 3) + "px"
    }, [textValue])

    return (
      <>
        {/* TOOLS (draggable) */}
        <div
          className={cx(wrap, "fixed z-30 w-[280px] select-none")}
          style={{ left: pos.x, top: pos.y, fontFamily: "inherit" }}
        >
          <div
            className="flex items-center justify-between px-2 py-1 border-b border-black/10 cursor-move"
            onMouseDown={onDragStart}
          >
            <span className="text-[11px] tracking-[.12em] uppercase">Tools</span>
            <div className="flex items-center gap-1">
              <button
                className={cx(btn, "w-8 h-8")}
                onClick={() => setOpen(!open)}
                title={open ? "Collapse" : "Expand"}
              >
                {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
              </button>
            </div>
          </div>

          {open && (
            <div className="p-2 space-y-2">
              {/* row: tools */}
              <div className="flex">
                <button className={btn + cx(tool==="move" && "bg-black text-white")} onClick={()=>setTool("move")} title="Move">
                  <Move className={ico}/>
                </button>
                <button className={btn + cx(tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush">
                  <Brush className={ico}/>
                </button>
                <button className={btn + cx(tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Erase">
                  <Eraser className={ico}/>
                </button>
                <button className={btn} onClick={onAddText} title="Text">
                  <TypeIcon className={ico}/>
                </button>
                <label className={btn} title="Image">
                  <ImageIcon className={ico}/>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                </label>
                <div className="relative">
                  <button className={btn} title="Shapes" onClick={()=>setPalOpen(false)}>
                    <Shapes className={ico}/>
                  </button>
                </div>
              </div>

              {/* Color + Size (черные) */}
              <div className="flex items-center gap-3">
                <div className="text-[11px]">Color</div>
                <div
                  className="w-8 h-6 border border-black cursor-pointer"
                  style={{ background: brushColor }}
                  onClick={()=>setPalOpen(p=>!p)}
                  title="Palette"
                />
                <div className="text-[11px] ml-2">Size</div>
                <input
                  type="range" min={2} max={200} value={brushSize}
                  onChange={e=>props.setBrushSize?.(parseInt(e.target.value))}
                  className="flex-1 appearance-none h-[6px] bg-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
                />
              </div>

              {/* Палитра */}
              {palOpen && (
                <div className="grid grid-cols-9 gap-1">
                  {palette.map((c)=>(
                    <button
                      key={c}
                      className="w-6 h-6 border border-black"
                      style={{ background: c }}
                      onClick={()=>{ setBrushColor(c); setSelectedColor(c) }}
                      title={c}
                    />
                  ))}
                </div>
              )}

              {/* Shapes */}
              <div className="flex items-center gap-2">
                <div className="text-[11px]">Shapes</div>
                <button className={btn} onClick={()=>onAddShape("circle")} title="Circle"><Circle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("square")} title="Square"><Square className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("cross")} title="Cross"><Plus className={ico}/></button>
                <button className={btn} onClick={()=>onAddShape("line")} title="Line"><Slash className={ico}/></button>
              </div>

              {/* TEXT controls (когда выбран текст) */}
              {selectedKind === "text" && (
                <>
                  <textarea
                    ref={taRef}
                    value={textValue}
                    onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                    className="w-full border border-black px-2 py-1 text-[13px] leading-[1.25] resize-none outline-none"
                    rows={1}
                  />
                  <div className="flex items-center gap-2">
                    <div className="text-[11px]">Font size</div>
                    <input
                      type="range" min={8} max={800}
                      value={Math.max(8, Math.min(800, selectedProps.fontSize || 96))}
                      onChange={(e)=> setSelectedFontSize(parseInt(e.target.value))}
                      className="flex-1 appearance-none h-[6px] bg-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
                    />
                    <div className="text-[11px] ml-2">Color</div>
                    <div
                      className="w-8 h-6 border border-black cursor-pointer"
                      style={{ background: selectedProps.fill || "#000" }}
                      onClick={()=>setPalOpen(true)}
                    />
                  </div>
                </>
              )}

              {/* Стороны + скачивание */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cx("border border-black px-3 py-2 text-[12px]", side==="front" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setSide("front")}
                >
                  FRONT
                </button>
                <button
                  className={cx("border border-black px-3 py-2 text-[12px]", side==="back" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setSide("back")}
                >
                  BACK
                </button>
                <button
                  className="col-span-1 flex items-center justify-center gap-2 border border-black px-3 py-2 text-[12px]"
                  onClick={onDownloadFront}
                >
                  <Download className={ico}/> Download
                </button>
                <button
                  className="col-span-1 flex items-center justify-center gap-2 border border-black px-3 py-2 text-[12px]"
                  onClick={onDownloadBack}
                >
                  <Download className={ico}/> Download
                </button>
              </div>

              {/* Layers toggle */}
              <div className="flex justify-end">
                <button
                  className="text-[12px] underline"
                  onClick={toggleLayers}
                >
                  {layersOpen ? "Hide layers" : "Show layers"}
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  // =================== MOBILE ===================
  // нижняя панель инструментов + шторка для слоёв/настроек
  const [drawer, setDrawer] = useState(false)
  const fileRefM = useRef<HTMLInputElement>(null)
  const onFileM = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  return (
    <>
      {/* Bottom toolbar */}
      <div className="fixed z-30 bottom-0 left-0 right-0 bg-white/95 border-t border-black/10 px-2 pt-2 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex">
            <button className={btn + cx(tool==="move" && "bg-black text-white")} onClick={()=>setTool("move")}><Move className={ico}/></button>
            <button className={btn + cx(tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")}><Brush className={ico}/></button>
            <button className={btn + cx(tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")}><Eraser className={ico}/></button>
            <button className={btn} onClick={onAddText}><TypeIcon className={ico}/></button>
            <label className={btn}>
              <ImageIcon className={ico}/>
              <input ref={fileRefM} type="file" accept="image/*" onChange={onFileM} className="hidden" />
            </label>
            <button className={btn} onClick={()=>onAddShape("square")}><Shapes className={ico}/></button>
          </div>

          <div className="flex items-center gap-3 flex-1 ml-2">
            <div
              className="w-10 h-7 border border-black rounded-sm"
              style={{ background: brushColor }}
              onClick={()=>setBrushColor(brushColor)}
              title="Color"
            />
            <input
              type="range" min={2} max={200} value={brushSize}
              onChange={e=>props.setBrushSize?.(parseInt(e.target.value))}
              className="flex-1 appearance-none h-[6px] bg-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
            />
            <button className={btn} onClick={()=>setDrawer(true)} title="Layers & settings">
              <MoreHorizontal className={ico}/>
            </button>
          </div>
        </div>
      </div>

      {/* Drawer (layers + настройки) */}
      {drawer && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={()=>setDrawer(false)} />
          <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-xl shadow-2xl p-3 max-h-[65vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] uppercase tracking-widest">Layers</div>
              <button className="px-3 py-1 border border-black text-[12px]" onClick={()=>setDrawer(false)}>Close</button>
            </div>

            <div className="space-y-2">
              {mobileLayers.items.map((it)=>(
                <div key={it.id} className="border border-black p-2">
                  <div className="flex items-center justify-between">
                    <button className="text-left text-[12px] font-medium" onClick={()=>mobileLayers.onSelect(it.id)}>{it.name}</button>
                    <div className="flex items-center gap-1">
                      <button className={btn} onClick={()=>mobileLayers.onMoveUp(it.id)}><ArrowUp className={ico}/></button>
                      <button className={btn} onClick={()=>mobileLayers.onMoveDown(it.id)}><ArrowDown className={ico}/></button>
                      <button className={btn} onClick={()=>mobileLayers.onDuplicate(it.id)}><Copy className={ico}/></button>
                      <button className={btn} onClick={()=>mobileLayers.onDelete(it.id)}><Trash2 className={ico}/></button>
                      <button className={btn} onClick={()=>mobileLayers.onToggleLock(it.id)}>{it.locked ? <Lock className={ico}/> : <Unlock className={ico}/>}</button>
                      <button className={btn} onClick={()=>mobileLayers.onToggleVisible(it.id)}>{it.visible ? <Eye className={ico}/> : <EyeOff className={ico}/>}</button>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 items-center">
                    <select
                      className="border border-black px-2 py-1 text-[12px]"
                      value={it.blend}
                      onChange={(e)=>mobileLayers.onChangeBlend(it.id, e.target.value)}
                    >
                      {BLENDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px]">Opacity</span>
                      <input
                        type="range" min={0} max={1} step={0.01} value={it.opacity}
                        onChange={(e)=>mobileLayers.onChangeOpacity(it.id, parseFloat(e.target.value))}
                        className="flex-1 appearance-none h-[6px] bg-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* простая палитра снизу, чтобы не прыгать в основную панель */}
            <div className="mt-3">
              <div className="text-[12px] mb-1">Palette</div>
              <div className="grid grid-cols-10 gap-1">
                {palette.map((c)=>(
                  <button
                    key={c}
                    className="w-7 h-7 border border-black"
                    style={{ background: c }}
                    onClick={()=>{ setBrushColor(c); setSelectedColor(c) }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
