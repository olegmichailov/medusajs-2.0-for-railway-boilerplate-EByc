"use client"

import { useRef, useState } from "react"
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
  mode: "move" | "brush" | "crop"
  onModeChange: (m: "move" | "brush" | "crop") => void
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
  const [imgOpacity, setImgOpacity] = useState(100)

  const Panel = (
    <div className="w-full max-w-[360px] bg-white border border-black/10 shadow-lg p-3 sm:p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 border ${mode === "move" ? "bg-black text-white" : ""}`}
            onClick={() => onModeChange("move")}
          >
            Move
          </button>
          <button
            className={`px-3 py-1 border ${mode === "brush" ? "bg-black text-white" : ""}`}
            onClick={() => onModeChange("brush")}
          >
            Brush
          </button>
          <button
            className={`px-3 py-1 border ${mode === "crop" ? "bg-black text-white" : ""}`}
            onClick={() => onModeChange("crop")}
          >
            Crop
          </button>
        </div>

        <div className="flex gap-1">
          <button
            className={`px-3 py-1 border ${side === "front" ? "bg-black text-white" : ""}`}
            onClick={() => onSideChange("front")}
          >
            Front
          </button>
          <button
            className={`px-3 py-1 border ${side === "back" ? "bg-black text-white" : ""}`}
            onClick={() => onSideChange("back")}
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex gap-2">
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

      <div>
        <div className="text-xs mb-1">Selected image opacity: {imgOpacity}%</div>
        <input
          type="range"
          min={0}
          max={100}
          value={imgOpacity}
          onChange={(e) => setImgOpacity(+e.target.value)}
          className="w-full"
        />
        <div className="text-xs text-black/50 mt-1">* Прозрачность применяется у выбранного объекта через трансформер (слайдер сохранится при следующем выборе).</div>
      </div>

      <div>
        <div className="text-xs mb-1">Brush size: {brushSize}px</div>
        <input type="range" min={1} max={40} value={brushSize} onChange={(e) => onBrushSize(+e.target.value)} className="w-full" />
      </div>

      <div>
        <div className="text-xs mb-1">Brush color</div>
        <input type="color" value={brushColor} onChange={(e) => onBrushColor(e.target.value)} className="w-8 h-8 border" />
      </div>

      <div className="flex gap-2">
        <button className="px-3 py-1 border" onClick={onClearStrokes}>
          Clear strokes
        </button>
        {mode === "crop" && (
          <>
            <button className="px-3 py-1 border" onClick={onCancelCrop}>
              Cancel crop
            </button>
            <button className="px-3 py-1 border" onClick={onApplyCrop} disabled={!hasCrop}>
              Apply crop
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button className="px-3 py-1 border" onClick={onDownloadFront}>
          Download Front
        </button>
        <button className="px-3 py-1 border" onClick={onDownloadBack}>
          Download Back
        </button>
      </div>
    </div>
  )

  if (isMobile) {
    // Мобайл: кнопка Create и снизу sheet
    return (
      <div className="fixed left-0 right-0 bottom-4 flex justify-center pointer-events-none">
        {!open && (
          <button
            className="pointer-events-auto px-5 py-3 bg-black text-white"
            onClick={() => onOpenChange(true)}
          >
            Create
          </button>
        )}
        {open && (
          <div className="pointer-events-auto fixed left-0 right-0 bottom-0 p-3 bg-white border-t shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <div className="font-medium">Darkroom</div>
              <button className="px-3 py-1 border" onClick={() => onOpenChange(false)}>
                Close
              </button>
            </div>
            {Panel}
          </div>
        )}
      </div>
    )
  }

  // Desktop: выезжающая справа панель
  return (
    <div className="fixed right-4 top-[96px]">{open ? Panel : (
      <button className="px-5 py-3 bg-black text-white" onClick={() => onOpenChange(true)}>Create</button>
    )}</div>
  )
}
