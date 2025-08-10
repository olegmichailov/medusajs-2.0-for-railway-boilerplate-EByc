"use client"

import React, { useRef, useState } from "react"
import type { CSSProperties } from "react"
import { isMobile } from "react-device-detect"
import { clx } from "@medusajs/ui"

type Side = "front" | "back"
type Mode = "move" | "brush" | "erase" | "crop" | "text" | "primitive"
type Blend = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten"

type BrushCfg = { color: string; setColor: (v: string) => void; size: number; setSize: (v: number) => void }

type PrimitiveKind = "rect" | "circle" | "triangle" | "cross" | "line"

type DesignState = any // из EditorCanvas — нам достаточно передачи setDesign/ design

const glass =
  "backdrop-blur-md bg-white/70 border border-black/10 shadow-xl rounded-none"

const button =
  "px-3 py-2 border border-black/80 text-sm tracking-wide uppercase rounded-none hover:bg-black hover:text-white transition"

const buttonActive = "bg-black text-white"

function DragHandle({ children }: { children: React.ReactNode }) {
  return <div className="cursor-grab active:cursor-grabbing select-none text-xs uppercase tracking-wide">{children}</div>
}

const Toolbar: React.FC<{
  side: Side
  setSide: (s: Side) => void
  mode: Mode
  setMode: (m: Mode) => void
  brush: BrushCfg
  onAddImage: (f: File) => void
  onAddText: (s?: string) => void
  onAddPrimitive: (k: PrimitiveKind) => void
  onStartCrop: () => void
  onApplyCrop: () => void
  onCancelCrop: () => void
  cropping: boolean
  active: { id: string | null; type: "image" | "primitive" | "text" | null }
  setActive: (id: string | null, type: any) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  design: DesignState
  setDesign: (fn: (d: DesignState) => DesignState) => void
  accent: string
}> = (p) => {
  const [open, setOpen] = useState(true)
  const [pos, setPos] = useState<{ x: number; y: number }>(() =>
    isMobile ? { x: 0, y: 0 } : { x: 24, y: 120 }
  )
  const dragRef = useRef<HTMLDivElement | null>(null)
  const startPos = useRef<{ x: number; y: number } | null>(null)

  const onMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return
    startPos.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }
  const onMouseMove = (e: MouseEvent) => {
    if (!startPos.current) return
    setPos({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y })
  }
  const onMouseUp = () => {
    window.removeEventListener("mousemove", onMouseMove)
    window.removeEventListener("mouseup", onMouseUp)
    startPos.current = null
  }

  const fileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) p.onAddImage(f)
    e.currentTarget.value = ""
  }

  const setBlend = (b: Blend) =>
    p.setDesign((d) => {
      const mutate = (arr: any[]) => arr.map((x) => (x.id === p.active.id ? { ...x, blend: b } : x))
      if (d.images?.some((x: any) => x.id === p.active.id)) return { ...d, images: mutate(d.images) }
      if (d.primitives?.some((x: any) => x.id === p.active.id)) return { ...d, primitives: mutate(d.primitives) }
      if (d.texts?.some((x: any) => x.id === p.active.id)) return { ...d, texts: mutate(d.texts) }
      return d
    })

  const setOpacity = (val: number) =>
    p.setDesign((d) => {
      const mutate = (arr: any[]) => arr.map((x) => (x.id === p.active.id ? { ...x, opacity: val } : x))
      if (d.images?.some((x: any) => x.id === p.active.id)) return { ...d, images: mutate(d.images) }
      if (d.primitives?.some((x: any) => x.id === p.active.id)) return { ...d, primitives: mutate(d.primitives) }
      if (d.texts?.some((x: any) => x.id === p.active.id)) return { ...d, texts: mutate(d.texts) }
      return d
    })

  const setRaster = (val: number) =>
    p.setDesign((d) => {
      const mutate = (arr: any[]) => arr.map((x) => (x.id === p.active.id ? { ...x, raster: val } : x))
      if (d.images?.some((x: any) => x.id === p.active.id)) return { ...d, images: mutate(d.images) }
      if (d.primitives?.some((x: any) => x.id === p.active.id)) return { ...d, primitives: mutate(d.primitives) }
      return d
    })

  const removeActive = () =>
    p.setDesign((d) => ({
      ...d,
      images: d.images.filter((x: any) => x.id !== p.active.id),
      primitives: d.primitives.filter((x: any) => x.id !== p.active.id),
      texts: d.texts.filter((x: any) => x.id !== p.active.id),
    }))

  const dupActive = () =>
    p.setDesign((d) => {
      const im = d.images.find((x: any) => x.id === p.active.id)
      if (im) return { ...d, images: [...d.images, { ...im, id: "img_" + Date.now(), x: im.x + 30, y: im.y + 30 }] }
      const pr = d.primitives.find((x: any) => x.id === p.active.id)
      if (pr) return { ...d, primitives: [...d.primitives, { ...pr, id: "pr_" + Date.now(), x: pr.x + 30, y: pr.y + 30 }] }
      const tx = d.texts.find((x: any) => x.id === p.active.id)
      if (tx) return { ...d, texts: [...d.texts, { ...tx, id: "tx_" + Date.now(), x: tx.x + 30, y: tx.y + 30 }] }
      return d
    })

  const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
      className={clx(glass, "fixed z-40 p-4 w-[360px] max-w-[92vw]", isMobile ? "left-1/2 -translate-x-1/2 bottom-4" : "")}
      style={!isMobile ? ({ left: pos.x, top: pos.y } as CSSProperties) : undefined}
    >
      <div
        ref={dragRef}
        className="flex items-center justify-between mb-3"
        onMouseDown={onMouseDown}
      >
        <DragHandle>Tools</DragHandle>
        <button className={button} onClick={() => setOpen((s) => !s)}>
              {open ? "Close" : "Open"}
        </button>
      </div>
      {open && children}
    </div>
  )

  return (
    <Panel>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button className={clx(button, p.mode === "move" && buttonActive)} onClick={() => p.setMode("move")}>Move</button>
        <button className={clx(button, p.mode === "brush" && buttonActive)} onClick={() => p.setMode("brush")}>Brush</button>
        <button className={clx(button, p.mode === "erase" && buttonActive)} onClick={() => p.setMode("erase")}>Erase</button>
        <button className={clx(button, p.mode === "crop" && buttonActive)} onClick={() => (p.cropping ? p.onCancelCrop() : p.onStartCrop())}>
          {p.cropping ? "Cancel crop" : "Crop"}
        </button>
        <button className={clx(button, p.side === "front" && buttonActive)} onClick={() => p.setSide("front")}>Front</button>
        <button className={clx(button, p.side === "back" && buttonActive)} onClick={() => p.setSide("back")}>Back</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className={button}>
          <input type="file" accept="image/*" className="hidden" onChange={fileChange} />
          Add image
        </label>
        <button className={button} onClick={() => p.onAddText("Text")}>Add text</button>
        <button className={button} onClick={() => p.onAddPrimitive("rect")}>Square</button>
        <button className={button} onClick={() => p.onAddPrimitive("circle")}>Circle</button>
        <button className={button} onClick={() => p.onAddPrimitive("triangle")}>Triangle</button>
        <button className={button} onClick={() => p.onAddPrimitive("cross")}>Cross</button>
        <button className={button} onClick={() => p.onAddPrimitive("line")}>Line</button>
      </div>

      {/* настройки кисти */}
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide mb-1">Brush size: {p.brush.size}px</div>
        <input
          type="range"
          min={1}
          max={60}
          value={p.brush.size}
          onChange={(e) => p.brush.setSize(parseInt(e.target.value))}
          className="w-full h-[2px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
        />
        <div className="text-xs uppercase tracking-wide mt-3 mb-1">Brush color</div>
        <input type="color" value={p.brush.color} onChange={(e) => p.brush.setColor(e.target.value)} className="w-8 h-8 p-0 border rounded-none" />
      </div>

      {/* активный объект */}
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide mb-1">Selected opacity</div>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(
            (() => {
              const a = p.active
              const d = p.design
              const find = (arr: any[]) => arr.find((x) => x.id === a.id)?.opacity ?? 100
              if (a.type === "image") return (find(d.images) || 1) * 100
              if (a.type === "primitive") return (find(d.primitives) || 1) * 100
              if (a.type === "text") return (find(d.texts) || 1) * 100
              return 100
            })()
          )}
          onChange={(e) => setOpacity(parseInt(e.target.value) / 100)}
          className="w-full h-[2px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
        />

        <div className="text-xs uppercase tracking-wide mt-3 mb-1">Blend</div>
        <div className="grid grid-cols-3 gap-2">
          {(["normal","multiply","screen","overlay","darken","lighten"] as Blend[]).map((b) => (
            <button key={b} className={button} onClick={() => setBlend(b)}>{b}</button>
          ))}
        </div>

        <div className="text-xs uppercase tracking-wide mt-3 mb-1">Raster (halftone)</div>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={0}
          onChange={(e) => setRaster(parseInt(e.target.value) / 100)}
          className="w-full h-[2px] bg-black appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
        />

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button className={button} onClick={dupActive}>Duplicate</button>
          <button className={button} onClick={removeActive}>Delete</button>
          {p.cropping ? (
            <button className={button + " " + buttonActive} onClick={p.onApplyCrop}>Apply crop</button>
          ) : (
            <button className={button} onClick={p.onStartCrop}>Start crop</button>
          )}
        </div>
      </div>

      {/* управление штрихами и экспортом */}
      <div className="grid grid-cols-3 gap-2">
        <button
          className={button}
          onClick={() => p.setDesign((d) => ({ ...d, strokes: [] }))}
        >
          Clear strokes
        </button>
        <button className={button} onClick={p.onDownloadFront}>Download Front</button>
        <button className={button} onClick={p.onDownloadBack}>Download Back</button>
      </div>

      <div className="text-[11px] mt-4 leading-snug opacity-70">
        Shortcuts: Delete — remove, ⌘/Ctrl+C / ⌘/Ctrl+V — copy/paste, ⌘/Ctrl+D — duplicate, [ / ] — layer back/forward,
        Shift + / Shift − — blend mode. Brush/Eraser on mobile — нижняя панель, жесты скролла заблокированы внутри сцены.
      </div>
    </Panel>
  )
}

export default Toolbar
