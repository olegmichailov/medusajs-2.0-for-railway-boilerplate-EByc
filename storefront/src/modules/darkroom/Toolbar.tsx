// storefront/src/modules/darkroom/Toolbar.tsx
"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"
import {
  Move as MoveIco, Brush as BrushIco, Eraser as EraserIco, Type as TypeIco,
  Image as ImageIco, Shapes as ShapesIco, Layers as LayersIco,
  Download as DownloadIco, Circle as CircleIco, Square as SquareIco,
  Triangle as TriangleIco, Plus as PlusIco, Slash as SlashIco,
  Undo2 as UndoIco, Redo2 as RedoIco, Trash2 as ClearIco
} from "lucide-react"

type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: Blend
  opacity: number
}

type MobileLayersProps = {
  items: LayerItem[]
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, b: Blend) => void
  onChangeOpacity: (id: string, v: number) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

type Props = {
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void

  brushColor: string
  setBrushColor: (hex: string) => void
  brushSize: number
  setBrushSize: (n: number) => void

  shapeKind: ShapeKind | null
  setShapeKind: (s: ShapeKind | null) => void

  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void

  onDownloadFront: () => void
  onDownloadBack: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "image" | "shape" | "text" | "strokes" | null
  selectedProps: any
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (s: string) => void
  setSelectedColor: (hex: string) => void

  onUndo: () => void
  onRedo: () => void
  onClear: () => void

  mobileLayers?: MobileLayersProps
}

const ico = "w-4 h-4"
const BTN = "h-10 w-10 grid place-items-center border border-black rounded-none text-xs select-none"
const BTN_ACTIVE = "bg-black text-white"

const STOP = {
  onPointerDown: (e: any)=>e.stopPropagation(),
  onPointerMove: (e: any)=>e.stopPropagation(),
  onPointerUp:   (e: any)=>e.stopPropagation(),
  onTouchStart:  (e: any)=>e.stopPropagation(),
  onTouchMove:   (e: any)=>e.stopPropagation(),
  onTouchEnd:    (e: any)=>e.stopPropagation(),
  onMouseDown:   (e: any)=>e.stopPropagation(),
  onMouseMove:   (e: any)=>e.stopPropagation(),
  onMouseUp:     (e: any)=>e.stopPropagation(),
}

export default function Toolbar(props: Props) {
  const {
    side, setSide, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedText, setSelectedFontSize, setSelectedColor,
    onUndo, onRedo, onClear,
  } = props

  const fileRef = useRef<HTMLInputElement>(null)
  const pickFile = () => fileRef.current?.click()
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation()
    const f = e.target.files?.[0]; if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const activeColor = useMemo(() => {
    if (selectedKind === "text" && selectedProps?.fill) return selectedProps.fill as string
    if ((selectedKind === "shape" || selectedKind === "image") && selectedProps?.fill) return selectedProps.fill as string
    return brushColor
  }, [selectedKind, selectedProps, brushColor])

  const setColor = (hex: string) => {
    if (selectedKind) props.setSelectedColor(hex)
    else setBrushColor(hex)
  }

  const [textValue, setTextValue] = useState<string>(selectedKind==="text" ? (selectedProps?.text ?? "") : "")
  useEffect(() => { setTextValue(selectedKind==="text" ? (selectedProps?.text ?? "") : "") }, [selectedKind, selectedProps?.text])

  // ——— Д Е С К Т О П ———
  const Desktop = (
    <div
      className="hidden md:block fixed left-5 top-28 z-30 select-none"
      onMouseDownCapture={(e)=>e.stopPropagation()} onPointerDownCapture={(e)=>e.stopPropagation()} onTouchStartCapture={(e)=>e.stopPropagation()}
      style={{ width: 260 }}
    >
      <div className="bg-white border border-black/20 rounded-none shadow-sm">
        {/* header */}
        <div className="px-3 py-2 border-b border-black/10 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.18em] font-semibold">TOOLS</span>
          <div className="flex items-center gap-1">
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onUndo()}} title="Undo"><UndoIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onRedo()}} title="Redo"><RedoIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onClear()}} title="Clear"><ClearIco className={ico}/></button>
            <button className={`${BTN} ${layersOpen ? BTN_ACTIVE : ""}`} onClick={(e)=>{e.stopPropagation(); toggleLayers()}} title="Layers"><LayersIco className={ico}/></button>
          </div>
        </div>

        {/* tools */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="grid grid-cols-6 gap-[4px]">
            <button className={`${BTN} ${tool==="move"?BTN_ACTIVE:""}`}  onClick={(e)=>{e.stopPropagation(); setTool("move")}}  title="Move"><MoveIco className={ico}/></button>
            <button className={`${BTN} ${tool==="brush"?BTN_ACTIVE:""}`} onClick={(e)=>{e.stopPropagation(); setTool("brush")}} title="Brush"><BrushIco className={ico}/></button>
            <button className={`${BTN} ${tool==="erase"?BTN_ACTIVE:""}`} onClick={(e)=>{e.stopPropagation(); setTool("erase")}} title="Erase"><EraserIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddText()}} title="Text"><TypeIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); pickFile()}} title="Image"><ImageIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); setTool("move");}} title="Shapes"><ShapesIco className={ico}/></button>
          </div>
        </div>

        {/* context settings */}
        <div className="px-3 py-2 border-b border-black/10">
          {tool==="brush" || tool==="erase" ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider">Color</span>
                <input type="color" value={activeColor} onChange={(e)=>setColor(e.target.value)} className="h-6 w-10 border border-black rounded-none" {...STOP}/>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider">Size</span>
                <input type="range" min={1} max={120} step={1} value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))} className="w-28" style={{accentColor:"#000"}} {...STOP}/>
                <span className="text-[10px] tabular-nums w-6 text-right">{brushSize}</span>
              </div>
            </div>
          ) : selectedKind==="text" ? (
            <div className="space-y-2">
              <textarea
                placeholder="Enter text"
                className="w-full h-20 resize-none border border-black rounded-none p-2 text-sm"
                value={textValue}
                onChange={(e)=>{ e.stopPropagation(); setTextValue(e.target.value); props.setSelectedText(e.target.value) }}
                {...STOP}
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider">Font size</span>
                <input type="range" min={8} max={800} step={1}
                  value={Math.round(props.selectedProps?.fontSize ?? (isMobile?112:96))}
                  onChange={(e)=>{ props.setSelectedFontSize(Number(e.target.value)) }}
                  className="flex-1" style={{accentColor:"#000"}} {...STOP}
                />
                <span className="text-[10px] tabular-nums w-10 text-right">{Math.round(props.selectedProps?.fontSize ?? (isMobile?112:96))}</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-black/70">Select an object to edit.</div>
          )}
        </div>

        {/* quick shapes */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="text-[10px] uppercase tracking-wider mb-1">Shapes</div>
          <div className="grid grid-cols-6 gap-[4px]">
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}} title="Square"><SquareIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}} title="Circle"><CircleIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("triangle")}} title="Triangle"><TriangleIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("line")}} title="Line"><SlashIco className={ico}/></button>
            <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("cross")}} title="Cross"><PlusIco className={ico}/></button>
            <div />
          </div>
        </div>

        {/* side + downloads */}
        <div className="px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button className={`h-9 border rounded-none ${side==="front"?"bg-black text-white":"border-black/30 bg-white"}`} onClick={(e)=>{e.stopPropagation(); setSide("front")}}>FRONT</button>
            <button className={`h-9 border rounded-none ${side==="back" ?"bg-black text-white":"border-black/30 bg-white"}`} onClick={(e)=>{e.stopPropagation(); setSide("back") }}>BACK</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="h-9 border rounded-none border-black/30 bg-white flex items-center justify-center gap-2" onClick={(e)=>{e.stopPropagation(); onDownloadFront()}}><DownloadIco className={ico}/>Download</button>
            <button className="h-9 border rounded-none border-black/30 bg-white flex items-center justify-center gap-2" onClick={(e)=>{e.stopPropagation(); onDownloadBack()}}><DownloadIco className={ico}/>Download</button>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} onClick={(e)=>e.stopPropagation()}/>
      </div>
    </div>
  )

  // ——— М О Б И Л К А ———
  const Mobile = (
    <div
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-black/10"
      onPointerDownCapture={(e)=>e.stopPropagation()} onTouchStartCapture={(e)=>e.stopPropagation()}
    >
      {/* row 1 — инструменты и действия */}
      <div className="px-2 py-1 flex items-center gap-1 overflow-x-auto">
        <button className={`${BTN} ${tool==="move"?BTN_ACTIVE:""}`}  onClick={(e)=>{e.stopPropagation(); setTool("move")}}><MoveIco className={ico}/></button>
        <button className={`${BTN} ${tool==="brush"?BTN_ACTIVE:""}`} onClick={(e)=>{e.stopPropagation(); setTool("brush")}}><BrushIco className={ico}/></button>
        <button className={`${BTN} ${tool==="erase"?BTN_ACTIVE:""}`} onClick={(e)=>{e.stopPropagation(); setTool("erase")}}><EraserIco className={ico}/></button>
        <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddText()}}><TypeIco className={ico}/></button>
        <button className={BTN} onClick={(e)=>{e.stopPropagation(); pickFile()}}><ImageIco className={ico}/></button>
        <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("square")}}><SquareIco className={ico}/></button>
        <button className={BTN} onClick={(e)=>{e.stopPropagation(); onAddShape("circle")}}><CircleIco className={ico}/></button>

        <div className="ml-auto flex items-center gap-1">
          <button className={BTN} onClick={(e)=>{e.stopPropagation(); onUndo()}} title="Undo"><UndoIco className={ico}/></button>
          <button className={BTN} onClick={(e)=>{e.stopPropagation(); onRedo()}} title="Redo"><RedoIco className={ico}/></button>
          <button className={BTN} onClick={(e)=>{e.stopPropagation(); onClear()}} title="Clear"><ClearIco className={ico}/></button>
          <button className={`${BTN} ${props.layersOpen?"bg-black text-white":""}`} onClick={(e)=>{e.stopPropagation(); props.toggleLayers()}}><LayersIco className={ico}/></button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange}/>
      </div>

      {/* row 2 — КОНТЕКСТНЫЕ НАСТРОЙКИ (компактные) */}
      <div className="px-2 pb-2 pt-1 border-t border-black/10">
        {tool==="brush" || tool==="erase" ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider">Color</span>
              <input type="color" value={activeColor} onChange={(e)=>setColor(e.target.value)} className="h-7 w-10 border border-black rounded-none" {...STOP}/>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] uppercase tracking-wider">Size</span>
              <input type="range" min={1} max={120} step={1} value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))} className="w-full" style={{accentColor:"#000"}} {...STOP}/>
              <span className="text-[10px] w-8 text-right tabular-nums">{brushSize}</span>
            </div>
          </div>
        ) : selectedKind==="text" ? (
          <div>
            <textarea
              placeholder="Enter text"
              className="w-full h-16 resize-none border border-black rounded-none p-2 text-sm"
              value={textValue}
              onChange={(e)=>{ setTextValue(e.target.value); props.setSelectedText(e.target.value)}}
              {...STOP}
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider">Font</span>
              <input type="range" min={8} max={800} step={1}
                value={Math.round(props.selectedProps?.fontSize ?? 112)}
                onChange={(e)=>{ props.setSelectedFontSize(Number(e.target.value)) }}
                className="flex-1"
                style={{ accentColor:"#000" }}
                {...STOP}
              />
              <span className="text-[10px] tabular-nums w-10 text-right">{Math.round(props.selectedProps?.fontSize ?? 112)}</span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-black/70">Select an object to edit.</div>
        )}
      </div>

      {/* row 3 — фронт/бэк + загрузка */}
      <div className="px-2 py-2 border-t border-black/10">
        <div className="grid grid-cols-2 gap-2">
          <button className={`h-10 border rounded-none ${side==="front"?"bg-black text-white":"border-black/30"}`} onClick={()=>setSide("front")}>FRONT</button>
          <button className={`h-10 border rounded-none ${side==="back" ?"bg-black text-white":"border-black/30"}`} onClick={()=>setSide("back") }>BACK</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="h-10 border rounded-none border-black/30 bg-white flex items-center justify-center gap-2" onClick={onDownloadFront}><DownloadIco className={ico}/>Download</button>
          <button className="h-10 border rounded-none border-black/30 bg-white flex items-center justify-center gap-2" onClick={onDownloadBack}><DownloadIco className={ico}/>Download</button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {Desktop}
      {Mobile}
    </>
  )
}
