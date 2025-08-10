"use client"

import { create } from "zustand"

export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "image" | "crop"

export type Blend =
  | "source-over" // Normal
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"

export type Side = "front" | "back"

type LayerKind = "image" | "shape" | "text" | "stroke"

export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"

export interface LayerMeta {
  id: string
  kind: LayerKind
  side: Side
  blend: Blend
  opacity: number
  raster: number // 0 = off; >0 = pixel size
}

type DarkroomState = {
  tool: Tool
  side: Side
  showPanel: boolean
  brushSize: number
  brushColor: string
  selectedId: string | null
  shapeKind: ShapeKind
  // runtime flags
  isCropping: boolean
  set: (p: Partial<DarkroomState>) => void
  togglePanel: () => void
  select: (id: string | null) => void
}

export const useDarkroom = create<DarkroomState>((set) => ({
  tool: "brush",
  side: "front",
  showPanel: false,
  brushSize: 8,
  brushColor: "#ff2fa3",
  selectedId: null,
  shapeKind: "circle",
  isCropping: false,
  set: (p) => set(p),
  togglePanel: () => set((s) => ({ showPanel: !s.showPanel })),
  select: (id) => set({ selectedId: id }),
}))
