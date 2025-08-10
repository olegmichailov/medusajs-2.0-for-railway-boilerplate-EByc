"use client"

import { useRef } from "react"
import { isMobile } from "react-device-detect"

type Side = "front" | "back"

export default function Toolbar({
  open,
  onOpenChange,
  side,
  onSideChange,
  mode,
  onModeChange,
  brushColor,
  onBrushColor,
  brushSize,
  onBrushSize,
  onAddImage,
  onClearStrokes,
  onDeleteSelected,
  onDuplicateSelected,
  onApplyCrop,
  onCancelCrop,
  hasCrop,
  onDownloadFront,
  onDownloadBack,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  side: Side
  onSideChange: (s: Side) => void
  mode: "move" | "brush" | "erase" | "crop"
  onModeChange: (m: "move" | "brush" | "erase" | "crop") => void
  brushColor: string
  onBrushColor: (c: string) => void
  brushSize: number
  onBrushSize: (n: number) => void
  onAddImage: (file: File) => void
  onClearStrokes: () => void
  onDeleteSelected: () => void
  onDuplicateSelected: () => void
  onApplyCrop: () => void
  onCancelCrop: () => void
  hasCrop: boolean
  onDownloadFront: () => void
  onDownloadBack: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const Controls = (
    <div className="w-full max-w-[420px] bg-white/90 backdrop-blur border border-black p-4 shadow-[0_8px_40px_rgba(0,0,0,0.2)]">
      {/* кнопки режимов */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          ["move", "Move"],
          ["brush", "Brush"],
          ["erase", "Erase"],
          ["crop", "Crop"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1 border ${mode === key ? "bg-black text-white" : ""}`}
            onClick={() => onModeChange(key as any)}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button className={`px-3 py-1 border ${side === "front" ? "bg-black text-white" : ""}`} onClick={() => onSideChange("front")}>
            Front
          </button>
          <button className={`px-3 py-1 border ${side === "back" ? "bg-black text-white" : ""}`} onClick={() => onSideChange("back")}>
            Back
          </button>
        </div>
      </div>

      {/* добавление/дублирование/удаление */}
      <div className="flex gap-2 mb-3">
        <button className="px-3 py-1 border" onClick={() => fileRef.current?.click()}>
          Add image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onAddImage(f)
            e.currentTarget.value = ""
          }}
        />
        <button className="px-3 py-1 border" onClick={onDuplicateSelected}>
          Duplicate
        </button>
        <button className="px-3 py-1 border" onClick={onDeleteSelected}>
          Delete
        </button>
      </div>

      {/* кисть */}
      <div className="mb-3">
        <div className="text-xs mb-1">Brush size: {brushSize}px</div>
        <input
          type="range"
          min={1}
          max={60}
          value={brushSize}
          onChange={(e) => onBrushSize(+e.target.value)}
          className="w-full h-2 appearance-none bg-black cursor-pointer touch-none
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white
            [&::-webkit-slider-thumb]:rounded-none
            [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:background-black"
          style={{ WebkitTapHighlightColor: "transparent" }}
        />
      </div>

      <div className="mb-3">
        <div className="text-xs mb-1">Brush color</div>
        <input type="color" value={brushColor} onChange={(e) => onBrushColor(e.target.value)} className="w-8 h-8 border p-0" />
      </div>

      {/* crop */}
      {mode === "crop" && (
        <div className="flex gap-2 mb-3">
          <button className="px-3 py-1 border" onClick={onCancelCrop}>
            Cancel crop
          </button>
          <button className="px-3 py-1 border" onClick={onApplyCrop} disabled={!hasCrop}>
            Apply crop
          </button>
        </div>
      )}

      {/* прочее */}
      <div className="flex gap-2">
        <button className="px-3 py-1 border" onClick={onClearStrokes}>
          Clear strokes
        </button>
        <div className="ml-auto flex gap-2">
          <button className="px-3 py-1 border" onClick={onDownloadFront}>
            Download Front
          </button>
          <button className="px-3 py-1 border" onClick={onDownloadBack}>
            Download Back
          </button>
        </div>
      </div>

      <div className="text-[11px] text-black/60 mt-3 leading-relaxed">
        Shortcuts: Delete — remove, ⌘/Ctrl+C/⌘/Ctrl+V — copy/paste, ⌘/Ctrl+D — duplicate, [ / ] — layer back/forward,
        Shift+ / Shift− — blend mode (Normal/Multiply/Screen/Overlay/Darken/Lighten).
      </div>
    </div>
  )

  // Мобайл — нижний шит
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-4 flex justify-center pointer-events-none">
        {!open ? (
          <button className="pointer-events-auto px-5 py-3 bg-black text-white" onClick={() => onOpenChange(true)}>
            Create
          </button>
        ) : (
          <div className="pointer-events-auto fixed inset-x-0 bottom-0 p-3">
            <div className="flex justify-end mb-2">
              <button className="px-3 py-1 border bg-white/90 backdrop-blur border-black" onClick={() => onOpenChange(false)}>
                Close
              </button>
            </div>
            {Controls}
          </div>
        )}
      </div>
    )
  }

  // Десктоп — оверлей по центру (в стиле существующих модалок)
  return (
    <div className="fixed inset-0 flex items-start justify-center pointer-events-none">
      {!open ? (
        <div className="pointer-events-auto fixed top-[92px] right-6">
          <button className="px-5 py-3 bg-black text-white" onClick={() => onOpenChange(true)}>
            Create
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto fixed top-[92px] flex justify-center w-full">
          {Controls}
        </div>
      )}
    </div>
  )
}
