'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Image as KImage, Rect, Transformer } from 'react-konva'
import Konva from 'konva'
import useImage from 'use-image'
import Toolbar from './Toolbar'
import LayersPanel from './LayersPanel'
import type { Blend, ShapeKind, Side, Tool } from './store'

// =============================================
// Canvas base (hi‑res logical space)
// =============================================
const BASE_W = 2400
const BASE_H = 3200
const PADDING = 20
const FRONT_SRC = '/mockups/MOCAP_FRONT.png'
const BACK_SRC = '/mockups/MOCAP_BACK.png'

const uid = () => Math.random().toString(36).slice(2)

// ---------- Types ----------

type BaseMeta = {
  blend: Blend
  opacity: number
  raster: number
  name: string
  visible: boolean
  locked: boolean
}

// NOTE: we keep real Konva nodes inside state (imperative canvas)
//       and render React‑Konva layers once.

type AnyNode = Konva.Image | Konva.Line | Konva.Text | Konva.Shape | Konva.Group

type LayerType = 'image' | 'shape' | 'text' | 'stroke'

type AnyLayer = {
  id: string
  side: Side
  node: AnyNode
  meta: BaseMeta
  type: LayerType
}

// =============================================
// Component
// =============================================
export default function EditorCanvas() {
  // Tools & UI state live here to avoid external breakage
  const [side, setSide] = useState<Side>('front')
  const [tool, setTool] = useState<Tool>('move')
  const [brushColor, setBrushColor] = useState<string>('#ff2e8b')
  const [brushSize, setBrushSize] = useState<number>(56)
  const [shapeKind, setShapeKind] = useState<ShapeKind>('circle')
  const [showLayers, setShowLayers] = useState(true)

  const [frontMock] = useImage(FRONT_SRC, 'anonymous')
  const [backMock] = useImage(BACK_SRC, 'anonymous')

  const stageRef = useRef<Konva.Stage>(null)
  const contentRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const cropRectRef = useRef<Konva.Rect>(null)
  const cropTrRef = useRef<Konva.Transformer>(null)

  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const pendingStrokeId = useRef<string | null>(null)

  // ---------- Viewport autoscale (no blue, no frills) ----------
  const { viewW, viewH, scale } = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : BASE_W
    const vh = typeof window !== 'undefined' ? window.innerHeight : BASE_H
    const sidePanel = showLayers ? 320 : 0
    const maxW = vw - PADDING * 2 - sidePanel
    const maxH = vh - PADDING * 2 - 80
    const s = Math.min(maxW / BASE_W, maxH / BASE_H, 1)
    return { viewW: BASE_W * s, viewH: BASE_H * s, scale: s }
  }, [showLayers])

  // ---------- Helpers ----------
  const baseMeta = (name: string): BaseMeta => ({
    blend: 'source-over' as Blend,
    opacity: 1,
    raster: 0,
    name,
    visible: true,
    locked: false,
  })

  const findLayer = (id: string | null) => (id ? layers.find((l) => l.id === id) || null : null)
  const findNode = (id: string | null) => findLayer(id)?.node || null

  const applyMeta = (node: AnyNode, meta: BaseMeta) => {
    // opacity
    node.opacity(meta.opacity)

    // blend (IMPORTANT: call the Konva setter, do NOT overwrite the method)
    const anyNode = node as any
    if (typeof anyNode.globalCompositeOperation === 'function') {
      anyNode.globalCompositeOperation(meta.blend)
    }

    // optional pixelation
    if (anyNode.filters && (Konva as any).Filters?.Pixelate) {
      if (meta.raster > 0) {
        anyNode.filters([(Konva as any).Filters.Pixelate])
        anyNode.pixelSize(meta.raster)
      } else {
        anyNode.filters([])
      }
    }
  }

  const attachTransformer = () => {
    const lay = findLayer(selectedId)
    const node = lay?.node
    if (!trRef.current) return

    if (node && !lay?.meta.locked && lay?.type !== 'stroke' && !isDrawing && !isCropping) {
      // Text resize: convert scale into fontSize/width and reset scale
      node.off('transformend')
      node.on('transformend', () => {
        if (node instanceof Konva.Text) {
          const scaleX = node.scaleX() || 1
          const scaleY = node.scaleY() || 1
          node.fontSize(Math.max(4, node.fontSize() * scaleY))
          node.width(Math.max(10, node.width() * scaleX))
          node.scaleX(1)
          node.scaleY(1)
        }
        contentRef.current?.batchDraw()
      })

      node.draggable(!['brush', 'erase', 'crop'].includes(tool))
      trRef.current.nodes([node])
      trRef.current.getLayer()?.batchDraw()
    } else {
      trRef.current.nodes([])
      trRef.current.getLayer()?.batchDraw()
    }
  }

  useEffect(() => {
    // Sync visibility on side switch
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    contentRef.current?.batchDraw()
  }, [side, layers])

  useEffect(() => {
    attachTransformer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, layers, side, tool, isDrawing, isCropping])

  // ---------- Upload image ----------
  const onUploadImage = (file: File) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const maxSize = Math.min(BASE_W, BASE_H) * 0.9
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width *= ratio
          height *= ratio
        }
        const node = new Konva.Image({
          image: img,
          x: BASE_W / 2 - width / 2,
          y: BASE_H / 2 - height / 2,
          width,
          height,
          listening: true,
        })
        const id = uid()
        node.id(id)
        const meta = baseMeta(file.name)
        applyMeta(node, meta)
        contentRef.current?.add(node)
        node.on('click tap', () => setSelectedId(id))
        setLayers((p) => [...p, { id, side, node, meta, type: 'image' }])
        setSelectedId(id)
        setTool('move')
        contentRef.current?.batchDraw()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

  // ---------- Text ----------
  const onAddText = () => {
    const node = new Konva.Text({
      text: 'Your text',
      x: BASE_W / 2 - 200,
      y: BASE_H / 2 - 30,
      fontSize: 64,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fill: brushColor,
      width: 400,
      align: 'center',
      listening: true,
    })
    const id = uid()
    node.id(id)
    const meta = baseMeta('Text')
    applyMeta(node, meta)
    contentRef.current?.add(node)
    node.on('click tap', () => setSelectedId(id))

    // inline edit on dblclick
    node.on('dblclick dbltap', () => {
      const stage = stageRef.current
      if (!stage) return
      const container = stage.container()
      const rect = container.getBoundingClientRect()
      const abs = node.getAbsolutePosition(stage)
      const ta = document.createElement('textarea')
      ta.value = node.text()
      Object.assign(ta.style, {
        position: 'absolute',
        top: `${abs.y * scale + rect.top - node.fontSize() * scale}px`,
        left: `${abs.x * scale + rect.left}px`,
        width: `${Math.max(200, node.width() * scale)}px`,
        fontSize: `${node.fontSize() * scale}px`,
        fontFamily: node.fontFamily(),
        color: String(node.fill()),
        lineHeight: '1.2',
        border: '1px solid #000',
        background: 'rgba(255,255,255,0.98)',
        padding: '2px',
        margin: '0',
        zIndex: '9999',
      } as CSSStyleDeclaration)
      document.body.appendChild(ta)
      ta.focus()
      const commit = () => {
        node.text(ta.value)
        ta.remove()
        contentRef.current?.batchDraw()
      }
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit()
        }
      })
      ta.addEventListener('blur', commit)
    })

    setLayers((p) => [...p, { id, side, node, meta, type: 'text' }])
    setSelectedId(id)
    setTool('move')
    contentRef.current?.batchDraw()
  }

  // ---------- Shapes ----------
  const addShape = (kind: ShapeKind) => {
    let node: AnyNode
    const size = 180

    if (kind === 'circle') node = new Konva.Circle({ x: BASE_W / 2, y: BASE_H / 2, radius: size, fill: brushColor })
    else if (kind === 'square') node = new Konva.Rect({ x: BASE_W / 2 - size, y: BASE_H / 2 - size, width: size * 2, height: size * 2, fill: brushColor })
    else if (kind === 'triangle') node = new Konva.RegularPolygon({ x: BASE_W / 2, y: BASE_H / 2, sides: 3, radius: size * 1.2, fill: brushColor })
    else if (kind === 'cross') {
      const g = new Konva.Group({ x: BASE_W / 2 - size, y: BASE_H / 2 - size })
      const t = size * 0.4
      g.add(new Konva.Rect({ width: size * 2, height: t, y: size - t / 2, fill: brushColor }))
      g.add(new Konva.Rect({ width: t, height: size * 2, x: size - t / 2, fill: brushColor }))
      node = g
    } else {
      node = new Konva.Line({ points: [BASE_W / 2 - size, BASE_H / 2, BASE_W / 2 + size, BASE_H / 2], stroke: brushColor, strokeWidth: 12, lineCap: 'round' })
    }

    ;(node as any).setAttr('kind', kind)
    const id = uid()
    node.id(id)
    node.setAttr('listening', true)
    const meta = baseMeta(kind)
    applyMeta(node, meta)
    contentRef.current?.add(node)
    node.on('click tap', () => setSelectedId(id))

    setLayers((p) => [...p, { id, side, node, meta, type: 'shape' }])
    setSelectedId(id)
    setTool('move')
    contentRef.current?.batchDraw()
  }

  // ---------- Brush / Eraser ----------
  const startStroke = (x: number, y: number) => {
    const line = new Konva.Line({
      points: [x, y],
      stroke: tool === 'erase' ? '#ffffff' : brushColor,
      strokeWidth: brushSize,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: tool === 'erase' ? 'destination-out' : 'source-over',
      listening: true,
    })
    const id = uid()
    line.id(id)
    const meta = baseMeta('Stroke')
    contentRef.current?.add(line)
    setLayers((p) => [...p, { id, side, node: line, meta, type: 'stroke' }])
    pendingStrokeId.current = id
    setIsDrawing(true)
  }

  const appendStroke = (x: number, y: number) => {
    const n = findNode(pendingStrokeId.current)
    if (!(n instanceof Konva.Line)) return
    n.points(n.points().concat([x, y]))
    contentRef.current?.batchDraw()
  }

  const finishStroke = () => {
    setIsDrawing(false)
    if (pendingStrokeId.current) {
      setSelectedId(pendingStrokeId.current)
      pendingStrokeId.current = null
    }
  }

  // ---------- Crop ----------
  const startCrop = () => {
    const n = findNode(selectedId)
    if (!n) return
    setIsCropping(true)
    const st = stageRef.current
    if (!st) return
    const b = n.getClientRect({ relativeTo: st })
    cropRectRef.current?.setAttrs({ x: b.x, y: b.y, width: b.width, height: b.height, visible: true })
    cropTrRef.current?.nodes([cropRectRef.current!])
    trRef.current?.nodes([])
    contentRef.current?.batchDraw()
  }

  const applyCrop = () => {
    const n = findNode(selectedId)
    const r = cropRectRef.current
    const st = stageRef.current
    if (!n || !r || !st) {
      setIsCropping(false)
      return
    }

    // Convert rect absolute coords → node local space (robust with any stage scale)
    const tlAbs = { x: r.x(), y: r.y() }
    const brAbs = { x: r.x() + r.width(), y: r.y() + r.height() }
    const inv = n.getAbsoluteTransform(st).copy().invert()
    const tl = inv.point(tlAbs)
    const br = inv.point(brAbs)
    const w = Math.max(1, br.x - tl.x)
    const h = Math.max(1, br.y - tl.y)

    if (n instanceof Konva.Image) {
      n.crop({ x: tl.x, y: tl.y, width: w, height: h })
      n.width(w)
      n.height(h)
    } else {
      const g = new Konva.Group({ x: n.x(), y: n.y(), clip: { x: tl.x, y: tl.y, width: w, height: h } })
      contentRef.current?.add(g)
      n.moveTo(g)
      n.position({ x: 0, y: 0 })
      g.cache()
    }

    r.visible(false)
    cropTrRef.current?.nodes([])
    setIsCropping(false)
    contentRef.current?.batchDraw()
  }

  const cancelCrop = () => {
    setIsCropping(false)
    cropRectRef.current?.visible(false)
    cropTrRef.current?.nodes([])
    contentRef.current?.batchDraw()
  }

  // ---------- Export (two files: with mockup & alpha) ----------
  const exportSide = (s: Side) => {
    const st = stageRef.current
    if (!st) return

    // hide other side
    const hidden: AnyLayer[] = []
    layers.forEach((l) => {
      if (l.side !== s) {
        l.node.visible(false)
        hidden.push(l)
      }
    })

    // 1) with mockup
    const pr = 1 / (st.scaleX() || 1) // upsample back to logical base
    const dataMock = st.toDataURL({ pixelRatio: pr, mimeType: 'image/png' })

    // 2) transparent (hide mockup image)
    const mockLayer = st.findOne('#mockup-layer') as Konva.Layer
    mockLayer?.visible(false)
    const dataAlpha = st.toDataURL({ pixelRatio: pr, mimeType: 'image/png' })
    mockLayer?.visible(true)

    // restore hidden
    hidden.forEach((l) => l.node.visible(l.meta.visible))
    st.draw()

    // trigger downloads
    const a1 = document.createElement('a')
    a1.href = dataMock
    a1.download = `darkroom-${s}-mockup.png`
    a1.click()

    const a2 = document.createElement('a')
    a2.href = dataAlpha
    a2.download = `darkroom-${s}-alpha.png`
    a2.click()
  }

  // ---------- Pointer routing ----------
  const getPos = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }

  const onDown = () => {
    if (isCropping) return
    const p = getPos()
    if (tool === 'brush' || tool === 'erase') startStroke(p.x / scale, p.y / scale)
    else if (tool === 'text') onAddText()
    else if (tool === 'shape') addShape(shapeKind)
  }

  const onMove = () => {
    if (!isDrawing) return
    const p = getPos()
    appendStroke(p.x / scale, p.y / scale)
  }

  const onUp = () => {
    if (isDrawing) finishStroke()
  }

  // ---------- Layers panel data (do not show strokes) ----------
  const layerItems = useMemo(
    () =>
      layers
        .filter((l) => l.side === side && l.type !== 'stroke')
        .sort((a, b) => a.node.zIndex() - b.node.zIndex())
        .reverse()
        .map((l) => ({ id: l.id, name: l.meta.name, type: l.type, visible: l.meta.visible, locked: l.meta.locked })),
    [layers, side]
  )

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers((p) =>
      p.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, meta: { ...l.meta, ...patch } }
        applyMeta(next.node, next.meta)
        if (patch.visible !== undefined) next.node.visible(next.meta.visible && next.side === side)
        return next
      })
    )
    contentRef.current?.batchDraw()
  }

  const onLayerSelect = (id: string) => setSelectedId(id)

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
    if (selectedId === id) setSelectedId(null)
    contentRef.current?.batchDraw()
  }

  const onDuplicate = (id: string) => {
    const src = layers.find((l) => l.id === id)!
    const clone = src.node.clone()
    clone.x(src.node.x() + 20)
    clone.y(src.node.y() + 20)
    const newId = uid()
    clone.id(newId)
    contentRef.current?.add(clone)
    setLayers((p) => [...p, { id: newId, node: clone, side: src.side, meta: { ...src.meta, name: src.meta.name + ' copy' }, type: src.type }])
    setSelectedId(newId)
    contentRef.current?.batchDraw()
  }

  const onMoveUp = (id: string) => {
    const n = layers.find((l) => l.id === id)?.node
    n?.moveUp()
    contentRef.current?.batchDraw()
  }

  const onMoveDown = (id: string) => {
    const n = layers.find((l) => l.id === id)?.node
    n?.moveDown()
    contentRef.current?.batchDraw()
  }

  return (
    <div className="relative w-screen h-[calc(100vh-80px)] overflow-hidden select-none">
      <Toolbar
        side={side}
        setSide={setSide}
        tool={tool}
        setTool={setTool}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        shapeKind={shapeKind}
        setShapeKind={setShapeKind}
        onUploadImage={onUploadImage}
        onAddText={onAddText}
        onAddShape={addShape}
        startCrop={startCrop}
        applyCrop={applyCrop}
        cancelCrop={cancelCrop}
        isCropping={isCropping}
        onDownloadFront={() => exportSide('front')}
        onDownloadBack={() => exportSide('back')}
        toggleLayers={() => setShowLayers((v) => !v)}
        layersOpen={showLayers}
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
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <Stage
          ref={stageRef}
          width={viewW}
          height={viewH}
          scale={{ x: scale, y: scale }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
          className="bg-white"
        >
          {/* Mockup */}
          <Layer id="mockup-layer" listening={false}>
            {side === 'front' && frontMock && <KImage image={frontMock} width={BASE_W} height={BASE_H} />}
            {side === 'back' && backMock && <KImage image={backMock} width={BASE_W} height={BASE_H} />}
          </Layer>

          {/* Content */}
          <Layer ref={contentRef}>
            <Transformer
              ref={trRef}
              rotateEnabled
              anchorSize={10}
              borderStroke="#000"
              anchorStroke="#000"
              anchorFill="#fff"
            />
            {/* Crop UI */}
            <Rect ref={cropRectRef} visible={false} stroke="#000" dash={[6, 4]} strokeWidth={2} draggable />
            <Transformer ref={cropTrRef} rotateEnabled={false} anchorSize={8} borderStroke="#000" anchorStroke="#000" />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
