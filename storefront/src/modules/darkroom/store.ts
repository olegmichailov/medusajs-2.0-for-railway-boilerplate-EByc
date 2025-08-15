// storefront/src/modules/darkroom/store.ts
"use client"

import { create } from "zustand"

/** Стороны мокапа */
export type Side = "front" | "back"

/** Инструменты редактора */
export type Tool = "move" | "brush" | "erase" | "shape" | "crop"

/** Набор шейпов */
export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"

/** Режимы смешивания (используется в панелях слоёв) */
export type Blend =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "xor"

/** Глобальное состояние редактора */
type State = {
  side: Side
  tool: Tool

  brushColor: string
  brushSize: number

  shapeKind: ShapeKind

  /** id выбранного узла Konva (строки/текст/шейп/картинка) */
  selectedId: string | null

  /** отображать ли desktop-панель слоёв */
  showLayers: boolean

  /** универсальный set-патч для простых обновлений (EditorCanvas/Toolbar его вызывают) */
  set: (patch: Partial<State>) => void

  /** выбрать слой/узел */
  select: (id: string | null) => void

  /** открыть/закрыть панель слоёв (desktop) */
  toggleLayers: () => void
}

export const useDarkroom = create<State>((set) => ({
  side: "front",

  // Инструмент по умолчанию — BRUSH (по требованиям)
  tool: "brush",

  brushColor: "#ff2a7f",
  brushSize: 36,

  shapeKind: "circle",

  selectedId: null,

  // На десктопе панель слоёв показана, на мобиле её просто не рендерим
  showLayers: true,

  set: (patch) => set(patch),

  select: (id) => set({ selectedId: id }),

  toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),
}))
