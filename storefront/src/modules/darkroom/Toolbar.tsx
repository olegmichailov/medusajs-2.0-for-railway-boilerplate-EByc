// storefront/src/modules/darkroom/Toolbar.tsx
"use client"

import React, { useEffect, useRef } from "react"
import { isMobile } from "react-device-detect"
import { ShapeKind, Side, Tool } from "./store"

type LayerType = "image" | "shape" | "text" | "strokes"

type Props = {
  // global
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (v: string) => void
  brushSize: number
  setBrushSize: (n: number) => void
  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void
  onUploadImage: (f: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  toggleLayers: () => void
  layersOpen: boolean

  // selected
  selectedKind: LayerType | null
  selectedProps: any
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (w: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  // extras
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange?: (h: number) => void
}

const iconStyle: React.CSSProperties = { width: 22, height: 22, display: "block" }
const btnCls = "border border-gray-900 rounded-none w-12 h-12 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200"
const btnActive = "bg-black text-white hover:bg-black active:bg-black"

function IconMove(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 2l3 3-2 0 0 4 4 0 0-2 3 3-3 3 0-2-4 0 0 4 2 0-3 3-3-3 2 0 0-4-4 0 0 2-3-3 3-3 0 2 4 0 0-4-2 0z" fill="currentColor"/></svg>)}
function IconBrush(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M3 17c0 2.2 1.8 4 4 4 1.7 0 3.1-1 3.7-2.5l9.6-9.6c.5-.5.5-1.2 0-1.7l-1.5-1.5c-.5-.5-1.2-.5-1.7 0l-9.6 9.6C6 14 5 12.6 5 11c0-1.7-1.3-3-3-3 1.4 1.4 1 4.1 1 6z" fill="currentColor"/></svg>)}
function IconEraser(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M3 15l8-8c.8-.8 2-.8 2.8 0l7.2 7.2-6 6H7L3 15zM13 7l-8 8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function IconText(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M4 6V3h16v3h-6v12h-4V6H4z" fill="currentColor"/></svg>)}
function IconImage(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M4 5h16v14H4z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M7 14l3-3 3 4 2-2 3 4H7z" fill="currentColor"/><circle cx="9" cy="8" r="1.5" fill="currentColor"/></svg>)}
function IconSquare(){return(<svg viewBox="0 0 24 24" style={iconStyle}><rect x="5" y="5" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function IconCircle(){return(<svg viewBox="0 0 24 24" style={iconStyle}><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function IconTriangle(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 5l7 14H5l7-14z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}
function IconLine(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M5 19L19 5" stroke="currentColor" strokeWidth="2"/></svg>)}
function IconCross(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M4 11h16v2H4zM11 4h2v16h-2z" fill="currentColor"/></svg>)}
function IconStack(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 3l9 5-9 5-9-5 9-5zm0 8l9 5-9 5-9-5 9-5z" fill="currentColor"/></svg>)}
function IconUndo(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M7 7l-4 4 4 4V11h7a4 4 0 110 8h-2v-2h2a2 2 0 100-4H7z" fill="currentColor"/></svg>)}
function IconRedo(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M17 7l4 4-4 4V11H10a4 4 0 100 8h2v-2h-2a2 2 0 110-4h7z" fill="currentColor"/></svg>)}
function IconTrash(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 3H8l1-3z" fill="currentColor"/></svg>)}
function IconDownload(){return(<svg viewBox="0 0 24 24" style={iconStyle}><path d="M12 3v10m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" strokeWidth="2" fill="none"/></svg>)}

const COLORS = [
  "#000000","#333333","#666666","#999999","#C0C0C0","#FFFFFF",
  "#FF007A","#FF5400","#FFB000","#FFD400","#00E676","#00D1FF",
  "#0052FF","#6A00FF","#FF00E6"
]

const Swatch: React.FC<{color:string,onPick:(c:string)=>void}> = ({color,onPick}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <button
      onClick={(e)=>{ e.preventDefault(); inputRef.current?.click() }}
      className="w-6 h-6 border border-black mr-1 mb-1"
      style={{ background: color }}
      aria-label={`color ${color}`}
    >
      <input
        ref={inputRef}
        type="color"
        defaultValue={color}
        onChange={(e)=>onPick(e.target.value)}
        className="hidden"
      />
    </button>
  )
}

const Row: React.FC<{children:React.ReactNode}> = ({children}) => (
  <div className="flex items-center gap-2">{children}</div>
)

const SquareBtn: React.FC<{active?:boolean,onClick?:()=>void,title?:string,children:React.ReactNode}> = ({active,onClick,title,children}) => (
  <button title={title} onClick={onClick} className={`${btnCls} ${active?btnActive:""}`}>{children}</button>
)

const MobileToolbar: React.FC<Props> = (p) => {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if (!p.onHeightChange) return
    const m = new ResizeObserver(()=>{
      p.onHeightChange!(rootRef.current?.getBoundingClientRect().height || 120)
    })
    if (rootRef.current) m.observe(rootRef.current)
    return ()=>m.disconnect()
  },[])

  return (
    <div ref={rootRef} className="fixed left-0 right-0 bottom-0 bg-white border-t border-black px-3 pb-3 pt-2">
      {/* one row of square tools */}
      <div className="flex justify-between gap-2 overflow-x-auto no-scrollbar">
        <SquareBtn title="Move"   active={p.tool==="move"}  onClick={()=>p.setTool("move")}   ><IconMove/></SquareBtn>
        <SquareBtn title="Brush"  active={p.tool==="brush"} onClick={()=>p.setTool("brush")}  ><IconBrush/></SquareBtn>
        <SquareBtn title="Erase"  active={p.tool==="erase"} onClick={()=>p.setTool("erase")}  ><IconEraser/></SquareBtn>
        <SquareBtn title="Text"   active={false}            onClick={p.onAddText}><IconText/></SquareBtn>
        <SquareBtn title="Image"  active={false}            ><label className="w-full h-full flex items-center justify-center cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f) }}/>
          <IconImage/>
        </label></SquareBtn>
        <SquareBtn title="Line"   onClick={()=>p.onAddShape("line")}><IconLine/></SquareBtn>
        <SquareBtn title="Circle" onClick={()=>p.onAddShape("circle")}><IconCircle/></SquareBtn>
        <SquareBtn title="Square" onClick={()=>p.onAddShape("square")}><IconSquare/></SquareBtn>
        <SquareBtn title="Triangle" onClick={()=>p.onAddShape("triangle")}><IconTriangle/></SquareBtn>
        <SquareBtn title="Cross"  onClick={()=>p.onAddShape("cross")}><IconCross/></SquareBtn>
        <SquareBtn title="Layers" active={p.layersOpen} onClick={p.toggleLayers}><IconStack/></SquareBtn>
        <SquareBtn title="Undo" onClick={p.onUndo}><IconUndo/></SquareBtn>
        <SquareBtn title="Redo" onClick={p.onRedo}><IconRedo/></SquareBtn>
        <SquareBtn title="Clear" onClick={p.onClear}><IconTrash/></SquareBtn>
      </div>

      {/* context settings */}
      <div className="mt-2 space-y-2">
        {(p.tool==="brush" || p.tool==="erase") && (
          <Row>
            <span className="text-xs w-14">Size</span>
            <input
              type="range" min={2} max={240} step={1}
              value={p.brushSize}
              onInput={(e)=>p.setBrushSize(parseInt((e.target as HTMLInputElement).value,10))}
              className="w-full"
            />
          </Row>
        )}

        <Row>
          <span className="text-xs w-14">Color</span>
          <div className="flex flex-wrap">{COLORS.map(c=>(<Swatch key={c} color={c} onPick={(hex)=>p.setBrushColor(hex)}/>))}</div>
        </Row>

        {p.selectedKind==="text" && (
          <div className="space-y-2">
            <Row>
              <input
                type="text"
                placeholder="Enter text"
                className="border border-black px-2 py-1 w-full"
                value={p.selectedProps?.text ?? ""}
                onChange={(e)=>p.setSelectedText(e.target.value)}
              />
            </Row>
            <Row>
              <span className="text-xs w-14">Font</span>
              <input
                type="range" min={8} max={800} step={1}
                value={p.selectedProps?.fontSize ?? 112}
                onInput={(e)=>p.setSelectedFontSize(parseInt((e.target as HTMLInputElement).value,10))}
                className="w-full"
              />
            </Row>
          </div>
        )}
      </div>

      {/* bottom row: [FRONT ⬇] [BACK ⬇] */}
      <div className="flex justify-between gap-2 mt-2">
        <button
          className={`flex-1 border border-black px-3 py-2 flex items-center justify-between ${p.side==="front" ? "bg-black text-white" : ""}`}
          onClick={()=>p.setSide("front")}
        >
          <span>FRONT</span>
          <span onClick={(e)=>{ e.stopPropagation(); p.onDownloadFront() }}><IconDownload/></span>
        </button>
        <button
          className={`flex-1 border border-black px-3 py-2 flex items-center justify-between ${p.side==="back" ? "bg-black text-white" : ""}`}
          onClick={()=>p.setSide("back")}
        >
          <span>BACK</span>
          <span onClick={(e)=>{ e.stopPropagation(); p.onDownloadBack() }}><IconDownload/></span>
        </button>
      </div>
    </div>
  )
}

const DesktopToolbar: React.FC<Props> = (p) => {
  return (
    <div className="fixed left-6 top-[120px] w-[200px] bg-white border border-black p-2">
      {/* tools row */}
      <div className="flex flex-wrap gap-2 mb-2">
        <SquareBtn title="Move"   active={p.tool==="move"}  onClick={()=>p.setTool("move")}   ><IconMove/></SquareBtn>
        <SquareBtn title="Brush"  active={p.tool==="brush"} onClick={()=>p.setTool("brush")}  ><IconBrush/></SquareBtn>
        <SquareBtn title="Erase"  active={p.tool==="erase"} onClick={()=>p.setTool("erase")}  ><IconEraser/></SquareBtn>
        <SquareBtn title="Text"   onClick={p.onAddText}><IconText/></SquareBtn>
        <SquareBtn title="Image"  ><label className="w-full h-full flex items-center justify-center cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) p.onUploadImage(f) }}/>
          <IconImage/>
        </label></SquareBtn>
        <SquareBtn title="Layers" active={p.layersOpen} onClick={p.toggleLayers}><IconStack/></SquareBtn>
        <SquareBtn title="Undo" onClick={p.onUndo}><IconUndo/></SquareBtn>
        <SquareBtn title="Redo" onClick={p.onRedo}><IconRedo/></SquareBtn>
        <SquareBtn title="Clear" onClick={p.onClear}><IconTrash/></SquareBtn>
      </div>

      {/* color grid */}
      <div className="mb-2">
        <div className="flex flex-wrap">{COLORS.map(c=>(<Swatch key={c} color={c} onPick={(hex)=>{ p.setBrushColor(hex); if (p.selectedKind) p.setSelectedColor(hex) }}/>))}</div>
      </div>

      {/* shapes row */}
      <div className="flex gap-2 mb-2">
        <SquareBtn title="Line"   onClick={()=>p.onAddShape("line")}><IconLine/></SquareBtn>
        <SquareBtn title="Circle" onClick={()=>p.onAddShape("circle")}><IconCircle/></SquareBtn>
        <SquareBtn title="Square" onClick={()=>p.onAddShape("square")}><IconSquare/></SquareBtn>
        <SquareBtn title="Triangle" onClick={()=>p.onAddShape("triangle")}><IconTriangle/></SquareBtn>
        <SquareBtn title="Cross"  onClick={()=>p.onAddShape("cross")}><IconCross/></SquareBtn>
      </div>

      {/* text input + font slider */}
      <div className="mb-2">
        <input
          type="text"
          placeholder="Enter text"
          className="border border-black px-2 py-1 w-full mb-2"
          value={p.selectedKind==="text" ? (p.selectedProps?.text ?? "") : ""}
          onChange={(e)=>p.setSelectedText(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <span className="text-xs">Font size</span>
          <input
            type="range" min={8} max={800} step={1}
            value={p.selectedKind==="text" ? (p.selectedProps?.fontSize ?? 112) : 112}
            onInput={(e)=>p.setSelectedFontSize(parseInt((e.target as HTMLInputElement).value,10))}
            className="w-full"
          />
        </div>
      </div>

      {/* side switch + downloads (as in your desktop screenshot) */}
      <div className="flex gap-2">
        <button
          className={`flex-1 border border-black px-3 py-2 ${p.side==="front" ? "bg-black text-white" : ""}`}
          onClick={()=>p.setSide("front")}
        >
          FRONT
        </button>
        <button
          className={`flex-1 border border-black px-3 py-2 ${p.side==="back" ? "bg-black text-white" : ""}`}
          onClick={()=>p.setSide("back")}
        >
          BACK
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="flex-1 border border-black px-3 py-2 flex items-center justify-center gap-2" onClick={p.onDownloadFront}>
          <IconDownload/> <span>Download</span>
        </button>
        <button className="flex-1 border border-black px-3 py-2 flex items-center justify-center gap-2" onClick={p.onDownloadBack}>
          <IconDownload/> <span>Download</span>
        </button>
      </div>

      {/* brush size */}
      <div className="mt-3">
        <div className="text-xs mb-1">Brush size</div>
        <input
          type="range" min={2} max={240} step={1}
          value={p.brushSize}
          onInput={(e)=>p.setBrushSize(parseInt((e.target as HTMLInputElement).value,10))}
          className="w-full"
        />
      </div>
    </div>
  )
}

const Toolbar: React.FC<Props> = (p) => {
  return isMobile ? <MobileToolbar {...p}/> : <DesktopToolbar {...p}/>
}

export default Toolbar
