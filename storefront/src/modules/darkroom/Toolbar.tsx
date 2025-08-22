import React, { useEffect, useMemo, useRef, useState } from "react"
import { Blend, ShapeKind, Side, Tool } from "./store"

type SelectedTextProps = {
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  lineHeight: number
  letterSpacing: number
  align: "left" | "center" | "right"
}

type Props = {
  layout: "desktop-panel" | "mobile-3rows"
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
  onClear: () => void

  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: "text" | "image" | "shape" | "strokes" | "erase" | null
  selectedProps: Partial<SelectedTextProps> | {}

  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (w: number) => void
  setSelectedText: (s: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (s: string) => void
  setSelectedColor: (hex: string) => void
  setSelectedLineHeight: (n: number) => void
  setSelectedLetterSpacing: (n: number) => void
  setSelectedAlign: (a: "left" | "center" | "right") => void

  mobileTopOffset?: number
  mobileLayers: null | {
    items: any[]
    selectedId?: string
    onSelect: (id: string) => void
    onToggleVisible: (id: string) => void
    onToggleLock: (id: string) => void
    onDelete: (id: string) => void
    onDuplicate: (id: string) => void
    onChangeBlend: (id: string, b: Blend) => void
    onChangeOpacity: (id: string, o: number) => void
    onMoveUp: (id: string) => void
    onMoveDown: (id: string) => void
  }
}

const PALETTE = [
  "#000000", "#ffffff",
  "#ff008c", "#ff5e00", "#ffc400", "#3bd100", "#00c2ff", "#7a50ff",
  "#ff3b30", "#ff9500", "#ffd60a", "#34c759", "#0a84ff", "#af52de",
  "#ff77a9", "#ffb37c", "#ffe082", "#8be28e", "#78d7ff", "#b8a9ff",
]

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {active?:boolean; w?:number}> = ({active, w=28, children, ...p}) => (
  <button {...p}
    style={{ width:w, height:28, border:"1px solid #111", background: active ? "#111" : "#fff", color: active ? "#fff" : "#111" }}
  >{children}</button>
)

export default function Toolbar(props: Props) {
  const {
    layout, side, setSide, tool, setTool,
    brushColor, setBrushColor, brushSize, setBrushSize,
    onUploadImage, onAddText, onAddShape,
    onDownloadFront, onDownloadBack, onClear,
    toggleLayers, layersOpen,
    selectedKind, selectedProps,
    setSelectedColor, setSelectedFontSize, setSelectedText,
    setSelectedLineHeight, setSelectedLetterSpacing, setSelectedAlign,
  } = props

  // локальные значения для ручек, подхватываются из выбранного текста
  const sp = (selectedProps || {}) as Partial<SelectedTextProps>
  const [fs, setFs] = useState<number>(sp.fontSize ?? 96)
  const [lh, setLh] = useState<number>(sp.lineHeight ?? 1)
  const [ls, setLs] = useState<number>(sp.letterSpacing ?? 0)
  const [align, setAlign] = useState<"left"|"center"|"right">(sp.align ?? "left")

  useEffect(() => { if (typeof sp.fontSize === "number") setFs(sp.fontSize) }, [sp.fontSize])
  useEffect(() => { if (typeof sp.lineHeight === "number") setLh(sp.lineHeight) }, [sp.lineHeight])
  useEffect(() => { if (typeof sp.letterSpacing === "number") setLs(sp.letterSpacing) }, [sp.letterSpacing])
  useEffect(() => { if (sp.align) setAlign(sp.align) }, [sp.align])

  const fileRef = useRef<HTMLInputElement>(null)
  const pickFile = () => fileRef.current?.click()
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = ""
  }

  const Box: React.FC<{title?:string, children:any}> = ({title, children}) => (
    <div style={{ border:"1px solid #111", background:"#fff", padding:8, marginBottom:8 }}>
      {title && <div style={{ fontSize:10, letterSpacing:1, color:"#111", marginBottom:6 }}>{title}</div>}
      {children}
    </div>
  )

  // ===== ЛЕВАЯ ПАНЕЛЬ (десктоп) =====
  if (layout === "desktop-panel") {
    return (
      <div style={{ fontFamily:"inherit", fontSize:12 }}>
        <Box title="TOOLS">
          {/* верхняя строка: управление панелью и слоями */}
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <Btn onClick={()=>setTool("move")}   active={tool==="move"}>✚</Btn>
            <Btn onClick={()=>setTool("brush")}  active={tool==="brush"}>⟡</Btn>
            <Btn onClick={()=>setTool("erase")}  active={tool==="erase"}>⨂</Btn>
            <Btn onClick={()=>{ onAddText(); setTool("move") }} title="Text">T</Btn>
            <Btn onClick={pickFile} title="Image">▣</Btn>
            <Btn onClick={()=>onAddShape("circle")} title="Layers">◌</Btn>
            <Btn onClick={()=>toggleLayers()} title="Layers" active={layersOpen}>≡</Btn>
            <Btn onClick={onClear} title="Clear" style={{ marginLeft:"auto" }}>✕</Btn>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={onFile}/>
          </div>

          {/* цвет + палитра */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <input type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); if(selectedKind==="text") setSelectedColor(e.target.value) }} />
            <div style={{ width:140 }}>
              <input type="range" min={1} max={72} value={brushSize} onChange={(e)=>props.setBrushSize?.(parseInt(e.target.value,10))}/>
            </div>
            <div style={{ width:24, textAlign:"right" }}>{brushSize}</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(12, 1fr)", gap:4, marginBottom:8 }}>
            {PALETTE.map((c,i)=>(
              <button key={i} onClick={()=>{ setBrushColor(c); if (selectedKind==="text" || selectedKind==="shape") setSelectedColor(c)}}
                style={{ width:16, height:16, border:"1px solid #111", background:c }}/>
            ))}
          </div>

          {/* фигуры */}
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <Btn onClick={()=>onAddShape("square")}>□</Btn>
            <Btn onClick={()=>onAddShape("circle")}>○</Btn>
            <Btn onClick={()=>onAddShape("triangle")}>△</Btn>
            <Btn onClick={()=>onAddShape("cross")}>✚</Btn>
            <Btn onClick={()=>onAddShape("line")}>—</Btn>
          </div>

          {/* ТЕКСТ — выравнивание */}
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <Btn active={align==="left"}   onClick={()=>{ setAlign("left");   setSelectedAlign("left") }}>≡</Btn>
            <Btn active={align==="center"} onClick={()=>{ setAlign("center"); setSelectedAlign("center") }}>≣</Btn>
            <Btn active={align==="right"}  onClick={()=>{ setAlign("right");  setSelectedAlign("right") }}>≡</Btn>
          </div>

          {/* font size */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:58 }}>Font size</div>
            <input type="range" min={8} max={800} value={fs}
              onChange={(e)=>{ const v = parseInt(e.target.value,10); setFs(v); setSelectedFontSize(v) }} style={{ flex:1 }}/>
            <div style={{ width:36, textAlign:"right" }}>{fs}</div>
          </div>

          {/* line height */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:58 }}>Line</div>
            <input type="range" step={0.01} min={0.5} max={3} value={lh}
              onChange={(e)=>{ const v = parseFloat(e.target.value); setLh(v); setSelectedLineHeight(v) }} style={{ flex:1 }}/>
            <div style={{ width:36, textAlign:"right" }}>{lh.toFixed(2)}</div>
          </div>

          {/* letter spacing */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:58 }}>Letter</div>
            <input type="range" step={0.1} min={-5} max={20} value={ls}
              onChange={(e)=>{ const v = parseFloat(e.target.value); setLs(v); setSelectedLetterSpacing(v) }} style={{ flex:1 }}/>
            <div style={{ width:36, textAlign:"right" }}>{ls.toFixed(1)}</div>
          </div>

          {/* front/back + download */}
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button onClick={()=>setSide("front")} style={{ flex:1, height:28, border:"1px solid #111", background: side==="front"?"#111":"#fff", color: side==="front"?"#fff":"#111" }}>FRONT</button>
            <button onClick={()=>setSide("back")}  style={{ flex:1, height:28, border:"1px solid #111", background: side==="back"?"#111":"#fff",  color: side==="back"?"#fff":"#111" }}>BACK</button>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:6 }}>
            <button onClick={onDownloadFront} style={{ flex:1, height:28, border:"1px solid #111", background:"#fff" }}>DL FRONT</button>
            <button onClick={onDownloadBack}  style={{ flex:1, height:28, border:"1px solid #111", background:"#fff" }}>DL BACK</button>
          </div>
        </Box>
      </div>
    )
  }

  // ===== МОБИЛЬНЫЙ 3-СТРОЧНЫЙ =====
  return (
    <div style={{
      position:"fixed", left:0, right:0, bottom:0, zIndex:40, background:"#fff",
      borderTop:"1px solid #111", padding:"8px 10px"
    }}>
      {/* 1: инструменты */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8, 1fr)", gap:8, marginBottom:8 }}>
        <Btn onClick={()=>setTool("move")} active={tool==="move"}>✚</Btn>
        <Btn onClick={()=>setTool("brush")} active={tool==="brush"}>⟡</Btn>
        <Btn onClick={()=>setTool("erase")} active={tool==="erase"}>⨂</Btn>
        <Btn onClick={()=>{ onAddText(); setTool("move") }}>T</Btn>
        <Btn onClick={pickFile}>▣</Btn>
        <Btn onClick={()=>toggleLayers()} active={props.layersOpen}>≡</Btn>
        <Btn onClick={()=>setSide("front")} active={side==="front"}>F</Btn>
        <Btn onClick={()=>setSide("back")}  active={side==="back"}>B</Btn>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={onFile}/>

      {/* 2: Настройки/цвет по центру */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <input type="color" value={brushColor} onChange={(e)=>{ setBrushColor(e.target.value); if (selectedKind==="text") setSelectedColor(e.target.value) }}/>
        <input type="range" min={1} max={72} value={brushSize} onChange={(e)=>props.setBrushSize?.(parseInt(e.target.value,10))} style={{ flex:1 }}/>
        <div style={{ width:30, textAlign:"right" }}>{brushSize}</div>
      </div>

      {/* 3: Текст — font/line/letter и загрузки */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        <div>
          <div style={{ display:"flex", gap:6, marginBottom:6 }}>
            <Btn active={align==="left"}   onClick={()=>{ setAlign("left");   setSelectedAlign("left") }}>≡</Btn>
            <Btn active={align==="center"} onClick={()=>{ setAlign("center"); setSelectedAlign("center") }}>≣</Btn>
            <Btn active={align==="right"}  onClick={()=>{ setAlign("right");  setSelectedAlign("right") }}>≡</Btn>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <div style={{ width:52 }}>Size</div>
            <input type="range" min={8} max={800} value={fs} onChange={(e)=>{ const v = parseInt(e.target.value,10); setFs(v); setSelectedFontSize(v) }} style={{ flex:1 }}/>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <div style={{ width:52 }}>Line</div>
            <input type="range" step={0.01} min={0.5} max={3} value={lh} onChange={(e)=>{ const v=parseFloat(e.target.value); setLh(v); setSelectedLineHeight(v) }} style={{ flex:1 }}/>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:52 }}>Letter</div>
            <input type="range" step={0.1} min={-5} max={20} value={ls} onChange={(e)=>{ const v=parseFloat(e.target.value); setLs(v); setSelectedLetterSpacing(v) }} style={{ flex:1 }/>
          </div>
        </div>
        <div>
          <button onClick={onDownloadFront} style={{ width:"100%", height:32, border:"1px solid #111", background:"#fff", marginBottom:6 }}>DL FRONT</button>
          <button onClick={onDownloadBack}  style={{ width:"100%", height:32, border:"1px solid #111", background:"#fff" }}>DL BACK</button>
        </div>
      </div>
    </div>
  )
}
