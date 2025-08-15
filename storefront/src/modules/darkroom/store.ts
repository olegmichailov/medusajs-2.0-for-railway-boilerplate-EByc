"use client"

import { create } from "zustand"

/** Стороны мокапа */
export type Side = "front" | "back"

/** Инструменты редактора */
export type Tool = "move" | "brush" | "erase" | "text" | "shape" | "crop"

/** Набор шейпов */
export type ShapeKind = "circle" | "square" | "triangle" | "cross" | "line"

/** Режимы смешивания */
export type Blend =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "xor"

/** Границы масштабирования холста */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

/** Утилита: ограничение значения в диапазоне */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v))

/** Геометрия вьюпорта/жестов для предсказуемого UX */
type Viewport = {
  scale: number
  x: number
  y: number
}

/** Текущее состояние жестов (пинч/пан) */
type GestureState = {
  isPinching: boolean
  startDistance: number | null
  startScale: number
  center: { x: number; y: number } | null

  isPanning: boolean
  panStart: { x: number; y: number } | null
  viewStart: { x: number; y: number } | null
}

/** Состояние редактора (глобальный стор) */
type State = {
  side: Side
  tool: Tool

  brushColor: string
  brushSize: number

  shapeKind: ShapeKind

  selectedId: string | null

  showLayers: boolean

  viewport: Viewport
  gesture: GestureState

  uiScrollLocked: boolean

  set: (p: Partial<State>) => void
  select: (id: string | null) => void
  toggleLayers: () => void
  setTool: (t: Tool) => void
  setBrushColor: (hex: string) => void
  setBrushSize: (px: number) => void
  setShapeKind: (k: ShapeKind) => void

  setViewport: (patch: Partial<Viewport>) => void
  resetViewport: () => void

  pinchStart: (center: { x: number; y: number }, distance: number) => void
  pinchMove: (center: { x: number; y: number }, distance: number) => void
  pinchEnd: () => void

  panStart: (point: { x: number; y: number }) => void
  panMove: (point: { x: number; y: number }) => void
  panEnd: () => void

  autoMoveAfterInsert: () => void
  lockUiScroll: (lock: boolean) => void
}

const initialViewport: Viewport = { scale: 1, x: 0, y: 0 }
const initialGesture: GestureState = {
  isPinching: false,
  startDistance: null,
  startScale: 1,
  center: null,

  isPanning: false,
  panStart: null,
  viewStart: null,
}

/**
 * Глобальный Zustand-стор Darkroom.
 * Сосредотачиваем UX-правила здесь, чтобы EditorCanvas и Toolbar оставались «тонкими».
 */
export const useDarkroom = create<State>((set, get) => ({
  side: "front",

  // Инструмент по умолчанию — BRUSH, как и просили
  tool: "brush",

  brushColor: "#ff2a7f",
  brushSize: 36,

  shapeKind: "circle",

  selectedId: null,

  showLayers: true,

  viewport: { ...initialViewport },
  gesture: { ...initialGesture },

  uiScrollLocked: false,

  set: (p) => set(p),

  select: (id) => set({ selectedId: id }),

  toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),

  setTool: (t) => {
    set({ tool: t })
  },

  setBrushColor: (hex) => set({ brushColor: hex }),
  setBrushSize: (px) => set({ brushSize: clamp(Math.round(px), 1, 240) }),

  setShapeKind: (k) => set({ shapeKind: k }),

  setViewport: (patch) =>
    set((s) => {
      const next: Viewport = {
        scale: clamp(patch.scale ?? s.viewport.scale, MIN_ZOOM, MAX_ZOOM),
        x: patch.x ?? s.viewport.x,
        y: patch.y ?? s.viewport.y,
      }
      return { viewport: next }
    }),

  resetViewport: () => set({ viewport: { ...initialViewport } }),

  pinchStart: (center, distance) =>
    set((s) => ({
      gesture: {
        ...s.gesture,
        isPinching: true,
        startDistance: Math.max(0.0001, distance),
        startScale: s.viewport.scale,
        center,
      },
    })),

  pinchMove: (center, distance) =>
    set((s) => {
      if (!s.gesture.isPinching || !s.gesture.startDistance) return {}
      const k = clamp(distance / s.gesture.startDistance, 0.1, 10)
      const targetScale = clamp(s.gesture.startScale * k, MIN_ZOOM, MAX_ZOOM)

      const { scale: prevScale, x: prevX, y: prevY } = s.viewport
      const cx = s.gesture.center?.x ?? center.x
      const cy = s.gesture.center?.y ?? center.y

      // Зум относительно центра жеста
      const worldX = (cx - prevX) / prevScale
      const worldY = (cy - prevY) / prevScale

      const newX = cx - worldX * targetScale
      const newY = cy - worldY * targetScale

      return {
        viewport: { scale: targetScale, x: newX, y: newY },
        gesture: { ...s.gesture, center },
      }
    }),

  pinchEnd: () =>
    set((s) => ({
      gesture: { ...s.gesture, isPinching: false, startDistance: null, center: null },
    })),

  panStart: (point) =>
    set((s) => ({
      gesture: {
        ...s.gesture,
        isPanning: true,
        panStart: point,
        viewStart: { x: s.viewport.x, y: s.viewport.y },
      },
    })),

  panMove: (point) =>
    set((s) => {
      if (!s.gesture.isPanning || !s.gesture.panStart || !s.gesture.viewStart) return {}
      const dx = point.x - s.gesture.panStart.x
      const dy = point.y - s.gesture.panStart.y
      return {
        viewport: { ...s.viewport, x: s.gesture.viewStart.x + dx, y: s.gesture.viewStart.y + dy },
      }
    }),

  panEnd: () =>
    set((s) => ({
      gesture: { ...s.gesture, isPanning: false, panStart: null, viewStart: null },
    })),

  autoMoveAfterInsert: () => {
    // После добавления изображения/шейпа/текста автоматически включаем MOVE
    set({ tool: "move" })
  },

  lockUiScroll: (lock) => {
    set({ uiScrollLocked: lock })
    if (typeof document !== "undefined") {
      const cls = "overflow-hidden"
      const body = document.body
      if (lock) {
        if (!body.classList.contains(cls)) body.classList.add(cls)
      } else {
        body.classList.remove(cls)
      }
    }
  },
}))
