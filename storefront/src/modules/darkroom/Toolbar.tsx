"use client"

import { useDarkroomStore } from "./store"
import BrushControl from "./BrushControl"
import TextControl from "./TextControl"

export default function Toolbar() {
  const { tool, setTool } = useDarkroomStore()

  return (
    <div className="flex flex-wrap items-center gap-4 mb-4">
      <button
        onClick={() => setTool("select")}
        className={`px-3 py-1 text-sm uppercase border ${
          tool === "select" ? "bg-white text-black" : "bg-black text-white"
        }`}
      >
        Select
      </button>
      <button
        onClick={() => setTool("draw")}
        className={`px-3 py-1 text-sm uppercase border ${
          tool === "draw" ? "bg-white text-black" : "bg-black text-white"
        }`}
      >
        Draw
      </button>
      <button
        onClick={() => setTool("text")}
        className={`px-3 py-1 text-sm uppercase border ${
          tool === "text" ? "bg-white text-black" : "bg-black text-white"
        }`}
      >
        Text
      </button>

      {tool === "draw" && <BrushControl />}
      {tool === "text" && <TextControl />}
    </div>
  )
}
