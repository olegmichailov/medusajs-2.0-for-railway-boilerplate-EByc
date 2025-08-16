"use client"

import React, { useMemo, useRef } from "react"
import { Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"
import "./ui-lock.css"

type LayerItem = {
  id: string; name: string; type: "image" | "shape" | "text" | "strokes";
  visible: boolean; locked: boolean; blend: Blend; opacity: number;
}
type MobileLayersProps = {
  items: LayerItem[]; onSelect:(id:string)=>void; onToggleVisible:(id:string)=>void;
  onToggleLock:(id:string)=>void; onDelete:(id:string)=>void; onDuplicate:(id:string)=>void;
  onChangeBlend:(id:string,b:Blend)=>void; onChangeOpacity:(id:string,v:number)=>void;
  onMoveUp:(id:string)=>void; onMoveDown:(id:string)=>void;
}
type Props = {
  side: Side; setSide:(s:Side)=>void; tool:Tool; setTool:(t:Tool)=>void;
  brushColor:string; setBrushColor:(hex:string)=>void; brushSize:number; setBrushSize:(n:number)=>void;
  shapeKind: ShapeKind | null; setShapeKind:(s:ShapeKind|null)=>void;
  onUploadImage:(f:File)=>void; onAddText:()=>void; onAddShape:(k:ShapeKind)=>void;
  onDownloadFront:()=>void; onDownloadBack:()=>void;
  toggleLayers:()=>void; layersOpen:boolean;
  selectedKind:"image"|"shape"|"text"|"strokes"|null; selectedProps:any;
  setSelectedFill:(hex:string)=>void; setSelectedStroke:(hex:string)=>void; setSelectedStrokeW:(n:number)=>void;
  setSelectedText:(t:string)=>void; setSelectedFontSize:(n:number)=>void; setSelectedFontFamily:(s:string)=>void; setSelectedColor:(hex:string)=>void;
  mobileLayers?: MobileLayersProps
}

// Плоская палитра
const PALETTE = [
  "#000000","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF3B30","#FF9500","#FFCC00","#34C759","#5AC8FA",
  "#007AFF","#5856D6","#AF52DE","#FF2D55","#00C7BE",
  "#F44336","#E91E63","#9C27B0","#673AB7","#3F51B5",
  "#2196F3","#03A9F4","#00BCD4","#009688","#4CAF50",
  "#8BC34A","#CDDC39","#FFEB3B","#FFC107","#FF9800",
  "#FF5722","#795548","#9E9E9E","#607D8B","#1B1B1B",
]

const stopAll = (e:any)=>{ e.stopPropagation?.(); e.preventDefault?.() }

// Мини-иконки (SVG), как на твоём эталонном скрине: строго ч/б без эмодзи
const Ico = {
  Plus: () => (<span className="drk-ico drk-ico--fill"><svg viewBox="0 0 16 16"><rect x="7" y="3" width="2" height="10"/><rect x="3" y="7" width="10" height="2"/></svg></span>),
  Layers: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M2 6l6-3 6 3-6 3-6-3Z"/><path d="M2 10l6 3 6-3"/></svg></span>),
  Move: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M8 1v14M1 8h14"/><path d="M8 1l2 2M8 1 6 3M8 15l2-2M8 15 6 13M1 8l2 2M1 8l2-2M15 8l-2 2M15 8l-2-2"/></svg></span>),
  Brush: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3-6.5 6.5H4v-3L10.5 2.5Z"/><path d="M4 12c0 2-1.5 2-3 2"/></svg></span>),
  Erase: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M6 12l-4-4 5-5h3l4 4-6 5Z"/><path d="M9 12h6"/></svg></span>),
  Text: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M2 3h12M8 3v10"/></svg></span>),
  Square: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10"/></svg></span>),
  Circle: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5"/></svg></span>),
  Triangle: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M8 3l5 10H3L8 3Z"/></svg></span>),
  Line: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M3 13L13 3"/></svg></span>),
  Cross: () => (<span className="drk-ico"><svg viewBox="0 0 16 16"><path d="M3 8h10M8 3v10"/></svg></span>),
  Burger: () => (<span className="drk-ico drk-ico--fill"><svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="2"/><rect x="2" y="7" width="12" height="2"/><rect x="2" y="11" width="12" height="2"/></svg></span>),
  Download: () => (<span className="drk-ico drk-ico--fill"><svg viewBox="0 0 16 16"><path d="M8 2v8"/><path d="M5 7l3 3 3-3"/><rect x="3" y="12" width="10" height="2"/></svg></span>),
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

  const setColor = (hex:string) => { if (selectedKind) setSelectedColor(hex); else setBrushColor(hex) }

  // ————— Д Е С К Т О П —————
  const Desktop = (
    <div className="hidden md:block fixed left-5 top-28 z-30 drk" style={{ width: 220 }}
         onPointerDownCapture={stopAll} onTouchStartCapture={stopAll}>
      <div className="drk-card drk-tools">
        {/* header */}
        <div className="drk-hdr">
          <span className="drk-title">TOOLS</span>
          <div style={{ display:"flex", gap:4 }}>
            <button className="drk-btn" title="Upload image" onClick={pickFile}><Ico.Plus /></button>
            <button className={`drk-btn ${layersOpen ? "drk-btn--active":""}`} title="Layers" onClick={toggleLayers}><Ico.Burger/></button>
          </div>
        </div>

        {/* tools row */}
        <div style={{ padding:"8px 10px" }} className="drk-sep">
          <div className="drk-grid6">
            <ToolBtn label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}  icon={<Ico.Move/>}/>
            <ToolBtn label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")} icon={<Ico.Brush/>}/>
            <ToolBtn label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")} icon={<Ico.Erase/>}/>
            <ToolBtn label="Text"   onClick={onAddText}      icon={<Ico.Text/>}/>
            <ToolBtn label="Square" onClick={()=>onAddShape("square")}  icon={<Ico.Square/>}/>
            <ToolBtn label="Circle" onClick={()=>onAddShape("circle")}  icon={<Ico.Circle/>}/>
          </div>
        </div>

        {/* color + size */}
        <div style={{ padding:"8px 10px" }} className="drk-sep">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Color</span>
            <input type="color" value={activeColor} onChange={(e)=>setColor(e.target.value)} />
            <div style={{ flex:1 }} />
            <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Size</span>
            <div style={{ width:96 }}>
              <input type="range" min={1} max={120} step={1} value={brushSize}
                     onChange={(e)=>setBrushSize(Number(e.target.value))}/>
            </div>
            <span className="drk-num">{brushSize}</span>
          </div>

          {/* flat palette */}
          <div style={{ marginTop:8 }} className="drk-grid10">
            {PALETTE.map((hex)=>(
              <button key={hex} className="drk-chip" style={{ background:hex }} title={hex}
                      onClick={(e)=>{e.stopPropagation(); setColor(hex)}}/>
            ))}
          </div>
        </div>

        {/* shapes row */}
        <div style={{ padding:"8px 10px" }} className="drk-sep">
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>Shapes</div>
          <div className="drk-grid6">
            <ShapeBtn onClick={()=>onAddShape("square")}  icon={<Ico.Square/>}/>
            <ShapeBtn onClick={()=>onAddShape("circle")}  icon={<Ico.Circle/>}/>
            <ShapeBtn onClick={()=>onAddShape("triangle")}icon={<Ico.Triangle/>}/>
            <ShapeBtn onClick={()=>onAddShape("line")}    icon={<Ico.Line/>}/>
            <ShapeBtn onClick={()=>onAddShape("cross")}   icon={<Ico.Cross/>}/>
            <ShapeBtn onClick={()=>onAddShape("line2")}   icon={<Ico.Line/>}/>
          </div>
        </div>

        {/* text */}
        <div style={{ padding:"8px 10px" }} className="drk-sep">
          <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>Text</div>
          <textarea
            placeholder="Enter text"
            rows={4}
            value={selectedKind==="text" ? (selectedProps?.text ?? "") : ""}
            onChange={(e)=>{ if (selectedKind==="text") setSelectedText(e.target.value) }}
          />
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
            <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Font size</span>
            <input type="range" min={8} max={800} step={1}
                   value={selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
                   onChange={(e)=>{ if (selectedKind==="text") setSelectedFontSize(Number(e.target.value)) }}/>
            <span className="drk-num">
              {selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
            </span>
          </div>
        </div>

        {/* side + downloads */}
        <div style={{ padding:"12px 10px" }}>
          <div className="drk-grid6" style={{ gridTemplateColumns:"1fr 1fr" }}>
            <button className={`drk-btn ${side==="front"?"drk-btn--active":""}`} onClick={()=>setSide("front")}>FRONT</button>
            <button className={`drk-btn ${side==="back" ?"drk-btn--active":""}`}  onClick={()=>setSide("back") }>BACK</button>
          </div>
          <div className="drk-grid6" style={{ gridTemplateColumns:"1fr 1fr", marginTop:8 }}>
            <button className="drk-btn" onClick={onDownloadFront}><Ico.Download/>&nbsp;Download</button>
            <button className="drk-btn" onClick={onDownloadBack}><Ico.Download/>&nbsp;Download</button>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange}/>
    </div>
  )

  // ————— М О Б И Л К А ————— (ровно 3 строки: TOOLS → SETTINGS → FRONT/BACK+Downloads)
  const Mobile = (
    <div className="md:hidden fixed left-0 right-0 bottom-0 z-30 drk drk-mobile"
         onPointerDownCapture={stopAll} onTouchStartCapture={stopAll}>
      {/* row 1 — TOOLS */}
      <div className="drk-card" style={{ borderLeft:0, borderRight:0 }}>
        <div className="drk-hdr">
          <span className="drk-title">TOOLS</span>
          <div style={{ display:"flex", gap:4 }}>
            <button className="drk-btn drk-btn--small" onClick={pickFile}><Ico.Plus/></button>
            <button className={`drk-btn drk-btn--small ${props.layersOpen?"drk-btn--active":""}`} onClick={props.toggleLayers}><Ico.Burger/></button>
          </div>
        </div>
        <div style={{ padding:"8px 10px" }}>
          <div className="drk-grid6">
            <ToolBtn small label="Move"   active={tool==="move"}  onClick={()=>setTool("move")}  icon={<Ico.Move/>}/>
            <ToolBtn small label="Brush"  active={tool==="brush"} onClick={()=>setTool("brush")} icon={<Ico.Brush/>}/>
            <ToolBtn small label="Erase"  active={tool==="erase"} onClick={()=>setTool("erase")} icon={<Ico.Erase/>}/>
            <ToolBtn small label="Text"   onClick={onAddText}      icon={<Ico.Text/>}/>
            <ToolBtn small label="Square" onClick={()=>onAddShape("square")} icon={<Ico.Square/>}/>
            <ToolBtn small label="Circle" onClick={()=>onAddShape("circle")} icon={<Ico.Circle/>}/>
          </div>
        </div>
      </div>

      {/* row 2 — SETTINGS */}
      <div className="drk-card" style={{ borderLeft:0, borderRight:0, borderTop:0 }}>
        <div style={{ padding:"8px 10px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Color</span>
              <input type="color" value={activeColor} onChange={(e)=>setColor(e.target.value)}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Size</span>
              <div style={{ width:112 }}>
                <input type="range" min={1} max={120} step={1} value={brushSize} onChange={(e)=>setBrushSize(Number(e.target.value))}/>
              </div>
              <span className="drk-num">{brushSize}</span>
            </div>
          </div>

          <div style={{ marginTop:8 }} className="drk-grid12">
            {PALETTE.map((hex)=>(
              <button key={hex} className="drk-chip" style={{ background:hex }} onClick={(e)=>{e.stopPropagation(); setColor(hex)}}/>
            ))}
          </div>

          {/* текст на мобилке показываем, если выбран текст */}
          <div style={{ marginTop:8 }}>
            <textarea rows={3} placeholder="Enter text"
              value={selectedKind==="text" ? (selectedProps?.text ?? "") : ""}
              onChange={(e)=>{ if (selectedKind==="text") setSelectedText(e.target.value) }}/>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6 }}>
              <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:".1em" }}>Font</span>
              <input type="range" min={8} max={800} step={1}
                     value={selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
                     onChange={(e)=>{ if (selectedKind==="text") setSelectedFontSize(Number(e.target.value)) }}/>
              <span className="drk-num">
                {selectedKind==="text" ? Math.round(selectedProps?.fontSize ?? 96) : 96}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* row 3 — FRONT/BACK & DOWNLOADS */}
      <div className="drk-card" style={{ borderLeft:0, borderRight:0, borderTop:0 }}>
        <div style={{ padding:"8px 10px" }}>
          <div className="drk-grid6" style={{ gridTemplateColumns:"1fr 1fr" }}>
            <button className={`drk-btn drk-btn--small ${side==="front"?"drk-btn--active":""}`} onClick={()=>setSide("front")}>FRONT</button>
            <button className={`drk-btn drk-btn--small ${side==="back" ?"drk-btn--active":""}`}  onClick={()=>setSide("back") }>BACK</button>
          </div>
          <div className="drk-grid6" style={{ gridTemplateColumns:"1fr 1fr", marginTop:8 }}>
            <button className="drk-btn drk-btn--small" onClick={onDownloadFront}><Ico.Download/>&nbsp;Download</button>
            <button className="drk-btn drk-btn--small" onClick={onDownloadBack}><Ico.Download/>&nbsp;Download</button>
          </div>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange}/>
    </div>
  )

  return (<>{Desktop}{Mobile}</>)
}

// Кнопки
function ToolBtn({label, active, onClick, icon, small}:{label?:string; active?:boolean; onClick:()=>void; icon:React.ReactNode; small?:boolean}) {
  return (
    <button className={`drk-btn ${small?"drk-btn--small":""} ${active?"drk-btn--active":""}`}
            onClick={(e)=>{e.stopPropagation(); onClick()}} title={label}>
      {icon}
    </button>
  )
}
function ShapeBtn({onClick, icon}:{onClick:()=>void; icon:React.ReactNode}) {
  return (
    <button className="drk-btn" onClick={(e)=>{e.stopPropagation(); onClick()}}>{icon}</button>
  )
}
