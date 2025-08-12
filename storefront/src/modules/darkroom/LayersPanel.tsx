"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2 } from "lucide-react"

const blends = ["source-over","multiply","screen","overlay","darken","lighten","xor"] as const

export type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

export default function LayersPanel({
  items,
  selectId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onDuplicate,
  onReorder,          // (srcId, destId, place)
  onChangeBlend,
  onChangeOpacity,
}: {
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
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  return (
    <div className="fixed right-6 top-24 z-40 w-[340px] max-h-[80vh] overflow-auto border border-black/10 bg-white/95 shadow-xl rounded-none">
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase sticky top-0 bg-white/95">Layers</div>

      <div className="p-2 space-y-1">
        {items.map((it) => (
          <div
            key={it.id}
            ref={(el) => (rowRefs.current[it.id] = el)}
            draggable
            onDragStart={(e) => { setDragId(it.id); e.dataTransfer.setData("text/plain", it.id) }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const src = dragId || e.dataTransfer.getData("text/plain")
              if (!src || src === it.id) return
              const rect = rowRefs.current[it.id]?.getBoundingClientRect()
              const place: "before" | "after" =
                rect && e.clientY < (rect.top + rect.height / 2) ? "before" : "after"
              onReorder(src, it.id, place)
              setDragId(null)
            }}
            className={clx(
              "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none select-none",
              selectId === it.id ? "bg-black text-white" : "bg-white"
            )}
            onClick={() => onSelect(it.id)}
            title={it.name}
          >
            <div className="text-xs flex-1 truncate">{it.name}</div>

            <select
              className={clx(
                "h-8 px-1 border rounded-none text-xs",
                selectId === it.id ? "bg-black text-white border-white/40" : "bg-white"
              )}
              value={it.blend}
              onChange={(e) => onChangeBlend(it.id, e.target.value)}
              onMouseDown={(e)=>e.stopPropagation()}
            >
              {blends.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <input
              type="range" min={10} max={100}
              value={Math.round(it.opacity * 100)}
              onChange={(e)=>onChangeOpacity(it.id, parseInt(e.target.value,10)/100)}
              onMouseDown={(e)=>e.stopPropagation()}
              className="w-20 h-[2px] bg-black appearance-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                [&::-webkit-slider-thumb]:bg-current [&::-webkit-slider-thumb]:rounded-none"
            />

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
              {it.locked ? <Unlock className="w-4 h-4"/> : <Lock className="w-4 h-4"/>}
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
        ))}
      </div>
    </div>
  )
}
