"use client"

import React from "react"
import { clx } from "@medusajs/ui"
import {
  ArrowUp, ArrowDown, Eye, EyeOff, Lock, Unlock, Copy, Trash2
} from "lucide-react"

type Item = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
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
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}) {
  return (
    <div className="fixed right-6 top-40 z-40 w-[320px] border border-black/10 bg-white/95 shadow-xl rounded-none">
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase">
        Layers
      </div>
      <div className="max-h-[62vh] overflow-auto p-2 space-y-1">
        {items.map((it) => (
          <div
            key={it.id}
            className={clx(
              "flex items-center gap-2 px-2 py-1 border border-black/15 rounded-none",
              selectId === it.id ? "bg-black text-white" : "bg-white"
            )}
            onClick={() => onSelect(it.id)}
          >
            <div className="text-xs flex-1 truncate">
              {it.name}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onMoveUp(it.id) }}
                title="Bring forward"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onMoveDown(it.id) }}
                title="Send backward"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onToggleVisible(it.id) }}
                title={it.visible ? "Hide" : "Show"}
              >
                {it.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onToggleLock(it.id) }}
                title={it.locked ? "Unlock" : "Lock"}
              >
                {it.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onDuplicate(it.id) }}
                title="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 grid place-items-center border border-black/60 bg-white hover:bg-black hover:text-white"
                onClick={(e) => { e.stopPropagation(); onDelete(it.id) }}
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
