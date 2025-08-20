"use client"

import React, { useMemo, useRef, useState } from "react"
import clsx from "clsx"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, GripVertical } from "lucide-react"

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
  type: "image" | "shape" | "text" | "strokes" | "erase"
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
  onChangeOpacity: (id: string, opacity01: number) => void
}

export default function LayersPanel(props: Props) {
  const {
    items, selectId,
    onSelect, onToggleVisible, onToggleLock, onDelete, onDuplicate,
    onReorder, onChangeBlend, onChangeOpacity,
  } = props

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string, place: "before" | "after" } | null>(null)

  // Единый CSS для «квадратных» фейдеров по центру
  const sliderCss = useMemo(() => `
    input[type="range"].square {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 14px; background: transparent; margin: 0; padding: 0;
    }
    input[type="range"].square:focus { outline: none; }
    input[type="range"].square::-webkit-slider-runnable-track { height: 0; background: transparent; }
    input[type="range"].square::-moz-range-track { height: 0; background: transparent; }
    input[type="range"].square::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 14px; height: 14px; background: currentColor; border: 0; border-radius: 0; margin-top: 0;
    }
    input[type="range"].square::-moz-range-thumb {
      width: 14px; height: 14px; background: currentColor; border: 0; border-radius: 0;
    }
  `, [])

  // Создаём drag-image размером со строку (чтобы «тянулась вся полоса»)
  const setRowDragImage = (id: string, e: React.DragEvent) => {
    const row = rowRefs.current[id]
    if (!row) return
    const rect = row.getBoundingClientRect()
    const clone = row.cloneNode(true) as HTMLDivElement
    clone.style.boxSizing = "border-box"
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.position = "fixed"
    clone.style.left = "-9999px"
    clone.style.top = "-9999px"
    clone.style.pointerEvents = "none"
    clone.style.opacity = "0.9"
    clone.style.filter = "drop-shadow(0 10px 24px rgba(0,0,0,.25))"
    document.body.appendChild(clone)
    e.dataTransfer.setDragImage(clone, rect.width / 2, rect.height / 2)
    // Уберём клон после кадра, когда drag уже стартовал
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { document.body.removeChild(clone) })
    })
  }

  const onGripDragStart = (id: string, e: React.DragEvent) => {
    e.stopPropagation()
    setDragId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
    setRowDragImage(id, e)
  }
  const onGripDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    setDragId(null)
    setDragOver(null)
  }

  const handleDragOver = (targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = rowRefs.current[targetId]?.getBoundingClientRect()
    if (!rect) return
    const place: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOver({ id: targetId, place })
  }
  const handleDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    const src = dragId || e.dataTransfer.getData("text/plain")
    if (!src || src === targetId) { setDragId(null); setDragOver(null); return }
    const rect = rowRefs.current[targetId]?.getBoundingClientRect()
    const place: "before" | "after" = rect && e.clientY < rect.top + rect.height / 2 ? "before" : "after"
    onReorder(src, targetId, place)
    setDragId(null); setDragOver(null)
  }

  return (
    <div className="fixed right-6 top-40 z-40 w-[380px] border border-black/10 bg-white shadow-xl">
      <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
      <div className="px-3 py-2 border-b border-black/10 text-[11px] tracking-wide uppercase">Layers</div>

      <div className="max-h-[64vh] overflow-auto p-2 space-y-1">
        {items.map((it) => {
          const isActive = selectId === it.id
          const over = dragOver && dragOver.id === it.id ? dragOver.place : null

          return (
            <div
              key={it.id}
              ref={(el) => (rowRefs.current[it.id] = el)}
              className={clsx(
                "group flex items-center gap-2 px-2 py-2 border border-black/15 select-none transition-[box-shadow,background,color] cursor-default",
                isActive
                  ? "bg-black text-white shadow-[0_0_0_1px_rgba(0,0,0,1),0_10px_28px_rgba(0,0,0,.35)]"
                  : "bg-white text-black hover:shadow-[0_10px_28px_rgba(0,0,0,.12)]",
                over === "before" && "ring-2 ring-blue-500 -mt-[1px]",
                over === "after" && "ring-2 ring-blue-500 -mb-[1px]"
              )}
              onClick={() => onSelect(it.id)}
              onDragOver={(e) => handleDragOver(it.id, e)}
              onDrop={(e) => handleDrop(it.id, e)}
            >
              {/* drag-grip: только он draggable */}
              <div
                className="w-6 h-8 grid place-items-center cursor-grab active:cursor-grabbing"
                draggable
                onDragStart={(e) => onGripDragStart(it.id, e)}
                onDragEnd={onGripDragEnd}
                onMouseDown={(e) => e.stopPropagation()}
                title="Drag to reorder"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>

              {/* имя */}
              <div className="text-xs flex-1 truncate" title={it.name}>{it.name}</div>

              {/* blend */}
              <select
                className={clsx(
                  "h-8 px-2 border rounded-none text-xs",
                  isActive ? "bg-black text-white border-white/40" : "bg-white border-black/20"
                )}
                value={it.blend}
                onChange={(e) => onChangeBlend(it.id, e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                title="Blend mode"
              >
                {blends.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              {/* opacity: квадратный бегунок, линия по центру */}
              <div className="relative w-24" onMouseDown={(e) => e.stopPropagation()} title="Opacity">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={Math.round(Math.max(0, Math.min(1, it.opacity)) * 100)}
                  onChange={(e) => {
                    const v = Math.max(5, parseInt(e.target.value || "0", 10)) / 100
                    onChangeOpacity(it.id, v)
                  }}
                  className="square w-full"
                />
                <div
                  className={clsx(
                    "pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] opacity-80",
                    isActive ? "bg-white" : "bg-black"
                  )}
                />
              </div>

              {/* видимость */}
              <button
                className={clsx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleVisible(it.id) }}
                title={it.visible ? "Hide layer" : "Show layer"}
              >
                {it.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* замок */}
              <button
                className={clsx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onToggleLock(it.id) }}
                title={it.locked ? "Unlock layer" : "Lock layer"}
              >
                {it.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>

              {/* дублирование */}
              <button
                className={clsx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDuplicate(it.id) }}
                title="Duplicate layer"
              >
                <Copy className="w-4 h-4" />
              </button>

              {/* удалить */}
              <button
                className={clsx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDelete(it.id) }}
                title="Delete layer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
