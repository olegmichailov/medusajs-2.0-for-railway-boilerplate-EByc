"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// Общие стили
const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const btn  = "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-5 h-5"

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
    shapeKind, setShapeKind,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedFill, setSelectedStroke, setSelectedStrokeW,
    setSelectedText, setSelectedFontSize, setSelectedFontFamily, setSelectedColor,
    mobileLayers,
  } = props

  // ===================
  // DESKTOP TOOLBAR
  // ===================
  if (!isMobile) {
    const [open, setOpen] = useState(true)
    const [pos, setPos] = useState({ x: 24, y: 120 })
    const drag = useRef<{ dx: number; dy: number } | null>(null)

    // перетаскивание панели
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

    // загрузка изображения
    const fileRef = useRef<HTMLInputElement>(null)
    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    // локальное состояние текстового поля, чтобы корректно отображать ввод и не мигать
    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => {
      setTextValue(selectedProps?.text ?? "")
    }, [selectedProps?.text, selectedKind])

    // авто-рост textarea до 3 строк
    const taRef = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
      if (!taRef.current) return
      const ta = taRef.current
      ta.style.height = "auto"
      const max = 3 * 1.3 * (parseFloat(getComputedStyle(ta).fontSize) || 16) // 3 строки
      ta.style.height = Math.min(ta.scrollHeight, max) + "px"
    }, [textValue])

    return (
      <div className={wrap + " fixed z-40 w-[420px] p-3"} style={{ left: pos.x, top: pos.y }}>
        {/* заголовок панели */}
        <div className="flex items-center justify-between mb-3 cursor-move select-none" onMouseDown={onDragStart}>
          <div className="text-[11px] uppercase">Tools</div>
          <div className="flex items-center gap-2">
            <button className={btn} onClick={toggleLayers} title="Layers">
              {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
            </button>
            <button className={btn} onClick={() => setOpen(!open)} title={open ? "Collapse" : "Expand"}>{open ? "×" : "≡"}</button>
          </div>
        </div>

        {open && (
          <div className="space-y-4">
            {/* инструменты */}
            <div className="grid grid-cols-6 gap-2">
              <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
              <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
              <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
              <button className={btn} onClick={() => { onAddText(); }} title="Text"><TypeIcon className={ico}/></button>
              <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
              <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
            </div>

            {/* кисть / резинка */}
            {(tool==="brush" || tool==="erase") && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
                <input
                  type="range" min={1} max={240} value={brushSize}
                  onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                  className="w-full appearance-none h-[3px] bg-black
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                    [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                />
                <div className="text-[11px] uppercase">Color</div>
                <input
                  type="color" value={brushColor}
                  onChange={(e)=>{ setBrushColor(e.target.value); setSelectedColor(e.target.value) }}
                  className="w-10 h-10 border border-black rounded-none"
                />
              </div>
            )}

            {/* шейпы */}
            {tool==="shape" && (
              <>
                <div className="grid grid-cols-5 gap-2">
                  <button className={btn} onClick={()=>{ props.onAddShape("circle"); setTool("move"); }}   title="Circle"><Circle className={ico}/></button>
                  <button className={btn} onClick={()=>{ props.onAddShape("square"); setTool("move"); }}   title="Square"><Square className={ico}/></button>
                  <button className={btn} onClick={()=>{ props.onAddShape("triangle"); setTool("move"); }} title="Triangle"><Triangle className={ico}/></button>
                  <button className={btn} onClick={()=>{ props.onAddShape("cross"); setTool("move"); }}    title="Cross"><Plus className={ico}/></button>
                  <button className={btn} onClick={()=>{ props.onAddShape("line"); setTool("move"); }}     title="Line"><Slash className={ico}/></button>
                </div>

                {props.selectedKind === "shape" && (
                  <div className="space-y-2 border-t pt-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px]">Fill</div>
                      <input
                        type="color"
                        value={selectedProps?.fill ?? "#000000"}
                        onChange={(e)=> setSelectedFill(e.target.value)}
                        className="w-8 h-8 p-0 border rounded-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-[11px]">Stroke</div>
                      <input type="color" value={selectedProps?.stroke ?? "#000000"} onChange={(e)=> setSelectedStroke(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                      <input type="number" min={0} max={40} value={selectedProps?.strokeWidth ?? 0} onChange={(e)=> setSelectedStrokeW(parseInt(e.target.value,10))} className="w-16 border px-2 py-1 text-sm rounded-none"/>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* текст — «индустриальный» ввод */}
            {selectedKind === "text" && (
              <div className="space-y-3 border-t pt-3">
                <label className="text-[11px] uppercase block">Text</label>
                <textarea
                  ref={taRef}
                  rows={2}
                  value={textValue}
                  onChange={(e)=>{ setTextValue(e.target.value); setSelectedText(e.target.value) }}
                  onKeyDown={(e)=>{ e.stopPropagation() }}
                  className="w-full border px-2 py-2 text-sm rounded-none leading-[1.3] resize-none"
                  placeholder="Type here… (Shift+Enter for new line)"
                />

                <div className="flex items-center gap-3">
                  <div className="text-[11px] uppercase">Size</div>
                  <input
                    type="range" min={8} max={320}
                    value={selectedProps?.fontSize ?? 96}
                    onChange={(e)=> setSelectedFontSize(parseInt(e.target.value,10))}
                    className="flex-1 h-[3px] bg-black appearance-none
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                      [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-[11px] uppercase">Font</div>
                  <select
                    value={selectedProps?.fontFamily ?? "Helvetica, Arial, sans-serif"}
                    onChange={(e)=> setSelectedFontFamily(e.target.value)}
                    className="border rounded-none text-sm px-2 py-1"
                    title="Font"
                  >
                    <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="'Times New Roman', Times, serif">Times</option>
                    <option value="'Courier New', Courier, monospace">Courier</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Impact, Charcoal, sans-serif">Impact</option>
                  </select>

                  <div className="flex items-center gap-2">
                    <div className="text-[11px] uppercase">Color</div>
                    <input
                      type="color"
                      value={selectedProps?.fill ?? "#000000"}
                      onChange={(e)=> setSelectedFill(e.target.value)}
                      className="w-8 h-8 p-0 border rounded-none"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-black/60">
                  Совет: масштабируй текст через угловые хэндлы — размер шрифта подстроится автоматически (без «пиксельного скейла»).
                </div>
              </div>
            )}

            {/* Переключатели Front/Back + отдельные Download */}
            <div className="space-y-2">
              {/* FRONT row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={()=>setSide("front")}
                  className="flex-1 h-11 border border-black text-[13px] rounded-none transition"
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, background: side==="front" ? "black" : "white", color: side==="front" ? "white" : "black" }}
                >
                  FRONT
                </button>
                <button
                  className="h-11 px-4 border border-black rounded-none flex items-center gap-2 hover:bg-black hover:text-white"
                  onClick={onDownloadFront}
                  title="Download Front"
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                >
                  <Download className="w-4 h-4" />
                  <span className="text-[12px]">Download</span>
                </button>
              </div>
              {/* BACK row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={()=>setSide("back")}
                  className="flex-1 h-11 border border-black text-[13px] rounded-none transition"
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, background: side==="back" ? "black" : "white", color: side==="back" ? "white" : "black" }}
                >
                  BACK
                </button>
                <button
                  className="h-11 px-4 border border-black rounded-none flex items-center gap-2 hover:bg-black hover:text-white"
                  onClick={onDownloadBack}
                  title="Download Back"
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                >
                  <Download className="w-4 h-4" />
                  <span className="text-[12px]">Download</span>
                </button>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
          </div>
        )}
      </div>
    )
  }

  // ===================
  // MOBILE: нижняя шторка «Create»
  // ===================
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"tools" | "layers">("tools")
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      onUploadImage(f)
      setOpen(false) // автоматически закрываем шторку после вставки
    }
    e.currentTarget.value = ""
  }

  // локальное состояние textarea (как на десктопе)
  const [textValueM, setTextValueM] = useState<string>(selectedProps?.text ?? "")
  useEffect(() => { setTextValueM(selectedProps?.text ?? "") }, [selectedProps?.text, selectedKind])
  const taRefM = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!taRefM.current) return
    const ta = taRefM.current
    ta.style.height = "auto"
    const max = 3 * 1.3 * (parseFloat(getComputedStyle(ta).fontSize) || 16)
    ta.style.height = Math.min(ta.scrollHeight, max) + "px"
  }, [textValueM])

  return (
    <>
      {/* Нижняя кнопка */}
      <div className="fixed left-0 right-0 bottom-0 z-40 grid place-items-center pointer-events-none">
        <div className="pointer-events-auto mb-[env(safe-area-inset-bottom,12px)]">
          <button
            className="px-6 h-12 min-w-[160px] bg-black text-white text-sm tracking-wide uppercase rounded-none shadow-lg active:scale-[.98] transition"
            onClick={()=> setOpen(true)}
            style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
          >
            Create
          </button>
        </div>
      </div>

      {/* Шторка */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={()=>setOpen(false)}>
          {/* затемнение */}
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="absolute left-0 right-0 bottom-0 bg-white border-t border-black/10 shadow-2xl rounded-t-[12px]"
            style={{ height: "65vh" }}
            onClick={(e)=>e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <div className="flex gap-1">
                <button
                  className={clx("px-3 h-9 border text-xs rounded-none", tab==="tools" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setTab("tools")}
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                >
                  Tools
                </button>
                <button
                  className={clx("px-3 h-9 border text-xs rounded-none", tab==="layers" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setTab("layers")}
                  style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                >
                  Layers
                </button>
              </div>
              <button className="px-3 h-9 border text-xs rounded-none" onClick={()=>setOpen(false)} style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}>Close</button>
            </div>

            {/* content */}
            <div className="h-[calc(65vh-44px)] overflow-auto px-3 py-2 space-y-3">
              {tab === "tools" && (
                <>
                  <div className="grid grid-cols-6 gap-2">
                    <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
                    <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
                    <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
                    <button className={btn} onClick={() => { onAddText(); setOpen(false) }} title="Text"><TypeIcon className={ico}/></button>
                    <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
                    <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
                  </div>

                  {(tool==="brush" || tool==="erase") && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
                      <input
                        type="range" min={1} max={240} value={brushSize}
                        onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                        className="w-full appearance-none h-[3px] bg-black
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                        [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                      />
                      <div className="text-[11px] uppercase">Color</div>
                      <input
                        type="color" value={brushColor}
                        onChange={(e)=>{ setBrushColor(e.target.value); setSelectedColor(e.target.value) }}
                        className="w-9 h-9 border border-black rounded-none"
                      />
                    </div>
                  )}

                  {tool==="shape" && (
                    <div className="grid grid-cols-5 gap-2">
                      <button className={btn} onClick={()=>{ onAddShape("circle"); setTool("move"); setOpen(false) }}   title="Circle"><Circle className={ico}/></button>
                      <button className={btn} onClick={()=>{ onAddShape("square"); setTool("move"); setOpen(false) }}   title="Square"><Square className={ico}/></button>
                      <button className={btn} onClick={()=>{ onAddShape("triangle"); setTool("move"); setOpen(false) }} title="Triangle"><Triangle className={ico}/></button>
                      <button className={btn} onClick={()=>{ onAddShape("cross"); setTool("move"); setOpen(false) }}    title="Cross"><Plus className={ico}/></button>
                      <button className={btn} onClick={()=>{ onAddShape("line"); setTool("move"); setOpen(false) }}     title="Line"><Slash className={ico}/></button>
                    </div>
                  )}

                  {selectedKind === "text" && (
                    <div className="space-y-2 border-t pt-2">
                      <label className="text-[11px] uppercase block">Text</label>
                      <textarea
                        ref={taRefM}
                        rows={2}
                        value={textValueM}
                        onChange={(e)=>{ setTextValueM(e.target.value); setSelectedText(e.target.value) }}
                        onKeyDown={(e)=>{ e.stopPropagation() }}
                        className="w-full border px-2 py-2 text-sm rounded-none leading-[1.3] resize-none"
                        placeholder="Type here… (Shift+Enter for new line)"
                      />
                      <div className="flex items-center gap-2">
                        <div className="text-[11px]">Size</div>
                        <input
                          type="range" min={8} max={320}
                          value={selectedProps?.fontSize ?? 96}
                          onChange={(e)=> setSelectedFontSize(parseInt(e.target.value,10))}
                          className="flex-1 h-[3px] bg-black appearance-none
                            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                            [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                        />
                        <select
                          value={selectedProps?.fontFamily ?? "Helvetica, Arial, sans-serif"}
                          onChange={(e)=> setSelectedFontFamily(e.target.value)}
                          className="border rounded-none text-sm"
                          title="Font"
                        >
                          <option value="Helvetica, Arial, sans-serif">Helvetica</option>
                          <option value="Arial, Helvetica, sans-serif">Arial</option>
                          <option value="'Times New Roman', Times, serif">Times</option>
                          <option value="'Courier New', Courier, monospace">Courier</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="Impact, Charcoal, sans-serif">Impact</option>
                        </select>
                        <div className="text-[11px]">Color</div>
                        <input type="color" value={selectedProps?.fill ?? "#000000"} onChange={(e)=> setSelectedFill(e.target.value)} className="w-8 h-8 p-0 border rounded-none"/>
                      </div>
                    </div>
                  )}

                  {/* Переключатели + загрузки */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={()=>setSide("front")}
                        className="flex-1 h-11 border border-black text-[13px] rounded-none transition"
                        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, background: side==="front" ? "black" : "white", color: side==="front" ? "white" : "black" }}
                      >
                        FRONT
                      </button>
                      <button
                        className="h-11 px-4 border border-black rounded-none flex items-center gap-2 hover:bg-black hover:text-white"
                        onClick={onDownloadFront}
                        title="Download Front"
                        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-[12px]">Download</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={()=>setSide("back")}
                        className="flex-1 h-11 border border-black text-[13px] rounded-none transition"
                        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, background: side==="back" ? "black" : "white", color: side==="back" ? "white" : "black" }}
                      >
                        BACK
                      </button>
                      <button
                        className="h-11 px-4 border border-black rounded-none flex items-center gap-2 hover:bg-black hover:text-white"
                        onClick={onDownloadBack}
                        title="Download Back"
                        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700 }}
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-[12px]">Download</span>
                      </button>
                    </div>
                  </div>

                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
                </>
              )}

              {/* LAYERS таб для мобилы без DnD — управляем кнопками */}
              {tab === "layers" && (
                <div className="space-y-2">
                  {mobileLayers.items.length === 0 && (
                    <div className="text-xs text-black/60">No layers yet.</div>
                  )}
                  {mobileLayers.items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none active:bg-black active:text-white"
                      onClick={()=>mobileLayers.onSelect(it.id)}
                    >
                      <div className="text-[11px] flex-1 truncate">{it.name}</div>

                      {/* упрощённый порядок без drag */}
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onMoveUp(it.id) }}
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4"/>
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onMoveDown(it.id) }}
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4"/>
                      </button>

                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onToggleVisible(it.id) }}
                        title={it.visible ? "Hide" : "Show"}
                      >
                        {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onToggleLock(it.id) }}
                        title={it.locked ? "Unlock" : "Lock"}
                      >
                        {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onDuplicate(it.id) }}
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4"/>
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onClick={(e)=>{ e.stopPropagation(); mobileLayers.onDelete(it.id) }}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
