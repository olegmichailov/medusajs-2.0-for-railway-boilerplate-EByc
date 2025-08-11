"use client"

import React from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, ArrowUp, ArrowDown } from "lucide-react"

const wrap = "backdrop-blur bg-white/80 border border-black/10 shadow-xl rounded-none"
const row  = "grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-1 text-sm border-b border-black/10"
const btn  = "p-1 border border-black/60 rounded-none hover:bg-black hover:text-white transition"
const ico  = "w-4 h-4"

export default function LayersPanel({
  items, selectId,
  onSelect, onToggleVisible, onToggleLock, onDelete, onDuplicate, onMoveUp, onMoveDown
}: {
  items: { id: string; name: string; type: string; visible: boolean; locked: boolean }[]
  selectId: string | null
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}) {
  return (
    <div className={clx(wrap, "fixed right-6 top-24 z-40 w-[300px] max-h-[70vh] overflow-auto")}>
      <div className="px-3 py-2 text-[11px] uppercase border-b border-black/10">Layers</div>
      <div>
        {items.map((it) => (
          <div key={it.id} className={clx(row, selectId===it.id && "bg-black/5")}>
            <button className="text-left truncate" title={it.name} onClick={()=>onSelect(it.id)}>{it.name}</button>
            <div className="flex items-center gap-1">
              <button className={btn} onClick={()=>onMoveUp(it.id)} title="Up"><ArrowUp className={ico}/></button>
              <button className={btn} onClick={()=>onMoveDown(it.id)} title="Down"><ArrowDown className={ico}/></button>
              <button className={btn} onClick={()=>onToggleVisible(it.id)} title={it.visible?"Hide":"Show"}>{it.visible? <Eye className={ico}/> : <EyeOff className={ico}/>}</button>
              <button className={btn} onClick={()=>onToggleLock(it.id)} title={it.locked?"Unlock":"Lock"}>{it.locked? <Unlock className={ico}/> : <Lock className={ico}/>}</button>
              <button className={btn} onClick={()=>onDuplicate(it.id)} title="Duplicate"><Copy className={ico}/></button>
              <button className={btn} onClick={()=>onDelete(it.id)} title="Delete"><Trash2 className={ico}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
