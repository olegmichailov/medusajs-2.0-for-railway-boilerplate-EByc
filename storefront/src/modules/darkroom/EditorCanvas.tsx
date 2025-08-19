"use client"

import React, {
  useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback
} from "react"
import { Stage, Layer, Image as KImage, Transformer, Group as KGroup } from "react-konva"
import Konva from "konva"
import useImage from "use-image"
import { isMobile } from "react-device-detect"
import Toolbar from "./Toolbar"
import LayersPanel, { LayerItem } from "./LayersPanel"
import { useDarkroom, Blend, ShapeKind, Side, Tool } from "./store"

/* =========================
   БАЗА / КОНСТАНТЫ
========================= */
const BASE_W = 2400
const BASE_H = 3200
const FRONT_SRC = "/mockups/MOCAP_FRONT.png"
const BACK_SRC  = "/mockups/MOCAP_BACK.png"

const TEXT_MIN_FS = 8
const TEXT_MAX_FS = 800
const TEXT_MIN_W  = 60
const TEXT_MAX_W  = Math.floor(BASE_W * 0.95)
const EPS = 0.25

const uid = () => "n_" + Math.random().toString(36).slice(2)

/* =========================
   ТИПЫ
========================= */
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

/* =========================
   FX: ПАРАМЕТРЫ + ШЕЙДЕР
========================= */
type FxParams = {
  enabled: boolean
  live: boolean
  cell: number
  levels: number
  angle: number
  dot: number
  palette: string[] // 5 цветов
  collapsed: boolean
  x: number
  y: number
}

const DEFAULT_FX: FxParams = {
  enabled: false,
  live: true,
  cell: 12,
  levels: 4,
  angle: 45,
  dot: 0.7,
  palette: ["#FFFFFF","#FFD447","#00C2FF","#FF4DA6","#111111"],
  collapsed: false,
  x: 16,
  y: 280, // под Tools по умолчанию
}

// WebGL2: отдельные uniforms вместо массива — надёжнее
const VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_image;
uniform vec2  u_resolution;
uniform float u_cell;
uniform float u_levels;
uniform float u_angle;   // radians
uniform float u_dot;     // 0..1

uniform vec3 u_pal0;
uniform vec3 u_pal1;
uniform vec3 u_pal2;
uniform vec3 u_pal3;
uniform vec3 u_pal4;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 posterizePal(float g){
  float stepv = 1.0 / max(u_levels, 1.0);
  float t0 = stepv * 1.0;
  float t1 = stepv * 2.0;
  float t2 = stepv * 3.0;
  float t3 = stepv * 4.0;
  if (g < t0) return u_pal4;
  if (g < t1) return u_pal3;
  if (g < t2) return u_pal2;
  if (g < t3) return u_pal1;
  return u_pal0;
}

vec2 rot(vec2 p, float a){
  float s = sin(a), c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

void main(){
  vec4 src = texture(u_image, v_uv);

  // Прозрачные области арта — прозрачны и в FX (не закрываем мокап/фон)
  if (src.a < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  float g = luma(src.rgb);

  // Халфтон
  vec2 px = v_uv * u_resolution;
  vec2 pr = rot(px, u_angle) / max(u_cell, 1.0);
  vec2 f = fract(pr) - 0.5;
  float r = length(f * 2.0);
  float dotMask = smoothstep(u_dot, 0.0, r);
  float ink = mix(1.0, dotMask, 0.8);

  vec3 baseCol = posterizePal(g);
  vec3 col = baseCol * ink;

  // Важное: отдаём альфу исходника, чтобы смешивание было корректным
  outColor = vec4(col * src.a, src.a);
}`

function hexToRGB(hex: string): [number, number, number] {
  const s = hex.replace("#","")
  const n = s.length===3 ? s.split("").map(c=>c+c).join("") : s
  const r = parseInt(n.slice(0,2),16)/255
  const g = parseInt(n.slice(2,4),16)/255
  const b = parseInt(n.slice(4,6),16)/255
  return [r,g,b]
}

/* =========================
   КОМПОНЕНТ
========================= */
export default function EditorCanvas() {
  const {
    side, set, tool, brushColor, brushSize, shapeKind,
    selectedId, select, showLayers, toggleLayers
  } = useDarkroom()

  // Мобилка → кисть по умолчанию
  useEffect(() => { if (isMobile) set({ tool: "brush" as Tool }) }, [set])

  // Конва точные хиты
  useEffect(() => { ;(Konva as any).hitOnDragEnabled = true }, [])

  /* ===== FX: WebGL ===== */
  const [fx, setFx] = useState<FxParams>(() => {
    // пробуем восстановить позицию окна
    try {
      const saved = localStorage.getItem("darkroom_fx")
      if (saved) return JSON.parse(saved) as FxParams
    } catch {}
    return DEFAULT_FX
  })
  useEffect(() => {
    try { localStorage.setItem("darkroom_fx", JSON.stringify(fx)) } catch {}
  }, [fx])

  const fxCanvasRef = useRef<HTMLCanvasElement|null>(null)
  const glRef = useRef<WebGL2RenderingContext|null>(null)
  const glProgRef = useRef<WebGLProgram|null>(null)
  const glBufRef = useRef<WebGLBuffer|null>(null)
  const glUniformsRef = useRef<Record<string, WebGLUniformLocation|null>>({})
  const rafRef = useRef<number|undefined>(undefined)

  const ensureGL = useCallback(() => {
    if (glRef.current) return true
    const canvas = fxCanvasRef.current
    if (!canvas) return false
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: true })
    if (!gl) return false
    glRef.current = gl

    // Program
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog))
    }
    glProgRef.current = prog
    gl.useProgram(prog)

    // Fullscreen tri
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1,-1, 3,-1, -1,3 ]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, "a_pos")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    glBufRef.current = buf

    // Blending & clear
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0,0,0,0)

    // Uniforms
    const uni = (name:string)=>gl.getUniformLocation(prog, name)
    glUniformsRef.current = {
      u_image: uni("u_image"),
      u_resolution: uni("u_resolution"),
      u_cell: uni("u_cell"),
      u_levels: uni("u_levels"),
      u_angle: uni("u_angle"),
      u_dot: uni("u_dot"),
      u_pal0: uni("u_pal0"),
      u_pal1: uni("u_pal1"),
      u_pal2: uni("u_pal2"),
      u_pal3: uni("u_pal3"),
      u_pal4: uni("u_pal4"),
    }
    return true
  }, [])

  const renderFx = useCallback(() => {
    if (!fx.enabled) return
    const gl = glRef.current
    const canvas = fxCanvasRef.current
    const artCanvas = (artLayerRef.current?.getCanvas() as any)?._canvas as HTMLCanvasElement | undefined
    if (!gl || !canvas || !artCanvas) return

    // Синхронизация размеров исходника
    canvas.width = BASE_W
    canvas.height = BASE_H

    gl.viewport(0,0,canvas.width,canvas.height)
    gl.useProgram(glProgRef.current)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Текстура из внутреннего canvas Konva (без CPU readback)
    const tex = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, artCanvas)

    const U = glUniformsRef.current
    gl.uniform1i(U.u_image!, 0)
    gl.uniform2f(U.u_resolution!, BASE_W, BASE_H)
    gl.uniform1f(U.u_cell!, fx.cell)
    gl.uniform1f(U.u_levels!, Math.max(2, Math.min(8, fx.levels)))
    gl.uniform1f(U.u_angle!, (fx.angle*Math.PI)/180)
    gl.uniform1f(U.u_dot!, Math.min(1, Math.max(0, fx.dot)))

    const p0 = hexToRGB(fx.palette[0]); gl.uniform3f(U.u_pal0!, p0[0],p0[1],p0[2])
    const p1 = hexToRGB(fx.palette[1]); gl.uniform3f(U.u_pal1!, p1[0],p1[1],p1[2])
    const p2 = hexToRGB(fx.palette[2]); gl.uniform3f(U.u_pal2!, p2[0],p2[1],p2[2])
    const p3 = hexToRGB(fx.palette[3]); gl.uniform3f(U.u_pal3!, p3[0],p3[1],p3[2])
    const p4 = hexToRGB(fx.palette[4]); gl.uniform3f(U.u_pal4!, p4[0],p4[1],p4[2])

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.deleteTexture(tex)
  }, [fx.enabled, fx.cell, fx.levels, fx.angle, fx.dot, fx.palette])

  const requestFx = useCallback(() => {
    if (!fx.enabled || !fx.live) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(renderFx)
  }, [fx.enabled, fx.live, renderFx])

  /* ===== Mockups ===== */
  const [frontMock] = useImage(FRONT_SRC, "anonymous")
  const [backMock]  = useImage(BACK_SRC,  "anonymous")

  /* ===== Refs слоёв ===== */
  const stageRef   = useRef<Konva.Stage>(null)
  const bgLayerRef = useRef<Konva.Layer>(null)
  const artLayerRef= useRef<Konva.Layer>(null)
  const uiLayerRef = useRef<Konva.Layer>(null)
  const trRef      = useRef<Konva.Transformer>(null)
  const frontBgRef = useRef<Konva.Image>(null)
  const backBgRef  = useRef<Konva.Image>(null)
  const frontArtRef= useRef<Konva.Group>(null)
  const backArtRef = useRef<Konva.Group>(null)

  /* ===== State редактора ===== */
  const [layers, setLayers] = useState<AnyLayer[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [seqs, setSeqs] = useState({ image: 1, shape: 1, text: 1, strokes: 1, erase: 1 })
  const currentStrokeId = useRef<Record<Side, string | null>>({ front: null, back: null })
  const currentEraseId  = useRef<Record<Side, string | null>>({ front: null, back: null })
  const isTransformingRef = useRef(false)

  /* ===== Вёрстка/масштаб ===== */
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

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    if (isMobile) set({ showLayers: false })
    return () => { document.body.style.overflow = prev }
  }, [set])

  /* ===== Helpers ===== */
  const baseMeta = (name: string): BaseMeta => ({ blend: "source-over", opacity: 1, name, visible: true, locked: false })
  const find = (id: string | null) => (id ? layers.find(l => l.id === id) || null : null)
  const node = (id: string | null) => find(id)?.node || null
  const applyMeta = (n: AnyNode, meta: BaseMeta) => {
    n.opacity(meta.opacity)
    ;(n as any).globalCompositeOperation = meta.blend
  }
  const artGroup = (s: Side) => (s === "front" ? frontArtRef.current! : backArtRef.current!)
  const currentArt = () => artGroup(side)

  // Показываем только активную сторону + FX
  useEffect(() => {
    layers.forEach((l) => l.node.visible(l.side === side && l.meta.visible))
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    bgLayerRef.current?.batchDraw()
    artLayerRef.current?.batchDraw()
    attachTransformer()
    if (fx.enabled) requestFx()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, layers])

  /* ===== Transformer / анти-дрожание текста ===== */
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

    const tr = trRef.current!
    if (disabled) {
      tr.nodes([])
      uiLayerRef.current?.batchDraw()
      return
    }

    tr.nodes([n])
    tr.rotateEnabled(true)

    const onStart = () => { isTransformingRef.current = true }
    const onEndT  = () => { isTransformingRef.current = false; if (fx.enabled && fx.live) requestFx() }
    n.on("transformstart.guard", onStart)
    n.on("transformend.guard", onEndT)
    detachGuard.current = () => n.off(".guard")

    if (isTextNode(n)) {
      tr.keepRatio(false)
      tr.enabledAnchors([
        "top-left","top-right","bottom-left","bottom-right",
        "middle-left","middle-right"
      ])
      const t = n as Konva.Text

      tr.boundBoxFunc((oldB) => oldB) // не даём Konva масштабировать сам

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

        if (active === "middle-left" || active === "middle-right" || snap.anchor?.startsWith("middle")) {
          const sx = Math.max(0.01, t.scaleX())
          const targetW = Math.max(TEXT_MIN_W, Math.min(snap.width * sx, TEXT_MAX_W))
          const curW = t.width() || snap.width
          if (Math.abs(targetW - curW) > EPS) {
            if (active === "middle-left" || snap.anchor === "middle-left") {
              t.width(targetW)
              t.x(snap.right - targetW)
            } else {
              t.x(snap.left)
              t.width(targetW)
            }
          }
          t.scaleX(1); t.scaleY(1)
        } else {
          const s = Math.max(t.scaleX(), t.scaleY())
          const targetFS = Math.max(TEXT_MIN_FS, Math.min(snap.fontSize * s, TEXT_MAX_FS))
          if (Math.abs(targetFS - t.fontSize()) > EPS) t.fontSize(targetFS)
          t.scaleX(1); t.scaleY(1)
        }

        t.getLayer()?.batchDraw()
        trRef.current?.forceUpdate()
        uiLayerRef.current?.batchDraw()
      }

      const onEnd = () => {
        t.scaleX(1); t.scaleY(1)
        textStart.current = null
        t.getLayer()?.batchDraw()
        if (editingRef.current?.nodeId === t.id()) editingRef.current.sync()
      }

      n.on("transformstart.textfix", onStartText)
      n.on("transform.textfix", onTransform)
      n.on("transformend.textfix", onEnd)
      detachTextFix.current = () => { n.off(".textfix") }
    } else {
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
        } else if (n instanceof Konva.Circle || n instanceof Konva.RegularPolygon) {
          const r = (n as any).radius()
          ;(n as any).radius(Math.max(1, r * Math.max(Math.abs(sx), Math.abs(sy))))
        }
        ;(n as any).scaleX(1); (n as any).scaleY(1)
        n.getLayer()?.batchDraw()
      }
      const onEnd = () => onTransform()
      n.on("transform.fix", onTransform)
      n.on("transformend.fix", onEnd)
      detachTextFix.current = () => { n.off(".fix") }
    }
    tr.getLayer()?.batchDraw()
  }
  useEffect(() => { attachTransformer() }, [selectedId, side])
  useEffect(() => { attachTransformer() }, [tool])

  // Во время brush/erase — драг выключаем
  useEffect(() => {
    const enable = tool === "move"
    layers.forEach((l) => {
      if (l.side !== side) return
      if (isStrokeGroup(l.node) || isEraseGroup(l.node)) return
      ;(l.node as any).draggable(enable && !l.meta.locked)
    })
    if (!enable) { trRef.current?.nodes([]); uiLayerRef.current?.batchDraw() }
    if (tool !== "brush") currentStrokeId.current[side] = null
    if (tool !== "erase") currentEraseId.current[side]  = null
  }, [tool, layers, side])

  // Хоткеи
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return
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
      n.getLayer()?.batchDraw()
      if (fx.enabled && fx.live) requestFx()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedId, tool, fx.enabled, fx.live, requestFx])

  /* ===== Кисть / Стирание ===== */
  const nextTopZ = () => (currentArt().children?.length ?? 0)

  const createStrokeGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isStrokes = true
    g.id(uid()); const id = g.id()
    const meta = baseMeta(`strokes ${seqs.strokes}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g, meta, type: "strokes" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, strokes: s.strokes + 1 }))
    currentStrokeId.current[side] = id
    return newLay
  }

  const createEraseGroup = (): AnyLayer => {
    const g = new Konva.Group({ x: 0, y: 0 }); (g as any)._isErase = true
    g.id(uid()); const id = g.id()
    const meta = baseMeta(`erase ${seqs.erase}`)
    currentArt().add(g); g.zIndex(nextTopZ())
    const newLay: AnyLayer = { id, side, node: g as AnyNode, meta, type: "erase" }
    setLayers(p => [...p, newLay])
    setSeqs(s => ({ ...s, erase: s.erase + 1 }))
    currentEraseId.current[side] = id
    return newLay
  }

  const siteFont = () =>
    (typeof window !== "undefined"
      ? window.getComputedStyle(document.body).fontFamily
      : "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif")

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
        kimg.id(uid()); const id = kimg.id()
        const meta = baseMeta(`image ${seqs.image}`)
        currentArt().add(kimg)
        attachCommonHandlers(kimg, id)
        setLayers(p => [...p, { id, side, node: kimg, meta, type: "image" }])
        setSeqs(s => ({ ...s, image: s.image + 1 }))
        select(id)
        artLayerRef.current?.batchDraw()
        set({ tool: "move" })
        if (fx.enabled && fx.live) requestFx()
      }
      img.src = r.result as string
    }
    r.readAsDataURL(file)
  }

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
    t.id(uid()); const id = t.id()
    const meta = baseMeta(`text ${seqs.text}`)
    currentArt().add(t)
    attachCommonHandlers(t, id)
    setLayers(p => [...p, { id, side, node: t, meta, type: "text" }])
    setSeqs(s => ({ ...s, text: s.text + 1 }))
    select(id)
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    if (fx.enabled && fx.live) requestFx()
  }

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
    artLayerRef.current?.batchDraw()
    set({ tool: "move" })
    if (fx.enabled && fx.live) requestFx()
  }

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
      g.add(line); setIsDrawing(true)
    } else if (tool === "erase") {
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
      g.add(line); setIsDrawing(true)
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
      artLayerRef.current?.batchDraw()
    } else if (tool === "erase") {
      const gid = currentEraseId.current[side]
      const g = gid ? (find(gid)?.node as Konva.Group) : null
      const last = g?.getChildren().at(-1) as Konva.Line | undefined
      if (!(last instanceof Konva.Line)) return
      last.points(last.points().concat([x, y]))
      artLayerRef.current?.batchDraw()
    }
    if (fx.enabled && fx.live) requestFx()
  }
  const finishStroke = () => { setIsDrawing(false); if (fx.enabled && fx.live) requestFx() }

  /* ===== Overlay-редактор текста ===== */
  const editingRef = useRef<{
    ta: HTMLTextAreaElement
    nodeId: string
    prevOpacity: number
    cleanup: (apply?: boolean) => void
    sync: () => void
  } | null>(null)

  const startTextOverlayEdit = (t: Konva.Text) => {
    const stage = stageRef.current!
    const stContainer = stage.container()

    if (editingRef.current) { editingRef.current.cleanup(); editingRef.current = null }

    const prevOpacity = t.opacity()
    t.opacity(0.001)
    t.getLayer()?.batchDraw()

    const ta = document.createElement("textarea")
    ta.value = t.text()
    Object.assign(ta.style, {
      position: "absolute", padding: "0", margin: "0", border: "1px solid #111",
      background: "transparent", color: String(t.fill() || "#000"),
      fontFamily: t.fontFamily(),
      fontWeight: t.fontStyle()?.includes("bold") ? "700" : "400",
      fontStyle: t.fontStyle()?.includes("italic") ? "italic" : "normal",
      fontSize: `${t.fontSize() * scale}px`,
      lineHeight: String(t.lineHeight()),
      letterSpacing: `${(t.letterSpacing?.() ?? 0) * scale}px`,
      whiteSpace: "pre-wrap", overflow: "hidden",
      outline: "none", resize: "none", transformOrigin: "left top",
      zIndex: "9999", userSelect: "text", caretColor: String(t.fill() || "#000"),
      textAlign: (t.align?.() as any) || "left",
    } as CSSStyleDeclaration)

    const sync = () => {
      const b = stContainer.getBoundingClientRect()
      const r = (t as any).getClientRect({ relativeTo: stage, skipStroke: true })
      ta.style.left   = `${b.left + r.x * scale}px`
      ta.style.top    = `${b.top  + r.y * scale}px`
      ta.style.width  = `${Math.max(2, r.width  * scale)}px`
      ta.style.height = `${Math.max(2, r.height * scale)}px`
      trRef.current?.forceUpdate()
      uiLayerRef.current?.batchDraw()
    }

    document.body.appendChild(ta)
    sync()
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)

    const onInput = () => {
      t.text(ta.value)
      t.getLayer()?.batchDraw()
      trRef.current?.forceUpdate()
      uiLayerRef.current?.batchDraw()
      requestAnimationFrame(sync)
      if (fx.enabled && fx.live) requestFx()
    }

    const cleanup = (apply = true) => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
      t.off(".edit")
      ta.removeEventListener("input", onInput)
      ta.removeEventListener("keydown", onKey)
      if (apply) t.text(ta.value)
      ta.remove()
      t.opacity(prevOpacity)
      t.getLayer()?.batchDraw()
      select(find(selectedId)?.id ?? (t.id() as string))
      requestAnimationFrame(() => {
        attachTransformer()
        uiLayerRef.current?.batchDraw()
        if (fx.enabled && fx.live) requestFx()
      })
    }

    const onKey = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); cleanup(true) }
      if (ev.key === "Escape") { ev.preventDefault(); cleanup(false) }
    }
    const onResize = () => sync()
    const onScroll = () => sync()

    ta.addEventListener("input", onInput)
    ta.addEventListener("keydown", onKey as any)
    window.addEventListener("resize", onResize)
    window.addEventListener("scroll", onScroll, true)
    t.on("dragmove.edit transform.edit transformend.edit", () => requestAnimationFrame(sync))

    editingRef.current = { ta, nodeId: t.id(), prevOpacity, cleanup, sync }
  }

  /* ===== Жесты ===== */
  const isTransformerChild = (t: Konva.Node | null) => {
    let p: Konva.Node | null | undefined = t
    const tr = trRef.current as unknown as Konva.Node | null
    while (p) { if (tr && p === tr) return true; p = p.getParent?.() }
    return false
  }
  const getStagePointer = () => stageRef.current?.getPointerPosition() || { x: 0, y: 0 }
  const toCanvas = (p: {x:number,y:number}) => ({ x: p.x/scale, y: p.y/scale })

  const onDown = (e: any) => {
    e.evt?.preventDefault?.()
    if (isTransformerChild(e.target)) return
    if (tool === "brush" || tool === "erase") {
      const sp = getStagePointer(); const p = toCanvas(sp)
      startStroke(p.x, p.y); return
    }
    const st = stageRef.current!
    const tgt = e.target as Konva.Node
    if (tgt === st || tgt === frontBgRef.current || tgt === backBgRef.current) {
      select(null); trRef.current?.nodes([]); uiLayerRef.current?.batchDraw(); return
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

  /* ===== Панель слоёв / мета ===== */
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
    if (editingRef.current?.nodeId === id) { editingRef.current.cleanup(false); editingRef.current = null }
    setLayers(p => {
      const l = p.find(x => x.id===id)
      l?.node.destroy()
      return p.filter(x => x.id!==id)
    })
    if (selectedId === id) select(null)
    artLayerRef.current?.batchDraw()
    if (fx.enabled && fx.live) requestFx()
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
    artLayerRef.current?.batchDraw()
    if (fx.enabled && fx.live) requestFx()
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
      artLayerRef.current?.batchDraw()
      const sortedCurrent = [...bottomToTop]
      return [...others, ...sortedCurrent]
    })
    select(srcId)
    requestAnimationFrame(attachTransformer)
    if (fx.enabled && fx.live) requestFx()
  }

  const updateMeta = (id: string, patch: Partial<BaseMeta>) => {
    setLayers(p => p.map(l => {
      if (l.id !== id) return l
      const meta = { ...l.meta, ...patch }
      applyMeta(l.node, meta)
      if (patch.visible !== undefined) l.node.visible(meta.visible && l.side === side)
      return { ...l, meta }
    }))
    artLayerRef.current?.batchDraw()
    if (fx.enabled && fx.live) requestFx()
  }

  const onLayerSelect = (id: string) => {
    select(id)
    if (tool !== "move") set({ tool: "move" })
  }

  /* ===== Snapshot выбранного узла ===== */
  const sel = find(selectedId)
  const selectedKind: LayerType | null = sel?.type ?? null
  const selectedProps =
    sel && isTextNode(sel.node) ? {
      text: sel.node.text(),
      fontSize: sel.node.fontSize(),
      fontFamily: sel.node.fontFamily(),
      fill: sel.node.fill() as string,
    } :
    sel && (sel.node as any).fill ? {
      fill: (sel.node as any).fill() ?? "#000000",
      stroke: (sel.node as any).stroke?.() ?? "#000000",
      strokeWidth: (sel.node as any).strokeWidth?.() ?? 0,
    } : {}

  const setSelectedFill       = (hex:string) => { const n = sel?.node as any; if (!n?.fill) return; n.fill(hex); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }
  const setSelectedStroke     = (hex:string) => { const n = sel?.node as any; if (typeof n?.stroke !== "function") return; n.stroke(hex); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }
  const setSelectedStrokeW    = (w:number)    => { const n = sel?.node as any; if (typeof n?.strokeWidth !== "function") return; n.strokeWidth(w); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }
  const setSelectedText       = (tstr:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.text(tstr); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }
  const setSelectedFontSize   = (nsize:number)=> { const n = sel?.node as Konva.Text; if (!n) return; n.fontSize(nsize); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }
  const setSelectedFontFamily = (name:string) => { const n = sel?.node as Konva.Text; if (!n) return; n.fontFamily(name); artLayerRef.current?.batchDraw(); if (fx.enabled && fx.live) requestFx() }

  const setSelectedColor = (hex:string)  => {
    if (!sel) return
    const n = sel.node as any
    if (sel.type === "text") (n as Konva.Text).fill(hex)
    else if (sel.type === "shape") {
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
      } else if (n instanceof Konva.Line) n.stroke(hex)
      else if (typeof n.fill === "function") n.fill(hex)
    }
    artLayerRef.current?.batchDraw()
    if (fx.enabled && fx.live) requestFx()
  }

  const clearArt = () => {
    if (editingRef.current) { editingRef.current.cleanup(false); editingRef.current = null }
    const g = currentArt(); if (!g) return
    g.removeChildren()
    setLayers(prev => prev.filter(l => l.side !== side))
    currentStrokeId.current[side] = null
    currentEraseId.current[side]  = null
    select(null)
    artLayerRef.current?.batchDraw()
    if (fx.enabled && fx.live) requestFx()
  }

  const downloadBoth = async (s: Side) => {
    const st = stageRef.current; if (!st) return
    const pr = Math.max(2, Math.round(1/scale))

    // UI hide
    uiLayerRef.current?.visible(false)

    const showFront = s === "front"
    frontBgRef.current?.visible(showFront)
    backBgRef.current?.visible(!showFront ? true : false)
    frontArtRef.current?.visible(showFront)
    backArtRef.current?.visible(!showFront)

    // На экспорт: временно показываем арт (он сейчас скрыт opacity=0 при FX)
    const prevOpacity = artLayerRef.current?.opacity() ?? 1
    artLayerRef.current?.opacity(1)
    st.draw()

    const withMock = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(false); st.draw()
    const artOnly = st.toDataURL({ pixelRatio: pr, mimeType: "image/png" })
    bgLayerRef.current?.visible(true)

    // Вернуть состояния
    frontBgRef.current?.visible(side === "front")
    backBgRef.current?.visible(side === "back")
    frontArtRef.current?.visible(side === "front")
    backArtRef.current?.visible(side === "back")
    uiLayerRef.current?.visible(true)
    artLayerRef.current?.opacity(prevOpacity)
    st.draw()

    const a1 = document.createElement("a"); a1.href = withMock; a1.download = `darkroom-${s}_mockup.png`; a1.click()
    await new Promise(r => setTimeout(r, 200))
    const a2 = document.createElement("a"); a2.href = artOnly; a2.download = `darkroom-${s}_art.png`; a2.click()
  }

  // FX lifecycle: делаем арт прозрачным, FX рисуем поверх
  useEffect(() => {
    if (!fxCanvasRef.current) return
    if (fx.enabled) {
      if (!ensureGL()) return
      artLayerRef.current?.opacity(0) // арт интерактивен, но не виден — виден FX
      requestFx()
    } else {
      artLayerRef.current?.opacity(1)
      const gl = glRef.current
      if (gl) { gl.clear(gl.COLOR_BUFFER_BIT) }
    }
    uiLayerRef.current?.batchDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx.enabled])

  useEffect(() => { if (fx.enabled && fx.live) requestFx() },
    [fx.cell, fx.levels, fx.angle, fx.dot, fx.palette, fx.live]) // eslint-disable-line

  /* ================= Render ================= */
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
      {/* Панель слоёв — как было */}
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

      {/* Сцена + FX overlay */}
      <div className="w-full h-full flex items-start justify-center">
        <div style={{ position: "relative", touchAction: "none", width: viewW, height: viewH }}>
          <Stage
            width={viewW} height={viewH} scale={{ x: scale, y: scale }}
            ref={stageRef}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          >
            {/* 1. Мокап */}
            <Layer ref={bgLayerRef} listening={true}>
              {frontMock && (
                <KImage ref={frontBgRef} image={frontMock} visible={side==="front"} width={BASE_W} height={BASE_H} listening={true} />
              )}
              {backMock && (
                <KImage ref={backBgRef} image={backMock} visible={side==="back"} width={BASE_W} height={BASE_H} listening={true} />
              )}
            </Layer>

            {/* 2. Арт */}
            <Layer ref={artLayerRef} listening={true}>
              <KGroup ref={frontArtRef} visible={side==="front"} />
              <KGroup ref={backArtRef}  visible={side==="back"}  />
            </Layer>

            {/* 3. UI */}
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

          {/* FX overlay canvas */}
          <canvas
            ref={fxCanvasRef}
            style={{
              position: "absolute", inset: 0,
              width: `${viewW}px`, height: `${viewH}px`,
              pointerEvents: "none",
              opacity: fx.enabled ? 1 : 0,
              transition: "opacity 120ms ease"
            }}
          />
        </div>
      </div>

      {/* Toolbar (как было) */}
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
        mobileTopOffset={padTop}
        mobileLayers={{
          items: layerItems,
          selectedId: selectedId ?? undefined,
          onSelect: onLayerSelect,
          onToggleVisible: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { visible: !l.meta.visible }) },
          onToggleLock: (id)=>{ const l=layers.find(x=>x.id===id)!; updateMeta(id, { locked: !l.meta.locked }) },
          onDelete: deleteLayer,
          onDuplicate: duplicateLayer,
          onChangeBlend: (id, b)=>{},
          onChangeOpacity: (id, o)=>{},
          onMoveUp: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>0) reorder(id, order[i-1], "before") },
          onMoveDown: (id)=>{ const order = layerItems.map(x=>x.id); const i = order.indexOf(id); if (i>-1 && i<order.length-1) reorder(id, order[i+1], "after") },
        }}
      />

      {/* ===== EFFECTS PANEL — квадратная, перетаскиваемая, как Tools ===== */}
      <EffectsPanel
        fx={fx}
        setFx={setFx}
        onToggle={(v)=>setFx(p=>({...p, enabled: v }))}
        onLive={(v)=>setFx(p=>({...p, live: v }))}
        onUpdate={()=>{
          if (!fx.enabled) return
          ensureGL()
          renderFx()
        }}
        onReset={()=>setFx(DEFAULT_FX)}
        onChange={(patch)=>setFx(p=>({...p, ...patch}))}
        top={fx.y + padTop - 64 /* визуально под Tools */}
        left={fx.x}
      />
    </div>
  )
}

/* =========================
   Мини-UI: панель и слайдеры
========================= */
function EffectsPanel({
  fx, setFx, onToggle, onLive, onUpdate, onReset, onChange, top, left,
}: {
  fx: FxParams
  setFx: (u: FxParams) => void
  onToggle: (v: boolean)=>void
  onLive: (v: boolean)=>void
  onUpdate: ()=>void
  onReset: ()=>void
  onChange: (patch: Partial<FxParams>)=>void
  top: number
  left: number
}) {
  const wrapRef = useRef<HTMLDivElement|null>(null)
  const drag = useRef<{dx:number,dy:number,dragging:boolean}>({dx:0,dy:0,dragging:false})

  // перетаскивание
  const onDown = (e: React.MouseEvent) => {
    const el = wrapRef.current!
    const rect = el.getBoundingClientRect()
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, dragging: true }
    (document.body.style as any).cursor = "grabbing"
  }
  const onMove = (e: MouseEvent) => {
    if (!drag.current.dragging) return
    const x = Math.max(8, e.clientX - drag.current.dx)
    const y = Math.max(8, e.clientY - drag.current.dy)
    setFx({ ...fx, x, y })
  }
  const onUp = () => {
    drag.current.dragging = false
    ;(document.body.style as any).cursor = ""
  }
  useEffect(() => {
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  })

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        left, top,
        width: 220,
        background: "#fff",
        border: "1px solid #111",
        borderRadius: 0,
        boxShadow: "none",
        zIndex: 14,
        userSelect: "none",
      }}
    >
      {/* Заголовок — ручка для дропа */}
      <div
        onMouseDown={onDown}
        style={{
          height: 28, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 8px", borderBottom: "1px solid #111", cursor: "grab", background: "#fff"
        }}
      >
        <span style={{fontSize: 12, fontWeight: 700, letterSpacing: .3}}>EFFECTS</span>
        <div style={{display:"flex", gap:8, alignItems:"center"}}>
          <SquareCheck checked={fx.enabled} onChange={onToggle} title="On/off" />
          <button onClick={()=>onChange({ collapsed: !fx.collapsed })}
                  style={{width:18,height:18,border:"1px solid #111",background:"#fff"}}>
            {fx.collapsed ? "▢" : "—"}
          </button>
        </div>
      </div>

      {!fx.collapsed && (
        <div style={{padding: 8}}>
          <KV label="Mode" value="ScreenPrint+" />

          <LineSlider label="Cell"   min={4}  max={64}  step={1}  value={fx.cell}   onChange={(v)=>onChange({cell:v})} />
          <LineSlider label="Levels" min={2}  max={6}   step={1}  value={fx.levels} onChange={(v)=>onChange({levels:v})} />
          <LineSlider label="Angle"  min={0}  max={90}  step={1}  value={fx.angle}  onChange={(v)=>onChange({angle:v})} suffix="°" />
          <LineSlider label="Dot"    min={0}  max={100} step={1}  value={Math.round(fx.dot*100)} onChange={(v)=>onChange({dot: v/100})} suffix="%" />

          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop: 6}}>
            <div style={{fontSize:12,opacity:.7}}>Palette</div>
            <div style={{display:"flex", gap:6}}>
              {fx.palette.map((c,i)=>(
                <button key={i}
                  onClick={()=>{
                    const v = prompt("HEX color", c) || c
                    const pal = [...fx.palette]; pal[i]=v
                    onChange({ palette: pal })
                  }}
                  title={c}
                  style={{width:16,height:16, border:"1px solid #111", background:c}}
                />
              ))}
            </div>
          </div>

          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:8}}>
            <label style={{display:"flex", alignItems:"center", gap:6}}>
              <SquareCheck checked={fx.live} onChange={onLive} />
              <span style={{fontSize:12}}>Live</span>
            </label>
            <div style={{display:"flex", gap:6}}>
              <Btn onClick={onUpdate}>Update</Btn>
              <Btn ghost onClick={onReset}>Reset</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KV({label, value}:{label:string; value:string|number}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", height:24}}>
      <span style={{fontSize:12, opacity:.7}}>{label}</span>
      <span style={{fontSize:12}}>{value}</span>
    </div>
  )
}

function Btn({children, onClick, ghost}:{children:React.ReactNode; onClick:()=>void; ghost?:boolean}) {
  return (
    <button
      onClick={onClick}
      style={{
        height:24, padding:"0 10px", fontSize:12,
        background: ghost ? "#fff" : "#111",
        color: ghost ? "#111" : "#fff",
        border: "1px solid #111",
        borderRadius: 0,
      }}
    >{children}</button>
  )
}

function SquareCheck({checked, onChange, title}:{checked:boolean; onChange:(v:boolean)=>void; title?:string}) {
  return (
    <button
      title={title}
      onClick={()=>onChange(!checked)}
      style={{
        width:16, height:16,
        border:"1px solid #111",
        background: checked ? "#111" : "#fff",
        color:"#fff", fontSize:12, lineHeight:"14px",
        textAlign:"center"
      }}
    >
      {checked ? "✓" : ""}
    </button>
  )
}

// Кастомный линейный «фейдер» — без системной синевы
function LineSlider({
  label, min, max, step, value, onChange, suffix
}: {
  label:string; min:number; max:number; step:number; value:number;
  onChange:(v:number)=>void; suffix?:string
}) {
  const trackRef = useRef<HTMLDivElement|null>(null)

  const posFromValue = (v:number) => ( (v - min) / (max - min) )
  const valueFromClientX = (x:number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (x - rect.left) / rect.width))
    const raw = min + t * (max - min)
    const snapped = Math.round(raw / step) * step
    return Math.min(max, Math.max(min, snapped))
  }

  const onDragStart = (e: React.MouseEvent) => {
    const move = (ev: MouseEvent) => { onChange( valueFromClientX(ev.clientX) ) }
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up) }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    onChange( valueFromClientX(e.clientX) )
  }

  const t = posFromValue(value)

  return (
    <div style={{margin: "6px 0"}}>
      <div style={{display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4}}>
        <span style={{opacity:.7}}>{label}</span>
        <span>{value}{suffix||""}</span>
      </div>
      <div
        ref={trackRef}
        onMouseDown={onDragStart}
        style={{
          position:"relative", height:16,
          cursor:"ew-resize"
        }}
      >
        {/* линия */}
        <div style={{position:"absolute", top:7, left:0, right:0, height:2, background:"#111"}} />
        {/* ползунок */}
        <div style={{
          position:"absolute", top:3, left:`calc(${(t*100).toFixed(2)}% - 6px)`,
          width:12, height:12, border:"1px solid #111", background:"#fff"
        }} />
      </div>
    </div>
  )
}
