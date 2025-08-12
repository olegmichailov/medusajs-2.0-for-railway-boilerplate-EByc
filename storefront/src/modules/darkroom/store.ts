"use client"

import { create } from "zustand"

export type Side = "front" | "back"
export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "crop"
export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"
export type Blend =
  | "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "xor"

type State = {
  side: Side
  tool: Tool
  brushColor: string
  brushSize: number
  shapeKind: ShapeKind
  selectedId: string | null
  showLayers: boolean

  // моб. шторка
  mobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void

  // brush-сессия (группа с линиями)
  activeBrushSessionId: string | null
  beginBrushSession: (id: string) => void
  endBrushSession: () => void

  set: (p: Partial<State>) => void
  select: (id: string | null) => void
  toggleLayers: () => void
}

export const useDarkroom = create<State>((set) => ({
  side: "front",
  tool: "brush",                     // <-- Brush по умолчанию
  brushColor: "#ff2a7f",
  brushSize: 36,
  shapeKind: "circle",
  selectedId: null,
  showLayers: true,

  mobileOpen: false,
  openMobile: () => set({ mobileOpen: true }),
  closeMobile: () => set({ mobileOpen: false }),

  activeBrushSessionId: null,
  beginBrushSession: (id) => set({ activeBrushSessionId: id }),
  endBrushSession: () => set({ activeBrushSessionId: null }),

  set: (p) => set(p),
  select: (id) => set({ selectedId: id }),
  toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),
}))
