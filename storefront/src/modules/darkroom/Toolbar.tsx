"use client"

import React, { useMemo, useRef } from "react"
import { isMobile } from "react-device-detect"
import { Blend, ShapeKind, Side, Tool } from "./store"

type LayerItem = {
  id: string
  name: string
  type: string
  visible: boolean
  locked: boolean
  blend: Blend
  opacity: number
}

type MobileLayersProps = {
  items: LayerItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, b: string) => void
  onChangeOpacity: (id: string, o: number) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}

type ToolbarProps = {
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
  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  onClear: () => void
  toggleLayers: () => void
  layersOpen: boolean

  selectedKind: string | null
  selectedProps: any
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (s: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (s: string) => void
  setSelectedColor: (s: string) => void
  setSelectedLineHeight?: (n: number) => void
  setSelectedLetterSpacing?: (n: number) => void
  setSelectedAlign?: (a: "left" | "center" | "right") => void

  mobileTopOffset: number
  mobileLayers: MobileLayersProps
}

const PALETTE = [
  "#000000","#333333","#666666","#999999","#CCCCCC","#FFFFFF",
  "#FF0033","#FF0066","#FF0099","#FF00CC","#FF00FF","#CC00FF",
  "#9900FF","#6600FF","#3300FF","#0000FF","#0033FF","#0066FF",
  "#0099FF","#00CCFF","#00FFFF","#00FFCC","#00FF99","#00FF66",
  "#00FF33","#00FF00","#33FF00","#66FF00","#99FF00","#CCFF00",
  "#FFFF00","#FFCC00","#FF9900","#FF6600","#FF3300"
]

const card = "bg-white border border-black/10 shadow-sm"
const btn   = "h-8 px-2 border border-black/20 bg-white hover:bg-black/5 text-[12px] leading-8"
const btnBlk= "h-9 px-3 border border-black text-white bg-black hover:bg-black/90 text-[12px] leading-9"
const row   = "flex items-center gap-2"
const col   = "flex flex-col gap-2"
const label = "text-[11px] uppercase tracking-[0.12em] text-black/70"
const input = "w-full h-9 px-2 border border-black/20 bg-white text-[12px]"

export default function Toolbar(props: ToolbarProps) {
  if (isMobile) return <MobileToolbar {...props} />
  return <DesktopToolbar {...props} />
}

function DesktopToolbar({
  side,setSide,tool,setTool,brushColor,setBrushColor,brushSize,setBrushSize,
  onUploadImage,onAddText,onAddShape,onDownloadFront,onDownloadBack,onClear,
  toggleLayers,layersOpen,selectedKind,selectedProps,setSelectedText,setSelectedFontSize,
  setSelectedLineHeight,setSelectedLetterSpacing,setSelectedAlign,setSelectedColor
}: ToolbarProps) {

  const fileRef = useRef<HTMLInputElement>(null)

  const controlsForText = (
    <div className={col}>
      <div className={label}>Text</div>
      <textarea
        className={input}
        rows={3}
        value={selectedKind==="text" ? (selectedProps.text ?? "") : ""}
        placeholder="Type here…"
        onChange={(e)=> selectedKind==="text" && setSelectedText(e.target.value)}
      />
      <div className={row}>
        <button className={btn} onClick={()=>setSelectedAlign?.("left")}>L</button>
        <button className={btn} onClick={()=>setSelectedAlign?.("center")}>C</button>
        <button className={btn} onClick={()=>setSelectedAlign?.("right")}>R</button>
      </div>
      <div className={col}>
        <div className={row + " justify-between"}>
          <span className={label}>Font size</span>
          <input
            className="w-[56px] h-7 px-1 border border-black/20 text-[12px] text-right"
            type="number"
            min={8} max={800}
            value={selectedKind==="text" ? (selectedProps.fontSize ?? 96) : 96}
            onChange={(e)=> selectedKind==="text" && setSelectedFontSize(parseInt(e.target.value||"0",10))}
          />
        </div>
        <input
          type="range" min={8} max={800} step={1}
          value={selectedKind==="text" ? (selectedProps.fontSize ?? 96) : 96}
          onChange={(e)=> selectedKind==="text" && setSelectedFontSize(parseInt(e.target.value,10))}
        />
      </div>

      <div className={col}>
        <div className={row + " justify-between"}>
          <span className={label}>Line</span>
          <span className="text-[11px]">{selectedKind==="text" ? (selectedProps.lineHeight ?? 1).toFixed(2) : "1.00"}</span>
        </div>
        <input
          type="range" min={0.6} max={4} step={0.01}
          value={selectedKind==="text" ? (selectedProps.lineHeight ?? 1) : 1}
          onChange={(e)=> selectedKind==="text" && setSelectedLineHeight?.(parseFloat(e.target.value))}
        />
      </div>

      <div className={col}>
        <div className={row + " justify-between"}>
          <span className={label}>Letter</span>
          <span className="text-[11px]">{selectedKind==="text" ? (selectedProps.letterSpacing ?? 0).toFixed(2) : "0.00"}</span>
        </div>
        <input
          type="range" min={-0.2} max={2} step={0.01}
          value={selectedKind==="text" ? (selectedProps.letterSpacing ?? 0) : 0}
          onChange={(e)=> selectedKind==="text" && setSelectedLetterSpacing?.(parseFloat(e.target.value))}
        />
      </div>
    </div>
  )

  return (
    <div className="fixed left-4 top-[88px] z-30">
      <div className={`w-[190px] p-2 ${card}`}>
        {/* Заголовок + кнопки управления как на скрине */}
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] tracking-[0.12em] uppercase">Tools</div>
          <div className="flex items-center gap-1">
            <button className={btn} onClick={toggleLayers}>☐</button>
            <button className={btn} onClick={onClear}>×</button>
          </div>
        </div>

        {/* Ряд инструментов */}
        <div className={row + " mb-2"}>
          <button className={btn + (tool==="move"?" bg-black text-white":"")} onClick={()=>setTool("move")}>Move</button>
          <button className={btn + (tool==="brush"?" bg-black text-white":"")} onClick={()=>setTool("brush")}>Brush</button>
          <button className={btn + (tool==="erase"?" bg-black text-white":"")} onClick={()=>setTool("erase")}>Erase</button>
        </div>
        <div className={row + " mb-2"}>
          <button className={btn} onClick={onAddText}>Text</button>
          <button className={btn} onClick={()=>fileRef.current?.click()}>Img</button>
          <button className={btn} onClick={()=>onAddShape("circle")}>●</button>
          <button className={btn} onClick={()=>onAddShape("square")}>■</button>
          <button className={btn} onClick={()=>onAddShape("triangle")}>▲</button>
          <button className={btn} onClick={()=>onAddShape("line")}>—</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value="" }}
        />

        {/* Цвет */}
        <div className={col + " mb-2"}>
          <div className={label}>Color</div>
          <div className="grid grid-cols-6 gap-[6px]">
            {PALETTE.map((c)=>(
              <button
                key={c}
                className="h-4 w-4 border border-black/20"
                style={{background:c}}
                onClick={()=>{ setSelectedColor(c); setBrushColor(c) }}
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* Настройки инструмента */}
        {tool==="brush" && (
          <div className={col + " mb-2"}>
            <div className={label}>Brush size</div>
            <input type="range" min={1} max={64} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}/>
          </div>
        )}

        {tool==="erase" && (
          <div className={col + " mb-2"}>
            <div className={label}>Eraser</div>
            <input type="range" min={4} max={96} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}/>
          </div>
        )}

        {selectedKind==="text" && <div className="mb-2">{controlsForText}</div>}

        {/* Переключатель сторон и скачивание */}
        <div className={row + " mt-2"}>
          <button className={btnBlk + (side==="front"?"":" bg-white text-black")} onClick={()=>setSide("front")}>FRONT</button>
          <button className={btnBlk + (side==="back" ?"":" bg-white text-black")} onClick={()=>setSide("back")}>BACK</button>
        </div>

        <div className={row + " mt-2"}>
          <button className={btn} onClick={onDownloadFront}>DL FRONT</button>
          <button className={btn} onClick={onDownloadBack}>DL BACK</button>
        </div>
      </div>
    </div>
  )
}

/** ---------------- MOBILE (3 строки) ---------------- */
function MobileToolbar({
  side,setSide,tool,setTool,brushColor,setBrushColor,brushSize,setBrushSize,
  onUploadImage,onAddText,onAddShape,onDownloadFront,onDownloadBack,onClear,
  selectedKind,selectedProps,setSelectedText,setSelectedFontSize,setSelectedLineHeight,
  setSelectedLetterSpacing,setSelectedAlign,setSelectedColor
}: ToolbarProps) {

  const fileRef = useRef<HTMLInputElement>(null)

  // строка 3 — палитра всегда
  const palette = (
    <div className="grid grid-cols-12 gap-1 px-2 py-2">
      {PALETTE.map((c)=>(
        <button
          key={c}
          className="h-6 w-full border border-black/20"
          style={{background:c}}
          onClick={()=>{ setSelectedColor(c); setBrushColor(c) }}
          aria-label={c}
        />
      ))}
    </div>
  )

  // строка 2 — настройки по инструменту
  const settings = (
    <div className="px-2 py-2">
      {tool==="brush" && (
        <div className={col}>
          <div className="flex items-center justify-between text-[11px]">
            <span>Brush size</span><span>{brushSize}</span>
          </div>
          <input type="range" min={1} max={64} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}/>
        </div>
      )}
      {tool==="erase" && (
        <div className={col}>
          <div className="flex items-center justify-between text-[11px]">
            <span>Eraser</span><span>{brushSize}</span>
          </div>
          <input type="range" min={4} max={96} step={1} value={brushSize} onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}/>
        </div>
      )}
      {selectedKind==="text" && (
        <div className={col}>
          <textarea
            className="w-full h-10 px-2 py-1 border border-black/20 text-[12px]"
            value={selectedProps.text ?? ""}
            placeholder="Text…"
            onChange={(e)=>setSelectedText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-2">
            <button className={btn} onClick={()=>setSelectedAlign?.("left")}>L</button>
            <button className={btn} onClick={()=>setSelectedAlign?.("center")}>C</button>
            <button className={btn} onClick={()=>setSelectedAlign?.("right")}>R</button>
            <input
              type="number"
              className="ml-auto w-[70px] h-8 px-2 border border-black/20 text-[12px]"
              min={8} max={800}
              value={selectedProps.fontSize ?? 96}
              onChange={(e)=>setSelectedFontSize(parseInt(e.target.value||"0",10))}
            />
          </div>
          <input
            type="range" min={8} max={800} step={1}
            value={selectedProps.fontSize ?? 96}
            onChange={(e)=>setSelectedFontSize(parseInt(e.target.value,10))}
          />
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px]"><span>Line</span><span>{(selectedProps.lineHeight ?? 1).toFixed(2)}</span></div>
            <input type="range" min={0.6} max={4} step={0.01} value={selectedProps.lineHeight ?? 1} onChange={(e)=>setSelectedLineHeight?.(parseFloat(e.target.value))}/>
          </div>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px]"><span>Letter</span><span>{(selectedProps.letterSpacing ?? 0).toFixed(2)}</span></div>
            <input type="range" min={-0.2} max={2} step={0.01} value={selectedProps.letterSpacing ?? 0} onChange={(e)=>setSelectedLetterSpacing?.(parseFloat(e.target.value))}/>
          </div>
        </div>
      )}
    </div>
  )

  // строка 1 — кнопки инструментов и стороны/скачивание
  const row1 = (
    <div className="px-2 py-2 flex items-center gap-2 overflow-x-auto">
      <button className={btn + (tool==="move"?" bg-black text-white":"")} onClick={()=>setTool("move")}>Move</button>
      <button className={btn + (tool==="brush"?" bg-black text-white":"")} onClick={()=>setTool("brush")}>Brush</button>
      <button className={btn + (tool==="erase"?" bg-black text-white":"")} onClick={()=>setTool("erase")}>Erase</button>
      <button className={btn} onClick={onAddText}>Text</button>
      <button className={btn} onClick={()=>fileRef.current?.click()}>Img</button>
      <button className={btn} onClick={()=>onAddShape("circle")}>●</button>
      <button className={btn} onClick={()=>onAddShape("square")}>■</button>
      <button className={btn} onClick={()=>onAddShape("triangle")}>▲</button>
      <button className={btn} onClick={()=>onAddShape("line")}>—</button>
      <span className="mx-1" />
      <button className={btn + (side==="front"?" bg-black text-white":"")} onClick={()=>setSide("front")}>Front</button>
      <button className={btn + (side==="back" ?" bg-black text-white":"")} onClick={()=>setSide("back")}>Back</button>
      <button className={btn} onClick={onDownloadFront}>DL F</button>
      <button className={btn} onClick={onDownloadBack}>DL B</button>
      <button className={btn} onClick={onClear}>Clear</button>
    </div>
  )

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUploadImage(f); e.currentTarget.value="" }}
      />
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-black/10">
        {row1}
        {settings}
        {palette}
      </div>
    </>
  )
}
