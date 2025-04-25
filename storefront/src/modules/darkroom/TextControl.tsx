"use client"

import { useState } from "react"
import { HexColorPicker } from "react-colorful"
import { useDarkroomStore } from "./store"
import { fabric } from "fabric"

export default function TextControl() {
  const [text, setText] = useState("")
  const { color } = useDarkroomStore()

  const handleAddText = () => {
    if (!text.trim()) return
    const canvasEl = document.querySelector("canvas")
    if (!canvasEl) return

    const canvas = fabric.Canvas?.activeInstance
    if (!canvas) return

    const textbox = new fabric.Textbox(text, {
      left: 100,
      top: 100,
      fill: color,
      fontSize: 28,
      fontFamily: "Arial",
      editable: true,
    })

    canvas.add(textbox)
    canvas.setActiveObject(textbox)
    canvas.requestRenderAll()
    setText("")
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        placeholder="Add text..."
        onChange={(e) => setText(e.target.value)}
        className="px-2 py-1 text-black text-sm"
      />
      <button
        onClick={handleAddText}
        className="border px-3 py-1 text-sm uppercase hover:bg-white hover:text-black"
      >
        Add
      </button>
      <HexColorPicker color={color} onChange={() => {}} />
    </div>
  )
}
