"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Line, Rect, Text as KText, Group, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = { blend: Blend; opacity: number; raster: number; name: string; visible: boolean; locked: boolean }
type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group
type LayerType = "image"|"shape"|"text"|"stroke"
type AnyLayer = { id: string; side: Side; node: AnyNode; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef = useRef<Konva.Stage>(null)
  const tRef     = useRef<Konva.Transformer>(null)

  const cropRect = useRef<Konva.Rect>(null)
  const cropTf   = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)

  // textarea для inline-текста
  const overlayRef = useRef<HTMLTextAreaElement|null>(null)

  // --------- авто-скейл
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePanel = 0 // панель плавающая — не вычитаем ширину
    const maxW = vw - PADDING * 2 - sidePanel
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  const visibleLayers = useMemo(
    () => layers.filter(l => l.side === side && l.meta.visible),
    [layers, side]
  )

  const getLayerById = (id: string | null) => id ? layers.find(l => l.id === id) || null : null
  const findNode = (id: string | null) => getLayerById(id)?.node || null
  const getType = (id: string | null): LayerType | null => getLayerById(id)?.type || null

  // --------- meta
  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    node.opacity(meta.opacity)
    ;(node as any).globalCompositeOperation = meta.blend
    if ((node as any).filters) {
      if (meta.raster > 0 && (Konva as any).Filters?.Pixelate) {
        (node as any).filters([(Konva as any).Filters.Pixelate])
        ;(node as any).pixelSize(meta.raster)
      } else {
        (node as any).filters([])
      }
    }
    node.getLayer()?.batchDraw()
  }

  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over",
    opacity: 1,
    raster: 0,
    name,
    visible: true,
    locked: false,
  })

  // --------- transformer attach + drag toggle
  const attachTransformer = () => {
    const node = findNode(selectedId)
    const ltype = getType(selectedId)

    // скрываем трансформер когда рисуем/стираем или во время crop
    const shouldHide =
      isDrawing || isCropping || tool === "brush" || tool === "erase"

    if (shouldHide || !node || (getLayerById(selectedId!)?.meta.locked)) {
      tRef.current?.nodes([])
      tRef.current?.getLayer()?.batchDraw()
      return
    }

    // для stroke показываем трансформер только если выбран (не во время рисования)
    tRef.current?.nodes([node])
    tRef.current?.getLayer()?.batchDraw()

    // перетаскивание — только в режиме Move
    const canDrag = tool === "move" && !getLayerById(selectedId!)?.meta.locked
    ;(node as any).draggable(canDrag)
  }

  useEffect(() => { attachTransformer() }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // --------- shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const node = findNode(selectedId)
      if (!node) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        const src = getLayerById(selectedId!)!
        const clone = node.clone()
        clone.x(node.x() + 20); clone.y(node.y() + 20)
        ;(clone as any).id(uid())
        const newLay: AnyLayer = {
          id: (clone as any)._id,
          node: clone,
          side: src.side,
          meta: { ...src.meta, name: src.meta.name + " copy" },
          type: src.type,
        }
        setLayers(p => [...p, newLay])
        select(newLay.id)
      } else if (e.key === "Delete" || e.key === "Backspace") {
        setLayers(p => p.filter(l => l.id !== selectedId))
        select(null)
      } else if (e.key === "]") {
        moveZ(selectedId!, "up")
      } else if (e.key === "[") {
        moveZ(selectedId!, "down")
      } else if (e.shiftKey && (e.key === "+" || e.key === "=")) {
        cycleBlend(1)
      } else if (e.shiftKey && e.key === "-") {
        cycleBlend(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side])

  const blends: Blend[] = ["source-over", "multiply", "screen", "overlay", "darken", "lighten"]
  const cycleBlend = (dir: 1 | -1) => {
    const lay = getLayerById(selectedId)
    if (!lay) return
    const idx = blends.indexOf(lay.meta.blend)
    const next = blends[(idx + dir + blends.length) % blends.length]
    setLayers(p => p.map(l => l.id === lay.id ? (applyMeta(l.node, { ...l.meta, blend: next }), { ...l, meta: { ...l.meta, blend: next } }) : l))
  }

  // --------- upload
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const node = new Konva.Image({
          image: img,
          x: BASE_W / 2 - img.width / 2,
          y: BASE_H / 2 - img.height / 2,
        })
        node.width(img.width); node.height(img.height)
        ;(node as any).id(uid())
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        const id = (node as any)._id
        setLayers(p => [...p, { id, side, node, meta, type: "image" }])
        select(id)
        set({ tool: "move" }) // сразу move
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // --------- text (inline edit)
  const createInlineEditor = (node: Konva.Text) => {
    const stage = stageRef.current
    if (!stage) return
    const textPosition = node.getAbsolutePosition(stage)
    const area = document.createElement("textarea")
    area.value = node.text()
    area.style.position = "absolute"
    area.style.top = `${textPosition.y * scale + stage.container().getBoundingClientRect().top}px`
    area.style.left = `${textPosition.x * scale + stage.container().getBoundingClientRect().left}px`
    area.style.width = `${node.width() * scale || 300}px`
    area.style.fontSize = `${node.fontSize() * scale}px`
    area.style.fontFamily = node.fontFamily()
    area.style.color = node.fill() as string
    area.style.padding = "0"
    area.style.margin = "0"
    area.style.border = "1px solid #000"
    area.style.background = "rgba(255,255,255,0.85)"
    area.style.zIndex = "1000"
    document.body.appendChild(area)
    overlayRef.current = area
    area.focus()
    const commit = () => {
      node.text(area.value || "")
      node.getLayer()?.batchDraw()
      area.remove()
      overlayRef.current = null
    }
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit() }
      if (e.key === "Escape") { e.preventDefault(); commit() }
    })
    area.addEventListener("blur", commit)
  }

  const onAddText = () => {
    const node = new Konva.Text({
      text: "Type…",
      x: BASE_W / 2 - 180,
      y: BASE_H / 2 - 30,
      fontSize: 64,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: brushColor,
    })
    ;(node as any).id(uid())
    const meta = baseMeta("Text")
    applyMeta(node, meta)
    const id = (node as any)._id
    setLayers(p => [...p, { id, side, node, meta, type: "text" }])
    select(id); set({ tool: "move" })
    node.on("dblclick dbltap", () => createInlineEditor(node))
  }

  // --------- shapes
  const addShape = (kind: ShapeKind) => {
    let node: any
    if (kind === "circle") node = new Konva.Circle({ x: BASE_W / 2, y: BASE_H / 2, radius: 180, fill: brushColor })
    if (kind === "square") node = new Konva.Rect({ x: BASE_W / 2 - 180, y: BASE_H / 2 - 180, width: 360, height: 360, fill: brushColor })
    if (kind === "triangle") node = new Konva.RegularPolygon({ x: BASE_W / 2, y: BASE_H / 2, sides: 3, radius: 220, fill: brushColor })
    if (kind === "cross") {
      node = new Konva.Group({ x: BASE_W / 2 - 180, y: BASE_H / 2 - 180 })
      node.add(new Konva.Rect({ width: 360, height: 70, y: 145, fill: brushColor }))
      node.add(new Konva.Rect({ width: 70, height: 360, x: 145, fill: brushColor }))
    }
    if (kind === "line") node = new Konva.Line({ points: [BASE_W / 2 - 200, BASE_H / 2, BASE_W / 2 + 200, BASE_H / 2], stroke: brushColor, strokeWidth: 16 })
    ;(node as any).id(uid())
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    const id = (node as any)._id
    setLayers(p => [...p, { id, side, node, meta, type: "shape" }])
    select(id)
    set({ tool: "move" }) // сразу move
  }

  // --------- brush/erase
  const startStroke = (x: number, y: number) => {
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === "erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize,
      lineCap: "round",
      lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
    })
    ;(line as any).id(uid())
    const meta = baseMeta("Stroke")
    const id = (line as any)._id
    setLayers(p => [...p, { id, side, node: line, meta, type: "stroke" }])
    select(id)
    setIsDrawing(true)
  }

  const appendStroke = (x: number, y: number) => {
    const node = findNode(selectedId)
    if (!(node instanceof Konva.Line)) return
    const pts = node.points().concat([x, y])
    node.points(pts)
    node.getLayer()?.batchDraw()
  }

  // --------- crop
  const startCrop = () => {
    const node = findNode(selectedId)
    if (!node) return
    setIsCropping(true)
    const b = node.getClientRect({ relativeTo: stageRef.current })
    cropRect.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropRect.current?.getLayer()?.batchDraw()
    cropTf.current?.nodes([cropRect.current!])
  }

  const applyCrop = () => {
    const node = findNode(selectedId)
    const rect = cropRect.current
    if (!node || !rect) { setIsCropping(false); return }
    const s = scale
    const rx = rect.x() / s - node.x()
    const ry = rect.y() / s - node.y()
    const rw = rect.width() / s
    const rh = rect.height() / s

    if (node instanceof Konva.Image) {
      node.crop({ x: rx, y: ry, width: rw, height: rh })
      node.width(rw); node.height(rh)
      node.getLayer()?.batchDraw()
    } else {
      const g = new Konva.Group({ x: node.x(), y: node.y(), clip: { x: rx, y: ry, width: rw, height: rh } })
      node.x(0); node.y(0)
      const parent = node.getParent()
      parent?.add(g); node.moveTo(g); g.cache(); g.draw()
    }
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    setIsCropping(false)
  }

  const cancelCrop = () => {
    setIsCropping(false)
    cropRect.current?.visible(false)
    cropTf.current?.nodes([])
    cropRect.current?.getLayer()?.batchDraw()
  }

  // --------- export
  const exportSide = (s: Side) => {
    const st = stageRef.current; if (!st) return

    const oldScale = st.scaleX()
    const pr = 1 / oldScale // компенсируем масштаб
    // скрыть другой side
    const hidden: AnyLayer[] = []
    layers.forEach(l => { if (l.side !== s) { l.node.visible(false); hidden.push(l) } })

    st.draw()
    const data = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    hidden.forEach(l => l.node.visible(l.meta.visible))
    st.draw()

    const a = document.createElement("a")
    a.href = data; a.download = `darkroom-${s}.png`; a.click()
  }

  // --------- pointer routing
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping || overlayRef.current) return
    const p = getPos()
    if (tool === "brush" || tool === "erase") startStroke(p.x / scale, p.y / scale)
    else if (tool === "text") onAddText()
    else if (tool === "shape") addShape(shapeKind)
  }
  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x / scale, p.y / scale)
  }
  const onUp = () => setIsDrawing(false)

  // блок скролла на мобиле при рисовании
  useEffect(() => {
    const prevent = (e: TouchEvent) => { if (tool === "brush" || tool === "erase") e.preventDefault() }
    document.addEventListener("touchmove", prevent, { passive: false })
    return () => document.removeEventListener("touchmove", prevent as any)
  }, [tool])

  // --------- слои / сервис
  const layerItems = useMemo(() =>
    layers.filter(l => l.side === side).map(l => ({
      id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked
    })), [layers, side])

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => l.id === id ? (applyMeta(l.node, { ...l.meta, ...patch }), { ...l, meta: { ...l.meta, ...patch } }) : l))
  }

  const moveZ = (id: string, dir: "up" | "down") => {
    const idx = layers.findIndex(l => l.id === id)
    if (idx < 0) return
    const node = layers[idx].node
    if (dir === "up") node.moveUp(); else node.moveDown()
    node.getLayer()?.batchDraw()
    // и в массиве тоже
    setLayers(p => {
      const a = [...p]
      const i = a.findIndex(l => l.id === id); if (i < 0) return p
      const j = dir === "up" ? i + 1 : i - 1
      if (j < 0 || j >= a.length) return p
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
  }

  // смена цвета объекта
  const setObjectColor = (hex: string) => {
    const lay = getLayerById(selectedId); if (!lay) return
    if (lay.type === "text") { (lay.node as Konva.Text).fill(hex) }
    else if (lay.type === "shape") {
      if (lay.node instanceof Konva.Line) (lay.node as Konva.Line).stroke(hex)
      else if ("fill" in (lay.node as any)) (lay.node as any).fill(hex)
    } else if (lay.type === "stroke") {
      (lay.node as Konva.Line).stroke(hex)
    }
    lay.node.getLayer()?.batchDraw()
  }

  const setStrokeWidth = (w: number) => {
    const lay = getLayerById(selectedId); if (!lay) return
    if (lay.type === "stroke") {
      (lay.node as Konva.Line).strokeWidth(w)
      lay.node.getLayer()?.batchDraw()
    }
  }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side}
        setSide={(s) => set({ side: s })}
        tool={tool}
        setTool={(t) => set({ tool: t })}
        brushColor={brushColor}
        setBrushColor={(v) => set({ brushColor: v })}
        brushSize={brushSize}
        setBrushSize={(n) => set({ brushSize: n })}
        shapeKind={shapeKind}
        setShapeKind={(k) => set({ shapeKind: k })}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={() => exportSide("front")}
        onDownloadBack={() => exportSide("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        selectedType={getType(selectedId)}
        setObjectColor={setObjectColor}
        setStrokeWidth={setStrokeWidth}
      />

      {showLayers && (
        <LayersPanel
          items={layerItems}
          selectId={selectedId}
          onSelect={(id) => select(id)}
          onToggleVisible={(id) => {
            const l = getLayerById(id)!; updateMeta(id, { visible: !l.meta.visible }); l.node.visible(!l.meta.visible); l.node.getLayer()?.batchDraw()
          }}
          onToggleLock={(id) => {
            const l = getLayerById(id)!; updateMeta(id, { locked: !l.meta.locked }); (l.node as any).locked = !l.meta.locked; attachTransformer()
          }}
          onDelete={(id) => { setLayers(p => p.filter(l => l.id !== id)); if (selectedId === id) select(null) }}
          onDuplicate={(id) => {
            const src = getLayerById(id)!; const clone = src.node.clone()
            clone.x(src.node.x() + 20); clone.y(src.node.y() + 20); (clone as any).id(uid())
            const newLay: AnyLayer = { id: (clone as any)._id, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name + " copy" }, type: src.type }
            setLayers(p => [...p, newLay]); select(newLay.id)
          }}
          onMoveUp={(id) => moveZ(id, "up")}
          onMoveDown={(id) => moveZ(id, "down")}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        >
          <Layer listening={false}>
            {side === "front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === "back" && backMock && <KImage image={backMock} width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer>
            {visibleLayers.map((l) => (
              <Group key={l.id} onClick={() => select(l.id)} onTap={() => select(l.id)} />
            ))}

            <Transformer
              ref={tRef}
              rotateEnabled={true}
              anchorSize={12}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />

            {/* crop overlay */}
            <Rect ref={cropRect} visible={false} stroke="black" dash={[6, 4]} strokeWidth={2} draggable />
            <Transformer ref={cropTf} rotateEnabled={false} anchorSize={10} borderStroke="black" anchorStroke="black" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
