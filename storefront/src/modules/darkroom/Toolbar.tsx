
"use client"

import React, { useEffect, useMemo, useRef } from "react"
import { isMobile } from "react-device-detect"
import { ShapeKind, Side, Tool } from "./store"
import type { LayerType } from "./EditorCanvas"

type Props = {
  // global
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (c: string) => void
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

  // selection (context)
  selectedKind: LayerType | null
  selectedProps: any
  setSelectedFill: (v: string) => void
  setSelectedStroke: (v: string) => void
  setSelectedStrokeW: (v: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (c: string) => void

  // ops
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange: (h: number) => void
}

const squareBtn =
  "inline-flex items-center justify-center w-12 h-12 border border-black/80 bg-white active:scale-[0.98]"

const row = "flex items-center gap-3"
const col = "flex flex-col gap-3"

// desktop palette (like your screenshot)
const DESKTOP_COLORS = [
  "#000000","#353535","#6B6B6B","#9C9C9C","#D2D2D2","#FFFFFF",
  "#FF2B7F","#FF6A00","#FFC400","#FFE600","#7FFF00","#00E4A6",
]

function HiddenPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <button
        className={squareBtn}
        style={{ background: value }}
        aria-label="Color"
        onClick={() => ref.current?.click()}
      />
      <input
        ref={ref}
        type="color"
        className="sr-only"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export default function Toolbar(p: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  // report height to canvas for paddingBottom (mobile)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new (window as any).ResizeObserver((entries: any[]) => {
      const h = Math.ceil(entries[0].contentRect.height)
      p.onHeightChange(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ToolBtn = ({
    t,
    label,
    onClick,
    active,
  }: { t?: Tool; label: string; onClick?: () => void; active?: boolean }) => (
    <button
      className={`${squareBtn} ${active ? "bg-black text-white" : ""}`}
      aria-label={label}
      onClick={onClick || (() => p.setTool(t!) )}
    >
      <span className="text-xs font-bold">{label}</span>
    </button>
  )

  const ShapeBtn = ({ k, label }: { k: ShapeKind; label: string }) => (
    <button
      className={squareBtn}
      aria-label={label}
      onClick={() => { p.setShapeKind(k); p.onAddShape(k) }}
    >
      <span className="text-xs">{label}</span>
    </button>
  )

  const SideBtn = ({ tgt, onDownload }: { tgt: Side; onDownload: () => void }) => {
    const active = p.side === tgt
    return (
      <div className="flex">
        <button
          className={`px-4 h-10 border border-black/80 ${active ? "bg-black text-white" : "bg-white"}`}
          onClick={() => p.setSide(tgt)}
        >
          {tgt.toUpperCase()}
        </button>
        <button
          className="h-10 px-3 border border-l-0 border-black/80 bg-white"
          title="Download"
          onClick={onDownload}
        >
          ⬇
        </button>
      </div>
    )
  }

  const Slider = ({
    min, max, value, onChange, label
  }: { min: number; max: number; value: number; onChange: (v: number)=>void; label: string }) => (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-16">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => onChange(Number((e.target as HTMLInputElement).value))}
        className="w-40"
      />
      <span className="tabular-nums w-8 text-right">{value}</span>
    </label>
  )

  // ========== Desktop ==========
  if (!isMobile) {
    return (
      <div
        ref={hostRef}
        className="fixed left-6 top-[120px] w-[200px] bg-white border border-black/10 rounded-sm p-3"
        style={{ zIndex: 20 }}
      >
        <div className={col}>
          <div className={row}>
            <ToolBtn t="move"  label="↔" active={p.tool==="move"} />
            <ToolBtn t="brush" label="✚" active={p.tool==="brush"} />
            <ToolBtn t="erase" label="⌫" active={p.tool==="erase"} />
            <ToolBtn label="T" onClick={p.onAddText} />
            <ToolBtn label="▦" onClick={() => p.toggleLayers()} active={p.layersOpen} />
          </div>

          <div className={row}>
            <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
            {DESKTOP_COLORS.map((c) => (
              <button
                key={c}
                className={`${squareBtn} w-6 h-6`}
                style={{ background: c }}
                onClick={() => p.setBrushColor(c)}
              />
            ))}
          </div>

          <div className={row}>
            <ShapeBtn k="line" label="—" />
            <ShapeBtn k="square" label="□" />
            <ShapeBtn k="circle" label="●" />
            <ShapeBtn k="triangle" label="△" />
            <ShapeBtn k="cross" label="✚" />
          </div>

          <div className="flex flex-col gap-2">
            <input
              placeholder="Enter text"
              className="border border-black/40 px-2 py-1 text-sm"
              value={p.selectedKind==="text" ? (p.selectedProps.text || "") : ""}
              onChange={(e) => p.setSelectedText(e.target.value)}
            />
            <Slider
              min={8} max={180}
              value={Math.round(p.selectedKind==="text" ? (p.selectedProps.fontSize || 96) : 96)}
              onChange={(v) => p.setSelectedFontSize(v)}
              label="Font size"
            />
          </div>

          <div className={row}>
            <SideBtn tgt="front" onDownload={p.onDownloadFront} />
            <SideBtn tgt="back"  onDownload={p.onDownloadBack} />
          </div>

          <div className="flex items-center gap-2">
            <button className={squareBtn} title="Undo" onClick={p.onUndo}>↶</button>
            <button className={squareBtn} title="Redo" onClick={p.onRedo}>↷</button>
            <button className={squareBtn} title="Clear" onClick={p.onClear}>🗑</button>
          </div>

          <Slider
            min={1} max={112}
            value={Math.round(p.brushSize)}
            onChange={p.setBrushSize}
            label="Brush"
          />
        </div>
      </div>
    )
  }

  // ========== Mobile ==========
  const toolRow = (
    <div className="grid grid-cols-10 gap-2">
      <ToolBtn t="move"  label="↔" active={p.tool==="move"} />
      <ToolBtn t="brush" label="✚" active={p.tool==="brush"} />
      <ToolBtn t="erase" label="⌫" active={p.tool==="erase"} />
      <ToolBtn label="T" onClick={p.onAddText} />
      <ToolBtn label="🖼" onClick={() => {
        const i = document.createElement("input")
        i.type = "file"
        i.accept = "image/*"
        i.onchange = () => {
          const f = i.files?.[0]
          if (f) p.onUploadImage(f)
        }
        i.click()
      }} />
      <ToolBtn label="□" onClick={() => p.onAddShape("square")} />
      <ToolBtn label="●" onClick={() => p.onAddShape("circle")} />
      <ToolBtn label="△" onClick={() => p.onAddShape("triangle")} />
      <ToolBtn label="✚" onClick={() => p.onAddShape("cross")} />
      <ToolBtn label="▦" onClick={() => p.toggleLayers()} active={p.layersOpen} />
    </div>
  )

  const contextRow = useMemo(() => {
    if (p.tool === "brush" || p.tool === "erase") {
      return (
        <div className="flex items-center justify-between gap-4">
          <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
          <Slider min={1} max={112} value={Math.round(p.brushSize)} onChange={p.setBrushSize} label="Brush" />
        </div>
      )
    }
    if (p.selectedKind === "text") {
      return (
        <div className="flex flex-col gap-2">
          <input
            className="border border-black/40 px-2 py-1 text-sm"
            placeholder="Enter text"
            value={p.selectedProps.text || ""}
            onChange={(e)=>p.setSelectedText(e.target.value)}
          />
          <Slider
            min={8} max={180}
            value={Math.round(p.selectedProps.fontSize || 96)}
            onChange={p.setSelectedFontSize}
            label="Font size"
          />
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2">
        {DESKTOP_COLORS.map((c)=>(
          <button key={c} className="w-6 h-6 border border-black/40" style={{background:c}} onClick={()=>p.setBrushColor(c)}/>
        ))}
        <HiddenPicker value={p.brushColor} onChange={p.setBrushColor} />
      </div>
    )
  }, [p.tool, p.selectedKind, p.selectedProps, p.brushColor, p.brushSize])

  return (
    <div
      ref={hostRef}
      className="fixed left-0 right-0 bottom-0 bg-white border-t border-black/10 p-3"
      style={{ zIndex: 20 }}
    >
      <div className="flex flex-col gap-3">
        {toolRow}
        {contextRow}
        <div className="flex items-center justify-between gap-3">
          <SideBtn tgt="front" onDownload={p.onDownloadFront} />
          <div className="flex gap-2">
            <button className={squareBtn} onClick={p.onUndo}>↶</button>
            <button className={squareBtn} onClick={p.onRedo}>↷</button>
            <button className={squareBtn} onClick={p.onClear}>🗑</button>
          </div>
          <SideBtn tgt="back" onDownload={p.onDownloadBack} />
        </div>
      </div>
    </div>
  )
}
