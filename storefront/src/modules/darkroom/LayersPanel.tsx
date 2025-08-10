"use client"

import { useMemo } from "react"
import { Eye, EyeOff, Lock, Unlock, Trash2, Copy, ArrowUp, ArrowDown } from "lucide-react"

type Item = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "stroke"
  visible: boolean
  locked: boolean
}
export default function LayersPanel({
  items,
  selectId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
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
  const list = useMemo(()=> [...items].reverse(), [items])

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 w-[280px] max-h-[70vh] overflow-auto backdrop-blur-md bg-white/70 border border-black/10 shadow-xl rounded-none p-3 z-40 hidden lg:block">
      <div className="text-[11px] uppercase tracking-wide mb-2">Layers</div>
      {list.length===0 && <div className="text-xs opacity-70">No layers yet</div>}
      <div className="space-y-2">
        {list.map((l)=>(
          <div key={l.id}
               className={`p-2 border rounded-none cursor-pointer ${selectId===l.id ? "bg-black text-white" : "bg-white hover:bg-black/5"}`}
               onClick={()=>onSelect(l.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onToggleVisible(l.id)}}>
                  {l.visible ? <Eye size={14}/> : <EyeOff size={14}/>}
                </button>
                <div className="text-[12px]">{l.name}</div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onMoveUp(l.id)}}><ArrowUp size={14}/></button>
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onMoveDown(l.id)}}><ArrowDown size={14}/></button>
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onDuplicate(l.id)}}><Copy size={14}/></button>
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onToggleLock(l.id)}}>
                  {l.locked ? <Lock size={14}/> : <Unlock size={14}/>}
                </button>
                <button className="p-1 border rounded-none" onClick={(e)=>{e.stopPropagation(); onDelete(l.id)}}><Trash2 size={14}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
