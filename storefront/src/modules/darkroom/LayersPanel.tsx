"use client"

import React, { useMemo } from "react"

type Item = {
  id: string
  name: string
  type: "image"|"shape"|"text"|"strokes"
  blend: any
  opacity: number
  visible: boolean
  locked: boolean
  z: number
}

const blends = [
  { k: "source-over",  t: "normal" },
  { k: "lighter",      t: "add" },
  { k: "multiply",     t: "multiply" },
  { k: "screen",       t: "screen" },
  { k: "overlay",      t: "overlay" },
  { k: "darken",       t: "darken" },
  { k: "lighten",      t: "lighten" },
]

export default function LayersPanel({
  items,
  selectedId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onBlendChange,
  onOpacityChange,
  onDelete,
  onDuplicate,
  onReorder
}: {
  items: Item[]
  selectedId: string | null
  onSelect: (id:string)=>void
  onToggleVisible: (id:string)=>void
  onToggleLock: (id:string)=>void
  onBlendChange: (id:string, blend:any)=>void
  onOpacityChange: (id:string, opacity:number)=>void
  onDelete: (id:string)=>void
  onDuplicate: (id:string)=>void
  onReorder: (dragId:string, overId:string)=>void
}) {
  const sorted = useMemo(()=> {
    // верхние сверху списка
    return [...items].sort((a,b)=> b.z - a.z)
  }, [items])

  const trunc = (s:string) => s.length>14 ? s.slice(0,12)+"…" : s

  return (
    <div className="fixed right-5 top-36 w-[320px] bg-white border border-black/20 shadow-xl p-10 pt-3 pb-3"
         style={{ padding: 12 }}>
      <div className="text-[11px] uppercase tracking-wide mb-2">Layers</div>
      <div className="space-y-6">
        {sorted.map((it) => (
          <div key={it.id}
               className={`border ${selectedId===it.id ? "bg-black text-white" : "bg-white text-black"} `}
               style={{ borderColor: "#000", padding: 6 }}
               onClick={()=>onSelect(it.id)}
               onDragOver={(e)=>{ e.preventDefault() }}
               onDrop={(e)=> {
                 const dragId = e.dataTransfer.getData("text/plain")
                 if (dragId) onReorder(dragId, it.id)
               }}
          >
            <div className="flex items-center gap-2">
              {/* drag handle */}
              <button
                draggable
                onDragStart={(e)=> e.dataTransfer.setData("text/plain", it.id)}
                className="w-6 h-6 border border-current flex items-center justify-center"
                title="Drag to reorder"
              >
                ⋮⋮
              </button>

              <div className="flex-1 text-xs font-mono">{trunc(it.name)}</div>

              {/* lock / eye / duplicate / delete */}
              <div className="flex items-center gap-1">
                <button className="w-6 h-6 border border-current" onClick={(e)=>{e.stopPropagation(); onToggleLock(it.id)}} title="Lock">🔒</button>
                <button className="w-6 h-6 border border-current" onClick={(e)=>{e.stopPropagation(); onToggleVisible(it.id)}} title="Visible">{it.visible ? "👁" : "🚫"}</button>
                <button className="w-6 h-6 border border-current" onClick={(e)=>{e.stopPropagation(); onDuplicate(it.id)}} title="Duplicate">⧉</button>
                <button className="w-6 h-6 border border-current" onClick={(e)=>{e.stopPropagation(); onDelete(it.id)}} title="Delete">⌫</button>
              </div>
            </div>

            {/* controls row (не мешают dnd — тянем только за «⋮⋮») */}
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-center">
              <select
                className={`border ${selectedId===it.id ? "bg-black text-white border-white" : "bg-white text-black border-black"}`}
                value={it.blend as string}
                onChange={(e)=> onBlendChange(it.id, e.target.value as any)}
              >
                {blends.map(b => <option key={b.k} value={b.k}>{b.t}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0} max={1} step={0.02}
                  value={it.opacity}
                  onChange={(e)=> onOpacityChange(it.id, parseFloat(e.target.value))}
                />
                <div className="w-8 text-right text-xs">{Math.round(it.opacity*100)}</div>
              </div>
            </div>
          </div>
        ))}
        {sorted.length===0 && (
          <div className="text-xs text-black/60">Нет слоёв на этой стороне</div>
        )}
      </div>
    </div>
  )
}
