"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

// ==== БАЗА МАКЕТА ====
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

// ТЕКСТ: клампы
const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = Math.floor(BASE_W * 0.95)

// анти-джиттер
const EPS = 0.25

// id-helper
const uid = () => "n_" + Math.random().toString(36).slice(2)

// ==== ТИПЫ ====
type BaseMeta = { blend: Blend; opacity: number; name: string; visible: boolean; locked: boolean }
type LayerType = "image" | "shape" | "text" | "strokes" | "erase"
type AnyNode =
  | Konva.Image
  | Konva.Line
  | Konva.Text
  | Konva.Group
  | Konva.Rect
  | Konva.Circle
  | Konva.RegularPolygon
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

const isStrokeGroup = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isStrokes === true
const isEraseGroup  = (n: AnyNode) => n instanceof Konva.Group && (n as any)._isErase   === true
const isTextNode    = (n: AnyNode): n is Konva.Text  => n instanceof Konva.Text
const isImgOrRect   = (n: AnyNode) => n instanceof Konva.Image || n instanceof Konva.Rect

export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // ——— ЭФФЕКТЫ (dot-screen / halftone)
  const [fxOn, setFxOn] = useState(false)
  const fxOnRef = useRef(false)
  useEffect(() => { fxOnRef.current = fxOn }, [fxOn])

  // мобильная кисть по умолчанию
  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])

  // точнее хиты на драг
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  // мокапы
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  // refs
  const stageRef        = useRef<Konva.Stage>(null)
  const bgLayerRef      = useRef<Konva.Layer>(null)    // ТОЛЬКО мокап
  const artLayerRef     = useRef<Konva.Layer>(null)    // ТОЛЬКО пользовательский контент + erase
  const uiLayerRef      = useRef<Konva.Layer>(null)    // трансформер
  const trRef           = useRef<Konva.Transformer>(null)
  const frontBgRef      = useRef<Konva.Image>(null)
  const backBgRef       = useRef<Konva.Image>(null)
  const frontArtRef     = useRef<Konva.Group>(null)    // контент (front)
  const backArtRef      = useRef<Konva.Group>(null)    // контент (back)

  // экранный `<canvas>` под шейдер
  const fxRef           = useRef<HTMLCanvasElement | null>(null)
  const glRef           = useRef<WebGLRenderingContext | null>(null)
  const progRef         = useRef<WebGLProgram | null>(null)
  const texRef          = useRef<WebGLTexture | null>(null)
  const quadRef         = useRef<WebGLBuffer | null>(null)
  const locRef          = useRef<{[k:string]: WebGLUniformLocation | null}>({})

  // state
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })

  // активные сессии кисти/стирания
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })

  // идёт ли трансформирование (для блокировки перетаскивания)
  const isTransformingRef = useRef(false)

  // ===== Вёрстка/масштаб =====
  const [headerH, setHeaderH] = useState(64)
  useLayoutEffect(() => {
    const el = (document.querySelector("header") || document.getElementById("site-header")) as HTMLElement | null
    setHeaderH(Math.ceil(el?.getBoundingClientRect().height ?? 64))
  }, [])

  const { viewW, viewH, scale, padTop, padBottom } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const padTop = headerH + 8
    const padBottom = isMobile ? 120 : 72
    const maxW = vw - 24
    const maxH = vh - (padTop + padBottom)
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s, padTop, padBottom }
  }, [showLayers, headerH])

  // фикс скролла
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  // ===== Helpers =====
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }

  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)

  // ———— единая перерисовка арта + (при необходимости) эффекта
  const drawArt = () => {
    artLayerRef.current?.batchDraw()
    if (fxOnRef.current) requestAnimationFrame(renderScreenPrint)
  }
  const drawUI = () => { uiLayerRef.current?.batchDraw() }

  // показываем только активную сторону
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    drawArt()
    attachTransformer()
  }, [side, layers])

  // ===== Transformer =====
  const detachTextFix = useRef<(() => void) | null>(null)
  const detachGuard   = useRef<(() => void) | null>(null)

  type TStart = {
    width: number
    left: number
    right: number
    fontSize: number
    anchor: "middle-left" | "middle-right" | "corner" | null
  }
  const textStart = useRef<TStart | null>(null)

  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = !n || lay?.meta.locked || isStrokeGroup(n) || isEraseGroup(n) || tool !== "move"

    if (detachTextFix.current) { detachTextFix.current(); detachTextFix.current = null }
    if (detachGuard.current)   { detachGuard.current();   detachGuard.current   = null }

    if (disabled) {
      trRef.current?.nodes([])
      drawUI()
      return
    }

    const tr = trRef.current!
    tr.nodes([n])
    tr.rotateEnabled(true)

    // guard на время трансформации
    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      // ---- ТЕКСТ: бока = ширина, углы = кегль ----
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right"
      ])

      const t = n as Konva.Text

      const onStartText = () => {
        const a = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        textStart.current = {
          width:    Math.max(1, t.width() || 1),
          left:     t.x(),
          right:    t.x() + (t.width() || 0),
          fontSize: t.fontSize(),
          anchor:   a === "middle-left" || a === "middle-right" ? (a as TStart["anchor"]) : "corner"
        }
        t.scaleX(1); t.scaleY(1)
      }

      const onTransform = () => {
        const snap = textStart.current
        if (!snap) return
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined

        if (active === "middle-left" || active === "middle-right" || snap.anchor === "middle-left" || snap.anchor === "middle-right") {
          // ширина
          const sx = Math.max(0.01, t.scaleX())
          const targetW = Math.max(TEXT_MIN_W, Math.min(snap.width * sx, TEXT_MAX_W))
          const curW = t.width() || snap.width
          if (Math.abs(targetW - curW) > EPS) {
            if (active === "middle-left" || snap.anchor === "middle-left") {
              t.width(targetW)
              t.x(snap.right - targetW) // держим правый край
            } else {
              t.x(snap.left)            // держим левый край
              t.width(targetW)
            }
          }
          t.scaleX(1); t.scaleY(1)
        } else {
          // кегль
          const s = Math.max(t.scaleX(), t.scaleY())
          const targetFS = Math.max(TEXT_MIN_FS, Math.min(snap.fontSize * s, TEXT_MAX_FS))
          if (Math.abs(targetFS - t.fontSize()) > EPS) t.fontSize(targetFS)
          t.scaleX(1); t.scaleY(1)
        }

        drawArt()
        trRef.current?.forceUpdate()
        if (editingRef.current?.nodeId === t.id()) editingRef.current.sync()
      }

      const onEnd = () => {
        t.scaleX(1); t.scaleY(1)
        textStart.current = null
        drawArt()
        trRef.current?.forceUpdate()
        if (editingRef.current?.nodeId === t.id()) editingRef.current.sync()
      }

      n.on("transformstart.textfix", onStartText)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachTextFix.current = () => { n.off(".textfix") }
    } else {
      // ---- КАРТИНКИ/ФИГУРЫ: углы пропорц., боковые свободные ----
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right","top-center","bottom-center"
      ])

      const onTransform = () => {
        const active = (trRef.current as any)?.getActiveAnchor?.() as string | undefined
        let sx = (n as any).scaleX?.() ?? 1
        let sy = (n as any).scaleY?.() ?? 1

        const isCorner = active && (
          active === "top-left" || active === "top-right" ||
          active === "bottom-left" || active === "bottom-right"
        )
        if (isCorner) {
          const s = Math.max(Math.abs(sx), Math.abs(sy))
          sx = s; sy = s
        }

        if (isImgOrRect(n)) {
          const w = (n as any).width?.() ?? 0
          const h = (n as any).height?.() ?? 0
          ;(n as any).width(Math.max(1, w * sx))
          ;(n as any).height(Math.max(1, h * sy))
        } else if (n instanceof Konva.Circle) {
          const r = n.radius()
          n.radius(Math.max(1, r * Math.max(Math.abs(sx), Math.abs(sy))))
        } else if (n instanceof Konva.RegularPolygon) {
          const r = n.radius()
          n.radius(Math.max(1, r * Math.max(Math.abs(sx), Math.abs(sy))))
        }

        ;(n as any).scaleX(1); (n as any).scaleY(1)
        drawArt()
        trRef.current?.forceUpdate()
      }

      const onEnd = () => onTransform()
      n.on("transform.fix", onTransform)
      n.on("transformend.fix", onEnd)
      detachTextFix.current = () => { n.off(".fix") }
    }

    drawUI()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // во время brush/erase — отключаем драг
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); drawUI() }

    // закрытие сессий при смене инструмента
    if (tool !== "brush") currentStrokeId.current[side] = null
    if (tool !== "erase") currentEraseId.current[side]  = null
  }, [tool, layers, side])

  // ===== хоткеи =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
        // Ctrl/Cmd+E разрешим даже в режиме ввода — это просто эффект
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
          e.preventDefault()
          setFxOn(v => !v)
          return
        }
        return
      }

      // toggle эффект
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault()
        setFxOn(v => !v)
        return
      }

      const n = node(selectedId)
      if (!n || tool !== "move") return

      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="d") { e.preventDefault(); duplicateLayer(selectedId!) ; return }
      if (e.key==="Backspace"||e.key==="Delete") { e.preventDefault(); deleteLayer(selectedId!); return }

      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) e.preventDefault()
      const step = e.shiftKey ? 20 : 3

      if (e.key === "ArrowLeft")  { (n as any).x((n as any).x()-step) }
      if (e.key === "ArrowRight") { (n as any).x((n as any).x()+step) }
      if (e.key === "ArrowUp")    { (n as any).y((n as any).y()-step) }
      if (e.key === "ArrowDown")  { (n as any).y((n as any).y()+step) }
      drawArt()
      trRef.current?.forceUpdate()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool])

  // ===== сессии кисти/стирания =====
  const nextTopZ = () => (currentArt().children?.length ?? 0)

  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isStrokes = true
    g.id(uid())
    const id = g.id()
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    currentArt().add(g)
    g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  const createEraseGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 })
    ;(g as any)._isErase = true
    g.id(uid())
    const id = g.id()
    const meta = baseMeta(`erase ${seqs.erase}`)
    currentArt().add(g)
    g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g as AnyNode, meta, type: "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    return newLay
  }

  // утилита: шрифт сайта
  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

  // ===== Добавление: Image =====
  const attachCommonHandlers = (k: AnyNode, id: string) => {
    ;(k as any).on("click tap", () => select(id))
    if (k instanceof Konva.Text) k.on("dblclick dbltap", () => startTextOverlayEdit(k))
  }

  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const ratio = Math.min((BASE_W*0.9)/img.width, (BASE_H*0.9)/img.height, 1)
        const w = img.width * ratio, h = img.height * ratio
        const kimg = new Konva.Image({ image: img, x: BASE_W/2-w/2, y: BASE_H/2-h/2, width: w, height: h })
        ;(kimg as any).setAttr("src", r.result as string)
        kimg.id(uid())
        const id = kimg.id()
        const meta = baseMeta(`image ${seqs.image}`)
        currentArt().add(kimg)
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        drawArt()
        set({ tool: "move" })
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ===== Добавление: Text =====
  const onAddText = () => {
    const t = new Konva.Text({
      text: "GMORKL",
      x: BASE_W/2-300, y: BASE_H/2-60,
      fontSize: 96,
      fontFamily: siteFont(),
      fontStyle: "bold",
      fill: brushColor, width: 600, align: "center",
      draggable: false,
    })
    t.id(uid())
    const id = t.id()
    const meta = baseMeta(`text ${seqs.text}`)
    currentArt().add(t)
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    drawArt()
    set({ tool: "move" })
  }

  // ===== Добавление: Shape =====
  const onAddShape = (kind: ShapeKind) => {
    let n: AnyNode
    if (kind === "circle")        n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 160, fill: brushColor })
    else if (kind === "square")   n = new Konva.Rect({ x: BASE_W/2-160, y: BASE_H/2-160, width: 320, height: 320, fill: brushColor })
    else if (kind === "triangle") n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 200, fill: brushColor })
    else if (kind === "cross")    { const g=new Konva.Group({x:BASE_W/2-160,y:BASE_H/2-160}); g.add(new Konva.Rect({width:320,height:60,y:130,fill:brushColor})); g.add(new Konva.Rect({width:60,height:320,x:130,fill:brushColor})); n=g }
    else                          n = new Konva.Line({ points: [BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    ;(n as any).id(uid())
    const id = (n as any).id?.() ?? uid()
    const meta = baseMeta(`shape ${seqs.shape}`)
    currentArt().add(n as any)
    attachCommonHandlers(n, id)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    setSeqs(s => ({ ...s, shape: s.shape + 1 }))
    select(id)
    drawArt()
    set({ tool: "move" })
  }

  // ===== Рисование: Brush / Erase =====
  const startStroke = (x: number, y: number) => {
    if (tool === "brush") {
      let gid = currentStrokeId.current[side]
      if (!gid) gid = createStrokeGroup().id
      const g = find(gid)!.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: brushColor,
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "source-over",
      })
      g.add(line)
      setIsDrawing(true)
    } else if (tool === "erase") {
      // глобальный ерейс — поверх арта
      let gid = currentEraseId.current[side]
      if (!gid) gid = createEraseGroup().id
      const g = find(gid)!.node as Konva.Group
      const line = new Konva.Line({
        points: [x, y],
        stroke: "#000",
        strokeWidth: brushSize,
        lineCap: "round",
        lineJoin: "round",
        globalCompositeOperation: "destination-out",
      })
      g.add(line)
      setIsDrawing(true)
    }
  }

  const appendStroke = (x: number, y: number) => {
    if (!isDrawing) return
    if (tool === "brush") {
      const gid = currentStrokeId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1)
      const line = last instanceof Konva.Line ? last : (last as Konva.Group)?.getChildren().at(-1)
      if (!(line instanceof Konva.Line)) return
      line.points(line.points().concat([x, y]))
      drawArt()
    } else if (tool === "erase") {
      const gid = currentEraseId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      drawArt()
    }
  }

  const finishStroke = () => setIsDrawing(false)

  // ===== Overlay-редактор текста — полностью синхронизирован с bbox и трансформером =====
  const editingRef = useRef<{
    ta: HTMLTextAreaElement
    nodeId: string
    cleanup: (apply?: boolean) => void
    sync: () => void
  } | null>(null)

  // матрица узла -> CSS matrix с учётом Stage.scale и позиции контейнера
  const computeCssMatrix = (t: Konva.Text) => {
    const st = stageRef.current!
    const m = t.getAbsoluteTransform().getMatrix() // [a,b,c,d,e,f]
    const a = m[0] * scale
    const b = m[1] * scale
    const c = m[2] * scale
    const d = m[3] * scale
    const e = m[4] * scale + st.container().getBoundingClientRect().left
    const f = m[5] * scale + st.container().getBoundingClientRect().top
    return { a, b, c, d, e, f }
  }

  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!

    // если уже что-то редактируем — завершим
    if (editingRef.current) {
      editingRef.current.cleanup()
      editingRef.current = null
    }

    const ta = document.createElement("textarea")
    ta.value = t.text()
    Object.assign(ta.style, {
      position: "fixed",
      padding: "0",
      margin: "0",
      border: "none",
      background: "transparent",
      color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle: t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${(t.letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      outline: "none",
      resize: "none",
      transformOrigin: "left top",
      zIndex: "9999",
      userSelect: "text",
      caretColor: String(t.fill() || "#000"),
      textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)
    document.body.appendChild(ta)

    // не скрываем ноду: делаем почти прозрачной, чтобы рамка/ручки оставались
    const prevOpacity = t.opacity()
    const prevListening = t.listening()
    t.opacity(0.001)
    t.listening(false)
    drawArt()
    trRef.current?.nodes([t])
    trRef.current?.forceUpdate()
    drawUI()

    const sync = () => {
      // размеры берём из клиентского прямоугольника ноды (без Stoke), ширину — исходную t.width()
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true }) as {width:number;height:number}
      ta.style.width  = `${Math.max(2, (t.width() || r.width) * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`

      const { a,b,c,d,e,f } = computeCssMatrix(t)
      // полная матрица: позиция+поворот+масштаб узла + смещение контейнера Stage
      ta.style.transform = `matrix(${a},${b},${c},${d},${e},${f})`
    }

    const onInput = () => {
      t.text(ta.value)
      drawArt()
      trRef.current?.forceUpdate()
      drawUI()
      requestAnimationFrame(sync)
    }

    // во время любых трансформаций/перетаскиваний узла — двигаем textarea
    const onT = () => requestAnimationFrame(sync)

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", onViewport, true)
      window.removeEventListener("resize", onViewport)
      t.off(".edit")
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.listening(prevListening)
      drawArt()
      // держим выделение и моментально «зажигаем» рамку — без лишнего клика
      select(t.id())
      requestAnimationFrame(() => {
        trRef.current?.nodes([t])
        trRef.current?.forceUpdate()
        drawUI()
      })
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      // Enter без Shift — коммит; Esc — отмена
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }
    const onViewport = () => sync()

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", onViewport)
    window.addEventListener("scroll", onViewport, true)
    t.on("dragmove.edit transform.edit transformend.edit", onT)

    // первичная фокусировка/выставление
    sync()
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    editingRef.current = { ta, nodeId: t.id(), cleanup, sync }
  }

  // ===== Жесты/указатель =====
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) {
      if (tr && p === tr) return true
      p = p.getParent?.()
    }
    return false
  }

  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()

    if (isTransformerChild(e.target)) return

    // рисование
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer()
      const p = toCanvas(sp)
      startStroke(p.x, p.y)
      return
    }

    // move — выбор
    const st = stageRef.current!
    const tgt = e.target as Konva.Node

    // клик по пустому или по мокапу — снять выделение
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null)
      trRef.current?.nodes([])
      drawUI()
      return
    }

    if (tgt && tgt !== st && tgt.getParent()) {
      const found = layers.find(l => l.node === tgt || l.node === (tgt.getParent() as any))
      if (found && found.side === side) select(found.id)
    }
  }

  const onMove = (e: any) => {
    if (isTransformingRef.current) return
    if (isTransformerChild(e.target)) return

    if (!isDrawing) return
    const p = toCanvas(getStagePointer())
    appendStroke(p.x, p.y)
  }

  const onUp = () => { if (isDrawing) finishStroke() }

  // ===== Данные для панелей/toolbar =====
  const layerItems: LayerItem[] = useMemo(() => {
    return layers
      .filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex())
      .reverse()
      .map(l => ({
        id: l.id, name: l.meta.name || l.type, type: l.type,
        visible: l.meta.visible, locked: l.meta.locked,
        blend: l.meta.blend, opacity: l.meta.opacity,
      }))
  }, [layers, side])

  const deleteLayer = (id: string) => {
    // если удаляем редактируемый текст — закрыть overlay
    if (editingRef.current?.nodeId === id) {
      editingRef.current.cleanup(false)
      editingRef.current = null
    }
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    drawArt()
  }

  const duplicateLayer = (id: string) => {
    const src = layers.find(l => l.id===id); if (!src) return
    const clone = src.node.clone() as AnyNode
    ;(clone as any).x((src.node as any).x?.() + 20)
    ;(clone as any).y((src.node as any).y?.() + 20)
    ;(clone as any).id(uid())
    currentArt().add(clone as any)
    const newLay: AnyLayer = { id: (clone as any).id?.() ?? uid(), node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name+" copy" }, type: src.type }
    attachCommonHandlers(clone, newLay.id)
    setLayers(p => [...p, newLay]); select(newLay.id)
    clone.zIndex(nextTopZ())
    drawArt()
  }

  const reorder = (srcId: string, destId: string, place: "before" | "after") => {
    setLayers((prev) => {
      const current = prev.filter(l => l.side === side)
      const others  = prev.filter(l => l.side !== side)
      const orderTopToBottom = current.slice().sort((a,b)=> a.node.zIndex() - b.node.zIndex()).reverse()

      const srcIdx = orderTopToBottom.findIndex(l=>l.id===srcId)
      const dstIdx = orderTopToBottom.findIndex(l=>l.id===destId)
      if (srcIdx === -1 || dstIdx === -1) return prev
      const src = orderTopToBottom.splice(srcIdx,1)[0]
      const insertAt = place==="before" ? dstIdx : dstIdx+1
      orderTopToBottom.splice(Math.min(insertAt, orderTopToBottom.length), 0, src)

      const bottomToTop = [...orderTopToBottom].reverse()
      bottomToTop.forEach((l, i) => { (l.node as any).zIndex(i) })
      drawArt()

      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    drawArt()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  // ===== Снимки свойств выбранного узла для Toolbar =====
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: sel.node.fontSize(),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
    }
    : sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    }
    : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); drawArt(); trRef.current?.forceUpdate() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (typeof n?.stroke !== "function") return; n.stroke(hex); drawArt(); trRef.current?.forceUpdate() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (typeof n?.strokeWidth !== "function") return; n.strokeWidth(w); drawArt(); trRef.current?.forceUpdate() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); drawArt(); trRef.current?.forceUpdate() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); drawArt(); trRef.current?.forceUpdate() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); drawArt(); trRef.current?.forceUpdate() }

  // === FIX: универсальная перекраска (включая CREST / Group и Line) ===
  const setSelectedColor      = (hex:string)  => {
    if (!sel) return
    const n = sel.node as any
    if (sel.type === "text") {
      (n as Konva.Text).fill(hex)
    } else if (sel.type === "shape") {
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
    drawArt()
  }

  // ===== Clear (только арт текущей стороны) =====
  const clearArt = () => {
    if (editingRef.current) {
      editingRef.current.cleanup(false)
      editingRef.current = null
    }
    const g = currentArt()
    if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    drawArt()
  }

  // ===== Скачивание (mockup + art) =====
  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    uiLayerRef.current?.visible(false)
    const showFront = s === "front"
    frontBgRef.current?.visible(showFront)
    backBgRef.current?.visible(!showFront ? true : false)
    frontArtRef.current?.visible(showFront)
    backArtRef.current?.visible(!showFront)

    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    bgLayerRef.current?.visible(false)
    st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)

    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 250))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // ======= DOT-SCREEN / SCREENPRINT FX =======
  // простой фрагментный шейдер dot-screen (полутоновая сетка)
  const frag = `
  precision mediump float;
  varying vec2 vUV;
  uniform sampler2D uTex;
  uniform vec2 uRes;     // размер целевого canvas (экрана)
  uniform float uAngle;  // угол сетки (рад)
  uniform float uScale;  // плотность сетки (чем больше — крупнее точки)
  uniform float uMix;    // 0..1 сила эффекта

  // поворот UV
  vec2 rot(vec2 p, float a){
    float s = sin(a), c = cos(a);
    mat2 m = mat2(c,-s,s,c);
    return m * (p - 0.5) + 0.5;
  }

  void main(){
    vec4 col = texture2D(uTex, vUV);
    // luminance (perceptual)
    float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));

    // частота сетки в пикселях экрана
    vec2 uv = rot(vUV, uAngle);
    vec2 p = uv * uRes / uScale;

    // узор точек: синусные полосы по двум осям
    float dots = (sin(p.x) * sin(p.y)) * 0.5 + 0.5;

    // контрастная печать: тени/света
    float halftone = smoothstep(0.0, 1.0, dots);

    // смешивание: цветные заливки + «печать»
    vec3 screenprint = mix(col.rgb, vec3(halftone), 0.85);
    vec3 outCol = mix(col.rgb, screenprint, uMix);

    gl_FragColor = vec4(outCol, 1.0);
  }`

  const vert = `
  attribute vec2 p;
  varying vec2 vUV;
  void main(){
    vUV = (p + 1.0) * 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
  }`

  const initGL = () => {
    if (!fxRef.current) return
    const gl = fxRef.current.getContext("webgl", { premultipliedAlpha: false })
    if (!gl) return
    glRef.current = gl

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("Shader error:", gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const pr = gl.createProgram()!
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, vert))
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, frag))
    gl.linkProgram(pr)
    progRef.current = pr

    // fullscreen quad
    const quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1,  1,-1,  -1,1,
      -1, 1,  1,-1,   1,1
    ]), gl.STATIC_DRAW)
    quadRef.current = quad

    // texture
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    texRef.current = tex

    gl.useProgram(pr)
    const pLoc = gl.getAttribLocation(pr, "p")
    gl.enableVertexAttribArray(pLoc)
    gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0)

    locRef.current.uTex   = gl.getUniformLocation(pr, "uTex")
    locRef.current.uRes   = gl.getUniformLocation(pr, "uRes")
    locRef.current.uAngle = gl.getUniformLocation(pr, "uAngle")
    locRef.current.uScale = gl.getUniformLocation(pr, "uScale")
    locRef.current.uMix   = gl.getUniformLocation(pr, "uMix")
  }

  // снимаем bitmap только с арта (без мокапа) через Layer.toCanvas
  const makeArtBitmap = () => {
    const art = artLayerRef.current
    if (!stageRef.current || !art) return null
    // bitmap в базовом размере
    const cnv = (art as any).toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement
    return cnv
  }

  const renderScreenPrint = () => {
    if (!fxRef.current || !glRef.current || !progRef.current) return
    const gl = glRef.current
    const fx = fxRef.current

    // подгоняем размер fx-canvas под текущее окно
    if (fx.width !== Math.round(viewW) || fx.height !== Math.round(viewH)) {
      fx.width  = Math.round(viewW)
      fx.height = Math.round(viewH)
      gl.viewport(0, 0, fx.width, fx.height)
    }

    const src = makeArtBitmap()
    if (!src) { gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); return }

    // заливка текстуры
    gl.bindTexture(gl.TEXTURE_2D, texRef.current)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)

    gl.useProgram(progRef.current)
    gl.uniform1i(locRef.current.uTex, 0)
    gl.uniform2f(locRef.current.uRes, fx.width, fx.height)
    gl.uniform1f(locRef.current.uAngle, 0.15) // ~8.6° — «от печати»
    gl.uniform1f(locRef.current.uScale, 8.0)  // плотность точек
    gl.uniform1f(locRef.current.uMix, fxOnRef.current ? 1.0 : 0.0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  // инициализация GL один раз
  useEffect(() => {
    initGL()
    // первичный рендер
    requestAnimationFrame(renderScreenPrint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // при включении/выключении эффекта и при изменении размеров — перерендер
  useEffect(() => { requestAnimationFrame(renderScreenPrint) }, [fxOn, viewW, viewH, scale, side])

  // ===== Render =====
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
      {/* Desktop-панель слоёв — только на десктопе */}
      {!isMobile && showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={onLayerSelect}
          onToggleVisible={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) }}
          onToggleLock={(id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }); attachTransformer() }}
          onDelete={deleteLayer}
          onDuplicate={duplicateLayer}
          onReorder={reorder}
          onChangeBlend={(id, b)=>updateMeta(id,{ blend: b as Blend })}
          onChangeOpacity={(id, o)=>updateMeta(id,{ opacity: o })}
        />
      )}

      {/* Сцена */}
      <div className="w-full h-full flex items-start justify-center relative">
        {/* FX-канвас (поверх арта, под трансформером) */}
        <canvas
          ref={fxRef}
          style={{
            position: "absolute",
            left: `calc(50% - ${viewW/2}px)`,
            top:  `${padTop}px`,
            width: `${viewW}px`,
            height:`${viewH}px`,
            pointerEvents: "none",
            opacity: fxOn ? 1 : 0,
            transition: "opacity 120ms ease"
          }}
        />
        <div style={{ touchAction: "none" }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* 1. ТОЛЬКО мокап (в отдельном canvas-слое) */}
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && (
                <KImage
                  ref={frontBgRef}
                  image={frontMock}
                  visible={side==="front"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
              {backMock && (
                <KImage
                  ref={backBgRef}
                  image={backMock}
                  visible={side==="back"}
                  width={BASE_W}
                  height={BASE_H}
                  listening={true}
                />
              )}
            </Layer>

            {/* 2. АРТ (контент + erase в этом же canvas-слое) */}
            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            {/* 3. UI-слой для рамки трансформера */}
            <Layer ref={uiLayerRef}>
              <Transformer
                ref={trRef}
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

      {/* Toolbar */}
      <Toolbar
        side={side} setSide={(s: Side)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v:string)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(n:number)=>set({ brushSize: n })}
        shapeKind={shapeKind} setShapeKind={()=>{}}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={onAddShape}
        onDownloadFront={()=>downloadBoth("front")}
        onDownloadBack={()=>downloadBoth("back")}
        onClear={clearArt}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedKind={selectedKind}
        selectedProps={selectedProps}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
        setSelectedFontFamily={setSelectedFontFamily}
        setSelectedColor={setSelectedColor}

        // ↓ пример как подружить эффект с вашим тулбаром:
        extraControls={{
          screenPrint: {
            enabled: fxOn,
            toggle: () => setFxOn(v => !v),
            // можно добавить ползунки для плотности/угла — uScale/uAngle
          }
        }}

        mobileTopOffset={padTop}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>{}, // blend скрыт на мобилке
          onChangeOpacity: (id, o)=>{}, // скрыт
          onMoveUp: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />
    </div>
  )
}
