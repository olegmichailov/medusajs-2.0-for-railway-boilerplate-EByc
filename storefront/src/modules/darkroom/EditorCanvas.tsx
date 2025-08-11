"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Stage, Layer, Image as KImage, Rect, Transformer } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import Toolbar from "./Toolbar"
import LayersPanel from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20

const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const uid = () => Math.random().toString(36).slice(2)

type BaseMeta = {
  blend: Blend
  opacity: number
  raster: number
  name: string
  visible: boolean
  locked: boolean
}

type NodeT = Konva.Image | Konva.Line | Konva.Text | Konva.Rect | Konva.RegularPolygon | Konva.Group
type LayerType = "image"|"shape"|"text"|"strokes"
type L = { id: string; side: Side; node: NodeT; meta: BaseMeta; type: LayerType }

export default function EditorCanvas() {
  const { side, set, tool, brushColor, brushSize, shapeKind, selectedId, select,
          showLayers, toggleLayers } = useDarkroom()

  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  const stageRef      = useRef<Konva.Stage>(null)
  const bgLayerRef    = useRef<Konva.Layer>(null)
  const drawLayerRef  = useRef<Konva.Layer>(null)
  const uiLayerRef    = useRef<Konva.Layer>(null)
  const trRef         = useRef<Konva.Transformer>(null)
  const cropRectRef   = useRef<Konva.Rect>(null)
  const cropTrRef     = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<L[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const currentStrokesGroupId = useRef<string | null>(null)

  // -------- viewport scale
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200
    const vh = typeof window !== "undefined" ? window.innerHeight : 800
    const sidePanel = showLayers ? 320 : 0
    const maxW = vw - PADDING * 2 - sidePanel
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // -------- helpers
  const baseMeta = (name: string): BaseMeta => ({
    blend: "source-over", opacity: 1, raster: 0, name, visible: true, locked: false
  })

  const find = (id: string | null) => id ? (layers.find(l => l.id === id) ?? null) : null
  const node = (id: string | null) => find(id)?.node ?? null

  const applyMeta = (n: NodeT, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    n.setAttrs({ globalCompositeOperation: meta.blend }) // фикс краша
    // при желании — фильтры/растр
  }

  // -------- restore from localStorage
  useEffect(() => {
    try {
      const json = localStorage.getItem("darkroom-stage")
      if (!json || !stageRef.current) return
      const stage = Konva.Node.create(json, stageRef.current.container())
      // переносим детей в наши слои:
      const srcDraw = stage.findOne("#__draw__") as Konva.Layer | null
      if (srcDraw && drawLayerRef.current) {
        drawLayerRef.current.destroyChildren()
        srcDraw.getChildren().forEach((c) => { c.remove(); drawLayerRef.current?.add(c) })
        drawLayerRef.current.batchDraw()
      }
      stage.destroy()
      // реконструируем массив layers (плоско, только верхний уровень групп/узлов)
      const flat: L[] = []
      drawLayerRef.current?.getChildren().each((n, idx) => {
        const id = (n as any)._id ?? uid()
        ;(n as any).id(id)
        const t: LayerType =
          n instanceof Konva.Text ? "text" :
          n instanceof Konva.Image ? "image" :
          n instanceof Konva.Group && n.name() === "strokes" ? "strokes" : "shape"
        flat.push({ id, side: side, node: n as NodeT, meta: baseMeta(`${t} ${idx+1}`), type: t })
      })
      setLayers(flat)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // autosave
  useEffect(() => {
    if (!stageRef.current) return
    const stage = stageRef.current
    // временно помечаем наш рабочий слой id, чтобы восстановиться
    drawLayerRef.current?.setAttr("id", "__draw__")
    const json = stage.toJSON()
    localStorage.setItem("darkroom-stage", json)
  }, [layers, side])

  // side visibility
  useEffect(() => {
    layers.forEach(l => l.node.visible(l.side === side && l.meta.visible))
    drawLayerRef.current?.batchDraw()
  }, [side, layers])

  // transformer attach + text scale→fontSize
  const attachTransformer = () => {
    const lay = find(selectedId)
    const n = lay?.node
    const disabled = isDrawing || isCropping || lay?.meta.locked
    if (!n || !trRef.current || disabled) {
      trRef.current?.nodes([]); uiLayerRef.current?.batchDraw()
      return
    }
    trRef.current.nodes([n])
    trRef.current.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, layers, side, isDrawing, isCropping])

  useEffect(() => {
    // нормализуем трансформы текста после resize
    const tr = trRef.current
    if (!tr) return
    const onEnd = () => {
      const n = tr.nodes()[0] as any
      if (!n || !(n instanceof Konva.Text)) return
      const newFont = Math.max(8, n.fontSize() * n.scaleX())
      n.fontSize(newFont)
      n.scale({ x: 1, y: 1 })
      n.getLayer()?.batchDraw()
    }
    tr.on("transformend", onEnd)
    return () => { tr.off("transformend", onEnd) }
  }, [])

  // ------------- tools: add content
  const addText = () => {
    const t = new Konva.Text({
      text: "Your text",
      x: BASE_W/2-180, y: BASE_H/2-30,
      fontSize: 64, fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      fill: "#000"
    })
    const id = uid(); (t as any).id(id)
    const meta = baseMeta("Text")
    applyMeta(t, meta)
    drawLayerRef.current?.add(t)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  const addShape = (kind: ShapeKind) => {
    let n: NodeT
    if (kind === "circle") {
      n = new Konva.Circle({ x: BASE_W/2, y: BASE_H/2, radius: 180, fill: brushColor })
    } else if (kind === "square") {
      n = new Konva.Rect({ x: BASE_W/2-180, y: BASE_H/2-180, width: 360, height:360, fill: brushColor })
    } else if (kind === "triangle") {
      n = new Konva.RegularPolygon({ x: BASE_W/2, y: BASE_H/2, sides: 3, radius: 220, fill: brushColor })
    } else if (kind === "cross") {
      const g = new Konva.Group({ x: BASE_W/2-180, y: BASE_H/2-180 })
      const a = new Konva.Rect({ width: 360, height: 70, y: 145, fill: brushColor })
      const b = new Konva.Rect({ width: 70, height: 360, x: 145, fill: brushColor })
      g.add(a); g.add(b); n = g
    } else { // line
      n = new Konva.Line({ points:[BASE_W/2-200, BASE_H/2, BASE_W/2+200, BASE_H/2], stroke: brushColor, strokeWidth: 16, lineCap: "round" })
    }
    const id = uid(); (n as any).id(id)
    const meta = baseMeta(kind)
    applyMeta(n, meta)
    drawLayerRef.current?.add(n)
    setLayers(p => [...p, { id, side, node: n, meta, type: "shape" }])
    select(id)
    drawLayerRef.current?.batchDraw()
  }

  // strokes grouped
  const ensureStrokesGroup = () => {
    if (currentStrokesGroupId.current) return currentStrokesGroupId.current
    const g = new Konva.Group({ name: "strokes" })
    const id = uid(); (g as any).id(id)
    const meta = baseMeta("strokes")
    drawLayerRef.current?.add(g)
    setLayers(p => [...p, { id, side, node: g, meta, type: "strokes" }])
    currentStrokesGroupId.current = id
    return id
  }

  const startStroke = (x: number, y: number) => {
    const gid = ensureStrokesGroup()
    const g = node(gid) as Konva.Group
    const line = new Konva.Line({
      points: [x,y],
      stroke: tool === "erase" ? "#ffffff" : brushColor,
      strokeWidth: brushSize, lineCap: "round", lineJoin: "round",
      globalCompositeOperation: tool === "erase" ? "destination-out" : "source-over",
      tension: 0
    })
    g.add(line)
    setIsDrawing(true)
    // не выделяем, чтобы не мигал трансформер
  }

  const appendStroke = (x: number, y: number) => {
    const gid = currentStrokesGroupId.current
    if (!gid) return
    const g = node(gid) as Konva.Group
    const line = g?.getChildren().at(-1) as Konva.Line | undefined
    if (!line) return
    const pts = line.points().concat([x,y])
    line.points(pts)
    drawLayerRef.current?.batchDraw()
  }

  const finishStroke = () => { setIsDrawing(false) }

  // crop
  const startCrop = () => {
    const n = node(selectedId); if (!n) return
    setIsCropping(true)
    const b = n.getClientRect({ relativeTo: stageRef.current! })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTrRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  const applyCrop = () => {
    const n = node(selectedId); const r = cropRectRef.current
    if (!n || !r) { setIsCropping(false); return }
    const s = scale
    const rx = r.x()/s - n.x(), ry = r.y()/s - n.y()
    const rw = r.width()/s, rh = r.height()/s

    if (n instanceof Konva.Image) {
      n.crop({ x: rx, y: ry, width: rw, height: rh })
      n.width(rw); n.height(rh)
    } else {
      const g = new Konva.Group({
        x: n.x(), y: n.y(),
        clip: { x: rx, y: ry, width: rw, height: rh }
      })
      drawLayerRef.current?.add(g)
      n.moveTo(g); n.position({ x: 0, y: 0 })
      g.cache()
    }
    r.visible(false); cropTrRef.current?.nodes([]); setIsCropping(false)
    uiLayerRef.current?.batchDraw(); drawLayerRef.current?.batchDraw()
  }

  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTrRef.current?.nodes([])
    uiLayerRef.current?.batchDraw()
  }

  // export (both files)
  const exportSide = (s: Side) => {
    const stage = stageRef.current; if (!stage) return
    const pr = 1 / scale // всегда полноразмер
    const bg = bgLayerRef.current
    const ui = uiLayerRef.current

    // показать только нужный side
    const hidden: NodeT[] = []
    layers.forEach(l => {
      if (l.side !== s) { if (l.node.visible()) hidden.push(l.node); l.node.visible(false) }
    })
    ui?.visible(false)

    // 1) с мокапом
    bg?.visible(true)
    stage.draw()
    const withMock = stage.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // 2) только арт (прозрачный фон)
    bg?.visible(false)
    stage.draw()
    const art = stage.toDataURL({ pixelRatio: pr, mimeType: "image/png" })

    // restore
    bg?.visible(true)
    hidden.forEach(n => n.visible(true))
    ui?.visible(true)
    stage.draw()

    const a1 = document.createElement("a")
    a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    const a2 = document.createElement("a")
    a2.href = art; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // pointer
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool === "brush" || tool === "erase") startStroke(p.x/scale, p.y/scale)
    else if (tool === "text") addText()
    else if (tool === "shape") addShape(shapeKind)
  }
  const onMove = () => { if (isDrawing) { const p = getPos(); appendStroke(p.x/scale, p.y/scale) } }
  const onUp   = () => { if (isDrawing) finishStroke() }

  // layers panel helpers
  const itemList = useMemo(() => {
    // верхний сверху
    const list = [...layers].filter(l => l.side === side)
      .sort((a,b) => a.node.zIndex() - b.node.zIndex()).reverse()
      .map((l, i) => ({ id: l.id, name: `${l.type} ${listLabelIndex(l, i)}`, type: l.type, visible: l.meta.visible, locked: l.meta.locked }))
    function listLabelIndex(l: L, i: number) { return i+1 }
    return list
  }, [layers, side])

  const toggleVisible = (id: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      const next = !l.meta.visible
      l.node.visible(next && l.side === side)
      return { ...l, meta: { ...l.meta, visible: next } }
    }))
    drawLayerRef.current?.batchDraw()
  }

  const toggleLock = (id: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      return { ...l, meta: { ...l.meta, locked: !l.meta.locked } }
    }))
    attachTransformer()
  }

  const del = (id: string) => {
    setLayers(prev => {
      const l = prev.find(x => x.id === id)
      l?.node.destroy()
      return prev.filter(x => x.id !== id)
    })
    if (selectedId === id) select(null)
    drawLayerRef.current?.batchDraw()
  }

  const dup = (id: string) => {
    const src = layers.find(l => l.id === id); if (!src) return
    const clone = src.node.clone()
    clone.x(src.node.x() + 20); clone.y(src.node.y() + 20)
    const id2 = uid(); (clone as any).id(id2)
    drawLayerRef.current?.add(clone)
    setLayers(p => [...p, { id: id2, side: src.side, node: clone, meta: { ...src.meta, name: src.meta.name + " copy" }, type: src.type }])
    select(id2)
    drawLayerRef.current?.batchDraw()
  }

  const moveZ = (id: string, dir: "up"|"down") => {
    const n = layers.find(l => l.id === id)?.node; if (!n) return
    dir === "up" ? n.moveUp() : n.moveDown()
    drawLayerRef.current?.batchDraw()
  }

  // color / stroke width into selected
  const setSelectedFill = (hex: string) => {
    const l = find(selectedId); if (!l) return
    if ((l.node as any).fill) (l.node as any).fill(hex)
    else if (l.node instanceof Konva.Group) {
      l.node.getChildren().forEach((ch: any) => ch.fill && ch.fill(hex))
    }
    l.node.getLayer()?.batchDraw()
  }
  const setSelectedStroke = (hex: string) => {
    const l = find(selectedId); if (!l) return
    if ((l.node as any).stroke) (l.node as any).stroke(hex)
    l.node.getLayer()?.batchDraw()
  }
  const setSelectedStrokeW = (w: number) => {
    const l = find(selectedId); if (!l) return
    if ((l.node as any).strokeWidth) (l.node as any).strokeWidth(w)
    l.node.getLayer()?.batchDraw()
  }
  const setSelectedText = (txt: string) => {
    const l = find(selectedId); if (!l || !(l.node instanceof Konva.Text)) return
    l.node.text(txt); l.node.getLayer()?.batchDraw()
  }
  const setSelectedFontSize = (v: number) => {
    const l = find(selectedId); if (!l || !(l.node instanceof Konva.Text)) return
    l.node.fontSize(v); l.node.getLayer()?.batchDraw()
  }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden">
      <Toolbar
        side={side} setSide={(s)=>set({ side: s })}
        tool={tool} setTool={(t: Tool)=>set({ tool: t })}
        brushColor={brushColor} setBrushColor={(v)=>set({ brushColor: v })}
        brushSize={brushSize} setBrushSize={(v)=>set({ brushSize: v })}
        shapeKind={shapeKind} setShapeKind={(k)=>set({ shapeKind: k })}
        onUploadImage={(file) => {
          const r = new FileReader()
          r.onload = () => {
            const img = new window.Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              const n = new Konva.Image({
                image: img,
                x: BASE_W/2 - img.width/2,
                y: BASE_H/2 - img.height/2,
                width: img.width,
                height: img.height
              })
              const id = uid(); (n as any).id(id)
              const meta = baseMeta("image")
              applyMeta(n, meta)
              drawLayerRef.current?.add(n)
              setLayers(p => [...p, { id, side, node: n, meta, type: "image" }])
              select(id)
              drawLayerRef.current?.batchDraw()
            }
            img.src = r.result as string
          }
          r.readAsDataURL(file)
        }}
        onAddText={addText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={() => exportSide("front")}
        onDownloadBack={() => exportSide("back")}
        toggleLayers={toggleLayers}
        layersOpen={showLayers}
        // selected context
        selectedKind={find(selectedId)?.type ?? null}
        selectedProps={( () => {
          const n = node(selectedId) as any
          if (!n) return null
          return {
            text: n.text ? n.text() : "",
            fontSize: n.fontSize ? n.fontSize() : 64,
            fill: n.fill ? n.fill() : "#000000",
            stroke: n.stroke ? n.stroke() : "#000000",
            strokeWidth: n.strokeWidth ? n.strokeWidth() : 0
          }
        })()}
        setSelectedFill={setSelectedFill}
        setSelectedStroke={setSelectedStroke}
        setSelectedStrokeW={setSelectedStrokeW}
        setSelectedText={setSelectedText}
        setSelectedFontSize={setSelectedFontSize}
      />

      {showLayers && (
        <LayersPanel
          items={itemList}
          selectId={selectedId}
          onSelect={(id)=>select(id)}
          onToggleVisible={toggleVisible}
          onToggleLock={toggleLock}
          onDelete={del}
          onDuplicate={dup}
          onMoveUp={(id)=>moveZ(id,"up")}
          onMoveDown={(id)=>moveZ(id,"down")}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          width={viewW} height={viewH}
          scale={{ x: scale, y: scale }}
          ref={stageRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          <Layer ref={bgLayerRef} listening={false}>
            {side === "front" && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === "back"  && backMock  && <KImage image={backMock}  width={BASE_W} height={BASE_H} />}
          </Layer>

          <Layer ref={drawLayerRef} />

          <Layer ref={uiLayerRef}>
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
              dash={[6,4]}
              strokeWidth={2}
              draggable
            />
            <Transformer
              ref={cropTrRef}
              rotateEnabled={false}
              anchorSize={10}
              borderStroke="black"
              anchorStroke="black"
              anchorFill="white"
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
