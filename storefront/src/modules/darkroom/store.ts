Вот 4/4 — storefront/src/modules/darkroom/store.ts (целиком, без сокращений).
Инструмент по умолчанию — brush. Добавил централизованное состояние вьюпорта и жестов (пинч-зуум/пан), чтобы жесты и фиксация в интерфейсе работали предсказуемо как на мобилке, так и на десктопе.

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

/** Утилита: клон с ограничением в диапазоне */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

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
  /** Текущая сторона макета */
  side: Side

  /** Активный инструмент */
  tool: Tool

  /** Параметры кисти */
  brushColor: string
  brushSize: number

  /** Выбранный шейп для добавления */
  shapeKind: ShapeKind

  /** Выделенный слой (id Konva-ноды) */
  selectedId: string | null

  /** Видимость панели слоёв (десктоп) */
  showLayers: boolean

  /** Вьюпорт для Stage (единый источник правды для зума/панорамирования) */
  viewport: Viewport

  /** Состояние жестов (мобильные пинч/пан) */
  gesture: GestureState

  /** Заблокирован ли скролл страницы (когда открыт мобильный шторок Create) */
  uiScrollLocked: boolean

  // ====== Действия ======

  /** Универсальный сеттер куска состояния */
  set: (p: Partial<State>) => void

  /** Выбор/снятие выбора слоя */
  select: (id: string | null) => void

  /** Переключение видимости панели слоёв */
  toggleLayers: () => void

  /** Смена инструмента (с правилами UX) */
  setTool: (t: Tool) => void

  /** Смена параметров кисти */
  setBrushColor: (hex: string) => void
  setBrushSize: (px: number) => void

  /** Смена активного шейпа */
  setShapeKind: (k: ShapeKind) => void

  /** Обновление вьюпорта (пан/зум) с клампом */
  setViewport: (patch: Partial<Viewport>) => void

  /** Сброс вьюпорта к исходному (центровка задаётся снаружи через EditorCanvas) */
  resetViewport: () => void

  /** Жесты: начало/обновление/окончание пинча (масштаб вокруг центра) */
  pinchStart: (center: { x: number; y: number }, distance: number) => void
  pinchMove: (center: { x: number; y: number }, distance: number) => void
  pinchEnd: () => void

  /** Жесты: начало/обновление/окончание пана */
  panStart: (point: { x: number; y: number }) => void
  panMove: (point: { x: number; y: number }) => void
  panEnd: () => void

  /** Автоматически включать MOVE после импорта изображения/фигуры/текста */
  autoMoveAfterInsert: () => void

  /** Блокировка/разблокировка прокрутки страницы (для мобильной шторки) */
  lockUiScroll: (lock: boolean) => void
}

/** Начальные значения */
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
  // Базовые параметры
  side: "front",

  // Инструмент по умолчанию — BRUSH, как и просили
  tool: "brush",

  brushColor: "#ff2a7f",
  brushSize: 36,

  shapeKind: "circle",

  selectedId: null,

  // Панель слоёв видима на десктопе
  showLayers: true,

  viewport: { ...initialViewport },
  gesture: { ...initialGesture },

  uiScrollLocked: false,

  // ==== actions ====

  set: (p) => set(p),

  select: (id) => set({ selectedId: id }),

  toggleLayers: () => set((s) => ({ showLayers: !s.showLayers })),

  setTool: (t) => {
    // UX-правила:
    // 1) В режимах brush/erase — отключаем взаимодействие с объектами (делается в Canvas), тут только фиксируем сам инструмент.
    // 2) При переходе в move/text/shape — взаимодействие с объектами разрешено.
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
      // коэффициент масштаба
      const k = clamp(distance / s.gesture.startDistance, 0.1, 10)
      const targetScale = clamp(s.gesture.startScale * k, MIN_ZOOM, MAX_ZOOM)

      // Зум относительно центра жеста: компенсируем смещение, чтобы не "улетало"
      const { scale: prevScale, x: prevX, y: prevY } = s.viewport
      const cx = s.gesture.center?.x ?? center.x
      const cy = s.gesture.center?.y ?? center.y

      // Переводим координаты центра экрана в мировые, затем снова в экранные с новым масштабом
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
    // Когда пользователь добавил картинку/шейп/текст — автоматически включаем MOVE,
    // чтобы можно было сразу подвинуть/повернуть объект, не оставляя кисть активной.
    set({ tool: "move" })
  },

  lockUiScroll: (lock) => {
    // Флаг для внешнего эффекта: EditorCanvas/Toolbar могут слушать этот стейт
    // и включать/выключать body scroll locking.
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
