// storefront/src/modules/darkroom/Toolbar.tsx
"use client"

import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { clx } from "@medusajs/ui"
import {
  Move,
  Brush,
  Eraser,
  Type as TypeIcon,
  Image as ImageIcon,
  Shapes as ShapesIcon,
  Download,
  Layers,
  Circle,
  Square,
  Triangle,
  Plus,
  Slash,
  RotateCw,
  RotateCcw,
  Trash2,
} from "lucide-react"
import type { ShapeKind, Side, Tool } from "./store"
import { isMobile } from "react-device-detect"

type ToolbarProps = {
  // глобал
  side: Side
  setSide: (s: Side) => void
  tool: Tool
  setTool: (t: Tool) => void
  brushColor: string
  setBrushColor: (hex: string) => void
  brushSize: number
  setBrushSize: (n: number) => void
  shapeKind: ShapeKind
  setShapeKind: (k: ShapeKind) => void
  onUploadImage: (file: File) => void
  onAddText: () => void
  onAddShape: (k: ShapeKind) => void
  onDownloadFront: () => void
  onDownloadBack: () => void
  toggleLayers: () => void
  layersOpen: boolean

  // selection-aware
  selectedKind: "image" | "shape" | "text" | "strokes" | null
  selectedProps: {
    text?: string
    fontSize?: number
    fontFamily?: string
    fill?: string
    stroke?: string
    strokeWidth?: number
  }
  setSelectedFill: (hex: string) => void
  setSelectedStroke: (hex: string) => void
  setSelectedStrokeW: (n: number) => void
  setSelectedText: (t: string) => void
  setSelectedFontSize: (n: number) => void
  setSelectedFontFamily: (f: string) => void
  setSelectedColor: (hex: string) => void

  // доп
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onHeightChange?: (h: number) => void
}

const ico = "w-4 h-4"
const btn =
  "h-12 w-12 grid place-items-center border border-black text-[11px] rounded-none bg-white select-none"
const btnActive = "bg-black text-white"
const row = "flex items-center gap-2"

export default function Toolbar(props: ToolbarProps) {
  const {
    side,
    setSide,
    tool,
    setTool,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    onUploadImage,
    onAddText,
    onAddShape,
    onDownloadFront,
    onDownloadBack,
    toggleLayers,
    layersOpen,
    selectedKind,
    selectedProps,
    setSelectedText,
    setSelectedFontSize,
    setSelectedColor,
    onUndo,
    onRedo,
    onClear,
    onHeightChange,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const report = () => onHeightChange?.(rootRef.current?.offsetHeight || 0)
    report()
    const obs = new ResizeObserver(report)
    if (rootRef.current) obs.observe(rootRef.current)
    return () => obs.disconnect()
  }, [onHeightChange])

  // file
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const f = e.target.files?.[0]
    if (f) onUploadImage(f)
    e.currentTarget.value = ""
  }

  // локальный state для textarea (чтобы курсор не прыгал)
  const [textValue, setTextValue] = useState<string>(selectedProps?.text ?? "")
  useEffect(() => setTextValue(selectedProps?.text ?? ""), [selectedProps?.text, selectedKind])

  // ——— MOBILE
  if (isMobile) {
    const ToolBtn = ({
      label,
      active,
      onClick,
      children,
    }: {
      label: string
      active?: boolean
      onClick: () => void
      children: React.ReactNode
    }) => (
      <button
        aria-label={label}
        title={label}
        className={clx(btn, active && btnActive)}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        {children}
      </button>
    )

    const Swatch = () => (
      <label className="inline-flex items-center gap-2">
        <span className="text-[10px]">Color</span>
        <input
          type="color"
          value={brushColor}
          onInput={(e) => setBrushColor((e.target as HTMLInputElement).value)}
          className="h-7 w-10 border border-black"
          onClick={(e) => e.stopPropagation()}
        />
      </label>
    )

    return (
      <div
        ref={rootRef}
        className="fixed inset-x-0 bottom-0 z-40 bg-white/95 border-t border-black/10"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Инструменты — одна ровная строка квадратов */}
        <div className="px-2 py-2 flex items-center gap-2 overflow-x-auto">
          <ToolBtn label="Move" active={tool === "move"} onClick={() => setTool("move")}>
            <Move className={ico} />
          </ToolBtn>
          <ToolBtn label="Brush" active={tool === "brush"} onClick={() => setTool("brush")}>
            <Brush className={ico} />
          </ToolBtn>
          <ToolBtn label="Erase" active={tool === "erase"} onClick={() => setTool("erase")}>
            <Eraser className={ico} />
          </ToolBtn>
          <ToolBtn label="Text" onClick={onAddText}>
            <TypeIcon className={ico} />
          </ToolBtn>
          <ToolBtn label="Image" onClick={() => fileRef.current?.click()}>
            <ImageIcon className={ico} />
          </ToolBtn>
          <ToolBtn label="Shapes" active={tool === "shape"} onClick={() => setTool("shape" as Tool)}>
            <ShapesIcon className={ico} />
          </ToolBtn>
          <ToolBtn label="Undo" onClick={onUndo}>
            <RotateCcw className={ico} />
          </ToolBtn>
          <ToolBtn label="Redo" onClick={onRedo}>
            <RotateCw className={ico} />
          </ToolBtn>
          <ToolBtn label="Clear" onClick={onClear}>
            <Trash2 className={ico} />
          </ToolBtn>
          <ToolBtn label="Layers" active={layersOpen} onClick={toggleLayers}>
            <Layers className={ico} />
          </ToolBtn>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
        </div>

        {/* Контекстные сеттинги — только под ряд инструментов */}
        <div className="px-3 pb-2">
          {/* Brush / Erase: size + color */}
          {(tool === "brush" || tool === "erase") && (
            <div className={row}>
              <span className="text-[10px] w-12">Size</span>
              <input
                type="range"
                min={1}
                max={200}
                step={1}
                value={brushSize}
                onInput={(e) => setBrushSize(parseInt((e.target as HTMLInputElement).value))}
                className="flex-1"
                style={{ accentColor: "#000", touchAction: "pan-y" }}
              />
              <span className="text-[10px] tabular-nums w-8 text-right">{brushSize}</span>
              <div className="ml-3">
                <Swatch />
              </div>
            </div>
          )}

          {/* Text: textarea + font size + color */}
          {tool === "move" && selectedKind === "text" && (
            <div className="space-y-2">
              <div>
                <div className="text-[10px] mb-1">Text</div>
                <textarea
                  value={textValue}
                  onInput={(e) => {
                    const v = (e.target as HTMLTextAreaElement).value
                    setTextValue(v)
                    setSelectedText(v)
                  }}
                  className="w-full h-16 border border-black p-1 text-sm"
                  placeholder="Enter text"
                />
              </div>
              <div className={row}>
                <span className="text-[10px] w-12">Font</span>
                <input
                  type="range"
                  min={8}
                  max={800}
                  step={1}
                  value={selectedProps.fontSize ?? 96}
                  onInput={(e) =>
                    setSelectedFontSize(parseInt((e.target as HTMLInputElement).value))
                  }
                  className="flex-1"
                  style={{ accentColor: "#000", touchAction: "pan-y" }}
                />
                <span className="text-[10px] tabular-nums w-10 text-right">
                  {selectedProps.fontSize ?? 96}
                </span>
                <div className="ml-3">
                  <Swatch />
                </div>
              </div>
            </div>
          )}

          {/* Shapes: набор форм */}
          {tool === "shape" && (
            <div className="flex items-center gap-2">
              <button className={btn} onClick={() => onAddShape("square")}>
                <Square className={ico} />
              </button>
              <button className={btn} onClick={() => onAddShape("circle")}>
                <Circle className={ico} />
              </button>
              <button className={btn} onClick={() => onAddShape("triangle")}>
                <Triangle className={ico} />
              </button>
              <button className={btn} onClick={() => onAddShape("cross")}>
                <Plus className={ico} />
              </button>
              <button className={btn} onClick={() => onAddShape("line")}>
                <Slash className={ico} />
              </button>
            </div>
          )}
        </div>

        {/* Низ — компактно: [FRONT ⬇] [BACK ⬇] */}
        <div className="px-2 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              className={clx(
                "h-12 border border-black flex items-center justify-center gap-2",
                side === "front" ? "bg-black text-white" : "bg-white"
              )}
              onClick={() => setSide("front")}
            >
              FRONT <Download className={ico} onClick={(e) => { e.stopPropagation(); onDownloadFront() }} />
            </button>
            <button
              className={clx(
                "h-12 border border-black flex items-center justify-center gap-2",
                side === "back" ? "bg-black text-white" : "bg-white"
              )}
              onClick={() => setSide("back")}
            >
              BACK <Download className={ico} onClick={(e) => { e.stopPropagation(); onDownloadBack() }} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ——— DESKTOP (минимальные отличия; внешний вид такой же строгий)
  const ToolBtn = ({
    label,
    active,
    onClick,
    children,
  }: {
    label: string
    active?: boolean
    onClick: () => void
    children: React.ReactNode
  }) => (
    <button
      aria-label={label}
      title={label}
      className={clx(btn, active && btnActive)}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className="fixed left-5 top-24 z-40 bg-white border border-black/10 shadow-sm select-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* инструменты */}
      <div className="p-2 flex items-center gap-2">
        <ToolBtn label="Move" active={tool === "move"} onClick={() => setTool("move")}>
          <Move className={ico} />
        </ToolBtn>
        <ToolBtn label="Brush" active={tool === "brush"} onClick={() => setTool("brush")}>
          <Brush className={ico} />
        </ToolBtn>
        <ToolBtn label="Erase" active={tool === "erase"} onClick={() => setTool("erase")}>
          <Eraser className={ico} />
        </ToolBtn>
        <ToolBtn label="Text" onClick={onAddText}>
          <TypeIcon className={ico} />
        </ToolBtn>
        <ToolBtn label="Image" onClick={() => fileRef.current?.click()}>
          <ImageIcon className={ico} />
        </ToolBtn>
        <ToolBtn label="Shapes" active={tool === "shape"} onClick={() => setTool("shape" as Tool)}>
          <ShapesIcon className={ico} />
        </ToolBtn>
        <ToolBtn label="Undo" onClick={onUndo}>
          <RotateCcw className={ico} />
        </ToolBtn>
        <ToolBtn label="Redo" onClick={onRedo}>
          <RotateCw className={ico} />
        </ToolBtn>
        <ToolBtn label="Clear" onClick={onClear}>
          <Trash2 className={ico} />
        </ToolBtn>
        <ToolBtn label="Layers" active={layersOpen} onClick={toggleLayers}>
          <Layers className={ico} />
        </ToolBtn>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>

      {/* контекстные сеттинги */}
      <div className="p-2 space-y-2">
        {(tool === "brush" || tool === "erase") && (
          <div className={row}>
            <span className="text-[10px] w-12">Size</span>
            <input
              type="range"
              min={1}
              max={200}
              step={1}
              value={brushSize}
              onInput={(e) => setBrushSize(parseInt((e.target as HTMLInputElement).value))}
              className="w-56"
              style={{ accentColor: "#000" }}
            />
            <span className="text-[10px] tabular-nums w-8 text-right">{brushSize}</span>
            <label className="ml-3 inline-flex items-center gap-2">
              <span className="text-[10px]">Color</span>
              <input
                type="color"
                value={brushColor}
                onInput={(e) => setBrushColor((e.target as HTMLInputElement).value)}
                className="h-6 w-9 border border-black"
              />
            </label>
          </div>
        )}

        {tool === "move" && selectedKind === "text" && (
          <div className="space-y-2">
            <div>
              <div className="text-[10px] mb-1">Text</div>
              <textarea
                value={textValue}
                onInput={(e) => {
                  const v = (e.target as HTMLTextAreaElement).value
                  setTextValue(v)
                  setSelectedText(v)
                }}
                className="w-72 h-16 border border-black p-1 text-sm"
                placeholder="Enter text"
              />
            </div>
            <div className={row}>
              <span className="text-[10px] w-12">Font</span>
              <input
                type="range"
                min={8}
                max={800}
                step={1}
                value={selectedProps.fontSize ?? 96}
                onInput={(e) =>
                  setSelectedFontSize(parseInt((e.target as HTMLInputElement).value))
                }
                className="w-56"
                style={{ accentColor: "#000" }}
              />
              <span className="text-[10px] tabular-nums w-10 text-right">
                {selectedProps.fontSize ?? 96}
              </span>
              <label className="ml-3 inline-flex items-center gap-2">
                <span className="text-[10px]">Color</span>
                <input
                  type="color"
                  value={brushColor}
                  onInput={(e) => setSelectedColor((e.target as HTMLInputElement).value)}
                  className="h-6 w-9 border border-black"
                />
              </label>
            </div>
          </div>
        )}

        {tool === "shape" && (
          <div className="flex items-center gap-2">
            <button className={btn} onClick={() => onAddShape("square")}>
              <Square className={ico} />
            </button>
            <button className={btn} onClick={() => onAddShape("circle")}>
              <Circle className={ico} />
            </button>
            <button className={btn} onClick={() => onAddShape("triangle")}>
              <Triangle className={ico} />
            </button>
            <button className={btn} onClick={() => onAddShape("cross")}>
              <Plus className={ico} />
            </button>
            <button className={btn} onClick={() => onAddShape("line")}>
              <Slash className={ico} />
            </button>
          </div>
        )}

        {/* низ — FRONT ⬇ | BACK ⬇ */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            className={clx(
              "h-10 border border-black flex items-center justify-center gap-2",
              side === "front" ? "bg-black text-white" : "bg-white"
            )}
            onClick={() => setSide("front")}
          >
            FRONT{" "}
            <Download
              className={ico}
              onClick={(e) => {
                e.stopPropagation()
                onDownloadFront()
              }}
            />
          </button>
          <button
            className={clx(
              "h-10 border border-black flex items-center justify-center gap-2",
              side === "back" ? "bg-black text-white" : "bg-white"
            )}
            onClick={() => setSide("back")}
          >
            BACK{" "}
            <Download
              className={ico}
              onClick={(e) => {
                e.stopPropagation()
                onDownloadBack()
              }}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
