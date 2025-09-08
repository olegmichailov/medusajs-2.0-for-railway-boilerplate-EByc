// storefront/src/modules/darkroom/fx/FxPad.tsx
"use client"
import React from "react"
import type { FxParams, FxMethod, FxShape } from "./FxEngine"

const Label = ({children}:{children:React.ReactNode}) => (
  <div className="text-[10px] uppercase tracking-widest">{children}</div>
)

const row = "flex items-center gap-2"
const selectCls = "w-full border border-black p-1 bg-white text-sm"
const slider = "w-full appearance-none h-[2px] bg-black outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:cursor-pointer"

export type PadProps = {
  params: FxParams
  onChange: (p: FxParams) => void
  onApply: () => void
  onReset: () => void
  targetLabel: string
}

export default function FxPad({ params, onChange, onApply, onReset, targetLabel }: PadProps) {
  const P = (patch: Partial<FxParams>) => onChange({ ...params, ...patch })
  const isHalftone = ["halftone-mono","halftone-duo","halftone-cmyk"].includes(params.method)
  const isDither   = ["dither-ordered","dither-error"].includes(params.method)

  return (
    <div className="p-2 border border-black/10 space-y-2">
      <div className="text-[10px] tracking-widest">Raster / Effects</div>
      <div className="text-[11px] opacity-60">{targetLabel}</div>

      <div className="space-y-1">
        <Label>Метод</Label>
        <select className={selectCls} value={params.method} onChange={(e)=>P({ method: e.target.value as FxMethod })}>
          <option value="halftone-mono">Halftone — Mono</option>
          <option value="halftone-duo">Halftone — Duotone</option>
          <option value="halftone-cmyk">Halftone — CMYK</option>
          <option value="dither-ordered">Dither — Ordered</option>
          <option value="dither-error">Dither — Error Diffusion</option>
          <option value="threshold">Threshold</option>
          <option value="posterize">Posterize</option>
          <option value="pixelate">Pixelate</option>
        </select>
      </div>

      {isHalftone && (
        <>
          <div className="space-y-1">
            <Label>Форма точки</Label>
            <select className={selectCls} value={params.shape ?? "dot"} onChange={(e)=>P({ shape: e.target.value as FxShape })}>
              <option value="dot">Dot</option><option value="square">Square</option>
              <option value="line">Line</option><option value="diamond">Diamond</option><option value="hex">Hex</option>
            </select>
          </div>
          <div className={row}><div className="text-xs w-20">Cell</div><input className={slider} type="range" min={3} max={40} step={1} value={params.cell ?? 8} onChange={(e)=>P({ cell: parseInt(e.target.value) })}/></div>
          <div className={row}><div className="text-xs w-20">Gamma</div><input className={slider} type="range" min={0.3} max={2.2} step={0.05} value={params.gamma ?? 1} onChange={(e)=>P({ gamma: parseFloat(e.target.value) })}/></div>
          <div className={row}><div className="text-xs w-20">Min dot</div><input className={slider} type="range" min={0} max={0.5} step={0.01} value={params.minDot ?? 0.06} onChange={(e)=>P({ minDot: parseFloat(e.target.value) })}/></div>
          <div className={row}><div className="text-xs w-20">Max dot</div><input className={slider} type="range" min={0.5} max={1} step={0.01} value={params.maxDot ?? 0.95} onChange={(e)=>P({ maxDot: parseFloat(e.target.value) })}/></div>
          <div className={row}><div className="text-xs w-20">Angle</div><input className={slider} type="range" min={-90} max={90} step={1} value={params.angle ?? 45} onChange={(e)=>P({ angle: parseInt(e.target.value) })}/></div>

          {params.method === "halftone-duo" && (
            <>
              <div className={row}><div className="text-xs w-20">Angle B</div><input className={slider} type="range" min={-90} max={90} step={1} value={params.duoAngleB ?? 30} onChange={(e)=>P({ duoAngleB: parseInt(e.target.value) })}/></div>
              <div className="flex items-center gap-2">
                <input type="color" value={params.duoA ?? "#111111"} onChange={(e)=>P({ duoA: e.target.value })} className="w-8 h-8 border border-black"/>
                <input type="color" value={params.duoB ?? "#FF2A6D"} onChange={(e)=>P({ duoB: e.target.value })} className="w-8 h-8 border border-black"/>
              </div>
            </>
          )}

          {params.method === "halftone-cmyk" && (
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              {(["C","M","Y","K"] as const).map(k=>(
                <label key={k} className="flex flex-col gap-1"><span>{k}</span>
                  <input type="number" className="border border-black p-1"
                    value={(params.cmykAngles ?? {C:15,M:75,Y:0,K:45})[k]}
                    onChange={(e)=>P({ cmykAngles: { ...(params.cmykAngles ?? {C:15,M:75,Y:0,K:45}), [k]: parseFloat(e.target.value||"0") } as any })}/>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {isDither && (
        <>
          {params.method === "dither-ordered" && (
            <div className="space-y-1">
              <Label>Матрица</Label>
              <select className={selectCls} value={String(params.bayerSize ?? 8)} onChange={(e)=>P({ bayerSize: parseInt(e.target.value) as 4|8 })}>
                <option value="4">4×4 Bayer</option><option value="8">8×8 Bayer</option>
              </select>
            </div>
          )}
          {params.method === "dither-error" && (
            <div className="space-y-1">
              <Label>Диффузия</Label>
              <select className={selectCls} value={params.diffusion ?? "floyd"} onChange={(e)=>P({ diffusion: e.target.value as any })}>
                <option value="floyd">Floyd–Steinberg</option><option value="atkinson">Atkinson</option>
              </select>
            </div>
          )}
        </>
      )}

      {params.method === "threshold" && (
        <div className={row}><div className="text-xs w-20">Threshold</div><input className={slider} type="range" min={0} max={1} step={0.01} value={params.threshold ?? 0.5} onChange={(e)=>P({ threshold: parseFloat(e.target.value) })}/></div>
      )}

      {params.method === "posterize" && (
        <div className={row}><div className="text-xs w-20">Levels</div><input className={slider} type="range" min={2} max={16} step={1} value={params.posterizeLevels ?? 6} onChange={(e)=>P({ posterizeLevels: parseInt(e.target.value) })}/></div>
      )}

      {params.method === "pixelate" && (
        <div className={row}><div className="text-xs w-20">Pixel</div><input className={slider} type="range" min={2} max={80} step={1} value={params.pixelSize ?? 8} onChange={(e)=>P({ pixelSize: parseInt(e.target.value) })}/></div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button className="h-10 border border-black bg-white text-sm" onClick={onReset}>Reset</button>
        <button className="h-10 border border-black bg-black text-white text-sm" onClick={onApply}>Apply</button>
      </div>
    </div>
  )
}
