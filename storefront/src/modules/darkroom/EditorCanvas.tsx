"use client"

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Stage, Layer, Image as KonvaImageReact, Transformer, Group as KonvaGroupReact } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

/**
 * Базовые размеры макета
 */
const BASE_CANVAS_WIDTH  = 2400
const BASE_CANVAS_HEIGHT = 3200
const FRONT_MOCKUP_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_MOCKUP_SRC  = "/mockups/MOCAP_BACK.png"

/**
 * Ограничения текста (разумные)
 */
const TEXT_MIN_FONT_SIZE = 8
const TEXT_MAX_FONT_SIZE = 800
// разрешаем ширину намного шире холста, чтобы точно «не упираться»
const TEXT_MAX_WRAP_WIDTH = Math.floor(BASE_CANVAS_WIDTH * 4)

/**
 * Числовые утилиты
 */
const SMALL_EPS = 0.25
// «мёртвая зона» по изменению масштаба, чтобы подавить дрожь при едва двигающемся курсоре
const DEAD_ZONE = 0.006
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))
const makeId = () => "n_" + Math.random().toString(36).slice(2)

/**
 * Типы-ярлыки
 */
type BaseMeta = {
  blend: Blend
  opacity: number
  name: string
  visible: boolean
  locked: boolean
}

type LayerKind = "image" | "shape" | "text" | "strokes" | "erase"

type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon

type AnyLayer = {
  id: string
  side: Side
  node: AnyNode
  meta: BaseMeta
  type: LayerKind
}

/**
 * Узконаправленные предикаты
 */
const isStrokeGroup = (n: AnyNode) =>
  n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup = (n: AnyNode) =>
  n instanceof Konva.Group && (n as any)._isErase === true
const isTextNode = (n: AnyNode): n is Konva.Text => n instanceof Konva.Text
const isImageOrRect = (n: AnyNode) =>
  n instanceof Konva.Image || n instanceof Konva.Rect

/**
 * Минимальная «мягкая» ширина текста — ориентир, похожий на «одну букву».
 * Делаем её очень маленькой (≈ 0.2 * fontSize), чтобы не было резкого дёрга до минимума.
 * Схлопывание в ноль при этом исключаем отдельной защитой.
 */
const softMinWrapWidth = (t: Konva.Text) =>
  Math.max(2, Math.round((t.fontSize() || 1) * 0.2))

/**
 * Главный компонент
 */
export default function EditorCanvas() {
  const {
    side,
    set,
    tool,
    brushColor,
    brushSize,
    shapeKind,
    selectedId,
    select,
    showLayers,
    toggleLayers,
  } = useDarkroom()

  /**
   * Блокировка скролла и выбор стартового инструмента на мобилке
   */
  useEffect(() => {
    if (isMobile) set({ tool: "brush" as Tool })
  }, [set])
  useEffect(() => {
    ;(Konva as any).hitOnDragEnabled = true
  }, [])

  /**
   * Мокапы (фон)
   */
  const [frontMockupImage] = useImage(FRONT_MOCKUP_SRC, "anonymous")
  const [backMockupImage]  = useImage(BACK_MOCKUP_SRC,  "anonymous")

  /**
   * Ссылки на Stage/слои/UI
   */
  const stageRef = useRef<Konva.Stage>(null)
  const backgroundLayerRef = useRef<Konva.Layer>(null)
  const artworkLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef = useRef<Konva.Layer>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const frontMockupRef = useRef<Konva.Image>(null)
  const backMockupRef  = useRef<Konva.Image>(null)
  const frontArtworkGroupRef = useRef<Konva.Group>(null)
  const backArtworkGroupRef  = useRef<Konva.Group>(null)

  /**
   * Состояния слоёв
   */
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [nameSequences, setNameSequences] = useState({
    image: 1, shape: 1, text: 1, strokes: 1, erase: 1,
  })

  /**
   * Глобальный тик для принудительной синхронизации UI-панелей
   */
  const [uiRefreshTick, setUiRefreshTick] = useState(0)
  const forceUiRefresh = () => setUiRefreshTick((v) => (v + 1) | 0)

  /**
   * Активные ID для кисти/ластика
   */
  const currentStrokeIdRef = useRef<Record<Side, string | null>>({
    front: null, back: null,
  })
  const currentEraseIdRef = useRef<Record<Side, string | null>>({
    front: null, back: null,
  })

  /**
   * Флаг «прямо сейчас идёт трансформация» (чтобы не мешать событиям рисования)
   */
  const isTransformingRef = useRef(false)

  /**
   * Верстка/масштаб под окно
   */
  const [headerHeight, setHeaderHeight] = useState(64)
  useLayoutEffect(() => {
    const headerEl =
      (document.querySelector("header") ||
        document.getElementById("site-header")) as HTMLElement | null
    setHeaderHeight(Math.ceil(headerEl?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewWidth, viewHeight, stageScale, padTop, padBottom } = useMemo(() => {
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 800
    const topPadding = headerHeight + 8
    const bottomPadding = isMobile ? 120 : 72
    const maxW = viewportW - 24
    const maxH = viewportH - (topPadding + bottomPadding)
    const scale = Math.min(maxW / BASE_CANVAS_WIDTH, maxH / BASE_CANVAS_HEIGHT, 1)
    return {
      viewWidth: BASE_CANVAS_WIDTH * scale,
      viewHeight: BASE_CANVAS_HEIGHT * scale,
      stageScale: scale,
      padTop: topPadding,
      padBottom: bottomPadding,
    }
  }, [showLayers, headerHeight])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  /**
   * Утилиты по слоям
   */
  const makeBaseMeta = (name: string): BaseMeta => ({
    blend: "source-over",
    opacity: 1,
    name,
    visible: true,
    locked: false,
  })

  const findLayerById = (id: string | null) =>
    (id ? layers.find((l) => l.id === id) || null : null)

  const findNodeById = (id: string | null) =>
    findLayerById(id)?.node || null

  const applyMetaToNode = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    // кисть/ластик не меняем по blend
    if (!isEraseGroup(node) && !isStrokeGroup(node)) {
      ;(node as any).globalCompositeOperation = meta.blend
    }
  }

  const groupForSide = (s: Side) =>
    (s === "front" ? frontArtworkGroupRef.current! : backArtworkGroupRef.current!)

  const currentArtworkGroup = () => groupForSide(side)

  const nextTopZ = () => currentArtworkGroup().children?.length ?? 0

  /**
   * Показываем только активную сторону
   */
  useEffect(() => {
    layers.forEach((layer) => {
      layer.node.visible(layer.side === side && layer.meta.visible)
    })
    frontMockupRef.current?.visible(side === "front")
    backMockupRef.current?.visible(side === "back")
    frontArtworkGroupRef.current?.visible(side === "front")
    backArtworkGroupRef.current?.visible(side === "back")
    backgroundLayerRef.current?.batchDraw()
    artworkLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  /**
   * ————————————————————————————————————————————————
   *   Т Р А Н С Ф О Р М Е Р   И   Т Е К С Т
   * ————————————————————————————————————————————————
   */

  // для очистки обработчиков при перепривязке трансформера
  const detachTextHandlersRef = useRef<(() => void) | null>(null)
  const detachGuardHandlersRef = useRef<(() => void) | null>(null)

  // снимок текстового узла на момент начала трансформации
  const textSnapshotRef = useRef<{
    box: { width: number; height: number } // рамка (selfRect)
    fontSize: number
    wrapWidth: number
    centerX: number
    centerY: number
  } | null>(null)

  const makeTextSnapshot = (t: Konva.Text) => {
    // берём собственную рамку фигуры, чтобы высота была корректной с учётом текста
    // (аналог из демо resize-text на konvajs.org)  [oai_citation:1‡Konva](https://konvajs.org/docs/select_and_transform/Force_Update.html)
    const selfRect =
      (t as any).getSelfRect?.() || {
        width: Math.max(1, t.width() || 1),
        height: Math.max(1, t.height() || 1),
      }
    const wrapWidthNow = Math.max(1, t.width() || selfRect.width)
    const heightNow = Math.max(1, selfRect.height)
    const cx = Math.round(t.x() + wrapWidthNow / 2)
    const cy = Math.round(t.y() + heightNow / 2)

    return {
      box: { width: wrapWidthNow, height: heightNow },
      fontSize: t.fontSize(),
      wrapWidth: wrapWidthNow,
      centerX: cx,
      centerY: cy,
    }
  }

  const clearTransformerBoundFunc = () => {
    const tr = transformerRef.current
    if (tr) (tr as any).boundBoxFunc(null)
  }

  const attachTransformer = () => {
    const layer = findLayerById(selectedId)
    const node = layer?.node
    const disabled =
      !node || layer?.meta.locked || isStrokeGroup(node) || isEraseGroup(node) || tool !== "move"

    // снять старые обработчики
    if (detachTextHandlersRef.current) {
      detachTextHandlersRef.current()
      detachTextHandlersRef.current = null
    }
    if (detachGuardHandlersRef.current) {
      detachGuardHandlersRef.current()
      detachGuardHandlersRef.current = null
    }
    clearTransformerBoundFunc()

    const transformer = transformerRef.current!
    if (disabled) {
      transformer.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    transformer.nodes([node])
    transformer.rotateEnabled(true)

    const onTransformStartGuard = () => { isTransformingRef.current = true }
    const onTransformEndGuard   = () => { isTransformingRef.current = false }
    node.on("transformstart.guard", onTransformStartGuard)
    node.on("transformend.guard", onTransformEndGuard)
    detachGuardHandlersRef.current = () => node.off(".guard")

    if (isTextNode(node)) {
      // ————————— ТЕКСТ —————————
      transformer.keepRatio(false)
      transformer.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center",
      ])

      const onTextTransformStart = () => {
        textSnapshotRef.current = makeTextSnapshot(node)
      }
      const onTextTransformEnd = () => {
        textSnapshotRef.current = null
        // нормализуем масштаб
        node.scaleX(1); node.scaleY(1)
        node.getLayer()?.batchDraw()
        // подсказка из демо force-update для обновления рамки трансформера  [oai_citation:2‡Konva](https://konvajs.org/docs/select_and_transform/Force_Update.html)
        requestAnimationFrame(() => {
          transformerRef.current?.forceUpdate()
          uiLayerRef.current?.batchDraw()
          forceUiRefresh()
        })
      }

      node.on("transformstart.text", onTextTransformStart)
      node.on("transformend.text",   onTextTransformEnd)

      // Управляем трансформацией сами через boundBoxFunc:
      //  • боковые ручки — меняем только width вокруг центра X
      //  • углы/верх/низ — меняем fontSize вокруг центра (без reset)
      //  • всегда возвращаем oldBox, чтобы Konva НЕ применял собственный scale (паттерн из «stop transform»)  [oai_citation:3‡Konva](https://konvajs.org/docs/select_and_transform/Stop_Transform.html)
      ;(transformer as any).boundBoxFunc((oldBox: any, newBox: any) => {
        const textNode = node as Konva.Text
        const snapshot = textSnapshotRef.current ?? makeTextSnapshot(textNode)
        const activeAnchor =
          (transformerRef.current as any)?.getActiveAnchor?.() as string | undefined

        if (!activeAnchor) return oldBox

        // — Боковые ручки: ТОЛЬКО ширина (wrap), перецентровываем по X
        if (activeAnchor === "middle-left" || activeAnchor === "middle-right") {
          const widthRatio = newBox.width / Math.max(1e-6, snapshot.box.width)

          // подавляем микродрожь
          if (Math.abs(widthRatio - 1) < DEAD_ZONE) return oldBox

          // желаемая ширина
          const desiredWrapWidth = snapshot.wrapWidth * widthRatio

          // мягкий минимум: не «щёлкать» к одной букве
          const minWrap = softMinWrapWidth(textNode)
          const boundedWrapWidth = clamp(
            Math.round(desiredWrapWidth),
            minWrap,
            TEXT_MAX_WRAP_WIDTH
          )

          if (Math.abs((textNode.width() || 0) - boundedWrapWidth) > SMALL_EPS) {
            textNode.width(boundedWrapWidth)
            // удерживаем центр X
            textNode.x(Math.round(snapshot.centerX - boundedWrapWidth / 2))
          }

          // никаких реальных scale — держим 1:1
          textNode.scaleX(1)
          textNode.scaleY(1)
          textNode.getLayer()?.batchDraw()

          // обновить рамку трансформера
          requestAnimationFrame(() => {
            transformerRef.current?.forceUpdate()
            uiLayerRef.current?.batchDraw()
            forceUiRefresh()
          })

          // блокируем родной масштаб — возвращаем oldBox
          return oldBox
        }

        // — Углы и вертикальные ручки: изменяем fontSize (пропорционально), центр сохраняем
        const widthRatio  = newBox.width  / Math.max(1e-6, snapshot.box.width)
        const heightRatio = newBox.height / Math.max(1e-6, snapshot.box.height)
        const scaleRatio  = Math.max(widthRatio, heightRatio)

        if (Math.abs(scaleRatio - 1) < DEAD_ZONE) return oldBox

        const nextFontSize = clamp(
          Math.round(snapshot.fontSize * scaleRatio),
          TEXT_MIN_FONT_SIZE,
          TEXT_MAX_FONT_SIZE
        )

        if (Math.abs(textNode.fontSize() - nextFontSize) > SMALL_EPS) {
          // применяем новый fontSize
          textNode.fontSize(nextFontSize)

          // пересчёт собственной рамки после изменения размера
          const selfRectAfter =
            (textNode as any).getSelfRect?.() || {
              width: Math.max(1, textNode.width() || snapshot.wrapWidth),
              height: Math.max(1, textNode.height() || snapshot.box.height),
            }

          const newWrapWidth = Math.max(1, textNode.width() || selfRectAfter.width)
          const newHeight    = Math.max(1, selfRectAfter.height)

          // сохраняем центр X/Y
          textNode.x(Math.round(snapshot.centerX - newWrapWidth / 2))
          textNode.y(Math.round(snapshot.centerY - newHeight    / 2))
        }

        textNode.scaleX(1)
        textNode.scaleY(1)
        textNode.getLayer()?.batchDraw()

        requestAnimationFrame(() => {
          transformerRef.current?.forceUpdate()
          uiLayerRef.current?.batchDraw()
          forceUiRefresh()
        })

        // не позволяем Konva масштабировать сам узел
        return oldBox
      })

      detachTextHandlersRef.current = () => {
        node.off(".text")
        ;(transformer as any).boundBoxFunc(null)
      }
    } else {
      // ————————— НЕ ТЕКСТ (картинки, прямоугольники, фигуры) —————————
      transformer.keepRatio(false)
      transformer.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center",
      ])

      const onGenericTransform = () => {
        const activeAnchor =
          (transformerRef.current as any)?.getActiveAnchor?.() as string | undefined

        let scaleX = (node as any).scaleX?.() ?? 1
        let scaleY = (node as any).scaleY?.() ?? 1

        const isCorner =
          activeAnchor === "top-left" ||
          activeAnchor === "top-right" ||
          activeAnchor === "bottom-left" ||
          activeAnchor === "bottom-right"

        if (isCorner) {
          const uniform = Math.max(Math.abs(scaleX), Math.abs(scaleY))
          scaleX = uniform
          scaleY = uniform
        }

        if (isImageOrRect(node)) {
          const w = (node as any).width?.() ?? 0
          const h = (node as any).height?.() ?? 0
          ;(node as any).width(Math.max(1, w * scaleX))
          ;(node as any).height(Math.max(1, h * scaleY))
        } else if (node instanceof Konva.Circle || node instanceof Konva.RegularPolygon) {
          const r = (node as any).radius?.() ?? 0
          const s = Math.max(Math.abs(scaleX), Math.abs(scaleY))
          ;(node as any).radius(Math.max(1, r * s))
        }

        ;(node as any).scaleX(1)
        ;(node as any).scaleY(1)
        node.getLayer()?.batchDraw()
        transformerRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
        forceUiRefresh()
      }

      node.on("transform.fix", onGenericTransform)
      node.on("transformend.fix", onGenericTransform)

      detachTextHandlersRef.current = () => { node.off(".fix") }
    }

    transformer.getLayer()?.batchDraw()
  }

  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  /**
   * Во время brush/erase — отключаем drag у прочих слоёв
   */
  useEffect(() => {
    const dragEnabled = tool === "move"
    layers.forEach((layer) => {
      if (layer.side !== side) return
      if (isStrokeGroup(layer.node) || isEraseGroup(layer.node)) return
      ;(layer.node as any).draggable(dragEnabled && !layer.meta.locked)
    })
    if (!dragEnabled) {
      transformerRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
    }
    if (tool !== "brush") currentStrokeIdRef.current[side] = null
    if (tool !== "erase") currentEraseIdRef.current[side]  = null
  }, [tool, layers, side])

  /**
   * Хоткеи для перемещения/удаления/дубликата
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return
      }

      const n = findNodeById(selectedId)
      if (!n || tool !== "move") return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault()
        duplicateLayer(selectedId!)
        return
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        deleteLayer(selectedId!)
        return
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault()
      }
      const step = e.shiftKey ? 20 : 3

      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x() - step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x() + step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y() - step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y() + step) }

      n.getLayer()?.batchDraw()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  /**
   * Создание/поддержка слоёв кисти/ластика
   */
  const ensureStrokeGroup = (): AnyLayer => {
    let gid = currentStrokeIdRef.current[side]
    if (gid) {
      const existing = findLayerById(gid)!
      if (existing && existing.node.opacity() < 0.02) {
        existing.node.opacity(1)
        existing.meta.opacity = 1
        artworkLayerRef.current?.batchDraw()
        forceUiRefresh()
      }
      return existing!
    }
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    g.id(makeId())
    const id = g.id()
    const meta = makeBaseMeta(`strokes ${nameSequences.strokes}`)
    currentArtworkGroup().add(g)
    g.zIndex(nextTopZ())
    const newLayer: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers((p) => [...p, newLayer])
    setNameSequences((s) => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeIdRef.current[side] = id
    select(id)
    return newLayer
  }

  const ensureEraseGroup = (): AnyLayer => {
    let gid = currentEraseIdRef.current[side]
    if (gid) return findLayerById(gid)!
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isErase = true
    g.id(makeId())
    const id = g.id()
    const meta = makeBaseMeta(`erase ${nameSequences.erase}`)
    currentArtworkGroup().add(g)
    g.zIndex(nextTopZ())
    const newLayer: AnyLayer = { id, side, node: g as AnyNode, meta, type: "erase" }
    setLayers((p) => [...p, newLayer])
    setNameSequences((s) => ({ ...s, erase: s.erase + 1 }))
    currentEraseIdRef.current[side] = id
    select(id)
    return newLayer
  }

  /**
   * Общие обработчики для нод
   */
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  const attachCommonNodeHandlers = (node: AnyNode, id: string) => {
    ;(node as any).on("click tap", () => select(id))
    if (node instanceof Konva.Text) node.on("dblclick dbltap", () => startTextOverlayEdit(node))
  }

  /**
   * Загрузка картинки
   */
  const onUploadImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min(
          (BASE_CANVAS_WIDTH * 0.9) / img.width,
          (BASE_CANVAS_HEIGHT * 0.9) / img.height,
          1
        )
        const w = img.width * ratio
        const h = img.height * ratio
        const kimg = new Konva.Image({
          image: img,
          x: BASE_CANVAS_WIDTH / 2 - w / 2,
          y: BASE_CANVAS_HEIGHT / 2 - h / 2,
          width: w,
          height: h,
        })
        ;(kimg as any).setAttr("src", reader.result as string)
        kimg.id(makeId())
        const id = kimg.id()
        const meta = makeBaseMeta(`image ${nameSequences.image}`)
        currentArtworkGroup().add(kimg)
        kimg.zIndex(nextTopZ())
        attachCommonNodeHandlers(kimg, id)
        setLayers((p) => [...p, { id, side, node: kimg, meta, type: "image" }])
        setNameSequences((s) => ({ ...s, image: s.image + 1 }))
        select(id)
        artworkLayerRef.current?.batchDraw()
        set({ tool: "move" })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  /**
   * Добавление текста
   */
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_CANVAS_WIDTH / 2 - 300,
      y: BASE_CANVAS_HEIGHT / 2 - 60,
      fontSize: 96,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor,
      width: 600,
      align: "center",
      draggable: false,
    })
    t.id(makeId())
    const id = t.id()
    const meta = makeBaseMeta(`text ${nameSequences.text}`)
    currentArtworkGroup().add(t)
    t.zIndex(nextTopZ())
    attachCommonNodeHandlers(t, id)
    setLayers((p) => [...p, { id, side, node: t, meta, type: "text" }])
    setNameSequences((s) => ({ ...s, text: s.text + 1 }))
    select(id)
    artworkLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  /**
   * Добавление простых фигур
   */
  const onAddShape = (kind: ShapeKind) => {
    let node: AnyNode
    if (kind === "circle")
      node = new Konva.Circle({
        x: BASE_CANVAS_WIDTH / 2,
        y: BASE_CANVAS_HEIGHT / 2,
        radius: 160,
        fill: brushColor,
      })
    else if (kind === "square")
      node = new Konva.Rect({
        x: BASE_CANVAS_WIDTH / 2 - 160,
        y: BASE_CANVAS_HEIGHT / 2 - 160,
        width: 320,
        height: 320,
        fill: brushColor,
      })
    else if (kind === "triangle")
      node = new Konva.RegularPolygon({
        x: BASE_CANVAS_WIDTH / 2,
        y: BASE_CANVAS_HEIGHT / 2,
        sides: 3,
        radius: 200,
        fill: brushColor,
      })
    else if (kind === "cross") {
      const g = new Konva.Group({
        x: BASE_CANVAS_WIDTH / 2 - 160,
        y: BASE_CANVAS_HEIGHT / 2 - 160,
      })
      g.add(new Konva.Rect({ width: 320, height: 60, y: 130, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 320, x: 130, fill: brushColor }))
      node = g
    } else {
      node = new Konva.Line({
        points: [
          BASE_CANVAS_WIDTH / 2 - 200,
          BASE_CANVAS_HEIGHT / 2,
          BASE_CANVAS_WIDTH / 2 + 200,
          BASE_CANVAS_HEIGHT / 2,
        ],
        stroke: brushColor,
        strokeWidth: 16,
        lineCap: "round",
      })
    }

    ;(node as any).id(makeId())
    const id = (node as any).id?.() ?? makeId()
    const meta = makeBaseMeta(`shape ${nameSequences.shape}`)
    currentArtworkGroup().add(node as any)
    ;(node as any).zIndex?.(nextTopZ())
    attachCommonNodeHandlers(node, id)
    setLayers((p) => [...p, { id, side, node, meta, type: "shape" }])
    setNameSequences((s) => ({ ...s, shape: s.shape + 1 }))
    select(id)
    artworkLayerRef.current?.batchDraw()
    set({ tool: "move" })
  }

  /**
   * Рисование кистью/ластиком
   */
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      const layer = ensureStrokeGroup()
      const g = layer.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y, x + 0.01, y + 0.01],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "source-over",
      })
      g.add(line)
      setIsDrawing(true)
      artworkLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const layer = ensureEraseGroup()
      const g = layer.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y, x + 0.01, y + 0.01],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      setIsDrawing(true)
      artworkLayerRef.current?.batchDraw()
    }
  }
  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeIdRef.current[side]
      const g = gid ? (findLayerById(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1)
      const line =
        last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
      if (!(line instanceof Konva.Line)) return
      line.points(line.points().concat([x, y]))
      artworkLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const gid = currentEraseIdRef.current[side]
      const g = gid ? (findLayerById(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      artworkLayerRef.current?.batchDraw()
    }
  }
  const finishStroke = () => setIsDrawing(false)

  /**
   * Overlay-редактор текста (textarea поверх Stage)
   * Паттерн основан на официальном примере «Textarea on top of the stage» / «Resize Text».  [oai_citation:4‡Konva](https://konvajs.org/docs/select_and_transform/Force_Update.html)
   */
  const startTextOverlayEdit = (textNode: Konva.Text) => {
    const stage = stageRef.current!
    const stageContainer = stage.container()

    const previousOpacity = textNode.opacity()
    textNode.opacity(0.01)
    textNode.getLayer()?.batchDraw()

    const textarea = document.createElement("textarea")
    textarea.value = textNode.text()

    const placeTextarea = () => {
      const bounds = stageContainer.getBoundingClientRect()
      const rect = (textNode as any).getClientRect({
        relativeTo: stage,
        skipStroke: true,
      })
      textarea.style.left   = `${bounds.left + rect.x * stageScale}px`
      textarea.style.top    = `${bounds.top  + rect.y * stageScale}px`
      textarea.style.width  = `${Math.max(2, rect.width  * stageScale)}px`
      textarea.style.height = `${Math.max(2, rect.height * stageScale)}px`
    }

    const absoluteScale = textNode.getAbsoluteScale()
    Object.assign(textarea.style, {
      position: "absolute",
      padding: "0",
      margin: "0",
      border: "1px solid #111",
      background: "transparent",
      color: String(textNode.fill() || "#000"),
      fontFamily: textNode.fontFamily(),
      fontWeight: textNode.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle:  textNode.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize:   `${textNode.fontSize() * absoluteScale.y}px`,
      lineHeight: String(textNode.lineHeight()),
      letterSpacing: `${(textNode.letterSpacing?.() ?? 0) * absoluteScale.x}px`,
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      outline: "none",
      resize: "none",
      transformOrigin: "left top",
      zIndex: "9999",
      userSelect: "text",
      caretColor: String(textNode.fill() || "#000"),
      textAlign: (textNode.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    placeTextarea()
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    const onInput = () => {
      textNode.text(textarea.value)
      textNode.getLayer()?.batchDraw()
      requestAnimationFrame(() => {
        placeTextarea()
        transformerRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
        forceUiRefresh()
      })
    }

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", placeTextarea, true)
      window.removeEventListener("resize", placeTextarea)
      textarea.removeEventListener("input", onInput)
      textarea.removeEventListener("keydown", onKey as any)
      if (apply) textNode.text(textarea.value)
      textarea.remove()
      textNode.opacity(previousOpacity)
      textNode.getLayer()?.batchDraw()
      set({ tool: "move" as Tool })
      requestAnimationFrame(() => {
        const id = (textNode as any).id?.() as string | undefined
        if (id) select(id)
        // сразу возвращаем тот же text-режим трансформера — без «переключения» на обычный
        attachTransformer()
        transformerRef.current?.nodes([textNode])
        transformerRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
        forceUiRefresh()
      })
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }

    textarea.addEventListener("input", onInput)
    textarea.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", placeTextarea)
    window.addEventListener("scroll", placeTextarea, true)
  }

  /**
   * Жесты Stage
   */
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = transformerRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvasCoords = (p: { x: number; y: number }) => ({
    x: p.x / stageScale,
    y: p.y / stageScale,
  })

  const onPointerDown = (e: any) => {
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvasCoords(sp)
      startStroke(p.x, p.y)
      return
    }
    const stage = stageRef.current!
    const target = e.target as Konva.Node
    if (target === stage || target === frontMockupRef.current || target === backMockupRef.current) {
      select(null)
      transformerRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    if (target && target !== stage && target.getParent()) {
      const found = layers.find((l) => l.node === target || l.node === (target.getParent() as any))
      if (found && found.side === side) select(found.id)
    }
  }
  const onPointerMove = (e: any) => {
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return
    if (!isDrawing) return
    const p = toCanvasCoords(getStagePointer())
    appendStroke(p.x, p.y)
  }
  const onPointerUp = () => { if (isDrawing) finishStroke() }

  /**
   * Данные для LayersPanel
   */
  const layerItems: LayerItem[] = useMemo(() => {
    void uiRefreshTick
    return layers
      .filter((l) => l.side === side)
      .sort((a, b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map((l) => ({
        id: l.id,
        name: l.meta.name || l.type,
        type: l.type as any,
        visible: l.meta.visible,
        locked: l.meta.locked,
        blend: l.meta.blend,
        opacity: l.meta.opacity,
      }))
  }, [layers, side, uiRefreshTick])

  /**
   * CRUD слоёв
   */
  const deleteLayer = (id: string) => {
    setLayers((prev) => {
      const layer = prev.find((x) => x.id === id)
      layer?.node.destroy()
      return prev.filter((x) => x.id !== id)
    })
    if (selectedId === id) select(null)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find((l) => l.id === id)
    if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(makeId())
    currentArtworkGroup().add(clone as any)
    const newLayer: AnyLayer = {
      id: (clone as any).id?.() ?? makeId(),
      node: clone,
      side: src.side,
      meta: { ...src.meta, name: src.meta.name + " copy" },
      type: src.type,
    }
    attachCommonNodeHandlers(clone, newLayer.id)
    setLayers((p) => [...p, newLayer])
    select(newLayer.id)
    clone.zIndex(nextTopZ())
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  const reorderLayers = (sourceId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter((l) => l.side === side)
      const others  = prev.filter((l) => l.side !== side)
      const orderTopToBottom = current
        .slice()
        .sort((a, b) => a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex((l) => l.id === sourceId)
      const dstIdx = orderTopToBottom.findIndex((l) => l.id === destId)
      if (srcIdx === -1 || dstIdx === -1) return prev
      const src = orderTopToBottom.splice(srcIdx, 1)[0]
      const insertAt = place === "before" ? dstIdx : dstIdx + 1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      artworkLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(sourceId)
    requestAnimationFrame(() => {
      attachTransformer()
      forceUiRefresh()
    })
  }

  const updateLayerMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const meta = { ...l.meta, ...patch }
        applyMetaToNode(l.node, meta)
        if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
        return { ...l, meta }
      })
    )
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  /**
   * Свойства выбранного узла (для Toolbar)
   */
  const selectedLayer = findLayerById(selectedId)
  const selectedLayerKind: LayerKind | null = selectedLayer?.type ?? null
  const selectedProps =
    selectedLayer && isTextNode(selectedLayer.node)
      ? {
          text: selectedLayer.node.text(),
          fontSize: Math.round(selectedLayer.node.fontSize()),
          fontFamily: selectedLayer.node.fontFamily(),
          fill: selectedLayer.node.fill() as string,
        }
      : selectedLayer && (selectedLayer.node as any).fill
      ? {
          fill: (selectedLayer.node as any).fill() ?? "#000000",
          stroke: (selectedLayer.node as any).stroke?.() ?? "#000000",
          strokeWidth: (selectedLayer.node as any).strokeWidth?.() ?? 0,
        }
      : {}

  const setSelectedFill = (hex: string) => {
    const n = selectedLayer?.node as any
    if (!n?.fill) return
    n.fill(hex)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }
  const setSelectedStroke = (hex: string) => {
    const n = selectedLayer?.node as any
    if (typeof n?.stroke !== "function") return
    n.stroke(hex)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }
  const setSelectedStrokeWidth = (w: number) => {
    const n = selectedLayer?.node as any
    if (typeof n?.strokeWidth !== "function") return
    n.strokeWidth(w)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }
  const setSelectedTextValue = (tstr: string) => {
    const n = selectedLayer?.node as Konva.Text
    if (!n) return
    n.text(tstr)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }
  const setSelectedFontSizeValue = (nsize: number) => {
    const n = selectedLayer?.node as Konva.Text
    if (!n) return
    n.fontSize(clamp(Math.round(nsize), TEXT_MIN_FONT_SIZE, TEXT_MAX_FONT_SIZE))
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }
  const setSelectedFontFamilyValue = (name: string) => {
    const n = selectedLayer?.node as Konva.Text
    if (!n) return
    n.fontFamily(name)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  const setSelectedGenericColor = (hex: string) => {
    if (!selectedLayer) return
    const n = selectedLayer.node as any
    if (selectedLayer.type === "text") {
      ;(n as Konva.Text).fill(hex)
    } else if (selectedLayer.type === "shape") {
      if (n instanceof Konva.Group) {
        n.find((child: any) =>
          child instanceof Konva.Rect ||
          child instanceof Konva.Circle ||
          child instanceof Konva.RegularPolygon ||
          child instanceof Konva.Line
        ).forEach((child: any) => {
          if (child instanceof Konva.Line) child.stroke(hex)
          if (typeof child.fill === "function") child.fill(hex)
        })
      } else if (n instanceof Konva.Line) {
        n.stroke(hex)
      } else if (typeof n.fill === "function") {
        n.fill(hex)
      }
    }
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  /**
   * Очистка стороны
   */
  const clearArtworkSide = () => {
    const g = currentArtworkGroup()
    if (!g) return
    g.removeChildren()
    setLayers((prev) => prev.filter((l) => l.side !== side))
    currentStrokeIdRef.current[side] = null
    currentEraseIdRef.current[side]  = null
    select(null)
    artworkLayerRef.current?.batchDraw()
    forceUiRefresh()
  }

  /**
   * Экспорт PNG
   */
  const downloadBoth = async (s: Side) => {
    const stage = stageRef.current
    if (!stage) return
    const pixelRatio = Math.max(2, Math.round(1 / stageScale))
    uiLayerRef.current?.visible(false)

    const showFront = s === "front"
    frontMockupRef.current?.visible(showFront)
    backMockupRef.current?.visible(!showFront ? true : false)
    frontArtworkGroupRef.current?.visible(showFront)
    backArtworkGroupRef.current?.visible(!showFront)

    const withMock = stage.toDataURL({ pixelRatio, mimeType: "image/png" })
    backgroundLayerRef.current?.visible(false)
    stage.draw()
    const artOnly = stage.toDataURL({ pixelRatio, mimeType: "image/png" })
    backgroundLayerRef.current?.visible(true)

    frontMockupRef.current?.visible(side === "front")
    backMockupRef.current?.visible(side === "back")
    frontArtworkGroupRef.current?.visible(side === "front")
    backArtworkGroupRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    stage.draw()

    const a1 = document.createElement("a")
    a1.href = withMock
    a1.download = `darkroom-${s}_mockup.png`
    a1.click()
    await new Promise((r) => setTimeout(r, 250))
    const a2 = document.createElement("a")
    a2.href = artOnly
    a2.download = `darkroom-${s}_art.png`
    a2.click()
  }

  /**
   * Рендер
   */
  return (
    <div
      className="fixed inset-0 bg-white"
      style={{
        paddingTop: padTop,
        paddingBottom: padBottom,
        overscrollBehavior: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={(id) => {
            const l = layers.find((x) => x.id === id)!
            updateLayerMeta(id, { visible: !l.meta.visible })
          }}
          onToggleLock={(id) => {
            const l = layers.find((x) => x.id === id)!
            updateLayerMeta(id, { locked: !l.meta.locked })
            attachTransformer()
          }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorderLayers}
          onChangeBlend={(id, b) => updateLayerMeta(id, { blend: b as Blend })}
          onChangeOpacity={(id, o) => updateLayerMeta(id, { opacity: o })}
        />
      )}

      <div className="w-full h-full flex items-start justify-center">
        <div
          style={{
            position: "relative",
            touchAction: "none",
            width: viewWidth,
            height: viewHeight,
          }}
        >
          <Stage
            width={viewWidth}
            height={viewHeight}
            scale={{ x: stageScale, y: stageScale }}
            ref={stageRef}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          >
            <Layer ref={backgroundLayerRef} listening={true}>
              {frontMockupImage && (
                <KonvaImageReact
                  ref={frontMockupRef}
                  image={frontMockupImage}
                  visible={side === "front"}
                  width={BASE_CANVAS_WIDTH}
                  height={BASE_CANVAS_HEIGHT}
                  listening={true}
                />
              )}
              {backMockupImage && (
                <KonvaImageReact
                  ref={backMockupRef}
                  image={backMockupImage}
                  visible={side === "back"}
                  width={BASE_CANVAS_WIDTH}
                  height={BASE_CANVAS_HEIGHT}
                  listening={true}
                />
              )}
            </Layer>

            <Layer ref={artworkLayerRef} listening={true}>
              <KonvaGroupReact ref={frontArtworkGroupRef} visible={side === "front"} />
              <KonvaGroupReact ref={backArtworkGroupRef}  visible={side === "back"} />
            </Layer>

            <Layer ref={uiLayerRef}>
              <Transformer
                ref={transformerRef}
                rotateEnabled
                anchorSize={12}
                borderStroke="black"
                anchorStroke="black"
                anchorFill="white"
              />
            </Layer>
          </Stage>
        </div>
      </div>

      <Toolbar
        side={side}
        setSide={(s: Side) => set({ side: s })}
        tool={tool}
        setTool={(t: Tool) => set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v: string) => set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n: number) => set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={() => {}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        onDownloadFront={() => downloadBoth("front")}
        onDownloadBack={() => downloadBoth("back")}
        onClear={clearArtworkSide}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedLayerKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeWidth}
        setSelectedText={setSelectedTextValue}
        setSelectedFontSize={setSelectedFontSizeValue}
        setSelectedFontFamily={setSelectedFontFamilyValue}
        setSelectedColor={setSelectedGenericColor}
        mobileTopOffset={padTop}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id) => {
            const l = layers.find((x) => x.id === id)!
            updateLayerMeta(id, { visible: !l.meta.visible })
          },
          onToggleLock: (id) => {
            const l = layers.find((x) => x.id === id)!
            updateLayerMeta(id, { locked: !l.meta.locked })
          },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, _b) => {},
          onChangeOpacity: (id, _o) => {},
          onMoveUp: (id) => {
            const order = layerItems.map((x) => x.id)
            const i = order.indexOf(id)
            if (i > 0) reorderLayers(id, order[i - 1], "before")
          },
          onMoveDown: (id) => {
            const order = layerItems.map((x) => x.id)
            const i = order.indexOf(id)
            if (i > -1 && i < order.length - 1) reorderLayers(id, order[i + 1], "after")
          },
        }}
      />
    </div>
  )
}
