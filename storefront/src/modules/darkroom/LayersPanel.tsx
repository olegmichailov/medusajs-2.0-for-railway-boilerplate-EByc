// /src/modules/darkroom/LayersPanel.tsx
"use client"

import React, { useState } from "react"

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ")

// короткие имена в UI → канвас-операции
const blendUi = ["normal", "multiply", "screen", "overlay", "darken", "lighten"] as const
const toOp: Record<(typeof blendUi)[number], string> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
}

type Item = {
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
  onReorder,
  onChangeBlend,
  onChangeOpacity,
}: {
  items: Item[]
  selectId: string | null
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (srcId: string, destId: string) => void
  onChangeBlend: (id: string, blend: string) => void
  onChangeOpacity: (id: string, opacity: number) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div className="fixed right-6 top-40 z-40 w-[340px] bg-white/95 border border-black/10 shadow-xl">
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase">Layers</div>

      <div className="max-h-[62vh] overflow-auto p-2 space-y-1">
        {items.map((it) => {
          const uiBlend =
            (Object.entries(toOp).find(([, v]) => v === it.blend)?.[0] as (typeof blendUi)[number]) ??
            "normal"

          return (
            <div
              key={it.id}
              draggable
              onDragStart={() => setDragId(it.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== it.id) onReorder(dragId, it.id)
                setDragId(null)
              }}
              className={cx(
                "flex items-center gap-2 px-2 py-2 border border-black/15",
                selectId === it.id && "bg-black text-white"
              )}
              onClick={() => onSelect(it.id)}
              title={it.name}
            >
              {/* «ручка» для перетаскивания */}
              <div className="w-2 h-6 grid grid-rows-3 gap-[2px] mr-1 select-none">
                <div className={cx("h-[2px]", selectId === it.id ? "bg-white/70" : "bg-black/50")} />
                <div className={cx("h-[2px]", selectId === it.id ? "bg-white/70" : "bg-black/50")} />
                <div className={cx("h-[2px]", selectId === it.id ? "bg-white/70" : "bg-black/50")} />
              </div>

              <div className="text-xs flex-1 truncate">{it.name}</div>

              {/* Blend (короткие названия) */}
              <select
                className={cx(
                  "h-8 px-1 border text-xs rounded-none",
                  selectId === it.id ? "bg-black text-white border-white/40" : "bg-white"
                )}
                value={uiBlend}
                onChange={(e) => onChangeBlend(it.id, toOp[e.target.value as (typeof blendUi)[number]])}
              >
                {blendUi.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              {/* Opacity — блокируем всплытие, чтобы не мешать dnd */}
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(it.opacity * 100)}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => onChangeOpacity(it.id, parseInt(e.target.value) / 100)}
                className="w-20 h-[2px] bg-black appearance-none
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                  [&::-webkit-slider-thumb]:bg-current [&::-webkit-slider-thumb]:rounded-none"
                title="Opacity"
              />

              {/* Кнопки: show/lock/dup/del — максимально простые */}
              <button
                className="w-8 h-8 grid place-items-center border"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleVisible(it.id)
                }}
                title={it.visible ? "Hide" : "Show"}
              >
                {it.visible ? "👁" : "🚫"}
              </button>
              <button
                className="w-8 h-8 grid place-items-center border"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLock(it.id)
                }}
                title={it.locked ? "Unlock" : "Lock"}
              >
                {it.locked ? "🔒" : "🔓"}
              </button>
              <button
                className="w-8 h-8 grid place-items-center border"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate(it.id)
                }}
                title="Duplicate"
              >
                ⎘
              </button>
              <button
                className="w-8 h-8 grid place-items-center border"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(it.id)
                }}
                title="Delete"
              >
                🗑
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
