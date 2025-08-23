// components/PhysicsBar.tsx
"use client"
import React from "react"
import { clx } from "@medusajs/ui"

type Props = {
  playing: boolean
  angle: number
  magnitude: number
  onAngle: (deg: number) => void
  onMagnitude: (k: number) => void
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onBake: () => void
}

export default function PhysicsBar(p: Props) {
  return (
    <div className={clx(
      "fixed left-6 bottom-6 z-40",
      "backdrop-blur bg-white/90 border border-black/10 shadow-xl px-3 py-2"
    )} style={{ width: 320 }}>
      <div className="text-[10px] uppercase tracking-widest mb-2">Physics</div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] w-16">Angle</div>
        <input type="range" min={-180} max={180} step={1} value={p.angle}
          onChange={(e)=>p.onAngle(parseInt(e.target.value,10))}
          className="w-full"
        />
        <div className="w-10 text-[10px] text-right">{p.angle}&deg;</div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] w-16">Gravity</div>
        <input type="range" min={0} max={100} step={1} value={Math.round(p.magnitude*100)}
          onChange={(e)=>p.onMagnitude(parseInt(e.target.value,10)/100)}
          className="w-full"
        />
        <div className="w-10 text-[10px] text-right">{Math.round(p.magnitude*100)}%</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {!p.playing
          ? <button className="h-9 border border-black bg-white" onClick={p.onPlay}>Play</button>
          : <button className="h-9 border border-black bg-white" onClick={p.onPause}>Pause</button>
        }
        <button className="h-9 border border-black bg-white" onClick={p.onReset}>Reset</button>
        <button className="h-9 border border-black bg-black text-white" onClick={p.onBake}>Bake</button>
        <div />
      </div>
    </div>
  )
}
