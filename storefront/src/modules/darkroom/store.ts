"use client"

import { create } from "zustand"

export type Side = "front" | "back"
export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "image" | "crop"
export type Blend =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"

export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"

type State = {
  // ui
  showPanel: boolean
  togglePanel: () => void

  // canvas
  side: Side
  setSide: (s: Side) => void

  // selection
  selectedId: string | null
  select: (id: string | null) => void

  // tools
  tool: Tool
  setTool: (t: Tool) => void

  // brush
  brushSize: number
  brushColor: string
  setBrushSize: (n: number) => void
  setBrushColor: (c: string) => void

  // shapes
  shapeKind: ShapeKind
  setShapeKind: (s: ShapeKind) => void

  // crop state
  isCropping: boolean
  setCropping: (v: boolean) => void
}

export const useDarkroom = create<State>((set) => ({
  showPanel: false,
  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),

  side: "front",
  setSide: (side) => set({ side }),

  selectedId: null,
  select: (id) => set({ selectedId: id }),

  tool: "move",
  setTool: (tool) => set({ tool }),

  brushSize: 8,
  brushColor: "#ff3198", // фирменный «эмо» розовый по умолчанию
  setBrushSize: (n) => set({ brushSize: n }),
  setBrushColor: (c) => set({ brushColor: c }),

  shapeKind: "line",
  setShapeKind: (shapeKind) => set({ shapeKind }),

  isCropping: false,
  setCropping: (v) => set({ isCropping: v }),
}))
