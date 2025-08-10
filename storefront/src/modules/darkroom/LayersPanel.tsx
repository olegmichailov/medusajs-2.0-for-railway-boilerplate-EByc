"use client"

import React from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown } from "lucide-react"

type Item = { id: string; name: string; type: "image"|"shape"|"text"|"stroke"; visible: boolean; locked: boolean }

export default function LayersPanel({
  items, selectId,
  onSelect, onToggleVisible, onToggleLock, onDelete, onDuplicate, onMoveUp, onMoveDown,
}: {
  items: Item[]
  selectId: string | null
  onSelect: (id: string)=>void
  onToggleVisible: (id: string)=>void
  onToggleLock: (id: string)=>void
  onDelete: (id: string)=>void
  onDuplicate: (id: string)=>void
  onMoveUp: (id: string)=>void
  onMoveDown: (id: string)=>void
}) {
  return (
    <aside className="fixed right-6 top-28 w-[300px] max-h-[70vh] overflow-auto z-40 backdrop-blur-xl bg-white/80 border border-black/10 shadow-2xl rounded-md p-3">
      <div className="text-xs font-semibold uppercase tracking-wide mb-2">Layers</div>
      <div className="space-y-2">
        {items.map((it)=>(
          <div
            key={it.id}
            className={clx(
              "grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1 border rounded-md",
              selectId===it.id ? "bg-black text-white" : "bg-white/60"
            )}
          >
            <button className="text-left truncate" onClick={()=>onSelect(it.id)} title={it.name}>
              {it.name}
            </button>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded hover:bg-black/10" title="Move up" onClick={()=>onMoveUp(it.id)}><ArrowUp className="w-4 h-4"/></button>
              <button className="p-1 rounded hover:bg-black/10" title="Move down" onClick={()=>onMoveDown(it.id)}><ArrowDown className="w-4 h-4"/></button>
              <button className="p-1 rounded hover:bg-black/10" title={it.visible?"Hide":"Show"} onClick={()=>onToggleVisible(it.id)}>
                {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
              </button>
              <button className="p-1 rounded hover:bg-black/10" title={it.locked?"Unlock":"Lock"} onClick={()=>onToggleLock(it.id)}>
                {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
              </button>
              <button className="p-1 rounded hover:bg-black/10" title="Duplicate" onClick={()=>onDuplicate(it.id)}><Copy className="w-4 h-4"/></button>
              <button className="p-1 rounded hover:bg-black/10" title="Delete" onClick={()=>onDelete(it.id)}><Trash2 className="w-4 h-4"/></button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
