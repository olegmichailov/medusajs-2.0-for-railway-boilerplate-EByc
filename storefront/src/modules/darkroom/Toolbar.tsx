"use client"

import React, { useMemo, useRef } from "react"
import { isMobile } from "react-device-detect"
import { ShapeKind, Side, Tool } from "./store"
import type { LayerItem } from "./LayersPanel"

type LayerType = "image" | "shape" | "text" | "strokes" | "erase"

type ToolbarProps = {
  side: Side
  setSide: (s: Side)=>void

  tool: Tool
  setTool: (t: Tool)=>void

  brushColor: string
  setBrushColor: (v:string)=>void

  brushSize: number
  setBrushSize: (n:number)=>void

  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind)=>void

  onUploadImage(file: File): void
  onAddText(): void
  onAddShape(kind: ShapeKind): void
  onDownloadFront(): void
  onDownloadBack(): void
  onClear(): void

  toggleLayers(): void
  layersOpen: boolean

  // selection
  selectedKind: LayerType | null
  selectedProps: any
  setSelectedFill: (hex:string)=>void
  setSelectedStroke: (hex:string)=>void
  setSelectedStrokeW: (w:number)=>void
  setSelectedText: (t:string)=>void
  setSelectedFontSize: (n:number)=>void
  setSelectedFontFamily: (name:string)=>void
  setSelectedColor: (hex:string)=>void
  setSelectedAlign: (a:"left"|"center"|"right")=>void
  setSelectedLineHeight: (n:number)=>void
  setSelectedLetter: (n:number)=>void

  // mobile
  mobileTopOffset: number
  mobileLayers: {
    items: LayerItem[]
    selectedId?: string
    onSelect: (id:string)=>void
    onToggleVisible: (id:string)=>void
    onToggleLock: (id:string)=>void
    onDelete: (id:string)=>void
    onDuplicate: (id:string)=>void
    onChangeBlend: (id:string, b:string)=>void
    onChangeOpacity: (id:string, o:number)=>void
    onMoveUp: (id:string)=>void
    onMoveDown: (id:string)=>void
  }
}

const COLORS = [
  "#000000","#ffffff","#ff008e","#ff3b3b","#ff9900","#ffdd00",
  "#19bf00","#00c6ff","#0066ff","#8a2be2","#ff77ff","#7a7a7a",
  "#00ff9a","#ffaaff","#ffccaa","#c0ff00","#00ffaa","#55ddff",
]

export default function Toolbar(props: ToolbarProps){
  if (isMobile) return <MobileToolbar {...props} />
  return <DesktopTools {...props} />
}

// ================= DESKTOP =================

function DesktopTools(p: ToolbarProps){
  const fileRef = useRef<HTMLInputElement>(null)

  const pickColor = (hex:string) => {
    p.setBrushColor(hex)
    p.setSelectedColor(hex)
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
             onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f); (e.currentTarget as HTMLInputElement).value="" }} />

      <div className="fixed left-4 top-[88px] z-40 w-[220px] select-none">
        <div className="border border-black bg-white shadow-md">
          <div className="px-3 py-2 text-[10px] tracking-widest uppercase text-[#333]">Tools</div>

          {/* row of icons */}
          <div className="px-2 grid grid-cols-7 gap-1">
            <IconBtn active={p.tool==="move"} label="Move" onClick={()=>p.setTool("move")} icon="↔" />
            <IconBtn active={p.tool==="brush"} label="Brush" onClick={()=>p.setTool("brush")} icon="✎" />
            <IconBtn active={p.tool==="erase"} label="Erase" onClick={()=>p.setTool("erase")} icon="⌫" />
            <IconBtn label="Text" onClick={()=>{ p.setTool("text"); p.onAddText() }} icon="T" />
            <IconBtn label="Image" onClick={()=>{ p.setTool("image"); fileRef.current?.click() }} icon="🖼" />
            <IconBtn active={p.layersOpen} label="Layers" onClick={p.toggleLayers} icon="≡" />
            <IconBtn label="Clear" onClick={p.onClear} icon="✖" />
          </div>

          {/* Color + size */}
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2">
              <input type="color" value={p.brushColor} onChange={(e)=>pickColor(e.target.value)} className="w-8 h-8 border border-black" />
              <div className="flex-1">
                <Slider min={1} max={200} step={1} value={p.brushSize} onChange={n=>p.setBrushSize(n)} />
              </div>
              <span className="text-[10px] w-8 text-right">{p.brushSize|0}</span>
            </div>
          </div>

          {/* palette */}
          <div className="px-3 py-2 grid grid-cols-9 gap-1">
            {COLORS.map(c=>(
              <button key={c} title={c} className="h-4 w-4 border" style={{ background:c }} onClick={()=>pickColor(c)} />
            ))}
          </div>

          {/* Shapes */}
          <div className="px-3 pt-1 pb-2">
            <div className="text-[10px] mb-1">Shapes</div>
            <div className="grid grid-cols-5 gap-1">
              <Btn onClick={()=>p.onAddShape("square")}>□</Btn>
              <Btn onClick={()=>p.onAddShape("circle")}>○</Btn>
              <Btn onClick={()=>p.onAddShape("triangle")}>△</Btn>
              <Btn onClick={()=>p.onAddShape("cross")}>✚</Btn>
              <Btn onClick={()=>p.onAddShape("line")}>／</Btn>
            </div>
          </div>

          {/* Text controls */}
          <div className="px-3 pb-3">
            <div className="text-[10px] mb-1">Text</div>
            <div className="flex gap-1 mb-2">
              <Btn onClick={()=>p.setSelectedAlign("left")}>≡</Btn>
              <Btn onClick={()=>p.setSelectedAlign("center")}>≣</Btn>
              <Btn onClick={()=>p.setSelectedAlign("right")}>≡›</Btn>
            </div>
            <Row label="Font size">
              <Slider min={8} max={800} step={1}
                value={typeof p.selectedProps?.fontSize==="number"?p.selectedProps.fontSize:96}
                onChange={n=>p.setSelectedFontSize(n)} />
              <Val v={p.selectedProps?.fontSize ?? 96}/>
            </Row>
            <Row label="Line">
              <Slider min={0.5} max={4} step={0.01}
                value={typeof p.selectedProps?.lineHeight==="number"?p.selectedProps.lineHeight:1}
                onChange={n=>p.setSelectedLineHeight(n)} />
              <Val v={p.selectedProps?.lineHeight ?? 1}/>
            </Row>
            <Row label="Letter">
              <Slider min={-10} max={100} step={0.5}
                value={typeof p.selectedProps?.letterSpacing==="number"?p.selectedProps.letterSpacing:0}
                onChange={n=>p.setSelectedLetter(n)} />
              <Val v={p.selectedProps?.letterSpacing ?? 0}/>
            </Row>
          </div>
        </div>
      </div>
    </>
  )
}

// ================= MOBILE (3 строки) =================

function MobileToolbar(p: ToolbarProps){
  const fileRef = useRef<HTMLInputElement>(null)

  const pickColor = (hex:string) => {
    p.setBrushColor(hex)
    p.setSelectedColor(hex)
  }

  const icoBtn = (label:string, onClick:()=>void, active?:boolean) => (
    <button className={`h-12 w-12 grid place-items-center border border-black ${active?"bg-black text-white":"bg-white"}`} onClick={onClick}>{label}</button>
  )

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
             onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f); (e.currentTarget as HTMLInputElement).value="" }} />

      {/* 1: TOOLS + Layers + Clear */}
      <div className="fixed inset-x-0 z-50 bg-white/90 backdrop-blur border-t border-black/10" style={{ bottom: 48*2 }}>
        <div className="px-2 py-1 flex items-center gap-1">
          {icoBtn("↔", ()=>p.setTool("move"), p.tool==="move")}
          {icoBtn("✎", ()=>p.setTool("brush"), p.tool==="brush")}
          {icoBtn("⌫", ()=>p.setTool("erase"), p.tool==="erase")}
          {icoBtn("T", ()=>{ p.setTool("text"); p.onAddText() }, p.tool==="text")}
          {icoBtn("🖼", ()=>{ p.setTool("image"); fileRef.current?.click() }, p.tool==="image")}
          {icoBtn("△", ()=>p.setTool("shape"), p.tool==="shape")}
          <button className={`h-12 px-3 border border-black ml-2 ${p.layersOpen?"bg-black text-white":"bg-white"}`} onClick={p.toggleLayers}>Layers</button>
          <div className="ml-auto flex gap-1">
            <button className="h-12 w-12 grid place-items-center border border-black bg-white" onClick={p.onClear}>✖</button>
          </div>
        </div>
      </div>

      {/* 2: CONTEXT */}
      <div className="fixed inset-x-0 z-50 bg-white/90 backdrop-blur border-t border-black/10" style={{ bottom: 48 }}>
        {/* Brush / Erase — одинаковый слайдер размера + color */}
        {(p.tool==="brush" || p.tool==="erase" || p.tool==="move") && (
          <div className="px-2 py-1 flex items-center gap-2">
            <input type="color" value={p.brushColor} onChange={(e)=>pickColor(e.target.value)} className="w-8 h-8 border border-black" />
            <div className="relative flex-1">
              <Slider min={1} max={200} step={1} value={p.brushSize} onChange={n=>p.setBrushSize(n)} />
            </div>
            <span className="text-xs w-10 text-right">{p.brushSize|0}</span>
          </div>
        )}

        {p.tool==="text" && (
          <div className="px-2 py-2 space-y-2">
            <div className="flex gap-1">
              <Btn onClick={()=>p.setSelectedAlign("left")}>≡</Btn>
              <Btn onClick={()=>p.setSelectedAlign("center")}>≣</Btn>
              <Btn onClick={()=>p.setSelectedAlign("right")}>≡›</Btn>
            </div>
            <Row label="Font">
              <Slider min={8} max={800} step={1} value={typeof p.selectedProps?.fontSize==="number"?p.selectedProps.fontSize:96} onChange={n=>p.setSelectedFontSize(n)} />
              <Val v={p.selectedProps?.fontSize ?? 96}/>
            </Row>
            <Row label="Line">
              <Slider min={0.5} max={4} step={0.01} value={typeof p.selectedProps?.lineHeight==="number"?p.selectedProps.lineHeight:1} onChange={n=>p.setSelectedLineHeight(n)} />
              <Val v={p.selectedProps?.lineHeight ?? 1}/>
            </Row>
            <Row label="Letter">
              <Slider min={-10} max={100} step={0.5} value={typeof p.selectedProps?.letterSpacing==="number"?p.selectedProps.letterSpacing:0} onChange={n=>p.setSelectedLetter(n)} />
              <Val v={p.selectedProps?.letterSpacing ?? 0}/>
            </Row>
          </div>
        )}

        {(p.tool==="image" || p.tool==="shape") && (
          <div className="px-2 py-1 flex items-center gap-1">
            <Btn onClick={()=>p.onAddShape("square")}>□</Btn>
            <Btn onClick={()=>p.onAddShape("circle")}>○</Btn>
            <Btn onClick={()=>p.onAddShape("triangle")}>△</Btn>
            <Btn onClick={()=>p.onAddShape("cross")}>✚</Btn>
            <Btn onClick={()=>p.onAddShape("line")}>／</Btn>
          </div>
        )}
      </div>

      {/* 3: FRONT/BACK + downloads */}
      <div className="fixed inset-x-0 z-50 bg-white/90 backdrop-blur border-t border-black/10" style={{ bottom: 0 }}>
        <div className="px-2 pb-2 pt-1 grid grid-cols-2 gap-2">
          <div className="flex gap-2">
            <button className={`flex-1 h-10 border border-black ${p.side==="front"?"bg-black text-white":"bg-white"}`} onClick={()=>p.setSide("front")}>FRONT</button>
            <button className="h-10 w-12 border border-black bg-white" onClick={p.onDownloadFront}>⇩</button>
          </div>
          <div className="flex gap-2">
            <button className={`flex-1 h-10 border border-black ${p.side==="back"?"bg-black text-white":"bg-white"}`} onClick={()=>p.setSide("back")}>BACK</button>
            <button className="h-10 w-12 border border-black bg-white" onClick={p.onDownloadBack}>⇩</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ========== UI bits ==========

function IconBtn({active, onClick, label}:{active?:boolean; onClick:()=>void; label:string}){
  return <button className={`h-10 grid place-items-center border border-black ${active?"bg-black text-white":"bg-white"}`} onClick={onClick}>{label}</button>
}

function Btn({children, onClick}:{children:React.ReactNode; onClick:()=>void}){
  return <button className="h-9 w-9 grid place-items-center border border-black bg-white" onClick={onClick}>{children}</button>
}

function Row({label, children}:{label:string; children:React.ReactNode}){
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="text-[10px] w-14">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Val({v}:{v:number}){
  return <span className="text-[10px] w-10 text-right inline-block">{typeof v==="number"?Number(v).toFixed(0):""}</span>
}

function Slider({min,max,step,value,onChange}:{min:number;max:number;step:number;value:number;onChange:(v:number)=>void}){
  return (
    <input type="range" min={min} max={max} step={step} value={value}
           onChange={(e)=>onChange(parseFloat(e.currentTarget.value))}
           className="w-full" />
  )
}
