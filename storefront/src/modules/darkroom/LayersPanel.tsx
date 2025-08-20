"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, GripVertical } from "lucide-react"

const blends = [
  "source-over","multiply","screen","overlay","darken","lighten","xor",
] as const

export type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

type Props = {
  items: LayerItem[]
  selectId: string | null
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (srcId: string, destId: string, place: "before" | "after") => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
}

/** Desktop Layers — DnD за «решётку». Ползунок — квадратный, трек по центру. */
export default function LayersPanel({
  items, selectId, onSelect, onToggleVisible, onToggleLock,
  onDelete, onDuplicate, onReorder, onChangeBlend, onChangeOpacity,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; place: "before" | "after" } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Слайдер (квадратный ползунок + центр-трек)
  const sliderCss = `
  input[type="range"].lp{
    -webkit-appearance:none; appearance:none;
    width:100%; height:22px; background:transparent; color:currentColor; margin:0; padding:0;
  }
  input[type="range"].lp::-webkit-slider-runnable-track{ height:0; background:transparent; }
  input[type="range"].lp::-moz-range-track{ height:0; background:transparent; }
  input[type="range"].lp::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:12px; height:12px; background:currentColor; border:0; border-radius:0; margin-top:0; }
  input[type="range"].lp::-moz-range-thumb{ width:12px; height:12px; background:currentColor; border:0; border-radius:0; }
  `

  const stop = {
    onPointerDown: (e: any) => e.stopPropagation(),
    onPointerMove: (e: any) => e.stopPropagation(),
    onPointerUp:   (e: any) => e.stopPropagation(),
    onTouchStart:  (e: any) => e.stopPropagation(),
    onTouchMove:   (e: any) => e.stopPropagation(),
    onTouchEnd:    (e: any) => e.stopPropagation(),
    onMouseDown:   (e: any) => e.stopPropagation(),
    onMouseMove:   (e: any) => e.stopPropagation(),
    onMouseUp:     (e: any) => e.stopPropagation(),
  }

  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.setData("text/plain", id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault()
    const rect = rowRefs.current[id]?.getBoundingClientRect()
    if (!rect) return
    const place: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOver({ id, place })
  }

  const handleDrop = (destId: string, e: React.DragEvent) => {
    e.preventDefault()
    const src = dragId || e.dataTransfer.getData("text/plain")
    if (!src || src === destId) {
      setDragId(null); setDragOver(null); return
    }
    const rect = rowRefs.current[destId]?.getBoundingClientRect()
    const place: "before" | "after" =
      rect && e.clientY < (rect.top + rect.height / 2) ? "before" : "after"
    onReorder(src, destId, place)
    setDragId(null)
    setDragOver(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOver(null)
  }

  return (
    <div className="fixed right-6 top-40 z-40 w-[360px] border border-black/10 bg-white/95 shadow-xl rounded-none">
      <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase">Layers</div>

      <div className="max-h-[64vh] overflow-auto p-2 space-y-1">
        {items.map((it) => {
          const isActive = selectId === it.id
          const isDragTarget = dragOver && dragOver.id === it.id
          const rowBase = isActive ? "bg-black text-white" : "bg-black text-white"
          const rowHover = isActive ? "" : ""

          return (
            <div
              key={it.id}
              ref={(el) => (rowRefs.current[it.id] = el)}
              onDragOver={(e) => handleDragOver(it.id, e)}
              onDrop={(e) => handleDrop(it.id, e)}
              className={clx(
                "relative flex items-center gap-2 px-2 py-2 rounded-none select-none",
                rowBase, rowHover,
                "border border-white/10"
              )}
              onClick={() => onSelect(it.id)}
              title={it.name}
            >
              {/* Полноразмерная тень строки при DnD */}
              {isDragTarget && (
                <div
                  className={clx(
                    "absolute inset-0 pointer-events-none",
                    dragOver?.place === "before" ? "shadow-[inset_0_3px_0_0_rgba(59,130,246,1)]" :
                    "shadow-[inset_0_-3px_0_0_rgba(59,130,246,1)]"
                  )}
                />
              )}

              {/* handle */}
              <div
                className="w-6 h-8 grid place-items-center cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e)=>handleDragStart(it.id, e)}
                onDragEnd={handleDragEnd}
                onMouseDown={(e)=>e.stopPropagation()}
                title="Reorder"
              >
                <GripVertical className="w-3.5 h-3.5 text-white" />
              </div>

              <div className="text-xs flex-1 truncate">{it.name}</div>

              {/* Blend */}
              <select
                className={clx(
                  "h-8 px-2 border rounded-none text-xs bg-black text-white border-white/30"
                )}
                value={it.blend}
                onChange={(e) => onChangeBlend(it.id, e.target.value)}
                onMouseDown={(e)=>e.stopPropagation()}
              >
                {blends.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Opacity (0–100), трек по центру, квадратный ползунок */}
              <div className="relative w-24" onMouseDown={(e)=>e.stopPropagation()}>
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(it.opacity * 100)}
                  onChange={(e)=> onChangeOpacity(it.id, Math.max(0, parseInt(e.target.value,10))/100)}
                  className="lp"
                />
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/90" />
              </div>

              {/* controls */}
              <button
                className="w-8 h-8 grid place-items-center border border-white/30 bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleVisible(it.id) }}
                title={it.visible ? "Hide" : "Show"}
              >
                {it.visible ? <Eye className="w-4 h-4 text-white"/> : <EyeOff className="w-4 h-4 text-white"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-white/30 bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleLock(it.id) }}
                title={it.locked ? "Unlock" : "Lock"}
              >
                {it.locked ? <Lock className="w-4 h-4 text-white"/> : <Unlock className="w-4 h-4 text-white"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-white/30 bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDuplicate(it.id) }}
                title="Duplicate"
              >
                <Copy className="w-4 h-4 text-white"/>
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-white/30 bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDelete(it.id) }}
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-white"/>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
