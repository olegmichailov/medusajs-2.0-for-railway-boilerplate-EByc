"use client"

import React, { useMemo, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import { Eye, EyeOff, Lock, Unlock, Copy, Trash2, GripVertical } from "lucide-react"

export type LayerItem = {
  id: string
  name: string
  type: "image" | "shape" | "text" | "strokes" | "erase"
  visible: boolean
  locked: boolean
  blend: string
  opacity: number
  thumb?: string | null
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
  getPreview?: (id: string) => string | null
}

const blends = ["source-over","multiply","screen","overlay","darken","lighten","xor"] as const

const sliderCss = `
input[type="range"].lp{
  -webkit-appearance:none; appearance:none;
  width:100%; height:20px; background:transparent; color:currentColor; margin:0; padding:0; touch-action:none;
}
input[type="range"].lp::-webkit-slider-runnable-track{ height:0; background:transparent; }
input[type="range"].lp::-moz-range-track{ height:0; background:transparent; }
input[type="range"].lp::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; width:14px; height:14px; background:currentColor; border:0; border-radius:0; margin-top:0; }
input[type="range"].lp::-moz-range-thumb{ width:14px; height:14px; background:currentColor; border:0; border-radius:0; }
`

export default function LayersPanel(props: Props) {
  const { items, selectId, onSelect, onToggleVisible, onToggleLock, onDelete,
    onDuplicate, onReorder, onChangeBlend, onChangeOpacity, getPreview } = props

  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<{ id: string; place: "before" | "after" } | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const byId = useMemo(() => {
    const m: Record<string, LayerItem> = {}
    items.forEach(i => { m[i.id] = i })
    return m
  }, [items])

  const startDrag = (e: React.DragEvent, id: string) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-no-drag="1"]')) { e.preventDefault(); return }

    setDragId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)

    // кастомный drag image по центру — чтобы «не уезжал»
    const src = byId[id]?.thumb ?? (typeof getPreview === "function" ? getPreview(id) : null)
    if (src) {
      const img = new Image()
      img.src = src
      img.onload = () => {
        const w = Math.min(160, img.width)
        const h = Math.max(1, Math.round((img.height * w) / img.width))
        const c = document.createElement("canvas")
        c.width = w; c.height = h
        const ctx = c.getContext("2d")!
        ctx.drawImage(img, 0, 0, w, h)
        e.dataTransfer.setDragImage(c, w / 2, h / 2)
      }
    } else {
      const row = rowRefs.current[id]
      if (row) {
        row.style.opacity = "0.85"
        e.dataTransfer.setDragImage(row, row.clientWidth / 2, row.clientHeight / 2)
        setTimeout(() => { row.style.opacity = "" }, 0)
      }
    }
  }

  const over = (e: React.DragEvent, id: string) => {
    e.preventDefault()
    const rect = rowRefs.current[id]?.getBoundingClientRect()
    if (!rect) return
    const place: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setDragOver({ id, place })
  }

  const drop = (e: React.DragEvent, destId: string) => {
    e.preventDefault()
    const src = dragId || e.dataTransfer.getData("text/plain")
    if (!src || src === destId) { cancelDrag(); return }
    const rect = rowRefs.current[destId]?.getBoundingClientRect()
    const place: "before" | "after" = rect && e.clientY < (rect.top + rect.height / 2) ? "before" : "after"
    onReorder(src, destId, place)
    cancelDrag()
  }

  const cancelDrag = () => {
    setDragId(null)
    setDragOver(null)
  }

  return (
    <div className="fixed right-6 top-40 z-40 w-[360px] border border-black bg-white shadow-xl rounded-none" onMouseDown={(e)=>e.stopPropagation()}>
      <style dangerouslySetInnerHTML={{ __html: sliderCss }} />
      <div className="px-3 py-2 border-b border-black/10 text-[11px] uppercase tracking-widest">Layers</div>

      <div className="max-h-[64vh] overflow-auto p-2 space-y-1" data-no-drag="1">
        {items.map((it) => {
          const isActive = selectId === it.id
          const hl =
            dragOver && dragOver.id === it.id
              ? dragOver.place === "before"
                ? "outline outline-2 outline-blue-500 -mt-[1px]"
                : "outline outline-2 outline-blue-500 -mb-[1px]"
              : ""

          return (
            <div
              key={it.id}
              ref={(el) => (rowRefs.current[it.id] = el)}
              className={clx(
                "flex items-center gap-2 px-2 py-2 border border-black/15 rounded-none select-none transition",
                isActive ? "bg-black text-white" : "bg-white text-black hover:bg-black/[0.04]",
                hl
              )}
              draggable
              onDragStart={(e)=>startDrag(e, it.id)}
              onDragOver={(e)=>over(e, it.id)}
              onDrop={(e)=>drop(e, it.id)}
              onDragEnd={cancelDrag}
              onClick={() => onSelect(it.id)}
              title={it.name}
            >
              <div className="w-8 h-8 grid place-items-center pointer-events-none">
                {it.thumb
                  ? <img src={it.thumb} alt="" className="max-w-full max-h-full object-contain" />
                  : <GripVertical className="w-3.5 h-3.5 opacity-70" />
                }
              </div>

              <div className="text-xs flex-1 truncate" data-no-drag="1">{it.name}</div>

              <select
                className={clx(
                  "h-8 px-2 border rounded-none text-xs",
                  isActive ? "bg-black text-white border-white/40" : "bg-white border-black/20"
                )}
                value={it.blend}
                onChange={(e) => onChangeBlend(it.id, e.target.value)}
                data-no-drag="1"
              >
                {blends.map((b) => (<option key={b} value={b}>{b}</option>))}
              </select>

              <div className="relative w-24" data-no-drag="1">
                <input
                  type="range" min={5} max={100} step={1}
                  value={Math.round(it.opacity * 100)}
                  onChange={(e)=> onChangeOpacity(it.id, Math.max(5, parseInt(e.target.value,10))/100)}
                  className="lp"
                />
                <div className={clx("pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] opacity-80", isActive ? "bg-white" : "bg-black")} />
              </div>

              <button className={clx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")} onClick={(e) => { e.stopPropagation(); onToggleVisible(it.id) }} title={it.visible ? "Hide" : "Show"} data-no-drag="1">
                {it.visible ? <Eye className="w-4 h-4"/> : <EyeOff className="w-4 h-4"/>}
              </button>

              <button className={clx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")} onClick={(e) => { e.stopPropagation(); onToggleLock(it.id) }} title={it.locked ? "Unlock" : "Lock"} data-no-drag="1">
                {it.locked ? <Lock className="w-4 h-4"/> : <Unlock className="w-4 h-4"/>}
              </button>

              <button className={clx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")} onClick={(e) => { e.stopPropagation(); onDuplicate(it.id) }} title="Duplicate" data-no-drag="1">
                <Copy className="w-4 h-4"/>
              </button>

              <button className={clx("w-8 h-8 grid place-items-center border bg-transparent", isActive ? "border-white/40" : "border-black/20")} onClick={(e) => { e.stopPropagation(); onDelete(it.id) }} title="Delete" data-no-drag="1">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
