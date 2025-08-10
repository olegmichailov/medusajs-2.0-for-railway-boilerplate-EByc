"use client"

import { create } from "zustand"

export type Side = "front" | "back"
export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "image" | "crop"
export type Blend = "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"

type UIState = {
  showLayers: boolean
  toggleLayers: () => void
}

type DrawState = {
  side: Side
  tool: Tool
  brushColor: string
  brushSize: number
  shapeKind: ShapeKind
  selectedId: string | null
  isCropping: boolean
  set: (s: Partial<DrawState & UIState>) => void
  select: (id: string | null) => void
}

export const useDarkroom = create<UIState & DrawState>((set) => ({
  showLayers: true,
  toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),

  side: "front",
  tool: "brush",
  brushColor: "#ff2a7a",
  brushSize: 6,
  shapeKind: "circle",
  selectedId: null,
  isCropping: false,

  set: (s) => set(s),
  select: (id) => set({ selectedId: id }),
}))
