"use client"

import React, { useEffect, useRef, useState } from "react"
import JSZip from "jszip"

/**
 * RasterLabPanel — Master Raster & Vector Processor (no external UI deps)
 *
 * Самодостаточный компонент. Никаких shadcn/ui — только Tailwind + нативные inputs.
 * Имеет пропсы для интеграции с редактором (Konva):
 *  - externalImage?: HTMLImageElement | HTMLCanvasElement | null — внешний источник изображения
 *  - onBakeBlob?: (blob: Blob) => void — вернуть результат наружу (например, в выбранный слой)
 *
 * Внутри — быстрые превью на 2D canvas + экспорт PNG/SVG/ZIP.
 */

type Method =
  | "mono-halftone"
  | "cmyk-halftone"
  | "ordered-dither"
  | "error-diffusion"
  | "particle-scatter"
  | "duotone-halftone"

type Shape = "dot" | "square" | "line" | "diamond" | "hex"

type HalftoneCommon = {
  cell: number
  gamma: number
  minDot: number
  maxDot: number
  angle: number
  invert: boolean
}

type Props = {
  externalImage?: HTMLImageElement | HTMLCanvasElement | null
  onBakeBlob?: (blob: Blob) => void
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const luminance = (r: number, g: number, b: number) => clamp01(0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255))
function seededRandom(seed: number) { let x = seed >>> 0 || 123456789; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296); }; }
const createCanvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c }

function getImageDataFromImage(img: HTMLImageElement, scale = 1) {
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = createCanvas(w, h)
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas: c, ctx, imageData: ctx.getImageData(0, 0, w, h) }
}

function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function downloadText(text: string, filename: string, mime = "image/svg+xml") { const blob = new Blob([text], { type: mime }); downloadBlob(blob, filename); }

// --- Bayer ---
const BAYER_4 = [ [0,8,2,10], [12,4,14,6], [3,11,1,9], [15,7,13,5] ]
const BAYER_8 = [
  [0,32,8,40,2,34,10,42], [48,16,56,24,50,18,58,26], [12,44,4,36,14,46,6,38], [60,28,52,20,62,30,54,22],
  [3,35,11,43,1,33,9,41], [51,19,59,27,49,17,57,25], [15,47,7,39,13,45,5,37], [63,31,55,23,61,29,53,21]
]

function mapTone(t: number, gamma: number, invert: boolean) { let d = 1 - t; d = Math.pow(d, gamma); if (invert) d = 1 - d; return clamp01(d) }

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  cx: number,
  cy: number,
  cell: number,
  frac: number,
  angleRad: number,
  minDot: number,
  maxDot: number
) {
  const minA = Math.max(0, minDot)
  const maxA = clamp01(Math.max(minA, maxDot))
  const a = minA + (maxA - minA) * frac
  ctx.beginPath()
  if (shape === "dot") {
    const r = 0.5 * cell * Math.sqrt(a)
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
  } else if (shape === "square") {
    const s = cell * Math.sqrt(a)
    ctx.rect(cx - s / 2, cy - s / 2, s, s)
  } else if (shape === "line") {
    const thickness = Math.max(1, cell * a * 0.8)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angleRad)
    ctx.rect(-cell / 2, -thickness / 2, cell, thickness)
    ctx.restore()
  } else if (shape === "diamond") {
    const s = cell * Math.sqrt(a)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4)
    ctx.rect(-s / 2, -s / 2, s, s)
    ctx.restore()
  } else if (shape === "hex") {
    const r = 0.5 * cell * Math.sqrt(a) * 1.15
    ctx.save(); ctx.translate(cx, cy)
    ctx.moveTo(r, 0)
    for (let i = 1; i < 6; i++) { const th = (i * Math.PI) / 3; ctx.lineTo(r * Math.cos(th), r * Math.sin(th)) }
    ctx.closePath(); ctx.restore()
  }
  ctx.fill()
}

function halftoneMono(dest: CanvasRenderingContext2D, srcData: ImageData, options: HalftoneCommon & { shape: Shape; inkColor?: string }) {
  const { cell, gamma, minDot, maxDot, angle, invert, shape, inkColor } = options
  const { width, height, data } = srcData
  const angleRad = (angle * Math.PI) / 180
  dest.clearRect(0, 0, width, height)
  dest.fillStyle = inkColor || "black"

  const lum = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) lum[p] = luminance(data[i], data[i + 1], data[i + 2])
  const cx = width / 2, cy = height / 2
  dest.save(); dest.translate(cx, cy); dest.rotate(angleRad); dest.translate(-cx, -cy)
  const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad)

  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const rx = x + cell * 0.5, ry = y + cell * 0.5
      const dx = rx - cx, dy = ry - cy
      const sx = cx + dx * cosA - dy * sinA; const sy = cy + dx * sinA + dy * cosA
      const ix = Math.max(0, Math.min(width - 1, sx | 0)); const iy = Math.max(0, Math.min(height - 1, sy | 0))
      const t = lum[iy * width + ix]; const frac = mapTone(t, gamma, invert)
      drawShape(dest, shape, rx, ry, cell, frac, angleRad, minDot, maxDot)
    }
  }
  dest.restore()
}

function rgbToCmyk(r: number, g: number, b: number) {
  const R = r / 255, G = g / 255, B = b / 255
  const K = 1 - Math.max(R, G, B)
  if (K >= 0.999) return { c: 0, m: 0, y: 0, k: 1 }
  const C = (1 - R - K) / (1 - K)
  const M = (1 - G - K) / (1 - K)
  const Y = (1 - B - K) / (1 - K)
  return { c: clamp01(C), m: clamp01(M), y: clamp01(Y), k: clamp01(K) }
}

function halftoneCMYK(previewCtx: CanvasRenderingContext2D, srcData: ImageData, params: HalftoneCommon & { shape: Shape; angles: { C: number; M: number; Y: number; K: number }; previewTint: boolean }) {
  const { shape, cell, gamma, minDot, maxDot, angles, previewTint } = params
  const { width, height, data } = srcData
  const plates: { key: keyof typeof angles; angle: number; color: string; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [
    { key: "C", angle: angles.C, color: previewTint ? "#00A0E0" : "black", canvas: createCanvas(width, height), ctx: createCanvas(width, height).getContext("2d", { willReadFrequently: true })! },
    { key: "M", angle: angles.M, color: previewTint ? "#FF40A0" : "black", canvas: createCanvas(width, height), ctx: createCanvas(width, height).getContext("2d", { willReadFrequently: true })! },
    { key: "Y", angle: angles.Y, color: previewTint ? "#FFC000" : "black", canvas: createCanvas(width, height), ctx: createCanvas(width, height).getContext("2d", { willReadFrequently: true })! },
    { key: "K", angle: angles.K, color: previewTint ? "#000000" : "black", canvas: createCanvas(width, height), ctx: createCanvas(width, height).getContext("2d", { willReadFrequently: true })! },
  ]

  const cx = width / 2, cy = height / 2
  const CMYKc = new Float32Array(width * height), CMYKm = new Float32Array(width * height), CMYKy = new Float32Array(width * height), CMYKk = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { const r = data[i], g = data[i + 1], b = data[i + 2]; const { c, m, y, k } = rgbToCmyk(r, g, b); CMYKc[p] = c; CMYKm[p] = m; CMYKy[p] = y; CMYKk[p] = k }

  function platePass(ctx: CanvasRenderingContext2D, channel: Float32Array, angleDeg: number, color: string) {
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = color; const angleRad = (angleDeg * Math.PI) / 180; ctx.save()
    ctx.translate(cx, cy); ctx.rotate(angleRad); ctx.translate(-cx, -cy)
    const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad)
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const rx = x + cell * 0.5, ry = y + cell * 0.5; const dx = rx - cx, dy = ry - cy
        const sx = cx + dx * cosA - dy * sinA, sy = cy + dx * sinA + dy * cosA
        const ix = Math.max(0, Math.min(width - 1, sx | 0)), iy = Math.max(0, Math.min(height - 1, sy | 0))
        const v = channel[iy * width + ix]; const frac = Math.pow(v, gamma)
        drawShape(ctx, shape, rx, ry, cell, frac, angleRad, minDot, maxDot)
      }
    }
    ctx.restore()
  }

  platePass(plates[0].ctx, CMYKc, params.angles.C, plates[0].color)
  platePass(plates[1].ctx, CMYKm, params.angles.M, plates[1].color)
  platePass(plates[2].ctx, CMYKy, params.angles.Y, plates[2].color)
  platePass(plates[3].ctx, CMYKk, params.angles.K, plates[3].color)

  previewCtx.clearRect(0, 0, width, height)
  for (const p of plates) previewCtx.drawImage(p.ctx.canvas, 0, 0)
  return plates
}

function orderedDither(dest: CanvasRenderingContext2D, src: ImageData, size: 4 | 8) {
  const { width, height, data } = src; const out = dest.getImageData(0, 0, width, height); const odata = out.data; const M = size === 4 ? BAYER_4 : BAYER_8; const N = size; const N2 = N * N
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; const L = luminance(data[i], data[i + 1], data[i + 2]); const threshold = (M[y % N][x % N] + 0.5) / N2; const v = L < threshold ? 0 : 255; odata[i] = odata[i + 1] = odata[i + 2] = v; odata[i + 3] = 255 }
  dest.putImageData(out, 0, 0)
}

function errorDiffusion(dest: CanvasRenderingContext2D, src: ImageData, method: "floyd" | "atkinson") {
  const { width, height, data } = src; const out = dest.getImageData(0, 0, width, height); const buf = new Float32Array(width * height)
  for (let p = 0, i = 0; p < buf.length; p++, i += 4) buf[p] = luminance(data[i], data[i + 1], data[i + 2]) * 255
  const get = (x: number, y: number) => buf[y * width + x]; const set = (x: number, y: number, v: number) => { buf[y * width + x] = v }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = get(x, y), newv = old < 128 ? 0 : 255, err = old - newv; set(x, y, newv)
      if (method === "floyd") {
        if (x + 1 < width) set(x + 1, y, get(x + 1, y) + err * (7 / 16))
        if (x - 1 >= 0 && y + 1 < height) set(x - 1, y + 1, get(x - 1, y + 1) + err * (3 / 16))
        if (y + 1 < height) set(x, y + 1, get(x, y + 1) + err * (5 / 16))
        if (x + 1 < width && y + 1 < height) set(x + 1, y + 1, get(x + 1, y + 1) + err * (1 / 16))
      } else {
        const w = [ [1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8] ] as const
        for (const [dx, dy, k] of w) { const nx = x + dx, ny = y + dy; if (nx>=0&&nx<width&&ny>=0&&ny<height) set(nx, ny, get(nx, ny) + err * k) }
      }
    }
  }
  const odata = out.data; for (let p = 0, i = 0; p < buf.length; p++, i += 4) { const v = buf[p] <= 0 ? 0 : buf[p] >= 255 ? 255 : buf[p]; odata[i] = odata[i + 1] = odata[i + 2] = v; odata[i + 3] = 255 }
  dest.putImageData(out, 0, 0)
}

function duotoneHalftone(preview: CanvasRenderingContext2D, src: ImageData, params: HalftoneCommon & { shape: Shape; colorA: string; colorB: string; angleB: number }) {
  const { width, height, data } = src; const A = createCanvas(width, height), ctxA = A.getContext("2d", { willReadFrequently: true })!; const B = createCanvas(width, height), ctxB = B.getContext("2d", { willReadFrequently: true })!
  const mono = new ImageData(new Uint8ClampedArray(data), width, height)
  halftoneMono(ctxA, mono, { cell: params.cell, gamma: params.gamma, minDot: params.minDot, maxDot: params.maxDot, angle: params.angle, invert: false, shape: params.shape, inkColor: params.colorA })
  halftoneMono(ctxB, mono, { cell: params.cell, gamma: params.gamma, minDot: 0, maxDot: params.maxDot * 0.8, angle: params.angle + params.angleB, invert: true, shape: params.shape, inkColor: params.colorB })
  preview.clearRect(0, 0, width, height); preview.drawImage(ctxA.canvas, 0, 0); preview.drawImage(ctxB.canvas, 0, 0)
  return { plateA: ctxA.canvas, plateB: ctxB.canvas }
}

function svgHeader(w: number, h: number) { return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` }
const svgFooter = `</svg>`

function svgShape(shape: Shape, cx: number, cy: number, cell: number, frac: number, angleRad: number, minDot: number, maxDot: number, fill: string) {
  const minA = Math.max(0, minDot), maxA = clamp01(Math.max(minA, maxDot)); const a = minA + (maxA - minA) * frac
  if (a <= 0) return ""
  if (shape === "dot") {
    const r = 0.5 * cell * Math.sqrt(a); return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`
  } else if (shape === "square") {
    const s = cell * Math.sqrt(a); return `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" fill="${fill}"/>`
  } else if (shape === "line") {
    const thickness = Math.max(1, cell * a * 0.8); const x = cx - cell / 2, y = cy - thickness / 2; const ang = (angleRad * 180) / Math.PI
    return `<rect x="${x}" y="${y}" width="${cell}" height="${thickness}" fill="${fill}" transform="rotate(${ang} ${cx} ${cy})"/>`
  } else if (shape === "diamond") {
    const s = cell * Math.sqrt(a); return `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" fill="${fill}" transform="rotate(45 ${cx} ${cy})"/>`
  } else if (shape === "hex") {
    const r = 0.5 * cell * Math.sqrt(a) * 1.15; let d = ``; for (let i = 0; i < 6; i++) { const th = (i * Math.PI) / 3; const px = cx + r * Math.cos(th), py = cy + r * Math.sin(th); d += `${i===0?"M":"L"}${px},${py} ` } d += "Z"; return `<path d="${d}" fill="${fill}"/>`
  }
  return ""
}

function exportSVGMono(src: ImageData, params: HalftoneCommon & { shape: Shape; fill: string }) {
  const { width, height, data } = src; const { shape, cell, gamma, minDot, maxDot, angle, invert, fill } = params; const angleRad = (angle * Math.PI) / 180; const cx = width / 2, cy = height / 2; const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad)
  const lum = new Float32Array(width * height); for (let i = 0, p = 0; i < data.length; i += 4, p++) lum[p] = luminance(data[i], data[i + 1], data[i + 2])
  let svg = svgHeader(width, height) + `<g transform="rotate(${angle} ${cx} ${cy})" fill="${fill}">`
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) {
    const rx = x + cell * 0.5, ry = y + cell * 0.5; const dx = rx - cx, dy = ry - cy; const sx = cx + dx * cosA - dy * sinA, sy = cy + dx * sinA + dy * cosA; const ix = Math.max(0, Math.min(width - 1, sx | 0)), iy = Math.max(0, Math.min(height - 1, sy | 0)); const t = lum[iy * width + ix]; const frac = mapTone(t, gamma, invert); svg += svgShape(shape, rx, ry, cell, frac, angleRad, minDot, maxDot, fill)
  }
  svg += "</g>" + svgFooter; return svg
}

function exportSVGDuotone(src: ImageData, params: HalftoneCommon & { shape: Shape; colorA: string; colorB: string; angleB: number }) {
  const { width, height, data } = src; const mono = new ImageData(new Uint8ClampedArray(data), width, height)
  const A = exportSVGMono(mono, { ...params, fill: params.colorA, invert: false })
  const B = exportSVGMono(mono, { ...params, angle: params.angle + params.angleB, fill: params.colorB, invert: true, minDot: 0, maxDot: params.maxDot * 0.8 })
  return { svgA: A, svgB: B }
}

function exportSVGCmyk(src: ImageData, params: HalftoneCommon & { shape: Shape; angles: { C: number; M: number; Y: number; K: number } }) {
  const { width, height, data } = src; const cx = width / 2, cy = height / 2; const CMYKc = new Float32Array(width * height), CMYKm = new Float32Array(width * height), CMYKy = new Float32Array(width * height), CMYKk = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) { const r = data[i], g = data[i + 1], b = data[i + 2]; const { c, m, y, k } = rgbToCmyk(r, g, b); CMYKc[p] = c; CMYKm[p] = m; CMYKy[p] = y; CMYKk[p] = k }
  function plateSVG(channel: Float32Array, angle: number) {
    const angleRad = (angle * Math.PI) / 180; const cosA = Math.cos(-angleRad), sinA = Math.sin(-angleRad)
    let svg = svgHeader(width, height) + `<g transform="rotate(${angle} ${cx} ${cy})" fill="#000">`
    for (let y = 0; y < height; y += params.cell) for (let x = 0; x < width; x += params.cell) {
      const rx = x + params.cell * 0.5, ry = y + params.cell * 0.5; const dx = rx - cx, dy = ry - cy; const sx = cx + dx * cosA - dy * sinA, sy = cy + dx * sinA + dy * cosA; const ix = Math.max(0, Math.min(width - 1, sx | 0)), iy = Math.max(0, Math.min(height - 1, sy | 0)); const v = channel[iy * width + ix]; const frac = Math.pow(v, params.gamma); svg += svgShape(params.shape, rx, ry, params.cell, frac, angleRad, params.minDot, params.maxDot, "#000") }
    svg += "</g>" + svgFooter; return svg
  }
  return {
    C: plateSVG(CMYKc, params.angles.C),
    M: plateSVG(CMYKm, params.angles.M),
    Y: plateSVG(CMYKy, params.angles.Y),
    K: plateSVG(CMYKk, params.angles.K),
  }
}

// ---- State ----

type HalftoneState = {
  method: Method
  shape: Shape
  cell: number
  gamma: number
  minDot: number
  maxDot: number
  angle: number
  cmykAngles: { C: number; M: number; Y: number; K: number }
  previewTint: boolean
  ditherSize: 4 | 8
  diffusionMethod: "floyd" | "atkinson"
  particleDensity: number
  particleMinR: number
  particleMaxR: number
  particleSeed: number
  duotoneA: string
  duotoneB: string
  duotoneAngleB: number
  previewScale: number
  vectorExportType: "svg-current" | "svg-cmyk-zip" | "svg-duo-zip" | "png" | "png-cmyk-zip" | "png-duo-zip"
  vectorMaxShapes: number
}

const DEFAULTS: HalftoneState = {
  method: "cmyk-halftone",
  shape: "dot",
  cell: 8,
  gamma: 1.0,
  minDot: 0.05,
  maxDot: 0.95,
  angle: 45,
  cmykAngles: { C: 15, M: 75, Y: 0, K: 45 },
  previewTint: true,
  ditherSize: 8,
  diffusionMethod: "floyd",
  particleDensity: 0.8,
  particleMinR: 0.4,
  particleMaxR: 1.6,
  particleSeed: 12345,
  duotoneA: "#111111",
  duotoneB: "#FF2A6D",
  duotoneAngleB: 30,
  previewScale: 1,
  vectorExportType: "svg-current",
  vectorMaxShapes: 120000,
}

export default function RasterLabPanel({ externalImage, onBakeBlob }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [state, setState] = useState<HalftoneState>(DEFAULTS)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [processing, setProcessing] = useState(false)

  // Local upload
  useEffect(() => {
    if (!imgUrl) return
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => setImage(img)
    img.src = imgUrl
  }, [imgUrl])

  // External image from Konva
  useEffect(() => {
    if (!externalImage) return
    if (externalImage instanceof HTMLCanvasElement) {
      externalImage.toBlob((b) => {
        if (!b) return
        const url = URL.createObjectURL(b)
        const i = new Image()
        i.onload = () => { setImage(i); URL.revokeObjectURL(url) }
        i.src = url
      }, "image/png")
    } else {
      setImage(externalImage)
    }
  }, [externalImage])

  // Render
  useEffect(() => {
    if (!image || !canvasRef.current) return
    const { canvas, imageData } = getImageDataFromImage(image, state.previewScale)
    const out = canvasRef.current
    out.width = canvas.width; out.height = canvas.height
    const dest = out.getContext("2d", { willReadFrequently: true })!
    setProcessing(true)
    requestAnimationFrame(() => {
      if (state.method === "mono-halftone") {
        halftoneMono(dest, imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape })
      } else if (state.method === "cmyk-halftone") {
        halftoneCMYK(dest, imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, invert: false, shape: state.shape, angles: state.cmykAngles, previewTint: state.previewTint })
      } else if (state.method === "ordered-dither") {
        dest.drawImage(canvas, 0, 0); orderedDither(dest, imageData, state.ditherSize)
      } else if (state.method === "error-diffusion") {
        dest.drawImage(canvas, 0, 0); errorDiffusion(dest, imageData, state.diffusionMethod)
      } else if (state.method === "particle-scatter") {
        dest.clearRect(0, 0, canvas.width, canvas.height); particleScatter(dest, imageData, { density: state.particleDensity, minR: state.particleMinR, maxR: state.particleMaxR, seed: state.particleSeed })
      } else if (state.method === "duotone-halftone") {
        duotoneHalftone(dest, imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape, colorA: state.duotoneA, colorB: state.duotoneB, angleB: state.duotoneAngleB })
      }
      setProcessing(false)
    })
  }, [image, state])

  // ---- Export
  const canExport = (type: HalftoneState["vectorExportType"]) => {
    if (!image) return false
    if (type.includes("cmyk") && state.method !== "cmyk-halftone") return false
    if (type.includes("duo") && state.method !== "duotone-halftone") return false
    return true
  }

  async function exportPNG() { if (!canvasRef.current) return; canvasRef.current.toBlob((blob) => { if (blob) downloadBlob(blob, `rasterlab_${state.method}.png`) }, "image/png") }

  async function exportPNGCMYK() {
    if (!image || !canvasRef.current) return
    const { imageData } = getImageDataFromImage(image, 1)
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true })!
    const plates = halftoneCMYK(ctx, imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, invert: false, shape: state.shape, angles: state.cmykAngles, previewTint: false })
    const zip = new JSZip()
    for (const p of plates) { const blob: Blob = await new Promise((res) => p.ctx.canvas.toBlob((b) => res(b!), "image/png")); zip.file(`plate_${p.key}.png`, blob) }
    const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_CMYK_plates_png.zip")
  }

  async function exportPNGDuotone() {
    if (!image || !canvasRef.current) return
    const { imageData } = getImageDataFromImage(image, 1)
    const ctx = canvasRef.current.getContext("2d", { willReadFrequently: true })!
    const { plateA, plateB } = duotoneHalftone(ctx, imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape, colorA: state.duotoneA, colorB: state.duotoneB, angleB: state.duotoneAngleB })
    const zip = new JSZip(); const blobA: Blob = await new Promise((res) => plateA.toBlob((b) => res(b!), "image/png")); const blobB: Blob = await new Promise((res) => plateB.toBlob((b) => res(b!), "image/png"))
    zip.file("duotone_A.png", blobA); zip.file("duotone_B.png", blobB)
    const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_duotone_plates_png.zip")
  }

  async function exportSVGCurrent() {
    if (!image) return
    const { imageData } = getImageDataFromImage(image, 1)
    if (state.method === "mono-halftone") {
      const svg = exportSVGMono(imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape, fill: "#000" }); downloadText(svg, "RasterLab_mono.svg")
    } else if (state.method === "cmyk-halftone") {
      const svgs = exportSVGCmyk(imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: 0, invert: false, shape: state.shape, angles: state.cmykAngles })
      const zip = new JSZip(); zip.file("plate_C.svg", svgs.C); zip.file("plate_M.svg", svgs.M); zip.file("plate_Y.svg", svgs.Y); zip.file("plate_K.svg", svgs.K); const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_CMYK_plates_svg.zip")
    } else if (state.method === "duotone-halftone") {
      const { svgA, svgB } = exportSVGDuotone(imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape, colorA: state.duotoneA, colorB: state.duotoneB, angleB: state.duotoneAngleB })
      const zip = new JSZip(); zip.file("duotone_A.svg", svgA); zip.file("duotone_B.svg", svgB); const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_duotone_svg.zip")
    } else if (state.method === "particle-scatter") {
      const { width, height, data } = imageData; let svg = svgHeader(width, height) + `<g fill="#000">`
      const rand = seededRandom(state.particleSeed); const step = Math.max(1, Math.floor(2 * state.particleMinR))
      let count = 0
      for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) { const i = (y * width + x) * 4; const L = luminance(data[i], data[i + 1], data[i + 2]); const darkness = 1 - L; const p = clamp01(darkness * state.particleDensity); if (rand() < p) { const r = state.particleMinR + (state.particleMaxR - state.particleMinR) * rand(); svg += `<circle cx="${x}" cy="${y}" r="${r}"/>`; if (++count > state.vectorMaxShapes) break } }
      svg += "</g>" + svgFooter; downloadText(svg, "RasterLab_particles.svg")
    } else {
      alert("Vector export для dithering может быть слишком тяжёлым. Используй PNG экспорт.")
    }
  }

  async function handleExport(type: HalftoneState["vectorExportType"]) {
    if (type === "png") return exportPNG()
    if (type === "png-cmyk-zip") return exportPNGCMYK()
    if (type === "png-duo-zip") return exportPNGDuotone()
    if (type === "svg-current") return exportSVGCurrent()
    if (type === "svg-cmyk-zip") { const { imageData } = getImageDataFromImage(image!, 1); const svgs = exportSVGCmyk(imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: 0, invert: false, shape: state.shape, angles: state.cmykAngles }); const zip = new JSZip(); zip.file("plate_C.svg", svgs.C); zip.file("plate_M.svg", svgs.M); zip.file("plate_Y.svg", svgs.Y); zip.file("plate_K.svg", svgs.K); const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_CMYK_plates_svg.zip") }
    if (type === "svg-duo-zip")  { const { imageData } = getImageDataFromImage(image!, 1); const { svgA, svgB } = exportSVGDuotone(imageData, { cell: state.cell, gamma: state.gamma, minDot: state.minDot, maxDot: state.maxDot, angle: state.angle, invert: false, shape: state.shape, colorA: state.duotoneA, colorB: state.duotoneB, angleB: state.duotoneAngleB }); const zip = new JSZip(); zip.file("duotone_A.svg", svgA); zip.file("duotone_B.svg", svgB); const out = await zip.generateAsync({ type: "blob" }); downloadBlob(out, "RasterLab_duotone_svg.zip") }
  }

  async function bakeCurrent() {
    if (!canvasRef.current) return
    const blob: Blob | null = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b), "image/png"))
    if (!blob) return
    if (onBakeBlob) return onBakeBlob(blob)
    // локальный bake внутрь панели
    const url = URL.createObjectURL(blob)
    const img = new Image(); img.onload = () => { setImage(img); URL.revokeObjectURL(url) }; img.src = url
  }

  // ---- UI ----
  const canExportNow = !!image

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="p-3 border-b border-black/10 space-y-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest">Источник</div>
          <input type="file" accept="image/*" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) setImgUrl(URL.createObjectURL(f)) }} />
        </div>

        <div className="space-y-1">
          <label className="text-xs">Метод</label>
          <select className="w-full border border-black p-1 bg-white text-sm" value={state.method} onChange={(e)=>setState(s=>({ ...s, method: e.target.value as Method }))}>
            <option value="mono-halftone">Mono Halftone</option>
            <option value="cmyk-halftone">CMYK Halftone</option>
            <option value="duotone-halftone">Duotone Halftone</option>
            <option value="ordered-dither">Ordered Dither</option>
            <option value="error-diffusion">Error Diffusion</option>
            <option value="particle-scatter">Particle Scatter</option>
          </select>
        </div>

        {!(state.method === "ordered-dither" || state.method === "error-diffusion") && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs col-span-1">Cell (px)
              <input type="range" min={3} max={40} step={1} value={state.cell} onChange={(e)=>setState(s=>({ ...s, cell: parseInt(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs col-span-1">Gamma
              <input type="range" min={0.3} max={2.2} step={0.05} value={state.gamma} onChange={(e)=>setState(s=>({ ...s, gamma: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs">Min Dot
              <input type="range" min={0} max={0.5} step={0.01} value={state.minDot} onChange={(e)=>setState(s=>({ ...s, minDot: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs">Max Dot
              <input type="range" min={0.5} max={1} step={0.01} value={state.maxDot} onChange={(e)=>setState(s=>({ ...s, maxDot: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
          </div>
        )}

        {(state.method === "mono-halftone" || state.method === "duotone-halftone") && (
          <label className="text-xs block">Angle (°)
            <input type="range" min={-90} max={90} step={1} value={state.angle} onChange={(e)=>setState(s=>({ ...s, angle: parseInt(e.target.value) }))} className="w-full"/>
          </label>
        )}

        {state.method === "cmyk-halftone" && (
          <div className="space-y-2">
            <div className="text-xs">CMYK Angles</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              {(["C","M","Y","K"] as const).map((k) => (
                <label key={k} className="text-[10px] flex flex-col gap-1">{k}
                  <input type="number" className="border border-black p-1" value={(state.cmykAngles as any)[k]} onChange={(e)=>setState(s=>({ ...s, cmykAngles: { ...s.cmykAngles, [k]: parseFloat(e.target.value||"0") } }))}/>
                </label>
              ))}
            </div>
            <label className="text-xs inline-flex items-center gap-2">
              <input type="checkbox" checked={state.previewTint} onChange={(e)=>setState(s=>({ ...s, previewTint: e.target.checked }))}/>
              Цветной превью
            </label>
          </div>
        )}

        {(state.method === "mono-halftone" || state.method === "cmyk-halftone" || state.method === "duotone-halftone") && (
          <label className="text-xs block">Форма точки
            <select className="w-full border border-black p-1 bg-white text-sm" value={state.shape} onChange={(e)=>setState(s=>({ ...s, shape: e.target.value as Shape }))}>
              <option value="dot">Dot</option>
              <option value="square">Square</option>
              <option value="line">Line</option>
              <option value="diamond">Diamond</option>
              <option value="hex">Hex</option>
            </select>
          </label>
        )}

        {state.method === "ordered-dither" && (
          <label className="text-xs block">Матрица
            <select className="w-full border border-black p-1 bg-white text-sm" value={String(state.ditherSize)} onChange={(e)=>setState(s=>({ ...s, ditherSize: parseInt(e.target.value) as 4|8 }))}>
              <option value="4">4×4 Bayer</option>
              <option value="8">8×8 Bayer</option>
            </select>
          </label>
        )}

        {state.method === "error-diffusion" && (
          <label className="text-xs block">Diffusion
            <select className="w-full border border-black p-1 bg-white text-sm" value={state.diffusionMethod} onChange={(e)=>setState(s=>({ ...s, diffusionMethod: e.target.value as any }))}>
              <option value="floyd">Floyd–Steinberg</option>
              <option value="atkinson">Atkinson</option>
            </select>
          </label>
        )}

        {state.method === "particle-scatter" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Density
              <input type="range" min={0.1} max={2} step={0.05} value={state.particleDensity} onChange={(e)=>setState(s=>({ ...s, particleDensity: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs">Min R
              <input type="range" min={0.2} max={3} step={0.1} value={state.particleMinR} onChange={(e)=>setState(s=>({ ...s, particleMinR: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs">Max R
              <input type="range" min={0.3} max={6} step={0.1} value={state.particleMaxR} onChange={(e)=>setState(s=>({ ...s, particleMaxR: parseFloat(e.target.value) }))} className="w-full"/>
            </label>
            <label className="text-xs">Seed
              <input type="number" className="w-full border border-black p-1" value={state.particleSeed} onChange={(e)=>setState(s=>({ ...s, particleSeed: parseInt(e.target.value||"0") }))}/>
            </label>
          </div>
        )}

        <label className="text-xs block">Preview Scale {(state.previewScale*100).toFixed(0)}%
          <input type="range" min={0.25} max={1} step={0.05} value={state.previewScale} onChange={(e)=>setState(s=>({ ...s, previewScale: parseFloat(e.target.value) }))} className="w-full"/>
        </label>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button className="h-10 border border-black bg-white text-sm" disabled={!canExportNow || processing} onClick={()=>handleExport(state.vectorExportType)}>Export</button>
          <button className="h-10 border border-black bg-white text-sm" disabled={!image || processing} onClick={bakeCurrent}>Bake</button>
          <label className="text-xs col-span-2">Тип экспорта
            <select className="w-full border border-black p-1 bg-white text-sm" value={state.vectorExportType} onChange={(e)=>setState(s=>({ ...s, vectorExportType: e.target.value as HalftoneState["vectorExportType"] }))}>
              <option value="png">PNG (preview)</option>
              <option value="png-cmyk-zip">PNG ZIP (CMYK plates)</option>
              <option value="png-duo-zip">PNG ZIP (Duotone plates)</option>
              <option value="svg-current">SVG (current)</option>
              <option value="svg-cmyk-zip">SVG ZIP (CMYK plates)</option>
              <option value="svg-duo-zip">SVG ZIP (Duotone plates)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Preview */}
      <div className="p-2">
        <div className="relative border border-black/10 bg-neutral-50">
          <canvas ref={canvasRef} className="w-full h-auto block"/>
          {!image && (
            <div className="absolute inset-0 grid place-items-center text-xs text-neutral-500">Upload or load from canvas</div>
          )}
          {processing && (
            <div className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded bg-black text-white">Processing…</div>
          )}
        </div>
      </div>
    </div>
  )
}
