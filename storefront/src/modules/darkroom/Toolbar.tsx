"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import { clx } from "@medusajs/ui"
import {
  Move, Brush, Eraser, Type as TypeIcon, Shapes, Image as ImageIcon, Crop,
  Download, PanelRightOpen, PanelRightClose, Circle, Square, Triangle, Plus, Slash,
  Eye, EyeOff, Lock, Unlock, Copy, Trash2
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import type { LayerItem } from "./LayersPanel"

const wrap = "backdrop-blur bg-white/90 border border-black/10 shadow-xl rounded-none"
const btn  = "w-10 h-10 grid place-items-center border border-black/80 text-[11px] rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-5 h-5"

type MobileLayersBag = {
  items: LayerItem[]
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
  onReorder?: (srcId: string, destId: string, place: "before" | "after") => void
}

type Props = {
  // shared
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (v: string) => void
  brushSize: number
  setBrushSize: (n: number) => void
  textValue: string
  setTextValue: (v: string) => void
  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void
  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  startCrop: () => void
  applyCrop: () => void
  cancelCrop: () => void
  isCropping: boolean
  onDownloadFront: () => void
  onDownloadBack: () => void

  // desktop only
  toggleLayers: () => void
  layersOpen: boolean

  // mobile only
  isMobile?: boolean
  mobileOpen?: boolean
  openMobile?: () => void
  closeMobile?: () => void
  mobileLayers: MobileLayersBag
}

export default function Toolbar(props: Props) {
  const {
    side, setSide, tool, setTool, brushColor, setBrushColor, brushSize, setBrushSize,
    textValue, setTextValue, shapeKind, setShapeKind,
    onUploadImage, onAddText, onAddShape,
    startCrop, applyCrop, cancelCrop, isCropping,
    onDownloadFront, onDownloadBack,
    toggleLayers, layersOpen,
    isMobile = false, mobileOpen, openMobile, closeMobile, mobileLayers
  } = props

  // ----- shared refs -----
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // =========================================================================================
  // DESKTOP UI (плавающая панель инструментов; слои — отдельная панель, как у тебя сейчас)
  // =========================================================================================
  const [deskOpen, setDeskOpen] = useState(true)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 120 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  const onDragStart = (e: React.MouseEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    window.addEventListener("mousemove", onDragMove)
    window.addEventListener("mouseup", onDragEnd)
  }
  const onDragMove = (e: MouseEvent) => {
    if (!drag.current) return
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy })
  }
  const onDragEnd = () => {
    drag.current = null
    window.removeEventListener("mousemove", onDragMove)
    window.removeEventListener("mouseup", onDragEnd)
  }

  // =========================================================================================
  // MOBILE UI (кнопка Create снизу + шторка с вкладками Tools/Layers) + DnD слоёв
  // =========================================================================================
  const [tab, setTab] = useState<"tools" | "layers">("tools")
  const [mobileOpenLocal, setMobileOpenLocal] = useState(false)
  const mOpen = mobileOpen ?? mobileOpenLocal
  const mOpenSet = (v: boolean) => {
    if (mobileOpen === undefined) setMobileOpenLocal(v)
    else v ? openMobile?.() : closeMobile?.()
  }

  // блокируем бэкскролл body, пока открыта шторка (мобила)
  useEffect(() => {
    if (!isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = mOpen ? "hidden" : prev || "hidden"
    return () => { document.body.style.overflow = prev }
  }, [isMobile, mOpen])

  // ---- DnD слоёв (long-press) ----
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [pressTimer, setPressTimer] = useState<number | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const beginLongPress = (id: string) => {
    if (pressTimer) window.clearTimeout(pressTimer)
    const t = window.setTimeout(() => setDragId(id), 250)
    setPressTimer(t)
  }
  const clearLongPress = () => {
    if (pressTimer) window.clearTimeout(pressTimer)
    setPressTimer(null)
  }

  const onRowPointerDown = (id: string) => beginLongPress(id)
  const onRowPointerUp = () => { clearLongPress(); finishDrag() }
  const onRowPointerCancel = () => { clearLongPress(); cancelDrag() }

  const onRowPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!dragId) return
    const y = e.clientY
    // найдём ближайшую строку
    let bestId: string | null = null
    let bestDist = Infinity
    for (const it of mobileLayers.items) {
      const el = rowRefs.current[it.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) {
        const d = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom))
        if (d < bestDist) { bestDist = d; bestId = it.id }
      }
    }
    setOverId(bestId)
  }

  const finishDrag = () => {
    if (dragId && overId && overId !== dragId && mobileLayers.onReorder) {
      // решаем before/after по половинке
      const el = rowRefs.current[overId]
      if (el) {
        const rect = el.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        const place: "before" | "after" =
          (window as any)._lastPointerY && (window as any)._lastPointerY < mid ? "before" : "after"
        mobileLayers.onReorder(dragId, overId, place)
      }
    }
    setDragId(null)
    setOverId(null)
  }

  const cancelDrag = () => {
    setDragId(null)
    setOverId(null)
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => { ;(window as any)._lastPointerY = e.clientY }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => window.removeEventListener("pointermove", onMove)
  }, [])

  // =========================================================================================
  // RENDER
  // =========================================================================================

  // ——— Desktop panel ———
  const desktopPanel = (
    <div className={wrap + " fixed z-40 w-[380px] p-3"} style={{ left: pos.x, top: pos.y }}>
      <div className="flex items-center justify-between mb-3 select-none" onMouseDown={onDragStart}>
        <div className="text-[11px] uppercase">Tools</div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={toggleLayers} title="Layers">
            {layersOpen ? <PanelRightClose className={ico}/> : <PanelRightOpen className={ico}/>}
          </button>
          <button className={btn} onClick={() => setDeskOpen(!deskOpen)} title="Close / Open">
            {deskOpen ? "×" : "≡"}
          </button>
        </div>
      </div>

      {deskOpen && (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-2">
            <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
            <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
            <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
            <button className={btn} onClick={onAddText} title="Text"><TypeIcon className={ico}/></button>
            <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
            <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
            <button
              className={clx(btn, tool==="crop" && "bg-black text-white")}
              onClick={()=> (isCropping ? applyCrop() : startCrop())}
              onContextMenu={(e)=>{ e.preventDefault(); if (isCropping) cancelCrop() }}
              title={isCropping ? "Apply crop (tap). Hold to cancel." : "Crop"}
            >
              <Crop className={ico}/>
            </button>
          </div>

          {(tool==="brush" || tool==="erase") && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
              <input
                type="range" min={1} max={120} value={brushSize}
                onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                className="w-full appearance-none h-[3px] bg-black
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
              />
              <div className="text-[11px] uppercase">Color</div>
              <input
                type="color" value={brushColor}
                onChange={(e)=> setBrushColor(e.target.value)}
                className="w-10 h-10 border border-black rounded-none"
              />
            </div>
          )}

          {tool==="shape" && (
            <div className="grid grid-cols-5 gap-2">
              <button className={btn} onClick={()=>onAddShape("circle")}   title="Circle"><Circle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("square")}   title="Square"><Square className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("cross")}    title="Cross"><Plus className={ico}/></button>
              <button className={btn} onClick={()=>onAddShape("line")}     title="Line"><Slash className={ico}/></button>
            </div>
          )}

          {tool==="text" && (
            <div className="space-y-2 border-t pt-2">
              <div className="text-[11px] uppercase">Text</div>
              <input
                type="text"
                value={textValue}
                onChange={(e)=> setTextValue(e.target.value)}
                className="w-full border px-2 py-1 text-sm rounded-none"
                placeholder="Enter text…"
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
            <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
            <button className={btn} onClick={onDownloadFront} title="Download front"><Download className={ico}/></button>
            <button className={btn} onClick={onDownloadBack}  title="Download back"><Download className={ico}/></button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
        </div>
      )}
    </div>
  )

  // ——— Mobile bar + sheet ———
  const mobileBar = (
    <>
      {/* Нижняя кнопка */}
      <div className="fixed left-0 right-0 bottom-0 z-40 grid place-items-center pointer-events-none">
        <div className="pointer-events-auto mb-[env(safe-area-inset-bottom,12px)]">
          <button
            className="px-6 h-12 min-w-[160px] bg-black text-white text-sm tracking-wide uppercase rounded-none shadow-lg active:scale-[.98] transition"
            onClick={()=> mOpenSet(true)}
          >
            Create
          </button>
        </div>
      </div>

      {/* Шторка */}
      {mOpen && (
        <div className="fixed inset-0 z-50" onClick={()=>mOpenSet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 right-0 bottom-0 bg-white border-t border-black/10 shadow-2xl rounded-t-[10px]"
            style={{ height: "65vh" }}
            onClick={(e)=>e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <div className="flex gap-1">
                <button
                  className={clx("px-3 h-9 border text-xs rounded-none", tab==="tools" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setTab("tools")}
                >
                  Tools
                </button>
                <button
                  className={clx("px-3 h-9 border text-xs rounded-none", tab==="layers" ? "bg-black text-white" : "bg-white")}
                  onClick={()=>setTab("layers")}
                >
                  Layers
                </button>
              </div>
              <button className="px-3 h-9 border text-xs rounded-none" onClick={()=>mOpenSet(false)}>Close</button>
            </div>

            {/* content */}
            <div className="h-[calc(65vh-44px)] overflow-auto px-3 py-2 space-y-3">
              {tab === "tools" && (
                <>
                  <div className="grid grid-cols-6 gap-2">
                    <button className={clx(btn, tool==="move" && "bg-black text-white")}  onClick={()=>setTool("move")}  title="Move"><Move className={ico}/></button>
                    <button className={clx(btn, tool==="brush" && "bg-black text-white")} onClick={()=>setTool("brush")} title="Brush"><Brush className={ico}/></button>
                    <button className={clx(btn, tool==="erase" && "bg-black text-white")} onClick={()=>setTool("erase")} title="Eraser"><Eraser className={ico}/></button>
                    <button className={btn} onClick={()=>{ onAddText(); setTool("text") }} title="Text"><TypeIcon className={ico}/></button>
                    <button className={clx(btn, tool==="shape" && "bg-black text-white")} onClick={()=>setTool("shape")} title="Shapes"><Shapes className={ico}/></button>
                    <button className={btn} onClick={()=>fileRef.current?.click()} title="Image"><ImageIcon className={ico}/></button>
                  </div>

                  {(tool==="brush" || tool==="erase") && (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase">Brush size: {brushSize}px</div>
                      <input
                        type="range" min={1} max={120} value={brushSize}
                        onChange={(e)=>setBrushSize(parseInt(e.target.value,10))}
                        className="w-full appearance-none h-[3px] bg-black
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                        [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:rounded-none"
                      />
                      <div className="text-[11px] uppercase">Color</div>
                      <input
                        type="color" value={brushColor}
                        onChange={(e)=> setBrushColor(e.target.value)}
                        className="w-9 h-9 border border-black rounded-none"
                      />
                    </div>
                  )}

                  {tool==="shape" && (
                    <div className="grid grid-cols-5 gap-2">
                      <button className={btn} onClick={()=>onAddShape("circle")}   title="Circle"><Circle className={ico}/></button>
                      <button className={btn} onClick={()=>onAddShape("square")}   title="Square"><Square className={ico}/></button>
                      <button className={btn} onClick={()=>onAddShape("triangle")} title="Triangle"><Triangle className={ico}/></button>
                      <button className={btn} onClick={()=>onAddShape("cross")}    title="Cross"><Plus className={ico}/></button>
                      <button className={btn} onClick={()=>onAddShape("line")}     title="Line"><Slash className={ico}/></button>
                    </div>
                  )}

                  {tool==="text" && (
                    <div className="space-y-2 border-t pt-2">
                      <div className="text-[11px] uppercase">Text</div>
                      <input
                        type="text"
                        value={textValue}
                        onChange={(e)=> setTextValue(e.target.value)}
                        className="w-full border px-2 py-1 text-sm rounded-none"
                        placeholder="Enter text…"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2">
                    <button className={clx(btn, side==="front" && "bg-black text-white")} onClick={()=>setSide("front")}>Front</button>
                    <button className={clx(btn, side==="back" && "bg-black text-white")}  onClick={()=>setSide("back")}>Back</button>
                    <button className={btn} onClick={onDownloadFront} title="Download front"><Download className={ico}/></button>
                    <button className={btn} onClick={onDownloadBack}  title="Download back"><Download className={ico}/></button>
                  </div>

                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
                </>
              )}

              {tab === "layers" && (
                <div className="space-y-2">
                  {mobileLayers.items.length === 0 && (
                    <div className="text-xs text-black/60">No layers yet.</div>
                  )}
                  {mobileLayers.items.map((it) => (
                    <div
                      key={it.id}
                      ref={(el) => (rowRefs.current[it.id] = el)}
                      className={clx(
                        "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none select-none",
                        dragId === it.id ? "bg-black text-white opacity-90" :
                        overId === it.id ? "bg-black/5" : "bg-white"
                      )}
                      onPointerDown={() => onRowPointerDown(it.id)}
                      onPointerMove={onRowPointerMove}
                      onPointerUp={onRowPointerUp}
                      onPointerCancel={onRowPointerCancel}
                      onClick={() => { if (!dragId) mobileLayers.onSelect(it.id) }}
                    >
                      <div className="w-3 h-6 grid place-items-center">
                        <div className="w-2 h-4 border border-current" />
                      </div>

                      <div className="text-xs flex-1 truncate">{it.name}</div>

                      {/* Blend (компактно) */}
                      <select
                        className={clx(
                          "h-8 px-1 border rounded-none text-xs bg-transparent",
                          dragId === it.id ? "border-white/40" : "border-black/30"
                        )}
                        value={it.blend}
                        onChange={(e) => mobileLayers.onChangeBlend(it.id, e.target.value)}
                        onPointerDown={(e)=>e.stopPropagation()}
                      >
                        {["source-over","multiply","screen","overlay","darken","lighten","xor"].map(b =>
                          <option key={b} value={b}>{b}</option>
                        )}
                      </select>

                      {/* Opacity */}
                      <input
                        type="range" min={10} max={100}
                        value={Math.round(it.opacity * 100)}
                        onChange={(e)=>mobileLayers.onChangeOpacity(it.id, parseInt(e.target.value,10)/100)}
                        onPointerDown={(e)=>e.stopPropagation()}
                        className="w-20 h-[2px] bg-black appearance-none
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                          [&::-webkit-slider-thumb]:bg-current [&::-webkit-slider-thumb]:rounded-none"
                      />

                      {/* controls */}
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onPointerDown={(e)=>e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); mobileLayers.onToggleVisible(it.id) }}
                        title={it.visible ? "Hide" : "Show"}
                      >
                        {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onPointerDown={(e)=>e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); mobileLayers.onToggleLock(it.id) }}
                        title={it.locked ? "Unlock" : "Lock"}
                      >
                        {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onPointerDown={(e)=>e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); mobileLayers.onDuplicate(it.id) }}
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4"/>
                      </button>
                      <button
                        className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                        onPointerDown={(e)=>e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); mobileLayers.onDelete(it.id) }}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )

  return isMobile ? mobileBar : desktopPanel
}
