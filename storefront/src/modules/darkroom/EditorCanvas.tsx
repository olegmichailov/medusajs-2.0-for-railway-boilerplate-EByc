"use client"

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"
import { isMobile } from "react-device-detect"

const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC = "/mockups/MOCAP_BACK.png"
const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = {
  blend: Blend
  opacity: number
  name: string
  visible: boolean
  locked: boolean
}
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image" | "shape" | "text" | "strokes"
type AnyLayer = {
  id: string
  side: Side
  node: AnyNode
  meta: BaseMeta
  type: LayerType
}

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

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock] = useImage(BACK_SRC, "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const bgLayerRef = useRef<Konva.Layer>(null)
  const drawLayerRef = useRef<Konva.Layer>(null)
  const uiLayerRef = useRef<Konva.Layer>(null)

  const trRef = useRef<Konva.Transformer>(null)
  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTfRef = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [seqs, setSeqs] = useState({
    image: 1,
    shape: 1,
    text: 1,
    strokes: 1,
  })

  // ---------- Вьюпорт и базовый фит ----------
  const { viewW, viewH, baseScale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const bottomGap = isMobile ? 110 : 200 // поднять макет на мобилке
    const sideGap = isMobile ? 16 : 440
    const maxW = vw - sideGap
    const maxH = vh - bottomGap
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: vw, viewH: vh - (isMobile ? 0 : 0), baseScale: s }
  }, [showLayers])

  // ---------- Жёсткая блокировка скролла страницы на время редактора ----------
  useLayoutEffect(() => {
    const scrollY = window.scrollY || window.pageYOffset
    const prevPos = document.body.style.position
    const prevTop = document.body.style.top
    const prevWidth = document.body.style.width
    const prevOverflow = document.body.style.overflow
    const prevBehavior = document.documentElement.style.overscrollBehavior

    document.documentElement.style.overscrollBehavior = "none"
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = "100%"
    document.body.style.overflow = "hidden"

    return () => {
      document.documentElement.style.overscrollBehavior = prevBehavior
      document.body.style.position = prevPos
      document.body.style.top = prevTop
      document.body.style.width = prevWidth
      document.body.style.overflow = prevOverflow
      window.scrollTo(0, scrollY)
    }
  }, [])

  // ---------- Трансформ контента (пан/зум/поворот) — только на слоях, Stage не трогаем ----------
  // применяем к слоям общий трансформ: position + rotation + totalScale = baseScale * contentScale
  const [content, setContent] = useState({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0, // градусы
  })

  const applyContentTransform = () => {
    const totalScale = baseScale * content.scale
    const layersToMove = [
      bgLayerRef.current,
      drawLayerRef.current,
      uiLayerRef.current,
    ].filter(Boolean) as Konva.Layer[]

    layersToMove.forEach((ly) => {
      ly.position({ x: content.x, y: content.y })
      ly.rotation(content.rotation)
      ly.scale({ x: totalScale, y: totalScale })
      ly.batchDraw()
    })
  }

  useEffect(() => {
    applyContentTransform()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, baseScale, viewW, viewH])

  // стабилизация при change orientation/resize — сохраним якорь в центре экрана
  useEffect(() => {
    const onResize = () => {
      applyContentTransform()
    }
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Вспомогалки ----------
  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over",
    opacity: 1,
    name,
    visible: true,
    locked: false,
  })
  const find = (id: string | null) =>
    id ? layers.find((l) => l.id === id) || null : null
  const node = (id: string | null) => find(id)?.node || null

  // показываем только слои выбранной стороны
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
    attachTransformer()
  }, [side, layers])

  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  // ---------- Transformer: отключаем для strokes ----------
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const isStroke = lay?.type === "strokes"
    const disabled =
      isDrawing || isCropping || lay?.meta.locked || !n || !trRef.current || isStroke

    if (disabled) {
      trRef.current?.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }
    ;(n as any).draggable(true)
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => {
    attachTransformer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side, isDrawing, isCropping])
  useEffect(() => {
    attachTransformer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  // ---------- Геометрия: экран -> локальные координаты контента ----------
  const screenToLocal = (pt: { x: number; y: number }) => {
    // P_screen = T + R(theta) * (S_total * P_local)
    // P_local = (1/S_total) * R(-theta) * (P_screen - T)
    const totalScale = baseScale * content.scale
    const theta = (content.rotation * Math.PI) / 180
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const qx = pt.x - content.x
    const qy = pt.y - content.y
    const lx = (cos * qx + sin * qy) / totalScale
    const ly = (-sin * qx + cos * qy) / totalScale
    return { x: lx, y: ly }
  }

  const pointerLocal = (): { x: number; y: number } => {
    const st = stageRef.current
    if (!st) return { x: 0, y: 0 }
    const p = st.getPointerPosition()
    if (!p) return { x: 0, y: 0 }
    return screenToLocal(p)
  }

  // ---------- strokes group per side ----------
  const ensureStrokesGroup = () => {
    const exist = [...layers]
      .reverse()
      .find((l) => l.side === side && l.type === "strokes")
    if (exist) return exist
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any).id(uid())
    const id = (g as any)._id
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    drawLayerRef.current?.add(g)
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers((p) => [...p, newLay])
    setSeqs((s) => ({ ...s, strokes: s.strokes + 1 }))
    return newLay
  }

  // ---------- загрузка картинки: авто-Move ----------
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min(
          (BASE_W * 0.9) / img.width,
          (BASE_H * 0.9) / img.height,
          1
        )
        const w = img.width * ratio,
          h = img.height * ratio
        const kimg = new Konva.Image({
          image: img,
          x: BASE_W / 2 - w / 2,
          y: BASE_H / 2 - h / 2,
          width: w,
          height: h,
        })
        ;(kimg as any).id(uid())
        const id = (kimg as any)._id
        const meta = baseMeta(`image ${seqs.image}`)
        drawLayerRef.current?.add(kimg)
        kimg.on("click tap", () => select(id))
        setLayers((p) => [
          ...p,
          { id, side, node: kimg, meta, type: "image" },
        ])
        setSeqs((s) => ({ ...s, image: s.image + 1 }))
        select(id)
        drawLayerRef.current?.batchDraw()

        // Сразу Move, чтобы править картинку (UX)
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ---------- текст ----------
  const inlineEdit = (t: Konva.Text) => {
    const st = stageRef.current
    if (!st) return
    const rect = st.container().getBoundingClientRect()
    const abs = t.getAbsolutePosition(st)
    const area = document.createElement("textarea")
    area.value = t.text()
    Object.assign(area.style, {
      position: "fixed",
      left: `${rect.left + abs.x * (baseScale * content.scale)}px`,
      top: `${rect.top + (abs.y - t.fontSize()) * (baseScale * content.scale)}px`,
      width: `${Math.max(200, t.width() * (baseScale * content.scale))}px`,
      fontSize: `${t.fontSize() * (baseScale * content.scale)}px`,
      fontFamily: t.fontFamily(),
      color: String(t.fill() || "#000"),
      lineHeight: "1.2",
      border: "1px solid #000",
      background: "white",
      padding: "2px",
      margin: "0",
      zIndex: "9999",
      resize: "none",
    } as CSSStyleDeclaration)
    document.body.appendChild(area)
    area.focus()
    const commit = () => {
      t.text(area.value)
      area.remove()
      drawLayerRef.current?.batchDraw()
    }
    area.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
        e.preventDefault()
        commit()
      }
    })
    area.addEventListener("blur", commit)
  }

  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKUL",
      x: BASE_W / 2 - 220,
      y: BASE_H / 2 - 48,
      fontSize: 72,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fontStyle: "bold",
      fill: brushColor,
      width: 440,
      align: "center",
    })
    ;(t as any).id(uid())
    const id = (t as any)._id
    const meta = baseMeta(`text ${seqs.text}`)
    drawLayerRef.current?.add(t)
    t.on("click tap", () => select(id))
    t.on("dblclick dbltap", () => inlineEdit(t))
    setLayers((p) => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs((s) => ({ ...s, text: s.text + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ---------- shapes: только из UI-кнопки ----------
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")
      n = new Konva.Circle({
        x: BASE_W / 2,
        y: BASE_H / 2,
        radius: 160,
        fill: brushColor,
      })
    else if (kind === "square")
      n = new Konva.Rect({
        x: BASE_W / 2 - 160,
        y: BASE_H / 2 - 160,
        width: 320,
        height: 320,
        fill: brushColor,
      })
    else if (kind === "triangle")
      n = new Konva.RegularPolygon({
        x: BASE_W / 2,
        y: BASE_H / 2,
        sides: 3,
        radius: 200,
        fill: brushColor,
      })
    else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W / 2 - 160, y: BASE_H / 2 - 160 })
      g.add(new Konva.Rect({ width: 320, height: 60, y: 130, fill: brushColor }))
      g.add(new Konva.Rect({ width: 60, height: 320, x: 130, fill: brushColor }))
      n = g
    } else
      n = new Konva.Line({
        points: [BASE_W / 2 - 200, BASE_H / 2, BASE_W / 2 + 200, BASE_H / 2],
        stroke: brushColor,
        strokeWidth: 16,
        lineCap: "round",
      })
    ;(n as any).id(uid())
    const id = (n as any)._id
    const meta = baseMeta(`shape ${seqs.shape}`)
    drawLayerRef.current?.add(n as any)
    ;(n as any).on("click tap", () => select(id))
    setLayers((p) => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs((s) => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // ---------- рисование (учитывает текущий трансформ) ----------
  const startStroke = (loc?: { x: number; y: number }) => {
    const gLay = ensureStrokesGroup()
    const g = gLay.node as Konva.Group
    const p = loc ?? pointerLocal()
    const line = new Konva.Line({
      points: [p.x, p.y],
      stroke: tool === "erase" ? "#000000" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation:
        tool === "erase" ? "destination-out" : "source-over",
    })
    g.add(line)
    setIsDrawing(true)
  }
  const appendStroke = (loc?: { x: number; y: number }) => {
    const gLay = [...layers]
      .reverse()
      .find((l) => l.side === side && l.type === "strokes")
    const g = gLay?.node as Konva.Group | undefined
    if (!g) return
    const last = g.getChildren().at(-1) as Konva.Line | undefined
    if (!last) return
    const p = loc ?? pointerLocal()
    last.points(last.points().concat([p.x, p.y]))
    drawLayerRef.current?.batchDraw()
  }
  const finishStroke = () => setIsDrawing(false)

  // ---------- crop (как было) ----------
  const startCrop = () => {
    const n = node(selectedId)
    if (!n || !(n instanceof Konva.Image)) return
    setIsCropping(true)
    const st = stageRef.current
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      visible: true,
    })
    cropTfRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }
  const applyCrop = () => {
    const n = node(selectedId)
    const r = cropRectRef.current
    if (!n || !(n instanceof Konva.Image) || !r) {
      cancelCrop()
      return
    }
    // переносим экранные координаты в локальные
    const p1 = screenToLocal({ x: r.x(), y: r.y() })
    const p2 = screenToLocal({ x: r.x() + r.width(), y: r.y() + r.height() })
    const rx = p1.x - n.x()
    const ry = p1.y - n.y()
    const rw = p2.x - p1.x
    const rh = p2.y - p1.y
    n.crop({ x: rx, y: ry, width: rw, height: rh })
    n.width(rw)
    n.height(rh)
    r.visible(false)
    cropTfRef.current?.nodes([])
    setIsCropping(false)
    drawLayerRef.current?.batchDraw()
  }
  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTfRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // ---------- экспорт (как было) ----------
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current
    if (!st) return
    const pr = Math.max(2, Math.round(1 / (baseScale * content.scale)))
    const hidden: AnyNode[] = []
    layers.forEach((l) => {
      if (l.side !== s && l.node.visible()) {
        l.node.visible(false)
        hidden.push(l.node)
      }
    })
    uiLayerRef.current?.visible(false)

    // 1) with mockup
    bgLayerRef.current?.visible(true)
    st.draw()
    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) art only
    bgLayerRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(true)
    hidden.forEach((n) => n.visible(true))
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a")
    a1.href = withMock
    a1.download = `darkroom-${s}_mockup.png`
    a1.click()
    await new Promise((r) => setTimeout(r, 400))
    const a2 = document.createElement("a")
    a2.href = artOnly
    a2.download = `darkroom-${s}_art.png`
    a2.click()
  }

  // ---------- Указатель: один палец — рисуем; два — жест ----------
  const getClientMid = (t1: Touch, t2: Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  })
  const getDist = (t1: Touch, t2: Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  const getAngle = (t1: Touch, t2: Touch) =>
    Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX)

  const gestureRef = useRef<{
    active: boolean
    pLocal: { x: number; y: number }
    startScale: number
    startRot: number
    startDist: number
    startAng: number
    startMid: { x: number; y: number } // в координатах Stage (CSS px)
  } | null>(null)

  // преобразование client->stage px
  const clientToStage = (c: { x: number; y: number }) => {
    const st = stageRef.current
    if (!st) return { x: c.x, y: c.y }
    const rect = st.container().getBoundingClientRect()
    return { x: c.x - rect.left, y: c.y - rect.top }
  }

  const onDown = (e: any) => {
    if (isCropping) return
    if (tool === "brush" || tool === "erase") {
      startStroke(pointerLocal())
    }
    // shapes/text создаём из UI — не из пустого клика (по ТЗ)
  }
  const onMove = () => {
    if (isDrawing) appendStroke(pointerLocal())
  }
  const onUp = () => {
    if (isDrawing) finishStroke()
  }

  const onTouchStart = (e: any) => {
    const evt = e.evt as TouchEvent
    evt.preventDefault()

    if (evt.touches.length === 2) {
      const [t1, t2] = [evt.touches[0], evt.touches[1]]
      const midClient = getClientMid(t1, t2)
      const midStage = clientToStage(midClient)
      const dist = getDist(t1, t2)
      const ang = getAngle(t1, t2)
      const pLocal = screenToLocal(midStage)

      gestureRef.current = {
        active: true,
        pLocal,
        startScale: content.scale,
        startRot: content.rotation,
        startDist: dist,
        startAng: ang,
        startMid: midStage,
      }
      if (isDrawing) setIsDrawing(false)
      return
    }

    // один палец
    onDown(e)
  }

  const onTouchMove = (e: any) => {
    const evt = e.evt as TouchEvent
    if (!evt.touches.length) return

    if (evt.touches.length === 2 && gestureRef.current?.active) {
      evt.preventDefault()
      const [t1, t2] = [evt.touches[0], evt.touches[1]]
      const midClient = getClientMid(t1, t2)
      const midStage = clientToStage(midClient)
      const dist = getDist(t1, t2)
      const ang = getAngle(t1, t2)

      const g = gestureRef.current
      // пинч
      let newScale = g.startScale * (dist / g.startDist)
      newScale = Math.min(5, Math.max(0.25, newScale))
      // поворот
      const deltaDeg = ((ang - g.startAng) * 180) / Math.PI
      const newRot = g.startRot + deltaDeg

      // держим якорь (pLocal) в том же экранном месте (midStage)
      const totalS = baseScale * newScale
      const theta = (newRot * Math.PI) / 180
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const xrs = cos * totalS * g.pLocal.x - sin * totalS * g.pLocal.y
      const yrs = sin * totalS * g.pLocal.x + cos * totalS * g.pLocal.y
      const newX = midStage.x - xrs
      const newY = midStage.y - yrs

      setContent({ x: newX, y: newY, scale: newScale, rotation: newRot })
      return
    }

    // один палец — рисуем
    onMove()
  }

  const onTouchEnd = (e: any) => {
    if (gestureRef.current?.active) gestureRef.current = null
    onUp()
  }

  // ---------- панель слоёв (как было) ----------
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter((l) => l.side === side)
      .sort((a, b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map((l) => ({
        id: l.id,
        name: l.meta.name,
        type: l.type,
        visible: l.meta.visible,
        locked: l.meta.locked,
        blend: l.meta.blend,
        opacity: l.meta.opacity,
      }))
  }, [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers((p) =>
      p.map((l) => {
        if (l.id !== id) return l
        const meta = { ...l.meta, ...patch }
        applyMeta(l.node, meta)
        if (patch.visible !== undefined)
          l.node.visible(meta.visible && l.side === side)
        return { ...l, meta }
      })
    )
    drawLayerRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => select(id)
  const onToggleVisible = (id: string) => {
    const l = layers.find((x) => x.id === id)!
    updateMeta(id, { visible: !l.meta.visible })
  }
  const onToggleLock = (id: string) => {
    const l = layers.find((x) => x.id === id)!
    ;(l.node as any).locked = !l.meta.locked
    updateMeta(id, { locked: !l.meta.locked })
    attachTransformer()
  }
  const onDelete = (id: string) => {
    setLayers((p) => {
      const l = p.find((x) => x.id === id)
      l?.node.destroy()
      return p.filter((x) => x.id !== id)
    })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }
  const onDuplicate = (id: string) => {
    const src = layers.find((l) => l.id === id)!
    const clone = src.node.clone()
    clone.x(src.node.x() + 20)
    clone.y(src.node.y() + 20)
    ;(clone as any).id(uid())
    drawLayerRef.current?.add(clone)
    const newLay: AnyLayer = {
      id: (clone as any)._id,
      node: clone,
      side: src.side,
      meta: { ...src.meta, name: src.meta.name + " copy" },
      type: src.type,
    }
    setLayers((p) => [...p, newLay])
    select(newLay.id)
    drawLayerRef.current?.batchDraw()
  }

  // Reorder (как было)
  const onReorder = (
    srcId: string,
    destId: string,
    place: "before" | "after"
  ) => {
    setLayers((prev) => {
      const current = prev.filter((l) => l.side === side)
      const others = prev.filter((l) => l.side !== side)
      const orderTopToBottom = current
        .sort((a, b) => a.node.zIndex() - b.node.zIndex())
        .reverse()

      const srcIdx = orderTopToBottom.findIndex((l) => l.id === srcId)
      const dstIdx = orderTopToBottom.findIndex((l) => l.id === destId)
      if (srcIdx === -1 || dstIdx === -1) return prev

      const src = orderTopToBottom.splice(srcIdx, 1)[0]
      const insertAt = place === "before" ? dstIdx : dstIdx + 1
      orderTopToBottom.splice(
        insertAt > orderTopToBottom.length ? orderTopToBottom.length : insertAt,
        0,
        src
      )

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => {
        ;(l.node as any).zIndex(i)
      })
      drawLayerRef.current?.batchDraw()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const onChangeBlend = (id: string, blend: string) =>
    updateMeta(id, { blend: blend as Blend })
  const onChangeOpacity = (id: string, opacity: number) =>
    updateMeta(id, { opacity })

  // selected props для Toolbar
  const sel = find(selectedId)
  const selectedKind: "image" | "shape" | "text" | "strokes" | null =
    sel?.type ?? null
  const selectedProps =
    sel?.type === "text"
      ? {
          text: (sel.node as Konva.Text).text(),
          fontSize: (sel.node as Konva.Text).fontSize(),
          fontFamily: (sel.node as Konva.Text).fontFamily(),
          fill: (sel.node as any).fill?.() ?? "#000000",
        }
      : sel?.type === "shape"
      ? {
          fill: (sel.node as any).fill?.() ?? "#000000",
          stroke: (sel.node as any).stroke?.() ?? "#000000",
          strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
        }
      : {}

  const setSelectedFill = (hex: string) => {
    if (!sel) return
    if ((sel.node as any).fill) (sel.node as any).fill(hex)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedStroke = (hex: string) => {
    if (!sel) return
    if ((sel.node as any).stroke) (sel.node as any).stroke(hex)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedStrokeW = (w: number) => {
    if (!sel) return
    if ((sel.node as any).strokeWidth) (sel.node as any).strokeWidth(w)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedText = (t: string) => {
    const n = sel?.node as Konva.Text
    if (!n) return
    n.text(t)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedFontSize = (n: number) => {
    const t = sel?.node as Konva.Text
    if (!t) return
    t.fontSize(n)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedFontFamily = (name: string) => {
    const t = sel?.node as Konva.Text
    if (!t) return
    t.fontFamily(name)
    drawLayerRef.current?.batchDraw()
  }
  const setSelectedColor = (hex: string) => {
    if (!sel) return
    if (sel.type === "text") {
      ;(sel.node as Konva.Text).fill(hex)
    } else if (sel.type === "shape") {
      if ((sel.node as any).fill) (sel.node as any).fill(hex)
      else if ((sel.node as any).stroke) (sel.node as any).stroke(hex)
    }
    drawLayerRef.current?.batchDraw()
  }

  return (
    <div
      className="relative w-screen h-[calc(100vh-0px)] overflow-hidden"
      style={{ touchAction: "none", overscrollBehavior: "none" }}
    >
      <Toolbar
        side={side}
        setSide={(s: Side) => set({ side: s })}
        tool={tool}
        setTool={(t) => set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v) => set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n) => set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={(k: ShapeKind) => set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={() => downloadBoth("front")}
        onDownloadBack={() => downloadBoth("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind as any}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}
        // мобильный список слоёв уже есть в твоём Toolbar (tabs)
        mobileLayers={{
          items: layerItems,
          onSelect: onLayerSelect,
          onToggleVisible,
          onToggleLock,
          onDelete,
          onDuplicate,
          onChangeBlend,
          onChangeOpacity,
        }}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={onToggleVisible}
          onToggleLock={onToggleLock}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onReorder={onReorder}
          onChangeBlend={onChangeBlend}
          onChangeOpacity={onChangeOpacity}
        />
      )}

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ touchAction: "none", overscrollBehavior: "none" }}
      >
        <Stage
          ref={stageRef}
          width={viewW}
          height={viewH}
          // Stage не масштабируем — только слои
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          listening
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side === "front" && frontMock && (
              <KImage image={frontMock} width={BASE_W} height={BASE_H} />
            )}
            {side === "back" && backMock && (
              <KImage image={backMock} width={BASE_W} height={BASE_H} />
            )}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
            {/* strokes без хэндлов — мы их скрываем в attachTransformer */}
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
            <Rect
              ref={cropRectRef}
              visible={false}
              stroke="black"
              dash={[6, 4]}
              strokeWidth={2}
              draggable
            />
            <Transformer
              ref={cropTfRef}
              rotateEnabled={false}
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
