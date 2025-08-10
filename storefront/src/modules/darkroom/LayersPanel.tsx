// ==============================
// File: src/modules/darkroom/LayersPanel.tsx
// ==============================
"use client"

import React from "react"

const btn = "px-2 py-1 border border-black text-[11px] hover:bg-black hover:text-white"

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
    <aside className="fixed right-6 top-28 z-40 w-[300px] bg-white/90 backdrop-blur border border-black shadow-xl">
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide border-b border-black">Layers</div>
      <div className="max-h-[70vh] overflow-auto p-2 space-y-2">
        {items.map((l) => (
          <div key={l.id} className={"flex items-center gap-1" + (selectId === l.id ? " bg-black text-white" : "") }>
            <button className="flex-1 text-left px-2 py-1 text-[12px]" onClick={() => onSelect(l.id)} title={l.name}>{l.name}</button>
            <button className={btn} onClick={() => onMoveUp(l.id)} title="Up">↑</button>
            <button className={btn} onClick={() => onMoveDown(l.id)} title="Down">↓</button>
            <button className={btn} onClick={() => onToggleVisible(l.id)} title="Show/Hide">{l.visible ? "👁" : "🚫"}</button>
            <button className={btn} onClick={() => onToggleLock(l.id)} title="Lock">{l.locked ? "🔒" : "🔓"}</button>
            <button className={btn} onClick={() => onDuplicate(l.id)} title="Duplicate">⎘</button>
            <button className={btn} onClick={() => onDelete(l.id)} title="Delete">🗑</button>
          </div>
        ))}
      </div>
    </aside>
  )
}
