"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2 } from "lucide-react"

const blends = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "xor",
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

/**
 * Desktop-панель слоёв с Drag & Drop-перестановкой (top↔bottom),
 * переключателями видимости/блокировки и настройками blend/opacity.
 */
export default function LayersPanel({
  items,
  selectId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onDuplicate,
  onReorder,
  onChangeBlend,
  onChangeOpacity,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; place: "before" | "after" } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
      setDragId(null)
      setDragOver(null)
      return
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
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase">Layers</div>

      <div className="max-h-[64vh] overflow-auto p-2 space-y-1">
        {items.map((it) => {
          const isActive = selectId === it.id
          const highlight =
            dragOver && dragOver.id === it.id
              ? dragOver.place === "before"
                ? "ring-2 ring-blue-500 -mt-[1px]"
                : "ring-2 ring-blue-500 -mb-[1px]"
              : ""

          return (
            <div
              key={it.id}
              ref={(el) => (rowRefs.current[it.id] = el)}
              draggable
              onDragStart={(e) => handleDragStart(it.id, e)}
              onDragOver={(e) => handleDragOver(it.id, e)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(it.id, e)}
              className={clx(
                "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none select-none",
                isActive ? "bg-black text-white" : "bg-white",
                highlight
              )}
              onClick={() => onSelect(it.id)}
              title={it.name}
            >
              {/* drag handle */}
              <div className="w-3 h-6 grid place-items-center cursor-grab active:cursor-grabbing">
                <div className={clx("w-2 h-4 border", isActive ? "border-white/60" : "border-black/60")} />
              </div>

              <div className="text-xs flex-1 truncate">{it.name}</div>

              {/* Blend */}
              <select
                className={clx(
                  "h-8 px-1 border rounded-none text-xs",
                  isActive ? "bg-black text-white border-white/40" : "bg-white"
                )}
                value={it.blend}
                onChange={(e) => onChangeBlend(it.id, e.target.value)}
                onMouseDown={(e)=>e.stopPropagation()}
              >
                {blends.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* Opacity */}
              <input
                type="range" min={10} max={100}
                value={Math.round(it.opacity * 100)}
                onChange={(e)=> onChangeOpacity(it.id, parseInt(e.target.value,10)/100)}
                onMouseDown={(e)=>e.stopPropagation()}
                className={clx(
                  "w-20 h-[2px] bg-current appearance-none",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2",
                  "[&::-webkit-slider-thumb]:bg-current [&::-webkit-slider-thumb]:rounded-none"
                )}
                title="Opacity"
              />

              {/* controls */}
              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleVisible(it.id) }}
                title={it.visible ? "Hide" : "Show"}
              >
                {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleLock(it.id) }}
                title={it.locked ? "Unlock" : "Lock"}
              >
                {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDuplicate(it.id) }}
                title="Duplicate"
              >
                <Copy className="w-4 h-4"/>
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                onMouseDown={(e)=>e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDelete(it.id) }}
                title="Delete"
              >
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
