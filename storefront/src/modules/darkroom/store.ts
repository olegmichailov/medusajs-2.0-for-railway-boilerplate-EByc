"use client"
import { create } from "zustand"

export type Side = "front" | "back"
export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "image" | "crop"
export type ShapeKind = "circle" | "square" | "triangle" | "line" | "cross" | "star" | "heart"
export type Blend =
  | "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge"
  | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue"
  | "saturation" | "color" | "luminosity" | "lighter" | "destination-out"

type UIState = {
  side: Side
  tool: Tool
  shapeKind: ShapeKind
  brushColor: string
  brushSize: number
  selectedId: string | null
  showLayers: boolean
  fontFamily: string
  fontSize: number
  set: (patch: Partial<UIState>) => void
  select: (id: string | null) => void
  toggleLayers: () => void
}

export const useDarkroom = create<UIState>((set) => ({
  side: "front",
  tool: "brush",
  shapeKind: "circle",
  brushColor: "#ff2b7a",
  brushSize: 36,
  selectedId: null,
  showLayers: true,
  fontFamily: "Inter",
  fontSize: 64,
  set: (patch) => set(patch),
  select: (id) => set({ selectedId: id }),
  toggleLayers: () => set(s => ({ showLayers: !s.showLayers }))
}))
