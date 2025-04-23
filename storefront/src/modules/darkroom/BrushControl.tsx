"use client"

import { HexColorPicker } from "react-colorful"
import { useDarkroomStore } from "./store"

export default function BrushControl() {
  const { color, setColor, brushSize, setBrushSize } = useDarkroomStore()

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm uppercase">Brush</label>
      <input
        type="range"
        min="1"
        max="20"
        value={brushSize}
        onChange={(e) => setBrushSize(Number(e.target.value))}
      />
      <HexColorPicker color={color} onChange={setColor} />
    </div>
  )
}
