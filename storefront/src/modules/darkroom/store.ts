import { create } from "zustand"

type Tool = "select" | "draw" | "text"

interface DarkroomState {
  tool: Tool
  setTool: (tool: Tool) => void
  color: string
  setColor: (color: string) => void
  brushSize: number
  setBrushSize: (size: number) => void
  textInput: string
  setTextInput: (text: string) => void
}

export const useDarkroomStore = create<DarkroomState>((set) => ({
  tool: "select",
  setTool: (tool) => set({ tool }),
  color: "#ffffff",
  setColor: (color) => set({ color }),
  brushSize: 4,
  setBrushSize: (size) => set({ brushSize: size }),
  textInput: "",
  setTextInput: (text) => set({ textInput: text }),
}))
