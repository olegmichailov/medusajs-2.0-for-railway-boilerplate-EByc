"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { isMobile } from "react-device-detect"
import { Blend, ShapeKind, Side, Tool } from "./store"

type LayerItem = {
  id: string
  name: string
  type: "image"|"shape"|"text"|"strokes"|"erase"
  visible: boolean
  locked: boolean
  blend: Blend
  opacity: number
}

type MobileLayers = {
  items: LayerItem[]
  selectedId?: string
  onSelect: (id: string)=>void
  onToggleVisible: (id: string)=>void
  onToggleLock: (id: string)=>void
  onDelete: (id: string)=>void
  onDuplicate: (id: string)=>void
  onChangeBlend: (id: string, b: string)=>void
  onChangeOpacity: (id: string, o: number)=>void
  onMoveUp: (id: string)=>void
  onMoveDown: (id: string)=>void
} | undefined

type Props = {
  variant: "desktop" | "mobile"

  side: Side
  setSide: (s: Side)=>void

  tool: Tool
  setTool: (t: Tool)=>void

  brushColor: string
  setBrushColor: (c: string)=>void

  brushSize: number
  setBrushSize: (n: number)=>void

  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind)=>void

  onUploadImage: (f: File)=>void
  onAddText: ()=>void
  onAddShape: (k: ShapeKind)=>void

  onDownloadFront: ()=>void
  onDownloadBack: ()=>void
  onClear: ()=>void

  toggleLayers: ()=>void
  layersOpen: boolean

  selectedKind: null | LayerItem["type"]
  selectedProps: any

  setSelectedFill: (hex: string)=>void
  setSelectedStroke: (hex: string)=>void
  setSelectedStrokeW: (w: number)=>void
  setSelectedText: (t: string)=>void
  setSelectedFontSize: (n: number)=>void
  setSelectedFontFamily: (name: string)=>void
  setSelectedColor: (hex: string)=>void
  setSelectedAlign: (a: "left"|"center"|"right")=>void
  setSelectedLineHeight: (n: number)=>void
  setSelectedLetterSpacing: (n: number)=>void

  onMobileHeight: (h:number)=>void
  mobileLayers: MobileLayers
}

const rowCls = "flex items-center gap-2"
const btn = "border border-black px-3 h-9 flex items-center justify-center text-xs uppercase tracking-wide"
const mini = "border border-black w-9 h-9 flex items-center justify-center"

export default function Toolbar(p: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // измеряем высоту мобильной панели, чтобы канва не перекрывалась
  useEffect(() => {
    if (p.variant !== "mobile") return
    const measure = () => p.onMobileHeight(ref.current?.getBoundingClientRect().height || 180)
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); ro.disconnect() }
  }, [p.variant])

  const settings = useMemo(() => {
    const t = p.tool
    const kind = p.selectedKind
    const isText = kind === "text"
    const showColor = t === "brush" || t === "erase" || t === "shape" || isText
    const showSize  = t === "brush" || t === "erase"
    return { isText, showColor, showSize }
  }, [p.tool, p.selectedKind])

  const ColorPicker = (
    <div className="flex items-center gap-2">
      <span className="text-xs">Color</span>
      <input type="color" value={p.brushColor} onChange={(e)=>{p.setBrushColor(e.target.value); p.setSelectedColor(e.target.value)}} />
      <input type="range" min={2} max={64} step={1} value={p.brushSize} onChange={(e)=>p.setBrushSize(parseInt(e.target.value))} className="w-44" />
      <span className="text-xs w-6 text-right">{p.brushSize}</span>
    </div>
  )

  const TextSettings = settings.isText && (
    <div className="flex items-center gap-2">
      <button className={mini} aria-label="Align left"   onClick={()=>p.setSelectedAlign("left")}>⟸</button>
      <button className={mini} aria-label="Align center" onClick={()=>p.setSelectedAlign("center")}>≡</button>
      <button className={mini} aria-label="Align right"  onClick={()=>p.setSelectedAlign("right")}>⟹</button>

      <span className="text-xs ml-2">Font</span>
      <input
        type="number"
        className="border border-black w-16 h-9 px-1"
        value={p.selectedProps?.fontSize ?? ""}
        onChange={(e)=>p.setSelectedFontSize(parseInt(e.target.value || "0"))}
      />

      <span className="text-xs ml-2">Line</span>
      <input type="range" min={0.5} max={4} step={0.05}
             value={p.selectedProps?.lineHeight ?? 1}
             onChange={(e)=>p.setSelectedLineHeight(parseFloat(e.target.value))}
             className="w-28" />

      <span className="text-xs ml-2">Letter</span>
      <input type="range" min={-5} max={20} step={0.1}
             value={p.selectedProps?.letterSpacing ?? 0}
             onChange={(e)=>p.setSelectedLetterSpacing(parseFloat(e.target.value))}
             className="w-28" />
    </div>
  )

  const ShapesRow = (
    <div className="flex items-center gap-2">
      <span className="text-xs">Shapes</span>
      <button className={mini} onClick={()=>p.onAddShape("circle")}>○</button>
      <button className={mini} onClick={()=>p.onAddShape("square")}>▢</button>
      <button className={mini} onClick={()=>p.onAddShape("triangle")}>△</button>
      <button className={mini} onClick={()=>p.onAddShape("cross")}>✚</button>
      <button className={mini} onClick={()=>p.onAddShape("line")}>━</button>
    </div>
  )

  const Row1 = (
    <div className={rowCls}>
      <button className={`${mini} ${p.tool==="move"?"bg-black text-white":""}`} onClick={()=>p.setTool("move")}>↔︎</button>
      <button className={`${mini} ${p.tool==="brush"?"bg-black text-white":""}`} onClick={()=>p.setTool("brush")}>✎</button>
      <button className={`${mini} ${p.tool==="erase"?"bg-black text-white":""}`} onClick={()=>p.setTool("erase")}>⌫</button>
      <button className={mini} onClick={p.onAddText}>T</button>

      <label className={mini} title="Upload image" style={{ cursor: "pointer" }}>
        ⬆︎
        <input type="file" accept="image/*" style={{ display:"none" }}
               onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f); e.currentTarget.value = "" }} />
      </label>

      <button className={mini} onClick={p.toggleLayers}>{p.layersOpen ? "▦" : "▥"}</button>
    </div>
  )

  const Row2 = (
    <div className={`${rowCls} flex-wrap`}>
      {settings.showColor && ColorPicker}
      {p.tool==="shape" && ShapesRow}
      {settings.isText && TextSettings}
    </div>
  )

  const Row3 = (
    <div className={`${rowCls} justify-between`}>
      <div className="flex gap-2">
        <button className={`${btn} ${p.side==="front"?"bg-black text-white":""}`} onClick={()=>p.setSide("front")}>Front</button>
        <button className={`${btn} ${p.side==="back" ?"bg-black text-white":""}`} onClick={()=>p.setSide("back")}>Back</button>
      </div>
      <div className="flex gap-2">
        <button className={btn} onClick={p.onDownloadFront}>Download Front</button>
        <button className={btn} onClick={p.onDownloadBack}>Download Back</button>
        <button className={btn} onClick={p.onClear}>Clear</button>
      </div>
    </div>
  )

  if (p.variant === "desktop") {
    // левая колонка, три строки, ничего не перекрывает канву
    return (
      <div className="h-full flex flex-col gap-3" aria-label="Tools">
        <div className="border border-black p-2 rounded-sm">{Row1}</div>
        <div className="border border-black p-2 rounded-sm">{Row2}</div>
        <div className="border border-black p-2 rounded-sm mt-auto">{Row3}</div>
      </div>
    )
  }

  // MOBILE: 3 строки снизу, с измерением высоты
  return (
    <div ref={ref} className="fixed left-0 right-0 bottom-0 bg-white border-t border-black p-2 flex flex-col gap-2" aria-label="Tools">
      {Row1}
      {Row2}
      <div className={`${rowCls} justify-between`}>
        <div className="flex gap-2">
          <button className={`${btn} ${p.side==="front"?"bg-black text-white":""}`} onClick={()=>p.setSide("front")}>Front</button>
          <button className={`${btn} ${p.side==="back" ?"bg-black text-white":""}`} onClick={()=>p.setSide("back")}>Back</button>
        </div>
        <div className="flex gap-2">
          <button className={btn} onClick={p.onDownloadFront}>⬇︎F</button>
          <button className={btn} onClick={p.onDownloadBack}>⬇︎B</button>
        </div>
      </div>
    </div>
  )
}
