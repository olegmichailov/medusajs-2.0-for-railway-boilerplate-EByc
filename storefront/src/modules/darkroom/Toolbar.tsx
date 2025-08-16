// storefront/src/modules/darkroom/Toolbar.tsx
"use client"

import React, { useMemo, useRef } from "react"
import { Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

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
  mobileLayers?: MobileLayersProps
}

// ——— icons (монохромные, как в скрине) ———
const Ico = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
       stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}/>
)
const IcoUpload  = () => <Ico><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v4h16v-4"/></Ico>
const IcoLayers  = () => <Ico><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></Ico>
const IcoMove    = () => <Ico><path d="M12 2v20M2 12h20"/><path d="M8 6l4-4 4 4M6 8L2 12l4 4M18 8l4 4-4 4M8 18l4 4 4-4"/></Ico>
const IcoBrush   = () => <Ico><path d="M20.5 3.5L10 14"/><path d="M9 15c-1 3-3 4-6 4 3 .5 5 .5 7-2"/></Ico>
const IcoEraser  = () => <Ico><path d="M16 3l5 5-9 9H7L2 12l9-9z"/><path d="M6 17h12"/></Ico>
const IcoText    = () => <Ico><path d="M4 6h16"/><path d="M12 6v12"/><path d="M6 18h12"/></Ico>
const IcoSq      = () => <Ico><rect x="5" y="5" width="14" height="14"/></Ico>
const IcoCir     = () => <Ico><circle cx="12" cy="12" r="7"/></Ico>
const IcoTri     = () => <Ico><polygon points="12 5 19 19 5 19 12 5"/></Ico>
const IcoLine    = () => <Ico><line x1="5" y1="19" x2="19" y2="5"/></Ico>
const IcoCross   = () => <Ico><line x1="5" y1="12" x2="19" y2="12"/><line x1="12" y1="5" x2="12" y2="19"/></Ico>
const IcoDownload= () => <Ico><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></Ico>

const PALETTE = [
  "#000000","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF3B30","#FF9500","#FFCC00","#34C759","#5AC8FA",
  "#007AFF","#5856D6","#AF52DE","#FF2D55","#00C7BE",
  "#F44336","#E91E63","#9C27B0","#673AB7","#3F51B5",
  "#2196F3","#03A9F4","#00BCD4","#009688","#4CAF50",
  "#8BC34A","#CDDC39","#FFEB3B","#FFC107","#FF9800",
  "#FF5722","#795548","#9E9E9E","#607D8B","#1B1B1B",
]

const stopAll = (e: any) => { e.stopPropagation?.() }

export default function Toolbar(props: Props) {
  const {
    side, setSide, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedText, setSelectedFontSize, setSelectedColor,
  } = props

  const fileRef = useRef<HTMLInputElement>(null)
  const pickFile = () => fileRef.current?.click()
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0]; if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  const activeColor = useMemo(() => {
    if (selectedKind === "text" && selectedProps?.fill) return selectedProps.fill as string
    if ((selectedKind === "shape" || selectedKind === "image") && selectedProps?.fill) return selectedProps.fill as string
    return brushColor
  }, [selectedKind, selectedProps, brushColor])

  const setColor = (hex: string) => {
    if (selectedKind) setSelectedColor(hex)
    else setBrushColor(hex)
  }

  // ————— DESKTOP —————
  const Desktop = (
    <div
      className="hidden md:block fixed left-5 top-28 z-30 select-none"
      onPointerDownCapture={stopAll}
      style={{ width: 220 }}
    >
      <div className="bg-white border border-black/20 rounded-md shadow-sm">
        {/* header */}
        <div className="px-3 py-2 border-b border-black/10 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.18em] font-semibold">TOOLS</span>
          <div className="flex items-center gap-1">
            <button
              className="h-7 w-7 grid place-items-center border border-black/20 rounded"
              onClick={(e)=>{stopAll(e); pickFile()}}
              title="Upload image"
            ><IcoUpload/></button>
            <button
              className={`h-7 w-7 grid place-items-center border rounded ${layersOpen ? "border-black" : "border-black/20"}`}
              onClick={(e)=>{stopAll(e); toggleLayers()}}
              title="Layers"
            ><IcoLayers/></button>
          </div>
        </div>

        {/* tools row */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="grid grid-cols-6 gap-1">
            <ToolBtn label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}><IcoMove/></ToolBtn>
            <ToolBtn label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")}><IcoBrush/></ToolBtn>
            <ToolBtn label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")}><IcoEraser/></ToolBtn>
            <ToolBtn label="Text"   onClick={onAddText}><IcoText/></ToolBtn>
            <ToolBtn label="Square" onClick={()=>onAddShape("square")}><IcoSq/></ToolBtn>
            <ToolBtn label="Circle" onClick={()=>onAddShape("circle")}><IcoCir/></ToolBtn>
          </div>
        </div>

        {/* color + size */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider">Color</span>
            <input
              type="color"
              value={activeColor}
              onChange={(e)=>setColor(e.target.value)}
              className="h-5 w-8 border border-black/20 rounded"
              onPointerDownCapture={stopAll}
            />
            <div className="flex-1"/>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider">Size</span>
              <input
                type="range" min={1} max={120} step={1}
                value={brushSize}
                onChange={(e)=>setBrushSize(Number(e.target.value))}
                className="w-24"
                onPointerDownCapture={stopAll}
              />
              <span className="text-[10px] tabular-nums w-6 text-right">{brushSize}</span>
            </div>
          </div>

          {/* flat palette */}
          <div className="mt-2 grid grid-cols-10 gap-[6px]">
            {PALETTE.map((hex)=>(
              <button
                key={hex}
                className="h-4 rounded-sm border border-black/10"
                style={{ background: hex }}
                onClick={(e)=>{ stopAll(e); setColor(hex) }}
                title={hex}
              />
            ))}
          </div>
        </div>

        {/* shapes row */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="text-[10px] uppercase tracking-wider mb-1">Shapes</div>
          <div className="grid grid-cols-6 gap-1">
            <ShapeBtn onClick={()=>onAddShape("square")}><IcoSq/></ShapeBtn>
            <ShapeBtn onClick={()=>onAddShape("circle")}><IcoCir/></ShapeBtn>
            <ShapeBtn onClick={()=>onAddShape("triangle")}><IcoTri/></ShapeBtn>
            <ShapeBtn onClick={()=>onAddShape("line")}><IcoLine/></ShapeBtn>
            <ShapeBtn onClick={()=>onAddShape("cross")}><IcoCross/></ShapeBtn>
            <ShapeBtn onClick={()=>onAddShape("line2")}><IcoLine/></ShapeBtn>
          </div>
        </div>

        {/* text */}
        <div className="px-3 py-2 border-b border-black/10">
          <div className="text-[10px] uppercase tracking-wider mb-1">Text</div>
          <textarea
            placeholder="Enter text"
            className="w-full h-20 resize-none border border-black/20 rounded p-2 text-sm"
            value={selectedKind==="text" ? (selectedProps?.text ?? "") : ""}
            onChange={(e)=>{ if (selectedKind==="text") setSelectedText(e.target.value) }}
            onPointerDownCapture={stopAll}
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider">Font size</span>
            <input
              type="range" min={8} max={800} step={1}
              value={selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
              onChange={(e)=>{ if (selectedKind==="text") setSelectedFontSize(Number(e.target.value)) }}
              className="flex-1"
              onPointerDownCapture={stopAll}
            />
            <span className="text-[10px] tabular-nums w-8 text-right">
              {selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
            </span>
          </div>
        </div>

        {/* side + downloads */}
        <div className="px-3 py-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button className={`h-9 border rounded ${side==="front"?"bg-black text-white":"border-black/30"}`} onClick={(e)=>{stopAll(e); setSide("front")}}>FRONT</button>
            <button className={`h-9 border rounded ${side==="back" ?"bg-black text-white":"border-black/30"}`} onClick={(e)=>{stopAll(e); setSide("back") }}>BACK</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="h-9 border rounded border-black/30 flex items-center justify-center gap-1" onClick={(e)=>{stopAll(e); onDownloadFront()}}>
              <IcoDownload/> Download
            </button>
            <button className="h-9 border rounded border-black/30 flex items-center justify-center gap-1" onClick={(e)=>{stopAll(e); onDownloadBack()}}>
              <IcoDownload/> Download
            </button>
          </div>
        </div>
      </div>

      {/* hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} onClick={stopAll}/>
    </div>
  )

  // ————— MOBILE (3 ряда: Tools → Settings → Front/Back + Downloads) —————
  const Mobile = (
    <div
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 bg-white border-t border-black/10"
      onPointerDownCapture={stopAll}
    >
      {/* row 1 — TOOLS */}
      <div className="px-3 py-2 border-b border-black/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.18em] font-semibold">TOOLS</span>
          <div className="flex gap-1">
            <button className="h-8 w-8 grid place-items-center border border-black/20 rounded" onClick={(e)=>{stopAll(e); pickFile()}}><IcoUpload/></button>
            <button className={`h-8 w-8 grid place-items-center border rounded ${props.layersOpen?"border-black":"border-black/20"}`} onClick={(e)=>{stopAll(e); toggleLayers()}}><IcoLayers/></button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          <ToolBtn small label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}><IcoMove/></ToolBtn>
          <ToolBtn small label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")}><IcoBrush/></ToolBtn>
          <ToolBtn small label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")}><IcoEraser/></ToolBtn>
          <ToolBtn small label="Text"   onClick={onAddText}><IcoText/></ToolBtn>
          <ToolBtn small label="Square" onClick={()=>onAddShape("square")}><IcoSq/></ToolBtn>
          <ToolBtn small label="Circle" onClick={()=>onAddShape("circle")}><IcoCir/></ToolBtn>
        </div>
      </div>

      {/* row 2 — SETTINGS */}
      <div className="px-3 py-2 border-b border-black/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider">Color</span>
            <input type="color" value={activeColor} onChange={(e)=>setColor(e.target.value)} className="h-7 w-10 border border-black/20 rounded"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider">Size</span>
            <input type="range" min={1} max={120} step={1} value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))} className="w-28"/>
            <span className="text-[10px] tabular-nums w-6 text-right">{brushSize}</span>
          </div>
        </div>

        {/* flat palette */}
        <div className="mt-2 grid grid-cols-12 gap-1">
          {PALETTE.map((hex)=>(
            <button key={hex} className="h-4 rounded-sm border border-black/10" style={{ background: hex }} onClick={(e)=>{stopAll(e); setColor(hex)}}/>
          ))}
        </div>

        {/* shapes quick row */}
        <div className="mt-2 grid grid-cols-6 gap-1">
          <ShapeBtn small onClick={()=>onAddShape("square")}><IcoSq/></ShapeBtn>
          <ShapeBtn small onClick={()=>onAddShape("circle")}><IcoCir/></ShapeBtn>
          <ShapeBtn small onClick={()=>onAddShape("triangle")}><IcoTri/></ShapeBtn>
          <ShapeBtn small onClick={()=>onAddShape("line")}><IcoLine/></ShapeBtn>
          <ShapeBtn small onClick={()=>onAddShape("cross")}><IcoCross/></ShapeBtn>
          <ShapeBtn small onClick={()=>onAddShape("line2")}><IcoLine/></ShapeBtn>
        </div>

        {/* text controls (если выбран Text) */}
        <div className="mt-2">
          <textarea
            placeholder="Enter text"
            className="w-full h-16 resize-none border border-black/20 rounded p-2 text-sm"
            value={selectedKind==="text" ? (selectedProps?.text ?? "") : ""}
            onChange={(e)=>{ if (selectedKind==="text") setSelectedText(e.target.value)}}
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider">Font</span>
            <input type="range" min={8} max={800} step={1}
              value={selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
              onChange={(e)=>{ if (selectedKind==="text") setSelectedFontSize(Number(e.target.value)) }}
              className="flex-1"
            />
            <span className="text-[10px] tabular-nums w-10 text-right">
              {selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
            </span>
          </div>
        </div>
      </div>

      {/* row 3 — FRONT/BACK & DOWNLOADS */}
      <div className="px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <button className={`h-10 border rounded ${side==="front"?"bg-black text-white":"border-black/30"}`} onClick={()=>setSide("front")}>FRONT</button>
          <button className={`h-10 border rounded ${side==="back" ?"bg-black text-white":"border-black/30"}`} onClick={()=>setSide("back") }>BACK</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="h-10 border rounded border-black/30 flex items-center justify-center gap-1" onClick={onDownloadFront}>
            <IcoDownload/> Download
          </button>
          <button className="h-10 border rounded border-black/30 flex items-center justify-center gap-1" onClick={onDownloadBack}>
            <IcoDownload/> Download
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange}/>
    </div>
  )

  return (<>{Desktop}{Mobile}</>)
}

// ——— UI helpers ———
function ToolBtn(props: {label?:string; active?:boolean; onClick:()=>void; children:React.ReactNode; small?:boolean}) {
  const { active, onClick, children, small } = props
  const sz = small ? "h-8" : "h-9"
  return (
    <button
      className={`${sz} border rounded grid place-items-center ${active?"bg-black text-white border-black":"border-black/30 text-black"}`}
      onClick={(e)=>{ e.stopPropagation(); onClick() }}
      title={props.label}
    >
      {children}
    </button>
  )
}
function ShapeBtn(props:{onClick:()=>void; children:React.ReactNode; small?:boolean}) {
  const sz = props.small ? "h-8" : "h-9"
  return (
    <button
      className={`${sz} border rounded border-black/30 grid place-items-center`}
      onClick={(e)=>{ e.stopPropagation(); props.onClick() }}
    >
      {props.children}
    </button>
  )
}
