"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"

type Item = {
  id: string
  type: "image"|"shape"|"text"|"strokes"
  name: string
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
}

const BLENDS: {value:string; label:string}[] = [
  { value: "lighter",     label: "add" },
  { value: "multiply",    label: "multiply" },
  { value: "screen",      label: "screen" },
  { value: "overlay",     label: "overlay" },
  { value: "darken",      label: "darken" },
  { value: "lighten",     label: "lighten" },
  { value: "source-over", label: "normal" },
  { value: "difference",  label: "difference" },
  { value: "exclusion",   label: "exclusion" },
]

export default function LayersPanel({
  items, selectId,
  onSelect, onToggleVisible, onToggleLock,
  onBlendChange, onOpacityChange,
  onReorder, onDelete, onDuplicate,
}: {
  items: Item[]
  selectId: string | null
  onSelect: (id: string)=>void
  onToggleVisible: (id: string)=>void
  onToggleLock: (id: string)=>void
  onBlendChange: (id: string, blend: string)=>void
  onOpacityChange: (id: string, value: number)=>void
  onReorder: (dragId: string, overId: string)=>void
  onDelete: (id: string)=>void
  onDuplicate: (id: string)=>void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const allowDnD = useRef(true)

  return (
    <div className="fixed right-6 top-48 z-40 w-[340px] bg-white border border-black/10 shadow-xl">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide border-b">Layers</div>
      <div className="max-h-[64vh] overflow-auto">
        {items.map((it) => (
          <div
            key={it.id}
            className={clx(
              "px-2 py-2 border-b border-black/5 grid grid-cols-[20px_1fr_auto] gap-2 items-center",
              selectId === it.id && "bg-black text-white"
            )}
            draggable
            onDragStart={(e)=>{ setDragId(it.id); e.dataTransfer.setData("text/plain", it.id) }}
            onDragOver={(e)=>{ 
              if (!dragId) return
              e.preventDefault()
            }}
            onDrop={(e)=> {
              e.preventDefault()
              const from = dragId; setDragId(null)
              if (from && from !== it.id) onReorder(from, it.id)
            }}
            onClick={()=> onSelect(it.id)}
          >
            {/* drag handle */}
            <div
              className="cursor-grab select-none"
              title="Drag to reorder"
              onMouseDown={(e)=>{ e.stopPropagation() }}
            >
              ⋮⋮
            </div>

            {/* name + blend + opacity */}
            <div className="flex items-center gap-2">
              <span className="text-xs truncate">{it.name}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* blend */}
              <select
                className="border px-1 py-0.5 text-xs bg-white text-black"
                defaultValue={it.blend}
                onClick={(e)=>e.stopPropagation()}
                onChange={(e)=> onBlendChange(it.id, e.target.value)}
              >
                {BLENDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>

              {/* opacity slider */}
              <div
                className="w-24"
                onMouseDown={(e)=> e.stopPropagation()}
                onClick={(e)=> e.stopPropagation()}
              >
                <input
                  type="range" min={0} max={1} step={0.01}
                  defaultValue={it.opacity}
                  onChange={(e)=> onOpacityChange(it.id, parseFloat(e.target.value))}
                  className="w-full h-[2px] bg-black appearance-none
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                    [&::-webkit-slider-thumb]:bg-black"
                />
              </div>

              {/* visible / lock / duplicate / delete */}
              <button className="border px-1" onClick={(e)=>{ e.stopPropagation(); onToggleVisible(it.id) }} title="Show/Hide">👁</button>
              <button className="border px-1" onClick={(e)=>{ e.stopPropagation(); onToggleLock(it.id) }} title="Lock">🔒</button>
              <button className="border px-1" onClick={(e)=>{ e.stopPropagation(); onDuplicate(it.id) }} title="Duplicate">⎘</button>
              <button className="border px-1" onClick={(e)=>{ e.stopPropagation(); onDelete(it.id) }} title="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
