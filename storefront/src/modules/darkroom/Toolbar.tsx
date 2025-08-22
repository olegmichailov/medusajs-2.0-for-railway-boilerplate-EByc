"use client"

import React, { ChangeEvent, useMemo } from "react"
import { Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

type LayerList = {
  items: Array<{ id: string; name: string; type: string; visible: boolean; locked: boolean; blend: Blend; opacity: number }>
  selectedId?: string
  onSelect: (id: string)=>void
  onToggleVisible: (id: string)=>void
  onToggleLock: (id: string)=>void
  onDelete: (id: string)=>void
  onDuplicate: (id: string)=>void
  onChangeBlend: (id: string, b: Blend)=>void
  onChangeOpacity: (id: string, o: number)=>void
  onMoveUp: (id: string)=>void
  onMoveDown: (id: string)=>void
}

type Props = {
  side: Side
  setSide: (s: Side)=>void
  tool: Tool
  setTool: (t: Tool)=>void
  brushColor: string
  setBrushColor: (v: string)=>void
  brushSize: number
  setBrushSize: (v: number)=>void
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

  selectedKind: string|null
  selectedProps: any
  setSelectedFill: (hex:string)=>void
  setSelectedStroke: (hex:string)=>void
  setSelectedStrokeW: (w:number)=>void
  setSelectedText: (t:string)=>void
  setSelectedFontSize: (n:number)=>void
  setSelectedFontFamily: (name:string)=>void
  setSelectedAlign: (a:"left"|"center"|"right")=>void
  setSelectedLineHeight: (lh:number)=>void
  setSelectedLetter: (ls:number)=>void
  setSelectedColor: (hex:string)=>void

  mobileTopOffset: number
  mobileLayers: LayerList
}

const COLORS = [
  "#000000","#ffffff",
  "#ff3b3b","#ff7a00","#ffd400","#ffe666","#34c759","#00c7be","#32ade6","#007aff","#5856d6","#af52de",
  "#ff2d55","#ff9f0a","#ffd60a","#64d2ff","#30d158","#a0e461","#8e8e93","#c7c7cc"
]

export default function Toolbar(p: Props) {
  const colorInput = (value: string, onChange:(v:string)=>void) => (
    <input
      type="color"
      value={value}
      onChange={(e)=>onChange(e.target.value)}
      style={{ width: 24, height: 24, border: "1px solid #111", borderRadius: 2, background: "#fff" }}
    />
  )

  const slider = (val:number,min:number,max:number,step:number,on:(n:number)=>void,w=140) => (
    <input
      type="range"
      value={val}
      min={min}
      max={max}
      step={step}
      onChange={(e)=>on(Number(e.target.value))}
      style={{ width: w }}
    />
  )

  // ============ DESKTOP ============
  if (!isMobile) {
    return (
      <aside
        style={{
          position:"fixed", left:16, top:p.mobileTopOffset, width:256, zIndex:50,
          border: "1px solid #111", background:"#fff", padding:8
        }}
      >
        <div style={{ fontSize:10, letterSpacing:1, borderBottom:"1px solid #111", paddingBottom:6, marginBottom:8 }}>TOOLS</div>

        {/* верхняя строка */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:6, marginBottom:8 }}>
          <Btn on={()=>p.setTool("move")}  active={p.tool==="move"}  label="Move" />
          <Btn on={()=>p.setTool("brush")} active={p.tool==="brush"} label="Brush" />
          <Btn on={()=>p.setTool("erase")} active={p.tool==="erase"} label="Erase" />
          <Btn on={p.onAddText} label="Text" />
          <label className="btn-like" style={btnStyle}><input type="file" accept="image/*" style={{ display:"none" }}
                 onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f); (e.target as HTMLInputElement).value="" }} />Img</label>
          <Btn on={()=>p.toggleLayers()} active={p.layersOpen} label="Lay" />
          <Btn on={()=>p.onClear()} label="Clear" />
          <div />
        </div>

        {/* цвет + размер кисти */}
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:6, alignItems:"center", marginBottom:8 }}>
          <span style={{ fontSize:11 }}>Color</span>
          {slider(p.brushSize, 1, 64, 1, p.setBrushSize)}
          {colorInput(p.brushColor, p.setBrushColor)}
        </div>

        {/* палитра */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:6, marginBottom:10 }}>
          {COLORS.map(c=>(
            <div key={c} title={c}
              onClick={()=>{ p.setBrushColor(c); p.setSelectedColor(c)}}
              style={{ width:18, height:18, border:"1px solid #111", background:c, cursor:"pointer" }}/>
          ))}
        </div>

        {/* Shapes */}
        <div style={{ fontSize:11, marginBottom:6 }}>Shapes</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6, marginBottom:12 }}>
          <Btn on={()=>p.onAddShape("square")}   label="▭" />
          <Btn on={()=>p.onAddShape("circle")}   label="◯" />
          <Btn on={()=>p.onAddShape("triangle")} label="△" />
          <Btn on={()=>p.onAddShape("cross")}    label="✚" />
          <Btn on={()=>p.onAddShape("line")}     label="—" />
          <div />
        </div>

        {/* Text */}
        <div style={{ fontSize:11, marginBottom:6 }}>Text</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6, marginBottom:6 }}>
          <Btn on={()=>p.setSelectedAlign("left")}   label="≡" title="Align left" />
          <Btn on={()=>p.setSelectedAlign("center")} label="=≡=" title="Align center" />
          <Btn on={()=>p.setSelectedAlign("right")}  label="≡=" title="Align right" />
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:6, alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize:11 }}>Font size</span>
          {slider(p.selectedProps?.fontSize ?? 96, 8, 800, 1, p.setSelectedFontSize)}
          <span style={{ fontSize:11 }}>{p.selectedProps?.fontSize ?? 96}</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:6, alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize:11 }}>Line</span>
          {slider(p.selectedProps?.lineHeight ?? 1, 0.5, 4, 0.01, p.setSelectedLineHeight)}
          <span style={{ fontSize:11 }}>{(p.selectedProps?.lineHeight ?? 1).toFixed(2)}</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:6, alignItems:"center", marginBottom:12 }}>
          <span style={{ fontSize:11 }}>Letter</span>
          {slider(p.selectedProps?.letterSpacing ?? 0, -10, 100, 0.5, p.setSelectedLetter)}
          <span style={{ fontSize:11 }}>{(p.selectedProps?.letterSpacing ?? 0).toFixed(1)}</span>
        </div>

        {/* Download + Side */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6 }}>
          <Btn on={()=>p.setSide("front")} active={p.side==="front"} label="FRONT" />
          <Btn on={()=>p.setSide("back")}  active={p.side==="back"}  label="BACK" />
          <div />
          <Btn on={p.onDownloadFront} label="DL FRONT" />
          <Btn on={p.onDownloadBack}  label="DL BACK" />
          <div />
        </div>
      </aside>
    )
  }

  // ============ MOBILE (3 строки) ============
  return (
    <div style={{
      position:"fixed", left:0, right:0, bottom:0, zIndex:60, background:"#fff",
      borderTop:"1px solid #111", padding:"8px 8px"
    }}>
      {/* Ряд 1: инструменты */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:6, marginBottom:8 }}>
        <Btn on={()=>p.setTool("move")}  active={p.tool==="move"}  label="Move" />
        <Btn on={()=>p.setTool("brush")} active={p.tool==="brush"} label="Brush" />
        <Btn on={()=>p.setTool("erase")} active={p.tool==="erase"} label="Erase" />
        <Btn on={p.onAddText} label="Text" />
        <label className="btn-like" style={btnStyle}><input type="file" accept="image/*" style={{ display:"none" }}
               onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f); (e.target as HTMLInputElement).value="" }} />Img</label>
        <Btn on={()=>p.onAddShape("square")} label="▭" />
        <Btn on={()=>p.toggleLayers()} active={p.layersOpen} label="Layers" />
        <Btn on={()=>p.onClear()} label="Clear" />
      </div>

      {/* Ряд 2: Color + Size (универсальные) */}
      <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:8, alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12 }}>Color</span>
        {slider(p.brushSize, 1, 64, 1, p.setBrushSize, /*w*/ undefined as any)}
        {colorInput(p.brushColor, (c)=>{ p.setBrushColor(c); p.setSelectedColor(c) })}
      </div>

      {/* Ряд 3: Сторона + даунлоады */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:6 }}>
        <Btn on={()=>p.setSide("front")} active={p.side==="front"} label="FRONT" />
        <Btn on={()=>p.setSide("back")}  active={p.side==="back"}  label="BACK" />
        <Btn on={p.onDownloadFront} label="DL F" />
        <Btn on={p.onDownloadBack}  label="DL B" />
      </div>
    </div>
  )
}

// ============== Вспомогательные компоненты ==============

const btnStyle: React.CSSProperties = {
  display:"inline-flex", alignItems:"center", justifyContent:"center",
  height:28, border:"1px solid #111", background:"#fff",
  fontSize:12, cursor:"pointer", userSelect:"none"
}
function Btn({ on, active, label, title }:{ on:()=>void; active?:boolean; label:string; title?:string }) {
  return (
    <button type="button" onClick={on} title={title}
      style={{
        ...btnStyle,
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111"
      }}
    >
      {label}
    </button>
  )
}
