"use client"
import React, { useCallback } from "react"
import { useDarkroom } from "./store"

type Item = {
  id: string
  name: string
  type: "image"|"shape"|"text"|"strokes"
  blend: GlobalCompositeOperation
  opacity: number
  visible: boolean
  locked: boolean
}

export default function LayersPanel({
  items,
  onBlend, onOpacity,
  onSelect, selectedId,
  onToggleVisible, onToggleLock,
  onDuplicate, onDelete,
  onReorder
}: {
  items: Item[]
  onBlend: (id:string, blend:GlobalCompositeOperation)=>void
  onOpacity: (id:string, value:number)=>void
  onSelect: (id:string)=>void
  selectedId: string|null
  onToggleVisible: (id:string)=>void
  onToggleLock: (id:string)=>void
  onDuplicate: (id:string)=>void
  onDelete: (id:string)=>void
  onReorder: (srcId:string, dstId:string)=>void
}) {
  const { showLayers } = useDarkroom()

  const dragId = React.useRef<string|null>(null)
  const onDragStart = (id:string) => (e:React.DragEvent) => {
    dragId.current = id
    e.dataTransfer.setData("text/plain", id)
  }
  const onDragOver = (e:React.DragEvent) => { e.preventDefault() }
  const onDrop = (overId:string) => (e:React.DragEvent) => {
    e.preventDefault()
    const src = dragId.current
    dragId.current = null
    if (src && src !== overId) onReorder(src, overId)
  }

  if (!showLayers) return null

  return (
    <div className="fixed right-6 top-40 z-30 w-[320px] bg-white/90 border border-black/10 p-3 shadow-xl">
      <div className="text-[11px] uppercase mb-2">Layers</div>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.id}
               draggable
               onDragStart={onDragStart(it.id)}
               onDragOver={onDragOver}
               onDrop={onDrop(it.id)}
               className={`border p-2 grid grid-cols-[20px_1fr_auto_auto_auto_auto_auto] items-center gap-2 ${selectedId===it.id?"bg-black text-white":"bg-white"}`}
               onClick={()=>onSelect(it.id)}>
            {/* drag handle */}
            <div className="cursor-grab select-none">⋮⋮</div>

            {/* name + blend + opacity */}
            <div className="text-xs truncate">{it.name}</div>

            <select
              className={`border text-xs px-1 py-0.5 ${selectedId===it.id?"bg-black text-white":"bg-white"}`}
              value={it.blend}
              onChange={(e)=>onBlend(it.id, e.target.value as GlobalCompositeOperation)}
              onClick={(e)=>e.stopPropagation()}
            >
              {["source-over","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity","lighter","destination-out"].map(b=>
                <option key={b} value={b}>{b}</option>
              )}
            </select>

            <input type="range" min={0} max={100}
              className="w-24"
              value={Math.round(it.opacity*100)}
              onChange={(e)=>onOpacity(it.id, parseInt(e.target.value)/100)}
              onClick={(e)=>e.stopPropagation()}
            />

            <button className="border px-2 py-0.5" onClick={(e)=>{e.stopPropagation(); onToggleVisible(it.id)}}>{it.visible?"👁":"🚫"}</button>
            <button className="border px-2 py-0.5" onClick={(e)=>{e.stopPropagation(); onToggleLock(it.id)}}>{it.locked?"🔒":"🔓"}</button>
            <button className="border px-2 py-0.5" onClick={(e)=>{e.stopPropagation(); onDuplicate(it.id)}}>⎘</button>
            <button className="border px-2 py-0.5" onClick={(e)=>{e.stopPropagation(); onDelete(it.id)}}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}
