"use client"

import React, { useState } from "react"
import dynamic from "next/dynamic"
import { Wand2, X } from "lucide-react"

const RasterLabPanel = dynamic(() => import("./RasterLabPanel"), { ssr: false })

type Props = {
  open: boolean
  onClose: () => void
  snapshotSelected: () => Promise<HTMLImageElement | null>
  snapshotCanvas: () => Promise<HTMLImageElement | null>
  bakeToSelected: (blob: Blob) => Promise<void>
  bakeToNewLayer: (blob: Blob) => Promise<void>
}

export default function RasterDock({
  open, onClose, snapshotSelected, snapshotCanvas, bakeToSelected, bakeToNewLayer
}: Props) {
  const [srcImg, setSrcImg] = useState<HTMLImageElement | null>(null)
  const [bakeMode, setBakeMode] = useState<"selected" | "new">("selected")
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const loadFromSelected = async () => { setLoading(true); setSrcImg(await snapshotSelected()); setLoading(false) }
  const loadFromCanvas  = async () => { setLoading(true); setSrcImg(await snapshotCanvas());  setLoading(false) }

  return (
    <div
      className="fixed left-4 top-24 z-50 w-[360px] max-h-[85vh] overflow-auto backdrop-blur bg-white/90 border border-black/10 shadow-xl"
      onMouseDown={(e)=>e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-black/10">
        <div className="px-2 py-1 text-[10px] tracking-widest">RASTER / EFFECTS</div>
        <div className="flex">
          <button
            className="w-10 h-10 grid place-items-center border border-black -ml-[1px] bg-white hover:bg-black hover:text-white"
            onClick={onClose}
            title="Close"
          ><X className="w-4 h-4"/></button>
        </div>
      </div>

      <div className="p-2 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button className="h-10 border border-black bg-white text-xs" onClick={loadFromSelected} disabled={loading}>
            Из выделения
          </button>
          <button className="h-10 border border-black bg-white text-xs" onClick={loadFromCanvas} disabled={loading}>
            Весь канвас
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="opacity-70">Bake:</span>
          <label className="flex items-center gap-1">
            <input type="radio" name="bake" checked={bakeMode==="selected"} onChange={()=>setBakeMode("selected")} />
            <span>в выбранный слой</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="bake" checked={bakeMode==="new"} onChange={()=>setBakeMode("new")} />
            <span>в новый слой</span>
          </label>
        </div>

        <div className="border border-black/10">
          <RasterLabPanel
            externalImage={srcImg ?? undefined}
            onBakeBlob={async (blob: Blob) => {
              if (bakeMode === "selected") await bakeToSelected(blob)
              else await bakeToNewLayer(blob)
            }}
          />
        </div>
      </div>
    </div>
  )
}
