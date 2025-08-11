"use client"
import React from "react"
import { useDarkroom, Tool, ShapeKind, Side } from "./store"

export default function Toolbar({
  onUploadImage,
  onAddText,
  onAddShape,
  onDownloadFront,
  onDownloadBack
}:{
  onUploadImage:(f:File)=>void
  onAddText:()=>void
  onAddShape:(k:ShapeKind)=>void
  onDownloadFront:()=>void
  onDownloadBack:()=>void
}) {
  const { side, set, tool, shapeKind, brushColor, brushSize,
          fontFamily, fontSize } = useDarkroom()

  const fileRef = React.useRef<HTMLInputElement>(null)

  const IconBtn = (cur:Tool, label:string, onClick?:()=>void) => (
    <button
      onClick={onClick ?? (()=>set({ tool: cur }))}
      className={`w-9 h-9 border ${tool===cur?"bg-black text-white":"bg-white"}`}
      aria-label={label}
    />
  )

  const ShapeBtn = (k:ShapeKind) => (
    <button onClick={()=>onAddShape(k)} className="w-9 h-9 border bg-white" aria-label={k}/>
  )

  return (
    <div className="fixed left-6 top-40 z-30 w-[280px] bg-white/90 border border-black/10 p-3 shadow-xl">
      <div className="flex justify-between items-center mb-2">
        <div className="text-[11px] uppercase">Tools</div>
      </div>

      <div className="grid grid-cols-8 gap-1 mb-3">
        {IconBtn("move","Move", ()=>set({ tool:"move" }))}
        {IconBtn("brush","Brush", ()=>set({ tool:"brush" }))}
        {IconBtn("erase","Erase", ()=>set({ tool:"erase" }))}
        {IconBtn("text","Text", onAddText)}
        {IconBtn("shape","Shape", ()=>set({ tool:"shape" }))}
        {IconBtn("image","Image", ()=>fileRef.current?.click())}
        {IconBtn("crop","Crop", ()=>set({ tool:"crop" }))}
      </div>

      {/* shapes row */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {["circle","square","triangle","line","cross","star","heart"].map(k=>(
          <button key={k} onClick={()=>onAddShape(k as ShapeKind)}
                  className={`w-9 h-9 border ${shapeKind===k?"bg-black text-white":"bg-white"}`}
                  aria-label={k}/>
        ))}
      </div>

      {/* brush & color */}
      <div className="mb-3">
        <div className="text-[11px] mb-1">Brush size: {brushSize}px</div>
        <input type="range" min={1} max={96} value={brushSize}
               onChange={(e)=>set({ brushSize: parseInt(e.target.value) })}
               className="w-full"/>
        <div className="text-[11px] mt-2 mb-1">Color</div>
        <input type="color" value={brushColor} onChange={(e)=>set({ brushColor: e.target.value })}
               className="w-8 h-8 border"/>
      </div>

      {/* selected text controls (в текущем UI они есть — не меняем вид) */}
      <div className="mb-3">
        <div className="text-[11px] mb-1">Selected: Text</div>
        <input id="darkroom-text-input" className="w-full border px-2 py-1 text-sm" placeholder="Your text"/>
        <div className="flex items-center gap-2 mt-2">
          <div className="text-[11px]">Size</div>
          <input type="range" min={8} max={300} value={fontSize}
                 onChange={(e)=>set({ fontSize: parseInt(e.target.value) })}
                 className="flex-1"/>
        </div>
        <select className="w-full border mt-2 text-sm"
                value={fontFamily}
                onChange={(e)=>set({ fontFamily: e.target.value })}>
          {["Inter","Courier","Georgia","Times New Roman","Arial","Futura","Monaco"].map(f=>
            <option key={f} value={f}>{f}</option>
          )}
        </select>
      </div>

      {/* side + downloads (две кнопки на каждую сторону) */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_36px] gap-2">
          <button className={`border px-3 py-2 text-left ${side==="front"?"bg-black text-white":""}`}
                  onClick={()=>set({ side: "front" as Side })}>Front</button>
          <button className="border" onClick={onDownloadFront}>⬇</button>
        </div>
        <div className="grid grid-cols-[1fr_36px] gap-2">
          <button className={`border px-3 py-2 text-left ${side==="back"?"bg-black text-white":""}`}
                  onClick={()=>set({ side: "back" as Side })}>Back</button>
          <button className="border" onClick={onDownloadBack}>⬇</button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
             onChange={(e)=>{ const f=e.target.files?.[0]; if(f) onUploadImage(f); e.currentTarget.value="" }}/>
    </div>
  )
}
