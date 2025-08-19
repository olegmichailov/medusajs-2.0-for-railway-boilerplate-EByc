"use client"

import React, { useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2 } from "lucide-react"

const blends = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "xor",
] as const

export type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number // 0..1
}

type Props = {
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
}

// глушим dnd/клик строки для интерактивной зоны
const stopAll = {
  onPointerDown: (e: any) => e.stopPropagation(),
  onPointerMove: (e: any) => e.stopPropagation(),
  onPointerUp:   (e: any) => e.stopPropagation(),
  onTouchStart:  (e: any) => e.stopPropagation(),
  onTouchMove:   (e: any) => e.stopPropagation(),
  onTouchEnd:    (e: any) => e.stopPropagation(),
  onMouseDown:   (e: any) => e.stopPropagation(),
  onMouseMove:   (e: any) => e.stopPropagation(),
  onMouseUp:     (e: any) => e.stopPropagation(),
  onClick:       (e: any) => e.stopPropagation(),
}

// общий стиль бегунка
const sliderCss = `
input[type="range"].lp-range{appearance:none;-webkit-appearance:none;background:transparent;height:20px}
input[type="range"].lp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;background:#000}
input[type="range"].lp-range.dark::-webkit-slider-thumb{background:#fff}
input[type="range"].lp-range::-moz-range-thumb{width:12px;height:12px;background:#000;border:none}
input[type="range"].lp-range.dark::-moz-range-thumb{background:#fff}
`

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
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; place: "before" | "after" } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDragId(id)
    e.dataTransfer.setData("text/plain", id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault()
    const rect = rowRefs.current[id]?.getBoundingClientRect()
    if (!rect) return
    const place: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOver({ id, place })
  }

  const handleDrop = (destId: string, e: React.DragEvent) => {
    e.preventDefault()
    const src = dragId || e.dataTransfer.getData("text/plain")
    if (!src || src === destId) {
      setDragId(null)
      setDragOver(null)
      return
    }
    const rect = rowRefs.current[destId]?.getBoundingClientRect()
    const place: "before" | "after" =
      rect && e.clientY < (rect.top + rect.height / 2) ? "before" : "after"
    onReorder(src, destId, place)
    setDragId(null)
    setDragOver(null)
  }

  const handleDragEnd = () => {
    setDragId(null)
    setDragOver(null)
  }

  return (
    <div className="fixed right-6 top-40 z-40 w-[360px] border border-black/10 bg-white/95 shadow-xl rounded-none">
      <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase">Layers</div>

      <div className="max-h-[64vh] overflow-auto p-2 space-y-1">
        {items.map((it) => {
          const isActive = selectId === it.id
          const highlight =
            dragOver && dragOver.id === it.id
              ? dragOver.place === "before"
                ? "ring-2 ring-blue-500 -mt-[1px]"
                : "ring-2 ring-blue-500 -mb-[1px]"
              : ""
          const op = Math.round((it.opacity ?? 1) * 100) // 0..100
          const baseLine = isActive ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.35)"
          const fillLine = isActive ? "rgba(255,255,255,.9)"  : "rgba(0,0,0,.9)"

          return (
            <div
              key={it.id}
              ref={(el) => (rowRefs.current[it.id] = el)}
              draggable
              onDragStart={(e) => handleDragStart(it.id, e)}
              onDragOver={(e) => handleDragOver(it.id, e)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(it.id, e)}
              className={clx(
                "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none select-none",
                isActive ? "bg-black text-white" : "bg-white",
                highlight
              )}
              onClick={() => onSelect(it.id)}
              title={it.name}
            >
              {/* drag handle */}
              <div className="w-3 h-6 grid place-items-center cursor-grab active:cursor-grabbing">
                <div className={clx("w-2 h-4 border", isActive ? "border-white/60" : "border-black/60")} />
              </div>

              <div className="text-xs flex-1 truncate">{it.name}</div>

              {/* Blend (изолировано от dnd) */}
              <div className="relative" {...stopAll}>
                <select
                  className={clx(
                    "h-8 px-1 border rounded-none text-xs",
                    isActive ? "bg-black text-white border-white/40" : "bg-white"
                  )}
                  value={it.blend}
                  onChange={(e) => onChangeBlend(it.id, e.target.value)}
                >
                  {blends.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Opacity (трек + заполнение, полностью «тихая» зона) */}
              <div
                className="relative w-24 h-8 flex items-center"
                {...stopAll}
                title={`Opacity: ${op}%`}
              >
                <div
                  aria-hidden
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ height: 2, background: baseLine }}
                />
                <div
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ height: 2, width: `${op}%`, background: fillLine }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={op}
                  onChange={(e)=> onChangeOpacity(it.id, Number(e.target.value)/100)}
                  className={clx("lp-range w-full", isActive ? "dark" : "")}
                  style={{ color: isActive ? "#fff" : "#000" }}
                />
              </div>

              {/* controls */}
              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                {...stopAll}
                onClick={() => onToggleVisible(it.id)}
                title={it.visible ? "Hide" : "Show"}
              >
                {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                {...stopAll}
                onClick={() => onToggleLock(it.id)}
                title={it.locked ? "Unlock" : "Lock"}
              >
                {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                {...stopAll}
                onClick={() => onDuplicate(it.id)}
                title="Duplicate"
              >
                <Copy className="w-4 h-4"/>
              </button>

              <button
                className="w-8 h-8 grid place-items-center border border-current bg-transparent"
                {...stopAll}
                onClick={() => onDelete(it.id)}
                title="Delete"
              >
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
