"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown, Layers,
  Undo2, Redo2
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

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

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl"
const ico  = "w-4 h-4"
const btnBase =
  "w-10 h-10 grid place-items-center border border-black text-[11px] rounded-none " +
  "hover:bg-black hover:text-white transition -ml-[1px] first:ml-0 select-none"
const activeBtn = "bg-black text-white"
const btn = (active?: boolean, extra?: string) =>
  clx(btnBase, active ? activeBtn : "bg-white", extra)

const inputStop = {
  onPointerDown: (e: any) => e.stopPropagation(),
  onPointerMove: (e: any) => e.stopPropagation(),
  onPointerUp:   (e: any) => e.stopPropagation(),
  onTouchStart:  (e: any) => e.stopPropagation(),
  onTouchMove:   (e: any) => e.stopPropagation(),
  onTouchEnd:    (e: any) => e.stopPropagation(),
  onMouseDown:   (e: any) => e.stopPropagation(),
  onMouseMove:   (e: any) => e.stopPropagation(),
  onMouseUp:     (e: any) => e.stopPropagation(),
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
    setSelectedText, setSelectedFontSize, setSelectedColor,
    mobileLayers,
  } = props

  const dispatch = (name: "darkroom:undo"|"darkroom:redo"|"darkroom:clear") =>
    window.dispatchEvent(new CustomEvent(name))

  // =================== DESKTOP ===================
  if (!isMobile) {
    const [open, setOpen] = useState(true)
    const [pos, setPos]   = useState({ x: 24, y: 120 })
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
      e.stopPropagation()
      const f = e.target.files?.[0]
      if (f) onUploadImage(f)
      e.currentTarget.value = ""
    }

    const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
    useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

    return (
      <div className={clx("fixed", wrap)} style={{ left: pos.x, top: pos.y, width: 280 }} onMouseDown={(e)=>e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-black/10">
          <div className="px-2 py-1 text-[10px] tracking-widest">TOOLS</div>
          <div className="flex">
            <button className={btn(open)} onClick={(e)=>{e.stopPropagation(); setOpen(!open)}}>
              {open ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
            </button>
            <button className={btn(false)} onMouseDown={onDragStart}><Move className={ico}/></button>
          </div>
        </div>

        {open && (
          <div className="p-2 space-y-2">
            {/* row 1 — инструменты + layers + undo/redo/clear */}
            <div className="flex items-center">
              {[
                {t:"move",   icon:<Move className={ico}/>},
                {t:"brush",  icon:<Brush className={ico}/>},
                {t:"erase",  icon:<Eraser className={ico}/>},
                {t:"text",   icon:<TypeIcon className={ico}/>},
                {t:"image",  icon:<ImageIcon className={ico}/>},
                {t:"shape",  icon:<Shapes className={ico}/>},
              ].map((b)=>(
                <button
                  key={b.t}
                  className={btn(tool===b.t)}
                  onClick={(e)=>{
                    e.stopPropagation()
                    if (b.t==="image") fileRef.current?.click()
                    else if (b.t==="text") onAddText()
                    else if (b.t==="shape") setTool("shape" as Tool)
                    else setTool(b.t as Tool)
                  }}
                  title={b.t}
                >{b.icon}</button>
              ))}
              <button className={clx(btn(layersOpen), "ml-2")} onClick={(e)=>{e.stopPropagation(); toggleLayers()}}>
                <Layers className={ico}/>
              </button>
              <div className="ml-2 flex">
                <button className={btn(false)} title="Назад" onClick={(e)=>{e.stopPropagation(); dispatch("darkroom:undo")}}>
                  <Undo2 className={ico}/>
                </button>
                <button className={btn(false)} title="Вперед" onClick={(e)=>{e.stopPropagation(); dispatch("darkroom:redo")}}>
                  <Redo2 className={ico}/>
                </button>
                <button className={btn(false)} title="Клир (очистить арт)" onClick={(e)=>{e.stopPropagation(); dispatch("darkroom:clear")}}>
                  <Trash2 className={ico}/>
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
            </div>

            {/* row 2 — настройки кисти/ластика/текста */}
            <DesktopSettings
              tool={tool}
              brushColor={brushColor}
              setBrushColor={setBrushColor}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              selectedProps={selectedProps}
              textValue={textValue}
              setTextValue={(v)=>{ setTextValue(v); setSelectedText(v) }}
              onAddShape={onAddShape}
              setSelectedFontSize={setSelectedFontSize}
            />

            {/* FRONT/BACK + downloads */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex">
                <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
                <button className={clx("h-10 w-24 border border-black bg-white -ml-[1px] flex items-center justify-center gap-2")} onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}>
                  <Download className={ico}/> <span className="text-xs">DL</span>
                </button>
              </div>
              <div className="flex">
                <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={(e)=>{e.stopPropagation(); setSide("back")}}>BACK</button>
                <button className={clx("h-10 w-24 border border-black bg-white -ml-[1px] flex items-center justify-center gap-2")} onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}>
                  <Download className={ico}/> <span className="text-xs">DL</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* глобальные стили ползунков */}
        <SliderStyles />
      </div>
    )
  }

  // =================== MOBILE ===================
  const [layersOpenM, setLayersOpenM] = useState(false)

  const mobileButton = (t: Tool | "image" | "shape" | "text", icon: React.ReactNode, onPress?: ()=>void) => (
    <button
      className={clx("h-12 w-12 grid place-items-center border border-black rounded-none", tool===t ? activeBtn : "bg-white")}
      onClick={(e)=>{ e.stopPropagation(); onPress ? onPress() : t==="image" ? fileRef.current?.click() : t==="text" ? onAddText() : t==="shape" ? setTool("shape") : setTool(t as Tool)}}
    >
      {icon}
    </button>
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // локальное состояние текста
  const [textValueM, setTextValueM] = useState<string>(props.selectedProps?.text ?? "")
  useEffect(() => setTextValueM(props.selectedProps?.text ?? ""), [props.selectedProps?.text, selectedKind])

  // что показывать во 2-й строке (settings) на мобилке
  const SettingsRow = useMemo(() => {
    const label = (s:string) => <div className="text-[10px] px-1">{s}</div>

    if (tool === "brush") {
      return (
        <div className="w-full flex items-center gap-2">
          {label("Color")}
          <input
            type="color"
            value={brushColor}
            onChange={(e)=>{ setBrushColor(e.target.value); if (selectedKind) setSelectedColor(e.target.value) }}
            className="w-10 h-10 border border-black p-0 appearance-none bg-white"
            {...inputStop}
          />
          <div className="flex-1 flex items-center gap-2">
            {label("Size")}
            <input
              type="range" min={1} max={200} step={1}
              value={brushSize}
              onChange={(e)=>setBrushSize(parseInt(e.target.value))}
              className="dr-slider w-full"
              {...inputStop}
            />
          </div>
        </div>
      )
    }

    if (tool === "erase") {
      return (
        <div className="w-full flex items-center gap-2">
          {label("Eraser")}
          <input
            type="range" min={5} max={300} step={1}
            value={brushSize}
            onChange={(e)=>setBrushSize(parseInt(e.target.value))}
            className="dr-slider w-full"
            {...inputStop}
          />
        </div>
      )
    }

    if (tool === "text") {
      return (
        <div className="w-full flex items-center gap-2">
          <textarea
            value={textValueM}
            onChange={(e)=>{ setTextValueM(e.target.value); setSelectedText(e.target.value) }}
            className="flex-1 h-12 border border-black p-1 text-sm bg-white"
            placeholder="Введите текст"
            {...inputStop}
          />
          <div className="w-40 flex items-center gap-2">
            {label("FS")}
            <input
              type="range" min={8} max={800} step={1}
              value={props.selectedProps?.fontSize ?? 96}
              onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
              className="dr-slider w-full"
              {...inputStop}
            />
          </div>
        </div>
      )
    }

    // shape – просто кнопки
    if (tool === "shape") {
      return (
        <div className="w-full flex items-center gap-1">
          <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
          <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
        </div>
      )
    }

    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, brushColor, brushSize, selectedKind, textValueM])

  return (
    <>
      {/* ШТОРКА LAYERS — сверху, не обрезается, скролл внутри */}
      {layersOpenM && (
        <div className="fixed inset-x-0 top-0 bottom-[144px] z-40 p-3" onClick={()=>setLayersOpenM(false)}>
          <div className={clx(wrap, "p-2 w-full h-full overflow-auto")} onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-white/90">
              <div className="text-[10px] tracking-widest">LAYERS</div>
              <button className={clx("px-2 py-1 border border-black", activeBtn)} onClick={() => setLayersOpenM(false)}>Close</button>
            </div>
            <div className="space-y-2">
              {mobileLayers.items.map((l)=>(
                <div key={l.id} className="flex items-center gap-2 border border-black px-2 py-1 bg-white">
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onSelect(l.id)}>{l.type[0].toUpperCase()}</button>
                  <div className="text-xs flex-1 truncate">{l.name}</div>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveUp(l.id)}><ArrowUp className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onMoveDown(l.id)}><ArrowDown className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onDuplicate(l.id)}><Copy className="w-3 h-3"/></button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleLock(l.id)}>{l.locked?<Lock className="w-3 h-3"/>:<Unlock className="w-3 h-3"/>}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center" onClick={()=>mobileLayers.onToggleVisible(l.id)}>{l.visible?<Eye className="w-3 h-3"/>:<EyeOff className="w-3 h-3"/>}</button>
                  <button className="border border-black w-6 h-6 grid place-items-center bg-black text-white" onClick={()=>mobileLayers.onDelete(l.id)}><Trash2 className="w-3 h-3"/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель — 3 строки. Фикс, не перекрывает мокап выше минимума */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 border-t border-black/10">
        {/* row 1 — инструменты + слои + undo/redo/clear */}
        <div className="px-2 py-1 flex items-center gap-1">
          {mobileButton("move",  <Move className={ico}/>)}
          {mobileButton("brush", <Brush className={ico}/>)}
          {mobileButton("erase", <Eraser className={ico}/>)}
          {mobileButton("text",  <TypeIcon className={ico}/>, onAddText)}
          {mobileButton("image", <ImageIcon className={ico}/>)}
          {mobileButton("shape", <Shapes className={ico}/>)}
          <button className={clx("h-12 px-3 border border-black ml-2", layersOpenM ? activeBtn : "bg-white")} onClick={()=>setLayersOpenM(v=>!v)}>
            <Layers className={ico}/>
          </button>
          <div className="ml-2 flex">
            <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={()=>dispatch("darkroom:undo")} title="Назад"><Undo2 className={ico}/></button>
            <button className="h-12 w-12 grid place-items-center border border-black bg-white -ml-[1px]" onClick={()=>dispatch("darkroom:redo")} title="Вперед"><Redo2 className={ico}/></button>
            <button className="h-12 w-12 grid place-items-center border border-black bg-white -ml-[1px]" onClick={()=>dispatch("darkroom:clear")} title="Клир"><Trash2 className={ico}/></button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} {...inputStop}/>
        </div>

        {/* row 2 — настройки (динамически) */}
        <div className="px-2 py-1">
          {SettingsRow}
        </div>

        {/* row 3 — FRONT/BACK с парными Download */}
        <div className="px-2 pb-2 grid grid-cols-2 gap-2">
          <div className="flex">
            <button className={clx("flex-1 h-10 border border-black", side==="front"?activeBtn:"bg-white")} onClick={()=>setSide("front")}>FRONT</button>
            <button className={clx("h-10 w-20 border border-black bg-white -ml-[1px] flex items-center justify-center gap-1")} onClick={onDownloadFront}>
              <Download className={ico}/>DL
            </button>
          </div>
          <div className="flex">
            <button className={clx("flex-1 h-10 border border-black", side==="back"?activeBtn:"bg-white")} onClick={()=>setSide("back")}>BACK</button>
            <button className={clx("h-10 w-20 border border-black bg-white -ml-[1px] flex items-center justify-center gap-1")} onClick={onDownloadBack}>
              <Download className={ico}/>DL
            </button>
          </div>
        </div>
      </div>

      {/* глобальные стили ползунков */}
      <SliderStyles />
    </>
  )
}

/* ======= ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ======= */

function DesktopSettings(props: {
  tool: Tool
  brushColor: string
  setBrushColor: (v:string)=>void
  brushSize: number
  setBrushSize: (n:number)=>void
  selectedProps: ToolbarProps["selectedProps"]
  textValue: string
  setTextValue: (v:string)=>void
  onAddShape: (k: ShapeKind)=>void
  setSelectedFontSize: (n:number)=>void
}) {
  const {
    tool, brushColor, setBrushColor, brushSize, setBrushSize,
    selectedProps, textValue, setTextValue, onAddShape, setSelectedFontSize
  } = props

  return (
    <div className="space-y-2">
      {/* brush */}
      {tool === "brush" && (
        <div className="flex items-center gap-3">
          <div className="text-[10px] w-8">Color</div>
          <input
            type="color"
            value={brushColor}
            onChange={(e)=>setBrushColor(e.target.value)}
            className="w-8 h-8 border border-black bg-white"
          />
          <div className="flex-1 flex items-center gap-2">
            <div className="text-[10px] w-10">Size</div>
            <input
              type="range" min={1} max={200} step={1} value={brushSize}
              onChange={(e)=>setBrushSize(parseInt(e.target.value))}
              className="dr-slider w-full"
              {...inputStop}
            />
          </div>
        </div>
      )}

      {/* eraser */}
      {tool === "erase" && (
        <div className="flex items-center gap-3">
          <div className="text-[10px] w-12">Eraser</div>
          <input
            type="range" min={5} max={300} step={1} value={brushSize}
            onChange={(e)=>setBrushSize(parseInt(e.target.value))}
            className="dr-slider w-full"
            {...inputStop}
          />
        </div>
      )}

      {/* text */}
      {tool === "text" && (
        <div className="space-y-2">
          <div className="text-[10px]">Text</div>
          <textarea
            value={textValue}
            onChange={(e)=>setTextValue(e.target.value)}
            className="w-full h-16 border border-black p-1 text-sm"
            placeholder="Enter text"
            {...inputStop}
          />
          <div className="flex items-center gap-2">
            <div className="text-[10px] w-16">Font size</div>
            <input
              type="range" min={8} max={800} step={1}
              value={selectedProps.fontSize ?? 96}
              onChange={(e)=>setSelectedFontSize(parseInt(e.target.value))}
              className="dr-slider w-full"
              {...inputStop}
            />
            <div className="text-xs w-10 text-right">{selectedProps.fontSize ?? 96}</div>
          </div>
        </div>
      )}

      {/* shapes */}
      {tool === "shape" && (
        <div className="pt-1">
          <div className="text-[10px] mb-1">Shapes</div>
          <div className="flex">
            <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><Square className={ico}/></button>
            <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><Circle className={ico}/></button>
            <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}}><Triangle className={ico}/></button>
            <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}}><Plus className={ico}/></button>
            <button className={btnBase} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}}><Slash className={ico}/></button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Глобальные стили для input[type=range] — тонкая чёрная линия + квадратный бегунок */
function SliderStyles() {
  return (
    <style jsx global>{`
      input[type="range"].dr-slider {
        -webkit-appearance: none;
        width: 100%;
        background: transparent;
        height: 20px;
        margin: 0;
      }
      /* WebKit track */
      input[type="range"].dr-slider::-webkit-slider-runnable-track {
        height: 1px;
        background: #000;
      }
      /* WebKit thumb */
      input[type="range"].dr-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        background: #000;
        border: 1px solid #000;
        margin-top: -6.5px; /* центрируем на треке */
      }

      /* Firefox track */
      input[type="range"].dr-slider::-moz-range-track {
        height: 1px;
        background: #000;
      }
      /* Firefox thumb */
      input[type="range"].dr-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: #000;
        border: 1px solid #000;
        border-radius: 0;
      }

      /* Убираем focus-glow */
      input[type="range"].dr-slider:focus { outline: none; }
    `}</style>
  )
}
